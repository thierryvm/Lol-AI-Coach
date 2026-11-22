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
  keyThreats?: string[];
  recommendedCounter?: string;
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
export type GameScenario = 'balanced' | 'ahead' | 'behind';

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

export interface ChampionCareerStat {
  championName: string;
  games: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  kdaRatio: number;
  avgCsPerMin: number;
  avgVisionPerMin: number;
}

export interface CareerTrend {
  recentGames: number;
  earlierGames: number;
  winRateDelta: number;
  deathsDelta: number;
  csPerMinDelta: number;
  visionDelta: number;
}

export interface ProactiveAlert {
  id: string;
  priority: 'Haute' | 'Moyenne' | 'Positif';
  area: 'Survie' | 'Farming' | 'Vision' | 'Objectifs' | 'Champion Pool';
  title: string;
  detail: string;
  recommendation: string;
  championTarget?: string;
}

export interface PlayerTendencies {
  avgCsPerMin: number;
  avgDeaths: number;
  avgVisionPerMin: number;
  enemyJungleDeathRate: number; // 0..1
  preObjectiveDeathRate: number; // 0..1
  winRate: number;
  gamesAnalyzed: number;
  championStats?: ChampionCareerStat[];
  trend?: CareerTrend | null;
  proactiveAlerts?: ProactiveAlert[];
}

export interface SavedPlayerProfile {
  id: string;
  label: string;
  riotId: string;
  region: RiotPlatform;
  role: Role;
}

export interface CareerSynthesisDataset {
  gamesAnalyzed: number;
  wins: number;
  losses: number;
  winRate: number;
  avgDeaths: number;
  avgCsPerMin: number;
  avgVisionPerMin: number;
  avgGoldDiffAt15: number | null;
  avgCsDiffAt15: number | null;
  isolatedDeathPct: number;
  preObjectiveDeathPct: number;
  phaseDeaths: {
    early0To12m: number;
    mid12To24m: number;
    late24mPlus: number;
  };
  zoneTotals: Array<{
    zone: string;
    deaths: number;
    isolatedDeaths: number;
    preObjectiveDeaths: number;
    kills: number;
  }>;
  championStats: ChampionCareerStat[];
  trend: CareerTrend | null;
  matchDigests: Array<{
    date: string;
    champion: string;
    role: string;
    win: boolean;
    kda: string;
    csPerMin: number;
    visionPerMin: number;
    goldDiffAt15: number | null;
    isolatedDeaths: number;
    preObjectiveDeaths: number;
    topDeathZone: string | null;
  }>;
}

export interface CareerAiSynthesis {
  schemaVersion?: number;
  generatedAt: string;
  gamesAnalyzed: number;
  executiveSummary: string;
  recurringPositioningErrors: Array<{
    zoneOrPattern: string;
    frequencyNote: string;
    correction: string;
  }>;
  gameplayAdjustments: Array<{
    area: string;
    currentHabit: string;
    targetAdjustment: string;
    expectedImpact: string;
  }>;
  championPoolAdvice: string;
  threeGameActionPlan: string[];
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

export interface MapParticipantSnapshot {
  participantId: number;
  championName: string;
  teamId: number;
  teamPosition: string;
  x: number;
  y: number;
  isPlayer: boolean;
  isAlly: boolean;
  isKiller: boolean;
  isAssister: boolean;
}

export interface MapDamageSource {
  sourceName: string;
  isEnemyChampion: boolean;
  physicalDamage: number;
  magicDamage: number;
  trueDamage: number;
  totalDamage: number;
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
  assistingChampions?: string[];
  damageBreakdown?: MapDamageSource[];
  participantSnapshots?: MapParticipantSnapshot[];
  snapshotDeltaSec?: number;
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

export interface ChampionMasteryEntry {
  championId: number;
  championLevel: number;
  championPoints: number;
}

export interface RankedQueueSummary {
  tier: string;
  rank: string;
  lp: number;
  wins: number;
  losses: number;
  hotStreak?: boolean;
  veteran?: boolean;
}

export interface RiotChallengeSummary {
  level: string;
  currentPoints: number;
  maxPoints: number;
  percentile: number;
  categories: Array<{
    key: string;
    label: string;
    level: string;
    current: number;
    max: number;
    percentile: number;
  }>;
}

export interface RiotServerStatusSummary {
  platform: string;
  healthy: boolean;
  incidents: Array<{
    id: number;
    severity: string;
    title: string;
  }>;
  maintenances: Array<{
    id: number;
    status: string;
    title: string;
  }>;
}

export interface LobbyScoutParticipant {
  puuid?: string;
  riotId: string;
  championId: number;
  teamId: number;
  soloRank: RankedQueueSummary | null;
  flexRank: RankedQueueSummary | null;
  championMasteryLevel: number;
  championMasteryPoints: number;
  tags: string[];
}

export interface PlayerProfileResponse {
  source: 'Riot API Live' | 'Données de démonstration (RIOT_API_KEY requise pour le live)';
  riotId: string;
  region: string;
  level: number;
  profileIconId: number;
  rankedSolo: RankedQueueSummary | null;
  rankedFlex?: RankedQueueSummary | null;
  challenges?: RiotChallengeSummary | null;
  serverStatus?: RiotServerStatusSummary | null;
  championMasteries?: ChampionMasteryEntry[];
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

export interface LcuRunePageRaw {
  id: number;
  name: string;
  primaryStyleId: number;
  subStyleId: number;
  selectedPerkIds: number[];
  isActive?: boolean;
  isEditable?: boolean;
  isDeletable?: boolean;
  isTemporary?: boolean;
  isValid?: boolean;
  current?: boolean;
  order?: number;
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
  currentRunePage?: LcuRunePageRaw | null;
  runePages?: LcuRunePageRaw[] | null;
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
    abilities?: {
      Passive?: { displayName?: string; id?: string; rawDescription?: string };
      Q?: { abilityLevel?: number; displayName?: string; id?: string };
      W?: { abilityLevel?: number; displayName?: string; id?: string };
      E?: { abilityLevel?: number; displayName?: string; id?: string };
      R?: { abilityLevel?: number; displayName?: string; id?: string };
    };
    championStats?: {
      abilityHaste?: number;
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
    summonerSpells?: {
      summonerSpellOne?: {
        displayName?: string;
        rawDescription?: string;
      };
      summonerSpellTwo?: {
        displayName?: string;
        rawDescription?: string;
      };
    };
  }>;
  events?: {
    Events?: Array<LiveClientRawGameEvent>;
  };
  gameEvents?: Array<LiveClientRawGameEvent>;
  gameEvent?: LiveClientRawGameEvent | Array<LiveClientRawGameEvent>;
  gameData?: {
    gameMode?: string;
    gameTime?: number;
    mapName?: string;
  };
}

export interface LiveClientRawGameEvent {
  EventID?: number;
  eventId?: number;
  EventName?: string;
  eventName?: string;
  EventTime?: number;
  eventTime?: number;
  EventType?: string;
  eventType?: string;
  type?: string;
  DragonType?: string;
  KillerName?: string;
  CasterName?: string;
  casterName?: string;
  ChampionName?: string;
  championName?: string;
  SummonerName?: string;
  summonerName?: string;
  ActorName?: string;
  TargetName?: string;
  targetName?: string;
  SpellName?: string;
  spellName?: string;
  SummonerSpellName?: string;
  AbilityName?: string;
  spell?: string;
  SpellSlot?: string;
  spellSlot?: string;
  AbilityKey?: string;
  abilityKey?: string;
  slot?: string;
  key?: string;
  CooldownSec?: number;
  cooldownSec?: number;
  cooldown?: number;
  IsMajor?: boolean;
  isMajor?: boolean;
  Team?: string;
  team?: string;
  gameEvent?: LiveClientRawGameEvent;
  payload?: LiveClientRawGameEvent;
  data?: LiveClientRawGameEvent;
}

export type LiveGameEventCategory =
  | 'flash'
  | 'ultimate'
  | 'summoner_spell'
  | 'ability'
  | 'other';

export interface LiveParsedGameEvent {
  id: string;
  eventId: number;
  eventName: string;
  eventTimeSec: number;
  category: LiveGameEventCategory;
  isMajor: boolean;
  spellName: string;
  spellSlot?: 'Q' | 'W' | 'E' | 'R' | 'D' | 'F' | 'SUMMONER' | string;
  casterChampionName?: string;
  casterRiotId?: string;
  casterTeam: 'ALLY' | 'ENEMY' | 'NEUTRAL';
  targetName?: string;
  estimatedCooldownSec?: number;
  summary: string;
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
  spell1Id?: number;
  spell2Id?: number;
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
  gameMode?: string;
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
    abilityHaste?: number;
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
  activeAbilityLevels?: {
    Q: number;
    W: number;
    E: number;
    R: number;
  } | null;
  gameState?: 'AHEAD' | 'EVEN' | 'BEHIND';
  comebackAdvice?: {
    triggerReason: string;
    priorityItemHint: string;
    gameplayPivot: string;
  } | null;
  gameEvents?: LiveParsedGameEvent[];
}

export interface LaneMatchupWinRateRow {
  championName: string;
  enemyPosition: string;
  isDirectLaneOpponent: boolean;
  /** Head-to-head dans la voie actuelle (Match-V5 : adversaire dans la même voie vs vous dans cette voie) */
  laneH2HGames: number;
  laneH2HEnemyWins: number;
  laneH2HEnemyWinRate: number | null;
  /** Head-to-head toutes voies confondues dans Match-V5 */
  overallH2HGames: number;
  overallH2HEnemyWins: number;
  overallH2HEnemyWinRate: number | null;
  /** Performance globale du champion ennemi dans cette voie (Match-V5 scannés) */
  enemyChampInLaneGames: number;
  enemyChampInLaneWins: number;
  enemyChampInLaneWinRate: number | null;
  /** Win Rate Ranked Solo/Flex du joueur ennemi via Riot League-V4 (si PUUID Spectator présent) */
  enemyPlayerRankedWinRate: number | null;
  enemyPlayerRankedGames: number;
  enemyPlayerRankLabel: string | null;
}

export interface LaneMatchupWinRateResponse {
  available: boolean;
  targetLane: string;
  playerChampion: string;
  scannedMatchesCount: number;
  rows: LaneMatchupWinRateRow[];
  note?: string;
}

