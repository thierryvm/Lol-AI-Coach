import { Type } from '@google/genai';
import type { AiUserSelection } from '../src/engines/aiConfig.ts';
import type {
  BuildRecommendation,
  CareerSynthesisDataset,
  LiveCoachSnapshot,
  MatchRecord,
  PlayerTendencies,
  PostGameAnalysis,
} from '../src/engines/types.ts';
import {
  extractJsonObjectFromText,
  generateStructuredWithSelectedProvider,
  getGeminiClient,
  isTransientAiError,
} from './aiProviders.ts';
import { fetchOpggLiveBuilds } from './opggBuildService.ts';

async function generateJsonWithFallback(params: {
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  return generateStructuredWithSelectedProvider({
    contents: params.contents,
    systemInstruction: params.systemInstruction,
    responseSchema: params.responseSchema,
    aiConfig: params.aiConfig,
  });
}

export async function generateBuildCoachingRationale(payload: {
  recommendation: BuildRecommendation;
  tendencies?: PlayerTendencies;
  matchupNote?: string;
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  const { recommendation, tendencies, matchupNote, aiConfig } = payload;
  const cleanMatchupNote = typeof matchupNote === 'string' ? matchupNote.trim() : '';

  const promptData = {
    patch: recommendation.patchVersion,
    gameMode: recommendation.gameMode,
    playerChampion: recommendation.playerChampion.name,
    duoPartner: recommendation.duoPartner
      ? `${recommendation.duoPartner.name} (${recommendation.duoPartner.tags.join('/')})`
      : null,
    duoSynergyNotes: recommendation.duoSynergyNotes,
    role: recommendation.role,
    personalMatchupNote: cleanMatchupNote || null,
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
    aiConfig,
    contents:
      `Tu es un coach League of Legends de niveau Challenger. En t'appuyant UNIQUEMENT sur les données exactes ci-dessous (ne jamais inventer d'autres statistiques ni modifier les noms d'objets), rédige un plan de jeu concret en français pour ${recommendation.playerChampion.name} (${recommendation.role}, mode ${recommendation.gameMode}).${
        cleanMatchupNote
          ? ` Le joueur a aussi saisi ce mémo personnel à respecter dans son plan : "${cleanMatchupNote}". Intègre-le directement dans les conseils d'early game ou les rappels clés.`
          : ''
      }\n\nDonnées vérifiées :\n` +
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
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  const { match, analysis, aiConfig } = payload;

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
    aiConfig,
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

export async function generateLiveCoachingCall(
  snapshot: LiveCoachSnapshot,
  aiConfig?: Partial<AiUserSelection> | null,
) {
  return generateJsonWithFallback({
    aiConfig,
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
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  const { riotId, region, dataset, aiConfig } = payload;

  try {
    const result = await generateJsonWithFallback({
      aiConfig,
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

export interface ItemPassiveFormulaPayload {
  championName: string;
  championId: string;
  championTags: string[];
  role: string;
  level: number;
  itemId: string;
  itemName: string;
  itemCost: number;
  rawPassives: Array<{ name: string; text: string; isActive: boolean }>;
  scalingNote: string | null;
  championStats: {
    hp: number;
    bonusHp: number;
    baseAd: number;
    totalAd: number;
    totalAp: number;
    totalArmor: number;
    totalMr: number;
    attackSpeed: number;
    abilityHaste: number;
  };
  targetStats: {
    name: string;
    hp: number;
    armor: number;
    mr: number;
    effectiveArmor: number;
    effectiveMr: number;
  };
  combatContext: {
    durationSec: number;
    spellCasts: number;
    totalMitigatedDamage: number;
    realDps: number;
    deltaTotalDamage: number | null;
    deltaRealDps: number | null;
    deltaCombatHealing: number | null;
  };
  aiConfig?: Partial<AiUserSelection> | null;
}

export async function generateItemPassiveFormulaExplanation(
  payload: ItemPassiveFormulaPayload,
) {
  const { aiConfig, ...formulaData } = payload;
  return generateJsonWithFallback({
    aiConfig,
    contents:
      `Tu es un expert en théorie-crafting et formules mathématiques de League of Legends (Patch S16 / Data Dragon).\n` +
      `Explique de façon claire, rigoureuse et pédagogique en français comment le passif unique de l'objet « ${formulaData.itemName} » (ID #${formulaData.itemId}) modifie concrètement les formules de dégâts (et de soin/survie si applicable) du champion ${formulaData.championName} (${formulaData.role}, Niv.${formulaData.level}).\n\n` +
      `Appuie-toi EXCLUSIVEMENT sur les données exactes ci-dessous (ne jamais inventer d'autres statistiques) :\n` +
      JSON.stringify(formulaData, null, 2),
    systemInstruction:
      'Coach et mathématicien League of Legends francophone. Explique clairement chaque formule (ex: double application des effets à l’impact, ratios PV bonus / AP / AD de base, mitigation par Armure/RM effective) avec des calculs concrets basés sur les chiffres exacts fournis.',
    responseSchema: {
      type: Type.OBJECT,
      required: [
        'passiveTitle',
        'coreMechanism',
        'formulaModifications',
        'liveNumericProof',
        'executionTip',
      ],
      properties: {
        passiveTitle: {
          type: Type.STRING,
          description: 'Titre clair du passif unique et de son rôle sur le champion.',
        },
        coreMechanism: {
          type: Type.STRING,
          description:
            'Explication claire en 2 phrases de la mécanique du passif et de son interaction avec le kit du champion.',
        },
        formulaModifications: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            '2 à 4 formules ou étapes mathématiques montrant comment les dégâts du champion changent (ex. base -> avec passif).',
        },
        liveNumericProof: {
          type: Type.STRING,
          description:
            'Application numérique concrète sur les statistiques actuelles du champion face à la cible sélectionnée.',
        },
        executionTip: {
          type: Type.STRING,
          description: 'Conseil pratique de combo ou de timing en partie pour maximiser ce passif.',
        },
      },
    },
  });
}

export interface PopularBuildSearchPayload {
  championName: string;
  championId: string;
  role: string;
  gameMode: string;
  patchVersion: string;
  focusHint?: string;
  aiConfig?: Partial<AiUserSelection> | null;
}

export interface GroundedPopularBuildItem {
  sourceSite: string;
  buildTitle: string;
  winRateNote: string;
  pickRateNote: string;
  bootsName: string;
  itemNames: string[];
  keystoneName: string;
  secondaryTreeName: string;
  rationale: string;
}

export interface GroundedPopularBuildResponse {
  summary: string;
  builds: GroundedPopularBuildItem[];
  groundingSources: Array<{ title: string; uri: string }>;
}

export async function searchPopularBuildsWithGoogle(
  payload: PopularBuildSearchPayload,
): Promise<GroundedPopularBuildResponse> {
  const { championName, championId, role, gameMode, patchVersion, focusHint, aiConfig } = payload;

  // 1. Récupération directe en temps réel sur OP.GG (zéro quota Gemini consommé, vrais taux de victoire/pickrate Data Dragon)
  let opggResult: GroundedPopularBuildResponse | null = null;
  try {
    opggResult = await fetchOpggLiveBuilds({
      championName,
      championId,
      role,
      gameMode,
      patchVersion,
      focusHint,
    });
  } catch (err) {
    console.warn('[searchPopularBuildsWithGoogle] OP.GG live fetch warning:', err);
  }

  const trimmedHint = focusHint?.trim() || '';
  const isStandardPreset =
    !trimmedHint ||
    /^build (tank survie|dégâts AP)/i.test(trimmedHint);

  // Si OP.GG a trouvé de vrais builds live et que c'est une recherche standard / preset, renvoyer immédiatement
  if (opggResult && opggResult.builds.length > 0 && isStandardPreset) {
    return opggResult;
  }

  const modeLabel =
    gameMode === 'ARAM'
      ? 'ARAM'
      : gameMode === 'SWIFTPLAY'
        ? 'Swiftplay / Summoner Rift'
        : 'Ranked Solo/Duo Summoner Rift';

  const focusClause = trimmedHint
    ? ` Focus spécifique souhaité par le joueur : "${trimmedHint}".`
    : '';

  const prompt =
    `Effectue une recherche Google en direct sur U.GG, OP.GG et Lolalytics pour trouver les builds les plus populaires et performants actuellement pour le champion League of Legends "${championName}" (${championId}) au poste "${role}" (${modeLabel}, patch récent ${patchVersion}).${focusClause}\n\n` +
    `Réponds STRICTEMENT avec un objet JSON valide (sans texte avant ni après, sans inventer de statistiques absentes des résultats trouvés) respectant exactement cette structure :\n` +
    `{\n` +
    `  "summary": "Résumé en 2 phrases en français des tendances de builds trouvées sur U.GG / OP.GG.",\n` +
    `  "builds": [\n` +
    `    {\n` +
    `      "sourceSite": "U.GG" | "OP.GG" | "Lolalytics",\n` +
    `      "buildTitle": "Nom court du style de build en français",\n` +
    `      "winRateNote": "Ex: ~52.1% WR (ou 'Non précisé' si absent)",\n` +
    `      "pickRateNote": "Ex: Build le plus joué (ou 'Populaire')",\n` +
    `      "bootsName": "Nom exact des bottes (ex: Plated Steelcaps ou Coques en acier)",\n` +
    `      "itemNames": ["Objet 1", "Objet 2", "Objet 3", "Objet 4", "Objet 5"],\n` +
    `      "keystoneName": "Nom de la rune fondamentale (ex: Grasp of the Undying / Poigne de l'immortel)",\n` +
    `      "secondaryTreeName": "Arbre secondaire (ex: Inspiration / Précision)",\n` +
    `      "rationale": "Explication courte en français de pourquoi ce build fonctionne."\n` +
    `    }\n` +
    `  ]\n` +
    `}\n` +
    `Propose 2 à 3 builds distincts trouvés dans les résultats de recherche (par exemple 1 build U.GG standard + 1 build OP.GG ou variante populaire).`;

  // Si l'utilisateur a sélectionné un autre fournisseur (Claude, OpenAI, etc.) sans passer par Gemini Search
  const useExternalProvider =
    aiConfig?.provider &&
    aiConfig.provider !== 'gemini' &&
    (!process.env.GEMINI_API_KEY?.trim() || aiConfig.fallbackToGemini === false);

  if (useExternalProvider) {
    try {
      const parsed = await generateStructuredWithSelectedProvider({
        contents: prompt,
        systemInstruction:
          'Analyste League of Legends expert. Propose les builds les plus populaires observés sur U.GG, OP.GG et Lolalytics pour ce patch.',
        responseSchema: {
          type: Type.OBJECT,
          required: ['summary', 'builds'],
          properties: {
            summary: { type: Type.STRING },
            builds: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['sourceSite', 'buildTitle', 'bootsName', 'itemNames', 'rationale'],
                properties: {
                  sourceSite: { type: Type.STRING },
                  buildTitle: { type: Type.STRING },
                  winRateNote: { type: Type.STRING },
                  pickRateNote: { type: Type.STRING },
                  bootsName: { type: Type.STRING },
                  itemNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                  keystoneName: { type: Type.STRING },
                  secondaryTreeName: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                },
              },
            },
          },
        },
        aiConfig,
      });

      const builds: GroundedPopularBuildItem[] = Array.isArray(parsed?.builds)
        ? parsed.builds.slice(0, 3).map((b: any) => ({
            sourceSite: String(b.sourceSite || parsed?._aiMeta?.providerLabel || 'IA'),
            buildTitle: String(b.buildTitle || `Build ${championName}`),
            winRateNote: String(b.winRateNote || 'Méta actuelle'),
            pickRateNote: String(b.pickRateNote || 'Populaire'),
            bootsName: String(b.bootsName || ''),
            itemNames: Array.isArray(b.itemNames)
              ? b.itemNames.map((n: any) => String(n || '').trim()).filter(Boolean).slice(0, 6)
              : [],
            keystoneName: String(b.keystoneName || ''),
            secondaryTreeName: String(b.secondaryTreeName || ''),
            rationale: String(b.rationale || ''),
          }))
        : [];

      if (builds.length > 0) {
        return {
          summary: String(
            parsed?.summary ||
              `Builds suggérés pour ${championName} (${role}) via ${parsed?._aiMeta?.providerLabel || 'IA'}.`,
          ),
          builds,
          groundingSources: opggResult?.groundingSources || [],
        };
      }
    } catch (extErr) {
      if (opggResult && opggResult.builds.length > 0) {
        return opggResult;
      }
      throw extErr;
    }
  }

  // Recherche Google Search Grounding via Gemini (avec repli automatique vers OP.GG Live en cas de 429/quota)
  try {
    const ai = getGeminiClient();
    const selectedGeminiModel =
      aiConfig?.provider === 'gemini' && aiConfig.model?.trim()
        ? aiConfig.model.trim()
        : 'gemini-4-hydrogen';
    const attempts = Array.from(new Set([selectedGeminiModel, 'gemini-4-hydrogen', 'gemini-3.1-flash-lite']));
    let lastError: unknown = null;
    const errorMessages: string[] = [];

    for (let i = 0; i < attempts.length; i++) {
      const model = attempts[i];
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            systemInstruction:
              'Analyste League of Legends expert utilisant Google Search Grounding. Tu retournes uniquement un objet JSON propre basé sur les builds populaires réellement trouvés sur U.GG, OP.GG et Lolalytics.',
          },
        });

        const parsed = extractJsonObjectFromText(response.text ?? '{}');
        const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const seenUris = new Set<string>();
        const groundingSources: Array<{ title: string; uri: string }> = [];

        for (const ch of rawChunks) {
          const uri = ch?.web?.uri;
          const title = ch?.web?.title;
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            groundingSources.push({
              title: title || uri,
              uri,
            });
          }
        }

        const builds: GroundedPopularBuildItem[] = Array.isArray(parsed?.builds)
          ? parsed.builds
              .filter((b: any) => b && (b.bootsName || Array.isArray(b.itemNames)))
              .slice(0, 3)
              .map((b: any) => ({
                sourceSite: String(b.sourceSite || 'Web Méta'),
                buildTitle: String(b.buildTitle || `Build ${championName}`),
                winRateNote: String(b.winRateNote || 'Méta actuelle'),
                pickRateNote: String(b.pickRateNote || 'Populaire'),
                bootsName: String(b.bootsName || ''),
                itemNames: Array.isArray(b.itemNames)
                  ? b.itemNames.map((n: any) => String(n || '').trim()).filter(Boolean).slice(0, 6)
                  : [],
                keystoneName: String(b.keystoneName || ''),
                secondaryTreeName: String(b.secondaryTreeName || ''),
                rationale: String(b.rationale || ''),
              }))
          : [];

        if (builds.length === 0) {
          throw new Error('Aucun build exploitable retourné par la recherche Google.');
        }

        return {
          summary: String(
            parsed?.summary ||
              `Builds populaires trouvés via Google Search pour ${championName} (${role}).`,
          ),
          builds,
          groundingSources: groundingSources.slice(0, 6),
        };
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        errorMessages.push(`${model}: ${msg.slice(0, 120)}`);
        console.error(`[searchPopularBuildsWithGoogle] model=${model} failed:`, msg);
        // Si Gemini renvoie 429 et qu'OP.GG a déjà de vraies données live, basculer sans attendre
        if (opggResult && opggResult.builds.length > 0 && msg.includes('429')) {
          return opggResult;
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    if (opggResult && opggResult.builds.length > 0) {
      return opggResult;
    }

    const joinedErrors = errorMessages.join(' | ');
    if (joinedErrors.includes('429') || joinedErrors.toLowerCase().includes('quota')) {
      throw new Error(
        `Quota de recherche Google via Gemini atteint (429). Patientez une minute ou vérifiez votre quota Gemini (${joinedErrors.slice(0, 160)}).`,
      );
    }
    if (isTransientAiError(lastError)) {
      throw new Error(
        `La recherche Google via Gemini est momentanément indisponible (${joinedErrors.slice(0, 160)}). Réessayez dans quelques secondes.`,
      );
    }
    throw new Error(
      `Recherche de builds impossible : ${joinedErrors.slice(0, 200)}`,
    );
  } catch (outerErr) {
    if (opggResult && opggResult.builds.length > 0) {
      return opggResult;
    }
    throw outerErr;
  }
}

export async function analyzeVoiceMomentWithAi(payload: {
  audioBase64?: string;
  mimeType?: string;
  transcript?: string;
  snapshot?: LiveCoachSnapshot | null;
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  const { audioBase64, mimeType, snapshot, aiConfig } = payload;
  const cleanTranscript = typeof payload.transcript === 'string' ? payload.transcript.trim() : '';

  const compactSnapshot = snapshot
    ? {
        champion: snapshot.championName,
        level: snapshot.level,
        gameTimeSec: snapshot.gameTimeSec,
        kda: snapshot.kda,
        currentGold: snapshot.currentGold,
        dragonTimerSec: snapshot.dragonTimerSec,
        baronTimerSec: snapshot.baronTimerSec,
        gameState: snapshot.gameState,
        topEnemyThreats: (snapshot.enemyThreats || []).slice(0, 3),
      }
    : null;

  const responseSchema = {
    type: Type.OBJECT,
    required: ['transcript', 'detected', 'momentType', 'label', 'severity', 'headline', 'coachAction', 'spokenText'],
    properties: {
      transcript: {
        type: Type.STRING,
        description: 'Transcription exacte en français de ce que le joueur a dit dans l’audio.',
      },
      detected: { type: Type.BOOLEAN },
      momentType: {
        type: Type.STRING,
        description:
          'Un des choix exacts : DRAGON, BARON, HERALD_GRUBS, GANK_IMMINENT, RETREAT_DANGER, SUMMONER_DOWN, RECALL_BUY, TEAMFIGHT_ENGAGE, NONE',
      },
      label: { type: Type.STRING, description: 'Titre court du moment (ex: Dragon, Gank Imminent).' },
      severity: { type: Type.STRING, description: 'critical, warning ou tactical' },
      headline: { type: Type.STRING, description: 'Bandeau visuel court (max 8 mots).' },
      coachAction: { type: Type.STRING, description: 'Action tactique immédiate à faire (1-2 phrases).' },
      spokenText: {
        type: Type.STRING,
        description:
          'Phrase courte et naturelle en français lue à voix haute (écris "pièces d’or" et "secondes" en toutes lettres, max 18 mots).',
      },
    },
  };

  const systemInstruction =
    'Tu es un coach vocal League of Legends en temps réel. À partir de la phrase prononcée par le joueur et du contexte de la partie, identifie le moment clé LoL et donne une consigne courte, concrète et immédiatement actionnable.';

  const analyzeTranscriptText = async (spokenPhrase: string) => {
    const tactical = await generateJsonWithFallback({
      aiConfig,
      contents:
        `Phrase captée au micro pendant une partie de League of Legends :\n"${spokenPhrase}"\n\nContexte temps réel de la partie :\n` +
        JSON.stringify(compactSnapshot, null, 2),
      systemInstruction,
      responseSchema,
    });

    return {
      transcript: spokenPhrase,
      detected: Boolean(tactical?.detected),
      momentType: String(tactical?.momentType || 'NONE'),
      label: String(tactical?.label || 'Moment détecté'),
      severity:
        tactical?.severity === 'critical' || tactical?.severity === 'warning'
          ? tactical.severity
          : 'tactical',
      headline: String(tactical?.headline || 'Consigne tactique'),
      coachAction: String(tactical?.coachAction || ''),
      spokenText: String(tactical?.spokenText || tactical?.coachAction || ''),
    };
  };

  if (audioBase64 && !cleanTranscript) {
    const safeMime =
      typeof mimeType === 'string' && mimeType.startsWith('audio/')
        ? mimeType.split(';')[0]
        : 'audio/webm';

    // Détection rapide de silence complet pour les flux PCM WAV non compressés
    if (safeMime === 'audio/wav') {
      try {
        const rawBuf = Buffer.from(audioBase64, 'base64');
        if (rawBuf.length > 44) {
          let sumSq = 0;
          let samples = 0;
          for (let offset = 44; offset + 1 < rawBuf.length; offset += 2) {
            const sample = rawBuf.readInt16LE(offset) / 32768;
            sumSq += sample * sample;
            samples++;
          }
          const rms = samples > 0 ? Math.sqrt(sumSq / samples) : 0;
          if (rms < 0.003) {
            return {
              transcript: '',
              detected: false,
              momentType: 'NONE',
              label: 'Aucune parole détectée',
              severity: 'tactical',
              headline: 'Aucune parole captée',
              coachAction:
                'L’extrait audio est silencieux. Rapprochez-vous du micro et prononcez une consigne claire.',
              spokenText: 'Aucune parole détectée.',
            };
          }
        }
      } catch {
        // ignore malformed wav inspection and let Gemini inspect audio
      }
    }

    const ai = getGeminiClient();
    const { ThinkingLevel } = await import('@google/genai');
    const attempts = [
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    ];

    const transcriptionSchema = {
      type: Type.OBJECT,
      required: ['hasClearSpeech', 'transcript'],
      properties: {
        hasClearSpeech: {
          type: Type.BOOLEAN,
          description: 'true uniquement si une vraie voix humaine prononce des mots intelligibles, false si silence ou bruit.',
        },
        transcript: {
          type: Type.STRING,
          description: 'Transcription mot pour mot en français uniquement de ce qui est réellement entendu, sinon chaîne vide.',
        },
      },
    };

    let transcribed: { hasClearSpeech?: boolean; transcript?: string } | null = null;
    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        const res = await ai.models.generateContent({
          model: attempt.model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: safeMime,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcris mot pour mot la parole humaine en français dans cet audio. Si tu n’entends que du silence, du souffle ou aucun mot distinct, mets hasClearSpeech=false et transcript="". Ne devine rien.',
              },
            ],
          },
          config: {
            temperature: 0,
            systemInstruction:
              'Tu es un transcripteur audio littéral et strict. Tu ne transcris que des mots réellement prononcés par une voix humaine. En cas de silence ou de doute, retourne toujours hasClearSpeech=false et transcript="".',
            thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema: transcriptionSchema as any,
          },
        });
        transcribed = JSON.parse((res.text ?? '{}').trim());
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!transcribed) {
      throw new Error(
        lastError instanceof Error
          ? `Analyse audio Gemini impossible : ${lastError.message.slice(0, 180)}`
          : 'Analyse audio Gemini indisponible.',
      );
    }

    const heardText = String(transcribed.transcript || '').trim();
    if (!transcribed.hasClearSpeech || !heardText) {
      return {
        transcript: '',
        detected: false,
        momentType: 'NONE',
        label: 'Aucune parole détectée',
        severity: 'tactical',
        headline: 'Aucune phrase intelligible captée',
        coachAction:
          'Aucune voix claire n’a été détectée dans cet extrait. Parlez distinctement près du micro.',
        spokenText: 'Aucune parole détectée.',
      };
    }

    return analyzeTranscriptText(heardText);
  }

  if (!cleanTranscript) {
    return {
      transcript: '',
      detected: false,
      momentType: 'NONE',
      label: 'Aucune parole détectée',
      severity: 'tactical',
      headline: 'Aucune phrase exploitable captée',
      coachAction: 'Parlez un peu plus près du micro ou prononcez un repère clair (ex: Dragon, Baron, Gank).',
      spokenText: 'Aucune commande détectée.',
    };
  }

  const tactical = await generateJsonWithFallback({
    aiConfig,
    contents:
      `Phrase captée au micro pendant une partie de League of Legends :\n"${cleanTranscript}"\n\nContexte temps réel de la partie :\n` +
      JSON.stringify(compactSnapshot, null, 2),
    systemInstruction,
    responseSchema,
  });

  return {
    transcript: cleanTranscript,
    detected: Boolean(tactical?.detected),
    momentType: String(tactical?.momentType || 'NONE'),
    label: String(tactical?.label || 'Moment détecté'),
    severity:
      tactical?.severity === 'critical' || tactical?.severity === 'warning'
        ? tactical.severity
        : 'tactical',
    headline: String(tactical?.headline || 'Consigne tactique'),
    coachAction: String(tactical?.coachAction || ''),
    spokenText: String(tactical?.spokenText || tactical?.coachAction || ''),
  };
}

export interface BuildComparisonSnapshotPayload {
  name: string;
  championName: string;
  items: string[];
  keystoneName?: string;
  secondaryTreeName?: string;
  totalGold: number;
  goldEfficiencyPct: number;
  realDps: number;
  totalMitigatedDamage: number;
  estimatedTtkSec: number;
  autoDps: number;
  abilityImpactIndex: number;
  abilityKitMitigated: number;
  itemPassivesMitigated: number;
  physicalEhp: number;
  magicEhp: number;
  hp: number;
  armor: number;
  mr: number;
  ad: number;
  ap: number;
  attackSpeed: number;
  abilityHaste: number;
  moveSpeed: number;
  combatHealingTotal: number;
}

export async function generateTwoBuildsAiComparison(payload: {
  championName: string;
  role: string;
  gameMode: string;
  level: number;
  combatDurationSec: number;
  buildA: BuildComparisonSnapshotPayload;
  buildB: BuildComparisonSnapshotPayload;
  matchup: {
    targetName: string;
    targetHp: number;
    targetArmor: number;
    targetMr: number;
    physicalShare: number;
    magicShare: number;
    tankCount: number;
    highHealCount: number;
    burstThreatCount: number;
    matchupNote?: string | null;
    enemies: Array<{
      name: string;
      damage: string;
      tankiness: number;
      sustain: number;
      burst: number;
      cc: number;
    }>;
  };
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  const { championName, role, gameMode, level, combatDurationSec, buildA, buildB, matchup, aiConfig } =
    payload;

  const goldDiff = buildB.totalGold - buildA.totalGold;
  const dpsDiff = Number((buildB.realDps - buildA.realDps).toFixed(1));
  const dmgDiff = Math.round(buildB.totalMitigatedDamage - buildA.totalMitigatedDamage);
  const physEhpDiff = Math.round(buildB.physicalEhp - buildA.physicalEhp);
  const magEhpDiff = Math.round(buildB.magicEhp - buildA.magicEhp);

  const structuredInput = {
    context: {
      championName,
      role,
      gameMode,
      level,
      combatDurationSec,
    },
    buildA,
    buildB,
    exactDeltasBMinusA: {
      goldDiff,
      realDpsDiff: dpsDiff,
      totalMitigatedDamageDiff: dmgDiff,
      physEhpDiff,
      magEhpDiff,
      hpDiff: Math.round(buildB.hp - buildA.hp),
      armorDiff: Number((buildB.armor - buildA.armor).toFixed(1)),
      mrDiff: Number((buildB.mr - buildA.mr).toFixed(1)),
      abilityHasteDiff: Math.round(buildB.abilityHaste - buildA.abilityHaste),
    },
    matchup,
  };

  const raw = await generateJsonWithFallback({
    aiConfig,
    contents:
      `Compare ces deux builds enregistrés pour ${championName} (${role}, niveau ${level}, mode ${gameMode}) face à la composition adverse donnée.\n` +
      `Tu DOIS produire une comparaison point par point basée STRICTEMENT sur les statistiques simulées (DPS réel, dégâts sur ${combatDurationSec}s, TTK, survie/EHP physique & magique, PV, soin en combat, coût en or, rentabilité) et sur le matchup adverse (menaces AD/AP, tanks, soin, burst, cible principale ${matchup.targetName}).\n` +
      `Ne modifie jamais les noms d'objets ni les chiffres ci-dessous, et n'invente aucune statistique absente.\n\n` +
      JSON.stringify(structuredInput, null, 2),
    systemInstruction:
      'Tu es un analyste League of Legends de niveau Challenger. Tu compares objectivement deux builds enregistrés (Build A vs Build B) point par point en français clair, chiffré et orienté décision pour le matchup exact.',
    responseSchema: {
      type: Type.OBJECT,
      required: [
        'winner',
        'verdictHeadline',
        'recommendedCondition',
        'pointByPoint',
        'tacticalTakeaways',
      ],
      properties: {
        winner: {
          type: Type.STRING,
          description: "Exactement 'A', 'B' ou 'SITUATIONNEL'.",
        },
        verdictHeadline: {
          type: Type.STRING,
          description: 'Verdict principal clair en 1 à 2 phrases citant les écarts clés.',
        },
        recommendedCondition: {
          type: Type.STRING,
          description: 'Règle simple indiquant quand choisir le Build A vs le Build B dans cette partie.',
        },
        pointByPoint: {
          type: Type.ARRAY,
          description:
            'Exactement 4 axes ordonnés : 1) DPS & Dégâts réels, 2) Survie & Tenue (EHP), 3) Coût & Rentabilité Or, 4) Adaptation au Matchup Adverse.',
          items: {
            type: Type.OBJECT,
            required: ['axis', 'winner', 'metricSummary', 'analysis'],
            properties: {
              axis: { type: Type.STRING },
              winner: {
                type: Type.STRING,
                description: "Exactement 'A', 'B' ou 'ÉGALITÉ'.",
              },
              metricSummary: {
                type: Type.STRING,
                description: 'Comparaison chiffrée exacte A vs B pour cet axe.',
              },
              analysis: {
                type: Type.STRING,
                description: 'Explication tactique concrète (2 phrases max) expliquant pourquoi cet écart compte.',
              },
            },
          },
        },
        tacticalTakeaways: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3 conseils concrets pour jouer le build retenu contre ce matchup.',
        },
      },
    },
  });

  const normalizeWinner = (val: unknown, allowSituational = false): string => {
    const up = String(val || '').trim().toUpperCase();
    if (up === 'A' || up.includes('BUILD A')) return 'A';
    if (up === 'B' || up.includes('BUILD B')) return 'B';
    if (allowSituational) return 'SITUATIONNEL';
    return 'ÉGALITÉ';
  };

  const axes = Array.isArray(raw?.pointByPoint) ? raw.pointByPoint : [];

  return {
    winner: normalizeWinner(raw?.winner, true),
    verdictHeadline: nonEmpty(raw?.verdictHeadline),
    recommendedCondition: nonEmpty(raw?.recommendedCondition),
    pointByPoint: axes.map((item: any) => ({
      axis: nonEmpty(item?.axis) || 'Critère',
      winner: normalizeWinner(item?.winner, false),
      metricSummary: nonEmpty(item?.metricSummary),
      analysis: nonEmpty(item?.analysis),
    })),
    tacticalTakeaways: Array.isArray(raw?.tacticalTakeaways)
      ? raw.tacticalTakeaways.map((t: unknown) => nonEmpty(t)).filter(Boolean).slice(0, 4)
      : [],
    ...(raw?._aiMeta ? { _aiMeta: raw._aiMeta } : {}),
  };
}

export async function generateRuneItemSynergyAnalysis(payload: {
  championName: string;
  role: string;
  gameMode: string;
  level: number;
  combatDurationSec: number;
  runes: {
    primaryTreeName: string;
    secondaryTreeName: string;
    keystoneName: string;
    keystoneDesc?: string;
    minorRunes: Array<{ name: string; desc?: string }>;
    shards: string[];
    runeGoldValue: number;
  };
  items: Array<{
    name: string;
    cost: number;
    tags: string[];
    passives: string[];
  }>;
  totals: {
    hp: number;
    ad: number;
    ap: number;
    armor: number;
    mr: number;
    attackSpeed: number;
    asOvercapPct: number;
    abilityHaste: number;
    cooldownReductionPct: number;
    critChancePct: number;
    lethality: number;
    armorPenPct: number;
    magicPenFlat: number;
    magicPenPct: number;
    lifestealPct: number;
    omnivampPct: number;
    tenacityPct: number;
    physicalEhp: number;
    magicEhp: number;
  };
  runeSources: {
    hp: number;
    ad: number;
    ap: number;
    armor: number;
    mr: number;
    abilityHaste: number;
    moveSpeed: number;
  };
  combatVsTarget: {
    targetName: string;
    targetHp: number;
    targetArmor: number;
    targetMr: number;
    effectiveArmor: number;
    effectiveMr: number;
    physicalMitigationPct: number;
    magicMitigationPct: number;
    totalRawDamage: number;
    totalMitigatedDamage: number;
    realDps: number;
    abilityKitRaw: number;
    abilityKitMitigated: number;
    combatHealingTotal: number;
    estimatedTtkSec: number;
    damageDeltaVsMetaRunes: number;
  };
  matchupSummary: {
    physicalShare: number;
    magicShare: number;
    tankCount: number;
    highHealCount: number;
    burstThreatCount: number;
    enemies: string[];
  };
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  const {
    championName,
    role,
    gameMode,
    level,
    combatDurationSec,
    runes,
    items,
    totals,
    runeSources,
    combatVsTarget,
    matchupSummary,
    aiConfig,
  } = payload;

  const mitigationRetentionPct =
    combatVsTarget.totalRawDamage > 0
      ? Number(
          ((combatVsTarget.totalMitigatedDamage / combatVsTarget.totalRawDamage) * 100).toFixed(1),
        )
      : 100;

  const structuredInput = {
    context: {
      championName,
      role,
      gameMode,
      level,
      combatDurationSec,
    },
    runes,
    items,
    totals,
    runeSources,
    combatVsTarget: {
      ...combatVsTarget,
      mitigationRetentionPct,
    },
    matchupSummary,
  };

  const raw = await generateJsonWithFallback({
    aiConfig,
    contents:
      `Analyse en profondeur la synergie entre les runes sélectionnées (${runes.keystoneName}, ${runes.primaryTreeName} / ${runes.secondaryTreeName}) et les ${items.length} objets équipés sur ${championName} (${role}, niveau ${level}, mode ${gameMode}).\n` +
      `En te basant EXCLUSIVEMENT sur les données exactes ci-dessous :\n` +
      `1. Calcule et explique les bonus statistiques réels combinés (valeur or des runes, % de pénétration magique/armure et pénétration fixe vs dégâts bruts & mitigation réelle sur ${combatVsTarget.targetName}, efficacité CDR/vitesse d'attaque/overcap).\n` +
      `2. Compare l'intérêt d'investir davantage en pénétration (%) vs dégâts bruts (AP/AD purs) face aux résistances actuelles de la cible (${combatVsTarget.targetArmor} Armure -> ${combatVsTarget.effectiveArmor} effective, ${combatVsTarget.targetMr} RM -> ${combatVsTarget.effectiveMr} effective).\n` +
      `3. Propose des ajustements concrets de runes/fragments et d'objets s'il existe une antisynergie ou un gain mesurable.\n` +
      `Ne modifie jamais les noms d'objets/runes ni n'invente de statistiques absentes.\n\n` +
      JSON.stringify(structuredInput, null, 2),
    systemInstruction:
      'Tu es un expert theorycraft League of Legends de niveau Challenger. Tu analyses rigoureusement les synergies Runes × Objets en français clair, chiffré (pénétration %, dégâts bruts vs mitigés, overcap AS, hâte, EHP) et orienté ajustements concrets.',
    responseSchema: {
      type: Type.OBJECT,
      required: [
        'synergyScore',
        'synergyVerdict',
        'headline',
        'realStatBonuses',
        'penetrationVsRawAnalysis',
        'runeAdjustments',
        'itemAdjustments',
      ],
      properties: {
        synergyScore: {
          type: Type.INTEGER,
          description: 'Note globale de synergie Runes × Objets entre 0 et 100.',
        },
        synergyVerdict: {
          type: Type.STRING,
          description: "Exactement 'OPTIMALE', 'SOLIDE', 'MITIGÉE' ou 'ANTISYNERGIE'.",
        },
        headline: {
          type: Type.STRING,
          description: 'Verdict synthétique en 1 à 2 phrases sur la cohérence globale Runes × Objets.',
        },
        realStatBonuses: {
          type: Type.ARRAY,
          description:
            '4 bonus statistiques réels calculés (ex: Pénétration effective vs RM/Armure cible, Rendement dégâts bruts → mitigés, Valeur statistique des runes en or, Scaling Hâte / AS / Overcap).',
          items: {
            type: Type.OBJECT,
            required: ['label', 'computedValue', 'formulaExplanation'],
            properties: {
              label: { type: Type.STRING },
              computedValue: {
                type: Type.STRING,
                description: 'Valeur chiffrée concise calculée à partir des données.',
              },
              formulaExplanation: {
                type: Type.STRING,
                description: 'Explication concrète de comment la rune et les objets interagissent.',
              },
            },
          },
        },
        penetrationVsRawAnalysis: {
          type: Type.STRING,
          description:
            'Analyse détaillée comparant le gain réel de la pénétration (% et fixe) par rapport aux dégâts bruts (AP/AD/DoT) face aux résistances de la cible et des ennemis.',
        },
        runeAdjustments: {
          type: Type.ARRAY,
          description: '1 à 3 ajustements précis de runes ou fragments (ou confirmation si optimal).',
          items: {
            type: Type.OBJECT,
            required: ['currentElement', 'suggestedChange', 'expectedGain', 'reason'],
            properties: {
              currentElement: { type: Type.STRING },
              suggestedChange: { type: Type.STRING },
              expectedGain: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
          },
        },
        itemAdjustments: {
          type: Type.ARRAY,
          description: '1 à 3 ajustements ou confirmations d’objets pour renforcer la synergie avec ces runes.',
          items: {
            type: Type.OBJECT,
            required: ['currentElement', 'suggestedChange', 'expectedGain', 'reason'],
            properties: {
              currentElement: { type: Type.STRING },
              suggestedChange: { type: Type.STRING },
              expectedGain: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
          },
        },
      },
    },
  });

  const rawScore = Number(raw?.synergyScore);
  const synergyScore = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 75;

  const rawVerdict = String(raw?.synergyVerdict || '').trim().toUpperCase();
  const synergyVerdict =
    rawVerdict === 'OPTIMALE' ||
    rawVerdict === 'SOLIDE' ||
    rawVerdict === 'MITIGÉE' ||
    rawVerdict === 'ANTISYNERGIE'
      ? rawVerdict
      : synergyScore >= 85
        ? 'OPTIMALE'
        : synergyScore >= 70
          ? 'SOLIDE'
          : synergyScore >= 50
            ? 'MITIGÉE'
            : 'ANTISYNERGIE';

  const mapAdjustments = (arr: unknown) =>
    Array.isArray(arr)
      ? arr.slice(0, 3).map((a: any) => ({
          currentElement: nonEmpty(a?.currentElement) || 'Configuration actuelle',
          suggestedChange: nonEmpty(a?.suggestedChange) || 'Conserver tel quel',
          expectedGain: nonEmpty(a?.expectedGain) || 'Synergie maintenue',
          reason: nonEmpty(a?.reason),
        }))
      : [];

  return {
    synergyScore,
    synergyVerdict,
    headline: nonEmpty(raw?.headline),
    realStatBonuses: Array.isArray(raw?.realStatBonuses)
      ? raw.realStatBonuses.slice(0, 4).map((b: any) => ({
          label: nonEmpty(b?.label) || 'Bonus statistique',
          computedValue: nonEmpty(b?.computedValue),
          formulaExplanation: nonEmpty(b?.formulaExplanation),
        }))
      : [],
    penetrationVsRawAnalysis: nonEmpty(raw?.penetrationVsRawAnalysis),
    runeAdjustments: mapAdjustments(raw?.runeAdjustments),
    itemAdjustments: mapAdjustments(raw?.itemAdjustments),
    ...(raw?._aiMeta ? { _aiMeta: raw._aiMeta } : {}),
  };
}

export async function fetchProBuildMetaComparison(payload: {
  championName: string;
  championId: string;
  role: string;
  gameMode: string;
  patchVersion: string;
  level: number;
  targetName: string;
  currentBuild: {
    items: string[];
    keystoneName: string;
    secondaryTreeName: string;
    totalGold: number;
    realDps: number;
    totalMitigatedDamage: number;
    physicalEhp: number;
    magicEhp: number;
    hp: number;
    ad: number;
    ap: number;
    armor: number;
    mr: number;
    attackSpeed: number;
    abilityHaste: number;
    moveSpeed: number;
  };
  aiConfig?: Partial<AiUserSelection> | null;
}) {
  const {
    championName,
    championId,
    role,
    gameMode,
    patchVersion,
    level,
    targetName,
    currentBuild,
    aiConfig,
  } = payload;

  const modeLabel =
    gameMode === 'ARAM'
      ? 'ARAM'
      : gameMode === 'SWIFTPLAY'
        ? 'Swiftplay / Summoner Rift'
        : 'Ranked Solo/Duo Master+ / Challenger / Probuilds';

  const opggPromise = fetchOpggLiveBuilds({
    championName,
    championId,
    role,
    gameMode,
    patchVersion,
  }).catch(() => null);

  const prompt =
    `Effectue une recherche Google en direct (Lolalytics Master+, U.GG, OP.GG, Probuilds / Gol.gg) pour identifier le build le plus efficace et performant joué à haut rang (Master+, Challenger ou joueurs Pro) dans la méta actuelle (patch ${patchVersion}) pour "${championName}" (${championId}) au poste "${role}" (${modeLabel}).\n\n` +
    `Compare ensuite ce build Pro / Haut Rang avec le build actuel du joueur (Niv.${level} face à ${targetName}) :\n` +
    JSON.stringify(currentBuild, null, 2) +
    `\n\nRéponds STRICTEMENT avec un objet JSON valide (sans texte avant ni après) respectant exactement cette structure :\n` +
    `{\n` +
    `  "proBuild": {\n` +
    `    "sourceSite": "Lolalytics Master+ / OP.GG / Probuilds",\n` +
    `    "eloTier": "Ex: Master+ / Challenger / Pro",\n` +
    `    "buildTitle": "Nom court du build Pro (en français)",\n` +
    `    "winRateNote": "Ex: ~54.1% WR (ou 'Méta haut rang' si non chiffré)",\n` +
    `    "pickRateNote": "Ex: Build core le plus performant à haut elo",\n` +
    `    "bootsName": "Nom exact des bottes (1 paire, ex: Plated Steelcaps ou Coques en acier)",\n` +
    `    "itemNames": ["Objet légendaire 1", "Objet légendaire 2", "Objet légendaire 3", "Objet légendaire 4", "Objet légendaire 5"],\n` +
    `    "keystoneName": "Nom exact de la rune fondamentale (ex: Press the Attack ou Attaque soutenue)",\n` +
    `    "secondaryTreeName": "Arbre secondaire (ex: Sorcellerie / Volonté / Inspiration)",\n` +
    `    "rationale": "Pourquoi les joueurs Pro / Challenger choisissent cet ordre d'objets et ces runes sur ce patch."\n` +
    `  },\n` +
    `  "proVsCurrentAnalysis": {\n` +
    `    "verdictHeadline": "Comparaison directe en 1-2 phrases entre le build actuel du joueur et ce build Pro.",\n` +
    `    "keyDifferences": [\n` +
    `      "Différence clé 1 (dégâts / DPS / pénétration)",\n` +
    `      "Différence clé 2 (survie / PV / résistances)",\n` +
    `      "Différence clé 3 (coût en or / pic de puissance / runes)"\n` +
    `    ],\n` +
    `    "adoptionAdvice": "Quand garder le build actuel vs adopter la variante Pro dans cette partie."\n` +
    `  }\n` +
    `}\n` +
    `IMPORTANT : Indique toujours exactement 1 paire de bottes dans "bootsName" et 5 objets complets (légendaires) dans "itemNames" pour obtenir un build complet de 6 emplacements comparables.`;

  const opggFallback = await opggPromise;

  const useExternalProvider =
    aiConfig?.provider &&
    aiConfig.provider !== 'gemini' &&
    (!process.env.GEMINI_API_KEY?.trim() || aiConfig.fallbackToGemini === false);

  const normalizeResult = (
    parsed: any,
    groundingSources: Array<{ title: string; uri: string }>,
    metaLabel?: string,
  ) => {
    const pb = parsed?.proBuild || {};
    const an = parsed?.proVsCurrentAnalysis || {};
    return {
      proBuild: {
        sourceSite: nonEmpty(pb.sourceSite) || metaLabel || 'Méta Haut Rang',
        eloTier: nonEmpty(pb.eloTier) || 'Master+ / Pro',
        buildTitle: nonEmpty(pb.buildTitle) || `Build Pro ${championName}`,
        winRateNote: nonEmpty(pb.winRateNote) || 'Méta haut rang',
        pickRateNote: nonEmpty(pb.pickRateNote) || 'Build performant',
        bootsName: nonEmpty(pb.bootsName),
        itemNames: Array.isArray(pb.itemNames)
          ? pb.itemNames.map((n: unknown) => nonEmpty(n)).filter(Boolean).slice(0, 6)
          : [],
        keystoneName: nonEmpty(pb.keystoneName),
        secondaryTreeName: nonEmpty(pb.secondaryTreeName),
        rationale: nonEmpty(pb.rationale),
      },
      proVsCurrentAnalysis: {
        verdictHeadline: nonEmpty(an.verdictHeadline),
        keyDifferences: Array.isArray(an.keyDifferences)
          ? an.keyDifferences.map((d: unknown) => nonEmpty(d)).filter(Boolean).slice(0, 4)
          : [],
        adoptionAdvice: nonEmpty(an.adoptionAdvice),
      },
      groundingSources: groundingSources.slice(0, 6),
    };
  };

  if (useExternalProvider) {
    const parsed = await generateStructuredWithSelectedProvider({
      contents: prompt,
      systemInstruction:
        'Analyste League of Legends expert niveau Challenger. Tu identifies le build haut rang / Pro le plus efficace de la méta et tu le compares objectivement au build du joueur.',
      responseSchema: {
        type: Type.OBJECT,
        required: ['proBuild', 'proVsCurrentAnalysis'],
        properties: {
          proBuild: {
            type: Type.OBJECT,
            required: ['sourceSite', 'buildTitle', 'bootsName', 'itemNames', 'rationale'],
            properties: {
              sourceSite: { type: Type.STRING },
              eloTier: { type: Type.STRING },
              buildTitle: { type: Type.STRING },
              winRateNote: { type: Type.STRING },
              pickRateNote: { type: Type.STRING },
              bootsName: { type: Type.STRING },
              itemNames: { type: Type.ARRAY, items: { type: Type.STRING } },
              keystoneName: { type: Type.STRING },
              secondaryTreeName: { type: Type.STRING },
              rationale: { type: Type.STRING },
            },
          },
          proVsCurrentAnalysis: {
            type: Type.OBJECT,
            required: ['verdictHeadline', 'keyDifferences', 'adoptionAdvice'],
            properties: {
              verdictHeadline: { type: Type.STRING },
              keyDifferences: { type: Type.ARRAY, items: { type: Type.STRING } },
              adoptionAdvice: { type: Type.STRING },
            },
          },
        },
      },
      aiConfig,
    });

    return {
      ...normalizeResult(
        parsed,
        opggFallback?.groundingSources || [],
        parsed?._aiMeta?.providerLabel,
      ),
      ...(parsed?._aiMeta ? { _aiMeta: parsed._aiMeta } : {}),
    };
  }

  const ai = getGeminiClient();
  const selectedGeminiModel =
    aiConfig?.provider === 'gemini' && aiConfig.model?.trim()
      ? aiConfig.model.trim()
      : 'gemini-4-hydrogen';
  const attempts = Array.from(
    new Set([selectedGeminiModel, 'gemini-4-hydrogen', 'gemini-3.1-flash-lite']),
  );

  let lastError: unknown = null;
  const errorMessages: string[] = [];

  for (const model of attempts) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction:
            'Analyste League of Legends expert utilisant Google Search Grounding. Tu retournes uniquement un objet JSON valide décrivant le build Pro / Master+ le plus performant du patch et sa comparaison au build du joueur.',
        },
      });

      const parsed = extractJsonObjectFromText(response.text ?? '{}');
      const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seenUris = new Set<string>();
      const groundingSources: Array<{ title: string; uri: string }> = [];
      for (const ch of rawChunks) {
        const uri = ch?.web?.uri;
        const title = ch?.web?.title;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          groundingSources.push({ title: title || uri, uri });
        }
      }

      const normalized = normalizeResult(parsed, groundingSources);
      if (normalized.proBuild.itemNames.length === 0) {
        throw new Error('Aucun objet Pro exploitable retourné par la recherche Google.');
      }

      return {
        ...normalized,
        _aiMeta: {
          provider: 'gemini',
          providerLabel: 'Gemini + Google Search',
          model,
          usedFallback: model !== selectedGeminiModel,
        },
      };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      errorMessages.push(`${model}: ${msg.slice(0, 120)}`);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  // Repli structuré sur OP.GG Live + analyse IA si Google Search est saturé (429)
  if (opggFallback && opggFallback.builds.length > 0) {
    const topOpgg = opggFallback.builds[0];
    try {
      const analysis = await generateStructuredWithSelectedProvider({
        aiConfig,
        contents:
          `Compare ce build live haut rang trouvé sur ${topOpgg.sourceSite} (${topOpgg.winRateNote}) avec le build actuel du joueur pour ${championName} (${role}) :\n` +
          JSON.stringify({ proBuild: topOpgg, currentBuild }, null, 2),
        systemInstruction:
          'Analyste LoL concis. Compare objectivement le build haut rang et le build actuel sans inventer de statistiques.',
        responseSchema: {
          type: Type.OBJECT,
          required: ['verdictHeadline', 'keyDifferences', 'adoptionAdvice'],
          properties: {
            verdictHeadline: { type: Type.STRING },
            keyDifferences: { type: Type.ARRAY, items: { type: Type.STRING } },
            adoptionAdvice: { type: Type.STRING },
          },
        },
      });
      return {
        proBuild: {
          sourceSite: topOpgg.sourceSite,
          eloTier: 'Haut Rang (OP.GG Live)',
          buildTitle: topOpgg.buildTitle,
          winRateNote: topOpgg.winRateNote,
          pickRateNote: topOpgg.pickRateNote,
          bootsName: topOpgg.bootsName,
          itemNames: topOpgg.itemNames,
          keystoneName: topOpgg.keystoneName,
          secondaryTreeName: topOpgg.secondaryTreeName,
          rationale: topOpgg.rationale,
        },
        proVsCurrentAnalysis: {
          verdictHeadline: nonEmpty(analysis?.verdictHeadline),
          keyDifferences: Array.isArray(analysis?.keyDifferences)
            ? analysis.keyDifferences.map((d: unknown) => nonEmpty(d)).filter(Boolean).slice(0, 4)
            : [],
          adoptionAdvice: nonEmpty(analysis?.adoptionAdvice),
        },
        groundingSources: opggFallback.groundingSources,
        _aiMeta: analysis?._aiMeta,
      };
    } catch {
      // Laisser remonter l'erreur d'origine si l'analyse IA échoue aussi
    }
  }

  const joinedErrors = errorMessages.join(' | ');
  if (isTransientAiError(lastError) || joinedErrors.includes('429')) {
    throw new Error(
      `Le moteur IA connaît un pic de charge momentané (429/503). Réessayez dans quelques secondes (${joinedErrors.slice(0, 140)}).`,
    );
  }
  throw new Error(
    `Impossible de récupérer le build Pro via l’IA : ${joinedErrors.slice(0, 180)}`,
  );
}







