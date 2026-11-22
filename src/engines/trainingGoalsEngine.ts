import type { MatchRecord, Role } from './types.ts';

export type TrainingIntensity = 'standard' | 'strict';

export interface GoalMatchCheck {
  matchId: string;
  championName: string;
  win: boolean;
  passed: boolean;
  measuredLabel: string;
  dateLabel: string;
}

export interface TrainingGoal {
  id: 'survival' | 'role_economy' | 'macro_vision';
  title: string;
  category: 'Survie' | 'Économie & Rythme' | 'Macro & Vision';
  targetLabel: string;
  currentAvgLabel: string;
  whyItMatters: string;
  inGameReminder: string;
  passedCount: number;
  totalCount: number;
  checks: GoalMatchCheck[];
}

export interface TrainingFocusReport {
  intensity: TrainingIntensity;
  dominantRole: Role;
  sampleSize: number;
  formScore: number;
  formTier: 'En pleine forme' | 'Progression solide' | 'À stabiliser';
  formSummary: string;
  winStreak: number;
  recentWins: number;
  recentLosses: number;
  goals: TrainingGoal[];
}

export interface SingleMatchGoalEvaluation {
  goalId: TrainingGoal['id'];
  title: string;
  category: TrainingGoal['category'];
  targetLabel: string;
  measuredLabel: string;
  passed: boolean;
}

function normalizeRoleFromMatch(pos?: string): Role | null {
  const upper = (pos || '').toUpperCase();
  if (upper === 'TOP') return 'TOP';
  if (upper === 'JUNGLE') return 'JUNGLE';
  if (upper === 'MID' || upper === 'MIDDLE') return 'MID';
  if (upper === 'ADC' || upper === 'BOTTOM') return 'ADC';
  if (upper === 'SUPPORT' || upper === 'UTILITY') return 'SUPPORT';
  return null;
}

export function detectDominantRole(matches: MatchRecord[], fallbackRole: Role = 'SUPPORT'): Role {
  const counts = new Map<Role, number>();
  for (const m of matches.slice(0, 15)) {
    const r = normalizeRoleFromMatch(m.player.teamPosition);
    if (r) counts.set(r, (counts.get(r) || 0) + 1);
  }
  let best: Role = fallbackRole;
  let max = 0;
  for (const [role, count] of counts.entries()) {
    if (count > max) {
      max = count;
      best = role;
    }
  }
  return best;
}

function formatDateShort(epochMs?: number): string {
  if (!epochMs) return '';
  return new Date(epochMs).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export function buildTrainingFocusReport(
  matches: MatchRecord[],
  intensity: TrainingIntensity = 'standard',
  fallbackRole: Role = 'SUPPORT',
): TrainingFocusReport {
  const sorted = [...matches].sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0));
  const recent = sorted.slice(0, 5);
  const dominantRole = detectDominantRole(sorted, fallbackRole);
  const isStrict = intensity === 'strict';

  if (recent.length === 0) {
    return {
      intensity,
      dominantRole,
      sampleSize: 0,
      formScore: 0,
      formTier: 'À stabiliser',
      formSummary: 'Synchronisez des parties pour calibrer votre programme de progression.',
      winStreak: 0,
      recentWins: 0,
      recentLosses: 0,
      goals: [],
    };
  }

  const recentWins = recent.filter((m) => m.player.win).length;
  const recentLosses = recent.length - recentWins;

  let winStreak = 0;
  for (const m of sorted) {
    if (m.player.win) winStreak += 1;
    else break;
  }

  // Seuils adaptés au niveau d'exigence & au rôle
  const maxDeathsTarget = isStrict ? 4 : 5;
  const minVisionPerMinTarget = dominantRole === 'SUPPORT' ? (isStrict ? 1.6 : 1.3) : isStrict ? 1.0 : 0.8;
  const minCsTarget =
    dominantRole === 'JUNGLE' ? (isStrict ? 6.2 : 5.5) : isStrict ? 7.4 : 6.5;

  // 1. Défi Survie
  const survivalChecks: GoalMatchCheck[] = recent.map((m) => {
    const passed = m.player.deaths <= maxDeathsTarget;
    return {
      matchId: m.matchId,
      championName: m.player.championName,
      win: m.player.win,
      passed,
      measuredLabel: `${m.player.deaths} mort${m.player.deaths > 1 ? 's' : ''}`,
      dateLabel: formatDateShort(m.gameCreation),
    };
  });
  const avgDeathsRecent =
    recent.reduce((sum, m) => sum + m.player.deaths, 0) / recent.length;

  // 2. Défi Économie / Impact selon le rôle
  const roleEconomyChecks: GoalMatchCheck[] = recent.map((m) => {
    const durMin = Math.max(1, m.gameDurationSec / 60);
    if (dominantRole === 'SUPPORT') {
      const visMin = m.player.visionScore / durMin;
      return {
        matchId: m.matchId,
        championName: m.player.championName,
        win: m.player.win,
        passed: visMin >= minVisionPerMinTarget,
        measuredLabel: `${visMin.toFixed(2)} vis/m`,
        dateLabel: formatDateShort(m.gameCreation),
      };
    }
    return {
      matchId: m.matchId,
      championName: m.player.championName,
      win: m.player.win,
      passed: m.player.csPerMin >= minCsTarget,
      measuredLabel: `${m.player.csPerMin.toFixed(1)} CS/m`,
      dateLabel: formatDateShort(m.gameCreation),
    };
  });

  const avgRoleEconomy =
    dominantRole === 'SUPPORT'
      ? recent.reduce(
          (sum, m) => sum + m.player.visionScore / Math.max(1, m.gameDurationSec / 60),
          0,
        ) / recent.length
      : recent.reduce((sum, m) => sum + m.player.csPerMin, 0) / recent.length;

  // 3. Défi Macro & Objectifs (Zéro mort pré-objectif ou <= 1 mort isolée)
  const macroChecks: GoalMatchCheck[] = recent.map((m) => {
    const preObjDeaths = m.mapEvents.filter(
      (e) => e.type === 'DEATH' && e.nearObjectiveWindow,
    ).length;
    const isolatedDeaths = m.mapEvents.filter((e) => e.type === 'DEATH' && e.isolated).length;
    const maxIsolatedAllowed = isStrict ? 0 : 1;
    const passed = preObjDeaths === 0 && isolatedDeaths <= maxIsolatedAllowed;
    return {
      matchId: m.matchId,
      championName: m.player.championName,
      win: m.player.win,
      passed,
      measuredLabel:
        preObjDeaths > 0
          ? `${preObjDeaths} mort(s) pré-obj.`
          : `${isolatedDeaths} isolée(s)`,
      dateLabel: formatDateShort(m.gameCreation),
    };
  });

  const totalPreObj = recent.reduce(
    (sum, m) => sum + m.mapEvents.filter((e) => e.type === 'DEATH' && e.nearObjectiveWindow).length,
    0,
  );
  const totalIsolated = recent.reduce(
    (sum, m) => sum + m.mapEvents.filter((e) => e.type === 'DEATH' && e.isolated).length,
    0,
  );

  const goals: TrainingGoal[] = [
    {
      id: 'survival',
      title: `Rester à ≤ ${maxDeathsTarget} morts par partie`,
      category: 'Survie',
      targetLabel: `Cible : ≤ ${maxDeathsTarget} morts`,
      currentAvgLabel: `Moy. récente : ${avgDeathsRecent.toFixed(1)}`,
      whyItMatters:
        'Chaque mort évitée réduit les primes offertes à l’adversaire et préserve votre présence sur les vagues.',
      inGameReminder: `Règle Survie : reculez dès que 2 ennemis sortent de vision (objectif ≤ ${maxDeathsTarget} morts).`,
      passedCount: survivalChecks.filter((c) => c.passed).length,
      totalCount: survivalChecks.length,
      checks: survivalChecks,
    },
    dominantRole === 'SUPPORT'
      ? {
          id: 'role_economy',
          title: `Maintenir ≥ ${minVisionPerMinTarget.toFixed(1)} vision / min`,
          category: 'Économie & Rythme',
          targetLabel: `Cible Support : ≥ ${minVisionPerMinTarget.toFixed(1)} / min`,
          currentAvgLabel: `Moy. récente : ${avgRoleEconomy.toFixed(2)} / min`,
          whyItMatters:
            'Un contrôle de vision supérieur sécurise les rotations autour de la rivière et prévient les ganks.',
          inGameReminder: `Règle Vision : poser 2 balises + 1 Balise de contrôle avant chaque Dragon/Héraut (≥ ${minVisionPerMinTarget.toFixed(1)}/min).`,
          passedCount: roleEconomyChecks.filter((c) => c.passed).length,
          totalCount: roleEconomyChecks.length,
          checks: roleEconomyChecks,
        }
      : {
          id: 'role_economy',
          title: `Tenir un rythme ≥ ${minCsTarget.toFixed(1)} CS / min`,
          category: 'Économie & Rythme',
          targetLabel: `Cible ${dominantRole} : ≥ ${minCsTarget.toFixed(1)} CS/min`,
          currentAvgLabel: `Moy. récente : ${avgRoleEconomy.toFixed(1)} CS/min`,
          whyItMatters:
            'Un farm régulier garantit vos pics d’objets à 15 et 22 minutes même sans prendre de kills.',
          inGameReminder: `Règle Farm : sécuriser les vagues canons et les camps libres entre deux rotations (≥ ${minCsTarget.toFixed(1)} CS/min).`,
          passedCount: roleEconomyChecks.filter((c) => c.passed).length,
          totalCount: roleEconomyChecks.length,
          checks: roleEconomyChecks,
        },
    {
      id: 'macro_vision',
      title: isStrict
        ? 'Zéro mort pré-objectif et zéro mort isolée'
        : '0 mort avant objectif · ≤ 1 mort isolée',
      category: 'Macro & Vision',
      targetLabel: isStrict ? 'Cible : 0 pré-obj · 0 isolée' : 'Cible : 0 pré-obj · ≤ 1 isolée',
      currentAvgLabel: `${totalPreObj} pré-obj · ${totalIsolated} isolée(s) sur ${recent.length}p`,
      whyItMatters:
        'Mourir 45s avant un Dragon ou seul sans alliés coûte presque toujours un objectif majeur.',
      inGameReminder: 'Règle Macro : rappel à -55s avant Dragon/Baron et zéro face-check sans couverture.',
      passedCount: macroChecks.filter((c) => c.passed).length,
      totalCount: macroChecks.length,
      checks: macroChecks,
    },
  ];

  // Calcul du Score de Forme (0..100) basé sur résultats + exécution des 3 défis
  const totalChecksPassed = goals.reduce((s, g) => s + g.passedCount, 0);
  const totalChecksPossible = goals.reduce((s, g) => s + g.totalCount, 0);
  const disciplineRatio = totalChecksPossible > 0 ? totalChecksPassed / totalChecksPossible : 0.5;
  const winRatio = recentWins / recent.length;
  const avgKdaRecent =
    recent.reduce(
      (sum, m) => sum + (m.player.kills + m.player.assists) / Math.max(1, m.player.deaths),
      0,
    ) / recent.length;
  const kdaFactor = Math.min(1, avgKdaRecent / 4.5);

  const rawScore = Math.round(disciplineRatio * 55 + winRatio * 25 + kdaFactor * 20);
  const formScore = Math.max(15, Math.min(99, rawScore));

  const formTier: TrainingFocusReport['formTier'] =
    formScore >= 72
      ? 'En pleine forme'
      : formScore >= 50
        ? 'Progression solide'
        : 'À stabiliser';

  const formSummary =
    winStreak >= 2
      ? `Série en cours de ${winStreak} victoires · ${totalChecksPassed}/${totalChecksPossible} objectifs validés sur vos ${recent.length} derniers matchs.`
      : `${recentWins}V - ${recentLosses}D sur vos ${recent.length} dernières parties · ${totalChecksPassed}/${totalChecksPossible} objectifs respectés.`;

  return {
    intensity,
    dominantRole,
    sampleSize: recent.length,
    formScore,
    formTier,
    formSummary,
    winStreak,
    recentWins,
    recentLosses,
    goals,
  };
}

export function evaluateMatchAgainstGoals(
  match: MatchRecord,
  allMatches: MatchRecord[],
  intensity: TrainingIntensity = 'standard',
): SingleMatchGoalEvaluation[] {
  const report = buildTrainingFocusReport(allMatches, intensity);
  const durMin = Math.max(1, match.gameDurationSec / 60);
  const isStrict = intensity === 'strict';
  const maxDeathsTarget = isStrict ? 4 : 5;
  const minVisionPerMinTarget =
    report.dominantRole === 'SUPPORT' ? (isStrict ? 1.6 : 1.3) : isStrict ? 1.0 : 0.8;
  const minCsTarget =
    report.dominantRole === 'JUNGLE' ? (isStrict ? 6.2 : 5.5) : isStrict ? 7.4 : 6.5;

  const preObjDeaths = match.mapEvents.filter(
    (e) => e.type === 'DEATH' && e.nearObjectiveWindow,
  ).length;
  const isolatedDeaths = match.mapEvents.filter((e) => e.type === 'DEATH' && e.isolated).length;
  const maxIsolatedAllowed = isStrict ? 0 : 1;

  const visMin = match.player.visionScore / durMin;

  return [
    {
      goalId: 'survival',
      title: report.goals[0]?.title || `≤ ${maxDeathsTarget} morts`,
      category: 'Survie',
      targetLabel: `≤ ${maxDeathsTarget} morts`,
      measuredLabel: `${match.player.deaths} mort${match.player.deaths > 1 ? 's' : ''}`,
      passed: match.player.deaths <= maxDeathsTarget,
    },
    report.dominantRole === 'SUPPORT'
      ? {
          goalId: 'role_economy',
          title: report.goals[1]?.title || `≥ ${minVisionPerMinTarget.toFixed(1)} vision / min`,
          category: 'Économie & Rythme',
          targetLabel: `≥ ${minVisionPerMinTarget.toFixed(1)} / min`,
          measuredLabel: `${visMin.toFixed(2)} / min (${match.player.visionScore} pts)`,
          passed: visMin >= minVisionPerMinTarget,
        }
      : {
          goalId: 'role_economy',
          title: report.goals[1]?.title || `≥ ${minCsTarget.toFixed(1)} CS / min`,
          category: 'Économie & Rythme',
          targetLabel: `≥ ${minCsTarget.toFixed(1)} CS/min`,
          measuredLabel: `${match.player.csPerMin.toFixed(1)} CS/min`,
          passed: match.player.csPerMin >= minCsTarget,
        },
    {
      goalId: 'macro_vision',
      title: report.goals[2]?.title || 'Contrôle pré-objectif',
      category: 'Macro & Vision',
      targetLabel: isStrict ? '0 pré-obj · 0 isolée' : '0 pré-obj · ≤ 1 isolée',
      measuredLabel: `${preObjDeaths} pré-obj · ${isolatedDeaths} isolée(s)`,
      passed: preObjDeaths === 0 && isolatedDeaths <= maxIsolatedAllowed,
    },
  ];
}
