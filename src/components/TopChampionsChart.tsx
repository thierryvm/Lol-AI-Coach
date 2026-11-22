import { useMemo, useState } from 'react';
import { ArrowRight, BarChart3 } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';
import type { ChampionCareerStat, ChampionSummary, MatchRecord } from '../engines/types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';

type ChampionSortMode = 'games' | 'winRate' | 'kdaRatio';

interface ChampionChartRow extends ChampionCareerStat {
  displayName: string;
  imageUrl?: string;
  shortName: string;
  losses: number;
}

interface TopChampionsChartProps {
  championStats?: ChampionCareerStat[];
  matches: MatchRecord[];
  champions?: ChampionSummary[];
  getChampIcon: (championName: string) => string | undefined;
  onSelectChampion: (championName: string) => void;
}

interface CustomTooltipPayloadItem {
  payload?: ChampionChartRow;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  getChampIcon: (championName: string) => string | undefined;
}

function buildFallbackChampionStats(matches: MatchRecord[]): ChampionCareerStat[] {
  const acc = new Map<
    string,
    {
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      csPerMin: number;
      visionPerMin: number;
    }
  >();

  for (const m of matches) {
    const durMin = Math.max(1, m.gameDurationSec / 60);
    const visMin = m.player.visionScore / durMin;
    const name = m.player.championName;
    const prev = acc.get(name) || {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      csPerMin: 0,
      visionPerMin: 0,
    };
    prev.games += 1;
    if (m.player.win) prev.wins += 1;
    prev.kills += m.player.kills;
    prev.deaths += m.player.deaths;
    prev.assists += m.player.assists;
    prev.csPerMin += m.player.csPerMin;
    prev.visionPerMin += visMin;
    acc.set(name, prev);
  }

  return Array.from(acc.entries())
    .map(([championName, s]) => ({
      championName,
      games: s.games,
      wins: s.wins,
      winRate: Math.round((s.wins / s.games) * 100),
      avgKills: Number((s.kills / s.games).toFixed(1)),
      avgDeaths: Number((s.deaths / s.games).toFixed(1)),
      avgAssists: Number((s.assists / s.games).toFixed(1)),
      kdaRatio: Number(((s.kills + s.assists) / Math.max(1, s.deaths)).toFixed(2)),
      avgCsPerMin: Number((s.csPerMin / s.games).toFixed(2)),
      avgVisionPerMin: Number((s.visionPerMin / s.games).toFixed(2)),
    }))
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
}

function ChampionChartTooltip({ active, payload, getChampIcon }: CustomTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const isWinning = row.winRate >= 50;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D121C] px-3.5 py-3 shadow-lg min-w-[215px] space-y-2">
      <div className="flex items-center gap-2.5">
        <SafeGameIcon
          src={row.imageUrl || getChampIcon(row.championName)}
          alt={row.displayName}
          fallbackLabel={row.displayName}
          sizeClass="w-8 h-8"
        />
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
            {row.displayName}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {row.games} partie{row.games > 1 ? 's' : ''} · {row.wins}V - {row.losses}D
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Taux de victoire</span>
          <span
            className={`font-mono tabular-nums font-bold ${
              isWinning
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {row.winRate}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">Ratio KDA</span>
          <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
            {row.kdaRatio.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">K / D / A moyen</span>
          <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
            {row.avgKills} / {row.avgDeaths} / {row.avgAssists}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-500 dark:text-slate-400">CS &amp; Vision / min</span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {row.avgCsPerMin.toFixed(1)} · {row.avgVisionPerMin.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TopChampionsChart({
  championStats,
  matches,
  champions = [],
  getChampIcon,
  onSelectChampion,
}: TopChampionsChartProps) {
  const [sortBy, setSortBy] = useState<ChampionSortMode>('games');

  const resolvedStats = useMemo(() => {
    if (championStats && championStats.length > 0) return championStats;
    return buildFallbackChampionStats(matches);
  }, [championStats, matches]);

  const topPlayedRows: ChampionChartRow[] = useMemo(() => {
    const mostPlayed = [...resolvedStats]
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate || b.kdaRatio - a.kdaRatio)
      .slice(0, 8);

    const sorted = [...mostPlayed].sort((a, b) => {
      if (sortBy === 'winRate') {
        return b.winRate - a.winRate || b.games - a.games || b.kdaRatio - a.kdaRatio;
      }
      if (sortBy === 'kdaRatio') {
        return b.kdaRatio - a.kdaRatio || b.games - a.games || b.winRate - a.winRate;
      }
      return b.games - a.games || b.winRate - a.winRate || b.kdaRatio - a.kdaRatio;
    });

    return sorted.map((cs) => {
      const disp = resolveChampionDisplay(champions, cs.championName);
      return {
        ...cs,
        displayName: disp.displayName,
        imageUrl: disp.imageUrl,
        losses: Math.max(0, cs.games - cs.wins),
        shortName:
          disp.displayName.length > 11 ? `${disp.displayName.slice(0, 10)}…` : disp.displayName,
      };
    });
  }, [resolvedStats, sortBy, champions]);

  const maxKdaDomain = useMemo(() => {
    if (topPlayedRows.length === 0) return 6;
    const peak = Math.max(...topPlayedRows.map((r) => r.kdaRatio));
    return Math.max(4, Math.ceil(peak + 1));
  }, [topPlayedRows]);

  const totalGames = useMemo(
    () => resolvedStats.reduce((sum, item) => sum + item.games, 0),
    [resolvedStats],
  );

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
            <span>Champions les plus joués — Winrate &amp; KDA</span>
            <SectionInfoTooltip
              title="Champions les plus joués"
              description="Compare votre taux de victoire (barres vertes/rouges) et votre ratio KDA (courbe ambre) sur vos 8 champions les plus utilisés."
              usageTip="Repérez vos valeurs sûres (≥ 50% WR) et cliquez sur une barre ou « Build » pour optimiser un champion."
            />
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {topPlayedRows.length > 0 ? (
              <>
                Comparatif de vos{' '}
                <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                  {topPlayedRows.length}
                </span>{' '}
                champions principaux sur{' '}
                <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                  {totalGames}
                </span>{' '}
                parties analysées · Survolez une barre pour le détail ou cliquez pour préparer le build.
              </>
            ) : (
              'Synchronisez ou importez des parties pour visualiser votre taux de victoire et KDA par champion.'
            )}
          </p>
        </div>

        {topPlayedRows.length > 1 && (
          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 self-start lg:self-auto shrink-0"
            role="group"
            aria-label="Trier les champions"
          >
            {(
              [
                { id: 'games', label: 'Par parties' },
                { id: 'winRate', label: 'Par Winrate' },
                { id: 'kdaRatio', label: 'Par KDA' },
              ] as Array<{ id: ChampionSortMode; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortBy(opt.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  sortBy === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {topPlayedRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
          Aucune donnée de champion disponible pour le moment. Lancez une synchronisation Riot pour afficher le graphique.
        </div>
      ) : (
        <>
          {/* Légende sobre et lisible sans badges pilules */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" aria-hidden="true" />
              <span>Winrate ≥ 50%</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" aria-hidden="true" />
              <span>Winrate &lt; 50%</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-500 inline-block" aria-hidden="true" />
              <span>Ratio KDA (axe droit)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3.5 border-t border-dashed border-slate-400 inline-block"
                aria-hidden="true"
              />
              <span>Seuil 50% WR</span>
            </span>
          </div>

          <div className="w-full h-[290px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={topPlayedRows}
                margin={{ top: 10, right: 12, left: -6, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(148, 163, 184, 0.2)"
                />
                <XAxis
                  dataKey="shortName"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.28)' }}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  yAxisId="wr"
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <YAxis
                  yAxisId="kda"
                  orientation="right"
                  domain={[0, maxKdaDomain]}
                  tick={{ fill: '#d97706', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <ReferenceLine
                  yAxisId="wr"
                  y={50}
                  stroke="rgba(148, 163, 184, 0.55)"
                  strokeDasharray="4 4"
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                  content={<ChampionChartTooltip getChampIcon={getChampIcon} />}
                />
                <Bar
                  yAxisId="wr"
                  dataKey="winRate"
                  name="Winrate"
                  barSize={34}
                  radius={[6, 6, 0, 0]}
                >
                  {topPlayedRows.map((entry) => (
                    <Cell
                      key={entry.championName}
                      fill={entry.winRate >= 50 ? '#10B981' : '#F43F5E'}
                      className="cursor-pointer transition-opacity hover:opacity-85"
                      onClick={() => onSelectChampion(entry.championName)}
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="kda"
                  type="monotone"
                  dataKey="kdaRatio"
                  name="KDA"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: '#F59E0B', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Tableau récapitulatif tabulaire aligné (zéro cartes imbriquées) */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                  <th className="py-2 pr-3 text-left font-medium">Champion</th>
                  <th className="py-2 px-3 text-right font-medium">Parties</th>
                  <th className="py-2 px-3 text-right font-medium">Winrate</th>
                  <th className="py-2 px-3 text-right font-medium">KDA</th>
                  <th className="py-2 px-3 text-right font-medium hidden sm:table-cell">
                    Moy. K / D / A
                  </th>
                  <th className="py-2 px-3 text-right font-medium hidden md:table-cell">
                    CS / min
                  </th>
                  <th className="py-2 pl-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
                {topPlayedRows.map((row) => (
                  <tr
                    key={row.championName}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SafeGameIcon
                          src={row.imageUrl || getChampIcon(row.championName)}
                          alt={row.displayName}
                          fallbackLabel={row.displayName}
                          sizeClass="w-7 h-7"
                        />
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {row.displayName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      {row.games} ({row.wins}V-{row.losses}D)
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                        row.winRate >= 50
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.winRate}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                      {row.kdaRatio.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 hidden sm:table-cell">
                      {row.avgKills} / {row.avgDeaths} / {row.avgAssists}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 hidden md:table-cell">
                      {row.avgCsPerMin.toFixed(1)}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectChampion(row.championName)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0"
                      >
                        <span>Build</span>
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
