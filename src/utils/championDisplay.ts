import type { ChampionSummary } from '../engines/types.ts';

function normalizeChampionToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const SPECIAL_DISPLAY_FALLBACKS: Record<string, string> = {
  aurelionsol: 'Aurelion Sol',
  belveth: "Bel'Veth",
  chogath: "Cho'Gath",
  drmundo: 'Dr. Mundo',
  fiddlesticks: 'Fiddlesticks',
  jarvaniv: 'Jarvan IV',
  kaisa: "Kai'Sa",
  khazix: "Kha'Zix",
  kogmaw: "Kog'Maw",
  ksante: "K'Sante",
  leesin: 'Lee Sin',
  masteryi: 'Maître Yi',
  missfortune: 'Miss Fortune',
  monkeyking: 'Wukong',
  nunu: 'Nunu et Willump',
  reksai: "Rek'Sai",
  renata: 'Renata Glasc',
  tahmkench: 'Tahm Kench',
  twistedfate: 'Twisted Fate',
  velkoz: "Vel'Koz",
  wukong: 'Wukong',
  xinzhao: 'Xin Zhao',
};

export interface ResolvedChampionDisplay {
  champion: ChampionSummary | null;
  id: string;
  displayName: string;
  imageUrl?: string;
}

export function findChampionSummary(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): ChampionSummary | null {
  if (rawNameOrId === undefined || rawNameOrId === null) return null;

  if (typeof rawNameOrId === 'number' || /^\d+$/.test(String(rawNameOrId).trim())) {
    const numStr = String(rawNameOrId).trim();
    const byKey = champions.find((c) => c.key === numStr);
    if (byKey) return byKey;
  }

  const rawStr = String(rawNameOrId).trim();
  if (!rawStr) return null;

  const low = rawStr.toLowerCase();
  const exact = champions.find(
    (c) => c.id.toLowerCase() === low || c.name.toLowerCase() === low,
  );
  if (exact) return exact;

  const token = normalizeChampionToken(rawStr);
  if (!token) return null;

  if (token === 'wukong') {
    const monkey = champions.find((c) => c.id.toLowerCase() === 'monkeyking');
    if (monkey) return monkey;
  }
  if (token === 'nunuwillump' || token === 'nunuetwillump') {
    const nunu = champions.find((c) => c.id.toLowerCase() === 'nunu');
    if (nunu) return nunu;
  }

  return (
    champions.find(
      (c) =>
        normalizeChampionToken(c.id) === token ||
        normalizeChampionToken(c.name) === token,
    ) || null
  );
}

export function resolveChampionDisplay(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): ResolvedChampionDisplay {
  const rawStr = rawNameOrId !== undefined && rawNameOrId !== null ? String(rawNameOrId).trim() : '';
  const champion = findChampionSummary(champions, rawNameOrId);
  if (champion) {
    return {
      champion,
      id: champion.id,
      displayName: champion.name,
      imageUrl: champion.imageUrl,
    };
  }

  const token = normalizeChampionToken(rawStr);
  const prettyFallback =
    SPECIAL_DISPLAY_FALLBACKS[token] ||
    (rawStr ? rawStr : 'Champion');

  return {
    champion: null,
    id: rawStr || 'Champion',
    displayName: prettyFallback,
    imageUrl: undefined,
  };
}

export function formatChampionDisplayName(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): string {
  return resolveChampionDisplay(champions, rawNameOrId).displayName;
}

export function getChampionIconUrl(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): string | undefined {
  return resolveChampionDisplay(champions, rawNameOrId).imageUrl;
}
