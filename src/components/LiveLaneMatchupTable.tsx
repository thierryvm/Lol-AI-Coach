import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert, Swords } from 'lucide-react';
import { classifyChampionProfile } from '../engines/championEngine.ts';
import type {
  ChampionSummary,
  LaneMatchupWinRateResponse,
  LaneMatchupWinRateRow,
  LivePlayerEquipmentRow,
  LobbyScoutParticipant,
  MatchRecord,
  RiotPlatform,
  Role,
  SpectatorParticipant,
} from '../engines/types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

interface LiveLaneMatchupTableProps {
  riotId: string;
  region: RiotPlatform;
  playerChampionName: string;
  role: Role;
  enemyPlayers: LivePlayerEquipmentRow[];
  spectatorParticipants?: SpectatorParticipant[];
  lobbyScoutMap?: Record<string, LobbyScoutParticipant>;
  champions: ChampionSummary[];
  matches?: MatchRecord[];
}

const ROLE_TO_MATCH_LANE: Record<Role, string> = {
  TOP: 'TOP',
  JUNGLE: 'JUNGLE',
  MID: 'MIDDLE',
  ADC: 'BOTTOM',
  SUPPORT: 'UTILITY',
};

const LANE_LABEL_FR: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  MID: 'Mid',
  BOTTOM: 'ADC / Bot',
  BOT: 'ADC / Bot',
  UTILITY: 'Support',
  SUPPORT: 'Support',
};

function normChampKey(raw: string): string {
  const clean = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (clean === 'wukong') return 'monkeyking';
  return clean;
}

function normLane(raw?: string): string {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'MID' || upper === 'MIDDLE') return 'MIDDLE';
  if (upper === 'ADC' || upper === 'BOT' || upper === 'BOTTOM') return 'BOTTOM';
  if (upper === 'SUP' || upper === 'SUPPORT' || upper === 'UTILITY') return 'UTILITY';
  if (upper === 'JGL' || upper === 'JUNGLE') return 'JUNGLE';
  if (upper === 'TOP') return 'TOP';
  return '';
}

function parseRiotIdParts(riotId: string): { gameName: string; tagLine: string } {
  const trimmed = riotId.trim();
  if (trimmed.includes('#')) {
    const [gameName, tagLine] = trimmed.split('#');
    return { gameName: (gameName || '').trim(), tagLine: (tagLine || '').trim() };
  }
  return { gameName: trimmed, tagLine: 'EUW' };
}

function getWinRateToneClass(enemyWinRate: number | null): string {
  if (enemyWinRate === null) return 'text-slate-400 dark:text-slate-500';
  if (enemyWinRate >= 55) return 'text-rose-600 dark:text-rose-400 font-semibold';
  if (enemyWinRate <= 45) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
  return 'text-slate-800 dark:text-slate-200 font-semibold';
}

function computeDDragonMatchupNote(
  selfChamp: ChampionSummary | undefined,
  enemyChamp: ChampionSummary | undefined,
): { verdict: 'Favorable' | 'Équilibré' | 'Difficile'; reason: string } {
  if (!selfChamp || !enemyChamp) {
    return { verdict: 'Équilibré', reason: 'Profils standards' };
  }
  const selfP = classifyChampionProfile(selfChamp);
  const enemyP = classifyChampionProfile(enemyChamp);

  let selfAdvantage = 0;
  const reasons: string[] = [];

  if (enemyP.burstScore >= 75 && selfP.tankinessScore < 45) {
    selfAdvantage -= 1;
    reasons.push('Burst ennemi élevé');
  }
  if (selfP.tankinessScore >= 68 && enemyP.burstScore >= 75) {
    selfAdvantage += 1;
    reasons.push('Vous encaissez son burst');
  }
  if (enemyP.sustainScore >= 70 && selfP.burstScore < 65) {
    selfAdvantage -= 1;
    reasons.push('Forte régénération adverse');
  }
  if (selfP.ccScore >= 70 && enemyChamp.tags.includes('Assassin')) {
    selfAdvantage += 1;
    reasons.push('CC fiable contre mobilité');
  }
  if (selfChamp.tags.includes('Marksman') && enemyP.tankinessScore >= 70 && enemyP.ccScore < 70) {
    selfAdvantage += 1;
    reasons.push('DPS soutenu vs Frontline');
  }
  if (selfP.burstScore >= 75 && enemyChamp.tags.includes('Marksman')) {
    selfAdvantage += 1;
    reasons.push('Pression létale sur carry');
  }

  if (reasons.length === 0) {
    reasons.push(`${enemyP.primaryDamage} · ${enemyP.archetype || 'Standard'}`);
  }

  const verdict =
    selfAdvantage > 0 ? 'Favorable' : selfAdvantage < 0 ? 'Difficile' : 'Équilibré';
  return { verdict, reason: reasons[0] };
}

export function LiveLaneMatchupTable({
  riotId,
  region,
  playerChampionName,
  role,
  enemyPlayers,
  spectatorParticipants = [],
  lobbyScoutMap = {},
  champions,
  matches = [],
}: LiveLaneMatchupTableProps) {
  const targetLane = ROLE_TO_MATCH_LANE[role] || 'MIDDLE';
  const targetLaneLabel = LANE_LABEL_FR[targetLane] || role;

  const [apiData, setApiData] = useState<LaneMatchupWinRateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const selfDisplay = useMemo(
    () => resolveChampionDisplay(champions, playerChampionName),
    [champions, playerChampionName],
  );

  // Associer chaque adversaire Live avec son éventuel PUUID Spectator-V5 & ses stats Scout
  const enrichedEnemies = useMemo(() => {
    return enemyPlayers.map((enemy) => {
      const champResolved = resolveChampionDisplay(champions, enemy.championName);
      const champKeyNum = Number(champResolved.champion?.key || 0);
      const enemyTagName = (enemy.riotId || '').split('#')[0].trim().toLowerCase();
      const specMatch = spectatorParticipants.find(
        (sp) =>
          (champKeyNum > 0 && sp.championId === champKeyNum) ||
          (enemyTagName && sp.riotId && sp.riotId.toLowerCase().startsWith(enemyTagName)),
      );
      const puuid = specMatch?.puuid || undefined;
      const scoutEntry =
        (puuid && lobbyScoutMap[puuid]) ||
        Object.values(lobbyScoutMap).find(
          (ls) =>
            (champKeyNum > 0 && ls.championId === champKeyNum) ||
            (enemyTagName && ls.riotId?.toLowerCase().startsWith(enemyTagName)),
        );
      return {
        championName: enemy.championName,
        position: enemy.position,
        puuid,
        championId: champKeyNum || undefined,
        scoutEntry,
      };
    });
  }, [enemyPlayers, champions, spectatorParticipants, lobbyScoutMap]);

  const enemyRequestKey = useMemo(
    () =>
      enrichedEnemies
        .map((e) => `${normChampKey(e.championName)}:${normLane(e.position)}:${e.puuid || ''}`)
        .join('|'),
    [enrichedEnemies],
  );

  const fetchLaneMatchups = useCallback(async () => {
    if (!playerChampionName || enrichedEnemies.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { gameName, tagLine } = parseRiotIdParts(riotId);
      const res = await fetch('/api/riot/lane-matchups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName,
          tagLine,
          region,
          playerChampion: playerChampionName,
          targetLane,
          enemies: enrichedEnemies.map((e) => ({
            championName: e.championName,
            position: e.position,
            puuid: e.puuid,
            championId: e.championId,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Impossible de charger les taux de victoire Riot.');
      }
      setApiData(json as LaneMatchupWinRateResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur Riot API.');
    } finally {
      setLoading(false);
    }
  }, [riotId, region, playerChampionName, targetLane, enemyRequestKey]);

  useEffect(() => {
    void fetchLaneMatchups();
  }, [fetchLaneMatchups, refreshNonce]);

  // Baseline instantanée depuis les matchs Match-V5 déjà synchronisés dans le profil client
  const localRows = useMemo<LaneMatchupWinRateRow[]>(() => {
    const playerKey = normChampKey(playerChampionName);
    return enrichedEnemies.map((enemy) => {
      const enemyKey = normChampKey(enemy.championName);
      const enemyLane = normLane(enemy.position);
      const isDirectLaneOpponent = Boolean(enemyLane && enemyLane === targetLane);

      let laneH2HGames = 0;
      let laneH2HEnemyWins = 0;
      let overallH2HGames = 0;
      let overallH2HEnemyWins = 0;
      let enemyChampInLaneGames = 0;
      let enemyChampInLaneWins = 0;

      for (const m of matches) {
        const parts = m.participants || [];
        if (parts.length === 0) continue;

        const enemyParts = parts.filter((p) => normChampKey(p.championName) === enemyKey);
        const playerParts = parts.filter((p) => normChampKey(p.championName) === playerKey);

        for (const ep of enemyParts) {
          if (normLane(ep.teamPosition) === targetLane) {
            enemyChampInLaneGames += 1;
            if (ep.win) enemyChampInLaneWins += 1;
          }
        }

        for (const pp of playerParts) {
          const opp = enemyParts.find((ep) => ep.teamId !== pp.teamId);
          if (!opp) continue;
          overallH2HGames += 1;
          if (opp.win) overallH2HEnemyWins += 1;
          if (normLane(pp.teamPosition) === targetLane && normLane(opp.teamPosition) === targetLane) {
            laneH2HGames += 1;
            if (opp.win) laneH2HEnemyWins += 1;
          }
        }
      }

      const mainRank = enemy.scoutEntry?.soloRank || enemy.scoutEntry?.flexRank || null;
      const rankedGames = mainRank ? mainRank.wins + mainRank.losses : 0;

      return {
        championName: enemy.championName,
        enemyPosition: enemyLane || enemy.position || '-',
        isDirectLaneOpponent,
        laneH2HGames,
        laneH2HEnemyWins,
        laneH2HEnemyWinRate:
          laneH2HGames > 0 ? Math.round((laneH2HEnemyWins / laneH2HGames) * 100) : null,
        overallH2HGames,
        overallH2HEnemyWins,
        overallH2HEnemyWinRate:
          overallH2HGames > 0 ? Math.round((overallH2HEnemyWins / overallH2HGames) * 100) : null,
        enemyChampInLaneGames,
        enemyChampInLaneWins,
        enemyChampInLaneWinRate:
          enemyChampInLaneGames > 0
            ? Math.round((enemyChampInLaneWins / enemyChampInLaneGames) * 100)
            : null,
        enemyPlayerRankedWinRate:
          rankedGames > 0 && mainRank ? Math.round((mainRank.wins / rankedGames) * 100) : null,
        enemyPlayerRankedGames: rankedGames,
        enemyPlayerRankLabel: mainRank ? `${mainRank.tier} ${mainRank.rank}`.trim() : null,
      };
    });
  }, [enrichedEnemies, matches, playerChampionName, targetLane]);

  // Fusionner réponse Riot API backend + fallback client / lobbyScoutMap
  const mergedRows = useMemo(() => {
    const apiRowsByChamp = new Map<string, LaneMatchupWinRateRow>();
    if (apiData?.rows && normLane(apiData.targetLane) === targetLane) {
      for (const r of apiData.rows) {
        apiRowsByChamp.set(normChampKey(r.championName), r);
      }
    }

    const combined = localRows.map((localRow) => {
      const apiRow = apiRowsByChamp.get(normChampKey(localRow.championName));
      if (!apiRow) return localRow;

      return {
        ...apiRow,
        laneH2HGames: apiRow.laneH2HGames >= localRow.laneH2HGames ? apiRow.laneH2HGames : localRow.laneH2HGames,
        laneH2HEnemyWins:
          apiRow.laneH2HGames >= localRow.laneH2HGames ? apiRow.laneH2HEnemyWins : localRow.laneH2HEnemyWins,
        laneH2HEnemyWinRate:
          apiRow.laneH2HGames >= localRow.laneH2HGames
            ? apiRow.laneH2HEnemyWinRate
            : localRow.laneH2HEnemyWinRate,
        overallH2HGames:
          apiRow.overallH2HGames >= localRow.overallH2HGames
            ? apiRow.overallH2HGames
            : localRow.overallH2HGames,
        overallH2HEnemyWins:
          apiRow.overallH2HGames >= localRow.overallH2HGames
            ? apiRow.overallH2HEnemyWins
            : localRow.overallH2HEnemyWins,
        overallH2HEnemyWinRate:
          apiRow.overallH2HGames >= localRow.overallH2HGames
            ? apiRow.overallH2HEnemyWinRate
            : localRow.overallH2HEnemyWinRate,
        enemyChampInLaneGames:
          apiRow.enemyChampInLaneGames >= localRow.enemyChampInLaneGames
            ? apiRow.enemyChampInLaneGames
            : localRow.enemyChampInLaneGames,
        enemyChampInLaneWins:
          apiRow.enemyChampInLaneGames >= localRow.enemyChampInLaneGames
            ? apiRow.enemyChampInLaneWins
            : localRow.enemyChampInLaneWins,
        enemyChampInLaneWinRate:
          apiRow.enemyChampInLaneGames >= localRow.enemyChampInLaneGames
            ? apiRow.enemyChampInLaneWinRate
            : localRow.enemyChampInLaneWinRate,
        enemyPlayerRankedWinRate:
          apiRow.enemyPlayerRankedWinRate ?? localRow.enemyPlayerRankedWinRate,
        enemyPlayerRankedGames:
          apiRow.enemyPlayerRankedGames > 0
            ? apiRow.enemyPlayerRankedGames
            : localRow.enemyPlayerRankedGames,
        enemyPlayerRankLabel: apiRow.enemyPlayerRankLabel ?? localRow.enemyPlayerRankLabel,
      };
    });

    combined.sort((a, b) => {
      if (a.isDirectLaneOpponent !== b.isDirectLaneOpponent) {
        return a.isDirectLaneOpponent ? -1 : 1;
      }
      if (b.laneH2HGames !== a.laneH2HGames) return b.laneH2HGames - a.laneH2HGames;
      return b.enemyChampInLaneGames - a.enemyChampInLaneGames;
    });

    return combined;
  }, [apiData, localRows, targetLane]);

  if (enemyPlayers.length === 0) return null;

  const scannedCount = Math.max(apiData?.scannedMatchesCount || 0, matches.length);

  return (
    <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Comparatif Win Rate des ennemis contre {selfDisplay.displayName} ({targetLaneLabel})
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Données Riot Match-V5 ({scannedCount} partie{scannedCount > 1 ? 's' : ''} analysée
            {scannedCount > 1 ? 's' : ''}) & League-V4 · Voie actuelle :{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {targetLaneLabel}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshNonce((n) => n + 1)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyse Riot…' : 'Actualiser Riot'}
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-2 pr-3 font-medium">Champion ennemi</th>
              <th className="py-2 px-3 font-medium">WR Ennemi vs Vous ({targetLaneLabel})</th>
              <th className="py-2 px-3 font-medium">WR Champion en {targetLaneLabel}</th>
              <th className="py-2 px-3 font-medium">WR Joueur (League-V4)</th>
              <th className="py-2 pl-3 font-medium text-right">Lecture Matchup</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
            {mergedRows.map((row) => {
              const enemyDisplay = resolveChampionDisplay(champions, row.championName);
              const laneLabel = LANE_LABEL_FR[row.enemyPosition] || row.enemyPosition || '—';
              const ddragonNote = computeDDragonMatchupNote(
                selfDisplay.champion ?? undefined,
                enemyDisplay.champion ?? undefined,
              );

              const hasLaneH2H = row.laneH2HGames > 0 && row.laneH2HEnemyWinRate !== null;
              const hasOverallH2H =
                !hasLaneH2H && row.overallH2HGames > 0 && row.overallH2HEnemyWinRate !== null;

              return (
                <tr
                  key={row.championName}
                  className={
                    row.isDirectLaneOpponent
                      ? 'bg-sky-50/60 dark:bg-sky-950/20'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                  }
                >
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <SafeGameIcon
                        src={enemyDisplay.imageUrl}
                        alt={enemyDisplay.displayName}
                        fallbackLabel={enemyDisplay.displayName}
                        sizeClass="w-7 h-7"
                        className="rounded-md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {enemyDisplay.displayName}
                          </span>
                          {row.isDirectLaneOpponent && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                              Vis-à-vis
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Voie : {laneLabel}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    {hasLaneH2H ? (
                      <div>
                        <span className={getWinRateToneClass(row.laneH2HEnemyWinRate)}>
                          {row.laneH2HEnemyWinRate}%
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                          ({row.laneH2HEnemyWins}V / {row.laneH2HGames}P en {targetLaneLabel})
                        </span>
                      </div>
                    ) : hasOverallH2H ? (
                      <div>
                        <span className={getWinRateToneClass(row.overallH2HEnemyWinRate)}>
                          {row.overallH2HEnemyWinRate}%
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                          ({row.overallH2HEnemyWins}V / {row.overallH2HGames}P · toutes voies)
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-sans">
                        0 duel Match-V5
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    {row.enemyChampInLaneWinRate !== null ? (
                      <div>
                        <span className={getWinRateToneClass(row.enemyChampInLaneWinRate)}>
                          {row.enemyChampInLaneWinRate}%
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                          ({row.enemyChampInLaneGames}P)
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-sans">
                        —
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 font-mono tabular-nums">
                    {row.enemyPlayerRankedWinRate !== null ? (
                      <div>
                        <span className={getWinRateToneClass(row.enemyPlayerRankedWinRate)}>
                          {row.enemyPlayerRankedWinRate}%
                        </span>
                        <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                          {row.enemyPlayerRankLabel
                            ? `· ${row.enemyPlayerRankLabel} (${row.enemyPlayerRankedGames}P)`
                            : `(${row.enemyPlayerRankedGames}P)`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-sans">
                        Non classé / hors Spectator
                      </span>
                    )}
                  </td>

                  <td className="py-2.5 pl-3 text-right">
                    <div
                      className={`font-semibold ${
                        ddragonNote.verdict === 'Favorable'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ddragonNote.verdict === 'Difficile'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {ddragonNote.verdict}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {ddragonNote.reason}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {apiData?.note && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">{apiData.note}</p>
      )}
    </div>
  );
}
