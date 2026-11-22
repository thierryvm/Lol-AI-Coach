import type {
  ChampionDetail,
  ChampionSummary,
  ItemData,
  LiveCoachSnapshot,
  Role,
} from './types.ts';

export type AbilityKey = 'Q' | 'W' | 'E' | 'R';

export interface SkillLevelUpEvent {
  step: number; // 1..18
  key: AbilityKey;
  newRank: number;
  gameTimeSec: number;
  inferred?: boolean; // true si le niveau existait déjà avant le début du suivi
}

export interface AbilityLevelsSnapshot {
  Q: number;
  W: number;
  E: number;
  R: number;
}

export interface SkillOrderTrackerState {
  championName: string;
  lastGameTimeSec: number;
  lastLevels: AbilityLevelsSnapshot;
  sequence: SkillLevelUpEvent[];
}

export interface StarterCheckResult {
  hasStarterItem: boolean;
  hasWardOrTrinket: boolean;
  hasConsumable: boolean;
  ownedItems: Array<{ itemId: number; displayName: string; price: number }>;
  recommendedStarterLabel: string;
  recommendedSpellFirst: AbilityKey;
  recommendedMaxPriority: string;
  checklist: Array<{
    id: string;
    label: string;
    detail: string;
    done: boolean;
  }>;
}

const STARTER_ITEM_KEYWORDS = [
  'doran',
  'lame de doran',
  'anneau de doran',
  'bouclier de doran',
  'abatteur',
  'cull',
  'larme',
  'tear',
  'sceau noir',
  'dark seal',
  'atlas',
  'world atlas',
  'compagnon',
  'scorchclaw',
  'gustwalker',
  'mosstomper',
  'corne',
  'orb of',
  'guardian',
  'épée longue',
  'long sword',
  'tome d',
  'amplifying tome',
  'botte',
  'boots',
];

const TRINKET_IDS = new Set([3340, 3363, 3364, 3513]);
const CONSUMABLE_KEYWORDS = ['potion', 'biscuit', 'elixir', 'élixir', 'refillable', 'rechargeable'];

export function createInitialSkillOrderState(
  championName: string,
  levels: AbilityLevelsSnapshot | null | undefined,
  gameTimeSec: number,
): SkillOrderTrackerState {
  const safe: AbilityLevelsSnapshot = levels
    ? { Q: levels.Q, W: levels.W, E: levels.E, R: levels.R }
    : { Q: 0, W: 0, E: 0, R: 0 };

  const initialSeq: SkillLevelUpEvent[] = [];
  let step = 1;
  // Si la connexion démarre en milieu de partie avec des sorts déjà appris, on pré-remplit proprement
  const orderKeys: AbilityKey[] = ['Q', 'E', 'W', 'R'];
  const remaining = { ...safe };
  while (remaining.Q + remaining.W + remaining.E + remaining.R > 0 && step <= 18) {
    let added = false;
    for (const k of orderKeys) {
      if (remaining[k] > 0) {
        const assignedRank = safe[k] - remaining[k] + 1;
        initialSeq.push({
          step,
          key: k,
          newRank: assignedRank,
          gameTimeSec,
          inferred: true,
        });
        remaining[k] -= 1;
        step += 1;
        added = true;
      }
    }
    if (!added) break;
  }

  return {
    championName,
    lastGameTimeSec: gameTimeSec,
    lastLevels: safe,
    sequence: initialSeq,
  };
}

/**
 * Détecte automatiquement les nouveaux points de compétences choisis par le joueur
 * entre deux snapshots Live Client Data (ex: Niv. 1 -> Q, Niv. 2 -> E, Niv. 3 -> Z).
 */
export function reconcileSkillOrderState(
  prev: SkillOrderTrackerState | null,
  championName: string,
  levels: AbilityLevelsSnapshot | null | undefined,
  gameTimeSec: number,
): SkillOrderTrackerState {
  if (!levels) {
    return (
      prev && prev.championName.toLowerCase() === championName.toLowerCase()
        ? prev
        : createInitialSkillOrderState(championName, null, gameTimeSec)
    );
  }

  const sameChampion =
    prev && prev.championName.toLowerCase() === championName.toLowerCase();
  const gameRestarted =
    prev &&
    (gameTimeSec + 15 < prev.lastGameTimeSec ||
      levels.Q < prev.lastLevels.Q ||
      levels.W < prev.lastLevels.W ||
      levels.E < prev.lastLevels.E ||
      levels.R < prev.lastLevels.R);

  if (!prev || !sameChampion || gameRestarted) {
    return createInitialSkillOrderState(championName, levels, gameTimeSec);
  }

  const keys: AbilityKey[] = ['Q', 'W', 'E', 'R'];
  const nextSeq = [...prev.sequence];
  let step = nextSeq.length + 1;

  for (const k of keys) {
    const delta = levels[k] - prev.lastLevels[k];
    if (delta > 0) {
      for (let d = 1; d <= delta; d++) {
        if (step > 18) break;
        nextSeq.push({
          step,
          key: k,
          newRank: prev.lastLevels[k] + d,
          gameTimeSec,
          inferred: false,
        });
        step += 1;
      }
    }
  }

  return {
    championName,
    lastGameTimeSec: gameTimeSec,
    lastLevels: { Q: levels.Q, W: levels.W, E: levels.E, R: levels.R },
    sequence: nextSeq,
  };
}

export function formatAbilityKeyFr(key: AbilityKey): string {
  switch (key) {
    case 'Q':
      return 'A (Q)';
    case 'W':
      return 'Z (W)';
    case 'E':
      return 'E';
    case 'R':
      return 'R';
  }
}

export function evaluateStartPhaseChecklist(params: {
  snapshot: LiveCoachSnapshot;
  role: Role;
  champion?: ChampionSummary | null;
  championKit?: ChampionDetail;
  itemsCatalog?: ItemData[];
  skillSequence: SkillLevelUpEvent[];
}): StarterCheckResult {
  const { snapshot, role, champion, championKit, skillSequence } = params;
  const selfRow = snapshot.allyPlayers.find(
    (p) => p.championName.toLowerCase() === snapshot.championName.toLowerCase(),
  );
  const ownedItems = selfRow?.items || [];

  const hasWardOrTrinket = ownedItems.some(
    (it) =>
      TRINKET_IDS.has(it.itemId) ||
      it.displayName.toLowerCase().includes('balise') ||
      it.displayName.toLowerCase().includes('totem') ||
      it.displayName.toLowerCase().includes('brouilleur'),
  );

  const hasConsumable = ownedItems.some((it) =>
    CONSUMABLE_KEYWORDS.some((kw) => it.displayName.toLowerCase().includes(kw)),
  );

  const hasStarterItem = ownedItems.some(
    (it) =>
      (!TRINKET_IDS.has(it.itemId) && it.price >= 350) ||
      STARTER_ITEM_KEYWORDS.some((kw) => it.displayName.toLowerCase().includes(kw)),
  );

  const tags = champion?.tags || [];
  let recommendedStarterLabel = 'Anneau de Doran + 2 Potions + Balise';
  if (role === 'SUPPORT') {
    recommendedStarterLabel = 'Atlas mondial + 2 Potions + Balise camouflée';
  } else if (role === 'JUNGLE') {
    recommendedStarterLabel = 'Compagnon Jungle + Potion de soin + Balise';
  } else if (role === 'ADC' || tags.includes('Marksman')) {
    recommendedStarterLabel = 'Lame de Doran + Potion + Balise camouflée';
  } else if (tags.includes('Tank')) {
    recommendedStarterLabel = 'Bouclier de Doran + Potion + Balise camouflée';
  } else if (tags.includes('Fighter') || tags.includes('Assassin')) {
    recommendedStarterLabel =
      (champion?.info?.magic || 0) > (champion?.info?.attack || 0)
        ? 'Anneau de Doran + 2 Potions + Balise'
        : 'Lame de Doran (ou Épée longue) + Potion + Balise';
  }

  // Estimer le sort recommandé niveau 1 et la priorité de max depuis Data Dragon
  let recommendedSpellFirst: AbilityKey = 'Q';
  let recommendedMaxPriority = 'R > A (Q) > E > Z (W)';

  if (championKit?.spells?.length && championKit.spells.length >= 3) {
    // Heuristique claire basée sur le délai et le rôle
    if (role === 'SUPPORT' && tags.includes('Support')) {
      recommendedSpellFirst = 'Q';
      recommendedMaxPriority = 'R > A (Q) / Z (W) selon poke ou bouclier';
    } else if (tags.includes('Mage')) {
      recommendedSpellFirst = 'Q';
      recommendedMaxPriority = 'R > A (Q) > Z (W) > E';
    } else if (tags.includes('Marksman')) {
      recommendedSpellFirst = 'Q';
      recommendedMaxPriority = 'R > A (Q) > Z (W) > E';
    } else {
      recommendedSpellFirst = 'Q';
      recommendedMaxPriority = 'R > A (Q) > E > Z (W)';
    }
  }

  const firstChosenSpell = skillSequence[0];
  const checklist = [
    {
      id: 'starter-item',
      label: 'Équipement de départ acheté',
      detail: hasStarterItem
        ? 'Objet de départ détecté dans votre inventaire.'
        : `Conseillé : ${recommendedStarterLabel}`,
      done: hasStarterItem,
    },
    {
      id: 'trinket',
      label: 'Balise / Trinket équipé',
      detail: hasWardOrTrinket
        ? 'Balise prête pour sécuriser la rivière ou un buisson à 1:15.'
        : 'Prenez gratuitement votre Totem baliseur (4) avant de sortir de la base.',
      done: hasWardOrTrinket,
    },
    {
      id: 'first-skill',
      label: 'Première compétence débloquée (Niv. 1)',
      detail: firstChosenSpell
        ? `Détectée : ${formatAbilityKeyFr(firstChosenSpell.key)} choisie en 1er.`
        : `En attente de votre choix (recommandé : ${formatAbilityKeyFr(recommendedSpellFirst)}).`,
      done: Boolean(firstChosenSpell),
    },
  ];

  return {
    hasStarterItem,
    hasWardOrTrinket,
    hasConsumable,
    ownedItems,
    recommendedStarterLabel,
    recommendedSpellFirst,
    recommendedMaxPriority,
    checklist,
  };
}
