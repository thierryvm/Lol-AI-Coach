import { useState } from 'react';
import { Eye, Radar, RotateCcw, ShieldCheck, Siren } from 'lucide-react';
import type {
  GankAlertResult,
  JungleSighting,
  MapSightingZone,
} from '../engines/liveJungleGankEngine.ts';
import type { Role } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';

interface LiveJungleGankAlertPanelProps {
  analysis: GankAlertResult;
  patchVersion: string;
  role: Role;
  gameTimeSec: number;
  sighting: JungleSighting;
  onUpdateSighting: (zone: MapSightingZone) => void;
  gankToastEnabled: boolean;
  onToggleGankToast: (enabled: boolean) => void;
}

const MAP_ZONES: Array<{
  zone: MapSightingZone;
  shortLabel: string;
  svgX: number;
  svgY: number;
}> = [
  { zone: 'TOP_LANE', shortLabel: 'Top', svgX: 46, svgY: 44 },
  { zone: 'ENEMY_JUNGLE_TOP', shortLabel: 'Jgl Top', svgX: 145, svgY: 75 },
  { zone: 'RIVER_TOP', shortLabel: 'Riv. Top', svgX: 102, svgY: 102 },
  { zone: 'MID_LANE', shortLabel: 'Mid', svgX: 150, svgY: 150 },
  { zone: 'RIVER_BOT', shortLabel: 'Riv. Bot', svgX: 198, svgY: 198 },
  { zone: 'ENEMY_JUNGLE_BOT', shortLabel: 'Jgl Bot', svgX: 155, svgY: 225 },
  { zone: 'BOT_LANE', shortLabel: 'Bot', svgX: 254, svgY: 256 },
];

export function LiveJungleGankAlertPanel({
  analysis,
  patchVersion,
  role,
  gameTimeSec,
  sighting,
  onUpdateSighting,
  gankToastEnabled,
  onToggleGankToast,
}: LiveJungleGankAlertPanelProps) {
  const [mapImgFailed, setMapImgFailed] = useState(false);

  const mapUrl = patchVersion
    ? `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/map/map11.png`
    : '';

  const dangerColorMap = {
    Critique: {
      border: 'border-rose-500/50 dark:border-rose-500/40',
      surface: 'bg-rose-500/10',
      text: 'text-rose-600 dark:text-rose-400',
      bar: 'bg-rose-500',
    },
    Élevé: {
      border: 'border-amber-500/50 dark:border-amber-500/40',
      surface: 'bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-400',
      bar: 'bg-amber-500',
    },
    Modéré: {
      border: 'border-sky-500/40 dark:border-sky-500/35',
      surface: 'bg-sky-500/10',
      text: 'text-sky-600 dark:text-sky-400',
      bar: 'bg-sky-500',
    },
    Faible: {
      border: 'border-emerald-500/40 dark:border-emerald-500/35',
      surface: 'bg-emerald-500/10',
      text: 'text-emerald-600 dark:text-emerald-400',
      bar: 'bg-emerald-500',
    },
  }[analysis.dangerLevel];

  const playerLanePin =
    role === 'TOP'
      ? { x: 46, y: 44 }
      : role === 'MID' || role === 'JUNGLE'
        ? { x: 150, y: 150 }
        : { x: 254, y: 256 };

  return (
    <section
      aria-label="Radar et alerte Danger Gank"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4"
    >
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Radar className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
              <span>Radar Jungle &amp; Alerte « Danger Gank »</span>
            </h2>
            <SectionInfoTooltip
              title="Analyse Spectator-V5, Live Client Data & Règles Vanguard"
              description="Identifie le jungler adverse (Châtiment via Spectator-V5 & Live Client Data), son côté de départ (Bleu/Rouge), son archétype de clear, ses respawns et les fenêtres d'objectifs (Carapateur, Larves, Dragon, Baron). Par règle anti-triche Riot Vanguard, aucune API publique ne transmet les coordonnées GPS en direct : cliquez sur la mini-map si vous l'apercevez pour recalculer son temps de trajet vers votre voie."
              usageTip="Laissez les notifications toast activées : une alerte visuelle apparaît automatiquement dès qu'une fenêtre critique de gank s'ouvre sur votre voie."
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Voie surveillée :{' '}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {analysis.laneLabel}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>{analysis.activeWindowLabel}</span>
            {analysis.playerTeamSide !== 'UNKNOWN' && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Votre côté : {analysis.playerTeamSide === 'BLUE' ? 'Bleu' : 'Rouge'}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gankToastEnabled}
              onChange={(e) => onToggleGankToast(e.target.checked)}
              className="rounded border-slate-300 accent-rose-500"
            />
            <span>Notif toast Danger Gank</span>
          </label>

          {sighting.zone !== 'UNKNOWN' && (
            <button
              type="button"
              onClick={() => onUpdateSighting('UNKNOWN')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Brouillard</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Colonne gauche : Diagnostic Danger Gank + Fiche Jungler */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Bannière de niveau de danger sur la voie */}
          <div
            className={`rounded-lg border ${dangerColorMap.border} ${dangerColorMap.surface} p-4 space-y-2.5`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {analysis.dangerLevel === 'Critique' || analysis.dangerLevel === 'Élevé' ? (
                  <Siren className={`w-4 h-4 ${dangerColorMap.text} shrink-0`} aria-hidden="true" />
                ) : (
                  <ShieldCheck
                    className={`w-4 h-4 ${dangerColorMap.text} shrink-0`}
                    aria-hidden="true"
                  />
                )}
                <span className={`text-xs font-bold ${dangerColorMap.text}`}>
                  Danger Gank : {analysis.dangerLevel}
                </span>
              </div>

              <span className={`text-xs font-mono tabular-nums font-bold ${dangerColorMap.text}`}>
                {analysis.dangerScore}/100
              </span>
            </div>

            <div className="h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full ${dangerColorMap.bar} transition-transform duration-500 ease-out`}
                style={{
                  transform: `scaleX(${Math.max(0.05, analysis.dangerScore / 100)})`,
                  transformOrigin: 'left center',
                }}
              />
            </div>

            <p className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
              {analysis.headline}
            </p>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
              {analysis.actionTip}
            </p>
          </div>

          {/* Fiche Jungler ennemi détecté */}
          {analysis.hasEnemyJungler && analysis.enemyJungler ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <SafeGameIcon
                    src={analysis.enemyJungler.imageUrl}
                    alt={analysis.enemyJungler.displayName}
                    fallbackLabel={analysis.enemyJungler.displayName}
                    sizeClass="w-9 h-9 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {analysis.enemyJungler.displayName}
                      {analysis.enemyJungler.isDead && (
                        <span className="ml-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          (Mort)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {analysis.enemyJungler.archetypeLabel}
                      {analysis.enemyJungler.teamSide !== 'UNKNOWN'
                        ? ` · Côté ${analysis.enemyJungler.teamSide === 'BLUE' ? 'Bleu' : 'Rouge'}`
                        : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                  <span>Niv.{analysis.enemyJungler.level}</span>
                  <span aria-hidden="true">·</span>
                  <span>{analysis.enemyJungler.kda}</span>
                  <span aria-hidden="true">·</span>
                  <span>{analysis.enemyJungler.cs} CS</span>
                </div>
              </div>

              {/* Facteurs détectés */}
              <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-800 space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
                  <Eye className="w-3.5 h-3.5 text-sky-500 shrink-0" aria-hidden="true" />
                  <span>{analysis.sightingSummary}</span>
                </div>
                <div className="text-slate-600 dark:text-slate-300">
                  <strong>Vision conseillée :</strong> {analysis.wardAdvice}
                </div>
                {analysis.factors.length > 0 && (
                  <ul className="pt-1 space-y-0.5 text-slate-500 dark:text-slate-400 list-disc list-inside">
                    {analysis.factors.map((factor, i) => (
                      <li key={i}>{factor}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] p-3.5 text-[11px] text-slate-500 dark:text-slate-400">
              {analysis.actionTip}
            </div>
          )}
        </div>

        {/* Colonne droite : Mini-map tactique cliquable (Faille de l'invocateur) */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Mini-map interactive (cliquer où l’ennemi est vu)
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {sighting.zone !== 'UNKNOWN'
                ? `${Math.max(0, gameTimeSec - sighting.spottedAtGameSec)}s`
                : 'Auto'}
            </span>
          </div>

          <div className="relative mx-auto w-full max-w-[270px] aspect-square rounded-xl border border-slate-300 dark:border-slate-700 bg-[#0B1220] overflow-hidden">
            {mapUrl && !mapImgFailed && (
              <img
                src={mapUrl}
                alt="Mini-map Faille de l'invocateur"
                referrerPolicy="no-referrer"
                onError={() => setMapImgFailed(true)}
                className="w-full h-full object-cover opacity-80 select-none pointer-events-none"
              />
            )}

            <svg
              viewBox="0 0 300 300"
              className="absolute inset-0 w-full h-full"
              role="img"
              aria-label="Zones de gank et repérage du jungler ennemi sur la mini-map"
            >
              {/* Voies et halo de votre voie surveillée */}
              <circle
                cx={playerLanePin.x}
                cy={playerLanePin.y}
                r={26}
                fill={
                  analysis.dangerLevel === 'Critique' || analysis.dangerLevel === 'Élevé'
                    ? 'rgba(244, 63, 94, 0.24)'
                    : 'rgba(14, 165, 233, 0.22)'
                }
                stroke={
                  analysis.dangerLevel === 'Critique' || analysis.dangerLevel === 'Élevé'
                    ? '#f43f5e'
                    : '#38bdf8'
                }
                strokeWidth="2"
                strokeDasharray="4 3"
              />
              <text
                x={playerLanePin.x}
                y={playerLanePin.y + 34}
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="9"
                fontWeight="700"
              >
                VOUS
              </text>

              {/* Zones cliquables pour signaler une apparition sur la mini-map */}
              {MAP_ZONES.map((z) => {
                const isSpottedHere = sighting.zone === z.zone;
                return (
                  <g
                    key={z.zone}
                    onClick={() => onUpdateSighting(z.zone)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={z.svgX}
                      cy={z.svgY}
                      r={isSpottedHere ? 14 : 11}
                      fill={
                        isSpottedHere
                          ? 'rgba(244, 63, 94, 0.9)'
                          : 'rgba(15, 23, 42, 0.78)'
                      }
                      stroke={isSpottedHere ? '#fecdd3' : '#94a3b8'}
                      strokeWidth={isSpottedHere ? '2' : '1.2'}
                    />
                    <text
                      x={z.svgX}
                      y={z.svgY + 3}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="7.5"
                      fontWeight="600"
                      className="select-none pointer-events-none"
                    >
                      {z.shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Boutons rapides tactiles sous la mini-map */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {MAP_ZONES.slice(0, 5).map((z) => {
              const active = sighting.zone === z.zone;
              return (
                <button
                  key={z.zone}
                  type="button"
                  onClick={() => onUpdateSighting(z.zone)}
                  className={`px-2 py-1 text-[10.5px] font-medium rounded-md border transition-colors whitespace-nowrap ${
                    active
                      ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-600 dark:text-slate-300 hover:border-amber-500/50'
                  }`}
                >
                  {z.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
