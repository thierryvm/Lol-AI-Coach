import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Swords,
} from 'lucide-react';
import { postCoachJson } from '../engines/aiConfig.ts';
import type { ChampionSummary, GameModeContext, ItemData, Role } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

export interface ResolvedPopularBuild {
  sourceSite: string;
  buildTitle: string;
  winRateNote: string;
  pickRateNote: string;
  bootsName: string;
  bootsItem: ItemData | null;
  itemNames: string[];
  resolvedItems: Array<{ rawName: string; item: ItemData | null }>;
  keystoneName: string;
  secondaryTreeName: string;
  rationale: string;
}

export interface PopularBuildSearchResponse {
  patchVersion: string;
  summary: string;
  builds: ResolvedPopularBuild[];
  aggregatedSuggestedItems: ItemData[];
  groundingSources: Array<{ title: string; uri: string }>;
}

interface PopularBuildSearchProps {
  champion: ChampionSummary;
  champions?: ChampionSummary[];
  role: Role;
  gameMode: GameModeContext;
  patchVersion: string;
  onSwitchChampion?: (championId: string) => void;
  onApplyBuild: (items: ItemData[]) => void;
  onQuickTestItem: (item: ItemData) => void;
  onSuggestionsUpdated: (
    items: ItemData[],
    meta: { summary: string; sources: Array<{ title: string; uri: string }> } | null,
  ) => void;
}

const QUICK_FOCUS_PRESETS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'meta', label: 'Méta U.GG / OP.GG', hint: '' },
  { id: 'tank', label: 'Tank / Survie', hint: 'build tank survie le plus joué' },
  { id: 'carry', label: 'Dégâts / Snowball', hint: 'build dégâts AP on-hit ou bruiser snowball' },
];

function normalizeChampQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function PopularBuildSearch({
  champion,
  champions = [],
  role,
  gameMode,
  patchVersion,
  onSwitchChampion,
  onApplyBuild,
  onQuickTestItem,
  onSuggestionsUpdated,
}: PopularBuildSearchProps) {
  const [focusHint, setFocusHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PopularBuildSearchResponse | null>(null);
  const [appliedBuildIdx, setAppliedBuildIdx] = useState<number | null>(null);
  const skipNextResetForChampIdRef = useRef<string | null>(null);

  // Réinitialiser les résultats affichés quand le champion ou le rôle change
  useEffect(() => {
    if (skipNextResetForChampIdRef.current === champion.id) {
      skipNextResetForChampIdRef.current = null;
      return;
    }
    setResult(null);
    setError(null);
    setAppliedBuildIdx(null);
    onSuggestionsUpdated([], null);
  }, [champion.id, role, gameMode]);

  const runSearch = async (overrideHint?: string) => {
    const rawHint = typeof overrideHint === 'string' ? overrideHint : focusHint;
    const trimmedHint = rawHint.trim();

    let targetChampion = champion;
    let queryFocus = trimmedHint;

    // Si l'utilisateur tape un nom de champion (ex: "sona" alors que Tahm Kench est actif), basculer dessus !
    if (trimmedHint && champions.length > 0 && onSwitchChampion) {
      const normalized = normalizeChampQuery(trimmedHint);
      const matched = champions.find(
        (c) =>
          normalizeChampQuery(c.name) === normalized ||
          normalizeChampQuery(c.id) === normalized ||
          (normalized === 'wukong' && c.id === 'MonkeyKing'),
      );
      if (matched) {
        targetChampion = matched;
        queryFocus = '';
        if (matched.id !== champion.id) {
          skipNextResetForChampIdRef.current = matched.id;
          onSwitchChampion(matched.id);
        }
        setFocusHint('');
      }
    }

    setLoading(true);
    setError(null);
    setAppliedBuildIdx(null);

    try {
      const json = await postCoachJson<PopularBuildSearchResponse>(
        '/api/coach/search-popular-builds',
        {
          championName: targetChampion.name,
          championId: targetChampion.id,
          role,
          gameMode,
          patchVersion,
          focusHint: queryFocus,
        },
      );
      setResult(json);
      onSuggestionsUpdated(json.aggregatedSuggestedItems || [], {
        summary: json.summary,
        sources: json.groundingSources || [],
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de récupérer les builds populaires en direct.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoadBuild = (build: ResolvedPopularBuild, idx: number) => {
    const items: ItemData[] = [];
    if (build.bootsItem) items.push(build.bootsItem);
    for (const entry of build.resolvedItems) {
      if (entry.item && !items.some((existing) => existing.id === entry.item!.id)) {
        items.push(entry.item);
      }
    }
    if (items.length === 0) return;
    onApplyBuild(items.slice(0, 6));
    setAppliedBuildIdx(idx);
    window.setTimeout(() => setAppliedBuildIdx(null), 2500);
  };

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
            <span>Recherche de Builds (Google Search · U.GG / OP.GG)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Interroge Google en direct sur U.GG, OP.GG et Lolalytics pour{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {champion.name} ({role})
            </strong>
            , résout chaque objet avec Data Dragon ({patchVersion}) et les injecte dans vos recommandations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {QUICK_FOCUS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={loading}
              onClick={() => {
                setFocusHint(preset.hint);
                void runSearch(preset.hint);
              }}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-50 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Barre de recherche manuelle + bouton lancer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <div className="relative flex-1">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={focusHint}
            onChange={(e) => setFocusHint(e.target.value)}
            placeholder={`Style pour ${champion.name} (ex: tank, AP on-hit...) ou nom d'un autre champion (ex: Sona)`}
            aria-label="Préciser la recherche de build"
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Recherche OP.GG / Web...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Rechercher sur le Web</span>
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void runSearch()}
            className="px-3 py-1.5 rounded-md bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-500 shrink-0"
          >
            Réessayer
          </button>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
            <span>
              Cliquez sur <strong>Rechercher sur le Web</strong> pour extraire en direct les builds populaires d’OP.GG / méta pour{' '}
              <strong>{champion.name}</strong> et les charger dans votre Atelier.
            </span>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
            OP.GG Live + Web Search
          </span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
            <strong className="text-sky-700 dark:text-sky-300">Synthèse Web ({result.patchVersion}) : </strong>
            {result.summary}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {result.builds.map((build, idx) => {
              const allItems: Array<{ label: string; item: ItemData | null }> = [];
              if (build.bootsName) {
                allItems.push({ label: build.bootsName, item: build.bootsItem });
              }
              for (const entry of build.resolvedItems) {
                allItems.push({ label: entry.rawName, item: entry.item });
              }
              const resolvableCount = allItems.filter((x) => Boolean(x.item)).length;
              const isApplied = appliedBuildIdx === idx;

              return (
                <div
                  key={`${build.sourceSite}-${idx}`}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 flex flex-col justify-between gap-3.5"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                            {build.sourceSite}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {build.buildTitle}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                          {build.winRateNote} · {build.pickRateNote}
                          {build.keystoneName ? ` · ${build.keystoneName}` : ''}
                        </div>
                      </div>
                    </div>

                    {build.rationale && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {build.rationale}
                      </p>
                    )}

                    {/* Objets suggérés résolus via Data Dragon */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allItems.map((entry, itemIdx) => (
                        <div
                          key={`${entry.label}-${itemIdx}`}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] px-2.5 py-2 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {entry.item ? (
                              <SafeGameIcon
                                src={entry.item.imageUrl}
                                alt={entry.item.name}
                                fallbackLabel={entry.item.name}
                                sizeClass="w-7 h-7"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                                ?
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold text-slate-900 dark:text-white truncate">
                                {entry.item ? entry.item.name : entry.label}
                              </div>
                              <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {entry.item ? `${entry.item.gold.total} po` : entry.label}
                              </div>
                            </div>
                          </div>

                          {entry.item && (
                            <button
                              type="button"
                              onClick={() => onQuickTestItem(entry.item!)}
                              title={`Ajouter ${entry.item.name} à l'Atelier`}
                              className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0"
                            >
                              <Plus className="w-3 h-3" aria-hidden="true" />
                              <span>Tester</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {build.secondaryTreeName ? `Runes : ${build.keystoneName} + ${build.secondaryTreeName}` : 'Cliquez pour tester dans l’Atelier'}
                    </span>
                    <button
                      type="button"
                      disabled={resolvableCount === 0}
                      onClick={() => handleLoadBuild(build, idx)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors shrink-0 ${
                        isApplied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50'
                      }`}
                    >
                      {isApplied ? (
                        <>
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Chargé !</span>
                        </>
                      ) : (
                        <>
                          <Swords className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Charger dans l’Atelier</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sources Web vérifiées Google Search */}
          {result.groundingSources.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Sources Google Search :
              </span>
              {result.groundingSources.map((src) => (
                <a
                  key={src.uri}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-sky-600 dark:text-sky-400 hover:border-sky-500 transition-colors max-w-[240px]"
                >
                  <span className="truncate">{src.title}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
