import { filterStandardCareerMatches } from './postGameEngine.ts';
import type { MatchRecord, Role } from './types.ts';

export interface PerformanceAxis {
  id: 'combat' | 'farming' | 'vision' | 'survival' | 'objectives';
  label: string;
  shortLabel: string;
  score: number; // 0..100
  benchmarkLabel: string;
  actualLabel: string;
}

export interface MobalyticsStyleProfile {
  gamesAnalyzed: number;
  dominantRole: Role;
  axes: PerformanceAxis[];
  avgDamageSharePct: number;
  avgKillParticipationPct: number;
  avgCsPerMin: number;
  avgVisionPerMin: number;
  avgDeaths: number;
  isolatedDeathPct: number;
  strongestAxis: PerformanceAxis;
  weakestAxis: PerformanceAxis;
  actionTip: string;
}

export interface FrequentTeammateStat {
  riotId: string;
  gamesTogether: number;
  winsTogether: number;
  winRate: number;
  avgPlayerKda: number;
  avgAllyKda: number;
  favoriteCombo: string;
  lastPlayedAt: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeRole(pos: string | undefined, fallback: Role): Role {
  const upper = (pos || '').toUpperCase();
  if (upper === 'TOP') return 'TOP';
  if (upper === 'JUNGLE') return 'JUNGLE';
  if (upper === 'MIDDLE' || upper === 'MID') return 'MID';
  if (upper === 'BOTTOM' || upper === 'ADC') return 'ADC';
  if (upper === 'UTILITY' || upper === 'SUPPORT') return 'SUPPORT';
  return fallback;
}

export function computeMobalyticsStyleProfile(
  matches: MatchRecord[],
  fallbackRole: Role = 'MID',
): MobalyticsStyleProfile | null {
  if (!matches || matches.length === 0) return null;

  const sample = filterStandardCareerMatches(matches).slice(0, 20);
  const roleCounts = new Map<Role, number>();

  let sumDamageShare = 0;
  let sumKp = 0;
  let sumCsPerMin = 0;
  let sumVisionPerMin = 0;
  let sumDeaths = 0;
  let sumKda = 0;
  let totalDeathsInMap = 0;
  let isolatedDeaths = 0;
  let preObjectiveDeaths = 0;
  let wins = 0;

  for (const m of sample) {
    const r = normalizeRole(m.player.teamPosition, fallbackRole);
    roleCounts.set(r, (roleCounts.get(r) || 0) + 1);

    const allies = m.participants.filter((p) => p.teamId === m.player.teamId);
    const teamKills = Math.max(
      1,
      allies.reduce((acc, p) => acc + (p.kills || 0), 0),
    );
    const teamDamage = Math.max(
      1,
      allies.reduce((acc, p) => acc + (p.totalDamageDealtToChampions || 0), 0),
    );

    const kp = clamp(
      ((m.player.kills + m.player.assists) / teamKills) * 100,
      0,
      100,
    );
    const dmgShare = clamp(
      (m.player.totalDamageDealtToChampions / teamDamage) * 100,
      0,
      100,
    );

    sumKp += kp;
    sumDamageShare += dmgShare;
    sumCsPerMin += m.player.csPerMin || 0;
    const durationMin = Math.max(1, (m.gameDurationSec || 1200) / 60);
    sumVisionPerMin += (m.player.visionScore || 0) / durationMin;
    sumDeaths += m.player.deaths || 0;
    sumKda += (m.player.kills + m.player.assists) / Math.max(1, m.player.deaths);
    if (m.player.win) wins += 1;

    for (const ev of m.mapEvents || []) {
      if (ev.type === 'DEATH') {
        totalDeathsInMap += 1;
        if (ev.isolated) isolatedDeaths += 1;
        if (ev.nearObjectiveWindow) preObjectiveDeaths += 1;
      }
    }
  }

  let dominantRole: Role = fallbackRole;
  let topCount = -1;
  for (const [r, cnt] of roleCounts.entries()) {
    if (cnt > topCount) {
      topCount = cnt;
      dominantRole = r;
    }
  }

  const n = sample.length;
  const avgDamageSharePct = Number((sumDamageShare / n).toFixed(1));
  const avgKillParticipationPct = Number((sumKp / n).toFixed(1));
  const avgCsPerMin = Number((sumCsPerMin / n).toFixed(1));
  const avgVisionPerMin = Number((sumVisionPerMin / n).toFixed(2));
  const avgDeaths = Number((sumDeaths / n).toFixed(1));
  const avgKda = sumKda / n;
  const winRatePct = (wins / n) * 100;

  const isolatedDeathPct =
    totalDeathsInMap > 0 ? Math.round((isolatedDeaths / totalDeathsInMap) * 100) : 0;
  const preObjDeathPct =
    totalDeathsInMap > 0 ? Math.round((preObjectiveDeaths / totalDeathsInMap) * 100) : 0;

  // Benchmarks réalistes par rôle
  const csTarget =
    dominantRole === 'SUPPORT'
      ? 1.5
      : dominantRole === 'JUNGLE'
        ? 5.8
        : 6.8;
  const visionTarget = dominantRole === 'SUPPORT' ? 1.85 : dominantRole === 'JUNGLE' ? 0.95 : 0.72;
  const dmgTarget = dominantRole === 'SUPPORT' ? 12 : dominantRole === 'TOP' ? 22 : 25;
  const kpTarget = dominantRole === 'SUPPORT' || dominantRole === 'JUNGLE' ? 62 : 52;

  const combatScore = Math.round(
    clamp(
      (avgDamageSharePct / dmgTarget) * 40 +
        (avgKillParticipationPct / kpTarget) * 35 +
        (avgKda / 3.4) * 25,
      18,
      98,
    ),
  );

  const farmingScore = Math.round(
    dominantRole === 'SUPPORT'
      ? clamp(62 + (avgKillParticipationPct - 45) * 0.65, 25, 96)
      : clamp((avgCsPerMin / csTarget) * 84, 15, 98),
  );

  const visionScore = Math.round(clamp((avgVisionPerMin / visionTarget) * 82, 18, 98));

  const survivalScore = Math.round(
    clamp(100 - avgDeaths * 8.2 - isolatedDeathPct * 0.35, 16, 98),
  );

  const objectivesScore = Math.round(
    clamp(winRatePct * 0.62 + 44 - preObjDeathPct * 0.55, 20, 98),
  );

  const axes: PerformanceAxis[] = [
    {
      id: 'combat',
      label: 'Combat & Impact',
      shortLabel: 'Combat',
      score: combatScore,
      benchmarkLabel: `${dmgTarget}% dégâts · ${kpTarget}% KP`,
      actualLabel: `${avgDamageSharePct}% dégâts · ${avgKillParticipationPct}% KP`,
    },
    {
      id: 'farming',
      label: dominantRole === 'SUPPORT' ? 'Économie & Rythme' : 'Farming & Or',
      shortLabel: dominantRole === 'SUPPORT' ? 'Éco' : 'Farm',
      score: farmingScore,
      benchmarkLabel: dominantRole === 'SUPPORT' ? 'Présence escarmouches' : `${csTarget} CS/min`,
      actualLabel: `${avgCsPerMin} CS/min`,
    },
    {
      id: 'vision',
      label: 'Vision & Contrôle',
      shortLabel: 'Vision',
      score: visionScore,
      benchmarkLabel: `${visionTarget.toFixed(2)} vis./min`,
      actualLabel: `${avgVisionPerMin.toFixed(2)} vis./min`,
    },
    {
      id: 'survival',
      label: 'Survie & Placement',
      shortLabel: 'Survie',
      score: survivalScore,
      benchmarkLabel: '≤ 4.5 morts · <25% isolées',
      actualLabel: `${avgDeaths} morts · ${isolatedDeathPct}% isolées`,
    },
    {
      id: 'objectives',
      label: 'Objectifs & Régularité',
      shortLabel: 'Objectifs',
      score: objectivesScore,
      benchmarkLabel: '52%+ WR · <20% pré-obj.',
      actualLabel: `${Math.round(winRatePct)}% WR · ${preObjDeathPct}% pré-obj.`,
    },
  ];

  const sorted = [...axes].sort((a, b) => b.score - a.score);
  const strongestAxis = sorted[0];
  const weakestAxis = sorted[sorted.length - 1];

  const drillByAxis: Record<PerformanceAxis['id'], string> = {
    combat:
      'Rejoignez les escarmouches rivière 15s plus tôt pour augmenter votre part de participation aux kills.',
    farming:
      'Consolidez vos vagues latérales avant chaque rappel pour monter votre moyenne de CS/min.',
    vision:
      'Achetez une Balise de contrôle à chaque passage en base et posez vos balises 45s avant le Dragon.',
    survival:
      'Évitez d’avancer seul dans la jungle non éclairée : jouez avec un coéquipier ou la vague poussée.',
    objectives:
      'Priorisez votre survie entre -45s et l’apparition du Dragon/Baron pour ne jamais manquer le contest.',
  };

  return {
    gamesAnalyzed: n,
    dominantRole,
    axes,
    avgDamageSharePct,
    avgKillParticipationPct,
    avgCsPerMin,
    avgVisionPerMin,
    avgDeaths,
    isolatedDeathPct,
    strongestAxis,
    weakestAxis,
    actionTip: drillByAxis[weakestAxis.id],
  };
}

export function computeFrequentTeammates(
  matches: MatchRecord[],
  selfRiotId: string,
): FrequentTeammateStat[] {
  if (!matches || matches.length === 0) return [];
  const selfNorm = (selfRiotId || '').trim().toLowerCase();

  interface Accumulator {
    displayRiotId: string;
    games: number;
    wins: number;
    sumSelfKda: number;
    sumAllyKda: number;
    combos: Map<string, number>;
    lastPlayedAt: number;
  }

  const byAlly = new Map<string, Accumulator>();

  for (const m of filterStandardCareerMatches(matches)) {
    const selfPuuid = m.player.puuid;
    const allies = (m.participants || []).filter(
      (p) =>
        p.teamId === m.player.teamId &&
        p.puuid !== selfPuuid &&
        Boolean(p.riotIdGameName),
    );

    const selfKda = (m.player.kills + m.player.assists) / Math.max(1, m.player.deaths);

    for (const ally of allies) {
      const fullTag = ally.riotIdTagline
        ? `${ally.riotIdGameName}#${ally.riotIdTagline}`
        : ally.riotIdGameName;
      const key = fullTag.toLowerCase();
      if (!key || key === selfNorm) continue;

      let acc = byAlly.get(key);
      if (!acc) {
        acc = {
          displayRiotId: fullTag,
          games: 0,
          wins: 0,
          sumSelfKda: 0,
          sumAllyKda: 0,
          combos: new Map<string, number>(),
          lastPlayedAt: m.gameCreation,
        };
        byAlly.set(key, acc);
      }

      acc.games += 1;
      if (m.player.win) acc.wins += 1;
      acc.sumSelfKda += selfKda;
      acc.sumAllyKda += (ally.kills + ally.assists) / Math.max(1, ally.deaths);
      if (m.gameCreation > acc.lastPlayedAt) acc.lastPlayedAt = m.gameCreation;

      const combo = `${m.player.championName} + ${ally.championName}`;
      acc.combos.set(combo, (acc.combos.get(combo) || 0) + 1);
    }
  }

  return Array.from(byAlly.values())
    .filter((a) => a.games >= 2)
    .sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games)
    .slice(0, 6)
    .map((a) => {
      let favoriteCombo = '';
      let maxComboCount = 0;
      for (const [combo, count] of a.combos.entries()) {
        if (count > maxComboCount) {
          maxComboCount = count;
          favoriteCombo = combo;
        }
      }
      return {
        riotId: a.displayRiotId,
        gamesTogether: a.games,
        winsTogether: a.wins,
        winRate: Math.round((a.wins / a.games) * 100),
        avgPlayerKda: Number((a.sumSelfKda / a.games).toFixed(2)),
        avgAllyKda: Number((a.sumAllyKda / a.games).toFixed(2)),
        favoriteCombo,
        lastPlayedAt: a.lastPlayedAt,
      };
    });
}
