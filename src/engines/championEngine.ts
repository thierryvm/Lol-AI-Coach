import type { ChampionDamageProfile, ChampionSummary } from './types.ts';

/**
 * Formule officielle de croissance des statistiques Riot Games (niveaux 1 à 18).
 * Calcule la valeur exacte d'une stat à un niveau donné sans approximation.
 */
export function computeStatAtLevel(base: number, perLevel: number, level: number): number {
  const clamped = Math.max(1, Math.min(18, level));
  if (clamped === 1) return base;
  return base + perLevel * (clamped - 1) * (0.7025 + 0.0175 * (clamped - 1));
}

/**
 * Calcule la vitesse d'attaque effective à un niveau donné (formule Riot AS).
 */
export function computeAttackSpeedAtLevel(
  baseAs: number,
  asPerLevelPercent: number,
  level: number,
  bonusAsPercent = 0,
): number {
  const clamped = Math.max(1, Math.min(18, level));
  const levelGrowth =
    clamped === 1 ? 0 : asPerLevelPercent * (clamped - 1) * (0.7025 + 0.0175 * (clamped - 1));
  return Number((baseAs * (1 + (levelGrowth + bonusAsPercent) / 100)).toFixed(3));
}

// Listes de référence déterministes pour affiner les profils hybrides, soins et CC
// au-delà des simples tags Data Dragon (Fighter, Mage, Assassin, Tank, Marksman, Support).
const HIGH_SUSTAIN_CHAMPIONS = new Set([
  'Aatrox',
  'Vladimir',
  'Soraka',
  'Warwick',
  'Briar',
  'DrMundo',
  'Sylas',
  'Swain',
  'Fiddlesticks',
  'Illaoi',
  'RedKayn',
  'Kayn',
  'Olaf',
  'Zac',
  'Yuumi',
  'Sona',
  'Nami',
  'Hecarim',
  'Irelia',
  'Samira',
  'Nilha',
  'Nilah',
  'Aphelios',
  'Mordekaiser',
  'Maokai',
  'Volibear',
  'Viego',
  'Yone',
  'Yasuo',
  'Rhaast',
]);

const HYBRID_OR_AP_BRUISER = new Set([
  'Kayle',
  'Kaisa',
  'Katarina',
  'Akali',
  'Jax',
  'Volibear',
  'Shyvana',
  'Corki',
  'Ezreal',
  'Varus',
  'Twitch',
  'Yone',
  'Udyr',
  'Gwen',
  'Diana',
  'Sylas',
  'Mordekaiser',
]);

const HIGH_CC_CHAMPIONS = new Set([
  'Leona',
  'Nautilus',
  'Alistar',
  'Thresh',
  'Blitzcrank',
  'Maokai',
  'Sejuani',
  'Amumu',
  'Malzahar',
  'Lissandra',
  'Morgana',
  'Vi',
  'Ashe',
  'Skarner',
  'Rell',
  'Ornn',
  'Zac',
  'Galio',
  'Annie',
  'Pantheon',
  'Renekton',
]);

/**
 * Analyse déterministe du profil de dégâts, de résistance, de soin et de contrôle
 * d'un champion à partir des données officielles Data Dragon.
 */
export function classifyChampionProfile(champ: ChampionSummary): ChampionDamageProfile {
  const { info, tags, stats, id, name } = champ;
  const totalOffense = Math.max(1, info.attack + info.magic);

  let physicalScore = Math.round((info.attack / totalOffense) * 100);
  let magicScore = Math.round((info.magic / totalOffense) * 100);

  if (HYBRID_OR_AP_BRUISER.has(id)) {
    physicalScore = Math.max(35, Math.min(65, physicalScore));
    magicScore = 100 - physicalScore;
  } else if (tags.includes('Marksman') && info.attack >= 7) {
    physicalScore = Math.max(82, physicalScore);
    magicScore = 100 - physicalScore;
  } else if (tags.includes('Mage') && info.magic >= 7) {
    magicScore = Math.max(84, magicScore);
    physicalScore = 100 - magicScore;
  }

  const tankinessScore = Math.min(
    100,
    Math.round(
      info.defense * 8 +
        (stats.hpperlevel >= 105 ? 16 : 6) +
        (tags.includes('Tank') ? 20 : 0),
    ),
  );

  const sustainScore = HIGH_SUSTAIN_CHAMPIONS.has(id)
    ? 85
    : tags.includes('Fighter')
      ? 45
      : tags.includes('Support')
        ? 50
        : 20;

  const burstScore = tags.includes('Assassin')
    ? 90
    : tags.includes('Mage')
      ? 72
      : tags.includes('Marksman')
        ? 45
        : 40;

  const ccScore = HIGH_CC_CHAMPIONS.has(id)
    ? 88
    : tags.includes('Tank') || tags.includes('Support')
      ? 68
      : tags.includes('Mage')
        ? 50
        : 28;

  const primaryDamage: ChampionDamageProfile['primaryDamage'] =
    physicalScore >= 65 ? 'Physique' : magicScore >= 65 ? 'Magique' : 'Hybride';

  const archetype = tags.join(' / ');

  const keyThreats: string[] = [];
  if (tankinessScore >= 68) keyThreats.push('Frontline / Tank');
  if (sustainScore >= 70) keyThreats.push('Soin / Vol de vie');
  if (burstScore >= 75) keyThreats.push('Burst létal');
  if (ccScore >= 70) keyThreats.push('Contrôle (CC)');
  if (tags.includes('Marksman')) keyThreats.push('DPS soutenu');
  if (keyThreats.length === 0) {
    keyThreats.push(primaryDamage === 'Magique' ? 'Dégâts magiques' : 'Escarmouche');
  }

  let recommendedCounter = 'Vision & placement sûr';
  if (sustainScore >= 70 && primaryDamage === 'Physique') {
    recommendedCounter = 'Anti-soin (Armure ronce / Exécuteur) + Armure';
  } else if (sustainScore >= 70) {
    recommendedCounter = 'Anti-soin (Orbe / Exécuteur) + Tenue en combat';
  } else if (burstScore >= 75 && primaryDamage === 'Physique') {
    recommendedCounter = 'Armure rapide / Stase (Zhonya) · Garder un peel';
  } else if (burstScore >= 75 && primaryDamage === 'Magique') {
    recommendedCounter = 'Résistance magique (Kaénique / Mercures) · Éviter facecheck';
  } else if (ccScore >= 70) {
    recommendedCounter = 'Sandales de Mercure / Ténacité + Purge';
  } else if (tags.includes('Marksman')) {
    recommendedCounter = 'Coques en acier / Randuin · Focus ou zone';
  } else if (tankinessScore >= 68) {
    recommendedCounter = 'Pénétration % ou dégâts en % PV max';
  }

  return {
    championId: id,
    championName: name,
    physicalScore,
    magicScore,
    tankinessScore,
    sustainScore,
    burstScore,
    ccScore,
    primaryDamage,
    archetype,
    keyThreats: keyThreats.slice(0, 3),
    recommendedCounter,
  };
}
