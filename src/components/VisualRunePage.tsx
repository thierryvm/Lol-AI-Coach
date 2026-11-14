import { useMemo, useState, type ReactNode } from 'react';
import { LayoutGrid, List, Pencil } from 'lucide-react';
import type { RuneSlotItem, RuneTree } from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';

export interface VisualRunePageProps {
  runeTrees: RuneTree[];
  primaryTreeId: number | null;
  secondaryTreeId: number | null;
  keystoneId: number | null;
  selectedRuneIds: number[];
  statRuneIds?: number[];
  /** Indices [offense, flex, defense] (0..2) si déjà résolus */
  shardIndicesOverride?: [number, number, number];
  /** IDs des runes recommandées pour afficher les différences sur la page équipée */
  compareRuneIds?: Set<number>;
  pageTitle?: string;
  sourceLabel?: string;
  championName?: string;
  /** Contrôles supplémentaires dans l'en-tête (ex: Conseillée vs Équipée) */
  headerActions?: ReactNode;
  /** Explication stratégique sous la page de runes */
  footerNote?: ReactNode;
}

interface TreeVisualTheme {
  key: 'resolve' | 'domination' | 'precision' | 'sorcery' | 'inspiration';
  subtitle: string;
  accentHex: string;
  accentGlowHex: string;
  textClass: string;
  borderClass: string;
  ringClass: string;
  stemClass: string;
  pillBgClass: string;
  glowShadow: string;
  backdropGradient: string;
}

const TREE_THEMES: Record<TreeVisualTheme['key'], TreeVisualTheme> = {
  resolve: {
    key: 'resolve',
    subtitle: 'Vie éternelle. Durabilité et contrôles de foule.',
    accentHex: '#34D399',
    accentGlowHex: 'rgba(16, 185, 129, 0.38)',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/40',
    ringClass: 'ring-emerald-400',
    stemClass: 'from-emerald-400/70 via-emerald-500/35 to-emerald-500/10',
    pillBgClass: 'bg-emerald-500/15',
    glowShadow: 'shadow-[0_0_24px_rgba(16,185,129,0.45)]',
    backdropGradient:
      'radial-gradient(circle at 82% 48%, rgba(16, 185, 129, 0.22) 0%, rgba(11, 23, 36, 0.92) 55%, rgba(7, 14, 24, 1) 100%)',
  },
  domination: {
    key: 'domination',
    subtitle: 'Chasse et élimination de proies. Dégâts immédiats et accès aux cibles.',
    accentHex: '#FB7185',
    accentGlowHex: 'rgba(244, 63, 94, 0.42)',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/40',
    ringClass: 'ring-rose-500',
    stemClass: 'from-rose-400/70 via-rose-500/35 to-rose-500/10',
    pillBgClass: 'bg-rose-500/15',
    glowShadow: 'shadow-[0_0_24px_rgba(244,63,94,0.45)]',
    backdropGradient:
      'radial-gradient(circle at 82% 48%, rgba(225, 29, 72, 0.24) 0%, rgba(19, 13, 24, 0.94) 55%, rgba(9, 12, 20, 1) 100%)',
  },
  precision: {
    key: 'precision',
    subtitle: 'Devenez une légende. Attaques améliorées et dégâts soutenus.',
    accentHex: '#FBBF24',
    accentGlowHex: 'rgba(245, 158, 11, 0.4)',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-400/45',
    ringClass: 'ring-amber-400',
    stemClass: 'from-amber-300/70 via-amber-500/35 to-amber-500/10',
    pillBgClass: 'bg-amber-500/15',
    glowShadow: 'shadow-[0_0_24px_rgba(245,158,11,0.42)]',
    backdropGradient:
      'radial-gradient(circle at 82% 48%, rgba(217, 119, 6, 0.22) 0%, rgba(17, 17, 25, 0.94) 55%, rgba(8, 13, 22, 1) 100%)',
  },
  sorcery: {
    key: 'sorcery',
    subtitle: 'Déchaînez la destruction. Compétences et manipulation des ressources.',
    accentHex: '#818CF8',
    accentGlowHex: 'rgba(99, 102, 241, 0.42)',
    textClass: 'text-indigo-300',
    borderClass: 'border-indigo-400/45',
    ringClass: 'ring-indigo-400',
    stemClass: 'from-indigo-400/70 via-indigo-500/35 to-indigo-500/10',
    pillBgClass: 'bg-indigo-500/15',
    glowShadow: 'shadow-[0_0_24px_rgba(99,102,241,0.45)]',
    backdropGradient:
      'radial-gradient(circle at 82% 48%, rgba(99, 102, 241, 0.24) 0%, rgba(13, 15, 32, 0.94) 55%, rgba(8, 12, 22, 1) 100%)',
  },
  inspiration: {
    key: 'inspiration',
    subtitle: 'Trompez les mortels. Outils créatifs et modification des règles.',
    accentHex: '#22D3EE',
    accentGlowHex: 'rgba(6, 182, 212, 0.4)',
    textClass: 'text-cyan-300',
    borderClass: 'border-cyan-400/45',
    ringClass: 'ring-cyan-400',
    stemClass: 'from-cyan-400/70 via-cyan-500/35 to-cyan-500/10',
    pillBgClass: 'bg-cyan-500/15',
    glowShadow: 'shadow-[0_0_24px_rgba(6,182,212,0.42)]',
    backdropGradient:
      'radial-gradient(circle at 82% 48%, rgba(8, 145, 178, 0.24) 0%, rgba(10, 20, 32, 0.94) 55%, rgba(7, 13, 22, 1) 100%)',
  },
};

function getTreeTheme(tree?: RuneTree | null): TreeVisualTheme {
  const key = (tree?.key || '').toLowerCase();
  if (key.includes('resolve') || tree?.id === 8400) return TREE_THEMES.resolve;
  if (key.includes('domination') || tree?.id === 8100) return TREE_THEMES.domination;
  if (key.includes('precision') || tree?.id === 8000) return TREE_THEMES.precision;
  if (key.includes('sorcery') || tree?.id === 8200) return TREE_THEMES.sorcery;
  if (key.includes('inspiration') || tree?.id === 8300) return TREE_THEMES.inspiration;
  return TREE_THEMES.precision;
}

function cleanRuneDesc(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const STATMOD_BASE = 'https://ddragon.leagueoflegends.com/cdn/img/perk-images/StatMods';

interface ShardOption {
  id: number;
  shortLabel: string;
  clientLabel: string;
  iconUrl: string;
}

const SHARD_GRID: Array<{ rowLabel: string; options: ShardOption[] }> = [
  {
    rowLabel: 'Offense',
    options: [
      {
        id: 5008,
        shortLabel: '+9 AD/AP',
        clientLabel: '+9 force adaptative',
        iconUrl: `${STATMOD_BASE}/StatModsAdaptiveForceIcon.png`,
      },
      {
        id: 5005,
        shortLabel: '+10% AS',
        clientLabel: "+10% vitesse d'attaque",
        iconUrl: `${STATMOD_BASE}/StatModsAttackSpeedIcon.png`,
      },
      {
        id: 5007,
        shortLabel: '+8 Hâte',
        clientLabel: '+8 accélération de compétence',
        iconUrl: `${STATMOD_BASE}/StatModsCDRScalingIcon.png`,
      },
    ],
  },
  {
    rowLabel: 'Flex',
    options: [
      {
        id: 5008,
        shortLabel: '+9 AD/AP',
        clientLabel: '+9 force adaptative',
        iconUrl: `${STATMOD_BASE}/StatModsAdaptiveForceIcon.png`,
      },
      {
        id: 5010,
        shortLabel: '+2% Vit.',
        clientLabel: '+2% vitesse de déplacement',
        iconUrl: `${STATMOD_BASE}/StatModsMovementSpeedIcon.png`,
      },
      {
        id: 5001,
        shortLabel: '+PV/niv',
        clientLabel: '+10 - 180 PV (selon le niveau)',
        iconUrl: `${STATMOD_BASE}/StatModsHealthScalingIcon.png`,
      },
    ],
  },
  {
    rowLabel: 'Défense',
    options: [
      {
        id: 5011,
        shortLabel: '+65 PV',
        clientLabel: '+65 PV fixes',
        iconUrl: `${STATMOD_BASE}/StatModsHealthPlusIcon.png`,
      },
      {
        id: 5013,
        shortLabel: '+10% Tén.',
        clientLabel: '+10% ténacité et résistance aux ralentissements',
        iconUrl: `${STATMOD_BASE}/StatModsTenacityIcon.png`,
      },
      {
        id: 5001,
        shortLabel: '+PV/niv',
        clientLabel: '+10 - 180 PV (selon le niveau)',
        iconUrl: `${STATMOD_BASE}/StatModsHealthScalingIcon.png`,
      },
    ],
  },
];

function mapStatRuneToRowIndex(statIds: number[]): [number, number, number] {
  const [s1, s2, s3] = statIds;
  const r1 = s1 === 5005 ? 1 : s1 === 5007 ? 2 : 0;
  const r2 = s2 === 5010 ? 1 : s2 === 5001 ? 2 : 0;
  const r3 = s3 === 5013 ? 1 : s3 === 5001 ? 2 : 0;
  return [r1, r2, r3];
}

function RunicMonolithArt({
  primaryTree,
  secondaryTree,
  keystoneRune,
  theme,
}: {
  primaryTree: RuneTree;
  secondaryTree: RuneTree | null;
  keystoneRune: RuneSlotItem | null;
  theme: TreeVisualTheme;
}) {
  return (
    <div className="relative h-full min-h-[260px] flex flex-col items-center justify-center select-none overflow-hidden rounded-xl border border-[#C8AA6E]/20 bg-[#070E19]/70 px-4 py-6">
      {/* Halo atmosphérique derrière le pilier runique */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 44%, ${theme.accentGlowHex} 0%, transparent 66%)`,
        }}
      />

      {/* Sanctuaire / Pilier runique stylisé inspiré du client League of Legends */}
      <svg
        viewBox="0 0 240 280"
        className="w-48 h-56 relative z-10 drop-shadow-[0_14px_30px_rgba(0,0,0,0.65)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`stone-${theme.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B4252" />
            <stop offset="50%" stopColor="#1E2533" />
            <stop offset="100%" stopColor="#0E141F" />
          </linearGradient>
          <linearGradient id={`gold-${theme.key}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F0E6D2" />
            <stop offset="50%" stopColor="#C8AA6E" />
            <stop offset="100%" stopColor="#785A28" />
          </linearGradient>
        </defs>

        {/* Anneau runique céleste en arrière-plan */}
        <circle
          cx="120"
          cy="118"
          r="92"
          fill="none"
          stroke={theme.accentHex}
          strokeOpacity="0.22"
          strokeWidth="1.2"
          strokeDasharray="6 6"
        />
        <circle
          cx="120"
          cy="118"
          r="72"
          fill="none"
          stroke={`url(#gold-${theme.key})`}
          strokeOpacity="0.32"
          strokeWidth="1"
        />

        {/* Éclats flottants autour du monolithe */}
        <polygon points="36,112 52,102 44,126" fill={theme.accentHex} fillOpacity="0.32" />
        <polygon points="204,104 186,96 196,120" fill={theme.accentHex} fillOpacity="0.32" />
        <polygon points="120,10 128,44 120,56 112,44" fill={theme.accentHex} fillOpacity="0.55" />

        {/* Corps architectural du monolithe */}
        <path
          d="M72 246 L68 92 L90 66 L150 66 L172 92 L168 246 Z"
          fill={`url(#stone-${theme.key})`}
          stroke={`url(#gold-${theme.key})`}
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
        {/* Colonnes latérales sculptées */}
        <rect x="80" y="96" width="12" height="132" rx="2" fill="#131924" stroke="#C8AA6E" strokeOpacity="0.25" />
        <rect x="148" y="96" width="12" height="132" rx="2" fill="#131924" stroke="#C8AA6E" strokeOpacity="0.25" />

        {/* Écrin hextech central */}
        <polygon
          points="120,86 152,106 152,146 120,166 88,146 88,106"
          fill="#070D17"
          stroke={`url(#gold-${theme.key})`}
          strokeWidth="2"
        />
        <polygon
          points="120,94 144,110 144,142 120,158 96,142 96,110"
          fill={theme.accentHex}
          fillOpacity="0.14"
        />

        {/* Socle rocheux */}
        <path
          d="M42 252 L70 226 L170 226 L198 252 Z"
          fill="#111827"
          stroke="#C8AA6E"
          strokeOpacity="0.35"
        />
      </svg>

      {/* Emblème officiel de la Rune Fondamentale incrusté au centre du monolithe */}
      <div className="absolute top-[118px] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
        {keystoneRune ? (
          <div
            className={`p-1 rounded-full bg-[#09121F] ring-2 ${theme.ringClass} ${theme.glowShadow}`}
          >
            <SafeGameIcon
              src={keystoneRune.imageUrl}
              alt={keystoneRune.name}
              fallbackLabel={keystoneRune.name}
              sizeClass="w-12 h-12"
              className="rounded-full border-0"
            />
          </div>
        ) : (
          <SafeGameIcon
            src={primaryTree.imageUrl}
            alt={primaryTree.name}
            fallbackLabel={primaryTree.name}
            sizeClass="w-11 h-11"
            className="rounded-full border-0"
          />
        )}
      </div>

      {/* Synthèse des deux branches en bas du sanctuaire */}
      <div className="relative z-20 mt-2 flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
          <SafeGameIcon
            src={primaryTree.imageUrl}
            alt={primaryTree.name}
            fallbackLabel={primaryTree.name}
            sizeClass="w-5 h-5"
            className="rounded-full border-0"
          />
          <span className={theme.textClass}>{primaryTree.name}</span>
        </div>
        {secondaryTree && (
          <>
            <span className="text-[#C8AA6E]/60" aria-hidden="true">+</span>
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <SafeGameIcon
                src={secondaryTree.imageUrl}
                alt={secondaryTree.name}
                fallbackLabel={secondaryTree.name}
                sizeClass="w-5 h-5"
                className="rounded-full border-0"
              />
              <span>{secondaryTree.name}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function VisualRunePage({
  runeTrees,
  primaryTreeId,
  secondaryTreeId,
  keystoneId,
  selectedRuneIds,
  statRuneIds = [],
  shardIndicesOverride,
  compareRuneIds,
  pageTitle,
  sourceLabel,
  championName,
  headerActions,
  footerNote,
}: VisualRunePageProps) {
  // Mode d'affichage identique au client LoL : "client" (liste fidèle) par défaut ou "grid" (grille complète)
  const [viewStyle, setViewStyle] = useState<'client' | 'grid'>('client');
  const [showDetailedDesc, setShowDetailedDesc] = useState(true);
  const [inspectedItem, setInspectedItem] = useState<{
    name: string;
    desc: string;
    iconUrl?: string;
  } | null>(null);

  const primaryTree = useMemo(
    () => runeTrees.find((t) => t.id === primaryTreeId) || runeTrees[0] || null,
    [runeTrees, primaryTreeId],
  );
  const secondaryTree = useMemo(
    () =>
      runeTrees.find((t) => t.id === secondaryTreeId) ||
      runeTrees.find((t) => t.id !== primaryTree?.id) ||
      null,
    [runeTrees, secondaryTreeId, primaryTree],
  );

  const primaryTheme = getTreeTheme(primaryTree);
  const secondaryTheme = getTreeTheme(secondaryTree);
  const activeSet = useMemo(() => new Set(selectedRuneIds), [selectedRuneIds]);

  const effectiveKeystoneId = keystoneId || selectedRuneIds[0] || null;
  const keystoneRune = useMemo(
    () => primaryTree?.slots?.[0]?.runes.find((r) => r.id === effectiveKeystoneId) || null,
    [primaryTree, effectiveKeystoneId],
  );

  // 1 rune choisie par rangée mineure (paliers 1, 2, 3)
  const selectedPrimaryMinors = useMemo(
    () =>
      (primaryTree?.slots || [])
        .slice(1, 4)
        .map((slot) => slot.runes.find((r) => activeSet.has(r.id)))
        .filter((r): r is RuneSlotItem => Boolean(r)),
    [primaryTree, activeSet],
  );

  const selectedSecondaryMinors = useMemo(
    () =>
      (secondaryTree?.slots || [])
        .slice(1, 4)
        .flatMap((slot) => slot.runes)
        .filter((r) => activeSet.has(r.id))
        .slice(0, 2),
    [secondaryTree, activeSet],
  );

  const shardIndices = useMemo(
    () => shardIndicesOverride || mapStatRuneToRowIndex(statRuneIds),
    [shardIndicesOverride, statRuneIds],
  );

  const selectedShards = useMemo(
    () =>
      SHARD_GRID.map((row, idx) => row.options[shardIndices[idx] ?? 0] || row.options[0]),
    [shardIndices],
  );

  if (!primaryTree) return null;

  const inspectRune = (rune: RuneSlotItem) => {
    setInspectedItem({
      name: rune.name,
      desc: cleanRuneDesc(rune.longDesc || rune.shortDesc),
      iconUrl: rune.imageUrl,
    });
  };

  return (
    <section
      className="rounded-xl border border-[#C8AA6E]/35 overflow-hidden shadow-lg"
      style={{ background: primaryTheme.backdropGradient }}
    >
      {/* Barre supérieure façon éditeur de runes League of Legends */}
      <div className="px-5 py-3.5 border-b border-[#C8AA6E]/25 bg-[#08101C]/80 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full border border-[#C8AA6E]/60 bg-[#0D1829] flex items-center justify-center shrink-0">
            <Pencil className="w-3.5 h-3.5 text-[#C8AA6E]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-[#F0E6D2] tracking-tight truncate">
              {pageTitle ||
                (championName ? `Page de runes · ${championName}` : `Page de runes · ${primaryTree.name}`)}
            </h2>
            <p className="text-[11px] text-[#A09B8C] truncate">
              <span>{primaryTree.name}</span>
              {secondaryTree && (
                <>
                  <span className="mx-1.5" aria-hidden="true">+</span>
                  <span>{secondaryTree.name}</span>
                </>
              )}
              {sourceLabel && (
                <>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span>Source : {sourceLabel}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {headerActions && <div className="shrink-0">{headerActions}</div>}
      </div>

      {/* Corps principal : Vue Client LoL fidèle OU Vue Grille complète */}
      <div className="p-5 sm:p-6">
        {viewStyle === 'client' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* COLONNE 1 : Arbre Principal (Ligne verticale + Fondamentale + 3 Mineures avec descriptions) */}
            <div className="lg:col-span-4 relative pl-1">
              {/* Ligne verticale continue façon client Riot */}
              <div
                aria-hidden="true"
                className={`absolute left-[29px] top-12 bottom-6 w-[2px] bg-gradient-to-b ${primaryTheme.stemClass}`}
              />

              <div className="space-y-4">
                {/* En-tête Arbre Principal */}
                <div className="relative z-10 flex items-start gap-3.5">
                  <div
                    className={`w-14 h-14 rounded-full bg-[#09121F] border-2 border-[#C8AA6E]/70 flex items-center justify-center shrink-0 ${primaryTheme.glowShadow}`}
                  >
                    <SafeGameIcon
                      src={primaryTree.imageUrl}
                      alt={primaryTree.name}
                      fallbackLabel={primaryTree.name}
                      sizeClass="w-9 h-9"
                      className="rounded-full border-0"
                    />
                  </div>
                  <div className="pt-0.5 min-w-0">
                    <div className="text-sm font-bold uppercase tracking-wider text-[#F0E6D2]">
                      {primaryTree.name}
                    </div>
                    <p className="text-xs text-[#A09B8C] leading-snug mt-0.5">
                      {primaryTheme.subtitle}
                    </p>
                  </div>
                </div>

                {/* Libellé Runes Fondamentales */}
                <div className="pl-[68px] pt-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#C8AA6E]/80 pb-1.5 border-b border-[#C8AA6E]/25">
                    Runes fondamentales
                  </div>
                </div>

                {/* Rune Fondamentale (Keystone) */}
                {keystoneRune && (
                  <button
                    type="button"
                    onClick={() => inspectRune(keystoneRune)}
                    onMouseEnter={() => inspectRune(keystoneRune)}
                    className="relative z-10 w-full flex items-start gap-3.5 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.03] focus:outline-none"
                  >
                    <div
                      className={`w-14 h-14 rounded-full bg-[#08101C] flex items-center justify-center shrink-0 ring-2 ${primaryTheme.ringClass} ${primaryTheme.glowShadow} group-hover:scale-105 transition-transform`}
                    >
                      <SafeGameIcon
                        src={keystoneRune.imageUrl}
                        alt={keystoneRune.name}
                        fallbackLabel={keystoneRune.name}
                        sizeClass="w-12 h-12"
                        className="rounded-full border-0"
                      />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-bold uppercase tracking-wide ${primaryTheme.textClass}`}>
                          {keystoneRune.name}
                        </span>
                        {compareRuneIds && !compareRuneIds.has(keystoneRune.id) && (
                          <span className="text-[10px] font-semibold text-sky-400">
                            · Différente de la méta
                          </span>
                        )}
                      </div>
                      {showDetailedDesc && (
                        <p className="text-[11px] text-[#C8C3B4] leading-relaxed mt-0.5 line-clamp-3">
                          {cleanRuneDesc(keystoneRune.shortDesc)}
                        </p>
                      )}
                    </div>
                  </button>
                )}

                <div className="pl-[68px]">
                  <div className="border-t border-[#C8AA6E]/20" />
                </div>

                {/* 3 Runes mineures sélectionnées */}
                <div className="space-y-3.5">
                  {selectedPrimaryMinors.map((rune) => {
                    const differs = compareRuneIds && !compareRuneIds.has(rune.id);
                    return (
                      <button
                        key={rune.id}
                        type="button"
                        onClick={() => inspectRune(rune)}
                        onMouseEnter={() => inspectRune(rune)}
                        className="relative z-10 w-full flex items-start gap-4 pl-2 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.03] focus:outline-none"
                      >
                        <div
                          className={`w-10 h-10 rounded-full bg-[#08101C] flex items-center justify-center shrink-0 ring-2 ${
                            differs ? 'ring-sky-400' : 'ring-[#C8AA6E]/80'
                          } group-hover:scale-105 transition-transform`}
                        >
                          <SafeGameIcon
                            src={rune.imageUrl}
                            alt={rune.name}
                            fallbackLabel={rune.name}
                            sizeClass="w-9 h-9"
                            className="rounded-full border-0"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-[#F0E6D2]">
                              {rune.name}
                            </span>
                            {differs && (
                              <span className="text-[10px] font-semibold text-sky-400">
                                · Hors méta
                              </span>
                            )}
                          </div>
                          {showDetailedDesc && (
                            <p className="text-[11px] text-[#A09B8C] leading-snug mt-0.5 line-clamp-2">
                              {cleanRuneDesc(rune.shortDesc)}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* COLONNE 2 : Arbre Secondaire (2 runes) + 3 Fragments de Statistiques */}
            <div className="lg:col-span-4 relative flex flex-col justify-between gap-5 pl-1">
              {secondaryTree && (
                <div className="relative space-y-4">
                  {/* Ligne verticale secondaire */}
                  <div
                    aria-hidden="true"
                    className={`absolute left-[27px] top-12 bottom-4 w-[2px] bg-gradient-to-b ${secondaryTheme.stemClass}`}
                  />

                  <div className="relative z-10 flex items-start gap-3.5">
                    <div className="w-13 h-13 rounded-full bg-[#09121F] border-2 border-[#C8AA6E]/65 flex items-center justify-center shrink-0">
                      <SafeGameIcon
                        src={secondaryTree.imageUrl}
                        alt={secondaryTree.name}
                        fallbackLabel={secondaryTree.name}
                        sizeClass="w-8 h-8"
                        className="rounded-full border-0"
                      />
                    </div>
                    <div className="pt-0.5 min-w-0">
                      <div className="text-sm font-bold uppercase tracking-wider text-[#F0E6D2]">
                        {secondaryTree.name}
                      </div>
                      <p className="text-xs text-[#A09B8C] leading-snug mt-0.5">
                        {secondaryTheme.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3.5 pt-2">
                    {selectedSecondaryMinors.map((rune) => {
                      const differs = compareRuneIds && !compareRuneIds.has(rune.id);
                      return (
                        <button
                          key={rune.id}
                          type="button"
                          onClick={() => inspectRune(rune)}
                          onMouseEnter={() => inspectRune(rune)}
                          className="relative z-10 w-full flex items-start gap-4 pl-2 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.03] focus:outline-none"
                        >
                          <div
                            className={`w-10 h-10 rounded-full bg-[#08101C] flex items-center justify-center shrink-0 ring-2 ${
                              differs ? 'ring-sky-400' : 'ring-[#C8AA6E]/75'
                            } group-hover:scale-105 transition-transform`}
                          >
                            <SafeGameIcon
                              src={rune.imageUrl}
                              alt={rune.name}
                              fallbackLabel={rune.name}
                              sizeClass="w-9 h-9"
                              className="rounded-full border-0"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wide text-[#F0E6D2]">
                                {rune.name}
                              </span>
                              {differs && (
                                <span className="text-[10px] font-semibold text-sky-400">
                                  · Hors méta
                                </span>
                              )}
                            </div>
                            {showDetailedDesc && (
                              <p className="text-[11px] text-[#A09B8C] leading-snug mt-0.5 line-clamp-2">
                                {cleanRuneDesc(rune.shortDesc)}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Fragments de statistiques façon Client LoL (icônes rondes dorées + texte aligné) */}
              <div className="pt-4 border-t border-[#C8AA6E]/20 space-y-2.5 pl-3">
                {selectedShards.map((shard, idx) => (
                  <button
                    key={`${shard.id}-${idx}`}
                    type="button"
                    onClick={() =>
                      setInspectedItem({
                        name: `Fragment ${SHARD_GRID[idx].rowLabel} : ${shard.clientLabel}`,
                        desc: `Bonus actif dès le niveau 1 sur votre champion.`,
                        iconUrl: shard.iconUrl,
                      })
                    }
                    className="w-full flex items-center gap-3.5 text-left rounded-md py-1 hover:bg-white/[0.03] transition-colors focus:outline-none"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#08101C] border border-[#C8AA6E]/80 flex items-center justify-center shrink-0">
                      <SafeGameIcon
                        src={shard.iconUrl}
                        alt={shard.clientLabel}
                        fallbackLabel={shard.shortLabel}
                        sizeClass="w-4 h-4"
                        className="rounded-full border-0"
                      />
                    </div>
                    <span className="text-xs text-[#C8C3B4] font-medium">
                      {shard.clientLabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* COLONNE 3 : Monolithe Runique dynamique + Fiche détaillée de la rune survolée */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-3">
              <RunicMonolithArt
                primaryTree={primaryTree}
                secondaryTree={secondaryTree}
                keystoneRune={keystoneRune}
                theme={primaryTheme}
              />

              {inspectedItem && (
                <div className="rounded-lg border border-[#C8AA6E]/25 bg-[#08101C]/85 px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
                  {inspectedItem.iconUrl && (
                    <SafeGameIcon
                      src={inspectedItem.iconUrl}
                      alt={inspectedItem.name}
                      fallbackLabel={inspectedItem.name}
                      sizeClass="w-6 h-6"
                      className="rounded-full border-0 mt-0.5 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-[#F0E6D2]">{inspectedItem.name}</div>
                    <p className="text-[11px] text-[#A09B8C] leading-relaxed mt-0.5 line-clamp-3">
                      {inspectedItem.desc}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* VUE GRILLE COMPLÈTE (toutes les runes cliquables/inspectables comme dans l'éditeur LoL) */
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              {/* Arbre Principal Grille */}
              <div className="lg:col-span-5 rounded-xl border border-[#C8AA6E]/25 bg-[#08101C]/85 p-4 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#C8AA6E]/20">
                  <div className="flex items-center gap-2.5">
                    <SafeGameIcon
                      src={primaryTree.imageUrl}
                      alt={primaryTree.name}
                      fallbackLabel={primaryTree.name}
                      sizeClass="w-8 h-8"
                      className="rounded-full border-0"
                    />
                    <div>
                      <div className={`text-sm font-bold uppercase tracking-wide ${primaryTheme.textClass}`}>
                        {primaryTree.name}
                      </div>
                      <div className="text-[11px] text-[#A09B8C]">Arbre principal · 4 runes</div>
                    </div>
                  </div>
                  {keystoneRune && (
                    <span className={`text-xs font-semibold ${primaryTheme.textClass}`}>
                      ★ {keystoneRune.name}
                    </span>
                  )}
                </div>

                <div className="relative space-y-3.5 py-1">
                  <div
                    aria-hidden="true"
                    className={`hidden sm:block absolute left-1/2 top-4 bottom-4 w-0.5 -translate-x-1/2 bg-gradient-to-b ${primaryTheme.stemClass}`}
                  />

                  {primaryTree.slots?.[0] && (
                    <div className="relative z-10 pb-2 border-b border-[#C8AA6E]/15">
                      <div className="text-[10px] uppercase tracking-wider text-center text-[#A09B8C] mb-2">
                        Runes fondamentales
                      </div>
                      <div className="flex items-center justify-around gap-2">
                        {primaryTree.slots[0].runes.map((rune) => {
                          const active = rune.id === effectiveKeystoneId;
                          const differs = active && compareRuneIds && !compareRuneIds.has(rune.id);
                          return (
                            <button
                              key={rune.id}
                              type="button"
                              onMouseEnter={() => inspectRune(rune)}
                              onClick={() => inspectRune(rune)}
                              title={`${rune.name} — ${cleanRuneDesc(rune.shortDesc)}`}
                              className={`p-0.5 rounded-full bg-[#060C16] transition-all focus:outline-none ${
                                active
                                  ? `ring-2 ${differs ? 'ring-sky-400' : primaryTheme.ringClass} ${primaryTheme.glowShadow} scale-110`
                                  : 'opacity-30 grayscale hover:opacity-85 hover:grayscale-0 border border-slate-700/70'
                              }`}
                            >
                              <SafeGameIcon
                                src={rune.imageUrl}
                                alt={rune.name}
                                fallbackLabel={rune.name}
                                sizeClass="w-12 h-12"
                                className="rounded-full border-0"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {primaryTree.slots.slice(1, 4).map((slot, rowIdx) => (
                    <div key={rowIdx} className="relative z-10 flex items-center justify-around gap-2 pt-1">
                      {slot.runes.map((rune) => {
                        const active = activeSet.has(rune.id);
                        const differs = active && compareRuneIds && !compareRuneIds.has(rune.id);
                        return (
                          <button
                            key={rune.id}
                            type="button"
                            onMouseEnter={() => inspectRune(rune)}
                            onClick={() => inspectRune(rune)}
                            title={`${rune.name} — ${cleanRuneDesc(rune.shortDesc)}`}
                            className={`p-0.5 rounded-full bg-[#060C16] transition-all focus:outline-none ${
                              active
                                ? `ring-2 ${differs ? 'ring-sky-400' : 'ring-[#C8AA6E]'} ${primaryTheme.glowShadow} scale-105`
                                : 'opacity-30 grayscale hover:opacity-85 hover:grayscale-0 border border-slate-700/60'
                            }`}
                          >
                            <SafeGameIcon
                              src={rune.imageUrl}
                              alt={rune.name}
                              fallbackLabel={rune.name}
                              sizeClass="w-10 h-10"
                              className="rounded-full border-0"
                            />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Arbre Secondaire Grille */}
              <div className="lg:col-span-4 rounded-xl border border-[#C8AA6E]/25 bg-[#08101C]/85 p-4 flex flex-col justify-between gap-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-[#C8AA6E]/20">
                  {secondaryTree && (
                    <SafeGameIcon
                      src={secondaryTree.imageUrl}
                      alt={secondaryTree.name}
                      fallbackLabel={secondaryTree.name}
                      sizeClass="w-8 h-8"
                      className="rounded-full border-0"
                    />
                  )}
                  <div>
                    <div className={`text-sm font-bold uppercase tracking-wide ${secondaryTheme.textClass}`}>
                      {secondaryTree?.name || 'Secondaire'}
                    </div>
                    <div className="text-[11px] text-[#A09B8C]">Arbre secondaire · 2 runes</div>
                  </div>
                </div>

                <div className="space-y-3 my-auto">
                  {(secondaryTree?.slots || []).slice(1, 4).map((slot, rowIdx) => (
                    <div
                      key={rowIdx}
                      className={`flex items-center justify-around gap-2 ${
                        rowIdx > 0 ? 'pt-2.5 border-t border-[#C8AA6E]/15' : ''
                      }`}
                    >
                      {slot.runes.map((rune) => {
                        const active = activeSet.has(rune.id);
                        const differs = active && compareRuneIds && !compareRuneIds.has(rune.id);
                        return (
                          <button
                            key={rune.id}
                            type="button"
                            onMouseEnter={() => inspectRune(rune)}
                            onClick={() => inspectRune(rune)}
                            title={`${rune.name} — ${cleanRuneDesc(rune.shortDesc)}`}
                            className={`p-0.5 rounded-full bg-[#060C16] transition-all focus:outline-none ${
                              active
                                ? `ring-2 ${differs ? 'ring-sky-400' : secondaryTheme.ringClass} scale-105`
                                : 'opacity-30 grayscale hover:opacity-85 hover:grayscale-0 border border-slate-700/60'
                            }`}
                          >
                            <SafeGameIcon
                              src={rune.imageUrl}
                              alt={rune.name}
                              fallbackLabel={rune.name}
                              sizeClass="w-9 h-9"
                              className="rounded-full border-0"
                            />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="pt-2.5 border-t border-[#C8AA6E]/20 space-y-1 text-xs">
                  {selectedSecondaryMinors.map((rune) => (
                    <div key={rune.id} className="text-[#F0E6D2] font-medium">
                      · {rune.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Grille 3×3 des Fragments */}
              <div className="lg:col-span-3 rounded-xl border border-[#C8AA6E]/25 bg-[#08101C]/85 p-4 flex flex-col justify-between gap-3">
                <div className="pb-2.5 border-b border-[#C8AA6E]/20">
                  <div className="text-sm font-bold text-[#F0E6D2]">Fragments (3×3)</div>
                  <div className="text-[11px] text-[#A09B8C]">Bonus de statistiques</div>
                </div>

                <div className="space-y-3 my-auto">
                  {SHARD_GRID.map((row, rIdx) => {
                    const chosenIdx = shardIndices[rIdx] ?? 0;
                    return (
                      <div key={row.rowLabel} className="space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-[#A09B8C]">
                          {row.rowLabel}
                        </div>
                        <div className="flex items-center justify-around gap-2">
                          {row.options.map((opt, cIdx) => {
                            const active = cIdx === chosenIdx;
                            return (
                              <button
                                key={`${row.rowLabel}-${opt.id}-${cIdx}`}
                                type="button"
                                onMouseEnter={() =>
                                  setInspectedItem({
                                    name: `${row.rowLabel} · ${opt.clientLabel}`,
                                    desc: opt.shortLabel,
                                    iconUrl: opt.iconUrl,
                                  })
                                }
                                title={opt.clientLabel}
                                className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all ${
                                  active
                                    ? 'border-[#C8AA6E] bg-[#C8AA6E]/20 ring-2 ring-[#C8AA6E]/60 scale-105'
                                    : 'border-slate-700 bg-[#060C16] opacity-35 grayscale hover:opacity-85 hover:grayscale-0'
                                }`}
                              >
                                <SafeGameIcon
                                  src={opt.iconUrl}
                                  alt={opt.clientLabel}
                                  fallbackLabel={opt.shortLabel}
                                  sizeClass="w-5 h-5"
                                  className="rounded-full border-0"
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2.5 border-t border-[#C8AA6E]/20 text-[11px] text-[#C8C3B4] space-y-0.5">
                  {selectedShards.map((s, idx) => (
                    <div key={idx} className="truncate">
                      · {s.clientLabel}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {inspectedItem && (
              <div className="rounded-lg border border-[#C8AA6E]/25 bg-[#08101C]/90 px-4 py-2.5 flex items-start gap-3 text-xs">
                {inspectedItem.iconUrl && (
                  <SafeGameIcon
                    src={inspectedItem.iconUrl}
                    alt={inspectedItem.name}
                    fallbackLabel={inspectedItem.name}
                    sizeClass="w-7 h-7"
                    className="rounded-full border-0 mt-0.5"
                  />
                )}
                <div className="min-w-0">
                  <span className="font-semibold text-[#F0E6D2]">{inspectedItem.name}</span>
                  <span className="mx-1.5 text-[#A09B8C]" aria-hidden="true">—</span>
                  <span className="text-[#C8C3B4]">{inspectedItem.desc}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barre inférieure façon Client LoL : Bascule Liste / Grille + descriptions détaillées */}
      <div className="px-5 py-3 border-t border-[#C8AA6E]/20 bg-[#070E19]/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center p-0.5 rounded-md border border-[#C8AA6E]/35 bg-[#0A1322]">
            <button
              type="button"
              onClick={() => setViewStyle('client')}
              title="Vue Client LoL (Liste détaillée)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                viewStyle === 'client'
                  ? 'bg-[#C8AA6E]/25 text-[#F0E6D2]'
                  : 'text-[#A09B8C] hover:text-[#F0E6D2]'
              }`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
              Vue Client LoL
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('grid')}
              title="Vue Grille complète (toutes les runes)"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                viewStyle === 'grid'
                  ? 'bg-[#C8AA6E]/25 text-[#F0E6D2]'
                  : 'text-[#A09B8C] hover:text-[#F0E6D2]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
              Grille complète
            </button>
          </div>

          {viewStyle === 'client' && (
            <label className="inline-flex items-center gap-2 text-[11px] text-[#A09B8C] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDetailedDesc}
                onChange={(e) => setShowDetailedDesc(e.target.checked)}
                className="accent-[#C8AA6E] rounded"
              />
              Afficher les descriptions détaillées
            </label>
          )}
        </div>

        {footerNote && <div className="text-[11px] text-[#C8C3B4] leading-relaxed">{footerNote}</div>}
      </div>
    </section>
  );
}
