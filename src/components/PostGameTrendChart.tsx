import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import type { ChampionSummary, MatchRecord } from '../engines/types.ts';
import { formatChampionDisplayName, resolveChampionDisplay } from '../utils/championDisplay.ts';

type TrendFocusMetric = 'ALL' | 'KDA' | 'GPM' | 'VISION';
type TrendSampleSize = 5 | 10 | 15 | 20 | 'ALL';

const SAMPLE_SIZE_OPTIONS: Array<{ id: TrendSampleSize; label: string }> = [
  { id: 5, label: '5' },
  { id: 10, label: '10' },
  { id: 15, label: '15' },
  { id: 20, label: '20' },
  { id: 'ALL', label: 'Toutes' },
];

interface TrendMatchPoint {
  index: number;
  label: string;
  matchId: string;
  championName: string;
  championDisplayName: string;
  championImageUrl?: string;
  role: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  goldPerMin: number;
  goldEarned: number;
  visionScore: number;
  visionPerMin: number;
  durationMin: number;
  dateLabel: string;
}

interface PostGameTrendChartProps {
  matches: MatchRecord[];
  activeMatchId: string;
  champions?: ChampionSummary[];
  getChampIcon: (championName: string) => string | undefined;
  onSelectMatchId: (matchId: string) => void;
}

interface CustomTooltipPayloadItem {
  payload?: TrendMatchPoint;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  getChampIcon: (championName: string) => string | undefined;
}

function TrendChartTooltip({ active, payload, getChampIcon }: TrendTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0D121C] px-3.5 py-3 shadow-lg min-w-[225px] space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <SafeGameIcon
            src={row.championImageUrl || getChampIcon(row.championName)}
            alt={row.championDisplayName}
            fallbackLabel={row.championDisplayName}
            sizeClass="w-8 h-8"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {row.championDisplayName}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {row.durationMin} min{row.dateLabel ? ` · ${row.dateLabel}` : ''}
            </div>
          </div>
        </div>
        <span
          className={`text-[11px] font-semibold shrink-0 ${
            row.win
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {row.win ? 'Victoire' : 'Défaite'}
        </span>
      </div>

      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
            Ratio KDA
          </span>
          <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
            {row.kda.toFixed(2)}{' '}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              ({row.kills}/{row.deaths}/{row.assists})
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" aria-hidden="true" />
            Or / min
          </span>
          <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
            {row.goldPerMin} po/m{' '}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              ({Math.round(row.goldEarned / 100) / 10}k)
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" aria-hidden="true" />
            Score de Vision
          </span>
          <span className="font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
            {row.visionScore}{' '}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              ({row.visionPerMin.toFixed(1)}/m)
            </span>
          </span>
        </div>
      </div>

      <div className="pt-1 text-[10px] text-slate-400 dark:text-slate-500">
        Cliquez sur un point pour ouvrir l’analyse de cette partie.
      </div>
    </div>
  );
}

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: TrendMatchPoint;
  color: string;
  activeMatchId: string;
  onSelectMatchId: (matchId: string) => void;
}

function ClickableMetricDot({
  cx,
  cy,
  payload,
  color,
  activeMatchId,
  onSelectMatchId,
}: CustomDotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null;
  const isSelected = payload.matchId === activeMatchId;

  return (
    <g
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelectMatchId(payload.matchId);
      }}
    >
      {isSelected && (
        <circle
          cx={cx}
          cy={cy}
          r={8}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.5}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 5 : 3.5}
        fill={color}
        stroke="#0D121C"
        strokeWidth={1.5}
      />
    </g>
  );
}

export function PostGameTrendChart({
  matches,
  activeMatchId,
  champions = [],
  getChampIcon,
  onSelectMatchId,
}: PostGameTrendChartProps) {
  const [focusMetric, setFocusMetric] = useState<TrendFocusMetric>('ALL');
  const [sampleSize, setSampleSize] = useState<TrendSampleSize>(10);
  const [selectedChampion, setSelectedChampion] = useState<string>('ALL');

  const championOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      const name = m.player.championName;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        displayName: formatChampionDisplayName(champions, name),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, 'fr'));
  }, [matches, champions]);

  const effectiveChampion = useMemo(() => {
    if (selectedChampion === 'ALL') return 'ALL';
    return championOptions.some((c) => c.name === selectedChampion) ? selectedChampion : 'ALL';
  }, [selectedChampion, championOptions]);

  const championFilteredMatches = useMemo(() => {
    if (effectiveChampion === 'ALL') return matches;
    return matches.filter((m) => m.player.championName === effectiveChampion);
  }, [matches, effectiveChampion]);

  const effectiveSampleSize: TrendSampleSize = useMemo(() => {
    if (sampleSize === 'ALL') return 'ALL';
    if (championFilteredMatches.length > 0 && sampleSize > championFilteredMatches.length) {
      return 'ALL';
    }
    return sampleSize;
  }, [sampleSize, championFilteredMatches.length]);

  const trendData = useMemo<TrendMatchPoint[]>(() => {
    const sortedDesc = [...championFilteredMatches].sort(
      (a, b) => (b.gameCreation || 0) - (a.gameCreation || 0),
    );
    const sliced =
      effectiveSampleSize === 'ALL' ? sortedDesc : sortedDesc.slice(0, effectiveSampleSize);
    const chronological = sliced.reverse();

    return chronological.map((m, idx) => {
      const p = m.player;
      const durMin = Math.max(1, m.gameDurationSec / 60);
      const kda = Number(((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2));
      const goldEarned = Number(p.goldEarned || 0);
      const goldPerMin = Math.round(goldEarned / durMin);
      const visionScore = Number(p.visionScore || 0);
      const visionPerMin = Number((visionScore / durMin).toFixed(2));
      const disp = resolveChampionDisplay(champions, p.championName);
      const shortChamp =
        disp.displayName.length > 7 ? `${disp.displayName.slice(0, 6)}…` : disp.displayName;
      const dateLabel = m.gameCreation
        ? new Date(m.gameCreation).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
          })
        : '';

      const axisLabel =
        effectiveChampion !== 'ALL'
          ? dateLabel
            ? `#${idx + 1} · ${dateLabel}`
            : `Partie ${idx + 1}`
          : `P${idx + 1} · ${shortChamp}`;

      return {
        index: idx + 1,
        label: axisLabel,
        matchId: m.matchId,
        championName: p.championName,
        championDisplayName: disp.displayName,
        championImageUrl: disp.imageUrl,
        role: p.teamPosition || '-',
        win: p.win,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        kda,
        goldPerMin,
        goldEarned,
        visionScore,
        visionPerMin,
        durationMin: Math.round(durMin),
        dateLabel,
      };
    });
  }, [championFilteredMatches, effectiveSampleSize, effectiveChampion, champions]);

  const averages = useMemo(() => {
    if (trendData.length === 0) {
      return { kda: 0, gpm: 0, vision: 0, kdaDelta: 0, gpmDelta: 0, visionDelta: 0 };
    }
    const n = trendData.length;
    const sumKda = trendData.reduce((acc, d) => acc + d.kda, 0);
    const sumGpm = trendData.reduce((acc, d) => acc + d.goldPerMin, 0);
    const sumVis = trendData.reduce((acc, d) => acc + d.visionScore, 0);

    let kdaDelta = 0;
    let gpmDelta = 0;
    let visionDelta = 0;

    if (n >= 4) {
      const split = Math.floor(n / 2);
      const firstHalf = trendData.slice(0, split);
      const secondHalf = trendData.slice(n - split);
      const avg = (arr: TrendMatchPoint[], fn: (r: TrendMatchPoint) => number) =>
        arr.reduce((s, r) => s + fn(r), 0) / arr.length;

      kdaDelta = Number((avg(secondHalf, (r) => r.kda) - avg(firstHalf, (r) => r.kda)).toFixed(2));
      gpmDelta = Math.round(
        avg(secondHalf, (r) => r.goldPerMin) - avg(firstHalf, (r) => r.goldPerMin),
      );
      visionDelta = Number(
        (avg(secondHalf, (r) => r.visionScore) - avg(firstHalf, (r) => r.visionScore)).toFixed(1),
      );
    }

    return {
      kda: Number((sumKda / n).toFixed(2)),
      gpm: Math.round(sumGpm / n),
      vision: Number((sumVis / n).toFixed(1)),
      kdaDelta,
      gpmDelta,
      visionDelta,
    };
  }, [trendData]);

  const activePointLabel = useMemo(
    () => trendData.find((d) => d.matchId === activeMatchId)?.label,
    [trendData, activeMatchId],
  );

  const showKda = focusMetric === 'ALL' || focusMetric === 'KDA';
  const showGpm = focusMetric === 'ALL' || focusMetric === 'GPM';
  const showVision = focusMetric === 'ALL' || focusMetric === 'VISION';

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 sm:p-6 space-y-4">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <TrendingUp className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
            <span>
              Évolution des performances ({trendData.length}{' '}
              {trendData.length > 1 ? 'dernières parties' : 'partie'}
              {effectiveChampion !== 'ALL'
                ? ` · ${formatChampionDisplayName(champions, effectiveChampion)}`
                : ''}
              )
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Choisissez la fenêtre de parties, isolez un champion ou filtrez les courbes (KDA, Or/min, Vision). Cliquez sur un point pour ouvrir la partie.
          </p>
        </div>

        {/* Contrôles dédiés : Champion + Nombre de parties + Courbes */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {championOptions.length > 1 && (
            <select
              value={effectiveChampion}
              onChange={(e) => setSelectedChampion(e.target.value)}
              aria-label="Filtrer le graphique par champion"
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">Tous champions ({matches.length})</option>
              {championOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.displayName} ({c.count})
                </option>
              ))}
            </select>
          )}

          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800"
            role="group"
            aria-label="Nombre de parties à analyser"
          >
            {SAMPLE_SIZE_OPTIONS.map((opt) => {
              const isDisabled =
                opt.id !== 'ALL' &&
                championFilteredMatches.length > 0 &&
                opt.id > championFilteredMatches.length;
              const activeLabel =
                opt.id === 'ALL' ? `Toutes (${championFilteredMatches.length})` : `${opt.label}p`;
              return (
                <button
                  key={String(opt.id)}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => setSampleSize(opt.id)}
                  title={
                    opt.id === 'ALL'
                      ? `Afficher toutes les parties disponibles (${championFilteredMatches.length})`
                      : `Analyser les ${opt.label} dernières parties`
                  }
                  className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    effectiveSampleSize === opt.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {activeLabel}
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800"
            role="group"
            aria-label="Filtrer les courbes du graphique"
          >
            {(
              [
                { id: 'ALL', label: 'Toutes (3)' },
                { id: 'KDA', label: 'KDA' },
                { id: 'GPM', label: 'Or / min' },
                { id: 'VISION', label: 'Vision' },
              ] as Array<{ id: TrendFocusMetric; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFocusMetric(opt.id)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  focusMetric === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {trendData.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-xs text-slate-500 dark:text-slate-400 text-center">
          Aucune partie archivée disponible pour tracer l’évolution des performances.
        </div>
      ) : (
        <>
          {/* Repères chiffrés sur la série */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
                  <span>KDA moyen (série)</span>
                </div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {averages.kda.toFixed(2)}
                </div>
              </div>
              {trendData.length >= 4 && (
                <span
                  className={`text-[11px] font-mono tabular-nums font-semibold ${
                    averages.kdaDelta >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {averages.kdaDelta > 0 ? '+' : ''}
                  {averages.kdaDelta.toFixed(2)}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" aria-hidden="true" />
                  <span>Or / min moyen</span>
                </div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {averages.gpm} <span className="text-xs font-normal text-slate-400">po/m</span>
                </div>
              </div>
              {trendData.length >= 4 && (
                <span
                  className={`text-[11px] font-mono tabular-nums font-semibold ${
                    averages.gpmDelta >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {averages.gpmDelta > 0 ? '+' : ''}
                  {averages.gpmDelta} po/m
                </span>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3.5 py-2.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" aria-hidden="true" />
                  <span>Score de Vision moyen</span>
                </div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {averages.vision.toFixed(1)}
                </div>
              </div>
              {trendData.length >= 4 && (
                <span
                  className={`text-[11px] font-mono tabular-nums font-semibold ${
                    averages.visionDelta >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {averages.visionDelta > 0 ? '+' : ''}
                  {averages.visionDelta.toFixed(1)}
                </span>
              )}
            </div>
          </div>

          {trendData.length === 1 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Une seule partie disponible dans cette sélection : synchronisez davantage de matchs ou élargissez le filtre pour observer la courbe complète.
            </p>
          )}

          {/* Légende des courbes et axes */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {showKda && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-emerald-500 inline-block" aria-hidden="true" />
                  <span>KDA (axe gauche)</span>
                </span>
              )}
              {showGpm && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-amber-500 inline-block" aria-hidden="true" />
                  <span>
                    Or / min ({focusMetric === 'GPM' ? 'axe gauche' : 'axe droit'})
                  </span>
                </span>
              )}
              {showVision && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-sky-400 inline-block" aria-hidden="true" />
                  <span>
                    Score de Vision ({focusMetric === 'VISION' ? 'axe gauche' : 'échelle dédiée'})
                  </span>
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              Ancienne → Plus récente
            </span>
          </div>

          <div className="w-full h-[270px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trendData}
                margin={{ top: 10, right: focusMetric === 'ALL' ? 12 : 16, left: -8, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(148, 163, 184, 0.2)"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(148, 163, 184, 0.28)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />

                {/* Axe KDA */}
                <YAxis
                  yAxisId="kda"
                  orientation="left"
                  hide={!showKda}
                  domain={[0, (dataMax: number) => Math.max(4, Math.ceil(dataMax + 1))]}
                  tick={{ fill: '#10b981', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />

                {/* Axe Or/min */}
                <YAxis
                  yAxisId="gold"
                  orientation={focusMetric === 'GPM' ? 'left' : 'right'}
                  hide={!showGpm}
                  domain={[
                    (dataMin: number) => Math.max(0, Math.floor((dataMin - 40) / 50) * 50),
                    (dataMax: number) => Math.max(300, Math.ceil((dataMax + 40) / 50) * 50),
                  ]}
                  tick={{ fill: '#d97706', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />

                {/* Axe Vision (visible quand focus Vision, masqué en vue combinée pour préserver l'échelle exacte) */}
                <YAxis
                  yAxisId="vision"
                  orientation="left"
                  hide={focusMetric !== 'VISION'}
                  domain={[0, (dataMax: number) => Math.max(20, Math.ceil(dataMax + 10))]}
                  tick={{ fill: '#38bdf8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />

                {activePointLabel && (
                  <ReferenceLine
                    x={activePointLabel}
                    yAxisId={
                      focusMetric === 'GPM'
                        ? 'gold'
                        : focusMetric === 'VISION'
                          ? 'vision'
                          : 'kda'
                    }
                    stroke="rgba(245, 158, 11, 0.45)"
                    strokeDasharray="4 4"
                  />
                )}

                {focusMetric === 'KDA' && (
                  <ReferenceLine
                    yAxisId="kda"
                    y={averages.kda}
                    stroke="rgba(16, 185, 129, 0.45)"
                    strokeDasharray="4 4"
                  />
                )}
                {focusMetric === 'GPM' && (
                  <ReferenceLine
                    yAxisId="gold"
                    y={averages.gpm}
                    stroke="rgba(245, 158, 11, 0.45)"
                    strokeDasharray="4 4"
                  />
                )}
                {focusMetric === 'VISION' && (
                  <ReferenceLine
                    yAxisId="vision"
                    y={averages.vision}
                    stroke="rgba(56, 189, 248, 0.45)"
                    strokeDasharray="4 4"
                  />
                )}

                <Tooltip
                  cursor={{ stroke: 'rgba(148, 163, 184, 0.35)', strokeWidth: 1 }}
                  content={<TrendChartTooltip getChampIcon={getChampIcon} />}
                />

                {showKda && (
                  <Line
                    yAxisId="kda"
                    type="monotone"
                    dataKey="kda"
                    name="KDA"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    dot={(dotProps) => (
                      <ClickableMetricDot
                        key={`kda-${dotProps.index}`}
                        cx={dotProps.cx}
                        cy={dotProps.cy}
                        payload={dotProps.payload as TrendMatchPoint}
                        color="#10B981"
                        activeMatchId={activeMatchId}
                        onSelectMatchId={onSelectMatchId}
                      />
                    )}
                    activeDot={{ r: 6, fill: '#10B981', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                )}

                {showGpm && (
                  <Line
                    yAxisId="gold"
                    type="monotone"
                    dataKey="goldPerMin"
                    name="Or / min"
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    dot={(dotProps) => (
                      <ClickableMetricDot
                        key={`gold-${dotProps.index}`}
                        cx={dotProps.cx}
                        cy={dotProps.cy}
                        payload={dotProps.payload as TrendMatchPoint}
                        color="#F59E0B"
                        activeMatchId={activeMatchId}
                        onSelectMatchId={onSelectMatchId}
                      />
                    )}
                    activeDot={{ r: 6, fill: '#F59E0B', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                )}

                {showVision && (
                  <Line
                    yAxisId="vision"
                    type="monotone"
                    dataKey="visionScore"
                    name="Score de Vision"
                    stroke="#38BDF8"
                    strokeWidth={2.5}
                    dot={(dotProps) => (
                      <ClickableMetricDot
                        key={`vision-${dotProps.index}`}
                        cx={dotProps.cx}
                        cy={dotProps.cy}
                        payload={dotProps.payload as TrendMatchPoint}
                        color="#38BDF8"
                        activeMatchId={activeMatchId}
                        onSelectMatchId={onSelectMatchId}
                      />
                    )}
                    activeDot={{ r: 6, fill: '#38BDF8', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
