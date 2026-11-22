import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Compass,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Swords,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { BuildOptimizerView } from './components/BuildOptimizerView.tsx';
import { ChampionEncyclopediaView } from './components/ChampionEncyclopediaView.tsx';
import { CommandPaletteModal } from './components/CommandPaletteModal.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { GuideView } from './components/GuideView.tsx';
import { LiveCoachView } from './components/LiveCoachView.tsx';
import { LiveMenuSummaryPopover } from './components/LiveMenuSummaryPopover.tsx';
import { PostGameView } from './components/PostGameView.tsx';
import { RankedTierCrest } from './components/RankedTierCrest.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { ToastContainer, type ToastItem } from './components/ToastContainer.tsx';
import { formatChampionDisplayName } from './utils/championDisplay.ts';
import { buildLiveMenuQuickSummary } from './utils/liveNavSummary.ts';
import { formatRankedQueue } from './utils/rankedDisplay.ts';
import { computePlayerTendencies } from './engines/postGameEngine.ts';
import { parseLiveClientSnapshot } from './engines/liveCoachEngine.ts';
import {
  buildTrainingFocusReport,
  evaluateMatchAgainstGoals,
  type TrainingIntensity,
} from './engines/trainingGoalsEngine.ts';
import type {
  CareerAiSynthesis,
  DDragonBootstrap,
  LiveCoachSnapshot,
  LobbyScoutParticipant,
  MatchRecord,
  PlayerProfileResponse,
  RiotPlatform,
  Role,
  SavedPlayerProfile,
} from './engines/types.ts';

type NavTab =
  | 'dashboard'
  | 'builds'
  | 'postgame'
  | 'live'
  | 'champions'
  | 'guide'
  | 'settings';

const STORAGE_KEY = 'lol_ai_coach_prefs_v1';
const PROFILES_STORAGE_KEY = 'lol_ai_coach_profiles_v1';
const ARCHIVE_STORAGE_KEY = 'lol_ai_coach_archive_v1';
const PROFILE_META_STORAGE_KEY = 'lol_ai_coach_profile_meta_v1';
const CAREER_AI_STORAGE_KEY = 'lol_ai_coach_career_ai_v1';
const TRAINING_INTENSITY_STORAGE_KEY = 'lol_ai_coach_training_intensity_v1';
const MAX_ARCHIVED_MATCHES_PER_ACCOUNT = 45;

function loadTrainingIntensity(): TrainingIntensity {
  try {
    const raw = localStorage.getItem(TRAINING_INTENSITY_STORAGE_KEY);
    if (raw === 'strict' || raw === 'standard') return raw;
  } catch {
    // ignore
  }
  return 'standard';
}

const REGIONS: RiotPlatform[] = [
  'EUW1',
  'EUN1',
  'NA1',
  'KR',
  'BR1',
  'JP1',
  'OC1',
  'TR1',
  'LA1',
  'LA2',
  'ME1',
  'SG2',
  'TW2',
  'VN2',
];

interface NavItemDef {
  id: NavTab;
  label: string;
  phaseLabel: string;
  description: string;
  icon: typeof LayoutDashboard;
}

interface NavSectionDef {
  id: string;
  title: string;
  isLiveZone?: boolean;
  items: NavItemDef[];
}

const NAV_SECTIONS: NavSectionDef[] = [
  {
    id: 'session-flow',
    title: 'Votre session',
    items: [
      {
        id: 'dashboard',
        label: 'Aujourd’hui',
        phaseLabel: 'Accueil',
        description: 'Forme récente, conseil du jour et résumé de carrière',
        icon: LayoutDashboard,
      },
      {
        id: 'builds',
        label: 'Avant la partie',
        phaseLabel: 'Préparation',
        description: 'Builds, runes, simulateur de dégâts & fiches champions',
        icon: Swords,
      },
      {
        id: 'live',
        label: 'En partie · Live',
        phaseLabel: 'En partie',
        description: 'Coaching guidé étape par étape pendant votre match',
        icon: Activity,
      },
      {
        id: 'postgame',
        label: 'Après la partie',
        phaseLabel: 'Débrief',
        description: 'Carte des morts, courbes d’or et analyse post-match',
        icon: History,
      },
    ],
  },
  {
    id: 'utilities-zone',
    title: 'Utilitaires',
    items: [
      {
        id: 'guide',
        label: 'Mode d’emploi',
        phaseLabel: 'Aide',
        description: 'Parcours pas à pas pour maîtriser chaque outil',
        icon: Compass,
      },
      {
        id: 'settings',
        label: 'Réglages & Compte',
        phaseLabel: 'Compte',
        description: 'Riot ID, profils enregistrés, IA & préférences',
        icon: Settings,
      },
    ],
  },
];

const EXTRA_NAV_META: Record<'champions', NavItemDef> = {
  champions: {
    id: 'champions',
    label: 'Encyclopédie Champions',
    phaseLabel: 'Préparation',
    description: 'Fiches complètes, sorts et statistiques niveaux 1–18',
    icon: BookOpen,
  },
};

const NAV_ITEMS: NavItemDef[] = [...NAV_SECTIONS.flatMap((section) => section.items), EXTRA_NAV_META.champions];

function getAccountArchiveKey(riotId: string, targetRegion: RiotPlatform): string {
  return `${targetRegion}:${(riotId || 'Boulvae#EUW').trim().toLowerCase()}`;
}

function parseRiotIdInput(raw: string): {
  canonical: string;
  gameName: string;
  tagLine: string;
  hasTag: boolean;
} {
  const cleaned = (raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/＃/g, '#')
    .trim();
  if (!cleaned) {
    return { canonical: '', gameName: '', tagLine: '', hasTag: false };
  }
  const hashIdx = cleaned.indexOf('#');
  if (hashIdx === -1) {
    return { canonical: cleaned, gameName: cleaned, tagLine: '', hasTag: false };
  }
  const gameName = cleaned.slice(0, hashIdx).trim();
  const tagLine = cleaned.slice(hashIdx + 1).replace(/^#+/, '').trim();
  return {
    canonical: gameName && tagLine ? `${gameName}#${tagLine}` : cleaned,
    gameName,
    tagLine,
    hasTag: Boolean(gameName && tagLine),
  };
}

function loadSavedPrefs(): {
  riotId: string;
  region: RiotPlatform;
  role: Role;
  darkMode: boolean;
  autoSyncEnabled: boolean;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        riotId: parsed.riotId || 'Boulvae#EUW',
        region: parsed.region || 'EUW1',
        role: parsed.role || 'SUPPORT',
        darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : true,
        autoSyncEnabled: typeof parsed.autoSyncEnabled === 'boolean' ? parsed.autoSyncEnabled : true,
      };
    }
  } catch {
    // ignore storage read error
  }
  return {
    riotId: 'Boulvae#EUW',
    region: 'EUW1',
    role: 'SUPPORT',
    darkMode: true,
    autoSyncEnabled: true,
  };
}

function loadSavedProfiles(fallback: {
  riotId: string;
  region: RiotPlatform;
  role: Role;
}): SavedPlayerProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage read error
  }
  const initialName = fallback.riotId.split('#')[0] || 'Principal';
  return [
    {
      id: 'default-main',
      label: initialName,
      riotId: fallback.riotId,
      region: fallback.region,
      role: fallback.role,
    },
  ];
}

function loadArchiveMap(): Record<string, MatchRecord[]> {
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

interface CachedProfileMeta {
  riotId: string;
  region: string;
  level: number;
  profileIconId: number;
  rankedSolo: PlayerProfileResponse['rankedSolo'];
}

function loadProfileMetaMap(): Record<string, CachedProfileMeta> {
  try {
    const raw = localStorage.getItem(PROFILE_META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveProfileMetaForAccount(accountKey: string, data: PlayerProfileResponse) {
  try {
    const map = loadProfileMetaMap();
    map[accountKey] = {
      riotId: data.riotId,
      region: data.region,
      level: data.level,
      profileIconId: data.profileIconId,
      rankedSolo: data.rankedSolo,
    };
    localStorage.setItem(PROFILE_META_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function loadCareerAiMap(): Record<string, CareerAiSynthesis> {
  try {
    const raw = localStorage.getItem(CAREER_AI_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function saveCareerAiForAccount(accountKey: string, synthesis: CareerAiSynthesis) {
  try {
    const map = loadCareerAiMap();
    map[accountKey] = synthesis;
    localStorage.setItem(CAREER_AI_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

function saveArchiveForAccount(accountKey: string, matches: MatchRecord[]) {
  try {
    const map = loadArchiveMap();
    const realMatches = matches.filter((m) => m.source !== 'Match de référence');
    map[accountKey] = realMatches.slice(0, MAX_ARCHIVED_MATCHES_PER_ACCOUNT);
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded fallback : compact matches (keep player & laneOpponent, drop full 10-player arrays)
    try {
      const map = loadArchiveMap();
      const compacted = matches
        .filter((m) => m.source !== 'Match de référence')
        .slice(0, 25)
        .map((m) => ({
          ...m,
          participants: [],
        }));
      map[accountKey] = compacted;
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore if storage completely unavailable
    }
  }
}

function mergeAccountMatches(existing: MatchRecord[], incoming: MatchRecord[]): MatchRecord[] {
  const byId = new Map<string, MatchRecord>();
  for (const m of existing) {
    byId.set(m.matchId, m);
  }
  for (const m of incoming) {
    const prev = byId.get(m.matchId);
    if (!prev) {
      const nearDup = Array.from(byId.values()).some(
        (em) =>
          em.source !== 'Match de référence' &&
          m.source !== 'Match de référence' &&
          Math.abs(em.gameCreation - m.gameCreation) < 90_000 &&
          em.player.championName === m.player.championName,
      );
      if (!nearDup) {
        byId.set(m.matchId, m);
      }
    } else if (
      m.source !== 'Match de référence' &&
      (m.timelineSplits.length > prev.timelineSplits.length ||
        m.participants.length > prev.participants.length ||
        m.mapEvents.length > prev.mapEvents.length ||
        (m.mapEvents.some((e) => (e.participantSnapshots?.length || 0) > 0) &&
          !prev.mapEvents.some((e) => (e.participantSnapshots?.length || 0) > 0)))
    ) {
      byId.set(m.matchId, m);
    }
  }

  const all = Array.from(byId.values());
  const hasReal = all.some((m) => m.source !== 'Match de référence');
  const filtered = hasReal ? all.filter((m) => m.source !== 'Match de référence') : all;
  return filtered
    .sort((a, b) => b.gameCreation - a.gameCreation)
    .slice(0, MAX_ARCHIVED_MATCHES_PER_ACCOUNT);
}

export default function App() {
  const initialPrefs = loadSavedPrefs();

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [darkMode, setDarkMode] = useState(initialPrefs.darkMode);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(initialPrefs.autoSyncEnabled);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [ddragon, setDdragon] = useState<DDragonBootstrap | null>(null);
  const [ddError, setDdError] = useState<string | null>(null);
  const [statusMeta, setStatusMeta] = useState({
    riotConfigured: false,
    riotKeyStartsWithRgapi: false,
    riotKeyLength: 0,
    geminiConfigured: false,
  });

  const [riotIdInput, setRiotIdInput] = useState(initialPrefs.riotId);
  const [region, setRegion] = useState<RiotPlatform>(initialPrefs.region);
  const [defaultRole, setDefaultRole] = useState<Role>(initialPrefs.role);
  const [savedProfiles, setSavedProfiles] = useState<SavedPlayerProfile[]>(() =>
    loadSavedProfiles(initialPrefs),
  );

  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [builderInitialChamp, setBuilderInitialChamp] = useState<string | undefined>(undefined);
  const [builderInitialDuoChamp, setBuilderInitialDuoChamp] = useState<string | undefined>(undefined);
  const [encyclopediaInitialChampId, setEncyclopediaInitialChampId] = useState<string | undefined>(undefined);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [liveMenuSnapshot, setLiveMenuSnapshot] = useState<LiveCoachSnapshot | null>(null);
  const [liveSnapshotFetchedAtMs, setLiveSnapshotFetchedAtMs] = useState<number>(() => Date.now());
  const [activeGameFetchedAtMs, setActiveGameFetchedAtMs] = useState<number>(() => Date.now());
  const [liveLobbyParticipants, setLiveLobbyParticipants] = useState<LobbyScoutParticipant[]>([]);
  const [liveLobbyLoading, setLiveLobbyLoading] = useState(false);
  const scoutedGameIdRef = useRef<number | null>(null);
  const [liveMenuOpen, setLiveMenuOpen] = useState(false);
  const [liveMenuCoords, setLiveMenuCoords] = useState<{ top: number; left: number }>({
    top: 180,
    left: 268,
  });
  const liveNavButtonRef = useRef<HTMLButtonElement | null>(null);
  const liveMenuCloseTimerRef = useRef<number | null>(null);
  const [liveTickNow, setLiveTickNow] = useState<number>(() => Date.now());
  const [trainingIntensity, setTrainingIntensity] = useState<TrainingIntensity>(() =>
    loadTrainingIntensity(),
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastToastDedupRef = useRef<{ sig: string; at: number }>({ sig: '', at: 0 });

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((input: Omit<ToastItem, 'id'>) => {
    const now = Date.now();
    const sig = `${input.variant}:${input.title}:${input.description}`;
    if (
      lastToastDedupRef.current.sig === sig &&
      now - lastToastDedupRef.current.at < 2500
    ) {
      return;
    }
    lastToastDedupRef.current = { sig, at: now };
    const id = `toast-${now}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { ...input, id }]);
  }, []);

  const notifyMatchAndGoalProgress = useCallback(
    (
      previousMatches: MatchRecord[],
      mergedMatches: MatchRecord[],
      newlyAddedMatches: MatchRecord[],
      intensity: TrainingIntensity,
      role: Role,
    ) => {
      if (newlyAddedMatches.length === 0) return;
      const sortedNew = [...newlyAddedMatches].sort(
        (a, b) => (b.gameCreation || 0) - (a.gameCreation || 0),
      );
      const newest = sortedNew[0];
      const p = newest.player;
      const newestChampLabel = formatChampionDisplayName(ddragon?.champions || [], p.championName);

      // 1) Notification : nouvelle analyse Post-Game prête
      pushToast({
        variant: 'postgame',
        title:
          sortedNew.length > 1
            ? `${sortedNew.length} nouvelles analyses Post-Game prêtes`
            : `Nouvelle analyse Post-Game prête · ${newestChampLabel}`,
        description:
          sortedNew.length > 1
            ? `Dernier match : ${newestChampLabel} (${p.win ? 'Victoire' : 'Défaite'} · ${p.kills}/${p.deaths}/${p.assists}). Carte tactique et courbes prêtes.`
            : `${p.win ? 'Victoire' : 'Défaite'} (${p.kills}/${p.deaths}/${p.assists}) · ${Math.round(newest.gameDurationSec / 60)} min · Carte tactique et audit d’équipement prêts.`,
        action: {
          label: 'Ouvrir l’analyse',
          onClick: () => {
            setSelectedMatchId(newest.matchId);
            setActiveTab('postgame');
          },
        },
      });

      // 2) Notification : objectif(s) d'entraînement atteints sur le nouveau match ou palier 5 matchs
      const singleChecks = evaluateMatchAgainstGoals(newest, mergedMatches, intensity);
      const passedSingle = singleChecks.filter((c) => c.passed);

      const prevReport = buildTrainingFocusReport(previousMatches, intensity, role);
      const nextReport = buildTrainingFocusReport(mergedMatches, intensity, role);

      const newlyMasteredGoal = nextReport.goals.find((ng) => {
        const pg = prevReport.goals.find((g) => g.id === ng.id);
        return (
          ng.totalCount >= 3 &&
          ng.passedCount === ng.totalCount &&
          (!pg || pg.passedCount < pg.totalCount)
        );
      });

      const crossedFormThreshold =
        previousMatches.length >= 3 &&
        prevReport.formScore < 72 &&
        nextReport.formScore >= 72;

      if (newlyMasteredGoal) {
        pushToast({
          variant: 'goal',
          title: `Objectif maîtrisé : ${newlyMasteredGoal.category} (${newlyMasteredGoal.passedCount}/${newlyMasteredGoal.totalCount}) !`,
          description: `${newlyMasteredGoal.title} validé sur vos ${newlyMasteredGoal.totalCount} derniers matchs (Score de Forme : ${nextReport.formScore}/100).`,
          action: {
            label: 'Voir mon programme',
            onClick: () => setActiveTab('dashboard'),
          },
        });
      } else if (crossedFormThreshold) {
        pushToast({
          variant: 'goal',
          title: `Palier « En pleine forme » atteint (${nextReport.formScore}/100) !`,
          description: `Vos objectifs sur ${newestChampLabel} propulsent votre Score de Forme dans la zone haute.`,
          action: {
            label: 'Voir le Tableau de bord',
            onClick: () => setActiveTab('dashboard'),
          },
        });
      } else if (passedSingle.length > 0) {
        pushToast({
          variant: 'goal',
          title:
            passedSingle.length === singleChecks.length
              ? `Objectifs d’entraînement : ${passedSingle.length}/${singleChecks.length} atteints !`
              : `Objectif d’entraînement atteint (${passedSingle.length}/${singleChecks.length})`,
          description: `Validé sur ${newestChampLabel} : ${passedSingle.map((g) => g.category).join(' · ')}.`,
          action: {
            label: 'Inspecter le bilan',
            onClick: () => {
              setSelectedMatchId(newest.matchId);
              setActiveTab('postgame');
            },
          },
        });
      }
    },
    [pushToast, ddragon?.champions],
  );

  const activeAccountKey = getAccountArchiveKey(riotIdInput, region);
  const [careerSynthesis, setCareerSynthesis] = useState<CareerAiSynthesis | null>(
    () => loadCareerAiMap()[getAccountArchiveKey(initialPrefs.riotId, initialPrefs.region)] || null,
  );

  const trainingFocus = useMemo(
    () => buildTrainingFocusReport(profile?.matches || [], trainingIntensity, defaultRole),
    [profile?.matches, trainingIntensity, defaultRole],
  );

  const handleChangeTrainingIntensity = (next: TrainingIntensity) => {
    setTrainingIntensity(next);
    try {
      localStorage.setItem(TRAINING_INTENSITY_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setCareerSynthesis(loadCareerAiMap()[activeAccountKey] || null);
  }, [activeAccountKey]);

  // Raccourci clavier global Ctrl+K / Cmd+K pour la Palette de Commande rapide
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // Synchroniser la classe .dark sur <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Fermeture du drawer mobile et du menu compte via touche Escape ou clic extérieur
  useEffect(() => {
    if (!mobileNavOpen && !accountMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false);
        setAccountMenuOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (
        accountMenuOpen &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [mobileNavOpen, accountMenuOpen]);

  const loadBootstrap = async (forceRefresh = false) => {
    const [ddRes, statusRes] = await Promise.all([
      fetch(`/api/ddragon/bootstrap${forceRefresh ? '?refresh=1' : ''}`),
      fetch('/api/riot/status'),
    ]);
    if (!ddRes.ok) throw new Error('Impossible de charger Data Dragon.');
    const ddData = (await ddRes.json()) as DDragonBootstrap;
    setDdragon(ddData);

    if (statusRes.ok) {
      const st = await statusRes.json();
      setStatusMeta({
        riotConfigured: Boolean(st.riotApiConfigured),
        riotKeyStartsWithRgapi: Boolean(st.riotKeyStartsWithRgapi),
        riotKeyLength: Number(st.riotKeyLength || 0),
        geminiConfigured: Boolean(st.geminiConfigured),
      });
    }
  };

  useEffect(() => {
    loadBootstrap(false).catch((err) => {
      setDdError(err instanceof Error ? err.message : 'Erreur de chargement Data Dragon.');
    });
  }, []);

  const lastLocalBridgeLiveAtRef = useRef<number>(0);

  // Synchronise en arrière-plan le dernier snapshot Live (pont local 127.0.0.1:38421 hors iframe + /api/live/latest)
  useEffect(() => {
    let cancelled = false;
    const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

    const pullLocalBridge = async () => {
      if (isInsideIframe) return false;
      try {
        const res = await fetch('http://127.0.0.1:38421/live');
        if (!res.ok || cancelled) return false;
        const candidate = await res.json();
        if (
          !cancelled &&
          candidate &&
          !candidate.errorCode &&
          (candidate.allPlayers || candidate.activePlayer)
        ) {
          const parsed = parseLiveClientSnapshot(
            candidate,
            'Live Client Data (127.0.0.1:2999)',
            defaultRole,
          );
          lastLocalBridgeLiveAtRef.current = Date.now();
          setLiveMenuSnapshot(parsed);
          setLiveSnapshotFetchedAtMs(Date.now());
          return true;
        }
      } catch {
        // Pont local non démarré ou non joignable
      }
      return false;
    };

    const pullLatestLive = async () => {
      const gotLocal = await pullLocalBridge();
      if (gotLocal || cancelled) return;
      try {
        const res = await fetch('/api/live/latest');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as LiveCoachSnapshot;
        if (!cancelled && data && data.championName) {
          const hasFreshLocal = Date.now() - lastLocalBridgeLiveAtRef.current < 20_000;
          if (hasFreshLocal && data.source !== 'Live Client Data (127.0.0.1:2999)') {
            return;
          }
          setLiveMenuSnapshot(data);
          setLiveSnapshotFetchedAtMs(Date.now());
        }
      } catch {
        // ignore network error in background summary
      }
    };

    void pullLatestLive();
    const bridgeIntervalId = !isInsideIframe
      ? window.setInterval(() => {
          if (typeof document !== 'undefined' && document.hidden) return;
          void pullLocalBridge();
        }, 5_000)
      : null;
    const serverIntervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void pullLatestLive();
    }, 15_000);

    return () => {
      cancelled = true;
      if (bridgeIntervalId !== null) window.clearInterval(bridgeIntervalId);
      window.clearInterval(serverIntervalId);
    };
  }, [defaultRole]);

  const seenMajorGameEventIdsRef = useRef<Set<string>>(new Set());
  const gameEventSessionRef = useRef<{ key: string; lastTimeSec: number } | null>(null);
  const activeTabRef = useRef<NavTab>(activeTab);
  activeTabRef.current = activeTab;

  // Déclenche une alerte pushToast dès qu'un sort majeur (Flash, Ultime, TP, etc.) est détecté via gameEvent
  useEffect(() => {
    if (!liveMenuSnapshot) return;
    const events = liveMenuSnapshot.gameEvents || [];
    const sessionKey = `${liveMenuSnapshot.source}:${liveMenuSnapshot.championName}`;
    const prevSession = gameEventSessionRef.current;
    const isNewOrResetSession =
      !prevSession ||
      prevSession.key !== sessionKey ||
      liveMenuSnapshot.gameTimeSec + 45 < prevSession.lastTimeSec;

    if (isNewOrResetSession) {
      seenMajorGameEventIdsRef.current.clear();
      // Ignore les anciens événements historiques (> 25s) lors de la connexion en milieu de partie
      for (const ev of events) {
        if (ev.isMajor && liveMenuSnapshot.gameTimeSec - ev.eventTimeSec > 25) {
          seenMajorGameEventIdsRef.current.add(ev.id);
        }
      }
    }

    gameEventSessionRef.current = {
      key: sessionKey,
      lastTimeSec: liveMenuSnapshot.gameTimeSec,
    };

    const newMajorEvents = events.filter(
      (ev) => ev.isMajor && !seenMajorGameEventIdsRef.current.has(ev.id),
    );
    if (newMajorEvents.length === 0) return;

    for (const ev of newMajorEvents) {
      seenMajorGameEventIdsRef.current.add(ev.id);
    }

    // Limite à 3 alertes simultanées max sur un même tick pour éviter toute saturation visuelle
    for (const ev of newMajorEvents.slice(-3)) {
      const champLabel = ev.casterChampionName
        ? formatChampionDisplayName(ddragon?.champions || [], ev.casterChampionName)
        : 'Champion';
      const teamLabel =
        ev.casterTeam === 'ENEMY' ? 'Ennemi' : ev.casterTeam === 'ALLY' ? 'Allié' : 'Partie';
      const mins = Math.floor(Math.max(0, ev.eventTimeSec) / 60);
      const secs = Math.max(0, ev.eventTimeSec) % 60;
      const clockLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const title =
        ev.category === 'flash'
          ? `Flash utilisé · ${champLabel} (${teamLabel})`
          : ev.category === 'ultimate'
            ? `Ultime lancé · ${champLabel} (${teamLabel})`
            : `Sort majeur · ${ev.spellName} · ${champLabel} (${teamLabel})`;

      const cdInfo = ev.estimatedCooldownSec
        ? ` · Récupération estimée : ~${ev.estimatedCooldownSec}s`
        : '';
      const tacticalHint =
        ev.casterTeam === 'ENEMY' && ev.category === 'flash'
          ? ' Fenêtre d’all-in ou de gank ouverte !'
          : ev.casterTeam === 'ENEMY' && ev.category === 'ultimate'
            ? ' Profitez de l’absence d’ultime adverse pour contester.'
            : '';

      pushToast({
        variant: ev.casterTeam === 'ENEMY' ? 'warning' : 'info',
        title,
        description: `Détecté à ${clockLabel}${cdInfo}.${tacticalHint}`,
        durationMs: ev.category === 'flash' ? 8000 : 6000,
        action:
          activeTabRef.current !== 'live'
            ? {
                label: 'Voir le Coach Live',
                onClick: () => setActiveTab('live'),
              }
            : undefined,
      });
    }
  }, [liveMenuSnapshot, pushToast, ddragon?.champions]);

  // Met à jour l'horloge de référence quand profile.activeGame change
  useEffect(() => {
    if (profile?.activeGame?.inGame) {
      setActiveGameFetchedAtMs(Date.now());
    }
  }, [profile?.activeGame?.inGame, profile?.activeGame?.gameId, profile?.activeGame?.gameLengthSec]);

  // Calcule automatiquement le rang moyen du lobby lorsque Spectator détecte une partie active
  useEffect(() => {
    const game = profile?.activeGame;
    if (!game?.inGame || !game.participants?.length) {
      setLiveLobbyParticipants([]);
      scoutedGameIdRef.current = null;
      return;
    }
    const gameId = game.gameId ?? -1;
    if (scoutedGameIdRef.current === gameId) return;
    scoutedGameIdRef.current = gameId;

    let cancelled = false;
    setLiveLobbyLoading(true);
    fetch('/api/riot/lobby-scout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participants: game.participants, region }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { participants?: LobbyScoutParticipant[] } | null) => {
        if (!cancelled && data?.participants) {
          setLiveLobbyParticipants(data.participants);
        }
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (!cancelled) setLiveLobbyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.activeGame, region]);

  const syncPlayer = async (
    riotId: string,
    targetRegion: RiotPlatform,
    force = false,
    matchCount = 15,
    silent = false,
  ) => {
    const parsed = parseRiotIdInput(riotId || 'Boulvae#EUW');
    const gameName = parsed.gameName;
    const tagLine = parsed.hasTag ? parsed.tagLine : '';
    const trimmed = parsed.canonical || riotId.trim() || 'Boulvae#EUW';

    if (!silent) {
      setProfileLoading(true);
      setProfileError(null);
    }

    if (!gameName || !tagLine) {
      if (!silent) {
        setProfileError(
          `Format Riot ID incomplet (« ${trimmed} ») : saisissez bien Pseudo#TAG (exemple : jeanculderetour2#3842).`,
        );
        setProfileLoading(false);
      }
      return;
    }

    const accountKey = getAccountArchiveKey(trimmed, targetRegion);
    try {
      const res = await fetch(
        `/api/riot/player?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(
          tagLine,
        )}&region=${encodeURIComponent(targetRegion)}&count=${matchCount}${force ? '&force=1' : ''}`,
      );
      const data = (await res.json()) as PlayerProfileResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Échec de la synchronisation.');

      const canonicalRiotId = data.riotId || trimmed;
      const canonicalRegion = (data.region as RiotPlatform) || targetRegion;
      const canonicalAccountKey = getAccountArchiveKey(canonicalRiotId, canonicalRegion);

      const archiveMap = loadArchiveMap();
      const existingArchive =
        archiveMap[canonicalAccountKey] || archiveMap[accountKey] || [];
      const existingRealIds = new Set(
        existingArchive
          .filter((m) => m.source !== 'Match de référence')
          .map((m) => m.matchId),
      );
      const mergedMatches = mergeAccountMatches(existingArchive, data.matches || []);
      const newlyAdded = mergedMatches.filter(
        (m) => m.source !== 'Match de référence' && !existingRealIds.has(m.matchId),
      );
      saveArchiveForAccount(canonicalAccountKey, mergedMatches);
      saveProfileMetaForAccount(canonicalAccountKey, data);

      const enrichedProfile: PlayerProfileResponse = {
        ...data,
        riotId: canonicalRiotId,
        region: canonicalRegion,
        matches: mergedMatches,
        tendencies: computePlayerTendencies(mergedMatches),
      };

      setProfile(enrichedProfile);
      setRiotIdInput(canonicalRiotId);
      if (canonicalRegion !== region) {
        setRegion(canonicalRegion);
      }
      setLastSyncedAt(
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      );
      if (mergedMatches.length > 0 && !silent) {
        setSelectedMatchId(mergedMatches[0].matchId);
      }
      if (newlyAdded.length > 0 && (existingRealIds.size > 0 || force)) {
        notifyMatchAndGoalProgress(
          existingArchive,
          mergedMatches,
          newlyAdded,
          trainingIntensity,
          defaultRole,
        );
      }
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          riotId: canonicalRiotId,
          region: canonicalRegion,
          role: defaultRole,
          darkMode,
          autoSyncEnabled,
        }),
      );
    } catch (err) {
      if (!silent) {
        setProfileError(err instanceof Error ? err.message : 'Erreur réseau.');
        // Fallback hors-ligne / clé expirée : conserver l'archive locale du compte si disponible
        const archivedMatches = loadArchiveMap()[accountKey] || [];
        const cachedMeta = loadProfileMetaMap()[accountKey];
        if (archivedMatches.length > 0 || cachedMeta) {
          setProfile((prev) => {
            if (prev && prev.riotId.toLowerCase() === trimmed.toLowerCase()) return prev;
            return {
              source: 'Riot API Live',
              riotId: cachedMeta?.riotId || trimmed,
              region: cachedMeta?.region || targetRegion,
              level: cachedMeta?.level || 30,
              profileIconId: cachedMeta?.profileIconId || 29,
              rankedSolo: cachedMeta?.rankedSolo || null,
              activeGame: { inGame: false },
              matches: archivedMatches,
              tendencies: computePlayerTendencies(archivedMatches),
            };
          });
          if (archivedMatches.length > 0) {
            setSelectedMatchId(archivedMatches[0].matchId);
          }
        }
      }
    } finally {
      if (!silent) {
        setProfileLoading(false);
      }
    }
  };

  useEffect(() => {
    syncPlayer(initialPrefs.riotId, initialPrefs.region, false, 15, false);
  }, []);

  // Auto-synchronisation proactive silencieuse toutes les 5 minutes si activée et Riot API configurée
  useEffect(() => {
    if (!statusMeta.riotConfigured || !autoSyncEnabled) return;
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (profileLoading) return;
      syncPlayer(riotIdInput, region, false, 10, true);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [statusMeta.riotConfigured, autoSyncEnabled, riotIdInput, region, profileLoading]);

  const handleSyncSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    syncPlayer(riotIdInput, region, true, 15, false);
  };

  const handleToggleAutoSync = () => {
    setAutoSyncEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          riotId: riotIdInput,
          region,
          role: defaultRole,
          darkMode,
          autoSyncEnabled: next,
        }),
      );
      return next;
    });
  };

  const handleSavePreferences = (prefs: {
    riotId: string;
    region: RiotPlatform;
    role: Role;
    darkMode: boolean;
    autoSyncEnabled: boolean;
  }) => {
    setRiotIdInput(prefs.riotId);
    setRegion(prefs.region);
    setDefaultRole(prefs.role);
    setDarkMode(prefs.darkMode);
    setAutoSyncEnabled(prefs.autoSyncEnabled);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    syncPlayer(prefs.riotId, prefs.region, true, 15, false);
  };

  const persistProfiles = (next: SavedPlayerProfile[]) => {
    setSavedProfiles(next);
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage error
    }
  };

  const handleSaveProfile = (input: Omit<SavedPlayerProfile, 'id'> & { id?: string }) => {
    const parsed = parseRiotIdInput(input.riotId);
    const cleanRiotId = parsed.canonical || input.riotId.trim();
    if (!cleanRiotId) return;
    if (input.id) {
      const updated = savedProfiles.map((p) =>
        p.id === input.id ? { ...p, ...input, riotId: cleanRiotId } : p,
      );
      persistProfiles(updated);
    } else {
      const newProf: SavedPlayerProfile = {
        id: `prof-${Date.now()}`,
        label: input.label.trim() || parsed.gameName || cleanRiotId.split('#')[0],
        riotId: cleanRiotId,
        region: input.region,
        role: input.role,
      };
      persistProfiles([...savedProfiles, newProf]);
    }
  };

  const handleDeleteProfile = (id: string) => {
    const next = savedProfiles.filter((p) => p.id !== id);
    if (next.length > 0) {
      persistProfiles(next);
    }
  };

  const handleSwitchProfile = (prof: SavedPlayerProfile) => {
    setRiotIdInput(prof.riotId);
    setRegion(prof.region);
    setDefaultRole(prof.role);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        riotId: prof.riotId,
        region: prof.region,
        role: prof.role,
        darkMode,
        autoSyncEnabled,
      }),
    );
    syncPlayer(prof.riotId, prof.region, false, 15, false);
  };

  const handleSelectMatchForReview = (match: MatchRecord) => {
    setSelectedMatchId(match.matchId);
    setActiveTab('postgame');
  };

  const handleImportMatch = (imported: MatchRecord) => {
    const previousMatches = profile?.matches || [];
    const isBrandNewMatch = !previousMatches.some((m) => m.matchId === imported.matchId);
    const mergedForNotify = mergeAccountMatches(previousMatches, [imported]);

    setProfile((prev) => {
      if (!prev) return prev;
      const merged = mergeAccountMatches(prev.matches, [imported]);
      saveArchiveForAccount(getAccountArchiveKey(riotIdInput, region), merged);
      return {
        ...prev,
        matches: merged,
        tendencies: computePlayerTendencies(merged),
      };
    });
    setSelectedMatchId(imported.matchId);

    if (isBrandNewMatch) {
      notifyMatchAndGoalProgress(
        previousMatches,
        mergedForNotify,
        [imported],
        trainingIntensity,
        defaultRole,
      );
    }
  };

  const handleMergeLocalMatches = (localMatches: MatchRecord[]): number => {
    if (!profile) return 0;
    const previousMatches = profile.matches;
    const beforeCount = previousMatches.length;
    const existingById = new Set(previousMatches.map((m) => m.matchId));
    const newOnes = localMatches.filter((lm) => {
      if (existingById.has(lm.matchId)) return false;
      const nearDuplicate = previousMatches.some(
        (em) =>
          Math.abs(em.gameCreation - lm.gameCreation) < 90_000 &&
          em.player.championName === lm.player.championName,
      );
      return !nearDuplicate;
    });
    if (newOnes.length === 0) return 0;

    const merged = mergeAccountMatches(previousMatches, newOnes);
    saveArchiveForAccount(getAccountArchiveKey(riotIdInput, region), merged);
    setProfile({
      ...profile,
      matches: merged,
      tendencies: computePlayerTendencies(merged),
    });
    if (merged.length > 0) {
      setSelectedMatchId(merged[0].matchId);
    }
    notifyMatchAndGoalProgress(
      previousMatches,
      merged,
      newOnes,
      trainingIntensity,
      defaultRole,
    );
    return Math.max(newOnes.length, merged.length - beforeCount);
  };

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];
  const isInLiveGame =
    Boolean(profile?.activeGame?.inGame) ||
    liveMenuSnapshot?.source === 'Live Client Data (127.0.0.1:2999)';

  useEffect(() => {
    if (!liveMenuOpen && !isInLiveGame) return;
    setLiveTickNow(Date.now());
    const id = window.setInterval(() => setLiveTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [liveMenuOpen, isInLiveGame]);

  const liveMenuSummary = useMemo(
    () =>
      buildLiveMenuQuickSummary({
        snapshot: liveMenuSnapshot,
        snapshotElapsedSec: Math.max(0, Math.floor((liveTickNow - liveSnapshotFetchedAtMs) / 1000)),
        activeGame: profile?.activeGame,
        activeGameElapsedSec: Math.max(0, Math.floor((liveTickNow - activeGameFetchedAtMs) / 1000)),
        lobbyParticipants: liveLobbyParticipants,
        fallbackSoloRank: profile?.rankedSolo,
        fallbackFlexRank: profile?.rankedFlex,
        riotId: riotIdInput,
        role: defaultRole,
        champions: ddragon?.champions || [],
        items: ddragon?.items || [],
      }),
    [
      liveMenuSnapshot,
      liveTickNow,
      liveSnapshotFetchedAtMs,
      profile?.activeGame,
      activeGameFetchedAtMs,
      liveLobbyParticipants,
      profile?.rankedSolo,
      profile?.rankedFlex,
      riotIdInput,
      defaultRole,
      ddragon?.champions,
      ddragon?.items,
    ],
  );

  const handleOpenLivePopover = () => {
    if (liveMenuCloseTimerRef.current) {
      window.clearTimeout(liveMenuCloseTimerRef.current);
      liveMenuCloseTimerRef.current = null;
    }
    const el = liveNavButtonRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const clampedTop = Math.max(16, Math.min(rect.top - 24, window.innerHeight - 520));
      setLiveMenuCoords({ top: clampedTop, left: rect.right + 12 });
    }
    setLiveMenuOpen(true);
  };

  const handleScheduleCloseLivePopover = () => {
    if (liveMenuCloseTimerRef.current) {
      window.clearTimeout(liveMenuCloseTimerRef.current);
    }
    liveMenuCloseTimerRef.current = window.setTimeout(() => {
      setLiveMenuOpen(false);
    }, 150);
  };

  const renderSidebarSections = (onAfterSelect?: () => void) => (
    <div className="space-y-6">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id} className="space-y-1">
          <div className="px-2.5 pb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {section.title}
            </span>
          </div>

          {section.items.map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id || (item.id === 'builds' && activeTab === 'champions');
            const isLiveItem = item.id === 'live';
            const isLiveAndInGame = isLiveItem && isInLiveGame;
            return (
              <div
                key={item.id}
                onMouseEnter={isLiveItem && !onAfterSelect ? handleOpenLivePopover : undefined}
                onMouseLeave={isLiveItem && !onAfterSelect ? handleScheduleCloseLivePopover : undefined}
              >
                <button
                  ref={isLiveItem && !onAfterSelect ? liveNavButtonRef : undefined}
                  type="button"
                  onFocus={isLiveItem && !onAfterSelect ? handleOpenLivePopover : undefined}
                  onBlur={isLiveItem && !onAfterSelect ? handleScheduleCloseLivePopover : undefined}
                  onClick={() => {
                    setActiveTab(item.id);
                    setLiveMenuOpen(false);
                    onAfterSelect?.();
                  }}
                  className={`relative w-full flex items-center justify-between gap-2.5 px-3 py-2 text-[13px] font-medium rounded-xl transition-colors whitespace-nowrap ${
                    active
                      ? 'text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={onAfterSelect ? undefined : 'sidebar-active-indicator'}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-black/[0.06] dark:bg-white/[0.1]"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        active
                          ? 'text-[#007AFF] dark:text-[#0A84FF]'
                          : isLiveAndInGame
                            ? 'text-emerald-500'
                            : 'text-slate-400 dark:text-slate-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 text-left">
                      <span className="block truncate">{item.label}</span>
                      {isLiveItem && liveMenuSummary.hasLiveData && (
                        <span className="block text-[10px] font-normal font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {liveMenuSummary.championName} · {liveMenuSummary.clockLabel} · {liveMenuSummary.averageRank.label}
                        </span>
                      )}
                      {isLiveItem && liveMenuSummary.nextRecallItem && (
                        <span className="block text-[10px] font-medium text-[#007AFF] dark:text-[#0A84FF] truncate mt-0.5">
                          Back : {liveMenuSummary.nextRecallItem.itemName} ({liveMenuSummary.nextRecallItem.goldCost} po)
                        </span>
                      )}
                      {isLiveItem && liveMenuSummary.neutralObjectives && (
                        <span className="block text-[10px] font-normal font-mono tabular-nums text-amber-600 dark:text-amber-400 truncate mt-0.5">
                          {liveMenuSummary.neutralObjectives.headline}
                        </span>
                      )}
                    </span>
                  </span>
                  {isLiveAndInGame ? (
                    <span className="relative z-10 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                      En jeu
                    </span>
                  ) : isLiveItem && liveMenuSummary.hasLiveData ? (
                    <span
                      className="relative z-10 w-1.5 h-1.5 rounded-full bg-[#007AFF] dark:bg-[#0A84FF] shrink-0"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen flex bg-[#F5F5F7] text-slate-900 dark:bg-[#0A0B0E] dark:text-slate-100">
      {/* Sidebar Desktop style macOS */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#14161B]/80 apple-glass">
        <div className="h-16 px-5 flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08]">
          <span className="font-display text-[17px] font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            LoL AI Coach
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
            {ddragon?.version || '...'}
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto thin-scrollbar" aria-label="Navigation principale">
          {renderSidebarSections()}
        </nav>

        <LiveMenuSummaryPopover
          open={liveMenuOpen}
          topPx={liveMenuCoords.top}
          leftPx={liveMenuCoords.left}
          summary={liveMenuSummary}
          loadingRank={liveLobbyLoading}
          onMouseEnter={handleOpenLivePopover}
          onMouseLeave={handleScheduleCloseLivePopover}
          onOpenLiveView={() => {
            setActiveTab('live');
            setLiveMenuOpen(false);
          }}
        />

        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          {(() => {
            const soloRank = formatRankedQueue(profile?.rankedSolo);
            const flexRank = formatRankedQueue(profile?.rankedFlex);
            const primaryRank = soloRank.isRanked ? soloRank : flexRank;
            return (
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] px-3 py-2.5 hover:border-amber-500/50 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {riotIdInput}
                  </span>
                  <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 shrink-0">
                    {region}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <RankedTierCrest tier={primaryRank.tierKey} sizeClass="w-5 h-5" />
                  <span className={`text-[11px] font-semibold truncate ${primaryRank.theme.textClass}`}>
                    {primaryRank.compactLabel}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                  <span>Rôle {defaultRole}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Gérer →</span>
                </div>
              </button>
            );
          })()}

          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span>{darkMode ? 'Mode sombre' : 'Mode clair'}</span>
            {darkMode ? (
              <Moon className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>

      {/* Drawer Mobile avec physique tiroir iOS */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 bg-black/60"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0, transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] } }}
              exit={{ x: '-100%', transition: { duration: 0.17, ease: [0.32, 0.72, 0, 1] } }}
              className="relative w-72 max-w-full bg-white dark:bg-[#0E131D] border-r border-slate-200 dark:border-slate-800 flex flex-col z-10 shadow-2xl"
            >
              <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <span className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  LoL AI Coach
                </span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg"
                  aria-label="Fermer le menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 p-3 overflow-y-auto thin-scrollbar">
                {renderSidebarSections(() => setMobileNavOpen(false))}
              </nav>
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('settings');
                    setMobileNavOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate">{riotIdInput}</span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">{region}</span>
                  </div>
                  {(() => {
                    const soloRank = formatRankedQueue(profile?.rankedSolo);
                    const flexRank = formatRankedQueue(profile?.rankedFlex);
                    const primaryRank = soloRank.isRanked ? soloRank : flexRank;
                    return (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <RankedTierCrest tier={primaryRank.tierKey} sizeClass="w-4 h-4" />
                        <span className={`font-semibold truncate ${primaryRank.theme.textClass}`}>
                          {primaryRank.compactLabel}
                        </span>
                      </div>
                    );
                  })()}
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <span>{darkMode ? 'Mode sombre' : 'Mode clair'}</span>
                  {darkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Zone Principale */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Apple Glass épurée */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#14161B]/80 apple-glass flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300"
              aria-label="Ouvrir la navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 text-sm">
                <span className="hidden sm:inline text-slate-400 dark:text-slate-500 font-medium shrink-0">
                  {activeNavItem.phaseLabel}
                </span>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                  /
                </span>
                <span className="font-semibold text-slate-900 dark:text-white truncate">
                  {activeNavItem.label}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {activeNavItem.description}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Menu Compte rapide en 1 clic */}
            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-expanded={accountMenuOpen}
                aria-label="Menu rapide du compte Riot"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#121722] text-slate-800 dark:text-slate-100 hover:border-amber-500 transition-colors whitespace-nowrap shrink-0"
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                <span className="max-w-[115px] sm:max-w-[160px] truncate font-semibold">
                  {riotIdInput}
                </span>
                <span className="hidden md:inline text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {region}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    accountMenuOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              <AnimatePresence>
                {accountMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] },
                    }}
                    exit={{
                      opacity: 0,
                      y: 4,
                      scale: 0.98,
                      transition: { duration: 0.1 },
                    }}
                    className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#121722] shadow-2xl p-4 space-y-4 z-50"
                  >
                    <div className="pb-2.5 border-b border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            Compte Riot actif
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {lastSyncedAt ? `Dernière sync à ${lastSyncedAt}` : 'Prêt à synchroniser'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('settings');
                            setAccountMenuOpen(false);
                          }}
                          className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0"
                        >
                          Réglages complets →
                        </button>
                      </div>
                      {profile && (() => {
                        const soloRank = formatRankedQueue(profile.rankedSolo);
                        const flexRank = formatRankedQueue(profile.rankedFlex);
                        const activeRank = soloRank.isRanked ? soloRank : flexRank;
                        return (
                          <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${activeRank.theme.borderClass} ${activeRank.theme.softBgClass}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <RankedTierCrest tier={activeRank.tierKey} sizeClass="w-5 h-5" />
                              <span className={`text-[11px] font-semibold truncate ${activeRank.theme.textClass}`}>
                                {soloRank.isRanked ? 'Solo/Duo' : flexRank.isRanked ? 'Flex' : 'Classé'} · {activeRank.compactLabel}
                              </span>
                            </div>
                            {activeRank.isRanked && (
                              <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                                {activeRank.winRate}% WR
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Changer rapidement de Riot ID */}
                    <form
                      onSubmit={(e) => {
                        handleSyncSubmit(e);
                        setAccountMenuOpen(false);
                      }}
                      className="space-y-2"
                    >
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        Pseudo#TAG &amp; Serveur
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={riotIdInput}
                          onChange={(e) => setRiotIdInput(e.target.value)}
                          placeholder="Pseudo#TAG"
                          aria-label="Riot ID au format Pseudo#TAG"
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <select
                          value={region}
                          onChange={(e) => setRegion(e.target.value as RiotPlatform)}
                          aria-label="Région Riot"
                          className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                        >
                          {REGIONS.map((reg) => (
                            <option key={reg} value={reg}>
                              {reg}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        disabled={profileLoading}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50 transition-colors"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${profileLoading ? 'animate-spin' : ''}`}
                          aria-hidden="true"
                        />
                        <span>Appliquer &amp; synchroniser</span>
                      </button>
                    </form>

                    {/* Profils Famille & Amis en 1 clic */}
                    {savedProfiles.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3 h-3" aria-hidden="true" />
                            Profils enregistrés ({savedProfiles.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('settings');
                              setAccountMenuOpen(false);
                            }}
                            className="text-amber-600 dark:text-amber-400 hover:underline"
                          >
                            + Ajouter
                          </button>
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto thin-scrollbar">
                          {savedProfiles.map((prof) => {
                            const isCurrent =
                              prof.riotId.toLowerCase() === riotIdInput.trim().toLowerCase() &&
                              prof.region === region;
                            return (
                              <button
                                key={prof.id}
                                type="button"
                                onClick={() => {
                                  handleSwitchProfile(prof);
                                  setAccountMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                                  isCurrent
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                <span className="truncate">
                                  {prof.label}{' '}
                                  <span className="text-[11px] font-mono opacity-75">
                                    ({prof.riotId})
                                  </span>
                                </span>
                                {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Raccourcis rapides Compte */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleToggleAutoSync}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                          autoSyncEnabled
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        Auto-sync : {autoSyncEnabled ? 'ON' : 'OFF'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setDarkMode((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {darkMode ? (
                          <Sun className="w-3 h-3 text-amber-400" aria-hidden="true" />
                        ) : (
                          <Moon className="w-3 h-3 text-amber-600" aria-hidden="true" />
                        )}
                        <span>{darkMode ? 'Thème clair' : 'Thème sombre'}</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              title="Recherche rapide & raccourcis (Ctrl+K / ⌘K)"
              aria-label="Ouvrir la recherche rapide (Ctrl+K)"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#121722] text-slate-600 dark:text-slate-300 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Rechercher</span>
              <kbd className="hidden lg:inline-block px-1 py-0.5 text-[10px] font-mono rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => syncPlayer(riotIdInput, region, true, 15, false)}
              disabled={profileLoading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full bg-[#007AFF] dark:bg-[#0A84FF] text-white hover:opacity-90 disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${profileLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Synchroniser</span>
            </button>
          </div>
        </header>

        {/* Contenu principal */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          {ddError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-600 dark:text-rose-400">
              {ddError}
            </div>
          ) : !ddragon ? (
            <div className="space-y-4">
              <div className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] animate-pulse" />
              <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] animate-pulse" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
                }}
                exit={{
                  opacity: 0,
                  y: -4,
                  transition: { duration: 0.11, ease: [0.23, 1, 0.32, 1] },
                }}
              >
              {activeTab === 'dashboard' && (
                <DashboardView
                  profile={profile}
                  loading={profileLoading}
                  error={profileError}
                  riotConfigured={statusMeta.riotConfigured}
                  champions={ddragon.champions}
                  patchVersion={ddragon.version}
                  autoSyncEnabled={autoSyncEnabled}
                  lastSyncedAt={lastSyncedAt}
                  onToggleAutoSync={handleToggleAutoSync}
                  onDeepSync={() => syncPlayer(riotIdInput, region, true, 25, false)}
                  onRetrySync={() => syncPlayer(riotIdInput, region, true, 15, false)}
                  onDismissError={() => setProfileError(null)}
                  onMergeLocalMatches={handleMergeLocalMatches}
                  onSelectMatchForReview={handleSelectMatchForReview}
                  onNavigateToBuilds={(champName, duoName) => {
                    setBuilderInitialChamp(champName);
                    setBuilderInitialDuoChamp(duoName);
                    setActiveTab('builds');
                  }}
                  onNavigateToLive={() => setActiveTab('live')}
                  onNavigateToPostGame={() => setActiveTab('postgame')}
                  onNavigateToSettings={() => setActiveTab('settings')}
                  careerSynthesis={careerSynthesis}
                  geminiConfigured={statusMeta.geminiConfigured}
                  onSaveCareerSynthesis={(syn) => {
                    saveCareerAiForAccount(activeAccountKey, syn);
                    setCareerSynthesis(syn);
                  }}
                  defaultRole={defaultRole}
                  trainingIntensity={trainingIntensity}
                  onChangeTrainingIntensity={handleChangeTrainingIntensity}
                  onNotify={pushToast}
                />
              )}

              {(activeTab === 'builds' || activeTab === 'champions') && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16181D] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Préparez votre champion, vos runes et vos achats avant de lancer la partie.
                    </div>
                    <div
                      role="tablist"
                      aria-label="Outils d’avant-partie"
                      className="inline-flex items-center gap-1 p-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] self-start sm:self-auto"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'builds'}
                        onClick={() => setActiveTab('builds')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
                          activeTab === 'builds'
                            ? 'bg-white dark:bg-[#2C2E36] text-slate-900 dark:text-white shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Builds &amp; Match-ups
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeTab === 'champions'}
                        onClick={() => setActiveTab('champions')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
                          activeTab === 'champions'
                            ? 'bg-white dark:bg-[#2C2E36] text-slate-900 dark:text-white shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Encyclopédie Champions
                      </button>
                    </div>
                  </div>

                  {activeTab === 'builds' ? (
                    <BuildOptimizerView
                      ddragon={ddragon}
                      tendencies={profile?.tendencies}
                      initialChampionName={builderInitialChamp}
                      initialDuoChampionName={builderInitialDuoChamp}
                      initialRole={defaultRole}
                      riotId={riotIdInput}
                      region={region}
                      activeGame={profile?.activeGame}
                      onActiveGameDetected={(game) =>
                        setProfile((prev) => (prev ? { ...prev, activeGame: game } : prev))
                      }
                    />
                  ) : (
                    <ChampionEncyclopediaView
                      champions={ddragon.champions}
                      patchVersion={ddragon.version}
                      recentChampionIds={profile?.matches.map((m) => m.player.championName) || []}
                      initialChampionId={encyclopediaInitialChampId}
                      onUseInBuilder={(champId) => {
                        setBuilderInitialChamp(champId);
                        setActiveTab('builds');
                      }}
                    />
                  )}
                </div>
              )}

              {activeTab === 'postgame' && (
                <PostGameView
                  matches={profile?.matches || []}
                  selectedMatchId={selectedMatchId}
                  champions={ddragon.champions}
                  items={ddragon.items}
                  patchVersion={ddragon.version}
                  riotId={riotIdInput}
                  region={region}
                  trainingIntensity={trainingIntensity}
                  onSelectMatchId={setSelectedMatchId}
                  onImportMatch={handleImportMatch}
                  onNotify={pushToast}
                />
              )}

              {activeTab === 'live' && (
                <LiveCoachView
                  champions={ddragon.champions}
                  items={ddragon.items}
                  runeTrees={ddragon.runeTrees}
                  patchVersion={ddragon.version}
                  riotId={riotIdInput}
                  region={region}
                  initialActiveGame={profile?.activeGame}
                  matches={profile?.matches || []}
                  trainingFocus={trainingFocus}
                  onActiveGameDetected={(game) =>
                    setProfile((prev) => (prev ? { ...prev, activeGame: game } : prev))
                  }
                  onSnapshotChange={(snap) => {
                    setLiveMenuSnapshot(snap);
                    setLiveSnapshotFetchedAtMs(Date.now());
                  }}
                  onNotify={pushToast}
                />
              )}

              {activeTab === 'guide' && (
                <GuideView
                  riotId={riotIdInput}
                  region={region}
                  patchVersion={ddragon.version}
                  riotConfigured={statusMeta.riotConfigured}
                  riotKeyStartsWithRgapi={statusMeta.riotKeyStartsWithRgapi}
                  riotKeyLength={statusMeta.riotKeyLength}
                  geminiConfigured={statusMeta.geminiConfigured}
                  archivedMatchesCount={profile?.matches.length || 0}
                  savedProfilesCount={savedProfiles.length}
                  savedProfiles={savedProfiles}
                  onSaveProfile={handleSaveProfile}
                  onSwitchProfile={(prof) => {
                    handleSwitchProfile(prof);
                    setActiveTab('dashboard');
                  }}
                  onNavigate={(tab) => setActiveTab(tab)}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  defaultRiotId={riotIdInput}
                  defaultRegion={region}
                  defaultRole={defaultRole}
                  darkMode={darkMode}
                  autoSyncEnabled={autoSyncEnabled}
                  patchVersion={ddragon.version}
                  riotConfigured={statusMeta.riotConfigured}
                  riotKeyStartsWithRgapi={statusMeta.riotKeyStartsWithRgapi}
                  riotKeyLength={statusMeta.riotKeyLength}
                  geminiConfigured={statusMeta.geminiConfigured}
                  savedProfiles={savedProfiles}
                  onSavePreferences={handleSavePreferences}
                  onSaveProfile={handleSaveProfile}
                  onDeleteProfile={handleDeleteProfile}
                  onSwitchProfile={(prof) => {
                    handleSwitchProfile(prof);
                    setActiveTab('dashboard');
                  }}
                  onRefreshDataDragon={() => loadBootstrap(true)}
                  onOpenOnboarding={() => {
                    setActiveTab('guide');
                    window.setTimeout(() => {
                      document
                        .getElementById('onboarding-partage')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 180);
                  }}
                />
              )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <CommandPaletteModal
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        champions={ddragon?.champions || []}
        matches={profile?.matches || []}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onOpenBuildForChampion={(championName, enemyName) => {
          setBuilderInitialChamp(championName);
          if (enemyName) setBuilderInitialDuoChamp(undefined);
          setActiveTab('builds');
        }}
        onOpenEncyclopediaChampion={(championId) => {
          setEncyclopediaInitialChampId(championId);
          setActiveTab('champions');
        }}
        onOpenMatchPostGame={(match) => {
          setSelectedMatchId(match.matchId);
          setActiveTab('postgame');
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
    </MotionConfig>
  );
}
