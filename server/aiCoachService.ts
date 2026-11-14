import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  BuildRecommendation,
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
  const attempts: Array<{ model: string; useThinking: boolean }> = [
    { model: 'gemini-4-hydrogen', useThinking: true },
    { model: 'gemini-2.5-flash', useThinking: false },
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
          ...(attempt.useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
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
      properties: {
        immediateCall: { type: Type.STRING, description: 'Action prioritaire dans les 30 prochaines secondes.' },
        recallAdvice: { type: Type.STRING, description: 'Conseil sur le timing de rappel et prochain achat.' },
        dangerWatch: { type: Type.STRING, description: 'Menace adverse à surveiller et positionnement recommandé.' },
      },
    },
  });
}
