import type {
  MatchRecord,
  PlayerTendencies,
  PostGameAnalysis,
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
 * Calcule les tendances agrégées du joueur sur son historique récent.
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
    };
  }

  let totalCsMin = 0;
  let totalDeaths = 0;
  let totalVisionMin = 0;
  let wins = 0;
  let totalMapDeaths = 0;
  let enemyJungleDeaths = 0;
  let preObjDeaths = 0;

  for (const m of matches) {
    const durMin = Math.max(1, m.gameDurationSec / 60);
    totalCsMin += m.player.csPerMin;
    totalDeaths += m.player.deaths;
    totalVisionMin += m.player.visionScore / durMin;
    if (m.player.win) wins += 1;

    const deathEvs = m.mapEvents.filter((e) => e.type === 'DEATH');
    totalMapDeaths += deathEvs.length;
    enemyJungleDeaths += deathEvs.filter((e) => e.isolated).length;
    preObjDeaths += deathEvs.filter((e) => e.nearObjectiveWindow).length;
  }

  const n = matches.length;
  return {
    avgCsPerMin: Number((totalCsMin / n).toFixed(2)),
    avgDeaths: Number((totalDeaths / n).toFixed(1)),
    avgVisionPerMin: Number((totalVisionMin / n).toFixed(2)),
    enemyJungleDeathRate: totalMapDeaths > 0 ? Number((enemyJungleDeaths / totalMapDeaths).toFixed(2)) : 0,
    preObjectiveDeathRate: totalMapDeaths > 0 ? Number((preObjDeaths / totalMapDeaths).toFixed(2)) : 0,
    winRate: Math.round((wins / n) * 100),
    gamesAnalyzed: n,
  };
}
