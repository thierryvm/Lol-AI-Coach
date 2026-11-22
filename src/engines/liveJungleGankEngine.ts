import type {
  ChampionSummary,
  LivePlayerEquipmentRow,
  Role,
  SpectatorParticipant,
} from './types.ts';

export type MapSightingZone =
  | 'UNKNOWN'
  | 'TOP_LANE'
  | 'RIVER_TOP'
  | 'MID_LANE'
  | 'RIVER_BOT'
  | 'BOT_LANE'
  | 'ENEMY_JUNGLE_TOP'
  | 'ENEMY_JUNGLE_BOT';

export type GankDangerLevel = 'Critique' | 'Élevé' | 'Modéré' | 'Faible';

export type JunglerArchetype = 'EARLY_GANKER' | 'LEVEL_6_SPIKE' | 'POWER_FARMER' | 'STANDARD';

export interface JungleSighting {
  zone: MapSightingZone;
  spottedAtGameSec: number;
}

export interface GankAlertResult {
  isAram: boolean;
  hasEnemyJungler: boolean;
  enemyJungler: {
    championName: string;
    displayName: string;
    imageUrl?: string;
    level: number;
    kda: string;
    cs: number;
    isDead: boolean;
    archetype: JunglerArchetype;
    archetypeLabel: string;
    teamSide: 'BLUE' | 'RED' | 'UNKNOWN';
  } | null;
  playerTeamSide: 'BLUE' | 'RED' | 'UNKNOWN';
  laneLabel: string;
  dangerLevel: GankDangerLevel;
  dangerScore: number; // 0..100
  alertKey: string; // clé stable de fenêtre pour éviter le spam de toast
  headline: string;
  actionTip: string;
  wardAdvice: string;
  activeWindowLabel: string;
  sightingSummary: string;
  probableSide: 'TOP' | 'MID' | 'BOT' | 'UNKNOWN';
  zoneThreat: {
    top: 'HIGH' | 'MEDIUM' | 'LOW';
    mid: 'HIGH' | 'MEDIUM' | 'LOW';
    bot: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  factors: string[];
}

const EARLY_GANKER_IDS = new Set([
  'LeeSin',
  'Elise',
  'JarvanIV',
  'Shaco',
  'RekSai',
  'XinZhao',
  'Vi',
  'Zac',
  'Nunu',
  'Poppy',
  'Maokai',
  'Sejuani',
  'Pantheon',
  'Sylas',
  'Kindred',
  'Graves',
  'Nidalee',
  'Volibear',
]);

const LEVEL_6_SPIKE_IDS = new Set([
  'Nocturne',
  'Evelynn',
  'Briar',
  'Rengar',
  'Fiddlesticks',
  'Diana',
  'Hecarim',
  'Warwick',
  'Amumu',
  'MonkeyKing',
  'Kayn',
  'Skarner',
]);

const POWER_FARMER_IDS = new Set([
  'Karthus',
  'Shyvana',
  'Lillia',
  'MasterYi',
  'Belveth',
  'Brand',
  'Zyra',
  'Viego',
  'Udyr',
  'Gragas',
]);

function findChampion(
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

export function getRoleLaneLabel(role: Role): string {
  switch (role) {
    case 'TOP':
      return 'Top (Voie du Haut)';
    case 'MID':
      return 'Mid (Voie du Milieu)';
    case 'ADC':
    case 'SUPPORT':
      return 'Bot (Voie du Bas)';
    case 'JUNGLE':
      return 'Jungle / Rivière';
  }
}

export function getSightingZoneLabel(zone: MapSightingZone): string {
  switch (zone) {
    case 'TOP_LANE':
      return 'Top Lane';
    case 'RIVER_TOP':
      return 'Rivière Top / Larves';
    case 'MID_LANE':
      return 'Mid Lane';
    case 'RIVER_BOT':
      return 'Rivière Bot / Dragon';
    case 'BOT_LANE':
      return 'Bot Lane';
    case 'ENEMY_JUNGLE_TOP':
      return 'Jungle Supérieure';
    case 'ENEMY_JUNGLE_BOT':
      return 'Jungle Inférieure';
    default:
      return 'Brouillard de guerre';
  }
}

function classifyJungler(champId: string): {
  archetype: JunglerArchetype;
  label: string;
} {
  if (EARLY_GANKER_IDS.has(champId)) {
    return { archetype: 'EARLY_GANKER', label: 'Gank précoce (Niv. 2–3)' };
  }
  if (LEVEL_6_SPIKE_IDS.has(champId)) {
    return { archetype: 'LEVEL_6_SPIKE', label: 'Pic Ultime (Niv. 6)' };
  }
  if (POWER_FARMER_IDS.has(champId)) {
    return { archetype: 'POWER_FARMER', label: 'Farm rapide & Objectifs' };
  }
  return { archetype: 'STANDARD', label: 'Jungler polyvalent' };
}

function mapZoneToSide(zone: MapSightingZone): 'TOP' | 'MID' | 'BOT' | 'UNKNOWN' {
  if (zone === 'TOP_LANE' || zone === 'RIVER_TOP' || zone === 'ENEMY_JUNGLE_TOP') {
    return 'TOP';
  }
  if (zone === 'MID_LANE') return 'MID';
  if (zone === 'BOT_LANE' || zone === 'RIVER_BOT' || zone === 'ENEMY_JUNGLE_BOT') {
    return 'BOT';
  }
  return 'UNKNOWN';
}

function mapRoleToSide(role: Role): 'TOP' | 'MID' | 'BOT' {
  if (role === 'TOP') return 'TOP';
  if (role === 'MID' || role === 'JUNGLE') return 'MID';
  return 'BOT';
}

export function analyzeJungleGankDanger(params: {
  enemyPlayers: LivePlayerEquipmentRow[];
  spectatorParticipants?: SpectatorParticipant[];
  selfChampionName: string;
  role: Role;
  champions: ChampionSummary[];
  gameTimeSec: number;
  gameMode?: string;
  dragonTimerSec: number | null;
  baronTimerSec: number | null;
  sighting: JungleSighting;
}): GankAlertResult {
  const {
    enemyPlayers,
    spectatorParticipants = [],
    selfChampionName,
    role,
    champions,
    gameTimeSec,
    gameMode,
    dragonTimerSec,
    baronTimerSec,
    sighting,
  } = params;

  const isAram = gameMode?.toUpperCase() === 'ARAM';
  const laneLabel = getRoleLaneLabel(role);
  const playerSide = mapRoleToSide(role);

  const selfChampObj = findChampion(champions, selfChampionName);
  const selfSpec = selfChampObj
    ? spectatorParticipants.find((sp) => Number(selfChampObj.key) === sp.championId)
    : undefined;
  const playerTeamSide: 'BLUE' | 'RED' | 'UNKNOWN' =
    selfSpec?.teamId === 100 ? 'BLUE' : selfSpec?.teamId === 200 ? 'RED' : 'UNKNOWN';

  if (isAram) {
    return {
      isAram: true,
      hasEnemyJungler: false,
      enemyJungler: null,
      playerTeamSide,
      laneLabel: 'Abîme hurlant (ARAM)',
      dangerLevel: 'Faible',
      dangerScore: 0,
      alertKey: 'aram',
      headline: 'Mode ARAM : aucun jungler ni gank latéral sur cette carte.',
      actionTip: 'Surveillez uniquement les engages frontaux et les sorts d’invocateur Marque (Boule de neige).',
      wardAdvice: 'Pas de balises de vision en ARAM.',
      activeWindowLabel: 'Voie unique 5v5',
      sightingSummary: 'Carte à voie unique',
      probableSide: 'MID',
      zoneThreat: { top: 'LOW', mid: 'MEDIUM', bot: 'LOW' },
      factors: ['Mode ARAM détecté'],
    };
  }

  // Identifier le jungler ennemi via Châtiment (spellId 11) ou position JUNGLE (Live Client Data + Spectator-V5)
  let junglerRow = enemyPlayers.find(
    (e) =>
      e.spell1Id === 11 ||
      e.spell2Id === 11 ||
      e.position.toUpperCase() === 'JUNGLE',
  );

  let junglerSpec: SpectatorParticipant | undefined;
  if (!junglerRow && spectatorParticipants.length > 0 && selfSpec) {
    junglerSpec = spectatorParticipants.find(
      (sp) => sp.teamId !== selfSpec.teamId && (sp.spell1Id === 11 || sp.spell2Id === 11),
    );
    if (junglerSpec) {
      const specChamp = champions.find((c) => Number(c.key) === junglerSpec!.championId);
      if (specChamp) {
        junglerRow = enemyPlayers.find(
          (e) => e.championName.toLowerCase() === specChamp.id.toLowerCase(),
        );
      }
    }
  } else if (junglerRow && spectatorParticipants.length > 0) {
    const jChamp = findChampion(champions, junglerRow.championName);
    junglerSpec = spectatorParticipants.find(
      (sp) =>
        (jChamp && Number(jChamp.key) === sp.championId) ||
        sp.riotId.toLowerCase() === junglerRow!.riotId.toLowerCase(),
    );
  }

  if (!junglerRow) {
    return {
      isAram: false,
      hasEnemyJungler: false,
      enemyJungler: null,
      playerTeamSide,
      laneLabel,
      dangerLevel: 'Faible',
      dangerScore: 10,
      alertKey: 'no-jungler',
      headline: 'Aucun jungler ennemi (Châtiment) détecté dans cette session.',
      actionTip:
        enemyPlayers.length === 0
          ? 'Mode Outil d’entraînement solo sans adversaire — ajoutez un bot ou lancez une partie pour activer l’alerte Danger Gank.'
          : 'Composition adverse sans Châtiment détecté : gardez la vision sur les rotations de Mid/Support.',
      wardAdvice: 'Balise classique dans le buisson de rivière.',
      activeWindowLabel: 'Hors jungle active',
      sightingSummary: 'Aucun Châtiment adverse',
      probableSide: 'UNKNOWN',
      zoneThreat: { top: 'LOW', mid: 'LOW', bot: 'LOW' },
      factors: ['Aucun joueur adverse équipé de Châtiment (Smite)'],
    };
  }

  const jChamp = findChampion(champions, junglerRow.championName);
  const champId = jChamp?.id || junglerRow.championName;
  const displayName = jChamp?.name || junglerRow.championName;
  const { archetype, label: archetypeLabel } = classifyJungler(champId);
  const junglerTeamSide: 'BLUE' | 'RED' | 'UNKNOWN' =
    junglerSpec?.teamId === 100
      ? 'BLUE'
      : junglerSpec?.teamId === 200
        ? 'RED'
        : playerTeamSide === 'BLUE'
          ? 'RED'
          : playerTeamSide === 'RED'
            ? 'BLUE'
            : 'UNKNOWN';

  const factors: string[] = [];
  let score = 22;
  let activeWindowLabel = 'Rotation jungle standard';
  let windowBucket = 'std';

  // 1. Si le jungler ennemi est mort -> fenêtre sûre immédiate
  if (junglerRow.isDead) {
    return {
      isAram: false,
      hasEnemyJungler: true,
      enemyJungler: {
        championName: junglerRow.championName,
        displayName,
        imageUrl: jChamp?.imageUrl,
        level: junglerRow.level,
        kda: `${junglerRow.kills}/${junglerRow.deaths}/${junglerRow.assists}`,
        cs: junglerRow.cs,
        isDead: true,
        archetype,
        archetypeLabel,
        teamSide: junglerTeamSide,
      },
      playerTeamSide,
      laneLabel,
      dangerLevel: 'Faible',
      dangerScore: 8,
      alertKey: `dead-${champId}`,
      headline: `${displayName} est mort : voie ${laneLabel} sécurisée temporairement.`,
      actionTip: 'Profitez-en pour pousser la vague sous tour, prendre une plaque ou poser une balise profonde.',
      wardAdvice: 'Placez une balise profonde dans sa jungle avant son retour.',
      activeWindowLabel: 'Jungler mort (fenêtre sûre)',
      sightingSummary: 'Éliminé en attente de réapparition',
      probableSide: 'UNKNOWN',
      zoneThreat: { top: 'LOW', mid: 'LOW', bot: 'LOW' },
      factors: [`${displayName} est actuellement mort`],
    };
  }

  // 2. Analyse des fenêtres temporelles officielles de la Faille
  let probableSide: 'TOP' | 'MID' | 'BOT' | 'UNKNOWN' = 'UNKNOWN';

  if (gameTimeSec >= 150 && gameTimeSec <= 235) {
    // Premier clear (02:30 - 03:55)
    activeWindowLabel = 'Premier clear · Gank Niveau 3';
    windowBucket = 'first-clear';
    score += archetype === 'EARLY_GANKER' ? 42 : archetype === 'POWER_FARMER' ? 18 : 30;
    factors.push(`Fenêtre critique 1er clear (${archetypeLabel})`);

    // Si on connaît le côté de l'équipe ennemie (via Spectator-V5), le clear standard finit souvent vers le côté opposé au leash bot -> côté Top entre 3:00 et 3:45
    if (gameTimeSec >= 175) {
      if (role === 'TOP' || role === 'MID') {
        score += 18;
        probableSide = role === 'TOP' ? 'TOP' : 'MID';
        factors.push('Fin de clear classique vers Top/Mid (02:55–03:45)');
      } else {
        probableSide = 'TOP';
      }
    }
  } else if (gameTimeSec > 235 && gameTimeSec <= 275) {
    activeWindowLabel = 'Contestation Carapateur rivière';
    windowBucket = 'scuttle';
    score += 24;
    factors.push('Phase de Carapateur en rivière (03:55–04:35)');
  }

  // Fenêtre Larves du Néant / Héraut (6m00 à 15m00)
  if (gameTimeSec >= 345 && gameTimeSec <= 540) {
    if (role === 'TOP' || role === 'MID') {
      score += 22;
      probableSide = 'TOP';
      activeWindowLabel = 'Fenêtre Larves du Néant (Top/Mid)';
      windowBucket = 'grubs';
      factors.push('Larves du Néant actives côté rivière Top');
    }
  }

  // Fenêtre Dragon proche (< 75s)
  if (dragonTimerSec !== null && dragonTimerSec <= 75) {
    if (role === 'ADC' || role === 'SUPPORT' || role === 'MID') {
      score += 26;
      probableSide = 'BOT';
      activeWindowLabel =
        dragonTimerSec === 0 ? 'Dragon disponible (Pression Bot/Mid)' : `Dragon dans ${dragonTimerSec}s`;
      windowBucket = 'dragon';
      factors.push('Approche du Dragon : forte priorité Botlane & Rivière sud');
    }
  }

  // Fenêtre Baron Nashor proche (après 19:00)
  if (gameTimeSec >= 1140 && baronTimerSec !== null && baronTimerSec <= 75) {
    if (role === 'TOP' || role === 'MID') {
      score += 24;
      probableSide = 'TOP';
      activeWindowLabel =
        baronTimerSec === 0 ? 'Baron disponible (Pression Top/Mid)' : `Baron dans ${baronTimerSec}s`;
      windowBucket = 'baron';
      factors.push('Approche du Baron : présence jungle nord élevée');
    }
  }

  // Spike Niveau 6 des assassins/divers (Nocturne, Evelynn, Rengar, Fiddlesticks, Briar...)
  if (archetype === 'LEVEL_6_SPIKE' && junglerRow.level >= 6) {
    score += 20;
    factors.push(`${displayName} a atteint le niveau 6 (ultime d’engage débloqué)`);
    if (windowBucket === 'std') {
      activeWindowLabel = 'Ultime Niv. 6 disponible';
      windowBucket = 'lvl6';
    }
  }

  // Jungler en avance (kills ou niveau)
  if (junglerRow.kills >= 3 || junglerRow.dangerLevel === 'Élevé') {
    score += 14;
    factors.push(`${displayName} est en avance (${junglerRow.kills}/${junglerRow.deaths}/${junglerRow.assists})`);
  }

  // 3. Intégration du dernier repérage mini-map (Spectator / Vision joueur)
  const ageSec = sighting.zone !== 'UNKNOWN' ? Math.max(0, gameTimeSec - sighting.spottedAtGameSec) : 999;
  let sightingSummary = 'Non repéré récemment (Brouillard)';

  if (sighting.zone !== 'UNKNOWN' && ageSec <= 75) {
    const spottedSide = mapZoneToSide(sighting.zone);
    const zoneLabel = getSightingZoneLabel(sighting.zone);
    sightingSummary = `Vu : ${zoneLabel} (il y a ${ageSec}s)`;

    if (ageSec <= 32) {
      if (spottedSide === playerSide || spottedSide === 'MID') {
        score += spottedSide === playerSide ? 36 : 22;
        probableSide = spottedSide;
        activeWindowLabel = `Repéré proche de votre voie (${zoneLabel})`;
        windowBucket = `spot-near-${sighting.zone}`;
        factors.push(`Détecté il y a ${ageSec}s dans ${zoneLabel} (très proche de votre voie)`);
      } else {
        // Opposé sur la carte récemment -> beaucoup plus sûr !
        score -= 28;
        probableSide = spottedSide;
        activeWindowLabel = `Repéré côté opposé (${zoneLabel})`;
        windowBucket = `spot-far-${sighting.zone}`;
        factors.push(`Vu à l'opposé (${zoneLabel}) il y a ${ageSec}s — trajet >22s vers votre voie`);
      }
    } else {
      // Vu il y a 33–75s : temps suffisant pour traverser la carte !
      score += 12;
      factors.push(`Vu il y a ${ageSec}s (${zoneLabel}) : temps suffisant pour avoir pivoté sur votre voie`);
    }
  } else if (gameTimeSec >= 150) {
    // Longtemps dans le brouillard après 2:30 -> vigilance accrue
    score += 12;
    factors.push('Dans le brouillard de guerre — position non confirmée');
  }

  const clampedScore = Math.max(5, Math.min(98, Math.round(score)));
  const dangerLevel: GankDangerLevel =
    clampedScore >= 76
      ? 'Critique'
      : clampedScore >= 56
        ? 'Élevé'
        : clampedScore >= 36
          ? 'Modéré'
          : 'Faible';

  // Calcul menace par voie pour le radar mini-map
  const threatForSide = (side: 'TOP' | 'MID' | 'BOT'): 'HIGH' | 'MEDIUM' | 'LOW' => {
    if (probableSide === side) {
      return clampedScore >= 56 ? 'HIGH' : 'MEDIUM';
    }
    if (side === playerSide && clampedScore >= 72) return 'HIGH';
    if (side === playerSide && clampedScore >= 48) return 'MEDIUM';
    if (probableSide === 'UNKNOWN' && clampedScore >= 60) return 'MEDIUM';
    return 'LOW';
  };

  let headline = `Risque modéré sur votre voie (${laneLabel}).`;
  let actionTip = 'Gardez votre vague proche du milieu de voie et vérifiez vos balises.';
  if (dangerLevel === 'Critique') {
    headline = `DANGER GANK CRITIQUE sur ${laneLabel} (${displayName}) !`;
    actionTip = 'Reculez sous tourelle ou ne dépassez pas la moitié de voie sans vision complète du buisson de rivière.';
  } else if (dangerLevel === 'Élevé') {
    headline = `Danger Gank élevé sur ${laneLabel} — ${displayName} peut arriver à tout moment.`;
    actionTip = 'Conservez votre sort de fuite / Flash et gelez la vague près de votre tour jusqu’à revoir le jungler.';
  } else if (dangerLevel === 'Faible') {
    headline = `Pression de gank faible actuellement sur ${laneLabel}.`;
    actionTip = 'Fenêtre favorable pour prendre des trades ou poser de la vision avancée.';
  }

  const wardAdvice =
    role === 'TOP'
      ? 'Balisez le buisson rivière Top ou le tri-bush selon votre côté (Bleu/Rouge).'
      : role === 'MID'
        ? 'Balisez le buisson rivière du côté où votre jungler n’est pas présent (lean opposé).'
        : 'Balisez le buisson rivière Bot et le tri-bush contre les contournements.';

  return {
    isAram: false,
    hasEnemyJungler: true,
    enemyJungler: {
      championName: junglerRow.championName,
      displayName,
      imageUrl: jChamp?.imageUrl,
      level: junglerRow.level,
      kda: `${junglerRow.kills}/${junglerRow.deaths}/${junglerRow.assists}`,
      cs: junglerRow.cs,
      isDead: false,
      archetype,
      archetypeLabel,
      teamSide: junglerTeamSide,
    },
    playerTeamSide,
    laneLabel,
    dangerLevel,
    dangerScore: clampedScore,
    alertKey: `${windowBucket}-${dangerLevel}`,
    headline,
    actionTip,
    wardAdvice,
    activeWindowLabel,
    sightingSummary,
    probableSide,
    zoneThreat: {
      top: threatForSide('TOP'),
      mid: threatForSide('MID'),
      bot: threatForSide('BOT'),
    },
    factors,
  };
}
