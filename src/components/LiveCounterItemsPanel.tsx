import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  analyzeLiveEnemyCounters,
  type LiveCounterAnalysisReport,
} from '../engines/liveCounterItemsEngine.ts';
import type {
  ChampionSummary,
  ItemData,
  LiveCoachSnapshot,
  LivePlayerEquipmentRow,
  Role,
} from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';

interface LiveCounterItemsPanelProps {
  enemyPlayers: LivePlayerEquipmentRow[];
  allyPlayers: LivePlayerEquipmentRow[];
  selfChampionName: string;
  role: Role;
  champions: ChampionSummary[];
  items: ItemData[];
  patchVersion: string;
  activeStats?: LiveCoachSnapshot['activeStats'];
  currentGold: number;
  gameMode?: string;
}

type CounterFilter = 'ALL' | 'URGENT' | 'AFFORDABLE';

const STYLE_LABELS: Record<LiveCounterAnalysisReport['playerBuildStyle'], string> = {
  AD_CRIT: 'AD Critique / Attaque',
  AD_BRUISER: 'Combattant AD',
  AD_LETHALITY: 'Létalité / Assassin AD',
  AP_MAGE: 'Puissance (AP)',
  TANK: 'Tank / Frontline',
  ENCHANTER: 'Enchanteur / Utilitaire',
};

export function LiveCounterItemsPanel({
  enemyPlayers,
  allyPlayers,
  selfChampionName,
  role,
  champions,
  items,
  patchVersion,
  activeStats,
  currentGold,
  gameMode,
}: LiveCounterItemsPanelProps) {
  const [filter, setFilter] = useState<CounterFilter>('ALL');

  const report = useMemo(
    () =>
      analyzeLiveEnemyCounters({
        enemyPlayers,
        allyPlayers,
        selfChampionName,
        role,
        champions,
        items,
        activeStats,
        currentGold,
        gameMode,
      }),
    [
      enemyPlayers,
      allyPlayers,
      selfChampionName,
      role,
      champions,
      items,
      activeStats,
      currentGold,
      gameMode,
    ],
  );

  const filteredSuggestions = useMemo(() => {
    if (filter === 'URGENT') {
      return report.suggestions.filter((s) => s.priority === 'Urgent');
    }
    if (filter === 'AFFORDABLE') {
      return report.suggestions.filter((s) => s.affordableNow);
    }
    return report.suggestions;
  }, [report.suggestions, filter]);

  const itemImageMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const it of items) {
      map.set(Number(it.id), it.imageUrl);
    }
    return map;
  }, [items]);

  const getItemImg = (itemId: number) =>
    itemImageMap.get(itemId) ||
    (patchVersion
      ? `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/item/${itemId}.png`
      : undefined);

  const affordableCount = report.suggestions.filter((s) => s.affordableNow).length;
  const urgentCount = report.suggestions.filter((s) => s.priority === 'Urgent').length;

  return (
    <section
      aria-label="Analyse des builds adverses et contre-objets en temps réel"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4"
    >
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Analyseur de Builds Adverses &amp; Contre-Objets en direct</span>
            </h2>
            <SectionInfoTooltip
              title="Recommandations adaptatives Data Dragon"
              description="Analyse en continu chaque objet acheté par les 5 adversaires (stats AD, AP, Critique, Vitesse d'attaque, Armure, RM, Vol de vie, Boucliers via Data Dragon) et croise ces menaces avec votre champion, votre build en cours et votre or disponible."
              usageTip="Cliquez sur « Achetable » juste avant votre rappel pour voir les contre-objets ou composants à 800 po que vous pouvez acheter immédiatement."
            />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Profil détecté :{' '}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {STYLE_LABELS[report.playerBuildStyle]}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Or disponible : {currentGold.toLocaleString('fr-FR')} po
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {report.itemsPurchasedCount} objet(s) ennemi(s) analysé(s)
            </span>
          </div>
        </div>

        {enemyPlayers.length > 0 && (
          <div
            className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] p-0.5 text-[11px] shrink-0"
            role="group"
            aria-label="Filtrer les contre-objets suggérés"
          >
            {(
              [
                { id: 'ALL', label: `Tous (${report.suggestions.length})` },
                { id: 'URGENT', label: `Urgents (${urgentCount})` },
                { id: 'AFFORDABLE', label: `Achetables (${affordableCount})` },
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
        )}
      </div>

      {enemyPlayers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] px-4 py-5 text-center">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
            Aucun champion adverse dans cette session
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Ajoutez un bot dans l’Outil d’entraînement ou lancez une partie pour analyser les achats ennemis et obtenir vos contre-objets Data Dragon en temps réel.
          </p>
        </div>
      ) : (
        <>
          {/* Indicateurs agrégés issus des builds ennemis */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Pression dégâts ennemie
              </div>
              <div className="mt-1 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {report.teamPhysicalThreatPct}% Phys. · {report.teamMagicThreatPct}% Mag.
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-sky-500/30 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${report.teamPhysicalThreatPct}%` }}
                  aria-hidden="true"
                />
                <div
                  className="bg-sky-500 h-full transition-all duration-300"
                  style={{ width: `${report.teamMagicThreatPct}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Stats défensives achetées
              </div>
              <div className="mt-1 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                +{report.totalEnemyBonusArmor} Arm · +{report.totalEnemyBonusMr} RM
              </div>
              <div className="mt-0.5 text-[10.5px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                +{report.totalEnemyBonusHp.toLocaleString('fr-FR')} PV bonus cumulés
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Sustain &amp; Critique
              </div>
              <div className="mt-1 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {report.healThreatCount} soin(s) · {report.critThreatCount} crit / AS
              </div>
              <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                {report.healThreatCount > 0
                  ? 'Hémorragie recommandée'
                  : 'Pas de soin majeur acheté'}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] px-3.5 py-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Robustesse &amp; Boucliers
              </div>
              <div className="mt-1 text-xs font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {report.tankThreatCount} tank(s) · {report.shieldThreatCount} bouclier(s)
              </div>
              <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                {report.tankThreatCount > 0
                  ? 'Pénétration ou % PV utile'
                  : 'Cibles globalement fragiles'}
              </div>
            </div>
          </div>

          {/* Lecture rapide des builds adverses & stats Data Dragon calculées */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-200/80 dark:divide-slate-800/80 bg-slate-50/40 dark:bg-[#0D121C]">
            {report.enemyAnalyses.map((enemy) => {
              const sourceRow = enemyPlayers.find(
                (p) => p.championName.toLowerCase() === enemy.championName.toLowerCase(),
              );
              const statParts: string[] = [];
              if (enemy.bonusAd > 0) statParts.push(`+${enemy.bonusAd} AD`);
              if (enemy.bonusAp > 0) statParts.push(`+${enemy.bonusAp} AP`);
              if (enemy.critPct > 0) statParts.push(`${enemy.critPct}% Crit`);
              if (enemy.bonusAsPct > 0) statParts.push(`+${enemy.bonusAsPct}% AS`);
              if (enemy.bonusArmor > 0) statParts.push(`+${enemy.bonusArmor} Arm`);
              if (enemy.bonusMr > 0) statParts.push(`+${enemy.bonusMr} RM`);
              if (enemy.bonusHp > 0) statParts.push(`+${enemy.bonusHp} PV`);

              const flags: string[] = [];
              if (enemy.hasHealOrLifesteal) flags.push('Soin');
              if (enemy.hasShieldItems) flags.push('Bouclier');

              return (
                <div
                  key={enemy.championName}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0 md:w-56 shrink-0">
                    <SafeGameIcon
                      src={enemy.imageUrl}
                      alt={enemy.displayName}
                      fallbackLabel={enemy.displayName}
                      sizeClass="w-7 h-7 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {enemy.displayName}{' '}
                        <span className="font-mono tabular-nums font-normal text-slate-500 dark:text-slate-400">
                          ({enemy.kda})
                        </span>
                      </div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                        {enemy.dominantProfile}
                        {flags.length > 0 ? ` · ${flags.join(' + ')}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300 truncate">
                    {statParts.length > 0
                      ? statParts.join(' · ')
                      : `Niv.${enemy.level} · ~${enemy.estimatedArmor} Arm / ~${enemy.estimatedMr} RM (départ)`}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(sourceRow?.items || []).slice(0, 6).map((it, idx) => (
                      <div
                        key={`${enemy.championName}-counter-it-${it.itemId}-${idx}`}
                        title={`${it.displayName}${it.price ? ` (${it.price} po)` : ''}`}
                      >
                        <SafeGameIcon
                          src={getItemImg(it.itemId)}
                          alt={it.displayName}
                          fallbackLabel={it.displayName}
                          sizeClass="w-6 h-6"
                        />
                      </div>
                    ))}
                    {enemy.goldSpent > 0 && (
                      <span className="ml-1.5 text-[10.5px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {enemy.goldSpent.toLocaleString('fr-FR')} po
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contre-objets suggérés */}
          {filteredSuggestions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-4 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
              {report.suggestions.length === 0
                ? 'En attente des premiers achats ennemis complets — aucun contre-objet spécifique requis pour le moment.'
                : 'Aucun contre-objet ne correspond à ce filtre avec votre or actuel. Passez sur « Tous » pour voir les prochains achats.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredSuggestions.map((s) => {
                const priorityClass =
                  s.priority === 'Urgent'
                    ? 'text-rose-600 dark:text-rose-400'
                    : s.priority === 'Recommandé'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-sky-600 dark:text-sky-400';

                return (
                  <div
                    key={s.item.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0D121C] p-3.5 flex flex-col justify-between gap-2.5"
                  >
                    <div className="flex items-start gap-3">
                      <SafeGameIcon
                        src={s.item.imageUrl}
                        alt={s.item.name}
                        fallbackLabel={s.item.name}
                        sizeClass="w-10 h-10 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {s.item.name}
                          </h3>
                          <span className="text-[11px] font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                            {s.item.gold.total.toLocaleString('fr-FR')} po
                          </span>
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10.5px]">
                          <span className={`font-semibold ${priorityClass}`}>{s.priority}</span>
                          <span aria-hidden="true" className="text-slate-400">
                            ·
                          </span>
                          <span className="text-slate-600 dark:text-slate-300 font-medium">
                            {s.category}
                          </span>
                          {s.affordableNow && (
                            <>
                              <span aria-hidden="true" className="text-slate-400">
                                ·
                              </span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                Achetable maintenant
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {s.reason}
                    </p>

                    {s.targetEnemies.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80 text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                        Cible(s) :{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {s.targetEnemies.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
