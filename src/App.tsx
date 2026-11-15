import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpen,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { BuildOptimizerView } from './components/BuildOptimizerView.tsx';
import { ChampionEncyclopediaView } from './components/ChampionEncyclopediaView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { LiveCoachView } from './components/LiveCoachView.tsx';
import { PostGameView } from './components/PostGameView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { computePlayerTendencies } from './engines/postGameEngine.ts';
import type {
  CareerAiSynthesis,
  DDragonBootstrap,
  MatchRecord,
  PlayerProfileResponse,
  RiotPlatform,
  Role,
  SavedPlayerProfile,
} from './engines/types.ts';

type NavTab = 'dashboard' | 'builds' | 'postgame' | 'live' | 'champions' | 'settings';

const STORAGE_KEY = 'lol_ai_coach_prefs_v1';
const PROFILES_STORAGE_KEY = 'lol_ai_coach_profiles_v1';
const ARCHIVE_STORAGE_KEY = 'lol_ai_coach_archive_v1';
const PROFILE_META_STORAGE_KEY = 'lol_ai_coach_profile_meta_v1';
const CAREER_AI_STORAGE_KEY = 'lol_ai_coach_career_ai_v1';
const MAX_ARCHIVED_MATCHES_PER_ACCOUNT = 45;

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

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'builds', label: 'Builds & Match-ups', icon: Swords },
  { id: 'postgame', label: 'Analyse Post-Game', icon: History },
  { id: 'live', label: 'Coach Temps Réel', icon: Activity },
  { id: 'champions', label: 'Champions', icon: BookOpen },
  { id: 'settings', label: 'Paramètres', icon: Settings },
];

function getAccountArchiveKey(riotId: string, targetRegion: RiotPlatform): string {
  return `${targetRegion}:${(riotId || 'Boulvae#EUW').trim().toLowerCase()}`;
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
      (m.timelineSplits.length > prev.timelineSplits.length || m.participants.length > prev.participants.length) &&
      m.source !== 'Match de référence'
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

  const activeAccountKey = getAccountArchiveKey(riotIdInput, region);
  const [careerSynthesis, setCareerSynthesis] = useState<CareerAiSynthesis | null>(
    () => loadCareerAiMap()[getAccountArchiveKey(initialPrefs.riotId, initialPrefs.region)] || null,
  );

  useEffect(() => {
    setCareerSynthesis(loadCareerAiMap()[activeAccountKey] || null);
  }, [activeAccountKey]);

  // Synchroniser la classe .dark sur <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

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

  const syncPlayer = async (
    riotId: string,
    targetRegion: RiotPlatform,
    force = false,
    matchCount = 15,
    silent = false,
  ) => {
    const trimmed = riotId.trim() || 'Boulvae#EUW';
    const [gameName, tagLine] = trimmed.includes('#')
      ? trimmed.split('#')
      : [trimmed, 'EUW'];

    if (!silent) {
      setProfileLoading(true);
      setProfileError(null);
    }

    const accountKey = getAccountArchiveKey(trimmed, targetRegion);
    try {
      const res = await fetch(
        `/api/riot/player?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(
          tagLine || 'EUW',
        )}&region=${encodeURIComponent(targetRegion)}&count=${matchCount}${force ? '&force=1' : ''}`,
      );
      const data = (await res.json()) as PlayerProfileResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Échec de la synchronisation.');

      const archiveMap = loadArchiveMap();
      const existingArchive = archiveMap[accountKey] || [];
      const mergedMatches = mergeAccountMatches(existingArchive, data.matches || []);
      saveArchiveForAccount(accountKey, mergedMatches);
      saveProfileMetaForAccount(accountKey, data);

      const enrichedProfile: PlayerProfileResponse = {
        ...data,
        matches: mergedMatches,
        tendencies: computePlayerTendencies(mergedMatches),
      };

      setProfile(enrichedProfile);
      setLastSyncedAt(
        new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      );
      if (mergedMatches.length > 0 && !silent) {
        setSelectedMatchId(mergedMatches[0].matchId);
      }
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          riotId: trimmed,
          region: targetRegion,
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
    const cleanRiotId = input.riotId.trim();
    if (!cleanRiotId) return;
    if (input.id) {
      const updated = savedProfiles.map((p) =>
        p.id === input.id ? { ...p, ...input, riotId: cleanRiotId } : p,
      );
      persistProfiles(updated);
    } else {
      const newProf: SavedPlayerProfile = {
        id: `prof-${Date.now()}`,
        label: input.label.trim() || cleanRiotId.split('#')[0],
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
  };

  const handleMergeLocalMatches = (localMatches: MatchRecord[]): number => {
    if (!profile) return 0;
    const beforeCount = profile.matches.length;
    const existingById = new Set(profile.matches.map((m) => m.matchId));
    const newOnes = localMatches.filter((lm) => {
      if (existingById.has(lm.matchId)) return false;
      const nearDuplicate = profile.matches.some(
        (em) =>
          Math.abs(em.gameCreation - lm.gameCreation) < 90_000 &&
          em.player.championName === lm.player.championName,
      );
      return !nearDuplicate;
    });
    if (newOnes.length === 0) return 0;

    const merged = mergeAccountMatches(profile.matches, newOnes);
    saveArchiveForAccount(getAccountArchiveKey(riotIdInput, region), merged);
    setProfile({
      ...profile,
      matches: merged,
      tendencies: computePlayerTendencies(merged),
    });
    if (merged.length > 0) {
      setSelectedMatchId(merged[0].matchId);
    }
    return Math.max(newOnes.length, merged.length - beforeCount);
  };

  const activeNavTitle = NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Tableau de bord';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#0B0E14] dark:text-slate-100">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E131D]">
        <div className="h-16 px-6 flex items-center border-b border-slate-200 dark:border-slate-800">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            LoL AI Coach
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
            <div>
              Patch Data Dragon :{' '}
              <span className="font-mono text-slate-700 dark:text-slate-200">
                {ddragon?.version || '...'}
              </span>
            </div>
            <div>
              Riot API :{' '}
              <span className="text-slate-700 dark:text-slate-200">
                {statusMeta.riotConfigured ? 'Clé détectée' : 'Mode référence + Import'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <span>{darkMode ? 'Mode sombre activé' : 'Mode clair activé'}</span>
            {darkMode ? (
              <Moon className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>

      {/* Drawer Mobile */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-full bg-white dark:bg-[#0E131D] border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-display text-lg font-bold text-slate-900 dark:text-white">
                LoL AI Coach
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-2 text-slate-500"
                aria-label="Fermer le menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      active
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDarkMode((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <span>{darkMode ? 'Mode sombre' : 'Mode clair'}</span>
                {darkMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Zone Principale */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (Contrat 3 zones) */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B0E14]/95 backdrop-blur flex items-center justify-between gap-4">
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
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {activeNavTitle}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Patch {ddragon?.version || '...'} · Données officielles Data Dragon
              </div>
            </div>
          </div>

          <form onSubmit={handleSyncSubmit} className="flex items-center gap-2 shrink-0">
            {savedProfiles.length > 1 && (
              <div className="hidden md:flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                <select
                  value={
                    savedProfiles.find(
                      (p) =>
                        p.riotId.toLowerCase() === riotIdInput.trim().toLowerCase() &&
                        p.region === region,
                    )?.id || ''
                  }
                  onChange={(e) => {
                    const target = savedProfiles.find((p) => p.id === e.target.value);
                    if (target) handleSwitchProfile(target);
                  }}
                  aria-label="Changer de profil Famille / Amis"
                  className="max-w-[140px] px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#121722] text-slate-900 dark:text-white"
                >
                  <option value="" disabled>
                    Profils ({savedProfiles.length})
                  </option>
                  {savedProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.riotId})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <input
              type="text"
              value={riotIdInput}
              onChange={(e) => setRiotIdInput(e.target.value)}
              placeholder="Pseudo#TAG"
              aria-label="Riot ID au format Pseudo#TAG"
              className="w-32 sm:w-44 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#121722] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as RiotPlatform)}
              aria-label="Région Riot"
              className="hidden sm:block px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#121722] text-slate-900 dark:text-white"
            >
              {REGIONS.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={profileLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${profileLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Synchroniser</span>
            </button>
          </form>
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
            <>
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
                  onNavigateToBuilds={(champName) => {
                    setBuilderInitialChamp(champName);
                    setActiveTab('builds');
                  }}
                  onNavigateToLive={() => setActiveTab('live')}
                  onNavigateToSettings={() => setActiveTab('settings')}
                  careerSynthesis={careerSynthesis}
                  geminiConfigured={statusMeta.geminiConfigured}
                  onSaveCareerSynthesis={(syn) => {
                    saveCareerAiForAccount(activeAccountKey, syn);
                    setCareerSynthesis(syn);
                  }}
                />
              )}

              {activeTab === 'builds' && (
                <BuildOptimizerView
                  ddragon={ddragon}
                  tendencies={profile?.tendencies}
                  initialChampionName={builderInitialChamp}
                  initialRole={defaultRole}
                  riotId={riotIdInput}
                  region={region}
                  activeGame={profile?.activeGame}
                  onActiveGameDetected={(game) =>
                    setProfile((prev) => (prev ? { ...prev, activeGame: game } : prev))
                  }
                />
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
                  onSelectMatchId={setSelectedMatchId}
                  onImportMatch={handleImportMatch}
                />
              )}

              {activeTab === 'live' && (
                <LiveCoachView
                  champions={ddragon.champions}
                  runeTrees={ddragon.runeTrees}
                  patchVersion={ddragon.version}
                  riotId={riotIdInput}
                  region={region}
                  initialActiveGame={profile?.activeGame}
                  onActiveGameDetected={(game) =>
                    setProfile((prev) => (prev ? { ...prev, activeGame: game } : prev))
                  }
                />
              )}

              {activeTab === 'champions' && (
                <ChampionEncyclopediaView
                  champions={ddragon.champions}
                  patchVersion={ddragon.version}
                  recentChampionIds={profile?.matches.map((m) => m.player.championName) || []}
                  onUseInBuilder={(champId) => {
                    setBuilderInitialChamp(champId);
                    setActiveTab('builds');
                  }}
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
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
