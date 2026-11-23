import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Clock,
  Compass,
  Crown,
  Flame,
  Shield,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import type { LiveMenuQuickSummary } from '../utils/liveNavSummary.ts';
import { RankedTierCrest } from './RankedTierCrest.tsx';
import { SafeGameIcon } from './SafeGameIcon.tsx';

interface LiveMenuSummaryPopoverProps {
  open: boolean;
  topPx: number;
  leftPx: number;
  summary: LiveMenuQuickSummary;
  loadingRank?: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenLiveView: () => void;
}

export function LiveMenuSummaryPopover({
  open,
  topPx,
  leftPx,
  summary,
  loadingRank = false,
  onMouseEnter,
  onMouseLeave,
  onOpenLiveView,
}: LiveMenuSummaryPopoverProps) {
  const recall = summary.nextRecallItem;
  const objectives = summary.neutralObjectives;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="region"
          aria-label="Aperçu rapide En partie · Live"
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          initial={{ opacity: 0, x: -6, scale: 0.98 }}
          animate={{
            opacity: 1,
            x: 0,
            scale: 1,
            transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
          }}
          exit={{
            opacity: 0,
            x: -4,
            scale: 0.98,
            transition: { duration: 0.11, ease: [0.23, 1, 0.32, 1] },
          }}
          style={{ top: `${topPx}px`, left: `${leftPx}px` }}
          className="fixed z-50 w-80 max-h-[calc(100vh-2rem)] overflow-y-auto thin-scrollbar rounded-2xl border border-black/[0.08] dark:border-white/[0.12] bg-white/92 dark:bg-[#16181D]/92 apple-glass shadow-2xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-black/[0.06] dark:border-white/[0.08]">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  summary.isRealActiveGame
                    ? 'bg-emerald-500'
                    : 'bg-[#007AFF] dark:bg-[#0A84FF]'
                }`}
                aria-hidden="true"
              />
              <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                Résumé rapide · Live
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
              {summary.sourceLabel}
            </span>
          </div>

          {summary.hasLiveData ? (
            <div className="space-y-2.5">
              {/* 1. Champion joué */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.05] dark:border-white/[0.07] bg-slate-50/90 dark:bg-[#0E1015]/85 px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <SafeGameIcon
                    src={summary.championImageUrl}
                    alt={summary.championName}
                    fallbackLabel={summary.championName}
                    sizeClass="w-9 h-9"
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      Champion
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {summary.championName}
                      {summary.level ? (
                        <span className="ml-1.5 font-mono font-medium text-slate-500 dark:text-slate-400">
                          Niv.{summary.level}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {summary.kda && (
                  <span className="text-[11px] font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                    {summary.kda}
                  </span>
                )}
              </div>

              {/* 2. Rang moyen de la partie & 3. Temps de jeu actuel */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-black/[0.05] dark:border-white/[0.07] bg-slate-50/90 dark:bg-[#0E1015]/85 px-3 py-2 space-y-1">
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
                    <span>Rang moyen</span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <RankedTierCrest tier={summary.averageRank.tierKey} sizeClass="w-4 h-4" />
                    <span
                      className={`text-xs font-bold truncate ${summary.averageRank.theme.textClass}`}
                    >
                      {loadingRank ? 'Calcul...' : summary.averageRank.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {summary.averageRank.sourceDetail}
                  </div>
                </div>

                <div className="rounded-xl border border-black/[0.05] dark:border-white/[0.07] bg-slate-50/90 dark:bg-[#0E1015]/85 px-3 py-2 space-y-1">
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                    <span>Temps de jeu</span>
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white leading-tight">
                    {summary.clockLabel}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {summary.phaseLabel}
                  </div>
                </div>
              </div>

              {/* 4. Mini-widget : Suivi des prochains objectifs neutres */}
              {objectives && (
                <div className="rounded-xl border border-black/[0.05] dark:border-white/[0.07] bg-slate-50/90 dark:bg-[#0E1015]/85 px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                      Objectifs neutres
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">
                      {objectives.headline}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {objectives.items.map((obj) => {
                      const Icon =
                        obj.id === 'dragon'
                          ? Flame
                          : obj.id === 'baron'
                            ? Crown
                            : Compass;
                      const iconColor =
                        obj.id === 'dragon'
                          ? 'text-amber-500'
                          : obj.id === 'baron'
                            ? 'text-purple-500 dark:text-purple-400'
                            : 'text-sky-500 dark:text-sky-400';

                      const valueColor =
                        obj.status === 'available'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : obj.status === 'soon'
                            ? 'text-amber-600 dark:text-amber-400'
                            : obj.status === 'expired'
                              ? 'text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-white';

                      return (
                        <div
                          key={obj.id}
                          className={`rounded-lg border px-2 py-1.5 space-y-0.5 ${
                            obj.status === 'soon'
                              ? 'border-amber-500/35 bg-amber-500/[0.06]'
                              : obj.status === 'available'
                                ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                                : 'border-black/[0.05] dark:border-white/[0.06] bg-white/70 dark:bg-[#16181D]/70'
                          }`}
                        >
                          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 truncate">
                            <Icon className={`w-3 h-3 shrink-0 ${iconColor}`} aria-hidden="true" />
                            <span className="truncate">{obj.label}</span>
                          </div>
                          <div
                            className={`text-[11px] font-bold font-mono tabular-nums truncate ${valueColor}`}
                          >
                            {obj.valueLabel}
                          </div>
                          <div className="text-[9px] text-slate-400 dark:text-slate-500 truncate">
                            {obj.subLabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. Mini-widget : Objet prioritaire au prochain rappel en base */}
              {recall && (
                <div className="rounded-xl border border-[#007AFF]/20 dark:border-[#0A84FF]/25 bg-[#007AFF]/[0.04] dark:bg-[#0A84FF]/[0.07] px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 truncate">
                      <ShoppingBag
                        className="w-3 h-3 text-[#007AFF] dark:text-[#0A84FF] shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">Prochain rappel · Prioritaire</span>
                    </span>
                    <span
                      className={`text-[10px] font-semibold shrink-0 ${
                        recall.priorityLabel === 'Urgent'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-[#007AFF] dark:text-[#0A84FF]'
                      }`}
                    >
                      {recall.priorityLabel} · {recall.categoryLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SafeGameIcon
                        src={recall.itemImageUrl}
                        alt={recall.itemName}
                        fallbackLabel={recall.itemName}
                        sizeClass="w-9 h-9"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {recall.itemName}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <span>{recall.goldCost} po</span>
                          <span>·</span>
                          <span>
                            {recall.enemyDamageSplit.physicalPct}% AD /{' '}
                            {recall.enemyDamageSplit.magicPct}% AP
                          </span>
                        </div>
                      </div>
                    </div>

                    {recall.currentGold !== null && (
                      <span
                        className={`text-[10px] font-mono tabular-nums font-semibold shrink-0 ${
                          recall.affordableNow
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {recall.affordableNow
                          ? `Prêt (${recall.currentGold} po)`
                          : `-${recall.missingGold} po`}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300 line-clamp-2">
                    {recall.reason}
                  </p>

                  {recall.componentHint && (
                    <div className="pt-1.5 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0 text-slate-600 dark:text-slate-300">
                        <SafeGameIcon
                          src={recall.componentHint.itemImageUrl}
                          alt={recall.componentHint.itemName}
                          fallbackLabel={recall.componentHint.itemName}
                          sizeClass="w-4 h-4"
                        />
                        <span className="truncate">
                          Sous-composant :{' '}
                          <strong className="font-semibold text-slate-800 dark:text-slate-100">
                            {recall.componentHint.itemName}
                          </strong>
                        </span>
                      </div>
                      <span
                        className={`font-mono tabular-nums shrink-0 ${
                          recall.componentHint.affordableNow
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {recall.componentHint.goldCost} po
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.1] p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
                En attente de partie
              </div>
              <p className="text-[11px] leading-relaxed">
                Dès qu’une partie ou le pont Windows démarre, ton champion, le rang moyen du lobby, le chrono et le prochain achat prioritaire s’affichent ici.
              </p>
            </div>
          )}

          <div className="pt-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-400 dark:text-slate-500">
              Aperçu sans quitter ta page
            </span>
            <button
              type="button"
              onClick={onOpenLiveView}
              className="inline-flex items-center gap-1 font-semibold text-[#007AFF] dark:text-[#0A84FF] hover:underline whitespace-nowrap"
            >
              <span>Ouvrir</span>
              <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
