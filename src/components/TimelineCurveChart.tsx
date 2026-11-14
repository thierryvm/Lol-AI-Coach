import type { TimelineSplitPoint } from '../engines/types.ts';

interface TimelineCurveChartProps {
  splits: TimelineSplitPoint[];
}

export function TimelineCurveChart({ splits }: TimelineCurveChartProps) {
  if (splits.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Données Timeline non disponibles pour ce match.
      </div>
    );
  }

  const width = 560;
  const height = 180;
  const padX = 44;
  const padY = 24;

  const maxAbsGold = Math.max(1000, ...splits.map((s) => Math.abs(s.goldDiff)));
  const minMin = splits[0].minute;
  const maxMin = Math.max(minMin + 5, splits[splits.length - 1].minute);

  const getX = (minute: number) =>
    padX + ((minute - minMin) / (maxMin - minMin)) * (width - padX * 2);
  const getY = (goldDiff: number) =>
    height / 2 - (goldDiff / maxAbsGold) * (height / 2 - padY);

  const points = splits.map((s) => `${getX(s.minute)},${getY(s.goldDiff)}`).join(' ');

  return (
    <div className="space-y-4">
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[420px] h-44"
          role="img"
          aria-label="Courbe d'écart d'or contre l'adversaire de lane"
        >
          {/* Ligne 0 po */}
          <line
            x1={padX}
            y1={height / 2}
            x2={width - padX}
            y2={height / 2}
            strokeDasharray="4 4"
            className="stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="1"
          />
          <text
            x={padX - 6}
            y={height / 2 + 3}
            textAnchor="end"
            className="fill-slate-400 text-[10px] font-mono"
          >
            0
          </text>
          <text
            x={padX - 6}
            y={padY + 4}
            textAnchor="end"
            className="fill-emerald-500 text-[10px] font-mono"
          >
            +{maxAbsGold}
          </text>
          <text
            x={padX - 6}
            y={height - padY + 4}
            textAnchor="end"
            className="fill-rose-500 text-[10px] font-mono"
          >
            -{maxAbsGold}
          </text>

          {/* Courbe d'écart d'or */}
          <polyline
            fill="none"
            points={points}
            strokeWidth="2.5"
            className="stroke-amber-500 dark:stroke-amber-400"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Points & labels */}
          {splits.map((s) => {
            const cx = getX(s.minute);
            const cy = getY(s.goldDiff);
            const positive = s.goldDiff >= 0;
            return (
              <g key={s.minute}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="4"
                  className={positive ? 'fill-emerald-500' : 'fill-rose-500'}
                />
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                >
                  {s.minute}m
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tableau compact des jalons 10m / 15m / 20m */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <th className="py-2 text-left font-medium">Jalon</th>
              <th className="py-2 text-right font-medium">Vos CS</th>
              <th className="py-2 text-right font-medium">CS adverse</th>
              <th className="py-2 text-right font-medium">Écart CS</th>
              <th className="py-2 text-right font-medium">Écart Or</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono tabular-nums">
            {splits.map((s) => (
              <tr key={s.minute} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="py-2 text-slate-700 dark:text-slate-300">{s.minute} min</td>
                <td className="py-2 text-right text-slate-900 dark:text-slate-100">{s.playerCs}</td>
                <td className="py-2 text-right text-slate-500 dark:text-slate-400">{s.opponentCs}</td>
                <td
                  className={`py-2 text-right font-medium ${
                    s.csDiff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {s.csDiff >= 0 ? `+${s.csDiff}` : s.csDiff}
                </td>
                <td
                  className={`py-2 text-right font-medium ${
                    s.goldDiff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {s.goldDiff >= 0 ? `+${s.goldDiff} po` : `${s.goldDiff} po`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
