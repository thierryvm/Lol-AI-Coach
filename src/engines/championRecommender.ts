import { classifyChampionProfile, isJunglerChampion } from './championEngine.ts';
import type {
  ChampionMasteryEntry,
  ChampionSummary,
  MatchRecord,
  PlayerTendencies,
  Role,
} from './types.ts';

export type RecommenderRoleFilter = 'AUTO' | Role;

export interface PlayerGameplayDna {
  gamesAnalyzed: number;
  dominantRole: Role;
  secondaryRole: Role | null;
  archetypeTitle: string;
  archetypeSummary: string;
  assistSharePct: number;
  avgDeaths: number;
  isolatedDeathPct: number;
  avgCsPerMin: number;
  avgVisionPerMin: number;
  preferredRange: 'Mêlée' | 'Distance' | 'Mixte';
  preferredDamage: 'Physique' | 'Magique' | 'Hybride';
  avgTankinessAffinity: number;
  avgCcAffinity: number;
  avgSustainAffinity: number;
  avgBurstAffinity: number;
  topWinningChampions: string[];
}

export interface ChampionPlaystyleRecommendation {
  champion: ChampionSummary;
  recommendedRole: Role;
  matchScore: number;
  styleLabel: string;
  whyItFits: string;
  gameplayBenefit: string;
  alreadyPlayedGames: number;
  masteryLevel?: number;
  masteryPoints?: number;
}

export interface ChampionRecommendationResult {
  dna: PlayerGameplayDna;
  recommendations: ChampionPlaystyleRecommendation[];
}

export interface DraftCounterPickRecommendation {
  champion: ChampionSummary;
  fitScore: number;
  styleLabel: string;
  counterReason: string;
}

const SUPPORT_CHAMPION_IDS = new Set([
  'Alistar',
  'Amumu',
  'Annie',
  'Ashe',
  'Bard',
  'Blitzcrank',
  'Brand',
  'Braum',
  'Camille',
  'Galio',
  'Heimerdinger',
  'Hwei',
  'Janna',
  'Karma',
  'Leona',
  'Lulu',
  'Lux',
  'Maokai',
  'Mel',
  'Milio',
  'Morgana',
  'Nami',
  'Nautilus',
  'Neeko',
  'Pantheon',
  'Poppy',
  'Pyke',
  'Rakan',
  'Rell',
  'Renata',
  'Senna',
  'Seraphine',
  'Shaco',
  'Shen',
  'Sona',
  'Soraka',
  'Swain',
  'TahmKench',
  'Taric',
  'Thresh',
  'Velkoz',
  'Xerath',
  'Yuumi',
  'Zilean',
  'Zyra',
]);

const ADC_CHAMPION_IDS = new Set([
  'Aphelios',
  'Ashe',
  'Caitlyn',
  'Corki',
  'Draven',
  'Ezreal',
  'Jhin',
  'Jinx',
  'Kaisa',
  'Kalista',
  'KogMaw',
  'Lucian',
  'MissFortune',
  'Nilah',
  'Samira',
  'Senna',
  'Sivir',
  'Smolder',
  'Tristana',
  'Twitch',
  'Varus',
  'Vayne',
  'Xayah',
  'Yunara',
  'Zeri',
  'Ziggs',
]);

const MID_CHAMPION_IDS = new Set([
  'Ahri',
  'Akali',
  'Akshan',
  'Anivia',
  'Annie',
  'AurelionSol',
  'Aurora',
  'Azir',
  'Brand',
  'Cassiopeia',
  'Corki',
  'Diana',
  'Ekko',
  'Fizz',
  'Galio',
  'Hwei',
  'Irelia',
  'Jayce',
  'Kassadin',
  'Katarina',
  'Leblanc',
  'Lissandra',
  'Lux',
  'Malzahar',
  'Mel',
  'Naafiri',
  'Neeko',
  'Orianna',
  'Qiyana',
  'Ryze',
  'Smolder',
  'Swain',
  'Sylas',
  'Syndra',
  'Taliyah',
  'Talon',
  'TwistedFate',
  'Veigar',
  'Velkoz',
  'Vex',
  'Viktor',
  'Vladimir',
  'Xerath',
  'Yasuo',
  'Yone',
  'Zed',
  'Ziggs',
  'Zoe',
]);

const TOP_CHAMPION_IDS = new Set([
  'Aatrox',
  'Ambessa',
  'Camille',
  'Chogath',
  'Darius',
  'DrMundo',
  'Fiora',
  'Gangplank',
  'Garen',
  'Gnar',
  'Gragas',
  'Gwen',
  'Heimerdinger',
  'Illaoi',
  'Irelia',
  'Jax',
  'Jayce',
  'KSante',
  'Kayle',
  'Kennen',
  'Kled',
  'Malphite',
  'Maokai',
  'Mordekaiser',
  'Nasus',
  'Olaf',
  'Ornn',
  'Pantheon',
  'Poppy',
  'Quinn',
  'Renekton',
  'Riven',
  'Rumble',
  'Sett',
  'Shen',
  'Singed',
  'Sion',
  'TahmKench',
  'Teemo',
  'Trundle',
  'Tryndamere',
  'Urgot',
  'Vayne',
  'Vladimir',
  'Volibear',
  'Warwick',
  'MonkeyKing',
  'Yasuo',
  'Yone',
  'Yorick',
  'Zac',
]);

function normalizeTeamPosition(rawPos: string | undefined): Role | null {
  const up = (rawPos || '').toUpperCase().trim();
  if (up === 'TOP') return 'TOP';
  if (up === 'JUNGLE') return 'JUNGLE';
  if (up === 'MIDDLE' || up === 'MID') return 'MID';
  if (up === 'BOTTOM' || up === 'ADC') return 'ADC';
  if (up === 'UTILITY' || up === 'SUPPORT') return 'SUPPORT';
  return null;
}

export function getChampionPossibleRoles(champ: ChampionSummary): Role[] {
  const roles: Role[] = [];
  if (TOP_CHAMPION_IDS.has(champ.id)) roles.push('TOP');
  if (isJunglerChampion(champ.id)) roles.push('JUNGLE');
  if (MID_CHAMPION_IDS.has(champ.id)) roles.push('MID');
  if (ADC_CHAMPION_IDS.has(champ.id)) roles.push('ADC');
  if (SUPPORT_CHAMPION_IDS.has(champ.id)) roles.push('SUPPORT');

  if (roles.length > 0) return roles;

  if (champ.tags.includes('Support')) roles.push('SUPPORT');
  if (champ.tags.includes('Marksman')) roles.push('ADC');
  if (champ.tags.includes('Mage')) roles.push('MID');
  if (champ.tags.includes('Assassin')) roles.push('MID');
  if (champ.tags.includes('Tank') || champ.tags.includes('Fighter')) roles.push('TOP');
  return roles.length > 0 ? roles : ['MID'];
}

export function formatRecommenderRoleLabel(role: Role): string {
  switch (role) {
    case 'TOP':
      return 'Top';
    case 'JUNGLE':
      return 'Jungle';
    case 'MID':
      return 'Mid';
    case 'ADC':
      return 'ADC';
    case 'SUPPORT':
      return 'Support';
  }
}

export function analyzePlayerPlaystyleAndRecommendChampions(
  matches: MatchRecord[],
  allChampions: ChampionSummary[],
  roleFilter: RecommenderRoleFilter = 'AUTO',
  includeAlreadyPlayed = false,
  masteries: ChampionMasteryEntry[] = [],
): ChampionRecommendationResult {
  const champLookup = new Map<string, ChampionSummary>();
  const masteryByKey = new Map<number, ChampionMasteryEntry>();
  for (const c of allChampions) {
    champLookup.set(c.id.toLowerCase(), c);
    champLookup.set(c.name.toLowerCase(), c);
  }
  for (const m of masteries) {
    masteryByKey.set(m.championId, m);
  }

  const ordered = [...matches].sort((a, b) => b.gameCreation - a.gameCreation);
  const gamesAnalyzed = ordered.length;

  const roleCounts = new Map<Role, number>([
    ['TOP', 0],
    ['JUNGLE', 0],
    ['MID', 0],
    ['ADC', 0],
    ['SUPPORT', 0],
  ]);

  const playedCounts = new Map<string, number>();
  const playedWinStats = new Map<string, { games: number; wins: number; kdaSum: number }>();

  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  let totalVisionMin = 0;
  let nonSupportCsSum = 0;
  let nonSupportCount = 0;
  let totalMapDeaths = 0;
  let isolatedMapDeaths = 0;

  let totalAffinityWeight = 0;
  let weightedTank = 0;
  let weightedCc = 0;
  let weightedSustain = 0;
  let weightedBurst = 0;
  let weightedPhys = 0;
  let weightedMag = 0;
  let weightedRange = 0;
  let weightedDifficulty = 0;

  for (const m of ordered) {
    const p = m.player;
    const durMin = Math.max(1, m.gameDurationSec / 60);
    const visMin = p.visionScore / durMin;

    totalKills += p.kills;
    totalDeaths += p.deaths;
    totalAssists += p.assists;
    totalVisionMin += visMin;

    const normRole = normalizeTeamPosition(p.teamPosition);
    if (normRole) {
      roleCounts.set(normRole, (roleCounts.get(normRole) || 0) + 1);
    }
    if (normRole !== 'SUPPORT') {
      nonSupportCsSum += p.csPerMin;
      nonSupportCount += 1;
    }

    const deathEvs = m.mapEvents.filter((e) => e.type === 'DEATH');
    totalMapDeaths += deathEvs.length;
    isolatedMapDeaths += deathEvs.filter((e) => e.isolated).length;

    const champObj = champLookup.get(p.championName.toLowerCase());
    const key = champObj ? champObj.id : p.championName;
    playedCounts.set(key, (playedCounts.get(key) || 0) + 1);

    const kda = (p.kills + p.assists) / Math.max(1, p.deaths);
    const prevStat = playedWinStats.get(key) || { games: 0, wins: 0, kdaSum: 0 };
    prevStat.games += 1;
    if (p.win) prevStat.wins += 1;
    prevStat.kdaSum += kda;
    playedWinStats.set(key, prevStat);

    if (champObj) {
      const prof = classifyChampionProfile(champObj);
      const matchWeight = (p.win ? 1.55 : 0.75) * Math.min(2.2, Math.max(0.6, kda / 2.2));
      totalAffinityWeight += matchWeight;
      weightedTank += prof.tankinessScore * matchWeight;
      weightedCc += prof.ccScore * matchWeight;
      weightedSustain += prof.sustainScore * matchWeight;
      weightedBurst += prof.burstScore * matchWeight;
      weightedPhys += prof.physicalScore * matchWeight;
      weightedMag += prof.magicScore * matchWeight;
      weightedRange += champObj.stats.attackrange * matchWeight;
      weightedDifficulty += champObj.info.difficulty * matchWeight;
    }
  }

  // Enrichissement léger via la maîtrise officielle Riot si peu de matchs récents
  for (const mast of masteries.slice(0, 5)) {
    const champObj = allChampions.find((c) => Number(c.key) === mast.championId);
    if (!champObj) continue;
    const prof = classifyChampionProfile(champObj);
    const mastWeight = Math.min(1.4, Math.max(0.35, mast.championPoints / 50000));
    totalAffinityWeight += mastWeight;
    weightedTank += prof.tankinessScore * mastWeight;
    weightedCc += prof.ccScore * mastWeight;
    weightedSustain += prof.sustainScore * mastWeight;
    weightedBurst += prof.burstScore * mastWeight;
    weightedPhys += prof.physicalScore * mastWeight;
    weightedMag += prof.magicScore * mastWeight;
    weightedRange += champObj.stats.attackrange * mastWeight;
    weightedDifficulty += champObj.info.difficulty * mastWeight;
  }

  const sortedRoles = Array.from(roleCounts.entries()).sort((a, b) => b[1] - a[1]);
  const dominantRole: Role = sortedRoles[0] && sortedRoles[0][1] > 0 ? sortedRoles[0][0] : 'SUPPORT';
  const secondaryRole: Role | null =
    sortedRoles[1] && sortedRoles[1][1] >= 2 ? sortedRoles[1][0] : null;

  const avgDeaths = gamesAnalyzed > 0 ? Number((totalDeaths / gamesAnalyzed).toFixed(1)) : 5.0;
  const avgKills = gamesAnalyzed > 0 ? totalKills / gamesAnalyzed : 4.0;
  const avgAssists = gamesAnalyzed > 0 ? totalAssists / gamesAnalyzed : 8.0;
  const assistSharePct = Math.round((avgAssists / Math.max(1, avgKills + avgAssists)) * 100);
  const isolatedDeathPct =
    totalMapDeaths > 0 ? Math.round((isolatedMapDeaths / totalMapDeaths) * 100) : 25;
  const avgCsPerMin =
    nonSupportCount > 0 ? Number((nonSupportCsSum / nonSupportCount).toFixed(1)) : 5.5;
  const avgVisionPerMin =
    gamesAnalyzed > 0 ? Number((totalVisionMin / gamesAnalyzed).toFixed(2)) : 0.85;

  const denom = Math.max(0.01, totalAffinityWeight);
  const avgTankinessAffinity =
    totalAffinityWeight > 0 ? Math.round(weightedTank / denom) : 52;
  const avgCcAffinity = totalAffinityWeight > 0 ? Math.round(weightedCc / denom) : 60;
  const avgSustainAffinity =
    totalAffinityWeight > 0 ? Math.round(weightedSustain / denom) : 50;
  const avgBurstAffinity = totalAffinityWeight > 0 ? Math.round(weightedBurst / denom) : 52;
  const avgPhysPref = totalAffinityWeight > 0 ? weightedPhys / denom : 45;
  const avgMagPref = totalAffinityWeight > 0 ? weightedMag / denom : 55;
  const avgRangePref = totalAffinityWeight > 0 ? weightedRange / denom : 380;
  const avgDiffPref = totalAffinityWeight > 0 ? weightedDifficulty / denom : 4.5;

  const preferredRange: PlayerGameplayDna['preferredRange'] =
    avgRangePref <= 250 ? 'Mêlée' : avgRangePref >= 470 ? 'Distance' : 'Mixte';
  const preferredDamage: PlayerGameplayDna['preferredDamage'] =
    avgPhysPref >= 62 ? 'Physique' : avgMagPref >= 62 ? 'Magique' : 'Hybride';

  const topWinningChampions = Array.from(playedWinStats.entries())
    .sort((a, b) => {
      const scoreA = a[1].wins * 1.4 + a[1].kdaSum / a[1].games;
      const scoreB = b[1].wins * 1.4 + b[1].kdaSum / b[1].games;
      return scoreB - scoreA;
    })
    .slice(0, 3)
    .map(([id]) => champLookup.get(id.toLowerCase())?.name || id);

  let archetypeTitle = 'Stratège Polyvalent';
  let archetypeSummary =
    'Profil équilibré capable d’alterner pression en lane et présence autour des objectifs.';

  if (assistSharePct >= 64 && (avgCcAffinity >= 60 || dominantRole === 'SUPPORT')) {
    archetypeTitle = 'Pilier d’Équipe & Contrôle';
    archetypeSummary = `Vous brillez quand vous créez des ouvertures pour votre équipe (${assistSharePct}% de participation par assists et forte affinité contrôle).`;
  } else if (avgTankinessAffinity >= 62 || avgSustainAffinity >= 64) {
    archetypeTitle = 'Colosse Durable & Frontline';
    archetypeSummary = `Vous êtes plus efficace avec des champions robustes capables d’encaisser les échanges et de tenir la ligne (${avgTankinessAffinity}/100 d’affinité résistance).`;
  } else if (preferredRange === 'Distance' && avgKills >= 5.5) {
    archetypeTitle = 'Carry Tactique À Distance';
    archetypeSummary = `Votre style privilégie les dégâts à bonne distance et le positionnement en fin de combat (${avgCsPerMin} CS/min).`;
  } else if (avgBurstAffinity >= 65 && avgKills >= 5.0) {
    archetypeTitle = 'Chasseur d’Ouvertures & Escarmouches';
    archetypeSummary = `Vous recherchez les duels rapides et la punition des cibles isolées (${avgKills.toFixed(1)} éliminations/match).`;
  } else if (avgVisionPerMin >= 1.0 && assistSharePct >= 55) {
    archetypeTitle = 'Chef d’Orchestre & Contrôle de Carte';
    archetypeSummary = `Votre bonne lecture de carte (${avgVisionPerMin} vision/min) valorise les champions d’utilitaire et de tempo.`;
  }

  const targetRoles: Role[] =
    roleFilter !== 'AUTO'
      ? [roleFilter]
      : secondaryRole
        ? [dominantRole, secondaryRole]
        : [dominantRole];

  const needsSafety = avgDeaths >= 6.0 || isolatedDeathPct >= 34;
  const lowFarmDependency = avgCsPerMin < 5.7;
  const playerKdaAvg = (avgKills + avgAssists) / Math.max(1, avgDeaths);

  const scored = allChampions
    .map((champ): ChampionPlaystyleRecommendation | null => {
      const champRoles = getChampionPossibleRoles(champ);
      const matchedRole =
        roleFilter !== 'AUTO'
          ? champRoles.includes(roleFilter)
            ? roleFilter
            : null
          : champRoles.find((r) => targetRoles.includes(r)) || null;

      if (!matchedRole) return null;

      const playedCount = playedCounts.get(champ.id) || 0;
      if (!includeAlreadyPlayed && playedCount >= 3) {
        return null;
      }

      const mast = masteryByKey.get(Number(champ.key));
      const prof = classifyChampionProfile(champ);
      let score = 52;

      if (roleFilter === 'AUTO') {
        score += matchedRole === dominantRole ? 14 : 6;
      } else {
        score += 12;
      }

      const tankDiff = Math.abs(prof.tankinessScore - avgTankinessAffinity);
      const ccDiff = Math.abs(prof.ccScore - avgCcAffinity);
      const sustainDiff = Math.abs(prof.sustainScore - avgSustainAffinity);
      const burstDiff = Math.abs(prof.burstScore - avgBurstAffinity);
      score += Math.max(0, 14 - Math.round((tankDiff + ccDiff + sustainDiff + burstDiff) / 14));

      if (assistSharePct >= 62 && (prof.ccScore >= 65 || prof.sustainScore >= 65 || champ.tags.includes('Support'))) {
        score += 10;
      }

      let gameplayBenefit = 'Complète efficacement votre rotation habituelle.';
      if (needsSafety) {
        if (prof.tankinessScore >= 68 || prof.sustainScore >= 70) {
          score += 11;
          gameplayBenefit = `Absorbe les erreurs de placement (utile face à vos ${avgDeaths} morts/match).`;
        } else if (champ.stats.attackrange >= 525 && prof.ccScore >= 50) {
          score += 9;
          gameplayBenefit = `Permet d’impacter à distance (${champ.stats.attackrange} u.) sans vous exposer.`;
        }
      } else if (lowFarmDependency && matchedRole !== 'ADC') {
        if (prof.ccScore >= 65 || champ.tags.includes('Support') || matchedRole === 'JUNGLE') {
          score += 8;
          gameplayBenefit = 'Reste très utile en combat même avec une économie modérée.';
        }
      } else if (prof.primaryDamage !== preferredDamage && preferredDamage !== 'Hybride') {
        score += 5;
        gameplayBenefit = `Apporte des dégâts ${prof.primaryDamage.toLowerCase()} pour diversifier vos drafts.`;
      } else if (prof.ccScore >= 70) {
        gameplayBenefit = 'Offre un contrôle fiable pour sécuriser Dragons et Nashors.';
      }

      if (preferredRange === 'Distance' && champ.stats.attackrange >= 475) score += 5;
      if (preferredRange === 'Mêlée' && champ.stats.attackrange <= 250) score += 5;

      const targetMaxDiff = playerKdaAvg >= 2.8 && avgDeaths <= 5.2 ? 8 : 6;
      if (champ.info.difficulty <= targetMaxDiff) {
        score += 6;
      } else if (champ.info.difficulty >= 9 && avgDiffPref < 6.5) {
        score -= 10;
      }

      // Bonus si le joueur a déjà une belle maîtrise historique Riot (pépite oubliée)
      if (mast && playedCount === 0 && mast.championPoints >= 15000) {
        score += 7;
        gameplayBenefit = `Vous avez déjà ${Math.round(mast.championPoints / 1000)}k pts de maîtrise dessus : retour rentable immédiat.`;
      }

      if (!includeAlreadyPlayed && playedCount > 0) {
        score -= playedCount * 3;
      }

      let styleLabel = `${prof.primaryDamage}`;
      if (prof.ccScore >= 72 && prof.tankinessScore >= 66) {
        styleLabel = 'Frontline & Contrôle';
      } else if (prof.sustainScore >= 70 && champ.tags.includes('Support')) {
        styleLabel = 'Soin & Protection';
      } else if (prof.ccScore >= 72) {
        styleLabel = 'Contrôle & Peel';
      } else if (prof.tankinessScore >= 70 && prof.sustainScore >= 65) {
        styleLabel = 'Colosse & Sustain';
      } else if (prof.burstScore >= 78 && champ.stats.attackrange >= 500) {
        styleLabel = 'Mage Burst / Zone';
      } else if (prof.burstScore >= 78) {
        styleLabel = 'Assassin / Pression';
      } else if (champ.tags.includes('Marksman')) {
        styleLabel = 'DPS Soutenu';
      } else {
        styleLabel = `${champ.tags[0] || 'Polyvalent'} · ${prof.primaryDamage}`;
      }

      const refChamp = topWinningChampions[0];
      const reasonParts: string[] = [];
      if (assistSharePct >= 62 && (prof.ccScore >= 62 || champ.tags.includes('Support'))) {
        reasonParts.push(`Votre jeu collectif (${assistSharePct}% d’assists) valorise son utilitaire`);
      } else if (prof.tankinessScore >= 68 && avgTankinessAffinity >= 58) {
        reasonParts.push(`Votre goût pour les champions durables s’accorde à sa robustesse`);
      } else if (champ.stats.attackrange >= 525 && preferredRange === 'Distance') {
        reasonParts.push(`Sa portée (${champ.stats.attackrange} u.) respecte votre placement à distance`);
      } else {
        reasonParts.push(`Adapté à votre rythme (${avgCsPerMin} CS/min · ${avgVisionPerMin} vis/min)`);
      }

      if (refChamp && refChamp.toLowerCase() !== champ.name.toLowerCase()) {
        reasonParts.push(`proche de vos réussites sur ${refChamp}`);
      }

      return {
        champion: champ,
        recommendedRole: matchedRole,
        matchScore: Math.max(68, Math.min(98, score)),
        styleLabel,
        whyItFits: `${reasonParts.join(', ')}.`,
        gameplayBenefit,
        alreadyPlayedGames: playedCount,
        masteryLevel: mast?.championLevel,
        masteryPoints: mast?.championPoints,
      };
    })
    .filter((item): item is ChampionPlaystyleRecommendation => item !== null)
    .sort((a, b) => b.matchScore - a.matchScore || a.champion.info.difficulty - b.champion.info.difficulty);

  const finalRecommendations =
    scored.length >= 4 || includeAlreadyPlayed
      ? scored.slice(0, 4)
      : analyzePlayerPlaystyleAndRecommendChampions(matches, allChampions, roleFilter, true, masteries)
          .recommendations;

  return {
    dna: {
      gamesAnalyzed,
      dominantRole,
      secondaryRole,
      archetypeTitle,
      archetypeSummary,
      assistSharePct,
      avgDeaths,
      isolatedDeathPct,
      avgCsPerMin,
      avgVisionPerMin,
      preferredRange,
      preferredDamage,
      avgTankinessAffinity,
      avgCcAffinity,
      avgSustainAffinity,
      avgBurstAffinity,
      topWinningChampions,
    },
    recommendations: finalRecommendations,
  };
}

/**
 * Assistant de Draft rapide : suggère les 3 meilleurs picks dans un rôle donné
 * pour contrer la composition ennemie tout en tenant compte de l'historique du joueur.
 */
export function recommendCounterPicksForEnemyComp(params: {
  allChampions: ChampionSummary[];
  role: Role;
  enemyChampions: ChampionSummary[];
  tendencies?: PlayerTendencies;
  excludeChampionIds?: string[];
}): DraftCounterPickRecommendation[] {
  const { allChampions, role, enemyChampions, tendencies, excludeChampionIds = [] } = params;
  if (enemyChampions.length === 0) return [];

  const excludeSet = new Set(excludeChampionIds.map((id) => id.toLowerCase()));
  const enemyProfiles = enemyChampions.map(classifyChampionProfile);
  const tankCount = enemyProfiles.filter((p) => p.tankinessScore >= 68).length;
  const burstCount = enemyProfiles.filter((p) => p.burstScore >= 75).length;
  const highHealCount = enemyProfiles.filter((p) => p.sustainScore >= 70).length;
  const avgEnemyPhys =
    enemyProfiles.reduce((acc, p) => acc + p.physicalScore, 0) / enemyProfiles.length;
  const avgEnemyMag =
    enemyProfiles.reduce((acc, p) => acc + p.magicScore, 0) / enemyProfiles.length;
  const avgEnemyRange =
    enemyChampions.reduce((acc, c) => acc + c.stats.attackrange, 0) / enemyChampions.length;

  const poolStatsMap = new Map<string, { winRate: number; games: number }>();
  for (const cs of tendencies?.championStats || []) {
    poolStatsMap.set(cs.championName.toLowerCase(), { winRate: cs.winRate, games: cs.games });
  }

  return allChampions
    .filter((c) => !excludeSet.has(c.id.toLowerCase()) && getChampionPossibleRoles(c).includes(role))
    .map((champ) => {
      const prof = classifyChampionProfile(champ);
      let score = 56;
      const reasons: string[] = [];

      if (burstCount >= 2 && (prof.tankinessScore >= 65 || prof.ccScore >= 72 || champ.tags.includes('Support'))) {
        score += 14;
        if (prof.tankinessScore >= 68) {
          reasons.push(`absorbe le burst ennemi (${prof.tankinessScore}/100 tenue)`);
        } else if (prof.sustainScore >= 70) {
          reasons.push('protège la backline avec soins/boucliers contre le burst');
        } else {
          reasons.push('interrompt les assassins avec du contrôle ciblé');
        }
      }
      if (tankCount >= 2 && (prof.sustainScore >= 65 || champ.tags.includes('Marksman') || prof.primaryDamage === 'Hybride')) {
        score += 12;
        if (prof.primaryDamage === 'Hybride') {
          reasons.push('pression mixte AP/AD efficace face aux tanks');
        } else if (champ.tags.includes('Marksman')) {
          reasons.push('DPS soutenu idéal pour tomber la frontline');
        } else {
          reasons.push('tient les combats prolongés face aux tanks');
        }
      }
      if (highHealCount >= 2 && (prof.ccScore >= 68 || prof.burstScore >= 75)) {
        score += 9;
        if (prof.burstScore >= 75 && champ.info.magic >= 7) {
          reasons.push(`pression magique à distance (${champ.stats.attackrange} u.)`);
        } else if (prof.ccScore >= 72) {
          reasons.push('verrouille les cibles à fort soin via CC');
        } else {
          reasons.push('punit le soin ennemi par une pression constante');
        }
      }
      if (avgEnemyPhys >= 62 && prof.tankinessScore >= 66) {
        score += 8;
        reasons.push(`rentabilise l’armure (défense ${champ.info.defense}/10)`);
      } else if (avgEnemyMag >= 62 && (prof.sustainScore >= 65 || champ.stats.attackrange >= 525)) {
        score += 7;
        reasons.push('gère bien les échanges contre les mages');
      }
      if (avgEnemyRange <= 280 && champ.stats.attackrange >= 500) {
        score += 8;
        reasons.push(`punit leur mêlée grâce à ${champ.stats.attackrange} de portée`);
      }

      const poolEntry =
        poolStatsMap.get(champ.name.toLowerCase()) || poolStatsMap.get(champ.id.toLowerCase());
      if (poolEntry) {
        if (poolEntry.winRate >= 52) {
          score += 10;
          reasons.push(`dans votre pool (${poolEntry.winRate}% WR)`);
        } else {
          score += 4;
          reasons.push(`déjà joué (${poolEntry.games}p)`);
        }
      }

      if (champ.info.difficulty <= 6) {
        score += 4;
      }

      const styleLabel =
        prof.ccScore >= 72 && prof.tankinessScore >= 65
          ? 'Frontline & Peel'
          : prof.ccScore >= 72 && champ.info.magic >= 7
            ? 'Contrôle & Poke'
            : prof.ccScore >= 72
              ? 'Contrôle d’équipe'
              : prof.sustainScore >= 70 && champ.info.magic >= 7
                ? 'Sustain & Poke'
                : prof.sustainScore >= 70
                  ? 'Sustain / Tenue'
                  : prof.primaryDamage;

      const uniqueReasons = Array.from(new Set(reasons));
      const counterReason =
        uniqueReasons.length > 0
          ? `${uniqueReasons.slice(0, 2).join(' · ')}.`
          : `Profil ${prof.primaryDamage.toLowerCase()} (${champ.stats.attackrange} u.) adapté à ce match.`;

      return {
        champion: champ,
        fitScore: Math.max(66, Math.min(98, score)),
        styleLabel,
        counterReason: counterReason.charAt(0).toUpperCase() + counterReason.slice(1),
      } satisfies DraftCounterPickRecommendation;
    })
    .sort((a, b) => b.fitScore - a.fitScore || a.champion.info.difficulty - b.champion.info.difficulty)
    .slice(0, 3);
}
