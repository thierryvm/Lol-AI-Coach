import { Award, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import type {
  FrequentTeammateStat,
  MobalyticsStyleProfile,
} from '../engines/performanceProfileEngine.ts';
import type { ChampionSummary, RiotChallengeSummary } from '../engines/types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

interface PerformanceRadarAndDuoPanelProps {
  performanceProfile: MobalyticsStyleProfile | null;
  frequentTeammates: FrequentTeammateStat[];
  challenges?: RiotChallengeSummary | null;
  champions?: ChampionSummary[];
  onSyncExtended?: () => void;
}

const CHALLENGE_TIER_FR: Record<string, string> = {
  NONE: 'Non classé',
  IRON: 'Fer',
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
  PLATINUM: 'Platine',
  EMERALD: 'Émeraude',
  DIAMOND: 'Diamant',
  MASTER: 'Maître',
  GRANDMASTER: 'Grand Maître',
  CHALLENGER: 'Challenger',
};

function RadarPentagonSvg({
  axes,
}: {
  axes: MobalyticsStyleProfile['axes'];
}) {
  const cx = 135;
  const cy = 128;
  const maxR = 82;
  const count = axes.length;

  const getPoint = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return {
      x: cx + Math.cos(angle) * maxR * ratio,
      y: cy + Math.sin(angle) * maxR * ratio,
    };
  };

  const ringLevels = [0.25, 0.5, 0.75, 1];
  const dataPoints = axes.map((axis, idx) => getPoint(idx, Math.max(0.12, axis.score / 100)));
  const dataPolygon = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox="0 0 270 256"
      className="w-full max-w-[260px] mx-auto select-none"
      role="img"
      aria-label="Radar de performance sur 5 axes"
    >
      {/* Cercles de repère */}
      {ringLevels.map((lvl) => {
        const ringPts = axes
          .map((_, idx) => {
            const pt = getPoint(idx, lvl);
            return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
          })
          .join(' ');
        return (
          <polygon
            key={lvl}
            points={ringPts}
            fill="none"
            stroke="currentColor"
            className="text-slate-300/70 dark:text-slate-700/80"
            strokeWidth={lvl === 1 ? 1.25 : 0.85}
          />
        );
      })}

      {/* Axes radiaux */}
      {axes.map((axis, idx) => {
        const edge = getPoint(idx, 1);
        const labelPt = getPoint(idx, 1.23);
        return (
          <g key={axis.id}>
            <line
              x1={cx}
              y1={cy}
              x2={edge.x}
              y2={edge.y}
              stroke="currentColor"
              className="text-slate-300/70 dark:text-slate-700/80"
              strokeWidth={0.9}
            />
            <text
              x={labelPt.x}
              y={labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-600 dark:fill-slate-300 text-[10.5px] font-semibold"
            >
              {axis.shortLabel}
            </text>
          </g>
        );
      })}

      {/* Polygone de performance */}
      <polygon
        points={dataPolygon}
        fill="rgba(245, 158, 11, 0.22)"
        stroke="#f59e0b"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Points d'ancrage */}
      {dataPoints.map((pt, idx) => (
        <circle
          key={axes[idx].id}
          cx={pt.x}
          cy={pt.y}
          r={3.5}
          fill="#f59e0b"
          stroke="#0f172a"
          strokeWidth={1.2}
        />
      ))}
    </svg>
  );
}

export function PerformanceRadarAndDuoPanel({
  performanceProfile,
  frequentTeammates,
  challenges,
  champions = [],
  onSyncExtended,
}: PerformanceRadarAndDuoPanelProps) {
  if (!performanceProfile) return null;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Colonne gauche : Radar 5 axes (GPI) + Challenges Riot */}
      <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 flex flex-col justify-between space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Profil de Performance 5 Axes</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Calculé sur vos {performanceProfile.gamesAnalyzed} derniers matchs · Rôle principal{' '}
              {performanceProfile.dominantRole} · Part de dégâts {performanceProfile.avgDamageSharePct}% · KP{' '}
              {performanceProfile.avgKillParticipationPct}%
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          <div className="sm:col-span-5">
            <RadarPentagonSvg axes={performanceProfile.axes} />
          </div>

          <div className="sm:col-span-7 space-y-2.5">
            {performanceProfile.axes.map((axis) => {
              const isWeakest = axis.id === performanceProfile.weakestAxis.id;
              const isStrongest = axis.id === performanceProfile.strongestAxis.id;
              return (
                <div key={axis.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {axis.label}
                      {isStrongest && (
                        <span className="ml-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          · Point fort
                        </span>
                      )}
                      {isWeakest && (
                        <span className="ml-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          · Prioritaire
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white shrink-0">
                      {axis.score}/100
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded transition-all duration-300 ${
                        axis.score >= 72
                          ? 'bg-emerald-500'
                          : axis.score >= 52
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${axis.score}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    <span>Vous : {axis.actualLabel}</span>
                    <span>Cible : {axis.benchmarkLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conseil ciblé + Défis officiels Riot */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
          <div className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Exercice prioritaire ({performanceProfile.weakestAxis.label}) :</strong>{' '}
              {performanceProfile.actionTip}
            </span>
          </div>

          {challenges && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                <Award className="w-3.5 h-3.5 text-sky-500 shrink-0" aria-hidden="true" />
                Challenges Riot : {CHALLENGE_TIER_FR[challenges.level] || challenges.level} ·{' '}
                <span className="font-mono tabular-nums">
                  {challenges.currentPoints.toLocaleString('fr-FR')} pts
                </span>
              </span>
              {challenges.categories.map((cat) => (
                <span key={cat.key}>
                  {cat.label} ({CHALLENGE_TIER_FR[cat.level] || cat.level})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Colonne droite : Synergie Coéquipiers & Duos / Famille */}
      <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 flex flex-col justify-between space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
              <span>Synergie Coéquipiers &amp; Duos / Famille</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Détecte automatiquement les joueurs avec qui vous lancez souvent vos parties (ex. duo familial ou amis) et votre taux de réussite ensemble.
            </p>
          </div>
        </div>

        {frequentTeammates.length === 0 ? (
          <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-6 flex flex-col items-center justify-center text-center space-y-2.5">
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md leading-relaxed">
              Aucun coéquipier régulier (2 parties ou plus ensemble) n’apparaît encore dans vos matchs archivés actuels.
            </p>
            {onSyncExtended && (
              <button
                type="button"
                onClick={onSyncExtended}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-800 dark:text-slate-100 hover:border-sky-500 transition-colors"
              >
                Lancer une Sync étendue (25 parties)
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 text-left font-medium">Coéquipier</th>
                  <th className="py-2.5 px-2 text-right font-medium">Matchs</th>
                  <th className="py-2.5 px-2 text-right font-medium">Winrate</th>
                  <th className="py-2.5 px-2 text-right font-medium">KDA Duo</th>
                  <th className="py-2.5 px-3 text-left font-medium">Combo favori</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                {frequentTeammates.map((ally) => {
                  const comboParts = (ally.favoriteCombo || '')
                    .split(' + ')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((raw) => resolveChampionDisplay(champions, raw));
                  return (
                    <tr
                      key={ally.riotId}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                        {ally.riotId}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                        {ally.gamesTogether}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                          ally.winRate >= 55
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : ally.winRate >= 48
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {ally.winRate}% ({ally.winsTogether}V)
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {ally.avgPlayerKda} / {ally.avgAllyKda}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 max-w-[190px]">
                        {comboParts.length > 0 ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="flex items-center -space-x-1.5 shrink-0">
                              {comboParts.map((cp, idx) => (
                                <SafeGameIcon
                                  key={`${ally.riotId}-combo-${cp.id}-${idx}`}
                                  src={cp.imageUrl}
                                  alt={cp.displayName}
                                  fallbackLabel={cp.displayName}
                                  sizeClass="w-5 h-5 ring-1 ring-white dark:ring-[#121722]"
                                />
                              ))}
                            </div>
                            <span className="truncate">
                              {comboParts.map((cp) => cp.displayName).join(' + ')}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
