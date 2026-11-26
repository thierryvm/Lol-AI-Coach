import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  Compass,
  Eye,
  Flame,
  History,
  Layers,
  LayoutDashboard,
  Shield,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
} from 'lucide-react';
import type {
  ChampionSummary,
  DDragonBootstrap,
  ItemData,
  MatchRecord,
  PlayerProfileResponse,
  Role,
  RuneTree,
} from '../engines/types.ts';
import { formatChampionDisplayName } from '../utils/championDisplay.ts';
import { formatRankedQueue } from '../utils/rankedDisplay.ts';
import { RankedTierCrest } from './RankedTierCrest.tsx';
import { SafeGameIcon } from './SafeGameIcon.tsx';

type MockScreenId = 'dashboard' | 'builds' | 'postgame';
type MockThemeId = 'obsidian' | 'hextech' | 'editorial';

interface DesignMockupViewProps {
  ddragon: DDragonBootstrap;
  profile: PlayerProfileResponse | null;
  riotId: string;
  defaultRole: Role;
  onApplyToLiveApp?: () => void;
}

interface ThemeTokens {
  id: MockThemeId;
  name: string;
  inspiration: string;
  summary: string;
  isLight: boolean;
  frameBg: string;
  surfaceBg: string;
  elevatedBg: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accentBg: string;
  accentText: string;
  accentSoftBg: string;
  accentBorder: string;
  accentHex: string;
  secondaryHex: string;
  positiveText: string;
  negativeText: string;
  barTrack: string;
}

const THEME_PRESETS: Record<MockThemeId, ThemeTokens> = {
  obsidian: {
    id: 'obsidian',
    name: 'Obsidian Esports',
    inspiration: 'Blitz.gg × Linear',
    summary: 'Noir carbone profond, contrastes nets et accent bleu tactique pour lecture instantanée.',
    isLight: false,
    frameBg: 'bg-[#090B10]',
    surfaceBg: 'bg-[#10141E]',
    elevatedBg: 'bg-[#151B28]',
    borderColor: 'border-white/[0.08]',
    textPrimary: 'text-slate-50',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
    accentBg: 'bg-sky-500 text-slate-950 hover:bg-sky-400',
    accentText: 'text-sky-400',
    accentSoftBg: 'bg-sky-500/12',
    accentBorder: 'border-sky-400/35',
    accentHex: '#38BDF8',
    secondaryHex: '#818CF8',
    positiveText: 'text-emerald-400',
    negativeText: 'text-rose-400',
    barTrack: 'bg-white/[0.07]',
  },
  hextech: {
    id: 'hextech',
    name: 'Hextech Prestige',
    inspiration: 'Mobalytics × Client LoL',
    summary: 'Bleu nuit profond, filet or Hextech et turquoise analytique fidèle à l’univers League.',
    isLight: false,
    frameBg: 'bg-[#08101C]',
    surfaceBg: 'bg-[#0E1929]',
    elevatedBg: 'bg-[#132238]',
    borderColor: 'border-[#C8AA6E]/20',
    textPrimary: 'text-[#F0E6D2]',
    textSecondary: 'text-slate-300',
    textMuted: 'text-slate-400',
    accentBg: 'bg-[#C8AA6E] text-[#091428] hover:bg-[#D8BC82]',
    accentText: 'text-[#C8AA6E]',
    accentSoftBg: 'bg-[#C8AA6E]/12',
    accentBorder: 'border-[#C8AA6E]/40',
    accentHex: '#C8AA6E',
    secondaryHex: '#0AC8B9',
    positiveText: 'text-[#0AC8B9]',
    negativeText: 'text-rose-400',
    barTrack: 'bg-[#C8AA6E]/12',
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial Clair',
    inspiration: 'OP.GG Clean × Stripe',
    summary: 'Surface lumineuse haute précision, filets gris doux et bleu cobalt à fort contraste.',
    isLight: true,
    frameBg: 'bg-[#F5F7FA]',
    surfaceBg: 'bg-white',
    elevatedBg: 'bg-[#F8FAFC]',
    borderColor: 'border-slate-200',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-700',
    textMuted: 'text-slate-500',
    accentBg: 'bg-blue-600 text-white hover:bg-blue-700',
    accentText: 'text-blue-600',
    accentSoftBg: 'bg-blue-600/10',
    accentBorder: 'border-blue-600/30',
    accentHex: '#2563EB',
    secondaryHex: '#0D9488',
    positiveText: 'text-emerald-600',
    negativeText: 'text-rose-600',
    barTrack: 'bg-slate-200/80',
  },
};

const DESIGN_LIBRARIES = [
  {
    name: 'Mobbin',
    focus: 'Bibliothèque d’écrans réels',
    why: 'La référence pour voir comment Spotify, Linear ou Notion structurent chaque flux réel écran par écran.',
  },
  {
    name: 'PageFlows',
    focus: 'Parcours vidéo annotés',
    why: 'Montre les transitions et micro-interactions réelles entre deux écrans plutôt que de simples images statiques.',
  },
  {
    name: 'Refero & Built for Mars',
    focus: 'Patterns & audits UX',
    why: 'Permet de chercher un composant précis (tableau, barre latérale, onboarding) et de comprendre pourquoi il convertit.',
  },
];

const QUICK_CHAMP_IDS = ['TahmKench', 'Jinx', 'Ahri', 'LeeSin', 'Thresh', 'Aatrox'];

function pickMockItemsForRole(items: ItemData[], champ: ChampionSummary, role: Role): ItemData[] {
  const purchasable = items.filter((it) => it.gold.purchasable && it.gold.total >= 900);
  const boots = purchasable.filter((it) => it.tags.includes('Boots'));
  const completed = purchasable.filter((it) => !it.tags.includes('Boots') && it.gold.total >= 2200);

  const isAp =
    champ.tags.includes('Mage') ||
    (champ.info.magic >= 6 && champ.info.attack <= 5);
  const isTank = champ.tags.includes('Tank') || role === 'SUPPORT';
  const isAdc = role === 'ADC' || champ.tags.includes('Marksman');

  const preferredBoot =
    boots.find((b) =>
      isAp
        ? b.id === '3020'
        : isAdc
          ? b.id === '3006'
          : isTank
            ? b.id === '3047'
            : b.id === '3111',
    ) || boots[0];

  const scored = completed
    .map((it) => {
      let score = 0;
      if (isAdc) {
        if (it.tags.includes('CriticalStrike')) score += 4;
        if (it.tags.includes('AttackSpeed')) score += 3;
        if (it.tags.includes('Damage')) score += 2;
      } else if (isAp) {
        if (it.tags.includes('SpellDamage')) score += 4;
        if (it.tags.includes('Mana') || it.tags.includes('MagicPenetration')) score += 2;
      } else if (isTank) {
        if (it.tags.includes('Health')) score += 3;
        if (it.tags.includes('Armor') || it.tags.includes('SpellBlock')) score += 3;
      } else {
        if (it.tags.includes('Damage')) score += 3;
        if (it.tags.includes('Health') || it.tags.includes('AbilityHaste')) score += 2;
      }
      return { it, score };
    })
    .sort((a, b) => b.score - a.score || b.it.gold.total - a.it.gold.total)
    .slice(0, 5)
    .map((x) => x.it);

  return [preferredBoot, ...scored].filter((x): x is ItemData => Boolean(x)).slice(0, 6);
}

function pickMockRunesForChamp(runeTrees: RuneTree[], champ: ChampionSummary, role: Role) {
  const isAp = champ.tags.includes('Mage') || champ.info.magic >= 7;
  const isTank = champ.tags.includes('Tank') || role === 'SUPPORT';
  const isAssassin = champ.tags.includes('Assassin');

  const primaryKey = isTank ? 'Resolve' : isAp ? 'Sorcery' : isAssassin ? 'Domination' : 'Precision';
  const secondaryKey = isTank ? 'Inspiration' : isAp ? 'Inspiration' : 'Resolve';

  const primary =
    runeTrees.find((t) => t.key === primaryKey) || runeTrees[0];
  const secondary =
    runeTrees.find((t) => t.key === secondaryKey && t.id !== primary?.id) ||
    runeTrees.find((t) => t.id !== primary?.id) ||
    runeTrees[1];

  return {
    primary,
    secondary,
    keystone: primary?.slots[0]?.runes[0] || null,
    primaryMinors: [1, 2, 3].map((idx) => primary?.slots[idx]?.runes[0] || null).filter(Boolean),
    secondaryMinors: [1, 2].map((idx) => secondary?.slots[idx]?.runes[0] || null).filter(Boolean),
  };
}

function GpiRadarSvg({
  metrics,
  accentHex,
  secondaryHex,
  isLight,
  activeAxis,
  onHoverAxis,
}: {
  metrics: Array<{ key: string; label: string; player: number; target: number; detail: string }>;
  accentHex: string;
  secondaryHex: string;
  isLight: boolean;
  activeAxis: string | null;
  onHoverAxis: (key: string | null) => void;
}) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 88;
  const count = metrics.length;

  const angleFor = (idx: number) => -Math.PI / 2 + (idx * 2 * Math.PI) / count;
  const pointAt = (idx: number, ratio: number) => {
    const a = angleFor(idx);
    return {
      x: cx + Math.cos(a) * radius * ratio,
      y: cy + Math.sin(a) * radius * ratio,
    };
  };

  const polygonPath = (values: number[]) =>
    values
      .map((val, idx) => {
        const pt = pointAt(idx, Math.max(0.12, Math.min(1, val / 100)));
        return `${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ') + ' Z';

  const gridStroke = isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.10)';
  const labelFill = isLight ? '#334155' : '#CBD5E1';

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[280px] h-auto mx-auto select-none"
      role="img"
      aria-label="Graphique radar de forme du joueur sur 5 piliers"
    >
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <path
          key={ring}
          d={polygonPath(metrics.map(() => ring * 100))}
          fill="none"
          stroke={gridStroke}
          strokeWidth={1}
        />
      ))}

      {metrics.map((m, idx) => {
        const edge = pointAt(idx, 1);
        const labelPt = pointAt(idx, 1.24);
        const isHovered = activeAxis === m.key;
        return (
          <g
            key={m.key}
            className="cursor-pointer"
            onMouseEnter={() => onHoverAxis(m.key)}
            onMouseLeave={() => onHoverAxis(null)}
          >
            <line
              x1={cx}
              y1={cy}
              x2={edge.x}
              y2={edge.y}
              stroke={gridStroke}
              strokeWidth={1}
            />
            <text
              x={labelPt.x}
              y={labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isHovered ? accentHex : labelFill}
              fontSize={11}
              fontWeight={isHovered ? 700 : 600}
            >
              {m.label}
            </text>
          </g>
        );
      })}

      {/* Cible palier supérieur */}
      <path
        d={polygonPath(metrics.map((m) => m.target))}
        fill={secondaryHex}
        fillOpacity={0.1}
        stroke={secondaryHex}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />

      {/* Profil actuel */}
      <path
        d={polygonPath(metrics.map((m) => m.player))}
        fill={accentHex}
        fillOpacity={0.22}
        stroke={accentHex}
        strokeWidth={2.2}
      />

      {metrics.map((m, idx) => {
        const pt = pointAt(idx, m.player / 100);
        const isHovered = activeAxis === m.key;
        return (
          <circle
            key={`dot-${m.key}`}
            cx={pt.x}
            cy={pt.y}
            r={isHovered ? 5.5 : 3.8}
            fill={accentHex}
            stroke={isLight ? '#FFFFFF' : '#090B10'}
            strokeWidth={1.5}
            className="cursor-pointer transition-all"
            onMouseEnter={() => onHoverAxis(m.key)}
            onMouseLeave={() => onHoverAxis(null)}
          />
        );
      })}
    </svg>
  );
}

export function DesignMockupView({
  ddragon,
  profile,
  riotId,
  defaultRole,
  onApplyToLiveApp,
}: DesignMockupViewProps) {
  const [activeScreen, setActiveScreen] = useState<MockScreenId>('dashboard');
  const [activeTheme, setActiveTheme] = useState<MockThemeId>(() => {
    try {
      const saved = localStorage.getItem('lol_ai_coach_preferred_mockup_theme');
      if (saved === 'obsidian' || saved === 'hextech' || saved === 'editorial') return saved;
    } catch {
      // ignore
    }
    return 'obsidian';
  });
  const [preferredDirectionSaved, setPreferredDirectionSaved] = useState<MockThemeId | null>(() => {
    try {
      const saved = localStorage.getItem('lol_ai_coach_preferred_mockup_theme');
      if (saved === 'obsidian' || saved === 'hextech' || saved === 'editorial') return saved;
    } catch {
      // ignore
    }
    return null;
  });

  const [hoveredAxis, setHoveredAxis] = useState<string | null>(null);
  const [mockChampId, setMockChampId] = useState<string>(() => {
    const topChamp = profile?.tendencies?.championStats?.[0]?.championName;
    const match = topChamp
      ? ddragon.champions.find(
          (c) =>
            c.id.toLowerCase() === topChamp.toLowerCase() ||
            c.name.toLowerCase() === topChamp.toLowerCase(),
        )
      : null;
    return match?.id || 'TahmKench';
  });
  const [mockRole, setMockRole] = useState<Role>(defaultRole);
  const [mockEnemyId, setMockEnemyId] = useState<string>('Thresh');
  const [selectedItemSlotIdx, setSelectedItemSlotIdx] = useState<number>(0);
  const [runesAutoImported, setRunesAutoImported] = useState<boolean>(false);
  const [selectedMatchIdx, setSelectedMatchIdx] = useState<number>(0);

  const theme = THEME_PRESETS[activeTheme];

  const champMap = useMemo(() => {
    const map = new Map<string, ChampionSummary>();
    for (const c of ddragon.champions) {
      map.set(c.id.toLowerCase(), c);
      map.set(c.name.toLowerCase(), c);
    }
    return map;
  }, [ddragon.champions]);

  const itemMap = useMemo(() => {
    const map = new Map<string, ItemData>();
    for (const it of ddragon.items) {
      map.set(it.id, it);
    }
    return map;
  }, [ddragon.items]);

  const mockChampion =
    champMap.get(mockChampId.toLowerCase()) || ddragon.champions[0];
  const mockEnemy =
    champMap.get(mockEnemyId.toLowerCase()) ||
    ddragon.champions.find((c) => c.id !== mockChampion.id) ||
    ddragon.champions[1] ||
    mockChampion;

  const mockBuildItems = useMemo(
    () => pickMockItemsForRole(ddragon.items, mockChampion, mockRole),
    [ddragon.items, mockChampion, mockRole],
  );
  const mockRuneSetup = useMemo(
    () => pickMockRunesForChamp(ddragon.runeTrees, mockChampion, mockRole),
    [ddragon.runeTrees, mockChampion, mockRole],
  );

  const realMatches: MatchRecord[] = profile?.matches || [];
  const sampleFallbackMatches = useMemo(() => {
    const picks = ['TahmKench', 'Thresh', 'Jinx', 'Ahri', 'LeeSin'];
    const opponents = ['Leona', 'Nautilus', 'Kaisa', 'Syndra', 'Viego'];
    return picks.map((champId, idx) => {
      const ch = champMap.get(champId.toLowerCase()) || ddragon.champions[idx] || ddragon.champions[0];
      const opp = champMap.get(opponents[idx].toLowerCase()) || ddragon.champions[idx + 5] || ch;
      const items = pickMockItemsForRole(ddragon.items, ch, idx < 2 ? 'SUPPORT' : 'MID');
      return {
        id: `sample-${idx}`,
        champion: ch,
        opponent: opp,
        win: idx !== 2,
        kills: [3, 2, 4, 9, 6][idx],
        deaths: [2, 3, 6, 3, 4][idx],
        assists: [16, 14, 7, 8, 11][idx],
        csPerMin: [1.9, 1.6, 7.2, 7.6, 6.1][idx],
        visionScore: [58, 64, 21, 24, 31][idx],
        durationMin: [29, 32, 27, 25, 31][idx],
        goldEarned: [9800, 9400, 11200, 12900, 11800][idx],
        oppGold: [8900, 9100, 12400, 11100, 11300][idx],
        damageDealt: [16400, 13200, 24500, 31200, 21400][idx],
        oppDamage: [12900, 11900, 26800, 23400, 19800][idx],
        items,
      };
    });
  }, [champMap, ddragon.champions, ddragon.items]);

  const displayMatches = useMemo(() => {
    if (realMatches.length > 0) {
      return realMatches.slice(0, 5).map((m) => {
        const ch =
          champMap.get(m.player.championName.toLowerCase()) || ddragon.champions[0];
        const opp = m.laneOpponent
          ? champMap.get(m.laneOpponent.championName.toLowerCase()) || mockEnemy
          : mockEnemy;
        const items = m.player.items
          .map((id) => (id ? itemMap.get(String(id)) || null : null))
          .filter((it): it is ItemData => Boolean(it));
        return {
          id: m.matchId,
          champion: ch,
          opponent: opp,
          win: m.player.win,
          kills: m.player.kills,
          deaths: m.player.deaths,
          assists: m.player.assists,
          csPerMin: m.player.csPerMin,
          visionScore: m.player.visionScore,
          durationMin: Math.max(1, Math.round(m.gameDurationSec / 60)),
          goldEarned: m.player.goldEarned,
          oppGold: m.laneOpponent?.goldEarned || Math.round(m.player.goldEarned * 0.92),
          damageDealt: m.player.totalDamageDealtToChampions,
          oppDamage:
            m.laneOpponent?.totalDamageDealtToChampions ||
            Math.round(m.player.totalDamageDealtToChampions * 0.88),
          items: items.length > 0 ? items : pickMockItemsForRole(ddragon.items, ch, defaultRole),
        };
      });
    }
    return sampleFallbackMatches;
  }, [realMatches, champMap, ddragon.champions, ddragon.items, itemMap, mockEnemy, defaultRole, sampleFallbackMatches]);

  const inspectedMatch = displayMatches[selectedMatchIdx] || displayMatches[0];

  const tendencies = profile?.tendencies;
  const winRatePct = tendencies ? Math.round(tendencies.winRate) : 56;
  const avgDeathsLabel = tendencies ? tendencies.avgDeaths.toFixed(1) : '3.8';
  const avgCsNum = tendencies ? tendencies.avgCsPerMin : 6.4;
  const avgCsLabel = avgCsNum.toFixed(1);
  const avgVisionNum = tendencies ? tendencies.avgVisionPerMin : 1.48;
  const avgVisionLabel = avgVisionNum.toFixed(2);
  const isSupportRole = mockRole === 'SUPPORT';

  const gpiMetrics = useMemo(
    () => [
      {
        key: 'combat',
        label: 'Combat',
        player: Math.min(96, Math.max(48, winRatePct + 18)),
        target: 78,
        detail: 'Participation aux escarmouches et conversion des pics d’objets',
      },
      {
        key: 'survive',
        label: 'Survie',
        player: tendencies
          ? Math.max(40, Math.min(95, Math.round(92 - tendencies.avgDeaths * 7)))
          : 72,
        target: 76,
        detail: 'Morts évitables hors vision avant les objectifs majeurs',
      },
      {
        key: 'farm',
        label: 'Farm',
        player: tendencies
          ? Math.max(45, Math.min(95, Math.round(tendencies.avgCsPerMin * 10)))
          : 68,
        target: 74,
        detail: 'Régularité des vagues captées entre 10 et 20 minutes',
      },
      {
        key: 'vision',
        label: 'Vision',
        player: tendencies
          ? Math.max(45, Math.min(96, Math.round(tendencies.avgVisionPerMin * 44)))
          : 79,
        target: 75,
        detail: 'Balises de contrôle posées 45s avant Dragon et Baron',
      },
      {
        key: 'macro',
        label: 'Objectifs',
        player: tendencies
          ? Math.max(42, Math.min(95, Math.round(85 - tendencies.preObjectiveDeathRate * 55)))
          : 74,
        target: 80,
        detail: 'Présence coordonnée sur larves du Néant, héraut et dragons',
      },
    ],
    [tendencies, winRatePct],
  );

  const soloRank = formatRankedQueue(profile?.rankedSolo);
  const flexRank = formatRankedQueue(profile?.rankedFlex);
  const primaryRank = soloRank.isRanked ? soloRank : flexRank;

  const selectedBuildItem =
    mockBuildItems[selectedItemSlotIdx] || mockBuildItems[0] || null;

  const handleLockPreferredTheme = (themeId: MockThemeId) => {
    setPreferredDirectionSaved(themeId);
    try {
      localStorage.setItem('lol_ai_coach_preferred_mockup_theme', themeId);
    } catch {
      // ignore
    }
  };

  const heroLoadingBg = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${mockChampion.id}_0.jpg`;

  return (
    <div className="space-y-6">
      {/* Barre de contrôle du laboratoire de maquette */}
      <section className="rounded-2xl apple-surface p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#007AFF] dark:text-[#0A84FF] shrink-0" aria-hidden="true" />
              <span>Maquette Design · Nouveau Poste de Commande LoL AI Coach</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Prototype interactif inspiré de Mobbin, Mobalytics, Blitz.gg &amp; OP.GG — testez chaque écran et palette sur vos vraies données avant de l’appliquer à toute l’app.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleLockPreferredTheme(activeTheme)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 ${
                preferredDirectionSaved === activeTheme
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#007AFF] dark:bg-[#0A84FF] text-white hover:opacity-90'
              }`}
            >
              {preferredDirectionSaved === activeTheme ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Direction « {theme.name} » retenue</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Retenir « {theme.name} »</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sélecteur d'écrans + sélecteur de direction artistique */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="xl:col-span-6 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Écran simulé (cliquez pour naviguer dans la maquette)
            </div>
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
              {(
                [
                  { id: 'dashboard', label: '1. QG & Forme (Mobalytics)' },
                  { id: 'builds', label: '2. Préparation Build (Blitz × U.GG)' },
                  { id: 'postgame', label: '3. Débrief Match (OP.GG Pro)' },
                ] as const
              ).map((scr) => (
                <button
                  key={scr.id}
                  type="button"
                  onClick={() => setActiveScreen(scr.id)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    activeScreen === scr.id
                      ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                  }`}
                >
                  {scr.label}
                </button>
              ))}
            </div>
          </div>

          <div className="xl:col-span-6 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Direction artistique (inspirée des leaders esports)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(THEME_PRESETS) as MockThemeId[]).map((tId) => {
                const preset = THEME_PRESETS[tId];
                const active = activeTheme === tId;
                return (
                  <button
                    key={tId}
                    type="button"
                    onClick={() => setActiveTheme(tId)}
                    className={`text-left px-3 py-2 rounded-xl border transition-colors ${
                      active
                        ? 'border-[#007AFF] dark:border-[#0A84FF] bg-[#007AFF]/8 dark:bg-[#0A84FF]/12'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {preset.name}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: preset.accentHex }}
                        aria-hidden="true"
                      />
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {preset.inspiration}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Fenêtre de la maquette interactive isolée */}
      <section
        aria-label="Aperçu interactif de la nouvelle interface"
        className={`rounded-2xl border overflow-hidden transition-colors ${theme.frameBg} ${theme.borderColor}`}
      >
        {/* Top Bar Contract (3 zones nettes : Wordmark — 3 liens — 1 CTA) */}
        <header
          className={`px-5 sm:px-7 h-15 border-b ${theme.borderColor} ${theme.surfaceBg} flex items-center justify-between gap-6`}
        >
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <span className={`font-display text-base font-bold tracking-tight whitespace-nowrap ${theme.textPrimary}`}>
              LoL AI Coach
            </span>
            <span className={`text-xs font-mono tabular-nums hidden sm:inline ${theme.textMuted}`}>
              Patch {ddragon.version}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-5 text-xs font-medium" aria-label="Navigation maquette">
            {(
              [
                { id: 'dashboard', label: 'Aujourd’hui', icon: LayoutDashboard },
                { id: 'builds', label: 'Préparation', icon: Swords },
                { id: 'postgame', label: 'Débrief', icon: History },
              ] as const
            ).map((nav) => {
              const NavIcon = nav.icon;
              const active = activeScreen === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => setActiveScreen(nav.id)}
                  className={`inline-flex items-center gap-1.5 py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    active
                      ? `${theme.textPrimary} font-semibold`
                      : `${theme.textMuted} border-transparent hover:${theme.textPrimary}`
                  }`}
                  style={active ? { borderColor: theme.accentHex } : undefined}
                >
                  <NavIcon
                    className="w-3.5 h-3.5 shrink-0"
                    style={active ? { color: theme.accentHex } : undefined}
                    aria-hidden="true"
                  />
                  <span>{nav.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <span className={`hidden sm:inline text-xs font-medium whitespace-nowrap ${theme.textSecondary}`}>
              {riotId}
            </span>
            <button
              type="button"
              onClick={() =>
                setActiveScreen((prev) =>
                  prev === 'dashboard' ? 'builds' : prev === 'builds' ? 'postgame' : 'dashboard',
                )
              }
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${theme.accentBg}`}
            >
              Écran suivant →
            </button>
          </div>
        </header>

        {/* Contenu de la maquette selon l'écran sélectionné */}
        <div className="p-5 sm:p-7 space-y-6">
          {activeScreen === 'dashboard' && (
            <>
              {/* Hero Identité + Conseil prioritaire (style Mobalytics épuré) */}
              <div className={`relative rounded-xl border overflow-hidden ${theme.borderColor} ${theme.surfaceBg}`}>
                <div className="relative grid grid-cols-1 lg:grid-cols-12 items-stretch">
                  <div className="lg:col-span-8 p-6 space-y-4">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <RankedTierCrest tier={primaryRank.tierKey} sizeClass="w-7 h-7" />
                      <span className={`font-semibold ${theme.textPrimary}`}>
                        {primaryRank.isRanked ? primaryRank.compactLabel : 'Étalonnage Solo/Duo'}
                      </span>
                      <span className={theme.textMuted} aria-hidden="true">·</span>
                      <span className={theme.textMuted}>Rôle principal : {mockRole}</span>
                      <span className={theme.textMuted} aria-hidden="true">·</span>
                      <span className={theme.textMuted}>
                        {realMatches.length > 0
                          ? `${realMatches.length} matchs synchronisés`
                          : 'Données Data Dragon en aperçu'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${theme.textPrimary}`}>
                        Priorité de session : sécuriser la vision 45s avant les objectifs
                      </h2>
                      <p className={`text-xs sm:text-sm leading-relaxed max-w-2xl ${theme.textSecondary}`}>
                        Sur vos dernières parties avec {mockChampion.name}, votre présence en combat est solide mais les sorties en rivière sans balise freinent vos transitions vers le Dragon.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveScreen('builds')}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${theme.accentBg}`}
                      >
                        <Swords className="w-3.5 h-3.5" aria-hidden="true" />
                        Préparer {mockChampion.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveScreen('postgame')}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${theme.borderColor} ${theme.textPrimary}`}
                      >
                        Voir le dernier débrief
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-4 relative min-h-[170px] overflow-hidden">
                    <img
                      src={heroLoadingBg}
                      alt={mockChampion.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top"
                    />
                    <div
                      aria-hidden="true"
                      className={`absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent lg:bg-gradient-to-r ${
                        theme.isLight
                          ? 'lg:from-white/90 lg:via-black/20'
                          : activeTheme === 'hextech'
                            ? 'lg:from-[#0E1929]/95 lg:via-black/25'
                            : 'lg:from-[#10141E]/95 lg:via-black/25'
                      } lg:to-transparent`}
                    />
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2 text-white">
                      <div>
                        <div className="text-[11px] text-white/75">Champion suivi</div>
                        <div className="text-sm font-bold">{mockChampion.name}</div>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-white/90">
                        {winRatePct}% WR
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bandeau 4 KPI tabulaires pleine largeur */}
              <div className={`grid grid-cols-2 lg:grid-cols-4 rounded-xl border divide-y lg:divide-y-0 lg:divide-x ${theme.borderColor} ${theme.surfaceBg}`}>
                {[
                  {
                    label: 'Taux de victoire',
                    value: `${winRatePct}%`,
                    sub: tendencies?.trend
                      ? `${tendencies.trend.winRateDelta >= 0 ? '+' : ''}${tendencies.trend.winRateDelta}% sur ${tendencies.trend.recentGames} récents`
                      : `Sur ${tendencies?.gamesAnalyzed || 20} parties analysées`,
                    positive: winRatePct >= 50,
                  },
                  {
                    label: 'Morts moyennes',
                    value: avgDeathsLabel,
                    sub: isSupportRole ? 'Objectif palier : ≤ 4.5' : 'Objectif palier : ≤ 4.0',
                    positive: Number(avgDeathsLabel) <= (isSupportRole ? 4.5 : 4.0),
                  },
                  {
                    label: 'Farm moyen',
                    value: `${avgCsLabel}/min`,
                    sub: isSupportRole ? 'Quête Support · rythme normal' : 'Cible laner : 7.0+ CS/min',
                    positive: isSupportRole ? avgCsNum >= 1.2 : avgCsNum >= 6.0,
                  },
                  {
                    label: 'Vision / min',
                    value: avgVisionLabel,
                    sub: 'Contrôle rivière & objectifs',
                    positive: avgVisionNum >= (isSupportRole ? 1.2 : 0.75),
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className={`p-4 space-y-1 ${theme.borderColor}`}>
                    <div className={`text-xs font-medium ${theme.textMuted}`}>{kpi.label}</div>
                    <div className={`text-2xl font-bold font-mono tabular-nums ${theme.textPrimary}`}>
                      {kpi.value}
                    </div>
                    <div className={`text-[11px] ${kpi.positive ? theme.positiveText : theme.negativeText}`}>
                      {kpi.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Grille 12 colonnes : Radar GPI (gauche) + Historique dense (droite) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <div className={`lg:col-span-5 rounded-xl border p-5 flex flex-col justify-between gap-4 ${theme.borderColor} ${theme.surfaceBg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className={`text-sm font-bold ${theme.textPrimary}`}>
                        Profil de Performance (5 piliers)
                      </h3>
                      <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
                        Survolez un axe pour comparer votre profil à l’objectif rang supérieur.
                      </p>
                    </div>
                    <span className={`text-[11px] font-mono tabular-nums ${theme.accentText}`}>
                      Cible · Platine+
                    </span>
                  </div>

                  <GpiRadarSvg
                    metrics={gpiMetrics}
                    accentHex={theme.accentHex}
                    secondaryHex={theme.secondaryHex}
                    isLight={theme.isLight}
                    activeAxis={hoveredAxis}
                    onHoverAxis={setHoveredAxis}
                  />

                  <div className={`pt-3 border-t ${theme.borderColor} text-xs`}>
                    {(() => {
                      const focused =
                        gpiMetrics.find((m) => m.key === hoveredAxis) || gpiMetrics[0];
                      return (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className={`font-semibold ${theme.textPrimary}`}>
                              {focused.label} :
                            </span>{' '}
                            <span className={theme.textMuted}>{focused.detail}</span>
                          </div>
                          <span className={`font-mono tabular-nums font-bold shrink-0 ${theme.accentText}`}>
                            {focused.player}/100
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className={`lg:col-span-7 rounded-xl border overflow-hidden ${theme.borderColor} ${theme.surfaceBg}`}>
                  <div className={`px-5 py-4 border-b ${theme.borderColor} flex items-center justify-between gap-2`}>
                    <div>
                      <h3 className={`text-sm font-bold ${theme.textPrimary}`}>
                        Historique tactique récent
                      </h3>
                      <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
                        Cliquez sur une ligne pour ouvrir son débrief détaillé.
                      </p>
                    </div>
                    <span className={`text-xs font-mono tabular-nums ${theme.textMuted}`}>
                      {displayMatches.length} parties
                    </span>
                  </div>

                  <div className={`divide-y ${theme.borderColor}`}>
                    {displayMatches.map((m, idx) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMatchIdx(idx);
                          setActiveScreen('postgame');
                        }}
                        className={`w-full px-5 py-3 flex items-center justify-between gap-3 text-left transition-colors ${
                          theme.isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <SafeGameIcon
                            src={m.champion.imageUrl}
                            alt={m.champion.name}
                            fallbackLabel={m.champion.name}
                            sizeClass="w-9 h-9 rounded-lg"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs">
                              <span className={`font-bold ${m.win ? theme.positiveText : theme.negativeText}`}>
                                {m.win ? 'Victoire' : 'Défaite'}
                              </span>
                              <span className={theme.textMuted} aria-hidden="true">·</span>
                              <span className={`font-semibold truncate ${theme.textPrimary}`}>
                                {formatChampionDisplayName(ddragon.champions, m.champion.name)}
                              </span>
                              <span className={`hidden sm:inline ${theme.textMuted}`}>
                                vs {m.opponent.name}
                              </span>
                            </div>
                            <div className={`text-[11px] font-mono tabular-nums mt-0.5 ${theme.textMuted}`}>
                              {m.kills}/{m.deaths}/{m.assists} · {m.csPerMin.toFixed(1)} CS/m · {m.visionScore} vis. · {m.durationMin}m
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="hidden sm:flex items-center gap-1">
                            {m.items.slice(0, 5).map((it, itemIdx) => (
                              <SafeGameIcon
                                key={`${m.id}-${it.id}-${itemIdx}`}
                                src={it.imageUrl}
                                alt={it.name}
                                fallbackLabel={it.name}
                                sizeClass="w-6 h-6 rounded"
                              />
                            ))}
                          </div>
                          <ArrowRight className={`w-4 h-4 ${theme.textMuted}`} aria-hidden="true" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeScreen === 'builds' && (
            <>
              {/* Barre contexte Champion + Rôle + Adversaire (style Blitz.gg) */}
              <div className={`rounded-xl border p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${theme.borderColor} ${theme.surfaceBg}`}>
                <div className="flex items-center gap-3.5 min-w-0">
                  <SafeGameIcon
                    src={mockChampion.imageUrl}
                    alt={mockChampion.name}
                    fallbackLabel={mockChampion.name}
                    sizeClass="w-12 h-12 rounded-xl"
                  />
                  <div className="min-w-0">
                    <div className={`text-xs ${theme.textMuted}`}>
                      Plan de partie · {mockRole} · vs {mockEnemy.name}
                    </div>
                    <h2 className={`text-lg font-bold truncate ${theme.textPrimary}`}>
                      {mockChampion.name} — {mockChampion.title}
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    {QUICK_CHAMP_IDS.map((cId) => {
                      const ch = champMap.get(cId.toLowerCase());
                      if (!ch) return null;
                      const selected = ch.id === mockChampion.id;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => {
                            setMockChampId(ch.id);
                            setSelectedItemSlotIdx(0);
                          }}
                          title={`Tester ${ch.name}`}
                          className={`p-0.5 rounded-lg border transition-colors ${
                            selected ? theme.accentBorder : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                        >
                          <SafeGameIcon
                            src={ch.imageUrl}
                            alt={ch.name}
                            fallbackLabel={ch.name}
                            sizeClass="w-7 h-7 rounded-md"
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className={`flex items-center gap-1 p-1 rounded-lg border ${theme.borderColor} ${theme.elevatedBg}`}>
                    {(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as Role[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setMockRole(r)}
                        className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${
                          mockRole === r ? theme.accentBg : theme.textMuted
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Colonne principale : Équipement 6 emplacements + Courbe de pics */}
                <div className="lg:col-span-7 space-y-5">
                  <div className={`rounded-xl border p-5 space-y-4 ${theme.borderColor} ${theme.surfaceBg}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className={`text-sm font-bold ${theme.textPrimary}`}>
                          Chemin d’équipement recommandé (6 emplacements)
                        </h3>
                        <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
                          Cliquez sur un objet pour inspecter son coût et son rôle dans le build.
                        </p>
                      </div>
                      <span className={`text-xs font-mono tabular-nums font-semibold ${theme.accentText}`}>
                        {mockBuildItems.reduce((acc, it) => acc + it.gold.total, 0)} po
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                      {mockBuildItems.map((it, idx) => {
                        const isSel = selectedItemSlotIdx === idx;
                        return (
                          <button
                            key={`${it.id}-${idx}`}
                            type="button"
                            onClick={() => setSelectedItemSlotIdx(idx)}
                            className={`p-2.5 rounded-xl border text-left transition-colors space-y-2 ${
                              isSel
                                ? `${theme.accentBorder} ${theme.accentSoftBg}`
                                : `${theme.borderColor} ${theme.elevatedBg}`
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <SafeGameIcon
                                src={it.imageUrl}
                                alt={it.name}
                                fallbackLabel={it.name}
                                sizeClass="w-9 h-9 rounded-lg"
                              />
                              <span className={`text-[10px] font-mono tabular-nums ${theme.textMuted}`}>
                                #{idx + 1}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className={`text-[11px] font-semibold truncate ${theme.textPrimary}`}>
                                {it.name}
                              </div>
                              <div className={`text-[10px] font-mono tabular-nums ${theme.textMuted}`}>
                                {it.gold.total} po
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedBuildItem && (
                      <div className={`pt-3 border-t ${theme.borderColor} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs`}>
                        <div className="min-w-0">
                          <span className={`font-bold ${theme.textPrimary}`}>{selectedBuildItem.name}</span>
                          <span className={theme.textMuted}> — {selectedBuildItem.plaintext || 'Objet clé de pic de puissance'}</span>
                        </div>
                        <span className={`font-mono tabular-nums shrink-0 ${theme.accentText}`}>
                          Revente : {selectedBuildItem.gold.sell} po
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pics de puissance temporels */}
                  <div className={`rounded-xl border p-5 space-y-3 ${theme.borderColor} ${theme.surfaceBg}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-sm font-bold ${theme.textPrimary}`}>
                        Fenêtres d’impact par phase de jeu
                      </h3>
                      <span className={`text-xs ${theme.textMuted}`}>vs {mockEnemy.name}</span>
                    </div>

                    <div className="space-y-3">
                      {[
                        { phase: 'Early (0–14 min)', pct: 64, note: 'Priorité bottes + contrôle de vague avant le premier Dragon.' },
                        { phase: 'Mid (14–26 min)', pct: 88, note: 'Pic maximal à 2 objets complets : cherchez les escarmouches.' },
                        { phase: 'Late (26+ min)', pct: 76, note: 'Protégez votre carry principal et sécurisez la vision Baron.' },
                      ].map((row) => (
                        <div key={row.phase} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold ${theme.textPrimary}`}>{row.phase}</span>
                            <span className={`font-mono tabular-nums font-semibold ${theme.accentText}`}>
                              {row.pct}/100
                            </span>
                          </div>
                          <div className={`h-2 rounded-full overflow-hidden ${theme.barTrack}`}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${row.pct}%`, backgroundColor: theme.accentHex }}
                            />
                          </div>
                          <p className={`text-[11px] ${theme.textMuted}`}>{row.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Colonne droite : Runes compactes style Blitz Auto-Sync */}
                <div className={`lg:col-span-5 rounded-xl border p-5 space-y-4 ${theme.borderColor} ${theme.surfaceBg}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className={`text-sm font-bold ${theme.textPrimary}`}>
                        Page de Runes Automatique
                      </h3>
                      <p className={`text-xs mt-0.5 ${theme.textMuted}`}>
                        {mockRuneSetup.primary?.name} + {mockRuneSetup.secondary?.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRunesAutoImported((v) => !v)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        runesAutoImported ? 'bg-emerald-600 text-white' : theme.accentBg
                      }`}
                    >
                      {runesAutoImported ? 'Importées ✓' : 'Importer en 1 clic'}
                    </button>
                  </div>

                  {mockRuneSetup.keystone && (
                    <div className={`p-3 rounded-xl border flex items-center gap-3 ${theme.borderColor} ${theme.elevatedBg}`}>
                      <SafeGameIcon
                        src={mockRuneSetup.keystone.imageUrl}
                        alt={mockRuneSetup.keystone.name}
                        fallbackLabel={mockRuneSetup.keystone.name}
                        sizeClass="w-10 h-10 rounded-full"
                      />
                      <div className="min-w-0">
                        <div className={`text-[11px] ${theme.accentText}`}>Rune fondamentale</div>
                        <div className={`text-sm font-bold truncate ${theme.textPrimary}`}>
                          {mockRuneSetup.keystone.name}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-2">
                      <div className={`text-[11px] font-semibold ${theme.textMuted}`}>
                        Arbre principal
                      </div>
                      {mockRuneSetup.primaryMinors.map((rune) => (
                        <div key={rune.id} className="flex items-center gap-2 text-xs">
                          <SafeGameIcon
                            src={rune.imageUrl}
                            alt={rune.name}
                            fallbackLabel={rune.name}
                            sizeClass="w-6 h-6 rounded-full"
                          />
                          <span className={`truncate ${theme.textPrimary}`}>{rune.name}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div className={`text-[11px] font-semibold ${theme.textMuted}`}>
                        Arbre secondaire
                      </div>
                      {mockRuneSetup.secondaryMinors.map((rune) => (
                        <div key={rune.id} className="flex items-center gap-2 text-xs">
                          <SafeGameIcon
                            src={rune.imageUrl}
                            alt={rune.name}
                            fallbackLabel={rune.name}
                            sizeClass="w-6 h-6 rounded-full"
                          />
                          <span className={`truncate ${theme.textPrimary}`}>{rune.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`pt-3 border-t ${theme.borderColor} flex items-center justify-between text-xs`}>
                    <span className={theme.textMuted}>Adversaire direct simulé</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMockEnemyId((prev) =>
                          prev === 'Thresh' ? 'Leona' : prev === 'Leona' ? 'Jinx' : 'Thresh',
                        )
                      }
                      className={`font-semibold underline underline-offset-4 ${theme.accentText}`}
                    >
                      vs {mockEnemy.name} (changer)
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeScreen === 'postgame' && inspectedMatch && (
            <>
              {/* En-tête Post-Match (résultat net + vis-à-vis) */}
              <div className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${theme.borderColor} ${theme.surfaceBg}`}>
                <div className="flex items-center gap-3.5 min-w-0">
                  <SafeGameIcon
                    src={inspectedMatch.champion.imageUrl}
                    alt={inspectedMatch.champion.name}
                    fallbackLabel={inspectedMatch.champion.name}
                    sizeClass="w-12 h-12 rounded-xl"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`font-bold ${inspectedMatch.win ? theme.positiveText : theme.negativeText}`}>
                        {inspectedMatch.win ? 'Victoire' : 'Défaite'}
                      </span>
                      <span className={theme.textMuted} aria-hidden="true">·</span>
                      <span className={`font-mono tabular-nums ${theme.textMuted}`}>
                        {inspectedMatch.durationMin} min
                      </span>
                      <span className={theme.textMuted} aria-hidden="true">·</span>
                      <span className={theme.textMuted}>
                        vs {inspectedMatch.opponent.name}
                      </span>
                    </div>
                    <h2 className={`text-lg font-bold truncate ${theme.textPrimary}`}>
                      Débrief : {formatChampionDisplayName(ddragon.champions, inspectedMatch.champion.name)} ·{' '}
                      <span className="font-mono tabular-nums">
                        {inspectedMatch.kills}/{inspectedMatch.deaths}/{inspectedMatch.assists}
                      </span>
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {inspectedMatch.items.slice(0, 6).map((it, idx) => (
                    <SafeGameIcon
                      key={`pg-${it.id}-${idx}`}
                      src={it.imageUrl}
                      alt={it.name}
                      fallbackLabel={it.name}
                      sizeClass="w-8 h-8 rounded-lg"
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Barres de comparaison Vis-à-vis */}
                <div className={`lg:col-span-7 rounded-xl border p-5 space-y-4 ${theme.borderColor} ${theme.surfaceBg}`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-sm font-bold ${theme.textPrimary}`}>
                      Duel statistique face à {inspectedMatch.opponent.name}
                    </h3>
                    <span className={`text-xs ${theme.textMuted}`}>Vous vs Vis-à-vis</span>
                  </div>

                  <div className="space-y-4">
                    {[
                      {
                        label: 'Or accumulé',
                        you: inspectedMatch.goldEarned,
                        opp: inspectedMatch.oppGold,
                        unit: ' po',
                      },
                      {
                        label: 'Dégâts aux champions',
                        you: inspectedMatch.damageDealt,
                        opp: inspectedMatch.oppDamage,
                        unit: '',
                      },
                      {
                        label: 'Score de vision',
                        you: inspectedMatch.visionScore,
                        opp: Math.max(12, Math.round(inspectedMatch.visionScore * 0.82)),
                        unit: ' pts',
                      },
                      {
                        label: 'Farm par minute',
                        you: Number(inspectedMatch.csPerMin.toFixed(1)),
                        opp: Number(Math.max(1.4, inspectedMatch.csPerMin - 0.5).toFixed(1)),
                        unit: '/m',
                      },
                    ].map((bar) => {
                      const total = Math.max(1, bar.you + bar.opp);
                      const youPct = Math.round((bar.you / total) * 100);
                      const ahead = bar.you >= bar.opp;
                      return (
                        <div key={bar.label} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold ${theme.textPrimary}`}>{bar.label}</span>
                            <div className="font-mono tabular-nums flex items-center gap-2">
                              <span className={ahead ? theme.positiveText : theme.textPrimary}>
                                {bar.you}
                                {bar.unit}
                              </span>
                              <span className={theme.textMuted}>vs</span>
                              <span className={theme.textMuted}>
                                {bar.opp}
                                {bar.unit}
                              </span>
                            </div>
                          </div>
                          <div className={`h-2 rounded-full overflow-hidden flex ${theme.barTrack}`}>
                            <div
                              className="h-full transition-all"
                              style={{
                                width: `${youPct}%`,
                                backgroundColor: ahead ? theme.accentHex : '#64748B',
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Plan d'action éditorial 01 / 02 / 03 */}
                <div className={`lg:col-span-5 rounded-xl border p-5 space-y-4 ${theme.borderColor} ${theme.surfaceBg}`}>
                  <h3 className={`text-sm font-bold ${theme.textPrimary}`}>
                    3 priorités pour la prochaine partie
                  </h3>
                  <div className={`divide-y ${theme.borderColor}`}>
                    {[
                      {
                        num: '01.',
                        title: 'Timing de rappel avant Dragon',
                        detail: 'Reculez 55 secondes avant l’apparition pour dépenser votre or et poser 2 balises.',
                      },
                      {
                        num: '02.',
                        title: 'Gestion de la vague niveau 6',
                        detail: 'Poussez la vague canon avant de décaler vers la rivière pour ne perdre aucun sbire.',
                      },
                      {
                        num: '03.',
                        title: 'Adaptation 2e objet',
                        detail: `Face à ${inspectedMatch.opponent.name}, anticipez l’objet défensif dès le 2e emplacement si l’écart se creuse.`,
                      },
                    ].map((step) => (
                      <div key={step.num} className="py-3 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-mono font-bold ${theme.accentText}`}>{step.num}</span>
                          <span className={`font-semibold ${theme.textPrimary}`}>{step.title}</span>
                        </div>
                        <p className={`text-xs leading-relaxed ${theme.textMuted}`}>{step.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Fiche explicative UX & Références de benchmark (Mobbin / PageFlows / Built for Mars) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-2xl apple-surface p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Compass className="w-4 h-4 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
            <span>Bibliothèques de design réel utilisées</span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {DESIGN_LIBRARIES.map((lib) => (
              <div key={lib.name} className="py-2.5 first:pt-0 last:pb-0 space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white">{lib.name}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{lib.focus}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{lib.why}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl apple-surface p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Target className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            <span>Ce que cette maquette corrige par rapport au design actuel</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {[
              {
                icon: Flame,
                title: '1 seul niveau d’élévation',
                desc: 'Suppression des cartes imbriquées dans d’autres cartes : séparation par filets 1px et espacements propres.',
              },
              {
                icon: Eye,
                title: 'Zéro surcharge de pilules',
                desc: 'Les métadonnées (KDA, patch, rôle) deviennent du texte fluide séparé par « · », réservant la couleur aux actions.',
              },
              {
                icon: TrendingUp,
                title: 'Chiffres tabulaires alignés',
                desc: 'Tous les scores, pièces d’or et ratios s’alignent verticalement grâce à tabular-nums pour une lecture en 2 secondes.',
              },
              {
                icon: Shield,
                title: 'Navigation par phase de jeu',
                desc: 'Chaque écran répond à un moment exact : Avant-partie (Blitz), En jeu, et Débrief (Mobalytics/OP.GG).',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                    <Icon className="w-3.5 h-3.5 text-[#007AFF] dark:text-[#0A84FF] shrink-0" aria-hidden="true" />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
          {onApplyToLiveApp && (
            <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Rien n’est modifié sur les autres onglets tant que tu n’as pas validé ta direction favorite.
              </span>
              <button
                type="button"
                onClick={onApplyToLiveApp}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] dark:text-[#0A84FF] hover:underline whitespace-nowrap shrink-0"
              >
                <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                Retour à Aujourd’hui
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
