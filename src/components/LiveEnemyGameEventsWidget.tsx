import { useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Flame,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import type {
  ChampionDetail,
  ChampionSummary,
  LiveParsedGameEvent,
  LivePlayerEquipmentRow,
} from '../engines/types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';
import {
  getSummonerSpellIconUrl,
  resolveSummonerSpell,
} from '../utils/summonerSpells.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';

interface LiveEnemyGameEventsWidgetProps {
  gameEvents: LiveParsedGameEvent[];
  enemyPlayers: LivePlayerEquipmentRow[];
  champions: ChampionSummary[];
  championKits: Record<string, ChampionDetail>;
  patchVersion: string;
  gameTimeSec: number;
  snapshotReceivedAtMs: number;
  nowMs: number;
  dismissedEventIds: Set<string>;
  onDismissEvent: (eventId: string) => void;
  onClearDismissed: () => void;
}

type WidgetFilter = 'ALL' | 'ACTIVE' | 'MAJOR';

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseDDragonCooldownForEnemy(
  cooldownBurn: string | undefined,
  champLevel: number,
  isUltimate: boolean,
): number | null {
  if (!cooldownBurn) return null;
  const ranks = cooldownBurn
    .split('/')
    .map((v) => Number(v.replace(',', '.').trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ranks.length === 0) return null;

  let idx = 0;
  if (isUltimate) {
    idx = champLevel >= 16 ? 2 : champLevel >= 11 ? 1 : 0;
  } else {
    idx = champLevel >= 9 ? 2 : champLevel >= 5 ? 1 : 0;
  }
  idx = Math.min(idx, ranks.length - 1);
  return Math.max(1, Math.round(ranks[idx]));
}

export function LiveEnemyGameEventsWidget({
  gameEvents,
  enemyPlayers,
  champions,
  championKits,
  patchVersion,
  gameTimeSec,
  snapshotReceivedAtMs,
  nowMs,
  dismissedEventIds,
  onDismissEvent,
  onClearDismissed,
}: LiveEnemyGameEventsWidgetProps) {
  const [filter, setFilter] = useState<WidgetFilter>('ALL');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const elapsedSinceSnapshotSec = Math.max(0, Math.floor((nowMs - snapshotReceivedAtMs) / 1000));
  const liveClockSec = gameTimeSec + elapsedSinceSnapshotSec;

  const { items, hiddenCount } = useMemo(() => {
    const enemyEvents = gameEvents.filter((ev) => ev.casterTeam === 'ENEMY');
    const latestBySpellKey = new Map<
      string,
      { event: LiveParsedGameEvent; castCount: number }
    >();

    for (const ev of enemyEvents) {
      const slotOrName = (ev.spellSlot || ev.spellName || ev.category).toLowerCase();
      const dedupKey = `${(ev.casterChampionName || 'enemy').toLowerCase()}:${ev.category}:${slotOrName}`;
      const prev = latestBySpellKey.get(dedupKey);
      if (!prev || ev.eventTimeSec >= prev.event.eventTimeSec) {
        latestBySpellKey.set(dedupKey, {
          event: ev,
          castCount: (prev?.castCount ?? 0) + 1,
        });
      } else {
        latestBySpellKey.set(dedupKey, {
          event: prev.event,
          castCount: prev.castCount + 1,
        });
      }
    }

    let dismissedVisibleCount = 0;
    const rows = Array.from(latestBySpellKey.entries())
      .filter(([, { event }]) => {
        if (dismissedEventIds.has(event.id)) {
          dismissedVisibleCount += 1;
          return false;
        }
        return true;
      })
      .map(([dedupKey, { event, castCount }]) => {
        const champDisp = resolveChampionDisplay(champions, event.casterChampionName || '');
        const enemyRow = enemyPlayers.find(
          (p) => p.championName.toLowerCase() === (event.casterChampionName || '').toLowerCase(),
        );
        const enemyLevel = enemyRow?.level ?? 6;
        const ddId = champDisp.champion?.id || event.casterChampionName || '';
        const kit = ddId ? championKits[ddId] : undefined;

        const slotIdxMap: Record<string, number> = { Q: 0, W: 1, E: 2, R: 3 };
        const slotIdx = event.spellSlot ? slotIdxMap[event.spellSlot] : undefined;
        const ddSpell = typeof slotIdx === 'number' ? kit?.spells?.[slotIdx] : undefined;

        let spellIconUrl: string | undefined;
        if (event.category === 'flash') {
          spellIconUrl = getSummonerSpellIconUrl(4, patchVersion);
        } else if (event.category === 'summoner_spell') {
          const meta = resolveSummonerSpell(event.spellName);
          if (meta) spellIconUrl = getSummonerSpellIconUrl(meta.id, patchVersion);
        } else if (ddSpell?.imageUrl) {
          spellIconUrl = ddSpell.imageUrl;
        }

        const ddEstimatedCd = ddSpell
          ? parseDDragonCooldownForEnemy(
              ddSpell.cooldownBurn,
              enemyLevel,
              event.category === 'ultimate' || event.spellSlot === 'R',
            )
          : null;

        const estimatedCdSec =
          event.category === 'ultimate' &&
          (event.estimatedCooldownSec === undefined || event.estimatedCooldownSec === 90) &&
          ddEstimatedCd
            ? ddEstimatedCd
            : event.estimatedCooldownSec ??
              ddEstimatedCd ??
              (event.category === 'flash' ? 300 : event.category === 'ultimate' ? 90 : 18);

        const elapsedSinceCastSec = Math.max(0, liveClockSec - event.eventTimeSec);
        const remainingSec = Math.max(0, estimatedCdSec - elapsedSinceCastSec);
        const readyAtSec = event.eventTimeSec + estimatedCdSec;
        const ratio =
          estimatedCdSec > 0 ? Math.min(1, Math.max(0.02, remainingSec / estimatedCdSec)) : 0;

        return {
          dedupKey,
          event,
          castCount,
          champDisp,
          spellIconUrl,
          estimatedCdSec,
          remainingSec,
          readyAtSec,
          ratio,
        };
      })
      .sort((a, b) => {
        const aActive = a.remainingSec > 0 ? 0 : 1;
        const bActive = b.remainingSec > 0 ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        if (aActive === 0) return a.remainingSec - b.remainingSec;
        return b.event.eventTimeSec - a.event.eventTimeSec;
      });

    return { items: rows, hiddenCount: dismissedVisibleCount };
  }, [
    gameEvents,
    enemyPlayers,
    champions,
    championKits,
    patchVersion,
    liveClockSec,
    dismissedEventIds,
  ]);

  const filteredItems = useMemo(() => {
    if (filter === 'ACTIVE') return items.filter((item) => item.remainingSec > 0);
    if (filter === 'MAJOR') return items.filter((item) => item.event.isMajor);
    return items;
  }, [items, filter]);

  const activeCount = items.filter((item) => item.remainingSec > 0).length;
  const flashDownCount = items.filter(
    (item) => item.event.category === 'flash' && item.remainingSec > 0,
  ).length;

  const handleCopyCall = async (
    dedupKey: string,
    champName: string,
    spellName: string,
    readyAtSec: number,
    remainingSec: number,
  ) => {
    const text =
      remainingSec > 0
        ? `${champName} no ${spellName} -> ${formatClock(readyAtSec)}`
        : `${champName} ${spellName} UP`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(dedupKey);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === dedupKey ? null : prev));
      }, 1500);
    } catch {
      // Clipboard non disponible dans certains contextes iframe
    }
  };

  return (
    <section
      aria-label="Rappel visuel des sorts ennemis détectés"
      className="rounded-2xl apple-surface p-4 sm:p-5 space-y-3.5"
    >
      {/* En-tête du widget */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Rappel Sorts Ennemis détectés (gameEvent)
            </h2>
            <SectionInfoTooltip
              title="Compte à rebours automatique sur gameEvent"
              description="Chaque sort ennemi détecté via les événements client (Flash, Ultime, Téléportation, Embrasement…) démarre automatiquement un compte à rebours dynamique basé sur son délai de récupération estimé."
              usageTip="Cliquez sur Copier pour partager instantanément le timing exact (ex. Zed no Flash -> 15:35) dans le chat d'équipe."
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              {activeCount} {activeCount > 1 ? 'sorts en recharge' : 'sort en recharge'}
            </span>
            {flashDownCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 font-mono tabular-nums">
                  {flashDownCount} Flash adverse{flashDownCount > 1 ? 's' : ''} indisponible
                  {flashDownCount > 1 ? 's' : ''}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Horloge : {formatClock(liveClockSec)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="Filtrer les sorts ennemis détectés"
            className="inline-flex rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.04] p-0.5 text-[11px]"
          >
            {(
              [
                { id: 'ALL', label: `Tous (${items.length})` },
                { id: 'ACTIVE', label: `En recharge (${activeCount})` },
                { id: 'MAJOR', label: 'Majeurs' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  filter === tab.id
                    ? 'bg-white dark:bg-[#2C2E36] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onClearDismissed}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-xl border border-black/[0.08] dark:border-white/[0.1] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="Réafficher les rappels masqués"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Réafficher ({hiddenCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Liste des rappels ou état d'attente */}
      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/[0.09] dark:border-white/[0.1] bg-slate-50/70 dark:bg-[#0E1015]/80 px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {items.length === 0 ? (
                <span>
                  En attente d’un <code className="font-mono text-[11px]">gameEvent</code> ennemi
                  (Flash, Ultime, TP…). Dès qu’un sort adverse est détecté, son compte à rebours
                  dynamique s’affiche ici.
                </span>
              ) : (
                <span>Aucun sort ennemi ne correspond au filtre sélectionné.</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {filteredItems.map((item) => {
            const {
              dedupKey,
              event,
              castCount,
              champDisp,
              spellIconUrl,
              estimatedCdSec,
              remainingSec,
              readyAtSec,
              ratio,
            } = item;

            const isReady = remainingSec === 0;
            const isImminent = remainingSec > 0 && remainingSec <= 30;
            const isFlash = event.category === 'flash';
            const isUlt = event.category === 'ultimate';

            let barColor = 'bg-[#007AFF] dark:bg-[#0A84FF]';
            let statusBadgeClass =
              'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25';
            let statusLabel = 'En recharge';

            if (isReady) {
              barColor = 'bg-emerald-500';
              statusBadgeClass =
                'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
              statusLabel = 'Disponible';
            } else if (isImminent) {
              barColor = 'bg-rose-500';
              statusBadgeClass =
                'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25';
              statusLabel = 'Imminent';
            } else if (isFlash) {
              barColor = 'bg-amber-500';
              statusBadgeClass =
                'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25';
              statusLabel = 'Sans Flash';
            } else if (isUlt) {
              barColor = 'bg-violet-500';
              statusBadgeClass =
                'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25';
              statusLabel = 'Sans Ultime';
            }

            const CategoryIcon = isFlash ? Zap : isUlt ? Flame : Sparkles;

            return (
              <div
                key={dedupKey}
                className={`relative overflow-hidden rounded-xl border p-3 transition-colors ${
                  isReady
                    ? 'border-emerald-500/25 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]'
                    : isImminent
                      ? 'border-rose-500/35 bg-rose-500/[0.04] dark:bg-rose-500/[0.07]'
                      : 'border-black/[0.07] dark:border-white/[0.09] bg-slate-50/90 dark:bg-[#0E1015]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {/* Champion + Sort */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <SafeGameIcon
                        src={champDisp.imageUrl}
                        alt={champDisp.displayName}
                        fallbackLabel={champDisp.displayName}
                        sizeClass={`w-9 h-9 rounded-lg ${isReady ? '' : 'ring-1 ring-rose-500/30'}`}
                      />
                      <div className="absolute -bottom-1 -right-1 rounded border border-white dark:border-[#0E1015] bg-slate-900">
                        <SafeGameIcon
                          src={spellIconUrl}
                          alt={event.spellName}
                          fallbackLabel={event.spellSlot || event.spellName.slice(0, 2)}
                          sizeClass="w-4 h-4 rounded"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {champDisp.displayName}
                        </span>
                        {castCount > 1 && (
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                            ×{castCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                        <CategoryIcon className="w-3 h-3 shrink-0 opacity-80" aria-hidden="true" />
                        <span className="font-medium truncate">{event.spellName}</span>
                        {event.spellSlot && (
                          <span className="text-[10px] font-mono text-slate-400">
                            ({event.spellSlot})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Décompte dynamique + statut */}
                  <div className="text-right shrink-0">
                    <div
                      className={`text-sm font-bold font-mono tabular-nums leading-tight ${
                        isReady
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isImminent
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isReady ? 'PRÊT' : formatClock(remainingSec)}
                    </div>
                    <span
                      className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${statusBadgeClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {/* Barre de progression du compte à rebours */}
                <div className="mt-2.5 h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                  <div
                    aria-hidden="true"
                    className={`h-full rounded-full ${barColor} transition-transform duration-500 ease-out`}
                    style={{
                      transform: `scaleX(${isReady ? 0 : ratio})`,
                      transformOrigin: 'left center',
                    }}
                  />
                </div>

                {/* Pied de carte : timings exacts + copier / masquer */}
                <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">
                  <span className="font-mono tabular-nums truncate">
                    Lancé @{formatClock(event.eventTimeSec)} · CD ~{estimatedCdSec}s · Retour @
                    {formatClock(readyAtSec)}
                  </span>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyCall(
                          dedupKey,
                          champDisp.displayName,
                          event.spellName,
                          readyAtSec,
                          remainingSec,
                        )
                      }
                      title="Copier l'horaire pour le chat d'équipe"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-black/[0.07] dark:border-white/[0.08] bg-white dark:bg-[#16181D] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      {copiedKey === dedupKey ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" aria-hidden="true" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onDismissEvent(event.id)}
                      title="Masquer ce rappel"
                      aria-label={`Masquer le rappel ${event.spellName} de ${champDisp.displayName}`}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
