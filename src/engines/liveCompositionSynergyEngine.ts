import type {
  ChampionDetail,
  ChampionSummary,
  LivePlayerEquipmentRow,
  Role,
} from './types.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';

export type NormalizedPosition = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';

export type ComboTrait = 'HARD_CC' | 'ENGAGE' | 'BURST' | 'PEEL' | 'AOE_ULT';

export type ComboArchetype =
  | 'CC Enchaîné'
  | 'Engage + Burst'
  | 'Peel & Hypercarry'
  | 'Wombo-Combo AoE'
  | 'Gank & Pick';

export interface DetectedComboSpell {
  slot: 'A' | 'Z' | 'E' | 'R';
  name: string;
  imageUrl?: string;
  ccKind?: string;
  traits: ComboTrait[];
}

export interface ChampionComboProfile {
  championName: string;
  displayName: string;
  imageUrl?: string;
  position: NormalizedPosition | null;
  tags: string[];
  traits: ComboTrait[];
  comboSpells: DetectedComboSpell[];
  primarySpell: DetectedComboSpell | null;
}

export interface AlliedSynergyCandidate {
  championName: string;
  displayName: string;
  imageUrl?: string;
  position: NormalizedPosition | null;
  positionLabel: string;
  proximityLabel: 'Duo direct' | 'Gank / Roam proche' | 'Axe carte' | 'Distance';
  level: number;
  kda: string;
  isDead: boolean;
  ultReady: boolean;
  synergyScore: number; // 0..100
  breakdown: {
    positionScore: number; // 0..35
    comboScore: number; // 0..40
    readinessScore: number; // 0..25
  };
  archetype: ComboArchetype;
  profile: ChampionComboProfile;
  comboSequence: Array<{
    step: number;
    actor: string;
    spellLabel: string;
    spellImageUrl?: string;
    effectLabel: string;
  }>;
  reasons: string[];
  tacticalSummary: string;
}

export interface LiveCompositionSynergyReport {
  detectedPosition: NormalizedPosition;
  detectedPositionLabel: string;
  positionSource: 'LIVE_API' | 'ROLE_FALLBACK';
  gamePhaseLabel: string;
  selfProfile: ChampionComboProfile;
  bestCandidate: AlliedSynergyCandidate | null;
  candidates: AlliedSynergyCandidate[];
}

export function normalizeLivePosition(
  rawPosition: string | undefined,
  fallbackRole?: Role,
): NormalizedPosition | null {
  const pos = (rawPosition || '').trim().toUpperCase();
  if (pos === 'TOP') return 'TOP';
  if (pos === 'JUNGLE' || pos === 'JGL') return 'JUNGLE';
  if (pos === 'MIDDLE' || pos === 'MID') return 'MID';
  if (pos === 'BOTTOM' || pos === 'BOT' || pos === 'ADC') return 'ADC';
  if (pos === 'UTILITY' || pos === 'SUPPORT' || pos === 'SUP') return 'SUPPORT';

  if (fallbackRole) {
    if (fallbackRole === 'TOP') return 'TOP';
    if (fallbackRole === 'JUNGLE') return 'JUNGLE';
    if (fallbackRole === 'MID') return 'MID';
    if (fallbackRole === 'ADC') return 'ADC';
    if (fallbackRole === 'SUPPORT') return 'SUPPORT';
  }
  return null;
}

export function formatPositionLabel(pos: NormalizedPosition | null): string {
  switch (pos) {
    case 'TOP':
      return 'Top';
    case 'JUNGLE':
      return 'Jungle';
    case 'MID':
      return 'Mid';
    case 'ADC':
      return 'ADC (Bot)';
    case 'SUPPORT':
      return 'Support (Bot)';
    default:
      return 'Flex';
  }
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectSpellTraits(
  rawDescription: string,
  slot: 'A' | 'Z' | 'E' | 'R',
  tags: string[],
): { traits: ComboTrait[]; ccKind?: string } {
  const text = stripHtml(rawDescription)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const traits = new Set<ComboTrait>();
  let ccKind: string | undefined;

  if (
    /projete.*air|dans les airs|renverse|attire|repousse|knock|airborne|pull|displacement/.test(
      text,
    )
  ) {
    traits.add('HARD_CC');
    ccKind = 'Projection / Déplacement';
  } else if (/etourdi|stun/.test(text)) {
    traits.add('HARD_CC');
    ccKind = 'Étourdissement';
  } else if (/immobilis|enracine|root|snare/.test(text)) {
    traits.add('HARD_CC');
    ccKind = 'Immobilisation';
  } else if (/charme|provoque|apeure|effraie|sommeil|endort|neutralise|charm|taunt|fear|suppress/.test(text)) {
    traits.add('HARD_CC');
    ccKind = 'Contrôle fort';
  } else if (/ralentit|ralentissement|slow/.test(text)) {
    ccKind = 'Ralentissement';
  }

  if (
    /se rue|bondit|fonce|plonge|charge vers|se teleporte|dash|blink|engage|insec/.test(text) ||
    (traits.has('HARD_CC') && (tags.includes('Tank') || tags.includes('Fighter')))
  ) {
    traits.add('ENGAGE');
  }

  if (
    /bouclier|soigne|rend des pv|vitesse d'attaque|vitesse de deplacement|alli[eé]|shield|heal/.test(
      text,
    )
  ) {
    traits.add('PEEL');
  }

  if (/inflige|degats magiques|degats physiques|degats bruts|execute|damage/.test(text)) {
    traits.add('BURST');
  }

  if (
    slot === 'R' &&
    (/zone|tous les ennemis|dans la zone|ennemis proches|autour|enemies|area/.test(text) ||
      traits.has('HARD_CC'))
  ) {
    traits.add('AOE_ULT');
  }

  return { traits: Array.from(traits), ccKind };
}

export function buildChampionComboProfile(
  championName: string,
  position: NormalizedPosition | null,
  champions: ChampionSummary[],
  championKits: Record<string, ChampionDetail>,
): ChampionComboProfile {
  const disp = resolveChampionDisplay(champions, championName);
  const ddKey = disp.champion?.id || championName;
  const kit = championKits[ddKey] || championKits[championName];
  const tags = disp.champion?.tags || [];

  const slots: Array<'A' | 'Z' | 'E' | 'R'> = ['A', 'Z', 'E', 'R'];
  const traitSet = new Set<ComboTrait>();
  const comboSpells: DetectedComboSpell[] = [];

  if (kit?.spells?.length) {
    kit.spells.slice(0, 4).forEach((sp, idx) => {
      const slot = slots[idx] || 'A';
      const { traits, ccKind } = detectSpellTraits(sp.description, slot, tags);
      for (const t of traits) traitSet.add(t);
      if (traits.includes('HARD_CC') || traits.includes('ENGAGE') || traits.includes('AOE_ULT') || traits.includes('PEEL')) {
        comboSpells.push({
          slot,
          name: sp.name,
          imageUrl: sp.imageUrl,
          ccKind,
          traits,
        });
      }
    });
  }

  // Fallback si le kit Data Dragon est encore en cours de chargement
  if (traitSet.size === 0) {
    if (tags.includes('Tank') || tags.includes('Support')) {
      traitSet.add('HARD_CC');
      traitSet.add('ENGAGE');
      if (tags.includes('Support')) traitSet.add('PEEL');
    }
    if (tags.includes('Fighter')) {
      traitSet.add('ENGAGE');
      traitSet.add('BURST');
    }
    if (tags.includes('Mage') || tags.includes('Assassin') || tags.includes('Marksman')) {
      traitSet.add('BURST');
    }
  }

  // Priorise les sorts à Hard CC, puis Engage, puis AoE Ult, puis Peel
  const sortedSpells = [...comboSpells].sort((a, b) => {
    const score = (s: DetectedComboSpell) =>
      (s.traits.includes('HARD_CC') ? 40 : 0) +
      (s.traits.includes('ENGAGE') ? 25 : 0) +
      (s.traits.includes('AOE_ULT') ? 15 : 0) +
      (s.traits.includes('PEEL') ? 10 : 0) +
      (s.slot === 'R' ? 5 : 0);
    return score(b) - score(a);
  });

  return {
    championName,
    displayName: disp.displayName,
    imageUrl: disp.imageUrl,
    position,
    tags,
    traits: Array.from(traitSet),
    comboSpells: sortedSpells,
    primarySpell: sortedSpells[0] || null,
  };
}

function computePositionalProximity(
  selfPos: NormalizedPosition,
  allyPos: NormalizedPosition | null,
  gameTimeSec: number,
  isAram: boolean,
): {
  score: number;
  proximityLabel: AlliedSynergyCandidate['proximityLabel'];
  reason: string;
} {
  if (isAram) {
    return {
      score: 30,
      proximityLabel: 'Duo direct',
      reason: 'ARAM : toute l’équipe évolue ensemble sur une seule voie.',
    };
  }

  const isLanePhase = gameTimeSec < 840; // < 14:00

  if (!allyPos) {
    return {
      score: isLanePhase ? 16 : 22,
      proximityLabel: 'Axe carte',
      reason: 'Position alliée non assignée : synergie évaluée sur l’ensemble de la carte.',
    };
  }

  // Paire Botlane directe (ADC <-> Support)
  if (
    (selfPos === 'SUPPORT' && allyPos === 'ADC') ||
    (selfPos === 'ADC' && allyPos === 'SUPPORT')
  ) {
    return {
      score: isLanePhase ? 35 : 31,
      proximityLabel: 'Duo direct',
      reason: isLanePhase
        ? 'Partenaire direct en Botlane : fenêtre de 2v2 et combo immédiat.'
        : 'Duo Botlane naturel pour tenir les teamfights et sécuriser les objectifs.',
    };
  }

  // Jungler <-> n'importe quel laner (et vice versa)
  if (selfPos === 'JUNGLE' || allyPos === 'JUNGLE') {
    return {
      score: isLanePhase ? 31 : 28,
      proximityLabel: 'Gank / Roam proche',
      reason: isLanePhase
        ? 'Synergie directe Jungler / Lane pour réussir les ganks et les contrôles rivière.'
        : 'Binôme clé autour du Châtiment et des escarmouches en rivière.',
    };
  }

  // Midlaner <-> Support / Top / ADC (roam & objectifs)
  if (
    (selfPos === 'MID' && (allyPos === 'SUPPORT' || allyPos === 'TOP' || allyPos === 'ADC')) ||
    (allyPos === 'MID' && (selfPos === 'SUPPORT' || selfPos === 'TOP' || selfPos === 'ADC'))
  ) {
    return {
      score: isLanePhase ? (allyPos === 'SUPPORT' || selfPos === 'SUPPORT' ? 25 : 19) : 27,
      proximityLabel: allyPos === 'SUPPORT' || selfPos === 'SUPPORT' ? 'Gank / Roam proche' : 'Axe carte',
      reason: isLanePhase
        ? 'Rotation rapide possible entre la voie centrale et la rivière.'
        : 'Alignement fort pour les escarmouches Mid-Game et prises de tours.',
    };
  }

  // Top <-> Bot en phase de lane (éloignés avant regroupement)
  return {
    score: isLanePhase ? 10 : 25,
    proximityLabel: isLanePhase ? 'Distance' : 'Axe carte',
    reason: isLanePhase
      ? 'Voies opposées en début de partie (combo disponible surtout via Téléportation ou regroupement).'
      : 'Regroupement autour du Dragon / Baron favorable aux combos d’équipe.',
  };
}

export function analyzeLiveCompositionSynergy(params: {
  selfChampionName: string;
  allyPlayers: LivePlayerEquipmentRow[];
  preferredRole: Role;
  champions: ChampionSummary[];
  championKits: Record<string, ChampionDetail>;
  gameTimeSec: number;
  gameMode?: string;
  activeSpellCooldownKeys?: Set<string>; // ex. "Ahri:999" si ultime allié en CD
}): LiveCompositionSynergyReport {
  const {
    selfChampionName,
    allyPlayers,
    preferredRole,
    champions,
    championKits,
    gameTimeSec,
    gameMode,
    activeSpellCooldownKeys,
  } = params;

  const isAram = (gameMode || '').toUpperCase() === 'ARAM';
  const selfRow = allyPlayers.find(
    (p) => p.championName.toLowerCase() === selfChampionName.toLowerCase(),
  );
  const detectedFromApi = normalizeLivePosition(selfRow?.position);
  const detectedPosition: NormalizedPosition =
    detectedFromApi || normalizeLivePosition(undefined, preferredRole) || 'MID';

  const selfProfile = buildChampionComboProfile(
    selfChampionName,
    detectedPosition,
    champions,
    championKits,
  );

  const gamePhaseLabel = isAram
    ? 'Teamfight continu (ARAM)'
    : gameTimeSec < 840
      ? 'Phase de lane · Duo & Ganks'
      : gameTimeSec < 1380
        ? 'Mid-Game · Escarmouches & Dragons'
        : 'Late-Game · Teamfights décisifs';

  const otherAllies = allyPlayers.filter(
    (p) => p.championName.toLowerCase() !== selfChampionName.toLowerCase(),
  );

  const candidates: AlliedSynergyCandidate[] = otherAllies.map((ally) => {
    const allyPos = normalizeLivePosition(ally.position);
    const allyProfile = buildChampionComboProfile(
      ally.championName,
      allyPos,
      champions,
      championKits,
    );

    const posMetrics = computePositionalProximity(
      detectedPosition,
      allyPos,
      gameTimeSec,
      isAram,
    );

    // Calcul synergie combo (0..40)
    const selfCC = selfProfile.traits.includes('HARD_CC');
    const allyCC = allyProfile.traits.includes('HARD_CC');
    const selfEngage = selfProfile.traits.includes('ENGAGE');
    const allyEngage = allyProfile.traits.includes('ENGAGE');
    const selfBurst = selfProfile.traits.includes('BURST');
    const allyBurst = allyProfile.traits.includes('BURST');
    const selfPeel = selfProfile.traits.includes('PEEL');
    const allyPeel = allyProfile.traits.includes('PEEL');
    const bothAoeUlt =
      selfProfile.traits.includes('AOE_ULT') && allyProfile.traits.includes('AOE_ULT');

    let comboScore = 14;
    let archetype: ComboArchetype = 'Gank & Pick';
    const reasons: string[] = [posMetrics.reason];

    if (selfCC && allyCC) {
      comboScore += 22;
      archetype = 'CC Enchaîné';
      reasons.push(
        `Double contrôle dur : enchaîner ${selfProfile.primarySpell?.slot || 'votre CC'} + ${allyProfile.primarySpell?.slot || 'son CC'} bloque une cible pendant 2,5 à 3,5 s.`,
      );
    } else if ((selfCC || selfEngage) && allyBurst) {
      comboScore += 19;
      archetype = 'Engage + Burst';
      reasons.push(
        `Votre ouverture permet à ${allyProfile.displayName} de poser tous ses dégâts sans risquer le contre.`,
      );
    } else if ((allyCC || allyEngage) && selfBurst) {
      comboScore += 19;
      archetype = 'Engage + Burst';
      reasons.push(
        `${allyProfile.displayName} initie le contrôle pour garantir votre combo complet.`,
      );
    } else if ((selfPeel && allyProfile.tags.includes('Marksman')) || (allyPeel && selfProfile.tags.includes('Marksman'))) {
      comboScore += 18;
      archetype = 'Peel & Hypercarry';
      reasons.push('Synergie de protection et de DPS soutenu en combat prolongé.');
    }

    if (bothAoeUlt) {
      comboScore += 6;
      if (archetype === 'Gank & Pick') archetype = 'Wombo-Combo AoE';
      reasons.push('Deux ultimes de zone complémentaires autour des objectifs neutres.');
    }

    comboScore = Math.min(40, comboScore);

    // Disponibilité en temps réel (0..25)
    const ultOnCd = Boolean(activeSpellCooldownKeys?.has(`${ally.championName}:999`));
    const ultReady = !ally.isDead && ally.level >= 6 && !ultOnCd;
    let readinessScore = 12;

    if (ally.isDead) {
      readinessScore = 0;
      reasons.push(`${allyProfile.displayName} est actuellement mort : attendez sa réapparition.`);
    } else {
      if (ally.level >= 6) readinessScore += 6;
      if (ultOnCd) {
        readinessScore -= 5;
        reasons.push('Son ultime est en recharge : privilégiez un trade court sans R.');
      }
      const kdaImpact = ally.kills + ally.assists * 0.5 - ally.deaths * 0.7;
      if (kdaImpact >= 3) {
        readinessScore += 6;
        reasons.push(`Très en forme (${ally.kills}/${ally.deaths}/${ally.assists}) : joueur prioritaire autour duquel jouer.`);
      } else if (ally.items.filter((i) => i.price >= 2000).length >= 2) {
        readinessScore += 4;
      }
    }

    readinessScore = Math.max(0, Math.min(25, readinessScore));
    const rawTotal = posMetrics.score + comboScore + readinessScore;
    const synergyScore = ally.isDead
      ? Math.max(15, Math.min(52, Math.round(rawTotal * 0.55)))
      : Math.min(99, Math.max(25, Math.round(rawTotal)));

    // Construction visuelle de la séquence de combo en 2 étapes
    const selfLeads =
      selfEngage ||
      (selfCC && !allyEngage) ||
      detectedPosition === 'SUPPORT' ||
      detectedPosition === 'JUNGLE';

    const firstActor = selfLeads ? selfProfile : allyProfile;
    const secondActor = selfLeads ? allyProfile : selfProfile;

    const firstSpell = firstActor.primarySpell;
    const secondSpell = secondActor.primarySpell;

    const comboSequence: AlliedSynergyCandidate['comboSequence'] = [
      {
        step: 1,
        actor: firstActor.displayName,
        spellLabel: firstSpell
          ? `${firstSpell.slot} · ${firstSpell.name}`
          : 'Ouverture / Contrôle',
        spellImageUrl: firstSpell?.imageUrl,
        effectLabel: firstSpell?.ccKind || 'Initialisation',
      },
      {
        step: 2,
        actor: secondActor.displayName,
        spellLabel: secondSpell
          ? `${secondSpell.slot} · ${secondSpell.name}`
          : 'Enchaînement / Dégâts',
        spellImageUrl: secondSpell?.imageUrl,
        effectLabel:
          archetype === 'CC Enchaîné'
            ? secondSpell?.ccKind || 'CC enchaîné'
            : archetype === 'Peel & Hypercarry'
              ? 'Protection + DPS'
              : 'Follow-up Burst',
      },
    ];

    const tacticalSummary = ally.isDead
      ? `Indisponible maintenant · Surveillez son retour pour jouer le ${archetype.toLowerCase()}.`
      : `${archetype} optimal avec ${allyProfile.displayName} (${formatPositionLabel(allyPos)}) : ${comboSequence[0].actor} lance ${comboSequence[0].spellLabel}, puis ${comboSequence[1].actor} enchaîne.`;

    return {
      championName: ally.championName,
      displayName: allyProfile.displayName,
      imageUrl: allyProfile.imageUrl,
      position: allyPos,
      positionLabel: formatPositionLabel(allyPos),
      proximityLabel: posMetrics.proximityLabel,
      level: ally.level,
      kda: `${ally.kills}/${ally.deaths}/${ally.assists}`,
      isDead: ally.isDead,
      ultReady,
      synergyScore,
      breakdown: {
        positionScore: posMetrics.score,
        comboScore,
        readinessScore,
      },
      archetype,
      profile: allyProfile,
      comboSequence,
      reasons,
      tacticalSummary,
    };
  });

  candidates.sort((a, b) => b.synergyScore - a.synergyScore);

  return {
    detectedPosition,
    detectedPositionLabel: formatPositionLabel(detectedPosition),
    positionSource: detectedFromApi ? 'LIVE_API' : 'ROLE_FALLBACK',
    gamePhaseLabel,
    selfProfile,
    bestCandidate: candidates[0] || null,
    candidates,
  };
}
