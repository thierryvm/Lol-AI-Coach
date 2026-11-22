import type { LiveCoachSnapshot } from './types.ts';

export type KeyMomentType =
  | 'DRAGON'
  | 'BARON'
  | 'HERALD_GRUBS'
  | 'GANK_IMMINENT'
  | 'RETREAT_DANGER'
  | 'SUMMONER_DOWN'
  | 'RECALL_BUY'
  | 'TEAMFIGHT_ENGAGE';

export type VoiceFeedbackMode = 'both' | 'visual' | 'vocal';

export type VoiceDetectionSource = 'speech-live' | 'gemini-audio' | 'simulation';

export interface VoiceMomentDetection {
  id: string;
  type: KeyMomentType;
  label: string;
  severity: 'critical' | 'warning' | 'tactical';
  matchedPhrase: string;
  transcript: string;
  headline: string;
  coachAction: string;
  spokenText: string;
  gameTimeSec: number;
  detectedAt: string;
  source: VoiceDetectionSource;
}

export interface VoiceTestPreset {
  id: string;
  label: string;
  sampleTranscript: string;
  type: KeyMomentType;
}

export const VOICE_TEST_PRESETS: VoiceTestPreset[] = [
  {
    id: 'preset-dragon',
    label: '« Dragon dans 30s »',
    sampleTranscript: 'Attention on prépare le dragon dans 30 secondes',
    type: 'DRAGON',
  },
  {
    id: 'preset-baron',
    label: '« Baron Nashor »',
    sampleTranscript: 'Ils démarrent le baron nashor au top',
    type: 'BARON',
  },
  {
    id: 'preset-gank',
    label: '« Gank imminent »',
    sampleTranscript: 'Gank imminent sur la lane, le jungler arrive',
    type: 'GANK_IMMINENT',
  },
  {
    id: 'preset-flash',
    label: '« Plus de flash »',
    sampleTranscript: 'Le carry adverse a plus de flash',
    type: 'SUMMONER_DOWN',
  },
];

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function normalizeSpeechText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DetectionPatternRule {
  type: KeyMomentType;
  label: string;
  severity: 'critical' | 'warning' | 'tactical';
  keywords: string[];
}

const DETECTION_RULES: DetectionPatternRule[] = [
  {
    type: 'BARON',
    label: 'Baron Nashor',
    severity: 'critical',
    keywords: [
      'baron',
      'nashor',
      'nash',
      'nacheur',
      'nacher',
      'riviere nord',
      'pit baron',
    ],
  },
  {
    type: 'DRAGON',
    label: 'Dragon',
    severity: 'critical',
    keywords: [
      'dragon',
      'drake',
      'elder',
      'ancestral',
      'soul',
      'ame du dragon',
      'infernal',
      'hextech',
      'chemtech',
    ],
  },
  {
    type: 'GANK_IMMINENT',
    label: 'Gank Imminent',
    severity: 'critical',
    keywords: [
      'gank imminent',
      'gank',
      'ganke',
      'gang imminent',
      'jungler arrive',
      'le jungler',
      'jungle top',
      'jungle mid',
      'jungle bot',
      'roam',
      'decale',
      'embuscade',
      'dans le bush',
      'dans le buisson',
      'derriere nous',
      'missing',
      'disparu',
      'dive',
    ],
  },
  {
    type: 'RETREAT_DANGER',
    label: 'Alerte Repli',
    severity: 'warning',
    keywords: [
      'recule',
      'reculez',
      'reculer',
      'danger',
      'piege',
      'trap',
      'trop avance',
      'overextend',
      'fuis',
      'fuyez',
      'on se fait catch',
      'degage',
    ],
  },
  {
    type: 'HERALD_GRUBS',
    label: 'Objectif Rivière Nord (Larves / Héraut / Atakhan)',
    severity: 'warning',
    keywords: [
      'heraut',
      'herald',
      'larves',
      'grubs',
      'voidgrubs',
      'atakhan',
      'carapateur',
    ],
  },
  {
    type: 'SUMMONER_DOWN',
    label: 'Sort clé adverse utilisé',
    severity: 'tactical',
    keywords: [
      'plus de flash',
      'pas de flash',
      'no flash',
      'flash down',
      'a flash',
      'sans flash',
      'plus d ulti',
      'pas d ulti',
      'no ult',
      'tp down',
      'sans tp',
      'plus de soin',
      'plus de heal',
    ],
  },
  {
    type: 'RECALL_BUY',
    label: 'Fenêtre de Rappel & Achat',
    severity: 'tactical',
    keywords: [
      'je back',
      'on back',
      'rappel',
      'acheter',
      'au shop',
      'reset',
      'plus de mana',
      'low hp',
      'pas de vie',
    ],
  },
  {
    type: 'TEAMFIGHT_ENGAGE',
    label: 'Opportunité Engage / Teamfight',
    severity: 'tactical',
    keywords: [
      'engage',
      'on fight',
      'teamfight',
      'all in',
      'go go',
      'focus',
      'peel',
      'proteger',
      'prendre la tour',
    ],
  },
];

function findKeywordMatch(normalizedText: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s)${escaped}(\\s|$|[.,!?])`, 'i');
    if (regex.test(normalizedText)) {
      return kw;
    }
  }
  return null;
}

export function buildContextualFeedbackForMoment(
  type: KeyMomentType,
  snapshot?: LiveCoachSnapshot | null,
): Pick<VoiceMomentDetection, 'label' | 'severity' | 'headline' | 'coachAction' | 'spokenText'> {
  const dragonTimer = snapshot?.dragonTimerSec ?? null;
  const baronTimer = snapshot?.baronTimerSec ?? null;
  const currentGold = snapshot?.currentGold ?? 0;
  const topThreat =
    snapshot?.enemyPlayers?.find((p) => p.dangerLevel === 'Élevé') ||
    snapshot?.enemyThreats?.[0];
  const threatLabel = topThreat
    ? `${topThreat.championName} (${topThreat.kills} kills)`
    : 'le jungler adverse';

  switch (type) {
    case 'DRAGON': {
      const timerNote =
        dragonTimer === 0
          ? 'Dragon déjà disponible sur la carte'
          : dragonTimer != null
            ? `Apparition estimée dans ${formatClock(dragonTimer)}`
            : 'Vérifiez le timer Dragon';
      return {
        label: 'Dragon détecté',
        severity: 'critical',
        headline: `Priorité Dragon · ${timerNote}`,
        coachAction:
          currentGold >= 1100
            ? `Vous avez ${currentGold} po : poussez la vague, rappelez immédiatement pour dépenser et posez 2 balises dans la rivière sud 45s avant le fight.`
            : 'Poussez la vague mid/bot pour avoir la priorité, nettoyez les balises ennemies avec le Brouilleur et ne facecheckez pas seul.',
        spokenText:
          dragonTimer === 0
            ? 'Alerte Dragon disponible. Poussez la vague et sécurisez la vision côté rivière sud.'
            : 'Préparation Dragon. Pensez à rappeler pour vos objets et poser la vision.',
      };
    }

    case 'BARON': {
      const timerNote =
        baronTimer === 0
          ? 'Baron Nashor actif'
          : baronTimer != null
            ? `Timer estimé ${formatClock(baronTimer)}`
            : 'Rivière nord';
      return {
        label: 'Baron Nashor détecté',
        severity: 'critical',
        headline: `Alerte Baron Nashor · ${timerNote}`,
        coachAction:
          'Ne lancez jamais le Baron à 5v5 si le jungler ennemi est en vie. Placez la vision derrière la fosse, gardez vos contrôles pour zoner et vérifiez l’état de votre TP bot.',
        spokenText:
          'Alerte Baron Nachor. Vérifiez la position du jongleur ennemi et nettoyez la vision.',
      };
    }

    case 'GANK_IMMINENT':
      return {
        label: 'Gank Imminent',
        severity: 'critical',
        headline: `Risque de gank · Surveillez ${threatLabel}`,
        coachAction:
          `Reculez immédiatement vers votre tour, laissez la vague pousser vers vous et gardez votre dash/Flash pour éviter le contrôle de ${threatLabel}.`,
        spokenText: `Attention, ganque imminent ! Reculez vers votre tour et surveillez ${
          topThreat?.championName || 'le jongleur adverse'
        }.`,
      };

    case 'RETREAT_DANGER':
      return {
        label: 'Alerte Repli',
        severity: 'warning',
        headline: 'Désengagez sans forcer l’action',
        coachAction:
          'Lâchez la pression, récupérez la vague sous tour et évitez de donner une prime d’or avant le prochain objectif.',
        spokenText: 'Repli immédiat. Ne forcez pas, jouez la sécurité sous tour.',
      };

    case 'HERALD_GRUBS':
      return {
        label: 'Objectif Rivière Nord',
        severity: 'warning',
        headline: 'Larves du Néant / Héraut / Atakhan',
        coachAction:
          'Prenez la priorité Top et Mid avant d’entrer dans la rivière nord. En cas d’infériorité numérique, échangez plutôt contre des plaques ou la jungle opposée.',
        spokenText:
          'Objectif rivière nord signalé. Prenez la priorité sur les vagues avant de contester.',
      };

    case 'SUMMONER_DOWN':
      return {
        label: 'Sort clé adverse utilisé',
        severity: 'tactical',
        headline: 'Fenêtre d’agression (5 min sans Flash)',
        coachAction:
          'Pignez le minuteur dans le chat pour votre jungler et punissez cette cible dès que votre prochain combo ou gank est prêt.',
        spokenText:
          'Sort d’invocateur adverse utilisé. Opportunité de punir pendant les prochaines minutes.',
      };

    case 'RECALL_BUY':
      return {
        label: 'Fenêtre de Rappel',
        severity: 'tactical',
        headline:
          currentGold >= 1300
            ? `Bon timing rappel · ${currentGold} po disponibles`
            : `Rappel signalé · ${currentGold} po en poche`,
        coachAction:
          currentGold >= 1300
            ? `Poussez la vague canon si possible puis rappelez immédiatement pour convertir vos ${currentGold} po + 1 Balise de contrôle.`
            : 'Évitez de rappeler sur une vague qui pousse contre vous : crashez vite ou restez en sécurité pour prendre l’XP.',
        spokenText:
          currentGold >= 1300
            ? `Bon timing de rappel. Dépensez vos ${currentGold} pièces d'or et achetez une balise.`
            : 'Poussez la vague avant de rappeler pour ne pas perdre d’expérience.',
      };

    case 'TEAMFIGHT_ENGAGE':
      return {
        label: 'Engage / Teamfight',
        severity: 'tactical',
        headline: `Combat d’équipe · ${
          snapshot?.gameState === 'AHEAD' ? 'Avance favorable' : 'Jouez discipliné'
        }`,
        coachAction:
          `Vérifiez que toute votre équipe est à portée. Priorisez le peel contre ${threatLabel} avant de chasser les cibles isolées.`,
        spokenText: `Combat signalé. Restez groupés et surveillez ${
          topThreat?.championName || 'la menace principale'
        }.`,
      };
  }
}

export function detectKeyMomentFromTranscript(
  transcript: string,
  snapshot?: LiveCoachSnapshot | null,
  source: VoiceDetectionSource = 'speech-live',
): VoiceMomentDetection | null {
  const clean = transcript.trim();
  if (!clean) return null;

  const normalized = normalizeSpeechText(clean);
  for (const rule of DETECTION_RULES) {
    const matched = findKeywordMatch(normalized, rule.keywords);
    if (matched) {
      const feedback = buildContextualFeedbackForMoment(rule.type, snapshot);
      return {
        id: `${rule.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: rule.type,
        label: feedback.label,
        severity: feedback.severity,
        matchedPhrase: matched,
        transcript: clean,
        headline: feedback.headline,
        coachAction: feedback.coachAction,
        spokenText: feedback.spokenText,
        gameTimeSec: snapshot?.gameTimeSec ?? 0,
        detectedAt: new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        source,
      };
    }
  }

  return null;
}

/**
 * Adapte les termes LoL et abréviations pour une prononciation fluide
 * par les synthèses vocales françaises (Web Speech API).
 */
export function formatTextForFrenchSpeech(rawText: string): string {
  return rawText
    .replace(/(\d+)\s*po\b/gi, '$1 pièces d’or')
    .replace(/(\d+)\s*s\b/gi, '$1 secondes')
    .replace(/(\d+)\s*min\b/gi, '$1 minutes')
    .replace(/\b5v5\b/gi, '5 contre 5')
    .replace(/\bTP\b/g, 'téléportation')
    .replace(/\bCS\b/g, 'sbires')
    .replace(/\bHP\b/g, 'points de vie')
    .replace(/\bgank(?:s|é|ée|er)?\b/gi, 'ganque')
    .replace(/\bnashor\b/gi, 'Nachor')
    .replace(/\bdrake\b/gi, 'drèque')
    .replace(/\bflash\b/gi, 'flache')
    .replace(/\bjungler\b/gi, 'jongleur')
    .replace(/\bmidlane\b/gi, 'mide laine')
    .replace(/\btoplane\b/gi, 'top laine')
    .replace(/\bbotlane\b/gi, 'botte laine')
    .replace(/\bfacecheck(?:ez|er)?\b/gi, 'vérifier sans vision')
    .replace(/\bpeel\b/gi, 'protection')
    .replace(/\bward(?:s|ez|er)?\b/gi, 'balise')
    .replace(/\breset\b/gi, 'rappel')
    .replace(/\bteamfight\b/gi, 'combat d’équipe')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getFrenchSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const all = window.speechSynthesis.getVoices();
  const french = all.filter((v) => v.lang.toLowerCase().startsWith('fr'));
  return french.sort((a, b) => {
    const score = (v: SpeechSynthesisVoice) => {
      let s = 0;
      if (v.lang.toLowerCase() === 'fr-fr') s += 4;
      if (/google|denise|henri|thomas|amelie|natural|online/i.test(v.name)) s += 3;
      if (!v.localService) s += 1;
      return s;
    };
    return score(b) - score(a);
  });
}

export function speakCoachFeedback(
  text: string,
  options?: {
    rate?: number;
    volume?: number;
    voiceURI?: string;
    onStart?: () => void;
    onEnd?: () => void;
  },
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  try {
    const synth = window.speechSynthesis;
    synth.cancel();

    const cleanSpokenText = formatTextForFrenchSpeech(text);
    const utterance = new SpeechSynthesisUtterance(cleanSpokenText);
    utterance.lang = 'fr-FR';
    utterance.rate = options?.rate ?? 1.02;
    utterance.pitch = 1.0;
    utterance.volume = options?.volume ?? 0.95;

    const frenchVoices = getFrenchSpeechVoices();
    const chosenVoice =
      (options?.voiceURI
        ? frenchVoices.find((v) => v.voiceURI === options.voiceURI)
        : undefined) || frenchVoices[0];

    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang || 'fr-FR';
    }

    if (options?.onStart) {
      utterance.onstart = () => options.onStart?.();
    }
    if (options?.onEnd) {
      utterance.onend = () => options.onEnd?.();
      utterance.onerror = () => options.onEnd?.();
    }

    synth.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopCoachSpeech(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
