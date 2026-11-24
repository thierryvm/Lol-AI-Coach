import { computeStatAtLevel } from './championEngine.ts';
import {
  computeFullChampionBuildStats,
  HP_SCALING_CHAMPIONS,
  inferStyle,
  interpretBuildAndRunes,
  ONHIT_SPELLWEAVE_CHAMPIONS,
  parseExactItemStats,
  simulateCombatDamageAgainstTarget,
  type CombatTargetConfig,
  type FullBuildStatBreakdown,
  type RealTimeCombatDamageResult,
} from './buildSimulator.ts';
import { filterStandardCareerMatches } from './postGameEngine.ts';
import type { RunePageSelection } from './runeEngine.ts';
import type {
  ChampionSummary,
  EnemyThreatSummary,
  GameModeContext,
  ItemData,
  MatchRecord,
  PlayerTendencies,
  Role,
  RuneTree,
} from './types.ts';

export type GameplaySpecializationId =
  | 'dot_traps'
  | 'onhit_dps'
  | 'ap_burst'
  | 'battlemage_surv'
  | 'ad_crit'
  | 'ad_bruiser'
  | 'ad_lethality'
  | 'tank_frontline'
  | 'tank_scaler'
  | 'enchanter_peel';

export interface GameplaySpecializationOption {
  id: GameplaySpecializationId;
  label: string;
  shortLabel: string;
  description: string;
  recommendedForLabel?: string;
}

export interface CollectedOptimizationContext {
  championGamesCount: number;
  careerGamesCount: number;
  championWinRate: number | null;
  avgDeaths: number | null;
  avgCsPerMin: number | null;
  avgVisionPerMin: number | null;
  avgDurationMin: number | null;
  enemyJungleDeathRate: number;
  riskTag: 'high_deaths' | 'scaling_games' | 'balanced';
  frequentItemsOnChampion: string[];
  gameplaySummary: string;
  runesSummary: string;
  equipmentSummary: string;
  enemySummary: string;
}

export interface GuidedMetricsSnapshot {
  totalGold: number;
  goldEfficiencyPct: number;
  ap: number;
  ad: number;
  hp: number;
  armor: number;
  mr: number;
  attackSpeed: number;
  uncappedAttackSpeed: number;
  asOvercapPct: number;
  abilityHaste: number;
  magicPenPct: number;
  magicPenFlat: number;
  armorPenPct: number;
  lethality: number;
  antiHealPct: number;
  tenacityPct: number;
  weightedEhp: number;
  dmgVsFrontline: number;
  dmgVsSquishy: number;
  spellAndDotDmg: number;
  autoDps: number;
  combatHealing: number;
  fitScore: number;
}

export interface GuidedItemSlotChange {
  slotIndex: number;
  action: 'keep' | 'replace' | 'add';
  beforeItem: ItemData | null;
  afterItem: ItemData;
  reason: string;
}

export interface GuidedMatchupExplanation {
  targetGroupTitle: string;
  enemyNames: string[];
  recommendedAnswer: string;
  whyItWorks: string;
}

export interface GuidedTestedAlternative {
  id: string;
  title: string;
  subtitle: string;
  items: ItemData[];
  runeSelection: RunePageSelection;
  keystoneName: string;
  primaryTreeName: string;
  secondaryTreeName: string;
  metrics: GuidedMetricsSnapshot;
  whyBehindWinner: string;
}

export interface GuidedOptimizationReport {
  specialization: GameplaySpecializationOption;
  collectedContext: CollectedOptimizationContext;
  testedItemBuildsCount: number;
  testedRunePagesCount: number;
  totalSimulationsRun: number;
  frontlineTarget: CombatTargetConfig;
  squishyTarget: CombatTargetConfig;
  baselineMetrics: GuidedMetricsSnapshot;
  recommendedMetrics: GuidedMetricsSnapshot;
  baselineIssues: string[];
  recommendedItems: ItemData[];
  recommendedRuneSelection: RunePageSelection;
  recommendedKeystoneName: string;
  recommendedPrimaryTreeName: string;
  recommendedSecondaryTreeName: string;
  shouldChangeRunes: boolean;
  runeDecisionTitle: string;
  runeDecisionReasons: string[];
  runeDeltaNotes: string[];
  itemChanges: GuidedItemSlotChange[];
  matchupExplanations: GuidedMatchupExplanation[];
  executiveSummary: string;
  whyPreferredBullets: string[];
  alternatives: GuidedTestedAlternative[];
}

const DOT_TRAPS_CHAMPIONS = new Set([
  'Teemo',
  'Brand',
  'Zyra',
  'Malzahar',
  'Lillia',
  'Cassiopeia',
  'Swain',
  'Singed',
  'Heimerdinger',
  'Karthus',
  'Shaco',
  'Maokai',
  'Morgana',
  'Rumble',
  'Anivia',
]);

function normalizeText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function itemHasKeyword(it: ItemData, keywords: string[]): boolean {
  const txt = normalizeText(`${it.name} ${it.plaintext} ${it.description}`);
  return keywords.some((k) => txt.includes(k.toLowerCase()));
}

function isSpellbladeItem(it: ItemData): boolean {
  return (
    ['2510', '3100', '3078', '6662'].includes(it.id) ||
    itemHasKeyword(it, ['lame enchantée', 'spellblade'])
  );
}

function isAntiHealItem(it: ItemData): boolean {
  return (
    ['3165', '3075', '3033', '6609'].includes(it.id) ||
    itemHasKeyword(it, ['hémorragie', 'grievous wounds', 'morellonomicon', 'cotte épineuse', 'rappel mortel'])
  );
}

function isVoidPenItem(it: ItemData): boolean {
  return (
    ['3135', '3137', '4630'].includes(it.id) ||
    parseExactItemStats(it).magicPenPct >= 20
  );
}

function isArmorPenPctItem(it: ItemData): boolean {
  return (
    ['3036', '3033', '6694', '3071'].includes(it.id) ||
    parseExactItemStats(it).armorPenPct >= 20
  );
}

/**
 * Retourne les orientations de gameplay pertinentes pour le champion et le rôle sélectionnés.
 */
export function getChampionGameplaySpecializations(
  champion: ChampionSummary,
  role: Role,
): { options: GameplaySpecializationOption[]; defaultId: GameplaySpecializationId } {
  const baseStyle = inferStyle(champion, role);
  const options: GameplaySpecializationOption[] = [];

  if (champion.id === 'Teemo') {
    options.push(
      {
        id: 'dot_traps',
        label: 'Champignons, DoT & Contrôle de zone',
        shortLabel: 'Champignons & DoT',
        description:
          'Maximise les dégâts des champignons (R), brûlures (Liandry/Torche noire/Malfaisance), Hâte ultime et Pénétration magique.',
        recommendedForLabel: 'Anti-siège & teamfight',
      },
      {
        id: 'onhit_dps',
        label: 'On-Hit & Vitesse d’attaque (Split-push)',
        shortLabel: 'On-Hit & AS',
        description:
          'Optimise les auto-attaques rapides et effets à l’impact (Nashor, Guinsoo, Aube) tout en évitant le gaspillage au-dessus de 2.500/s.',
        recommendedForLabel: 'Duels & 1v1 side-lane',
      },
      {
        id: 'ap_burst',
        label: 'Burst AP & Embuscade (A + Auto)',
        shortLabel: 'Burst AP',
        description:
          'Punit les cibles fragiles sur un trade court avec gros ratio AP, Fléau de liche / Flamme-ombre et exécution.',
        recommendedForLabel: 'Compo fragile',
      },
    );
    return { options, defaultId: 'dot_traps' };
  }

  if (DOT_TRAPS_CHAMPIONS.has(champion.id) && (baseStyle === 'AP_MAGE' || role !== 'ADC')) {
    options.push(
      {
        id: 'dot_traps',
        label: 'DoT, Brûlures & Contrôle de zone',
        shortLabel: 'DoT & Contrôle',
        description:
          'Maximise les dégâts sur la durée (Liandry, Torche noire, Malfaisance), la Hâte et la tenue en combat prolongé.',
      },
      {
        id: 'ap_burst',
        label: 'Burst AP & Pénétration magique',
        shortLabel: 'Burst AP',
        description:
          'Priorise le one-shot sur les carries avec Pénétration magique, Flamme-ombre et Coiffe de Rabadon.',
      },
      {
        id: 'battlemage_surv',
        label: 'Battlemage Survie (PV + Zhonya/Banshee)',
        shortLabel: 'AP Survie',
        description:
          'Sécurise votre survie contre les assassins/engages tout en conservant un impact solide en teamfight.',
      },
    );
    return { options, defaultId: 'dot_traps' };
  }

  if (ONHIT_SPELLWEAVE_CHAMPIONS.has(champion.id)) {
    if (baseStyle === 'TANK' || HP_SCALING_CHAMPIONS.has(champion.id)) {
      options.push(
        {
          id: 'tank_scaler',
          label: 'Colosse PV Max & Sustain (Cœuracier)',
          shortLabel: 'Tank PV Max',
          description: 'Cumule un maximum de PV et de régénération pour dominer les mêlées prolongées.',
        },
        {
          id: 'onhit_dps',
          label: 'Hybride On-Hit & Duel (Aube / Lame)',
          shortLabel: 'Hybride On-Hit',
          description: 'Combine robustesse et double application d’effets à l’impact pour punir en 1v1.',
        },
        {
          id: 'tank_frontline',
          label: 'Frontline Pur & Peel Équipe',
          shortLabel: 'Frontline Peel',
          description: 'Priorise les résistances immédiates (Armure/RM) et la protection des alliés.',
        },
      );
      return { options, defaultId: 'tank_scaler' };
    }

    if (baseStyle === 'AP_MAGE') {
      options.push(
        {
          id: 'onhit_dps',
          label: 'On-Hit AP & Vitesse d’attaque',
          shortLabel: 'On-Hit AP',
          description: 'Optimise la cadence d’attaque (sous 2.500/s) et les procs à l’impact.',
        },
        {
          id: 'ap_burst',
          label: 'Burst AP & Pénétration',
          shortLabel: 'Burst AP',
          description: 'Dégâts instantanés sur sorts avec Coiffe de Rabadon et Flamme-ombre.',
        },
        {
          id: 'battlemage_surv',
          label: 'AP Survie & Combat prolongé',
          shortLabel: 'AP Survie',
          description: 'Ajoute PV, omnivamp (Failles) et Zhonya/Banshee pour tenir les escarmouches.',
        },
      );
      return { options, defaultId: 'onhit_dps' };
    }

    options.push(
      {
        id: 'onhit_dps',
        label: 'On-Hit & Anti-Tank (Vitesse d’attaque)',
        shortLabel: 'On-Hit DPS',
        description: 'Fait fondre les tanks et bruisers grâce aux effets à l’impact sans gaspiller le cap AS.',
      },
      {
        id: 'ad_crit',
        label: 'Critique & Scaling Tardif',
        shortLabel: 'Critique',
        description: 'Maximise les dégâts critiques sur les cibles prioritaires.',
      },
      {
        id: 'ad_bruiser',
        label: 'Bruiser Survie & Duel',
        shortLabel: 'Bruiser',
        description: 'Ajoute PV et résistances pour survivre aux plongeons adverses.',
      },
    );
    return { options, defaultId: 'onhit_dps' };
  }

  if (baseStyle === 'AP_MAGE') {
    options.push(
      {
        id: 'ap_burst',
        label: 'Burst AP & Pénétration',
        shortLabel: 'Burst AP',
        description: 'Élimine rapidement les cibles fragiles avec un pic de puissance immédiat.',
      },
      {
        id: 'dot_traps',
        label: 'Contrôle, DoT & Hâte de sorts',
        shortLabel: 'DoT & Hâte',
        description: 'Enchaîne les rotations de sorts et brûle les PV max face aux équipes robustes.',
      },
      {
        id: 'battlemage_surv',
        label: 'Battlemage Survie & Sécurité',
        shortLabel: 'AP Survie',
        description: 'Priorise Zhonya, Banshee et PV pour punir les compositions d’engage.',
      },
    );
    return { options, defaultId: 'ap_burst' };
  }

  if (baseStyle === 'AD_CRIT') {
    options.push(
      {
        id: 'ad_crit',
        label: 'Critique Hypercarry (DPS Max)',
        shortLabel: 'Critique DPS',
        description: 'Optimise chance de critique, AD et Pénétration d’armure sans saturer le cap AS.',
      },
      {
        id: 'onhit_dps',
        label: 'On-Hit Anti-Tank & Mobilité',
        shortLabel: 'On-Hit',
        description: 'Privilégie les dégâts en % PV et la vitesse d’attaque contre plusieurs tanks.',
      },
      {
        id: 'ad_lethality',
        label: 'Poke & Burst Létalité',
        shortLabel: 'Poke / Létalité',
        description: 'Favorise les dégâts de sorts à distance contre une équipe sans tank.',
      },
    );
    return { options, defaultId: 'ad_crit' };
  }

  if (baseStyle === 'AD_LETHALITY') {
    options.push(
      {
        id: 'ad_lethality',
        label: 'Assassinat Létalité (One-Shot Squishy)',
        shortLabel: 'Létalité',
        description: 'Maximise Létalité, AD et Hâte pour effacer les carries adverses.',
      },
      {
        id: 'ad_bruiser',
        label: 'Bruiser / Combats prolongés',
        shortLabel: 'Bruiser',
        description: 'Échange un peu de burst contre des PV, de la survie et de la Pénétration d’armure.',
      },
    );
    return { options, defaultId: 'ad_lethality' };
  }

  if (baseStyle === 'TANK') {
    options.push(
      {
        id: 'tank_frontline',
        label: 'Frontline Pur & Résistances ciblées',
        shortLabel: 'Frontline Pur',
        description: 'Maximise EHP Physique/Magique et Ténacité face aux dégâts réels de la compo.',
      },
      {
        id: 'tank_scaler',
        label: 'Colosse PV Max & Dégâts de zone',
        shortLabel: 'PV Max & Dégâts',
        description: 'Capitalise sur Cœuracier / Désespoir infini / Immolation pour menacer les carries.',
      },
    );
    return { options, defaultId: 'tank_frontline' };
  }

  if (baseStyle === 'ENCHANTER') {
    options.push(
      {
        id: 'enchanter_peel',
        label: 'Enchanteur Soins, Boucliers & Hâte',
        shortLabel: 'Enchanteur Peel',
        description: 'Maximise efficacité des soins/boucliers, Hâte et survie du duo.',
      },
      {
        id: 'ap_burst',
        label: 'Poke AP & Dégâts de lane',
        shortLabel: 'Poke AP',
        description: 'Met la pression dès le niveau 1 avec plus de puissance et pénétration.',
      },
    );
    return { options, defaultId: 'enchanter_peel' };
  }

  // AD_BRUISER par défaut
  options.push(
    {
      id: 'ad_bruiser',
      label: 'Bruiser Combattant & Sustain',
      shortLabel: 'Bruiser Duel',
      description: 'Équilibre AD, PV, Hâte et survie pour tenir les combats de longue durée.',
    },
    {
      id: 'ad_lethality',
      label: 'Burst Offensif & Pénétration',
      shortLabel: 'Burst AD',
      description: 'Plus agressif pour punir les cibles fragiles en escarmouche.',
    },
    {
      id: 'tank_frontline',
      label: 'Frontline Tanky & Engage',
      shortLabel: 'Frontline',
      description: 'Priorise les résistances et la tenue d’équipe si vous manquez de tank.',
    },
  );
  return { options, defaultId: 'ad_bruiser' };
}

/**
 * Agrège les données réelles de gameplay (matchs sur ce champion + tendances globales),
 * de runes, d'équipement choisi et de menaces adverses avant de lancer les tests.
 */
export function collectOptimizationContext(params: {
  playerChampion: ChampionSummary;
  specialization: GameplaySpecializationOption;
  currentItems: ItemData[];
  currentRuneSelection: RunePageSelection;
  runeTrees: RuneTree[];
  threats: EnemyThreatSummary;
  enemyChampions: ChampionSummary[];
  allItems?: ItemData[];
  matches?: MatchRecord[];
  tendencies?: PlayerTendencies;
}): CollectedOptimizationContext {
  const {
    playerChampion,
    specialization,
    currentItems,
    currentRuneSelection,
    runeTrees,
    threats,
    enemyChampions,
    allItems = [],
    matches = [],
    tendencies,
  } = params;

  const standardMatches = filterStandardCareerMatches(matches);
  const champMatches = standardMatches.filter(
    (m) => m.player.championName.toLowerCase() === playerChampion.id.toLowerCase(),
  );
  const sourceMatches = champMatches.length > 0 ? champMatches : standardMatches;

  let avgDeaths: number | null = tendencies?.gamesAnalyzed ? tendencies.avgDeaths : null;
  let avgCsPerMin: number | null = tendencies?.gamesAnalyzed ? tendencies.avgCsPerMin : null;
  let avgVisionPerMin: number | null = tendencies?.gamesAnalyzed ? tendencies.avgVisionPerMin : null;
  let avgDurationMin: number | null = null;
  let championWinRate: number | null = null;
  const itemFreq = new Map<string, number>();

  if (sourceMatches.length > 0) {
    const n = sourceMatches.length;
    avgDeaths = Number(
      (sourceMatches.reduce((acc, m) => acc + m.player.deaths, 0) / n).toFixed(1),
    );
    avgCsPerMin = Number(
      (sourceMatches.reduce((acc, m) => acc + m.player.csPerMin, 0) / n).toFixed(1),
    );
    avgVisionPerMin = Number(
      (
        sourceMatches.reduce(
          (acc, m) => acc + m.player.visionScore / Math.max(1, m.gameDurationSec / 60),
          0,
        ) / n
      ).toFixed(2),
    );
    avgDurationMin = Math.round(
      sourceMatches.reduce((acc, m) => acc + m.gameDurationSec / 60, 0) / n,
    );
    if (champMatches.length > 0) {
      championWinRate = Math.round(
        (champMatches.filter((m) => m.player.win).length / champMatches.length) * 100,
      );
      const itemMapById = new Map(allItems.map((it) => [Number(it.id), it]));
      for (const m of champMatches) {
        for (const itemId of m.player.items) {
          if (!itemId) continue;
          const resolved = itemMapById.get(itemId);
          if (
            resolved &&
            !resolved.tags.includes('Trinket') &&
            !resolved.tags.includes('Consumable')
          ) {
            itemFreq.set(resolved.name, (itemFreq.get(resolved.name) || 0) + 1);
          }
        }
      }
    }
  }

  const frequentItemsOnChampion = Array.from(itemFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const enemyJungleDeathRate = tendencies?.enemyJungleDeathRate || 0;
  const riskTag: CollectedOptimizationContext['riskTag'] =
    avgDeaths !== null && avgDeaths >= 6.2
      ? 'high_deaths'
      : avgDurationMin !== null && avgDurationMin >= 31
        ? 'scaling_games'
        : 'balanced';

  const pTree = runeTrees.find((t) => t.id === currentRuneSelection.primaryTreeId);
  const sTree = runeTrees.find((t) => t.id === currentRuneSelection.secondaryTreeId);
  const ks = pTree?.slots?.[0]?.runes?.find((r) => r.id === currentRuneSelection.keystoneId);

  const gameplaySummary =
    champMatches.length > 0
      ? `${champMatches.length} partie(s) sur ${playerChampion.name} (${championWinRate}% WR · ${avgDeaths} morts/m · ${avgCsPerMin} CS/m · durée moy. ${avgDurationMin} min)${frequentItemsOnChampion.length > 0 ? ` · Habitudes : ${frequentItemsOnChampion.join(', ')}` : ''}.`
      : standardMatches.length > 0
        ? `Profil global (${standardMatches.length} parties) : ${avgDeaths} morts/m · ${avgCsPerMin} CS/m · ${avgVisionPerMin} vis/m.`
        : `Aucun historique récent synchronisé : optimisation basée sur les stats Data Dragon de ${playerChampion.name} et votre orientation « ${specialization.shortLabel} ».`;

  const runesSummary = `${ks?.name || 'Fondamentale'} (${pTree?.name || 'Principal'} + ${sTree?.name || 'Secondaire'})`;

  const totalCost = currentItems.reduce((acc, it) => acc + it.gold.total, 0);
  const equipmentSummary =
    currentItems.length > 0
      ? `${currentItems.length}/6 emplacements équipés (${totalCost} po) : ${currentItems.map((i) => i.name).slice(0, 3).join(', ')}${currentItems.length > 3 ? '…' : ''}`
      : 'Aucun objet équipé pour l’instant (construction complète sur 6 emplacements).';

  const enemySummary = `${enemyChampions.map((e) => e.name).join(', ')} · ${threats.physicalShare}% Phys. / ${threats.magicShare}% Mag. · ${threats.tankCount} Tank(s) · ${threats.highHealCount} Soin(s) · ${threats.ccThreatCount} CC.`;

  return {
    championGamesCount: champMatches.length,
    careerGamesCount: standardMatches.length,
    championWinRate,
    avgDeaths,
    avgCsPerMin,
    avgVisionPerMin,
    avgDurationMin,
    enemyJungleDeathRate,
    riskTag,
    frequentItemsOnChampion,
    gameplaySummary,
    runesSummary,
    equipmentSummary,
    enemySummary,
  };
}

function buildRepresentativeEnemyTargets(
  enemyChampions: ChampionSummary[],
  threats: EnemyThreatSummary,
  simLevel: number,
): { frontlineTarget: CombatTargetConfig; squishyTarget: CombatTargetConfig } {
  const rankedByTank = [...enemyChampions].map((champ) => {
    const prof = threats.profiles.find((p) => p.championId === champ.id);
    return { champ, tankScore: prof?.tankinessScore || 35, burstScore: prof?.burstScore || 40 };
  });
  rankedByTank.sort((a, b) => b.tankScore - a.tankScore);

  const frontChamp = rankedByTank[0]?.champ || enemyChampions[0];
  const squishyChamp =
    rankedByTank[rankedByTank.length - 1]?.champ || enemyChampions[enemyChampions.length - 1];

  const midLateScale = simLevel >= 13 ? 1 : simLevel >= 9 ? 0.65 : 0.35;

  const frontlineTarget: CombatTargetConfig = frontChamp
    ? {
        id: frontChamp.id,
        name: `${frontChamp.name} (Frontline Niv.${simLevel})`,
        hp: Math.round(
          computeStatAtLevel(frontChamp.stats.hp, frontChamp.stats.hpperlevel, simLevel) +
            1050 * midLateScale,
        ),
        armor: Math.round(
          computeStatAtLevel(frontChamp.stats.armor, frontChamp.stats.armorperlevel, simLevel) +
            85 * midLateScale,
        ),
        mr: Math.round(
          computeStatAtLevel(
            frontChamp.stats.spellblock,
            frontChamp.stats.spellblockperlevel,
            simLevel,
          ) +
            60 * midLateScale,
        ),
      }
    : {
        id: 'frontline-dummy',
        name: `Frontline adverse (Niv.${simLevel})`,
        hp: 2950,
        armor: 155,
        mr: 105,
      };

  const squishyTarget: CombatTargetConfig = squishyChamp
    ? {
        id: squishyChamp.id,
        name: `${squishyChamp.name} (Carry Niv.${simLevel})`,
        hp: Math.round(
          computeStatAtLevel(squishyChamp.stats.hp, squishyChamp.stats.hpperlevel, simLevel) +
            200 * midLateScale,
        ),
        armor: Math.round(
          computeStatAtLevel(squishyChamp.stats.armor, squishyChamp.stats.armorperlevel, simLevel) +
            18 * midLateScale,
        ),
        mr: Math.round(
          computeStatAtLevel(
            squishyChamp.stats.spellblock,
            squishyChamp.stats.spellblockperlevel,
            simLevel,
          ) +
            15 * midLateScale,
        ),
      }
    : {
        id: 'squishy-dummy',
        name: `Carry adverse (Niv.${simLevel})`,
        hp: 1950,
        armor: 75,
        mr: 50,
      };

  return { frontlineTarget, squishyTarget };
}

function buildRuneVariantsForSpecialization(params: {
  runeTrees: RuneTree[];
  specId: GameplaySpecializationId;
  playerChampion: ChampionSummary;
  threats: EnemyThreatSummary;
  currentRuneSelection: RunePageSelection;
  riskTag: CollectedOptimizationContext['riskTag'];
}): Array<{ label: string; isCurrent: boolean; selection: RunePageSelection }> {
  const { runeTrees, specId, playerChampion, threats, currentRuneSelection, riskTag } = params;

  const findTree = (key: string) => runeTrees.find((t) => t.key === key);
  const prec = findTree('Precision');
  const dom = findTree('Domination');
  const sorc = findTree('Sorcery');
  const res = findTree('Resolve');
  const insp = findTree('Inspiration');

  const pickShardDef = threats.ccThreatCount >= 2 ? 1 : 2;
  const variants: Array<{ label: string; isCurrent: boolean; selection: RunePageSelection }> = [
    { label: 'Page actuelle', isCurrent: true, selection: currentRuneSelection },
  ];

  const pushUnique = (label: string, sel: RunePageSelection | null) => {
    if (!sel) return;
    const sig = `${sel.primaryTreeId}-${sel.keystoneId}-${sel.primaryMinorIds.join(',')}-${sel.secondaryTreeId}-${sel.secondaryMinorIds.join(',')}-${sel.shardIndices.join(',')}`;
    const already = variants.some((v) => {
      const s = v.selection;
      return (
        `${s.primaryTreeId}-${s.keystoneId}-${s.primaryMinorIds.join(',')}-${s.secondaryTreeId}-${s.secondaryMinorIds.join(',')}-${s.shardIndices.join(',')}` ===
        sig
      );
    });
    if (!already) variants.push({ label, isCurrent: false, selection: sel });
  };

  if (specId === 'dot_traps') {
    if (dom && sorc) {
      pushUnique('Moisson noire + Chasseur ultime (Spécialiste Champignons/R)', {
        primaryTreeId: dom.id,
        secondaryTreeId: sorc.id,
        keystoneId: 8128,
        primaryMinorIds: [8126, 8138, 8106],
        secondaryMinorIds: [8210, 8237],
        shardIndices: [0, 0, pickShardDef], // +9 Force adaptative, +9 Force adaptative
      });
    }
    if (sorc && dom) {
      pushUnique('Comète arcanique + Ruban de mana + Chasseur ultime', {
        primaryTreeId: sorc.id,
        secondaryTreeId: dom.id,
        keystoneId: 8229,
        primaryMinorIds: [8226, 8210, 8237],
        secondaryMinorIds: [8126, 8106],
        shardIndices: [2, 0, pickShardDef], // +8 Hâte, +9 Force adaptative
      });
    }
    if (sorc && res) {
      pushUnique('Comète / Aery + Volonté (Sécurité lane)', {
        primaryTreeId: sorc.id,
        secondaryTreeId: res.id,
        keystoneId: playerChampion.id === 'Teemo' ? 8214 : 8229,
        primaryMinorIds: [8226, 8210, 8237],
        secondaryMinorIds: [8473, 8451],
        shardIndices: [0, 0, pickShardDef],
      });
    }
  } else if (specId === 'onhit_dps') {
    if (prec && dom) {
      pushUnique('Attaque soutenue (+8% dégâts procs) + Goût du sang', {
        primaryTreeId: prec.id,
        secondaryTreeId: dom.id,
        keystoneId: 8005,
        primaryMinorIds: [9111, 9105, 8014], // Légende : hâte évite l'overcap si gros stuff AS
        secondaryMinorIds: [8139, 8106],
        shardIndices: [0, 0, pickShardDef],
      });
    }
    if (prec && res) {
      pushUnique('Tempo mortel / Conquérant + Volonté (Duel)', {
        primaryTreeId: prec.id,
        secondaryTreeId: res.id,
        keystoneId: playerChampion.info.attack >= 6 || playerChampion.id === 'Teemo' ? 8008 : 8010,
        primaryMinorIds: [9111, 9104, 8299],
        secondaryMinorIds: [8473, 8451],
        shardIndices: [1, 0, pickShardDef],
      });
    }
    if (prec && sorc) {
      pushUnique('Jeu de jambes (Sustain & Kite) + Célérité', {
        primaryTreeId: prec.id,
        secondaryTreeId: sorc.id,
        keystoneId: 8021,
        primaryMinorIds: [9111, 9105, 8014],
        secondaryMinorIds: [8234, 8236],
        shardIndices: [1, 0, pickShardDef],
      });
    }
  } else if (specId === 'ap_burst' || specId === 'battlemage_surv') {
    if (dom && sorc) {
      pushUnique('Électrocution / Moisson noire + Sorcellerie (Burst)', {
        primaryTreeId: dom.id,
        secondaryTreeId: sorc.id,
        keystoneId: specId === 'ap_burst' ? 8112 : 8128,
        primaryMinorIds: [8126, 8138, 8106],
        secondaryMinorIds: [8210, 8236],
        shardIndices: [0, 0, pickShardDef],
      });
    }
    if (sorc && res) {
      pushUnique('Comète arcanique + Volonté (Tenue)', {
        primaryTreeId: sorc.id,
        secondaryTreeId: res.id,
        keystoneId: 8229,
        primaryMinorIds: [8226, 8210, 8237],
        secondaryMinorIds: [8473, 8451],
        shardIndices: [2, 0, pickShardDef],
      });
    }
    if (insp && sorc) {
      pushUnique('Premier coup (Or & +7% dégâts bruts) + Transcendance', {
        primaryTreeId: insp.id,
        secondaryTreeId: sorc.id,
        keystoneId: 8369,
        primaryMinorIds: [8304, 8345, 8347],
        secondaryMinorIds: [8210, 8236],
        shardIndices: [0, 0, pickShardDef],
      });
    }
  } else if (specId === 'ad_crit') {
    if (prec && insp) {
      pushUnique('Tempo mortel / Jeu de jambes + Bottes/Biscuits', {
        primaryTreeId: prec.id,
        secondaryTreeId: insp.id,
        keystoneId: threats.burstThreatCount >= 2 || riskTag === 'high_deaths' ? 8021 : 8008,
        primaryMinorIds: [9111, 9104, 8014],
        secondaryMinorIds: [8304, 8345],
        shardIndices: [1, 0, pickShardDef],
      });
    }
    if (prec && sorc) {
      pushUnique('Attaque soutenue + Tempête menaçante', {
        primaryTreeId: prec.id,
        secondaryTreeId: sorc.id,
        keystoneId: 8005,
        primaryMinorIds: [8009, 9103, 8014],
        secondaryMinorIds: [8233, 8236],
        shardIndices: [1, 0, pickShardDef],
      });
    }
  } else if (specId === 'ad_lethality') {
    if (dom && prec) {
      pushUnique('Électrocution + Coup de grâce', {
        primaryTreeId: dom.id,
        secondaryTreeId: prec.id,
        keystoneId: 8112,
        primaryMinorIds: [8143, 8138, 8106],
        secondaryMinorIds: [9111, 8014],
        shardIndices: [0, 0, pickShardDef],
      });
    }
    if (insp && dom) {
      pushUnique('Premier coup + Chasseur ultime', {
        primaryTreeId: insp.id,
        secondaryTreeId: dom.id,
        keystoneId: 8369,
        primaryMinorIds: [8304, 8345, 8347],
        secondaryMinorIds: [8143, 8106],
        shardIndices: [0, 0, pickShardDef],
      });
    }
  } else if (specId === 'tank_scaler' || specId === 'tank_frontline') {
    if (res && prec) {
      pushUnique('Poigne de l’immortel + Légende : hâte', {
        primaryTreeId: res.id,
        secondaryTreeId: prec.id,
        keystoneId: 8437,
        primaryMinorIds: [8446, 8429, 8451],
        secondaryMinorIds: [9111, 9105],
        shardIndices: [2, 2, pickShardDef],
      });
    }
    if (res && insp) {
      pushUnique('Après-coup / Gardien + Savoir cosmique', {
        primaryTreeId: res.id,
        secondaryTreeId: insp.id,
        keystoneId: specId === 'tank_frontline' ? 8439 : 8437,
        primaryMinorIds: [8463, 8429, 8451],
        secondaryMinorIds: [8345, 8347],
        shardIndices: [2, 2, pickShardDef],
      });
    }
  } else if (specId === 'enchanter_peel') {
    if (sorc && res) {
      pushUnique('Aery + Revitalisation (Soins & Boucliers max)', {
        primaryTreeId: sorc.id,
        secondaryTreeId: res.id,
        keystoneId: 8214,
        primaryMinorIds: [8226, 8210, 8237],
        secondaryMinorIds: [8463, 8453],
        shardIndices: [2, 0, pickShardDef],
      });
    }
  } else if (prec && res) {
    pushUnique('Conquérant + Volonté (Duel & Tenue)', {
      primaryTreeId: prec.id,
      secondaryTreeId: res.id,
      keystoneId: 8010,
      primaryMinorIds: [9111, 9105, 8299],
      secondaryMinorIds: [8473, 8451],
      shardIndices: [1, 0, pickShardDef],
    });
  }

  return variants.slice(0, 4);
}

function buildCleanCandidateItemPool(
  items: ItemData[],
  gameMode: GameModeContext,
): { boots: ItemData[]; legendaries: ItemData[]; byId: Map<string, ItemData> } {
  const mapKey = gameMode === 'ARAM' ? '12' : '11';
  const dedup = new Map<string, ItemData>();

  for (const it of items) {
    if (Number(it.id) >= 100000 || !it.gold.purchasable) continue;
    if (it.maps && it.maps[mapKey] === false) continue;
    const key = it.name.trim().toLowerCase();
    const prev = dedup.get(key);
    if (!prev || Number(it.id) < Number(prev.id)) {
      dedup.set(key, it);
    }
  }

  const all = Array.from(dedup.values());
  const byId = new Map<string, ItemData>(all.map((i) => [i.id, i]));

  const boots = all.filter(
    (it) => it.tags.includes('Boots') && it.gold.total >= 800 && it.gold.total <= 1500,
  );
  const legendaries = all.filter(
    (it) =>
      !it.tags.includes('Boots') &&
      !it.tags.includes('Consumable') &&
      !it.tags.includes('Trinket') &&
      it.gold.total >= 2000 &&
      (!it.into || it.into.length === 0),
  );

  return { boots, legendaries, byId };
}

function scoreBootForSpec(
  boot: ItemData,
  specId: GameplaySpecializationId,
  threats: EnemyThreatSummary,
): number {
  const st = parseExactItemStats(boot);
  let s = 20;
  if (specId === 'dot_traps' || specId === 'ap_burst') {
    if (st.magicPenFlat > 0) s += 50;
    if (st.abilityHaste > 0) s += 42;
    if (st.tenacityPct > 0 && (threats.ccThreatCount >= 2 || threats.magicShare >= 50)) s += 44;
    if (st.armor > 0 && threats.physicalShare >= 62) s += 42;
    if (st.attackSpeedPct > 0) s -= 25;
  } else if (specId === 'onhit_dps' || specId === 'ad_crit') {
    if (st.attackSpeedPct > 0) s += 44;
    if (st.armor > 0 && threats.physicalShare >= 58) s += 42;
    if (st.tenacityPct > 0 && (threats.ccThreatCount >= 2 || threats.magicShare >= 50)) s += 42;
  } else if (specId === 'tank_frontline' || specId === 'tank_scaler' || specId === 'ad_bruiser') {
    if (st.armor > 0) s += threats.physicalShare >= 52 ? 52 : 34;
    if (st.tenacityPct > 0) s += threats.ccThreatCount >= 2 || threats.magicShare >= 48 ? 54 : 32;
    if (itemHasKeyword(boot, ['célérité', 'swiftness'])) s += 26;
  } else if (specId === 'enchanter_peel' || specId === 'battlemage_surv') {
    if (st.abilityHaste > 0) s += 46;
    if (st.tenacityPct > 0 && threats.ccThreatCount >= 2) s += 44;
    if (st.armor > 0 && threats.physicalShare >= 60) s += 40;
  } else if (specId === 'ad_lethality') {
    if (st.abilityHaste > 0) s += 46;
    if (st.tenacityPct > 0 && threats.ccThreatCount >= 2) s += 40;
    if (st.armor > 0 && threats.physicalShare >= 60) s += 38;
  }
  return s;
}

function scoreLegendaryForSpec(
  it: ItemData,
  specId: GameplaySpecializationId,
  playerChampion: ChampionSummary,
  threats: EnemyThreatSummary,
  riskTag: CollectedOptimizationContext['riskTag'],
): number {
  const st = parseExactItemStats(it);
  const id = it.id;
  const isChampMana = playerChampion.partype === 'Mana';
  let score = 0;

  if (specId === 'dot_traps') {
    if (st.ad > 0) return -100;
    score += st.ap * 0.95 + st.abilityHaste * 1.85 + st.magicPenFlat * 1.9 + st.magicPenPct * 1.5 + st.hp * 0.04;
    if (id === '6653' || itemHasKeyword(it, ['liandry'])) score += 95; // Tourment de Liandry
    if (id === '3118' || itemHasKeyword(it, ['malfaisance', 'malignance'])) score += 90; // Malfaisance (+20 Hâte R)
    if (id === '2503' || itemHasKeyword(it, ['torche noire', 'blackfire'])) score += 84; // Torche noire
    if (id === '3089' || itemHasKeyword(it, ['rabadon'])) score += 74; // Coiffe de Rabadon
    if (isVoidPenItem(it)) score += threats.tankCount >= 1 ? 76 : 55;
    if (id === '4645' || itemHasKeyword(it, ['flamme-ombre', 'shadowflame'])) score += 62;
    if (id === '3116' || itemHasKeyword(it, ['rylai'])) score += 45;
    if (id === '3157' || itemHasKeyword(it, ['zhonya'])) {
      score += threats.burstThreatCount >= 1 || riskTag === 'high_deaths' ? 68 : 34;
    }
    if (id === '3102' || itemHasKeyword(it, ['banshee'])) {
      score += threats.magicShare >= 48 || threats.ccThreatCount >= 2 ? 58 : 25;
    }
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 66 : 8;
    // Sur spécialisation Champignons/DoT, éviter les objets purement AS/Auto-attack qui détournent du kit
    if (id === '3115' || itemHasKeyword(it, ['nashor'])) score += 22;
    if (st.attackSpeedPct > 25 && id !== '3115') score -= 45;
    if (!isChampMana && st.mana > 0 && id !== '3118' && id !== '2503') score -= 12;
  } else if (specId === 'onhit_dps') {
    const isApTilt = playerChampion.info.magic >= playerChampion.info.attack || playerChampion.id === 'Teemo';
    score += st.attackSpeedPct * 1.35 + st.ap * (isApTilt ? 0.85 : 0.15) + st.ad * (isApTilt ? 0.45 : 1.1);
    if (id === '3115' || itemHasKeyword(it, ['nashor'])) score += isApTilt ? 88 : 25;
    if (id === '3124' || itemHasKeyword(it, ['guinsoo'])) score += 86;
    if (id === '2510' || itemHasKeyword(it, ['aube et crépuscule', 'dusk and dawn'])) score += 84;
    if (id === '3091' || itemHasKeyword(it, ['bout du rouleau', "wit's end"])) {
      score += threats.magicShare >= 35 || threats.ccThreatCount >= 2 ? 70 : 42;
    }
    if (id === '3153' || itemHasKeyword(it, ['roi déchu', 'ruined king'])) score += 68;
    if (id === '3302' || itemHasKeyword(it, ['terminus'])) score += 72;
    if (id === '6672' || itemHasKeyword(it, ['kraken'])) score += 62;
    if (id === '6653' || itemHasKeyword(it, ['liandry'])) score += isApTilt ? 60 : 0;
    if (id === '3087' || itemHasKeyword(it, ['statikk'])) score += 48;
    if (id === '3157' || itemHasKeyword(it, ['zhonya'])) score += isApTilt && riskTag === 'high_deaths' ? 54 : 20;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 58 : 6;
  } else if (specId === 'ap_burst') {
    if (st.ad > 0) return -100;
    score += st.ap * 1.1 + st.magicPenFlat * 2.2 + st.magicPenPct * 1.6 + st.abilityHaste * 1.1;
    if (id === '4645' || itemHasKeyword(it, ['flamme-ombre', 'shadowflame'])) score += 86;
    if (id === '3089' || itemHasKeyword(it, ['rabadon'])) score += 88;
    if (id === '6655' || itemHasKeyword(it, ['luden'])) score += 76;
    if (id === '4646' || itemHasKeyword(it, ['orageuse', 'stormsurge'])) score += 72;
    if (id === '3100' || itemHasKeyword(it, ['fléau de liche', 'lich bane'])) score += 70;
    if (isVoidPenItem(it)) score += 68;
    if (id === '6653' || itemHasKeyword(it, ['liandry'])) score += 48;
    if (id === '3157' || itemHasKeyword(it, ['zhonya'])) score += threats.burstThreatCount >= 1 || riskTag === 'high_deaths' ? 66 : 36;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 58 : 8;
  } else if (specId === 'battlemage_surv') {
    if (st.ad > 0) return -100;
    score += st.ap * 0.9 + st.hp * 0.08 + st.abilityHaste * 1.5 + st.armor * 0.8 + st.mr * 0.8;
    if (id === '6653') score += 82;
    if (id === '4633' || itemHasKeyword(it, ['failles', 'riftmaker'])) score += 78;
    if (id === '3157') score += 76;
    if (id === '3102') score += 68;
    if (id === '6657' || itemHasKeyword(it, ['séculaire', 'rod of ages'])) score += 64;
    if (isVoidPenItem(it)) score += 62;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 62 : 10;
  } else if (specId === 'ad_crit') {
    if (st.ap > 0 && id !== '3124') return -100;
    score += st.ad * 1.15 + st.critChancePct * 2.1 + st.attackSpeedPct * 1.0 + st.armorPenPct * 1.4;
    if (id === '3031' || itemHasKeyword(it, ['infini', 'infinity edge'])) score += 78;
    if (isArmorPenPctItem(it)) score += threats.tankCount >= 1 ? 68 : 44;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 64 : 10;
  } else if (specId === 'ad_lethality') {
    if (st.ap > 0) return -100;
    score += st.ad * 1.2 + st.lethality * 3.0 + st.abilityHaste * 1.4 + st.armorPenPct * 1.3;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 56 : 8;
  } else if (specId === 'tank_scaler' || specId === 'tank_frontline') {
    const isDusk = id === '2510' && ONHIT_SPELLWEAVE_CHAMPIONS.has(playerChampion.id);
    if (!isDusk && (st.ad > 45 || st.ap > 70 || st.critChancePct > 0)) return -100;
    score += st.hp * 0.06 + st.armor * 1.0 + st.mr * 1.0 + st.abilityHaste * 0.8;
    if (id === '3084') score += specId === 'tank_scaler' ? 92 : 42;
    if (id === '2502') score += 76;
    if (id === '6665') score += 72;
    if (id === '3065') score += threats.magicShare >= 30 || HP_SCALING_CHAMPIONS.has(playerChampion.id) ? 66 : 32;
    if (isDusk) score += 62;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 72 : 18;
  } else if (specId === 'enchanter_peel') {
    if (st.ad > 0) return -100;
    score += st.healShieldPowerPct * 4.5 + st.abilityHaste * 1.8 + st.ap * 0.6 + st.manaRegenPct * 0.25;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 45 : 5;
  } else {
    // ad_bruiser
    if (st.ap > 60 && !ONHIT_SPELLWEAVE_CHAMPIONS.has(playerChampion.id)) return -100;
    score += st.ad * 1.15 + st.hp * 0.06 + st.abilityHaste * 1.5 + st.armor * 0.6 + st.mr * 0.6;
    if (isAntiHealItem(it)) score += threats.highHealCount >= 1 ? 62 : 10;
  }

  if (threats.physicalShare >= 60 && st.armor >= 30) score += 20;
  if (threats.magicShare >= 50 && st.mr >= 30) score += 20;

  return score;
}

function generateSixItemCandidateBuilds(params: {
  specId: GameplaySpecializationId;
  playerChampion: ChampionSummary;
  threats: EnemyThreatSummary;
  currentItems: ItemData[];
  bootsPool: ItemData[];
  legendariesPool: ItemData[];
  riskTag: CollectedOptimizationContext['riskTag'];
}): Array<{ tag: string; items: ItemData[] }> {
  const { specId, playerChampion, threats, currentItems, bootsPool, legendariesPool, riskTag } = params;

  const rankedBoots = [...bootsPool]
    .sort((a, b) => scoreBootForSpec(b, specId, threats) - scoreBootForSpec(a, specId, threats))
    .slice(0, 3);

  const rankedLegendaries = [...legendariesPool]
    .map((it) => ({
      item: it,
      sc: scoreLegendaryForSpec(it, specId, playerChampion, threats, riskTag),
    }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.item);

  const topCore = rankedLegendaries.slice(0, 12);
  const antiHealPick = rankedLegendaries.find(isAntiHealItem);
  const voidPenPick = rankedLegendaries.find(isVoidPenItem);
  const armorPenPick = rankedLegendaries.find(isArmorPenPctItem);
  const zhonyaPick = rankedLegendaries.find((it) => it.id === '3157' || itemHasKeyword(it, ['zhonya']));
  const bansheePick = rankedLegendaries.find((it) => it.id === '3102' || itemHasKeyword(it, ['banshee']));

  // Extraire les objets compatibles déjà équipés par le joueur pour tenter une réparation ciblée
  const compatibleCurrentLegendaries = currentItems.filter(
    (it) =>
      !it.tags.includes('Boots') &&
      scoreLegendaryForSpec(it, specId, playerChampion, threats, riskTag) >= 42,
  );

  const candidates: Array<{ tag: string; items: ItemData[] }> = [];
  const seenSigs = new Set<string>();

  const tryPushBuild = (tag: string, boot: ItemData | undefined, legs: Array<ItemData | undefined>) => {
    const clean: ItemData[] = [];
    const ids = new Set<string>();
    let spellblades = 0;
    let voidPens = 0;
    let armorPens = 0;

    if (boot) {
      clean.push(boot);
      ids.add(boot.id);
    }

    const poolOrder = [...legs.filter((x): x is ItemData => Boolean(x)), ...topCore];
    for (const item of poolOrder) {
      if (clean.length >= 6) break;
      if (ids.has(item.id)) continue;
      if (isSpellbladeItem(item) && spellblades >= 1) continue;
      if (isVoidPenItem(item) && voidPens >= 1) continue;
      if (isArmorPenPctItem(item) && armorPens >= 1) continue;

      clean.push(item);
      ids.add(item.id);
      if (isSpellbladeItem(item)) spellblades += 1;
      if (isVoidPenItem(item)) voidPens += 1;
      if (isArmorPenPctItem(item)) armorPens += 1;
    }

    if (clean.length < 6) return;
    const sig = clean
      .map((x) => x.id)
      .sort()
      .join('-');
    if (seenSigs.has(sig)) return;
    seenSigs.add(sig);
    candidates.push({ tag, items: clean });
  };

  for (let bIdx = 0; bIdx < Math.min(2, rankedBoots.length); bIdx++) {
    const boot = rankedBoots[bIdx];

    // 1. Noyau pur top 5 objets de la spécialisation
    tryPushBuild('Coeur pur spécialisation', boot, topCore.slice(0, 5));

    // 2. Réparation incrémentale autour des objets déjà choisis par le joueur
    if (compatibleCurrentLegendaries.length > 0) {
      tryPushBuild('Réparation depuis votre stuff', boot, [
        ...compatibleCurrentLegendaries.slice(0, 3),
        ...topCore.slice(0, 5),
      ]);
    }

    // 3. Variante Anti-Soins (Morello / Rappel / Cotte épineuse)
    if (antiHealPick) {
      tryPushBuild('Anti-Soins ciblé', boot, [
        topCore[0],
        topCore[1],
        antiHealPick,
        voidPenPick || armorPenPick || topCore[2],
        topCore[3],
      ]);
    }

    // 4. Variante Anti-Tank (Bâton du vide / Cryptofleur / Dernier souffle)
    if (voidPenPick || armorPenPick) {
      tryPushBuild('Pénétration Anti-Tank', boot, [
        topCore[0],
        topCore[1],
        voidPenPick || armorPenPick,
        topCore[2],
        topCore[3],
      ]);
    }

    // 5. Variante Survie / Défense (Zhonya / Banshee / Top résistances)
    if (zhonyaPick || bansheePick) {
      tryPushBuild('Variante Survie & Stase', boot, [
        topCore[0],
        topCore[1],
        zhonyaPick || bansheePick,
        voidPenPick || topCore[2],
        topCore[3],
      ]);
    }

    // 6. Combinaisons glissantes sur le top 8 pour laisser les simulations départager
    for (let skip = 1; skip <= 4; skip++) {
      const sliced = topCore.filter((_, idx) => idx !== skip);
      tryPushBuild(`Variante test #${skip}`, boot, sliced.slice(0, 5));
    }

    // 7. Combinaisons avec Tech Défense + Anti-Soin ensemble si menace double
    if (antiHealPick && (zhonyaPick || bansheePick)) {
      tryPushBuild('Double contre (Anti-soin + Survie)', boot, [
        topCore[0],
        topCore[1],
        antiHealPick,
        zhonyaPick || bansheePick,
        voidPenPick || topCore[2],
      ]);
    }
  }

  return candidates.slice(0, 32);
}

function evaluateGuidedScore(params: {
  specId: GameplaySpecializationId;
  stats: FullBuildStatBreakdown;
  frontlineSim: RealTimeCombatDamageResult;
  squishySim: RealTimeCombatDamageResult;
  items: ItemData[];
  runeSelection: RunePageSelection;
  threats: EnemyThreatSummary;
  riskTag: CollectedOptimizationContext['riskTag'];
}): number {
  const { specId, stats, frontlineSim, squishySim, items, runeSelection, threats, riskTag } = params;

  const hasAntiHeal = items.some(isAntiHealItem);
  const hasVoidOrArmorPen =
    stats.totals.magicPenPct >= 20 || stats.totals.armorPenPct >= 20;
  const hasZhonyaOrBanshee = items.some(
    (it) => it.id === '3157' || it.id === '3102' || itemHasKeyword(it, ['zhonya', 'banshee']),
  );
  const hasMalignance = items.some((it) => it.id === '3118' || itemHasKeyword(it, ['malfaisance', 'malignance']));
  const hasLiandry = items.some((it) => it.id === '6653' || itemHasKeyword(it, ['liandry']));
  const hasBlackfire = items.some((it) => it.id === '2503' || itemHasKeyword(it, ['torche noire', 'blackfire']));

  let score = 0;

  if (specId === 'dot_traps') {
    score =
      frontlineSim.spellAndDotMitigated * 0.042 +
      squishySim.spellAndDotMitigated * 0.035 +
      stats.totals.abilityHaste * 0.95 +
      stats.totals.ap * 0.16 +
      stats.totals.magicPenFlat * 1.4 +
      stats.totals.magicPenPct * 0.9 +
      stats.combat.weightedEhp / 210;

    if (hasLiandry) score += 26;
    if (hasMalignance) score += 24;
    if (hasBlackfire) score += 18;
    // Bonus de runes dédiées Champignons / Sorts
    if ([8128, 8229, 8214, 8369].includes(runeSelection.keystoneId)) score += 18;
    if (
      runeSelection.primaryMinorIds.includes(8106) ||
      runeSelection.secondaryMinorIds.includes(8106)
    ) {
      score += 14; // Chasseur ultime
    }
    if (runeSelection.keystoneId === 8008) score -= 22; // Tempo mortel peu utile sur champignons
  } else if (specId === 'onhit_dps') {
    score =
      frontlineSim.totalMitigatedDamage * 0.032 +
      squishySim.totalMitigatedDamage * 0.024 +
      stats.combat.autoDps * 0.14 +
      stats.combat.onHitPerAttack * 0.25 +
      stats.combat.weightedEhp / 190;
    if ([8005, 8008, 8010, 8021].includes(runeSelection.keystoneId)) score += 16;
  } else if (specId === 'ap_burst') {
    score =
      squishySim.totalMitigatedDamage * 0.045 +
      frontlineSim.spellAndDotMitigated * 0.02 +
      stats.totals.ap * 0.2 +
      stats.totals.magicPenFlat * 1.8 +
      stats.combat.weightedEhp / 230;
    if ([8112, 8128, 8369, 8229].includes(runeSelection.keystoneId)) score += 16;
  } else if (specId === 'battlemage_surv') {
    score =
      frontlineSim.totalMitigatedDamage * 0.026 +
      squishySim.totalMitigatedDamage * 0.024 +
      stats.combat.weightedEhp / 125 +
      stats.totals.abilityHaste * 0.8 +
      frontlineSim.combatHealingTotal * 0.08;
  } else if (specId === 'tank_scaler' || specId === 'tank_frontline') {
    score =
      stats.combat.weightedEhp / 95 +
      frontlineSim.totalMitigatedDamage * 0.016 +
      frontlineSim.combatHealingTotal * 0.12 +
      stats.totals.tenacityPct * 1.1;
    if ([8437, 8439, 8465].includes(runeSelection.keystoneId)) score += 18;
  } else if (specId === 'enchanter_peel') {
    score =
      stats.totals.healShieldPowerPct * 3.8 +
      stats.totals.abilityHaste * 1.4 +
      stats.combat.weightedEhp / 140 +
      squishySim.spellAndDotMitigated * 0.012;
  } else {
    // ad_crit / ad_bruiser / ad_lethality
    score =
      frontlineSim.totalMitigatedDamage * 0.026 +
      squishySim.totalMitigatedDamage * 0.03 +
      stats.combat.weightedEhp / (specId === 'ad_bruiser' ? 140 : 210) +
      frontlineSim.combatHealingTotal * 0.07;
  }

  // Pénalités réelles pour défauts détectés
  if (stats.totals.asOvercapPct > 0) {
    score -= Math.min(85, stats.totals.asOvercapPct * 1.9);
  }
  if (stats.spellbladeItemsCount >= 2) score -= 70;
  if (stats.bootsCount >= 2) score -= 90;
  if (stats.bootsCount === 0 && items.length >= 4) score -= 45;

  // Adéquation face aux menaces adverses
  if (threats.highHealCount >= 1) {
    score += hasAntiHeal ? 22 : -14;
  }
  if (threats.tankCount >= 2 && (specId === 'dot_traps' || specId === 'ap_burst' || specId === 'ad_crit')) {
    score += hasVoidOrArmorPen ? 20 : -12;
  }
  if (threats.ccThreatCount >= 2 && stats.totals.tenacityPct >= 20) {
    score += 14;
  }
  if ((riskTag === 'high_deaths' || threats.burstThreatCount >= 2) && hasZhonyaOrBanshee) {
    score += 18;
  }

  return Number(score.toFixed(2));
}

function toMetricsSnapshot(params: {
  stats: FullBuildStatBreakdown;
  frontlineSim: RealTimeCombatDamageResult;
  squishySim: RealTimeCombatDamageResult;
  rawScore: number;
  bestRawScore: number;
}): GuidedMetricsSnapshot {
  const { stats, frontlineSim, squishySim, rawScore, bestRawScore } = params;
  const fitScore = Math.max(
    42,
    Math.min(99, Math.round(96 * (rawScore / Math.max(1, bestRawScore)))),
  );
  return {
    totalGold: stats.combat.totalGold,
    goldEfficiencyPct: stats.combat.goldEfficiencyPct,
    ap: stats.totals.ap,
    ad: stats.totals.ad,
    hp: stats.totals.hp,
    armor: stats.totals.armor,
    mr: stats.totals.mr,
    attackSpeed: stats.totals.attackSpeed,
    uncappedAttackSpeed: stats.totals.uncappedAttackSpeed,
    asOvercapPct: stats.totals.asOvercapPct,
    abilityHaste: stats.totals.abilityHaste,
    magicPenPct: stats.totals.magicPenPct,
    magicPenFlat: stats.totals.magicPenFlat,
    armorPenPct: stats.totals.armorPenPct,
    lethality: stats.totals.lethality,
    antiHealPct: stats.totals.antiHealPct,
    tenacityPct: stats.totals.tenacityPct,
    weightedEhp: stats.combat.weightedEhp,
    dmgVsFrontline: frontlineSim.totalMitigatedDamage,
    dmgVsSquishy: squishySim.totalMitigatedDamage,
    spellAndDotDmg: frontlineSim.spellAndDotMitigated,
    autoDps: stats.combat.autoDps,
    combatHealing: frontlineSim.combatHealingTotal,
    fitScore,
  };
}

/**
 * Assistant Stratégique par Simulation Réelle :
 * 1) Collecte les données de gameplay, runes, objets actuels et menaces adverses
 * 2) Teste réellement le setup actuel comme référence
 * 3) Simule des dizaines de builds 6 objets × pages de runes face à une Frontline et un Carry adverses
 * 4) Propose la meilleure solution corrigée + explications détaillées par type d'ennemi et alternatives testées.
 */
export function runGuidedCoachOptimization(params: {
  gameMode: GameModeContext;
  playerChampion: ChampionSummary;
  role: Role;
  simLevel: number;
  specializationId: GameplaySpecializationId;
  currentItems: ItemData[];
  currentRuneSelection: RunePageSelection;
  enemyChampions: ChampionSummary[];
  threats: EnemyThreatSummary;
  items: ItemData[];
  runeTrees: RuneTree[];
  matches?: MatchRecord[];
  tendencies?: PlayerTendencies;
  heartsteelStacksHp?: number;
}): GuidedOptimizationReport {
  const {
    gameMode,
    playerChampion,
    role,
    simLevel,
    specializationId,
    currentItems,
    currentRuneSelection,
    enemyChampions,
    threats,
    items,
    runeTrees,
    matches,
    tendencies,
    heartsteelStacksHp = 0,
  } = params;

  const specCatalog = getChampionGameplaySpecializations(playerChampion, role);
  const specialization =
    specCatalog.options.find((o) => o.id === specializationId) || specCatalog.options[0];

  const collectedContext = collectOptimizationContext({
    playerChampion,
    specialization,
    currentItems,
    currentRuneSelection,
    runeTrees,
    threats,
    enemyChampions,
    allItems: items,
    matches,
    tendencies,
  });

  const { frontlineTarget, squishyTarget } = buildRepresentativeEnemyTargets(
    enemyChampions,
    threats,
    simLevel,
  );

  const spellCountFrontline =
    specialization.id === 'dot_traps' || specialization.id === 'ap_burst' ? 3 : 2;
  const spellCountSquishy = 2;

  // 1. Mesure réelle du setup actuel (Baseline)
  const baselineStats = computeFullChampionBuildStats({
    champion: playerChampion,
    role,
    level: simLevel,
    items: currentItems,
    runeSelection: currentRuneSelection,
    threats,
    heartsteelStacksHp,
  });
  const baselineFrontSim = simulateCombatDamageAgainstTarget({
    champion: playerChampion,
    role,
    level: simLevel,
    items: currentItems,
    runeSelection: currentRuneSelection,
    target: frontlineTarget,
    durationSec: 6,
    spellCasts: spellCountFrontline,
    heartsteelStacksHp,
    threats,
  });
  const baselineSquishySim = simulateCombatDamageAgainstTarget({
    champion: playerChampion,
    role,
    level: simLevel,
    items: currentItems,
    runeSelection: currentRuneSelection,
    target: squishyTarget,
    durationSec: 4,
    spellCasts: spellCountSquishy,
    heartsteelStacksHp,
    threats,
  });

  const baselineRawScore = evaluateGuidedScore({
    specId: specialization.id,
    stats: baselineStats,
    frontlineSim: baselineFrontSim,
    squishySim: baselineSquishySim,
    items: currentItems,
    runeSelection: currentRuneSelection,
    threats,
    riskTag: collectedContext.riskTag,
  });

  const baselineInterp = interpretBuildAndRunes({
    champion: playerChampion,
    role,
    level: simLevel,
    items: currentItems,
    runeSelection: currentRuneSelection,
    runeTrees,
    stats: baselineStats,
    threats,
  });

  const baselineIssues: string[] = baselineInterp.diagnostics
    .filter((d) => d.tone === 'rose' || d.tone === 'amber')
    .map((d) => `${d.title} — ${d.statusLabel}`);

  // 2. Génération des candidats 6 objets × variantes de runes
  const { boots: bootsPool, legendaries: legendariesPool } = buildCleanCandidateItemPool(
    items,
    gameMode,
  );
  const itemBuilds = generateSixItemCandidateBuilds({
    specId: specialization.id,
    playerChampion,
    threats,
    currentItems,
    bootsPool,
    legendariesPool,
    riskTag: collectedContext.riskTag,
  });
  const runeVariants = buildRuneVariantsForSpecialization({
    runeTrees,
    specId: specialization.id,
    playerChampion,
    threats,
    currentRuneSelection,
    riskTag: collectedContext.riskTag,
  });

  interface EvaluatedPair {
    tag: string;
    items: ItemData[];
    runeVariant: (typeof runeVariants)[number];
    stats: FullBuildStatBreakdown;
    frontSim: RealTimeCombatDamageResult;
    squishySim: RealTimeCombatDamageResult;
    rawScore: number;
  }

  const evaluatedPairs: EvaluatedPair[] = [];

  for (const build of itemBuilds) {
    for (const rv of runeVariants) {
      const stats = computeFullChampionBuildStats({
        champion: playerChampion,
        role,
        level: simLevel,
        items: build.items,
        runeSelection: rv.selection,
        threats,
        heartsteelStacksHp,
      });
      const frontSim = simulateCombatDamageAgainstTarget({
        champion: playerChampion,
        role,
        level: simLevel,
        items: build.items,
        runeSelection: rv.selection,
        target: frontlineTarget,
        durationSec: 6,
        spellCasts: spellCountFrontline,
        heartsteelStacksHp,
        threats,
      });
      const squishySim = simulateCombatDamageAgainstTarget({
        champion: playerChampion,
        role,
        level: simLevel,
        items: build.items,
        runeSelection: rv.selection,
        target: squishyTarget,
        durationSec: 4,
        spellCasts: spellCountSquishy,
        heartsteelStacksHp,
        threats,
      });
      const rawScore = evaluateGuidedScore({
        specId: specialization.id,
        stats,
        frontlineSim: frontSim,
        squishySim: squishySim,
        items: build.items,
        runeSelection: rv.selection,
        threats,
        riskTag: collectedContext.riskTag,
      });
      evaluatedPairs.push({
        tag: build.tag,
        items: build.items,
        runeVariant: rv,
        stats,
        frontSim,
        squishySim,
        rawScore,
      });
    }
  }

  evaluatedPairs.sort((a, b) => b.rawScore - a.rawScore);

  const winner = evaluatedPairs[0];
  const bestRawScore = Math.max(winner?.rawScore || 1, baselineRawScore, 1);

  const baselineMetrics = toMetricsSnapshot({
    stats: baselineStats,
    frontlineSim: baselineFrontSim,
    squishySim: baselineSquishySim,
    rawScore: baselineRawScore,
    bestRawScore,
  });

  if (!winner) {
    return {
      specialization,
      collectedContext,
      testedItemBuildsCount: 0,
      testedRunePagesCount: runeVariants.length,
      totalSimulationsRun: 0,
      frontlineTarget,
      squishyTarget,
      baselineMetrics,
      recommendedMetrics: baselineMetrics,
      baselineIssues,
      recommendedItems: currentItems,
      recommendedRuneSelection: currentRuneSelection,
      recommendedKeystoneName: 'Actuelle',
      recommendedPrimaryTreeName: 'Principal',
      recommendedSecondaryTreeName: 'Secondaire',
      shouldChangeRunes: false,
      runeDecisionTitle: 'Conservez votre page actuelle',
      runeDecisionReasons: ['Aucun objet éligible trouvé pour cette carte.'],
      runeDeltaNotes: [],
      itemChanges: [],
      matchupExplanations: [],
      executiveSummary: 'Votre configuration actuelle reste la référence active.',
      whyPreferredBullets: [],
      alternatives: [],
    };
  }

  // Vérifier si changer les runes apporte un vrai gain mesurable (> 4% de score) ou si l'actuelle suffit
  const bestWithCurrentRunes = evaluatedPairs.find(
    (p) =>
      p.runeVariant.isCurrent &&
      p.items.map((i) => i.id).sort().join('-') === winner.items.map((i) => i.id).sort().join('-'),
  ) || evaluatedPairs.find((p) => p.runeVariant.isCurrent);

  const runeGainPct = bestWithCurrentRunes
    ? Math.round(
        ((winner.rawScore - bestWithCurrentRunes.rawScore) /
          Math.max(1, bestWithCurrentRunes.rawScore)) *
          100,
      )
    : 0;

  const shouldChangeRunes = !winner.runeVariant.isCurrent && runeGainPct >= 3;
  const finalWinner = shouldChangeRunes ? winner : bestWithCurrentRunes || winner;

  const recommendedMetrics = toMetricsSnapshot({
    stats: finalWinner.stats,
    frontlineSim: finalWinner.frontSim,
    squishySim: finalWinner.squishySim,
    rawScore: finalWinner.rawScore,
    bestRawScore,
  });

  const resolveRuneName = (id: number): string => {
    for (const t of runeTrees) {
      for (const sl of t.slots) {
        const r = sl.runes.find((x) => x.id === id);
        if (r) return r.name;
      }
    }
    return `Rune #${id}`;
  };

  const pTree = runeTrees.find((t) => t.id === finalWinner.runeVariant.selection.primaryTreeId);
  const sTree = runeTrees.find((t) => t.id === finalWinner.runeVariant.selection.secondaryTreeId);
  const recommendedKeystoneName = resolveRuneName(finalWinner.runeVariant.selection.keystoneId);

  // Vérifier si l'orientation actuelle a déjà un mismatch spécifique de gameplay dans le baseline
  const currentKeystoneName = resolveRuneName(currentRuneSelection.keystoneId);
  if (
    specialization.id === 'dot_traps' &&
    currentRuneSelection.keystoneId === 8008 &&
    !baselineIssues.some((x) => x.includes('Tempo mortel'))
  ) {
    baselineIssues.unshift(
      `Rune ${currentKeystoneName} inadaptée au style « ${specialization.shortLabel} » (n’augmente ni les dégâts des champignons ni les DoT).`,
    );
  }
  if (
    specialization.id === 'dot_traps' &&
    currentItems.some((it) => ['3087', '3124'].includes(it.id))
  ) {
    baselineIssues.unshift(
      'Objets orientés auto-attaques (Guinsoo/Statikk) équipés sur une spécialisation Champignons & DoT.',
    );
  }

  // Comparaison slot par slot (Objets)
  const itemChanges: GuidedItemSlotChange[] = finalWinner.items.map((afterItem, idx) => {
    const beforeItem = currentItems[idx] || null;
    const keptAnywhere = currentItems.some((c) => c.id === afterItem.id);
    if (beforeItem && beforeItem.id === afterItem.id) {
      return {
        slotIndex: idx,
        action: 'keep',
        beforeItem,
        afterItem,
        reason: 'Objet déjà optimal pour votre spécialisation et la compo adverse.',
      };
    }

    let reason = `Apporte ${parseExactItemStats(afterItem).ap > 0 ? `+${parseExactItemStats(afterItem).ap} AP` : ''}`;
    if (afterItem.tags.includes('Boots')) {
      reason = `Bottes optimales pour « ${specialization.shortLabel} » face à ${threats.physicalShare}% Phys. / ${threats.magicShare}% Mag. sans gaspiller le cap AS.`;
    } else if (afterItem.id === '6653') {
      reason = 'Brûlure 2% PV max/s indispensable sur vos sorts/champignons contre la frontline.';
    } else if (afterItem.id === '3118') {
      reason = '+20 Hâte sur votre Ultime (R) + zone de réduction de RM (-10 RM) sous vos pièges/sorts.';
    } else if (afterItem.id === '2503') {
      reason = 'Cumule sa brûlure avec Liandry et offre +4% AP bonus + mana confortable en siège.';
    } else if (isVoidPenItem(afterItem)) {
      reason = `Perce la Résistance magique de ${frontlineTarget.name} (${frontlineTarget.mr} RM) pour maintenir vos dégâts en fin de partie.`;
    } else if (isAntiHealItem(afterItem)) {
      reason = `Applique 40% Hémorragie indispensable contre ${threats.highHealCount} champion(s) à fort soin.`;
    } else if (afterItem.id === '3157') {
      reason = 'Stase (Zhonya) + Armure pour survivre au burst et aux engages adverses.';
    } else if (afterItem.id === '3102') {
      reason = 'Bouclier antisort + RM pour éviter de vous faire attraper par les contrôles adverses.';
    } else if (afterItem.id === '3089') {
      reason = 'Multiplie toute votre Puissance (+30% AP) pour faire exploser les ratios de vos sorts/DoT.';
    } else if (afterItem.id === '2510') {
      reason = 'Lame enchantée + Double On-Hit + soin en duel pour rentabiliser votre kit hybride.';
    } else if (keptAnywhere) {
      reason = 'Objet déjà présent dans votre build, conservé et repositionné dans le plan.';
    } else {
      const tags = [];
      const st = parseExactItemStats(afterItem);
      if (st.ap > 0) tags.push(`+${st.ap} AP`);
      if (st.ad > 0) tags.push(`+${st.ad} AD`);
      if (st.hp > 0) tags.push(`+${st.hp} PV`);
      if (st.abilityHaste > 0) tags.push(`+${st.abilityHaste} Hâte`);
      reason = `Meilleur score mesuré dans nos tests (${tags.join(' · ') || 'passif fort'}).`;
    }

    return {
      slotIndex: idx,
      action: beforeItem ? 'replace' : 'add',
      beforeItem,
      afterItem,
      reason,
    };
  });

  // Décision sur les runes & explications chiffrées
  const runeDecisionReasons: string[] = [];
  const runeDeltaNotes: string[] = [];

  if (shouldChangeRunes && bestWithCurrentRunes) {
    const curDmg = bestWithCurrentRunes.frontSim.spellAndDotMitigated;
    const newDmg = finalWinner.frontSim.spellAndDotMitigated;
    const dmgDiff = newDmg - curDmg;
    runeDecisionReasons.push(
      `Passer de « ${currentKeystoneName} » à « ${recommendedKeystoneName} » (${pTree?.name || ''} + ${sTree?.name || ''}) améliore le score global de +${runeGainPct}% sur les tests avec ce stuff.`,
    );
    if (dmgDiff !== 0) {
      runeDeltaNotes.push(
        `${dmgDiff > 0 ? '+' : ''}${dmgDiff} dégâts Sorts/DoT sur ${frontlineTarget.name}`,
      );
    }
    if (
      finalWinner.runeVariant.selection.primaryMinorIds.includes(8106) ||
      finalWinner.runeVariant.selection.secondaryMinorIds.includes(8106)
    ) {
      runeDeltaNotes.push('+31 Hâte sur Ultime (Chasseur ultime)');
    }
    if (finalWinner.stats.totals.asOvercapPct < baselineMetrics.asOvercapPct) {
      runeDeltaNotes.push('Supprime l’excès de vitesse d’attaque inutile');
    }
  } else {
    runeDecisionReasons.push(
      `Vos runes actuelles (« ${currentKeystoneName} ») tiennent déjà la route dans nos tests avec ce build (écart inférieur à 3% face aux alternatives). Vous pouvez les garder !`,
    );
  }

  // Explications par type de champion présent dans la compo adverse
  const matchupExplanations: GuidedMatchupExplanation[] = [];
  const healEnemies = enemyChampions.filter((e) => {
    const p = threats.profiles.find((pr) => pr.championId === e.id);
    return (p?.sustainScore || 0) >= 68;
  });
  const tankEnemies = enemyChampions.filter((e) => {
    const p = threats.profiles.find((pr) => pr.championId === e.id);
    return (p?.tankinessScore || 0) >= 65;
  });
  const burstEnemies = enemyChampions.filter((e) => {
    const p = threats.profiles.find((pr) => pr.championId === e.id);
    return (p?.burstScore || 0) >= 72;
  });
  const ccEnemies = enemyChampions.filter((e) => {
    const p = threats.profiles.find((pr) => pr.championId === e.id);
    return (p?.ccScore || 0) >= 68;
  });

  if (healEnemies.length > 0) {
    const antiHealIt = finalWinner.items.find(isAntiHealItem);
    matchupExplanations.push({
      targetGroupTitle: 'Combattants & Soins élevés',
      enemyNames: healEnemies.map((e) => e.name),
      recommendedAnswer: antiHealIt
        ? `${antiHealIt.name} (40% Hémorragie)`
        : 'Orbe de l’oubli / Anti-soin situationnel',
      whyItWorks: antiHealIt
        ? `Coupe de 40% la régénération de ${healEnemies.map((e) => e.name).join(' et ')} pendant toute la durée de vos brûlures/attaques.`
        : `Vos dégâts bruts (${recommendedMetrics.dmgVsFrontline} sur ${frontlineTarget.name}) suffisent si un allié applique Hémorragie ; sinon prenez Orbe de l’oubli (800 po).`,
    });
  }

  if (tankEnemies.length > 0 || frontlineTarget.mr >= 95 || frontlineTarget.armor >= 130) {
    const penItem =
      finalWinner.items.find(isVoidPenItem) ||
      finalWinner.items.find(isArmorPenPctItem) ||
      finalWinner.items.find((i) => i.id === '6653');
    matchupExplanations.push({
      targetGroupTitle: 'Frontline & Tanks robustes',
      enemyNames: tankEnemies.length > 0 ? tankEnemies.map((e) => e.name) : [frontlineTarget.name],
      recommendedAnswer: penItem
        ? `${penItem.name} + ${recommendedMetrics.magicPenPct > 0 ? `${recommendedMetrics.magicPenPct}% Pén. Mag.` : `${recommendedMetrics.armorPenPct}% Pén. Arm.`}`
        : `DPS soutenu (${recommendedMetrics.dmgVsFrontline} dégâts en 6s)`,
      whyItWorks: `Permet d’infliger ${recommendedMetrics.dmgVsFrontline} dégâts réels en 6s malgré les ${frontlineTarget.mr} RM / ${frontlineTarget.armor} Armure de ${frontlineTarget.name}.`,
    });
  }

  if (burstEnemies.length > 0) {
    const defItem = finalWinner.items.find((i) =>
      ['3157', '3102', '3065', '6665', '3143', '2504'].includes(i.id),
    );
    matchupExplanations.push({
      targetGroupTitle: 'Assassins & Burst rapide',
      enemyNames: burstEnemies.map((e) => e.name),
      recommendedAnswer: defItem
        ? `${defItem.name} (${recommendedMetrics.weightedEhp} EHP)`
        : `${recommendedMetrics.hp} PV & placement longue portée`,
      whyItWorks: defItem
        ? `Évite le one-shot par ${burstEnemies.map((e) => e.name).join(' / ')}${collectedContext.riskTag === 'high_deaths' ? ' (priorisé aussi car votre historique montre des morts fréquentes)' : ''}.`
        : `Le jeu à distance et la pose de pièges/zone limitent l’accès direct à votre champion (${recommendedMetrics.dmgVsSquishy} dégâts sur ${squishyTarget.name} en 4s).`,
    });
  }

  if (ccEnemies.length > 0 && matchupExplanations.length < 4) {
    matchupExplanations.push({
      targetGroupTitle: 'Contrôles de foule (CC) & Engage',
      enemyNames: ccEnemies.map((e) => e.name),
      recommendedAnswer:
        recommendedMetrics.tenacityPct > 0
          ? `${recommendedMetrics.tenacityPct}% Ténacité cumulée`
          : 'Contrôle de zone & distance de sécurité',
      whyItWorks:
        recommendedMetrics.tenacityPct > 0
          ? `Réduit la durée des étourdissements de ${ccEnemies.map((e) => e.name).join(', ')} pour continuer à kiter.`
          : `Vos zones/ralentissements empêchent ${ccEnemies.map((e) => e.name).join(', ')} d’engager facilement sans subir un lourd poke.`,
    });
  }

  // 2 alternatives contrastées (avec objets différents de la solution gagnante)
  const winnerSig = finalWinner.items
    .map((i) => i.id)
    .sort()
    .join('-');
  const alternatives: GuidedTestedAlternative[] = [];
  const usedAltSigs = new Set<string>([winnerSig]);

  for (const cand of evaluatedPairs) {
    if (alternatives.length >= 2) break;
    const sig = cand.items
      .map((i) => i.id)
      .sort()
      .join('-');
    if (usedAltSigs.has(sig)) continue;
    usedAltSigs.add(sig);

    const altMetrics = toMetricsSnapshot({
      stats: cand.stats,
      frontlineSim: cand.frontSim,
      squishySim: cand.squishySim,
      rawScore: cand.rawScore,
      bestRawScore: finalWinner.rawScore,
    });

    const altPTree = runeTrees.find((t) => t.id === cand.runeVariant.selection.primaryTreeId);
    const altSTree = runeTrees.find((t) => t.id === cand.runeVariant.selection.secondaryTreeId);
    const altKs = resolveRuneName(cand.runeVariant.selection.keystoneId);

    const dmgDiffFront = finalWinner.frontSim.totalMitigatedDamage - cand.frontSim.totalMitigatedDamage;
    const ehpDiff = finalWinner.stats.combat.weightedEhp - cand.stats.combat.weightedEhp;

    let whyBehind = `Score global ${altMetrics.fitScore}/100 contre ${recommendedMetrics.fitScore}/100 pour la solution retenue.`;
    if (dmgDiffFront > 80) {
      whyBehind = `Inflige ${dmgDiffFront} dégâts de moins sur ${frontlineTarget.name} en 6s tout en restant à ${altMetrics.fitScore}/100.`;
    } else if (ehpDiff > 250) {
      whyBehind = `Plus fragile (${ehpDiff} EHP de moins que la solution retenue) face à cette composition.`;
    }

    alternatives.push({
      id: `alt-${sig}-${cand.runeVariant.selection.keystoneId}`,
      title: cand.tag,
      subtitle: `${altKs} · ${cand.stats.combat.totalGold} po`,
      items: cand.items,
      runeSelection: cand.runeVariant.selection,
      keystoneName: altKs,
      primaryTreeName: altPTree?.name || 'Principal',
      secondaryTreeName: altSTree?.name || 'Secondaire',
      metrics: altMetrics,
      whyBehindWinner: whyBehind,
    });
  }

  // Synthèse finale chiffrée
  const spellDiff = recommendedMetrics.spellAndDotDmg - baselineMetrics.spellAndDotDmg;
  const frontDiff = recommendedMetrics.dmgVsFrontline - baselineMetrics.dmgVsFrontline;
  const squishyDiff = recommendedMetrics.dmgVsSquishy - baselineMetrics.dmgVsSquishy;

  const whyPreferredBullets: string[] = [];
  if (frontDiff !== 0) {
    whyPreferredBullets.push(
      `Dégâts contre Frontline (${frontlineTarget.name}) : ${baselineMetrics.dmgVsFrontline} → ${recommendedMetrics.dmgVsFrontline} (${frontDiff > 0 ? `+${frontDiff}` : frontDiff} en 6s).`,
    );
  }
  if (spellDiff > 40) {
    whyPreferredBullets.push(
      `Dégâts Sorts / DoT / Pièges : ${baselineMetrics.spellAndDotDmg} → ${recommendedMetrics.spellAndDotDmg} (+${spellDiff}) avec ${recommendedMetrics.abilityHaste} Hâte.`,
    );
  }
  if (squishyDiff !== 0) {
    whyPreferredBullets.push(
      `Pression sur Carry (${squishyTarget.name}) : ${baselineMetrics.dmgVsSquishy} → ${recommendedMetrics.dmgVsSquishy} (${squishyDiff > 0 ? `+${squishyDiff}` : squishyDiff} en 4s).`,
    );
  }
  if (baselineMetrics.asOvercapPct > 0 && recommendedMetrics.asOvercapPct === 0) {
    whyPreferredBullets.push(
      `Élimine totalement le gaspillage de vitesse d’attaque (${baselineMetrics.asOvercapPct}% perdus au-delà du cap 2.500/s → 0%).`,
    );
  }
  if (collectedContext.riskTag === 'high_deaths') {
    whyPreferredBullets.push(
      `Adapté à votre profil (${collectedContext.avgDeaths} morts/partie) avec ${recommendedMetrics.weightedEhp} EHP pondéré pour éviter de tomber trop vite.`,
    );
  }

  const executiveSummary = `Sur ${evaluatedPairs.length} simulations réelles (${itemBuilds.length} builds complets × ${runeVariants.length} pages de runes) pour « ${specialization.label} », cette configuration atteint ${recommendedMetrics.fitScore}/100 (contre ${baselineMetrics.fitScore}/100 pour votre setup actuel) tout en s’adaptant à ${enemyChampions.length} menaces adverses.`;

  return {
    specialization,
    collectedContext,
    testedItemBuildsCount: itemBuilds.length,
    testedRunePagesCount: runeVariants.length,
    totalSimulationsRun: evaluatedPairs.length,
    frontlineTarget,
    squishyTarget,
    baselineMetrics,
    recommendedMetrics,
    baselineIssues,
    recommendedItems: finalWinner.items,
    recommendedRuneSelection: finalWinner.runeVariant.selection,
    recommendedKeystoneName,
    recommendedPrimaryTreeName: pTree?.name || 'Principal',
    recommendedSecondaryTreeName: sTree?.name || 'Secondaire',
    shouldChangeRunes,
    runeDecisionTitle: shouldChangeRunes
      ? `Modification conseillée : ${currentKeystoneName} → ${recommendedKeystoneName}`
      : `Conserver vos runes actuelles (${currentKeystoneName})`,
    runeDecisionReasons,
    runeDeltaNotes,
    itemChanges,
    matchupExplanations,
    executiveSummary,
    whyPreferredBullets,
    alternatives,
  };
}
