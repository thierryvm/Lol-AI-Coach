import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Swords,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { postCoachJson } from '../engines/aiConfig.ts';
import { parseLiveClientSnapshot } from '../engines/liveCoachEngine.ts';
import type {
  ChampionSummary,
  DetectedRunePage,
  LiveCoachSnapshot,
  LivePlayerEquipmentRow,
  PlayerProfileResponse,
  RiotPlatform,
  Role,
  RuneTree,
} from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { VisualRunePage } from './VisualRunePage.tsx';
import {
  downloadWindowsBridgeBat,
  extractDetectedRunePage,
  mapQueueToLabelAndMode,
  UNIVERSAL_LIVE_CLIPBOARD_CMD,
} from '../utils/liveBridge.ts';

interface LiveCoachViewProps {
  champions: ChampionSummary[];
  runeTrees: RuneTree[];
  patchVersion: string;
  riotId: string;
  region: RiotPlatform;
  initialActiveGame?: PlayerProfileResponse['activeGame'];
  onActiveGameDetected?: (game: PlayerProfileResponse['activeGame']) => void;
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const trimmed = riotId.trim();
  if (trimmed.includes('#')) {
    const [gameName, tagLine] = trimmed.split('#');
    return { gameName: gameName || 'Boulvae', tagLine: tagLine || 'EUW' };
  }
  return { gameName: trimmed || 'Boulvae', tagLine: 'EUW' };
}

export function LiveCoachView({
  champions,
  runeTrees,
  patchVersion,
  riotId,
  region,
  initialActiveGame,
  onActiveGameDetected,
}: LiveCoachViewProps) {
  const [snapshot, setSnapshot] = useState<LiveCoachSnapshot | null>(null);
  const [bridgePollActive, setBridgePollActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preferredRole, setPreferredRole] = useState<Role>('SUPPORT');

  const [spectatorGame, setSpectatorGame] = useState<PlayerProfileResponse['activeGame'] | null>(
    initialActiveGame || null,
  );
  const [spectatorLoading, setSpectatorLoading] = useState(false);
  const [spectatorError, setSpectatorError] = useState<string | null>(null);
  const [spectatorCheckedAt, setSpectatorCheckedAt] = useState<string | null>(null);

  const [manualJson, setManualJson] = useState('');
  const [showConnector, setShowConnector] = useState(true);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);
  const [clientRunePage, setClientRunePage] = useState<DetectedRunePage | null>(null);
  const [copiedRelay, setCopiedRelay] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<{
    immediateCall?: string;
    recallAdvice?: string;
    dangerWatch?: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    if (initialActiveGame) {
      setSpectatorGame(initialActiveGame);
    }
  }, [initialActiveGame]);

  const fetchLatest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/live/latest');
      if (res.ok) {
        const data = (await res.json()) as LiveCoachSnapshot;
        setSnapshot(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatest();
  }, []);

  const handleCheckSpectatorGame = async () => {
    setSpectatorLoading(true);
    setSpectatorError(null);
    try {
      const { gameName, tagLine } = parseRiotId(riotId);
      const res = await fetch(
        `/api/riot/active-game?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(
          tagLine,
        )}&region=${encodeURIComponent(region)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de vérifier Spectator-V5.');
      setSpectatorGame(data);
      setSpectatorCheckedAt(new Date().toLocaleTimeString('fr-FR'));
      onActiveGameDetected?.(data);
    } catch (err) {
      setSpectatorError(err instanceof Error ? err.message : 'Erreur Spectator-V5.');
    } finally {
      setSpectatorLoading(false);
    }
  };

  // Interroge automatiquement le pont local Windows (http://127.0.0.1:38421/health + /live)
  // ou en secours https://127.0.0.1:2999/liveclientdata/allgamedata
  const pollLocalBridge = async () => {
    try {
      let raw: any = null;
      let bridgeReachable = false;

      try {
        const healthRes = await fetch('http://127.0.0.1:38421/health');
        if (healthRes.ok) {
          bridgeReachable = true;
          const bridgeRes = await fetch('http://127.0.0.1:38421/live');
          if (bridgeRes.ok) {
            raw = await bridgeRes.json();
          } else if (bridgeRes.status === 503) {
            // Vérifie si une page de runes client est déjà active en Champ Select ou Salon
            try {
              const stateRes = await fetch('http://127.0.0.1:38421/state');
              if (stateRes.ok) {
                const stateJson = await stateRes.json();
                const detected = extractDetectedRunePage(stateJson);
                if (detected) setClientRunePage(detected);
                if (stateJson?.liveGame?.activePlayer) {
                  raw = stateJson.liveGame;
                }
              }
            } catch {
              // ignore
            }
            if (!raw) {
              setBridgeStatus(
                'Pont Windows v3 connecté (port 38421) ! En attente qu’une partie ou l’Outil d’entraînement soit chargé sur la carte (127.0.0.1:2999)...',
              );
              return;
            }
          }
        }
      } catch {
        // Repli direct si le navigateur autorise 127.0.0.1:2999
        const directRes = await fetch('https://127.0.0.1:2999/liveclientdata/allgamedata');
        if (directRes.ok) {
          bridgeReachable = true;
          raw = await directRes.json();
        }
      }

      if (!raw || raw.error) {
        setBridgeStatus(
          bridgeReachable
            ? 'Pont connecté, en attente de données de partie active sur 127.0.0.1:2999.'
            : isInsideIframe
              ? 'Accès à 127.0.0.1 bloqué dans l’aperçu iframe : « Tester le pont maintenant » ne peut pas contacter votre PC depuis cet aperçu. Cliquez sur « Ouvrir dans un onglet dédié » ou collez le JSON avec Ctrl+V ci-dessous.'
              : 'Pont local 127.0.0.1:38421 non détecté. Téléchargez et lancez le nouveau lol-coach-bridge.bat v3 sur Windows.',
        );
        return;
      }

      const parsed = parseLiveClientSnapshot(
        raw,
        'Live Client Data (127.0.0.1:2999)',
        preferredRole,
      );
      setSnapshot(parsed);
      setBridgeStatus(
        `Synchronisé en direct (${parsed.championName} · ${formatClock(parsed.gameTimeSec)})`,
      );

      await fetch('/api/live/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allgamedata: raw, role: preferredRole }),
      }).catch(() => {});
    } catch {
      setBridgeStatus(
        isInsideIframe
          ? 'Le navigateur bloque l’accès vers 127.0.0.1 depuis l’aperçu iframe. Cliquez sur « Ouvrir dans un onglet dédié » pour tester le pont automatiquement, ou utilisez Ctrl+V dans la zone JSON ci-dessous.'
          : 'Pont local inaccessible depuis le navigateur. Vérifiez que lol-coach-bridge.bat v3 est ouvert ou utilisez Ctrl+V dans la zone JSON ci-dessous.',
      );
    }
  };

  useEffect(() => {
    if (!bridgePollActive) return;
    pollLocalBridge();
    const id = window.setInterval(pollLocalBridge, 3000);
    return () => window.clearInterval(id);
  }, [bridgePollActive, preferredRole]);

  const handleDownloadBridge = () => {
    downloadWindowsBridgeBat();
  };

  const getChampIcon = (championName: string) =>
    champions.find(
      (c) =>
        c.id.toLowerCase() === championName.toLowerCase() ||
        c.name.toLowerCase() === championName.toLowerCase(),
    )?.imageUrl;

  const getChampionByNumericId = (championId: number) =>
    champions.find((c) => Number(c.key) === championId);

  const getItemIcon = (itemId: number) =>
    itemId > 0 ? `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/item/${itemId}.png` : undefined;

  const handleAdvanceSimulation = async () => {
    if (!snapshot) return;
    setIngestError(null);
    const nextTime = snapshot.gameTimeSec + 180;
    const allyRows = snapshot.allyPlayers || [];
    const enemyRows = snapshot.enemyPlayers || [];

    const simulatedPayload = {
      simulation: true,
      role: preferredRole,
      allgamedata: {
        activePlayer: {
          championName: snapshot.championName,
          level: Math.min(18, snapshot.level + 1),
          currentGold: snapshot.currentGold + 680,
          championStats: snapshot.activeStats
            ? {
                ...snapshot.activeStats,
                maxHealth: snapshot.activeStats.maxHealth + 95,
                attackDamage: snapshot.activeStats.attackDamage + 4,
                armor: snapshot.activeStats.armor + 5,
              }
            : undefined,
          fullRunes: snapshot.fullRunesSummary
            ? {
                keystone: snapshot.fullRunesSummary.keystoneId
                  ? {
                      id: snapshot.fullRunesSummary.keystoneId,
                      displayName: snapshot.fullRunesSummary.keystoneName || '',
                    }
                  : undefined,
                primaryRuneTree: snapshot.fullRunesSummary.primaryTreeId
                  ? { id: snapshot.fullRunesSummary.primaryTreeId, displayName: '' }
                  : undefined,
                secondaryRuneTree: snapshot.fullRunesSummary.secondaryTreeId
                  ? { id: snapshot.fullRunesSummary.secondaryTreeId, displayName: '' }
                  : undefined,
                generalRunes: snapshot.fullRunesSummary.selectedRuneIds.map((id) => ({
                  id,
                  displayName: String(id),
                })),
                statRunes: snapshot.fullRunesSummary.statRuneIds.map((id) => ({
                  id,
                  rawDescription: '',
                })),
              }
            : undefined,
        },
        allPlayers: [
          ...allyRows.map((p, idx) => ({
            championName: p.championName,
            riotId: p.riotId,
            team: 'ORDER' as const,
            position: p.position,
            level: Math.min(18, p.level + (idx === 0 ? 1 : 0)),
            scores: {
              kills: p.kills + (p.championName === snapshot.championName ? 1 : 0),
              deaths: p.deaths,
              assists: p.assists + 1,
              creepScore:
                p.championName === snapshot.championName
                  ? p.cs + 14
                  : Math.round((nextTime / 60) * 6.5),
            },
            items: p.items.map((it) => ({
              itemID: it.itemId,
              displayName: it.displayName,
              price: it.price,
            })),
          })),
          ...enemyRows.map((e) => ({
            championName: e.championName,
            riotId: e.riotId,
            team: 'CHAOS' as const,
            position: e.position,
            level: Math.min(18, e.level + 1),
            scores: {
              kills: e.kills + (e.dangerLevel === 'Élevé' ? 1 : 0),
              deaths: e.deaths,
              assists: e.assists + 1,
              creepScore: e.cs + 18,
            },
            items: e.items.map((it) => ({
              itemID: it.itemId,
              displayName: it.displayName,
              price: it.price,
            })),
          })),
        ],
        events: {
          Events: [{ EventID: 1, EventName: 'GameStart', EventTime: 0 }],
        },
        gameData: {
          gameMode: 'CLASSIC',
          gameTime: nextTime,
        },
      },
    };

    const res = await fetch('/api/live/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simulatedPayload),
    });
    if (res.ok) {
      setSnapshot(await res.json());
      setAiAdvice(null);
    }
  };

  const ingestRawText = async (rawText: string) => {
    setIngestError(null);
    setIngestSuccess(null);
    try {
      const parsed = JSON.parse(rawText);
      const detectedPage = extractDetectedRunePage(parsed);
      if (detectedPage) {
        setClientRunePage(detectedPage);
      }
      const rawGameData = parsed.liveGame || parsed.allgamedata || parsed;
      if (!rawGameData?.allPlayers && !rawGameData?.activePlayer) {
        if (detectedPage) {
          setManualJson('');
          setShowConnector(false);
          setIngestSuccess(
            `Page de runes « ${detectedPage.pageName || 'Client LoL'} » chargée dans la grille ci-dessous (en attente de partie sur 127.0.0.1:2999).`,
          );
          return;
        }
      }
      const res = await fetch('/api/live/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allgamedata: rawGameData, role: preferredRole }),
      });
      const data = (await res.json()) as LiveCoachSnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error || 'JSON invalide');
      setSnapshot(data);
      setManualJson('');
      setShowConnector(false);
      setIngestSuccess(
        `Partie chargée en direct : ${data.championName} (${formatClock(data.gameTimeSec)}) · Équipements des 10 joueurs & runes mis à jour.`,
      );
      setAiAdvice(null);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Format JSON Live Client Data invalide.');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setIngestError('Le presse-papiers est vide.');
        return;
      }
      await ingestRawText(text);
    } catch {
      setIngestError(
        'Le bouton presse-papiers est bloqué par la sécurité iframe : cliquez simplement dans la zone texte ci-dessous et faites Ctrl+V (analyse immédiate).',
      );
    }
  };

  const handleTextareaPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && pasted.trim().startsWith('{')) {
      e.preventDefault();
      setManualJson(pasted);
      await ingestRawText(pasted);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await ingestRawText(text);
  };

  const handleAskAiLive = async () => {
    if (!snapshot) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await postCoachJson<{
        immediateCall: string;
        recallAdvice: string;
        dangerWatch: string;
      }>('/api/coach/live-advice', { snapshot });
      setAiAdvice(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erreur IA.');
    } finally {
      setAiLoading(false);
    }
  };

  // Commande universelle compatible PowerShell 7 (pwsh) ET PowerShell 5.1 (Windows 10/11)
  const clipboardCommand = UNIVERSAL_LIVE_CLIPBOARD_CMD;

  const handleCopyRelay = async () => {
    try {
      await navigator.clipboard.writeText(clipboardCommand);
      setCopiedRelay(true);
      window.setTimeout(() => setCopiedRelay(false), 2000);
    } catch {
      setIngestError('Sélectionnez la commande et copiez avec Ctrl+C.');
    }
  };

  if (!snapshot) return null;

  const allyPlayers: LivePlayerEquipmentRow[] =
    snapshot.allyPlayers && snapshot.allyPlayers.length > 0
      ? snapshot.allyPlayers
      : snapshot.rawSummary.allyTeam.map((name) => ({
          championName: name,
          riotId: name,
          team: 'ALLY',
          position: '-',
          level: snapshot.level,
          kills: 0,
          deaths: 0,
          assists: 0,
          cs: 0,
          isDead: false,
          items: [],
          dangerLevel: 'Normal',
        }));

  const enemyPlayers: LivePlayerEquipmentRow[] =
    snapshot.enemyPlayers && snapshot.enemyPlayers.length > 0
      ? snapshot.enemyPlayers
      : snapshot.enemyThreats.map((e) => ({
          championName: e.championName,
          riotId: e.championName,
          team: 'ENEMY',
          position: '-',
          level: e.level,
          kills: e.kills,
          deaths: 0,
          assists: 0,
          cs: e.cs,
          isDead: false,
          items: [],
          dangerLevel: e.dangerLevel,
        }));

  const spectatorBlue = (spectatorGame?.participants || []).filter((p) => p.teamId === 100);
  const spectatorRed = (spectatorGame?.participants || []).filter((p) => p.teamId === 200);

  return (
    <div className="space-y-8">
      {/* Détection automatique via Riot Spectator-V5 */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Radar className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Détection de votre partie en cours (Riot Spectator-V5 · {riotId})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Vérifie directement auprès des serveurs Riot ({region}) si {riotId} est actuellement dans une partie publique.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCheckSpectatorGame}
            disabled={spectatorLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${spectatorLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {spectatorLoading ? 'Recherche...' : 'Détecter ma partie en cours'}
          </button>
        </div>

        {spectatorError && (
          <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400">
            {spectatorError}
          </div>
        )}

        {spectatorGame?.inGame ? (
          <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                Partie active détectée ·{' '}
                {mapQueueToLabelAndMode(spectatorGame.gameQueueConfigId, spectatorGame.gameMode).modeLabel} · Durée{' '}
                <span className="font-mono tabular-nums">{formatClock(spectatorGame.gameLengthSec || 0)}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Riot Spectator-V5 fournit les 10 champions + bans en direct (les objets en temps réel viennent du flux local 127.0.0.1:2999 ci-dessous).
              </div>
            </div>

            {spectatorGame.bannedChampions && spectatorGame.bannedChampions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3.5 py-2.5 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">
                  Champions bannis ({spectatorGame.bannedChampions.length}) :
                </span>
                {spectatorGame.bannedChampions.map((ban, idx) => {
                  const bannedChamp = getChampionByNumericId(ban.championId);
                  return (
                    <div
                      key={`${ban.championId}-${idx}`}
                      className="inline-flex items-center gap-1.5 pr-2 text-[11px] text-slate-600 dark:text-slate-300"
                      title={bannedChamp?.name || `Ban #${ban.championId}`}
                    >
                      <SafeGameIcon
                        src={bannedChamp?.imageUrl}
                        alt={bannedChamp?.name || String(ban.championId)}
                        fallbackLabel={bannedChamp?.name || 'Ban'}
                        sizeClass="w-5 h-5"
                      />
                      <span>{bannedChamp?.name || `#${ban.championId}`}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Équipe Bleue (100)', list: spectatorBlue },
                { label: 'Équipe Rouge (200)', list: spectatorRed },
              ].map((team) => (
                <div
                  key={team.label}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2.5"
                >
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {team.label}
                  </div>
                  <div className="space-y-2">
                    {team.list.map((sp, idx) => {
                      const champ = getChampionByNumericId(sp.championId);
                      const isSelf = sp.riotId.toLowerCase() === riotId.toLowerCase();
                      return (
                        <div key={`${sp.riotId}-${idx}`} className="flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <SafeGameIcon
                              src={champ?.imageUrl}
                              alt={champ?.name || String(sp.championId)}
                              fallbackLabel={champ?.name || 'LoL'}
                              sizeClass="w-7 h-7"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 dark:text-white truncate">
                                {champ?.name || `Champion #${sp.championId}`}
                                {isSelf && (
                                  <span className="ml-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    (Vous)
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {sp.riotId}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {spectatorCheckedAt ? (
              <span>
                Vérifié à {spectatorCheckedAt} : aucune partie publique active retournée par Spectator-V5 pour{' '}
                <strong className="text-slate-700 dark:text-slate-200">{riotId}</strong>.
              </span>
            ) : (
              <span>
                Rappel important : l’API publique Riot Spectator-V5 détecte uniquement les parties lancées sur la Faille / ARAM après l’écran de chargement (elle reste vide dans le salon ou l’Outil d’entraînement). Pour voir votre or et les objets en temps réel, utilisez le flux local Live Client Data ci-dessous.
              </span>
            )}
          </div>
        )}
      </section>

      {/* En-tête Live Client Data */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <SafeGameIcon
              src={getChampIcon(snapshot.championName)}
              alt={snapshot.championName}
              fallbackLabel={snapshot.championName}
              sizeClass="w-12 h-12"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Coach Temps Réel · {snapshot.championName} (Niv. {snapshot.level})
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>Source : {snapshot.source}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono tabular-nums">Horloge : {formatClock(snapshot.gameTimeSec)}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={preferredRole}
              onChange={(e) => setPreferredRole(e.target.value as Role)}
              aria-label="Rôle joué"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            >
              {(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  Rôle : {r}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setBridgePollActive((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                bridgePollActive
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
              {bridgePollActive ? 'Pont auto actif (3s)' : 'Connecter le pont auto'}
            </button>

            <button
              type="button"
              onClick={handleAdvanceSimulation}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Simuler +3 min
            </button>

            <button
              type="button"
              onClick={() => setShowConnector((v) => !v)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              {showConnector ? 'Masquer connexion' : 'Configurer le pont Live'}
            </button>
          </div>
        </div>

        {ingestSuccess && (
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs text-emerald-700 dark:text-emerald-300">
            {ingestSuccess}
          </div>
        )}

        {/* Panneau de connexion Live Client Data */}
        {showConnector && (
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
            {isInsideIframe && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    Mode aperçu intégré (iframe) détecté
                  </div>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    Ouvrir dans un onglet dédié
                  </a>
                </div>
                <p className="leading-relaxed">
                  Dans la fenêtre d’aperçu Google AI Studio, Chrome bloque par sécurité le pont automatique{' '}
                  <code className="px-1 py-0.5 rounded bg-amber-500/10">127.0.0.1:38421</code>.{' '}
                  <strong>2 solutions simples :</strong> utilisez la commande PowerShell ci-dessous (compatible PowerShell 7 &amp; 5.1) puis faites{' '}
                  <strong>Ctrl+V</strong> dans la zone texte, ou cliquez sur <strong>Ouvrir dans un onglet dédié</strong> pour utiliser{' '}
                  <code className="px-1 py-0.5 rounded bg-amber-500/10">lol-coach-bridge.bat</code> en direct toutes les 3s.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Méthode automatique Windows (dans un onglet dédié · Compatible Outil d’entraînement)
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    Téléchargez et lancez le nouveau{' '}
                    <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">lol-coach-bridge.bat</code>{' '}
                    (v3 encodé PowerShell, reste ouvert sans crash) puis ouvrez l’app dans un onglet dédié et cliquez sur{' '}
                    <strong>Connecter le pont auto</strong> : fonctionne en Classée, ARAM et <strong>Outil d’entraînement</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBridge}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Télécharger lol-coach-bridge.bat (v3)
                </button>
              </div>
            </div>

            {bridgeStatus && (
              <div className="p-3 rounded-lg border border-sky-500/30 bg-sky-500/5 text-xs text-sky-700 dark:text-sky-300">
                {bridgeStatus}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Méthode instantanée en aperçu : exécutez cette commande PowerShell pendant la partie, puis cliquez dans la zone ci-dessous et faites{' '}
                <strong>Ctrl+V</strong> :
              </div>
              <div className="relative">
                <pre className="p-3 pr-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                  {clipboardCommand}
                </pre>
                <button
                  type="button"
                  onClick={handleCopyRelay}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  {copiedRelay ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedRelay ? 'Copié' : 'Copier'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
                Coller depuis le presse-papiers
              </button>

              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                Importer un fichier .json
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="sr-only" />
              </label>

              <button
                type="button"
                onClick={pollLocalBridge}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Tester le pont maintenant
              </button>
            </div>

            <div className="space-y-2">
              <textarea
                rows={2}
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
                onPaste={handleTextareaPaste}
                placeholder='Cliquez ici et faites Ctrl+V pour analyser immédiatement le JSON de 127.0.0.1:2999/liveclientdata/allgamedata'
                className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
              />
              {ingestError && <p className="text-xs text-rose-500">{ingestError}</p>}
              {manualJson.trim() && (
                <button
                  type="button"
                  onClick={() => ingestRawText(manualJson)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950"
                >
                  Analyser ce snapshot
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Télémétrie Live */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">KDA & Score équipe</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.kda}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Équipe {snapshot.allyKills} – {snapshot.enemyKills}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Rythme CS Live</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.csPerMin} <span className="text-xs font-normal text-slate-400">/min</span>
          </div>
          <div
            className={`mt-0.5 text-[11px] font-mono tabular-nums ${
              snapshot.csPaceDelta >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {snapshot.csPaceDelta >= 0 ? `+${snapshot.csPaceDelta}` : snapshot.csPaceDelta} vs cible ({snapshot.targetCsPerMin})
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Or en poche</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {snapshot.currentGold} po
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {snapshot.currentGold >= 1300 ? 'Fenêtre de rappel optimale' : 'Continuer à farmer'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" aria-hidden="true" />
            Prochain Dragon
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.dragonTimerSec === 0 ? 'Disponible' : formatClock(snapshot.dragonTimerSec ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Préparer vision à -45s
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" aria-hidden="true" />
            Baron Nashor
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.baronTimerSec === 0 ? 'Disponible' : formatClock(snapshot.baronTimerSec ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Rivière nord
          </div>
        </div>
      </section>

      {/* Adaptation proactive pendant la partie (En difficulté / Avance) */}
      {snapshot.comebackAdvice ? (
        <section className="rounded-xl border border-rose-500/35 bg-rose-500/5 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              Plan d’urgence proactif — Adaptation en difficulté
            </h2>
            <span className="text-xs font-mono tabular-nums text-rose-600 dark:text-rose-300">
              {snapshot.comebackAdvice.triggerReason}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-rose-500/20 text-xs leading-relaxed">
            <div className="space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Pivot équipement immédiat (Prochain rappel)
              </div>
              <p className="text-slate-700 dark:text-slate-200">
                {snapshot.comebackAdvice.priorityItemHint}
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Ajustement gameplay &amp; macro
              </div>
              <p className="text-slate-700 dark:text-slate-200">
                {snapshot.comebackAdvice.gameplayPivot}
              </p>
            </div>
          </div>
        </section>
      ) : snapshot.gameState === 'AHEAD' ? (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            Dynamique favorable (En avance)
          </div>
          <p className="text-slate-700 dark:text-slate-300">
            Convertissez votre avance économique : dépensez votre or avant les objectifs neutres et posez la vision profonde pour verrouiller la rivière.
          </p>
        </section>
      ) : null}

      {/* Statistiques actuelles du champion */}
      {snapshot.activeStats && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Statistiques actuelles de {snapshot.championName}
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Incluant runes & objets équipés
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'PV Max', value: `${snapshot.activeStats.maxHealth}` },
              { label: 'Dégâts Att. (AD)', value: `${snapshot.activeStats.attackDamage}` },
              { label: 'Puissance (AP)', value: `${snapshot.activeStats.abilityPower}` },
              { label: 'Armure', value: `${snapshot.activeStats.armor}` },
              { label: 'Résist. Mag.', value: `${snapshot.activeStats.magicResist}` },
              { label: 'Vit. Attaque', value: `${snapshot.activeStats.attackSpeed}` },
              { label: 'Vitesse dép.', value: `${snapshot.activeStats.moveSpeed}` },
            ].map((st) => (
              <div
                key={st.label}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3 py-2.5"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{st.label}</div>
                <div className="mt-1 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {st.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grille visuelle des runes équipées (identique au client League of Legends) */}
      {(snapshot.fullRunesSummary?.primaryTreeId || clientRunePage?.primaryTreeId) && (() => {
        const useLiveRunes = Boolean(
          snapshot.fullRunesSummary?.primaryTreeId &&
            (snapshot.source !== 'Simulation Live Client Data' || !clientRunePage),
        );
        const rs = snapshot.fullRunesSummary;
        const primaryTreeId = useLiveRunes ? rs!.primaryTreeId : clientRunePage!.primaryTreeId;
        const secondaryTreeId = useLiveRunes ? rs!.secondaryTreeId : clientRunePage!.secondaryTreeId;
        const keystoneId = useLiveRunes ? rs!.keystoneId : clientRunePage!.keystoneId;
        const selectedRuneIds = useLiveRunes ? rs!.selectedRuneIds : clientRunePage!.selectedRuneIds;
        const clientStatIds = clientRunePage?.selectedShardRowIndices
          ? [
              [5008, 5005, 5007][clientRunePage.selectedShardRowIndices[0]] ?? 5008,
              [5008, 5010, 5001][clientRunePage.selectedShardRowIndices[1]] ?? 5008,
              [5011, 5013, 5001][clientRunePage.selectedShardRowIndices[2]] ?? 5011,
            ]
          : [];
        const statRuneIds = useLiveRunes ? rs!.statRuneIds : clientStatIds;

        return (
          <VisualRunePage
            runeTrees={runeTrees}
            primaryTreeId={primaryTreeId}
            secondaryTreeId={secondaryTreeId}
            keystoneId={keystoneId}
            selectedRuneIds={selectedRuneIds}
            statRuneIds={statRuneIds}
            championName={useLiveRunes ? snapshot.championName : undefined}
            pageTitle={
              !useLiveRunes && clientRunePage?.pageName
                ? `Page de runes client · « ${clientRunePage.pageName} »`
                : `Page de runes équipée en partie · ${snapshot.championName}`
            }
            sourceLabel={useLiveRunes ? snapshot.source : clientRunePage?.sourceLabel}
          />
        );
      })()}

      {/* Équipement actuel des 10 joueurs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {[
          {
            title: 'Votre équipe · Équipements actuels',
            icon: Shield,
            iconClass: 'text-sky-500',
            rows: allyPlayers,
            showDanger: false,
          },
          {
            title: 'Équipe adverse · Équipements & Menaces',
            icon: Swords,
            iconClass: 'text-rose-500',
            rows: enemyPlayers,
            showDanger: true,
          },
        ].map((teamBlock) => {
          const Icon = teamBlock.icon;
          return (
            <section
              key={teamBlock.title}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Icon className={`w-4 h-4 ${teamBlock.iconClass}`} aria-hidden="true" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {teamBlock.title}
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4 text-left font-medium">Champion</th>
                      <th className="py-2.5 px-2 text-right font-medium">Niv</th>
                      <th className="py-2.5 px-2 text-right font-medium">K/D/A</th>
                      <th className="py-2.5 px-2 text-right font-medium">CS</th>
                      <th className="py-2.5 px-3 text-left font-medium">Équipement actuel</th>
                      {teamBlock.showDanger && (
                        <th className="py-2.5 px-4 text-right font-medium">Menace</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {teamBlock.rows.map((player, idx) => {
                      const isSelf =
                        player.championName.toLowerCase() === snapshot.championName.toLowerCase();
                      const totalItemsGold = player.items.reduce((acc, it) => acc + (it.price || 0), 0);
                      return (
                        <tr
                          key={`${player.championName}-${idx}`}
                          className={
                            isSelf
                              ? 'bg-amber-500/5 dark:bg-amber-500/10'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }
                        >
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <SafeGameIcon
                                key={`live-champ-${player.championName}-${idx}`}
                                src={getChampIcon(player.championName)}
                                alt={player.championName}
                                fallbackLabel={player.championName}
                                sizeClass="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-white truncate">
                                  {player.championName}
                                  {isSelf && (
                                    <span className="ml-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                      (Vous)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {player.riotId !== player.championName ? player.riotId : player.position}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {player.level}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                            {player.kills}/{player.deaths}/{player.assists}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {player.cs}
                          </td>
                          <td className="py-2.5 px-3">
                            {player.items.length === 0 ? (
                              <span className="text-[11px] text-slate-400">Aucun objet</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1">
                                {player.items.slice(0, 7).map((it, itemIdx) => (
                                  <div
                                    key={`${player.championName}-item-${it.itemId}-${itemIdx}`}
                                    title={`${it.displayName}${it.price ? ` (${it.price} po)` : ''}`}
                                  >
                                    <SafeGameIcon
                                      src={getItemIcon(it.itemId)}
                                      alt={it.displayName}
                                      fallbackLabel={it.displayName}
                                      sizeClass="w-7 h-7"
                                    />
                                  </div>
                                ))}
                                {totalItemsGold > 0 && (
                                  <span className="ml-1 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                    {totalItemsGold.toLocaleString('fr-FR')} po
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          {teamBlock.showDanger && (
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  player.dangerLevel === 'Élevé'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : player.dangerLevel === 'Moyen'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {player.dangerLevel}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      {/* Alertes temps réel & Coach Gemini */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Alertes tactiques non intrusives & Appel IA
          </h2>
          <button
            type="button"
            onClick={handleAskAiLive}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {aiLoading ? 'Calcul...' : 'Conseil IA instantané'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {snapshot.alerts.map((al, idx) => (
              <div key={idx} className="p-4 space-y-1.5 bg-white dark:bg-[#121722]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {al.category}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      al.priority === 'Haute'
                        ? 'text-rose-600 dark:text-rose-400'
                        : al.priority === 'Moyenne'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    Priorité {al.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">{al.message}</p>
                <p className="text-xs text-sky-700 dark:text-sky-400 font-medium">{al.action}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Appel tactique IA instantané
            </h3>

            {aiError && <p className="text-xs text-rose-500">{aiError}</p>}

            {aiAdvice ? (
              <div className="space-y-2.5 text-xs">
                <div>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    Action 30s :{' '}
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">{aiAdvice.immediateCall}</span>
                </div>
                <div>
                  <span className="font-semibold text-sky-600 dark:text-sky-400">
                    Rappel & achat :{' '}
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">{aiAdvice.recallAdvice}</span>
                </div>
                <div>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    Vigilance menace :{' '}
                  </span>
                  <span className="text-slate-800 dark:text-slate-200">{aiAdvice.dangerWatch}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cliquez sur « Conseil IA instantané » pour analyser vos objets actuels, vos PV/résistances et l’équipement adverse.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
