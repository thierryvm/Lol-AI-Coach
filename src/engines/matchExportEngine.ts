import { analyzePostGameMatch } from './postGameEngine.ts';
import type { ItemData, MatchRecord } from './types.ts';

export interface ExportedMatchStatRow {
  rank: number;
  matchId: string;
  playedAtIso: string;
  playedAtLocal: string;
  gameMode: string;
  queueId: number;
  patchVersion: string;
  durationMin: number;
  champion: string;
  role: string;
  laneOpponent: string;
  result: 'Victoire' | 'Défaite';
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kdaRatio: number;
  cs: number;
  csPerMin: number;
  csAt10: number;
  csAt15: number;
  goldEarned: number;
  goldPerMin: number;
  goldDiffAt15: number;
  totalDamageToChampions: number;
  damagePerMin: number;
  totalDamageTaken: number;
  visionScore: number;
  visionPerMin: number;
  wardsPlaced: number;
  wardsKilled: number;
  killParticipationPct: number;
  isolatedDeaths: number;
  preObjectiveDeaths: number;
  overextendedDeaths: number;
  items: string[];
  detectedMistakesCount: number;
  topMistake: string;
  source: string;
}

export interface MatchExportJsonPayload {
  schema: string;
  exportedAt: string;
  riotId: string;
  matchesCount: number;
  summary: {
    wins: number;
    losses: number;
    winRatePct: number;
    avgKda: number;
    avgCsPerMin: number;
    avgGoldPerMin: number;
    avgVisionScore: number;
    avgVisionPerMin: number;
    totalIsolatedDeaths: number;
    totalPreObjectiveDeaths: number;
  };
  matches: ExportedMatchStatRow[];
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n;]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildMatchExportRows(
  matches: MatchRecord[],
  items: ItemData[] = [],
  limit = 10,
): ExportedMatchStatRow[] {
  const itemNameMap = new Map<number, string>();
  for (const item of items) {
    itemNameMap.set(Number(item.id), item.name);
  }

  const recentMatches = [...matches]
    .sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0))
    .slice(0, Math.max(1, limit));

  return recentMatches.map((m, idx) => {
    const p = m.player;
    const analysis = analyzePostGameMatch(m);
    const durMin = Math.max(1, Number((m.gameDurationSec / 60).toFixed(1)));
    const kdaRatio = Number(((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2));
    const goldPerMin = Math.round((p.goldEarned || 0) / durMin);
    const damagePerMin = Math.round((p.totalDamageDealtToChampions || 0) / durMin);
    const playedDate = m.gameCreation ? new Date(m.gameCreation) : null;

    const itemLabels = (p.items || [])
      .filter((id) => id > 0)
      .map((id) => itemNameMap.get(id) || `Item #${id}`);

    return {
      rank: idx + 1,
      matchId: m.matchId,
      playedAtIso: playedDate ? playedDate.toISOString() : '',
      playedAtLocal: playedDate
        ? playedDate.toLocaleString('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
      gameMode: m.gameMode || 'CLASSIC',
      queueId: m.queueId,
      patchVersion: m.gameVersion,
      durationMin: Math.round(m.gameDurationSec / 60),
      champion: p.championName,
      role: p.teamPosition && p.teamPosition !== 'UNKNOWN' ? p.teamPosition : 'Libre',
      laneOpponent: m.laneOpponent?.championName || '-',
      result: p.win ? 'Victoire' : 'Défaite',
      win: Boolean(p.win),
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      kdaRatio,
      cs: p.cs,
      csPerMin: Number(p.csPerMin.toFixed(2)),
      csAt10: analysis.csAt10,
      csAt15: analysis.csAt15,
      goldEarned: p.goldEarned,
      goldPerMin,
      goldDiffAt15: analysis.goldDiffAt15,
      totalDamageToChampions: p.totalDamageDealtToChampions,
      damagePerMin,
      totalDamageTaken: p.totalDamageTaken,
      visionScore: p.visionScore,
      visionPerMin: analysis.visionPerMin,
      wardsPlaced: p.wardsPlaced,
      wardsKilled: p.wardsKilled,
      killParticipationPct: analysis.killParticipation,
      isolatedDeaths: analysis.isolatedDeaths,
      preObjectiveDeaths: analysis.preObjectiveDeaths,
      overextendedDeaths: analysis.overextendedDeaths,
      items: itemLabels,
      detectedMistakesCount: analysis.detectedMistakes.length,
      topMistake: analysis.detectedMistakes[0]?.title || 'Aucune erreur majeure',
      source: m.source,
    };
  });
}

export function buildMatchExportJson(
  matches: MatchRecord[],
  options?: { riotId?: string; items?: ItemData[]; limit?: number },
): string {
  const rows = buildMatchExportRows(matches, options?.items || [], options?.limit ?? 10);
  const count = rows.length || 1;
  const wins = rows.filter((r) => r.win).length;

  const payload: MatchExportJsonPayload = {
    schema: 'lol-ai-coach-export-v1',
    exportedAt: new Date().toISOString(),
    riotId: options?.riotId || 'Joueur',
    matchesCount: rows.length,
    summary: {
      wins,
      losses: rows.length - wins,
      winRatePct: rows.length > 0 ? Math.round((wins / rows.length) * 100) : 0,
      avgKda: Number((rows.reduce((acc, r) => acc + r.kdaRatio, 0) / count).toFixed(2)),
      avgCsPerMin: Number((rows.reduce((acc, r) => acc + r.csPerMin, 0) / count).toFixed(2)),
      avgGoldPerMin: Math.round(rows.reduce((acc, r) => acc + r.goldPerMin, 0) / count),
      avgVisionScore: Number((rows.reduce((acc, r) => acc + r.visionScore, 0) / count).toFixed(1)),
      avgVisionPerMin: Number((rows.reduce((acc, r) => acc + r.visionPerMin, 0) / count).toFixed(2)),
      totalIsolatedDeaths: rows.reduce((acc, r) => acc + r.isolatedDeaths, 0),
      totalPreObjectiveDeaths: rows.reduce((acc, r) => acc + r.preObjectiveDeaths, 0),
    },
    matches: rows,
  };

  return JSON.stringify(payload, null, 2);
}

export function buildMatchExportCsv(
  matches: MatchRecord[],
  options?: { items?: ItemData[]; limit?: number },
): string {
  const rows = buildMatchExportRows(matches, options?.items || [], options?.limit ?? 10);
  const headers = [
    'Rang',
    'Match ID',
    'Date (Locale)',
    'Date (ISO)',
    'Mode',
    'Queue ID',
    'Patch',
    'Durée (min)',
    'Champion',
    'Rôle',
    'Adversaire direct',
    'Issue',
    'Kills',
    'Morts',
    'Assists',
    'Ratio KDA',
    'CS Total',
    'CS / min',
    'CS @10m',
    'CS @15m',
    'Or Total',
    'Or / min',
    'Écart Or @15m',
    'Dégâts Champions',
    'Dégâts / min',
    'Dégâts Subis',
    'Score Vision',
    'Vision / min',
    'Balises Posées',
    'Balises Détruites',
    'Participation Kills (%)',
    'Morts Isolées',
    'Morts Pré-Objectif',
    'Morts Sur-extension',
    'Équipement Final',
    'Nb Erreurs Détectées',
    'Erreur Principale',
    'Source',
  ];

  const lines = [
    headers.map((h) => escapeCsvCell(h)).join(','),
    ...rows.map((r) =>
      [
        r.rank,
        r.matchId,
        r.playedAtLocal,
        r.playedAtIso,
        r.gameMode,
        r.queueId,
        r.patchVersion,
        r.durationMin,
        r.champion,
        r.role,
        r.laneOpponent,
        r.result,
        r.kills,
        r.deaths,
        r.assists,
        r.kdaRatio,
        r.cs,
        r.csPerMin,
        r.csAt10,
        r.csAt15,
        r.goldEarned,
        r.goldPerMin,
        r.goldDiffAt15,
        r.totalDamageToChampions,
        r.damagePerMin,
        r.totalDamageTaken,
        r.visionScore,
        r.visionPerMin,
        r.wardsPlaced,
        r.wardsKilled,
        r.killParticipationPct,
        r.isolatedDeaths,
        r.preObjectiveDeaths,
        r.overextendedDeaths,
        r.items.join(' | '),
        r.detectedMistakesCount,
        r.topMistake,
        r.source,
      ]
        .map((cell) => escapeCsvCell(cell))
        .join(','),
    ),
  ];

  // BOM UTF-8 pour une ouverture sans défaut d'accents dans Microsoft Excel
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadRecentMatchesExport(
  format: 'json' | 'csv',
  matches: MatchRecord[],
  options?: { riotId?: string; items?: ItemData[]; limit?: number },
): { count: number; filename: string } {
  const limit = options?.limit ?? 10;
  const count = Math.min(limit, matches.length);
  const dateTag = new Date().toISOString().slice(0, 10);
  const safeRiot = (options?.riotId || 'joueur')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const filename = `lol-ai-coach-${safeRiot}-${count}-parties-${dateTag}.${format}`;
  const content =
    format === 'json'
      ? buildMatchExportJson(matches, options)
      : buildMatchExportCsv(matches, options);
  const mimeType =
    format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { count, filename };
}
