export type Role = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';

export type RiotPlatform =
  | 'EUW1'
  | 'EUN1'
  | 'NA1'
  | 'KR'
  | 'BR1'
  | 'JP1'
  | 'OC1'
  | 'TR1'
  | 'LA1'
  | 'LA2'
  | 'ME1'
  | 'SG2'
  | 'TW2'
  | 'VN2';

export type DataProvenance =
  | 'Data Dragon Officiel'
  | 'Riot API Match-V5'
  | 'Live Client Data (127.0.0.1:2999)'
  | 'Calcul déterministe'
  | 'Simulation théorique'
  | 'Analyse IA Gemini';

export interface ChampionStatsRaw {
  hp: number;
  hpperlevel: number;
  mp: number;
  mpperlevel: number;
  movespeed: number;
  armor: number;
  armorperlevel: number;
  spellblock: number;
  spellblockperlevel: number;
  attackrange: number;
  hpregen: number;
  hpregenperlevel: number;
  mpregen: number;
  mpregenperlevel: number;
  crit: number;
  critperlevel: number;
  attackdamage: number;
  attackdamageperlevel: number;
  attackspeedperlevel: number;
  attackspeed: number;
}

export interface ChampionSummary {
  id: string;
  key: string;
  name: string;
  title: string;
  blurb: string;
  tags: string[];
  partype: string;
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
  stats: ChampionStatsRaw;
  imageUrl: string;
}

export interface ChampionSpell {
  id: string;
  name: string;
  description: string;
  tooltip: string;
  cooldownBurn: string;
  costBurn: string;
  rangeBurn: string;
  imageUrl: string;
}

export interface ChampionDetail extends ChampionSummary {
  lore: string;
  passive: {
    name: string;
    description: string;
    imageUrl: string;
  };
  spells: ChampionSpell[];
  allytips: string[];
  enemytips: string[];
}

export interface ItemData {
  id: string;
  name: string;
  plaintext: string;
  description: string;
  gold: {
    base: number;
    total: number;
    sell: number;
    purchasable: boolean;
  };
  tags: string[];
  stats: Record<string, number>;
  from?: string[];
  into?: string[];
  depth?: number;
  maps?: Record<string, boolean>;
  imageUrl: string;
}

export interface RuneSlotItem {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc: string;
  longDesc: string;
  imageUrl: string;
}

export interface RuneTree {
  id: number;
  key: string;
  icon: string;
  name: string;
  imageUrl: string;
  slots: Array<{
    runes: RuneSlotItem[];
  }>;
}

export interface DDragonBootstrap {
  version: string;
  locale: string;
  fetchedAt: string;
  champions: ChampionSummary[];
  items: ItemData[];
  runeTrees: RuneTree[];
}

export interface ChampionDamageProfile {
  championId: string;
  championName: string;
  physicalScore: number; // 0-100
  magicScore: number; // 0-100
  tankinessScore: number; // 0-100
  sustainScore: number; // 0-100
  burstScore: number; // 0-100
  ccScore: number; // 0-100
  primaryDamage: 'Physique' | 'Magique' | 'Hybride';
  archetype: string;
}

export interface EnemyThreatSummary {
  physicalShare: number;
  magicShare: number;
  tankCount: number;
  highHealCount: number;
  burstThreatCount: number;
  ccThreatCount: number;
  averageRange: number;
  profiles: ChampionDamageProfile[];
}

export interface RecommendedItem {
  item: ItemData;
  slotType: 'Bottes' | 'Coeur' | 'Situationnel';
  priority: number;
  score: number;
  reasons: string[];
}

export interface BuildComparisonMetrics {
  level: number;
  physicalEhp: number;
  magicEhp: number;
  offensiveIndex: number;
  totalGold: number;
}

export type GameModeContext = 'CLASSIC' | 'ARAM' | 'SWIFTPLAY' | 'OTHER';

export interface BannedChampionInfo {
  championId: number;
  teamId: number;
  pickTurn: number;
}

export interface BuildRecommendation {
  patchVersion: string;
  gameMode: GameModeContext;
  provenance: DataProvenance[];
  confidence: 'Élevée' | 'Modérée' | 'Estimée';
  playerChampion: ChampionSummary;
  duoPartner: ChampionSummary | null;
  role: Role;
  supportQuestHint?: string | null;
  threatSummary: EnemyThreatSummary;
  boots: RecommendedItem;
  coreItems: RecommendedItem[];
  situationalItems: RecommendedItem[];
  runes: {
    primaryTree: RuneTree | null;
    keystone: RuneSlotItem | null;
    primarySlots: RuneSlotItem[];
    secondaryTree: RuneTree | null;
    secondarySlots: RuneSlotItem[];
    shardRows: Array<{
      rowLabel: string;
      selectedIndex: number;
      options: string[];
    }>;
    shards: string[];
    rationale: string;
  };
  duoSynergyNotes: string[];
  laneWinConditions: string[];
  comparisonAtLevels: BuildComparisonMetrics[];
}

export interface DetectedRunePage {
  sourceLabel: string;
  pageName?: string;
  primaryTreeId: number | null;
  secondaryTreeId: number | null;
  keystoneId: number | null;
  selectedRuneIds: number[];
  selectedShardRowIndices: [number, number, number] | null;
  shardLabels: string[];
}

export interface PlayerTendencies {
  avgCsPerMin: number;
  avgDeaths: number;
  avgVisionPerMin: number;
  enemyJungleDeathRate: number; // 0..1
  preObjectiveDeathRate: number; // 0..1
  winRate: number;
  gamesAnalyzed: number;
}

export interface MatchParticipantSummary {
  puuid: string;
  riotIdGameName: string;
  riotIdTagline: string;
  championId: number;
  championName: string;
  teamId: number;
  teamPosition: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  csPerMin: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  items: number[];
  summoner1Id: number;
  summoner2Id: number;
  champLevel: number;
}

export interface MapCoordinateEvent {
  timestampMs: number;
  minute: number;
  type: 'DEATH' | 'KILL' | 'ASSIST' | 'OBJECTIVE';
  x: number;
  y: number;
  zone: string;
  isolated: boolean;
  nearObjectiveWindow: boolean;
  killerChampion?: string;
  contextNote: string;
}

export interface TimelineSplitPoint {
  minute: number;
  playerGold: number;
  opponentGold: number;
  goldDiff: number;
  playerCs: number;
  opponentCs: number;
  csDiff: number;
}

export interface MatchRecord {
  matchId: string;
  gameCreation: number;
  gameDurationSec: number;
  gameMode: string;
  queueId: number;
  gameVersion: string;
  source:
    | 'Riot API Match-V5'
    | 'Import Match-V5'
    | 'Match de référence'
    | 'Client LoL Local (LCU)';
  player: MatchParticipantSummary;
  laneOpponent: MatchParticipantSummary | null;
  participants: MatchParticipantSummary[];
  timelineSplits: TimelineSplitPoint[];
  mapEvents: MapCoordinateEvent[];
}

export interface PostGameAnalysis {
  matchId: string;
  csPerMin: number;
  csAt10: number;
  csAt15: number;
  goldDiffAt15: number;
  killParticipation: number;
  visionPerMin: number;
  isolatedDeaths: number;
  preObjectiveDeaths: number;
  overextendedDeaths: number;
  zoneBreakdown: Array<{ zone: string; deaths: number; kills: number }>;
  detectedMistakes: Array<{
    category: 'Placement' | 'Farming' | 'Vision' | 'Objectifs';
    severity: 'Critique' | 'Modérée' | 'Mineure';
    title: string;
    evidence: string;
    drill: string;
  }>;
  strengths: string[];
}

export interface SpectatorParticipant {
  puuid?: string;
  championId: number;
  riotId: string;
  teamId: number;
  spell1Id: number;
  spell2Id: number;
  keystoneId?: number;
}

export interface PlayerProfileResponse {
  source: 'Riot API Live' | 'Données de démonstration (RIOT_API_KEY requise pour le live)';
  riotId: string;
  region: string;
  level: number;
  profileIconId: number;
  rankedSolo: {
    tier: string;
    rank: string;
    lp: number;
    wins: number;
    losses: number;
  } | null;
  activeGame: {
    inGame: boolean;
    gameId?: number;
    gameMode?: string;
    gameQueueConfigId?: number;
    gameLengthSec?: number;
    allies?: string[];
    enemies?: string[];
    bannedChampions?: BannedChampionInfo[];
    participants?: SpectatorParticipant[];
  };
  matches: MatchRecord[];
  tendencies: PlayerTendencies;
}

export interface LocalBridgeStatePayload {
  phase?: 'None' | 'Lobby' | 'Matchmaking' | 'ReadyCheck' | 'ChampSelect' | 'InProgress' | 'EndOfGame' | string;
  gameflow?: {
    phase?: string;
    gameData?: {
      queue?: {
        id?: number;
        name?: string;
        description?: string;
        gameMode?: string;
      };
    };
    map?: {
      gameMode?: string;
      id?: number;
    };
  } | null;
  champSelect?: {
    localPlayerCellId?: number;
    myTeam?: Array<{
      cellId: number;
      championId: number;
      championPickIntent?: number;
      assignedPosition?: string;
      team?: number;
    }>;
    theirTeam?: Array<{
      cellId: number;
      championId: number;
      championPickIntent?: number;
      assignedPosition?: string;
      team?: number;
    }>;
    bans?: {
      myTeamBans?: number[];
      theirTeamBans?: number[];
    };
    actions?: Array<
      Array<{
        type?: string;
        championId?: number;
        completed?: boolean;
        isAllyAction?: boolean;
      }>
    >;
    benchEnabled?: boolean;
    benchChampions?: Array<{ championId: number }>;
  } | null;
  currentRunePage?: {
    id?: number;
    name?: string;
    primaryStyleId?: number;
    subStyleId?: number;
    selectedPerkIds?: number[];
    isActive?: boolean;
  } | null;
  liveGame?: LiveClientAllGameData | null;
}

export interface LiveClientAllGameData {
  activePlayer?: {
    championName?: string;
    riotId?: string;
    level?: number;
    currentGold?: number;
    fullRunes?: {
      keystone?: { id: number; displayName: string };
      primaryRuneTree?: { id: number; displayName: string };
      secondaryRuneTree?: { id: number; displayName: string };
      generalRunes?: Array<{ id: number; displayName: string }>;
      statRunes?: Array<{ id: number; rawDescription?: string }>;
    };
    championStats?: {
      abilityPower?: number;
      armor?: number;
      attackDamage?: number;
      attackSpeed?: number;
      currentHealth?: number;
      maxHealth?: number;
      magicResist?: number;
      moveSpeed?: number;
    };
  };
  allPlayers?: Array<{
    championName: string;
    riotId?: string;
    team: 'ORDER' | 'CHAOS';
    position?: string;
    level: number;
    isDead?: boolean;
    respawnTimer?: number;
    scores?: {
      kills: number;
      deaths: number;
      assists: number;
      creepScore: number;
      wardScore?: number;
    };
    items?: Array<{
      itemID: number;
      displayName: string;
      price: number;
    }>;
  }>;
  events?: {
    Events?: Array<{
      EventID: number;
      EventName: string;
      EventTime: number;
      DragonType?: string;
      KillerName?: string;
    }>;
  };
  gameData?: {
    gameMode?: string;
    gameTime?: number;
    mapName?: string;
  };
}

export interface LivePlayerEquipmentRow {
  championName: string;
  riotId: string;
  team: 'ALLY' | 'ENEMY';
  position: string;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  isDead: boolean;
  items: Array<{
    itemId: number;
    displayName: string;
    price: number;
  }>;
  dangerLevel: 'Élevé' | 'Moyen' | 'Normal';
}

export interface LiveCoachSnapshot {
  source: 'Live Client Data (127.0.0.1:2999)' | 'Simulation Live Client Data';
  receivedAt: string;
  gameTimeSec: number;
  championName: string;
  level: number;
  currentGold: number;
  activeStats: {
    maxHealth: number;
    attackDamage: number;
    abilityPower: number;
    armor: number;
    magicResist: number;
    attackSpeed: number;
    moveSpeed: number;
  } | null;
  kda: string;
  cs: number;
  csPerMin: number;
  targetCsPerMin: number;
  csPaceDelta: number;
  allyKills: number;
  enemyKills: number;
  dragonTimerSec: number | null;
  baronTimerSec: number | null;
  alerts: Array<{
    priority: 'Haute' | 'Moyenne' | 'Info';
    category: 'Rappel / Économie' | 'Objectifs' | 'Farming' | 'Menace Adverse';
    message: string;
    action: string;
  }>;
  allyPlayers: LivePlayerEquipmentRow[];
  enemyPlayers: LivePlayerEquipmentRow[];
  enemyThreats: Array<{
    championName: string;
    kills: number;
    cs: number;
    level: number;
    itemCount: number;
    dangerLevel: 'Élevé' | 'Moyen' | 'Normal';
  }>;
  rawSummary: {
    allyTeam: string[];
    enemyTeam: string[];
  };
  fullRunesSummary?: {
    primaryTreeId: number | null;
    secondaryTreeId: number | null;
    keystoneId: number | null;
    keystoneName?: string;
    selectedRuneIds: number[];
    statRuneIds: number[];
  } | null;
}
