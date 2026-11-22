import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Link2,
  MapPin,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Users,
  Zap,
} from 'lucide-react';
import {
  analyzeLiveCompositionSynergy,
  type AlliedSynergyCandidate,
  type ComboTrait,
} from '../engines/liveCompositionSynergyEngine.ts';
import type {
  ChampionDetail,
  ChampionSummary,
  LivePlayerEquipmentRow,
  Role,
} from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';

interface LiveCompositionSynergyPanelProps {
  selfChampionName: string;
  allyPlayers: LivePlayerEquipmentRow[];
  preferredRole: Role;
  champions: ChampionSummary[];
  championKits: Record<string, ChampionDetail>;
  gameTimeSec: number;
  gameMode?: string;
  activeSpellCooldownKeys?: Set<string>;
}

type SynergyFilter = 'ALL' | 'CHAIN_CC' | 'ALIVE';

const TRAIT_LABELS: Record<ComboTrait, string> = {
  HARD_CC: 'Contrôle fort',
  ENGAGE: 'Engage',
  BURST: 'Burst',
  PEEL: 'Peel / Protection',
  AOE_ULT: 'Ultime AoE',
};

function getArchetypeStyle(archetype: AlliedSynergyCandidate['archetype']) {
  switch (archetype) {
    case 'CC Enchaîné':
      return {
        badge: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/30',
        bar: 'bg-[#007AFF] dark:bg-[#0A84FF]',
        Icon: Link2,
      };
    case 'Engage + Burst':
      return {
        badge: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30',
        bar: 'bg-amber-500',
        Icon: Zap,
      };
    case 'Peel & Hypercarry':
      return {
        badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        bar: 'bg-emerald-500',
        Icon: Shield,
      };
    case 'Wombo-Combo AoE':
      return {
        badge: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/30',
        bar: 'bg-violet-500',
        Icon: Sparkles,
      };
    default:
      return {
        badge: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
        bar: 'bg-indigo-500',
        Icon: Swords,
      };
  }
}

export function LiveCompositionSynergyPanel({
  selfChampionName,
  allyPlayers,
  preferredRole,
  champions,
  championKits,
  gameTimeSec,
  gameMode,
  activeSpellCooldownKeys,
}: LiveCompositionSynergyPanelProps) {
  const [filter, setFilter] = useState<SynergyFilter>('ALL');
  const [selectedAllyName, setSelectedAllyName] = useState<string | null>(null);

  const report = useMemo(
    () =>
      analyzeLiveCompositionSynergy({
        selfChampionName,
        allyPlayers,
        preferredRole,
        champions,
        championKits,
        gameTimeSec,
        gameMode,
        activeSpellCooldownKeys,
      }),
    [
      selfChampionName,
      allyPlayers,
      preferredRole,
      champions,
      championKits,
      gameTimeSec,
      gameMode,
      activeSpellCooldownKeys,
    ],
  );

  const filteredCandidates = useMemo(() => {
    if (filter === 'CHAIN_CC') {
      return report.candidates.filter((c) => c.archetype === 'CC Enchaîné');
    }
    if (filter === 'ALIVE') {
      return report.candidates.filter((c) => !c.isDead);
    }
    return report.candidates;
  }, [report.candidates, filter]);

  const focusedCandidate = useMemo(() => {
    if (selectedAllyName) {
      const found = report.candidates.find(
        (c) => c.championName.toLowerCase() === selectedAllyName.toLowerCase(),
      );
      if (found) return found;
    }
    return report.bestCandidate;
  }, [report.candidates, report.bestCandidate, selectedAllyName]);

  const isTopAutoPick = Boolean(
    focusedCandidate &&
      report.bestCandidate &&
      focusedCandidate.championName === report.bestCandidate.championName,
  );

  const selfTraitsText =
    report.selfProfile.traits.slice(0, 3).map((t) => TRAIT_LABELS[t]).join(' · ') || 'Polyvalent';

  return (
    <section
      aria-label="Visualisation de synergie de composition et combos alliés"
      className="rounded-2xl apple-surface p-4 sm:p-5 space-y-4"
    >
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="w-4 h-4 text-[#007AFF] dark:text-[#0A84FF] shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Synergie de composition · Meilleur binôme Combo
            </h2>
            <SectionInfoTooltip
              title="Comment est calculé le meilleur allié pour un combo ?"
              description="L'algorithme analyse en direct votre position détectée sur la carte, le rôle et la proximité de chaque allié, les contrôles (CC) de leurs sorts via Data Dragon, et leur disponibilité immédiate (en vie, niveau 6+, ultime prêt)."
              usageTip="Cliquez sur n'importe quel allié dans le classement pour prévisualiser votre séquence de combo 1 → 2 avec lui."
            />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#007AFF]/10 text-[#007AFF] dark:text-[#0A84FF] font-semibold">
              <MapPin className="w-3 h-3" aria-hidden="true" />
              Position détectée : {report.detectedPositionLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
              <Compass className="w-3 h-3 text-slate-400" aria-hidden="true" />
              {report.gamePhaseLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>Votre profil : {selfTraitsText}</span>
          </div>
        </div>

        {/* Filtres */}
        <div
          role="group"
          aria-label="Filtrer les partenaires de synergie"
          className="inline-flex rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.04] p-0.5 text-[11px] self-start lg:self-auto shrink-0"
        >
          {(
            [
              { id: 'ALL', label: `Tous (${report.candidates.length})` },
              {
                id: 'CHAIN_CC',
                label: `CC Enchaîné (${report.candidates.filter((c) => c.archetype === 'CC Enchaîné').length})`,
              },
              { id: 'ALIVE', label: 'En vie' },
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
      </div>

      {/* Corps : État solo ou Visualisation complète */}
      {!focusedCandidate ? (
        <div className="rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.1] bg-slate-50/70 dark:bg-[#0E1015]/80 px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
          Aucun coéquipier détecté dans cette session (mode solo / Outil d’entraînement). Dès que des
          alliés sont présents, le meilleur candidat de combo s’affiche ici automatiquement.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Colonne gauche : Diagramme visuel du combo focus */}
          <div className="xl:col-span-7 rounded-xl border border-black/[0.07] dark:border-white/[0.09] bg-slate-50/85 dark:bg-[#0E1015] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const st = getArchetypeStyle(focusedCandidate.archetype);
                  const ArchIcon = st.Icon;
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border ${st.badge}`}
                    >
                      <ArchIcon className="w-3.5 h-3.5" aria-hidden="true" />
                      {focusedCandidate.archetype}
                    </span>
                  );
                })()}
                {isTopAutoPick ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-semibold rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                    Meilleur candidat en direct
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedAllyName(null)}
                    className="text-[11px] font-medium text-[#007AFF] dark:text-[#0A84FF] hover:underline"
                  >
                    Revenir au #1 recommandé
                  </button>
                )}
              </div>

              <span className="text-[11px] font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                Score Synergie : {focusedCandidate.synergyScore}/100
              </span>
            </div>

            {/* Connexion visuelle Vous <---> Allié */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16181D] p-3.5">
              {/* Vous */}
              <div className="flex items-center gap-2.5 min-w-0">
                <SafeGameIcon
                  src={report.selfProfile.imageUrl}
                  alt={report.selfProfile.displayName}
                  fallbackLabel={report.selfProfile.displayName}
                  sizeClass="w-11 h-11 rounded-xl shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#007AFF] dark:text-[#0A84FF]">
                    Vous · {report.detectedPositionLabel}
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {report.selfProfile.displayName}
                  </div>
                  {report.selfProfile.primarySpell && (
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-300">
                      <SafeGameIcon
                        src={report.selfProfile.primarySpell.imageUrl}
                        alt={report.selfProfile.primarySpell.name}
                        fallbackLabel={report.selfProfile.primarySpell.slot}
                        sizeClass="w-4 h-4 rounded"
                      />
                      <span className="truncate font-medium">
                        {report.selfProfile.primarySpell.slot} · {report.selfProfile.primarySpell.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Lien central */}
              <div className="flex sm:flex-col items-center justify-center gap-1 px-2">
                <div className="px-2.5 py-1 rounded-lg bg-[#007AFF]/10 border border-[#007AFF]/25 text-center">
                  <div className="text-xs font-bold font-mono tabular-nums text-[#007AFF] dark:text-[#0A84FF]">
                    {focusedCandidate.synergyScore}%
                  </div>
                  <div className="text-[9.5px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {focusedCandidate.proximityLabel}
                  </div>
                </div>
              </div>

              {/* Allié ciblé */}
              <div className="flex items-center gap-2.5 min-w-0 sm:flex-row-reverse sm:text-right">
                <SafeGameIcon
                  src={focusedCandidate.imageUrl}
                  alt={focusedCandidate.displayName}
                  fallbackLabel={focusedCandidate.displayName}
                  sizeClass={`w-11 h-11 rounded-xl shrink-0 ${
                    focusedCandidate.isDead ? 'grayscale opacity-65' : ''
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Allié · {focusedCandidate.positionLabel}
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {focusedCandidate.displayName}
                  </div>
                  {focusedCandidate.profile.primarySpell ? (
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-300 sm:flex-row-reverse">
                      <SafeGameIcon
                        src={focusedCandidate.profile.primarySpell.imageUrl}
                        alt={focusedCandidate.profile.primarySpell.name}
                        fallbackLabel={focusedCandidate.profile.primarySpell.slot}
                        sizeClass="w-4 h-4 rounded"
                      />
                      <span className="truncate font-medium">
                        {focusedCandidate.profile.primarySpell.slot} ·{' '}
                        {focusedCandidate.profile.primarySpell.name}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[10.5px] text-slate-500">
                      Niv. {focusedCandidate.level} · {focusedCandidate.kda}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Séquence de combo recommandée 1 -> 2 */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                Séquence d’exécution recommandée
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                {focusedCandidate.comboSequence.map((step, sIdx) => (
                  <div key={step.step} className="contents">
                    <div className="flex items-center gap-2.5 rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16181D] px-3 py-2 min-w-0">
                      <span className="w-5 h-5 rounded-md bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {step.step}
                      </span>
                      {step.spellImageUrl && (
                        <SafeGameIcon
                          src={step.spellImageUrl}
                          alt={step.spellLabel}
                          fallbackLabel={String(step.step)}
                          sizeClass="w-6 h-6 rounded shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-slate-900 dark:text-white truncate">
                          {step.actor} · {step.spellLabel}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {step.effectLabel}
                        </div>
                      </div>
                    </div>
                    {sIdx === 0 && (
                      <div className="hidden sm:flex items-center justify-center text-slate-400">
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Décomposition visuelle des 3 critères + raisons tactiques */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                {
                  label: 'Position',
                  val: focusedCandidate.breakdown.positionScore,
                  max: 35,
                  color: 'bg-[#007AFF] dark:bg-[#0A84FF]',
                },
                {
                  label: 'Combo & CC',
                  val: focusedCandidate.breakdown.comboScore,
                  max: 40,
                  color: 'bg-violet-500',
                },
                {
                  label: 'Disponibilité',
                  val: focusedCandidate.breakdown.readinessScore,
                  max: 25,
                  color: focusedCandidate.isDead ? 'bg-rose-500' : 'bg-emerald-500',
                },
              ].map((metric) => {
                const pct = Math.min(100, Math.max(4, Math.round((metric.val / metric.max) * 100)));
                return (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-white/80 dark:bg-[#16181D]/80 px-2.5 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 dark:text-slate-400">{metric.label}</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                        {metric.val}/{metric.max}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${metric.color} transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
              {focusedCandidate.reasons.slice(0, 3).map((reason, idx) => (
                <li key={idx} className="leading-relaxed">
                  · {reason}
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne droite : Classement interactif des 4 alliés */}
          <div className="xl:col-span-5 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 px-1">
              <span>Classement des alliés en temps réel</span>
              <span className="font-normal text-slate-400">Cliquez pour inspecter</span>
            </div>

            {filteredCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.1] p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                Aucun allié ne correspond à ce filtre pour l’instant.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCandidates.map((cand, idx) => {
                  const isFocused = cand.championName === focusedCandidate.championName;
                  const st = getArchetypeStyle(cand.archetype);

                  return (
                    <button
                      key={cand.championName}
                      type="button"
                      onClick={() => setSelectedAllyName(cand.championName)}
                      className={`w-full text-left rounded-xl border p-3 transition-all ${
                        isFocused
                          ? 'border-[#007AFF]/60 bg-[#007AFF]/[0.06] dark:bg-[#0A84FF]/[0.1] shadow-xs'
                          : 'border-black/[0.06] dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0E1015] hover:border-black/[0.15] dark:hover:border-white/[0.18]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-md text-[10px] font-bold font-mono flex items-center justify-center shrink-0 ${
                              idx === 0 && !cand.isDead
                                ? 'bg-emerald-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            #{idx + 1}
                          </span>
                          <SafeGameIcon
                            src={cand.imageUrl}
                            alt={cand.displayName}
                            fallbackLabel={cand.displayName}
                            sizeClass={`w-8 h-8 rounded-lg shrink-0 ${
                              cand.isDead ? 'grayscale opacity-60' : ''
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {cand.displayName}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                · {cand.positionLabel}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                              <span className={`px-1.5 py-0.2 rounded border font-medium ${st.badge}`}>
                                {cand.archetype}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {cand.proximityLabel}
                              </span>
                              {cand.isDead ? (
                                <span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-semibold">
                                  <Skull className="w-2.5 h-2.5" aria-hidden="true" />
                                  Mort
                                </span>
                              ) : (
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  Niv.{cand.level} · {cand.ultReady ? 'R prêt' : 'Pré-6 / R CD'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                            {cand.synergyScore}
                          </div>
                          <div className="text-[9.5px] text-slate-400 font-mono">/ 100</div>
                        </div>
                      </div>

                      {/* Barre horizontale + icônes de sorts CC */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              cand.isDead ? 'bg-slate-400' : st.bar
                            } transition-all duration-300`}
                            style={{ width: `${cand.synergyScore}%` }}
                          />
                        </div>
                        {cand.profile.comboSpells.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            {cand.profile.comboSpells.slice(0, 3).map((sp) => (
                              <SafeGameIcon
                                key={sp.slot}
                                src={sp.imageUrl}
                                alt={`${sp.slot} · ${sp.name}`}
                                fallbackLabel={sp.slot}
                                sizeClass="w-4 h-4 rounded"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
