import { useMemo, useState } from 'react';
import type { MapCoordinateEvent } from '../engines/types.ts';

interface SummonersRiftMapProps {
  events: MapCoordinateEvent[];
  patchVersion: string;
}

// Dimensions officielles de la Faille de l'invocateur dans Match-V5 Timeline
const MAP_MAX = 14870;

export function SummonersRiftMap({ events, patchVersion }: SummonersRiftMapProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'DEATH' | 'KILL'>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<MapCoordinateEvent | null>(
    events.find((e) => e.type === 'DEATH') || events[0] || null,
  );
  const [mapImgFailed, setMapImgFailed] = useState(false);

  const visibleEvents = useMemo(() => {
    if (filterType === 'ALL') return events;
    return events.filter((e) => e.type === filterType);
  }, [events, filterType]);

  // Convertit les coordonnées Riot (0,0 en bas à gauche -> SVG 0,300 en bas à gauche)
  const toSvgX = (x: number) => Math.max(10, Math.min(290, (x / MAP_MAX) * 300));
  const toSvgY = (y: number) => Math.max(10, Math.min(290, 300 - (y / MAP_MAX) * 300));

  const mapUrl = `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/map/map11.png`;
  const deathCount = events.filter((e) => e.type === 'DEATH').length;
  const killCount = events.filter((e) => e.type === 'KILL').length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-6 space-y-3">
        <div className="relative aspect-square w-full max-w-[360px] mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0B0E14] overflow-hidden">
          {!mapImgFailed ? (
            <img
              src={mapUrl}
              alt="Minimap officielle de la Faille de l'invocateur (Data Dragon)"
              referrerPolicy="no-referrer"
              onError={() => setMapImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover select-none"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#101827] to-slate-950" />
          )}

          <div className="absolute inset-0 bg-black/20 pointer-events-none" />

          <svg
            viewBox="0 0 300 300"
            className="relative z-10 w-full h-full"
            role="img"
            aria-label="Positions de morts et d'éliminations sur la Faille de l'invocateur"
          >
            <text
              x="14"
              y="290"
              className="fill-sky-300/80 text-[8px] font-mono font-semibold pointer-events-none"
            >
              BASE BLEUE
            </text>
            <text
              x="286"
              y="18"
              textAnchor="end"
              className="fill-rose-300/80 text-[8px] font-mono font-semibold pointer-events-none"
            >
              BASE ROUGE
            </text>

            {visibleEvents.map((ev, idx) => {
              const cx = toSvgX(ev.x);
              const cy = toSvgY(ev.y);
              const isSelected = selectedEvent === ev;
              const isDeath = ev.type === 'DEATH';

              return (
                <g
                  key={`${ev.timestampMs}-${idx}`}
                  onClick={() => setSelectedEvent(ev)}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r="13"
                      className={
                        isDeath
                          ? 'fill-rose-500/35 stroke-white'
                          : 'fill-emerald-500/35 stroke-white'
                      }
                      strokeWidth="1.5"
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="7.5"
                    className={
                      isDeath ? 'fill-rose-600 stroke-white' : 'fill-emerald-600 stroke-white'
                    }
                    strokeWidth="1.5"
                  />
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    className="fill-white text-[9px] font-mono font-bold pointer-events-none"
                  >
                    {isDeath ? '×' : '+'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {selectedEvent && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] px-3.5 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`font-semibold ${
                  selectedEvent.type === 'DEATH'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {selectedEvent.type === 'DEATH' ? 'Mort' : 'Élimination'} · {selectedEvent.zone}
              </span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {selectedEvent.minute} min
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mt-1">{selectedEvent.contextNote}</p>
          </div>
        )}
      </div>

      {/* Détail chronologique borné à la hauteur de la carte */}
      <div className="lg:col-span-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-900 dark:text-white">
            Chronologie ({visibleEvents.length})
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
            {[
              { id: 'ALL' as const, label: `Tous (${events.length})` },
              { id: 'DEATH' as const, label: `Morts (${deathCount})` },
              { id: 'KILL' as const, label: `Kills (${killCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  filterType === tab.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {visibleEvents.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-6">
            Aucun événement dans cette catégorie sur cette partie.
          </p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
            {visibleEvents.map((ev, idx) => {
              const active = selectedEvent === ev;
              return (
                <button
                  key={`${ev.timestampMs}-${idx}`}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className={`w-full text-left px-3.5 py-2.5 transition-colors ${
                    active
                      ? 'bg-slate-100 dark:bg-slate-800/70'
                      : 'bg-white dark:bg-[#121722] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`text-xs font-semibold ${
                        ev.type === 'DEATH'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {ev.type === 'DEATH' ? 'Mort' : 'Élimination'} · {ev.zone}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {ev.minute} min
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                    {ev.contextNote}
                  </p>
                  {(ev.isolated || ev.nearObjectiveWindow) && (
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                      {ev.isolated && <span>Position isolée</span>}
                      {ev.isolated && ev.nearObjectiveWindow && <span aria-hidden="true">·</span>}
                      {ev.nearObjectiveWindow && <span>Pré-objectif (&lt;45s)</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
