import type {
  ChampionCareerStat,
  ChampionMasteryEntry,
  ChampionSummary,
  MatchRecord,
} from '../engines/types.ts';

function normalizeChampionToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const SPECIAL_DISPLAY_FALLBACKS: Record<string, string> = {
  aurelionsol: 'Aurelion Sol',
  belveth: "Bel'Veth",
  chogath: "Cho'Gath",
  drmundo: 'Dr. Mundo',
  fiddlesticks: 'Fiddlesticks',
  jarvaniv: 'Jarvan IV',
  kaisa: "Kai'Sa",
  khazix: "Kha'Zix",
  kogmaw: "Kog'Maw",
  ksante: "K'Sante",
  leesin: 'Lee Sin',
  masteryi: 'Maître Yi',
  missfortune: 'Miss Fortune',
  monkeyking: 'Wukong',
  nunu: 'Nunu et Willump',
  reksai: "Rek'Sai",
  renata: 'Renata Glasc',
  tahmkench: 'Tahm Kench',
  twistedfate: 'Twisted Fate',
  velkoz: "Vel'Koz",
  wukong: 'Wukong',
  xinzhao: 'Xin Zhao',
};

export interface ResolvedChampionDisplay {
  champion: ChampionSummary | null;
  id: string;
  displayName: string;
  imageUrl?: string;
}

export function findChampionSummary(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): ChampionSummary | null {
  if (rawNameOrId === undefined || rawNameOrId === null) return null;

  if (typeof rawNameOrId === 'number' || /^\d+$/.test(String(rawNameOrId).trim())) {
    const numStr = String(rawNameOrId).trim();
    const byKey = champions.find((c) => c.key === numStr);
    if (byKey) return byKey;
  }

  const rawStr = String(rawNameOrId).trim();
  if (!rawStr) return null;

  const low = rawStr.toLowerCase();
  const exact = champions.find(
    (c) => c.id.toLowerCase() === low || c.name.toLowerCase() === low,
  );
  if (exact) return exact;

  const token = normalizeChampionToken(rawStr);
  if (!token) return null;

  if (token === 'wukong') {
    const monkey = champions.find((c) => c.id.toLowerCase() === 'monkeyking');
    if (monkey) return monkey;
  }
  if (token === 'nunuwillump' || token === 'nunuetwillump') {
    const nunu = champions.find((c) => c.id.toLowerCase() === 'nunu');
    if (nunu) return nunu;
  }

  return (
    champions.find(
      (c) =>
        normalizeChampionToken(c.id) === token ||
        normalizeChampionToken(c.name) === token,
    ) || null
  );
}

export function resolveChampionDisplay(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): ResolvedChampionDisplay {
  const rawStr = rawNameOrId !== undefined && rawNameOrId !== null ? String(rawNameOrId).trim() : '';
  const champion = findChampionSummary(champions, rawNameOrId);
  if (champion) {
    return {
      champion,
      id: champion.id,
      displayName: champion.name,
      imageUrl: champion.imageUrl,
    };
  }

  const token = normalizeChampionToken(rawStr);
  const prettyFallback =
    SPECIAL_DISPLAY_FALLBACKS[token] ||
    (rawStr ? rawStr : 'Champion');

  return {
    champion: null,
    id: rawStr || 'Champion',
    displayName: prettyFallback,
    imageUrl: undefined,
  };
}

export function formatChampionDisplayName(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): string {
  return resolveChampionDisplay(champions, rawNameOrId).displayName;
}

export function getChampionIconUrl(
  champions: ChampionSummary[],
  rawNameOrId?: string | number | null,
): string | undefined {
  return resolveChampionDisplay(champions, rawNameOrId).imageUrl;
}

export interface HeroChampionFocus {
  rawName: string;
  display: ResolvedChampionDisplay;
  isOtp: boolean;
  badgeLabel: string;
  subLabel: string;
  winRatePct: number | null;
  gamesCount: number;
  masteryLevel?: number;
  masteryPoints?: number;
  isInLiveGame: boolean;
}

/**
 * Détecte en priorité le champion OTP du joueur (concentration des parties récentes
 * et/ou maîtrise Riot largement dominante). Si aucun profil OTP net n’est détecté,
 * bascule automatiquement sur le champion utilisé (en partie active, en préparation,
 * ou lors du dernier match joué).
 */
export function resolveHeroChampionFocus(params: {
  champions: ChampionSummary[];
  matches: MatchRecord[];
  championStats?: ChampionCareerStat[];
  championMasteries?: ChampionMasteryEntry[];
  liveChampionName?: string | null;
  preparedChampionName?: string | null;
  fallbackWinRate?: number;
}): HeroChampionFocus {
  const {
    champions,
    matches,
    championStats = [],
    championMasteries = [],
    liveChampionName,
    preparedChampionName,
    fallbackWinRate,
  } = params;

  const sortedStats = [...championStats].sort(
    (a, b) => b.games - a.games || b.winRate - a.winRate,
  );
  const totalGames = sortedStats.reduce((sum, s) => sum + s.games, 0);
  const sortedMasteries = [...championMasteries].sort(
    (a, b) => b.championPoints - a.championPoints,
  );

  const findCareerStat = (rawOrDisp: string | ResolvedChampionDisplay): ChampionCareerStat | null => {
    const target =
      typeof rawOrDisp === 'string' ? resolveChampionDisplay(champions, rawOrDisp) : rawOrDisp;
    const targetToken = normalizeChampionToken(target.id);
    const targetNameToken = normalizeChampionToken(target.displayName);
    return (
      sortedStats.find((cs) => {
        const d = resolveChampionDisplay(champions, cs.championName);
        const tId = normalizeChampionToken(d.id);
        const tName = normalizeChampionToken(d.displayName);
        return (
          (targetToken && (tId === targetToken || tName === targetToken)) ||
          (targetNameToken && (tId === targetNameToken || tName === targetNameToken))
        );
      }) || null
    );
  };

  const findMastery = (disp: ResolvedChampionDisplay): ChampionMasteryEntry | null => {
    const keyNum = disp.champion?.key ? Number(disp.champion.key) : NaN;
    if (!Number.isFinite(keyNum) || keyNum <= 0) return null;
    return sortedMasteries.find((m) => m.championId === keyNum) || null;
  };

  const liveDisp = liveChampionName ? resolveChampionDisplay(champions, liveChampionName) : null;

  // 1) Détection OTP par maîtrise de compte officielle (prioritaire : reflète la vraie spécialisation)
  const topStat = sortedStats[0] || null;
  const secondStat = sortedStats[1] || null;
  const topMast = sortedMasteries[0] || null;
  const secondMast = sortedMasteries[1] || null;
  const thirdMast = sortedMasteries[2] || null;
  const top5MastPoints = sortedMasteries.slice(0, 5).reduce((s, m) => s + m.championPoints, 0);
  const topMastShare = topMast && top5MastPoints > 0 ? topMast.championPoints / top5MastPoints : 0;
  const topMastRatio =
    topMast && secondMast && secondMast.championPoints > 0
      ? topMast.championPoints / secondMast.championPoints
      : topMast
        ? 99
        : 0;
  const topVsThirdRatio =
    topMast && thirdMast && thirdMast.championPoints > 0
      ? topMast.championPoints / thirdMast.championPoints
      : topMast
        ? 99
        : 0;

  let otpCandidateRaw: string | null = null;
  let otpSharePct = 0;

  if (topMast) {
    const isStrictMasteryOtp =
      (topMast.championPoints >= 80000 ||
        (topMast.championLevel >= 7 && topMast.championPoints >= 50000)) &&
      (topMastRatio >= 1.75 || topMastShare >= 0.42);

    const isClearPrimaryOtpOverPool =
      (topMast.championPoints >= 100000 || topMast.championLevel >= 10) &&
      topMastRatio >= 1.25 &&
      topVsThirdRatio >= 2.2;

    if (isStrictMasteryOtp || isClearPrimaryOtpOverPool) {
      const mastDisp = resolveChampionDisplay(champions, topMast.championId);
      if (mastDisp.champion) {
        otpCandidateRaw = mastDisp.id;
      }
    }
  }

  // 2) Détection OTP par historique récent (validée par la maîtrise si disponible,
  //    pour éviter qu'un champion testé récemment à faible maîtrise passe pour un OTP)
  if (!otpCandidateRaw && topStat && totalGames >= 4) {
    const share = topStat.games / totalGames;
    const topStatDisp = resolveChampionDisplay(champions, topStat.championName);
    const topStatMastery = findMastery(topStatDisp);

    const hasMasteryData = sortedMasteries.length > 0;
    const masterySupportsOtp =
      !hasMasteryData ||
      Boolean(
        topStatMastery &&
          (topStatMastery.championPoints >= 50000 || topStatMastery.championLevel >= 7) &&
          (!topMast || topStatMastery.championPoints >= topMast.championPoints * 0.6),
      );

    const isRecentMajority = share >= 0.48 && topStat.games >= 4;
    const isRecentDominant =
      share >= 0.35 &&
      topStat.games >= 4 &&
      (!secondStat || topStat.games >= secondStat.games * 2);

    if (masterySupportsOtp && (isRecentMajority || isRecentDominant)) {
      otpCandidateRaw = topStat.championName;
      otpSharePct = Math.round(share * 100);
    }
  }

  if (otpCandidateRaw) {
    const disp = resolveChampionDisplay(champions, otpCandidateRaw);
    const stat = findCareerStat(disp);
    const mastery = findMastery(disp);
    const isPlayingOtpLive = Boolean(
      liveDisp && normalizeChampionToken(liveDisp.id) === normalizeChampionToken(disp.id),
    );
    const parts: string[] = [];
    if (mastery) {
      parts.push(
        mastery.championPoints >= 10000
          ? `Maîtrise ${mastery.championLevel} · ${Math.round(mastery.championPoints / 1000)}k pts`
          : `Maîtrise ${mastery.championLevel}`,
      );
    }
    if (stat && totalGames > 0) {
      const pct = otpSharePct || Math.round((stat.games / totalGames) * 100);
      parts.push(
        pct >= 30
          ? `${stat.games}/${totalGames} matchs (${pct}%)`
          : `${stat.games}/${totalGames} matchs récents`,
      );
    }
    return {
      rawName: disp.id || otpCandidateRaw,
      display: disp,
      isOtp: true,
      badgeLabel: isPlayingOtpLive ? 'Champion OTP · En partie' : 'Champion OTP',
      subLabel: parts.join(' · ') || 'Spécialisation principale détectée',
      winRatePct: stat ? Math.round(stat.winRate) : null,
      gamesCount: stat?.games || 0,
      masteryLevel: mastery?.championLevel,
      masteryPoints: mastery?.championPoints,
      isInLiveGame: isPlayingOtpLive,
    };
  }

  void fallbackWinRate;

  // 3) Aucun OTP net : afficher le champion utilisé (en partie > préparation > dernier match > plus joué)
  let usedRaw: string | null = null;
  let usedSource: 'live' | 'prepared' | 'recent' | 'fallback' = 'fallback';

  if (liveChampionName && liveChampionName.trim()) {
    usedRaw = liveChampionName.trim();
    usedSource = 'live';
  } else if (preparedChampionName && preparedChampionName.trim()) {
    usedRaw = preparedChampionName.trim();
    usedSource = 'prepared';
  } else if (matches.length > 0) {
    const standardRecent = matches.find(
      (m) => m.queueId !== 0 && !/outil d.?entra[îi]nement|practice/i.test(m.gameMode || ''),
    );
    usedRaw = (standardRecent || matches[0]).player.championName;
    usedSource = 'recent';
  } else if (topStat) {
    usedRaw = topStat.championName;
    usedSource = 'recent';
  } else {
    usedRaw = 'TahmKench';
    usedSource = 'fallback';
  }

  const disp = resolveChampionDisplay(champions, usedRaw);
  const stat = findCareerStat(disp);
  const mastery = findMastery(disp);
  const gamesCount = stat?.games || 0;

  let badgeLabel = 'Champion utilisé';
  let subLabel = 'Prêt pour la préparation';
  if (usedSource === 'live') {
    badgeLabel = 'Champion utilisé · En partie';
    subLabel =
      gamesCount > 0
        ? `${gamesCount} partie${gamesCount > 1 ? 's' : ''} récente${gamesCount > 1 ? 's' : ''}`
        : 'Partie active détectée';
  } else if (usedSource === 'prepared') {
    subLabel =
      gamesCount > 0
        ? `En préparation · ${gamesCount} partie${gamesCount > 1 ? 's' : ''}`
        : 'Sélectionné en préparation';
  } else if (usedSource === 'recent') {
    subLabel =
      gamesCount > 0
        ? `Dernier match · ${gamesCount} partie${gamesCount > 1 ? 's' : ''}`
        : 'Dernier match joué';
  }

  return {
    rawName: disp.id || usedRaw,
    display: disp,
    isOtp: false,
    badgeLabel,
    subLabel,
    winRatePct: stat ? Math.round(stat.winRate) : null,
    gamesCount,
    masteryLevel: mastery?.championLevel,
    masteryPoints: mastery?.championPoints,
    isInLiveGame: usedSource === 'live',
  };
}
