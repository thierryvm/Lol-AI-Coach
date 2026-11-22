import type {
  CareerAiSynthesis,
  CareerSynthesisDataset,
  ChampionSummary,
  MatchRecord,
  Role,
} from './types.ts';

export type AdviceCategory =
  | 'Classe & Pool'
  | 'Positionnement'
  | 'Vision & Contrôle'
  | 'Macro & Objectifs'
  | 'Rythme & Économie';

export interface ContextualTacticalTip {
  id: string;
  category: AdviceCategory;
  headline: string;
  actionStep: string;
  evidenceLabel: string;
  sourceKind: 'careerSynthesis' | 'datasetFallback';
  championTarget?: string;
}

interface ArchetypeBucket {
  label: string;
  tag: string;
  games: number;
  wins: number;
  recentGames: number;
  recentWins: number;
  earlierGames: number;
  earlierWins: number;
  avgVisionPerMin: number;
  topChampion: string;
}

const ARCHETYPE_DEFINITIONS: Array<{ tag: string; label: string }> = [
  { tag: 'Tank', label: 'initiateurs / tanks' },
  { tag: 'Support', label: 'supports / utilitaires' },
  { tag: 'Fighter', label: 'combattants' },
  { tag: 'Mage', label: 'mages' },
  { tag: 'Assassin', label: 'assassins' },
  { tag: 'Marksman', label: 'tireurs (ADC)' },
];

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function getLocalDayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function analyzeArchetypeTrends(
  matches: MatchRecord[],
  champions: ChampionSummary[],
): ArchetypeBucket[] {
  if (matches.length === 0 || champions.length === 0) return [];

  const champMap = new Map<string, ChampionSummary>();
  for (const c of champions) {
    champMap.set(c.id.toLowerCase(), c);
    champMap.set(c.name.toLowerCase(), c);
  }

  const sorted = [...matches].sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0));
  const splitIdx = Math.max(1, Math.floor(sorted.length / 2));

  const buckets = new Map<string, ArchetypeBucket & { visionSum: number; champCounts: Map<string, number> }>();

  sorted.forEach((m, idx) => {
    const champ = champMap.get(m.player.championName.toLowerCase());
    if (!champ) return;
    const isRecent = idx < splitIdx;
    const durMin = Math.max(1, m.gameDurationSec / 60);
    const visPerMin = m.player.visionScore / durMin;

    for (const def of ARCHETYPE_DEFINITIONS) {
      if (!champ.tags.includes(def.tag)) continue;
      let b = buckets.get(def.tag);
      if (!b) {
        b = {
          label: def.label,
          tag: def.tag,
          games: 0,
          wins: 0,
          recentGames: 0,
          recentWins: 0,
          earlierGames: 0,
          earlierWins: 0,
          avgVisionPerMin: 0,
          topChampion: m.player.championName,
          visionSum: 0,
          champCounts: new Map(),
        };
        buckets.set(def.tag, b);
      }
      b.games += 1;
      if (m.player.win) b.wins += 1;
      if (isRecent) {
        b.recentGames += 1;
        if (m.player.win) b.recentWins += 1;
      } else {
        b.earlierGames += 1;
        if (m.player.win) b.earlierWins += 1;
      }
      b.visionSum += visPerMin;
      b.champCounts.set(
        m.player.championName,
        (b.champCounts.get(m.player.championName) || 0) + 1,
      );
    }
  });

  const out: ArchetypeBucket[] = [];
  for (const b of buckets.values()) {
    if (b.games < 2) continue;
    let topChampion = b.topChampion;
    let maxChampGames = 0;
    for (const [name, cnt] of b.champCounts.entries()) {
      if (cnt > maxChampGames) {
        maxChampGames = cnt;
        topChampion = name;
      }
    }
    out.push({
      label: b.label,
      tag: b.tag,
      games: b.games,
      wins: b.wins,
      recentGames: b.recentGames,
      recentWins: b.recentWins,
      earlierGames: b.earlierGames,
      earlierWins: b.earlierWins,
      avgVisionPerMin: Number((b.visionSum / b.games).toFixed(2)),
      topChampion,
    });
  }

  return out.sort((a, b) => b.games - a.games);
}

export function buildContextualTacticalTips(params: {
  careerSynthesis: CareerAiSynthesis | null;
  dataset: CareerSynthesisDataset;
  matches: MatchRecord[];
  champions: ChampionSummary[];
  riotId: string;
  dominantRole?: Role;
}): {
  tips: ContextualTacticalTip[];
  dailyIndex: number;
  dayKey: string;
  usesAiSynthesis: boolean;
} {
  const { careerSynthesis, dataset, matches, champions, riotId, dominantRole = 'SUPPORT' } = params;
  const dayKey = getLocalDayKey();
  const usesAiSynthesis = Boolean(careerSynthesis);
  const tips: ContextualTacticalTip[] = [];

  const archetypeBuckets = analyzeArchetypeTrends(matches, champions);

  // 1. Conseil croisé Classe / Archétype + Vision / Tendance (enrichi par careerSynthesis)
  const decliningOrWeakArchetype = archetypeBuckets.find((b) => {
    const wr = (b.wins / b.games) * 100;
    const recentWr = b.recentGames > 0 ? (b.recentWins / b.recentGames) * 100 : wr;
    const earlierWr = b.earlierGames > 0 ? (b.earlierWins / b.earlierGames) * 100 : wr;
    return wr < 50 || (b.earlierGames >= 1 && recentWr < earlierWr - 10);
  });

  if (decliningOrWeakArchetype) {
    const wr = Math.round((decliningOrWeakArchetype.wins / decliningOrWeakArchetype.games) * 100);
    const poolContext = careerSynthesis?.championPoolAdvice
      ? ` ${careerSynthesis.championPoolAdvice.split('.')[0]}.`
      : '';
    const visionFocus =
      dataset.avgVisionPerMin < (dominantRole === 'SUPPORT' ? 1.35 : 0.85) ||
      dataset.phaseDeaths.mid12To24m >= dataset.phaseDeaths.early0To12m
        ? 'essaye de prioriser le contrôle de vision en mid-game avant d’engager.'
        : 'attends un décalage clair de ton jungler ou une vague poussée avant de forcer l’escarmouche.';

    tips.push({
      id: `archetype-${decliningOrWeakArchetype.tag}`,
      category: 'Classe & Pool',
      headline: `Ton winrate avec les ${decliningOrWeakArchetype.label} est à ${wr}% sur ${decliningOrWeakArchetype.games} parties : ${visionFocus}`,
      actionStep: `Priorité immédiate sur ${decliningOrWeakArchetype.topChampion} : garde toujours 1 Balise de contrôle pour la rivière avant les combats 12–24 min.${poolContext}`,
      evidenceLabel: `${decliningOrWeakArchetype.wins}V/${decliningOrWeakArchetype.games - decliningOrWeakArchetype.wins}D avec ${decliningOrWeakArchetype.label} · ${decliningOrWeakArchetype.avgVisionPerMin} vis/min`,
      sourceKind: careerSynthesis ? 'careerSynthesis' : 'datasetFallback',
      championTarget: decliningOrWeakArchetype.topChampion,
    });
  }

  // 2. Conseils issus directement de `careerSynthesis` (Positionnement, Ajustements, Plan 3 matchs, Pool)
  if (careerSynthesis) {
    const topPosError = careerSynthesis.recurringPositioningErrors[0];
    if (topPosError) {
      tips.push({
        id: 'ai-positioning-focus',
        category: 'Positionnement',
        headline: `Point de vigilance détecté sur « ${topPosError.zoneOrPattern} » : verrouille ton placement dès le milieu de partie.`,
        actionStep: topPosError.correction,
        evidenceLabel: `Synthèse IA · ${topPosError.frequencyNote}`,
        sourceKind: 'careerSynthesis',
      });
    }

    const topAdjustment = careerSynthesis.gameplayAdjustments[0];
    if (topAdjustment) {
      const areaLower = topAdjustment.area.toLowerCase();
      const category: AdviceCategory = areaLower.includes('vision')
        ? 'Vision & Contrôle'
        : areaLower.includes('tempo') || areaLower.includes('objectif')
          ? 'Macro & Objectifs'
          : areaLower.includes('économie') || areaLower.includes('farm')
            ? 'Rythme & Économie'
            : 'Positionnement';

      tips.push({
        id: 'ai-gameplay-adjustment',
        category,
        headline: `${topAdjustment.area} : ${topAdjustment.targetAdjustment}`,
        actionStep: `Habitude à corriger : ${topAdjustment.currentHabit} Impact attendu : ${topAdjustment.expectedImpact}`,
        evidenceLabel: `Synthèse IA (${careerSynthesis.gamesAnalyzed} matchs)`,
        sourceKind: 'careerSynthesis',
      });
    }

    if (careerSynthesis.threeGameActionPlan.length > 0) {
      const stepIndex =
        hashString(`${dayKey}:plan:${riotId}`) % careerSynthesis.threeGameActionPlan.length;
      const planStep = careerSynthesis.threeGameActionPlan[stepIndex];
      tips.push({
        id: `ai-plan-${stepIndex}`,
        category: 'Macro & Objectifs',
        headline: `Mission prioritaire du jour : ${planStep}`,
        actionStep: careerSynthesis.championPoolAdvice || careerSynthesis.executiveSummary,
        evidenceLabel: `Plan IA 3 parties · Étape 0${stepIndex + 1}`,
        sourceKind: 'careerSynthesis',
      });
    }

    if (careerSynthesis.championPoolAdvice) {
      const bestOrMostPlayed = [...dataset.championStats].sort((a, b) => b.games - a.games)[0];
      tips.push({
        id: 'ai-pool-advice',
        category: 'Classe & Pool',
        headline: careerSynthesis.championPoolAdvice,
        actionStep:
          careerSynthesis.executiveSummary ||
          'Concentre ta session du jour sur 1 à 2 champions maîtrisés pour stabiliser tes automatismes.',
        evidenceLabel: `Synthèse IA · Pool actif (${dataset.championStats.length} champions)`,
        sourceKind: 'careerSynthesis',
        championTarget: bestOrMostPlayed?.championName,
      });
    }
  }

  // 3. Compléments déterministes depuis `dataset` si la synthèse IA n'a pas encore été générée ou pour enrichir la rotation
  if (dataset.gamesAnalyzed > 0) {
    if (dataset.preObjectiveDeathPct >= 20 || dataset.phaseDeaths.mid12To24m > dataset.phaseDeaths.early0To12m) {
      tips.push({
        id: 'dataset-midgame-vision',
        category: 'Vision & Contrôle',
        headline: `${dataset.phaseDeaths.mid12To24m} de tes morts surviennent entre 12 et 24 min : priorise le vision control en mid-game avant d’avancer.`,
        actionStep: `Pose ta vision défensive 55s avant Dragon/Baron (${dataset.preObjectiveDeathPct}% de morts pré-objectif actuellement) et ne pousse jamais une vague seul sans voir le jungler adverse.`,
        evidenceLabel: `${dataset.gamesAnalyzed} matchs analysés · ${dataset.avgVisionPerMin} vision/min`,
        sourceKind: 'datasetFallback',
      });
    }

    if (dataset.avgGoldDiffAt15 !== null && dataset.avgGoldDiffAt15 < 0) {
      tips.push({
        id: 'dataset-gold15',
        category: 'Rythme & Économie',
        headline: `Ton différentiel moyen à 15 min est de ${dataset.avgGoldDiffAt15} or : sécurise tes vagues canons et évite les rappels forcés.`,
        actionStep: `Vise ${dominantRole === 'SUPPORT' ? 'les timings de roam après crash de vague' : 'un rythme régulier de 7.0+ CS/min'} pour inverser l’écart avant le 2e Dragon.`,
        evidenceLabel: `Moy. ${dataset.avgCsPerMin} CS/min · ${dataset.avgGoldDiffAt15} or @15m`,
        sourceKind: 'datasetFallback',
      });
    }

    if (tips.length === 0) {
      const topChamp = [...dataset.championStats].sort((a, b) => b.winRate - a.winRate)[0];
      tips.push({
        id: 'dataset-consistency',
        category: 'Macro & Objectifs',
        headline: topChamp
          ? `Solide régularité sur ${topChamp.championName} (${topChamp.winRate}% WR) : verrouille ton avantage dès la transition 12–20 min.`
          : `Bilan actuel de ${dataset.winRate}% WR sur ${dataset.gamesAnalyzed} parties : transforme tes bonnes phases de lane en contrôle d’objectifs.`,
        actionStep:
          'Convertis chaque kill ou avance en plaque, tourelle ou contrôle de vision profond plutôt qu’en chasse isolée.',
        evidenceLabel: `${dataset.wins}V - ${dataset.losses}D · ${dataset.avgDeaths} morts/match`,
        sourceKind: 'datasetFallback',
        championTarget: topChamp?.championName,
      });
    }
  }

  // Déduplication par id
  const uniqueTips = Array.from(new Map(tips.map((t) => [t.id, t])).values());
  const dailyIndex =
    uniqueTips.length > 0 ? hashString(`${dayKey}:${riotId}`) % uniqueTips.length : 0;

  return {
    tips: uniqueTips,
    dailyIndex,
    dayKey,
    usesAiSynthesis,
  };
}
