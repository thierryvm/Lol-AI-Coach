import { classifyChampionProfile, computeStatAtLevel } from './championEngine.ts';
import type {
  ChampionSummary,
  ItemData,
  LiveCoachSnapshot,
  LivePlayerEquipmentRow,
  Role,
} from './types.ts';

export type CounterCategory =
  | 'Anti-Soin'
  | 'Anti-Tank / Pénétration'
  | 'Armure / Anti-Crit'
  | 'Résist. Magique'
  | 'Anti-Burst / Survie'
  | 'Anti-Bouclier';

export interface EnemyLiveBuildAnalysis {
  championName: string;
  displayName: string;
  imageUrl?: string;
  level: number;
  kda: string;
  dangerLevel: 'Élevé' | 'Moyen' | 'Normal';
  goldSpent: number;
  bonusAd: number;
  bonusAp: number;
  bonusHp: number;
  bonusArmor: number;
  bonusMr: number;
  bonusAsPct: number;
  critPct: number;
  estimatedArmor: number;
  estimatedMr: number;
  estimatedHp: number;
  hasHealOrLifesteal: boolean;
  hasShieldItems: boolean;
  hasHighCrit: boolean;
  hasOnHitOrAs: boolean;
  dominantProfile: 'AD / Crit' | 'AD / Bruiser' | 'Létalité' | 'AP / Burst' | 'Tank / PV' | 'Support' | 'Départ';
  detectedItemNames: string[];
}

export interface LiveCounterSuggestion {
  item: ItemData;
  category: CounterCategory;
  priority: 'Urgent' | 'Recommandé' | 'Situationnel';
  score: number;
  affordableNow: boolean;
  isComponent: boolean;
  targetEnemies: string[];
  reason: string;
}

export interface LiveCounterAnalysisReport {
  enemyAnalyses: EnemyLiveBuildAnalysis[];
  suggestions: LiveCounterSuggestion[];
  teamPhysicalThreatPct: number;
  teamMagicThreatPct: number;
  totalEnemyBonusArmor: number;
  totalEnemyBonusMr: number;
  totalEnemyBonusHp: number;
  healThreatCount: number;
  critThreatCount: number;
  tankThreatCount: number;
  shieldThreatCount: number;
  playerBuildStyle: 'AD_CRIT' | 'AD_BRUISER' | 'AD_LETHALITY' | 'AP_MAGE' | 'TANK' | 'ENCHANTER';
  itemsPurchasedCount: number;
}

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getStat(item: ItemData, key: string): number {
  return typeof item.stats?.[key] === 'number' ? item.stats[key] : 0;
}

function hasText(item: ItemData, keywords: string[]): boolean {
  const haystack = `${item.name} ${item.plaintext} ${stripHtml(item.description)}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k.toLowerCase()));
}

function findChampionSummary(
  champions: ChampionSummary[],
  rawName: string,
): ChampionSummary | undefined {
  const norm = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return champions.find(
    (c) =>
      c.id.toLowerCase() === rawName.toLowerCase() ||
      c.name.toLowerCase() === rawName.toLowerCase() ||
      c.id.toLowerCase().replace(/[^a-z0-9]/g, '') === norm ||
      c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === norm,
  );
}

function detectPlayerLiveStyle(
  playerChamp: ChampionSummary | undefined,
  role: Role,
  activeStats: LiveCoachSnapshot['activeStats'] | undefined,
  ownedItems: ItemData[],
): LiveCounterAnalysisReport['playerBuildStyle'] {
  const ownedAd = ownedItems.reduce((acc, it) => acc + getStat(it, 'FlatPhysicalDamageMod'), 0);
  const ownedAp = ownedItems.reduce((acc, it) => acc + getStat(it, 'FlatMagicDamageMod'), 0);
  const ownedCrit = ownedItems.reduce((acc, it) => acc + getStat(it, 'FlatCritChanceMod'), 0);
  const ownedDef = ownedItems.reduce(
    (acc, it) =>
      acc +
      getStat(it, 'FlatArmorMod') +
      getStat(it, 'FlatSpellBlockMod') +
      getStat(it, 'FlatHPPoolMod') / 10,
    0,
  );

  const liveAd = activeStats?.attackDamage ?? 0;
  const liveAp = activeStats?.abilityPower ?? 0;

  if (ownedAp >= 60 || liveAp >= 95) {
    if (role === 'SUPPORT' && playerChamp?.tags.includes('Support') && !playerChamp?.tags.includes('Mage')) {
      return 'ENCHANTER';
    }
    return 'AP_MAGE';
  }
  if (ownedCrit >= 0.2) return 'AD_CRIT';
  if (ownedDef >= 90 && ownedAd < 75 && ownedAp < 75) return 'TANK';

  if (playerChamp) {
    const tags = playerChamp.tags;
    if (role === 'ADC' || (tags.includes('Marksman') && playerChamp.info.attack >= 7)) {
      return 'AD_CRIT';
    }
    if (tags.includes('Tank') && role !== 'MID') {
      return 'TANK';
    }
    if (role === 'SUPPORT' && tags.includes('Support') && !tags.includes('Tank')) {
      return 'ENCHANTER';
    }
    if (tags.includes('Mage') || playerChamp.info.magic >= playerChamp.info.attack + 2) {
      return 'AP_MAGE';
    }
    if (tags.includes('Assassin') && playerChamp.info.attack >= playerChamp.info.magic) {
      return 'AD_LETHALITY';
    }
  }

  if (liveAp > liveAd && liveAp >= 40) return 'AP_MAGE';
  return 'AD_BRUISER';
}

export function analyzeLiveEnemyCounters(params: {
  enemyPlayers: LivePlayerEquipmentRow[];
  allyPlayers: LivePlayerEquipmentRow[];
  selfChampionName: string;
  role: Role;
  champions: ChampionSummary[];
  items: ItemData[];
  activeStats?: LiveCoachSnapshot['activeStats'];
  currentGold: number;
  gameMode?: string;
}): LiveCounterAnalysisReport {
  const {
    enemyPlayers,
    allyPlayers,
    selfChampionName,
    role,
    champions,
    items,
    activeStats,
    currentGold,
    gameMode,
  } = params;

  const itemById = new Map<string, ItemData>();
  for (const item of items) {
    itemById.set(String(item.id), item);
  }

  const selfChamp = findChampionSummary(champions, selfChampionName);
  const selfRow = allyPlayers.find(
    (p) => p.championName.toLowerCase() === selfChampionName.toLowerCase(),
  );
  const ownedItemIds = new Set<number>((selfRow?.items || []).map((it) => it.itemId));
  const ownedItems = (selfRow?.items || [])
    .map((it) => itemById.get(String(it.itemId)))
    .filter((it): it is ItemData => Boolean(it));

  const playerBuildStyle = detectPlayerLiveStyle(selfChamp, role, activeStats, ownedItems);

  // 1. Analyse détaillée de chaque adversaire via ses objets Data Dragon + niveau actuel
  let totalPhysicalPower = 0;
  let totalMagicPower = 0;
  let itemsPurchasedCount = 0;

  const enemyAnalyses: EnemyLiveBuildAnalysis[] = enemyPlayers.map((enemy) => {
    const champ = findChampionSummary(champions, enemy.championName);
    const champProfile = champ ? classifyChampionProfile(champ) : null;
    const resolvedItems = enemy.items
      .map((it) => ({
        raw: it,
        dd: itemById.get(String(it.itemId)),
      }))
      .filter((entry) => entry.raw.itemId > 0);

    itemsPurchasedCount += resolvedItems.length;

    let bonusAd = 0;
    let bonusAp = 0;
    let bonusHp = 0;
    let bonusArmor = 0;
    let bonusMr = 0;
    let bonusAsPct = 0;
    let critPct = 0;
    let goldSpent = 0;
    let hasHealOrLifesteal = false;
    let hasShieldItems = false;
    let hasLethalityOrArp = false;
    const detectedItemNames: string[] = [];

    for (const { raw, dd } of resolvedItems) {
      goldSpent += raw.price || dd?.gold.total || 0;
      if (!dd) continue;
      if (dd.gold.total >= 800) {
        detectedItemNames.push(dd.name);
      }

      bonusAd += getStat(dd, 'FlatPhysicalDamageMod');
      bonusAp += getStat(dd, 'FlatMagicDamageMod');
      bonusHp += getStat(dd, 'FlatHPPoolMod');
      bonusArmor += getStat(dd, 'FlatArmorMod');
      bonusMr += getStat(dd, 'FlatSpellBlockMod');
      bonusAsPct += Math.round(getStat(dd, 'PercentAttackSpeedMod') * 100);
      critPct += Math.round(getStat(dd, 'FlatCritChanceMod') * 100);

      if (
        getStat(dd, 'PercentLifeStealMod') > 0 ||
        dd.tags.includes('LifeSteal') ||
        dd.tags.includes('SpellVamp') ||
        hasText(dd, [
          'vol de vie',
          'life steal',
          'omnivamp',
          'soins et boucliers',
          'soin',
          'régén',
          'ciel éventré',
          'sundered sky',
          'soif-de-sang',
          'bloodthirster',
          'danse de la mort',
          'death\'s dance',
          'roi déchu',
          'ruined king',
          'visage spirituel',
          'spirit visage',
          'désespoir infini',
          'unending despair',
          'faiseur de failles',
          'riftmaker',
        ])
      ) {
        hasHealOrLifesteal = true;
      }

      if (
        hasText(dd, [
          'bouclier',
          'shield',
          'sterak',
          'arc-bouclier',
          'shieldbow',
          'solari',
          'fimbulvetr',
          'séraphin',
          'seraph',
          'kaénique',
          'rookern',
          'éclipse',
          'eclipse',
        ])
      ) {
        hasShieldItems = true;
      }

      if (
        hasText(dd, ['létalité', 'lethality', "pénétration d'armure", 'armor penetration'])
      ) {
        hasLethalityOrArp = true;
      }
    }

    if (champProfile && champProfile.sustainScore >= 72) {
      hasHealOrLifesteal = true;
    }

    const baseArmor = champ
      ? computeStatAtLevel(champ.stats.armor, champ.stats.armorperlevel, enemy.level)
      : 35 + enemy.level * 4;
    const baseMr = champ
      ? computeStatAtLevel(champ.stats.spellblock, champ.stats.spellblockperlevel, enemy.level)
      : 32 + enemy.level * 1.5;
    const baseHp = champ
      ? computeStatAtLevel(champ.stats.hp, champ.stats.hpperlevel, enemy.level)
      : 620 + enemy.level * 95;

    const estimatedArmor = Math.round(baseArmor + bonusArmor);
    const estimatedMr = Math.round(baseMr + bonusMr);
    const estimatedHp = Math.round(baseHp + bonusHp);

    const hasHighCrit = critPct >= 20;
    const hasOnHitOrAs = bonusAsPct >= 25;

    const dangerMult = enemy.dangerLevel === 'Élevé' ? 1.35 : enemy.dangerLevel === 'Moyen' ? 1.15 : 1;
    const champPhysBase = champProfile ? champProfile.physicalScore : 50;
    const champMagicBase = champProfile ? champProfile.magicScore : 50;

    totalPhysicalPower += (champPhysBase * 0.7 + bonusAd * 1.1 + critPct * 1.4 + bonusAsPct * 0.8) * dangerMult;
    totalMagicPower += (champMagicBase * 0.7 + bonusAp * 0.75) * dangerMult;

    let dominantProfile: EnemyLiveBuildAnalysis['dominantProfile'] = 'Départ';
    if (bonusArmor >= 45 || bonusHp >= 650 || (bonusArmor + bonusMr >= 65 && bonusAd < 45 && bonusAp < 60)) {
      dominantProfile = 'Tank / PV';
    } else if (bonusAp >= 45 || (champProfile && champProfile.primaryDamage === 'Magique' && resolvedItems.length > 0)) {
      dominantProfile = 'AP / Burst';
    } else if (hasHighCrit || (bonusAd >= 30 && hasOnHitOrAs)) {
      dominantProfile = 'AD / Crit';
    } else if (hasLethalityOrArp && bonusAd >= 25) {
      dominantProfile = 'Létalité';
    } else if (bonusAd >= 25) {
      dominantProfile = 'AD / Bruiser';
    } else if (champ?.tags.includes('Support')) {
      dominantProfile = 'Support';
    }

    return {
      championName: enemy.championName,
      displayName: champ?.name || enemy.championName,
      imageUrl: champ?.imageUrl,
      level: enemy.level,
      kda: `${enemy.kills}/${enemy.deaths}/${enemy.assists}`,
      dangerLevel: enemy.dangerLevel,
      goldSpent,
      bonusAd: Math.round(bonusAd),
      bonusAp: Math.round(bonusAp),
      bonusHp: Math.round(bonusHp),
      bonusArmor: Math.round(bonusArmor),
      bonusMr: Math.round(bonusMr),
      bonusAsPct,
      critPct,
      estimatedArmor,
      estimatedMr,
      estimatedHp,
      hasHealOrLifesteal,
      hasShieldItems,
      hasHighCrit,
      hasOnHitOrAs,
      dominantProfile,
      detectedItemNames,
    };
  });

  const denom = Math.max(1, totalPhysicalPower + totalMagicPower);
  const teamPhysicalThreatPct = Math.round((totalPhysicalPower / denom) * 100);
  const teamMagicThreatPct = 100 - teamPhysicalThreatPct;

  const totalEnemyBonusArmor = enemyAnalyses.reduce((acc, e) => acc + e.bonusArmor, 0);
  const totalEnemyBonusMr = enemyAnalyses.reduce((acc, e) => acc + e.bonusMr, 0);
  const totalEnemyBonusHp = enemyAnalyses.reduce((acc, e) => acc + e.bonusHp, 0);

  const healEnemies = enemyAnalyses.filter((e) => e.hasHealOrLifesteal);
  const critEnemies = enemyAnalyses.filter((e) => e.hasHighCrit || (e.hasOnHitOrAs && e.bonusAd >= 25));
  const tankEnemies = enemyAnalyses.filter(
    (e) => e.estimatedArmor >= 115 || e.estimatedHp >= 2500 || e.bonusArmor >= 50 || e.bonusHp >= 700,
  );
  const mrStackEnemies = enemyAnalyses.filter((e) => e.estimatedMr >= 95 || e.bonusMr >= 45);
  const apBurstEnemies = enemyAnalyses.filter(
    (e) => e.bonusAp >= 70 || (e.dominantProfile === 'AP / Burst' && e.dangerLevel === 'Élevé'),
  );
  const adBurstEnemies = enemyAnalyses.filter(
    (e) =>
      e.bonusAd >= 55 ||
      e.dominantProfile === 'Létalité' ||
      (e.dominantProfile === 'AD / Crit' && e.dangerLevel === 'Élevé'),
  );
  const shieldEnemies = enemyAnalyses.filter((e) => e.hasShieldItems);

  // 2. Filtrer les objets Data Dragon achetables sur la carte active
  const mapKey = gameMode?.toUpperCase() === 'ARAM' ? '12' : '11';
  const validPoolMap = new Map<string, ItemData>();
  for (const it of items) {
    if (
      Number(it.id) >= 100000 ||
      !it.gold.purchasable ||
      it.tags.includes('Consumable') ||
      it.tags.includes('Trinket') ||
      it.gold.total < 800 ||
      (it.maps && it.maps[mapKey] === false)
    ) {
      continue;
    }
    const key = it.name.trim().toLowerCase();
    const prev = validPoolMap.get(key);
    if (!prev || Number(it.id) < Number(prev.id)) {
      validPoolMap.set(key, it);
    }
  }

  const candidateItems = Array.from(validPoolMap.values()).filter((it) => {
    if (ownedItemIds.has(Number(it.id))) return false;
    const isBoots = it.tags.includes('Boots') && it.gold.total >= 900 && it.gold.total <= 1500;
    const isCompleted = !it.into || it.into.length === 0;
    // Autoriser aussi les composants anti-heal clés à 800 po (Exécuteur, Orbe de l'oubli, Armure roncière) et Ceinture de mercure (1300 po)
    const isKeyCheapCounter =
      it.id === '3123' || // Appel du bourreau
      it.id === '3916' || // Orbe de l'oubli
      it.id === '3076' || // Armure roncière
      it.id === '3140';   // Ceinture de mercure
    return isBoots || isCompleted || isKeyCheapCounter;
  });

  // 3. Scoring déterministe des contre-objets face aux stats/achats ennemis actuels
  const scoredSuggestions: LiveCounterSuggestion[] = [];

  for (const item of candidateItems) {
    const ad = getStat(item, 'FlatPhysicalDamageMod');
    const ap = getStat(item, 'FlatMagicDamageMod');
    const hp = getStat(item, 'FlatHPPoolMod');
    const armor = getStat(item, 'FlatArmorMod');
    const mr = getStat(item, 'FlatSpellBlockMod');
    const isComponent =
      item.id === '3123' || item.id === '3916' || item.id === '3076' || item.id === '3140';

    // Filtrage strict par style du joueur pour ne jamais proposer un objet AP à un ADC Crit ou inversement
    if (playerBuildStyle === 'AD_CRIT' || playerBuildStyle === 'AD_LETHALITY' || playerBuildStyle === 'AD_BRUISER') {
      if (ap > 0 && ad === 0 && armor === 0 && mr === 0) continue;
      if (item.id === '3916' || item.id === '3165') continue; // Orbe / Morello
    }
    if (playerBuildStyle === 'AP_MAGE' || playerBuildStyle === 'ENCHANTER') {
      if (ad > 0 && ap === 0 && armor === 0 && mr === 0) continue;
      if (item.id === '3123' || item.id === '3033' || item.id === '3036' || item.id === '6694') continue;
    }

    const isAntiHeal =
      item.id === '3123' ||
      item.id === '3916' ||
      item.id === '3076' ||
      item.id === '3033' || // Rappel mortel
      item.id === '3165' || // Morellonomicon
      item.id === '3075' || // Cotte épineuse
      item.id === '6609' || // Épée dentelée chimico-punk
      hasText(item, ['hémorragie', 'grievous wounds', 'blessures graves']);

    const isArmorPen =
      item.id === '3036' || // Salutations de Dominik
      item.id === '3033' || // Rappel mortel
      item.id === '3071' || // Couperet noir
      item.id === '6694' || // Rancune de Serylda
      item.id === '3302' || // Terminus
      hasText(item, ["pénétration d'armure", 'armor penetration']);

    const isMagicPen =
      item.id === '3135' || // Bâton du vide
      item.id === '3137' || // Cryptofleur
      item.id === '3020' || // Chaussures de sorcier
      hasText(item, ['pénétration magique', 'magic penetration']);

    const isAntiTankHp =
      item.id === '3153' || // Lame du roi déchu
      item.id === '6653' || // Tourment de Liandry
      hasText(item, ['pv max', 'max health', 'tourment', 'liandry', 'roi déchu']);

    const isAntiCritOrAs =
      item.id === '3143' || // Présage de Randuin
      item.id === '3110' || // Cœur gelé
      item.id === '3047' || // Coques en acier
      hasText(item, ['randuin', 'cœur gelé', 'frozen heart', 'coups critiques']);

    const isAntiBurstAp =
      item.id === '2504' || // Rookern kaénique
      item.id === '4401' || // Force de la nature
      item.id === '3156' || // Gueule de Malmortius
      item.id === '3102' || // Voile de la banshee
      item.id === '3091' || // Au bout du rouleau
      item.id === '3111' || // Sandales de Mercure
      item.id === '3065';   // Visage spirituel

    const isAntiBurstAdOrStasis =
      item.id === '3157' || // Sablier de Zhonya
      item.id === '3026' || // Ange gardien
      item.id === '3053' || // Gage de Sterak
      item.id === '6333' || // Danse de la mort
      item.id === '3742';   // Plaque du mort

    const isAntiShield =
      item.id === '6695' || // Crochet de serpent
      hasText(item, ['crochet de serpent', "serpent's fang"]);

    let bestScore = 0;
    let category: CounterCategory = 'Armure / Anti-Crit';
    let targetEnemies: string[] = [];
    let reason = '';

    // Règle 1 : Anti-Soin contre builds lifesteal/heal
    if (isAntiHeal && healEnemies.length > 0) {
      const styleFit =
        (playerBuildStyle === 'AD_CRIT' && (item.id === '3033' || item.id === '3123')) ||
        (playerBuildStyle === 'AD_BRUISER' && (item.id === '6609' || item.id === '3123' || item.id === '3075')) ||
        (playerBuildStyle === 'AD_LETHALITY' && (item.id === '6609' || item.id === '3123' || item.id === '3033')) ||
        ((playerBuildStyle === 'AP_MAGE' || playerBuildStyle === 'ENCHANTER') && (item.id === '3165' || item.id === '3916')) ||
        (playerBuildStyle === 'TANK' && (item.id === '3075' || item.id === '3076'));

      if (styleFit) {
        const s = 68 + healEnemies.length * 14 + (isComponent && currentGold < 2200 ? 12 : 0);
        if (s > bestScore) {
          bestScore = s;
          category = 'Anti-Soin';
          targetEnemies = healEnemies.slice(0, 3).map((e) => e.displayName);
          const examples = healEnemies
            .slice(0, 2)
            .map((e) =>
              e.detectedItemNames.length > 0
                ? `${e.displayName} (${e.detectedItemNames[0]})`
                : e.displayName,
            )
            .join(', ');
          reason = `Coupe 40% de régénération contre ${examples}${isComponent ? ' dès maintenant pour seulement 800 po' : ''}.`;
        }
      }
    }

    // Règle 2 : Pénétration / Coupe-tanks contre armure/RM/PV accumulés
    if (tankEnemies.length > 0 && (isArmorPen || isAntiTankHp) && playerBuildStyle !== 'AP_MAGE' && playerBuildStyle !== 'TANK' && playerBuildStyle !== 'ENCHANTER') {
      const maxArmorEnemy = [...tankEnemies].sort((a, b) => b.estimatedArmor - a.estimatedArmor)[0];
      const s = 62 + tankEnemies.length * 14 + Math.min(20, Math.round(totalEnemyBonusArmor / 15));
      if (s > bestScore) {
        bestScore = s;
        category = 'Anti-Tank / Pénétration';
        targetEnemies = tankEnemies.slice(0, 3).map((e) => e.displayName);
        reason = `${maxArmorEnemy.displayName} atteint ~${maxArmorEnemy.estimatedArmor} Armure / ${maxArmorEnemy.estimatedHp} PV : perce les résistances accumulées.`;
      }
    }

    if ((mrStackEnemies.length > 0 || tankEnemies.length > 0) && (isMagicPen || item.id === '6653') && playerBuildStyle === 'AP_MAGE') {
      const topMr = [...enemyAnalyses].sort((a, b) => b.estimatedMr - a.estimatedMr)[0];
      const s = 64 + mrStackEnemies.length * 15 + tankEnemies.length * 8;
      if (s > bestScore) {
        bestScore = s;
        category = 'Anti-Tank / Pénétration';
        targetEnemies = (mrStackEnemies.length > 0 ? mrStackEnemies : tankEnemies)
          .slice(0, 3)
          .map((e) => e.displayName);
        reason =
          item.id === '6653'
            ? `Brûlure en % PV max très rentable contre les ${topMr.estimatedHp} PV de ${topMr.displayName}.`
            : `Indispensable face aux ~${topMr.estimatedMr} RM de ${topMr.displayName} (${topMr.bonusMr} RM bonus via objets).`;
      }
    }

    // Règle 3 : Armure / Anti-Crit contre builds critiques / vitesse d'attaque
    if ((critEnemies.length > 0 || teamPhysicalThreatPct >= 58) && (isAntiCritOrAs || (armor >= 40 && (playerBuildStyle === 'TANK' || playerBuildStyle === 'AD_BRUISER')))) {
      if (playerBuildStyle !== 'AD_CRIT' || item.id === '3047') {
        const topAd = [...(critEnemies.length > 0 ? critEnemies : enemyAnalyses)].sort(
          (a, b) => b.critPct + b.bonusAd - (a.critPct + a.bonusAd),
        )[0];
        const s =
          60 +
          critEnemies.length * 14 +
          (teamPhysicalThreatPct >= 62 ? 14 : 0) +
          (item.id === '3143' && critEnemies.length > 0 ? 12 : 0);
        if (s > bestScore) {
          bestScore = s;
          category = 'Armure / Anti-Crit';
          targetEnemies = (critEnemies.length > 0 ? critEnemies : adBurstEnemies)
            .slice(0, 3)
            .map((e) => e.displayName);
          reason =
            critEnemies.length > 0
              ? `Réduit fortement les coups critiques/AS de ${topAd.displayName} (${topAd.critPct}% Crit, +${topAd.bonusAd} AD).`
              : `Composition adverse orientée à ${teamPhysicalThreatPct}% sur les dégâts physiques.`;
        }
      }
    }

    // Règle 4 : Résistance Magique contre builds AP / burst magique
    if ((apBurstEnemies.length > 0 || teamMagicThreatPct >= 48) && isAntiBurstAp) {
      const styleOk =
        (playerBuildStyle === 'AP_MAGE' && (item.id === '3102' || item.id === '3111')) ||
        ((playerBuildStyle === 'AD_CRIT' || playerBuildStyle === 'AD_BRUISER' || playerBuildStyle === 'AD_LETHALITY') &&
          (item.id === '3156' || item.id === '3091' || item.id === '3111')) ||
        (playerBuildStyle === 'TANK' && (item.id === '2504' || item.id === '4401' || item.id === '3065' || item.id === '3111')) ||
        (playerBuildStyle === 'ENCHANTER' && item.id === '3111');

      if (styleOk) {
        const topAp = [...enemyAnalyses].sort((a, b) => b.bonusAp - a.bonusAp)[0];
        const s = 60 + apBurstEnemies.length * 14 + (teamMagicThreatPct >= 55 ? 14 : 0);
        if (s > bestScore) {
          bestScore = s;
          category = 'Résist. Magique';
          targetEnemies = (apBurstEnemies.length > 0 ? apBurstEnemies : enemyAnalyses)
            .slice(0, 3)
            .map((e) => e.displayName);
          reason = `Absorbe le burst magique (${teamMagicThreatPct}% de menace AP, ${topAp.displayName} à +${topAp.bonusAp} AP).`;
        }
      }
    }

    // Règle 5 : Anti-Burst AD / Stase / Survie contre assassins ou carries fed
    if (adBurstEnemies.length > 0 && isAntiBurstAdOrStasis) {
      const styleOk =
        (playerBuildStyle === 'AP_MAGE' && item.id === '3157') ||
        ((playerBuildStyle === 'AD_CRIT' || playerBuildStyle === 'AD_LETHALITY') && item.id === '3026') ||
        (playerBuildStyle === 'AD_BRUISER' && (item.id === '3053' || item.id === '6333')) ||
        (playerBuildStyle === 'TANK' && item.id === '3742');

      if (styleOk) {
        const topThreat = [...adBurstEnemies].sort((a, b) => b.bonusAd - a.bonusAd)[0];
        const s = 62 + adBurstEnemies.length * 10 + (topThreat.dangerLevel === 'Élevé' ? 12 : 0);
        if (s > bestScore) {
          bestScore = s;
          category = 'Anti-Burst / Survie';
          targetEnemies = adBurstEnemies.slice(0, 3).map((e) => e.displayName);
          reason = `Empêche ${topThreat.displayName} (+${topThreat.bonusAd} AD, ${topThreat.kda}) de vous one-shot en teamfight.`;
        }
      }
    }

    // Règle 6 : Anti-Bouclier contre gros shields ennemis
    if (shieldEnemies.length >= 1 && isAntiShield && (playerBuildStyle === 'AD_LETHALITY' || playerBuildStyle === 'AD_BRUISER')) {
      const s = 60 + shieldEnemies.length * 14;
      if (s > bestScore) {
        bestScore = s;
        category = 'Anti-Bouclier';
        targetEnemies = shieldEnemies.slice(0, 3).map((e) => e.displayName);
        reason = `Brise les boucliers générés par les builds de ${targetEnemies.join(', ')}.`;
      }
    }

    // Bonus léger si le joueur a déjà assez d'or en poche pour l'acheter dès son prochain back
    const affordableNow = currentGold >= item.gold.total;
    if (bestScore > 0) {
      if (affordableNow) bestScore += 6;
      const priority: LiveCounterSuggestion['priority'] =
        bestScore >= 86 ? 'Urgent' : bestScore >= 72 ? 'Recommandé' : 'Situationnel';

      scoredSuggestions.push({
        item,
        category,
        priority,
        score: bestScore,
        affordableNow,
        isComponent,
        targetEnemies,
        reason,
      });
    }
  }

  // Trier par score décroissant et garder les 6 suggestions les plus pertinentes (sans doublons)
  const suggestions = scoredSuggestions
    .sort((a, b) => b.score - a.score || a.item.gold.total - b.item.gold.total)
    .slice(0, 6);

  return {
    enemyAnalyses,
    suggestions,
    teamPhysicalThreatPct,
    teamMagicThreatPct,
    totalEnemyBonusArmor,
    totalEnemyBonusMr,
    totalEnemyBonusHp,
    healThreatCount: healEnemies.length,
    critThreatCount: critEnemies.length,
    tankThreatCount: tankEnemies.length,
    shieldThreatCount: shieldEnemies.length,
    playerBuildStyle,
    itemsPurchasedCount,
  };
}
