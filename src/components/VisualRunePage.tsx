import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, LayoutGrid, List, RotateCcw } from 'lucide-react';
import { buildDefaultSelectionForTrees, type RunePageSelection } from '../engines/runeEngine.ts';
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
  /** Mode interactif : permet de modifier arbres, runes et fragments à la volée */
  editable?: boolean;
  defaultViewStyle?: 'client' | 'grid';
  onChangeSelection?: (next: RunePageSelection) => void;
  onResetToMeta?: () => void;
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
  glowShadow: string;
  backdropGradient: string;
}

const TREE_THEMES: Record<TreeVisualTheme['key'], TreeVisualTheme> = {
  resolve: {
    key: 'resolve',
    subtitle: 'Vie éternelle. Durabilité et contrôles de foule.',
    accentHex: '#34D399',
    accentGlowHex: 'rgba(16, 185, 129, 0.34)',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/45',
    ringClass: 'ring-emerald-400',
    stemClass: 'from-emerald-400/75 via-emerald-500/35 to-emerald-500/10',
    glowShadow: 'shadow-[0_0_22px_rgba(16,185,129,0.42)]',
    backdropGradient:
      'radial-gradient(circle at 80% 42%, rgba(16, 185, 129, 0.20) 0%, rgba(9, 20, 40, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  domination: {
    key: 'domination',
    subtitle: 'Chasse et élimination de proies. Dégâts immédiats et accès aux cibles.',
    accentHex: '#FB7185',
    accentGlowHex: 'rgba(244, 63, 94, 0.38)',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/45',
    ringClass: 'ring-rose-500',
    stemClass: 'from-rose-400/75 via-rose-500/35 to-rose-500/10',
    glowShadow: 'shadow-[0_0_22px_rgba(244,63,94,0.42)]',
    backdropGradient:
      'radial-gradient(circle at 80% 42%, rgba(225, 29, 72, 0.22) 0%, rgba(16, 12, 26, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  precision: {
    key: 'precision',
    subtitle: 'Devenez une légende. Attaques améliorées et dégâts soutenus.',
    accentHex: '#C8AA6E',
    accentGlowHex: 'rgba(200, 155, 60, 0.38)',
    textClass: 'text-[#F0E6D2]',
    borderClass: 'border-[#C8AA6E]/55',
    ringClass: 'ring-[#C8AA6E]',
    stemClass: 'from-[#F0E6D2]/75 via-[#C8AA6E]/40 to-[#785A28]/10',
    glowShadow: 'shadow-[0_0_22px_rgba(200,170,110,0.45)]',
    backdropGradient:
      'radial-gradient(circle at 80% 42%, rgba(200, 155, 60, 0.20) 0%, rgba(12, 19, 34, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  sorcery: {
    key: 'sorcery',
    subtitle: 'Déchaînez la destruction. Compétences et manipulation des ressources.',
    accentHex: '#818CF8',
    accentGlowHex: 'rgba(99, 102, 241, 0.38)',
    textClass: 'text-indigo-300',
    borderClass: 'border-indigo-400/45',
    ringClass: 'ring-indigo-400',
    stemClass: 'from-indigo-400/75 via-indigo-500/35 to-indigo-500/10',
    glowShadow: 'shadow-[0_0_22px_rgba(99,102,241,0.42)]',
    backdropGradient:
      'radial-gradient(circle at 80% 42%, rgba(99, 102, 241, 0.22) 0%, rgba(11, 16, 36, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  inspiration: {
    key: 'inspiration',
    subtitle: 'Trompez les mortels. Outils créatifs et modification des règles.',
    accentHex: '#38BDF8',
    accentGlowHex: 'rgba(14, 165, 233, 0.38)',
    textClass: 'text-cyan-300',
    borderClass: 'border-cyan-400/45',
    ringClass: 'ring-cyan-400',
    stemClass: 'from-cyan-400/75 via-cyan-500/35 to-cyan-500/10',
    glowShadow: 'shadow-[0_0_22px_rgba(56,189,248,0.42)]',
    backdropGradient:
      'radial-gradient(circle at 80% 42%, rgba(14, 165, 233, 0.22) 0%, rgba(9, 20, 36, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
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

function HextechDiamondDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-0.5 select-none">
      <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#C8AA6E]/45 to-[#C8AA6E]/60" />
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="w-2 h-2 rotate-45 border border-[#C8AA6E] bg-[#091428] inline-block"
        />
        {label && (
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C8AA6E]">
            {label}
          </span>
        )}
        <span
          aria-hidden="true"
          className="w-2 h-2 rotate-45 border border-[#C8AA6E] bg-[#091428] inline-block"
        />
      </div>
      <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent via-[#C8AA6E]/45 to-[#C8AA6E]/60" />
    </div>
  );
}

function RunicMonolithArt({
  primaryTree,
  secondaryTree,
  keystoneRune,
  theme,
  compact = false,
}: {
  primaryTree: RuneTree;
  secondaryTree: RuneTree | null;
  keystoneRune: RuneSlotItem | null;
  theme: TreeVisualTheme;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none overflow-hidden rounded-xl border border-[#C8AA6E]/30 bg-[#010A13]/85 ${
        compact ? 'min-h-[210px] px-3 py-4' : 'h-full min-h-[260px] px-4 py-6'
      }`}
    >
      {/* Halo atmosphérique derrière le sanctuaire runique */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${theme.accentGlowHex} 0%, transparent 66%)`,
        }}
      />

      {/* Sanctuaire Hextech officiel inspiré de la vue droite du client League of Legends */}
      <svg
        viewBox="0 0 240 260"
        className={`${compact ? 'w-40 h-44' : 'w-48 h-52'} relative z-10 drop-shadow-[0_14px_30px_rgba(0,0,0,0.75)]`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`stone-${theme.key}-${compact ? 'c' : 'f'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E2B3E" />
            <stop offset="55%" stopColor="#0E1929" />
            <stop offset="100%" stopColor="#050B14" />
          </linearGradient>
          <linearGradient id={`gold-${theme.key}-${compact ? 'c' : 'f'}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F0E6D2" />
            <stop offset="50%" stopColor="#C8AA6E" />
            <stop offset="100%" stopColor="#785A28" />
          </linearGradient>
        </defs>

        <circle
          cx="120"
          cy="112"
          r="92"
          fill="none"
          stroke={theme.accentHex}
          strokeOpacity="0.25"
          strokeWidth="1.2"
          strokeDasharray="6 6"
        />
        <circle
          cx="120"
          cy="112"
          r="72"
          fill="none"
          stroke={`url(#gold-${theme.key}-${compact ? 'c' : 'f'})`}
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />

        {/* Éclats flottants */}
        <polygon points="34,108 50,98 42,122" fill={theme.accentHex} fillOpacity="0.35" />
        <polygon points="206,100 188,92 198,116" fill={theme.accentHex} fillOpacity="0.35" />
        <polygon points="120,10 128,42 120,54 112,42" fill={theme.accentHex} fillOpacity="0.6" />

        {/* Corps architectural */}
        <path
          d="M72 232 L68 88 L92 60 L148 60 L172 88 L168 232 Z"
          fill={`url(#stone-${theme.key}-${compact ? 'c' : 'f'})`}
          stroke={`url(#gold-${theme.key}-${compact ? 'c' : 'f'})`}
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
        <rect x="80" y="92" width="11" height="122" rx="2" fill="#091322" stroke="#C8AA6E" strokeOpacity="0.3" />
        <rect x="149" y="92" width="11" height="122" rx="2" fill="#091322" stroke="#C8AA6E" strokeOpacity="0.3" />

        {/* Écrin hextech central */}
        <polygon
          points="120,78 154,99 154,141 120,162 86,141 86,99"
          fill="#030912"
          stroke={`url(#gold-${theme.key}-${compact ? 'c' : 'f'})`}
          strokeWidth="2"
        />
        <polygon
          points="120,86 146,103 146,137 120,154 94,137 94,103"
          fill={theme.accentHex}
          fillOpacity="0.16"
        />

        <path
          d="M42 238 L70 214 L170 214 L198 238 Z"
          fill="#091428"
          stroke="#C8AA6E"
          strokeOpacity="0.4"
        />
      </svg>

      {/* Emblème officiel de la Rune Fondamentale incrusté au centre */}
      <div
        className={`absolute ${compact ? 'top-[96px]' : 'top-[112px]'} left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center`}
      >
        {keystoneRune ? (
          <div className={`p-1 rounded-full bg-[#030912] ring-2 ${theme.ringClass} ${theme.glowShadow}`}>
            <SafeGameIcon
              src={keystoneRune.imageUrl}
              alt={keystoneRune.name}
              fallbackLabel={keystoneRune.name}
              sizeClass={compact ? 'w-11 h-11' : 'w-12 h-12'}
              className="rounded-full border-0"
            />
          </div>
        ) : (
          <SafeGameIcon
            src={primaryTree.imageUrl}
            alt={primaryTree.name}
            fallbackLabel={primaryTree.name}
            sizeClass="w-10 h-10"
            className="rounded-full border-0"
          />
        )}
      </div>

      {/* Synthèse des deux voies en bas du sanctuaire */}
      <div className="relative z-20 mt-2 flex items-center gap-2.5 text-xs">
        <div className="flex items-center gap-1.5 text-[#F0E6D2] font-semibold">
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
            <span className="text-[#C8AA6E]/70" aria-hidden="true">
              +
            </span>
            <div className="flex items-center gap-1.5 text-[#C8C3B4] font-medium">
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
  editable = false,
  defaultViewStyle = 'client',
  onChangeSelection,
  onResetToMeta,
  headerActions,
  footerNote,
}: VisualRunePageProps) {
  const [viewStyle, setViewStyle] = useState<'client' | 'grid'>(defaultViewStyle);
  const [showDetailedDesc, setShowDetailedDesc] = useState(true);
  const [openEditorSlot, setOpenEditorSlot] = useState<string | null>(null);
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

  const effectiveKeystoneId =
    keystoneId || selectedRuneIds[0] || primaryTree?.slots?.[0]?.runes?.[0]?.id || null;
  const keystoneRune = useMemo(
    () => primaryTree?.slots?.[0]?.runes.find((r) => r.id === effectiveKeystoneId) || null,
    [primaryTree, effectiveKeystoneId],
  );

  const selectedPrimaryMinors = useMemo(
    () =>
      (primaryTree?.slots || [])
        .slice(1, 4)
        .map((slot) => slot.runes.find((r) => activeSet.has(r.id)) || slot.runes[0])
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
    () => SHARD_GRID.map((row, idx) => row.options[shardIndices[idx] ?? 0] || row.options[0]),
    [shardIndices],
  );

  if (!primaryTree) return null;

  const currentSelection: RunePageSelection = {
    primaryTreeId: primaryTree.id,
    secondaryTreeId:
      secondaryTree?.id || runeTrees.find((t) => t.id !== primaryTree.id)?.id || primaryTree.id,
    keystoneId: effectiveKeystoneId || primaryTree.slots?.[0]?.runes?.[0]?.id || 0,
    primaryMinorIds: selectedPrimaryMinors.map((r) => r.id),
    secondaryMinorIds: selectedSecondaryMinors.map((r) => r.id),
    shardIndices,
  };

  const emitSelection = (next: RunePageSelection) => {
    if (!editable || !onChangeSelection) return;
    onChangeSelection(next);
  };

  const inspectRune = (rune: RuneSlotItem) => {
    setInspectedItem({
      name: rune.name,
      desc: cleanRuneDesc(rune.longDesc || rune.shortDesc),
      iconUrl: rune.imageUrl,
    });
  };

  const handleSelectPrimaryTree = (newTreeId: number) => {
    if (!editable) return;
    const nextSecId =
      newTreeId === currentSelection.secondaryTreeId
        ? currentSelection.primaryTreeId
        : currentSelection.secondaryTreeId;
    emitSelection(buildDefaultSelectionForTrees(runeTrees, newTreeId, nextSecId, currentSelection));
    setOpenEditorSlot(null);
  };

  const handleSelectSecondaryTree = (newTreeId: number) => {
    if (!editable || newTreeId === currentSelection.primaryTreeId) return;
    emitSelection(
      buildDefaultSelectionForTrees(runeTrees, currentSelection.primaryTreeId, newTreeId, currentSelection),
    );
    setOpenEditorSlot(null);
  };

  const handleSelectKeystone = (rune: RuneSlotItem) => {
    inspectRune(rune);
    if (!editable) return;
    emitSelection({ ...currentSelection, keystoneId: rune.id });
    setOpenEditorSlot(null);
  };

  const handleSelectPrimaryMinor = (slotIdx: number, rune: RuneSlotItem) => {
    inspectRune(rune);
    if (!editable) return;
    const nextMinors = [...currentSelection.primaryMinorIds];
    nextMinors[slotIdx] = rune.id;
    emitSelection({ ...currentSelection, primaryMinorIds: nextMinors });
    setOpenEditorSlot(null);
  };

  const handleSelectSecondaryMinor = (slotRowIdx: number, rune: RuneSlotItem) => {
    inspectRune(rune);
    if (!editable || !secondaryTree) return;
    const rowOfRune = (rId: number): number => {
      for (let i = 1; i <= 3; i++) {
        if (secondaryTree.slots[i]?.runes.some((r) => r.id === rId)) return i;
      }
      return -1;
    };
    const filtered = currentSelection.secondaryMinorIds.filter((id) => rowOfRune(id) !== slotRowIdx);
    const nextSec = [...filtered, rune.id].slice(-2);
    emitSelection({ ...currentSelection, secondaryMinorIds: nextSec });
  };

  const handleSelectShard = (rowIdx: number, colIdx: number, opt: ShardOption) => {
    setInspectedItem({
      name: `${SHARD_GRID[rowIdx].rowLabel} · ${opt.clientLabel}`,
      desc: 'Bonus actif dès le niveau 1 sur votre champion.',
      iconUrl: opt.iconUrl,
    });
    if (!editable) return;
    const nextShards: [number, number, number] = [...currentSelection.shardIndices] as [
      number,
      number,
      number,
    ];
    nextShards[rowIdx] = colIdx;
    emitSelection({ ...currentSelection, shardIndices: nextShards });
    setOpenEditorSlot(null);
  };

  const displayedTooltip =
    inspectedItem ||
    (keystoneRune
      ? {
          name: keystoneRune.name,
          desc: cleanRuneDesc(keystoneRune.longDesc || keystoneRune.shortDesc),
          iconUrl: keystoneRune.imageUrl,
        }
      : null);

  return (
    <section
      className="relative rounded-xl border border-[#C8AA6E]/45 overflow-hidden shadow-xl"
      style={{ background: primaryTheme.backdropGradient }}
    >
      {/* Ornements de coin Hextech façon client League of Legends */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-[#C8AA6E]/70"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-[#C8AA6E]/70"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-[#C8AA6E]/70"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-[#C8AA6E]/70"
      />

      {/* Barre supérieure façon éditeur de runes League of Legends */}
      <div className="px-5 py-3.5 border-b border-[#C8AA6E]/25 bg-[#010A13]/85 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full border-2 border-[#C8AA6E]/75 bg-[#091428] flex items-center justify-center shrink-0">
            <SafeGameIcon
              src={primaryTree.imageUrl}
              alt={primaryTree.name}
              fallbackLabel={primaryTree.name}
              sizeClass="w-5 h-5"
              className="rounded-full border-0"
            />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold uppercase tracking-wide text-[#F0E6D2] truncate">
              {pageTitle ||
                (championName ? `Page de runes · ${championName}` : `Page de runes · ${primaryTree.name}`)}
            </h2>
            <p className="text-[11px] text-[#A09B8C] truncate">
              <span className={primaryTheme.textClass}>{primaryTree.name}</span>
              {secondaryTree && (
                <>
                  <span className="mx-1.5 text-[#C8AA6E]/60" aria-hidden="true">
                    +
                  </span>
                  <span>{secondaryTree.name}</span>
                </>
              )}
              {sourceLabel && (
                <>
                  <span className="mx-1.5" aria-hidden="true">
                    ·
                  </span>
                  <span>{sourceLabel}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Sélecteur des 2 vues authentiques directement accessible dans l'en-tête */}
          <div className="flex items-center p-0.5 rounded-lg border border-[#C8AA6E]/35 bg-[#091428]">
            <button
              type="button"
              onClick={() => setViewStyle('client')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                viewStyle === 'client'
                  ? 'bg-[#C8AA6E] text-[#010A13]'
                  : 'text-[#C8C3B4] hover:text-[#F0E6D2]'
              }`}
            >
              <List className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Vue Client LoL</span>
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('grid')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                viewStyle === 'grid'
                  ? 'bg-[#C8AA6E] text-[#010A13]'
                  : 'text-[#C8C3B4] hover:text-[#F0E6D2]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Grille complète</span>
            </button>
          </div>

          {editable && onResetToMeta && (
            <button
              type="button"
              onClick={() => {
                onResetToMeta();
                setOpenEditorSlot(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#C8AA6E]/45 bg-[#091428] text-[#F0E6D2] hover:bg-[#C8AA6E]/20 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#C8AA6E]" aria-hidden="true" />
              <span>Réinitialiser Méta</span>
            </button>
          )}
          {headerActions}
        </div>
      </div>

      {/* Barre des 5 Voies officielles LoL (sélecteur façon client en mode interactif) */}
      {editable && (
        <div className="px-5 py-2.5 border-b border-[#C8AA6E]/20 bg-[#050E1B]/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[#A09B8C] font-semibold uppercase tracking-wider text-[10px]">
              Voie principale :
            </span>
            <div className="flex items-center gap-1.5">
              {runeTrees.map((t) => {
                const active = t.id === primaryTree.id;
                const theme = getTreeTheme(t);
                return (
                  <button
                    key={`p-tree-${t.id}`}
                    type="button"
                    onClick={() => handleSelectPrimaryTree(t.id)}
                    title={`Choisir ${t.name} comme voie principale`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-[transform,border-color,background-color,opacity] duration-150 ${
                      active
                        ? `${theme.borderClass} bg-[#0E1E36] text-[#F0E6D2] font-semibold shadow-sm`
                        : 'border-[#C8AA6E]/15 text-[#A09B8C] hover:text-[#F0E6D2] hover:border-[#C8AA6E]/40 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <SafeGameIcon
                      src={t.imageUrl}
                      alt={t.name}
                      fallbackLabel={t.name}
                      sizeClass="w-4 h-4"
                      className="rounded-full border-0"
                    />
                    <span className="hidden md:inline">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[#A09B8C] font-semibold uppercase tracking-wider text-[10px]">
              Voie secondaire :
            </span>
            <div className="flex items-center gap-1.5">
              {runeTrees
                .filter((t) => t.id !== primaryTree.id)
                .map((t) => {
                  const active = t.id === secondaryTree?.id;
                  const theme = getTreeTheme(t);
                  return (
                    <button
                      key={`s-tree-${t.id}`}
                      type="button"
                      onClick={() => handleSelectSecondaryTree(t.id)}
                      title={`Choisir ${t.name} comme voie secondaire`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-[transform,border-color,background-color,opacity] duration-150 ${
                        active
                          ? `${theme.borderClass} bg-[#0E1E36] text-[#F0E6D2] font-semibold shadow-sm`
                          : 'border-[#C8AA6E]/15 text-[#A09B8C] hover:text-[#F0E6D2] hover:border-[#C8AA6E]/40 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <SafeGameIcon
                        src={t.imageUrl}
                        alt={t.name}
                        fallbackLabel={t.name}
                        sizeClass="w-4 h-4"
                        className="rounded-full border-0"
                      />
                      <span className="hidden md:inline">{t.name}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Corps principal : Vue Client LoL fidèle OU Grille complète authentique */}
      <div className="p-5 sm:p-6">
        {viewStyle === 'client' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* COLONNE 1 : Arbre Principal façon sommaire client LoL */}
            <div className="lg:col-span-4 relative pl-1">
              <div
                aria-hidden="true"
                className={`absolute left-[29px] top-12 bottom-6 w-[2px] bg-gradient-to-b ${primaryTheme.stemClass}`}
              />

              <div className="space-y-3.5">
                <div className="relative z-10 flex items-start gap-3.5">
                  <div
                    className={`w-14 h-14 rounded-full bg-[#091428] border-2 border-[#C8AA6E]/80 flex items-center justify-center shrink-0 ${primaryTheme.glowShadow}`}
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
                    <div className="text-sm font-bold uppercase tracking-[0.12em] text-[#F0E6D2]">
                      {primaryTree.name}
                    </div>
                    <p className="text-xs text-[#A09B8C] leading-snug mt-0.5">
                      {primaryTheme.subtitle}
                    </p>
                  </div>
                </div>

                <div className="pl-[68px]">
                  <HextechDiamondDivider label="Rune fondamentale" />
                </div>

                {keystoneRune && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        inspectRune(keystoneRune);
                        if (editable) {
                          setOpenEditorSlot((cur) => (cur === 'keystone' ? null : 'keystone'));
                        }
                      }}
                      onMouseEnter={() => inspectRune(keystoneRune)}
                      className="relative z-10 w-full flex items-start gap-3.5 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.04] focus:outline-none"
                    >
                      <div
                        className={`w-14 h-14 rounded-full bg-[#030912] flex items-center justify-center shrink-0 ring-2 ${primaryTheme.ringClass} ${primaryTheme.glowShadow} group-hover:scale-105 transition-transform`}
                      >
                        <SafeGameIcon
                          src={keystoneRune.imageUrl}
                          alt={keystoneRune.name}
                          fallbackLabel={keystoneRune.name}
                          sizeClass="w-12 h-12"
                          className="rounded-full border-0"
                        />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm font-bold uppercase tracking-wide ${primaryTheme.textClass}`}>
                              {keystoneRune.name}
                            </span>
                            {compareRuneIds && !compareRuneIds.has(keystoneRune.id) && (
                              <span className="text-[10px] font-semibold text-sky-400">
                                · Différente méta
                              </span>
                            )}
                          </div>
                          {editable && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-[#C8AA6E] opacity-80 group-hover:opacity-100">
                              Modifier <ChevronDown className="w-3 h-3" />
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

                    {editable && openEditorSlot === 'keystone' && primaryTree.slots?.[0] && (
                      <div className="relative z-20 ml-14 p-2 rounded-lg border border-[#C8AA6E]/45 bg-[#030912]/95 flex flex-wrap items-center gap-2">
                        {primaryTree.slots[0].runes.map((cand) => {
                          const active = cand.id === keystoneRune.id;
                          return (
                            <button
                              key={cand.id}
                              type="button"
                              onMouseEnter={() => inspectRune(cand)}
                              onClick={() => handleSelectKeystone(cand)}
                              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-[transform,border-color,background-color,opacity] duration-150 ${
                                active
                                  ? `${primaryTheme.borderClass} bg-[#0E1E36] text-[#F0E6D2] font-semibold`
                                  : 'border-slate-700/70 text-[#A09B8C] hover:text-[#F0E6D2] hover:border-[#C8AA6E]/50'
                              }`}
                            >
                              <SafeGameIcon
                                src={cand.imageUrl}
                                alt={cand.name}
                                fallbackLabel={cand.name}
                                sizeClass="w-6 h-6"
                                className="rounded-full border-0"
                              />
                              <span>{cand.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="pl-[68px]">
                  <HextechDiamondDivider label="Runes mineures" />
                </div>

                <div className="space-y-3">
                  {selectedPrimaryMinors.map((rune, slotIdx) => {
                    const differs = compareRuneIds && !compareRuneIds.has(rune.id);
                    const editorKey = `p-minor-${slotIdx}`;
                    const slotRunes = primaryTree.slots?.[slotIdx + 1]?.runes || [];
                    return (
                      <div key={rune.id} className="space-y-2">
                        <button
                          type="button"
                          onClick={() => {
                            inspectRune(rune);
                            if (editable) {
                              setOpenEditorSlot((cur) => (cur === editorKey ? null : editorKey));
                            }
                          }}
                          onMouseEnter={() => inspectRune(rune)}
                          className="relative z-10 w-full flex items-start gap-4 pl-2 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.04] focus:outline-none"
                        >
                          <div
                            className={`w-10 h-10 rounded-full bg-[#030912] flex items-center justify-center shrink-0 ring-2 ${
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
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
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
                              {editable && (
                                <ChevronDown className="w-3 h-3 text-[#C8AA6E]/75 opacity-70 group-hover:opacity-100 shrink-0" />
                              )}
                            </div>
                            {showDetailedDesc && (
                              <p className="text-[11px] text-[#A09B8C] leading-snug mt-0.5 line-clamp-2">
                                {cleanRuneDesc(rune.shortDesc)}
                              </p>
                            )}
                          </div>
                        </button>

                        {editable && openEditorSlot === editorKey && slotRunes.length > 0 && (
                          <div className="relative z-20 ml-12 p-2 rounded-lg border border-[#C8AA6E]/45 bg-[#030912]/95 flex flex-wrap items-center gap-1.5">
                            {slotRunes.map((cand) => {
                              const active = cand.id === rune.id;
                              return (
                                <button
                                  key={cand.id}
                                  type="button"
                                  onMouseEnter={() => inspectRune(cand)}
                                  onClick={() => handleSelectPrimaryMinor(slotIdx, cand)}
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-[transform,border-color,background-color,opacity] duration-150 ${
                                    active
                                      ? 'border-[#C8AA6E] bg-[#C8AA6E]/20 text-[#F0E6D2] font-semibold'
                                      : 'border-slate-700/70 text-[#A09B8C] hover:text-[#F0E6D2] hover:border-[#C8AA6E]/50'
                                  }`}
                                >
                                  <SafeGameIcon
                                    src={cand.imageUrl}
                                    alt={cand.name}
                                    fallbackLabel={cand.name}
                                    sizeClass="w-5 h-5"
                                    className="rounded-full border-0"
                                  />
                                  <span>{cand.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* COLONNE 2 : Arbre Secondaire + Fragments empilés façon client LoL */}
            <div className="lg:col-span-4 relative flex flex-col justify-between gap-4 pl-1">
              {secondaryTree && (
                <div className="relative space-y-3.5">
                  <div
                    aria-hidden="true"
                    className={`absolute left-[27px] top-12 bottom-4 w-[2px] bg-gradient-to-b ${secondaryTheme.stemClass}`}
                  />

                  <div className="relative z-10 flex items-start gap-3.5">
                    <div className="w-13 h-13 rounded-full bg-[#091428] border-2 border-[#C8AA6E]/75 flex items-center justify-center shrink-0">
                      <SafeGameIcon
                        src={secondaryTree.imageUrl}
                        alt={secondaryTree.name}
                        fallbackLabel={secondaryTree.name}
                        sizeClass="w-8 h-8"
                        className="rounded-full border-0"
                      />
                    </div>
                    <div className="pt-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold uppercase tracking-[0.12em] text-[#F0E6D2]">
                          {secondaryTree.name}
                        </div>
                        {editable && (
                          <button
                            type="button"
                            onClick={() =>
                              setOpenEditorSlot((cur) => (cur === 'sec-all' ? null : 'sec-all'))
                            }
                            className="text-[10px] font-semibold text-[#C8AA6E] hover:underline"
                          >
                            {openEditorSlot === 'sec-all' ? 'Fermer' : 'Changer (2 runes)'}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-[#A09B8C] leading-snug mt-0.5">
                        {secondaryTheme.subtitle}
                      </p>
                    </div>
                  </div>

                  {editable && openEditorSlot === 'sec-all' && (
                    <div className="relative z-20 ml-4 p-2.5 rounded-lg border border-[#C8AA6E]/45 bg-[#030912]/95 space-y-2">
                      <div className="text-[10px] text-[#A09B8C]">
                        Choisissez 2 runes sur 2 rangées différentes :
                      </div>
                      {(secondaryTree.slots || []).slice(1, 4).map((slot, rowIdx) => (
                        <div key={rowIdx} className="flex flex-wrap gap-1.5">
                          {slot.runes.map((cand) => {
                            const active = activeSet.has(cand.id);
                            return (
                              <button
                                key={cand.id}
                                type="button"
                                onMouseEnter={() => inspectRune(cand)}
                                onClick={() => handleSelectSecondaryMinor(rowIdx + 1, cand)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-[transform,border-color,background-color,opacity] duration-150 ${
                                  active
                                    ? `${secondaryTheme.borderClass} bg-[#0E1E36] text-[#F0E6D2] font-semibold`
                                    : 'border-slate-700/70 text-[#A09B8C] hover:text-[#F0E6D2]'
                                }`}
                              >
                                <SafeGameIcon
                                  src={cand.imageUrl}
                                  alt={cand.name}
                                  fallbackLabel={cand.name}
                                  sizeClass="w-4 h-4"
                                  className="rounded-full border-0"
                                />
                                <span>{cand.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-3 pt-1">
                    {selectedSecondaryMinors.map((rune) => {
                      const differs = compareRuneIds && !compareRuneIds.has(rune.id);
                      return (
                        <button
                          key={rune.id}
                          type="button"
                          onClick={() => {
                            inspectRune(rune);
                            if (editable) {
                              setOpenEditorSlot((cur) => (cur === 'sec-all' ? null : 'sec-all'));
                            }
                          }}
                          onMouseEnter={() => inspectRune(rune)}
                          className="relative z-10 w-full flex items-start gap-4 pl-2 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.04] focus:outline-none"
                        >
                          <div
                            className={`w-10 h-10 rounded-full bg-[#030912] flex items-center justify-center shrink-0 ring-2 ${
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
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
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
                              {editable && (
                                <ChevronDown className="w-3 h-3 text-[#C8AA6E]/75 opacity-70 group-hover:opacity-100 shrink-0" />
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

              <div className="pl-2 space-y-2.5">
                <HextechDiamondDivider label="Fragments" />
                {selectedShards.map((shard, idx) => {
                  const shardEditorKey = `shard-${idx}`;
                  return (
                    <div key={`${shard.id}-${idx}`} className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setInspectedItem({
                            name: `Fragment ${SHARD_GRID[idx].rowLabel} : ${shard.clientLabel}`,
                            desc: 'Bonus actif dès le niveau 1 sur votre champion.',
                            iconUrl: shard.iconUrl,
                          });
                          if (editable) {
                            setOpenEditorSlot((cur) => (cur === shardEditorKey ? null : shardEditorKey));
                          }
                        }}
                        className="w-full flex items-center justify-between gap-2 text-left rounded-md py-1 hover:bg-white/[0.04] transition-colors focus:outline-none group"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#030912] border border-[#C8AA6E]/80 flex items-center justify-center shrink-0">
                            <SafeGameIcon
                              src={shard.iconUrl}
                              alt={shard.clientLabel}
                              fallbackLabel={shard.shortLabel}
                              sizeClass="w-4 h-4"
                              className="rounded-full border-0"
                            />
                          </div>
                          <span className="text-xs text-[#C8C3B4] font-medium truncate">
                            {shard.clientLabel}
                          </span>
                        </div>
                        {editable && (
                          <ChevronDown className="w-3 h-3 text-[#C8AA6E]/75 opacity-70 group-hover:opacity-100 shrink-0" />
                        )}
                      </button>

                      {editable && openEditorSlot === shardEditorKey && (
                        <div className="ml-10 p-1.5 rounded-lg border border-[#C8AA6E]/45 bg-[#030912]/95 flex flex-wrap gap-1.5">
                          {SHARD_GRID[idx].options.map((opt, colIdx) => {
                            const active = colIdx === (shardIndices[idx] ?? 0);
                            return (
                              <button
                                key={`${opt.id}-${colIdx}`}
                                type="button"
                                onClick={() => handleSelectShard(idx, colIdx, opt)}
                                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-[transform,border-color,background-color,opacity] duration-150 ${
                                  active
                                    ? 'border-[#C8AA6E] bg-[#C8AA6E]/20 text-[#F0E6D2] font-semibold'
                                    : 'border-slate-700/70 text-[#A09B8C] hover:text-[#F0E6D2]'
                                }`}
                              >
                                <SafeGameIcon
                                  src={opt.iconUrl}
                                  alt={opt.clientLabel}
                                  fallbackLabel={opt.shortLabel}
                                  sizeClass="w-4 h-4"
                                  className="rounded-full border-0"
                                />
                                <span>{opt.shortLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* COLONNE 3 : Sanctuaire Runique dynamique + Tooltip Hextech */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-3">
              <RunicMonolithArt
                primaryTree={primaryTree}
                secondaryTree={secondaryTree}
                keystoneRune={keystoneRune}
                theme={primaryTheme}
              />

              {displayedTooltip && (
                <div className="rounded-lg border border-[#C8AA6E]/30 bg-[#010A13]/90 px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
                  {displayedTooltip.iconUrl && (
                    <SafeGameIcon
                      src={displayedTooltip.iconUrl}
                      alt={displayedTooltip.name}
                      fallbackLabel={displayedTooltip.name}
                      sizeClass="w-6 h-6"
                      className="rounded-full border-0 mt-0.5 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-bold uppercase tracking-wide text-[#F0E6D2]">
                      {displayedTooltip.name}
                    </div>
                    <p className="text-[11px] text-[#A09B8C] leading-relaxed mt-0.5 line-clamp-3">
                      {displayedTooltip.desc}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* VUE GRILLE COMPLÈTE AUTHENTIQUE (Éditeur fidèle du Client League of Legends : Principal | Secondaire + Fragments 3×3 | Sanctuaire) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* COLONNE 1 : Arbre Principal complet (Fondamentales + 3 rangées mineures sur l'axe doré) */}
            <div className="lg:col-span-5 rounded-xl border border-[#C8AA6E]/35 bg-[#010A13]/80 p-4 flex flex-col justify-between gap-3.5">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#C8AA6E]/25">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-full bg-[#091428] border-2 border-[#C8AA6E]/80 flex items-center justify-center shrink-0 ${primaryTheme.glowShadow}`}
                  >
                    <SafeGameIcon
                      src={primaryTree.imageUrl}
                      alt={primaryTree.name}
                      fallbackLabel={primaryTree.name}
                      sizeClass="w-7 h-7"
                      className="rounded-full border-0"
                    />
                  </div>
                  <div>
                    <div className="text-sm font-bold uppercase tracking-[0.12em] text-[#F0E6D2]">
                      {primaryTree.name}
                    </div>
                    <div className="text-[11px] text-[#A09B8C]">Voie principale · 4 choix</div>
                  </div>
                </div>
                {keystoneRune && (
                  <span className={`text-xs font-bold uppercase tracking-wide ${primaryTheme.textClass}`}>
                    {keystoneRune.name}
                  </span>
                )}
              </div>

              <div className="relative space-y-3 py-1 my-auto">
                {/* Axe vertical central lumineux */}
                <div
                  aria-hidden="true"
                  className={`hidden sm:block absolute left-1/2 top-5 bottom-5 w-[2px] -translate-x-1/2 bg-gradient-to-b ${primaryTheme.stemClass}`}
                />

                {/* Rangée des Runes Fondamentales */}
                {primaryTree.slots?.[0] && (
                  <div className="relative z-10 space-y-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-center text-[#C8AA6E]">
                      Runes fondamentales
                    </div>
                    <div className="rounded-lg border border-[#C8AA6E]/25 bg-[#091428]/75 px-2 py-2.5 flex items-center justify-around gap-2">
                      {primaryTree.slots[0].runes.map((rune) => {
                        const active = rune.id === effectiveKeystoneId;
                        const differs = active && compareRuneIds && !compareRuneIds.has(rune.id);
                        return (
                          <button
                            key={rune.id}
                            type="button"
                            onMouseEnter={() => inspectRune(rune)}
                            onClick={() => handleSelectKeystone(rune)}
                            title={`${rune.name} — ${cleanRuneDesc(rune.shortDesc)}`}
                            className={`p-0.5 rounded-full bg-[#030912] transition-[transform,border-color,background-color,opacity] duration-150 focus:outline-none ${
                              active
                                ? `ring-2 ${differs ? 'ring-sky-400' : primaryTheme.ringClass} ${primaryTheme.glowShadow} scale-110`
                                : `opacity-35 grayscale hover:opacity-90 hover:grayscale-0 border border-[#C8AA6E]/25 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
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

                <HextechDiamondDivider />

                {/* 3 Rangées de Runes Mineures */}
                <div className="space-y-3">
                  {primaryTree.slots.slice(1, 4).map((slot, rowIdx) => (
                    <div
                      key={rowIdx}
                      className="relative z-10 flex items-center justify-around gap-2 py-0.5"
                    >
                      {slot.runes.map((rune) => {
                        const active = activeSet.has(rune.id);
                        const differs = active && compareRuneIds && !compareRuneIds.has(rune.id);
                        return (
                          <button
                            key={rune.id}
                            type="button"
                            onMouseEnter={() => inspectRune(rune)}
                            onClick={() => handleSelectPrimaryMinor(rowIdx, rune)}
                            title={`${rune.name} — ${cleanRuneDesc(rune.shortDesc)}`}
                            className={`p-0.5 rounded-full bg-[#030912] transition-[transform,border-color,background-color,opacity] duration-150 focus:outline-none ${
                              active
                                ? `ring-2 ${differs ? 'ring-sky-400' : 'ring-[#C8AA6E]'} ${primaryTheme.glowShadow} scale-105`
                                : `opacity-35 grayscale hover:opacity-90 hover:grayscale-0 border border-[#C8AA6E]/20 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
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
            </div>

            {/* COLONNE 2 : Arbre Secondaire (haut) + Fragments 3×3 (bas) réunis dans le même panneau comme dans le client LoL */}
            <div className="lg:col-span-4 rounded-xl border border-[#C8AA6E]/35 bg-[#010A13]/80 p-4 flex flex-col justify-between gap-3.5">
              {/* En-tête Voie Secondaire + mini sélecteur 4 voies */}
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#C8AA6E]/25">
                <div className="flex items-center gap-2.5 min-w-0">
                  {secondaryTree && (
                    <div className="w-9 h-9 rounded-full bg-[#091428] border border-[#C8AA6E]/70 flex items-center justify-center shrink-0">
                      <SafeGameIcon
                        src={secondaryTree.imageUrl}
                        alt={secondaryTree.name}
                        fallbackLabel={secondaryTree.name}
                        sizeClass="w-6 h-6"
                        className="rounded-full border-0"
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className={`text-xs font-bold uppercase tracking-[0.1em] truncate ${secondaryTheme.textClass}`}>
                      {secondaryTree?.name || 'Secondaire'}
                    </div>
                    <div className="text-[10px] text-[#A09B8C]">2 runes · 2 paliers</div>
                  </div>
                </div>

                {editable && (
                  <div className="flex items-center gap-1 shrink-0">
                    {runeTrees
                      .filter((t) => t.id !== primaryTree.id)
                      .map((t) => {
                        const active = t.id === secondaryTree?.id;
                        return (
                          <button
                            key={`grid-sec-${t.id}`}
                            type="button"
                            onClick={() => handleSelectSecondaryTree(t.id)}
                            title={t.name}
                            className={`w-6 h-6 rounded-full flex items-center justify-center border transition-[transform,border-color,background-color,opacity] duration-150 ${
                              active
                                ? 'border-[#C8AA6E] bg-[#0E1E36] scale-110'
                                : 'border-slate-700 opacity-45 hover:opacity-100'
                            }`}
                          >
                            <SafeGameIcon
                              src={t.imageUrl}
                              alt={t.name}
                              fallbackLabel={t.name}
                              sizeClass="w-4 h-4"
                              className="rounded-full border-0"
                            />
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Grille 3×3 des Runes Secondaires */}
              <div className="relative space-y-2.5 py-0.5">
                <div
                  aria-hidden="true"
                  className={`hidden sm:block absolute left-1/2 top-3 bottom-3 w-[1.5px] -translate-x-1/2 bg-gradient-to-b ${secondaryTheme.stemClass}`}
                />
                {(secondaryTree?.slots || []).slice(1, 4).map((slot, rowIdx) => (
                  <div
                    key={rowIdx}
                    className="relative z-10 flex items-center justify-around gap-2"
                  >
                    {slot.runes.map((rune) => {
                      const active = activeSet.has(rune.id);
                      const differs = active && compareRuneIds && !compareRuneIds.has(rune.id);
                      return (
                        <button
                          key={rune.id}
                          type="button"
                          onMouseEnter={() => inspectRune(rune)}
                          onClick={() => handleSelectSecondaryMinor(rowIdx + 1, rune)}
                          title={`${rune.name} — ${cleanRuneDesc(rune.shortDesc)}`}
                          className={`p-0.5 rounded-full bg-[#030912] transition-[transform,border-color,background-color,opacity] duration-150 focus:outline-none ${
                            active
                              ? `ring-2 ${differs ? 'ring-sky-400' : secondaryTheme.ringClass} scale-105`
                              : `opacity-35 grayscale hover:opacity-90 hover:grayscale-0 border border-[#C8AA6E]/20 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
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

              <HextechDiamondDivider label="Fragments" />

              {/* Grille 3×3 des Fragments intégrée directement sous l'arbre secondaire */}
              <div className="space-y-2">
                {SHARD_GRID.map((row, rIdx) => {
                  const chosenIdx = shardIndices[rIdx] ?? 0;
                  return (
                    <div key={row.rowLabel} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#A09B8C] w-14 shrink-0">
                        {row.rowLabel}
                      </span>
                      <div className="flex-1 flex items-center justify-around gap-2">
                        {row.options.map((opt, cIdx) => {
                          const active = cIdx === chosenIdx;
                          return (
                            <button
                              key={`${row.rowLabel}-${opt.id}-${cIdx}`}
                              type="button"
                              onClick={() => handleSelectShard(rIdx, cIdx, opt)}
                              onMouseEnter={() =>
                                setInspectedItem({
                                  name: `${row.rowLabel} · ${opt.clientLabel}`,
                                  desc: 'Bonus actif dès le niveau 1 sur votre champion.',
                                  iconUrl: opt.iconUrl,
                                })
                              }
                              title={opt.clientLabel}
                              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-[transform,border-color,background-color,opacity] duration-150 ${
                                active
                                  ? 'border-[#C8AA6E] bg-[#C8AA6E]/20 ring-2 ring-[#C8AA6E]/70 scale-110'
                                  : `border-slate-700 bg-[#030912] opacity-35 grayscale hover:opacity-95 hover:grayscale-0 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
                              }`}
                            >
                              <SafeGameIcon
                                src={opt.iconUrl}
                                alt={opt.clientLabel}
                                fallbackLabel={opt.shortLabel}
                                sizeClass="w-4 h-4"
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
            </div>

            {/* COLONNE 3 : Sanctuaire Runique + Tooltip détaillé en direct */}
            <div className="lg:col-span-3 flex flex-col justify-between gap-3">
              <RunicMonolithArt
                primaryTree={primaryTree}
                secondaryTree={secondaryTree}
                keystoneRune={keystoneRune}
                theme={primaryTheme}
                compact
              />

              {displayedTooltip && (
                <div className="rounded-xl border border-[#C8AA6E]/35 bg-[#010A13]/90 p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      {displayedTooltip.iconUrl && (
                        <SafeGameIcon
                          src={displayedTooltip.iconUrl}
                          alt={displayedTooltip.name}
                          fallbackLabel={displayedTooltip.name}
                          sizeClass="w-6 h-6"
                          className="rounded-full border-0 shrink-0"
                        />
                      )}
                      <div className="text-xs font-bold uppercase tracking-wide text-[#F0E6D2] truncate">
                        {displayedTooltip.name}
                      </div>
                    </div>
                    <p className="text-[11px] text-[#C8C3B4] leading-relaxed line-clamp-4">
                      {displayedTooltip.desc}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#C8AA6E]/20 text-[10px] font-mono tabular-nums text-[#A09B8C] space-y-0.5">
                    {selectedShards.map((s, idx) => (
                      <div key={idx} className="truncate">
                        · {s.clientLabel}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Barre inférieure façon Client LoL : description & note méta */}
      <div className="px-5 py-3 border-t border-[#C8AA6E]/25 bg-[#010A13]/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {viewStyle === 'client' ? (
            <label className="inline-flex items-center gap-2 text-[11px] text-[#A09B8C] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDetailedDesc}
                onChange={(e) => setShowDetailedDesc(e.target.checked)}
                className="accent-[#C8AA6E] rounded"
              />
              Afficher les descriptions détaillées
            </label>
          ) : (
            <span className="text-[11px] text-[#A09B8C]">
              {editable
                ? 'Cliquez sur n’importe quelle rune ou fragment dans la grille pour modifier votre page.'
                : 'Survolez ou cliquez sur une rune pour lire son effet détaillé.'}
            </span>
          )}
        </div>

        {footerNote && <div className="text-[11px] text-[#C8C3B4] leading-relaxed">{footerNote}</div>}
      </div>
    </section>
  );
}
