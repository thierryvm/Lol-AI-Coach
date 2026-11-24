import { computeStatAtLevel } from './championEngine.ts';
import {
  computeRuneStatsAtLevel,
  KEYSTONE_MECHANICS,
  type RunePageSelection,
} from './runeEngine.ts';
import type {
  ChampionSummary,
  EnemyThreatSummary,
  GameModeContext,
  ItemData,
  Role,
  RuneTree,
} from './types.ts';

export interface ParsedItemStats {
  hp: number;
  mana: number;
  ad: number;
  ap: number;
  armor: number;
  mr: number;
  attackSpeedPct: number;
  critChancePct: number;
  critDamageBonusPct: number;
  flatMoveSpeed: number;
  percentMoveSpeedPct: number;
  abilityHaste: number;
  lethality: number;
  armorPenPct: number;
  magicPenFlat: number;
  magicPenPct: number;
  tenacityPct: number;
  healShieldPowerPct: number;
  lifeStealPct: number;
  omnivampPct: number;
  hpRegenPct: number;
  manaRegenPct: number;
}

export interface ActiveItemPassiveInfo {
  itemId: string;
  itemName: string;
  effectTitle: string;
  detail: string;
}

export interface FullBuildStatBreakdown {
  level: number;
  totals: {
    hp: number;
    mana: number;
    ad: number;
    ap: number;
    armor: number;
    mr: number;
    attackSpeed: number;
    uncappedAttackSpeed: number;
    asOvercapPct: number;
    abilityHaste: number;
    cooldownReductionPct: number;
    moveSpeed: number;
    critChancePct: number;
    critDamagePct: number;
    lethality: number;
    armorPenPct: number;
    magicPenFlat: number;
    magicPenPct: number;
    tenacityPct: number;
    healShieldPowerPct: number;
    healShieldReceivedPct: number;
    lifeStealPct: number;
    omnivampPct: number;
    hpRegenPct: number;
    manaRegenPct: number;
    antiHealPct: number;
    aaDamageReductionPct: number;
    critDamageReductionPct: number;
    combatBonusResistPct: number;
    doubleOnHitActive: boolean;
  };
  sources: {
    hp: { base: number; items: number; runes: number };
    ad: { base: number; items: number; runes: number };
    ap: { base: number; items: number; runes: number };
    armor: { base: number; items: number; runes: number };
    mr: { base: number; items: number; runes: number };
    abilityHaste: { base: number; items: number; runes: number };
    moveSpeed: { base: number; items: number; runes: number };
  };
  combat: {
    physicalEhp: number;
    magicEhp: number;
    weightedEhp: number;
    autoDps: number;
    onHitPerAttack: number;
    spellbladeProcDmg: number;
    combatSustainPerSec: number;
    abilityImpactIndex: number;
    totalGold: number;
    statGoldValue: number;
    goldEfficiencyPct: number;
    runeGoldValue: number;
  };
  activePassives: ActiveItemPassiveInfo[];
  itemCount: number;
  spellbladeItemsCount: number;
  bootsCount: number;
}

export type BuildDiagnosticTone = 'emerald' | 'sky' | 'amber' | 'rose';

export interface BuildDiagnosticItem {
  id: string;
  category: 'Vitesse d’attaque' | 'Puissance & Dégâts' | 'Survie & Défense' | 'Passifs & Tempo';
  title: string;
  statusLabel: string;
  tone: BuildDiagnosticTone;
  explanation: string;
  actionTip?: string;
}

export interface RuneStuffSynergyItem {
  runeName: string;
  category: string;
  tone: BuildDiagnosticTone;
  explanation: string;
}

export interface BuildInterpretationReport {
  overallHeadline: string;
  overallTone: BuildDiagnosticTone;
  profileTags: string[];
  diagnostics: BuildDiagnosticItem[];
  runeSynergies: RuneStuffSynergyItem[];
  suggestedTweaks: string[];
}

export interface RuneValidationCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface CombinatorialBuildCandidate {
  id: string;
  scenarioKey: 'balanced' | 'behind' | 'ahead' | 'anti_comp';
  scenarioTitle: string;
  scenarioBadge: string;
  situationHint: string;
  items: ItemData[];
  runeSelection: RunePageSelection;
  keystoneName: string;
  primaryTreeName: string;
  secondaryTreeName: string;
  stats: FullBuildStatBreakdown;
  score: number;
  reasons: string[];
}

export interface CombinatorialOptimizerResult {
  testedCombinationsCount: number;
  testedItemCombos: number;
  testedRuneCombos: number;
  candidates: CombinatorialBuildCandidate[];
}

// Valeurs de référence officielles par point de statistique (LoL Gold Efficiency)
const GOLD_PER_STAT = {
  hp: 2.667, // Ruby Crystal 400g / 150 HP
  mana: 1.4, // Sapphire Crystal
  ad: 35, // Long Sword 350g / 10 AD
  ap: 20, // Amplifying Tome 400g / 20 AP
  armor: 20, // Cloth Armor 300g / 15 Armor
  mr: 18, // Null-Magic Mantle
  asPct: 25, // Dagger 250g / 10% AS
  critPct: 40, // Cloak 600g / 15% Crit
  ah: 50, // Glowing Mote 250g / 5 AH
  msFlat: 12, // Boots 300g / 25 MS
  lethality: 30,
  magicPenFlat: 31.1,
  healShieldPct: 55,
  tenacityPct: 25,
  lifeStealPct: 53.5,
  regenPct: 3,
};

export const HP_SCALING_CHAMPIONS = new Set([
  'TahmKench',
  'DrMundo',
  'Sion',
  'Chogath',
  'Sejuani',
  'Shen',
  'Zac',
  'Volibear',
  'Skarner',
]);

export const ONHIT_SPELLWEAVE_CHAMPIONS = new Set([
  'TahmKench',
  'Volibear',
  'Jax',
  'Kayle',
  'Gwen',
  'Diana',
  'Shen',
  'Warwick',
  'Viego',
  'Teemo',
  'KogMaw',
  'Varus',
  'Kaisa',
  'MasterYi',
  'Irelia',
  'Udyr',
  'XinZhao',
  'Trundle',
]);

function decodeHtmlText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Extrait 100% des statistiques réelles d'un objet Data Dragon en combinant
 * item.stats ET la section <stats>...</stats> de item.description (Hâte, Ténacité,
 * Pén. % Armure/RM, Létalité, Efficacité Soins/Boucliers, Régénérations, Dégâts Crit, Omnivamp).
 */
export function parseExactItemStats(item: ItemData): ParsedItemStats {
  const s = item.stats || {};
  let hp = Number(s.FlatHPPoolMod || 0);
  let mana = Number(s.FlatMPPoolMod || 0);
  let ad = Number(s.FlatPhysicalDamageMod || 0);
  let ap = Number(s.FlatMagicDamageMod || 0);
  let armor = Number(s.FlatArmorMod || 0);
  let mr = Number(s.FlatSpellBlockMod || 0);
  let attackSpeedPct = Math.round(Number(s.PercentAttackSpeedMod || 0) * 100);
  let critChancePct = Math.round(Number(s.FlatCritChanceMod || 0) * 100);
  let flatMoveSpeed = Number(s.FlatMovementSpeedMod || 0);
  let percentMoveSpeedPct = Math.round(Number(s.PercentMovementSpeedMod || 0) * 100);
  let lifeStealPct = Math.round(Number(s.PercentLifeStealMod || 0) * 100);

  let abilityHaste = 0;
  let lethality = 0;
  let armorPenPct = 0;
  let magicPenFlat = 0;
  let magicPenPct = 0;
  let tenacityPct = 0;
  let healShieldPowerPct = 0;
  let critDamageBonusPct = 0;
  let omnivampPct = 0;
  let hpRegenPct = 0;
  let manaRegenPct = 0;

  const statsBlockMatch = item.description.match(/<stats>([\s\S]*?)<\/stats>/i);
  if (statsBlockMatch) {
    const lines = decodeHtmlText(statsBlockMatch[1])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      const m = line.match(/^\+?(\d+(?:[.,]\d+)?)\s*(%?)\s*(.+)$/);
      if (!m) continue;
      const val = Number(m[1].replace(',', '.'));
      const isPct = m[2] === '%';
      const label = m[3].toLowerCase();

      if (label.includes('accélération de compétence') || label.includes('ability haste')) {
        abilityHaste += val;
      } else if (label.includes('ténacité') || label.includes('tenacity')) {
        tenacityPct += val;
      } else if (label.includes('létalité') || label.includes('lethality')) {
        lethality += val;
      } else if (
        (label.includes("pénétration d'armure") || label.includes('armor penetration')) &&
        isPct
      ) {
        armorPenPct += val;
      } else if (
        label.includes('pénétration magique') ||
        label.includes('magic penetration')
      ) {
        if (isPct) magicPenPct += val;
        else magicPenFlat += val;
      } else if (
        label.includes('soins et boucliers') ||
        label.includes('heal and shield power')
      ) {
        healShieldPowerPct += val;
      } else if (label.includes('omnivampirisme') || label.includes('omnivamp')) {
        omnivampPct += val;
      } else if (
        label.includes('dégâts de coup critique') ||
        label.includes('critical strike damage')
      ) {
        critDamageBonusPct += val;
      } else if (
        (label.includes('régénération de base des pv') || label.includes('base health regen')) &&
        isPct
      ) {
        hpRegenPct += val;
      } else if (
        (label.includes('régénération de base du mana') || label.includes('base mana regen')) &&
        isPct
      ) {
        manaRegenPct += val;
      } else if (
        isPct &&
        (label.includes('vitesse de déplacement') || label.includes('move speed'))
      ) {
        if (percentMoveSpeedPct === 0) percentMoveSpeedPct += val;
      } else if (
        !isPct &&
        (label.includes('vitesse de déplacement') || label.includes('move speed'))
      ) {
        if (flatMoveSpeed === 0) flatMoveSpeed += val;
      } else if (
        isPct &&
        (label.includes('vol de vie') || label.includes('life steal'))
      ) {
        if (lifeStealPct === 0) lifeStealPct += val;
      } else if (
        isPct &&
        (label.includes("vitesse d'attaque") || label.includes('attack speed'))
      ) {
        if (attackSpeedPct === 0) attackSpeedPct += val;
      } else if (
        isPct &&
        (label.includes('chances de coup critique') || label.includes('critical strike chance'))
      ) {
        if (critChancePct === 0) critChancePct += val;
      } else if (label === 'pv' || label === 'health' || label.includes('points de vie')) {
        if (hp === 0 && !isPct) hp += val;
      } else if (label === 'mana' && !isPct) {
        if (mana === 0) mana += val;
      } else if (label === 'armure' || label === 'armor') {
        if (armor === 0) armor += val;
      } else if (label.includes('résistance magique') || label.includes('magic resist')) {
        if (mr === 0) mr += val;
      } else if (label.includes("dégâts d'attaque") || label.includes('attack damage')) {
        if (ad === 0) ad += val;
      } else if (label === 'puissance' || label === 'ability power') {
        if (ap === 0) ap += val;
      }
    }
  }

  return {
    hp,
    mana,
    ad,
    ap,
    armor,
    mr,
    attackSpeedPct,
    critChancePct,
    critDamageBonusPct,
    flatMoveSpeed,
    percentMoveSpeedPct,
    abilityHaste,
    lethality,
    armorPenPct,
    magicPenFlat,
    magicPenPct,
    tenacityPct,
    healShieldPowerPct,
    lifeStealPct,
    omnivampPct,
    hpRegenPct,
    manaRegenPct,
  };
}

export function formatItemStatTags(item: ItemData): string[] {
  const st = parseExactItemStats(item);
  const tags: string[] = [];
  if (st.hp) tags.push(`+${st.hp} PV`);
  if (st.ad) tags.push(`+${st.ad} AD`);
  if (st.ap) tags.push(`+${st.ap} AP`);
  if (st.armor) tags.push(`+${st.armor} Arm.`);
  if (st.mr) tags.push(`+${st.mr} RM`);
  if (st.abilityHaste) tags.push(`+${st.abilityHaste} Hâte`);
  if (st.attackSpeedPct) tags.push(`+${st.attackSpeedPct}% AS`);
  if (st.critChancePct) tags.push(`+${st.critChancePct}% Crit`);
  if (st.lethality) tags.push(`+${st.lethality} Lét.`);
  if (st.armorPenPct) tags.push(`+${st.armorPenPct}% Pén.Arm`);
  if (st.magicPenFlat) tags.push(`+${st.magicPenFlat} Pén.Mag`);
  if (st.magicPenPct) tags.push(`+${st.magicPenPct}% Pén.Mag`);
  if (st.tenacityPct) tags.push(`+${st.tenacityPct}% Tén.`);
  if (st.healShieldPowerPct) tags.push(`+${st.healShieldPowerPct}% Soins/Boucl.`);
  if (st.hpRegenPct) tags.push(`+${st.hpRegenPct}% Régén.PV`);
  if (st.flatMoveSpeed) tags.push(`+${st.flatMoveSpeed} Vit.`);
  if (st.percentMoveSpeedPct) tags.push(`+${st.percentMoveSpeedPct}% Vit.`);
  return tags.slice(0, 4);
}

/**
 * Calcule l'ensemble complet et vérifiable des statistiques du champion au niveau N
 * (Croissance officielle Riot + Runes/Fragments + Équipements sélectionnés + Passifs uniques de combat).
 */
export function computeFullChampionBuildStats(params: {
  champion: ChampionSummary;
  role: Role;
  level: number;
  items: ItemData[];
  runeSelection: RunePageSelection;
  threats?: EnemyThreatSummary;
  heartsteelStacksHp?: number;
}): FullBuildStatBreakdown {
  const { champion, role, level, items, runeSelection, threats, heartsteelStacksHp = 0 } = params;
  const clampedLvl = Math.max(1, Math.min(18, level));

  // 1. Base pure du champion au niveau N (sans runes ni objets)
  const baseHp = Math.round(computeStatAtLevel(champion.stats.hp, champion.stats.hpperlevel, clampedLvl));
  const baseMana =
    champion.partype === 'Mana'
      ? Math.round(computeStatAtLevel(champion.stats.mp, champion.stats.mpperlevel, clampedLvl))
      : Math.round(champion.stats.mp);
  const baseAd = computeStatAtLevel(champion.stats.attackdamage, champion.stats.attackdamageperlevel, clampedLvl);
  const baseArmor = computeStatAtLevel(champion.stats.armor, champion.stats.armorperlevel, clampedLvl);
  const baseMr = computeStatAtLevel(champion.stats.spellblock, champion.stats.spellblockperlevel, clampedLvl);
  const baseMs = champion.stats.movespeed;
  const levelAsProgress =
    clampedLvl <= 1 ? 0 : ((clampedLvl - 1) * (0.7025 + 0.0175 * (clampedLvl - 1))) / 100;
  const baseAsOnly = Number(
    (champion.stats.attackspeed * (1 + (champion.stats.attackspeedperlevel * levelAsProgress) / 100)).toFixed(3),
  );

  // 2. Contribution exacte des Runes + Fragments 3x3
  const withRunes = computeRuneStatsAtLevel(champion, role, runeSelection, clampedLvl);
  const runeHp = Math.max(0, withRunes.hp - baseHp);
  const runeAd = Math.max(0, Number((withRunes.ad - baseAd).toFixed(1)));
  const runeAp = withRunes.ap;
  const runeArmor = Math.max(0, Number((withRunes.armor - baseArmor).toFixed(1)));
  const runeMr = Math.max(0, Number((withRunes.mr - baseMr).toFixed(1)));
  const runeAh = withRunes.abilityHaste;
  const runeMs = Math.max(0, withRunes.moveSpeed - baseMs);
  const runeAsBonusPct = Math.max(
    0,
    (withRunes.attackSpeed / Math.max(0.1, champion.stats.attackspeed) -
      baseAsOnly / Math.max(0.1, champion.stats.attackspeed)) *
      100,
  );

  // 3. Contribution exacte des Objets équipés + détection des passifs de combat
  let itemHp = 0;
  let itemMana = 0;
  let itemAd = 0;
  let itemAp = 0;
  let itemArmor = 0;
  let itemMr = 0;
  let itemAsPct = 0;
  let itemCritPct = 0;
  let itemCritDmgBonus = 0;
  let itemFlatMs = 0;
  let itemPctMs = 0;
  let itemAh = 0;
  let itemLethality = 0;
  let itemArmorPenPct = 0;
  let itemMagicPenFlat = 0;
  let itemMagicPenPct = 0;
  let itemHealShield = 0;
  let itemLifeSteal = 0;
  let itemOmnivamp = 0;
  let itemHpRegenPct = 0;
  let itemManaRegenPct = 0;
  let totalGold = 0;
  let tenacityMultiplier = 1 - withRunes.tenacityPct / 100;

  let hasHeartsteel = false;
  let hasPlatedSteelcaps = false;
  let hasJakSho = false;
  let hasDuskAndDawn = false;
  let hasGuinsoo = false;
  let hasSpiritVisage = false;
  let hasUnendingDespair = false;
  let hasRanduin = false;
  let hasAntiHeal = false;
  let hasProtoplasm = false;
  let hasNashor = false;
  let hasWitsEnd = false;
  let hasBork = false;
  let hasLiandry = false;
  let hasLichBane = false;
  let hasTrinity = false;
  let hasIceborn = false;
  let spellbladeItemsCount = 0;
  let bootsCount = 0;

  const activePassives: ActiveItemPassiveInfo[] = [];

  for (const it of items) {
    const p = parseExactItemStats(it);
    const lowName = it.name.toLowerCase();
    const lowText = `${lowName} ${decodeHtmlText(it.description).toLowerCase()}`;

    totalGold += it.gold.total;
    itemHp += p.hp;
    itemMana += p.mana;
    itemAd += p.ad;
    itemAp += p.ap;
    itemArmor += p.armor;
    itemMr += p.mr;
    itemAsPct += p.attackSpeedPct;
    itemCritPct += p.critChancePct;
    itemCritDmgBonus += p.critDamageBonusPct;
    itemFlatMs += p.flatMoveSpeed;
    itemPctMs += p.percentMoveSpeedPct;
    itemAh += p.abilityHaste;
    itemLethality += p.lethality;
    itemArmorPenPct = Math.max(itemArmorPenPct, p.armorPenPct);
    itemMagicPenFlat += p.magicPenFlat;
    itemMagicPenPct = Math.max(itemMagicPenPct, p.magicPenPct);
    itemHealShield += p.healShieldPowerPct;
    itemLifeSteal += p.lifeStealPct;
    itemOmnivamp += p.omnivampPct;
    itemHpRegenPct += p.hpRegenPct;
    itemManaRegenPct += p.manaRegenPct;

    if (p.tenacityPct > 0) {
      tenacityMultiplier *= 1 - p.tenacityPct / 100;
    }

    if (it.tags.includes('Boots')) {
      bootsCount += 1;
    }

    if (it.id === '3084' || lowName.includes('cœuracier') || lowName.includes('heartsteel')) {
      hasHeartsteel = true;
    }
    if (it.id === '3047' || lowName.includes('coques en acier')) {
      hasPlatedSteelcaps = true;
    }
    if (it.id === '6665' || lowName.includes("jak'sho")) {
      hasJakSho = true;
    }
    if (it.id === '2510' || lowName.includes('aube et crépuscule') || lowName.includes('dusk and dawn')) {
      hasDuskAndDawn = true;
      spellbladeItemsCount += 1;
    }
    if (it.id === '3124' || lowName.includes('guinsoo')) {
      hasGuinsoo = true;
    }
    if (it.id === '3065' || lowName.includes('visage spirituel')) {
      hasSpiritVisage = true;
    }
    if (it.id === '2502' || lowName.includes('désespoir infini')) {
      hasUnendingDespair = true;
    }
    if (it.id === '3143' || lowName.includes('randuin')) {
      hasRanduin = true;
    }
    if (it.id === '2525' || lowName.includes('harnais protoplasmique')) {
      hasProtoplasm = true;
    }
    if (it.id === '3115' || lowName.includes('nashor')) hasNashor = true;
    if (it.id === '3091' || lowName.includes('bout du rouleau')) hasWitsEnd = true;
    if (it.id === '3153' || lowName.includes('roi déchu')) hasBork = true;
    if (it.id === '6653' || lowName.includes('liandry')) hasLiandry = true;
    if (it.id === '3100' || lowName.includes('fléau de liche')) {
      hasLichBane = true;
      spellbladeItemsCount += 1;
    }
    if (it.id === '3078' || lowName.includes('force de la trinité')) {
      hasTrinity = true;
      spellbladeItemsCount += 1;
    }
    if (it.id === '6662' || lowName.includes('gantelet givrant')) {
      hasIceborn = true;
      spellbladeItemsCount += 1;
    }

    if (lowText.match(/hémorragie|blessures graves|grievous wounds/)) {
      hasAntiHeal = true;
    }
  }

  // Bonus Heartsteel optionnel
  const effectiveHeartsteelHp = hasHeartsteel ? heartsteelStacksHp : 0;
  itemHp += effectiveHeartsteelHp;

  // Conditionnement (rune 8429) : +3% Armure/RM bonus à partir du niv. 9
  const hasConditioning =
    clampedLvl >= 9 &&
    (runeSelection.primaryMinorIds.includes(8429) || runeSelection.secondaryMinorIds.includes(8429));
  const totalHp = Math.round(baseHp + runeHp + itemHp);
  const bonusHp = Math.round(runeHp + itemHp);
  const bonusArmorSum = runeArmor + itemArmor;
  const bonusMrSum = runeMr + itemMr;
  const conditioningArmor = hasConditioning ? bonusArmorSum * 0.03 : 0;
  const conditioningMr = hasConditioning ? bonusMrSum * 0.03 : 0;

  const totalArmor = Number((baseArmor + bonusArmorSum + conditioningArmor).toFixed(1));
  const totalMr = Number((baseMr + bonusMrSum + conditioningMr).toFixed(1));
  const totalAd = Number((baseAd + runeAd + itemAd).toFixed(1));
  const totalAp = Math.round(runeAp + itemAp);
  const totalMana = Math.round(baseMana + itemMana);
  const totalAh = Math.round(runeAh + itemAh);
  const cooldownReductionPct = Math.round((totalAh / (100 + totalAh)) * 100);
  const totalCritPct = Math.min(100, itemCritPct);
  const totalCritDmgPct = 175 + itemCritDmgBonus;
  const totalHealShieldPct = withRunes.healShieldPowerPct + itemHealShield;
  const healShieldReceivedPct = hasSpiritVisage ? 25 : 0;
  const totalTenacityPct = Math.round((1 - tenacityMultiplier) * 100);
  const antiHealPct = hasAntiHeal ? 40 : 0;
  const aaDamageReductionPct = hasPlatedSteelcaps ? 10 : 0;
  const critDamageReductionPct = hasRanduin ? 30 : 0;
  const combatBonusResistPct = hasJakSho ? 30 : 0;
  const doubleOnHitActive = hasDuskAndDawn || hasGuinsoo;

  // Guinsoo donne jusqu'à +32% AS empilé en combat
  const guinsooBonusAsPct = hasGuinsoo ? 32 : 0;
  const totalAsBonusRatio =
    (champion.stats.attackspeedperlevel * levelAsProgress +
      runeAsBonusPct +
      itemAsPct +
      guinsooBonusAsPct) /
    100;
  const rawUncappedAs = champion.stats.attackspeed * (1 + totalAsBonusRatio);
  const uncappedAttackSpeed = Number(rawUncappedAs.toFixed(3));
  const totalAs = Number(Math.min(2.5, rawUncappedAs).toFixed(3));
  const asOvercapPct =
    rawUncappedAs > 2.5
      ? Math.round(((rawUncappedAs - 2.5) / Math.max(0.1, champion.stats.attackspeed)) * 100)
      : 0;

  // Vitesse de déplacement : (Base + FlatObjets + FlatRunes) * (1 + %MS)
  const rawMs = (baseMs + itemFlatMs + runeMs) * (1 + itemPctMs / 100);
  const totalMs = Math.round(rawMs);

  // 4. Simulation des Passifs Uniques, Effets à l'Impact (On-Hit) et Lame Enchantée
  const isHpScaler = HP_SCALING_CHAMPIONS.has(champion.id);

  // Dégâts à l'impact propres au champion (ex. Tahm Kench Goût acquis = 4% PV bonus + 2% AP pour 100 PV bonus + scaling niveau)
  let champOnHitMagic = 0;
  if (champion.id === 'TahmKench') {
    champOnHitMagic = Math.round(6 + clampedLvl * 2.5 + bonusHp * (0.04 + totalAp / 5000));
  } else if (champion.id === 'Teemo') {
    champOnHitMagic = Math.round(14 + clampedLvl * 3.2 + totalAp * 0.3);
  } else if (champion.id === 'Kayle') {
    champOnHitMagic = Math.round(15 + clampedLvl * 2 + totalAp * 0.2);
  } else if (champion.id === 'Gwen') {
    champOnHitMagic = Math.round(25 + totalAp * 0.08);
  } else if (champion.id === 'Warwick') {
    champOnHitMagic = Math.round(12 + clampedLvl * 2 + Math.max(0, totalAd - baseAd) * 0.15 + totalAp * 0.1);
  } else if (champion.id === 'Viego') {
    champOnHitMagic = Math.round(totalHp * 0.015 + 35);
  }

  let itemOnHitDmg = 0;
  if (hasGuinsoo) itemOnHitDmg += 30;
  if (hasNashor) itemOnHitDmg += Math.round(15 + totalAp * 0.15);
  if (hasWitsEnd) itemOnHitDmg += 45;
  if (hasBork) itemOnHitDmg += 105; // ~8-10% PV actuels d'une cible moyenne (~1400 PV)

  const baseOnHitPerAttack = champOnHitMagic + itemOnHitDmg;

  // Multiplicateur de fréquence On-Hit (Aube et crépuscule applique les effets à l'impact 1 fois de plus après chaque sort ; Guinsoo toutes les 3 attaques)
  const onHitDoubleMultiplier = hasDuskAndDawn && hasGuinsoo ? 1.85 : hasDuskAndDawn ? 1.65 : hasGuinsoo ? 1.33 : 1.0;
  const effectiveOnHitPerAttack = Math.round(baseOnHitPerAttack * onHitDoubleMultiplier);

  // Lame enchantée (Spellblade unique)
  let spellbladeProcDmg = 0;
  let spellbladeIntervalSec = 2.0;
  if (hasDuskAndDawn) {
    spellbladeProcDmg = Math.round(0.75 * baseAd + 0.1 * totalAp);
    spellbladeIntervalSec = Math.max(1.5, 2.2 - totalAh * 0.012);
    activePassives.push({
      itemId: '2510',
      itemName: 'Aube et crépuscule',
      effectTitle: 'Lame enchantée + Double On-Hit',
      detail: `+${spellbladeProcDmg} dégâts magiques après sort · Soin ~${Math.round(
        (0.1 * totalAp + 0.03 * bonusHp) * (1 + healShieldReceivedPct / 100),
      )} PV · Double l'application des effets à l'impact (${baseOnHitPerAttack} → ${effectiveOnHitPerAttack}/coup en moyenne).`,
    });
  } else if (hasLichBane) {
    spellbladeProcDmg = Math.round(0.75 * baseAd + 0.45 * totalAp);
    activePassives.push({
      itemId: '3100',
      itemName: 'Fléau de liche',
      effectTitle: 'Lame enchantée AP',
      detail: `+${spellbladeProcDmg} dégâts magiques après compétence (CD 1.5s).`,
    });
  } else if (hasTrinity) {
    spellbladeProcDmg = Math.round(2.0 * baseAd);
    activePassives.push({
      itemId: '3078',
      itemName: 'Force de la trinité',
      effectTitle: 'Lame enchantée AD',
      detail: `+${spellbladeProcDmg} dégâts physiques après compétence (CD 1.5s).`,
    });
  } else if (hasIceborn) {
    spellbladeProcDmg = Math.round(1.5 * baseAd);
    activePassives.push({
      itemId: '6662',
      itemName: 'Gantelet givrant',
      effectTitle: 'Lame enchantée & Zone glaciale',
      detail: `+${spellbladeProcDmg} dégâts + zone de ralentissement AoE.`,
    });
  }

  if (hasHeartsteel) {
    const hsProc = Math.round(70 + totalHp * 0.06);
    activePassives.push({
      itemId: '3084',
      itemName: 'Cœuracier',
      effectTitle: 'Consommation colossale',
      detail: `+${hsProc} dégâts physiques sur proc (et +${Math.round(hsProc * 0.1)} PV max permanents / proc).`,
    });
  }
  if (hasSpiritVisage) {
    activePassives.push({
      itemId: '3065',
      itemName: 'Visage spirituel',
      effectTitle: 'Vitalité intarissable (+25%)',
      detail: `Amplifie de +25% tous les soins et boucliers reçus (Aube, Désespoir infini, Poigne, sorts).`,
    });
  }
  if (hasUnendingDespair) {
    const drainTick = Math.round((30 + totalHp * 0.03) * (1 + healShieldReceivedPct / 100));
    activePassives.push({
      itemId: '2502',
      itemName: 'Désespoir infini',
      effectTitle: 'Affliction (toutes les 4s)',
      detail: `Drain AoE en combat estimé à ~${drainTick} PV toutes les 4s par champion proche.`,
    });
  }
  if (hasJakSho) {
    activePassives.push({
      itemId: '6665',
      itemName: "Jak'Sho, le Protéiforme",
      effectTitle: 'Vigueur de Néantin (+30%)',
      detail: `+${Math.round(bonusArmorSum * 0.3)} Armure et +${Math.round(bonusMrSum * 0.3)} RM bonus après 5s de combat.`,
    });
  }
  if (hasPlatedSteelcaps) {
    activePassives.push({
      itemId: '3047',
      itemName: 'Coques en acier',
      effectTitle: 'Placage (-10% AA)',
      detail: `Réduit de 10% les dégâts de toutes les attaques de base subies.`,
    });
  }
  if (hasRanduin) {
    activePassives.push({
      itemId: '3143',
      itemName: 'Présage de Randuin',
      effectTitle: 'Vigueur (-30% Crit)',
      detail: `Réduit de 30% les dégâts critiques adverses + ralentissement actif 70%.`,
    });
  }
  if (hasProtoplasm) {
    activePassives.push({
      itemId: '2525',
      itemName: 'Harnais protoplasmique',
      effectTitle: 'Lien vital (+25% Ténacité)',
      detail: `Sursaut de PV max & soin d'urgence sous 30% PV avec +25% Ténacité et +10% vitesse.`,
    });
  }
  if (hasAntiHeal) {
    activePassives.push({
      itemId: 'antiheal',
      itemName: 'Anti-soin actif',
      effectTitle: 'Hémorragie (40%)',
      detail: `Réduit de 40% les soins et la régénération des champions ennemis touchés.`,
    });
  }
  if (hasGuinsoo) {
    activePassives.push({
      itemId: '3124',
      itemName: 'Lame enragée de Guinsoo',
      effectTitle: 'Frappe furieuse',
      detail: `+32% vitesse d'attaque empilée + double application à l'impact toutes les 3 attaques.`,
    });
  }

  // 5. EHP Réel (incluant Jak'Sho +30% résistances bonus, Coques -10%, Randuin -30% Crit, Visage spirituel)
  const combatArmor = hasJakSho ? totalArmor + bonusArmorSum * 0.3 : totalArmor;
  const combatMr = hasJakSho ? totalMr + bonusMrSum * 0.3 : totalMr;
  const hasEnemyCritThreat =
    threats?.profiles.some((p) => p.archetype.includes('Marksman')) ?? false;
  const physMitigationFactor =
    (hasPlatedSteelcaps ? 1.07 : 1) * (hasRanduin && hasEnemyCritThreat ? 1.12 : 1);

  const healAmp = 1 + healShieldReceivedPct / 100;
  const duskHealPerSec = hasDuskAndDawn
    ? ((0.1 * totalAp + 0.03 * bonusHp) / spellbladeIntervalSec) * healAmp
    : 0;
  const despairHealPerSec = hasUnendingDespair
    ? ((28 + totalHp * 0.025) / 4) * healAmp
    : 0;
  const champSustainPerSec =
    champion.id === 'TahmKench' ? ((20 + bonusHp * 0.025) / 4.5) * healAmp : 0;
  const combatSustainPerSec = Math.round(duskHealPerSec + despairHealPerSec + champSustainPerSec);

  // Bonus EHP effectif sur 6 secondes de combat grâce au sustain en combat (cappé raisonnablement)
  const effectiveCombatHp = totalHp + Math.min(totalHp * 0.35, combatSustainPerSec * 5);

  const physicalEhp = Math.round(effectiveCombatHp * (1 + combatArmor / 100) * physMitigationFactor);
  const magicEhp = Math.round(effectiveCombatHp * (1 + combatMr / 100));

  const physShare = (threats?.physicalShare ?? 50) / 100;
  const magShare = (threats?.magicShare ?? 50) / 100;
  const weightedEhp = Math.round(physicalEhp * physShare + magicEhp * magShare);

  // 6. Calcul DPS réaliste contre une cible adverse moyenne (Armure/RM estimées selon la compo)
  const dummyArmor = Math.max(20, 75 + (threats?.tankCount ?? 1) * 28 - itemLethality) * (1 - itemArmorPenPct / 100);
  const dummyMr = Math.max(20, (55 + (threats?.tankCount ?? 1) * 22) * (1 - itemMagicPenPct / 100) - itemMagicPenFlat);
  const physMult = 100 / (100 + dummyArmor);
  const magMult = 100 / (100 + dummyMr);

  const critMultiplier = 1 + (totalCritPct / 100) * ((totalCritDmgPct - 100) / 100);
  const rawPhysAutoDps = totalAd * critMultiplier * totalAs * physMult;
  const rawMagicOnHitDps = effectiveOnHitPerAttack * totalAs * magMult;
  const spellbladeDps =
    (spellbladeProcDmg / spellbladeIntervalSec) * (hasTrinity || hasIceborn ? physMult : magMult);
  const liandryDps = hasLiandry ? 45 * magMult : 0;
  const heartsteelDps = hasHeartsteel ? ((70 + totalHp * 0.06) / 12) * physMult : 0;

  const autoDps = Math.round(
    rawPhysAutoDps + rawMagicOnHitDps + spellbladeDps + liandryDps + heartsteelDps,
  );

  const spellCycleMultiplier = 1 + totalAh / 100;
  const abilityImpactIndex = Math.round(
    (totalAp * 1.15 +
      Math.max(0, totalAd - baseAd) * 1.25 +
      (isHpScaler ? bonusHp * 0.12 : 0) +
      totalHealShieldPct * 12 +
      healShieldReceivedPct * 3.5 +
      (hasDuskAndDawn ? 65 : 0) +
      (hasLiandry ? 55 : 0)) *
      (0.85 + 0.15 * spellCycleMultiplier),
  );

  const itemStatGoldValue = Math.round(
    itemHp * GOLD_PER_STAT.hp +
      itemMana * GOLD_PER_STAT.mana +
      itemAd * GOLD_PER_STAT.ad +
      itemAp * GOLD_PER_STAT.ap +
      itemArmor * GOLD_PER_STAT.armor +
      itemMr * GOLD_PER_STAT.mr +
      itemAsPct * GOLD_PER_STAT.asPct +
      itemCritPct * GOLD_PER_STAT.critPct +
      itemAh * GOLD_PER_STAT.ah +
      itemFlatMs * GOLD_PER_STAT.msFlat +
      itemPctMs * 45 +
      itemLethality * GOLD_PER_STAT.lethality +
      itemMagicPenFlat * GOLD_PER_STAT.magicPenFlat +
      itemHealShield * GOLD_PER_STAT.healShieldPct +
      itemLifeSteal * GOLD_PER_STAT.lifeStealPct +
      (itemHpRegenPct + itemManaRegenPct) * GOLD_PER_STAT.regenPct,
  );

  const runeGoldValue = Math.round(
    runeHp * GOLD_PER_STAT.hp +
      runeAd * GOLD_PER_STAT.ad +
      runeAp * GOLD_PER_STAT.ap +
      runeArmor * GOLD_PER_STAT.armor +
      runeMr * GOLD_PER_STAT.mr +
      runeAh * GOLD_PER_STAT.ah +
      runeMs * GOLD_PER_STAT.msFlat +
      runeAsBonusPct * GOLD_PER_STAT.asPct +
      withRunes.tenacityPct * GOLD_PER_STAT.tenacityPct +
      withRunes.healShieldPowerPct * GOLD_PER_STAT.healShieldPct,
  );

  const goldEfficiencyPct =
    totalGold > 0 ? Math.round((itemStatGoldValue / totalGold) * 100) : 100;

  return {
    level: clampedLvl,
    totals: {
      hp: totalHp,
      mana: totalMana,
      ad: totalAd,
      ap: totalAp,
      armor: totalArmor,
      mr: totalMr,
      attackSpeed: totalAs,
      uncappedAttackSpeed,
      asOvercapPct,
      abilityHaste: totalAh,
      cooldownReductionPct,
      moveSpeed: totalMs,
      critChancePct: totalCritPct,
      critDamagePct: totalCritDmgPct,
      lethality: itemLethality,
      armorPenPct: itemArmorPenPct,
      magicPenFlat: itemMagicPenFlat,
      magicPenPct: itemMagicPenPct,
      tenacityPct: totalTenacityPct,
      healShieldPowerPct: totalHealShieldPct,
      healShieldReceivedPct,
      lifeStealPct: itemLifeSteal,
      omnivampPct: itemOmnivamp,
      hpRegenPct: itemHpRegenPct,
      manaRegenPct: itemManaRegenPct,
      antiHealPct,
      aaDamageReductionPct,
      critDamageReductionPct,
      combatBonusResistPct,
      doubleOnHitActive,
    },
    sources: {
      hp: { base: baseHp, items: Math.round(itemHp), runes: Math.round(runeHp) },
      ad: { base: Number(baseAd.toFixed(1)), items: Number(itemAd.toFixed(1)), runes: runeAd },
      ap: { base: 0, items: Math.round(itemAp), runes: Math.round(runeAp) },
      armor: {
        base: Number(baseArmor.toFixed(1)),
        items: Number(itemArmor.toFixed(1)),
        runes: Number((runeArmor + conditioningArmor).toFixed(1)),
      },
      mr: {
        base: Number(baseMr.toFixed(1)),
        items: Number(itemMr.toFixed(1)),
        runes: Number((runeMr + conditioningMr).toFixed(1)),
      },
      abilityHaste: { base: 0, items: Math.round(itemAh), runes: Math.round(runeAh) },
      moveSpeed: { base: baseMs, items: Math.round(totalMs - baseMs - runeMs), runes: Math.round(runeMs) },
    },
    combat: {
      physicalEhp,
      magicEhp,
      weightedEhp,
      autoDps,
      onHitPerAttack: effectiveOnHitPerAttack,
      spellbladeProcDmg,
      combatSustainPerSec,
      abilityImpactIndex,
      totalGold,
      statGoldValue: itemStatGoldValue,
      goldEfficiencyPct,
      runeGoldValue,
    },
    activePassives,
    itemCount: items.length,
    spellbladeItemsCount,
    bootsCount,
  };
}

/**
 * Vérifie et prouve pourquoi une page de runes est adaptée ou non au match-up.
 */
export function validateRuneConfiguration(params: {
  champion: ChampionSummary;
  role: Role;
  threats: EnemyThreatSummary;
  selection: RunePageSelection;
  stats: FullBuildStatBreakdown;
}): RuneValidationCheck[] {
  const { champion, role, threats, selection, stats } = params;
  const allRunes = new Set([
    selection.keystoneId,
    ...selection.primaryMinorIds,
    ...selection.secondaryMinorIds,
  ]);
  const isTankOrSupport = champion.tags.includes('Tank') || role === 'SUPPORT';
  const hasSurvivalRune =
    allRunes.has(8444) || allRunes.has(8473) || allRunes.has(8345) || allRunes.has(8451) || allRunes.has(9111);
  const hasTenacityOrMerc = stats.totals.tenacityPct >= 10;
  const checks: RuneValidationCheck[] = [];

  checks.push({
    label: 'Valeur stat réelle des runes',
    passed: stats.combat.runeGoldValue >= 350,
    detail: `Équivalent à ~${stats.combat.runeGoldValue} po de statistiques pures au niv. ${stats.level} (sans compter l’effet actif de la fondamentale).`,
  });

  if (threats.ccThreatCount >= 2) {
    checks.push({
      label: `Couverture Contrôles (${threats.ccThreatCount} CC adverses)`,
      passed: hasTenacityOrMerc || allRunes.has(8465),
      detail: hasTenacityOrMerc
        ? `${stats.totals.tenacityPct}% de Ténacité cumulée validée contre les contrôles ennemis.`
        : 'Aucune ténacité sur les runes/bottes : envisagez Sandales de Mercure ou le fragment +10% Ténacité.',
    });
  }

  if (threats.burstThreatCount >= 2 || isTankOrSupport) {
    checks.push({
      label: 'Tenue de lane & Anti-Burst',
      passed: hasSurvivalRune,
      detail: hasSurvivalRune
        ? 'Présence validée de runes de survie (Plaque d’os / Second souffle / Biscuits / Surcroissance / Triomphe).'
        : 'Aucune rune défensive active : attention aux échanges courts et ganks en début de partie.',
    });
  }

  const isHpScaler = HP_SCALING_CHAMPIONS.has(champion.id);
  if (isHpScaler) {
    const usesHpRunes = allRunes.has(8437) || allRunes.has(8451) || selection.shardIndices[2] !== 1;
    checks.push({
      label: `Synergie ratios PV (${champion.name})`,
      passed: usesHpRunes,
      detail: usesHpRunes
        ? `Validé : vos runes augmentent vos PV max (+${stats.sources.hp.runes} PV), boostant passif et boucliers.`
        : 'Vous ne prenez pas de runes à scaling PV alors que votre kit scale directement sur vos PV max.',
    });
  } else {
    checks.push({
      label: 'Alignement Arbre / Archétype',
      passed: stats.totals.ad > 0 || stats.totals.ap > 0,
      detail: `Cohérence validée pour ${champion.name} (${role}) avec ${stats.totals.abilityHaste} Hâte (${stats.totals.cooldownReductionPct}% CDR).`,
    });
  }

  return checks;
}

export function inferStyle(
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

function buildRuneVariantsForStyle(
  runeTrees: RuneTree[],
  style: ReturnType<typeof inferStyle>,
  champ: ChampionSummary,
  threats: EnemyThreatSummary,
  baseSelection: RunePageSelection,
): Array<{ label: string; selection: RunePageSelection }> {
  const variants: Array<{ label: string; selection: RunePageSelection }> = [
    { label: 'Page Méta', selection: baseSelection },
  ];

  const resolveTree = runeTrees.find((t) => t.key === 'Resolve');
  const inspTree = runeTrees.find((t) => t.key === 'Inspiration');
  const precTree = runeTrees.find((t) => t.key === 'Precision');
  const domTree = runeTrees.find((t) => t.key === 'Domination');
  const sorcTree = runeTrees.find((t) => t.key === 'Sorcery');

  if (style === 'TANK' && resolveTree && inspTree) {
    variants.push({
      label: 'Gardien Anti-Burst',
      selection: {
        primaryTreeId: resolveTree.id,
        secondaryTreeId: inspTree.id,
        keystoneId: 8465, // Gardien
        primaryMinorIds: [8401, 8473, 8451],
        secondaryMinorIds: [8345, 8347],
        shardIndices: [2, 2, threats.ccThreatCount >= 2 ? 1 : 0],
      },
    });
    if (precTree) {
      variants.push({
        label: 'Volonté + Précision (Duelliste / AS)',
        selection: {
          primaryTreeId: resolveTree.id,
          secondaryTreeId: precTree.id,
          keystoneId: 8437, // Poigne
          primaryMinorIds: [8401, 8429, 8451],
          secondaryMinorIds: [9111, 9104], // Triomphe + Alacrité (AS)
          shardIndices: [1, 2, threats.ccThreatCount >= 2 ? 1 : 2],
        },
      });
    }
  } else if ((style === 'AP_MAGE' || style === 'ENCHANTER') && sorcTree && resolveTree) {
    variants.push({
      label: 'Sorcellerie + Volonté (Survie)',
      selection: {
        primaryTreeId: sorcTree.id,
        secondaryTreeId: resolveTree.id,
        keystoneId: style === 'ENCHANTER' ? 8214 : 8229,
        primaryMinorIds: [8226, 8210, 8237],
        secondaryMinorIds: [8473, 8451],
        shardIndices: [0, 2, 0],
      },
    });
    if (domTree && champ.id === 'Teemo') {
      variants.push({
        label: 'Moisson Noire + Sorcellerie',
        selection: {
          primaryTreeId: domTree.id,
          secondaryTreeId: sorcTree.id,
          keystoneId: 8128,
          primaryMinorIds: [8126, 8140, 8106],
          secondaryMinorIds: [8210, 8236],
          shardIndices: [1, 0, 2],
        },
      });
    }
  } else if (precTree && resolveTree) {
    variants.push({
      label: 'Précision + Volonté (Survie)',
      selection: {
        primaryTreeId: precTree.id,
        secondaryTreeId: resolveTree.id,
        keystoneId: style === 'AD_CRIT' ? 8021 : 8010,
        primaryMinorIds: [9111, 9104, 8299],
        secondaryMinorIds: [8473, 8451],
        shardIndices: [1, 0, threats.ccThreatCount >= 2 ? 1 : 0],
      },
    });
  }

  return variants;
}

/**
 * Calculateur combinatoire multi-situations :
 * Sélectionne un large vivier d'objets (jusqu'à 13 objets couvrant tanks, hybrides on-hit comme Aube et crépuscule,
 * anti-soin, résistances et peel économique) et évalue toutes les combinaisons (Bottes x Trios x Runes).
 */
export function runCombinatorialBuildAndRuneSearch(params: {
  gameMode: GameModeContext;
  playerChampion: ChampionSummary;
  duoPartner: ChampionSummary | null;
  role: Role;
  threats: EnemyThreatSummary;
  items: ItemData[];
  runeTrees: RuneTree[];
  baseRuneSelection: RunePageSelection;
  simLevel: number;
}): CombinatorialOptimizerResult {
  const {
    gameMode,
    playerChampion,
    duoPartner,
    role,
    threats,
    items,
    runeTrees,
    baseRuneSelection,
    simLevel,
  } = params;

  const style = inferStyle(playerChampion, role);
  const mapKey = gameMode === 'ARAM' ? '12' : '11';

  const validMapItems = items.filter(
    (it) =>
      Number(it.id) < 100000 &&
      it.gold.purchasable &&
      (!it.maps || it.maps[mapKey] !== false),
  );
  const dedup = new Map<string, ItemData>();
  for (const it of validMapItems) {
    const key = it.name.trim().toLowerCase();
    const prev = dedup.get(key);
    if (!prev || Number(it.id) < Number(prev.id)) dedup.set(key, it);
  }
  const pool = Array.from(dedup.values());

  // Top 2 bottes les plus cohérentes (pour garder un calcul combinatoire fluide)
  const allBoots = pool.filter(
    (it) => it.tags.includes('Boots') && it.gold.total >= 800 && it.gold.total <= 1500,
  );
  const candidateBoots = allBoots
    .sort((a, b) => scoreItemForStyle(b, style, threats, playerChampion) - scoreItemForStyle(a, style, threats, playerChampion))
    .slice(0, 2);

  // Vivier large d'objets complets (13 objets diversifiés : Core, On-Hit/Hybride, Anti-soin, Low-cost, Résistances)
  const allCompleted = pool.filter(
    (it) =>
      !it.tags.includes('Boots') &&
      !it.tags.includes('Consumable') &&
      !it.tags.includes('Trinket') &&
      it.gold.total >= 2100 &&
      (!it.into || it.into.length === 0),
  );

  const scoredAll = allCompleted
    .map((it) => ({
      item: it,
      baseScore: scoreItemForStyle(it, style, threats, playerChampion),
    }))
    .filter((x) => x.baseScore > 0)
    .sort((a, b) => b.baseScore - a.baseScore);

  const selectedMap = new Map<string, ItemData>();
  for (const entry of scoredAll.slice(0, 10)) {
    selectedMap.set(entry.item.id, entry.item);
  }

  // Garantir l'inclusion de spécialistes clés (Aube et crépuscule sur on-hit/spellweave, Anti-soin, Budget Peel)
  const forceIncludeIfViable = (predicate: (it: ItemData) => boolean) => {
    const hit = scoredAll.find((x) => predicate(x.item) && !selectedMap.has(x.item.id));
    if (hit) selectedMap.set(hit.item.id, hit.item);
  };

  if (ONHIT_SPELLWEAVE_CHAMPIONS.has(playerChampion.id) || style === 'AP_MAGE') {
    forceIncludeIfViable((it) => it.id === '2510'); // Aube et crépuscule
  }
  if (threats.highHealCount >= 1) {
    forceIncludeIfViable((it) =>
      Boolean(`${it.name} ${it.description}`.toLowerCase().match(/hémorragie|blessures graves/)),
    );
  }
  forceIncludeIfViable((it) => it.gold.total <= 2600 && ['3109', '3190', '2525', '3107'].includes(it.id));
  forceIncludeIfViable((it) => parseExactItemStats(it).mr >= 45);

  const rankedCompleted = Array.from(selectedMap.values()).slice(0, 13);

  const runeVariants = buildRuneVariantsForStyle(
    runeTrees,
    style,
    playerChampion,
    threats,
    baseRuneSelection,
  );

  // Générer tous les trios d'objets distincts (jusqu'à C(13,3) = 286 trios), en interdisant >1 Lame enchantée unique
  const isSpellblade = (it: ItemData) => ['2510', '3100', '3078', '6662'].includes(it.id);
  const itemTrios: ItemData[][] = [];
  for (let i = 0; i < rankedCompleted.length; i++) {
    for (let j = i + 1; j < rankedCompleted.length; j++) {
      for (let k = j + 1; k < rankedCompleted.length; k++) {
        const trio = [rankedCompleted[i], rankedCompleted[j], rankedCompleted[k]];
        const sbCount = trio.filter(isSpellblade).length;
        if (sbCount <= 1) {
          itemTrios.push(trio);
        }
      }
    }
  }

  let testedItemCombos = 0;
  let testedCombinationsCount = 0;

  type ScoredCombo = {
    items: ItemData[];
    runeSelection: RunePageSelection;
    stats: FullBuildStatBreakdown;
    balancedScore: number;
    behindScore: number;
    aheadScore: number;
    antiCompScore: number;
    hasAntiHeal: boolean;
    hasTenacity: boolean;
  };

  const evaluations: ScoredCombo[] = [];

  for (const boots of candidateBoots) {
    for (const trio of itemTrios) {
      testedItemCombos += 1;
      const comboItems = [boots, ...trio];
      const hasAntiHeal = comboItems.some((it) =>
        `${it.name} ${it.description}`.toLowerCase().match(/hémorragie|blessures graves|épineuse|thornmail|mortal|morello/),
      );
      const hasHeartsteel = comboItems.some((it) => it.id === '3084');
      const hasDuskAndDawn = comboItems.some((it) => it.id === '2510');
      const hasSpiritVisage = comboItems.some((it) => it.id === '3065');
      const hasPeelSupport = comboItems.some((it) =>
        ['3109', '3190', '3107', '3222', '2525'].includes(it.id),
      );

      for (const rv of runeVariants) {
        testedCombinationsCount += 1;
        const stats = computeFullChampionBuildStats({
          champion: playerChampion,
          role,
          level: simLevel,
          items: comboItems,
          runeSelection: rv.selection,
          threats,
        });

        const ehpScore = stats.combat.weightedEhp / 100;
        const dpsScore = (stats.combat.autoDps + stats.combat.abilityImpactIndex * 0.45) / 8;
        const sustainScore = stats.combat.combatSustainPerSec * 0.25;
        const effScore = stats.combat.goldEfficiencyPct * 0.26;
        const costPenaltyBehind = Math.max(0, (stats.combat.totalGold - 8800) / 75);

        const isTankOrSup = style === 'TANK' || style === 'ENCHANTER';
        const isOnHitUser = ONHIT_SPELLWEAVE_CHAMPIONS.has(playerChampion.id);

        const balancedScore =
          (isTankOrSup ? ehpScore * 1.08 + dpsScore * 0.62 : dpsScore * 1.15 + ehpScore * 0.55) +
          sustainScore +
          effScore +
          (hasAntiHeal && threats.highHealCount >= 1 ? 14 : 0) +
          (stats.totals.tenacityPct >= 25 && threats.ccThreatCount >= 2 ? 12 : 0) +
          (hasDuskAndDawn && isOnHitUser ? 10 : 0) +
          (hasDuskAndDawn && hasSpiritVisage ? 6 : 0) +
          (duoPartner && hasPeelSupport && role === 'SUPPORT' ? 8 : 0);

        const behindScore =
          ehpScore * 1.35 +
          sustainScore * 0.8 +
          effScore * 1.2 +
          (hasPeelSupport ? 20 : 0) +
          (rv.selection.keystoneId === 8465 || rv.selection.keystoneId === 8214 ? 14 : 0) -
          costPenaltyBehind -
          (hasHeartsteel ? 14 : 0);

        // En avance : valorise le vrai DPS combiné (dont Double On-Hit + Lame enchantée d'Aube et crépuscule) + scaling PV/AP
        const aheadScore =
          dpsScore * 1.35 +
          ehpScore * 0.72 +
          sustainScore * 0.9 +
          (hasHeartsteel ? 16 : 0) +
          (hasDuskAndDawn && isOnHitUser ? 26 : 0) +
          (hasHeartsteel && hasDuskAndDawn ? 10 : 0) +
          (rv.selection.keystoneId === 8437 ||
          rv.selection.keystoneId === 8128 ||
          rv.selection.keystoneId === 8008 ||
          rv.selection.keystoneId === 8010
            ? 14
            : 0);

        const antiCompScore =
          balancedScore +
          (hasAntiHeal && threats.highHealCount >= 1 ? 26 : 0) +
          (stats.totals.tenacityPct >= 25 && threats.ccThreatCount >= 2 ? 20 : 0) +
          (threats.physicalShare >= 65 && stats.totals.armor >= 140 ? 14 : 0) +
          (threats.magicShare >= 55 && stats.totals.mr >= 100 ? 14 : 0);

        evaluations.push({
          items: comboItems,
          runeSelection: rv.selection,
          stats,
          balancedScore,
          behindScore,
          aheadScore,
          antiCompScore,
          hasAntiHeal: Boolean(hasAntiHeal),
          hasTenacity: stats.totals.tenacityPct >= 20,
        });
      }
    }
  }

  const pickBest = (
    key: CombinatorialBuildCandidate['scenarioKey'],
    sortFn: (a: ScoredCombo, b: ScoredCombo) => number,
    meta: { title: string; badge: string; hint: string },
    excludeSigs: Set<string>,
  ): CombinatorialBuildCandidate | null => {
    const sorted = [...evaluations].sort(sortFn);
    const chosen =
      sorted.find((ev) => !excludeSigs.has(ev.items.map((i) => i.id).join('-'))) || sorted[0];
    if (!chosen) return null;

    const sig = chosen.items.map((i) => i.id).join('-');
    excludeSigs.add(sig);

    const pTree = runeTrees.find((t) => t.id === chosen.runeSelection.primaryTreeId);
    const sTree = runeTrees.find((t) => t.id === chosen.runeSelection.secondaryTreeId);
    const ks = pTree?.slots?.[0]?.runes?.find((r) => r.id === chosen.runeSelection.keystoneId);

    const rawScore =
      key === 'behind'
        ? chosen.behindScore
        : key === 'ahead'
          ? chosen.aheadScore
          : key === 'anti_comp'
            ? chosen.antiCompScore
            : chosen.balancedScore;

    const normalizedScore = Math.max(78, Math.min(99, Math.round(70 + rawScore / 9)));

    const reasons: string[] = [
      `Coût ${chosen.stats.combat.totalGold} po · Rentabilité Or ${chosen.stats.combat.goldEfficiencyPct}% · DPS ${chosen.stats.combat.autoDps}/s.`,
      `EHP Phys. ${chosen.stats.combat.physicalEhp} · EHP Mag. ${chosen.stats.combat.magicEhp} · Hâte ${chosen.stats.totals.abilityHaste}.`,
    ];
    if (chosen.stats.totals.doubleOnHitActive) {
      reasons.push(
        `Double effets à l'impact actif (${chosen.stats.combat.onHitPerAttack}/coup + Lame enchantée ${chosen.stats.combat.spellbladeProcDmg}).`,
      );
    }
    if (chosen.hasAntiHeal && threats.highHealCount >= 1) {
      reasons.push(`Coupe les soins de ${threats.highHealCount} menace(s) adverses.`);
    }
    if (chosen.hasTenacity && threats.ccThreatCount >= 2) {
      reasons.push(`${chosen.stats.totals.tenacityPct}% Ténacité contre les contrôles ennemis.`);
    }

    return {
      id: `${key}-${sig}-${chosen.runeSelection.keystoneId}`,
      scenarioKey: key,
      scenarioTitle: meta.title,
      scenarioBadge: meta.badge,
      situationHint: meta.hint,
      items: chosen.items,
      runeSelection: chosen.runeSelection,
      keystoneName: ks?.name || 'Fondamentale',
      primaryTreeName: pTree?.name || 'Principal',
      secondaryTreeName: sTree?.name || 'Secondaire',
      stats: chosen.stats,
      score: normalizedScore,
      reasons,
    };
  };

  const used = new Set<string>();
  const results: CombinatorialBuildCandidate[] = [];

  const balanced = pickBest(
    'balanced',
    (a, b) => b.balancedScore - a.balancedScore,
    {
      title: 'Optimal Équilibré (50/50)',
      badge: 'Meilleur ratio global',
      hint: 'Partie serrée ou standard : meilleur équilibre EHP, DPS, sustain et rentabilité d’or.',
    },
    used,
  );
  if (balanced) results.push(balanced);

  const behind = pickBest(
    'behind',
    (a, b) => b.behindScore - a.behindScore,
    {
      title: 'Je me fais dominer (Retard / Sécurité)',
      badge: 'Low-cost & Survie',
      hint: 'Si vous êtes derrière en or ou campé : pics moins chers, peel maximal et résistances immédiates.',
    },
    used,
  );
  if (behind) results.push(behind);

  const ahead = pickBest(
    'ahead',
    (a, b) => b.aheadScore - a.aheadScore,
    {
      title: 'En avance (Snowball / Duelliste DPS)',
      badge: 'Dégâts & Scaling max',
      hint: 'Si vous dominez votre lane : exploite les synergies offensives/on-hit (ex. Aube et crépuscule / Cœuracier).',
    },
    used,
  );
  if (ahead) results.push(ahead);

  const antiComp = pickBest(
    'anti_comp',
    (a, b) => b.antiCompScore - a.antiCompScore,
    {
      title: 'Spécialiste Anti-Composition',
      badge: 'Contre ciblé',
      hint: `Maximise les contres directs (${threats.highHealCount > 0 ? 'Anti-soin · ' : ''}${
        threats.ccThreatCount >= 2 ? 'Ténacité · ' : ''
      }${threats.physicalShare >= 60 ? 'Armure' : threats.magicShare >= 55 ? 'RM' : 'Résistances'}).`,
    },
    used,
  );
  if (antiComp) results.push(antiComp);

  return {
    testedCombinationsCount,
    testedItemCombos,
    testedRuneCombos: runeVariants.length,
    candidates: results,
  };
}

function scoreItemForStyle(
  item: ItemData,
  style: ReturnType<typeof inferStyle>,
  threats: EnemyThreatSummary,
  champ: ChampionSummary,
): number {
  const st = parseExactItemStats(item);
  const text = `${item.name} ${item.plaintext} ${decodeHtmlText(item.description)}`.toLowerCase();
  let score = 0;

  if (item.tags.includes('Boots')) {
    score = 35;
    if (st.armor > 0 && threats.physicalShare >= 58) score += 45;
    if (st.tenacityPct > 0 && (threats.ccThreatCount >= 2 || threats.magicShare >= 50)) score += 45;
    if (st.magicPenFlat > 0 && style === 'AP_MAGE') score += 35;
    if (st.attackSpeedPct > 0 && style === 'AD_CRIT') score += 38;
    if (st.abilityHaste > 0 && (style === 'ENCHANTER' || style === 'AP_MAGE' || style === 'AD_LETHALITY')) {
      score += 32;
    }
    if (text.includes('célérit') || text.includes('swiftness')) score += 22;
    return score;
  }

  const isOnHitChamp = ONHIT_SPELLWEAVE_CHAMPIONS.has(champ.id);
  const isDuskAndDawn = item.id === '2510' || item.name.toLowerCase().includes('aube et crépuscule');

  if (style === 'TANK') {
    if (isDuskAndDawn && isOnHitChamp) {
      // Aube et crépuscule : +300 PV, +60 AP, +20 Hâte, +20% AS + double on-hit sur Tahm Kench / Volibear / Shen
      return 62;
    }
    if (st.ad > 40 || st.ap > 75 || st.critChancePct > 0) return -50;
    score += st.hp * 0.05 + st.armor * 0.8 + st.mr * 0.8 + st.abilityHaste * 0.7;
    if (champ.id === 'TahmKench' && item.id === '3084') score += 38;
    if (['2502', '6665', '3065', '3109', '3190', '2525'].includes(item.id)) {
      score += 22;
    }
  } else if (style === 'ENCHANTER') {
    if (st.ad > 0) return -50;
    score += st.healShieldPowerPct * 3 + st.ap * 0.6 + st.abilityHaste * 1.4 + st.manaRegenPct * 0.15;
  } else if (style === 'AP_MAGE') {
    if (st.ad > 0) return -50;
    score += st.ap * 0.9 + st.abilityHaste * 1.2 + st.hp * 0.04 + st.magicPenFlat * 1.8 + st.magicPenPct * 1.2;
    if (isDuskAndDawn && isOnHitChamp) score += 36;
    if (champ.id === 'Teemo' && ['6653', '3115', '3118', '2503', '2510'].includes(item.id)) {
      score += 35;
    }
  } else if (style === 'AD_CRIT') {
    if (st.ap > 0 && item.id !== '3124') return -50;
    score += st.ad * 1.1 + st.critChancePct * 1.5 + st.attackSpeedPct * 0.9 + st.armorPenPct * 1.1;
  } else if (style === 'AD_LETHALITY') {
    if (st.ap > 0) return -50;
    score += st.ad * 1.1 + st.lethality * 2.2 + st.abilityHaste * 1.1 + st.armorPenPct * 1.1;
  } else {
    if (st.ap > 70 && !isOnHitChamp) return -50;
    score += st.ad * 1.1 + st.hp * 0.05 + st.abilityHaste * 1.2 + st.armor * 0.5 + st.mr * 0.5;
    if (isDuskAndDawn && isOnHitChamp) score += 34;
  }

  if (threats.physicalShare >= 62 && st.armor >= 30) score += 18;
  if (threats.magicShare >= 50 && st.mr >= 30) score += 18;
  if (threats.highHealCount >= 1 && text.match(/hémorragie|blessures graves|épineuse|thornmail|morello|rappel mortel/)) {
    score += 20;
  }

  return score;
}

// ============================================================================
// Simulateur brut Data Dragon, Impact Marginal par Objet & Dégâts en Temps Réel
// ============================================================================

export interface RawDDragonPassiveBlock {
  name: string;
  text: string;
  isActive: boolean;
}

export interface RawDataDragonItemDetails {
  itemId: string;
  name: string;
  goldTotal: number;
  rawStatsEntries: Array<{ key: string; label: string; value: number }>;
  parsedStatsLines: string[];
  passives: RawDDragonPassiveBlock[];
  scalingNote: string | null;
  tags: string[];
}

export interface CombatTargetConfig {
  id: string;
  name: string;
  hp: number;
  armor: number;
  mr: number;
}

export interface CombatItemProcBreakdown {
  itemId: string;
  itemName: string;
  effectName: string;
  damageType: 'Physique' | 'Magique';
  procsCount: number;
  rawDamage: number;
  mitigatedDamage: number;
  healingDone: number;
  formulaNote: string;
}

export interface RealTimeCombatDamageResult {
  durationSec: number;
  spellCasts: number;
  target: CombatTargetConfig;
  effectiveArmor: number;
  effectiveMr: number;
  physicalMitigationPct: number;
  magicMitigationPct: number;
  autoAttacksCount: number;
  spellbladeProcsCount: number;
  extraDoubleOnHitProcs: number;
  physicalAutoRaw: number;
  physicalAutoMitigated: number;
  baseOnHitRaw: number;
  baseOnHitMitigated: number;
  doubleOnHitBonusRaw: number;
  doubleOnHitBonusMitigated: number;
  spellbladeRaw: number;
  spellbladeMitigated: number;
  abilityKitRaw: number;
  abilityKitMitigated: number;
  spellAndDotMitigated: number;
  itemPassivesBreakdown: CombatItemProcBreakdown[];
  totalRawDamage: number;
  totalMitigatedDamage: number;
  realDps: number;
  targetHpPctRemoved: number;
  estimatedTtkSec: number;
  combatHealingTotal: number;
  hasDoubleOnHit: boolean;
}

export interface PerItemImpactRow {
  slotIndex: number;
  item: ItemData;
  rawDetails: RawDataDragonItemDetails;
  goldEfficiencySelfPct: number;
  deltaHp: number;
  deltaAd: number;
  deltaAp: number;
  deltaArmor: number;
  deltaMr: number;
  deltaAs: number;
  deltaAh: number;
  deltaPhysicalEhp: number;
  deltaMagicEhp: number;
  deltaTotalDamage: number;
  deltaRealDps: number;
  deltaCombatHealing: number;
  damageSharePct: number;
}

const DDRAGON_STAT_KEY_LABELS: Record<string, string> = {
  FlatHPPoolMod: 'PV',
  FlatMPPoolMod: 'Mana',
  FlatPhysicalDamageMod: "Dégâts d'attaque",
  FlatMagicDamageMod: 'Puissance',
  FlatArmorMod: 'Armure',
  FlatSpellBlockMod: 'Résistance magique',
  PercentAttackSpeedMod: "Vitesse d'attaque (ratio)",
  FlatCritChanceMod: 'Chances de critique (ratio)',
  FlatMovementSpeedMod: 'Vitesse de déplacement (plat)',
  PercentMovementSpeedMod: 'Vitesse de déplacement (ratio)',
  PercentLifeStealMod: 'Vol de vie (ratio)',
};

const KNOWN_SCALING_NOTES_BY_ITEM_ID: Record<string, string> = {
  '2510':
    "Aube et crépuscule (parfois appelée Aube de Haut-Lacère) : Lame enchantée = 75% AD de base + 10% AP en dégâts magiques, soin de 10% AP + 3% PV bonus, et déclenche une 2e application des effets à l'impact (ex. Goût acquis de Tahm Kench) après chaque sort (CD 1.5s).",
  '3084':
    "Consommation colossale : inflige 70 + 6% des PV max en dégâts physiques après 3s à portée et octroie 10% des dégâts infligés en PV max permanents.",
  '2502':
    "Affliction : toutes les 4s en combat, inflige ~30 + 3% PV max en dégâts magiques AoE autour de vous et soigne de 250% des dégâts infligés.",
  '3065':
    "Vitalité intarissable : multiplie par ×1.25 tous les soins et boucliers reçus (Aube et crépuscule, Désespoir infini, Poigne, sorts).",
  '3075':
    "Épines : renvoie des dégâts magiques (20 + 15% Armure bonus) à chaque attaque subie et applique 40% Hémorragie pendant 3s.",
  '6665':
    "Vigueur de Néantin : après 5s en combat, augmente votre Armure bonus et votre RM bonus de +30% jusqu'à la fin du combat.",
  '3047':
    "Placage : réduit de 10% les dégâts de toutes les attaques de base subies (valeur non visible dans l'Armure brute).",
  '3124':
    "Frappe furieuse : octroie +30 dégâts magiques à l'impact, jusqu'à +32% AS cumulée et double l'impact toutes les 3 attaques.",
  '3153':
    "Brume ravagée : inflige un % des PV actuels de la cible (8% mêlée / 5% distance) en dégâts physiques à l'impact.",
  '6653':
    "Tourment : brûle la cible de 2% de ses PV max par seconde en dégâts magiques pendant 3s sur chaque sort.",
};

/**
 * Extrait fidèlement les données brutes de Data Dragon pour un objet :
 * dictionnaire item.stats, lignes <stats>, blocs <passive>/<active> et formules de scaling réelles.
 */
export function extractRawDataDragonItemDetails(item: ItemData): RawDataDragonItemDetails {
  const rawStatsEntries = Object.entries(item.stats || {})
    .filter(([, val]) => typeof val === 'number' && val !== 0)
    .map(([key, value]) => ({
      key,
      label: DDRAGON_STAT_KEY_LABELS[key] || key,
      value: Number(value),
    }));

  const statsMatch = item.description.match(/<stats>([\s\S]*?)<\/stats>/i);
  const parsedStatsLines = statsMatch
    ? decodeHtmlText(statsMatch[1])
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  // Extraire le corps après </stats> pour isoler passifs et actifs Data Dragon
  const bodyAfterStats = item.description.replace(/<stats>[\s\S]*?<\/stats>/i, '');
  const passives: RawDDragonPassiveBlock[] = [];

  const blockRegex = /<(passive|active)>([\s\S]*?)<\/\1>([\s\S]*?)(?=<(?:passive|active)>|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(bodyAfterStats)) !== null) {
    const isActive = match[1].toLowerCase() === 'active';
    const title = decodeHtmlText(match[2]).replace(/\s+/g, ' ').trim();
    const text = decodeHtmlText(match[3]).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (title || text) {
      passives.push({
        name: title || (isActive ? 'Actif unique' : 'Passif unique'),
        text: text || item.plaintext || 'Effet passif actif en combat.',
        isActive,
      });
    }
  }

  if (passives.length === 0) {
    const fallbackText = decodeHtmlText(bodyAfterStats).replace(/\n+/g, ' ').trim();
    if (fallbackText && fallbackText !== item.plaintext) {
      passives.push({
        name: 'Effet Data Dragon',
        text: fallbackText,
        isActive: false,
      });
    }
  }

  return {
    itemId: item.id,
    name: item.name,
    goldTotal: item.gold.total,
    rawStatsEntries,
    parsedStatsLines,
    passives,
    scalingNote: KNOWN_SCALING_NOTES_BY_ITEM_ID[item.id] || null,
    tags: item.tags || [],
  };
}

/**
 * Simule en temps réel les dégâts infligés (bruts & mitigés par Armure/RM adverses),
 * incluant les effets à l'impact, Double On-Hit (Aube et crépuscule / Guinsoo),
 * Lame enchantée et procs passifs uniques sur une fenêtre de combat configurable.
 */
export function simulateCombatDamageAgainstTarget(params: {
  champion: ChampionSummary;
  role: Role;
  level: number;
  items: ItemData[];
  runeSelection: RunePageSelection;
  target: CombatTargetConfig;
  durationSec?: number;
  spellCasts?: number;
  heartsteelStacksHp?: number;
  threats?: EnemyThreatSummary;
}): RealTimeCombatDamageResult {
  const {
    champion,
    role,
    level,
    items,
    runeSelection,
    target,
    durationSec = 6,
    spellCasts = 2,
    heartsteelStacksHp = 0,
    threats,
  } = params;

  const clampedDuration = Math.max(1, Math.min(20, durationSec));
  const clampedSpells = Math.max(0, Math.min(8, spellCasts));
  const clampedLvl = Math.max(1, Math.min(18, level));

  const stats = computeFullChampionBuildStats({
    champion,
    role,
    level: clampedLvl,
    items,
    runeSelection,
    threats,
    heartsteelStacksHp,
  });

  const baseAd = computeStatAtLevel(
    champion.stats.attackdamage,
    champion.stats.attackdamageperlevel,
    clampedLvl,
  );
  const baseArmor = computeStatAtLevel(
    champion.stats.armor,
    champion.stats.armorperlevel,
    clampedLvl,
  );
  const baseHp = Math.round(
    computeStatAtLevel(champion.stats.hp, champion.stats.hpperlevel, clampedLvl),
  );
  const bonusHp = Math.max(0, stats.totals.hp - baseHp);
  const bonusArmor = Math.max(0, stats.totals.armor - baseArmor);

  const ids = new Set(items.map((it) => it.id));
  const namesLow = items.map((it) => it.name.toLowerCase());
  const hasItem = (id: string, keyword?: string) =>
    ids.has(id) || (keyword ? namesLow.some((n) => n.includes(keyword)) : false);

  const hasDuskAndDawn = hasItem('2510', 'aube et crépuscule');
  const hasGuinsoo = hasItem('3124', 'guinsoo');
  const hasHeartsteel = hasItem('3084', 'cœuracier');
  const hasUnendingDespair = hasItem('2502', 'désespoir infini');
  const hasSpiritVisage = hasItem('3065', 'visage spirituel');
  const hasThornmail = hasItem('3075', 'cotte épineuse');
  const hasNashor = hasItem('3115', 'nashor');
  const hasWitsEnd = hasItem('3091', 'bout du rouleau');
  const hasBork = hasItem('3153', 'roi déchu');
  const hasLiandry = hasItem('6653', 'liandry');
  const hasMalignance = hasItem('3118', 'malfaisance') || hasItem('3118', 'malignance');
  const hasBlackfire = hasItem('2503', 'torche noire') || hasItem('2503', 'blackfire');
  const hasLuden = hasItem('6655', 'luden');
  const hasShadowflame = hasItem('4645', 'flamme-ombre') || hasItem('4645', 'shadowflame');
  const hasStormsurge = hasItem('4646', 'orageuse') || hasItem('4646', 'stormsurge');
  const hasRiftmaker = hasItem('4633', 'failles') || hasItem('4633', 'riftmaker');
  const hasHorizon = hasItem('4628', 'horizon');
  const hasLichBane = hasItem('3100', 'fléau de liche');
  const hasTrinity = hasItem('3078', 'trinité');
  const hasIceborn = hasItem('6662', 'gantelet givrant');
  const hasSunfire = hasItem('3068', 'égide solaire') || hasItem('6664', 'égide rayonnante');

  // Mitigations réelles de la cible selon Pén. Armure, Létalité, Pén. Magique
  const effectiveArmor = Number(
    Math.max(
      0,
      target.armor * (1 - stats.totals.armorPenPct / 100) - stats.totals.lethality,
    ).toFixed(1),
  );
  const effectiveMr = Number(
    Math.max(
      0,
      target.mr * (1 - stats.totals.magicPenPct / 100) - stats.totals.magicPenFlat,
    ).toFixed(1),
  );
  const physMult = 100 / (100 + effectiveArmor);
  const magMult = 100 / (100 + effectiveMr);

  const autoAttacksCount = Math.max(1, Math.round(stats.totals.attackSpeed * clampedDuration));
  const critMultiplier =
    1 + (stats.totals.critChancePct / 100) * ((stats.totals.critDamagePct - 100) / 100);

  // 1. Dégâts physiques des auto-attaques
  const physicalAutoRaw = Math.round(stats.totals.ad * critMultiplier * autoAttacksCount);
  const physicalAutoMitigated = Math.round(physicalAutoRaw * physMult);

  // 2. Effets à l'impact par attaque (Champion + Objets)
  let champOnHitMagic = 0;
  if (champion.id === 'TahmKench') {
    champOnHitMagic = Math.round(
      6 + clampedLvl * 2.5 + bonusHp * (0.04 + stats.totals.ap / 5000),
    );
  } else if (champion.id === 'Teemo') {
    champOnHitMagic = Math.round(14 + clampedLvl * 3.2 + stats.totals.ap * 0.3);
  } else if (champion.id === 'Kayle') {
    champOnHitMagic = Math.round(15 + clampedLvl * 2 + stats.totals.ap * 0.2);
  } else if (champion.id === 'Gwen') {
    champOnHitMagic = Math.round(25 + stats.totals.ap * 0.08);
  } else if (champion.id === 'Warwick') {
    champOnHitMagic = Math.round(
      12 + clampedLvl * 2 + Math.max(0, stats.totals.ad - baseAd) * 0.15 + stats.totals.ap * 0.1,
    );
  } else if (champion.id === 'Viego') {
    champOnHitMagic = Math.round(target.hp * 0.03 + 25);
  }

  let itemOnHitMagic = 0;
  if (hasGuinsoo) itemOnHitMagic += 30;
  if (hasNashor) itemOnHitMagic += Math.round(15 + stats.totals.ap * 0.15);
  if (hasWitsEnd) itemOnHitMagic += 45;
  const borkPhysOnHit = hasBork ? Math.round(target.hp * 0.055) : 0; // Moyenne ~5.5% PV max sur PV actuels décroissants

  const onHitMagicPerAttack = champOnHitMagic + itemOnHitMagic;
  const maxSpellbladeWindowProcs = Math.max(1, Math.floor(clampedDuration / 1.5));
  const spellbladeProcsCount =
    clampedSpells > 0 && (hasDuskAndDawn || hasLichBane || hasTrinity || hasIceborn)
      ? Math.min(clampedSpells, autoAttacksCount, maxSpellbladeWindowProcs)
      : 0;

  const extraDuskOnHits = hasDuskAndDawn
    ? Math.min(clampedSpells, autoAttacksCount, maxSpellbladeWindowProcs)
    : 0;
  const extraGuinsooOnHits = hasGuinsoo ? Math.floor(autoAttacksCount / 3) : 0;
  const extraDoubleOnHitProcs = extraDuskOnHits + extraGuinsooOnHits;

  const baseOnHitRaw = Math.round((onHitMagicPerAttack + borkPhysOnHit) * autoAttacksCount);
  const baseOnHitMitigated = Math.round(
    onHitMagicPerAttack * autoAttacksCount * magMult + borkPhysOnHit * autoAttacksCount * physMult,
  );

  const doubleOnHitBonusRaw = Math.round(
    (onHitMagicPerAttack + borkPhysOnHit) * extraDoubleOnHitProcs,
  );
  const doubleOnHitBonusMitigated = Math.round(
    onHitMagicPerAttack * extraDoubleOnHitProcs * magMult +
      borkPhysOnHit * extraDoubleOnHitProcs * physMult,
  );

  // 3. Lame enchantée & Passifs uniques par objet
  const healAmp = hasSpiritVisage ? 1.25 : 1.0;
  let spellbladeRaw = 0;
  let spellbladeMitigated = 0;
  let combatHealingTotal = 0;
  const itemPassivesBreakdown: CombatItemProcBreakdown[] = [];

  if (hasDuskAndDawn) {
    const perProcDmg = Math.round(0.75 * baseAd + 0.1 * stats.totals.ap);
    const perProcHeal = Math.round(
      (0.1 * stats.totals.ap + 0.03 * bonusHp) * healAmp,
    );
    spellbladeRaw = perProcDmg * spellbladeProcsCount;
    spellbladeMitigated = Math.round(spellbladeRaw * magMult);
    const healSum = perProcHeal * spellbladeProcsCount;
    combatHealingTotal += healSum;
    itemPassivesBreakdown.push({
      itemId: '2510',
      itemName: 'Aube et crépuscule',
      effectName: 'Lame enchantée + Double On-Hit',
      damageType: 'Magique',
      procsCount: spellbladeProcsCount,
      rawDamage: spellbladeRaw + doubleOnHitBonusRaw,
      mitigatedDamage: spellbladeMitigated + doubleOnHitBonusMitigated,
      healingDone: healSum,
      formulaNote: `${spellbladeProcsCount}× Lame (${perProcDmg} bruts) + ${extraDuskOnHits}× On-Hit bonus (${onHitMagicPerAttack + borkPhysOnHit}/proc) · Soin ${perProcHeal} PV/proc`,
    });
  } else if (hasLichBane && spellbladeProcsCount > 0) {
    const perProc = Math.round(0.75 * baseAd + 0.45 * stats.totals.ap);
    spellbladeRaw = perProc * spellbladeProcsCount;
    spellbladeMitigated = Math.round(spellbladeRaw * magMult);
    itemPassivesBreakdown.push({
      itemId: '3100',
      itemName: 'Fléau de liche',
      effectName: 'Lame enchantée AP',
      damageType: 'Magique',
      procsCount: spellbladeProcsCount,
      rawDamage: spellbladeRaw,
      mitigatedDamage: spellbladeMitigated,
      healingDone: 0,
      formulaNote: `${spellbladeProcsCount}× (${perProc} bruts = 75% AD base + 45% AP)`,
    });
  } else if (hasTrinity && spellbladeProcsCount > 0) {
    const perProc = Math.round(2.0 * baseAd);
    spellbladeRaw = perProc * spellbladeProcsCount;
    spellbladeMitigated = Math.round(spellbladeRaw * physMult);
    itemPassivesBreakdown.push({
      itemId: '3078',
      itemName: 'Force de la trinité',
      effectName: 'Lame enchantée AD',
      damageType: 'Physique',
      procsCount: spellbladeProcsCount,
      rawDamage: spellbladeRaw,
      mitigatedDamage: spellbladeMitigated,
      healingDone: 0,
      formulaNote: `${spellbladeProcsCount}× (${perProc} bruts = 200% AD de base)`,
    });
  } else if (hasIceborn && spellbladeProcsCount > 0) {
    const perProc = Math.round(1.5 * baseAd);
    spellbladeRaw = perProc * spellbladeProcsCount;
    spellbladeMitigated = Math.round(spellbladeRaw * physMult);
    itemPassivesBreakdown.push({
      itemId: '6662',
      itemName: 'Gantelet givrant',
      effectName: 'Lame enchantée & Zone glaciale',
      damageType: 'Physique',
      procsCount: spellbladeProcsCount,
      rawDamage: spellbladeRaw,
      mitigatedDamage: spellbladeMitigated,
      healingDone: 0,
      formulaNote: `${spellbladeProcsCount}× (${perProc} bruts = 150% AD de base)`,
    });
  }

  if (hasHeartsteel && clampedDuration >= 3) {
    const hsRaw = Math.round(70 + 0.06 * stats.totals.hp);
    const hsMit = Math.round(hsRaw * physMult);
    itemPassivesBreakdown.push({
      itemId: '3084',
      itemName: 'Cœuracier',
      effectName: 'Consommation colossale',
      damageType: 'Physique',
      procsCount: 1,
      rawDamage: hsRaw,
      mitigatedDamage: hsMit,
      healingDone: 0,
      formulaNote: `70 + 6% de ${stats.totals.hp} PV (+${Math.round(hsRaw * 0.1)} PV max gagnés)`,
    });
  }

  if (hasUnendingDespair && clampedDuration >= 4) {
    const ticks = Math.floor(clampedDuration / 4);
    const perTickRaw = Math.round(30 + 0.03 * stats.totals.hp);
    const rawSum = perTickRaw * ticks;
    const mitSum = Math.round(rawSum * magMult);
    const healSum = Math.round(mitSum * 2.5 * healAmp);
    combatHealingTotal += healSum;
    itemPassivesBreakdown.push({
      itemId: '2502',
      itemName: 'Désespoir infini',
      effectName: 'Affliction (toutes les 4s)',
      damageType: 'Magique',
      procsCount: ticks,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: healSum,
      formulaNote: `${ticks}× (30 + 3% PV max) · Soigne 250% des dégâts infligés${hasSpiritVisage ? ' ×1.25' : ''}`,
    });
  }

  if (hasThornmail) {
    const enemyAutosTaken = Math.max(1, Math.floor(clampedDuration / 1.3));
    const perReflect = Math.round(20 + 0.15 * bonusArmor);
    const rawSum = perReflect * enemyAutosTaken;
    const mitSum = Math.round(rawSum * magMult);
    itemPassivesBreakdown.push({
      itemId: '3075',
      itemName: 'Cotte épineuse',
      effectName: 'Épines (renvoi + 40% Hémorragie)',
      damageType: 'Magique',
      procsCount: enemyAutosTaken,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: 0,
      formulaNote: `~${enemyAutosTaken} coups subis × (20 + 15% Armure bonus = ${perReflect} bruts)`,
    });
  }

  if (hasLiandry && clampedSpells > 0) {
    const burnSecs = Math.min(clampedDuration + 2, clampedSpells * 3);
    const rawSum = Math.round(0.02 * target.hp * burnSecs);
    const mitSum = Math.round(rawSum * magMult);
    itemPassivesBreakdown.push({
      itemId: '6653',
      itemName: 'Tourment de Liandry',
      effectName: 'Tourment (2% PV max/s)',
      damageType: 'Magique',
      procsCount: burnSecs,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: 0,
      formulaNote: `${burnSecs}s de brûlure à 2% de ${target.hp} PV max`,
    });
  }

  if (hasMalignance && clampedSpells > 0) {
    const zoneTicks = Math.min(clampedDuration, 3);
    const rawSum = Math.round((60 + 0.05 * stats.totals.ap) * zoneTicks);
    // Malfaisance réduit la RM de 10 dans la zone de haine
    const malignanceMr = Math.max(0, effectiveMr - 10);
    const malignanceMult = 100 / (100 + malignanceMr);
    const mitSum = Math.round(rawSum * malignanceMult);
    itemPassivesBreakdown.push({
      itemId: '3118',
      itemName: 'Malfaisance',
      effectName: 'Haine (Zone R + -10 RM + +20 Hâte Ultime)',
      damageType: 'Magique',
      procsCount: zoneTicks,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: 0,
      formulaNote: `${zoneTicks}s de zone (60 + 5% AP/s) avec -10 RM dans la zone`,
    });
  }

  if (hasBlackfire && clampedSpells > 0) {
    const burnSecs = Math.min(clampedDuration + 1, clampedSpells * 3);
    const rawSum = Math.round((20 + 0.02 * stats.totals.ap) * burnSecs);
    const mitSum = Math.round(rawSum * magMult);
    itemPassivesBreakdown.push({
      itemId: '2503',
      itemName: 'Torche noire',
      effectName: 'Combustion funeste (DoT + +4% AP)',
      damageType: 'Magique',
      procsCount: burnSecs,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: 0,
      formulaNote: `${burnSecs}s de brûlure (20 + 2% AP/s) + aura +4% AP par cible`,
    });
  }

  if (hasLuden && clampedSpells > 0) {
    const ludenCharges = Math.min(6, Math.max(3, Math.round(clampedSpells * 1.5)));
    const rawSum = Math.round((75 + 0.05 * stats.totals.ap) * (0.35 + ludenCharges * 0.12));
    const mitSum = Math.round(rawSum * magMult);
    itemPassivesBreakdown.push({
      itemId: '6655',
      itemName: 'Compagnon de Luden',
      effectName: 'Feu (Décharge de sort)',
      damageType: 'Magique',
      procsCount: 1,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: 0,
      formulaNote: `Décharge ${ludenCharges} charges (base + 5% AP)`,
    });
  }

  if (hasStormsurge && clampedSpells >= 1) {
    const rawSum = Math.round(125 + 0.15 * stats.totals.ap);
    const mitSum = Math.round(rawSum * magMult);
    itemPassivesBreakdown.push({
      itemId: '4646',
      itemName: 'Onde orageuse',
      effectName: 'Bourrasque (Burst magique)',
      damageType: 'Magique',
      procsCount: 1,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: 0,
      formulaNote: `125 + 15% AP dès que le burst dépasse 25% PV cible`,
    });
  }

  if (hasSunfire) {
    const rawSum = Math.round((20 + 0.015 * bonusHp) * clampedDuration);
    const mitSum = Math.round(rawSum * magMult);
    itemPassivesBreakdown.push({
      itemId: '3068',
      itemName: 'Aura Immolation',
      effectName: 'Dégâts de zone par seconde',
      damageType: 'Magique',
      procsCount: clampedDuration,
      rawDamage: rawSum,
      mitigatedDamage: mitSum,
      healingDone: 0,
      formulaNote: `${clampedDuration}s × (20 + 1.5% PV bonus)`,
    });
  }

  // 4. Dégâts des sorts du champion (Kit + Hâte de compétence + Amplification objets/runes)
  const style = inferStyle(champion, role);
  const hasteFactor = 1 + stats.totals.abilityHaste / 115;
  const effectiveCasts =
    clampedSpells > 0 ? clampedSpells * (0.85 + 0.15 * hasteFactor) : 0;
  const bonusAd = Math.max(0, stats.totals.ad - baseAd);

  let abilityKitRaw = 0;
  let abilityIsMagic = style === 'AP_MAGE' || style === 'ENCHANTER';

  if (effectiveCasts > 0) {
    if (champion.id === 'Teemo') {
      // Q (80..260 + 80% AP) + E DoT poison (48..240 + 40% AP sur 4s) + 1 champignon R (200..450 + 50% AP) si >= 2 sorts
      abilityIsMagic = true;
      const qRankDmg = 80 + ((clampedLvl - 1) / 17) * 180 + stats.totals.ap * 0.8;
      const eDotDmg = (48 + ((clampedLvl - 1) / 17) * 192 + stats.totals.ap * 0.4) * Math.min(2, clampedDuration / 4);
      const shroomDmg =
        clampedLvl >= 6 && clampedSpells >= 2
          ? (200 + ((Math.max(6, clampedLvl) - 6) / 10) * 250 + stats.totals.ap * 0.5) *
            (hasMalignance ? 1.15 : 1)
          : 0;
      const castScale = Math.max(1, effectiveCasts / 2);
      abilityKitRaw = Math.round(qRankDmg * castScale + eDotDmg + shroomDmg);
    } else if (style === 'AP_MAGE') {
      abilityIsMagic = true;
      const perCastBase = 95 + clampedLvl * 14 + stats.totals.ap * 0.68;
      abilityKitRaw = Math.round(perCastBase * effectiveCasts);
    } else if (style === 'AD_LETHALITY') {
      abilityIsMagic = false;
      const perCastBase = 90 + clampedLvl * 14 + bonusAd * 0.95 + baseAd * 0.35;
      abilityKitRaw = Math.round(perCastBase * effectiveCasts);
    } else if (style === 'AD_BRUISER') {
      abilityIsMagic = false;
      const perCastBase = 75 + clampedLvl * 11 + bonusAd * 0.72 + bonusHp * 0.03;
      abilityKitRaw = Math.round(perCastBase * effectiveCasts);
    } else if (style === 'TANK') {
      abilityIsMagic = true;
      const perCastBase = 65 + clampedLvl * 10 + bonusHp * 0.065 + stats.totals.ap * 0.45;
      abilityKitRaw = Math.round(perCastBase * effectiveCasts);
    } else if (style === 'ENCHANTER') {
      abilityIsMagic = true;
      const perCastBase = 65 + clampedLvl * 8 + stats.totals.ap * 0.55;
      abilityKitRaw = Math.round(perCastBase * effectiveCasts);
    } else {
      // AD_CRIT
      abilityIsMagic = false;
      const perCastBase = 65 + clampedLvl * 9 + bonusAd * 0.65;
      abilityKitRaw = Math.round(perCastBase * effectiveCasts);
    }
  }

  // Amplificateurs de dégâts (Flamme-ombre sous 40% PV, Créateur de failles, Horizon, Liandry +6%)
  const spellAmpMult =
    (hasLiandry ? 1.06 : 1) *
    (hasRiftmaker ? 1.08 : 1) *
    (hasHorizon ? 1.1 : 1) *
    (hasShadowflame ? 1.08 : 1) *
    (runeSelection.keystoneId === 8005 ? 1.05 : 1);

  if (abilityIsMagic && hasShadowflame) {
    abilityKitRaw = Math.round(abilityKitRaw * 1.08);
  }
  abilityKitRaw = Math.round(abilityKitRaw * (hasRiftmaker || hasLiandry || hasHorizon ? 1.05 : 1));
  const abilityKitMitigated = Math.round(
    abilityKitRaw * (abilityIsMagic ? magMult : physMult) * (spellAmpMult > 1 ? 1 + (spellAmpMult - 1) * 0.45 : 1),
  );

  // Soin additionnel du champion + Vol de vie / Omnivamp (dont Riftmaker)
  if (champion.id === 'TahmKench' && clampedSpells > 0) {
    const qCasts = Math.max(1, Math.min(clampedSpells, Math.ceil(clampedDuration / 4.5)));
    combatHealingTotal += Math.round(qCasts * (20 + bonusHp * 0.03) * healAmp);
  }
  if (stats.totals.lifeStealPct > 0) {
    combatHealingTotal += Math.round(
      physicalAutoMitigated * (stats.totals.lifeStealPct / 100) * healAmp,
    );
  }
  if (hasRiftmaker || stats.totals.omnivampPct > 0) {
    const omniPct = Math.max(stats.totals.omnivampPct, hasRiftmaker ? 10 : 0);
    combatHealingTotal += Math.round(
      (abilityKitMitigated + baseOnHitMitigated) * (omniPct / 100) * 0.6 * healAmp,
    );
  }

  // Somme totale sans double-compter Aube (qui contient spellblade + doubleOnHit dans l'affichage détaillé)
  const extraPassiveRawOnly = itemPassivesBreakdown
    .filter((p) => !['2510', '3100', '3078', '6662'].includes(p.itemId))
    .reduce((acc, p) => acc + p.rawDamage, 0);
  const extraPassiveMitOnly = itemPassivesBreakdown
    .filter((p) => !['2510', '3100', '3078', '6662'].includes(p.itemId))
    .reduce((acc, p) => acc + p.mitigatedDamage, 0);

  const spellBurnPassiveMitigated = itemPassivesBreakdown
    .filter((p) => ['6653', '3118', '2503', '6655', '4646'].includes(p.itemId))
    .reduce((acc, p) => acc + p.mitigatedDamage, 0);

  const spellAndDotMitigated = abilityKitMitigated + spellBurnPassiveMitigated;

  const totalRawDamage =
    physicalAutoRaw +
    baseOnHitRaw +
    doubleOnHitBonusRaw +
    spellbladeRaw +
    extraPassiveRawOnly +
    abilityKitRaw;
  const totalMitigatedDamage =
    physicalAutoMitigated +
    baseOnHitMitigated +
    doubleOnHitBonusMitigated +
    spellbladeMitigated +
    extraPassiveMitOnly +
    abilityKitMitigated;

  const realDps = Math.round(totalMitigatedDamage / clampedDuration);
  const targetHpPctRemoved = Math.min(
    100,
    Number(((totalMitigatedDamage / Math.max(1, target.hp)) * 100).toFixed(1)),
  );
  const estimatedTtkSec = Number((target.hp / Math.max(1, realDps)).toFixed(1));

  return {
    durationSec: clampedDuration,
    spellCasts: clampedSpells,
    target,
    effectiveArmor,
    effectiveMr,
    physicalMitigationPct: Math.round((1 - physMult) * 100),
    magicMitigationPct: Math.round((1 - magMult) * 100),
    autoAttacksCount,
    spellbladeProcsCount,
    extraDoubleOnHitProcs,
    physicalAutoRaw,
    physicalAutoMitigated,
    baseOnHitRaw,
    baseOnHitMitigated,
    doubleOnHitBonusRaw,
    doubleOnHitBonusMitigated,
    spellbladeRaw,
    spellbladeMitigated,
    abilityKitRaw,
    abilityKitMitigated,
    spellAndDotMitigated,
    itemPassivesBreakdown,
    totalRawDamage,
    totalMitigatedDamage,
    realDps,
    targetHpPctRemoved,
    estimatedTtkSec,
    combatHealingTotal,
    hasDoubleOnHit: hasDuskAndDawn || hasGuinsoo,
  };
}

/**
 * Mesure la contribution marginale exacte (Avec cet objet − Sans cet objet)
 * de chaque objet équipé dans les 6 emplacements sur les stats finales ET les dégâts réels.
 */
export function computePerItemImpactMatrix(params: {
  champion: ChampionSummary;
  role: Role;
  level: number;
  slots: Array<ItemData | null>;
  runeSelection: RunePageSelection;
  target: CombatTargetConfig;
  durationSec: number;
  spellCasts: number;
  heartsteelStacksHp?: number;
  threats?: EnemyThreatSummary;
}): PerItemImpactRow[] {
  const {
    champion,
    role,
    level,
    slots,
    runeSelection,
    target,
    durationSec,
    spellCasts,
    heartsteelStacksHp = 0,
    threats,
  } = params;

  const fullItems = slots.filter((it): it is ItemData => Boolean(it));
  if (fullItems.length === 0) return [];

  const fullStats = computeFullChampionBuildStats({
    champion,
    role,
    level,
    items: fullItems,
    runeSelection,
    threats,
    heartsteelStacksHp,
  });

  const fullDamage = simulateCombatDamageAgainstTarget({
    champion,
    role,
    level,
    items: fullItems,
    runeSelection,
    target,
    durationSec,
    spellCasts,
    heartsteelStacksHp,
    threats,
  });

  const rows: PerItemImpactRow[] = [];

  slots.forEach((item, slotIndex) => {
    if (!item) return;
    const withoutItems = slots
      .filter((it, idx): it is ItemData => Boolean(it) && idx !== slotIndex);

    const withoutStats = computeFullChampionBuildStats({
      champion,
      role,
      level,
      items: withoutItems,
      runeSelection,
      threats,
      heartsteelStacksHp,
    });

    const withoutDamage = simulateCombatDamageAgainstTarget({
      champion,
      role,
      level,
      items: withoutItems,
      runeSelection,
      target,
      durationSec,
      spellCasts,
      heartsteelStacksHp,
      threats,
    });

    const p = parseExactItemStats(item);
    const selfGoldValue =
      p.hp * GOLD_PER_STAT.hp +
      p.mana * GOLD_PER_STAT.mana +
      p.ad * GOLD_PER_STAT.ad +
      p.ap * GOLD_PER_STAT.ap +
      p.armor * GOLD_PER_STAT.armor +
      p.mr * GOLD_PER_STAT.mr +
      p.attackSpeedPct * GOLD_PER_STAT.asPct +
      p.critChancePct * GOLD_PER_STAT.critPct +
      p.abilityHaste * GOLD_PER_STAT.ah +
      p.flatMoveSpeed * GOLD_PER_STAT.msFlat +
      p.percentMoveSpeedPct * 45 +
      p.lethality * GOLD_PER_STAT.lethality +
      p.magicPenFlat * GOLD_PER_STAT.magicPenFlat +
      p.healShieldPowerPct * GOLD_PER_STAT.healShieldPct +
      p.lifeStealPct * GOLD_PER_STAT.lifeStealPct +
      (p.hpRegenPct + p.manaRegenPct) * GOLD_PER_STAT.regenPct;

    const deltaTotalDamage =
      fullDamage.totalMitigatedDamage - withoutDamage.totalMitigatedDamage;

    rows.push({
      slotIndex,
      item,
      rawDetails: extractRawDataDragonItemDetails(item),
      goldEfficiencySelfPct:
        item.gold.total > 0 ? Math.round((selfGoldValue / item.gold.total) * 100) : 100,
      deltaHp: fullStats.totals.hp - withoutStats.totals.hp,
      deltaAd: Number((fullStats.totals.ad - withoutStats.totals.ad).toFixed(1)),
      deltaAp: fullStats.totals.ap - withoutStats.totals.ap,
      deltaArmor: Number((fullStats.totals.armor - withoutStats.totals.armor).toFixed(1)),
      deltaMr: Number((fullStats.totals.mr - withoutStats.totals.mr).toFixed(1)),
      deltaAs: Number((fullStats.totals.attackSpeed - withoutStats.totals.attackSpeed).toFixed(3)),
      deltaAh: fullStats.totals.abilityHaste - withoutStats.totals.abilityHaste,
      deltaPhysicalEhp: fullStats.combat.physicalEhp - withoutStats.combat.physicalEhp,
      deltaMagicEhp: fullStats.combat.magicEhp - withoutStats.combat.magicEhp,
      deltaTotalDamage,
      deltaRealDps: fullDamage.realDps - withoutDamage.realDps,
      deltaCombatHealing:
        fullDamage.combatHealingTotal - withoutDamage.combatHealingTotal,
      damageSharePct:
        fullDamage.totalMitigatedDamage > 0
          ? Math.max(
              0,
              Math.round((deltaTotalDamage / fullDamage.totalMitigatedDamage) * 100),
            )
          : 0,
    });
  });

  return rows;
}

/**
 * Interprète qualitativement le build actuellement équipé + la page de runes active :
 * détecte les excès (ex. surcap vitesse d'attaque > 2.50/s), les manques (AP/AD, Pén., Armure, Anti-soin),
 * les doublons de passifs uniques, et explique la synergie exacte Runes × Objets.
 */
export function interpretBuildAndRunes(params: {
  champion: ChampionSummary;
  role: Role;
  level: number;
  items: ItemData[];
  runeSelection: RunePageSelection;
  runeTrees: RuneTree[];
  stats: FullBuildStatBreakdown;
  threats: EnemyThreatSummary;
}): BuildInterpretationReport {
  const { champion, role, level, items, runeSelection, runeTrees, stats, threats } = params;
  const style = inferStyle(champion, role);
  const allRuneIds = new Set([
    runeSelection.keystoneId,
    ...runeSelection.primaryMinorIds,
    ...runeSelection.secondaryMinorIds,
  ]);

  const resolveRuneName = (id: number): string => {
    for (const tree of runeTrees) {
      for (const slot of tree.slots) {
        const hit = slot.runes.find((r) => r.id === id);
        if (hit) return hit.name;
      }
    }
    return `Rune #${id}`;
  };

  const keystoneName = resolveRuneName(runeSelection.keystoneId);
  const hasTempoMortel = runeSelection.keystoneId === 8008;
  const hasDeluge = runeSelection.keystoneId === 9923;
  const hasAlacrite = allRuneIds.has(9104);
  const hasAsShard = runeSelection.shardIndices[0] === 1;
  const itemAsPctTotal = items.reduce((acc, it) => acc + parseExactItemStats(it).attackSpeedPct, 0);
  const isApPrimary = style === 'AP_MAGE' || style === 'ENCHANTER';
  const isAdPrimary = style === 'AD_CRIT' || style === 'AD_BRUISER' || style === 'AD_LETHALITY';
  const isTankPrimary = style === 'TANK';

  const diagnostics: BuildDiagnosticItem[] = [];
  const runeSynergies: RuneStuffSynergyItem[] = [];
  const suggestedTweaks: string[] = [];

  // 1. Diagnostic Vitesse d'attaque & Plafond 2.500/s (y compris marge niveaux 12->18 et Tempo mortel)
  const tempoExtraAs = hasTempoMortel ? 0.36 * champion.stats.attackspeed : 0;
  const projectedLvl18As = Number(
    (
      stats.totals.uncappedAttackSpeed +
      (level < 18
        ? champion.stats.attackspeed *
          ((champion.stats.attackspeedperlevel * Math.max(0, 18 - level) * 0.85) / 100)
        : 0) +
      tempoExtraAs
    ).toFixed(3),
  );

  if (stats.totals.asOvercapPct > 0) {
    const wastedGold = Math.round(stats.totals.asOvercapPct * GOLD_PER_STAT.asPct);
    diagnostics.push({
      id: 'as-overcap',
      category: 'Vitesse d’attaque',
      title: 'Trop de vitesse d’attaque (Plafond 2.500/s dépassé)',
      statusLabel: `Brut ${stats.totals.uncappedAttackSpeed}/s · +${stats.totals.asOvercapPct}% perdu`,
      tone: 'rose',
      explanation: `En jeu, la vitesse d’attaque est plafonnée à 2.500/s. Votre configuration monte à ${stats.totals.uncappedAttackSpeed}/s au niv.${level} : environ +${stats.totals.asOvercapPct}% de vitesse d’attaque (~${wastedGold} po) sont totalement gaspillés.`,
      actionTip:
        'Remplacez les Jambières du berzerker par des Coques/Mercures/Sorcier, ou échangez un objet AS (ex. Statikk) contre de l’AP/Pénétration ou de la défense.',
    });
    suggestedTweaks.push(
      `Réduire l’excès de vitesse d’attaque (+${stats.totals.asOvercapPct}% gaspillés au niv.${level}) pour récupérer ~${wastedGold} po en stats utiles.`,
    );
  } else if (stats.totals.attackSpeed >= 2.2 || projectedLvl18As > 2.58) {
    diagnostics.push({
      id: 'as-near-cap',
      category: 'Vitesse d’attaque',
      title: 'Vitesse d’attaque déjà à la limite du plafond',
      statusLabel: `${stats.totals.attackSpeed}/s (Niv.${level}) · ${projectedLvl18As}/s au niv.18`,
      tone: 'amber',
      explanation: `Vous êtes déjà à ${Math.round((stats.totals.attackSpeed / 2.5) * 100)}% du plafond (2.500/s). Avec la croissance naturelle vers le niveau 18${hasTempoMortel ? ' et Tempo mortel empilé' : ''}, vous déborderez (${projectedLvl18As}/s) et aurez du mal à kiter entre chaque attaque.`,
      actionTip:
        'N’ajoutez plus d’AS. Passer sur Force adaptative en fragment ou des bottes défensives/Pén. magique vous donnera plus de dégâts réels.',
    });
    suggestedTweaks.push(
      `Votre vitesse d’attaque (${stats.totals.attackSpeed}/s au niv.${level}) saturera le plafond 2.500/s en fin de partie : privilégiez AP/AD ou Pénétration sur votre prochain choix.`,
    );
  } else if (
    (style === 'AD_CRIT' || ONHIT_SPELLWEAVE_CHAMPIONS.has(champion.id)) &&
    stats.itemCount >= 3 &&
    stats.totals.attackSpeed < 1.25
  ) {
    diagnostics.push({
      id: 'as-low',
      category: 'Vitesse d’attaque',
      title: 'Vitesse d’attaque un peu faible pour vos autos',
      statusLabel: `${stats.totals.attackSpeed}/s`,
      tone: 'amber',
      explanation: `${champion.name} profite beaucoup des attaques de base/effets à l’impact, mais vous plafonnez à ${stats.totals.attackSpeed}/s avec ${stats.itemCount} objets.`,
      actionTip: 'Ajoutez un objet AS (Dent de Nashor / Guinsoo / Danseur fantôme) ou Légende : alacrité.',
    });
  } else {
    diagnostics.push({
      id: 'as-ok',
      category: 'Vitesse d’attaque',
      title: 'Vitesse d’attaque équilibrée',
      statusLabel: `${stats.totals.attackSpeed}/s`,
      tone: 'emerald',
      explanation: `Cadence fluide à ${stats.totals.attackSpeed}/s sans gaspillage au-dessus du plafond 2.500/s (projection niv.18 : ${projectedLvl18As}/s).`,
    });
  }

  // 2. Puissance (AP) / Dégâts d'attaque (AD) & Pénétration
  if (isApPrimary) {
    const expectedApForItems = stats.itemCount >= 5 ? 360 : stats.itemCount >= 3 ? 210 : 95;
    if (stats.itemCount >= 4 && stats.totals.ap < expectedApForItems) {
      diagnostics.push({
        id: 'ap-low',
        category: 'Puissance & Dégâts',
        title: 'Puissance (AP) un peu juste pour ce stade',
        statusLabel: `${stats.totals.ap} AP (${stats.itemCount} objets)`,
        tone: 'amber',
        explanation: `Avec ${stats.itemCount} emplacements occupés, ${stats.totals.ap} AP reste modeste (seuil confortable ≥ ${expectedApForItems} AP). Vos ratios AP sur sorts et objets à l’impact (ex. Dent de Nashor, Aube) restent sous-exploités.`,
        actionTip:
          'Coiffe de Rabadon (+30% AP total) ou Fléau de liche / Tourment d’ombre feront exploser vos dégâts de sorts et On-Hit.',
      });
      suggestedTweaks.push(
        `Monter au-dessus de ${expectedApForItems} AP (ex. Coiffe de Rabadon) si vous voulez que vos compétences et procs AP frappent plus fort.`,
      );
    } else {
      diagnostics.push({
        id: 'ap-ok',
        category: 'Puissance & Dégâts',
        title: 'Puissance (AP) cohérente',
        statusLabel: `${stats.totals.ap} AP`,
        tone: 'emerald',
        explanation: `Votre total de ${stats.totals.ap} AP (+${stats.sources.ap.runes} via runes) alimente efficacement vos sorts et effets AP.`,
      });
    }

    if (stats.itemCount >= 4 && stats.totals.magicPenPct === 0 && stats.totals.magicPenFlat === 0) {
      diagnostics.push({
        id: 'mpen-missing',
        category: 'Puissance & Dégâts',
        title: 'Aucune Pénétration magique',
        statusLabel: '0% / +0 Pén. Mag.',
        tone: threats.tankCount >= 1 ? 'rose' : 'amber',
        explanation: `Vous n’avez ni Pénétration magique % ni Pénétration fixe. Face à ${threats.tankCount >= 1 ? `${threats.tankCount} tank/bruiser(s)` : 'des adversaires niveau 11+'} qui achètent de la RM, 30 à 45% de vos dégâts magiques sont absorbés.`,
        actionTip: 'Envisagez Bâton du vide, Cryptofleur ou Chaussures de sorcier.',
      });
      suggestedTweaks.push('Ajouter de la Pénétration magique (Bâton du vide / Cryptofleur) face aux résistances.');
    }
  } else if (isAdPrimary) {
    const expectedAd = stats.itemCount >= 5 ? 255 : stats.itemCount >= 3 ? 175 : 105;
    if (stats.itemCount >= 4 && stats.totals.ad < expectedAd && !ONHIT_SPELLWEAVE_CHAMPIONS.has(champion.id)) {
      diagnostics.push({
        id: 'ad-low',
        category: 'Puissance & Dégâts',
        title: 'AD total modéré pour un carry AD',
        statusLabel: `${stats.totals.ad} AD`,
        tone: 'amber',
        explanation: `${stats.totals.ad} AD reste léger à ${stats.itemCount} objets (attendu ≥ ${expectedAd} AD) sauf si votre kit repose majoritairement sur du On-Hit pur.`,
        actionTip: 'Ajoutez Lame d’infini / Soif-de-sang / Serylda pour renforcer vos dégâts par coup.',
      });
    } else {
      diagnostics.push({
        id: 'ad-ok',
        category: 'Puissance & Dégâts',
        title: 'Potentiel offensif AD équilibré',
        statusLabel: `${stats.totals.ad} AD${stats.totals.critChancePct > 0 ? ` · ${stats.totals.critChancePct}% Crit` : ''}`,
        tone: 'emerald',
        explanation: `Bon équilibre avec ${stats.totals.ad} AD et ${stats.combat.autoDps}/s de DPS auto-attaques estimé.`,
      });
    }

    if (
      stats.itemCount >= 4 &&
      threats.tankCount >= 1 &&
      stats.totals.armorPenPct === 0 &&
      stats.totals.lethality < 20
    ) {
      diagnostics.push({
        id: 'apen-missing',
        category: 'Puissance & Dégâts',
        title: 'Manque de Pénétration d’armure (%)',
        statusLabel: '0% Pén. Armure',
        tone: 'amber',
        explanation: `L’équipe adverse compte ${threats.tankCount} profil(s) résistant(s) : sans Pénétration d’armure %, vos dégâts physiques chuteront nettement.`,
        actionTip: 'Ajoutez Salutations de Dominik, Rappel mortel ou Rancune de Serylda.',
      });
    }
  } else if (isTankPrimary) {
    diagnostics.push({
      id: 'tank-offense',
      category: 'Puissance & Dégâts',
      title: 'Impact Tank & Présence',
      statusLabel: `${stats.totals.hp} PV · ${stats.combat.abilityImpactIndex} Impact`,
      tone: stats.totals.hp >= 2800 || stats.itemCount < 4 ? 'emerald' : 'amber',
      explanation: `Votre pool de ${stats.totals.hp} PV et ${stats.activePassives.length} passif(s) actifs vous permettent de tenir la ligne de front.`,
    });
  }

  // 3. Survie face à la compo adverse (Armure, RM, Anti-soin, Ténacité)
  if (stats.itemCount >= 4) {
    if (threats.physicalShare >= 58 && stats.totals.armor < 85 && !isTankPrimary) {
      diagnostics.push({
        id: 'surv-armor',
        category: 'Survie & Défense',
        title: `Vulnérable au Burst Physique (${threats.physicalShare}% AD en face)`,
        statusLabel: `${stats.totals.armor} Armure · ${stats.combat.physicalEhp} EHP`,
        tone: threats.burstThreatCount >= 2 ? 'rose' : 'amber',
        explanation: `Vous n’avez que ${stats.totals.armor} d’Armure (base uniquement) face à une équipe majoritairement physique (${threats.physicalShare}%). Un assassin/combattant peut vous tomber en moins de 2s.`,
        actionTip: isApPrimary
          ? 'Ajoutez Sablier de Zhonya ou Coques en acier.'
          : 'Envisagez Ange gardien, Danse de la mort ou Coques en acier.',
      });
      suggestedTweaks.push(
        `Protégez-vous contre les ${threats.physicalShare}% de dégâts physiques adverses (ex. Sablier de Zhonya ou Coques en acier).`,
      );
    } else if (threats.magicShare >= 55 && stats.totals.mr < 65 && !isTankPrimary) {
      diagnostics.push({
        id: 'surv-mr',
        category: 'Survie & Défense',
        title: `Vulnérable au Burst Magique (${threats.magicShare}% AP en face)`,
        statusLabel: `${stats.totals.mr} RM · ${stats.combat.magicEhp} EHP`,
        tone: 'amber',
        explanation: `Seulement ${stats.totals.mr} de Résistance magique face à ${threats.magicShare}% de dégâts magiques adverses.`,
        actionTip: isApPrimary
          ? 'Voile de la banshee ou Sandales de Mercure sécurisent vos combats.'
          : 'Gueule de Malmortius, Bout du rouleau ou Kaenic Rookern recommandés.',
      });
    } else {
      diagnostics.push({
        id: 'surv-ok',
        category: 'Survie & Défense',
        title: 'Résistances & PV adaptés au niveau',
        statusLabel: `${stats.totals.hp} PV · ${stats.totals.armor} Arm. · ${stats.totals.mr} RM`,
        tone: 'emerald',
        explanation: `Votre tenue défensive (${stats.combat.physicalEhp} EHP phys. / ${stats.combat.magicEhp} EHP mag.) reste cohérente pour ${champion.name}.`,
      });
    }

    if (threats.highHealCount >= 1 && stats.totals.antiHealPct === 0) {
      diagnostics.push({
        id: 'surv-antiheal',
        category: 'Survie & Défense',
        title: `Aucun Anti-soin face à ${threats.highHealCount} champion(s) à soin`,
        statusLabel: '0% Hémorragie',
        tone: 'amber',
        explanation: `L’ennemi possède du soin/vol de vie élevé mais vous n’avez pas d’Hémorragie (40%).`,
        actionTip: isApPrimary
          ? 'Orbe de l’oubli (800 po) puis Morellonomicon.'
          : isTankPrimary
            ? 'Armure roncière (800 po) puis Cotte épineuse.'
            : 'Marque du bourreau (800 po) puis Rappel mortel / Épée dentelée.',
      });
    }

    if (threats.ccThreatCount >= 2 && stats.totals.tenacityPct === 0 && !isTankPrimary) {
      diagnostics.push({
        id: 'surv-cc',
        category: 'Survie & Défense',
        title: `0% Ténacité face à ${threats.ccThreatCount} contrôles`,
        statusLabel: '0% Ténacité',
        tone: 'sky',
        explanation: `Vous n’avez ni Sandales de Mercure, ni Bout du rouleau, ni fragment +10% Ténacité contre une compo riche en CC.`,
        actionTip: 'Le fragment défensif +10% Ténacité ou Sandales de Mercure évitent de vous faire enchaîner.',
      });
    }
  }

  // 4. Passifs uniques en conflit & Hâte de compétence
  if (stats.spellbladeItemsCount >= 2) {
    diagnostics.push({
      id: 'passive-spellblade-dup',
      category: 'Passifs & Tempo',
      title: 'Attention : plusieurs objets Lame enchantée équipés',
      statusLabel: `${stats.spellbladeItemsCount} objets Lame enchantée`,
      tone: 'rose',
      explanation: `Le passif Lame enchantée (Brillance) est UNIQUE : équiper ${stats.spellbladeItemsCount} objets de cette famille en même temps en annule au moins un en combat.`,
      actionTip: 'Ne gardez qu’un seul objet Lame enchantée (ex. Aube et crépuscule OU Fléau de liche OU Trinité).',
    });
    suggestedTweaks.push('Supprimer le doublon Lame enchantée : un seul proc s’applique en jeu.');
  } else if (stats.bootsCount >= 2) {
    diagnostics.push({
      id: 'passive-boots-dup',
      category: 'Passifs & Tempo',
      title: 'Deux paires de bottes équipées',
      statusLabel: `${stats.bootsCount} bottes`,
      tone: 'rose',
      explanation: 'Vous ne pouvez acheter qu’une seule paire de bottes en partie réelle.',
    });
  } else if (stats.itemCount >= 4 && stats.bootsCount === 0) {
    diagnostics.push({
      id: 'passive-no-boots',
      category: 'Passifs & Tempo',
      title: 'Aucune paire de bottes dans les 6 emplacements',
      statusLabel: `${stats.totals.moveSpeed} Vit. déplacement`,
      tone: 'amber',
      explanation: `À ${stats.totals.moveSpeed} de vitesse de déplacement sans bottes, vous aurez du mal à esquiver et tourner sur la carte avant le full stuff.`,
    });
  } else {
    diagnostics.push({
      id: 'tempo-haste',
      category: 'Passifs & Tempo',
      title: 'Hâte & Passifs uniques sans conflit',
      statusLabel: `${stats.totals.abilityHaste} Hâte (${stats.totals.cooldownReductionPct}% CDR)`,
      tone: stats.totals.abilityHaste >= 25 || isAdPrimary ? 'emerald' : 'sky',
      explanation: `${stats.totals.abilityHaste} d’accélération (${stats.totals.cooldownReductionPct}% de réduction de délais) et ${stats.activePassives.length} passif(s) compatibles.`,
    });
  }

  // 5. Analyse croisée Runes × Objets équipés
  const keystoneMech = KEYSTONE_MECHANICS[runeSelection.keystoneId];
  const primaryTreeName =
    runeTrees.find((t) => t.id === runeSelection.primaryTreeId)?.name || 'Arbre principal';
  const secondaryTreeName =
    runeTrees.find((t) => t.id === runeSelection.secondaryTreeId)?.name || 'Arbre secondaire';

  if (hasTempoMortel || hasDeluge) {
    if (stats.totals.uncappedAttackSpeed >= 2.15) {
      runeSynergies.push({
        runeName: keystoneName,
        category: `${primaryTreeName} · Conflit de plafond`,
        tone: 'amber',
        explanation: `${keystoneName} ajoute encore plus de vitesse d’attaque en combat alors que votre stuff atteint déjà ${stats.totals.uncappedAttackSpeed}/s (cap à 2.500/s). Pour ce stuff très orienté AS, Attaque soutenue (+8% dégâts sur vos procs), Conquérant ou Moisson noire seront plus rentables.`,
      });
    } else {
      runeSynergies.push({
        runeName: keystoneName,
        category: `${primaryTreeName} · Synergie On-Hit`,
        tone: 'emerald',
        explanation: `${keystoneName} complète vos +${itemAsPctTotal}% d’AS d’objets sans saturer le cap et accélère l’application de vos effets à l’impact (${stats.combat.onHitPerAttack}/coup).`,
      });
    }
  } else if (runeSelection.keystoneId === 8005) {
    // Attaque soutenue
    runeSynergies.push({
      runeName: keystoneName,
      category: `${primaryTreeName} · Synergie Burst & On-Hit`,
      tone: 'emerald',
      explanation: `Après 3 attaques rapides (facilitées par vos ${stats.totals.attackSpeed}/s), Attaque soutenue amplifie de +8% tous vos dégâts (autos + sorts + passifs d’objets).`,
    });
  } else if (runeSelection.keystoneId === 8010) {
    // Conquérant
    runeSynergies.push({
      runeName: keystoneName,
      category: `${primaryTreeName} · Combat prolongé`,
      tone: 'emerald',
      explanation: `Vos ${stats.totals.attackSpeed}/s et ${stats.totals.abilityHaste} Hâte empilent vite les 12 effets de Conquérant pour gagner de l’${isApPrimary ? 'AP' : 'AD'} bonus et 8% d’omnivamp en duel.`,
    });
  } else if (runeSelection.keystoneId === 8128 || runeSelection.keystoneId === 8112) {
    runeSynergies.push({
      runeName: keystoneName,
      category: `${primaryTreeName} · Scaling sur vos stats`,
      tone: stats.totals.ap >= 250 || stats.totals.ad >= 180 ? 'emerald' : 'sky',
      explanation: `${keystoneName} scale directement avec votre ${isApPrimary ? `${stats.totals.ap} AP` : `${stats.totals.ad} AD`}${stats.totals.magicPenPct > 0 || stats.totals.magicPenFlat > 0 ? ' et votre Pénétration magique' : ''} pour punir sous 50% PV / sur burst court.`,
    });
  } else if (runeSelection.keystoneId === 8437) {
    runeSynergies.push({
      runeName: keystoneName,
      category: `${primaryTreeName} · Synergie PV max`,
      tone: 'emerald',
      explanation: `Poigne scale sur vos ${stats.totals.hp} PV max (et profite de ${stats.totals.healShieldReceivedPct > 0 ? `+${stats.totals.healShieldReceivedPct}% de soins reçus` : 'vos échanges courts'}) pour vous soigner et grossir vos PV permanents.`,
    });
  } else if (keystoneMech) {
    runeSynergies.push({
      runeName: keystoneName,
      category: primaryTreeName,
      tone: 'sky',
      explanation: keystoneMech.effect,
    });
  }

  // Synergies runes mineures & fragments avec les items équipés
  if (hasAlacrite || hasAsShard) {
    if (stats.totals.uncappedAttackSpeed >= 2.35) {
      runeSynergies.push({
        runeName:
          hasAlacrite && hasAsShard
            ? 'Alacrité + Fragment +10% AS'
            : hasAlacrite
              ? 'Légende : alacrité (+18% AS)'
              : 'Fragment +10% Vitesse d’attaque',
        category: 'Fragments & Mineures · Overcap',
        tone: 'amber',
        explanation: `Avec +${itemAsPctTotal}% d’AS déjà sur vos objets, ce bonus de vitesse d’attaque vous approche/fait dépasser le plafond 2.500/s. En passant sur Légende : hâte (+15 Hâte) ou +9 Force adaptative, vous gagnez des dégâts utiles sans perte.`,
      });
    } else {
      runeSynergies.push({
        runeName: hasAlacrite ? 'Légende : alacrité (+18% AS)' : 'Fragment +10% AS',
        category: `${primaryTreeName} · Cadence`,
        tone: 'emerald',
        explanation: `Apporte de l’AS gratuite (~${Math.round((hasAlacrite ? 18 : 10) * 25)} po) qui fluidifie vos attaques à ${stats.totals.attackSpeed}/s.`,
      });
    }
  }

  if (allRuneIds.has(8429) && (stats.sources.armor.items > 0 || stats.sources.mr.items > 0)) {
    runeSynergies.push({
      runeName: 'Conditionnement (+3% résistances)',
      category: `${secondaryTreeName} · Synergie Tank/Bruiser`,
      tone: 'emerald',
      explanation: `Amplifie vos +${stats.sources.armor.items} Armure et +${stats.sources.mr.items} RM d’objets (soit +${stats.sources.armor.runes} Arm. / +${stats.sources.mr.runes} RM via runes dès le niv.9).`,
    });
  }

  if (allRuneIds.has(8453) && (stats.combat.combatSustainPerSec > 0 || stats.totals.healShieldPowerPct > 5)) {
    runeSynergies.push({
      runeName: 'Revitalisation (+5–15% Soins/Boucliers)',
      category: `${secondaryTreeName} · Synergie Sustain`,
      tone: 'emerald',
      explanation: `Booste directement votre sustain en combat (~${stats.combat.combatSustainPerSec} PV/s) et vos soins/boucliers d’objets.`,
    });
  }

  if (allRuneIds.has(8234) && stats.sources.moveSpeed.items > 0) {
    runeSynergies.push({
      runeName: 'Célérité (+7% bonus vitesse)',
      category: 'Mobilité & Kiting',
      tone: 'sky',
      explanation: `Multiplie les +${stats.sources.moveSpeed.items} de vitesse apportés par vos bottes/objets (total ${stats.totals.moveSpeed} MS).`,
    });
  }

  if (allRuneIds.has(8210) || allRuneIds.has(9105)) {
    runeSynergies.push({
      runeName: allRuneIds.has(8210) ? 'Transcendance (+10 Hâte)' : 'Légende : hâte (+15 Hâte)',
      category: 'Tempo & Cooldowns',
      tone: 'emerald',
      explanation: `Fournit +${stats.sources.abilityHaste.runes} Hâte sur vos ${stats.totals.abilityHaste} au total (${stats.totals.cooldownReductionPct}% CDR), précieux si votre stuff privilégie les dégâts bruts sans Hâte.`,
    });
  }

  if (allRuneIds.has(8226) || allRuneIds.has(8009)) {
    runeSynergies.push({
      runeName: allRuneIds.has(8226) ? 'Ruban de mana' : 'Présence d’esprit',
      category: 'Tenue de Mana',
      tone: stats.totals.manaRegenPct === 0 && stats.totals.mana < 700 ? 'emerald' : 'sky',
      explanation:
        stats.totals.manaRegenPct === 0
          ? `Compense l’absence totale d’objet Mana dans votre stuff actuel (${stats.totals.mana} Mana max).`
          : `Renforce votre confort de mana (+${stats.totals.manaRegenPct}% régén. sur vos objets).`,
    });
  }

  const roseCount = diagnostics.filter((d) => d.tone === 'rose').length;
  const amberCount = diagnostics.filter((d) => d.tone === 'amber').length;

  let overallTone: BuildDiagnosticTone = 'emerald';
  let overallHeadline = `Build très équilibré pour ${champion.name} (${role}) face à cette compo`;
  if (roseCount > 0) {
    overallTone = 'rose';
    overallHeadline = `${roseCount} point(s) critique(s) détecté(s) sur ce build (gaspillage ou vulnérabilité majeure)`;
  } else if (amberCount > 0) {
    overallTone = 'amber';
    overallHeadline = `Build jouable mais ${amberCount} ajustement(s) conseillé(s) pour optimiser vos PO et dégâts`;
  }

  const profileTags: string[] = [
    `${stats.combat.totalGold} po (${stats.combat.goldEfficiencyPct}% rentabilité)`,
    `Runes ~${stats.combat.runeGoldValue} po`,
    stats.totals.attackSpeed >= 2.0 ? 'Cadence rapide / On-Hit' : isApPrimary ? 'Dégâts AP' : isTankPrimary ? 'Frontline Tank' : 'Dégâts AD',
  ];

  return {
    overallHeadline,
    overallTone,
    profileTags,
    diagnostics,
    runeSynergies,
    suggestedTweaks: suggestedTweaks.slice(0, 3),
  };
}


