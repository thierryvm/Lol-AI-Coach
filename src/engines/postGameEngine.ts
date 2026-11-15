import type {
  CareerSynthesisDataset,
  CareerTrend,
  ChampionCareerStat,
  MatchRecord,
  PlayerTendencies,
  PostGameAnalysis,
  ProactiveAlert,
} from './types.ts';

/**
 * Traduit des coordonnées Riot Summoner's Rift (0..14870) en zone tactique lisible.
 */
export function classifySummonersRiftZone(x: number, y: number): string {
  // Base Alliée (bas-gauche) / Base Adverse (haut-droite)
  if (x < 2800 && y < 2800) return 'Base Bleue';
  if (x > 12000 && y > 12000) return 'Base Rouge';

  // Fosse Nashor & Dragon
  if (x > 4200 && x < 5800 && y > 9600 && y < 11200) return 'Rivière Top / Nashor';
  if (x > 9000 && x < 10800 && y > 3600 && y < 5200) return 'Rivière Bot / Dragon';

  // Lanes principales
  if ((x < 2600 && y >= 2800) || (y > 12200 && x <= 12000)) return 'Top Lane';
  if ((x > 12200 && y <= 12000) || (y < 2600 && x >= 2800)) return 'Bot Lane';
  if (Math.abs(x - y) < 1900) return 'Mid Lane';

  // Rivières
  if (Math.abs(x + y - 14870) < 1600) {
    return y > 7435 ? 'Rivière Top' : 'Rivière Bot';
  }

  // Jungles
  if (x + y < 14870) return 'Jungle Bleue';
  return 'Jungle Rouge';
}

/**
 * Analyse déterministe post-game d'un match (Match-V5 + Timeline) :
 * farming, placement, morts isolées, fenêtres d'objectifs et exercices concrets.
 */
export function analyzePostGameMatch(match: MatchRecord): PostGameAnalysis {
  const { player, laneOpponent, timelineSplits, mapEvents, gameDurationSec, participants } = match;
  const durationMin = Math.max(1, gameDurationSec / 60);

  const split10 = timelineSplits.find((s) => s.minute >= 10) || timelineSplits[0];
  const split15 = timelineSplits.find((s) => s.minute >= 15) || timelineSplits[timelineSplits.length - 1];

  const csAt10 = split10 ? split10.playerCs : Math.round(player.csPerMin * 10);
  const csAt15 = split15 ? split15.playerCs : Math.round(player.csPerMin * 15);
  const goldDiffAt15 = split15 ? split15.goldDiff : 0;

  const teamKills = Math.max(
    1,
    participants
      .filter((p) => p.teamId === player.teamId)
      .reduce((acc, p) => acc + p.kills, 0),
  );
  const killParticipation = Math.round(((player.kills + player.assists) / teamKills) * 100);
  const visionPerMin = Number((player.visionScore / durationMin).toFixed(2));

  const deathEvents = mapEvents.filter((e) => e.type === 'DEATH');
  const isolatedDeaths = deathEvents.filter((e) => e.isolated).length;
  const preObjectiveDeaths = deathEvents.filter((e) => e.nearObjectiveWindow).length;
  const overextendedDeaths = deathEvents.filter(
    (e) =>
      (player.teamId === 100 && e.x + e.y > 16500) ||
      (player.teamId === 200 && e.x + e.y < 13200),
  ).length;

  const zoneMap = new Map<string, { deaths: number; kills: number }>();
  for (const ev of mapEvents) {
    const cur = zoneMap.get(ev.zone) || { deaths: 0, kills: 0 };
    if (ev.type === 'DEATH') cur.deaths += 1;
    if (ev.type === 'KILL') cur.kills += 1;
    zoneMap.set(ev.zone, cur);
  }
  const zoneBreakdown = Array.from(zoneMap.entries())
    .map(([zone, counts]) => ({ zone, ...counts }))
    .sort((a, b) => b.deaths - a.deaths);

  const detectedMistakes: PostGameAnalysis['detectedMistakes'] = [];
  const strengths: string[] = [];

  // 1. Erreurs de farming
  const targetCsMin = player.teamPosition === 'UTILITY' ? 1.5 : player.teamPosition === 'JUNGLE' ? 6.0 : 7.0;
  if (player.teamPosition !== 'UTILITY' && player.csPerMin < targetCsMin) {
    const missedGoldEst = Math.round((targetCsMin - player.csPerMin) * durationMin * 21);
    detectedMistakes.push({
      category: 'Farming',
      severity: player.csPerMin < targetCsMin - 1.5 ? 'Critique' : 'Modérée',
      title: `Rythme de farming insuffisant (${player.csPerMin.toFixed(1)} CS/min)`,
      evidence: `Écart estimé à ~${missedGoldEst} po manqués par rapport au standard du rôle (${targetCsMin} CS/min).${
        laneOpponent ? ` Vis-à-vis : ${laneOpponent.csPerMin.toFixed(1)} CS/min.` : ''
      }`,
      drill: `Fixer vos rappels sur les vagues canon (minutes 3:30, 5:00, 6:30) et pousser la vague latérale avant chaque rotation mid-game.`,
    });
  } else {
    strengths.push(`Tenue de vague et économie solides (${player.csPerMin.toFixed(1)} CS/min).`);
  }

  // 2. Erreurs de placement (morts isolées / overextend)
  if (isolatedDeaths >= 2) {
    detectedMistakes.push({
      category: 'Placement',
      severity: isolatedDeaths >= 3 ? 'Critique' : 'Modérée',
      title: `${isolatedDeaths} morts isolées sans couverture alliée`,
      evidence: `Plusieurs éliminations subies en avancée profonde (${overextendedDeaths} en territoire adverse) sans contrôle de vision préalable.`,
      drill: `Appliquer la règle de la ligne médiane : ne jamais dépasser la rivière en side-lane si 2+ ennemis sont invisibles sur la minimap.`,
    });
  }

  // 3. Morts avant objectif
  if (preObjectiveDeaths >= 1) {
    detectedMistakes.push({
      category: 'Objectifs',
      severity: preObjectiveDeaths >= 2 ? 'Critique' : 'Modérée',
      title: `${preObjectiveDeaths} mort(s) juste avant l'apparition d'un objectif majeur`,
      evidence: `Décès enregistrés moins de 45 secondes avant un Dragon ou Baron, privant l'équipe de pression numérique.`,
      drill: `Revenir à la base 55 secondes avant le timer Dragon/Baron pour poser la vision avec vos coéquipiers plutôt que de pousser seul.`,
    });
  }

  // 4. Vision
  const targetVision = player.teamPosition === 'UTILITY' ? 1.6 : 0.75;
  if (visionPerMin < targetVision) {
    detectedMistakes.push({
      category: 'Vision',
      severity: 'Modérée',
      title: `Score de vision perfectible (${visionPerMin} / min)`,
      evidence: `${player.wardsPlaced} balises posées et ${player.wardsKilled} détruites sur ${Math.round(durationMin)} minutes.`,
      drill: `Acheter systématiquement 1 Balise de contrôle à chaque rappel après la 8e minute et l'installer sur l'entrée jungle la plus disputée.`,
    });
  } else {
    strengths.push(`Contrôle de vision régulier (${visionPerMin} points de vision/min).`);
  }

  if (killParticipation >= 60) {
    strengths.push(`Forte présence dans les escarmouches (${killParticipation}% de participation aux éliminations).`);
  }
  if (goldDiffAt15 >= 400) {
    strengths.push(`Avantage économique construit en phase de lane (+${goldDiffAt15} po à 15 min).`);
  }

  return {
    matchId: match.matchId,
    csPerMin: player.csPerMin,
    csAt10,
    csAt15,
    goldDiffAt15,
    killParticipation,
    visionPerMin,
    isolatedDeaths,
    preObjectiveDeaths,
    overextendedDeaths,
    zoneBreakdown,
    detectedMistakes,
    strengths,
  };
}

/**
 * Calcule les tendances agrégées du joueur sur l'ensemble de son historique archivé,
 * incluant les statistiques par champion, la progression temporelle et les alertes proactives.
 */
export function computePlayerTendencies(matches: MatchRecord[]): PlayerTendencies {
  if (matches.length === 0) {
    return {
      avgCsPerMin: 0,
      avgDeaths: 0,
      avgVisionPerMin: 0,
      enemyJungleDeathRate: 0,
      preObjectiveDeathRate: 0,
      winRate: 0,
      gamesAnalyzed: 0,
      championStats: [],
      trend: null,
      proactiveAlerts: [],
    };
  }

  const ordered = [...matches].sort((a, b) => b.gameCreation - a.gameCreation);
  let totalCsMin = 0;
  let totalDeaths = 0;
  let totalVisionMin = 0;
  let wins = 0;
  let totalMapDeaths = 0;
  let enemyJungleDeaths = 0;
  let preObjDeaths = 0;

  const champAcc = new Map<
    string,
    {
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      csPerMin: number;
      visionPerMin: number;
    }
  >();

  for (const m of ordered) {
    const durMin = Math.max(1, m.gameDurationSec / 60);
    const visMin = m.player.visionScore / durMin;
    totalCsMin += m.player.csPerMin;
    totalDeaths += m.player.deaths;
    totalVisionMin += visMin;
    if (m.player.win) wins += 1;

    const deathEvs = m.mapEvents.filter((e) => e.type === 'DEATH');
    totalMapDeaths += deathEvs.length;
    enemyJungleDeaths += deathEvs.filter((e) => e.isolated).length;
    preObjDeaths += deathEvs.filter((e) => e.nearObjectiveWindow).length;

    const cName = m.player.championName;
    const prev = champAcc.get(cName) || {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      csPerMin: 0,
      visionPerMin: 0,
    };
    prev.games += 1;
    if (m.player.win) prev.wins += 1;
    prev.kills += m.player.kills;
    prev.deaths += m.player.deaths;
    prev.assists += m.player.assists;
    prev.csPerMin += m.player.csPerMin;
    prev.visionPerMin += visMin;
    champAcc.set(cName, prev);
  }

  const n = ordered.length;
  const avgCsPerMin = Number((totalCsMin / n).toFixed(2));
  const avgDeaths = Number((totalDeaths / n).toFixed(1));
  const avgVisionPerMin = Number((totalVisionMin / n).toFixed(2));
  const enemyJungleDeathRate =
    totalMapDeaths > 0 ? Number((enemyJungleDeaths / totalMapDeaths).toFixed(2)) : 0;
  const preObjectiveDeathRate =
    totalMapDeaths > 0 ? Number((preObjDeaths / totalMapDeaths).toFixed(2)) : 0;
  const winRate = Math.round((wins / n) * 100);

  const championStats: ChampionCareerStat[] = Array.from(champAcc.entries())
    .map(([championName, s]) => {
      const avgK = Number((s.kills / s.games).toFixed(1));
      const avgD = Number((s.deaths / s.games).toFixed(1));
      const avgA = Number((s.assists / s.games).toFixed(1));
      const kdaRatio = Number(((s.kills + s.assists) / Math.max(1, s.deaths)).toFixed(2));
      return {
        championName,
        games: s.games,
        wins: s.wins,
        winRate: Math.round((s.wins / s.games) * 100),
        avgKills: avgK,
        avgDeaths: avgD,
        avgAssists: avgA,
        kdaRatio,
        avgCsPerMin: Number((s.csPerMin / s.games).toFixed(2)),
        avgVisionPerMin: Number((s.visionPerMin / s.games).toFixed(2)),
      };
    })
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate);

  // Progression temporelle (comparaison des parties récentes vs plus anciennes)
  let trend: CareerTrend | null = null;
  if (n >= 6) {
    const splitIdx = Math.min(5, Math.floor(n / 2));
    const recent = ordered.slice(0, splitIdx);
    const earlier = ordered.slice(splitIdx);

    const calcSubset = (list: MatchRecord[]) => {
      const len = Math.max(1, list.length);
      const wr = (list.filter((m) => m.player.win).length / len) * 100;
      const d = list.reduce((acc, m) => acc + m.player.deaths, 0) / len;
      const cs = list.reduce((acc, m) => acc + m.player.csPerMin, 0) / len;
      const vis =
        list.reduce((acc, m) => acc + m.player.visionScore / Math.max(1, m.gameDurationSec / 60), 0) /
        len;
      return { wr, d, cs, vis };
    };

    const rStats = calcSubset(recent);
    const eStats = calcSubset(earlier);
    trend = {
      recentGames: recent.length,
      earlierGames: earlier.length,
      winRateDelta: Math.round(rStats.wr - eStats.wr),
      deathsDelta: Number((rStats.d - eStats.d).toFixed(1)),
      csPerMinDelta: Number((rStats.cs - eStats.cs).toFixed(2)),
      visionDelta: Number((rStats.vis - eStats.vis).toFixed(2)),
    };
  }

  // Génération d'alertes proactives sur l'ensemble de la carrière analysée
  const proactiveAlerts: ProactiveAlert[] = [];

  if (avgDeaths >= 6.5) {
    proactiveAlerts.push({
      id: 'survival-deaths',
      priority: 'Haute',
      area: 'Survie',
      title: `Mortalité élevée sur ${n} parties (${avgDeaths} morts/match)`,
      detail: `Votre moyenne de ${avgDeaths} morts réduit vos fenêtres de pression et offre de l'or de prime.`,
      recommendation:
        'Privilégiez des runes défensives (Plaque d’os / Second souffle) et un objet de survie dès le 2e slot.',
    });
  }

  if (preObjectiveDeathRate >= 0.25) {
    proactiveAlerts.push({
      id: 'pre-obj-deaths',
      priority: 'Haute',
      area: 'Objectifs',
      title: `${Math.round(preObjectiveDeathRate * 100)}% de vos morts surviennent avant un objectif`,
      detail:
        'Des éliminations subies 30–60s avant Dragon ou Nashor privent votre équipe de contestation.',
      recommendation:
        'Faites votre reset 55 secondes avant le spawn Dragon/Nashor pour sécuriser la vision en premier.',
    });
  }

  if (enemyJungleDeathRate >= 0.35) {
    proactiveAlerts.push({
      id: 'overextend-deaths',
      priority: 'Moyenne',
      area: 'Survie',
      title: `${Math.round(enemyJungleDeathRate * 100)}% de morts isolées / sans vision`,
      detail:
        'Une part importante de vos morts arrive loin d’un allié ou en zone adverse non éclairée.',
      recommendation:
        'Poussez la vague puis revenez dans le brouillard de guerre allié tant que la position du jungler est inconnue.',
    });
  }

  const nonSupportMatches = ordered.filter(
    (m) => m.player.teamPosition !== 'UTILITY' && m.player.teamPosition !== 'SUPPORT',
  );
  if (nonSupportMatches.length >= 3) {
    const soloCs =
      nonSupportMatches.reduce((acc, m) => acc + m.player.csPerMin, 0) / nonSupportMatches.length;
    if (soloCs < 5.8) {
      proactiveAlerts.push({
        id: 'cs-pace',
        priority: 'Moyenne',
        area: 'Farming',
        title: `Rythme de CS perfectible hors Support (${soloCs.toFixed(1)} CS/min)`,
        detail:
          'Atteindre 6.5+ CS/min garantit ~500 PO supplémentaires à 15 minutes sans prendre de risque.',
        recommendation:
          'Travaillez les last-hits sous tour et récupérez les vagues latérales entre les objectifs.',
      });
    }
  }

  if (avgVisionPerMin < 0.75) {
    proactiveAlerts.push({
      id: 'vision-control',
      priority: 'Moyenne',
      area: 'Vision',
      title: `Contrôle de vision à renforcer (${avgVisionPerMin} / min)`,
      detail:
        'Un score inférieur à 0.75/min expose votre équipe aux embuscades lors des rotations mid-game.',
      recommendation:
        'Achetez 1 Balise de contrôle à chaque back avec 75 PO et posez vos trinkets à l’entrée de rivière.',
    });
  }

  // Focus champion le plus performant ou à retravailler
  const bestChamp = championStats.find((c) => c.games >= 2 && c.winRate >= 55);
  if (bestChamp) {
    proactiveAlerts.push({
      id: `best-champ-${bestChamp.championName}`,
      priority: 'Positif',
      area: 'Champion Pool',
      title: `${bestChamp.championName} est votre valeur sûre (${bestChamp.winRate}% WR sur ${bestChamp.games}p)`,
      detail: `KDA moyen de ${bestChamp.kdaRatio} (${bestChamp.avgKills}/${bestChamp.avgDeaths}/${bestChamp.avgAssists}).`,
      recommendation: `Capitalisez sur ${bestChamp.championName} en Classée et affinez ses variantes de runes situationnelles.`,
      championTarget: bestChamp.championName,
    });
  }

  const strugglingChamp = championStats.find((c) => c.games >= 2 && c.winRate <= 40);
  if (strugglingChamp) {
    proactiveAlerts.push({
      id: `struggle-champ-${strugglingChamp.championName}`,
      priority: 'Moyenne',
      area: 'Champion Pool',
      title: `Ajustement conseillé sur ${strugglingChamp.championName} (${strugglingChamp.winRate}% WR sur ${strugglingChamp.games}p)`,
      detail: `Moyenne de ${strugglingChamp.avgDeaths} morts/match et ${strugglingChamp.avgCsPerMin} CS/min.`,
      recommendation: `Testez une page de runes alternative et un build plus défensif dans l'Optimiseur pour ${strugglingChamp.championName}.`,
      championTarget: strugglingChamp.championName,
    });
  }

  return {
    avgCsPerMin,
    avgDeaths,
    avgVisionPerMin,
    enemyJungleDeathRate,
    preObjectiveDeathRate,
    winRate,
    gamesAnalyzed: n,
    championStats,
    trend,
    proactiveAlerts: proactiveAlerts.slice(0, 5),
  };
}

/**
 * Agrège l'ensemble des matchs stockés localement (zones de mort cumulées, phases de jeu,
 * écarts à 15 min, pool de champions et résumé par match) pour la synthèse globale IA.
 */
export function buildCareerSynthesisDataset(
  matches: MatchRecord[],
  tendenciesInput?: PlayerTendencies,
): CareerSynthesisDataset {
  const ordered = [...matches].sort((a, b) => b.gameCreation - a.gameCreation);
  const tendencies = tendenciesInput || computePlayerTendencies(ordered);

  let wins = 0;
  let totalDeaths = 0;
  let isolatedDeathsTotal = 0;
  let preObjDeathsTotal = 0;
  let earlyDeaths = 0;
  let midDeaths = 0;
  let lateDeaths = 0;

  let gold15Sum = 0;
  let cs15Sum = 0;
  let split15Count = 0;

  const zoneAcc = new Map<
    string,
    { deaths: number; isolatedDeaths: number; preObjectiveDeaths: number; kills: number }
  >();

  const matchDigests: CareerSynthesisDataset['matchDigests'] = [];

  for (const m of ordered) {
    if (m.player.win) wins += 1;
    const durMin = Math.max(1, m.gameDurationSec / 60);
    const visPerMin = Number((m.player.visionScore / durMin).toFixed(2));

    const split15 =
      m.timelineSplits.find((s) => s.minute >= 15) ||
      (m.timelineSplits.length > 0 ? m.timelineSplits[m.timelineSplits.length - 1] : null);
    if (split15) {
      gold15Sum += split15.goldDiff;
      cs15Sum += split15.csDiff;
      split15Count += 1;
    }

    const perMatchZoneDeaths = new Map<string, number>();
    let mIsolated = 0;
    let mPreObj = 0;

    for (const ev of m.mapEvents) {
      const zoneName = ev.zone || classifySummonersRiftZone(ev.x, ev.y);
      const cur = zoneAcc.get(zoneName) || {
        deaths: 0,
        isolatedDeaths: 0,
        preObjectiveDeaths: 0,
        kills: 0,
      };
      if (ev.type === 'DEATH') {
        totalDeaths += 1;
        cur.deaths += 1;
        perMatchZoneDeaths.set(zoneName, (perMatchZoneDeaths.get(zoneName) || 0) + 1);
        if (ev.isolated) {
          isolatedDeathsTotal += 1;
          cur.isolatedDeaths += 1;
          mIsolated += 1;
        }
        if (ev.nearObjectiveWindow) {
          preObjDeathsTotal += 1;
          cur.preObjectiveDeaths += 1;
          mPreObj += 1;
        }
        if (ev.minute < 12) earlyDeaths += 1;
        else if (ev.minute < 24) midDeaths += 1;
        else lateDeaths += 1;
      } else if (ev.type === 'KILL' || ev.type === 'ASSIST') {
        cur.kills += 1;
      }
      zoneAcc.set(zoneName, cur);
    }

    let topDeathZone: string | null = null;
    let topCount = 0;
    for (const [z, c] of perMatchZoneDeaths.entries()) {
      if (c > topCount) {
        topDeathZone = z;
        topCount = c;
      }
    }

    matchDigests.push({
      date: m.gameCreation
        ? new Date(m.gameCreation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
        : '',
      champion: m.player.championName,
      role: m.player.teamPosition,
      win: m.player.win,
      kda: `${m.player.kills}/${m.player.deaths}/${m.player.assists}`,
      csPerMin: Number(m.player.csPerMin.toFixed(1)),
      visionPerMin: visPerMin,
      goldDiffAt15: split15 ? split15.goldDiff : null,
      isolatedDeaths: mIsolated,
      preObjectiveDeaths: mPreObj,
      topDeathZone,
    });
  }

  const zoneTotals = Array.from(zoneAcc.entries())
    .map(([zone, stats]) => ({
      zone,
      deaths: stats.deaths,
      isolatedDeaths: stats.isolatedDeaths,
      preObjectiveDeaths: stats.preObjectiveDeaths,
      kills: stats.kills,
    }))
    .filter((z) => z.deaths > 0 || z.kills > 0)
    .sort((a, b) => b.deaths - a.deaths || b.kills - a.kills);

  const n = ordered.length;
  return {
    gamesAnalyzed: n,
    wins,
    losses: Math.max(0, n - wins),
    winRate: tendencies.winRate,
    avgDeaths: tendencies.avgDeaths,
    avgCsPerMin: tendencies.avgCsPerMin,
    avgVisionPerMin: tendencies.avgVisionPerMin,
    avgGoldDiffAt15: split15Count > 0 ? Math.round(gold15Sum / split15Count) : null,
    avgCsDiffAt15: split15Count > 0 ? Number((cs15Sum / split15Count).toFixed(1)) : null,
    isolatedDeathPct:
      totalDeaths > 0 ? Math.round((isolatedDeathsTotal / totalDeaths) * 100) : Math.round(tendencies.enemyJungleDeathRate * 100),
    preObjectiveDeathPct:
      totalDeaths > 0 ? Math.round((preObjDeathsTotal / totalDeaths) * 100) : Math.round(tendencies.preObjectiveDeathRate * 100),
    phaseDeaths: {
      early0To12m: earlyDeaths,
      mid12To24m: midDeaths,
      late24mPlus: lateDeaths,
    },
    zoneTotals,
    championStats: tendencies.championStats || [],
    trend: tendencies.trend || null,
    matchDigests: matchDigests.slice(0, 45),
  };
}

