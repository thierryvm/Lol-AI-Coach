import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  BuildRecommendation,
  CareerSynthesisDataset,
  LiveCoachSnapshot,
  MatchRecord,
  PlayerTendencies,
  PostGameAnalysis,
} from '../src/engines/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquante côté serveur. Configurez-la dans Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

async function generateJsonWithFallback(params: {
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
}) {
  const ai = getAiClient();
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  ];

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema as any,
        },
      });
      return JSON.parse((response.text ?? '{}').trim());
    } catch (err) {
      lastError = err;
      if (!isTransientAiError(err) && i === 0) {
        // Pour une erreur non transitoire sur le premier modèle, tente quand même le modèle de secours
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  if (isTransientAiError(lastError)) {
    throw new Error(
      'Le service IA Gemini connaît un pic de charge momentané (503). Réessayez dans quelques secondes.',
    );
  }
  throw new Error(
    lastError instanceof Error
      ? `Analyse IA temporairement indisponible : ${lastError.message.slice(0, 140)}`
      : 'Analyse IA temporairement indisponible.',
  );
}

export async function generateBuildCoachingRationale(payload: {
  recommendation: BuildRecommendation;
  tendencies?: PlayerTendencies;
}) {
  const { recommendation, tendencies } = payload;

  const promptData = {
    patch: recommendation.patchVersion,
    gameMode: recommendation.gameMode,
    playerChampion: recommendation.playerChampion.name,
    duoPartner: recommendation.duoPartner
      ? `${recommendation.duoPartner.name} (${recommendation.duoPartner.tags.join('/')})`
      : null,
    duoSynergyNotes: recommendation.duoSynergyNotes,
    role: recommendation.role,
    enemyProfiles: recommendation.threatSummary.profiles.map((p) => ({
      name: p.championName,
      damage: p.primaryDamage,
      tankiness: p.tankinessScore,
      sustain: p.sustainScore,
      burst: p.burstScore,
      cc: p.ccScore,
    })),
    threatSummary: {
      physicalShare: recommendation.threatSummary.physicalShare,
      magicShare: recommendation.threatSummary.magicShare,
      tanks: recommendation.threatSummary.tankCount,
      healers: recommendation.threatSummary.highHealCount,
      burstThreats: recommendation.threatSummary.burstThreatCount,
    },
    selectedBoots: recommendation.boots.item.name,
    coreItems: recommendation.coreItems.map((i) => ({
      name: i.item.name,
      reasons: i.reasons,
    })),
    situationalItems: recommendation.situationalItems.map((i) => i.item.name),
    keystone: recommendation.runes.keystone?.name,
    playerTendencies: tendencies || null,
  };

  return generateJsonWithFallback({
    contents:
      `Tu es un coach League of Legends de niveau Challenger. En t'appuyant UNIQUEMENT sur les données exactes ci-dessous (ne jamais inventer d'autres statistiques ni modifier les noms d'objets), rédige un plan de jeu concret en français pour ${recommendation.playerChampion.name} (${recommendation.role}, mode ${recommendation.gameMode}).\n\nDonnées vérifiées :\n` +
      JSON.stringify(promptData, null, 2),
    systemInstruction:
      'Coach LoL francophone concis, précis et actionnable. Tu expliques la logique des objets sélectionnés par le moteur déterministe sans jamais inventer de chiffres absents des données fournies.',
    responseSchema: {
      type: Type.OBJECT,
      required: ['headline', 'earlyGamePlan', 'midGameSpike', 'teamfightPositioning', 'keyReminders'],
      properties: {
        headline: { type: Type.STRING, description: 'Résumé tactique en 1 phrase.' },
        earlyGamePlan: { type: Type.STRING, description: 'Plan niveaux 1 à 6 et gestion de vague (ou early teamfight en ARAM).' },
        midGameSpike: { type: Type.STRING, description: 'Comment exploiter le pic à 1-2 objets et rotations.' },
        teamfightPositioning: { type: Type.STRING, description: 'Rôle en teamfight et cible/menace prioritaire.' },
        keyReminders: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3 rappels pratiques courts.',
        },
      },
    },
  });
}

export async function generatePostGameCoaching(payload: {
  match: MatchRecord;
  analysis: PostGameAnalysis;
}) {
  const { match, analysis } = payload;

  const summary = {
    champion: match.player.championName,
    role: match.player.teamPosition,
    gameMode: match.gameMode,
    win: match.player.win,
    durationMin: Math.round(match.gameDurationSec / 60),
    kda: `${match.player.kills}/${match.player.deaths}/${match.player.assists}`,
    csPerMin: analysis.csPerMin,
    csAt10: analysis.csAt10,
    csAt15: analysis.csAt15,
    goldDiffAt15: analysis.goldDiffAt15,
    visionPerMin: analysis.visionPerMin,
    isolatedDeaths: analysis.isolatedDeaths,
    preObjectiveDeaths: analysis.preObjectiveDeaths,
    overextendedDeaths: analysis.overextendedDeaths,
    zoneBreakdown: analysis.zoneBreakdown,
    detectedMistakes: analysis.detectedMistakes,
    laneOpponent: match.laneOpponent
      ? `${match.laneOpponent.championName} (${match.laneOpponent.kills}/${match.laneOpponent.deaths}/${match.laneOpponent.assists}, ${match.laneOpponent.csPerMin} CS/min)`
      : null,
  };

  return generateJsonWithFallback({
    contents:
      `Analyse cette partie de League of Legends et propose un débriefing personnalisé en français en ciblant précisément les erreurs de placement et de farming observées.\n\nStatistiques et événements vérifiés :\n` +
      JSON.stringify(summary, null, 2),
    systemInstruction:
      'Coach LoL bienveillant, rigoureux et pragmatique. Appuie chaque conseil sur les chiffres exacts de la partie sans inventer de statistiques.',
    responseSchema: {
      type: Type.OBJECT,
      required: ['verdict', 'placementReview', 'farmingReview', 'nextMatchFocus'],
      properties: {
        verdict: { type: Type.STRING, description: 'Diagnostic principal du match en 2 phrases.' },
        placementReview: { type: Type.STRING, description: 'Analyse des zones de mort et du positionnement.' },
        farmingReview: { type: Type.STRING, description: 'Analyse du rythme de CS et des fenêtres de rappel.' },
        nextMatchFocus: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3 objectifs mesurables pour la prochaine partie.',
        },
      },
    },
  });
}

export async function generateLiveCoachingCall(snapshot: LiveCoachSnapshot) {
  return generateJsonWithFallback({
    contents:
      `Voici l'état instantané d'une partie de League of Legends en cours. Donne des instructions courtes et immédiatement applicables (10 secondes de lecture max) en français.\n\nÉtat Live :\n` +
      JSON.stringify(snapshot, null, 2),
    systemInstruction:
      'Assistant tactique en direct pour League of Legends. Réponses ultra-concises, zéro blabla, priorisant la sécurité, le farm, le rappel et les objectifs.',
    responseSchema: {
      type: Type.OBJECT,
      required: ['immediateCall', 'recallAdvice', 'dangerWatch'],
      properties: {
        immediateCall: { type: Type.STRING, description: 'Action prioritaire dans les 30 prochaines secondes.' },
        recallAdvice: { type: Type.STRING, description: 'Conseil sur le timing de rappel et prochain achat.' },
        dangerWatch: { type: Type.STRING, description: 'Menace adverse à surveiller et positionnement recommandé.' },
      },
    },
  });
}

function nonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureCompleteCareerSynthesis(
  raw: Record<string, any> | null | undefined,
  dataset: CareerSynthesisDataset,
  riotId: string,
) {
  const topZones = dataset.zoneTotals.filter((z) => z.deaths > 0);
  const topZone = topZones[0];
  const secondZone = topZones[1];
  const topChamp = dataset.championStats[0];
  const secondChamp = dataset.championStats[1];

  const executiveSummary =
    nonEmpty(raw?.executiveSummary) ||
    `Sur ${dataset.gamesAnalyzed} parties archivées (${dataset.wins}V - ${dataset.losses}D, ${dataset.winRate}% de victoire), ${riotId} enregistre ${dataset.avgDeaths} morts/partie dont ${dataset.isolatedDeathPct}% isolées et ${dataset.preObjectiveDeathPct}% avant un objectif. ${
      topZone
        ? `La zone la plus punitive reste ${topZone.zone} (${topZone.deaths} morts cumulées).`
        : 'Priorisez la réduction des morts évitables en transition.'
    }`;

  const rawErrors = Array.isArray(raw?.recurringPositioningErrors)
    ? raw.recurringPositioningErrors
    : [];

  const fallbackErrors = [
    {
      zoneOrPattern: topZone ? `${topZone.zone}` : 'Avancée sans vision en lane / rivière',
      frequencyNote: topZone
        ? `${topZone.deaths} morts cumulées (${topZone.isolatedDeaths} isolées, ${topZone.preObjectiveDeaths} pré-objectif) sur ${dataset.gamesAnalyzed} matchs`
        : `${dataset.isolatedDeathPct}% de morts isolées sur l’ensemble de l’historique`,
      correction:
        'Ne dépassez jamais la ligne médiane sans balise active dans le buisson rivière ou la présence confirmée de votre jungler sur le même côté de carte.',
    },
    {
      zoneOrPattern: secondZone
        ? `${secondZone.zone}`
        : 'Morts avant apparition d’objectif (Dragon / Baron)',
      frequencyNote: secondZone
        ? `${secondZone.deaths} morts (${secondZone.isolatedDeaths} isolées) · Phase 0–12m : ${dataset.phaseDeaths.early0To12m} morts, 12–24m : ${dataset.phaseDeaths.mid12To24m} morts`
        : `${dataset.preObjectiveDeathPct}% de vos morts surviennent dans les 60 secondes précédant un objectif majeur`,
      correction:
        'Rappelez 55 secondes avant le timer Dragon/Baron, achetez 1 à 2 Balises de contrôle et posez la vision en binôme avec un allié plutôt que seul.',
    },
  ];

  const recurringPositioningErrors = (rawErrors.length > 0 ? rawErrors : fallbackErrors)
    .slice(0, 3)
    .map((err: any, idx: number) => {
      const fb = fallbackErrors[idx] || fallbackErrors[0];
      return {
        zoneOrPattern: nonEmpty(err?.zoneOrPattern) || fb.zoneOrPattern,
        frequencyNote: nonEmpty(err?.frequencyNote) || fb.frequencyNote,
        correction: nonEmpty(err?.correction) || fb.correction,
      };
    });

  const rawAdjustments = Array.isArray(raw?.gameplayAdjustments) ? raw.gameplayAdjustments : [];
  const fallbackAdjustments = [
    {
      area: 'Survie & Placement',
      currentHabit: `${dataset.avgDeaths} morts/partie en moyenne dont ${dataset.isolatedDeathPct}% hors portée d’un allié (${dataset.phaseDeaths.early0To12m} en early 0–12m).`,
      targetAdjustment:
        'Fixez un plafond strict de 4 morts maximum : reculez dès que 2 ennemis disparaissent du brouillard de guerre sans vision profonde.',
      expectedImpact:
        'Réduit l’or offert aux carrys adverses d’environ 600–900 po par partie et stabilise votre présence sur les teamfights.',
    },
    {
      area: 'Vision & Objectifs',
      currentHabit: `Score de vision moyen à ${dataset.avgVisionPerMin}/min avec ${dataset.preObjectiveDeathPct}% de morts juste avant un objectif.`,
      targetAdjustment:
        'Synchronisez votre rappel à -55s de chaque Dragon pour poser 2 wards défensives en entrée de jungle avant le regroupement.',
      expectedImpact:
        'Élimine les facechecks mortels et augmente la prise d’initiative sur les dragons et larves.',
    },
    {
      area: 'Tempo & Ressources',
      currentHabit:
        dataset.avgGoldDiffAt15 !== null
          ? `Écart moyen à 15 min de ${dataset.avgGoldDiffAt15 >= 0 ? '+' : ''}${dataset.avgGoldDiffAt15} po (${dataset.avgCsPerMin} CS/min global).`
          : `Rythme moyen de ${dataset.avgCsPerMin} CS/min sur ${dataset.gamesAnalyzed} parties.`,
      targetAdjustment:
        'Évitez les combats désavantageux en infériorité numérique et convertissez vos vagues poussées en rappels rapides (1100–1300 po).',
      expectedImpact:
        'Accélère l’obtention de votre 1er et 2e objet cœur de 1 à 2 minutes dans les parties serrées.',
    },
  ];

  const gameplayAdjustments = (rawAdjustments.length > 0 ? rawAdjustments : fallbackAdjustments)
    .slice(0, 3)
    .map((adj: any, idx: number) => {
      const fb = fallbackAdjustments[idx] || fallbackAdjustments[0];
      return {
        area: nonEmpty(adj?.area) || fb.area,
        currentHabit: nonEmpty(adj?.currentHabit) || fb.currentHabit,
        targetAdjustment: nonEmpty(adj?.targetAdjustment) || fb.targetAdjustment,
        expectedImpact: nonEmpty(adj?.expectedImpact) || fb.expectedImpact,
      };
    });

  const championPoolAdvice =
    nonEmpty(raw?.championPoolAdvice) ||
    (topChamp
      ? `Votre champion le plus joué est ${topChamp.championName} (${topChamp.games} parties, ${topChamp.winRate}% WR, ${topChamp.kdaRatio} KDA${
          secondChamp
            ? `), suivi de ${secondChamp.championName} (${secondChamp.games} parties, ${secondChamp.winRate}% WR)`
            : ')'
        }. Concentrez vos prochaines parties sur 2 champions principaux maîtrisés pour stabiliser vos automatismes et réduire les erreurs de placement.`
      : `Stabilisez un noyau restreint de 2 champions principaux pour automatiser vos limites de dégâts et réduire vos morts en phase de lane.`);

  const rawPlan = Array.isArray(raw?.threeGameActionPlan)
    ? raw.threeGameActionPlan.map(nonEmpty).filter(Boolean)
    : [];
  const fallbackPlan = [
    `Limiter les morts isolées à maximum 1 par partie en ne wardant ${
      topZone ? topZone.zone : 'la rivière'
    } qu’avec l’information de la position du jungler ennemi.`,
    `Effectuer un rappel systématique 50–60s avant chaque Dragon pour arriver avec vos objets complets et 1 Balise de contrôle.`,
    `Maintenir une moyenne inférieure à ${Math.max(
      4,
      Math.round(dataset.avgDeaths - 2),
    )} morts sur vos 3 prochaines parties tout en conservant au moins ${(
      dataset.avgVisionPerMin + 0.25
    ).toFixed(2)} vision/min.`,
  ];

  const threeGameActionPlan = [
    rawPlan[0] || fallbackPlan[0],
    rawPlan[1] || fallbackPlan[1],
    rawPlan[2] || fallbackPlan[2],
  ];

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    gamesAnalyzed: dataset.gamesAnalyzed,
    executiveSummary,
    recurringPositioningErrors,
    gameplayAdjustments,
    championPoolAdvice,
    threeGameActionPlan,
  };
}

export async function generateCareerGlobalSynthesis(payload: {
  riotId: string;
  region: string;
  dataset: CareerSynthesisDataset;
}) {
  const { riotId, region, dataset } = payload;

  try {
    const result = await generateJsonWithFallback({
      contents:
        `Tu es un coach League of Legends Challenger chargé de réaliser une SYNTHÈSE GLOBALE LONG TERME complète pour le joueur ${riotId} (${region}) à partir de l'ENSEMBLE de ses ${dataset.gamesAnalyzed} matchs stockés localement.\n` +
        `IMPORTANT : Tu DOIS remplir TOUS les champs du JSON sans en laisser aucun vide (chaque erreur doit avoir zoneOrPattern + frequencyNote + correction détaillée, 3 ajustements complets dans gameplayAdjustments, un paragraphe championPoolAdvice et exactement 3 actions dans threeGameActionPlan).\n\n` +
        `Statistiques agrégées vérifiées :\n` +
        JSON.stringify(dataset, null, 2),
      systemInstruction:
        'Coach LoL francophone rigoureux, pédagogique et exhaustif. Remplis absolument tous les champs demandés par le schéma JSON avec des chiffres exacts issus des statistiques fournies, sans jamais laisser de champ vide.',
      responseSchema: {
        type: Type.OBJECT,
        required: [
          'executiveSummary',
          'recurringPositioningErrors',
          'gameplayAdjustments',
          'championPoolAdvice',
          'threeGameActionPlan',
        ],
        properties: {
          executiveSummary: {
            type: Type.STRING,
            description: 'Bilan global long terme sur l’ensemble des parties (2-3 phrases chiffrées).',
          },
          recurringPositioningErrors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['zoneOrPattern', 'frequencyNote', 'correction'],
              properties: {
                zoneOrPattern: { type: Type.STRING, description: 'Zone de la carte ou schéma de mort récurrent.' },
                frequencyNote: { type: Type.STRING, description: 'Fréquence / chiffres constatés sur l’ensemble des matchs.' },
                correction: { type: Type.STRING, description: 'Règle de positionnement concrète et détaillée pour corriger ce défaut.' },
              },
            },
            description: '2 à 3 erreurs de positionnement récurrentes observées sur la durée.',
          },
          gameplayAdjustments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ['area', 'currentHabit', 'targetAdjustment', 'expectedImpact'],
              properties: {
                area: { type: Type.STRING, description: 'Domaine (Survie, Tempo / Rappels, Vision, Farming, Objectifs).' },
                currentHabit: { type: Type.STRING, description: 'Habitude actuelle révélée par la tendance long terme.' },
                targetAdjustment: { type: Type.STRING, description: 'Ajustement précis à appliquer en partie.' },
                expectedImpact: { type: Type.STRING, description: 'Impact concret attendu sur le winrate ou les ressources.' },
              },
            },
            description: '3 ajustements de gameplay personnalisés basés sur les tendances.',
          },
          championPoolAdvice: {
            type: Type.STRING,
            description: 'Conseil détaillé sur le pool de champions joués (forces, winrate par champion et axes de progression).',
          },
          threeGameActionPlan: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Plan d’entraînement concret en 3 points mesurables pour les 3 prochaines parties.',
          },
        },
      },
    });

    return ensureCompleteCareerSynthesis(result, dataset, riotId);
  } catch (err) {
    // Si Gemini est indisponible ou sans clé, retourne une synthèse complète déterministe basée sur les vrais chiffres locaux
    if (dataset.gamesAnalyzed > 0) {
      return ensureCompleteCareerSynthesis(null, dataset, riotId);
    }
    throw err;
  }
}

