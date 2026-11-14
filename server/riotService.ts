import { classifySummonersRiftZone, computePlayerTendencies } from '../src/engines/postGameEngine.ts';
import type {
  ChampionDetail,
  ChampionSummary,
  DDragonBootstrap,
  ItemData,
  MapCoordinateEvent,
  MatchParticipantSummary,
  MatchRecord,
  PlayerProfileResponse,
  RiotPlatform,
  RuneTree,
  TimelineSplitPoint,
} from '../src/engines/types.ts';
import { buildReferenceProfile } from './referenceData.ts';

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const ddCache = {
  bootstrap: null as CacheEntry<DDragonBootstrap> | null,
  champions: new Map<string, CacheEntry<ChampionDetail>>(),
};

const riotCaches = {
  accounts: new Map<string, CacheEntry<{ puuid: string; gameName: string; tagLine: string }>>(),
  matches: new Map<string, any>(), // Les matchs Match-V5 passés sont immuables
  timelines: new Map<string, any>(), // Les timelines passées sont immuables
  profiles: new Map<string, CacheEntry<PlayerProfileResponse>>(),
  inflight: new Map<string, Promise<PlayerProfileResponse>>(),
};

const DDRAGON_TTL_MS = 1000 * 60 * 30; // 30 minutes
const ACCOUNT_TTL_MS = 1000 * 60 * 30; // 30 minutes
const PROFILE_TTL_MS = 1000 * 30; // 30 secondes (évite le spam Riot sur refresh)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PLATFORM_TO_REGIONAL: Record<RiotPlatform, 'europe' | 'americas' | 'asia' | 'sea'> = {
  EUW1: 'europe',
  EUN1: 'europe',
  TR1: 'europe',
  ME1: 'europe',
  NA1: 'americas',
  BR1: 'americas',
  LA1: 'americas',
  LA2: 'americas',
  KR: 'asia',
  JP1: 'asia',
  OC1: 'sea',
  SG2: 'sea',
  TW2: 'sea',
  VN2: 'sea',
};

export function getCleanRiotApiKey(): string {
  let raw = (process.env.RIOT_API_KEY || '').trim();
  // Retirer d'éventuels guillemets ou préfixe "X-Riot-Token:" collés par erreur
  raw = raw.replace(/^["']+|["']+$/g, '').trim();
  raw = raw.replace(/^x-riot-token\s*:\s*/i, '').trim();
  return raw;
}

export function hasRiotApiKey(): boolean {
  const key = getCleanRiotApiKey();
  return Boolean(key && key !== 'MY_RIOT_API_KEY');
}

export function getRiotKeyDiagnostics() {
  const key = getCleanRiotApiKey();
  return {
    configured: hasRiotApiKey(),
    startsWithRgapi: key.startsWith('RGAPI-'),
    length: key.length,
  };
}

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} sur ${url}${body ? ` : ${body.slice(0, 180)}` : ''}`);
    (err as Error & { status?: number; retryAfterSec?: number }).status = res.status;
    const ra = Number(res.headers.get('retry-after') || '0');
    if (Number.isFinite(ra) && ra > 0) {
      (err as Error & { retryAfterSec?: number }).retryAfterSec = ra;
    }
    throw err;
  }
  return (await res.json()) as T;
}

async function fetchRiotWithRetry<T>(
  url: string,
  headers: Record<string, string>,
  maxRetries = 2,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fetchJson<T>(url, headers);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      const retryAfterSec = (err as Error & { retryAfterSec?: number }).retryAfterSec || 0;
      if (status === 429 && attempt < maxRetries) {
        attempt += 1;
        const waitMs = Math.min(4500, Math.max(1200, retryAfterSec * 1000 || 1500 * attempt));
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Synchronise le patch officiel le plus récent depuis Riot Data Dragon (versions.json),
 * puis charge champions, objets achetables et arbres de runes en français (fr_FR).
 */
export async function getDDragonBootstrap(forceRefresh = false): Promise<DDragonBootstrap> {
  const now = Date.now();
  if (!forceRefresh && ddCache.bootstrap && ddCache.bootstrap.expiresAt > now) {
    return ddCache.bootstrap.value;
  }

  const versions = await fetchJson<string[]>(`${DDRAGON_BASE}/api/versions.json`);
  const version = versions[0];
  const locale = 'fr_FR';

  const [champRaw, itemRaw, runesRaw] = await Promise.all([
    fetchJson<{ data: Record<string, any> }>(
      `${DDRAGON_BASE}/cdn/${version}/data/${locale}/champion.json`,
    ),
    fetchJson<{ data: Record<string, any> }>(
      `${DDRAGON_BASE}/cdn/${version}/data/${locale}/item.json`,
    ),
    fetchJson<any[]>(
      `${DDRAGON_BASE}/cdn/${version}/data/${locale}/runesReforged.json`,
    ),
  ]);

  const champions: ChampionSummary[] = Object.values(champRaw.data)
    .map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      title: c.title,
      blurb: c.blurb,
      tags: c.tags || [],
      partype: c.partype || 'Mana',
      info: c.info,
      stats: c.stats,
      imageUrl: `${DDRAGON_BASE}/cdn/${version}/img/champion/${c.image.full}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  const rawItems: ItemData[] = Object.entries(itemRaw.data)
    .filter(([id, it]) => {
      const numericId = Number(id);
      if (!Number.isFinite(numericId) || numericId >= 100000) return false;
      if (it.inStore === false || it.requiredAlly) return false;
      if (it.maps && it.maps['11'] === false && it.maps['12'] === false) return false;
      return Boolean(it.gold?.total > 0);
    })
    .map(([id, it]) => ({
      id,
      name: it.name,
      plaintext: it.plaintext || '',
      description: it.description || '',
      gold: it.gold,
      tags: it.tags || [],
      stats: it.stats || {},
      from: it.from,
      into: it.into,
      depth: it.depth,
      maps: it.maps,
      imageUrl: `${DDRAGON_BASE}/cdn/${version}/img/item/${it.image.full}`,
    }));

  // Dédupliquer par nom (conserve l'objet standard avec le plus petit ID numérique)
  const itemsByName = new Map<string, ItemData>();
  for (const item of rawItems) {
    const key = item.name.trim().toLowerCase();
    const existing = itemsByName.get(key);
    if (!existing || Number(item.id) < Number(existing.id)) {
      itemsByName.set(key, item);
    }
  }
  const items: ItemData[] = Array.from(itemsByName.values());

  const runeTrees: RuneTree[] = runesRaw.map((tree) => ({
    id: tree.id,
    key: tree.key,
    icon: tree.icon,
    name: tree.name,
    imageUrl: `${DDRAGON_BASE}/cdn/img/${tree.icon}`,
    slots: (tree.slots || []).map((slot: any) => ({
      runes: (slot.runes || []).map((r: any) => ({
        id: r.id,
        key: r.key,
        icon: r.icon,
        name: r.name,
        shortDesc: r.shortDesc || '',
        longDesc: r.longDesc || '',
        imageUrl: `${DDRAGON_BASE}/cdn/img/${r.icon}`,
      })),
    })),
  }));

  const value: DDragonBootstrap = {
    version,
    locale,
    fetchedAt: new Date().toISOString(),
    champions,
    items,
    runeTrees,
  };

  ddCache.bootstrap = { value, expiresAt: now + DDRAGON_TTL_MS };
  return value;
}

/**
 * Récupère la fiche détaillée complète d'un champion (passif, sorts, tips).
 */
export async function getChampionDetail(championId: string): Promise<ChampionDetail> {
  const bootstrap = await getDDragonBootstrap();
  const cacheKey = `${bootstrap.version}:${championId}`;
  const now = Date.now();
  const hit = ddCache.champions.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const raw = await fetchJson<{ data: Record<string, any> }>(
    `${DDRAGON_BASE}/cdn/${bootstrap.version}/data/${bootstrap.locale}/champion/${encodeURIComponent(
      championId,
    )}.json`,
  );
  const c = raw.data[championId] || Object.values(raw.data)[0];

  const detail: ChampionDetail = {
    id: c.id,
    key: c.key,
    name: c.name,
    title: c.title,
    blurb: c.blurb,
    lore: c.lore,
    tags: c.tags || [],
    partype: c.partype || 'Mana',
    info: c.info,
    stats: c.stats,
    imageUrl: `${DDRAGON_BASE}/cdn/${bootstrap.version}/img/champion/${c.image.full}`,
    passive: {
      name: c.passive.name,
      description: c.passive.description,
      imageUrl: `${DDRAGON_BASE}/cdn/${bootstrap.version}/img/passive/${c.passive.image.full}`,
    },
    spells: (c.spells || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tooltip: s.tooltip,
      cooldownBurn: s.cooldownBurn,
      costBurn: s.costBurn,
      rangeBurn: s.rangeBurn,
      imageUrl: `${DDRAGON_BASE}/cdn/${bootstrap.version}/img/spell/${s.image.full}`,
    })),
    allytips: c.allytips || [],
    enemytips: c.enemytips || [],
  };

  ddCache.champions.set(cacheKey, { value: detail, expiresAt: now + DDRAGON_TTL_MS });
  return detail;
}

/**
 * Normalise un objet brut Riot Match-V5 (+ Timeline optionnelle) en MatchRecord exploitable.
 */
export function normalizeRiotMatch(
  matchJson: any,
  targetPuuid: string,
  timelineJson?: any,
  source: MatchRecord['source'] = 'Riot API Match-V5',
): MatchRecord {
  const info = matchJson.info || matchJson;
  const durationSec = Math.max(1, Number(info.gameDuration || 1));
  const durationMin = Math.max(1, durationSec / 60);

  const participants: MatchParticipantSummary[] = (info.participants || []).map((p: any) => {
    const cs = (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
    return {
      puuid: p.puuid || '',
      riotIdGameName: p.riotIdGameName || p.summonerName || 'Joueur',
      riotIdTagline: p.riotIdTagline || '',
      championId: p.championId || 0,
      championName: p.championName || 'Champion',
      teamId: p.teamId || 100,
      teamPosition: p.teamPosition || p.individualPosition || 'UNKNOWN',
      win: Boolean(p.win),
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      cs,
      csPerMin: Number((cs / durationMin).toFixed(1)),
      goldEarned: p.goldEarned || 0,
      totalDamageDealtToChampions: p.totalDamageDealtToChampions || 0,
      totalDamageTaken: p.totalDamageTaken || 0,
      visionScore: p.visionScore || 0,
      wardsPlaced: p.wardsPlaced || 0,
      wardsKilled: p.wardsKilled || 0,
      items: [p.item0 || 0, p.item1 || 0, p.item2 || 0, p.item3 || 0, p.item4 || 0, p.item5 || 0],
      summoner1Id: p.summoner1Id || 4,
      summoner2Id: p.summoner2Id || 14,
      champLevel: p.champLevel || 1,
    };
  });

  const player =
    participants.find((p) => p.puuid === targetPuuid) || participants[0];
  const laneOpponent =
    participants.find(
      (p) =>
        p.teamId !== player.teamId &&
        player.teamPosition !== 'UNKNOWN' &&
        p.teamPosition === player.teamPosition,
    ) || null;

  // Extraction Timeline Match-V5 si fournie
  const timelineSplits: TimelineSplitPoint[] = [];
  const mapEvents: MapCoordinateEvent[] = [];

  if (timelineJson?.info?.frames) {
    const rawParticipants: any[] = info.participants || [];
    const playerRawIdx = rawParticipants.findIndex((p) => p.puuid === player.puuid);
    const oppRawIdx = laneOpponent
      ? rawParticipants.findIndex((p) => p.puuid === laneOpponent.puuid)
      : -1;
    const playerParticipantId = playerRawIdx >= 0 ? rawParticipants[playerRawIdx].participantId : 1;
    const oppParticipantId = oppRawIdx >= 0 ? rawParticipants[oppRawIdx].participantId : -1;

    const champByPid = new Map<number, string>();
    const teamByPid = new Map<number, number>();
    for (const rp of rawParticipants) {
      champByPid.set(rp.participantId, rp.championName);
      teamByPid.set(rp.participantId, rp.teamId);
    }

    const frames: any[] = timelineJson.info.frames;
    const objectiveTimestamps: number[] = [];

    for (const f of frames) {
      for (const ev of f.events || []) {
        if (ev.type === 'ELITE_MONSTER_KILL') {
          objectiveTimestamps.push(ev.timestamp);
        }
      }
    }

    for (const f of frames) {
      const minute = Math.round((f.timestamp || 0) / 60000);
      if (minute > 0 && minute % 5 === 0 && f.participantFrames) {
        const pf = f.participantFrames[String(playerParticipantId)];
        const of = oppParticipantId > 0 ? f.participantFrames[String(oppParticipantId)] : null;
        if (pf) {
          const pCs = (pf.minionsKilled || 0) + (pf.jungleMinionsKilled || 0);
          const oCs = of ? (of.minionsKilled || 0) + (of.jungleMinionsKilled || 0) : pCs;
          const pGold = pf.totalGold || 0;
          const oGold = of ? of.totalGold || 0 : pGold;
          timelineSplits.push({
            minute,
            playerGold: pGold,
            opponentGold: oGold,
            goldDiff: pGold - oGold,
            playerCs: pCs,
            opponentCs: oCs,
            csDiff: pCs - oCs,
          });
        }
      }

      for (const ev of f.events || []) {
        if (ev.type === 'CHAMPION_KILL' && ev.position) {
          const x = ev.position.x || 0;
          const y = ev.position.y || 0;
          const zone = classifySummonersRiftZone(x, y);
          const evMin = Math.round((ev.timestamp || 0) / 60000);

          if (ev.victimId === playerParticipantId) {
            const assists: number[] = ev.assistingParticipantIds || [];
            // Vérifie si un objectif majeur est tombé ou était en approche dans les 45s suivant cette mort
            const nearObjectiveWindow = objectiveTimestamps.some(
              (ot) => ot >= ev.timestamp && ot - ev.timestamp <= 45000,
            );
            const isolated =
              (player.teamId === 100 && x + y > 15200) ||
              (player.teamId === 200 && x + y < 14500) ||
              assists.length === 0;

            mapEvents.push({
              timestampMs: ev.timestamp,
              minute: evMin,
              type: 'DEATH',
              x,
              y,
              zone,
              isolated,
              nearObjectiveWindow,
              killerChampion: champByPid.get(ev.killerId) || 'Adversaire',
              contextNote: `Éliminé par ${champByPid.get(ev.killerId) || 'adversaire'} en ${zone} à ${evMin} min.`,
            });
          } else if (ev.killerId === playerParticipantId) {
            mapEvents.push({
              timestampMs: ev.timestamp,
              minute: evMin,
              type: 'KILL',
              x,
              y,
              zone,
              isolated: false,
              nearObjectiveWindow: false,
              contextNote: `Élimination réalisée en ${zone} à ${evMin} min.`,
            });
          }
        }
      }
    }
  }

  return {
    matchId: matchJson.metadata?.matchId || `IMPORT_${Date.now()}`,
    gameCreation: info.gameCreation || Date.now(),
    gameDurationSec: durationSec,
    gameMode: info.gameMode || 'CLASSIC',
    queueId: info.queueId || 420,
    gameVersion: String(info.gameVersion || '').split('.').slice(0, 2).join('.') || 'Live',
    source,
    player,
    laneOpponent,
    participants,
    timelineSplits,
    mapEvents,
  };
}

function formatSpectatorActiveGame(
  activeGameRes: any,
  playerPuuid: string,
): PlayerProfileResponse['activeGame'] {
  if (!activeGameRes?.participants) {
    return { inGame: false };
  }

  const selfSpec = activeGameRes.participants.find((p: any) => p.puuid === playerPuuid);
  const myTeamId = selfSpec?.teamId || 100;

  return {
    inGame: true,
    gameId: activeGameRes.gameId,
    gameMode: activeGameRes.gameMode,
    gameQueueConfigId: activeGameRes.gameQueueConfigId,
    gameLengthSec: activeGameRes.gameLength,
    allies: activeGameRes.participants
      .filter((p: any) => p.teamId === myTeamId)
      .map((p: any) => String(p.championId)),
    enemies: activeGameRes.participants
      .filter((p: any) => p.teamId !== myTeamId)
      .map((p: any) => String(p.championId)),
    bannedChampions: Array.isArray(activeGameRes.bannedChampions)
      ? activeGameRes.bannedChampions
          .filter((b: any) => b && Number(b.championId) > 0)
          .map((b: any) => ({
            championId: Number(b.championId),
            teamId: Number(b.teamId || 100),
            pickTurn: Number(b.pickTurn || 0),
          }))
      : [],
    participants: activeGameRes.participants.map((p: any) => ({
      puuid: p.puuid,
      championId: p.championId,
      riotId: p.riotId || p.summonerName || 'Joueur',
      teamId: p.teamId,
      spell1Id: p.spell1Id,
      spell2Id: p.spell2Id,
      keystoneId: p.perks?.perkIds?.[0],
    })),
  };
}

/**
 * Synchronise le profil, le rang et les matchs Match-V5 + Timelines depuis l'API officielle Riot.
 * Utilise un cache immuable sur les matchs/timelines déjà téléchargés et cadence les appels
 * pour respecter les quotas Development API Key (20 req/s, 100 req/2 min) sans erreur 429.
 */
export async function syncRiotPlayerProfile(
  gameName: string,
  tagLine: string,
  platform: RiotPlatform,
  forceRefresh = false,
): Promise<PlayerProfileResponse> {
  if (!hasRiotApiKey()) {
    return buildReferenceProfile(`${gameName}#${tagLine}`, platform);
  }

  const cacheKey = `${platform}:${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;
  const now = Date.now();

  if (!forceRefresh) {
    const cachedProfile = riotCaches.profiles.get(cacheKey);
    if (cachedProfile && cachedProfile.expiresAt > now) {
      return cachedProfile.value;
    }
  }

  // Déduplique les appels simultanés identiques (ex: double clic ou double montage React)
  const existingInflight = riotCaches.inflight.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const runSync = async (): Promise<PlayerProfileResponse> => {
    const apiKey = getCleanRiotApiKey();
    const headers = { 'X-Riot-Token': apiKey };
    const regional = PLATFORM_TO_REGIONAL[platform] || 'europe';
    const platformHost = `${platform.toLowerCase()}.api.riotgames.com`;
    const regionalHost = `${regional}.api.riotgames.com`;

    // 1. Account-V1 (mis en cache 30 min)
    let account = riotCaches.accounts.get(cacheKey)?.value;
    const accountEntry = riotCaches.accounts.get(cacheKey);
    if (!account || !accountEntry || accountEntry.expiresAt <= Date.now()) {
      account = await fetchRiotWithRetry<{ puuid: string; gameName: string; tagLine: string }>(
        `https://${regionalHost}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
          gameName,
        )}/${encodeURIComponent(tagLine)}`,
        headers,
      );
      riotCaches.accounts.set(cacheKey, {
        value: account,
        expiresAt: Date.now() + ACCOUNT_TTL_MS,
      });
    }

    // 2. Summoner-V4, League-V4, Spectator-V5 & Liste Match-V5 (appels légers)
    const summoner = await fetchRiotWithRetry<{
      id?: string;
      puuid: string;
      profileIconId: number;
      summonerLevel: number;
    }>(`https://${platformHost}/lol/summoner/v4/summoners/by-puuid/${account.puuid}`, headers);

    const [leagueEntries, activeGameRes, matchIds] = await Promise.all([
      fetchRiotWithRetry<any[]>(
        `https://${platformHost}/lol/league/v4/entries/by-puuid/${account.puuid}`,
        headers,
      ).catch(async () => {
        if (summoner.id) {
          return fetchRiotWithRetry<any[]>(
            `https://${platformHost}/lol/league/v4/entries/by-summoner/${summoner.id}`,
            headers,
          ).catch(() => []);
        }
        return [];
      }),
      fetchRiotWithRetry<any>(
        `https://${platformHost}/lol/spectator/v5/active-games/by-summoner/${account.puuid}`,
        headers,
      ).catch(() => null),
      fetchRiotWithRetry<string[]>(
        `https://${regionalHost}/lol/match/v5/matches/by-puuid/${account.puuid}/ids?start=0&count=10`,
        headers,
      ),
    ]);

    const soloEntry =
      leagueEntries.find((e) => e.queueType === 'RANKED_SOLO_5x5') || leagueEntries[0] || null;

    // 3. Match-V5 détails + timelines cadencés (avec réutilisation du cache immuable)
    const matches: MatchRecord[] = [];
    for (let idx = 0; idx < matchIds.length; idx++) {
      const matchId = matchIds[idx];
      let matchData = riotCaches.matches.get(matchId);
      if (!matchData) {
        matchData = await fetchRiotWithRetry<any>(
          `https://${regionalHost}/lol/match/v5/matches/${matchId}`,
          headers,
        );
        if (riotCaches.matches.size > 200) {
          const oldest = riotCaches.matches.keys().next().value;
          if (oldest) riotCaches.matches.delete(oldest);
        }
        riotCaches.matches.set(matchId, matchData);
        await sleep(95);
      }

      let timelineData: any = null;
      if (idx < 4) {
        timelineData = riotCaches.timelines.get(matchId) || null;
        if (!timelineData) {
          timelineData = await fetchRiotWithRetry<any>(
            `https://${regionalHost}/lol/match/v5/matches/${matchId}/timeline`,
            headers,
            1,
          ).catch(() => null);
          if (timelineData) {
            if (riotCaches.timelines.size > 100) {
              const oldestTl = riotCaches.timelines.keys().next().value;
              if (oldestTl) riotCaches.timelines.delete(oldestTl);
            }
            riotCaches.timelines.set(matchId, timelineData);
            await sleep(95);
          }
        }
      }

      matches.push(
        normalizeRiotMatch(matchData, account.puuid, timelineData, 'Riot API Match-V5'),
      );
    }

    matches.sort((a, b) => b.gameCreation - a.gameCreation);
    const activeGame = formatSpectatorActiveGame(activeGameRes, account.puuid);

    const profile: PlayerProfileResponse = {
      source: 'Riot API Live',
      riotId: `${account.gameName}#${account.tagLine}`,
      region: platform,
      level: summoner.summonerLevel,
      profileIconId: summoner.profileIconId,
      rankedSolo: soloEntry
        ? {
            tier: soloEntry.tier,
            rank: soloEntry.rank,
            lp: soloEntry.leaguePoints,
            wins: soloEntry.wins,
            losses: soloEntry.losses,
          }
        : null,
      activeGame,
      matches,
      tendencies: computePlayerTendencies(matches),
    };

    riotCaches.profiles.set(cacheKey, {
      value: profile,
      expiresAt: Date.now() + PROFILE_TTL_MS,
    });
    return profile;
  };

  const promise = runSync().finally(() => {
    riotCaches.inflight.delete(cacheKey);
  });
  riotCaches.inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Interroge rapidement Riot Spectator-V5 pour détecter si le joueur est actuellement
 * dans une partie lancée (Normal, Swiftplay, Classée, ARAM).
 * Note Riot : l'Outil d'entraînement (Practice Tool) et les parties privées non-spectatables renvoient 404.
 */
export async function checkActiveRiotGame(
  gameName: string,
  tagLine: string,
  platform: RiotPlatform,
): Promise<PlayerProfileResponse['activeGame']> {
  if (!hasRiotApiKey()) {
    return { inGame: false };
  }

  const apiKey = getCleanRiotApiKey();
  const headers = { 'X-Riot-Token': apiKey };
  const regional = PLATFORM_TO_REGIONAL[platform] || 'europe';
  const platformHost = `${platform.toLowerCase()}.api.riotgames.com`;
  const regionalHost = `${regional}.api.riotgames.com`;

  const account = await fetchJson<{ puuid: string }>(
    `https://${regionalHost}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName,
    )}/${encodeURIComponent(tagLine)}`,
    headers,
  );

  const activeGameRes = await fetchJson<any>(
    `https://${platformHost}/lol/spectator/v5/active-games/by-summoner/${account.puuid}`,
    headers,
  ).catch(() => null);

  return formatSpectatorActiveGame(activeGameRes, account.puuid);
}

/**
 * Récupère et normalise une partie précise depuis Riot Match-V5 via son ID
 * (accepte un ID numérique comme "8046196983" ou complet "EUW1_8046196983").
 */
export async function fetchRiotMatchById(
  rawMatchId: string,
  gameName: string,
  tagLine: string,
  platform: RiotPlatform,
): Promise<MatchRecord> {
  if (!hasRiotApiKey()) {
    const err = new Error(
      'Clé Riot API non configurée sur le serveur. Impossible de récupérer ce Match ID en ligne.',
    ) as Error & { status?: number };
    err.status = 503;
    throw err;
  }

  const trimmed = rawMatchId.trim();
  const fullMatchId = trimmed.includes('_') ? trimmed.toUpperCase() : `${platform}_${trimmed}`;
  const prefix = fullMatchId.split('_')[0] as RiotPlatform;
  const regional = PLATFORM_TO_REGIONAL[prefix] || PLATFORM_TO_REGIONAL[platform] || 'europe';
  const regionalHost = `${regional}.api.riotgames.com`;

  const apiKey = getCleanRiotApiKey();
  const headers = { 'X-Riot-Token': apiKey };
  const cacheKey = `${platform}:${gameName.toLowerCase()}#${tagLine.toLowerCase()}`;

  let targetPuuid = riotCaches.accounts.get(cacheKey)?.value?.puuid || '';
  if (!targetPuuid && gameName) {
    const acc = await fetchRiotWithRetry<{ puuid: string; gameName: string; tagLine: string }>(
      `https://${regionalHost}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
        gameName,
      )}/${encodeURIComponent(tagLine)}`,
      headers,
    ).catch(() => null);
    if (acc?.puuid) {
      targetPuuid = acc.puuid;
      riotCaches.accounts.set(cacheKey, {
        value: acc,
        expiresAt: Date.now() + ACCOUNT_TTL_MS,
      });
    }
  }

  let matchData = riotCaches.matches.get(fullMatchId);
  if (!matchData) {
    matchData = await fetchRiotWithRetry<any>(
      `https://${regionalHost}/lol/match/v5/matches/${encodeURIComponent(fullMatchId)}`,
      headers,
    );
    riotCaches.matches.set(fullMatchId, matchData);
  }

  let timelineData = riotCaches.timelines.get(fullMatchId) || null;
  if (!timelineData) {
    timelineData = await fetchRiotWithRetry<any>(
      `https://${regionalHost}/lol/match/v5/matches/${encodeURIComponent(fullMatchId)}/timeline`,
      headers,
      1,
    ).catch(() => null);
    if (timelineData) {
      riotCaches.timelines.set(fullMatchId, timelineData);
    }
  }

  // Si PUUID absent, retrouve le participant par Riot ID / nom d'invocateur
  if (!targetPuuid && Array.isArray(matchData?.info?.participants)) {
    const found = matchData.info.participants.find(
      (p: any) =>
        String(p.riotIdGameName || p.summonerName || '').toLowerCase() === gameName.toLowerCase(),
    );
    if (found?.puuid) targetPuuid = found.puuid;
  }

  return normalizeRiotMatch(matchData, targetPuuid, timelineData, 'Riot API Match-V5');
}
