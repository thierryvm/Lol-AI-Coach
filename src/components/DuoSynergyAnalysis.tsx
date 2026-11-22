import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';
import type { ChampionCareerStat, ChampionSummary, MatchParticipantSummary, MatchRecord } from '../engines/types.ts';
import { formatChampionDisplayName, resolveChampionDisplay } from '../utils/championDisplay.ts';

interface DuoSynergyAnalysisProps {
  matches: MatchRecord[];
  championStats?: ChampionCareerStat[];
  champions: ChampionSummary[];
  getChampIcon: (championName: string) => string | undefined;
  onSelectDuoForBuild: (championName: string, duoChampionName: string) => void;
}

interface MainChampionBaseline {
  championName: string;
  displayName: string;
  games: number;
  wins: number;
  winRate: number;
  kdaRatio: number;
}

interface DuoSynergyPair {
  key: string;
  myChampion: string;
  myChampionDisplay: string;
  allyChampion: string;
  allyChampionDisplay: string;
  pairLabel: string;
  shortPairLabel: string;
  games: number;
  wins: number;
  losses: number;
  duoWinRate: number;
  myBaselineWinRate: number;
  myBaselineGames: number;
  synergyDelta: number;
  avgKdaWithAlly: number;
  allyMainRole: string;
  recurringSummoner: { riotId: string; games: number } | null;
  synergyReason: string;
}

interface SynergyChartTooltipPayload {
  payload?: DuoSynergyPair;
}

interface SynergyChartTooltipProps {
  active?: boolean;
  payload?: SynergyChartTooltipPayload[];
  getChampIcon: (championName: string) => string | undefined;
}

const ROLE_LABELS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungle',
  MIDDLE: 'Mid',
  MID: 'Mid',
  BOTTOM: 'ADC',
  ADC: 'ADC',
  UTILITY: 'Support',
  SUPPORT: 'Support',
};

function formatRoleLabel(pos?: string): string {
  if (!pos) return 'Allié';
  const upper = pos.toUpperCase();
  return ROLE_LABELS[upper] || 'Allié';
}

function isSamePlayer(part: MatchParticipantSummary, player: MatchParticipantSummary): boolean {
  if (part.puuid && player.puuid) {
    return part.puuid === player.puuid;
  }
  return (
    part.championName.toLowerCase() === player.championName.toLowerCase() &&
    part.riotIdGameName.toLowerCase() === player.riotIdGameName.toLowerCase()
  );
}

function describeLoLSynergy(
  myChampName: string,
  allyChampName: string,
  championLookup: Map<string, ChampionSummary>,
): string {
  const myChamp = championLookup.get(myChampName.toLowerCase());
  const allyChamp = championLookup.get(allyChampName.toLowerCase());
  const myTags = new Set(myChamp?.tags || []);
  const allyTags = new Set(allyChamp?.tags || []);

  if (
    (myTags.has('Support') && allyTags.has('Marksman')) ||
    (myTags.has('Marksman') && allyTags.has('Support'))
  ) {
    return 'Duo Botlane complémentaire (protection + DPS soutenu)';
  }
  if (
    (myTags.has('Tank') || myTags.has('Fighter')) &&
    (allyTags.has('Mage') || allyTags.has('Marksman'))
  ) {
    return 'Frontline & engage pour sécuriser le DPS à distance';
  }
  if (
    (myTags.has('Mage') || myTags.has('Marksman')) &&
    (allyTags.has('Tank') || allyTags.has('Fighter'))
  ) {
    return 'Espace créé par la frontline pour vos sorts et attaques';
  }
  if (
    (myTags.has('Assassin') && allyTags.has('Tank')) ||
    (myTags.has('Tank') && allyTags.has('Assassin'))
  ) {
    return 'Ouverture de combat + exécution rapide des cibles clés';
  }
  if (myTags.has('Mage') && allyTags.has('Fighter')) {
    return 'Pression mixte AP/AD difficile à contrer en équipement';
  }
  if (myTags.has('Fighter') && allyTags.has('Mage')) {
    return 'Dégâts mixtes AD/AP et contrôle de zone en escarmouche';
  }
  if (myTags.has('Support') && (allyTags.has('Fighter') || allyTags.has('Assassin'))) {
    return 'Accélération d’escarmouche et suivi d’engagement agressif';
  }
  return 'Bonne complémentarité de tempo et d’impact en teamfight';
}

function SynergyTooltip({ active, payload, getChampIcon }: SynergyChartTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const isBoost = row.synergyDelta >= 0;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D121C] px-3.5 py-3 shadow-lg min-w-[240px] space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center -space-x-2 shrink-0">
          <SafeGameIcon
            src={getChampIcon(row.myChampion)}
            alt={row.myChampionDisplay}
            fallbackLabel={row.myChampionDisplay}
            sizeClass="w-7 h-7 ring-2 ring-white dark:ring-[#0D121C]"
          />
          <SafeGameIcon
            src={getChampIcon(row.allyChampion)}
            alt={row.allyChampionDisplay}
            fallbackLabel={row.allyChampionDisplay}
            sizeClass="w-7 h-7 ring-2 ring-white dark:ring-[#0D121C]"
          />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
            {row.myChampionDisplay} + {row.allyChampionDisplay}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {row.games} partie{row.games > 1 ? 's' : ''} ({row.wins}V - {row.losses}D) · {row.allyMainRole}
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Winrate avec {row.allyChampionDisplay}</span>
          <span
            className={`font-mono tabular-nums font-bold ${
              row.duoWinRate >= 50
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {row.duoWinRate}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Winrate global ({row.myChampionDisplay})</span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {row.myBaselineWinRate}% ({row.myBaselineGames}p)
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Écart synergie</span>
          <span
            className={`font-mono tabular-nums font-bold ${
              isBoost ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {row.synergyDelta > 0 ? '+' : ''}
            {row.synergyDelta} pts
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Votre KDA dans ce duo</span>
          <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
            {row.avgKdaWithAlly.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DuoSynergyAnalysis({
  matches,
  championStats,
  champions,
  getChampIcon,
  onSelectDuoForBuild,
}: DuoSynergyAnalysisProps) {
  const [selectedMainChamp, setSelectedMainChamp] = useState<string>('ALL');
  const [minGamesFilter, setMinGamesFilter] = useState<1 | 2>(2);

  const championLookup = useMemo(() => {
    const map = new Map<string, ChampionSummary>();
    for (const c of champions) {
      map.set(c.id.toLowerCase(), c);
      map.set(c.name.toLowerCase(), c);
    }
    return map;
  }, [champions]);

  const {
    topMains,
    allPairs,
    hasMultiGamePairs,
    topRecurringPartner,
    bestAllyRoleStat,
  } = useMemo(() => {
    // 1. Calcul des stats globales par champion joué par l'utilisateur
    const mainAcc = new Map<
      string,
      { games: number; wins: number; kills: number; deaths: number; assists: number }
    >();
    for (const m of matches) {
      const name = m.player.championName;
      const cur = mainAcc.get(name) || { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      cur.games += 1;
      if (m.player.win) cur.wins += 1;
      cur.kills += m.player.kills;
      cur.deaths += m.player.deaths;
      cur.assists += m.player.assists;
      mainAcc.set(name, cur);
    }

    const mainsList: MainChampionBaseline[] =
      championStats && championStats.length > 0
        ? championStats.map((cs) => ({
            championName: cs.championName,
            displayName: formatChampionDisplayName(champions, cs.championName),
            games: cs.games,
            wins: cs.wins,
            winRate: cs.winRate,
            kdaRatio: cs.kdaRatio,
          }))
        : Array.from(mainAcc.entries())
            .map(([championName, s]) => ({
              championName,
              displayName: formatChampionDisplayName(champions, championName),
              games: s.games,
              wins: s.wins,
              winRate: Math.round((s.wins / s.games) * 100),
              kdaRatio: Number(((s.kills + s.assists) / Math.max(1, s.deaths)).toFixed(2)),
            }))
            .sort((a, b) => b.games - a.games || b.winRate - a.winRate);

    const baselineByChamp = new Map<string, MainChampionBaseline>();
    for (const item of mainsList) {
      baselineByChamp.set(item.championName, item);
    }

    // 2. Agrégation des duos (Mon champion + Champion allié) + détection des partenaires récurrents + rôle allié
    const pairAcc = new Map<
      string,
      {
        myChampion: string;
        allyChampion: string;
        games: number;
        wins: number;
        myKills: number;
        myDeaths: number;
        myAssists: number;
        roleCounts: Map<string, number>;
        summonerCounts: Map<string, number>;
      }
    >();

    const allyRoleAcc = new Map<string, { roleLabel: string; games: number; wins: number }>();
    const summonerGlobalAcc = new Map<
      string,
      { riotId: string; games: number; wins: number; lastChampion: string }
    >();

    for (const m of matches) {
      const allies = (m.participants || []).filter(
        (part) => part.teamId === m.player.teamId && !isSamePlayer(part, m.player),
      );
      if (allies.length === 0) continue;

      const seenAllyChampsInMatch = new Set<string>();
      const seenAllySummonersInMatch = new Set<string>();

      for (const ally of allies) {
        const allyChamp = ally.championName;
        if (!allyChamp || seenAllyChampsInMatch.has(allyChamp)) continue;
        seenAllyChampsInMatch.add(allyChamp);

        const roleLabel = formatRoleLabel(ally.teamPosition);
        const rolePrev = allyRoleAcc.get(roleLabel) || { roleLabel, games: 0, wins: 0 };
        rolePrev.games += 1;
        if (m.player.win) rolePrev.wins += 1;
        allyRoleAcc.set(roleLabel, rolePrev);

        const fullRiotId =
          ally.riotIdGameName && ally.riotIdGameName.trim()
            ? ally.riotIdTagline
              ? `${ally.riotIdGameName}#${ally.riotIdTagline}`
              : ally.riotIdGameName
            : '';

        if (fullRiotId && !seenAllySummonersInMatch.has(fullRiotId)) {
          seenAllySummonersInMatch.add(fullRiotId);
          const sPrev = summonerGlobalAcc.get(fullRiotId) || {
            riotId: fullRiotId,
            games: 0,
            wins: 0,
            lastChampion: allyChamp,
          };
          sPrev.games += 1;
          if (m.player.win) sPrev.wins += 1;
          sPrev.lastChampion = allyChamp;
          summonerGlobalAcc.set(fullRiotId, sPrev);
        }

        const pairKey = `${m.player.championName}::${allyChamp}`;
        const prev = pairAcc.get(pairKey) || {
          myChampion: m.player.championName,
          allyChampion: allyChamp,
          games: 0,
          wins: 0,
          myKills: 0,
          myDeaths: 0,
          myAssists: 0,
          roleCounts: new Map<string, number>(),
          summonerCounts: new Map<string, number>(),
        };

        prev.games += 1;
        if (m.player.win) prev.wins += 1;
        prev.myKills += m.player.kills;
        prev.myDeaths += m.player.deaths;
        prev.myAssists += m.player.assists;
        prev.roleCounts.set(roleLabel, (prev.roleCounts.get(roleLabel) || 0) + 1);
        if (fullRiotId) {
          prev.summonerCounts.set(fullRiotId, (prev.summonerCounts.get(fullRiotId) || 0) + 1);
        }

        pairAcc.set(pairKey, prev);
      }
    }

    const pairs: DuoSynergyPair[] = Array.from(pairAcc.entries()).map(([key, p]) => {
      const baseline = baselineByChamp.get(p.myChampion);
      const myBaselineWinRate = baseline?.winRate ?? 50;
      const myBaselineGames = baseline?.games ?? p.games;
      const duoWinRate = Math.round((p.wins / p.games) * 100);
      const synergyDelta = duoWinRate - myBaselineWinRate;
      const avgKdaWithAlly = Number(
        ((p.myKills + p.myAssists) / Math.max(1, p.myDeaths)).toFixed(2),
      );

      let allyMainRole = 'Allié';
      let topRoleCount = 0;
      for (const [rLabel, count] of p.roleCounts.entries()) {
        if (count > topRoleCount) {
          topRoleCount = count;
          allyMainRole = rLabel;
        }
      }

      let recurringSummoner: { riotId: string; games: number } | null = null;
      for (const [sName, count] of p.summonerCounts.entries()) {
        if (count >= 2 && (!recurringSummoner || count > recurringSummoner.games)) {
          recurringSummoner = { riotId: sName, games: count };
        }
      }

      const myDisplay = formatChampionDisplayName(champions, p.myChampion);
      const allyDisplay = formatChampionDisplayName(champions, p.allyChampion);
      const shortMy = myDisplay.length > 7 ? `${myDisplay.slice(0, 6)}…` : myDisplay;
      const shortAlly = allyDisplay.length > 7 ? `${allyDisplay.slice(0, 6)}…` : allyDisplay;

      return {
        key,
        myChampion: p.myChampion,
        myChampionDisplay: myDisplay,
        allyChampion: p.allyChampion,
        allyChampionDisplay: allyDisplay,
        pairLabel: `${myDisplay} + ${allyDisplay}`,
        shortPairLabel: `${shortMy} + ${shortAlly}`,
        games: p.games,
        wins: p.wins,
        losses: p.games - p.wins,
        duoWinRate,
        myBaselineWinRate,
        myBaselineGames,
        synergyDelta,
        avgKdaWithAlly,
        allyMainRole,
        recurringSummoner,
        synergyReason: describeLoLSynergy(p.myChampion, p.allyChampion, championLookup),
      };
    });

    const multiGameExists = pairs.some((p) => p.games >= 2);

    const topRecurring = Array.from(summonerGlobalAcc.values())
      .filter((s) => s.games >= 2)
      .sort(
        (a, b) =>
          Math.round((b.wins / b.games) * 100) - Math.round((a.wins / a.games) * 100) ||
          b.games - a.games,
      )[0];

    const bestRole = Array.from(allyRoleAcc.values())
      .filter((r) => r.roleLabel !== 'Allié')
      .sort(
        (a, b) =>
          Math.round((b.wins / b.games) * 100) - Math.round((a.wins / a.games) * 100) ||
          b.games - a.games,
      )[0];

    return {
      topMains: mainsList.slice(0, 6),
      allPairs: pairs,
      hasMultiGamePairs: multiGameExists,
      topRecurringPartner: topRecurring
        ? {
            ...topRecurring,
            winRate: Math.round((topRecurring.wins / topRecurring.games) * 100),
          }
        : null,
      bestAllyRoleStat: bestRole
        ? {
            ...bestRole,
            winRate: Math.round((bestRole.wins / bestRole.games) * 100),
          }
        : null,
    };
  }, [matches, championStats, championLookup, champions]);

  // Si aucune paire n'a 2+ parties dans l'historique actuel, basculer automatiquement sur 1+ partie
  useEffect(() => {
    if (!hasMultiGamePairs && minGamesFilter === 2) {
      setMinGamesFilter(1);
    }
  }, [hasMultiGamePairs, minGamesFilter]);

  // Si le champion sélectionné n'existe plus (changement de compte), revenir sur ALL
  useEffect(() => {
    if (
      selectedMainChamp !== 'ALL' &&
      !topMains.some((m) => m.championName === selectedMainChamp)
    ) {
      setSelectedMainChamp('ALL');
    }
  }, [topMains, selectedMainChamp]);

  const effectiveMinGames = hasMultiGamePairs ? minGamesFilter : 1;

  const displayedPairs = useMemo(() => {
    const scorePair = (a: DuoSynergyPair, b: DuoSynergyPair) =>
      b.duoWinRate - a.duoWinRate ||
      b.games - a.games ||
      b.synergyDelta - a.synergyDelta ||
      b.avgKdaWithAlly - a.avgKdaWithAlly;

    let filtered = allPairs.filter((p) => p.games >= effectiveMinGames);

    // Fallback de sécurité si un filtre de champion précis n'a pas de duo >= 2 parties
    if (selectedMainChamp !== 'ALL') {
      const champFiltered = filtered.filter((p) => p.myChampion === selectedMainChamp);
      if (champFiltered.length > 0) {
        return [...champFiltered].sort(scorePair).slice(0, 6);
      }
      const fallbackChampAll = allPairs.filter((p) => p.myChampion === selectedMainChamp);
      return [...fallbackChampAll].sort(scorePair).slice(0, 6);
    }

    // En vue globale : comparer les champions les plus joués avec leur meilleur duo allié respectif
    const topMainNames = new Set(topMains.map((m) => m.championName));
    const pairsForTopMains = filtered.filter((p) => topMainNames.has(p.myChampion));
    const pool = pairsForTopMains.length > 0 ? pairsForTopMains : filtered;

    // Prendre d'abord le meilleur duo pour chacun des champions les plus joués afin d'offrir une comparaison équilibrée
    const bestPerMain: DuoSynergyPair[] = [];
    const seenKeys = new Set<string>();
    for (const main of topMains) {
      const candidates = pool
        .filter((p) => p.myChampion === main.championName)
        .sort(scorePair);
      if (candidates[0]) {
        bestPerMain.push(candidates[0]);
        seenKeys.add(candidates[0].key);
      }
    }

    // Compléter jusqu'à 6 entrées avec les meilleurs autres duos du pool
    const extras = [...pool]
      .filter((p) => !seenKeys.has(p.key))
      .sort(scorePair);

    return [...bestPerMain, ...extras].slice(0, 6);
  }, [allPairs, effectiveMinGames, selectedMainChamp, topMains]);

  const bestMainChampion = useMemo(() => {
    if (topMains.length === 0) return null;
    return [...topMains]
      .slice(0, 3)
      .sort((a, b) => b.winRate - a.winRate || b.games - a.games)[0];
  }, [topMains]);

  const bestSynergyOverall = useMemo(() => {
    if (displayedPairs.length === 0) return null;
    return [...displayedPairs].sort(
      (a, b) => b.duoWinRate - a.duoWinRate || b.synergyDelta - a.synergyDelta || b.games - a.games,
    )[0];
  }, [displayedPairs]);

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
            <span>Analyse de synergie — Vos Mains vs Meilleurs Duos</span>
            <SectionInfoTooltip
              title="Analyse de synergie Duo"
              description="Mesure avec quels champions alliés (ou partenaires récurrents) vous gagnez nettement plus souvent par rapport à votre winrate habituel."
              usageTip="Cliquez sur « Optimiser duo » pour ouvrir directement le duo dans Builds & Match-ups."
            />
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Compare le taux de victoire global de vos champions les plus joués avec les champions alliés qui vous offrent le meilleur winrate en équipe ({matches.length} parties analysées).
          </p>
        </div>

        {allPairs.length > 0 && (
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 self-start lg:self-auto shrink-0"
            role="group"
            aria-label="Seuil de parties en duo"
          >
            <button
              type="button"
              disabled={!hasMultiGamePairs}
              onClick={() => setMinGamesFilter(2)}
              title={
                hasMultiGamePairs
                  ? 'Afficher uniquement les duos joués au moins 2 fois'
                  : 'Aucune paire champion+allié avec 2+ parties pour le moment'
              }
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                effectiveMinGames === 2
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Duos confirmés (2+)
            </button>
            <button
              type="button"
              onClick={() => setMinGamesFilter(1)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                effectiveMinGames === 1
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Toutes (1+ partie)
            </button>
          </div>
        )}
      </div>

      {/* Sélecteur des champions les plus joués */}
      {topMains.length > 0 && allPairs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedMainChamp('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              selectedMainChamp === 'ALL'
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            Vue globale (Top mains)
          </button>

          {topMains.map((main) => {
            const active = selectedMainChamp === main.championName;
            const mainDisp = resolveChampionDisplay(champions, main.championName);
            return (
              <button
                key={main.championName}
                type="button"
                onClick={() => setSelectedMainChamp(main.championName)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <SafeGameIcon
                  src={mainDisp.imageUrl || getChampIcon(main.championName)}
                  alt={main.displayName}
                  fallbackLabel={main.displayName}
                  sizeClass="w-4 h-4"
                />
                <span>{main.displayName}</span>
                <span className="font-mono tabular-nums text-[11px] text-slate-400">
                  {main.games}p · {main.winRate}%
                </span>
              </button>
            );
          })}
        </div>
      )}

      {displayedPairs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
          Aucune composition d’équipe détaillée disponible dans votre historique actuel. Synchronisez vos parties Riot pour activer l’analyse de synergie duo.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Colonne gauche : Graphique comparatif Recharts (Global vs Duo) */}
            <div className="xl:col-span-6 space-y-3 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {selectedMainChamp === 'ALL'
                    ? 'Winrate global de vos mains vs meilleur duo allié'
                    : `Winrate global sur ${formatChampionDisplayName(champions, selectedMainChamp)} vs vos meilleurs duos`}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-400/70 inline-block" aria-hidden="true" />
                    <span>Global main</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" aria-hidden="true" />
                    <span>Duo gagnant</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" aria-hidden="true" />
                    <span>Duo &lt; 50%</span>
                  </span>
                </div>
              </div>

              <div className="w-full h-[290px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={displayedPairs}
                    layout="vertical"
                    margin={{ top: 4, right: 18, left: 6, bottom: 4 }}
                    barGap={3}
                    barCategoryGap="22%"
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="rgba(148, 163, 184, 0.2)"
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      unit="%"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(148, 163, 184, 0.28)' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortPairLabel"
                      width={126}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine
                      x={50}
                      stroke="rgba(148, 163, 184, 0.55)"
                      strokeDasharray="4 4"
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                      content={<SynergyTooltip getChampIcon={getChampIcon} />}
                    />
                    <Bar
                      dataKey="myBaselineWinRate"
                      name="Winrate global du main"
                      barSize={10}
                      radius={[0, 4, 4, 0]}
                      fill="rgba(148, 163, 184, 0.65)"
                    />
                    <Bar
                      dataKey="duoWinRate"
                      name="Winrate en duo"
                      barSize={12}
                      radius={[0, 4, 4, 0]}
                    >
                      {displayedPairs.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.duoWinRate >= 50 ? '#10B981' : '#F43F5E'}
                          className="cursor-pointer transition-opacity hover:opacity-85"
                          onClick={() => onSelectDuoForBuild(entry.myChampion, entry.allyChampion)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Colonne droite : Liste comparative des synergies duo */}
            <div className="xl:col-span-6 space-y-2 min-w-0">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Meilleurs duos détectés dans votre historique
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
                {displayedPairs.map((pair, idx) => {
                  const isPositiveDelta = pair.synergyDelta >= 0;
                  return (
                    <div
                      key={pair.key}
                      className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <span className="text-[11px] font-mono tabular-nums text-slate-400 w-5 shrink-0">
                          0{idx + 1}
                        </span>
                        <div className="flex items-center -space-x-2 shrink-0">
                          <SafeGameIcon
                            src={getChampIcon(pair.myChampion)}
                            alt={pair.myChampionDisplay}
                            fallbackLabel={pair.myChampionDisplay}
                            sizeClass="w-8 h-8 ring-2 ring-white dark:ring-[#121722]"
                          />
                          <SafeGameIcon
                            src={getChampIcon(pair.allyChampion)}
                            alt={pair.allyChampionDisplay}
                            fallbackLabel={pair.allyChampionDisplay}
                            sizeClass="w-8 h-8 ring-2 ring-white dark:ring-[#121722]"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {pair.myChampionDisplay} + {pair.allyChampionDisplay}
                            <span className="font-normal text-slate-500 dark:text-slate-400">
                              {' '}
                              · {pair.allyMainRole}
                              {pair.recurringSummoner
                                ? ` · avec ${pair.recurringSummoner.riotId}`
                                : ''}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {pair.synergyReason}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 pl-8 sm:pl-0 shrink-0">
                        <div className="text-left sm:text-right">
                          <div className="text-xs font-mono tabular-nums">
                            <span
                              className={`font-bold ${
                                pair.duoWinRate >= 50
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {pair.duoWinRate}% WR
                            </span>
                            <span
                              className={`ml-1.5 text-[11px] font-semibold ${
                                isPositiveDelta
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              ({pair.synergyDelta > 0 ? '+' : ''}
                              {pair.synergyDelta} pts)
                            </span>
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {pair.games}p ({pair.wins}V-{pair.losses}D) · {pair.avgKdaWithAlly} KDA
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelectDuoForBuild(pair.myChampion, pair.allyChampion)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0"
                        >
                          <span>Optimiser duo</span>
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bandeau de synthèse comparative en pied de section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {bestMainChampion && (
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Main le plus performant (volume)
                </div>
                <div className="mt-0.5 font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                  {bestMainChampion.displayName} · {bestMainChampion.winRate}% WR ({bestMainChampion.games}p)
                </div>
              </div>
            )}

            {bestSynergyOverall && (
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Meilleure synergie duo mesurée
                </div>
                <div className="mt-0.5 font-semibold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  {bestSynergyOverall.myChampionDisplay} + {bestSynergyOverall.allyChampionDisplay} ·{' '}
                  {bestSynergyOverall.duoWinRate}% WR ({bestSynergyOverall.synergyDelta > 0 ? '+' : ''}
                  {bestSynergyOverall.synergyDelta} pts)
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {topRecurringPartner ? 'Partenaire récurrent détecté' : 'Rôle allié le plus rentable'}
              </div>
              <div className="mt-0.5 font-semibold text-slate-900 dark:text-white font-mono tabular-nums">
                {topRecurringPartner
                  ? `${topRecurringPartner.riotId} · ${topRecurringPartner.winRate}% WR (${topRecurringPartner.games}p)`
                  : bestAllyRoleStat
                    ? `Avec un ${bestAllyRoleStat.roleLabel} · ${bestAllyRoleStat.winRate}% WR (${bestAllyRoleStat.games}p)`
                    : 'Données insuffisantes'}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
