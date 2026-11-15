import { computeStatAtLevel } from './championEngine.ts';
import type {
  BuildRecommendation,
  ChampionSummary,
  EnemyThreatSummary,
  Role,
  RuneSlotItem,
  RuneTree,
} from './types.ts';

export interface RunePageSelection {
  primaryTreeId: number;
  secondaryTreeId: number;
  keystoneId: number;
  primaryMinorIds: number[]; // 3 runes (slots 1, 2, 3)
  secondaryMinorIds: number[]; // 2 runes (from 2 distinct slots in 1..3)
  shardIndices: [number, number, number];
}

export interface RuneStatSnapshot {
  hp: number;
  ad: number;
  ap: number;
  attackSpeed: number;
  armor: number;
  mr: number;
  moveSpeed: number;
  abilityHaste: number;
  tenacityPct: number;
  healShieldPowerPct: number;
}

export interface RuneStatDeltaRow {
  key: string;
  label: string;
  customValue: string;
  metaValue: string;
  deltaLabel: string;
  direction: 'up' | 'down' | 'equal';
}

export interface RuneMechanicNote {
  source: string;
  category: 'Keystone' | 'Combinaison' | 'Survie' | 'Tempo & Ressources' | 'Fragments';
  effect: string;
}

export interface RuneComparisonResult {
  score: number;
  verdict:
    | 'Optimal (Méta)'
    | 'Excellent choix alternatif'
    | 'Viable (Situationnel)'
    | 'Sous-optimal pour ce match-up';
  verdictTone: 'emerald' | 'sky' | 'amber' | 'rose';
  summary: string;
  matchedCount: number;
  shardMatchCount: number;
  pros: string[];
  tradeoffs: string[];
  mechanics: RuneMechanicNote[];
  statRows: RuneStatDeltaRow[];
}

const KEYSTONE_MECHANICS: Record<
  number,
  {
    styles: Array<'AD_CRIT' | 'AD_BRUISER' | 'AD_LETHALITY' | 'AP_MAGE' | 'TANK' | 'ENCHANTER'>;
    effect: string;
    burstRating: number;
    sustainRating: number;
    dpsRating: number;
    tankRating: number;
  }
> = {
  // Précision
  8005: {
    styles: ['AD_CRIT', 'AD_BRUISER'],
    effect: 'Attaque soutenue : 3 attaques de base déclenchent un burst et augmentent vos dégâts de +8% en combat.',
    burstRating: 3,
    sustainRating: 0,
    dpsRating: 4,
    tankRating: 0,
  },
  8008: {
    styles: ['AD_CRIT', 'AD_BRUISER'],
    effect: 'Tempo mortel : cumule jusqu’à +30%–48% de vitesse d’attaque et ajoute des dégâts à l’impact en combat prolongé.',
    burstRating: 0,
    sustainRating: 0,
    dpsRating: 5,
    tankRating: 0,
  },
  8021: {
    styles: ['AD_CRIT', 'AP_MAGE', 'AD_BRUISER'],
    effect: 'Jeu de jambes : soin régulier sur attaque chargée + bref boost de vitesse de déplacement pour kiter ou survivre en lane.',
    burstRating: 0,
    sustainRating: 4,
    dpsRating: 2,
    tankRating: 1,
  },
  8010: {
    styles: ['AD_BRUISER', 'AP_MAGE'],
    effect: 'Conquérant : cumule jusqu’à 12 effets d’AD/AP adaptatif en mêlée/sort et soigne pour 8% des dégâts infligés.',
    burstRating: 1,
    sustainRating: 4,
    dpsRating: 5,
    tankRating: 1,
  },
  // Domination
  8112: {
    styles: ['AD_LETHALITY', 'AP_MAGE'],
    effect: 'Électrocution : 3 coups/sorts distincts en 3s infligent un gros burst immédiat pour punir les trades courts.',
    burstRating: 5,
    sustainRating: 0,
    dpsRating: 1,
    tankRating: 0,
  },
  8128: {
    styles: ['AP_MAGE', 'AD_LETHALITY'],
    effect: 'Moisson noire : récolte des âmes sous 50% PV ennemis ; scaling infini sur champignons, poke longue portée et exécutions.',
    burstRating: 4,
    sustainRating: 0,
    dpsRating: 2,
    tankRating: 0,
  },
  9923: {
    styles: ['AD_LETHALITY', 'AD_BRUISER', 'AD_CRIT', 'TANK'],
    effect: 'Déluge de lames : +110% vitesse d’attaque sur les 3 premières attaques pour appliquer vite passif/CC en all-in.',
    burstRating: 4,
    sustainRating: 0,
    dpsRating: 3,
    tankRating: 0,
  },
  // Sorcellerie
  8214: {
    styles: ['ENCHANTER', 'AP_MAGE'],
    effect: 'Invocation d’Aery : bouclier supplémentaire sur vos alliés ou poke fiable à chaque sort/auto-attaque en lane.',
    burstRating: 1,
    sustainRating: 3,
    dpsRating: 2,
    tankRating: 1,
  },
  8229: {
    styles: ['AP_MAGE', 'ENCHANTER'],
    effect: 'Comète arcanique : projectiles de dégâts bonus en zone à chaque sort qui touche (idéal pour harcèlement à distance).',
    burstRating: 3,
    sustainRating: 0,
    dpsRating: 2,
    tankRating: 0,
  },
  8230: {
    styles: ['AP_MAGE', 'AD_BRUISER'],
    effect: 'Rush phasique : énorme pic de vitesse de déplacement et résistance aux ralentissements après 3 coups pour se replacer.',
    burstRating: 0,
    sustainRating: 1,
    dpsRating: 2,
    tankRating: 2,
  },
  // Volonté
  8437: {
    styles: ['TANK', 'AD_BRUISER'],
    effect: 'Poigne de l’immortel : toutes les 4s en combat, vole des PV, soigne et augmente définitivement vos PV max (+5/+3).',
    burstRating: 1,
    sustainRating: 4,
    dpsRating: 1,
    tankRating: 5,
  },
  8439: {
    styles: ['TANK', 'AD_BRUISER'],
    effect: 'Après-coup : immobiliser un ennemi octroie un énorme bonus d’Armure/RM pendant 2,5s puis explose en zone.',
    burstRating: 2,
    sustainRating: 0,
    dpsRating: 0,
    tankRating: 5,
  },
  8465: {
    styles: ['TANK', 'ENCHANTER'],
    effect: 'Gardien : déclenche automatiquement un bouclier pour vous et votre allié proche dès qu’un ennemi engage.',
    burstRating: 0,
    sustainRating: 2,
    dpsRating: 0,
    tankRating: 5,
  },
  // Inspiration
  8351: {
    styles: ['TANK', 'ENCHANTER'],
    effect: 'Optimisation glaciale : vos immobilisations créent des zones givrées ralentissant les ennemis et réduisant leurs dégâts de 15%.',
    burstRating: 0,
    sustainRating: 1,
    dpsRating: 0,
    tankRating: 4,
  },
  8360: {
    styles: ['ENCHANTER', 'TANK', 'AP_MAGE'],
    effect: 'Grimoire déchaîné : permet d’échanger votre sort d’invocateur en cours de partie (Téléportation, Fatigue, Châtiment).',
    burstRating: 0,
    sustainRating: 1,
    dpsRating: 1,
    tankRating: 2,
  },
  8369: {
    styles: ['AP_MAGE', 'AD_LETHALITY', 'AD_CRIT'],
    effect: 'Premier coup : +7% de dégâts bruts bonus et gain d’or supplémentaire si vous initiez les dégâts en premier.',
    burstRating: 4,
    sustainRating: 0,
    dpsRating: 2,
    tankRating: 0,
  },
};

const RUNE_STAT_SCALING: Record<
  number,
  {
    effect: string;
    category: RuneMechanicNote['category'];
    bonusAtLevel?: (level: number, isMelee: boolean) => Partial<RuneStatSnapshot>;
  }
> = {
  // Précision
  9104: {
    category: 'Combinaison',
    effect: 'Légende : alacrité monte jusqu’à +18% vitesse d’attaque bonus avec vos participations/sbires.',
    bonusAtLevel: (lvl) => ({ attackSpeed: lvl >= 11 ? 0.18 : lvl >= 6 ? 0.09 : 0.03 }),
  },
  9105: {
    category: 'Tempo & Ressources',
    effect: 'Légende : hâte octroie jusqu’à +15 accélération de compétence de base au fil de la partie.',
    bonusAtLevel: (lvl) => ({ abilityHaste: lvl >= 11 ? 15 : lvl >= 6 ? 7 : 1 }),
  },
  9103: {
    category: 'Survie',
    effect: 'Légende : sangsue ajoute jusqu’à 5,25% de vol de vie et +85 PV max à pleine charge.',
    bonusAtLevel: (lvl) => ({ hp: lvl >= 11 ? 85 : lvl >= 6 ? 40 : 0 }),
  },
  9111: {
    category: 'Survie',
    effect: 'Triomphe : chaque élimination rend 5% des PV manquants et +20 po pour survivre aux plongeons.',
  },
  8009: {
    category: 'Tempo & Ressources',
    effect: 'Présence d’esprit : régénère votre mana/énergie quand vous touchez ou éliminez un champion.',
  },
  8014: {
    category: 'Combinaison',
    effect: 'Coup de grâce : +8% de dégâts sur les ennemis sous 40% PV.',
  },
  8017: {
    category: 'Combinaison',
    effect: 'Abattage : jusqu’à +8% de dégâts contre les cibles ayant plus de 60% PV max.',
  },
  8299: {
    category: 'Combinaison',
    effect: 'Baroud d’honneur : +5% à +11% de dégâts quand vos PV tombent sous 60%.',
  },
  // Domination
  8126: {
    category: 'Combinaison',
    effect: 'Coup bas : inflige 10–45 dégâts bruts bonus après un ralentissement ou contrôle.',
  },
  8139: {
    category: 'Survie',
    effect: 'Goût du sang : petit soin régulier lorsque vous blessez un champion ennemi en lane.',
  },
  8143: {
    category: 'Combinaison',
    effect: 'Ruée offensive : bonus de dégâts bruts après un dash, saut ou sortie de camouflage.',
  },
  8106: {
    category: 'Tempo & Ressources',
    effect: 'Chasseur ultime : jusqu’à +31 d’accélération de compétence sur votre Ultime (R).',
  },
  8105: {
    category: 'Tempo & Ressources',
    effect: 'Chasseur acharné : jusqu’à +45 vitesse de déplacement hors combat pour roamer.',
    bonusAtLevel: (lvl) => ({ moveSpeed: lvl >= 11 ? 35 : lvl >= 6 ? 18 : 5 }),
  },
  // Sorcellerie
  8226: {
    category: 'Tempo & Ressources',
    effect: 'Ruban de mana : +250 mana max et régénération continue une fois chargé.',
  },
  8210: {
    category: 'Tempo & Ressources',
    effect: 'Transcendance : +5 accélération de compétence dès le niv. 5, +10 dès le niv. 8.',
    bonusAtLevel: (lvl) => ({ abilityHaste: lvl >= 8 ? 10 : lvl >= 5 ? 5 : 0 }),
  },
  8234: {
    category: 'Tempo & Ressources',
    effect: 'Célérité : tous vos bonus de vitesse de déplacement gagnent +7% et +1% MS de base.',
    bonusAtLevel: () => ({ moveSpeed: 4 }),
  },
  8233: {
    category: 'Combinaison',
    effect: 'Concentration absolue : bonus d’AD/AP tant que vous restez au-dessus de 70% PV.',
    bonusAtLevel: (lvl) => ({ ap: Math.round(5 + lvl * 1.3), ad: Math.round(3 + lvl * 0.8) }),
  },
  8236: {
    category: 'Combinaison',
    effect: 'Tempête menaçante : puissance/AD gratuite croissante toutes les 10 minutes de jeu.',
    bonusAtLevel: (lvl) => ({ ap: lvl >= 16 ? 48 : lvl >= 11 ? 24 : lvl >= 6 ? 8 : 0 }),
  },
  8237: {
    category: 'Combinaison',
    effect: 'Brûlure : vos sorts brûlent le champion adverse pour plus de pression en phase de lane.',
  },
  // Volonté
  8401: {
    category: 'Combinaison',
    effect: 'Coup de bouclier : renforce votre Armure/RM sous bouclier et ajoute des dégâts à la prochaine attaque.',
  },
  8446: {
    category: 'Tempo & Ressources',
    effect: 'Démolition : charge une frappe massive sur les tourelles basée sur vos PV max.',
  },
  8463: {
    category: 'Survie',
    effect: 'Fontaine de vie : vos contrôles marquent l’ennemi pour soigner vous et vos alliés.',
  },
  8429: {
    category: 'Survie',
    effect: 'Conditionnement : à partir de 12 min, +8 Armure, +8 RM et +3% aux résistances totales.',
    bonusAtLevel: (lvl) => (lvl >= 9 ? { armor: 10, mr: 10 } : {}),
  },
  8444: {
    category: 'Survie',
    effect: 'Second souffle : régénère une fraction des PV manquants sur 10s après chaque poke subi.',
  },
  8473: {
    category: 'Survie',
    effect: 'Plaque d’os : réduit les 3 prochains coups reçus de 30–60 dégâts (idéal contre all-in/burst).',
  },
  8451: {
    category: 'Survie',
    effect: 'Surcroissance : gagne des PV max permanents sur les sbires tués à proximité (+3,5% PV à 120 charges).',
    bonusAtLevel: (lvl, isMelee) => ({
      hp: lvl >= 16 ? (isMelee ? 220 : 185) : lvl >= 11 ? 125 : lvl >= 6 ? 55 : 0,
    }),
  },
  8453: {
    category: 'Survie',
    effect: 'Revitalisation : +5% de soins/boucliers (+10% supplémentaires sous 40% PV).',
    bonusAtLevel: () => ({ healShieldPowerPct: 5 }),
  },
  // Inspiration
  8304: {
    category: 'Tempo & Ressources',
    effect: 'Chaussures magiques : bottes gratuites (300 po économisées) avec +10 vitesse de déplacement bonus.',
    bonusAtLevel: (lvl) => ({ moveSpeed: lvl >= 6 ? 10 : 0 }),
  },
  8345: {
    category: 'Survie',
    effect: 'Livraison de biscuits : biscuits en lane qui soignent et augmentent définitivement vos PV max (+90 PV).',
    bonusAtLevel: (lvl) => ({ hp: lvl >= 6 ? 90 : lvl >= 2 ? 30 : 0 }),
  },
  8347: {
    category: 'Tempo & Ressources',
    effect: 'Savoir cosmique : +18 accélération sur vos sorts d’invocateur et +10 sur vos objets actifs.',
  },
  8410: {
    category: 'Combinaison',
    effect: 'Vitesse d’approche : +7,5% à +15% de vitesse vers les champions que vous ralentissez ou immobilisez.',
  },
};

function getPrimaryStyle(
  champ: ChampionSummary,
  role: Role,
): 'AD_CRIT' | 'AD_BRUISER' | 'AD_LETHALITY' | 'AP_MAGE' | 'TANK' | 'ENCHANTER' {
  const tags = champ.tags;
  if (role === 'ADC' || (tags.includes('Marksman') && champ.info.attack >= 7)) return 'AD_CRIT';
  if (tags.includes('Tank') && role !== 'MID') return 'TANK';
  if (role === 'SUPPORT' && tags.includes('Support') && !tags.includes('Tank')) return 'ENCHANTER';
  if (tags.includes('Mage') || champ.info.magic >= champ.info.attack + 2) return 'AP_MAGE';
  if (tags.includes('Assassin') && champ.info.attack >= champ.info.magic) return 'AD_LETHALITY';
  return 'AD_BRUISER';
}

function getScalingShardHp(level: number): number {
  return Math.round(10 + ((180 - 10) * (level - 1)) / 17);
}

/**
 * Calcule les statistiques effectives du champion à un niveau donné
 * en cumulant ses stats de base Data Dragon, ses 3 fragments et les bonus mesurables des runes choisies.
 */
export function computeRuneStatsAtLevel(
  champ: ChampionSummary,
  role: Role,
  selection: RunePageSelection,
  level: number,
): RuneStatSnapshot {
  const style = getPrimaryStyle(champ, role);
  const prefersAp = style === 'AP_MAGE' || style === 'ENCHANTER' || champ.info.magic > champ.info.attack;
  const isMelee = champ.stats.attackrange < 325;

  let hp = Math.round(computeStatAtLevel(champ.stats.hp, champ.stats.hpperlevel, level));
  let armor = computeStatAtLevel(champ.stats.armor, champ.stats.armorperlevel, level);
  let mr = computeStatAtLevel(champ.stats.spellblock, champ.stats.spellblockperlevel, level);
  let ad = computeStatAtLevel(champ.stats.attackdamage, champ.stats.attackdamageperlevel, level);
  let ap = 0;
  let bonusAs = 0;
  let moveSpeed = champ.stats.movespeed;
  let abilityHaste = 0;
  let tenacityPct = 0;
  let healShieldPowerPct = 0;

  // 1. Fragments 3x3
  const [r1, r2, r3] = selection.shardIndices;
  // Rangée 1 (Offense) : 0 = +9 AF, 1 = +10% AS, 2 = +8 Hâte
  if (r1 === 0) {
    if (prefersAp) ap += 9;
    else ad += 5.4;
  } else if (r1 === 1) {
    bonusAs += 0.1;
  } else if (r1 === 2) {
    abilityHaste += 8;
  }

  // Rangée 2 (Flex) : 0 = +9 AF, 1 = +2% MS, 2 = +10-180 PV
  if (r2 === 0) {
    if (prefersAp) ap += 9;
    else ad += 5.4;
  } else if (r2 === 1) {
    moveSpeed *= 1.02;
  } else if (r2 === 2) {
    hp += getScalingShardHp(level);
  }

  // Rangée 3 (Défense) : 0 = +65 PV fixes, 1 = +10% Ténacité, 2 = +10-180 PV
  if (r3 === 0) {
    hp += 65;
  } else if (r3 === 1) {
    tenacityPct += 10;
  } else if (r3 === 2) {
    hp += getScalingShardHp(level);
  }

  // 2. Runes mineures ayant un impact chiffré progressif
  const allRuneIds = [
    selection.keystoneId,
    ...selection.primaryMinorIds,
    ...selection.secondaryMinorIds,
  ];

  // Poigne de l'immortel : proc PV accumulés réalistes selon le niveau
  if (selection.keystoneId === 8437 && level >= 3) {
    hp += (level - 2) * (isMelee ? 10 : 6);
  }

  for (const rId of allRuneIds) {
    const meta = RUNE_STAT_SCALING[rId];
    if (!meta?.bonusAtLevel) continue;
    const delta = meta.bonusAtLevel(level, isMelee);
    if (delta.hp) hp += delta.hp;
    if (delta.armor) armor += delta.armor;
    if (delta.mr) mr += delta.mr;
    if (delta.attackSpeed) bonusAs += delta.attackSpeed;
    if (delta.moveSpeed) moveSpeed += delta.moveSpeed;
    if (delta.abilityHaste) abilityHaste += delta.abilityHaste;
    if (delta.healShieldPowerPct) healShieldPowerPct += delta.healShieldPowerPct;
    if (delta.ap && prefersAp) ap += delta.ap;
    if (delta.ad && !prefersAp) ad += delta.ad;
  }

  const levelProgress =
    level <= 1 ? 0 : ((level - 1) * (0.7025 + 0.0175 * (level - 1))) / 100;
  const totalAsBonus = bonusAs + (champ.stats.attackspeedperlevel * levelProgress);
  const attackSpeed = Number((champ.stats.attackspeed * (1 + totalAsBonus)).toFixed(3));

  return {
    hp: Math.round(hp),
    ad: Number(ad.toFixed(1)),
    ap: Math.round(ap),
    attackSpeed,
    armor: Number(armor.toFixed(1)),
    mr: Number(mr.toFixed(1)),
    moveSpeed: Math.round(moveSpeed),
    abilityHaste,
    tenacityPct,
    healShieldPowerPct,
  };
}

/**
 * Construit un RunePageSelection à partir de la recommandation calculée par buildEngine.
 */
export function selectionFromRecommendation(
  recRunes: BuildRecommendation['runes'],
  runeTrees: RuneTree[],
): RunePageSelection {
  const primaryTreeId = recRunes.primaryTree?.id || runeTrees[0]?.id || 8400;
  const secondaryTreeId =
    recRunes.secondaryTree?.id || runeTrees.find((t) => t.id !== primaryTreeId)?.id || 8300;
  const keystoneId =
    recRunes.keystone?.id || recRunes.primaryTree?.slots?.[0]?.runes?.[0]?.id || 8437;

  return {
    primaryTreeId,
    secondaryTreeId,
    keystoneId,
    primaryMinorIds: recRunes.primarySlots.map((r) => r.id),
    secondaryMinorIds: recRunes.secondarySlots.map((r) => r.id),
    shardIndices: [
      recRunes.shardRows[0]?.selectedIndex ?? 0,
      recRunes.shardRows[1]?.selectedIndex ?? 0,
      recRunes.shardRows[2]?.selectedIndex ?? 0,
    ],
  };
}

/**
 * Crée une sélection valide lorsqu'un arbre principal ou secondaire change.
 */
export function buildDefaultSelectionForTrees(
  runeTrees: RuneTree[],
  primaryTreeId: number,
  secondaryTreeId: number,
  prev?: RunePageSelection,
): RunePageSelection {
  const primaryTree = runeTrees.find((t) => t.id === primaryTreeId) || runeTrees[0];
  let secondaryTree = runeTrees.find((t) => t.id === secondaryTreeId && t.id !== primaryTree.id);
  if (!secondaryTree) {
    secondaryTree = runeTrees.find((t) => t.id !== primaryTree.id) || runeTrees[1] || primaryTree;
  }

  const samePrimary = prev && prev.primaryTreeId === primaryTree.id;
  const sameSecondary = prev && prev.secondaryTreeId === secondaryTree.id;

  const keystoneId = samePrimary
    ? prev.keystoneId
    : primaryTree.slots?.[0]?.runes?.[0]?.id || 0;

  const primaryMinorIds = samePrimary
    ? prev.primaryMinorIds
    : [1, 2, 3]
        .map((idx) => primaryTree.slots?.[idx]?.runes?.[0]?.id)
        .filter((id): id is number => Boolean(id));

  const secondaryMinorIds = sameSecondary
    ? prev.secondaryMinorIds
    : [1, 2]
        .map((idx) => secondaryTree.slots?.[idx]?.runes?.[0]?.id)
        .filter((id): id is number => Boolean(id));

  return {
    primaryTreeId: primaryTree.id,
    secondaryTreeId: secondaryTree.id,
    keystoneId,
    primaryMinorIds,
    secondaryMinorIds,
    shardIndices: prev?.shardIndices || [0, 0, 0],
  };
}

function findRuneById(runeTrees: RuneTree[], runeId: number): RuneSlotItem | null {
  for (const tree of runeTrees) {
    for (const slot of tree.slots) {
      const hit = slot.runes.find((r) => r.id === runeId);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Compare la page de runes personnalisée en temps réel à la page Méta recommandée,
 * évalue son adéquation au champion, au rôle et aux menaces adverses, et résume les mécaniques actives.
 */
export function compareRunePages(params: {
  champ: ChampionSummary;
  role: Role;
  threats: EnemyThreatSummary;
  runeTrees: RuneTree[];
  custom: RunePageSelection;
  meta: RunePageSelection;
  level: number;
}): RuneComparisonResult {
  const { champ, role, threats, runeTrees, custom, meta, level } = params;
  const style = getPrimaryStyle(champ, role);

  const customStats = computeRuneStatsAtLevel(champ, role, custom, level);
  const metaStats = computeRuneStatsAtLevel(champ, role, meta, level);

  const formatDelta = (diff: number, suffix = '', decimals = 0): { label: string; dir: 'up' | 'down' | 'equal' } => {
    const threshold = decimals > 0 ? 0.005 : 0.4;
    if (Math.abs(diff) <= threshold) return { label: 'Identique', dir: 'equal' };
    const sign = diff > 0 ? '+' : '';
    const formatted = decimals > 0 ? diff.toFixed(decimals) : String(Math.round(diff));
    return {
      label: `${sign}${formatted}${suffix}`,
      dir: diff > 0 ? 'up' : 'down',
    };
  };

  const hpD = formatDelta(customStats.hp - metaStats.hp, ' PV');
  const adD = formatDelta(customStats.ad - metaStats.ad, ' AD', 1);
  const apD = formatDelta(customStats.ap - metaStats.ap, ' AP');
  const asD = formatDelta(customStats.attackSpeed - metaStats.attackSpeed, '', 3);
  const resD = formatDelta(
    customStats.armor + customStats.mr - (metaStats.armor + metaStats.mr),
    ' Rés.',
  );
  const hasteD = formatDelta(customStats.abilityHaste - metaStats.abilityHaste, ' Hâte');
  const msD = formatDelta(customStats.moveSpeed - metaStats.moveSpeed, ' MS');
  const tenD = formatDelta(customStats.tenacityPct - metaStats.tenacityPct, '% Tén.');

  const statRows: RuneStatDeltaRow[] = [
    {
      key: 'hp',
      label: `Points de vie (Niv.${level})`,
      customValue: `${customStats.hp}`,
      metaValue: `${metaStats.hp}`,
      deltaLabel: hpD.label,
      direction: hpD.dir,
    },
    {
      key: 'off',
      label: style === 'AP_MAGE' || style === 'ENCHANTER' ? 'Puissance (AP)' : 'Dégâts d’attaque (AD)',
      customValue:
        style === 'AP_MAGE' || style === 'ENCHANTER'
          ? `${customStats.ap} AP`
          : `${customStats.ad} AD`,
      metaValue:
        style === 'AP_MAGE' || style === 'ENCHANTER'
          ? `${metaStats.ap} AP`
          : `${metaStats.ad} AD`,
      deltaLabel:
        style === 'AP_MAGE' || style === 'ENCHANTER' ? apD.label : adD.label,
      direction: style === 'AP_MAGE' || style === 'ENCHANTER' ? apD.dir : adD.dir,
    },
    {
      key: 'as',
      label: 'Vitesse d’attaque',
      customValue: `${customStats.attackSpeed}`,
      metaValue: `${metaStats.attackSpeed}`,
      deltaLabel: asD.label,
      direction: asD.dir,
    },
    {
      key: 'res',
      label: 'Armure / Résist. Mag.',
      customValue: `${customStats.armor} / ${customStats.mr}`,
      metaValue: `${metaStats.armor} / ${metaStats.mr}`,
      deltaLabel: resD.label,
      direction: resD.dir,
    },
    {
      key: 'haste',
      label: 'Accélération de comp.',
      customValue: `${customStats.abilityHaste}`,
      metaValue: `${metaStats.abilityHaste}`,
      deltaLabel: hasteD.label,
      direction: hasteD.dir,
    },
    {
      key: 'ms',
      label: 'Vitesse de dép. / Ténacité',
      customValue: `${customStats.moveSpeed} / ${customStats.tenacityPct}%`,
      metaValue: `${metaStats.moveSpeed} / ${metaStats.tenacityPct}%`,
      deltaLabel:
        msD.dir !== 'equal' ? msD.label : tenD.dir !== 'equal' ? tenD.label : 'Identique',
      direction: msD.dir !== 'equal' ? msD.dir : tenD.dir,
    },
  ];

  // Mécaniques actives
  const mechanics: RuneMechanicNote[] = [];
  const ksInfo = KEYSTONE_MECHANICS[custom.keystoneId];
  const ksRune = findRuneById(runeTrees, custom.keystoneId);
  if (ksRune) {
    mechanics.push({
      source: ksRune.name,
      category: 'Keystone',
      effect:
        ksInfo?.effect ||
        ksRune.shortDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }

  for (const rId of [...custom.primaryMinorIds, ...custom.secondaryMinorIds]) {
    const rune = findRuneById(runeTrees, rId);
    const info = RUNE_STAT_SCALING[rId];
    if (rune && info) {
      mechanics.push({
        source: rune.name,
        category: info.category,
        effect: info.effect,
      });
    }
  }

  const shardSummaryParts: string[] = [];
  if (custom.shardIndices[0] === 0) shardSummaryParts.push('+9 Force adaptative (Offense)');
  if (custom.shardIndices[0] === 1) shardSummaryParts.push('+10% Vitesse d’attaque');
  if (custom.shardIndices[0] === 2) shardSummaryParts.push('+8 Hâte');
  if (custom.shardIndices[1] === 0) shardSummaryParts.push('+9 Force adaptative (Flex)');
  if (custom.shardIndices[1] === 1) shardSummaryParts.push('+2% Vitesse de déplacement');
  if (custom.shardIndices[1] === 2) shardSummaryParts.push('+10–180 PV (Flex)');
  if (custom.shardIndices[2] === 0) shardSummaryParts.push('+65 PV fixes (early)');
  if (custom.shardIndices[2] === 1) shardSummaryParts.push('+10% Ténacité');
  if (custom.shardIndices[2] === 2) shardSummaryParts.push('+10–180 PV (scaling)');

  mechanics.push({
    source: 'Fragments 3×3',
    category: 'Fragments',
    effect: shardSummaryParts.join(' · '),
  });

  // Scoring & verdict comparatif
  const customRunesAll = [
    custom.keystoneId,
    ...custom.primaryMinorIds,
    ...custom.secondaryMinorIds,
  ];
  const metaSet = new Set([meta.keystoneId, ...meta.primaryMinorIds, ...meta.secondaryMinorIds]);
  const matchedCount = customRunesAll.filter((id) => metaSet.has(id)).length;
  const shardMatchCount = [0, 1, 2].filter(
    (i) => custom.shardIndices[i] === meta.shardIndices[i],
  ).length;

  let score = 56;
  const pros: string[] = [];
  const tradeoffs: string[] = [];

  if (custom.keystoneId === meta.keystoneId) {
    score += 22;
    pros.push(`Rune fondamentale optimale (${ksRune?.name || 'Méta'}) parfaitement alignée sur ${champ.name}.`);
  } else if (ksInfo && ksInfo.styles.includes(style)) {
    score += 13;
    pros.push(`${ksRune?.name || 'Cette fondamentale'} reste compatible avec l’archétype ${champ.name} en orientant votre style de jeu.`);
    const metaKs = findRuneById(runeTrees, meta.keystoneId);
    tradeoffs.push(`Vous échangez ${metaKs?.name || 'la fondamentale méta'} contre une approche différente en lane.`);
  } else {
    score -= 22;
    const metaKs = findRuneById(runeTrees, meta.keystoneId);
    tradeoffs.push(
      `${ksRune?.name || 'Cette fondamentale'} exploite mal les ratios de ${champ.name} par rapport à ${metaKs?.name || 'la page méta'}.`,
    );
  }

  // Correspondance des runes mineures
  const minorOverlap = [...custom.primaryMinorIds, ...custom.secondaryMinorIds].filter((id) =>
    metaSet.has(id),
  ).length;
  score += Math.min(18, minorOverlap * 3.5);

  // Vérifications contextuelles match-up
  if (threats.ccThreatCount >= 2 && custom.shardIndices[2] === 1) {
    score += 5;
    pros.push(`+10% Ténacité très rentable face aux ${threats.ccThreatCount} contrôles adverses.`);
  } else if (threats.ccThreatCount >= 3 && custom.shardIndices[2] !== 1 && meta.shardIndices[2] === 1) {
    score -= 5;
    tradeoffs.push(`Attention : ${threats.ccThreatCount} contrôles majeurs en face — le fragment +10% Ténacité vous protégerait davantage.`);
  }

  if (threats.burstThreatCount >= 2 && custom.shardIndices[2] === 0) {
    score += 3;
    pros.push('+65 PV fixes sécurise les niveaux 1–4 contre le burst adverse.');
  }

  if (customStats.hp > metaStats.hp + 40) {
    pros.push(`+${customStats.hp - metaStats.hp} PV supplémentaires au niveau ${level} (meilleure tenue en combat).`);
  } else if (customStats.hp < metaStats.hp - 50) {
    tradeoffs.push(`${customStats.hp - metaStats.hp} PV en moins au niveau ${level} : vous perdez en robustesse.`);
  }

  if (customStats.attackSpeed > metaStats.attackSpeed + 0.04) {
    pros.push(`Vitesse d’attaque augmentée (+${(customStats.attackSpeed - metaStats.attackSpeed).toFixed(2)}) pour plus de DPS continu.`);
  }

  if (customStats.abilityHaste > metaStats.abilityHaste + 4) {
    pros.push(`+${customStats.abilityHaste - metaStats.abilityHaste} Accélération de compétence : sorts disponibles plus souvent.`);
  }

  if (custom.secondaryMinorIds.includes(8345) || custom.primaryMinorIds.includes(8345)) {
    pros.push('Biscuits activés : améliore la tenue de lane sur les 6 premières minutes.');
  }
  if (custom.primaryMinorIds.includes(8473) || custom.secondaryMinorIds.includes(8473)) {
    pros.push('Plaque d’os : amortit les échanges courts / all-in ennemis.');
  }
  if (custom.primaryMinorIds.includes(8444) || custom.secondaryMinorIds.includes(8444)) {
    pros.push('Second souffle : excellent contre le harcèlement à distance en lane.');
  }

  // Garde-fou pour runes peu cohérentes (ex. tank full sorcellerie)
  if (style === 'TANK' && custom.primaryTreeId === 8200) {
    score -= 18;
    tradeoffs.push('L’arbre Sorcellerie prive votre Tank d’outils défensifs majeurs (Volonté).');
  }
  if ((style === 'AP_MAGE' || style === 'ENCHANTER') && custom.shardIndices[0] === 1 && champ.id !== 'Teemo' && champ.id !== 'Azir' && champ.id !== 'Kayle') {
    score -= 4;
    tradeoffs.push('Le fragment +10% Vitesse d’attaque est moins rentable que +9 Force adaptative ou +8 Hâte sur ce mage.');
  }

  score = Math.max(25, Math.min(100, Math.round(score)));

  let verdict: RuneComparisonResult['verdict'];
  let verdictTone: RuneComparisonResult['verdictTone'];
  let summary: string;

  if (matchedCount === 6 && shardMatchCount === 3) {
    score = 100;
    verdict = 'Optimal (Méta)';
    verdictTone = 'emerald';
    summary = `Votre page correspond à 100% à la configuration recommandée pour ${champ.name} (${role}) contre cette composition.`;
  } else if (score >= 82) {
    verdict = 'Excellent choix alternatif';
    verdictTone = 'sky';
    summary = `Variante très solide (${matchedCount}/6 runes méta) : vous adaptez votre plan de jeu tout en conservant une forte synergie sur ${champ.name}.`;
  } else if (score >= 65) {
    verdict = 'Viable (Situationnel)';
    verdictTone = 'amber';
    summary = `Configuration jouable dans certains scénarios (${matchedCount}/6 runes méta), mais vérifiez les compromis ci-contre face à l’équipe adverse.`;
  } else {
    verdict = 'Sous-optimal pour ce match-up';
    verdictTone = 'rose';
    summary = `Cette combinaison réduit l’efficacité de ${champ.name} contre cette composition. Revenir vers la page Méta est conseillé.`;
  }

  return {
    score,
    verdict,
    verdictTone,
    summary,
    matchedCount,
    shardMatchCount,
    pros: pros.slice(0, 4),
    tradeoffs: tradeoffs.slice(0, 4),
    mechanics: mechanics.slice(0, 7),
    statRows,
  };
}
