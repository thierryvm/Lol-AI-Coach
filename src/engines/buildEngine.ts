import { classifyChampionProfile, computeStatAtLevel } from './championEngine.ts';
import type {
  BuildComparisonMetrics,
  BuildRecommendation,
  ChampionSummary,
  EnemyThreatSummary,
  GameModeContext,
  GameScenario,
  ItemData,
  PlayerTendencies,
  RecommendedItem,
  Role,
  RuneSlotItem,
  RuneTree,
} from './types.ts';

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

const HYPERCARRY_AS_IDS = new Set([
  'Jinx',
  'KogMaw',
  'Vayne',
  'Twitch',
  'Ashe',
  'Aphelios',
  'Zeri',
  'Sivir',
  'Xayah',
  'Kaisa',
  'Tristana',
  'Kalista',
  'Draven',
  'Yunara',
]);

const CASTER_POKE_CARRY_IDS = new Set([
  'Jhin',
  'Ezreal',
  'Varus',
  'MissFortune',
  'Caitlyn',
  'Smolder',
  'Corki',
  'Ziggs',
  'Seraphine',
  'Lux',
  'Karthus',
]);

const DIVE_ENGAGE_ALLY_IDS = new Set([
  'Samira',
  'Nilah',
  'Yasuo',
  'Yone',
  'Irelia',
  'Lucian',
  'Leona',
  'Nautilus',
  'Thresh',
  'Rell',
  'Alistar',
  'Blitzcrank',
  'Pyke',
  'TahmKench',
]);

type DuoArchetype = 'HYPERCARRY_AS' | 'CASTER_POKE' | 'DIVE_ENGAGE' | 'ENCHANTER_PEEL' | 'NONE';

function classifyDuoPartner(duo?: ChampionSummary | null): DuoArchetype {
  if (!duo) return 'NONE';
  if (HYPERCARRY_AS_IDS.has(duo.id)) return 'HYPERCARRY_AS';
  if (CASTER_POKE_CARRY_IDS.has(duo.id) || duo.tags.includes('Mage')) return 'CASTER_POKE';
  if (DIVE_ENGAGE_ALLY_IDS.has(duo.id) || duo.tags.includes('Fighter') || duo.tags.includes('Assassin')) {
    return 'DIVE_ENGAGE';
  }
  if (duo.tags.includes('Support')) return 'ENCHANTER_PEEL';
  if (duo.tags.includes('Marksman')) return 'HYPERCARRY_AS';
  return 'NONE';
}

/**
 * Agrège le profil de menace global des champions adverses sélectionnés.
 */
export function analyzeEnemyThreats(enemies: ChampionSummary[]): EnemyThreatSummary {
  if (enemies.length === 0) {
    return {
      physicalShare: 50,
      magicShare: 50,
      tankCount: 0,
      highHealCount: 0,
      burstThreatCount: 0,
      ccThreatCount: 0,
      averageRange: 300,
      profiles: [],
    };
  }

  const profiles = enemies.map(classifyChampionProfile);
  const totalPhysical = profiles.reduce((acc, p) => acc + p.physicalScore, 0);
  const totalMagic = profiles.reduce((acc, p) => acc + p.magicScore, 0);
  const denom = Math.max(1, totalPhysical + totalMagic);

  return {
    physicalShare: Math.round((totalPhysical / denom) * 100),
    magicShare: Math.round((totalMagic / denom) * 100),
    tankCount: profiles.filter((p) => p.tankinessScore >= 68).length,
    highHealCount: profiles.filter((p) => p.sustainScore >= 70).length,
    burstThreatCount: profiles.filter((p) => p.burstScore >= 75).length,
    ccThreatCount: profiles.filter((p) => p.ccScore >= 70).length,
    averageRange: Math.round(
      enemies.reduce((acc, e) => acc + (e.stats.attackrange || 150), 0) / enemies.length,
    ),
    profiles,
  };
}

/**
 * Détermine l'orientation offensive naturelle du champion du joueur
 * pour filtrer les objets pertinents dans Data Dragon.
 */
function inferPlayerBuildStyle(
  playerChamp: ChampionSummary,
  role: Role,
): 'AD_CRIT' | 'AD_BRUISER' | 'AD_LETHALITY' | 'AP_MAGE' | 'TANK' | 'ENCHANTER' {
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
  return 'AD_BRUISER';
}

function selectRecommendedBoots(
  bootsPool: ItemData[],
  style: ReturnType<typeof inferPlayerBuildStyle>,
  threats: EnemyThreatSummary,
): RecommendedItem {
  const scored = bootsPool.map((item) => {
    let score = 40;
    const reasons: string[] = [];
    const nameLower = item.name.toLowerCase();
    const descLower = stripHtml(item.description).toLowerCase();

    const isPlated = nameLower.includes('acier') || nameLower.includes('plated') || getStat(item, 'FlatArmorMod') > 0;
    const isMercs = nameLower.includes('mercure') || nameLower.includes('mercury') || getStat(item, 'FlatSpellBlockMod') > 0;
    const isSorc = nameLower.includes('sorcier') || nameLower.includes('sorcerer') || descLower.includes('pénétration magique');
    const isZerkers = nameLower.includes('berzerker') || nameLower.includes('berserker') || getStat(item, 'PercentAttackSpeedMod') > 0;
    const isLucidity = nameLower.includes('lucidit') || nameLower.includes('ionian') || descLower.includes('accélération de compétence');
    const isSwiftness = nameLower.includes('célérit') || nameLower.includes('swiftness');

    if (isPlated && threats.physicalShare >= 60) {
      score += 42;
      reasons.push(`${threats.physicalShare}% de menace physique adverse : la réduction des attaques de base rentabilise l'armure.`);
    }
    if (isMercs && (threats.ccThreatCount >= 2 || threats.magicShare >= 58)) {
      score += 44;
      reasons.push(`${threats.ccThreatCount} sources de contrôle majeur et ${threats.magicShare}% de menace magique.`);
    }
    if (isZerkers && style === 'AD_CRIT') {
      score += 36;
      reasons.push('Maximise le DPS continu et le kiting pour un carry AD.');
    }
    if (isSorc && style === 'AP_MAGE' && threats.tankCount <= 1) {
      score += 38;
      reasons.push('Pénétration magique flat très efficace contre une composition peu résistante.');
    }
    if (isLucidity && (style === 'AP_MAGE' || style === 'ENCHANTER' || style === 'AD_LETHALITY')) {
      score += 28;
      reasons.push('Accélère les délais de récupération des sorts et des sorts d’invocateur.');
    }
    if (isSwiftness && (threats.ccThreatCount <= 1 || style === 'TANK')) {
      score += 24;
      reasons.push('Mobilité constante et résistance aux ralentissements pour le placement.');
    }

    if (reasons.length === 0) {
      reasons.push('Option équilibrée compatible avec votre archétype et la mobilité attendue.');
    }

    return {
      item,
      slotType: 'Bottes' as const,
      priority: 1,
      score,
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

/**
 * Moteur déterministe d'optimisation de build & runes.
 * Utilise exclusivement les objets uniques du patch Data Dragon chargé et
 * intègre la synergie avec le partenaire de duo (ex. Support + ADC).
 */
export function computeBuildRecommendation(params: {
  patchVersion: string;
  gameMode?: GameModeContext;
  scenario?: GameScenario;
  playerChampion: ChampionSummary;
  duoPartner?: ChampionSummary | null;
  role: Role;
  enemies: ChampionSummary[];
  items: ItemData[];
  runeTrees: RuneTree[];
  tendencies?: PlayerTendencies;
}): BuildRecommendation {
  const {
    patchVersion,
    gameMode = 'CLASSIC',
    scenario = 'balanced',
    playerChampion,
    duoPartner = null,
    role,
    enemies,
    items,
    runeTrees,
    tendencies,
  } = params;
  const threats = analyzeEnemyThreats(enemies);
  const style = inferPlayerBuildStyle(playerChampion, role);
  const duoArchetype = classifyDuoPartner(duoPartner);

  const mapKey = gameMode === 'ARAM' ? '12' : '11';

  // Filtrer les objets standards achetables sur la carte active (11 = Faille, 12 = Abîme hurlant ARAM)
  const srItemsRaw = items.filter(
    (it) =>
      Number(it.id) < 100000 &&
      it.gold.purchasable &&
      (!it.maps || it.maps[mapKey] !== false),
  );

  // Déduplication stricte par nom d'objet pour éviter les variantes mode spécial
  const uniqueMap = new Map<string, ItemData>();
  for (const it of srItemsRaw) {
    const k = it.name.trim().toLowerCase();
    const existing = uniqueMap.get(k);
    if (!existing || Number(it.id) < Number(existing.id)) {
      uniqueMap.set(k, it);
    }
  }
  const srItems = Array.from(uniqueMap.values());

  const bootsPool = srItems.filter(
    (it) => it.tags.includes('Boots') && it.gold.total >= 800 && it.gold.total <= 1500,
  );
  const completedPool = srItems.filter(
    (it) =>
      !it.tags.includes('Boots') &&
      !it.tags.includes('Consumable') &&
      !it.tags.includes('Trinket') &&
      it.gold.total >= 2100 &&
      (!it.into || it.into.length === 0),
  );

  const boots =
    bootsPool.length > 0
      ? selectRecommendedBoots(bootsPool, style, threats)
      : {
          item: srItems[0],
          slotType: 'Bottes' as const,
          priority: 1,
          score: 50,
          reasons: ['Bottes standards adaptées au patch actif.'],
        };

  // Scoring déterministe des objets complets (clés exactes Data Dragon 16.x)
  const HP_SCALING_TANKS = new Set([
    'TahmKench',
    'DrMundo',
    'Sion',
    'Chogath',
    'Sejuani',
    'Shen',
    'Skarner',
    'Zac',
    'Maokai',
    'Ornn',
    'Volibear',
  ]);
  const PEEL_SUPPORT_TANKS = new Set(['Braum', 'Thresh', 'Alistar', 'Rell', 'Leona', 'Nautilus', 'Taric']);
  const isHpScaler = HP_SCALING_TANKS.has(playerChampion.id);
  const isPeelTank = PEEL_SUPPORT_TANKS.has(playerChampion.id);

  const scoredItems: RecommendedItem[] = completedPool.map((item) => {
    let score = 0;
    const reasons: string[] = [];

    const ad = getStat(item, 'FlatPhysicalDamageMod');
    const ap = getStat(item, 'FlatMagicDamageMod');
    const hp = getStat(item, 'FlatHPPoolMod');
    const armor = getStat(item, 'FlatArmorMod');
    const mr = getStat(item, 'FlatSpellBlockMod');
    const crit = getStat(item, 'FlatCritChanceMod');
    const as = getStat(item, 'PercentAttackSpeedMod');
    const mana = getStat(item, 'FlatMPPoolMod');

    const isAntiHeal = hasText(item, ['hémorragie', 'grievous wounds', 'soins reçus', 'blessures graves', 'épineuse', 'thornmail']);
    const isArmorPen = hasText(item, ["pénétration d'armure", 'armor penetration', 'létalité', 'lethality']);
    const isMagicPen = hasText(item, ['pénétration magique', 'magic penetration']);
    const isAntiTankHp = hasText(item, ['pv max', 'max health', 'tourment', 'liandry', 'roi déchu', 'blade of the ruined king']);
    const isDefensiveShield = hasText(item, ['stase', 'stasis', 'bouclier', 'lifeline', 'lien vital', 'voile', 'spell shield', 'solari', 'kaénique']);

    // Objets spécifiques Saison 16 Tank & Support
    const isHeartsteel = item.id === '3084' || hasText(item, ['cœuracier', 'heartsteel']);
    const isUnendingDespair = item.id === '2502' || hasText(item, ['désespoir infini', 'unending despair']);
    const isProtoplasm = item.id === '2525' || hasText(item, ['harnais protoplasmique']);
    const isWarmog = item.id === '3083' || hasText(item, ['warmog']);
    const isSpiritVisage = item.id === '3065' || hasText(item, ['visage spirituel', 'spirit visage']);
    const isJakSho = item.id === '6665' || hasText(item, ["jak'sho"]);
    const isSunfireOrHollow = item.id === '3068' || item.id === '6664';
    const isRanduin = item.id === '3143' || hasText(item, ['randuin']);
    const isRookern = item.id === '2504' || hasText(item, ['rookern']);
    const isDuskAndDawn = item.id === '2510' || hasText(item, ['aube et crépuscule', 'dusk and dawn']);

    const isKnightsVow = item.id === '3109' || hasText(item, ['vœu du chevalier', "knight's vow"]);
    const isArdent = hasText(item, ['encensoir ardent', 'ardent censer']);
    const isStaffOfWater = hasText(item, ['bâton des flots', 'staff of flowing water']);
    const isZeke = item.id === '3050' || hasText(item, ['convergence de zeke', "zeke's convergence"]);
    const isMikael = item.id === '3222' || hasText(item, ['bénédiction de mikael', "mikael's blessing"]);
    const isRedemption = item.id === '3107' || hasText(item, ['rédemption', 'redemption']);
    const isSolari = item.id === '3190' || hasText(item, ['iron solari', 'locket']);

    const ONHIT_TANK_BRUISERS = new Set(['TahmKench', 'Volibear', 'Shen', 'Chogath', 'Jax', 'Kayle', 'Gwen', 'Diana', 'Teemo', 'Warwick']);
    const isOnHitHybridChamp = ONHIT_TANK_BRUISERS.has(playerChampion.id);

    // Compatibilité archétype joueur
    if (style === 'AD_CRIT') {
      if (ad > 0) score += 28;
      if (crit > 0) score += 32;
      if (as > 0) score += 24;
      if (ap > 0) score -= 80;
    } else if (style === 'AD_LETHALITY') {
      if (ad > 0) score += 34;
      if (isArmorPen) score += 30;
      if (ap > 0 || crit > 0.2) score -= 50;
    } else if (style === 'AD_BRUISER') {
      if (ad > 0 && hp > 0) score += 45;
      else if (ad > 0) score += 24;
      if (ap > 0) score -= 75;
    } else if (style === 'AP_MAGE') {
      if (ap > 0) score += 42;
      if (mana > 0 && playerChampion.partype === 'Mana') score += 12;
      if (ad > 0) score -= 80;

      const isDotOrOnhitAp = new Set([
        'Teemo',
        'Brand',
        'Zyra',
        'Malzahar',
        'Lillia',
        'Mordekaiser',
        'Heimerdinger',
        'Kayle',
        'Azir',
      ]).has(playerChampion.id);

      const isLiandry = item.id === '6653' || hasText(item, ['tourment de liandry', 'liandry']);
      const isNashor = item.id === '3115' || hasText(item, ['dent de nashor', "nashor's tooth"]);
      const isMalignance = item.id === '3118' || hasText(item, ['malfaisance', 'malignance']);
      const isBlackfire = item.id === '2503' || hasText(item, ['torche noire', 'blackfire']);
      const isShadowflame = item.id === '4645' || hasText(item, ['flamme-ombre', 'shadowflame']);
      const isZhonya = item.id === '3157' || hasText(item, ['sablier de zhonya', 'zhonya']);
      const isRoa = item.id === '6657' || hasText(item, ['bâton séculaire', 'rod of ages']);

      if (isDotOrOnhitAp) {
        if (isLiandry) {
          score += 48;
          reasons.push(`Objet cœur sur ${playerChampion.name} : brûlure en % PV max sur chaque sort/champignon.`);
        }
        if (playerChampion.id === 'Teemo' && isNashor) {
          score += 42;
          reasons.push('Vitesse d’attaque et dégâts à l’impact maximisant le E (Tir toxique) de Teemo.');
        }
        if (isMalignance) {
          score += playerChampion.id === 'Teemo' ? 38 : 28;
          reasons.push('Accélère votre R (Piège nocif) et crée des zones de réduction de RM.');
        }
        if (isBlackfire) {
          score += 32;
          reasons.push('Double synergie de brûlure avec Liandry et mana confortable en escarmouche.');
        }
        if (isShadowflame) {
          score += 24;
          reasons.push('Amplifie l’exécution magique sous 40% PV.');
        }
        if (isZhonya && threats.burstThreatCount >= 1) {
          score += 24;
          reasons.push('Stase indispensable contre le burst adverse.');
        }
        if (isRoa && role === 'SUPPORT') {
          score -= 35;
        }
      }
    } else if (style === 'TANK') {
      if (hp >= 600) score += 34;
      else if (hp >= 300) score += 24;
      else if (hp > 0) score += 12;

      if (armor >= 40 || mr >= 40) score += 24;
      else if (armor > 0 || mr > 0) score += 12;

      if (isDuskAndDawn && isOnHitHybridChamp) {
        score += scenario === 'ahead' ? 54 : 30;
        reasons.push(
          `Lame enchantée + double application des effets à l’impact sur ${playerChampion.name} (PV, Hâte, AS et soin en duel).`,
        );
      } else if (ad > 45 || ap > 70) {
        score -= 60;
      }

      // Noyau Saison 16 pour les tanks à ratio PV (Tahm Kench, Mundo, Sion, etc.)
      if (isHpScaler) {
        if (isHeartsteel) {
          score += gameMode === 'ARAM' ? 64 : 60;
          reasons.push(`Objet cœur Saison 16 pour ${playerChampion.name} : les PV cumulables augmentent directement vos dégâts passifs, la portée/soin du A et le bouclier du E.`);
        }
        if (isUnendingDespair) {
          score += 36;
          reasons.push('Régénération continue en mêlée et armure/PV idéales pour tenir les teamfights prolongés.');
        }
        if (isProtoplasm) {
          score += 30;
          reasons.push('Gros apport de PV bruts S16 avec sursaut de survie à bas PV.');
        }
        if (isSpiritVisage && (threats.magicShare >= 25 || playerChampion.id === 'TahmKench')) {
          score += 28;
          reasons.push(`Amplifie le soin du A (Langue) et le bouclier du E de ${playerChampion.name} tout en apportant 50 RM.`);
        }
        if (isWarmog) {
          score += gameMode === 'ARAM' ? 40 : 24;
          reasons.push('Permet de régénérer entre deux escarmouches et de maximiser les ratios PV.');
        }
        if (isJakSho) {
          score += 26;
          reasons.push('Double résistance (Armure + RM) qui rentabilise votre énorme réserve de PV en combat long.');
        }
        if (isSunfireOrHollow) {
          score += role === 'TOP' || role === 'JUNGLE' ? 28 : 14;
        }
      } else if (isPeelTank && role === 'SUPPORT' && item.gold.total <= 2500) {
        score += 22;
      }
    } else if (style === 'ENCHANTER') {
      if (item.tags.includes('ManaRegen') || hasText(item, ['soins et boucliers', 'heal and shield'])) {
        score += 48;
      }
      if (ap > 0) score += 18;
      if (ad > 0) score -= 80;
    }

    // Bonus de synergie avec le partenaire de Duo (Enchanteur ou Peel Tank pur ; pour Tahm Kench reste en option situationnelle)
    const duoWeight = isHpScaler ? 0.55 : 1;
    if (duoPartner && (role === 'SUPPORT' || style === 'TANK' || style === 'ENCHANTER')) {
      if (duoArchetype === 'HYPERCARRY_AS') {
        if (isKnightsVow) {
          score += Math.round(30 * duoWeight);
          reasons.push(`Protège directement votre hypercarry ${duoPartner.name} en transférant une partie des dégâts subis.`);
        }
        if (isArdent && style === 'ENCHANTER') {
          score += 34;
          reasons.push(`Synergie vitesse d'attaque maximale avec ${duoPartner.name}.`);
        }
        if (isSolari) {
          score += Math.round(24 * duoWeight);
          reasons.push(`Bouclier d'équipe utile pour garder ${duoPartner.name} en vie face au burst.`);
        }
      } else if (duoArchetype === 'CASTER_POKE') {
        if (isStaffOfWater && style === 'ENCHANTER') {
          score += 30;
          reasons.push(`Offre puissance et accélération de compétence à ${duoPartner.name}.`);
        }
        if (isRedemption) {
          score += Math.round(26 * duoWeight);
          reasons.push(`Renforce les phases de siège et de poke aux côtés de ${duoPartner.name}.`);
        }
      } else if (duoArchetype === 'DIVE_ENGAGE') {
        if (isZeke || isKnightsVow) {
          score += Math.round(28 * duoWeight);
          reasons.push(`Accompagne l'agression de ${duoPartner.name} en combat rapproché.`);
        }
      }

      if (threats.ccThreatCount >= 2 && isMikael && style === 'ENCHANTER') {
        score += 30;
        reasons.push(`Purge les contrôles adverses sur ${duoPartner.name}.`);
      }
    } else if (duoPartner && role === 'ADC' && duoArchetype === 'DIVE_ENGAGE') {
      if (hasText(item, ['collecteur', 'collector', "lame d'infini", 'infinity edge', 'tueur de krakens', 'kraken'])) {
        score += 14;
        reasons.push(`Permet de suivre instantanément les engagements de ${duoPartner.name}.`);
      }
    }

    // Adaptation aux menaces adverses
    if (threats.tankCount >= 2 && (isArmorPen || isMagicPen || isAntiTankHp)) {
      score += 30;
      reasons.push(`Efficace contre ${threats.tankCount} champions robustes/tanks adverses.`);
    }

    if (threats.highHealCount >= 1 && isAntiHeal) {
      score += 24 + threats.highHealCount * 5;
      reasons.push(`Réduit la régénération de ${threats.highHealCount} source(s) de soin majeure(s).`);
    }

    if (threats.physicalShare >= 60 && armor > 0) {
      score += 22;
      if (isRanduin && enemies.some((e) => e.tags.includes('Marksman'))) {
        score += 12;
      }
      reasons.push(`Répond à une composition à ${threats.physicalShare}% de dégâts physiques.`);
    }

    if (threats.magicShare >= 50 && mr > 0) {
      score += 24;
      if (isRookern && threats.magicShare >= 60) score += 10;
      reasons.push(`Protège contre ${threats.magicShare}% de dégâts magiques adverses.`);
    }

    if (threats.burstThreatCount >= 2 && (isDefensiveShield || hp >= 400)) {
      score += 16;
      reasons.push(`Sécurise la survie face à ${threats.burstThreatCount} menaces de burst.`);
    }

    // Adaptation selon l'état de la partie (En difficulté / En avance / Équilibré)
    if (scenario === 'behind') {
      if (item.gold.total <= 2650) {
        score += 22;
        reasons.push(`Pic économique rapide (${item.gold.total} po) idéal pour revenir dans la partie.`);
      } else if (item.gold.total >= 3200) {
        score -= 16;
      }
      if (armor >= 40 || mr >= 40 || isDefensiveShield || isKnightsVow || isSolari) {
        score += 18;
      }
      if (isHeartsteel && playerChampion.id === 'TahmKench') {
        score -= 18; // En retard, on privilégie d'abord résistances/utilitaire rapide plutôt que stacker des PV bruts tardifs
      }
    } else if (scenario === 'ahead') {
      if (isHeartsteel || ad >= 60 || ap >= 80 || crit > 0) {
        score += 14;
      }
    }

    // Prise en compte des performances passées du joueur (sans spammer la même phrase sur tous les objets)
    if (tendencies && tendencies.avgDeaths >= 6.5 && (hp >= 350 || armor >= 40 || mr >= 40 || isDefensiveShield)) {
      score += 8;
      if (reasons.length === 0) {
        reasons.push(`Option défensive recommandée pour sécuriser votre survie (${tendencies.avgDeaths.toFixed(1)} morts/partie en moyenne).`);
      }
    }

    if (reasons.length === 0 && score > 25) {
      reasons.push(`Optimise les statistiques clés de ${playerChampion.name} selon le patch ${patchVersion}.`);
    }

    return {
      item,
      slotType: 'Coeur' as const,
      priority: 0,
      score,
      reasons,
    };
  });

  scoredItems.sort((a, b) => b.score - a.score);

  // Garantir zéro doublon sur les objets recommandés
  const seenNames = new Set<string>([boots.item.name.trim().toLowerCase()]);
  const uniqueTop: RecommendedItem[] = [];
  for (const cand of scoredItems) {
    if (cand.score <= 10) continue;
    const key = cand.item.name.trim().toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    uniqueTop.push(cand);
    if (uniqueTop.length >= 6) break;
  }

  const coreItems = uniqueTop.slice(0, 3).map((rec, idx) => ({
    ...rec,
    slotType: 'Coeur' as const,
    priority: idx + 1,
  }));

  const situationalItems = uniqueTop.slice(3, 6).map((rec, idx) => ({
    ...rec,
    slotType: 'Situationnel' as const,
    priority: idx + 4,
  }));

  const supportQuestHint =
    role === 'SUPPORT' && gameMode !== 'ARAM'
      ? style === 'TANK'
        ? 'Objet de quête Support S16 : Atlas mondial → Opposition céleste (réduction de burst après CC) ou Traîneau du solstice (mobilité avec votre Duo).'
        : style === 'ENCHANTER'
          ? 'Objet de quête Support S16 : Atlas mondial → Tisseur de rêves (boucliers/soins) ou Traîneau du solstice.'
          : 'Objet de quête Support S16 : Atlas mondial → Piqûre de sang ou Pique dimensionnelle de Zaz’Zak.'
      : null;

  // Sélection complète des runes depuis runesReforged.json (4 emplacements principaux + 2 secondaires + 3 fragments)
  const runes = selectRunes(runeTrees, style, threats, playerChampion, role);

  // Synergie Duo
  const duoSynergyNotes: string[] = [];
  if (duoPartner) {
    if (role === 'SUPPORT') {
      if (duoArchetype === 'HYPERCARRY_AS') {
        duoSynergyNotes.push(
          `Duo avec ${duoPartner.name} (Hypercarry) : priorisez le peel (dévoration R défensive) et l’absorption du burst plutôt que de chasser seul.`,
        );
      } else if (duoArchetype === 'CASTER_POKE') {
        duoSynergyNotes.push(
          `Duo avec ${duoPartner.name} (Poke / Caster) : jouez le contrôle des buissons et punissez sur les fenêtres de cooldown adverses.`,
        );
      } else if (duoArchetype === 'DIVE_ENGAGE') {
        duoSynergyNotes.push(
          `Duo avec ${duoPartner.name} (Agressif / All-in) : synchronisez vos contrôles dès le niveau 2 ou 3 pour forcer les sorts d'invocateur.`,
        );
      } else {
        duoSynergyNotes.push(
          `Duo avec ${duoPartner.name} : adaptez votre positionnement selon sa portée et ses pics à 1 objet.`,
        );
      }
    } else {
      duoSynergyNotes.push(
        `Allié clé sélectionné : ${duoPartner.name} (${duoPartner.tags.join(' / ')}). Pensez à coordonner vos pics de niveau 6 et rotations.`,
      );
    }
  }

  // Conditions de victoire de lane / mode
  const laneWinConditions: string[] = [];
  if (gameMode === 'ARAM') {
    laneWinConditions.push(
      `Mode ARAM (Abîme hurlant) : combat permanent en 5v5 — privilégiez les objets à impact d'équipe, la régénération de mana et les boucliers de zone.`,
    );
    if (threats.highHealCount >= 1) {
      laneWinConditions.push(
        `Anti-soin très rentable en ARAM dès le 2e objet face à ${threats.highHealCount} source(s) de soin adverse(s) (les soins sont réduits sur alliés mais décisifs sur les tanks/enchanteurs).`,
      );
    }
    if (threats.burstThreatCount >= 2) {
      laneWinConditions.push(
        `Surveillez la Boule de neige (Marquage) adverse : gardez un outil défensif ou de peel pour protéger vos carries en ligne droite.`,
      );
    }
  } else {
    if (threats.highHealCount >= 1) {
      laneWinConditions.push(
        `Investir tôt dans un composant d'anti-soin (800 po) avant les gros regroupements d'équipe.`,
      );
    }
    if (threats.burstThreatCount >= 2) {
      laneWinConditions.push(
        `Jouer autour de la vision et conserver un outil défensif (Stase/Bouclier/Saut Éclair) pour le teamfight.`,
      );
    }
    if (threats.tankCount >= 2) {
      laneWinConditions.push(
        `Prévoir une pénétration en pourcentage dès le 3e objet complet pour ne pas perdre le DPS en mid-game.`,
      );
    }
    if (tendencies && tendencies.gamesAnalyzed >= 3) {
      const champHist = tendencies.championStats?.find(
        (c) =>
          c.championName.toLowerCase() === playerChampion.id.toLowerCase() ||
          c.championName.toLowerCase() === playerChampion.name.toLowerCase(),
      );
      if (champHist && champHist.games >= 2) {
        laneWinConditions.push(
          `Historique ${playerChampion.name} (${champHist.games} parties · ${champHist.winRate}% WR · ${champHist.avgDeaths} morts/m) : ${
            champHist.avgDeaths >= 6.0
              ? 'build orienté survie et tempo sécurisé pour limiter les morts coûteuses.'
              : 'bonne maîtrise confirmée — conservez ce rythme pour prendre l’initiative.'
          }`,
        );
      } else if (tendencies.avgDeaths >= 6.5) {
        laneWinConditions.push(
          `Adaptation carrière (${tendencies.gamesAnalyzed} matchs, ${tendencies.avgDeaths} morts/m) : priorité aux objets défensifs/boucliers pour stabiliser votre mid-game.`,
        );
      }
      if (tendencies.preObjectiveDeathRate >= 0.25) {
        laneWinConditions.push(
          `Rappel proactif : ${Math.round(tendencies.preObjectiveDeathRate * 100)}% de vos morts historiques précèdent un objectif — reculez 55s avant Dragon/Baron.`,
        );
      }
      if (tendencies.avgCsPerMin < 6.5 && role !== 'SUPPORT') {
        laneWinConditions.push(
          `Objectif personnel (${tendencies.gamesAnalyzed} parties) : passer de ${tendencies.avgCsPerMin} à 7.0+ CS/min pour accélérer votre 2e objet de 2 minutes.`,
        );
      }
    }
    if (laneWinConditions.length === 0) {
      laneWinConditions.push(
        `Exploiter vos pics de puissance à 1 et 2 objets pour contrôler la rivière avant chaque dragon.`,
      );
    }
  }

  if (scenario === 'behind') {
    laneWinConditions.unshift(
      `Plan anti-retard activé : privilégiez les composants défensifs rapides, gelez/récupérez les vagues sous tour et jouez en peel autour de votre allié le plus fort.`,
    );
  } else if (scenario === 'ahead') {
    laneWinConditions.unshift(
      `Plan Snowball activé : convertissez votre avance en pression de vision profonde et forcez les objectifs 30s avant leur apparition.`,
    );
  }

  const comparisonAtLevels = buildComparisonCurve(playerChampion, boots, coreItems);

  return {
    patchVersion,
    gameMode,
    provenance: [
      'Data Dragon Officiel',
      'Calcul déterministe',
      ...(tendencies ? (['Riot API Match-V5'] as const) : []),
    ],
    confidence: enemies.length >= 3 ? 'Élevée' : enemies.length >= 1 ? 'Modérée' : 'Estimée',
    playerChampion,
    duoPartner,
    role,
    supportQuestHint,
    threatSummary: threats,
    boots,
    coreItems,
    situationalItems,
    runes,
    duoSynergyNotes,
    laneWinConditions,
    comparisonAtLevels,
  };
}

function pickRuneFromSlot(
  tree: RuneTree | null,
  slotIdx: number,
  preferredIds: number[],
): RuneSlotItem | null {
  const runes = tree?.slots?.[slotIdx]?.runes || [];
  if (runes.length === 0) return null;
  for (const id of preferredIds) {
    const found = runes.find((r) => r.id === id);
    if (found) return found;
  }
  return runes[0];
}

function selectRunes(
  runeTrees: RuneTree[],
  style: ReturnType<typeof inferPlayerBuildStyle>,
  threats: EnemyThreatSummary,
  playerChamp: ChampionSummary,
  role: Role,
): BuildRecommendation['runes'] {
  const findTree = (keyHint: string): RuneTree | null =>
    runeTrees.find((t) => t.key.toLowerCase().includes(keyHint.toLowerCase())) || runeTrees[0] || null;

  let primaryKey = 'Precision';
  let secondaryKey = 'Resolve';
  let keystonePref: number[] = [];
  let p1Pref: number[] = [];
  let p2Pref: number[] = [];
  let p3Pref: number[] = [];
  let secPref: number[] = [];

  if (playerChamp.id === 'TahmKench') {
    primaryKey = 'Resolve';
    secondaryKey = 'Inspiration';
    // Gardien contre poke lourd en botlane, Poigne de l'immortel sinon
    keystonePref =
      role === 'SUPPORT' && threats.averageRange >= 440 && threats.burstThreatCount >= 2
        ? [8465, 8437]
        : [8437, 8465];
    p1Pref = [8401, 8446]; // Coup de bouclier (Peau grise E) ou Démolition
    p2Pref = threats.magicShare >= 48 || threats.averageRange >= 420 ? [8444, 8473] : [8473, 8444]; // Second souffle vs poke / Plaque d'os vs all-in
    p3Pref = [8451, 8453]; // Surcroissance (PV max S16) / Revitalisation
    secPref = [8345, 8410]; // Livraison de biscuits + Vitesse d'approche (synergie Q)
  } else if (playerChamp.id === 'Teemo') {
    // Page S16 optimale Teemo (Top / Mid / Support) : Moisson noire + Chasseur ultime + Précision
    primaryKey = 'Domination';
    secondaryKey = 'Precision';
    keystonePref = [8128, 8112]; // Moisson noire (synergie R Piège nocif / E)
    p1Pref = [8126, 8139]; // Coup bas (dégâts bruts sur aveuglement A & champignon R)
    p2Pref = [8140, 8137]; // Souvenirs épouvantables
    p3Pref = [8106, 8135]; // Chasseur ultime (délai du R réduit)
    secPref = [9104, 8017, 8014]; // Légende : alacrité + Abattage
  } else if (style === 'TANK') {
    primaryKey = 'Resolve';
    secondaryKey = 'Inspiration';
    keystonePref = role === 'SUPPORT' ? [8439, 8465, 8437] : [8437, 8439];
    p1Pref = role === 'SUPPORT' ? [8463, 8401, 8446] : [8446, 8401];
    p2Pref = threats.magicShare >= 50 ? [8444, 8429] : [8473, 8429];
    p3Pref = [8451, 8242, 8453];
    secPref = [8345, 8347, 8410];
  } else if (style === 'ENCHANTER') {
    primaryKey = 'Sorcery';
    secondaryKey = 'Resolve';
    keystonePref = [8214, 8229];
    p1Pref = [8226, 8224];
    p2Pref = [8210, 8234];
    p3Pref = [8237, 8236];
    secPref = [8463, 8453, 8473];
  } else if (style === 'AP_MAGE') {
    primaryKey = 'Sorcery';
    secondaryKey = threats.burstThreatCount >= 2 ? 'Inspiration' : 'Domination';
    keystonePref = [8229, 8214, 8230];
    p1Pref = [8226, 8224];
    p2Pref = [8210, 8233];
    p3Pref = [8237, 8236];
    secPref =
      secondaryKey === 'Inspiration' ? [8304, 8345, 8347] : [8126, 8139, 8106];
  } else if (style === 'AD_LETHALITY') {
    primaryKey = 'Domination';
    secondaryKey = 'Precision';
    keystonePref = [8112, 8128, 9923];
    p1Pref = [8143, 8126];
    p2Pref = [8140, 8137];
    p3Pref = [8106, 8135];
    secPref = [9111, 8014, 8017];
  } else if (style === 'AD_BRUISER') {
    primaryKey = 'Precision';
    secondaryKey = 'Resolve';
    keystonePref = [8010, 8005];
    p1Pref = [9111, 8009];
    p2Pref = threats.ccThreatCount >= 2 ? [9105, 9104] : [9104, 9105];
    p3Pref = [8299, 8014];
    secPref = [8473, 8451, 8444];
  } else {
    // AD_CRIT
    primaryKey = 'Precision';
    secondaryKey = threats.burstThreatCount >= 2 ? 'Resolve' : 'Inspiration';
    keystonePref = [8008, 8005, 8021];
    p1Pref = [9101, 9111, 8009];
    p2Pref = [9103, 9104];
    p3Pref = threats.tankCount >= 2 ? [8017, 8014] : [8014, 8017];
    secPref =
      secondaryKey === 'Resolve' ? [8473, 8451] : [8304, 8345];
  }

  const primaryTree = findTree(primaryKey);
  const secondaryTree = findTree(secondaryKey);

  const keystone = pickRuneFromSlot(primaryTree, 0, keystonePref);
  const primarySlots = [
    pickRuneFromSlot(primaryTree, 1, p1Pref),
    pickRuneFromSlot(primaryTree, 2, p2Pref),
    pickRuneFromSlot(primaryTree, 3, p3Pref),
  ].filter((r): r is RuneSlotItem => Boolean(r));

  // Sélectionne 2 runes mineures issues de 2 rangées différentes en respectant l'ordre de priorité de secPref
  const usedSecRows = new Set<number>();
  const secondaryCandidates: RuneSlotItem[] = [];
  for (const prefId of secPref) {
    if (secondaryCandidates.length >= 2) break;
    for (const sIdx of [1, 2, 3]) {
      if (usedSecRows.has(sIdx)) continue;
      const hit = secondaryTree?.slots?.[sIdx]?.runes?.find((r) => r.id === prefId);
      if (hit) {
        secondaryCandidates.push(hit);
        usedSecRows.add(sIdx);
        break;
      }
    }
  }
  while (secondaryCandidates.length < 2) {
    const fallbackRow = [1, 2, 3].find((idx) => !usedSecRows.has(idx));
    if (!fallbackRow) break;
    const candidate = secondaryTree?.slots?.[fallbackRow]?.runes?.[0];
    if (!candidate) break;
    secondaryCandidates.push(candidate);
    usedSecRows.add(fallbackRow);
  }
  const secondarySlots = secondaryCandidates.slice(0, 2);

  // Grille officielle 3x3 des fragments de statistiques
  const row1Opts = ['+9 Force adaptative', '+10% Vitesse d’attaque', '+8 Accélération de compétence'];
  const row2Opts = ['+9 Force adaptative', '+2% Vitesse de déplacement', '+10 à 180 PV (selon niveau)'];
  const row3Opts = ['+65 PV fixes', '+10% Ténacité & résist. ralentissements', '+10 à 180 PV (selon niveau)'];

  const row1Idx =
    playerChamp.id === 'TahmKench' ||
    playerChamp.id === 'Teemo' ||
    style === 'AD_CRIT' ||
    style === 'AD_BRUISER'
      ? 1
      : style === 'TANK' || style === 'ENCHANTER'
        ? 2
        : 0;
  const row2Idx = style === 'TANK' ? 2 : style === 'ENCHANTER' ? 1 : 0;
  const row3Idx =
    threats.ccThreatCount >= 3
      ? 1
      : playerChamp.id === 'Teemo'
        ? threats.burstThreatCount >= 3
          ? 0
          : 2
        : threats.physicalShare >= 60 || role === 'SUPPORT'
          ? 0
          : 2;

  const shardRows = [
    { rowLabel: 'Offense', selectedIndex: row1Idx, options: row1Opts },
    { rowLabel: 'Flex', selectedIndex: row2Idx, options: row2Opts },
    { rowLabel: 'Défense', selectedIndex: row3Idx, options: row3Opts },
  ];

  return {
    primaryTree,
    keystone,
    primarySlots,
    secondaryTree,
    secondarySlots,
    shardRows,
    shards: [row1Opts[row1Idx], row2Opts[row2Idx], row3Opts[row3Idx]],
    rationale: `Page ${primaryTree?.name ?? primaryKey} + ${secondaryTree?.name ?? secondaryKey} optimisée pour ${playerChamp.name} (${role}) face à ${threats.burstThreatCount} menace(s) de burst et ${threats.ccThreatCount} contrôle(s).`,
  };
}

function buildComparisonCurve(
  champ: ChampionSummary,
  boots: RecommendedItem,
  coreItems: RecommendedItem[],
): BuildComparisonMetrics[] {
  const levels = [6, 11, 16];
  const isHpScaler = ['TahmKench', 'DrMundo', 'Sion', 'Chogath', 'Sejuani', 'Shen', 'Zac'].includes(
    champ.id,
  );
  return levels.map((lvl, idx) => {
    const itemsActive = [boots, ...coreItems.slice(0, idx + 1)];
    const bonusHp = itemsActive.reduce((a, r) => a + getStat(r.item, 'FlatHPPoolMod'), 0);
    const bonusArmor = itemsActive.reduce((a, r) => a + getStat(r.item, 'FlatArmorMod'), 0);
    const bonusMr = itemsActive.reduce((a, r) => a + getStat(r.item, 'FlatSpellBlockMod'), 0);
    const bonusAd = itemsActive.reduce((a, r) => a + getStat(r.item, 'FlatPhysicalDamageMod'), 0);
    const bonusAp = itemsActive.reduce((a, r) => a + getStat(r.item, 'FlatMagicDamageMod'), 0);
    const bonusAs = itemsActive.reduce((a, r) => a + getStat(r.item, 'PercentAttackSpeedMod'), 0);
    const bonusCrit = itemsActive.reduce((a, r) => a + getStat(r.item, 'FlatCritChanceMod'), 0);
    const totalGold = itemsActive.reduce((a, r) => a + r.item.gold.total, 0);

    const hp = computeStatAtLevel(champ.stats.hp, champ.stats.hpperlevel, lvl) + bonusHp;
    const armor = computeStatAtLevel(champ.stats.armor, champ.stats.armorperlevel, lvl) + bonusArmor;
    const mr = computeStatAtLevel(champ.stats.spellblock, champ.stats.spellblockperlevel, lvl) + bonusMr;
    const ad = computeStatAtLevel(champ.stats.attackdamage, champ.stats.attackdamageperlevel, lvl) + bonusAd;
    const asGrowth = ((lvl - 1) * (0.7025 + 0.0175 * (lvl - 1))) / 100;
    const effAs = champ.stats.attackspeed * (1 + bonusAs + champ.stats.attackspeedperlevel * asGrowth);
    const hpPassiveBonus = isHpScaler ? bonusHp * 0.04 : 0;

    const offensiveIndex = Math.round(
      ad * effAs * (1 + bonusCrit * 0.75) + bonusAp * 1.1 + hpPassiveBonus,
    );

    return {
      level: lvl,
      physicalEhp: Math.round(hp * (1 + armor / 100)),
      magicEhp: Math.round(hp * (1 + mr / 100)),
      offensiveIndex,
      totalGold,
    };
  });
}
