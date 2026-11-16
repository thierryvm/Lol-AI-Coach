import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Search, Shield, Sparkles, Swords, X } from 'lucide-react';
import {
  classifyChampionProfile,
  computeAttackSpeedAtLevel,
  computeStatAtLevel,
  isJunglerChampion,
} from '../engines/championEngine.ts';
import type { ChampionDetail, ChampionSummary } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

interface ChampionEncyclopediaViewProps {
  champions: ChampionSummary[];
  patchVersion: string;
  recentChampionIds?: string[];
  onUseInBuilder: (championId: string) => void;
}

const TAG_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'Tous', label: 'Tous' },
  { id: 'Fighter', label: 'Combattants' },
  { id: 'Mage', label: 'Mages' },
  { id: 'Assassin', label: 'Assassins' },
  { id: 'Tank', label: 'Tanks' },
  { id: 'Marksman', label: 'Tireurs' },
  { id: 'Support', label: 'Supports' },
  { id: 'Jungler', label: 'Junglers' },
];

type SortKey = 'name' | 'hp' | 'ad' | 'range';
type DamageFilter = 'Tous' | 'Physique' | 'Magique' | 'Hybride';

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function ChampionSplashBackdrop({
  championId,
  championName,
}: {
  championId: string;
  championName: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [championId]);

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#121C2D] to-[#0B0E14]"
      />
    );
  }

  return (
    <img
      src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championId}_0.jpg`}
      alt={`Illustration de ${championName}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="absolute inset-0 w-full h-full object-cover object-top"
    />
  );
}

function ChampionPortraitTile({
  champion,
  selected,
  isFreeRotation,
  onSelect,
}: {
  champion: ChampionSummary;
  selected: boolean;
  isFreeRotation?: boolean;
  onSelect: () => void;
}) {
  const [imgStage, setImgStage] = useState<'loading' | 'square' | 'fallback'>('loading');

  const src =
    imgStage === 'loading'
      ? `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`
      : champion.imageUrl;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative aspect-[3/4] rounded-xl overflow-hidden text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
        selected
          ? 'border-2 border-amber-400 shadow-lg shadow-amber-500/20'
          : 'border border-slate-200 dark:border-slate-800 hover:border-amber-500/60'
      }`}
    >
      {imgStage === 'fallback' ? (
        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center text-sm font-bold text-slate-300">
          {champion.name.slice(0, 3).toUpperCase()}
        </div>
      ) : (
        <img
          src={src}
          alt={champion.name}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgStage((prev) => (prev === 'loading' ? 'square' : 'fallback'))}
          className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
        />
      )}

      {/* Voile contrasté mesuré pour garantir une lisibilité parfaite du nom */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent"
      />

      {isFreeRotation && (
        <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded bg-emerald-600/90 text-[10px] font-bold uppercase tracking-wider text-white border border-emerald-300/40 shadow">
          Gratuit
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-5">
        <div className="text-xs font-semibold text-white truncate leading-tight">
          {champion.name}
        </div>
        <div className="text-[10px] text-slate-300 truncate mt-0.5">
          {champion.tags.slice(0, 2).join(' · ')}
          {isJunglerChampion(champion.id) ? ' · Jungler' : ''}
        </div>
      </div>
    </button>
  );
}

export function ChampionEncyclopediaView({
  champions,
  patchVersion,
  recentChampionIds = [],
  onUseInBuilder,
}: ChampionEncyclopediaViewProps) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('Tous');
  const [damageFilter, setDamageFilter] = useState<DamageFilter>('Tous');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [onlyFreeRotation, setOnlyFreeRotation] = useState(false);
  const [freeRotationKeys, setFreeRotationKeys] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<string>(
    recentChampionIds[0] || champions[0]?.id || 'TahmKench',
  );
  const [level, setLevel] = useState<number>(11);
  const [activeSpellIdx, setActiveSpellIdx] = useState<number>(-1); // -1 = tous / passif en focus
  const [detail, setDetail] = useState<ChampionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/riot/rotation')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { available?: boolean; freeChampionIds?: number[] } | null) => {
        if (!cancelled && data?.available && Array.isArray(data.freeChampionIds)) {
          setFreeRotationKeys(new Set(data.freeChampionIds.map(Number)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = { Tous: champions.length, Jungler: 0 };
    for (const c of champions) {
      for (const t of c.tags) {
        counts[t] = (counts[t] || 0) + 1;
      }
      if (isJunglerChampion(c.id)) {
        counts.Jungler += 1;
      }
    }
    return counts;
  }, [champions]);

  const recentChampions = useMemo(() => {
    const unique = Array.from(new Set(recentChampionIds));
    return unique
      .map((id) =>
        champions.find(
          (c) =>
            c.id.toLowerCase() === id.toLowerCase() ||
            c.name.toLowerCase() === id.toLowerCase(),
        ),
      )
      .filter((c): c is ChampionSummary => Boolean(c))
      .slice(0, 6);
  }, [recentChampionIds, champions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = champions.filter((c) => {
      const matchesTag =
        tagFilter === 'Tous' ||
        (tagFilter === 'Jungler' ? isJunglerChampion(c.id) : c.tags.includes(tagFilter));
      const matchesText =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (isJunglerChampion(c.id) && ('jungler'.includes(q) || 'jungle'.includes(q)));
      if (!matchesTag || !matchesText) return false;
      if (damageFilter !== 'Tous') {
        const dmg = classifyChampionProfile(c).primaryDamage;
        if (dmg !== damageFilter) return false;
      }
      if (onlyFreeRotation && freeRotationKeys.size > 0) {
        if (!freeRotationKeys.has(Number(c.key))) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'hp') return b.stats.hp - a.stats.hp;
      if (sortBy === 'ad') return b.stats.attackdamage - a.stats.attackdamage;
      if (sortBy === 'range') return b.stats.attackrange - a.stats.attackrange;
      return a.name.localeCompare(b.name, 'fr');
    });
  }, [champions, search, tagFilter, damageFilter, sortBy, onlyFreeRotation, freeRotationKeys]);

  // Synchronise automatiquement la sélection si le champion actif est exclu par un filtre
  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((c) => c.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingDetail(true);
    setActiveSpellIdx(-1);
    fetch(`/api/ddragon/champion/${encodeURIComponent(selectedId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setDetail(data);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const activeChamp = useMemo(
    () => champions.find((c) => c.id === selectedId) || filtered[0] || champions[0],
    [champions, filtered, selectedId],
  );

  const profile = useMemo(
    () => (activeChamp ? classifyChampionProfile(activeChamp) : null),
    [activeChamp],
  );

  const statRows = useMemo(() => {
    if (!activeChamp) return [];
    const hp = Math.round(
      computeStatAtLevel(activeChamp.stats.hp, activeChamp.stats.hpperlevel, level),
    );
    const armor = computeStatAtLevel(
      activeChamp.stats.armor,
      activeChamp.stats.armorperlevel,
      level,
    );
    const mr = computeStatAtLevel(
      activeChamp.stats.spellblock,
      activeChamp.stats.spellblockperlevel,
      level,
    );
    const ad = computeStatAtLevel(
      activeChamp.stats.attackdamage,
      activeChamp.stats.attackdamageperlevel,
      level,
    );
    const as = computeAttackSpeedAtLevel(
      activeChamp.stats.attackspeed,
      activeChamp.stats.attackspeedperlevel,
      level,
    );
    return [
      { label: 'Points de vie', value: String(hp), pct: Math.min(100, (hp / 2800) * 100), color: 'bg-emerald-500' },
      { label: 'Armure', value: armor.toFixed(1), pct: Math.min(100, (armor / 140) * 100), color: 'bg-amber-500' },
      { label: 'Résistance magique', value: mr.toFixed(1), pct: Math.min(100, (mr / 90) * 100), color: 'bg-sky-500' },
      { label: 'Dégâts d’attaque', value: ad.toFixed(1), pct: Math.min(100, (ad / 160) * 100), color: 'bg-orange-500' },
      { label: 'Vitesse d’attaque', value: String(as), pct: Math.min(100, (Number(as) / 1.6) * 100), color: 'bg-yellow-400' },
      {
        label: 'Portée / Vitesse',
        value: `${activeChamp.stats.attackrange} / ${activeChamp.stats.movespeed}`,
        pct: Math.min(100, (activeChamp.stats.attackrange / 650) * 100),
        color: 'bg-indigo-400',
      },
    ];
  }, [activeChamp, level]);

  const hasActiveFilters =
    Boolean(search.trim()) || tagFilter !== 'Tous' || damageFilter !== 'Tous' || onlyFreeRotation;

  const resetAllFilters = () => {
    setSearch('');
    setTagFilter('Tous');
    setDamageFilter('Tous');
    setOnlyFreeRotation(false);
  };

  return (
    <div className="space-y-5">
      {/* En-tête ergonomique : Ligne 1 (Titre + Récents), Ligne 2 (Recherche + Filtres), Ligne 3 (8 Rôles/Classes alignés) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 sm:p-5 space-y-3.5">
        {/* Ligne 1 : Titre + Raccourcis récents sur la même ligne propre */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Encyclopédie des Champions
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
              {filtered.length} / {champions.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Patch {patchVersion} · Croissance Riot 1–18
            </span>
          </div>

          {recentChampions.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 mr-0.5">
                Récents :
              </span>
              {recentChampions.slice(0, 5).map((rc) => (
                <button
                  key={rc.id}
                  type="button"
                  onClick={() => {
                    resetAllFilters();
                    setSelectedId(rc.id);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs whitespace-nowrap shrink-0 transition-colors ${
                    selectedId === rc.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-700 dark:text-slate-300 hover:border-amber-500/60'
                  }`}
                >
                  <SafeGameIcon
                    src={rc.imageUrl}
                    alt={rc.name}
                    fallbackLabel={rc.name}
                    sizeClass="w-4 h-4"
                    className="rounded-full border-0"
                  />
                  <span>{rc.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ligne 2 : Barre de recherche large + filtres secondaires */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un champion, un titre ou « jungler »..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <select
              value={damageFilter}
              onChange={(e) => setDamageFilter(e.target.value as DamageFilter)}
              aria-label="Filtrer par profil de dégâts"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            >
              <option value="Tous">Dégâts : Tous</option>
              <option value="Physique">Dégâts Physiques</option>
              <option value="Magique">Dégâts Magiques</option>
              <option value="Hybride">Profil Hybride</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Trier les champions"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            >
              <option value="name">Tri : Nom A–Z</option>
              <option value="hp">Tri : PV de base</option>
              <option value="ad">Tri : Dégâts d’attaque</option>
              <option value="range">Tri : Portée d’attaque</option>
            </select>

            {freeRotationKeys.size > 0 && (
              <button
                type="button"
                onClick={() => setOnlyFreeRotation((prev) => !prev)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  onlyFreeRotation
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-700 dark:text-slate-300 hover:border-emerald-500/60'
                }`}
              >
                Rotation gratuite ({freeRotationKeys.size})
              </button>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-500/60 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Ligne 3 : Grille uniforme des 8 catégories (1 seule ligne alignée sur desktop, 4x2 sur mobile/tablette) */}
        <div
          role="tablist"
          aria-label="Filtrer par classe ou poste"
          className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800"
        >
          {TAG_OPTIONS.map((tag) => {
            const active = tagFilter === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTagFilter(tag.id)}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60 font-medium'
                }`}
              >
                <span>{tag.label}</span>
                <span
                  className={`font-mono tabular-nums text-[11px] ${
                    active ? 'opacity-90' : 'opacity-70'
                  }`}
                >
                  {tagCounts[tag.id] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Grille Portraits sticky (Gauche) + Inspecteur Splash & Sorts (Droite) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Roster portraits façon Champion Select */}
        <div className="xl:col-span-5 xl:sticky xl:top-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-2.5 space-y-2">
          <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Sélection : <strong className="text-slate-800 dark:text-slate-200">{activeChamp?.name}</strong>
            </span>
            <span className="font-mono tabular-nums">
              {filtered.length} affiché{filtered.length > 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucun champion ne correspond à vos filtres.
              </p>
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="max-h-[680px] xl:max-h-[calc(100vh-13rem)] overflow-y-auto thin-scrollbar p-1.5 pr-2.5 grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map((c) => (
                <ChampionPortraitTile
                  key={c.id}
                  champion={c}
                  selected={c.id === activeChamp?.id}
                  isFreeRotation={freeRotationKeys.has(Number(c.key))}
                  onSelect={() => setSelectedId(c.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panneau Inspecteur Détaillé avec Splash Art officiel */}
        {activeChamp && (
          <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden">
            {/* Hero Banner Splash Art */}
            <div className="relative h-52 sm:h-60 overflow-hidden bg-[#0B0E14]">
              <ChampionSplashBackdrop championId={activeChamp.id} championName={activeChamp.name} />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#121722] via-[#121722]/60 to-transparent"
              />
              <div className="relative z-10 h-full p-6 flex flex-col justify-end">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <SafeGameIcon
                      src={activeChamp.imageUrl}
                      alt={activeChamp.name}
                      fallbackLabel={activeChamp.name}
                      sizeClass="w-16 h-16"
                      className="ring-2 ring-amber-400/70 shadow-lg"
                    />
                    <div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">
                        {activeChamp.name}
                      </h2>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {activeChamp.title} · {activeChamp.tags.join(' / ')} · Dégâts{' '}
                        {profile?.primaryDamage} · {activeChamp.partype}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onUseInBuilder(activeChamp.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 shadow-md"
                  >
                    <span>Optimiser un build avec {activeChamp.name}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Statistiques Niveaux 1-18 avec préréglages rapides */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    Statistiques exactes au niveau{' '}
                    <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {level}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
                      {[1, 6, 11, 18].map((presetLvl) => (
                        <button
                          key={presetLvl}
                          type="button"
                          onClick={() => setLevel(presetLvl)}
                          className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-md transition-colors ${
                            level === presetLvl
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          Niv.{presetLvl}
                        </button>
                      ))}
                    </div>

                    <input
                      type="range"
                      min={1}
                      max={18}
                      value={level}
                      onChange={(e) => setLevel(Number(e.target.value))}
                      aria-label="Niveau du champion"
                      className="w-36 accent-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {statRows.map((st) => (
                    <div
                      key={st.label}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800 space-y-2"
                    >
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{st.label}</span>
                        <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                          {st.value}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${st.color}`}
                          style={{ width: `${Math.max(8, st.pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compétences interactives (Passif, A, Z, E, R) */}
              <div className="space-y-4 pt-5 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" aria-hidden="true" />
                    Compétences officielles (Data Dragon {patchVersion})
                  </div>
                  {detail && (
                    <button
                      type="button"
                      onClick={() => setActiveSpellIdx(-1)}
                      className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      {activeSpellIdx === -1 ? 'Affichage complet' : 'Tout afficher'}
                    </button>
                  )}
                </div>

                {loadingDetail ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse"
                      />
                    ))}
                  </div>
                ) : detail ? (
                  <>
                    {/* Barre d'icônes cliquables P / A / Z / E / R */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSpellIdx((v) => (v === 0 ? -1 : 0))}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                          activeSpellIdx === 0
                            ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-300 hover:border-amber-500/50'
                        }`}
                      >
                        <SafeGameIcon
                          src={detail.passive.imageUrl}
                          alt={detail.passive.name}
                          fallbackLabel="P"
                          sizeClass="w-6 h-6"
                        />
                        <span>Passif</span>
                      </button>
                      {detail.spells.map((spell, idx) => {
                        const keyLbl = ['A', 'Z', 'E', 'R'][idx] || 'S';
                        const active = activeSpellIdx === idx + 1;
                        return (
                          <button
                            key={spell.id}
                            type="button"
                            onClick={() => setActiveSpellIdx((v) => (v === idx + 1 ? -1 : idx + 1))}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                              active
                                ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-300 font-semibold'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-300 hover:border-amber-500/50'
                            }`}
                          >
                            <SafeGameIcon
                              src={spell.imageUrl}
                              alt={spell.name}
                              fallbackLabel={keyLbl}
                              sizeClass="w-6 h-6"
                            />
                            <span>{keyLbl}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      {(activeSpellIdx === -1 || activeSpellIdx === 0) && (
                        <div className="p-3.5 flex items-start gap-3 bg-white dark:bg-[#121722]">
                          <SafeGameIcon
                            src={detail.passive.imageUrl}
                            alt={detail.passive.name}
                            fallbackLabel="P"
                            sizeClass="w-10 h-10"
                          />
                          <div className="text-xs">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              Passif · {detail.passive.name}
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                              {stripTags(detail.passive.description)}
                            </p>
                          </div>
                        </div>
                      )}

                      {detail.spells.map((spell, idx) => {
                        if (activeSpellIdx !== -1 && activeSpellIdx !== idx + 1) return null;
                        return (
                          <div key={spell.id} className="p-3.5 flex items-start gap-3 bg-white dark:bg-[#121722]">
                            <SafeGameIcon
                              src={spell.imageUrl}
                              alt={spell.name}
                              fallbackLabel={['A', 'Z', 'E', 'R'][idx] || 'S'}
                              sizeClass="w-10 h-10"
                            />
                            <div className="text-xs flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {['A', 'Z', 'E', 'R'][idx]} · {spell.name}
                                </span>
                                <span className="font-mono tabular-nums text-[11px] text-amber-600 dark:text-amber-400">
                                  CD : {spell.cooldownBurn}s · Coût : {spell.costBurn} · Portée : {spell.rangeBurn}
                                </span>
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                                {stripTags(spell.description)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Conseils officiels Riot pour jouer / contrer */}
                    {(detail.allytips.length > 0 || detail.enemytips.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        {detail.allytips.length > 0 && (
                          <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 space-y-1.5 text-xs">
                            <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                              <Swords className="w-3.5 h-3.5" aria-hidden="true" />
                              Astuces avec {detail.name}
                            </div>
                            <ul className="space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                              {detail.allytips.slice(0, 3).map((tip, i) => (
                                <li key={i}>· {tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {detail.enemytips.length > 0 && (
                          <div className="p-3.5 rounded-xl border border-sky-500/25 bg-sky-500/5 space-y-1.5 text-xs">
                            <div className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                              Comment le contrer
                            </div>
                            <ul className="space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                              {detail.enemytips.slice(0, 3).map((tip, i) => (
                                <li key={i}>· {tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
