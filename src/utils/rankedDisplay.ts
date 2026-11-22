import type { RankedQueueSummary } from '../engines/types.ts';

export const RANKED_TIER_LABELS_FR: Record<string, string> = {
  IRON: 'Fer',
  BRONZE: 'Bronze',
  SILVER: 'Argent',
  GOLD: 'Or',
  PLATINUM: 'Platine',
  EMERALD: 'Émeraude',
  DIAMOND: 'Diamant',
  MASTER: 'Maître',
  GRANDMASTER: 'Grand Maître',
  CHALLENGER: 'Challenger',
};

const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export interface RankedTierTheme {
  accentHex: string;
  secondaryHex: string;
  textClass: string;
  borderClass: string;
  softBgClass: string;
}

const DEFAULT_UNRANKED_THEME: RankedTierTheme = {
  accentHex: '#64748B',
  secondaryHex: '#475569',
  textClass: 'text-slate-600 dark:text-slate-300',
  borderClass: 'border-slate-300/70 dark:border-slate-700',
  softBgClass: 'bg-slate-100/80 dark:bg-slate-800/60',
};

const TIER_THEMES: Record<string, RankedTierTheme> = {
  IRON: {
    accentHex: '#78716C',
    secondaryHex: '#57534E',
    textClass: 'text-stone-600 dark:text-stone-300',
    borderClass: 'border-stone-400/40 dark:border-stone-600/60',
    softBgClass: 'bg-stone-500/10',
  },
  BRONZE: {
    accentHex: '#B45309',
    secondaryHex: '#78350F',
    textClass: 'text-amber-700 dark:text-amber-400',
    borderClass: 'border-amber-700/35 dark:border-amber-600/45',
    softBgClass: 'bg-amber-700/10',
  },
  SILVER: {
    accentHex: '#94A3B8',
    secondaryHex: '#64748B',
    textClass: 'text-slate-600 dark:text-slate-200',
    borderClass: 'border-slate-400/45 dark:border-slate-500/50',
    softBgClass: 'bg-slate-400/10',
  },
  GOLD: {
    accentHex: '#F59E0B',
    secondaryHex: '#D97706',
    textClass: 'text-amber-600 dark:text-amber-400',
    borderClass: 'border-amber-500/45 dark:border-amber-500/45',
    softBgClass: 'bg-amber-500/10',
  },
  PLATINUM: {
    accentHex: '#06B6D4',
    secondaryHex: '#0E7490',
    textClass: 'text-cyan-600 dark:text-cyan-300',
    borderClass: 'border-cyan-500/40 dark:border-cyan-400/40',
    softBgClass: 'bg-cyan-500/10',
  },
  EMERALD: {
    accentHex: '#10B981',
    secondaryHex: '#047857',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-emerald-500/45 dark:border-emerald-500/40',
    softBgClass: 'bg-emerald-500/10',
  },
  DIAMOND: {
    accentHex: '#38BDF8',
    secondaryHex: '#2563EB',
    textClass: 'text-sky-600 dark:text-sky-300',
    borderClass: 'border-sky-400/45 dark:border-sky-400/45',
    softBgClass: 'bg-sky-500/10',
  },
  MASTER: {
    accentHex: '#A855F7',
    secondaryHex: '#7E22CE',
    textClass: 'text-purple-600 dark:text-purple-300',
    borderClass: 'border-purple-500/45 dark:border-purple-400/45',
    softBgClass: 'bg-purple-500/10',
  },
  GRANDMASTER: {
    accentHex: '#F43F5E',
    secondaryHex: '#BE123C',
    textClass: 'text-rose-600 dark:text-rose-300',
    borderClass: 'border-rose-500/45 dark:border-rose-400/45',
    softBgClass: 'bg-rose-500/10',
  },
  CHALLENGER: {
    accentHex: '#FACC15',
    secondaryHex: '#0284C7',
    textClass: 'text-amber-500 dark:text-yellow-300',
    borderClass: 'border-yellow-400/50 dark:border-yellow-400/50',
    softBgClass: 'bg-yellow-400/10',
  },
};

export interface FormattedRankedSummary {
  isRanked: boolean;
  tierKey: string;
  tierLabelFr: string;
  divisionLabel: string;
  compactLabel: string;
  lp: number;
  wins: number;
  losses: number;
  totalGames: number;
  winRate: number;
  hotStreak: boolean;
  veteran: boolean;
  theme: RankedTierTheme;
}

export function getRankedTierTheme(tier?: string | null): RankedTierTheme {
  if (!tier) return DEFAULT_UNRANKED_THEME;
  return TIER_THEMES[tier.toUpperCase()] || DEFAULT_UNRANKED_THEME;
}

export function formatRankedQueue(queue?: RankedQueueSummary | null): FormattedRankedSummary {
  if (!queue || !queue.tier) {
    return {
      isRanked: false,
      tierKey: 'UNRANKED',
      tierLabelFr: 'Non classé',
      divisionLabel: 'Non classé',
      compactLabel: 'Non classé',
      lp: 0,
      wins: 0,
      losses: 0,
      totalGames: 0,
      winRate: 0,
      hotStreak: false,
      veteran: false,
      theme: DEFAULT_UNRANKED_THEME,
    };
  }

  const tierKey = queue.tier.toUpperCase();
  const tierLabelFr = RANKED_TIER_LABELS_FR[tierKey] || queue.tier;
  const division = APEX_TIERS.has(tierKey) || !queue.rank ? '' : ` ${queue.rank}`;
  const divisionLabel = `${tierLabelFr}${division}`;
  const totalGames = Math.max(0, queue.wins + queue.losses);
  const winRate = totalGames > 0 ? Math.round((queue.wins / totalGames) * 100) : 0;

  return {
    isRanked: true,
    tierKey,
    tierLabelFr,
    divisionLabel,
    compactLabel: `${divisionLabel} · ${queue.lp} LP`,
    lp: queue.lp,
    wins: queue.wins,
    losses: queue.losses,
    totalGames,
    winRate,
    hotStreak: Boolean(queue.hotStreak),
    veteran: Boolean(queue.veteran),
    theme: getRankedTierTheme(tierKey),
  };
}
