import { CheckCircle2, Circle, RotateCcw, ShoppingBag, Sparkles } from 'lucide-react';
import {
  evaluateStartPhaseChecklist,
  formatAbilityKeyFr,
  type AbilityKey,
  type SkillOrderTrackerState,
} from '../engines/liveSkillOrderEngine.ts';
import type {
  ChampionDetail,
  ChampionSummary,
  ItemData,
  LiveCoachSnapshot,
  Role,
} from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

interface LivePhaseStartPanelProps {
  snapshot: LiveCoachSnapshot;
  role: Role;
  champion?: ChampionSummary | null;
  championKit?: ChampionDetail;
  itemsCatalog?: ItemData[];
  patchVersion: string;
  skillTracker: SkillOrderTrackerState;
  onSimulateSkillPoint?: (key: AbilityKey) => void;
  onResetSkillOrder?: () => void;
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const KEY_BADGE_STYLES: Record<AbilityKey, string> = {
  Q: 'bg-[#007AFF]/12 text-[#007AFF] dark:bg-[#0A84FF]/15 dark:text-[#64D2FF] border-[#007AFF]/25',
  W: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  E: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25',
  R: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25',
};

export function LivePhaseStartPanel({
  snapshot,
  role,
  champion,
  championKit,
  itemsCatalog,
  patchVersion,
  skillTracker,
  onSimulateSkillPoint,
  onResetSkillOrder,
}: LivePhaseStartPanelProps) {
  const startCheck = evaluateStartPhaseChecklist({
    snapshot,
    role,
    champion,
    championKit,
    itemsCatalog,
    skillSequence: skillTracker.sequence,
  });

  const firstThree = skillTracker.sequence.slice(0, 3);
  const completedCount = startCheck.checklist.filter((c) => c.done).length;

  return (
    <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16181D] p-5 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
            Étape 1 · Départ : Matériel &amp; Ordre des compétences
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Détecte automatiquement vos achats à la fontaine et l’ordre exact dans lequel vous débloquez A, Z, E et R (Niv. 1 → 18).
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
          Prêt : <span className="font-semibold text-[#007AFF] dark:text-[#0A84FF]">{completedCount}/3</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne gauche : Check-list matériel de départ */}
        <div className="lg:col-span-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
              Vérification départ ({role})
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {snapshot.currentGold} po en poche
            </span>
          </div>

          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06] rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#111318]">
            {startCheck.checklist.map((item) => (
              <div key={item.id} className="p-3 flex items-start gap-2.5">
                {item.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <div
                    className={`text-xs font-semibold ${
                      item.done
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Inventaire actuellement détecté */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Objets détectés sur {champion?.name || snapshot.championName} :
            </div>
            {startCheck.ownedItems.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {startCheck.ownedItems.map((it, idx) => (
                  <div
                    key={`${it.itemId}-${idx}`}
                    title={`${it.displayName} (${it.price} po)`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.07] text-[11px] text-slate-700 dark:text-slate-200"
                  >
                    <SafeGameIcon
                      src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/item/${it.itemId}.png`}
                      alt={it.displayName}
                      fallbackLabel={it.displayName.slice(0, 2)}
                      sizeClass="w-4 h-4 rounded"
                    />
                    <span className="truncate max-w-[130px]">{it.displayName}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Aucun objet détecté pour l’instant · Recommandé : {startCheck.recommendedStarterLabel}
              </p>
            )}
          </div>
        </div>

        {/* Colonne droite : Ordre des compétences auto-détecté (1 -> 18) */}
        <div className="lg:col-span-7 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
                Compétences choisies automatiquement (Niv. 1 → 18)
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Priorité conseillée : <span className="font-medium text-slate-700 dark:text-slate-200">{startCheck.recommendedMaxPriority}</span>
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {onSimulateSkillPoint && (
                <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06]">
                  {(['Q', 'W', 'E', 'R'] as AbilityKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onSimulateSkillPoint(k)}
                      title={`Simuler ou enregistrer +1 point sur ${formatAbilityKeyFr(k)}`}
                      className="px-2 py-1 text-[11px] font-mono font-semibold rounded-md text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-[#2C2E36] transition-colors"
                    >
                      +{k === 'Q' ? 'A' : k === 'W' ? 'Z' : k}
                    </button>
                  ))}
                </div>
              )}
              {onResetSkillOrder && skillTracker.sequence.length > 0 && (
                <button
                  type="button"
                  onClick={onResetSkillOrder}
                  title="Réinitialiser l’historique des sorts"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Résumé des 3 premiers sorts (Niv. 1, 2, 3) */}
          <div className="grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((idx) => {
              const ev = firstThree[idx];
              const spellIndex = ev ? ({ Q: 0, W: 1, E: 2, R: 3 } as const)[ev.key] : -1;
              const spellObj = spellIndex >= 0 ? championKit?.spells?.[spellIndex] : undefined;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#111318] p-2.5 flex items-center gap-2.5"
                >
                  {spellObj ? (
                    <SafeGameIcon
                      src={spellObj.imageUrl}
                      alt={spellObj.name}
                      fallbackLabel={ev.key}
                      sizeClass="w-8 h-8 rounded-lg"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-white/[0.06] flex items-center justify-center text-xs font-mono font-semibold text-slate-500">
                      {idx + 1}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">
                      Choix #{idx + 1} (Niv. {idx + 1})
                    </div>
                    {ev ? (
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {formatAbilityKeyFr(ev.key)}
                        {!ev.inferred && (
                          <span className="ml-1 text-[10px] font-mono text-slate-400">
                            · {formatClock(ev.gameTimeSec)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 dark:text-slate-500">
                        En attente…
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline complète des 18 niveaux */}
          <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
            {Array.from({ length: 18 }, (_, i) => {
              const stepNum = i + 1;
              const ev = skillTracker.sequence[i];
              const displayLetter = ev
                ? ev.key === 'Q'
                  ? 'A'
                  : ev.key === 'W'
                    ? 'Z'
                    : ev.key
                : '·';
              return (
                <div
                  key={stepNum}
                  title={
                    ev
                      ? `Niveau ${stepNum} : ${formatAbilityKeyFr(ev.key)} (rang ${ev.newRank}) à ${formatClock(ev.gameTimeSec)}${ev.inferred ? ' — détecté à la connexion' : ''}`
                      : `Niveau ${stepNum} — pas encore attribué`
                  }
                  className={`rounded-lg border px-1.5 py-1.5 text-center transition-colors ${
                    ev
                      ? KEY_BADGE_STYLES[ev.key]
                      : 'border-black/[0.05] dark:border-white/[0.06] bg-slate-50/60 dark:bg-[#111318] text-slate-400 dark:text-slate-600'
                  }`}
                >
                  <div className="text-[9px] font-mono tabular-nums opacity-75">N.{stepNum}</div>
                  <div className="text-xs font-bold font-mono leading-tight mt-0.5">
                    {displayLetter}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">
              Rangs actuels : A {skillTracker.lastLevels.Q} · Z {skillTracker.lastLevels.W} · E{' '}
              {skillTracker.lastLevels.E} · R {skillTracker.lastLevels.R}
            </span>
            <span>
              Détection en direct dès que vous montez un sort dans League of Legends
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
