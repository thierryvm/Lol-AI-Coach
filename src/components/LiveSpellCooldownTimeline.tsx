import { useMemo, useState } from 'react';
import { Clock, RotateCcw, X } from 'lucide-react';
import type { ChampionSummary } from '../engines/types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';
import {
  getSummonerSpellIconUrl,
  isKeyEnemySummonerSpell,
} from '../utils/summonerSpells.ts';
import type { ActiveSpellCooldownEntry } from './LiveSummonerSpellsTracker.tsx';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';

interface LiveSpellCooldownTimelineProps {
  spellCooldowns: Record<string, ActiveSpellCooldownEntry>;
  spellTickNow: number;
  champions: ChampionSummary[];
  patchVersion: string;
  gameTimeSec: number;
  onCancelCooldown: (entryKey: string) => void;
  onResetAll: () => void;
}

type TimelineFilter = 'ALL' | 'ENEMY' | 'KEY';

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LiveSpellCooldownTimeline({
  spellCooldowns,
  spellTickNow,
  champions,
  patchVersion,
  gameTimeSec,
  onCancelCooldown,
  onResetAll,
}: LiveSpellCooldownTimelineProps) {
  const [filter, setFilter] = useState<TimelineFilter>('ALL');

  const activeItems = useMemo(() => {
    return Object.entries(spellCooldowns)
      .filter(([, entry]) => entry.expiresAt > spellTickNow)
      .map(([entryKey, entry]) => {
        const leftSec = Math.max(1, Math.ceil((entry.expiresAt - spellTickNow) / 1000));
        const totalSec = Math.max(leftSec, entry.totalSec || leftSec);
        const champKey = entry.championKey || entryKey.split(':')[0] || entry.championDisplayName;
        const champDisp = resolveChampionDisplay(champions, champKey);
        const spellIconUrl =
          entry.spellIconUrl ??
          (entry.spellId === 999 || entry.spellId >= 1000
            ? undefined
            : getSummonerSpellIconUrl(entry.spellId, patchVersion));

        return {
          entryKey,
          entry,
          leftSec,
          totalSec,
          readyAtGameSec: gameTimeSec + leftSec,
          champDisp,
          spellIconUrl,
          isKey: isKeyEnemySummonerSpell(entry.spellId, 'KEY') || entry.spellId === 999,
        };
      })
      .sort((a, b) => a.leftSec - b.leftSec);
  }, [spellCooldowns, spellTickNow, champions, patchVersion, gameTimeSec]);

  const filteredItems = useMemo(() => {
    if (filter === 'ENEMY') {
      return activeItems.filter((item) => item.entry.team === 'ENEMY');
    }
    if (filter === 'KEY') {
      return activeItems.filter((item) => item.isKey);
    }
    return activeItems;
  }, [activeItems, filter]);

  // Échelle temporelle partagée en minutes (min 2 min, max 6 min) pour comparer visuellement tous les retours
  const maxLeftSec = filteredItems.reduce((max, item) => Math.max(max, item.leftSec), 0);
  const axisMinutes = Math.max(2, Math.min(6, Math.ceil(Math.max(maxLeftSec, 60) / 60)));
  const axisMaxSec = axisMinutes * 60;
  const minuteTicks = Array.from({ length: axisMinutes }, (_, i) => i + 1);

  const nextEnemyReady = activeItems.find((item) => item.entry.team === 'ENEMY');
  const imminentEnemyCount = activeItems.filter(
    (item) => item.entry.team === 'ENEMY' && item.leftSec <= 30,
  ).length;

  return (
    <section
      aria-label="Timeline de rechargement des sorts d'invocateur"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4"
    >
      {/* En-tête de la Timeline */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
              <span>Timeline de rechargement (Lecture Teamfight)</span>
            </h3>
            <SectionInfoTooltip
              title="Comment lire la Timeline en teamfight"
              description="Tous les sorts actifs sont classés du retour le plus proche (en haut) au plus lointain sur une même échelle temporelle. Plus la barre approche du repère « Maintenant » à gauche, plus le sort va redevenir disponible rapidement."
              usageTip="En approche d'objectif, jetez un œil aux lignes rouges « Imminent (<30s) » avant de lancer l'engage."
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              {activeItems.length} {activeItems.length > 1 ? 'chronos actifs' : 'chrono actif'}
            </span>
            {nextEnemyReady && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Prochain retour adverse :{' '}
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">
                    {nextEnemyReady.entry.spellNameFr} {nextEnemyReady.champDisp.displayName}
                  </strong>{' '}
                  dans{' '}
                  <span className="font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                    {formatClock(nextEnemyReady.leftSec)}
                  </span>
                </span>
              </>
            )}
            {imminentEnemyCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono tabular-nums">
                  {imminentEnemyCount}{' '}
                  {imminentEnemyCount > 1 ? 'retours imminents' : 'retour imminent'} (&lt;30s)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] p-0.5 text-[11px]"
            role="group"
            aria-label="Filtrer la timeline des cooldowns"
          >
            {(
              [
                { id: 'ALL', label: 'Tous' },
                { id: 'ENEMY', label: 'Adversaires' },
                { id: 'KEY', label: 'Sorts clés' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors ${
                  filter === tab.id
                    ? 'bg-white dark:bg-[#1A2233] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeItems.length > 0 && (
            <button
              type="button"
              onClick={onResetAll}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0 transition-colors"
              title="Vider la timeline"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Vider</span>
            </button>
          )}
        </div>
      </div>

      {/* Corps : État vide ou Timeline graduée */}
      {filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] px-4 py-5 text-center">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
            {activeItems.length === 0
              ? 'Aucun cooldown actif sur la timeline'
              : 'Aucun cooldown actif pour ce filtre'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {activeItems.length === 0
              ? 'Cliquez sur un sort d’invocateur ci-dessus (ou dites « Aatrox plus de flash » au micro) pour suivre graphiquement son retour en teamfight.'
              : 'Passez le filtre sur « Tous » pour afficher l’ensemble des chronomètres en cours.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Axe gradué commun (Maintenant -> +Xm) */}
          <div className="hidden md:flex items-center gap-3 px-2.5 text-[10.5px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
            <div className="w-56 shrink-0">Champion · Sort</div>
            <div className="flex-1 flex items-center">
              <span className="text-slate-600 dark:text-slate-300 font-semibold shrink-0 -ml-0.5">
                Maintenant
              </span>
              <div className="flex-1 flex">
                {minuteTicks.map((m) => (
                  <div key={m} className="flex-1 text-right pr-0.5">
                    +{m}m
                  </div>
                ))}
              </div>
            </div>
            <div className="w-36 shrink-0 text-right">Restant · Retour</div>
          </div>

          {/* Lignes chronologiques */}
          <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0D121C]">
            {filteredItems.map((item) => {
              const isEnemy = item.entry.team === 'ENEMY';
              const ratio = Math.min(1, Math.max(0.02, item.leftSec / axisMaxSec));
              const elapsedPct = Math.min(
                99,
                Math.max(1, Math.round(((item.totalSec - item.leftSec) / item.totalSec) * 100)),
              );

              // Sémantique visuelle claire pour lecture instantanée en combat
              let barClass = 'bg-sky-500';
              let statusText = 'Allié';
              let statusClass = 'text-sky-600 dark:text-sky-400';

              if (isEnemy) {
                if (item.leftSec <= 30) {
                  barClass = 'bg-rose-500';
                  statusText = 'Imminent';
                  statusClass = 'text-rose-600 dark:text-rose-400';
                } else if (item.leftSec <= 90) {
                  barClass = 'bg-amber-500';
                  statusText = 'Bientôt';
                  statusClass = 'text-amber-600 dark:text-amber-400';
                } else {
                  barClass = 'bg-emerald-500';
                  statusText = 'Fenêtre';
                  statusClass = 'text-emerald-600 dark:text-emerald-400';
                }
              }

              return (
                <div
                  key={item.entryKey}
                  className="flex flex-col md:flex-row md:items-center gap-2.5 px-2.5 py-2 hover:bg-white/80 dark:hover:bg-[#121722]/90 transition-colors"
                >
                  {/* Identité Champion + Sort */}
                  <div className="flex items-center gap-2.5 md:w-56 shrink-0 min-w-0">
                    <div className="relative shrink-0">
                      <SafeGameIcon
                        src={item.champDisp.imageUrl}
                        alt={item.champDisp.displayName}
                        fallbackLabel={item.champDisp.displayName}
                        sizeClass="w-7 h-7"
                      />
                      <div className="absolute -bottom-1 -right-1 rounded border border-white dark:border-[#0D121C] bg-slate-900">
                        <SafeGameIcon
                          src={item.spellIconUrl}
                          alt={item.entry.spellNameFr}
                          fallbackLabel={item.entry.chatCode}
                          sizeClass="w-4 h-4 rounded"
                        />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.champDisp.displayName}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                        <span className="truncate">{item.entry.spellNameFr}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-semibold shrink-0 ${statusClass}`}>
                          {statusText}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rail graphique de progression */}
                  <div className="flex-1 min-w-0">
                    <div
                      role="progressbar"
                      aria-label={`Temps restant pour ${item.entry.spellNameFr} de ${item.champDisp.displayName}`}
                      aria-valuemin={0}
                      aria-valuemax={item.totalSec}
                      aria-valuenow={item.leftSec}
                      className="relative h-6 rounded-md bg-slate-200/75 dark:bg-slate-800/90 overflow-hidden"
                    >
                      {/* Repères verticaux par minute */}
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 flex pointer-events-none"
                      >
                        {minuteTicks.map((m) => (
                          <div
                            key={m}
                            className="flex-1 border-r border-dashed border-slate-300/70 dark:border-slate-700/70 last:border-r-0"
                          />
                        ))}
                      </div>

                      {/* Barre restante (ancrée à gauche sur Maintenant, animée par transform GPU) */}
                      <div
                        aria-hidden="true"
                        className={`absolute inset-y-1 left-0 right-0 rounded-r-sm ${barClass} opacity-90 transition-transform duration-500 ease-out`}
                        style={{
                          transform: `scaleX(${ratio})`,
                          transformOrigin: 'left center',
                        }}
                      />

                      {/* Indication discrète du pourcentage déjà rechargé */}
                      <div className="relative z-10 h-full px-2 flex items-center justify-between text-[10px] font-mono tabular-nums pointer-events-none">
                        <span className="font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]">
                          {item.entry.chatCode}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 font-medium">
                          {elapsedPct}% rechargé
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Décompte numérique tabulaire + Action annuler */}
                  <div className="flex items-center justify-between md:justify-end gap-2.5 md:w-36 shrink-0">
                    <div className="text-left md:text-right font-mono tabular-nums">
                      <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {formatClock(item.leftSec)}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        Prêt @{formatClock(item.readyAtGameSec)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onCancelCooldown(item.entryKey)}
                      title={`Annuler le suivi ${item.entry.spellNameFr} de ${item.champDisp.displayName}`}
                      aria-label={`Annuler le suivi ${item.entry.spellNameFr} de ${item.champDisp.displayName}`}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
