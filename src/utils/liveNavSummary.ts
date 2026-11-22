import { computeBuildRecommendation } from '../engines/buildEngine.ts';
import { analyzeLiveEnemyCounters } from '../engines/liveCounterItemsEngine.ts';
import type {
  ChampionSummary,
  GameModeContext,
  ItemData,
  LiveCoachSnapshot,
  LivePlayerEquipmentRow,
  LobbyScoutParticipant,
  PlayerProfileResponse,
  RankedQueueSummary,
  Role,
} from '../engines/types.ts';
import { resolveChampionDisplay } from './championDisplay.ts';
import {
  formatRankedQueue,
  getRankedTierTheme,
  RANKED_TIER_LABELS_FR,
  type RankedTierTheme,
} from './rankedDisplay.ts';

const TIER_BASE_MMR: Record<string, number> = {
  IRON: 0,
  BRONZE: 400,
  SILVER: 800,
  GOLD: 1200,
  PLATINUM: 1600,
  EMERALD: 2000,
  DIAMOND: 2400,
  MASTER: 2800,
  GRANDMASTER: 3100,
  CHALLENGER: 3400,
};

const DIVISION_OFFSET: Record<string, number> = {
  IV: 0,
  III: 100,
  II: 200,
  I: 300,
};

const ORDERED_STANDARD_TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
] as const;

export function rankSummaryToMmrPoints(queue?: RankedQueueSummary | null): number | null {
  if (!queue || !queue.tier) return null;
  const tier = queue.tier.toUpperCase();
  const base = TIER_BASE_MMR[tier];
  if (base === undefined) return null;

  if (tier === 'MASTER' || tier === 'GRANDMASTER' || tier === 'CHALLENGER') {
    return base + Math.min(400, Math.max(0, Math.round((queue.lp || 0) * 0.4)));
  }
  const divOffset = DIVISION_OFFSET[(queue.rank || 'IV').toUpperCase()] ?? 100;
  const lpBonus = Math.min(99, Math.max(0, queue.lp || 0));
  return base + divOffset + lpBonus;
}

export function mmrPointsToAverageRank(points: number): {
  tierKey: string;
  label: string;
  theme: RankedTierTheme;
} {
  const clamped = Math.max(0, Math.round(points));
  if (clamped >= 3300) {
    return {
      tierKey: 'CHALLENGER',
      label: RANKED_TIER_LABELS_FR.CHALLENGER,
      theme: getRankedTierTheme('CHALLENGER'),
    };
  }
  if (clamped >= 3000) {
    return {
      tierKey: 'GRANDMASTER',
      label: RANKED_TIER_LABELS_FR.GRANDMASTER,
      theme: getRankedTierTheme('GRANDMASTER'),
    };
  }
  if (clamped >= 2800) {
    return {
      tierKey: 'MASTER',
      label: RANKED_TIER_LABELS_FR.MASTER,
      theme: getRankedTierTheme('MASTER'),
    };
  }

  const tierIndex = Math.min(
    ORDERED_STANDARD_TIERS.length - 1,
    Math.floor(clamped / 400),
  );
  const tierKey = ORDERED_STANDARD_TIERS[tierIndex];
  const remainder = clamped - tierIndex * 400;
  const division =
    remainder >= 300
      ? 'I'
      : remainder >= 200
        ? 'II'
        : remainder >= 100
          ? 'III'
          : 'IV';

  return {
    tierKey,
    label: `${RANKED_TIER_LABELS_FR[tierKey]} ${division}`,
    theme: getRankedTierTheme(tierKey),
  };
}

export interface AverageMatchRankInfo {
  tierKey: string;
  label: string;
  sourceDetail: string;
  isLobbyAverage: boolean;
  theme: RankedTierTheme;
}

export function computeAverageMatchRank(
  lobbyParticipants: LobbyScoutParticipant[],
  fallbackSoloRank?: RankedQueueSummary | null,
  fallbackFlexRank?: RankedQueueSummary | null,
): AverageMatchRankInfo {
  const rankedScores: number[] = [];
  for (const p of lobbyParticipants) {
    const score =
      rankSummaryToMmrPoints(p.soloRank) ?? rankSummaryToMmrPoints(p.flexRank);
    if (score !== null) {
      rankedScores.push(score);
    }
  }

  if (rankedScores.length > 0) {
    const avg = rankedScores.reduce((sum, val) => sum + val, 0) / rankedScores.length;
    const formatted = mmrPointsToAverageRank(avg);
    return {
      tierKey: formatted.tierKey,
      label: formatted.label,
      sourceDetail: `Moyenne lobby (${rankedScores.length} classés)`,
      isLobbyAverage: true,
      theme: formatted.theme,
    };
  }

  const soloFormatted = formatRankedQueue(fallbackSoloRank);
  if (soloFormatted.isRanked) {
    return {
      tierKey: soloFormatted.tierKey,
      label: soloFormatted.divisionLabel,
      sourceDetail: 'Rang du profil (Solo/Duo)',
      isLobbyAverage: false,
      theme: soloFormatted.theme,
    };
  }

  const flexFormatted = formatRankedQueue(fallbackFlexRank);
  if (flexFormatted.isRanked) {
    return {
      tierKey: flexFormatted.tierKey,
      label: flexFormatted.divisionLabel,
      sourceDetail: 'Rang du profil (Flex)',
      isLobbyAverage: false,
      theme: flexFormatted.theme,
    };
  }

  return {
    tierKey: 'UNRANKED',
    label: 'Non classé',
    sourceDetail: 'Aucun rang détecté',
    isLobbyAverage: false,
    theme: getRankedTierTheme('UNRANKED'),
  };
}

export function formatLiveClockSec(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function getLivePhaseLabel(gameTimeSec: number): string {
  if (gameTimeSec < 180) return 'Départ (0–3m)';
  if (gameTimeSec < 840) return 'Phase de lane';
  return 'Mid / Late';
}

export interface NextRecallItemPriority {
  itemId: string;
  itemName: string;
  itemImageUrl?: string;
  goldCost: number;
  currentGold: number | null;
  affordableNow: boolean;
  missingGold: number | null;
  priorityLabel: 'Urgent' | 'Recommandé' | 'Prioritaire';
  categoryLabel: string;
  reason: string;
  enemyDamageSplit: {
    physicalPct: number;
    magicPct: number;
  };
  targetEnemies: string[];
  componentHint?: {
    itemId: string;
    itemName: string;
    itemImageUrl?: string;
    goldCost: number;
    affordableNow: boolean;
  } | null;
}

export type NeutralObjectiveStatus = 'available' | 'soon' | 'upcoming' | 'expired';

export interface NeutralObjectiveTrackerItem {
  id: 'dragon' | 'grubs' | 'baron';
  label: string;
  valueLabel: string;
  subLabel: string;
  status: NeutralObjectiveStatus;
  remainingSec: number | null;
}

export interface NeutralObjectivesSummary {
  headline: string;
  items: NeutralObjectiveTrackerItem[];
}

export interface LiveMenuQuickSummary {
  hasLiveData: boolean;
  isRealActiveGame: boolean;
  championName: string;
  championImageUrl?: string;
  level?: number;
  kda?: string;
  gameTimeSec: number;
  clockLabel: string;
  phaseLabel: string;
  averageRank: AverageMatchRankInfo;
  sourceLabel: string;
  modeLabel?: string;
  nextRecallItem?: NextRecallItemPriority | null;
  neutralObjectives?: NeutralObjectivesSummary | null;
}

function findChampionByNameOrId(
  champions: ChampionSummary[],
  raw: string,
): ChampionSummary | undefined {
  const norm = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return champions.find(
    (c) =>
      c.id.toLowerCase() === raw.toLowerCase() ||
      c.name.toLowerCase() === raw.toLowerCase() ||
      c.id.toLowerCase().replace(/[^a-z0-9]/g, '') === norm ||
      c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === norm,
  );
}

function resolveBestComponentHint(
  item: ItemData,
  itemsById: Map<string, ItemData>,
  ownedItemIds: Set<number>,
  currentGold: number | null,
): NextRecallItemPriority['componentHint'] {
  if (!item.from || item.from.length === 0) return null;

  const candidates = item.from
    .map((id) => itemsById.get(String(id)))
    .filter((comp): comp is ItemData => comp !== undefined)
    .filter(
      (comp) =>
        comp.gold.purchasable &&
        comp.gold.total >= 300 &&
        !ownedItemIds.has(Number(comp.id)),
    );

  if (candidates.length === 0) return null;

  // Si on connaît l'or actuel, privilégier le composant le plus impactant achetable tout de suite
  if (currentGold !== null) {
    const affordable = candidates
      .filter((c) => currentGold >= c.gold.total)
      .sort((a, b) => b.gold.total - a.gold.total);
    if (affordable.length > 0) {
      const picked = affordable[0];
      return {
        itemId: picked.id,
        itemName: picked.name,
        itemImageUrl: picked.imageUrl,
        goldCost: picked.gold.total,
        affordableNow: true,
      };
    }
  }

  // Sinon, proposer le composant intermédiaire clé de l'objet
  const sorted = [...candidates].sort((a, b) => b.gold.total - a.gold.total);
  const picked = sorted[0];
  return {
    itemId: picked.id,
    itemName: picked.name,
    itemImageUrl: picked.imageUrl,
    goldCost: picked.gold.total,
    affordableNow: currentGold !== null ? currentGold >= picked.gold.total : false,
  };
}

function toGameModeContext(rawMode?: string): GameModeContext {
  const upper = (rawMode || '').toUpperCase();
  if (upper === 'ARAM') return 'ARAM';
  if (upper === 'SWIFTPLAY') return 'SWIFTPLAY';
  if (upper === 'CLASSIC' || upper === '') return 'CLASSIC';
  return 'OTHER';
}

function computeNextRecallPriority(params: {
  enemyPlayers: LivePlayerEquipmentRow[];
  allyPlayers: LivePlayerEquipmentRow[];
  selfChampionName: string;
  role: Role;
  champions: ChampionSummary[];
  items: ItemData[];
  activeStats?: LiveCoachSnapshot['activeStats'];
  currentGold: number | null;
  gameTimeSec: number;
  gameMode?: string;
}): NextRecallItemPriority | null {
  const {
    enemyPlayers,
    allyPlayers,
    selfChampionName,
    role,
    champions,
    items,
    activeStats,
    currentGold,
    gameTimeSec,
    gameMode,
  } = params;

  if (enemyPlayers.length === 0 || items.length === 0 || champions.length === 0) {
    return null;
  }

  const itemsById = new Map<string, ItemData>();
  for (const it of items) {
    itemsById.set(String(it.id), it);
  }

  const selfRow = allyPlayers.find(
    (p) => p.championName.toLowerCase() === selfChampionName.toLowerCase(),
  );
  const ownedItemIds = new Set<number>((selfRow?.items || []).map((it) => it.itemId));

  const goldForScoring = currentGold ?? 900;
  const counterReport = analyzeLiveEnemyCounters({
    enemyPlayers,
    allyPlayers,
    selfChampionName,
    role,
    champions,
    items,
    activeStats,
    currentGold: goldForScoring,
    gameMode,
  });

  const enemyDamageSplit = {
    physicalPct: counterReport.teamPhysicalThreatPct,
    magicPct: counterReport.teamMagicThreatPct,
  };

  if (counterReport.suggestions.length > 0) {
    const top = counterReport.suggestions[0];
    const goldCost = top.item.gold.total;
    const affordableNow = currentGold !== null ? currentGold >= goldCost : false;
    const missingGold =
      currentGold !== null ? Math.max(0, goldCost - currentGold) : null;

    const componentHint =
      !top.isComponent && (currentGold === null || currentGold < goldCost)
        ? resolveBestComponentHint(top.item, itemsById, ownedItemIds, currentGold)
        : null;

    return {
      itemId: top.item.id,
      itemName: top.item.name,
      itemImageUrl: top.item.imageUrl,
      goldCost,
      currentGold,
      affordableNow,
      missingGold,
      priorityLabel: top.priority === 'Urgent' ? 'Urgent' : 'Recommandé',
      categoryLabel: top.category,
      reason: top.reason,
      enemyDamageSplit,
      targetEnemies: top.targetEnemies,
      componentHint,
    };
  }

  // Repli si aucun contre-objet spécialisé n'est déclenché : build adapté à la composition adverse
  const playerChamp = findChampionByNameOrId(champions, selfChampionName);
  if (!playerChamp) return null;

  const enemyChamps = enemyPlayers
    .map((e) => findChampionByNameOrId(champions, e.championName))
    .filter((c): c is ChampionSummary => Boolean(c));

  const rec = computeBuildRecommendation({
    patchVersion: '',
    gameMode: toGameModeContext(gameMode),
    scenario: 'balanced',
    playerChampion: playerChamp,
    role,
    enemies: enemyChamps,
    items,
    runeTrees: [],
  });

  const hasBootsAlready = (selfRow?.items || []).some((it) =>
    itemsById.get(String(it.itemId))?.tags.includes('Boots'),
  );
  const candidateOrder =
    gameTimeSec < 720 && !hasBootsAlready
      ? [rec.boots, ...rec.coreItems]
      : [...rec.coreItems, rec.boots];
  const nextPick =
    candidateOrder.find((entry) => entry?.item && !ownedItemIds.has(Number(entry.item.id))) ||
    rec.coreItems[0] ||
    rec.boots;

  if (!nextPick?.item) return null;

  const goldCost = nextPick.item.gold.total;
  const affordableNow = currentGold !== null ? currentGold >= goldCost : false;
  const missingGold =
    currentGold !== null ? Math.max(0, goldCost - currentGold) : null;

  return {
    itemId: nextPick.item.id,
    itemName: nextPick.item.name,
    itemImageUrl: nextPick.item.imageUrl,
    goldCost,
    currentGold,
    affordableNow,
    missingGold,
    priorityLabel: 'Prioritaire',
    categoryLabel: nextPick.slotType,
    reason:
      nextPick.reasons[0] ||
      `Optimisé face à la composition adverse (${enemyDamageSplit.physicalPct}% AD / ${enemyDamageSplit.magicPct}% AP).`,
    enemyDamageSplit,
    targetEnemies: enemyChamps.slice(0, 2).map((c) => c.name),
    componentHint:
      currentGold === null || currentGold < goldCost
        ? resolveBestComponentHint(nextPick.item, itemsById, ownedItemIds, currentGold)
        : null,
  };
}

export function buildLiveMenuQuickSummary(params: {
  snapshot: LiveCoachSnapshot | null;
  snapshotElapsedSec: number;
  activeGame?: PlayerProfileResponse['activeGame'] | null;
  activeGameElapsedSec: number;
  lobbyParticipants: LobbyScoutParticipant[];
  fallbackSoloRank?: RankedQueueSummary | null;
  fallbackFlexRank?: RankedQueueSummary | null;
  riotId: string;
  role: Role;
  champions: ChampionSummary[];
  items: ItemData[];
}): LiveMenuQuickSummary {
  const {
    snapshot,
    snapshotElapsedSec,
    activeGame,
    activeGameElapsedSec,
    lobbyParticipants,
    fallbackSoloRank,
    fallbackFlexRank,
    riotId,
    role,
    champions,
    items,
  } = params;

  const averageRank = computeAverageMatchRank(
    lobbyParticipants,
    fallbackSoloRank,
    fallbackFlexRank,
  );

  // 1) Si le pont Live Client Data (127.0.0.1:2999) est actif, il fournit les stats et l'horloge les plus fraîches
  const isRealClientSnapshot =
    snapshot?.source === 'Live Client Data (127.0.0.1:2999)';

  if (isRealClientSnapshot && snapshot) {
    const disp = resolveChampionDisplay(champions, snapshot.championName);
    const liveTime = snapshot.gameTimeSec + snapshotElapsedSec;
    const nextRecallItem = computeNextRecallPriority({
      enemyPlayers: snapshot.enemyPlayers,
      allyPlayers: snapshot.allyPlayers,
      selfChampionName: snapshot.championName,
      role,
      champions,
      items,
      activeStats: snapshot.activeStats,
      currentGold: snapshot.currentGold,
      gameTimeSec: liveTime,
      gameMode: snapshot.gameMode,
    });
    const neutralObjectives = computeNeutralObjectivesSummary({
      gameTimeSec: liveTime,
      gameMode: snapshot.gameMode,
      dragonTimerSec: snapshot.dragonTimerSec,
      baronTimerSec: snapshot.baronTimerSec,
      elapsedSec: snapshotElapsedSec,
    });
    return {
      hasLiveData: true,
      isRealActiveGame: true,
      championName: disp.displayName,
      championImageUrl: disp.imageUrl,
      level: snapshot.level,
      kda: snapshot.kda,
      gameTimeSec: liveTime,
      clockLabel: formatLiveClockSec(liveTime),
      phaseLabel: getLivePhaseLabel(liveTime),
      averageRank,
      sourceLabel: 'Client LoL en direct',
      modeLabel: snapshot.gameMode,
      nextRecallItem,
      neutralObjectives,
    };
  }

  // 2) Sinon si Riot Spectator-V5 détecte une partie active
  if (activeGame?.inGame) {
    const cleanRiotId = riotId.trim().toLowerCase();
    const participants = activeGame.participants || [];
    const selfParticipant =
      participants.find((p) => p.riotId.trim().toLowerCase() === cleanRiotId) ||
      participants[0];
    const matchedChamp = selfParticipant
      ? champions.find((c) => Number(c.key) === selfParticipant.championId)
      : undefined;
    const rawChampName = matchedChamp?.id || snapshot?.championName || 'Champion';
    const disp = resolveChampionDisplay(champions, rawChampName);
    const liveTime = (activeGame.gameLengthSec || 0) + activeGameElapsedSec;
    const approxLevel = Math.max(1, Math.min(18, Math.round(1 + liveTime / 85)));

    const selfTeamId = selfParticipant?.teamId ?? 100;
    const enemyRows: LivePlayerEquipmentRow[] = participants
      .filter((p) => p.teamId !== selfTeamId)
      .map((p) => {
        const c = champions.find((ch) => Number(ch.key) === p.championId);
        return {
          championName: c?.id || String(p.championId),
          riotId: p.riotId,
          team: 'ENEMY',
          position: '',
          level: approxLevel,
          kills: 0,
          deaths: 0,
          assists: 0,
          cs: 0,
          isDead: false,
          spell1Id: p.spell1Id,
          spell2Id: p.spell2Id,
          items: [],
          dangerLevel: 'Normal',
        };
      });

    const nextRecallItem = computeNextRecallPriority({
      enemyPlayers: enemyRows,
      allyPlayers: [],
      selfChampionName: rawChampName,
      role,
      champions,
      items,
      currentGold: null,
      gameTimeSec: liveTime,
      gameMode: activeGame.gameMode,
    });

    const neutralObjectives = computeNeutralObjectivesSummary({
      gameTimeSec: liveTime,
      gameMode: activeGame.gameMode,
      elapsedSec: 0,
    });

    return {
      hasLiveData: true,
      isRealActiveGame: true,
      championName: disp.displayName,
      championImageUrl: disp.imageUrl,
      gameTimeSec: liveTime,
      clockLabel: formatLiveClockSec(liveTime),
      phaseLabel: getLivePhaseLabel(liveTime),
      averageRank,
      sourceLabel: 'Riot Spectator-V5',
      modeLabel: activeGame.gameMode,
      nextRecallItem,
      neutralObjectives,
    };
  }

  // 3) Sinon, aperçu du dernier snapshot de simulation / cache serveur
  if (snapshot) {
    const disp = resolveChampionDisplay(champions, snapshot.championName);
    const nextRecallItem = computeNextRecallPriority({
      enemyPlayers: snapshot.enemyPlayers,
      allyPlayers: snapshot.allyPlayers,
      selfChampionName: snapshot.championName,
      role,
      champions,
      items,
      activeStats: snapshot.activeStats,
      currentGold: snapshot.currentGold,
      gameTimeSec: snapshot.gameTimeSec,
      gameMode: snapshot.gameMode,
    });
    const neutralObjectives = computeNeutralObjectivesSummary({
      gameTimeSec: snapshot.gameTimeSec,
      gameMode: snapshot.gameMode,
      dragonTimerSec: snapshot.dragonTimerSec,
      baronTimerSec: snapshot.baronTimerSec,
      elapsedSec: 0,
    });
    return {
      hasLiveData: true,
      isRealActiveGame: false,
      championName: disp.displayName,
      championImageUrl: disp.imageUrl,
      level: snapshot.level,
      kda: snapshot.kda,
      gameTimeSec: snapshot.gameTimeSec,
      clockLabel: formatLiveClockSec(snapshot.gameTimeSec),
      phaseLabel: getLivePhaseLabel(snapshot.gameTimeSec),
      averageRank,
      sourceLabel: 'Simulation Live',
      modeLabel: snapshot.gameMode,
      nextRecallItem,
      neutralObjectives,
    };
  }

  return {
    hasLiveData: false,
    isRealActiveGame: false,
    championName: 'Aucune partie',
    gameTimeSec: 0,
    clockLabel: '00:00',
    phaseLabel: 'En attente',
    averageRank,
    sourceLabel: 'En attente de détection',
    nextRecallItem: null,
    neutralObjectives: null,
  };
}

function computeNeutralObjectivesSummary(params: {
  gameTimeSec: number;
  gameMode?: string;
  dragonTimerSec?: number | null;
  baronTimerSec?: number | null;
  elapsedSec: number;
}): NeutralObjectivesSummary | null {
  const mode = (params.gameMode || '').toUpperCase();
  if (mode === 'ARAM') return null;

  const t = Math.max(0, Math.floor(params.gameTimeSec));
  const elapsed = Math.max(0, Math.floor(params.elapsedSec));

  // 1. Dragons (1er spawn 05:00 / 300s, puis respawn 5m / 300s)
  let dragonItem: NeutralObjectiveTrackerItem;
  if (t < 300) {
    const rem = 300 - t;
    dragonItem = {
      id: 'dragon',
      label: 'Dragons',
      valueLabel: formatLiveClockSec(rem),
      subLabel: 'Spawn 05:00',
      status: rem <= 60 ? 'soon' : 'upcoming',
      remainingSec: rem,
    };
  } else if (params.dragonTimerSec != null) {
    const rem = Math.max(0, Math.round(params.dragonTimerSec - elapsed));
    dragonItem =
      rem === 0
        ? {
            id: 'dragon',
            label: 'Dragons',
            valueLabel: 'Disponible',
            subLabel: 'Rivière sud',
            status: 'available',
            remainingSec: 0,
          }
        : {
            id: 'dragon',
            label: 'Dragons',
            valueLabel: formatLiveClockSec(rem),
            subLabel: 'Respawn 5m',
            status: rem <= 60 ? 'soon' : 'upcoming',
            remainingSec: rem,
          };
  } else {
    dragonItem = {
      id: 'dragon',
      label: 'Dragons',
      valueLabel: 'Disponible',
      subLabel: 'Cycle 5 min',
      status: 'available',
      remainingSec: 0,
    };
  }

  // 2. Larves du Néant / Grubbs (06:00 -> 14:00, puis Héraut à 14:00)
  let grubsItem: NeutralObjectiveTrackerItem;
  if (t < 360) {
    const rem = 360 - t;
    grubsItem = {
      id: 'grubs',
      label: 'Grubbs',
      valueLabel: formatLiveClockSec(rem),
      subLabel: 'Spawn 06:00',
      status: rem <= 60 ? 'soon' : 'upcoming',
      remainingSec: rem,
    };
  } else if (t < 840) {
    const untilDespawn = 840 - t;
    grubsItem = {
      id: 'grubs',
      label: 'Grubbs',
      valueLabel: 'Actives',
      subLabel: `Fin ${formatLiveClockSec(untilDespawn)}`,
      status: 'available',
      remainingSec: 0,
    };
  } else {
    grubsItem = {
      id: 'grubs',
      label: 'Grubbs',
      valueLabel: 'Terminées',
      subLabel: 'Héraut 14:00+',
      status: 'expired',
      remainingSec: null,
    };
  }

  // 3. Baron Nashor (1er spawn 20:00 / 1200s, puis respawn 6m / 360s)
  let baronItem: NeutralObjectiveTrackerItem;
  if (t < 1200) {
    const rem = 1200 - t;
    baronItem = {
      id: 'baron',
      label: 'Baron',
      valueLabel: formatLiveClockSec(rem),
      subLabel: 'Spawn 20:00',
      status: rem <= 75 ? 'soon' : 'upcoming',
      remainingSec: rem,
    };
  } else if (params.baronTimerSec != null) {
    const rem = Math.max(0, Math.round(params.baronTimerSec - elapsed));
    baronItem =
      rem === 0
        ? {
            id: 'baron',
            label: 'Baron',
            valueLabel: 'Disponible',
            subLabel: 'Rivière nord',
            status: 'available',
            remainingSec: 0,
          }
        : {
            id: 'baron',
            label: 'Baron',
            valueLabel: formatLiveClockSec(rem),
            subLabel: 'Respawn 6m',
            status: rem <= 75 ? 'soon' : 'upcoming',
            remainingSec: rem,
          };
  } else {
    baronItem = {
      id: 'baron',
      label: 'Baron',
      valueLabel: 'Disponible',
      subLabel: 'Rivière nord',
      status: 'available',
      remainingSec: 0,
    };
  }

  const items = [dragonItem, grubsItem, baronItem];
  const soonItem = items.find((i) => i.status === 'soon');
  const availableItems = items.filter((i) => i.status === 'available');
  const upcomingSorted = items
    .filter((i) => i.status === 'upcoming' && i.remainingSec !== null)
    .sort((a, b) => (a.remainingSec ?? 9999) - (b.remainingSec ?? 9999));

  let headline = 'Suivi objectifs';
  if (soonItem) {
    headline = `${soonItem.label} imminent (${soonItem.valueLabel})`;
  } else if (availableItems.length > 0) {
    headline = `Actif : ${availableItems.map((i) => i.label).join(' · ')}`;
  } else if (upcomingSorted.length > 0) {
    headline = `Prochain : ${upcomingSorted[0].label} (${upcomingSorted[0].valueLabel})`;
  }

  return { headline, items };
}
