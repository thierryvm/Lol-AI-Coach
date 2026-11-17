import { getDDragonBootstrap } from './riotService.ts';
import type { DDragonBootstrap, ItemData } from '../src/engines/types.ts';

export interface OpggGroundedBuildItem {
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

export interface OpggBuildSearchResult {
  summary: string;
  builds: OpggGroundedBuildItem[];
  groundingSources: Array<{ title: string; uri: string }>;
}

const OPGG_ROLE_MAP: Record<string, string> = {
  TOP: 'top',
  JUNGLE: 'jungle',
  MID: 'mid',
  MIDDLE: 'mid',
  ADC: 'adc',
  BOTTOM: 'adc',
  SUPPORT: 'support',
  UTILITY: 'support',
};

const ROLE_DISPLAY_FR: Record<string, string> = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  adc: 'ADC',
  support: 'Support',
};

const STARTER_ITEM_IDS = new Set([
  '1054', '1055', '1056', '1082', '1083', '1101', '1102', '1103',
  '2003', '2031', '2033', '2051', '2055', '3340', '3363', '3364', '3865', '3866', '3867',
]);

const SUPPORT_QUEST_IDS = new Set(['3869', '3870', '3871', '3876', '3877']);

const BOOT_ITEM_IDS = new Set([
  '1001', '3006', '3009', '3010', '3013', '3020', '3047', '3111', '3117', '3158',
]);

let cachedRecipeVersion: string | null = null;
let cachedSpecialRecipeMap = new Map<string, string>();

async function getSpecialRecipeFallbackMap(version: string): Promise<Map<string, string>> {
  if (cachedRecipeVersion === version && cachedSpecialRecipeMap.size > 0) {
    return cachedSpecialRecipeMap;
  }
  const map = new Map<string, string>([
    ['2530', '2526'], // Diadème musical -> Diadème des murmures
    ['3040', '3003'], // Étreinte du séraphin -> Bâton de l'archange
    ['3042', '3004'], // Muramana -> Manamune
    ['3121', '3119'], // Approche de l'hiver -> Fimbulvetr
  ]);
  try {
    const res = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/item.json`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (res.ok) {
      const json = (await res.json()) as { data?: Record<string, { specialRecipe?: number }> };
      for (const [id, entry] of Object.entries(json.data || {})) {
        if (entry?.specialRecipe) {
          map.set(id, String(entry.specialRecipe));
        }
      }
    }
  } catch {
    // conserver les mappings connus en cas d'indisponibilité réseau
  }
  cachedRecipeVersion = version;
  cachedSpecialRecipeMap = map;
  return map;
}

interface ParsedOpggRow {
  itemIds: string[];
  pickRatePct: string | null;
  winRatePct: string | null;
  gamesCount: number;
  gamesRaw: string | null;
}

function toOpggChampionSlug(championId: string, championName: string): string {
  const base = (championId || championName || '').trim().toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]/g, '');
  if (cleaned === 'wukong') return 'monkeyking';
  return cleaned;
}

function parseGamesCount(raw?: string | null): number {
  if (!raw) return 0;
  const num = Number(raw.replace(/[^\d]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function scoreFocusMatch(itemIds: string[], itemById: Map<string, ItemData>, focusLower: string): number {
  if (!focusLower) return 0;
  let score = 0;
  const wantsTank = /tank|survie|armure|résistance|pv|def/i.test(focusLower);
  const wantsDamage = /dégât|degat|ap|burst|snowball|on-hit|létal|crit|offens/i.test(focusLower);

  for (const id of itemIds) {
    const it = itemById.get(id);
    if (!it) continue;
    const tags = new Set(it.tags || []);
    if (wantsTank) {
      if (tags.has('Health') || tags.has('Armor') || tags.has('SpellBlock')) score += 2;
      if (tags.has('SpellDamage') || tags.has('CriticalStrike')) score -= 1;
    }
    if (wantsDamage) {
      if (
        tags.has('SpellDamage') ||
        tags.has('Damage') ||
        tags.has('CriticalStrike') ||
        tags.has('AttackSpeed')
      ) {
        score += 2;
      }
      if (tags.has('Armor') || tags.has('SpellBlock')) score -= 1;
    }
  }
  return score;
}

function resolveRunesFromHtml(html: string, dd: DDragonBootstrap): {
  keystoneName: string;
  secondaryTreeName: string;
} {
  const perkMap = new Map<number, { name: string; treeName: string }>();
  const treeMap = new Map<number, string>();
  for (const tree of dd.runeTrees) {
    treeMap.set(tree.id, tree.name);
    for (const slot of tree.slots) {
      for (const r of slot.runes) {
        perkMap.set(r.id, { name: r.name, treeName: tree.name });
      }
    }
  }

  let keystoneName = '';
  const activeTrees: string[] = [];

  const perkImgs = html.matchAll(/<img[^>]+src="[^"]*\/perk\/(\d+)\.png[^"]*"[^>]*>/gi);
  for (const match of perkImgs) {
    const tag = match[0];
    const perkId = Number(match[1]);
    const isDimmed = /opacity-50|grayscale/i.test(tag);
    if (isDimmed) continue;
    const info = perkMap.get(perkId);
    if (!info) continue;
    if (!keystoneName) {
      keystoneName = info.name;
    }
    if (!activeTrees.includes(info.treeName)) {
      activeTrees.push(info.treeName);
    }
    if (activeTrees.length >= 2 && keystoneName) break;
  }

  // Fallback sur les icônes d'arbres /perkStyle/{id}.png si 1 seul arbre détecté
  if (activeTrees.length < 2) {
    const styleImgs = html.matchAll(/<img[^>]+src="[^"]*\/perkStyle\/(\d+)\.png[^"]*"[^>]*>/gi);
    for (const match of styleImgs) {
      const styleId = Number(match[1]);
      const tName = treeMap.get(styleId);
      if (tName && !activeTrees.includes(tName)) {
        activeTrees.push(tName);
      }
      if (activeTrees.length >= 2) break;
    }
  }

  return {
    keystoneName,
    secondaryTreeName: activeTrees[1] || '',
  };
}

export async function fetchOpggLiveBuilds(params: {
  championName: string;
  championId: string;
  role: string;
  gameMode: string;
  patchVersion: string;
  focusHint?: string;
}): Promise<OpggBuildSearchResult | null> {
  const dd = await getDDragonBootstrap();
  const itemById = new Map<string, ItemData>();
  for (const item of dd.items) {
    itemById.set(String(item.id), item);
  }
  const recipeMap = await getSpecialRecipeFallbackMap(dd.version);
  const normalizeItemId = (id: string): string => {
    if (itemById.has(id)) return id;
    const base = recipeMap.get(id);
    if (base && itemById.has(base)) return base;
    return id;
  };

  const slug = toOpggChampionSlug(params.championId, params.championName);
  if (!slug) return null;

  const isAram = params.gameMode === 'ARAM';
  const opggRole = OPGG_ROLE_MAP[(params.role || 'SUPPORT').toUpperCase()] || 'support';
  const targetUrl = isAram
    ? `https://op.gg/lol/modes/aram/${slug}/build`
    : `https://op.gg/lol/champions/${slug}/build/${opggRole}`;

  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) return null;
  const html = await response.text();
  if (!html || html.length < 20_000) return null;

  // Vérifier si OP.GG n'a pas redirigé vers la liste générale (/lol/champions)
  const finalUrl = response.url || targetUrl;
  if (!finalUrl.includes(slug)) return null;

  const rows: ParsedOpggRow[] = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const rowHtml = match[1];
    const itemIds = [...rowHtml.matchAll(/\/item\/(\d+)\.png/g)].map((m) => m[1]);
    if (itemIds.length === 0) continue;

    const pcts = [...rowHtml.matchAll(/(\d+\.\d+%)/g)].map((m) => m[1]);
    const gamesRaw = rowHtml.match(/([\d,]+)(?:<!--\s*-->|\s)*Games/i)?.[1] || null;
    const gamesCount = parseGamesCount(gamesRaw);

    let pickRatePct: string | null = null;
    let winRatePct: string | null = null;
    if (pcts.length >= 2) {
      pickRatePct = pcts[0];
      winRatePct = pcts[1];
    } else if (pcts.length === 1) {
      winRatePct = pcts[0];
    }

    rows.push({
      itemIds,
      pickRatePct,
      winRatePct,
      gamesCount,
      gamesRaw,
    });
  }

  if (rows.length === 0) return null;

  const isBoot = (id: string) => {
    const it = itemById.get(id);
    return BOOT_ITEM_IDS.has(id) || Boolean(it?.tags?.includes('Boots'));
  };

  // Bottes les plus jouées
  const bootRows = rows.filter(
    (r) => r.itemIds.length === 1 && isBoot(r.itemIds[0]) && r.itemIds[0] !== '1001',
  );

  // Quête Support la plus jouée (si support hors ARAM)
  const supportQuestRows = !isAram
    ? rows.filter((r) => r.itemIds.length === 1 && SUPPORT_QUEST_IDS.has(r.itemIds[0]))
    : [];

  // Core builds (2 à 5 objets non-starters)
  const coreRows = rows.filter((r) => {
    if (r.itemIds.length < 2) return false;
    const nonStarter = r.itemIds.filter((id) => !STARTER_ITEM_IDS.has(id) && !isBoot(id));
    return nonStarter.length >= 2;
  });

  // Objets situationnels / fin de build (1 objet >= 2000 po)
  const lateSingleRows = rows.filter((r) => {
    if (r.itemIds.length !== 1) return false;
    const id = r.itemIds[0];
    if (STARTER_ITEM_IDS.has(id) || isBoot(id) || SUPPORT_QUEST_IDS.has(id)) return false;
    const it = itemById.get(id);
    return !it || (it.gold?.total || 0) >= 1800;
  });

  if (coreRows.length === 0 && lateSingleRows.length === 0) {
    return null;
  }

  const focusLower = (params.focusHint || '').trim().toLowerCase();
  const rankedCore = [...coreRows].sort((a, b) => {
    const fDiff =
      scoreFocusMatch(b.itemIds, itemById, focusLower) -
      scoreFocusMatch(a.itemIds, itemById, focusLower);
    if (fDiff !== 0) return fDiff;
    return b.gamesCount - a.gamesCount;
  });

  const rankedBestWinrate = [...coreRows]
    .filter((r) => r.gamesCount >= 50 || coreRows.length <= 2)
    .sort((a, b) => {
      const wrA = Number((a.winRatePct || '0').replace('%', ''));
      const wrB = Number((b.winRatePct || '0').replace('%', ''));
      return wrB - wrA || b.gamesCount - a.gamesCount;
    });

  const selectedCoreBuilds: Array<{ row: ParsedOpggRow; title: string; bootIndex: number }> = [];
  if (rankedCore[0]) {
    selectedCoreBuilds.push({
      row: rankedCore[0],
      title: focusLower
        ? `Build OP.GG orienté « ${params.focusHint?.trim()} »`
        : 'Build cœur le plus joué',
      bootIndex: 0,
    });
  }

  const bestWrCandidate = rankedBestWinrate.find(
    (r) => r.itemIds.join(',') !== rankedCore[0]?.itemIds.join(','),
  );
  if (bestWrCandidate) {
    selectedCoreBuilds.push({
      row: bestWrCandidate,
      title: 'Variante meilleur taux de victoire',
      bootIndex: bootRows.length > 1 ? 1 : 0,
    });
  }

  const thirdCandidate = rankedCore.find(
    (r) => !selectedCoreBuilds.some((s) => s.row.itemIds.join(',') === r.itemIds.join(',')),
  );
  if (thirdCandidate && selectedCoreBuilds.length < 3) {
    selectedCoreBuilds.push({
      row: thirdCandidate,
      title: 'Option méta alternative',
      bootIndex: 0,
    });
  }

  const { keystoneName, secondaryTreeName } = resolveRunesFromHtml(html, dd);
  const topSupportQuestId = supportQuestRows[0]?.itemIds[0];
  const topSituationalIds = Array.from(new Set(lateSingleRows.map((r) => r.itemIds[0])));

  const resolveItemName = (id: string): string => itemById.get(id)?.name || id;

  const builds: OpggGroundedBuildItem[] = selectedCoreBuilds.map((entry, idx) => {
    const bootRow = bootRows[entry.bootIndex] || bootRows[0];
    const bootsName = bootRow ? resolveItemName(bootRow.itemIds[0]) : '';

    const coreIdsFiltered = entry.row.itemIds
      .map(normalizeItemId)
      .filter((id) => !isBoot(id) && id !== '2003' && id !== '2031' && itemById.has(id));
    const mergedIds: string[] = [];
    if (topSupportQuestId && opggRole === 'support' && !isAram && itemById.has(normalizeItemId(topSupportQuestId))) {
      mergedIds.push(normalizeItemId(topSupportQuestId));
    }
    for (const id of coreIdsFiltered) {
      if (!mergedIds.includes(id)) mergedIds.push(id);
    }
    for (const rawSitId of topSituationalIds) {
      const sitId = normalizeItemId(rawSitId);
      if (mergedIds.length >= 5) break;
      if (itemById.has(sitId) && !mergedIds.includes(sitId)) mergedIds.push(sitId);
    }

    const itemNames = mergedIds.slice(0, 5).map(resolveItemName);
    const wr = entry.row.winRatePct ? `${entry.row.winRatePct} WR` : 'Winrate méta';
    const pr = entry.row.pickRatePct
      ? `${entry.row.pickRatePct} pick${entry.row.gamesRaw ? ` (${entry.row.gamesRaw} parties)` : ''}`
      : entry.row.gamesRaw
        ? `${entry.row.gamesRaw} parties`
        : 'Build populaire';

    const roleDisplay = isAram ? 'ARAM' : ROLE_DISPLAY_FR[opggRole] || params.role;
    const rationale =
      idx === 0
        ? `Séquence la plus fiable observée en direct sur OP.GG pour ${params.championName} (${roleDisplay}), complétée par les meilleurs objets de fin de partie.`
        : `Variante performante issue des statistiques OP.GG (${wr}) offrant une alternative selon la composition adverse.`;

    return {
      sourceSite: 'OP.GG Live',
      buildTitle: entry.title,
      winRateNote: wr,
      pickRateNote: pr,
      bootsName,
      itemNames,
      keystoneName: keystoneName || 'Rune méta OP.GG',
      secondaryTreeName,
      rationale,
    };
  });

  if (builds.length === 0) return null;

  const topBuild = builds[0];
  const roleText = isAram ? 'ARAM' : ROLE_DISPLAY_FR[opggRole] || params.role;
  const summary = `Tendances en direct d’OP.GG pour ${params.championName} (${roleText}, patch ${dd.version}) : le cœur ${topBuild.itemNames
    .slice(0, 3)
    .join(' + ')} affiche ${topBuild.winRateNote} (${topBuild.pickRateNote})${
    topBuild.bootsName ? ` avec ${topBuild.bootsName}` : ''
  }.`;

  return {
    summary,
    builds,
    groundingSources: [
      {
        title: `OP.GG · ${params.championName} (${roleText})`,
        uri: finalUrl,
      },
    ],
  };
}
