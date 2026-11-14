import type {
  ChampionSummary,
  DetectedRunePage,
  GameModeContext,
  LiveClientAllGameData,
  LocalBridgeStatePayload,
  MatchParticipantSummary,
  MatchRecord,
  PlayerProfileResponse,
  Role,
} from '../engines/types.ts';

// Commande universelle compatible PowerShell 7 (pwsh) ET PowerShell 5.1 (Windows 10/11)
// Utilise curl.exe natif Windows (-sk = silencieux + ignore certificat auto-signé local 127.0.0.1:2999)
export const UNIVERSAL_LIVE_CLIPBOARD_CMD =
  'curl.exe -sk https://127.0.0.1:2999/liveclientdata/allgamedata | Set-Clipboard';

// Commande universelle pour copier l'état complet (Sélection des champions + Bans + Partie en cours) depuis le pont local
export const UNIVERSAL_STATE_CLIPBOARD_CMD =
  'curl.exe -s http://127.0.0.1:38421/state | Set-Clipboard';

// Commande universelle pour copier l'historique local du client LoL (inclut les parties Personnalisées)
export const UNIVERSAL_HISTORY_CLIPBOARD_CMD =
  'curl.exe -s http://127.0.0.1:38421/history | Set-Clipboard';

// Script PowerShell propre (UTF-16LE Base64) pour éviter tout crash d'échappement cmd.exe au lancement du .bat
const PS_BRIDGE_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-LcuCreds {
  try {
    $proc = Get-CimInstance Win32_Process -Filter "Name='LeagueClientUx.exe'" | Select-Object -First 1
    if ($proc -and $proc.CommandLine) {
      $p = [regex]::Match($proc.CommandLine, '--app-port=(\\d+)')
      $t = [regex]::Match($proc.CommandLine, '--remoting-auth-token=([^\\s"]+)')
      if ($p.Success -and $t.Success) {
        return @{ port = $p.Groups[1].Value; token = $t.Groups[1].Value }
      }
    }
  } catch {}

  $drives = @('C:', 'D:', 'E:', 'F:')
  foreach ($d in $drives) {
    foreach ($sub in @('Riot Games\\League of Legends\\lockfile', 'Games\\Riot Games\\League of Legends\\lockfile')) {
      $lockPath = Join-Path $d $sub
      if (Test-Path $lockPath) {
        try {
          $fs = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
          $sr = New-Object System.IO.StreamReader($fs)
          $txt = $sr.ReadToEnd()
          $sr.Close()
          $fs.Close()
          $parts = $txt.Split(':')
          if ($parts.Length -ge 4) {
            return @{ port = $parts[2]; token = $parts[3] }
          }
        } catch {}
      }
    }
  }
  return $null
}

function Write-JsonResponse($res, [int]$statusCode, [string]$jsonText) {
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonText)
    $res.StatusCode = $statusCode
    $res.ContentType = 'application/json; charset=utf-8'
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
  } catch {}
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://127.0.0.1:38421/')
try {
  $listener.Start()
} catch {
  Write-Host "Erreur demarrage port 38421 : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Verifiez qu'une autre fenetre du pont n'est pas deja ouverte." -ForegroundColor Yellow
  exit 1
}

Write-Host "Pont actif sur http://127.0.0.1:38421 (/health, /live, /state)" -ForegroundColor Green
Write-Host "Compatible : Champ Select, ARAM, Classee, Normale, Partie acceleree et Outil d'entrainement." -ForegroundColor Cyan
Write-Host "Laissez cette fenetre ouverte (Ctrl+C pour quitter)."

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.Headers.Add('Access-Control-Allow-Methods', 'GET, OPTIONS')
    $res.Headers.Add('Access-Control-Allow-Headers', '*')
    $res.Headers.Add('Access-Control-Allow-Private-Network', 'true')

    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.OutputStream.Close()
      continue
    }

    $reqPath = $req.Url.AbsolutePath

    if ($reqPath -eq '/health') {
      Write-JsonResponse $res 200 '{"ok":true,"port":38421,"bridge":"lol-ai-coach-v3.1"}'
      continue
    }

    if ($reqPath -eq '/history') {
      $creds = Get-LcuCreds
      if (-not $creds) {
        Write-JsonResponse $res 503 '{"error":"Client League of Legends non detecte"}'
        continue
      }
      $mhRaw = (& curl.exe -sk --max-time 3 -u "riot:$($creds.token)" "https://127.0.0.1:$($creds.port)/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=12") -join ' '
      if ($mhRaw -and $mhRaw.Trim().StartsWith('{') -and $mhRaw -notmatch '"errorCode"') {
        Write-JsonResponse $res 200 $mhRaw
      } else {
        Write-JsonResponse $res 503 '{"error":"Historique local LCU indisponible pour le moment"}'
      }
      continue
    }

    if ($reqPath -eq '/live') {
      $raw = (& curl.exe -sk --max-time 2 https://127.0.0.1:2999/liveclientdata/allgamedata) -join ' '
      if ($raw -and $raw.Trim().StartsWith('{')) {
        Write-JsonResponse $res 200 $raw
      } else {
        Write-JsonResponse $res 503 '{"error":"Aucune partie ou Outil d''entrainement actif sur 127.0.0.1:2999"}'
      }
      continue
    }

    $liveRaw = (& curl.exe -sk --max-time 1 https://127.0.0.1:2999/liveclientdata/allgamedata) -join ' '
    $liveJson = if ($liveRaw -and $liveRaw.Trim().StartsWith('{')) { $liveRaw } else { 'null' }
    $gfJson = 'null'
    $csJson = 'null'
    $rpJson = 'null'
    $phase = if ($liveJson -ne 'null') { 'InProgress' } else { 'None' }

    $creds = Get-LcuCreds
    if ($creds) {
      $gfRaw = (& curl.exe -sk --max-time 1 -u "riot:$($creds.token)" "https://127.0.0.1:$($creds.port)/lol-gameflow/v1/session") -join ' '
      if ($gfRaw -and $gfRaw.Trim().StartsWith('{') -and $gfRaw -notmatch '"errorCode"') {
        $gfJson = $gfRaw
        try {
          $gfObj = $gfRaw | ConvertFrom-Json
          if ($gfObj.phase) { $phase = $gfObj.phase }
        } catch {}
      }

      $csRaw = (& curl.exe -sk --max-time 1 -u "riot:$($creds.token)" "https://127.0.0.1:$($creds.port)/lol-champ-select/v1/session") -join ' '
      if ($csRaw -and $csRaw.Trim().StartsWith('{') -and $csRaw -notmatch '"errorCode"') {
        $csJson = $csRaw
        if ($phase -eq 'None') { $phase = 'ChampSelect' }
      }

      $rpRaw = (& curl.exe -sk --max-time 1 -u "riot:$($creds.token)" "https://127.0.0.1:$($creds.port)/lol-perks/v1/currentpage") -join ' '
      if ($rpRaw -and $rpRaw.Trim().StartsWith('{') -and $rpRaw -notmatch '"errorCode"') {
        $rpJson = $rpRaw
      }
    }

    $out = '{"phase":"' + $phase + '","gameflow":' + $gfJson + ',"champSelect":' + $csJson + ',"currentRunePage":' + $rpJson + ',"liveGame":' + $liveJson + '}'
    Write-JsonResponse $res 200 $out
  } catch {
    try {
      Write-JsonResponse $ctx.Response 500 '{"error":"Erreur interne du pont local"}'
    } catch {}
  }
}
`.trim();

function encodePowerShellUtf16LeBase64(script: string): string {
  const bytes = new Uint8Array(script.length * 2);
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = (code >> 8) & 0xff;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function buildWindowsBridgeBat(): string {
  const encoded = encodePowerShellUtf16LeBase64(PS_BRIDGE_SCRIPT);
  return [
    '@echo off',
    'chcp 65001 >nul',
    'title LoL AI Coach - Pont Temps Reel ^& Champ Select (Port 38421)',
    "echo Demarrage du pont local LoL AI Coach (Champ Select + Partie + Outil d'entrainement)...",
    'echo Gardez cette fenetre ouverte pendant votre session de League of Legends.',
    'echo.',
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
    'echo.',
    "echo Le pont s'est arrete. Appuyez sur une touche pour fermer cette fenetre.",
    'pause',
  ].join('\r\n');
}

export function downloadWindowsBridgeBat() {
  const batContent = buildWindowsBridgeBat();
  const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lol-coach-bridge.bat';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function mapQueueToLabelAndMode(queueId?: number, rawGameMode?: string): {
  modeLabel: string;
  gameMode: GameModeContext;
} {
  if (queueId === 450 || rawGameMode?.toUpperCase() === 'ARAM') {
    return { modeLabel: 'ARAM (Abîme hurlant)', gameMode: 'ARAM' };
  }
  if (queueId === 420) {
    return { modeLabel: 'Classée Solo/Duo', gameMode: 'CLASSIC' };
  }
  if (queueId === 440) {
    return { modeLabel: 'Classée Flex', gameMode: 'CLASSIC' };
  }
  if (queueId === 400) {
    return { modeLabel: 'Normale Draft', gameMode: 'CLASSIC' };
  }
  if (queueId === 480 || queueId === 490) {
    return { modeLabel: 'Partie Accélérée (Swiftplay)', gameMode: 'SWIFTPLAY' };
  }
  if (queueId === 1700) {
    return { modeLabel: 'Arena', gameMode: 'OTHER' };
  }
  if (rawGameMode?.toUpperCase() === 'PRACTICETOOL' || queueId === 0) {
    return { modeLabel: 'Outil d’entraînement (Practice Tool)', gameMode: 'CLASSIC' };
  }
  if (rawGameMode?.toUpperCase() === 'URF' || queueId === 900 || queueId === 1900) {
    return { modeLabel: 'URF / Mode rapide', gameMode: 'OTHER' };
  }
  if (rawGameMode?.toUpperCase() === 'CLASSIC') {
    return { modeLabel: 'Faille de l’invocateur', gameMode: 'CLASSIC' };
  }
  return { modeLabel: rawGameMode || 'Faille de l’invocateur', gameMode: 'CLASSIC' };
}

function normalizeLcuPosition(pos?: string): Role | null {
  const upper = (pos || '').toUpperCase();
  if (upper === 'TOP') return 'TOP';
  if (upper === 'JUNGLE') return 'JUNGLE';
  if (upper === 'MIDDLE' || upper === 'MID') return 'MID';
  if (upper === 'BOTTOM' || upper === 'ADC') return 'ADC';
  if (upper === 'UTILITY' || upper === 'SUPPORT') return 'SUPPORT';
  return null;
}

export interface DetectedMatchComposition {
  sourceLabel: string;
  phaseLabel: string;
  modeLabel: string;
  gameMode: GameModeContext;
  playerChampId: string | null;
  duoPartnerId: string | null;
  role: Role | null;
  allyChampIds: string[];
  enemyChampIds: string[];
  bannedChampIds: string[];
}

function findChampIdByNumeric(champions: ChampionSummary[], championId?: number): string | null {
  if (!championId || championId <= 0) return null;
  return champions.find((c) => Number(c.key) === championId)?.id || null;
}

function findChampIdByName(champions: ChampionSummary[], rawName?: string): string | null {
  if (!rawName) return null;
  const low = rawName.trim().toLowerCase();
  return (
    champions.find((c) => c.id.toLowerCase() === low || c.name.toLowerCase() === low)?.id || null
  );
}

function pickDefaultDuo(
  allyIds: string[],
  playerChampId: string | null,
  role: Role | null,
  champions: ChampionSummary[],
): string | null {
  const others = allyIds.filter((id) => id && id !== playerChampId);
  if (others.length === 0) return null;
  if (role === 'SUPPORT') {
    const marksman = others.find((id) =>
      champions.find((c) => c.id === id)?.tags.includes('Marksman'),
    );
    if (marksman) return marksman;
  }
  if (role === 'ADC') {
    const supp = others.find((id) => {
      const tags = champions.find((c) => c.id === id)?.tags || [];
      return tags.includes('Support') || tags.includes('Tank');
    });
    if (supp) return supp;
  }
  return others[0];
}

export function extractCompositionFromSpectator(
  activeGame: PlayerProfileResponse['activeGame'] | null | undefined,
  champions: ChampionSummary[],
  riotId: string,
): DetectedMatchComposition | null {
  if (!activeGame?.inGame || !activeGame.participants?.length) return null;

  const { modeLabel, gameMode } = mapQueueToLabelAndMode(
    activeGame.gameQueueConfigId,
    activeGame.gameMode,
  );

  const selfPart =
    activeGame.participants.find((p) => p.riotId.toLowerCase() === riotId.toLowerCase()) ||
    activeGame.participants[0];
  const myTeamId = selfPart?.teamId || 100;

  const playerChampId = findChampIdByNumeric(champions, selfPart?.championId);
  const allyChampIds = activeGame.participants
    .filter((p) => p.teamId === myTeamId)
    .map((p) => findChampIdByNumeric(champions, p.championId))
    .filter((id): id is string => Boolean(id));

  const enemyChampIds = activeGame.participants
    .filter((p) => p.teamId !== myTeamId)
    .map((p) => findChampIdByNumeric(champions, p.championId))
    .filter((id): id is string => Boolean(id));

  const bannedChampIds = (activeGame.bannedChampions || [])
    .map((b) => findChampIdByNumeric(champions, b.championId))
    .filter((id): id is string => Boolean(id));

  const duoPartnerId = pickDefaultDuo(allyChampIds, playerChampId, null, champions);

  return {
    sourceLabel: 'Riot Spectator-V5 (Live)',
    phaseLabel: 'Partie lancée en cours',
    modeLabel,
    gameMode,
    playerChampId,
    duoPartnerId,
    role: null,
    allyChampIds,
    enemyChampIds,
    bannedChampIds,
  };
}

export function extractCompositionFromBridgePayload(
  rawInput: LocalBridgeStatePayload | LiveClientAllGameData,
  champions: ChampionSummary[],
): DetectedMatchComposition | null {
  // Cas 1 : JSON brut de Live Client Data (127.0.0.1:2999)
  const asLiveDirect = rawInput as LiveClientAllGameData;
  if (asLiveDirect && (asLiveDirect.allPlayers || asLiveDirect.activePlayer)) {
    const { modeLabel, gameMode } = mapQueueToLabelAndMode(
      undefined,
      asLiveDirect.gameData?.gameMode,
    );
    const allPlayers = asLiveDirect.allPlayers || [];
    const activeName = asLiveDirect.activePlayer?.championName;
    const activeRiotId = asLiveDirect.activePlayer?.riotId;
    const selfPlayer =
      allPlayers.find(
        (p) => (activeRiotId && p.riotId === activeRiotId) || p.championName === activeName,
      ) || allPlayers[0];
    const myTeam = selfPlayer?.team || 'ORDER';
    const role = normalizeLcuPosition(selfPlayer?.position);

    const playerChampId = findChampIdByName(champions, selfPlayer?.championName || activeName);
    const allyChampIds = allPlayers
      .filter((p) => p.team === myTeam)
      .map((p) => findChampIdByName(champions, p.championName))
      .filter((id): id is string => Boolean(id));
    const enemyChampIds = allPlayers
      .filter((p) => p.team !== myTeam)
      .map((p) => findChampIdByName(champions, p.championName))
      .filter((id): id is string => Boolean(id));

    const isPractice =
      asLiveDirect.gameData?.gameMode?.toUpperCase() === 'PRACTICETOOL' ||
      allPlayers.length <= 2;

    return {
      sourceLabel: 'Client LoL Local (127.0.0.1:2999)',
      phaseLabel: isPractice ? 'Outil d’entraînement actif' : 'Partie en cours sur la carte',
      modeLabel: isPractice && gameMode === 'CLASSIC' ? 'Outil d’entraînement (Practice Tool)' : modeLabel,
      gameMode,
      playerChampId,
      duoPartnerId: pickDefaultDuo(allyChampIds, playerChampId, role, champions),
      role,
      allyChampIds,
      enemyChampIds,
      bannedChampIds: [],
    };
  }

  // Cas 2 : Payload /state du pont local (Gameflow + Champ Select LCU + LiveGame)
  const state = rawInput as LocalBridgeStatePayload;
  if (state.liveGame && (state.liveGame.allPlayers || state.liveGame.activePlayer)) {
    const queueId = state.gameflow?.gameData?.queue?.id;
    const liveComp = extractCompositionFromBridgePayload(state.liveGame, champions);
    if (liveComp) {
      const { modeLabel, gameMode } = mapQueueToLabelAndMode(
        queueId,
        state.liveGame.gameData?.gameMode || state.gameflow?.map?.gameMode,
      );
      return {
        ...liveComp,
        modeLabel,
        gameMode,
      };
    }
  }

  if (state.champSelect) {
    const cs = state.champSelect;
    const queueId = state.gameflow?.gameData?.queue?.id;
    const rawMode = state.gameflow?.gameData?.queue?.gameMode || state.gameflow?.map?.gameMode;
    const { modeLabel, gameMode } = mapQueueToLabelAndMode(queueId, rawMode);

    const myTeam = cs.myTeam || [];
    const theirTeam = cs.theirTeam || [];
    const localPlayer =
      myTeam.find((m) => m.cellId === cs.localPlayerCellId) || myTeam[0];

    const role = normalizeLcuPosition(localPlayer?.assignedPosition);
    const playerChampId = findChampIdByNumeric(
      champions,
      localPlayer?.championId || localPlayer?.championPickIntent,
    );

    const allyChampIds = myTeam
      .map((m) => findChampIdByNumeric(champions, m.championId || m.championPickIntent))
      .filter((id): id is string => Boolean(id));

    const enemyChampIds = theirTeam
      .map((m) => findChampIdByNumeric(champions, m.championId))
      .filter((id): id is string => Boolean(id));

    // Récupère les bans depuis cs.bans + cs.actions
    const banNumericIds = new Set<number>();
    for (const id of cs.bans?.myTeamBans || []) {
      if (id > 0) banNumericIds.add(id);
    }
    for (const id of cs.bans?.theirTeamBans || []) {
      if (id > 0) banNumericIds.add(id);
    }
    for (const round of cs.actions || []) {
      for (const act of round || []) {
        if (act.type === 'ban' && act.completed && act.championId && act.championId > 0) {
          banNumericIds.add(act.championId);
        }
      }
    }

    const bannedChampIds = Array.from(banNumericIds)
      .map((num) => findChampIdByNumeric(champions, num))
      .filter((id): id is string => Boolean(id));

    return {
      sourceLabel: 'Client LoL (Sélection des champions)',
      phaseLabel: cs.benchEnabled
        ? 'Sélection ARAM en cours (banc disponible)'
        : 'Sélection des champions (Draft / Lobby)',
      modeLabel,
      gameMode,
      playerChampId,
      duoPartnerId: pickDefaultDuo(allyChampIds, playerChampId, role, champions),
      role,
      allyChampIds,
      enemyChampIds,
      bannedChampIds,
    };
  }

  return null;
}

function mapShardIdsToIndicesAndLabels(shardIds: number[]): {
  indices: [number, number, number] | null;
  labels: string[];
} {
  if (shardIds.length < 3) return { indices: null, labels: [] };
  const [s1, s2, s3] = shardIds;

  const r1 = s1 === 5005 ? 1 : s1 === 5007 ? 2 : 0;
  const r2 = s2 === 5010 ? 1 : s2 === 5001 ? 2 : 0;
  const r3 = s3 === 5013 ? 1 : s3 === 5001 ? 2 : 0;

  const r1Labels = ['+9 Force adaptative', '+10% Vitesse d’attaque', '+8 Accélération de compétence'];
  const r2Labels = ['+9 Force adaptative', '+2% Vitesse de déplacement', '+10 à 180 PV (selon niveau)'];
  const r3Labels = ['+65 PV fixes', '+10% Ténacité & résist. ralentissements', '+10 à 180 PV (selon niveau)'];

  return {
    indices: [r1, r2, r3],
    labels: [r1Labels[r1], r2Labels[r2], r3Labels[r3]],
  };
}

export function extractDetectedRunePage(
  rawInput: LocalBridgeStatePayload | LiveClientAllGameData | null | undefined,
): DetectedRunePage | null {
  if (!rawInput) return null;

  const directLive = rawInput as LiveClientAllGameData;
  const state = rawInput as LocalBridgeStatePayload;
  const liveFullRunes =
    directLive?.activePlayer?.fullRunes || state?.liveGame?.activePlayer?.fullRunes;

  if (liveFullRunes?.primaryRuneTree?.id) {
    const runeIds = (liveFullRunes.generalRunes || []).map((r) => r.id).filter(Boolean);
    const statIds = (liveFullRunes.statRunes || []).map((s) => s.id).filter(Boolean);
    const { indices, labels } = mapShardIdsToIndicesAndLabels(statIds);

    return {
      sourceLabel: 'Client LoL en jeu (127.0.0.1:2999)',
      pageName: state?.currentRunePage?.name || undefined,
      primaryTreeId: liveFullRunes.primaryRuneTree.id,
      secondaryTreeId: liveFullRunes.secondaryRuneTree?.id || null,
      keystoneId: liveFullRunes.keystone?.id || runeIds[0] || null,
      selectedRuneIds: runeIds,
      selectedShardRowIndices: indices,
      shardLabels: labels,
    };
  }

  const lcuPage = state?.currentRunePage;
  if (lcuPage?.primaryStyleId && Array.isArray(lcuPage.selectedPerkIds) && lcuPage.selectedPerkIds.length >= 6) {
    const runeIds = lcuPage.selectedPerkIds.slice(0, 6);
    const shardIds = lcuPage.selectedPerkIds.slice(6, 9);
    const { indices, labels } = mapShardIdsToIndicesAndLabels(shardIds);

    return {
      sourceLabel: 'Client LoL · Sélection des champions',
      pageName: lcuPage.name || 'Page équipée',
      primaryTreeId: lcuPage.primaryStyleId,
      secondaryTreeId: lcuPage.subStyleId || null,
      keystoneId: runeIds[0] || null,
      selectedRuneIds: runeIds,
      selectedShardRowIndices: indices,
      shardLabels: labels,
    };
  }

  return null;
}

export function formatMatchQueueLabel(queueId: number, gameMode?: string, gameType?: string): string {
  if (gameType === 'CUSTOM_GAME' || queueId === 0) {
    return gameMode?.toUpperCase() === 'PRACTICETOOL' ? 'Outil d’entraînement' : 'Personnalisée';
  }
  if (queueId === 420) return 'Classée Solo/Duo';
  if (queueId === 440) return 'Classée Flex';
  if (queueId === 480 || queueId === 490) return 'Partie Accélérée';
  if (queueId === 400) return 'Normale Draft';
  if (queueId === 430) return 'Normale Aveugle';
  if (queueId === 450) return 'ARAM';
  if (queueId === 1700) return 'Arena';
  if (queueId === 900 || queueId === 1900) return 'URF';
  if (gameMode?.toUpperCase() === 'ARAM') return 'ARAM';
  if (gameMode?.toUpperCase() === 'CLASSIC') return 'Faille de l’invocateur';
  return gameMode || 'Partie LoL';
}

export function normalizeLcuHistoryToMatches(
  rawInput: any,
  champions: ChampionSummary[],
  riotId: string,
): MatchRecord[] {
  const gamesList: any[] =
    rawInput?.games?.games || (Array.isArray(rawInput?.games) ? rawInput.games : []);
  if (!Array.isArray(gamesList) || gamesList.length === 0) return [];

  const [wantedName] = riotId.split('#');
  const wantedLow = (wantedName || '').trim().toLowerCase();

  return gamesList.map((g: any): MatchRecord => {
    const durationSec = Math.max(1, Number(g.gameDuration || 1));
    const durationMin = Math.max(1, durationSec / 60);
    const identityMap = new Map<number, any>();
    for (const pi of g.participantIdentities || []) {
      if (pi?.participantId) identityMap.set(pi.participantId, pi.player || {});
    }

    const participants: MatchParticipantSummary[] = (g.participants || []).map((p: any) => {
      const stats = p.stats || {};
      const ident = identityMap.get(p.participantId) || {};
      const champObj = champions.find((c) => Number(c.key) === Number(p.championId));
      const cs = (stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0);
      const lane = String(p.timeline?.lane || '').toUpperCase();
      const role = String(p.timeline?.role || '').toUpperCase();
      const teamPosition =
        role.includes('SUPPORT')
          ? 'UTILITY'
          : lane === 'BOTTOM'
            ? 'BOTTOM'
            : lane === 'MIDDLE'
              ? 'MIDDLE'
              : lane === 'JUNGLE'
                ? 'JUNGLE'
                : lane === 'TOP'
                  ? 'TOP'
                  : 'UNKNOWN';

      return {
        puuid: ident.puuid || '',
        riotIdGameName: ident.gameName || ident.summonerName || 'Joueur',
        riotIdTagline: ident.tagLine || '',
        championId: Number(p.championId || 0),
        championName: champObj?.id || `Champion${p.championId || ''}`,
        teamId: Number(p.teamId || 100),
        teamPosition,
        win: Boolean(stats.win),
        kills: Number(stats.kills || 0),
        deaths: Number(stats.deaths || 0),
        assists: Number(stats.assists || 0),
        cs,
        csPerMin: Number((cs / durationMin).toFixed(1)),
        goldEarned: Number(stats.goldEarned || 0),
        totalDamageDealtToChampions: Number(stats.totalDamageDealtToChampions || 0),
        totalDamageTaken: Number(stats.totalDamageTaken || 0),
        visionScore: Number(stats.visionScore || 0),
        wardsPlaced: Number(stats.wardsPlaced || 0),
        wardsKilled: Number(stats.wardsKilled || 0),
        items: [
          stats.item0 || 0,
          stats.item1 || 0,
          stats.item2 || 0,
          stats.item3 || 0,
          stats.item4 || 0,
          stats.item5 || 0,
        ],
        summoner1Id: Number(p.spell1Id || 4),
        summoner2Id: Number(p.spell2Id || 14),
        champLevel: Number(stats.champLevel || 1),
      };
    });

    const selfPlayer =
      participants.find((p) => p.riotIdGameName.toLowerCase() === wantedLow) || participants[0];
    const laneOpponent =
      participants.find(
        (p) =>
          p.teamId !== selfPlayer.teamId &&
          selfPlayer.teamPosition !== 'UNKNOWN' &&
          p.teamPosition === selfPlayer.teamPosition,
      ) ||
      participants.find((p) => p.teamId !== selfPlayer.teamId) ||
      null;

    const platformId = String(g.platformId || 'EUW1');
    const numericId = g.gameId || g.gameCreation || Date.now();
    const isCustom = g.gameType === 'CUSTOM_GAME' || Number(g.queueId || 0) === 0;

    return {
      matchId: `${platformId}_${numericId}`,
      gameCreation: Number(g.gameCreation || Date.now()),
      gameDurationSec: durationSec,
      gameMode: isCustom ? 'CUSTOM' : String(g.gameMode || 'CLASSIC'),
      queueId: isCustom ? 0 : Number(g.queueId || 0),
      gameVersion: String(g.gameVersion || '').split('.').slice(0, 2).join('.') || 'Local',
      source: 'Client LoL Local (LCU)',
      player: selfPlayer,
      laneOpponent,
      participants,
      timelineSplits: [],
      mapEvents: [],
    };
  });
}

