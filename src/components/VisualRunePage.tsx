import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Library,
  List,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Trash2,
} from 'lucide-react';
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
  /** Props client LoL officiel (édition de nom, sauvegarde, création, suppression, collection) */
  editableTitle?: string;
  onChangeTitle?: (nextTitle: string) => void;
  isDirty?: boolean;
  onSavePage?: () => void;
  onCreateNewPage?: () => void;
  onDeletePage?: () => void;
  onOpenCollection?: () => void;
  savedPagesCount?: number;
  maxSavedPages?: number;
  /** Statut et action de synchronisation directe avec le Client LoL (LCU) */
  isSyncedWithClient?: boolean;
  isCurrentInClient?: boolean;
  onActivateInClient?: () => void;
}

export interface TreeVisualTheme {
  key: 'resolve' | 'domination' | 'precision' | 'sorcery' | 'inspiration';
  subtitle: string;
  accentHex: string;
  secondaryHex: string;
  accentGlowHex: string;
  textClass: string;
  borderClass: string;
  ringClass: string;
  stemClass: string;
  nodeFillClass: string;
  glowShadow: string;
  backdropGradient: string;
}

export const TREE_THEMES: Record<TreeVisualTheme['key'], TreeVisualTheme> = {
  resolve: {
    key: 'resolve',
    subtitle: 'Vie éternelle. Durabilité et contrôles de foule.',
    accentHex: '#4ADE80',
    secondaryHex: '#059669',
    accentGlowHex: 'rgba(16, 185, 129, 0.36)',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-400/50',
    ringClass: 'ring-emerald-400',
    stemClass: 'from-emerald-300/80 via-emerald-500/45 to-emerald-500/15',
    nodeFillClass: 'bg-emerald-400',
    glowShadow: 'shadow-[0_0_24px_rgba(16,185,129,0.48)]',
    backdropGradient:
      'radial-gradient(circle at 78% 46%, rgba(16, 185, 129, 0.22) 0%, rgba(7, 19, 32, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  domination: {
    key: 'domination',
    subtitle: 'Chasse et élimination de proies. Dégâts immédiats et accès aux cibles.',
    accentHex: '#FB7185',
    secondaryHex: '#BE123C',
    accentGlowHex: 'rgba(244, 63, 94, 0.38)',
    textClass: 'text-rose-300',
    borderClass: 'border-rose-500/50',
    ringClass: 'ring-rose-500',
    stemClass: 'from-rose-400/80 via-rose-500/45 to-rose-500/15',
    nodeFillClass: 'bg-rose-400',
    glowShadow: 'shadow-[0_0_24px_rgba(244,63,94,0.48)]',
    backdropGradient:
      'radial-gradient(circle at 78% 46%, rgba(225, 29, 72, 0.24) 0%, rgba(18, 12, 26, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  precision: {
    key: 'precision',
    subtitle: 'Devenez une légende. Attaques améliorées et dégâts soutenus.',
    accentHex: '#F0E6D2',
    secondaryHex: '#C89B3C',
    accentGlowHex: 'rgba(200, 155, 60, 0.40)',
    textClass: 'text-[#F0E6D2]',
    borderClass: 'border-[#C8AA6E]/60',
    ringClass: 'ring-[#C8AA6E]',
    stemClass: 'from-[#F0E6D2]/85 via-[#C8AA6E]/45 to-[#785A28]/15',
    nodeFillClass: 'bg-[#F0E6D2]',
    glowShadow: 'shadow-[0_0_24px_rgba(200,170,110,0.48)]',
    backdropGradient:
      'radial-gradient(circle at 78% 46%, rgba(200, 155, 60, 0.22) 0%, rgba(14, 19, 32, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  sorcery: {
    key: 'sorcery',
    subtitle: 'Déchaînez la destruction. Compétences renforcées et manipulation des ressources.',
    accentHex: '#818CF8',
    secondaryHex: '#4F46E5',
    accentGlowHex: 'rgba(99, 102, 241, 0.42)',
    textClass: 'text-indigo-300',
    borderClass: 'border-indigo-400/50',
    ringClass: 'ring-indigo-400',
    stemClass: 'from-indigo-300/85 via-indigo-500/45 to-indigo-500/15',
    nodeFillClass: 'bg-indigo-300',
    glowShadow: 'shadow-[0_0_24px_rgba(99,102,241,0.5)]',
    backdropGradient:
      'radial-gradient(circle at 78% 46%, rgba(79, 70, 229, 0.24) 0%, rgba(10, 17, 36, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
  inspiration: {
    key: 'inspiration',
    subtitle: 'Trompez les mortels. Outils créatifs et modification des règles.',
    accentHex: '#38BDF8',
    secondaryHex: '#0284C7',
    accentGlowHex: 'rgba(14, 165, 233, 0.40)',
    textClass: 'text-cyan-300',
    borderClass: 'border-cyan-400/50',
    ringClass: 'ring-cyan-400',
    stemClass: 'from-cyan-300/85 via-cyan-500/45 to-cyan-500/15',
    nodeFillClass: 'bg-cyan-300',
    glowShadow: 'shadow-[0_0_24px_rgba(56,189,248,0.48)]',
    backdropGradient:
      'radial-gradient(circle at 78% 46%, rgba(14, 165, 233, 0.22) 0%, rgba(9, 20, 36, 0.96) 54%, rgba(1, 10, 19, 1) 100%)',
  },
};

export function getTreeTheme(tree?: RuneTree | null): TreeVisualTheme {
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

function HextechDiamondDivider({
  label,
  tone = 'gold',
}: {
  label?: string;
  tone?: 'gold' | 'arcane';
}) {
  const lineColor =
    tone === 'arcane'
      ? 'via-[#3B82F6]/45 to-[#60A5FA]/70'
      : 'via-[#C8AA6E]/35 to-[#C8AA6E]/55';
  const diamondColor = tone === 'arcane' ? 'border-[#60A5FA]/80' : 'border-[#C8AA6E]/80';

  return (
    <div className="flex items-center gap-2 py-0.5 select-none">
      <div className={`h-[1px] flex-1 bg-gradient-to-r from-transparent ${lineColor}`} />
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rotate-45 border ${diamondColor} bg-[#050C17] inline-block shrink-0`}
      />
      {label && (
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.16em] whitespace-nowrap ${
            tone === 'arcane' ? 'text-[#7DD3FC]' : 'text-[#C8AA6E]'
          }`}
        >
          {label}
        </span>
      )}
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rotate-45 border ${diamondColor} bg-[#050C17] inline-block shrink-0`}
      />
      <div className={`h-[1px] flex-1 bg-gradient-to-l from-transparent ${lineColor}`} />
    </div>
  );
}

/**
 * Artwork atmosphérique du Sanctuaire Runique inspiré du client League of Legends officiel.
 * Chaque Voie possède son architecture distincte (éclats flottants de Sorcellerie,
 * forge dorée de Précision, obélisque écarlate de Domination, bastion de Résolution,
 * gyroscope astral d'Inspiration) fondue directement dans le décor sans cadre rigide.
 */
export function RunicMonolithArt({
  primaryTree,
  secondaryTree,
  keystoneRune,
  theme,
  compact = false,
  cardMode = false,
}: {
  primaryTree: RuneTree | null;
  secondaryTree: RuneTree | null;
  keystoneRune: RuneSlotItem | null;
  theme: TreeVisualTheme;
  compact?: boolean;
  cardMode?: boolean;
}) {
  const rawUid = useId().replace(/:/g, '');
  const [constructFailed, setConstructFailed] = useState(false);
  const [keystoneArtFailed, setKeystoneArtFailed] = useState(false);

  const treeId = primaryTree?.id || 8000;
  const keystoneId = keystoneRune?.id || null;

  useEffect(() => {
    setConstructFailed(false);
  }, [treeId]);

  useEffect(() => {
    setKeystoneArtFailed(false);
  }, [treeId, keystoneId]);

  const svgSizeClass = cardMode
    ? 'w-full h-full'
    : compact
      ? 'w-52 h-64'
      : 'w-64 h-80';

  const officialConstructSrc = `/assets/runes/${treeId}/construct.png`;
  const officialKeystoneSrc = keystoneId ? `/assets/runes/${treeId}/keystones/${keystoneId}.png` : null;

  if (!constructFailed) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center select-none overflow-hidden ${
          cardMode
            ? 'w-full h-full'
            : compact
              ? 'min-h-[260px] py-2'
              : 'h-full min-h-[360px] py-2'
        }`}
      >
        {/* Halo énergétique subtil derrière le monument officiel */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 45%, ${theme.accentGlowHex} 0%, transparent 72%)`,
          }}
        />

        {/* Monument officiel LoL (construct.png + superposition exacte keystones/*.png) */}
        <div
          className={`relative z-10 ${
            cardMode
              ? 'w-full h-full'
              : compact
                ? 'w-60 h-60 sm:w-64 sm:h-64'
                : 'w-72 h-72 sm:w-80 sm:h-80 xl:w-[360px] xl:h-[360px]'
          } drop-shadow-[0_22px_40px_rgba(0,0,0,0.85)]`}
        >
          <img
            src={officialConstructSrc}
            alt={primaryTree?.name || 'Monument runique'}
            onError={() => setConstructFailed(true)}
            className="w-full h-full object-contain pointer-events-none select-none"
          />

          {officialKeystoneSrc && !keystoneArtFailed ? (
            <img
              src={officialKeystoneSrc}
              alt={keystoneRune?.name || 'Rune fondamentale'}
              onError={() => setKeystoneArtFailed(true)}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            />
          ) : (
            !cardMode &&
            keystoneRune && (
              <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <div className={`p-1 rounded-full bg-[#030912]/90 ring-2 ${theme.ringClass} ${theme.glowShadow}`}>
                  <SafeGameIcon
                    src={keystoneRune.imageUrl}
                    alt={keystoneRune.name}
                    fallbackLabel={keystoneRune.name}
                    sizeClass={compact ? 'w-12 h-12' : 'w-14 h-14'}
                    className="rounded-full border-0"
                  />
                </div>
              </div>
            )
          )}
        </div>

        {/* Discret rappel des deux voies sous le socle */}
        {!cardMode && primaryTree && (
          <div className="relative z-20 -mt-3 flex items-center gap-2 text-[11px] bg-[#010A13]/65 px-3 py-1 rounded-full border border-[#C8AA6E]/25 backdrop-blur-xs">
            <span className={`font-semibold uppercase tracking-wider ${theme.textClass}`}>
              {primaryTree.name}
            </span>
            {secondaryTree && (
              <>
                <span className="text-[#C8AA6E]/60" aria-hidden="true">
                  +
                </span>
                <span className="text-[#A09B8C] font-medium uppercase tracking-wider">
                  {secondaryTree.name}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center select-none overflow-hidden ${
        cardMode
          ? 'w-full h-full'
          : compact
            ? 'min-h-[250px] py-2'
            : 'h-full min-h-[340px] py-3'
      }`}
    >
      {/* Halo atmosphérique principal fondu dans le fond */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 44%, ${theme.accentGlowHex} 0%, rgba(9, 20, 40, 0.12) 52%, transparent 76%)`,
        }}
      />

      {/* Architecture du Monument Runique spécifique à la Voie (fallback SVG) */}
      <svg
        viewBox="0 0 260 320"
        className={`${svgSizeClass} relative z-10 drop-shadow-[0_18px_36px_rgba(0,0,0,0.85)]`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`stone-${rawUid}`} x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0%" stopColor="#2A364B" />
            <stop offset="50%" stopColor="#121C2D" />
            <stop offset="100%" stopColor="#070D17" />
          </linearGradient>
          <linearGradient id={`gold-${rawUid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFF4D6" />
            <stop offset="45%" stopColor="#C8AA6E" />
            <stop offset="100%" stopColor="#6E5223" />
          </linearGradient>
          <radialGradient id={`core-${rawUid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={theme.accentHex} stopOpacity="0.65" />
            <stop offset="55%" stopColor={theme.secondaryHex} stopOpacity="0.25" />
            <stop offset="100%" stopColor={theme.secondaryHex} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Socle runique au sol */}
        <ellipse
          cx="130"
          cy="282"
          rx="84"
          ry="16"
          fill="#060D17"
          stroke={theme.accentHex}
          strokeOpacity="0.32"
          strokeWidth="1.2"
        />
        <ellipse
          cx="130"
          cy="282"
          rx="54"
          ry="9"
          fill="none"
          stroke="#C8AA6E"
          strokeOpacity="0.35"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Halo énergétique central */}
        <circle cx="130" cy="144" r="96" fill={`url(#core-${rawUid})`} />
        <circle
          cx="130"
          cy="144"
          r="76"
          fill="none"
          stroke={theme.accentHex}
          strokeOpacity="0.28"
          strokeWidth="1.2"
          strokeDasharray="8 6"
        />

        {theme.key === 'sorcery' && (
          <>
            {/* Éclats de pierre en lévitation + étoiles arcaniques façon Sorcellerie */}
            <polygon points="130,22 135,54 130,68 125,54" fill={theme.accentHex} fillOpacity="0.72" />
            <polygon points="130,248 134,274 130,286 126,274" fill={theme.accentHex} fillOpacity="0.65" />
            <polygon
              points="108,52 146,42 152,82 126,112 98,92"
              fill={`url(#stone-${rawUid})`}
              stroke={theme.accentHex}
              strokeOpacity="0.45"
            />
            <polygon
              points="74,104 98,96 92,158 70,174 62,134"
              fill={`url(#stone-${rawUid})`}
              stroke="#60A5FA"
              strokeOpacity="0.35"
            />
            <polygon
              points="162,92 192,112 184,174 156,158"
              fill={`url(#stone-${rawUid})`}
              stroke="#60A5FA"
              strokeOpacity="0.35"
            />
            <polygon
              points="96,184 128,176 158,194 140,250 112,244"
              fill={`url(#stone-${rawUid})`}
              stroke={theme.accentHex}
              strokeOpacity="0.4"
            />
            {/* Étoiles arcaniques latérales */}
            <path d="M40 162 L44 176 L58 180 L44 184 L40 198 L36 184 L22 180 L36 176 Z" fill="#93C5FD" fillOpacity="0.55" />
            <path d="M214 148 L218 164 L234 168 L218 172 L214 188 L210 172 L194 168 L210 164 Z" fill="#93C5FD" fillOpacity="0.55" />
            <circle cx="130" cy="144" r="34" fill="#040A14" stroke={theme.accentHex} strokeOpacity="0.7" strokeWidth="1.6" />
          </>
        )}

        {theme.key === 'precision' && (
          <>
            {/* Sanctuaire doré ailé façon Précision */}
            <path
              d="M130 28 L142 62 L130 82 L118 62 Z"
              fill={`url(#gold-${rawUid})`}
              fillOpacity="0.85"
            />
            <path
              d="M66 112 L94 74 L166 74 L194 112 L158 242 L130 272 L102 242 Z"
              fill={`url(#stone-${rawUid})`}
              stroke={`url(#gold-${rawUid})`}
              strokeWidth="2"
            />
            <circle
              cx="130"
              cy="138"
              r="54"
              fill="#060E1A"
              stroke={`url(#gold-${rawUid})`}
              strokeWidth="3"
            />
            <path d="M52 128 L84 116 L84 156 L52 146 Z" fill={`url(#gold-${rawUid})`} fillOpacity="0.7" />
            <path d="M208 128 L176 116 L176 156 L208 146 Z" fill={`url(#gold-${rawUid})`} fillOpacity="0.7" />
          </>
        )}

        {theme.key === 'domination' && (
          <>
            {/* Obélisque tranchant et éclats écarlates façon Domination */}
            <polygon points="130,22 154,84 176,220 130,274 84,220 106,84" fill={`url(#stone-${rawUid})`} stroke="#FB7185" strokeOpacity="0.65" strokeWidth="1.8" />
            <polygon points="56,120 82,90 88,196 64,218" fill="#180D18" stroke="#F43F5E" strokeOpacity="0.55" strokeWidth="1.3" />
            <polygon points="204,120 178,90 172,196 196,218" fill="#180D18" stroke="#F43F5E" strokeOpacity="0.55" strokeWidth="1.3" />
            <polygon points="130,96 164,126 150,180 130,196 110,180 96,126" fill="#09040A" stroke="#FB7185" strokeWidth="2" />
          </>
        )}

        {theme.key === 'resolve' && (
          <>
            {/* Bastion monolithique émeraude façon Résolution */}
            <path
              d="M78 86 L104 54 L156 54 L182 86 L174 248 L130 270 L86 248 Z"
              fill={`url(#stone-${rawUid})`}
              stroke="#34D399"
              strokeOpacity="0.55"
              strokeWidth="1.8"
            />
            <rect x="92" y="92" width="14" height="140" rx="2" fill="#08161C" stroke="#C8AA6E" strokeOpacity="0.45" />
            <rect x="154" y="92" width="14" height="140" rx="2" fill="#08161C" stroke="#C8AA6E" strokeOpacity="0.45" />
            <polygon points="130,96 160,118 160,162 130,184 100,162 100,118" fill="#051314" stroke="#34D399" strokeWidth="2" />
          </>
        )}

        {theme.key === 'inspiration' && (
          <>
            {/* Gyroscope astral cyan façon Inspiration */}
            <circle cx="130" cy="142" r="68" fill="none" stroke="#38BDF8" strokeOpacity="0.45" strokeWidth="2.2" />
            <ellipse cx="130" cy="142" rx="84" ry="30" transform="rotate(-24 130 142)" fill="none" stroke={`url(#gold-${rawUid})`} strokeOpacity="0.6" strokeWidth="1.6" />
            <ellipse cx="130" cy="142" rx="84" ry="30" transform="rotate(24 130 142)" fill="none" stroke="#38BDF8" strokeOpacity="0.45" strokeWidth="1.4" />
            <polygon points="130,72 162,142 130,212 98,142" fill={`url(#stone-${rawUid})`} stroke="#38BDF8" strokeOpacity="0.65" strokeWidth="1.8" />
          </>
        )}
      </svg>

      {/* Rune Fondamentale incrustée au cœur du Sanctuaire */}
      {!cardMode && (
        <div
          className={`absolute ${compact ? 'top-[44%]' : 'top-[45%]'} left-1/2 -translate-x-1/2 -translate-y-1/2 z-20`}
        >
          {keystoneRune ? (
            <div className={`p-1 rounded-full bg-[#030912]/90 ring-2 ${theme.ringClass} ${theme.glowShadow}`}>
              <SafeGameIcon
                src={keystoneRune.imageUrl}
                alt={keystoneRune.name}
                fallbackLabel={keystoneRune.name}
                sizeClass={compact ? 'w-12 h-12' : 'w-14 h-14'}
                className="rounded-full border-0"
              />
            </div>
          ) : primaryTree ? (
            <SafeGameIcon
              src={primaryTree.imageUrl}
              alt={primaryTree.name}
              fallbackLabel={primaryTree.name}
              sizeClass="w-11 h-11"
              className="rounded-full border-0"
            />
          ) : null}
        </div>
      )}

      {/* Discret rappel des deux voies sous le socle */}
      {!cardMode && primaryTree && (
        <div className="relative z-20 -mt-2 flex items-center gap-2 text-[11px]">
          <span className={`font-semibold uppercase tracking-wider ${theme.textClass}`}>
            {primaryTree.name}
          </span>
          {secondaryTree && (
            <>
              <span className="text-[#C8AA6E]/60" aria-hidden="true">
                +
              </span>
              <span className="text-[#A09B8C] font-medium uppercase tracking-wider">
                {secondaryTree.name}
              </span>
            </>
          )}
        </div>
      )}
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
  editableTitle,
  onChangeTitle,
  isDirty = false,
  onSavePage,
  onCreateNewPage,
  onDeletePage,
  onOpenCollection,
  savedPagesCount,
  maxSavedPages = 15,
  isSyncedWithClient = false,
  isCurrentInClient = false,
  onActivateInClient,
}: VisualRunePageProps) {
  const [viewStyle, setViewStyle] = useState<'client' | 'grid'>(defaultViewStyle);
  const [showDetailedDesc, setShowDetailedDesc] = useState(true);
  const [openEditorSlot, setOpenEditorSlot] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [envImgFailed, setEnvImgFailed] = useState(false);
  const [inspectedItem, setInspectedItem] = useState<{
    name: string;
    desc: string;
    iconUrl?: string;
  } | null>(null);

  const primaryTree = useMemo(
    () => runeTrees.find((t) => t.id === primaryTreeId) || runeTrees[0] || null,
    [runeTrees, primaryTreeId],
  );

  useEffect(() => {
    setEnvImgFailed(false);
  }, [primaryTree?.id]);
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

  const resolvedTitle =
    editableTitle ??
    pageTitle ??
    (championName ? `${championName} · ${primaryTree.name}` : `Page de runes · ${primaryTree.name}`);

  const commitTitleEdit = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && onChangeTitle) {
      onChangeTitle(trimmed);
    }
    setIsEditingTitle(false);
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
      className="relative rounded-xl border border-[#785A28]/70 overflow-hidden shadow-2xl bg-[#010A13]"
      style={{ background: primaryTheme.backdropGradient }}
    >
      {/* Décor officiel Riot de la Voie Principale (Demacia, Noxus, Targon, Piltover, Ixtal) */}
      {!envImgFailed && (
        <>
          <img
            src={`/assets/runes/${primaryTree.id}/environment.jpg`}
            alt=""
            aria-hidden="true"
            onError={() => setEnvImgFailed(true)}
            className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center opacity-80 transition-opacity duration-500"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(1,10,19,0.92) 0%, rgba(1,10,19,0.78) 48%, rgba(1,10,19,0.28) 100%), linear-gradient(180deg, rgba(1,10,19,0.55) 0%, transparent 28%, rgba(1,10,19,0.82) 100%)',
            }}
          />
        </>
      )}

      {/* Ornements de coin Hextech façon client League of Legends */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-[#C8AA6E]/75 z-20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-[#C8AA6E]/75 z-20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-[#C8AA6E]/75 z-20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-[#C8AA6E]/75 z-20"
      />

      {/* Barre supérieure officielle Client LoL : Crayon + Titre + SAUVEGARDER + (+) + (Poubelle) */}
      <div className="relative z-10 px-5 py-3.5 border-b border-[#C8AA6E]/20 bg-[#010A13]/80 backdrop-blur-xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          {/* Bouton Crayon édition titre ou icône voie en lecture seule */}
          {onChangeTitle && editable ? (
            <button
              type="button"
              onClick={() => {
                setDraftTitle(resolvedTitle);
                setIsEditingTitle((v) => !v);
              }}
              title="Renommer cette page de runes"
              aria-label="Renommer cette page de runes"
              className="w-8 h-8 rounded-full border-2 border-[#C8AA6E]/80 bg-[#091428] flex items-center justify-center text-[#F0E6D2] hover:bg-[#C8AA6E]/20 transition-colors shrink-0"
            >
              <Pencil className="w-3.5 h-3.5 text-[#C8AA6E]" aria-hidden="true" />
            </button>
          ) : (
            <div className="w-8 h-8 rounded-full border-2 border-[#C8AA6E]/75 bg-[#091428] flex items-center justify-center shrink-0">
              <SafeGameIcon
                src={primaryTree.imageUrl}
                alt={primaryTree.name}
                fallbackLabel={primaryTree.name}
                sizeClass="w-5 h-5"
                className="rounded-full border-0"
              />
            </div>
          )}

          {/* Titre modifiable ou sélecteur Collection */}
          <div className="min-w-0 flex items-center gap-2">
            {isEditingTitle && onChangeTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  maxLength={36}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitleEdit();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  onBlur={commitTitleEdit}
                  className="px-2.5 py-1 text-sm font-bold text-[#F0E6D2] bg-[#010A13] border border-[#C8AA6E] rounded focus:outline-none"
                />
                <button
                  type="button"
                  onClick={commitTitleEdit}
                  className="p-1.5 rounded bg-[#C8AA6E] text-[#010A13] hover:bg-[#F0E6D2]"
                  aria-label="Valider le nom"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-wide text-[#F0E6D2] truncate">
                    {onChangeTitle && editable ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftTitle(resolvedTitle);
                          setIsEditingTitle(true);
                        }}
                        aria-label={`Renommer la page de runes (${resolvedTitle})`}
                        className="text-left hover:text-[#C8AA6E] focus:outline-none focus-visible:underline transition-colors truncate max-w-full"
                      >
                        {resolvedTitle}
                      </button>
                    ) : (
                      resolvedTitle
                    )}
                  </h2>
                  {onOpenCollection && (
                    <button
                      type="button"
                      onClick={onOpenCollection}
                      title="Ouvrir la collection de vos pages de runes"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-[#C8AA6E] hover:bg-[#C8AA6E]/15 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span className="flex flex-col leading-none">
                        <ChevronUp className="w-2.5 h-2.5 -mb-0.5" aria-hidden="true" />
                        <ChevronDown className="w-2.5 h-2.5" aria-hidden="true" />
                      </span>
                      {typeof savedPagesCount === 'number' && (
                        <span className="font-mono tabular-nums">
                          {savedPagesCount}/{maxSavedPages}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                {sourceLabel && (
                  <p className="text-[11px] text-[#A09B8C] truncate">{sourceLabel}</p>
                )}
              </div>
            )}
          </div>

          {/* Contrôles centraux client LoL : SAUVEGARDER · (+) · (Poubelle) */}
          {(onSavePage || onCreateNewPage || onDeletePage) && (
            <div className="flex items-center gap-2 sm:ml-4">
              {onSavePage && (
                <button
                  type="button"
                  onClick={onSavePage}
                  disabled={!editable}
                  className={`px-5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] border transition-all whitespace-nowrap shrink-0 ${
                    isDirty
                      ? 'border-[#C8AA6E] bg-[#1E2328] text-[#F0E6D2] shadow-[0_0_16px_rgba(200,170,110,0.3)] hover:bg-[#2A3036]'
                      : 'border-[#5B5A56]/70 bg-[#1E2328]/75 text-[#A09B8C] hover:border-[#C8AA6E]/60 hover:text-[#F0E6D2]'
                  }`}
                >
                  SAUVEGARDER
                </button>
              )}

              {onCreateNewPage && (
                <button
                  type="button"
                  onClick={onCreateNewPage}
                  title="Créer une nouvelle page de runes"
                  aria-label="Créer une nouvelle page de runes"
                  className="w-8 h-8 rounded-full border-2 border-[#C8AA6E]/75 bg-[#091428] flex items-center justify-center text-[#C8AA6E] hover:bg-[#C8AA6E]/20 hover:text-[#F0E6D2] transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
              )}

              {onDeletePage && (
                <button
                  type="button"
                  onClick={onDeletePage}
                  title="Supprimer la page active"
                  aria-label="Supprimer la page active"
                  className="w-8 h-8 rounded-full border-2 border-[#C8AA6E]/65 bg-[#091428] flex items-center justify-center text-[#C8AA6E] hover:border-rose-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions droites : Statut Client LoL, Collection, Reset Méta & Conseillée/Équipée */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isSyncedWithClient && (
            <button
              type="button"
              onClick={onActivateInClient}
              disabled={!onActivateInClient || isCurrentInClient}
              title={
                isCurrentInClient
                  ? 'Cette page est actuellement sélectionnée dans votre client League of Legends'
                  : 'Définir cette page comme page active dans votre client League of Legends'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded border transition-colors whitespace-nowrap ${
                isCurrentInClient
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300 cursor-default'
                  : 'border-sky-400/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
              }`}
            >
              <Radio className="w-3 h-3" aria-hidden="true" />
              <span>{isCurrentInClient ? 'Active dans LoL' : 'Équiper dans LoL'}</span>
            </button>
          )}

          {onOpenCollection && (
            <button
              type="button"
              onClick={onOpenCollection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-[#C8AA6E]/45 bg-[#091428] text-[#F0E6D2] hover:border-[#C8AA6E] hover:bg-[#C8AA6E]/15 transition-colors whitespace-nowrap"
            >
              <Library className="w-3.5 h-3.5 text-[#C8AA6E]" aria-hidden="true" />
              <span>Collection</span>
            </button>
          )}

          {editable && onResetToMeta && (
            <button
              type="button"
              onClick={() => {
                onResetToMeta();
                setOpenEditorSlot(null);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-[#C8AA6E]/45 bg-[#091428] text-[#F0E6D2] hover:bg-[#C8AA6E]/20 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#C8AA6E]" aria-hidden="true" />
              <span>Réinitialiser Méta</span>
            </button>
          )}
          {headerActions}
        </div>
      </div>

      {/* Corps principal : Mode Liste fidèle (Capture 1) OU Mode Grille complète (Capture 2) */}
      <div className="relative z-10 p-5 sm:p-6">
        {viewStyle === 'client' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* COLONNE 1 : Arbre Principal façon Capture 1 */}
            <div className="lg:col-span-4 relative pl-1">
              <div
                aria-hidden="true"
                className={`absolute left-[29px] top-14 bottom-8 w-[2px] bg-gradient-to-b ${primaryTheme.stemClass}`}
              />

              <div className="space-y-3.5">
                {/* En-tête Voie Principale (cliquable en mode éditable pour changer de voie) */}
                <div className="space-y-2">
                  <div className="relative z-10 flex items-start gap-3.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (editable) {
                          setOpenEditorSlot((cur) => (cur === 'p-tree' ? null : 'p-tree'));
                        }
                      }}
                      title={editable ? 'Changer la voie principale' : primaryTree.name}
                      className={`w-14 h-14 rounded-full bg-[#091428] border-2 border-[#C8AA6E]/80 flex items-center justify-center shrink-0 ${primaryTheme.glowShadow} ${
                        editable ? 'cursor-pointer hover:scale-105 transition-transform' : ''
                      }`}
                    >
                      <SafeGameIcon
                        src={primaryTree.imageUrl}
                        alt={primaryTree.name}
                        fallbackLabel={primaryTree.name}
                        sizeClass="w-9 h-9"
                        className="rounded-full border-0"
                      />
                    </button>
                    <div className="pt-0.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-bold uppercase tracking-[0.12em] ${primaryTheme.textClass}`}>
                          {primaryTree.name}
                        </span>
                        {editable && (
                          <button
                            type="button"
                            onClick={() =>
                              setOpenEditorSlot((cur) => (cur === 'p-tree' ? null : 'p-tree'))
                            }
                            className="text-[10px] font-semibold text-[#C8AA6E] hover:underline"
                          >
                            Changer
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-[#C8C3B4] leading-snug mt-0.5">
                        {primaryTheme.subtitle}
                      </p>
                    </div>
                  </div>

                  {editable && openEditorSlot === 'p-tree' && (
                    <div className="relative z-20 ml-14 p-2 rounded-lg border border-[#C8AA6E]/45 bg-[#030912]/95 flex flex-wrap gap-1.5">
                      {runeTrees.map((t) => {
                        const active = t.id === primaryTree.id;
                        return (
                          <button
                            key={`list-ptree-${t.id}`}
                            type="button"
                            onClick={() => handleSelectPrimaryTree(t.id)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
                              active
                                ? 'border-[#C8AA6E] bg-[#0E1E36] text-[#F0E6D2] font-semibold'
                                : 'border-slate-700/70 text-[#A09B8C] hover:text-[#F0E6D2]'
                            }`}
                          >
                            <SafeGameIcon
                              src={t.imageUrl}
                              alt={t.name}
                              fallbackLabel={t.name}
                              sizeClass="w-4 h-4"
                              className="rounded-full border-0"
                            />
                            <span>{t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pl-[68px]">
                  <HextechDiamondDivider label="Runes fondamentales" tone="arcane" />
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
                            <ChevronDown className="w-3.5 h-3.5 text-[#C8AA6E]/80 opacity-70 group-hover:opacity-100 shrink-0" />
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
                              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
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
                  <HextechDiamondDivider tone="arcane" />
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
                          className="relative z-10 w-full flex items-start gap-4 pl-1.5 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.04] focus:outline-none"
                        >
                          <div
                            className={`w-11 h-11 rounded-full bg-[#030912] flex items-center justify-center shrink-0 ring-2 ${
                              differs ? 'ring-sky-400' : 'ring-[#C8AA6E]/80'
                            } group-hover:scale-105 transition-transform`}
                          >
                            <SafeGameIcon
                              src={rune.imageUrl}
                              alt={rune.name}
                              fallbackLabel={rune.name}
                              sizeClass="w-10 h-10"
                              className="rounded-full border-0"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-bold uppercase tracking-wide ${primaryTheme.textClass}`}>
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
                              <p className="text-[11px] text-[#C8C3B4] leading-snug mt-0.5 line-clamp-3">
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
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
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

            {/* COLONNE 2 : Arbre Secondaire + Fragments empilés sur la même colonne verticale (Capture 1) */}
            <div className="lg:col-span-4 relative flex flex-col justify-between gap-4 pl-1">
              {secondaryTree && (
                <div className="relative space-y-4">
                  {/* Colonne dorée continue reliant l'arbre secondaire et les 3 fragments */}
                  <div
                    aria-hidden="true"
                    className={`absolute left-[27px] top-12 bottom-4 w-[2px] bg-gradient-to-b ${secondaryTheme.stemClass}`}
                  />

                  <div className="space-y-2">
                    <div className="relative z-10 flex items-start gap-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editable) {
                            setOpenEditorSlot((cur) => (cur === 's-tree' ? null : 's-tree'));
                          }
                        }}
                        title={editable ? 'Changer la voie secondaire' : secondaryTree.name}
                        className={`w-13 h-13 rounded-full bg-[#091428] border-2 border-[#C8AA6E]/75 flex items-center justify-center shrink-0 ${
                          editable ? 'cursor-pointer hover:scale-105 transition-transform' : ''
                        }`}
                      >
                        <SafeGameIcon
                          src={secondaryTree.imageUrl}
                          alt={secondaryTree.name}
                          fallbackLabel={secondaryTree.name}
                          sizeClass="w-8 h-8"
                          className="rounded-full border-0"
                        />
                      </button>
                      <div className="pt-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold uppercase tracking-[0.12em] text-[#C8AA6E]">
                            {secondaryTree.name}
                          </span>
                          {editable && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenEditorSlot((cur) => (cur === 'sec-all' ? null : 'sec-all'))
                              }
                              className="text-[10px] font-semibold text-[#C8AA6E] hover:underline"
                            >
                              {openEditorSlot === 'sec-all' ? 'Fermer' : 'Modifier runes'}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-[#C8C3B4] leading-snug mt-0.5">
                          {secondaryTheme.subtitle}
                        </p>
                      </div>
                    </div>

                    {editable && openEditorSlot === 's-tree' && (
                      <div className="relative z-20 ml-14 p-2 rounded-lg border border-[#C8AA6E]/45 bg-[#030912]/95 flex flex-wrap gap-1.5">
                        {runeTrees
                          .filter((t) => t.id !== primaryTree.id)
                          .map((t) => {
                            const active = t.id === secondaryTree.id;
                            return (
                              <button
                                key={`list-stree-${t.id}`}
                                type="button"
                                onClick={() => handleSelectSecondaryTree(t.id)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
                                  active
                                    ? 'border-[#C8AA6E] bg-[#0E1E36] text-[#F0E6D2] font-semibold'
                                    : 'border-slate-700/70 text-[#A09B8C] hover:text-[#F0E6D2]'
                                }`}
                              >
                                <SafeGameIcon
                                  src={t.imageUrl}
                                  alt={t.name}
                                  fallbackLabel={t.name}
                                  sizeClass="w-4 h-4"
                                  className="rounded-full border-0"
                                />
                                <span>{t.name}</span>
                              </button>
                            );
                          })}
                      </div>
                    )}
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
                                className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] transition-colors ${
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

                  {/* 2 Runes secondaires */}
                  <div className="space-y-3.5 pt-1">
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
                          className="relative z-10 w-full flex items-start gap-4 pl-1.5 text-left group rounded-lg py-1 transition-colors hover:bg-white/[0.04] focus:outline-none"
                        >
                          <div
                            className={`w-11 h-11 rounded-full bg-[#030912] flex items-center justify-center shrink-0 ring-2 ${
                              differs ? 'ring-sky-400' : 'ring-[#C8AA6E]/75'
                            } group-hover:scale-105 transition-transform`}
                          >
                            <SafeGameIcon
                              src={rune.imageUrl}
                              alt={rune.name}
                              fallbackLabel={rune.name}
                              sizeClass="w-10 h-10"
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
                              <p className="text-[11px] text-[#C8C3B4] leading-snug mt-0.5 line-clamp-3">
                                {cleanRuneDesc(rune.shortDesc)}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* 3 Fragments directement alignés sur la même colonne verticale */}
                  <div className="pt-2 space-y-2.5 pl-3">
                    {selectedShards.map((shard, idx) => {
                      const shardEditorKey = `shard-${idx}`;
                      return (
                        <div key={`${shard.id}-${idx}`} className="relative z-10 space-y-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectedItem({
                                name: `Fragment ${SHARD_GRID[idx].rowLabel} : ${shard.clientLabel}`,
                                desc: 'Bonus actif dès le niveau 1 sur votre champion.',
                                iconUrl: shard.iconUrl,
                              });
                              if (editable) {
                                setOpenEditorSlot((cur) =>
                                  cur === shardEditorKey ? null : shardEditorKey,
                                );
                              }
                            }}
                            className="w-full flex items-center justify-between gap-2 text-left rounded-md py-1 hover:bg-white/[0.04] transition-colors focus:outline-none group"
                          >
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-[#030912] border border-[#C8AA6E]/85 flex items-center justify-center shrink-0">
                                <SafeGameIcon
                                  src={shard.iconUrl}
                                  alt={shard.clientLabel}
                                  fallbackLabel={shard.shortLabel}
                                  sizeClass="w-4 h-4"
                                  className="rounded-full border-0"
                                />
                              </div>
                              <span className="text-xs text-[#F0E6D2] font-medium truncate">
                                {shard.clientLabel}
                              </span>
                            </div>
                            {editable && (
                              <ChevronDown className="w-3 h-3 text-[#C8AA6E]/75 opacity-70 group-hover:opacity-100 shrink-0" />
                            )}
                          </button>

                          {editable && openEditorSlot === shardEditorKey && (
                            <div className="ml-11 p-1.5 rounded-lg border border-[#C8AA6E]/45 bg-[#030912]/95 flex flex-wrap gap-1.5">
                              {SHARD_GRID[idx].options.map((opt, colIdx) => {
                                const active = colIdx === (shardIndices[idx] ?? 0);
                                return (
                                  <button
                                    key={`${opt.id}-${colIdx}`}
                                    type="button"
                                    onClick={() => handleSelectShard(idx, colIdx, opt)}
                                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
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
              )}
            </div>

            {/* COLONNE 3 : Sanctuaire Runique flottant sans boîte rigide + tooltip discret */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-2">
              <RunicMonolithArt
                primaryTree={primaryTree}
                secondaryTree={secondaryTree}
                keystoneRune={keystoneRune}
                theme={primaryTheme}
              />

              {displayedTooltip && (
                <div className="rounded-lg border border-[#C8AA6E]/25 bg-[#010A13]/70 backdrop-blur-xs px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
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
          /* MODE GRILLE COMPLÈTE AUTHENTIQUE (Capture 2) : Crêtes en ligne + Axes verticaux à nœuds + Sanctuaire */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* COLONNE 1 : 5 Voies en ligne + Axe à nœuds + 4 Fondamentales + 3×3 Mineures */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-3">
              {/* Ligne supérieure : Médaille active + 5 crêtes inline */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-13 h-13 rounded-full bg-[#091428] border-2 border-[#C8AA6E]/85 flex items-center justify-center shrink-0 ${primaryTheme.glowShadow}`}
                >
                  <SafeGameIcon
                    src={primaryTree.imageUrl}
                    alt={primaryTree.name}
                    fallbackLabel={primaryTree.name}
                    sizeClass="w-8 h-8"
                    className="rounded-full border-0"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {runeTrees.map((t) => {
                    const active = t.id === primaryTree.id;
                    const tTheme = getTreeTheme(t);
                    return (
                      <button
                        key={`grid-p-${t.id}`}
                        type="button"
                        disabled={!editable}
                        onClick={() => handleSelectPrimaryTree(t.id)}
                        title={t.name}
                        className={`w-8 h-8 rounded-full flex items-center justify-center border transition-[transform,border-color,opacity] duration-150 ${
                          active
                            ? `${tTheme.borderClass} bg-[#0E1E36] scale-110 ring-1 ring-[#C8AA6E]`
                            : `border-transparent opacity-45 hover:opacity-100 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
                        }`}
                      >
                        <SafeGameIcon
                          src={t.imageUrl}
                          alt={t.name}
                          fallbackLabel={t.name}
                          sizeClass="w-6 h-6"
                          className="rounded-full border-0"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grille principale avec axe vertical gauche à 4 nœuds comme Capture 2 */}
              <div className="relative pl-10 space-y-3 my-auto">
                <div
                  aria-hidden="true"
                  className={`absolute left-[25px] top-2 bottom-4 w-[2px] bg-gradient-to-b ${primaryTheme.stemClass}`}
                />

                {/* Rangée des Fondamentales */}
                {primaryTree.slots?.[0] && (
                  <div className="relative space-y-2">
                    <div
                      aria-hidden="true"
                      className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#F0E6D2] bg-[#030912] flex items-center justify-center`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${primaryTheme.nodeFillClass}`} />
                    </div>
                    <HextechDiamondDivider label="Runes fondamentales" tone="arcane" />
                    <div className="py-1.5 flex items-center justify-around gap-2">
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
                            className={`p-0.5 rounded-full bg-[#030912] transition-[transform,border-color,opacity] duration-150 focus:outline-none ${
                              active
                                ? `ring-2 ${differs ? 'ring-sky-400' : primaryTheme.ringClass} ${primaryTheme.glowShadow} scale-115`
                                : `opacity-35 grayscale hover:opacity-95 hover:grayscale-0 border border-[#C8AA6E]/20 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
                            }`}
                          >
                            <SafeGameIcon
                              src={rune.imageUrl}
                              alt={rune.name}
                              fallbackLabel={rune.name}
                              sizeClass="w-11 h-11"
                              className="rounded-full border-0"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <HextechDiamondDivider tone="arcane" />

                {/* 3 Rangées de Runes Mineures */}
                <div className="space-y-3.5">
                  {primaryTree.slots.slice(1, 4).map((slot, rowIdx) => (
                    <div
                      key={rowIdx}
                      className="relative flex items-center justify-around gap-2 py-0.5"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute -left-[22px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-[#C8AA6E]/80 bg-[#030912] flex items-center justify-center"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${primaryTheme.nodeFillClass}`} />
                      </div>
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
                            className={`p-0.5 rounded-full bg-[#030912] transition-[transform,border-color,opacity] duration-150 focus:outline-none ${
                              active
                                ? `ring-2 ${differs ? 'ring-sky-400' : 'ring-[#C8AA6E]'} ${primaryTheme.glowShadow} scale-105`
                                : `opacity-35 grayscale hover:opacity-95 hover:grayscale-0 border border-[#C8AA6E]/20 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
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
              </div>
            </div>

            {/* COLONNE 2 : 4 Voies Secondaires en ligne + Axe à nœuds + 3×3 Secondaires + 3×3 Fragments */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-3">
              {/* En-tête Voie Secondaire + 4 crêtes inline */}
              <div className="flex items-center gap-3">
                {secondaryTree && (
                  <div className="w-13 h-13 rounded-full bg-[#091428] border-2 border-[#C8AA6E]/75 flex items-center justify-center shrink-0">
                    <SafeGameIcon
                      src={secondaryTree.imageUrl}
                      alt={secondaryTree.name}
                      fallbackLabel={secondaryTree.name}
                      sizeClass="w-8 h-8"
                      className="rounded-full border-0"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {runeTrees
                    .filter((t) => t.id !== primaryTree.id)
                    .map((t) => {
                      const active = t.id === secondaryTree?.id;
                      const tTheme = getTreeTheme(t);
                      return (
                        <button
                          key={`grid-s-${t.id}`}
                          type="button"
                          disabled={!editable}
                          onClick={() => handleSelectSecondaryTree(t.id)}
                          title={t.name}
                          className={`w-8 h-8 rounded-full flex items-center justify-center border transition-[transform,border-color,opacity] duration-150 ${
                            active
                              ? `${tTheme.borderClass} bg-[#0E1E36] scale-110 ring-1 ring-[#C8AA6E]`
                              : `border-transparent opacity-45 hover:opacity-100 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
                          }`}
                        >
                          <SafeGameIcon
                            src={t.imageUrl}
                            alt={t.name}
                            fallbackLabel={t.name}
                            sizeClass="w-6 h-6"
                            className="rounded-full border-0"
                          />
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Axe continu Secondaire (2 nœuds) + Fragments (3 nœuds) */}
              <div className="relative pl-10 space-y-3 my-auto">
                <div
                  aria-hidden="true"
                  className={`absolute left-[25px] top-2 bottom-2 w-[2px] bg-gradient-to-b ${secondaryTheme.stemClass}`}
                />

                {/* 3 rangées de Runes Secondaires */}
                <div className="space-y-3">
                  {(secondaryTree?.slots || []).slice(1, 4).map((slot, rowIdx) => {
                    const rowHasActive = slot.runes.some((r) => activeSet.has(r.id));
                    return (
                      <div
                        key={rowIdx}
                        className="relative flex items-center justify-around gap-2"
                      >
                        <div
                          aria-hidden="true"
                          className={`absolute -left-[22px] top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 bg-[#030912] flex items-center justify-center ${
                            rowHasActive ? 'border-[#C8AA6E]' : 'border-[#785A28]/50'
                          }`}
                        >
                          {rowHasActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C8AA6E]" />
                          )}
                        </div>
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
                              className={`p-0.5 rounded-full bg-[#030912] transition-[transform,border-color,opacity] duration-150 focus:outline-none ${
                                active
                                  ? `ring-2 ${differs ? 'ring-sky-400' : secondaryTheme.ringClass} scale-105`
                                  : `opacity-35 grayscale hover:opacity-95 hover:grayscale-0 border border-[#C8AA6E]/20 ${editable ? 'cursor-pointer hover:scale-105' : ''}`
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
                    );
                  })}
                </div>

                <HextechDiamondDivider />

                {/* Grille 3×3 des Fragments alignée sur les 3 nœuds dorés */}
                <div className="space-y-2.5 pt-0.5">
                  {SHARD_GRID.map((row, rIdx) => {
                    const chosenIdx = shardIndices[rIdx] ?? 0;
                    return (
                      <div key={row.rowLabel} className="relative flex items-center justify-around gap-2">
                        <div
                          aria-hidden="true"
                          className="absolute -left-[20px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-[#C8AA6E] bg-[#030912] flex items-center justify-center"
                        >
                          <span className="w-1 h-1 rounded-full bg-[#F0E6D2]" />
                        </div>
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
                              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-[transform,border-color,opacity] duration-150 ${
                                active
                                  ? 'border-[#C8AA6E] bg-[#C8AA6E]/20 ring-2 ring-[#C8AA6E]/80 scale-110'
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
                    );
                  })}
                </div>
              </div>
            </div>

            {/* COLONNE 3 : Sanctuaire Runique spacieux + Tooltip discret */}
            <div className="lg:col-span-4 flex flex-col justify-between gap-2">
              <RunicMonolithArt
                primaryTree={primaryTree}
                secondaryTree={secondaryTree}
                keystoneRune={keystoneRune}
                theme={primaryTheme}
              />

              {displayedTooltip && showDetailedDesc && (
                <div className="rounded-lg border border-[#C8AA6E]/25 bg-[#010A13]/75 px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
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
                    <div className="font-bold uppercase tracking-wide text-[#F0E6D2] truncate">
                      {displayedTooltip.name}
                    </div>
                    <p className="text-[11px] text-[#A09B8C] leading-relaxed mt-0.5 line-clamp-2">
                      {displayedTooltip.desc}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Barre inférieure fidèle aux captures 1 & 2 : Bascule [Liste | Grille] + Checkbox description + Note */}
      <div className="relative z-10 px-5 py-3 border-t border-[#C8AA6E]/20 bg-[#010A13]/85 backdrop-blur-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          {/* Bascule compacte Liste / Grille comme dans le coin inférieur gauche du client LoL */}
          <div
            role="group"
            aria-label="Mode d'affichage des runes"
            className="inline-flex items-center border border-[#785A28]/80 bg-[#091428] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setViewStyle('client')}
              title="Vue détaillée (Liste)"
              aria-label="Vue détaillée"
              aria-pressed={viewStyle === 'client'}
              className={`p-1.5 transition-colors ${
                viewStyle === 'client'
                  ? 'bg-[#1E2B3E] text-[#F0E6D2]'
                  : 'text-[#A09B8C] hover:text-[#F0E6D2]'
              }`}
            >
              <List className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewStyle('grid')}
              title="Vue Grille interactive"
              aria-label="Vue Grille"
              aria-pressed={viewStyle === 'grid'}
              className={`p-1.5 border-l border-[#785A28]/60 transition-colors ${
                viewStyle === 'grid'
                  ? 'bg-[#1E2B3E] text-[#F0E6D2]'
                  : 'text-[#A09B8C] hover:text-[#F0E6D2]'
              }`}
            >
              <LayoutGrid className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-[11px] text-[#A09B8C] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDetailedDesc}
              onChange={(e) => setShowDetailedDesc(e.target.checked)}
              className="accent-[#C8AA6E] rounded"
            />
            Affichez les descriptions détaillées
          </label>
        </div>

        {footerNote && <div className="text-[11px] text-[#C8C3B4] leading-relaxed">{footerNote}</div>}
      </div>
    </section>
  );
}
