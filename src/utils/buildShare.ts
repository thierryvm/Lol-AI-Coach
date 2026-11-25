import { buildDefaultSelectionForTrees, type RunePageSelection } from '../engines/runeEngine.ts';
import type { DDragonBootstrap, GameModeContext, Role } from '../engines/types.ts';

export interface SharedBuildPayload {
  championId: string;
  role: Role;
  gameMode: GameModeContext;
  level: number;
  duoPartnerId: string | null;
  itemIds: (string | null)[];
  runeSelection: RunePageSelection;
  heartsteelStacksHp: number;
}

interface SharedBuildWireV1 {
  v: 1;
  c: string;
  r?: Role;
  m?: GameModeContext;
  l?: number;
  d?: string | null;
  i?: (string | null)[];
  ru?: {
    p: number;
    s: number;
    k: number;
    pm: number[];
    sm: number[];
    sh?: [number, number, number];
  };
  hs?: number;
}

const VALID_ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const VALID_GAME_MODES: GameModeContext[] = ['CLASSIC', 'SWIFTPLAY', 'ARAM'];

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function hasSharedBuildInSearch(search: string): boolean {
  try {
    const params = new URLSearchParams(search);
    const encoded = params.get('b') || params.get('build');
    const tab = params.get('tab');
    return Boolean((encoded && encoded.trim().length > 0) || tab === 'builds');
  } catch {
    return false;
  }
}

export function encodeSharedBuildPayload(payload: SharedBuildPayload): string {
  const wire: SharedBuildWireV1 = {
    v: 1,
    c: payload.championId,
    r: payload.role,
    m: payload.gameMode,
    l: Math.max(1, Math.min(18, Math.round(payload.level))),
    d: payload.duoPartnerId || null,
    i: Array.from({ length: 6 }, (_, idx) => payload.itemIds[idx] || null),
    ru: {
      p: payload.runeSelection.primaryTreeId,
      s: payload.runeSelection.secondaryTreeId,
      k: payload.runeSelection.keystoneId,
      pm: payload.runeSelection.primaryMinorIds.slice(0, 3),
      sm: payload.runeSelection.secondaryMinorIds.slice(0, 2),
      sh: payload.runeSelection.shardIndices,
    },
    hs: Math.max(0, Math.round(payload.heartsteelStacksHp || 0)),
  };
  return toBase64Url(JSON.stringify(wire));
}

export function encodeSharedBuildUrl(payload: SharedBuildPayload, currentHref?: string): string {
  const encoded = encodeSharedBuildPayload(payload);
  const baseHref =
    currentHref || (typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000/');
  const url = new URL(baseHref);
  url.searchParams.set('tab', 'builds');
  url.searchParams.set('b', encoded);
  url.searchParams.delete('build');
  return url.toString();
}

export function decodeSharedBuildFromUrl(
  search: string,
  ddragon: DDragonBootstrap,
): SharedBuildPayload | null {
  try {
    const params = new URLSearchParams(search);
    const rawParam = (params.get('b') || params.get('build') || '').trim();
    if (!rawParam) return null;

    const jsonText = fromBase64Url(rawParam);
    const parsed = JSON.parse(jsonText) as Partial<SharedBuildWireV1>;
    if (!parsed || parsed.v !== 1 || typeof parsed.c !== 'string') {
      return null;
    }

    const champion = ddragon.champions.find(
      (c) =>
        c.id.toLowerCase() === parsed.c!.toLowerCase() ||
        c.name.toLowerCase() === parsed.c!.toLowerCase(),
    );
    if (!champion) return null;

    const role: Role =
      parsed.r && VALID_ROLES.includes(parsed.r) ? parsed.r : 'SUPPORT';
    const gameMode: GameModeContext =
      parsed.m && VALID_GAME_MODES.includes(parsed.m) ? parsed.m : 'CLASSIC';
    const level =
      typeof parsed.l === 'number' && Number.isFinite(parsed.l)
        ? Math.max(1, Math.min(18, Math.round(parsed.l)))
        : 11;

    const duoPartner =
      typeof parsed.d === 'string' && parsed.d.trim().length > 0
        ? ddragon.champions.find(
            (c) =>
              c.id.toLowerCase() === parsed.d!.toLowerCase() ||
              c.name.toLowerCase() === parsed.d!.toLowerCase(),
          ) || null
        : null;

    const validItemIds = new Set(ddragon.items.map((it) => it.id));
    const rawItems = Array.isArray(parsed.i) ? parsed.i : [];
    const itemIds: (string | null)[] = Array.from({ length: 6 }, (_, idx) => {
      const candidate = rawItems[idx];
      if (typeof candidate === 'string' && validItemIds.has(candidate)) {
        return candidate;
      }
      return null;
    });

    const runeTrees = ddragon.runeTrees;
    const primaryTree =
      runeTrees.find((t) => t.id === parsed.ru?.p) || runeTrees[0];
    const secondaryTree =
      runeTrees.find((t) => t.id === parsed.ru?.s && t.id !== primaryTree?.id) ||
      runeTrees.find((t) => t.id !== primaryTree?.id) ||
      primaryTree;

    const fallbackRunes = buildDefaultSelectionForTrees(
      runeTrees,
      primaryTree?.id || 8000,
      secondaryTree?.id || 8400,
    );

    let runeSelection = fallbackRunes;
    if (primaryTree && secondaryTree && parsed.ru) {
      const keystoneValid = primaryTree.slots[0]?.runes.some((r) => r.id === parsed.ru!.k);
      const keystoneId = keystoneValid
        ? parsed.ru.k
        : fallbackRunes.keystoneId;

      const primaryMinorIds = [0, 1, 2].map((minorIdx) => {
        const slotRunes = primaryTree.slots[minorIdx + 1]?.runes || [];
        const cand = Array.isArray(parsed.ru?.pm) ? parsed.ru!.pm[minorIdx] : undefined;
        if (typeof cand === 'number' && slotRunes.some((r) => r.id === cand)) {
          return cand;
        }
        return fallbackRunes.primaryMinorIds[minorIdx] || slotRunes[0]?.id || 0;
      });

      const validSecondaryCandidates: Array<{ id: number; slotIdx: number }> = [];
      const rawSec = Array.isArray(parsed.ru.sm) ? parsed.ru.sm : [];
      for (const cand of rawSec) {
        if (typeof cand !== 'number') continue;
        for (let slotIdx = 1; slotIdx <= 3; slotIdx += 1) {
          const exists = secondaryTree.slots[slotIdx]?.runes.some((r) => r.id === cand);
          if (exists && !validSecondaryCandidates.some((x) => x.slotIdx === slotIdx)) {
            validSecondaryCandidates.push({ id: cand, slotIdx });
            break;
          }
        }
        if (validSecondaryCandidates.length >= 2) break;
      }

      const secondaryMinorIds =
        validSecondaryCandidates.length === 2
          ? validSecondaryCandidates.map((x) => x.id)
          : fallbackRunes.secondaryMinorIds;

      const rawShards = Array.isArray(parsed.ru.sh) ? parsed.ru.sh : [0, 0, 0];
      const shardIndices: [number, number, number] = [0, 1, 2].map((idx) => {
        const val = rawShards[idx];
        return typeof val === 'number' && val >= 0 && val <= 2 ? Math.round(val) : 0;
      }) as [number, number, number];

      runeSelection = {
        primaryTreeId: primaryTree.id,
        secondaryTreeId: secondaryTree.id,
        keystoneId,
        primaryMinorIds,
        secondaryMinorIds,
        shardIndices,
      };
    }

    const heartsteelStacksHp =
      typeof parsed.hs === 'number' && Number.isFinite(parsed.hs)
        ? Math.max(0, Math.min(3000, Math.round(parsed.hs)))
        : 300;

    return {
      championId: champion.id,
      role,
      gameMode,
      level,
      duoPartnerId: duoPartner ? duoPartner.id : null,
      itemIds,
      runeSelection,
      heartsteelStacksHp,
    };
  } catch {
    return null;
  }
}
