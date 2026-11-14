import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  classifyChampionProfile,
  computeAttackSpeedAtLevel,
  computeStatAtLevel,
} from '../engines/championEngine.ts';
import type { ChampionDetail, ChampionSummary } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

interface ChampionEncyclopediaViewProps {
  champions: ChampionSummary[];
  patchVersion: string;
  onUseInBuilder: (championId: string) => void;
}

const TAGS = ['Tous', 'Fighter', 'Mage', 'Assassin', 'Tank', 'Marksman', 'Support'];

function stripTags(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function ChampionEncyclopediaView({
  champions,
  patchVersion,
  onUseInBuilder,
}: ChampionEncyclopediaViewProps) {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('Tous');
  const [selectedId, setSelectedId] = useState<string>(champions[0]?.id || 'Ahri');
  const [level, setLevel] = useState<number>(11);
  const [detail, setDetail] = useState<ChampionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return champions.filter((c) => {
      const matchesTag = tagFilter === 'Tous' || c.tags.includes(tagFilter);
      const matchesText =
        !q || c.name.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
      return matchesTag && matchesText;
    });
  }, [champions, search, tagFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
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
    () => champions.find((c) => c.id === selectedId) || champions[0],
    [champions, selectedId],
  );

  const profile = useMemo(
    () => (activeChamp ? classifyChampionProfile(activeChamp) : null),
    [activeChamp],
  );

  return (
    <div className="space-y-6">
      {/* Barre de recherche & filtres de classe */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Encyclopédie universelle des champions ({champions.length})
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Source : Data Dragon Officiel · Patch {patchVersion} · Formules de croissance Riot niveaux 1–18
            </p>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par nom..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 w-fit">
          {TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tagFilter === tag
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* Grille Champions + Inspecteur détaillé */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 max-h-[680px] overflow-y-auto grid grid-cols-3 sm:grid-cols-4 gap-2">
          {filtered.map((c) => {
            const selected = c.id === selectedId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border text-center transition-colors ${
                  selected
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <SafeGameIcon
                  src={c.imageUrl}
                  alt={c.name}
                  fallbackLabel={c.name}
                  sizeClass="w-11 h-11"
                />
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate w-full">
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Panneau Inspecteur */}
        {activeChamp && (
          <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <SafeGameIcon
                  src={activeChamp.imageUrl}
                  alt={activeChamp.name}
                  fallbackLabel={activeChamp.name}
                  sizeClass="w-14 h-14"
                />
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {activeChamp.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeChamp.title} · {activeChamp.tags.join(' / ')} ·{' '}
                    {profile?.primaryDamage}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onUseInBuilder(activeChamp.id)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
              >
                Optimiser un build avec {activeChamp.name}
              </button>
            </div>

            {/* Curseur Niveau 1-18 */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Statistiques exactes au niveau {level}
                </span>
                <input
                  type="range"
                  min={1}
                  max={18}
                  value={level}
                  onChange={(e) => setLevel(Number(e.target.value))}
                  aria-label="Niveau du champion"
                  className="w-44 accent-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">Points de vie</div>
                  <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {Math.round(
                      computeStatAtLevel(activeChamp.stats.hp, activeChamp.stats.hpperlevel, level),
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">Armure</div>
                  <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {computeStatAtLevel(
                      activeChamp.stats.armor,
                      activeChamp.stats.armorperlevel,
                      level,
                    ).toFixed(1)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">Résistance magique</div>
                  <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {computeStatAtLevel(
                      activeChamp.stats.spellblock,
                      activeChamp.stats.spellblockperlevel,
                      level,
                    ).toFixed(1)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">Dégâts d’attaque</div>
                  <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {computeStatAtLevel(
                      activeChamp.stats.attackdamage,
                      activeChamp.stats.attackdamageperlevel,
                      level,
                    ).toFixed(1)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">Vitesse d’attaque</div>
                  <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {computeAttackSpeedAtLevel(
                      activeChamp.stats.attackspeed,
                      activeChamp.stats.attackspeedperlevel,
                      level,
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 font-sans">Portée / Vitesse</div>
                  <div className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                    {activeChamp.stats.attackrange} / {activeChamp.stats.movespeed}
                  </div>
                </div>
              </div>
            </div>

            {/* Passif & Sorts officiels */}
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Compétences officielles (Data Dragon {patchVersion})
              </div>

              {loadingDetail ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse"
                    />
                  ))}
                </div>
              ) : detail ? (
                <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <div className="p-3.5 flex items-start gap-3">
                    <SafeGameIcon
                      src={detail.passive.imageUrl}
                      alt={detail.passive.name}
                      fallbackLabel="P"
                      sizeClass="w-9 h-9"
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
                  {detail.spells.map((spell, idx) => (
                    <div key={spell.id} className="p-3.5 flex items-start gap-3">
                      <SafeGameIcon
                        src={spell.imageUrl}
                        alt={spell.name}
                        fallbackLabel={['A', 'Z', 'E', 'R'][idx] || 'S'}
                        sizeClass="w-9 h-9"
                      />
                      <div className="text-xs flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {['A', 'Z', 'E', 'R'][idx]} · {spell.name}
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                            CD : {spell.cooldownBurn}s · Coût : {spell.costBurn}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                          {stripTags(spell.description)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
