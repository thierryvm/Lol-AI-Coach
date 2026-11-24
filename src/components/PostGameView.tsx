import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Download,
  FileUp,
  LayoutGrid,
  MapPin,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { postCoachJson } from '../engines/aiConfig.ts';
import { downloadRecentMatchesExport } from '../engines/matchExportEngine.ts';
import { analyzePostGameMatch, isPracticeToolMatch } from '../engines/postGameEngine.ts';
import {
  evaluateMatchAgainstGoals,
  type TrainingIntensity,
} from '../engines/trainingGoalsEngine.ts';
import type { ChampionSummary, ItemData, MatchRecord, RiotPlatform } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { PostGameTrendChart } from './PostGameTrendChart.tsx';
import { SummonersRiftMap, type ArchiveDeathPoint } from './SummonersRiftMap.tsx';
import { TimelineCurveChart } from './TimelineCurveChart.tsx';
import type { ToastItem } from './ToastContainer.tsx';
import { formatChampionDisplayName, resolveChampionDisplay } from '../utils/championDisplay.ts';
import { getSummonerSpellById, getSummonerSpellIconUrl } from '../utils/summonerSpells.ts';

type MatchResultFilter = 'ALL' | 'WIN' | 'LOSS' | 'PRACTICE';
type MatchRoleFilter = 'ALL' | 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
type MatchSortMode = 'RECENT' | 'KDA' | 'CS' | 'DURATION';

function normalizePostGameRole(pos?: string): Exclude<MatchRoleFilter, 'ALL'> | 'OTHER' {
  const upper = (pos || '').toUpperCase();
  if (upper === 'TOP') return 'TOP';
  if (upper === 'JUNGLE') return 'JUNGLE';
  if (upper === 'MID' || upper === 'MIDDLE') return 'MID';
  if (upper === 'ADC' || upper === 'BOTTOM') return 'ADC';
  if (upper === 'SUPPORT' || upper === 'UTILITY') return 'SUPPORT';
  return 'OTHER';
}

function formatRoleShort(pos?: string): string {
  const norm = normalizePostGameRole(pos);
  if (norm === 'OTHER') return 'Libre';
  if (norm === 'TOP') return 'Top';
  if (norm === 'JUNGLE') return 'Jungle';
  if (norm === 'MID') return 'Mid';
  if (norm === 'ADC') return 'ADC';
  return 'Support';
}

interface PostGameViewProps {
  matches: MatchRecord[];
  selectedMatchId: string | null;
  champions: ChampionSummary[];
  items?: ItemData[];
  patchVersion: string;
  riotId?: string;
  region?: RiotPlatform;
  trainingIntensity?: TrainingIntensity;
  onSelectMatchId: (id: string) => void;
  onImportMatch: (match: MatchRecord) => void;
  onDeleteMatch?: (matchId: string) => void;
  onNotify?: (toast: Omit<ToastItem, 'id'>) => void;
}

function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const trimmed = riotId.trim();
  if (trimmed.includes('#')) {
    const [gameName, tagLine] = trimmed.split('#');
    return { gameName: gameName || 'Boulvae', tagLine: tagLine || 'EUW' };
  }
  return { gameName: trimmed || 'Boulvae', tagLine: 'EUW' };
}

export function PostGameView({
  matches,
  selectedMatchId,
  champions,
  items = [],
  patchVersion,
  riotId = 'Boulvae#EUW',
  region = 'EUW1',
  trainingIntensity = 'standard',
  onSelectMatchId,
  onImportMatch,
  onDeleteMatch,
  onNotify,
}: PostGameViewProps) {
  const activeMatch = useMemo(
    () => matches.find((m) => m.matchId === selectedMatchId) || matches[0] || null,
    [matches, selectedMatchId],
  );

  const analysis = useMemo(
    () => (activeMatch ? analyzePostGameMatch(activeMatch) : null),
    [activeMatch],
  );

  const matchGoalChecks = useMemo(
    () => (activeMatch ? evaluateMatchAgainstGoals(activeMatch, matches, trainingIntensity) : []),
    [activeMatch, matches, trainingIntensity],
  );

  const itemMap = useMemo(() => {
    const map = new Map<number, ItemData>();
    for (const it of items) {
      map.set(Number(it.id), it);
    }
    return map;
  }, [items]);

  const archiveDeaths = useMemo<ArchiveDeathPoint[]>(
    () =>
      matches.flatMap((m) =>
        m.mapEvents
          .filter((e) => e.type === 'DEATH')
          .map((e) => ({
            x: e.x,
            y: e.y,
            zone: e.zone || 'Faille',
            isolated: Boolean(e.isolated),
          })),
      ),
    [matches],
  );

  const [resultFilter, setResultFilter] = useState<MatchResultFilter>('ALL');
  const [roleFilter, setRoleFilter] = useState<MatchRoleFilter>('ALL');
  const [championFilter, setChampionFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<MatchSortMode>('RECENT');

  const championFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      const name = m.player.championName;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        displayName: formatChampionDisplayName(champions, name),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, 'fr'));
  }, [matches, champions]);

  const filteredMatches = useMemo(() => {
    const list = matches.filter((m) => {
      if (resultFilter === 'PRACTICE') {
        if (!isPracticeToolMatch(m)) return false;
      } else {
        if (resultFilter === 'WIN' && (!m.player.win || isPracticeToolMatch(m))) return false;
        if (resultFilter === 'LOSS' && (m.player.win || isPracticeToolMatch(m))) return false;
      }
      if (roleFilter !== 'ALL' && normalizePostGameRole(m.player.teamPosition) !== roleFilter) {
        return false;
      }
      if (championFilter !== 'ALL' && m.player.championName !== championFilter) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'KDA') {
        const kdaA = (a.player.kills + a.player.assists) / Math.max(1, a.player.deaths);
        const kdaB = (b.player.kills + b.player.assists) / Math.max(1, b.player.deaths);
        return kdaB - kdaA || b.gameCreation - a.gameCreation;
      }
      if (sortBy === 'CS') {
        return b.player.csPerMin - a.player.csPerMin || b.gameCreation - a.gameCreation;
      }
      if (sortBy === 'DURATION') {
        return b.gameDurationSec - a.gameDurationSec || b.gameCreation - a.gameCreation;
      }
      return b.gameCreation - a.gameCreation;
    });
  }, [matches, resultFilter, roleFilter, championFilter, sortBy]);

  const hasActiveFilters =
    resultFilter !== 'ALL' ||
    roleFilter !== 'ALL' ||
    championFilter !== 'ALL' ||
    sortBy !== 'RECENT';

  const filteredWinRate = useMemo(() => {
    if (filteredMatches.length === 0) return 0;
    const wins = filteredMatches.filter((m) => m.player.win).length;
    return Math.round((wins / filteredMatches.length) * 100);
  }, [filteredMatches]);

  // Si les filtres excluent le match actuellement sélectionné, basculer automatiquement sur le 1er match filtré
  useEffect(() => {
    if (
      filteredMatches.length > 0 &&
      activeMatch &&
      !filteredMatches.some((m) => m.matchId === activeMatch.matchId)
    ) {
      onSelectMatchId(filteredMatches[0].matchId);
      setAiReview(null);
    }
  }, [filteredMatches, activeMatch, onSelectMatchId]);

  const [subTab, setSubTab] = useState<'overview' | 'tactical-map'>('overview');
  const [overviewSection, setOverviewSection] = useState<'coaching' | 'map-curves' | 'players' | 'all'>('all');
  const [selectedMapTimestampMs, setSelectedMapTimestampMs] = useState<number | null>(null);

  const [matchIdQuery, setMatchIdQuery] = useState('');
  const [matchIdLoading, setMatchIdLoading] = useState(false);
  const [matchIdError, setMatchIdError] = useState<string | null>(null);

  const [showImport, setShowImport] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const enrichedMatchIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setSelectedMapTimestampMs(null);
  }, [activeMatch?.matchId]);

  // Enrichit automatiquement un ancien match archivé s'il lui manque les positions des 10 champions
  useEffect(() => {
    if (!activeMatch) return;
    if (activeMatch.source !== 'Riot API Match-V5') return;
    if (!/^[A-Z0-9]+_\d+$/i.test(activeMatch.matchId)) return;
    const hasSnapshots = activeMatch.mapEvents.some(
      (e) => (e.participantSnapshots?.length || 0) > 0,
    );
    if (hasSnapshots) return;
    if (enrichedMatchIdsRef.current.has(activeMatch.matchId)) return;

    enrichedMatchIdsRef.current.add(activeMatch.matchId);
    const { gameName, tagLine } = parseRiotId(riotId);
    let cancelled = false;

    fetch(
      `/api/riot/match/${encodeURIComponent(activeMatch.matchId)}?gameName=${encodeURIComponent(
        gameName,
      )}&tagLine=${encodeURIComponent(tagLine)}&region=${encodeURIComponent(region)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((enriched: MatchRecord | null) => {
        if (
          cancelled ||
          !enriched ||
          !Array.isArray(enriched.mapEvents) ||
          !enriched.mapEvents.some((e) => (e.participantSnapshots?.length || 0) > 0)
        ) {
          return;
        }
        onImportMatch(enriched);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeMatch, riotId, region, onImportMatch]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReview, setAiReview] = useState<{
    verdict?: string;
    placementReview?: string;
    farmingReview?: string;
    nextMatchFocus?: string[];
  } | null>(null);

  const getChampIcon = (championName: string) =>
    resolveChampionDisplay(champions, championName).imageUrl;

  const handleLoadMatchById = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = matchIdQuery.trim();
    if (!cleaned) return;
    setMatchIdError(null);
    setMatchIdLoading(true);
    try {
      const { gameName, tagLine } = parseRiotId(riotId);
      const res = await fetch(
        `/api/riot/match/${encodeURIComponent(cleaned)}?gameName=${encodeURIComponent(
          gameName,
        )}&tagLine=${encodeURIComponent(tagLine)}&region=${encodeURIComponent(region)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de charger cette partie.');
      onImportMatch(data as MatchRecord);
      setMatchIdQuery('');
      setAiReview(null);
    } catch (err) {
      setMatchIdError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setMatchIdLoading(false);
    }
  };

  const handleImportSubmit = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const parsed = JSON.parse(importJsonText);
      const res = await fetch('/api/match/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchJson: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import refusé.');
      onImportMatch(data);
      setShowImport(false);
      setImportJsonText('');
      setAiReview(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'JSON Match-V5 invalide.');
    } finally {
      setImporting(false);
    }
  };

  const exportCount = Math.min(10, matches.length);

  const handleExportMatches = (format: 'csv' | 'json') => {
    if (matches.length === 0) return;
    const { count, filename } = downloadRecentMatchesExport(format, matches, {
      riotId,
      items,
      limit: 10,
    });
    onNotify?.({
      variant: 'info',
      title: `Export ${format.toUpperCase()} généré (${count} ${count > 1 ? 'parties' : 'partie'})`,
      description: `Fichier prêt pour analyse hors-ligne : ${filename}`,
    });
  };

  const handleGenerateAiReview = async () => {
    if (!activeMatch || !analysis) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await postCoachJson<{
        verdict: string;
        placementReview: string;
        farmingReview: string;
        nextMatchFocus: string[];
      }>('/api/coach/postgame-review', { match: activeMatch, analysis });
      setAiReview(data);
      const champLabel = formatChampionDisplayName(champions, activeMatch.player.championName);
      onNotify?.({
        variant: 'postgame',
        title: `Débriefing IA Post-Game prêt (${champLabel})`,
        description:
          data.verdict ||
          'Synthèse stratégique, zones de mort et objectifs pour la prochaine partie disponibles.',
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erreur lors du débriefing IA.');
    } finally {
      setAiLoading(false);
    }
  };

  // Évaluation déterministe de l'équipement acheté face aux ennemis du match
  const itemAudit = useMemo(() => {
    if (!activeMatch) return null;
    const p = activeMatch.player;
    const validIds = (p.items || []).filter((id) => id > 0);
    const ownedItems = validIds.map((id) => ({
      id,
      data: itemMap.get(id),
    }));

    const bootIds = new Set([3006, 3009, 3010, 3013, 3020, 3047, 3111, 3117, 3158]);
    const antiHealIds = new Set([3076, 3075, 3123, 3033, 3916, 3165, 3011]);
    const hasBoots = validIds.some((id) => bootIds.has(id));
    const hasAntiHeal = validIds.some((id) => antiHealIds.has(id));

    const enemies = activeMatch.participants.filter((part) => part.teamId !== p.teamId);
    const enemyChampions = enemies
      .map((e) =>
        champions.find(
          (c) =>
            c.id.toLowerCase() === e.championName.toLowerCase() ||
            c.name.toLowerCase() === e.championName.toLowerCase(),
        ),
      )
      .filter((c): c is ChampionSummary => Boolean(c));

    const apThreats = enemyChampions.filter((c) => c.tags.includes('Mage') || c.info?.magic >= 6).length;
    const adThreats = enemyChampions.filter(
      (c) => c.tags.includes('Marksman') || c.tags.includes('Fighter') || c.tags.includes('Assassin'),
    ).length;

    let totalMr = 0;
    let totalArmor = 0;
    let totalHp = 0;
    let totalAp = 0;
    let totalAd = 0;
    let totalGold = 0;
    for (const oi of ownedItems) {
      totalGold += oi.data?.gold?.total || 0;
      const st = oi.data?.stats;
      if (!st) continue;
      totalMr += st.FlatSpellBlockMod || 0;
      totalArmor += st.FlatArmorMod || 0;
      totalHp += st.FlatHPPoolMod || 0;
      totalAp += st.FlatMagicDamageMod || 0;
      totalAd += st.FlatPhysicalDamageMod || 0;
    }

    const notes: Array<{ ok: boolean; text: string }> = [];
    notes.push({
      ok: hasBoots,
      text: hasBoots
        ? 'Bottes complètes équipées pour la mobilité et le tempo sur la carte.'
        : 'Aucune botte complète détectée dans votre inventaire final : pensez à finir vos bottes tôt pour esquiver et suivre les rotations.',
    });

    if (apThreats >= 2) {
      notes.push({
        ok: totalMr >= 35,
        text:
          totalMr >= 35
            ? `Résistance magique adaptée (+${Math.round(totalMr)} RM via vos objets) face à ${apThreats} menaces magiques.`
            : `${apThreats} champions magiques adverses détectés, mais peu de Résistance Magique (+${Math.round(totalMr)} RM) dans votre stuff final.`,
      });
    }
    if (adThreats >= 3) {
      notes.push({
        ok: totalArmor >= 40,
        text:
          totalArmor >= 40
            ? `Armure cohérente (+${Math.round(totalArmor)} Armure) face à une composition très orientée dégâts physiques.`
            : `Composition ennemie lourde en dégâts physiques (${adThreats} menaces AD), envisagez davantage d’Armure (+${Math.round(totalArmor)} actuelle).`,
      });
    }
    if (hasAntiHeal) {
      notes.push({
        ok: true,
        text: 'Investissement anti-soin présent dans votre build (réduit efficacement la régénération ennemie).',
      });
    }
    if (enemies.length === 0 && ownedItems.length > 0) {
      const profileTag =
        totalAp >= 160
          ? 'orienté Puissance (AP)'
          : totalAd >= 120
            ? 'orienté Dégâts Physiques (AD)'
            : totalHp >= 600 || totalArmor + totalMr >= 80
              ? 'orienté Tank / Frontline'
              : 'intermédiaire / utilitaire';
      notes.push({
        ok: true,
        text: `Build ${profileTag} d’une valeur totale de ${totalGold.toLocaleString('fr-FR')} po (${ownedItems.length} emplacement${ownedItems.length > 1 ? 's' : ''} rempli${ownedItems.length > 1 ? 's' : ''}).`,
      });
    }

    return {
      ownedItems,
      totalArmor: Math.round(totalArmor),
      totalMr: Math.round(totalMr),
      totalHp: Math.round(totalHp),
      totalAp: Math.round(totalAp),
      totalAd: Math.round(totalAd),
      totalGold: Math.round(totalGold),
      notes,
    };
  }, [activeMatch, itemMap, champions]);

  if (!activeMatch || !analysis) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-8 space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 text-center">
          Aucun match synchronisé pour le moment. Chargez une partie via son ID Riot ou importez un JSON Match-V5.
        </p>
        <form onSubmit={handleLoadMatchById} className="max-w-md mx-auto flex gap-2">
          <input
            type="text"
            value={matchIdQuery}
            onChange={(e) => setMatchIdQuery(e.target.value)}
            placeholder="ID de partie Riot (ex : 8046196983)"
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={matchIdLoading || !matchIdQuery.trim()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 disabled:opacity-50"
          >
            {matchIdLoading ? 'Chargement...' : 'Charger'}
          </button>
        </form>
        {matchIdError && <p className="text-xs text-rose-500 text-center">{matchIdError}</p>}
      </div>
    );
  }

  const p = activeMatch.player;
  const pDisp = resolveChampionDisplay(champions, p.championName);

  return (
    <div className="space-y-6">
      {/* Barre de sélection de match, recherche par Match ID & import JSON */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <SafeGameIcon
              src={pDisp.imageUrl}
              alt={pDisp.displayName}
              fallbackLabel={pDisp.displayName}
              sizeClass="w-12 h-12"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Analyse Post-Game · {pDisp.displayName} ({p.kills}/{p.deaths}/{p.assists})
                </h1>
                {isPracticeToolMatch(activeMatch) && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
                    Outil d’entraînement
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isPracticeToolMatch(activeMatch) ? (
                  <span className="text-sky-600 dark:text-sky-400 font-semibold">
                    Session d’entraînement
                  </span>
                ) : (
                  <span
                    className={
                      p.win
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-rose-600 dark:text-rose-400 font-semibold'
                    }
                  >
                    {p.win ? 'Victoire' : 'Défaite'}
                  </span>
                )}
                <span aria-hidden="true" className="mx-2">·</span>
                <span>{p.teamPosition}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono tabular-nums">{Math.max(1, Math.round(activeMatch.gameDurationSec / 60))} min</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono">{activeMatch.matchId}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>{activeMatch.source}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isPracticeToolMatch(activeMatch) && onDeleteMatch && (
              <button
                type="button"
                onClick={() => onDeleteMatch(activeMatch.matchId)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 transition-colors whitespace-nowrap shrink-0"
                title="Retirer cette session d’entraînement de l’archive locale"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Supprimer session
              </button>
            )}

            <select
              value={activeMatch.matchId}
              onChange={(e) => {
                onSelectMatchId(e.target.value);
                setAiReview(null);
              }}
              aria-label="Choisir une partie"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            >
              {(filteredMatches.length > 0 ? filteredMatches : matches).map((m) => (
                <option key={m.matchId} value={m.matchId}>
                  {formatChampionDisplayName(champions, m.player.championName)} (
                  {isPracticeToolMatch(m) ? 'Entraîn.' : m.player.win ? 'V' : 'D'} ·{' '}
                  {m.player.kills}/{m.player.deaths}/{m.player.assists})
                </option>
              ))}
            </select>

            {/* Recherche directe par ID de partie Riot (ex: 8046196983) */}
            <form onSubmit={handleLoadMatchById} className="flex items-center gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  value={matchIdQuery}
                  onChange={(e) => setMatchIdQuery(e.target.value)}
                  placeholder="ID partie (ex: 8046196983)"
                  aria-label="Charger une partie par ID Riot"
                  className="w-44 pl-8 pr-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                type="submit"
                disabled={matchIdLoading || !matchIdQuery.trim()}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {matchIdLoading ? 'Recherche...' : 'Charger ID'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowImport((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
              Importer JSON
            </button>

            <div
              role="group"
              aria-label="Exporter les 10 dernières parties"
              className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] overflow-hidden shrink-0"
            >
              <span className="inline-flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                <Download className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                Exporter ({exportCount})
              </span>
              <button
                type="button"
                onClick={() => handleExportMatches('csv')}
                title="Exporter les statistiques des 10 dernières parties au format CSV (Excel / Google Sheets)"
                className="px-2.5 py-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-500/15 hover:text-amber-600 dark:hover:text-amber-400 border-r border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => handleExportMatches('json')}
                title="Exporter les statistiques complètes des 10 dernières parties au format JSON"
                className="px-2.5 py-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-500/15 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap"
              >
                JSON
              </button>
            </div>
          </div>
        </div>

        {matchIdError && (
          <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400">
            {matchIdError}
          </div>
        )}

        {showImport && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Collez un payload officiel Riot Match-V5 (`info.participants`)
            </label>
            <textarea
              rows={4}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{"metadata": {"matchId": "EUW1_..."}, "info": {"gameDuration": 1800, "participants": [...]}}'
              className="w-full p-3 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            />
            {importError && <p className="text-xs text-rose-500">{importError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={importing || !importJsonText.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 disabled:opacity-50"
              >
                {importing ? 'Import...' : 'Analyser ce match'}
              </button>
              <button
                type="button"
                onClick={() => setShowImport(false)}
                className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Sélecteur & filtres de l'historique archivé (Résultat, Rôle, Champion & Tri) */}
        {matches.length > 1 && (
          <div className="pt-3.5 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                  <span>Historique des parties · Sélectionner un match à analyser</span>
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Filtrez ci-dessous puis cliquez sur une carte pour charger son débriefing complet.
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {filteredMatches.length}/{matches.length} parties
                  {filteredMatches.length > 0 ? ` · ${filteredWinRate}% WR` : ''}
                </span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setResultFilter('ALL');
                      setRoleFilter('ALL');
                      setChampionFilter('ALL');
                      setSortBy('RECENT');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>Réinitialiser</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtre Résultat */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'ALL', label: 'Toutes' },
                    { id: 'WIN', label: 'Victoires' },
                    { id: 'LOSS', label: 'Défaites' },
                    { id: 'PRACTICE', label: 'Entraînement' },
                  ] as Array<{ id: MatchResultFilter; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setResultFilter(opt.id)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      resultFilter === opt.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Filtre Rôle */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'ALL', label: 'Tous rôles' },
                    { id: 'TOP', label: 'Top' },
                    { id: 'JUNGLE', label: 'Jungle' },
                    { id: 'MID', label: 'Mid' },
                    { id: 'ADC', label: 'ADC' },
                    { id: 'SUPPORT', label: 'Support' },
                  ] as Array<{ id: MatchRoleFilter; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRoleFilter(opt.id)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      roleFilter === opt.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Filtre Champion */}
              <select
                value={championFilter}
                onChange={(e) => setChampionFilter(e.target.value)}
                aria-label="Filtrer par champion"
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">Tous les champions ({matches.length})</option>
                {championFilterOptions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.displayName} ({c.count})
                  </option>
                ))}
              </select>

              {/* Tri */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as MatchSortMode)}
                aria-label="Trier les parties"
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-800 dark:text-slate-200"
              >
                <option value="RECENT">Tri : Plus récentes</option>
                <option value="KDA">Tri : Meilleur KDA</option>
                <option value="CS">Tri : Meilleur CS/min</option>
                <option value="DURATION">Tri : Durée</option>
              </select>
            </div>

            {filteredMatches.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Aucune partie archivée ne correspond à cette combinaison de filtres.</span>
                <button
                  type="button"
                  onClick={() => {
                    setResultFilter('ALL');
                    setRoleFilter('ALL');
                    setChampionFilter('ALL');
                    setSortBy('RECENT');
                  }}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Afficher toutes les parties
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 overflow-x-auto pt-1.5 pb-2 px-0.5 thin-scrollbar">
                {filteredMatches.slice(0, 20).map((m) => {
                  const isSelected = m.matchId === activeMatch.matchId;
                  const durMin = Math.round(m.gameDurationSec / 60);
                  const mChampDisp = resolveChampionDisplay(champions, m.player.championName);
                  return (
                    <button
                      key={m.matchId}
                      type="button"
                      onClick={() => {
                        onSelectMatchId(m.matchId);
                        setAiReview(null);
                      }}
                      className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-[transform,border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)]:hover:-translate-y-0.5 shrink-0 ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/10 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <SafeGameIcon
                        src={mChampDisp.imageUrl}
                        alt={mChampDisp.displayName}
                        fallbackLabel={mChampDisp.displayName}
                        sizeClass="w-7 h-7"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                          <span>{mChampDisp.displayName}</span>
                          {isPracticeToolMatch(m) ? (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[9px] font-semibold">
                              Entraîn.
                            </span>
                          ) : (
                            <span
                              className={`font-mono ${
                                m.player.win
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {m.player.win ? 'V' : 'D'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {m.player.kills}/{m.player.deaths}/{m.player.assists} · {formatRoleShort(m.player.teamPosition)} · {Math.max(1, durMin)}m
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sous-onglets de lecture : Vue d'ensemble vs Carte Tactique grand format */}
        <div
          role="tablist"
          aria-label="Sous-vues de l'analyse Post-Game"
          className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#0D0F14] border border-black/[0.05] dark:border-white/[0.07] w-full sm:w-auto">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'overview'}
              onClick={() => setSubTab('overview')}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                subTab === 'overview'
                  ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
              Débriefing &amp; Stats
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'tactical-map'}
              onClick={() => setSubTab('tactical-map')}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                subTab === 'tactical-map'
                  ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              Carte Tactique ({activeMatch.mapEvents.length})
            </button>
          </div>

          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {subTab === 'tactical-map'
              ? 'Grand format : 22 tours, 34 buissons, positions des champions et diagnostic par mort.'
              : 'Astuce : ouvrez « Carte Tactique & Morts » pour inspecter chaque mort en grand format.'}
          </span>
        </div>

        {isPracticeToolMatch(activeMatch) && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-4 py-2.5 text-xs text-sky-800 dark:text-sky-200 flex flex-wrap items-center justify-between gap-2">
            <span>
              Session Outil d’entraînement capturée en direct — votre équipement final et vos statistiques sont analysés ci-dessous sans modifier vos KPIs Classés / Carrière.
            </span>
          </div>
        )}
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${subTab}-${activeMatch.matchId}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.17, ease: [0.23, 1, 0.32, 1] },
          }}
          exit={{
            opacity: 0,
            y: -4,
            transition: { duration: 0.11, ease: [0.23, 1, 0.32, 1] },
          }}
          className="space-y-6"
        >
      {subTab === 'tactical-map' ? (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Carte Tactique Grand Format · Pourquoi je suis mort ?
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cliquez sur une mort (« × ») pour visualiser les positions des alliés/adversaires, la provenance des attaques, les tours et les buissons proches.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubTab('overview')}
              className="self-start sm:self-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              ← Retour à la vue d’ensemble
            </button>
          </div>

          <SummonersRiftMap
            events={activeMatch.mapEvents}
            archiveDeaths={archiveDeaths}
            archiveMatchCount={matches.length}
            champions={champions}
            patchVersion={patchVersion}
            playerTeamId={p.teamId}
            playerChampion={p.championName}
            mode="expanded"
            selectedTimestampMs={selectedMapTimestampMs}
            onSelectTimestampMs={setSelectedMapTimestampMs}
          />
        </section>
      ) : (
        <>
      {/* Métriques clés Post-Game */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          { label: 'CS / min', value: analysis.csPerMin.toFixed(1), sub: `${p.cs} sbires` },
          { label: 'CS @ 10 min', value: String(analysis.csAt10), sub: 'Cible : 75+' },
          { label: 'Écart Or @ 15m', value: `${analysis.goldDiffAt15 >= 0 ? '+' : ''}${analysis.goldDiffAt15}`, sub: 'vs vis-à-vis' },
          { label: 'Participation Kills', value: `${analysis.killParticipation}%`, sub: `${p.kills + p.assists} impliqués` },
          { label: 'Morts isolées', value: String(analysis.isolatedDeaths), sub: 'Sans couverture' },
          { label: 'Morts pré-objectif', value: String(analysis.preObjectiveDeaths), sub: '<45s avant drake/nash' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
            <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {kpi.value}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{kpi.sub}</div>
          </div>
        ))}
      </section>

      {/* Sélecteur d'étape Apple pour lire le débriefing sans surcharge */}
      <div className="rounded-2xl apple-surface px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Choisissez l’angle d’analyse de cette partie :
        </span>
        <div
          role="tablist"
          aria-label="Sections du débriefing de partie"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#0D0F14] border border-black/[0.05] dark:border-white/[0.07]"
        >
          {(
            [
              { id: 'all', label: 'Tout voir' },
              { id: 'coaching', label: '1. Bilan & Stuff' },
              { id: 'map-curves', label: '2. Carte & Courbes' },
              { id: 'players', label: '3. 10 Joueurs' },
            ] as const
          ).map((tab) => {
            const active = overviewSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setOverviewSection(tab.id)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation des objectifs du programme d'entraînement sur cette partie */}
      {(overviewSection === 'coaching' || overviewSection === 'all') && matchGoalChecks.length > 0 && (
        <section className="rounded-2xl apple-surface p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Validation du Programme d’Entraînement sur cette partie
              </h2>
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {matchGoalChecks.filter((g) => g.passed).length}/{matchGoalChecks.length} validés · Mode{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {trainingIntensity === 'strict' ? 'Exigeant' : 'Standard'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {matchGoalChecks.map((check) => (
              <div
                key={check.goalId}
                className={`rounded-lg border p-3.5 flex items-start justify-between gap-3 ${
                  check.passed
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : 'border-amber-500/30 bg-amber-500/5'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {check.category}
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                    {check.title}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    Mesuré : {check.measuredLabel} · Cible : {check.targetLabel}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md shrink-0 ${
                    check.passed
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {check.passed ? (
                    <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                  )}
                  {check.passed ? 'Validé' : 'À corriger'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bilan Stuff & Synergie Build vs Composition adverse */}
      {(overviewSection === 'coaching' || overviewSection === 'all') && itemAudit && itemAudit.ownedItems.length > 0 && (
        <section className="rounded-2xl apple-surface p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              Bilan de votre équipement final ({pDisp.displayName})
            </h2>
            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Coût total : {itemAudit.totalGold.toLocaleString('fr-FR')} po · Bonus : +{itemAudit.totalHp} PV · +{itemAudit.totalArmor} Armure · +{itemAudit.totalMr} RM
              {itemAudit.totalAp > 0 ? ` · +${itemAudit.totalAp} AP` : ''}
              {itemAudit.totalAd > 0 ? ` · +${itemAudit.totalAd} AD` : ''}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-6 flex flex-wrap gap-2.5">
              {itemAudit.ownedItems.map((oi, idx) => (
                <div
                  key={`${oi.id}-${idx}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C]"
                >
                  <SafeGameIcon
                    src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/item/${oi.id}.png`}
                    alt={oi.data?.name || `Objet ${oi.id}`}
                    fallbackLabel={String(oi.id)}
                    sizeClass="w-8 h-8"
                  />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {oi.data?.name || `Objet #${oi.id}`}
                    </div>
                    {oi.data?.gold?.total ? (
                      <div className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                        {oi.data.gold.total} po
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-6 space-y-2 text-xs">
              {itemAudit.notes.map((n, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 border ${
                    n.ok
                      ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {n.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <span className="leading-relaxed">{n.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Carte de placement & Courbe de farming */}
      {(overviewSection === 'map-curves' || overviewSection === 'all') && (
      <>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Carte des erreurs de placement (Faille de l’invocateur)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sélectionnez un marqueur pour inspecter le placement, les tours et les buissons.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubTab('tactical-map')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0"
            >
              Ouvrir en grand format →
            </button>
          </div>
          <SummonersRiftMap
            events={activeMatch.mapEvents}
            archiveDeaths={archiveDeaths}
            archiveMatchCount={matches.length}
            champions={champions}
            patchVersion={patchVersion}
            playerTeamId={p.teamId}
            playerChampion={p.championName}
            mode="compact"
            selectedTimestampMs={selectedMapTimestampMs}
            onSelectTimestampMs={setSelectedMapTimestampMs}
          />
        </section>

        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Courbe de farming &amp; différentiel d’or
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comparaison minute par minute face à votre adversaire direct.
            </p>
          </div>
          <TimelineCurveChart splits={activeMatch.timelineSplits} />
        </section>
      </div>

      {/* Évolution KDA, Or/min et Vision sur la fenêtre de parties choisie */}
      <PostGameTrendChart
        matches={matches}
        activeMatchId={activeMatch.matchId}
        champions={champions}
        getChampIcon={getChampIcon}
        onSelectMatchId={(id) => {
          onSelectMatchId(id);
          setAiReview(null);
        }}
      />
      </>
      )}

      {/* Erreurs détectées & Débriefing IA */}
      {(overviewSection === 'coaching' || overviewSection === 'all') && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Diagnostic déterministe (Placement, Farming, Vision)
          </h2>

          {analysis.detectedMistakes.length === 0 ? (
            <div className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Aucune erreur majeure détectée sur les seuils standards.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {analysis.detectedMistakes.map((err, idx) => (
                <div key={idx} className="p-4 space-y-2 bg-white dark:bg-[#121722]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 ${
                          err.severity === 'Critique' ? 'text-rose-500' : 'text-amber-500'
                        }`}
                        aria-hidden="true"
                      />
                      {err.title}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${
                        err.severity === 'Critique'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {err.category} · {err.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {err.evidence}
                  </p>
                  <p className="text-xs text-sky-700 dark:text-sky-400 leading-relaxed">
                    Exercice correctif : {err.drill}
                  </p>
                </div>
              ))}
            </div>
          )}

          {analysis.strengths.length > 0 && (
            <div className="pt-2 space-y-1.5">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Points forts observés
              </div>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {analysis.strengths.map((s, idx) => (
                  <li key={idx}>· {s}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Débriefing IA Gemini */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-amber-500" aria-hidden="true" />
                Débriefing stratégique personnalisé (Gemini)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Synthèse personnalisée basée sur les coordonnées et courbes exactes du match.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateAiReview}
              disabled={aiLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {aiLoading ? 'Analyse en cours...' : 'Lancer le débriefing IA'}
            </button>
          </div>

          {aiError && (
            <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400">
              {aiError}
            </div>
          )}

          {aiReview ? (
            <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs leading-relaxed">
              {aiReview.verdict && (
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {aiReview.verdict}
                </p>
              )}
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Analyse du placement
                </div>
                <p className="text-slate-600 dark:text-slate-300">{aiReview.placementReview}</p>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Analyse du farming &amp; tempo
                </div>
                <p className="text-slate-600 dark:text-slate-300">{aiReview.farmingReview}</p>
              </div>
              {aiReview.nextMatchFocus && aiReview.nextMatchFocus.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Objectifs pour la prochaine partie
                  </div>
                  <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                    {aiReview.nextMatchFocus.map((item, i) => (
                      <li key={i}>· {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            !aiLoading && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cliquez sur « Lancer le débriefing IA » pour recevoir une correction ciblée de vos zones de mort, de votre équipement et de vos fenêtres de rappel sur cette partie.
              </p>
            )
          )}
        </section>
      </div>
      )}

      {/* Tableau complet des 10 joueurs et équipements */}
      {(overviewSection === 'players' || overviewSection === 'all') && (
      <section className="rounded-2xl apple-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Tableau complet de la partie (10 joueurs &amp; équipements)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Équipement final, dégâts infligés, score de vision et rythme de farm de chaque joueur sur ce match.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Patch {patchVersion}
          </span>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {[
            { teamId: 100, label: 'Équipe Bleue' },
            { teamId: 200, label: 'Équipe Rouge' },
          ].map((teamGroup) => {
            const teamPlayers = activeMatch.participants.filter((part) => part.teamId === teamGroup.teamId);
            if (teamPlayers.length === 0) return null;
            const teamWon = teamPlayers[0]?.win;
            return (
              <div key={teamGroup.teamId} className="overflow-x-auto">
                <div className="px-6 py-2.5 bg-slate-50 dark:bg-[#0D121C] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {teamGroup.label}
                  </span>
                  <span
                    className={`font-semibold ${
                      teamWon ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {teamWon ? 'Victoire' : 'Défaite'}
                  </span>
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-5 text-left font-medium">Joueur &amp; Champion</th>
                      <th className="py-2.5 px-3 text-left font-medium">Rôle</th>
                      <th className="py-2.5 px-3 text-right font-medium">K / D / A</th>
                      <th className="py-2.5 px-3 text-right font-medium">CS</th>
                      <th className="py-2.5 px-3 text-right font-medium">Dégâts</th>
                      <th className="py-2.5 px-3 text-right font-medium">Vision</th>
                      <th className="py-2.5 px-5 text-left font-medium">Équipement final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {teamPlayers.map((part, idx) => {
                      const isSelf = part.puuid === p.puuid;
                      const validItems = (part.items || []).filter((id) => id > 0);
                      const partDisp = resolveChampionDisplay(champions, part.championName);
                      const spell1 = getSummonerSpellById(part.summoner1Id || 4);
                      const spell2 = getSummonerSpellById(part.summoner2Id || 14);
                      const displayRiotId =
                        part.riotIdGameName && part.riotIdTagline
                          ? `${part.riotIdGameName}#${part.riotIdTagline}`
                          : part.riotIdGameName || partDisp.displayName;
                      return (
                        <tr
                          key={`${part.puuid}-${idx}`}
                          className={
                            isSelf
                              ? 'bg-amber-500/5 dark:bg-amber-500/10'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                          }
                        >
                          <td className="py-2.5 px-5">
                            <div className="flex items-center gap-2.5">
                              <SafeGameIcon
                                key={`pg-champ-${activeMatch.matchId}-${part.puuid}-${idx}`}
                                src={partDisp.imageUrl}
                                alt={partDisp.displayName}
                                fallbackLabel={partDisp.displayName}
                                sizeClass="w-8 h-8"
                              />
                              <div className="flex flex-col gap-0.5 shrink-0">
                                <span title={`${spell1.nameFr} (${spell1.cooldownSec}s)`}>
                                  <SafeGameIcon
                                    src={getSummonerSpellIconUrl(spell1.id, patchVersion)}
                                    alt={spell1.nameFr}
                                    fallbackLabel={spell1.shortLabel}
                                    sizeClass="w-3.5 h-3.5"
                                  />
                                </span>
                                <span title={`${spell2.nameFr} (${spell2.cooldownSec}s)`}>
                                  <SafeGameIcon
                                    src={getSummonerSpellIconUrl(spell2.id, patchVersion)}
                                    alt={spell2.nameFr}
                                    fallbackLabel={spell2.shortLabel}
                                    sizeClass="w-3.5 h-3.5"
                                  />
                                </span>
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-white truncate">
                                  {partDisp.displayName}{' '}
                                  <span className="text-[11px] font-mono font-normal text-slate-400">
                                    Niv.{part.champLevel}
                                  </span>
                                  {isSelf && (
                                    <span className="ml-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                      (Vous)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {displayRiotId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                            {part.teamPosition || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                            {part.kills}/{part.deaths}/{part.assists}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <div className="text-slate-900 dark:text-white">{part.cs}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {part.csPerMin}/min
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {part.totalDamageDealtToChampions.toLocaleString('fr-FR')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {part.visionScore}
                          </td>
                          <td className="py-2.5 px-5">
                            {validItems.length === 0 ? (
                              <span className="text-[11px] text-slate-400">Aucun objet</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1">
                                {validItems.map((itemId, itemIdx) => {
                                  const itemInfo = itemMap.get(itemId);
                                  return (
                                    <div
                                      key={`${part.puuid}-item-${itemIdx}-${itemId}`}
                                      title={itemInfo ? `${itemInfo.name} (${itemInfo.gold.total} po)` : `Objet #${itemId}`}
                                    >
                                      <SafeGameIcon
                                        key={`pg-item-${activeMatch.matchId}-${part.puuid}-${itemIdx}-${itemId}`}
                                        src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/item/${itemId}.png`}
                                        alt={itemInfo?.name || `Objet ${itemId}`}
                                        fallbackLabel={String(itemId)}
                                        sizeClass="w-7 h-7"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>
      )}
        </>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
