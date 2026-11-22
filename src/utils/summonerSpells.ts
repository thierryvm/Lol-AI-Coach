export interface SummonerSpellMeta {
  id: number;
  key: string;
  nameFr: string;
  shortLabel: string;
  chatCode: string;
  cooldownSec: number;
}

export const SUMMONER_SPELLS: SummonerSpellMeta[] = [
  {
    id: 4,
    key: 'SummonerFlash',
    nameFr: 'Flash',
    shortLabel: 'Flash',
    chatCode: 'F',
    cooldownSec: 300,
  },
  {
    id: 12,
    key: 'SummonerTeleport',
    nameFr: 'Téléportation',
    shortLabel: 'TP',
    chatCode: 'TP',
    cooldownSec: 360,
  },
  {
    id: 14,
    key: 'SummonerDot',
    nameFr: 'Embrasement',
    shortLabel: 'Embrasement',
    chatCode: 'Ign',
    cooldownSec: 180,
  },
  {
    id: 3,
    key: 'SummonerExhaust',
    nameFr: 'Fatigue',
    shortLabel: 'Fatigue',
    chatCode: 'Exh',
    cooldownSec: 210,
  },
  {
    id: 11,
    key: 'SummonerSmite',
    nameFr: 'Châtiment',
    shortLabel: 'Châtiment',
    chatCode: 'Smite',
    cooldownSec: 90,
  },
  {
    id: 7,
    key: 'SummonerHeal',
    nameFr: 'Soins',
    shortLabel: 'Soins',
    chatCode: 'Heal',
    cooldownSec: 240,
  },
  {
    id: 21,
    key: 'SummonerBarrier',
    nameFr: 'Barrière',
    shortLabel: 'Barrière',
    chatCode: 'Bar',
    cooldownSec: 180,
  },
  {
    id: 6,
    key: 'SummonerHaste',
    nameFr: 'Fantôme',
    shortLabel: 'Fantôme',
    chatCode: 'Ghost',
    cooldownSec: 210,
  },
  {
    id: 1,
    key: 'SummonerBoost',
    nameFr: 'Purge',
    shortLabel: 'Purge',
    chatCode: 'Cleanse',
    cooldownSec: 240,
  },
  {
    id: 32,
    key: 'SummonerSnowball',
    nameFr: 'Marque',
    shortLabel: 'Marque',
    chatCode: 'Snow',
    cooldownSec: 80,
  },
  {
    id: 13,
    key: 'SummonerMana',
    nameFr: 'Clarté',
    shortLabel: 'Clarté',
    chatCode: 'Clarity',
    cooldownSec: 240,
  },
];

export type EnemySpellToastScope = 'KEY' | 'FLASH_ONLY';

/**
 * Sorts d'invocateur considérés comme "clés" tactiquement côté adverse
 * (Flash, TP, Embrasement, Fatigue, Châtiment, Soins, Barrière, Fantôme, Purge).
 */
export const KEY_ENEMY_SUMMONER_SPELL_IDS = new Set<number>([4, 12, 14, 3, 11, 7, 21, 6, 1]);

export function isKeyEnemySummonerSpell(
  spellId: number,
  scope: EnemySpellToastScope = 'KEY',
): boolean {
  if (scope === 'FLASH_ONLY') {
    return spellId === 4;
  }
  return KEY_ENEMY_SUMMONER_SPELL_IDS.has(spellId);
}

const BY_ID = new Map<number, SummonerSpellMeta>(SUMMONER_SPELLS.map((s) => [s.id, s]));

const TEXT_ALIASES: Array<[RegExp, number]> = [
  [/summonerflash|flash|saut eclair/, 4],
  [/summonerteleport|teleport|unleashed teleport|\btp\b/, 12],
  [/summonerdot|ignite|embrasement/, 14],
  [/summonerexhaust|exhaust|fatigue/, 3],
  [/summonersmite|smite|chatiment/, 11],
  [/summonerheal|\bheal\b|\bsoins?\b/, 7],
  [/summonerbarrier|barrier|barriere/, 21],
  [/summonerhaste|ghost|fantome/, 6],
  [/summonerboost|cleanse|purge/, 1],
  [/summonersnowball|snowball|mark|marque/, 32],
  [/summonermana|clarity|clarte/, 13],
];

function normalizeRaw(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function getSummonerSpellById(id?: number | null): SummonerSpellMeta {
  if (id && BY_ID.has(id)) {
    return BY_ID.get(id)!;
  }
  return BY_ID.get(4)!;
}

export function resolveSummonerSpell(idOrRawName?: number | string | null): SummonerSpellMeta | null {
  if (typeof idOrRawName === 'number') {
    return BY_ID.get(idOrRawName) || null;
  }
  if (typeof idOrRawName === 'string') {
    const trimmed = idOrRawName.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      return BY_ID.get(Number(trimmed)) || null;
    }
    const norm = normalizeRaw(trimmed);
    for (const [pattern, spellId] of TEXT_ALIASES) {
      if (pattern.test(norm)) {
        return BY_ID.get(spellId) || null;
      }
    }
  }
  return null;
}

export function getSummonerSpellIconUrl(
  idOrRawName: number | string | undefined | null,
  patchVersion: string,
): string | undefined {
  const spell = resolveSummonerSpell(idOrRawName);
  if (!spell || !patchVersion) return undefined;
  return `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/spell/${spell.key}.png`;
}

export function inferDefaultEnemySpells(position?: string): [number, number] {
  const pos = (position || '').toUpperCase();
  if (pos.includes('JUNGLE')) return [4, 11];
  if (pos.includes('TOP')) return [4, 12];
  if (pos.includes('MID')) return [4, 14];
  if (pos.includes('BOT') || pos.includes('ADC')) return [4, 21];
  if (pos.includes('UTIL') || pos.includes('SUP')) return [4, 3];
  return [4, 14];
}

/**
 * Calcule le délai effectif d'un sort d'invocateur à partir des données Riot API :
 * - Bottes de lucidité (objet 3158 : +10 Hâte de sort d'invocateur)
 * - Savoir cosmique (rune 8347 : +18 Hâte de sort d'invocateur)
 * - Mode ARAM (+70 Hâte de sort d'invocateur)
 */
export function computeEffectiveSpellCooldown(
  baseCooldownSec: number,
  itemIds: number[],
  options?: {
    hasCosmicInsight?: boolean;
    isAram?: boolean;
  },
): {
  cooldownSec: number;
  hasLucidityBoots: boolean;
  hasCosmicInsight: boolean;
  isAram: boolean;
  totalHaste: number;
} {
  const hasLucidityBoots = itemIds.includes(3158);
  const hasCosmicInsight = Boolean(options?.hasCosmicInsight);
  const isAram = Boolean(options?.isAram);
  const totalHaste =
    (hasLucidityBoots ? 10 : 0) + (hasCosmicInsight ? 18 : 0) + (isAram ? 70 : 0);

  return {
    cooldownSec: totalHaste > 0 ? Math.round(baseCooldownSec / (1 + totalHaste / 100)) : baseCooldownSec,
    hasLucidityBoots,
    hasCosmicInsight,
    isAram,
    totalHaste,
  };
}

export interface EnemySpellVoiceTarget {
  championId: string;
  displayName: string;
  spell1Id: number;
  spell2Id: number;
}

/**
 * Détecte dans une phrase micro un sort ennemi précis à déclencher
 * (ex: "Aatrox plus de flash", "TP Zed", "Embrasement Leona").
 */
export function detectEnemySpellVoiceTrigger(
  transcript: string,
  enemies: EnemySpellVoiceTarget[],
): { enemy: EnemySpellVoiceTarget; spell: SummonerSpellMeta } | null {
  const norm = normalizeRaw(transcript);
  if (!norm) return null;

  let detectedSpell: SummonerSpellMeta | null = null;
  if (/\b(flash|flache|saut)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(4);
  } else if (/\b(tp|teleport|teleportation)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(12);
  } else if (/\b(ignite|embrasement)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(14);
  } else if (/\b(exhaust|fatigue)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(3);
  } else if (/\b(smite|chatiment)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(11);
  } else if (/\b(heal|soins?)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(7);
  } else if (/\b(barrier|barriere)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(21);
  } else if (/\b(ghost|fantome)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(6);
  } else if (/\b(cleanse|purge)\b/.test(norm)) {
    detectedSpell = getSummonerSpellById(1);
  }

  if (!detectedSpell) return null;

  for (const enemy of enemies) {
    const candidates = [
      normalizeRaw(enemy.displayName),
      normalizeRaw(enemy.championId),
      normalizeRaw(enemy.displayName.replace(/['’.]/g, '')),
    ].filter(Boolean);

    if (candidates.some((name) => name.length >= 3 && norm.includes(name))) {
      return { enemy, spell: detectedSpell };
    }
  }

  return null;
}

export type SelfVoiceTriggerResult =
  | { kind: 'ABILITY'; abilityKey: 'Q' | 'W' | 'E' | 'R' }
  | { kind: 'SUMMONER'; spell: SummonerSpellMeta };

/**
 * Détecte dans une phrase micro une compétence (A/Z/E/R) ou un sort d'invocateur du joueur lui-même
 * (ex: "mon flash", "ma tp", "mon ultime", "mon R", "mon A").
 */
export function detectSelfAbilityOrSpellVoiceTrigger(
  transcript: string,
): SelfVoiceTriggerResult | null {
  const norm = normalizeRaw(transcript);
  if (!norm) return null;

  const isSelfContext = /\b(mon|ma|mes|j ai|jai|utilise|lance|claque)\b/.test(norm);
  if (!isSelfContext) return null;

  if (/\b(ultime|ulti|ult|r)\b/.test(norm)) {
    return { kind: 'ABILITY', abilityKey: 'R' };
  }
  if (/\b(mon a|mon q|sort a|sort q)\b/.test(norm)) {
    return { kind: 'ABILITY', abilityKey: 'Q' };
  }
  if (/\b(mon z|mon w|sort z|sort w)\b/.test(norm)) {
    return { kind: 'ABILITY', abilityKey: 'W' };
  }
  if (/\b(mon e|sort e)\b/.test(norm)) {
    return { kind: 'ABILITY', abilityKey: 'E' };
  }

  if (/\b(flash|flache|saut)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(4) };
  }
  if (/\b(tp|teleport|teleportation)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(12) };
  }
  if (/\b(ignite|embrasement)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(14) };
  }
  if (/\b(exhaust|fatigue)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(3) };
  }
  if (/\b(smite|chatiment)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(11) };
  }
  if (/\b(heal|soins?)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(7) };
  }
  if (/\b(barrier|barriere)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(21) };
  }
  if (/\b(ghost|fantome)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(6) };
  }
  if (/\b(cleanse|purge)\b/.test(norm)) {
    return { kind: 'SUMMONER', spell: getSummonerSpellById(1) };
  }

  return null;
}
