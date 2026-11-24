import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  FileUp,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Swords,
  Target,
  Timer,
  TrendingUp,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { postCoachJson } from '../engines/aiConfig.ts';
import { parseLiveClientSnapshot } from '../engines/liveCoachEngine.ts';
import {
  getFrenchSpeechVoices,
  speakCoachFeedback,
  stopCoachSpeech,
} from '../engines/voiceMomentEngine.ts';
import type { TrainingFocusReport } from '../engines/trainingGoalsEngine.ts';
import type {
  ChampionDetail,
  ChampionSummary,
  DetectedRunePage,
  ItemData,
  LiveCoachSnapshot,
  LivePlayerEquipmentRow,
  LobbyScoutParticipant,
  MatchRecord,
  PlayerProfileResponse,
  RiotPlatform,
  Role,
  RuneTree,
} from '../engines/types.ts';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import type { ToastItem } from './ToastContainer.tsx';
import { VisualRunePage } from './VisualRunePage.tsx';
import { VoiceMomentCoachPanel } from './VoiceMomentCoachPanel.tsx';
import {
  downloadWindowsBridgeBat,
  extractDetectedRunePage,
  mapQueueToLabelAndMode,
  UNIVERSAL_LIVE_CLIPBOARD_CMD,
} from '../utils/liveBridge.ts';
import {
  computeEffectiveSpellCooldown,
  detectEnemySpellVoiceTrigger,
  detectSelfAbilityOrSpellVoiceTrigger,
  getSummonerSpellById,
  getSummonerSpellIconUrl,
  inferDefaultEnemySpells,
  isKeyEnemySummonerSpell,
  type EnemySpellToastScope,
  type EnemySpellVoiceTarget,
} from '../utils/summonerSpells.ts';
import { resolveChampionDisplay } from '../utils/championDisplay.ts';
import { formatRankedQueue } from '../utils/rankedDisplay.ts';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';
import {
  LiveSummonerSpellsTracker,
  type ActiveSpellCooldownEntry,
} from './LiveSummonerSpellsTracker.tsx';
import { LiveSpellCooldownTimeline } from './LiveSpellCooldownTimeline.tsx';
import { LiveEnemyGameEventsWidget } from './LiveEnemyGameEventsWidget.tsx';
import { LiveCompositionSynergyPanel } from './LiveCompositionSynergyPanel.tsx';
import { LiveCounterItemsPanel } from './LiveCounterItemsPanel.tsx';
import {
  analyzeJungleGankDanger,
  type JungleSighting,
  type MapSightingZone,
} from '../engines/liveJungleGankEngine.ts';
import { LiveJungleGankAlertPanel } from './LiveJungleGankAlertPanel.tsx';
import { LiveLaneMatchupTable } from './LiveLaneMatchupTable.tsx';
import { LivePhaseStartPanel } from './LivePhaseStartPanel.tsx';
import {
  createInitialSkillOrderState,
  reconcileSkillOrderState,
  type AbilityKey,
  type SkillOrderTrackerState,
} from '../engines/liveSkillOrderEngine.ts';

type LiveGameStage = 'start' | 'lane' | 'teamfight' | 'voice' | 'all';

const SKILL_ORDER_STORAGE_KEY = 'lol_ai_coach_live_skill_order_v1';

function loadStoredSkillOrder(): SkillOrderTrackerState | null {
  try {
    const raw = localStorage.getItem(SKILL_ORDER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SkillOrderTrackerState;
  } catch {
    return null;
  }
}

interface LiveCoachViewProps {
  champions: ChampionSummary[];
  items?: ItemData[];
  runeTrees: RuneTree[];
  patchVersion: string;
  riotId: string;
  region: RiotPlatform;
  initialActiveGame?: PlayerProfileResponse['activeGame'];
  matches?: MatchRecord[];
  onActiveGameDetected?: (game: PlayerProfileResponse['activeGame']) => void;
  onSnapshotChange?: (snapshot: LiveCoachSnapshot) => void;
  onSaveLiveSessionMatch?: (snapshot: LiveCoachSnapshot, openPostGame?: boolean) => void;
  onLiveGameEnded?: () => void;
  trainingFocus?: TrainingFocusReport | null;
  onNotify?: (toast: Omit<ToastItem, 'id'>) => void;
}

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const trimmed = riotId.trim();
  if (trimmed.includes('#')) {
    const [gameName, tagLine] = trimmed.split('#');
    return { gameName: gameName || 'Boulvae', tagLine: tagLine || 'EUW' };
  }
  return { gameName: trimmed || 'Boulvae', tagLine: 'EUW' };
}

function stripSpellHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpellCooldownAtLevel(
  cooldownBurn: string | undefined,
  champLevel: number,
  isUltimate: boolean,
  explicitRank?: number | null,
  abilityHaste = 0,
): number | null {
  if (!cooldownBurn) return null;
  const ranks = cooldownBurn
    .split('/')
    .map((v) => Number(v.replace(',', '.').trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ranks.length === 0) return null;

  let idx = 0;
  if (explicitRank && explicitRank > 0) {
    idx = Math.min(explicitRank - 1, ranks.length - 1);
  } else if (isUltimate) {
    idx = champLevel >= 16 ? 2 : champLevel >= 11 ? 1 : 0;
    idx = Math.min(idx, ranks.length - 1);
  }
  const baseCd = ranks[idx];
  const haste = Math.max(0, abilityHaste || 0);
  return Math.max(1, Math.round((baseCd * 100) / (100 + haste)));
}

const LIVE_AUTO_SPEAK_STORAGE_KEY = 'lol_ai_coach_live_auto_speak_v1';
const VOICE_URI_STORAGE_KEY = 'lol_ai_coach_voice_uri_v1';
const SPELL_TOAST_ALERT_STORAGE_KEY = 'lol_ai_coach_spell_toast_alert_v1';
const SPELL_TOAST_SCOPE_STORAGE_KEY = 'lol_ai_coach_spell_toast_scope_v1';
const GANK_TOAST_STORAGE_KEY = 'lol_ai_coach_gank_toast_v1';

function loadLiveAutoSpeak(): boolean {
  try {
    const raw = localStorage.getItem(LIVE_AUTO_SPEAK_STORAGE_KEY);
    if (raw === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

function loadSpellToastAlert(): boolean {
  try {
    const raw = localStorage.getItem(SPELL_TOAST_ALERT_STORAGE_KEY);
    if (raw === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

function loadSpellToastScope(): EnemySpellToastScope {
  try {
    const raw = localStorage.getItem(SPELL_TOAST_SCOPE_STORAGE_KEY);
    if (raw === 'FLASH_ONLY') return 'FLASH_ONLY';
  } catch {
    // ignore
  }
  return 'KEY';
}

function loadGankToastEnabled(): boolean {
  try {
    const raw = localStorage.getItem(GANK_TOAST_STORAGE_KEY);
    if (raw === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

function loadPreferredVoiceUri(): string | undefined {
  try {
    return localStorage.getItem(VOICE_URI_STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function buildDeterministicLiveAdvice(
  snap: LiveCoachSnapshot,
  champions: ChampionSummary[],
): {
  immediateCall: string;
  recallAdvice: string;
  dangerWatch: string;
} {
  const highAlert = snap.alerts.find((a) => a.priority === 'Haute') || snap.alerts[0];
  const topThreat =
    snap.enemyPlayers?.find((p) => p.dangerLevel === 'Élevé') || snap.enemyThreats?.[0];
  const topThreatName = topThreat
    ? resolveChampionDisplay(champions, topThreat.championName).displayName
    : '';
  const dragonSoon = snap.dragonTimerSec != null && snap.dragonTimerSec <= 60;
  const baronSoon = snap.baronTimerSec != null && snap.baronTimerSec <= 75 && snap.gameTimeSec >= 1140;

  const immediateCall = highAlert
    ? `${highAlert.message} ${highAlert.action}`
    : dragonSoon
      ? 'Préparez la vision autour du Dragon et poussez la vague avant de grouper.'
      : baronSoon
        ? 'Rivière nord prioritaire : nettoyez la vision autour du Baron avant de vous avancer.'
        : snap.csPaceDelta < -0.5
          ? 'Sécurisez les deux prochaines vagues pour rattraper votre retard de CS.'
          : 'Poussez la vague sous vision puis décalez avec votre jungler.';

  const recallAdvice =
    snap.currentGold >= 1300
      ? `Vous avez ${snap.currentGold} po en poche : poussez la vague et rappelez maintenant pour convertir votre avance en stats.`
      : `Or actuel (${snap.currentGold} po) : attendez un palier d’achat avant de reset sans perdre d’expérience.`;

  const dangerWatch = topThreat
    ? `Surveillez en priorité ${topThreatName} (${topThreat.kills} kills) et gardez vos contrôles pour casser son engage.`
    : 'Ne facecheckez aucun buisson de rivière sans deux alliés à portée.';

  return { immediateCall, recallAdvice, dangerWatch };
}

function buildLiveSpokenSummary(
  advice: { immediateCall?: string; recallAdvice?: string; dangerWatch?: string },
  snap: LiveCoachSnapshot,
  champions: ChampionSummary[],
): string {
  const mins = Math.max(1, Math.round(snap.gameTimeSec / 60));
  const champLabel = resolveChampionDisplay(champions, snap.championName).displayName;
  const parts: string[] = [`Synthèse ${champLabel} à ${mins} minutes.`];
  if (advice.immediateCall) parts.push(advice.immediateCall.trim());
  if (advice.recallAdvice) parts.push(advice.recallAdvice.trim());
  if (advice.dangerWatch) parts.push(`Vigilance : ${advice.dangerWatch.trim()}`);
  return parts.join(' ');
}

export function LiveCoachView({
  champions,
  items = [],
  runeTrees,
  patchVersion,
  riotId,
  region,
  initialActiveGame,
  matches = [],
  onActiveGameDetected,
  onSnapshotChange,
  onSaveLiveSessionMatch,
  onLiveGameEnded,
  trainingFocus,
  onNotify,
}: LiveCoachViewProps) {
  const [snapshot, setSnapshot] = useState<LiveCoachSnapshot | null>(null);
  const [snapshotReceivedAtMs, setSnapshotReceivedAtMs] = useState<number>(() => Date.now());
  const [gameEventNowMs, setGameEventNowMs] = useState<number>(() => Date.now());
  const [dismissedGameEventIds, setDismissedGameEventIds] = useState<Set<string>>(() => new Set());
  const onSnapshotChangeRef = useRef(onSnapshotChange);
  onSnapshotChangeRef.current = onSnapshotChange;

  useEffect(() => {
    if (snapshot) {
      setSnapshotReceivedAtMs(Date.now());
      setGameEventNowMs(Date.now());
      onSnapshotChangeRef.current?.(snapshot);
    }
  }, [snapshot]);
  const [bridgePollActive, setBridgePollActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preferredRole, setPreferredRole] = useState<Role>('SUPPORT');

  const [spectatorGame, setSpectatorGame] = useState<PlayerProfileResponse['activeGame'] | null>(
    initialActiveGame || null,
  );
  const [spectatorLoading, setSpectatorLoading] = useState(false);
  const [spectatorError, setSpectatorError] = useState<string | null>(null);
  const [spectatorCheckedAt, setSpectatorCheckedAt] = useState<string | null>(null);
  const [showSpectatorPanel, setShowSpectatorPanel] = useState(false);

  // Scouting de lobby style Porofessor (rangs & maîtrises)
  const [lobbyScoutMap, setLobbyScoutMap] = useState<Record<string, LobbyScoutParticipant>>({});
  const [scoutingLobby, setScoutingLobby] = useState(false);
  const [scoutError, setScoutError] = useState<string | null>(null);

  // Chronomètre Sorts d'Invocateur (10 joueurs : Flash 300s, TP 360s, Ignite 180s, etc. + Bottes de lucidité / Savoir cosmique / ARAM)
  const [spellCooldowns, setSpellCooldowns] = useState<Record<string, ActiveSpellCooldownEntry>>({});
  const [spellTickNow, setSpellTickNow] = useState<number>(() => Date.now());
  const [voiceAlertOnReady, setVoiceAlertOnReady] = useState<boolean>(true);
  const [toastAlertOnReady, setToastAlertOnReady] = useState<boolean>(() => loadSpellToastAlert());
  const [toastAlertScope, setToastAlertScope] = useState<EnemySpellToastScope>(() =>
    loadSpellToastScope(),
  );
  const [gankToastEnabled, setGankToastEnabled] = useState<boolean>(() => loadGankToastEnabled());
  const [jungleSighting, setJungleSighting] = useState<JungleSighting>({
    zone: 'UNKNOWN',
    spottedAtGameSec: 0,
  });
  const lastGankToastRef = useRef<{ key: string; atMs: number }>({ key: '', atMs: 0 });
  const [enemySpellOverrides, setEnemySpellOverrides] = useState<
    Record<string, { spell1Id?: number; spell2Id?: number }>
  >({});
  const [copiedTimers, setCopiedTimers] = useState(false);

  const spellCooldownsRef = useRef(spellCooldowns);
  spellCooldownsRef.current = spellCooldowns;
  const gameTimeSecRef = useRef<number>(0);
  gameTimeSecRef.current = snapshot?.gameTimeSec ?? 0;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const [manualJson, setManualJson] = useState('');
  const [showConnector, setShowConnector] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<string | null>(null);
  const [clientRunePage, setClientRunePage] = useState<DetectedRunePage | null>(null);
  const [copiedRelay, setCopiedRelay] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<{
    immediateCall?: string;
    recallAdvice?: string;
    dangerWatch?: string;
    sourceLabel?: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const [autoSpeakSummary, setAutoSpeakSummary] = useState<boolean>(() => loadLiveAutoSpeak());
  const [isSummarySpeaking, setIsSummarySpeaking] = useState(false);
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );

  // Kits de compétences (Passif, A, Z, E, R) des champions présents dans la partie
  const [championKits, setChampionKits] = useState<Record<string, ChampionDetail>>({});
  const [selectedKitChampName, setSelectedKitChampName] = useState<string>('');
  const [showAllAbilitiesPanel, setShowAllAbilitiesPanel] = useState<boolean>(true);
  const [activeStage, setActiveStage] = useState<LiveGameStage>('all');
  const [autoFollowStage, setAutoFollowStage] = useState<boolean>(false);
  const [skillTracker, setSkillTracker] = useState<SkillOrderTrackerState | null>(() =>
    loadStoredSkillOrder(),
  );
  const fetchedKitIdsRef = useRef<Set<string>>(new Set());
  const abilitiesSectionRef = useRef<HTMLElement | null>(null);

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    try {
      localStorage.setItem(LIVE_AUTO_SPEAK_STORAGE_KEY, String(autoSpeakSummary));
    } catch {
      // ignore
    }
  }, [autoSpeakSummary]);

  useEffect(() => {
    return () => {
      stopCoachSpeech();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SPELL_TOAST_ALERT_STORAGE_KEY, String(toastAlertOnReady));
      localStorage.setItem(SPELL_TOAST_SCOPE_STORAGE_KEY, toastAlertScope);
    } catch {
      // ignore
    }
  }, [toastAlertOnReady, toastAlertScope]);

  // Tick 1s pour le compte à rebours dynamique des sorts ennemis détectés via gameEvent
  const hasEnemyGameEvents = (snapshot?.gameEvents || []).some(
    (ev) => ev.casterTeam === 'ENEMY' && !dismissedGameEventIds.has(ev.id),
  );
  useEffect(() => {
    if (!hasEnemyGameEvents) return;
    setGameEventNowMs(Date.now());
    const id = window.setInterval(() => {
      setGameEventNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasEnemyGameEvents]);

  // Tick 1s pour les chronomètres des sorts d'invocateur (met à jour spellTickNow, alerte vocale et toast visuel)
  const activeSpellCooldownCount = Object.keys(spellCooldowns).length;
  useEffect(() => {
    if (activeSpellCooldownCount === 0) return;
    setSpellTickNow(Date.now());
    const id = window.setInterval(() => {
      const now = Date.now();
      setSpellTickNow(now);

      const currentMap = spellCooldownsRef.current;
      const next: Record<string, ActiveSpellCooldownEntry> = {};
      const expiredEntries: ActiveSpellCooldownEntry[] = [];

      for (const [k, entry] of Object.entries(currentMap)) {
        if (entry.expiresAt > now) {
          next[k] = entry;
        } else {
          expiredEntries.push(entry);
        }
      }

      if (expiredEntries.length === 0) return;

      setSpellCooldowns(next);

      if (voiceAlertOnReady && speechSupported) {
        const readyMessages = expiredEntries.map(
          (entry) => `${entry.spellNameFr} de ${entry.championDisplayName} est revenu`,
        );
        const preferredVoice = loadPreferredVoiceUri() || getFrenchSpeechVoices()[0]?.voiceURI;
        speakCoachFeedback(`${readyMessages.join('. ')}.`, {
          rate: 1.06,
          voiceURI: preferredVoice,
        });
      }

      if (toastAlertOnReady && onNotifyRef.current) {
        const keyEnemyReady = expiredEntries.filter(
          (entry) =>
            entry.team === 'ENEMY' && isKeyEnemySummonerSpell(entry.spellId, toastAlertScope),
        );
        for (const entry of keyEnemyReady) {
          onNotifyRef.current({
            variant: 'warning',
            title: `${entry.spellNameFr} ennemi revenu · ${entry.championDisplayName}`,
            description: `Délai de ${formatClock(entry.totalSec)} écoulé (${formatClock(gameTimeSecRef.current)} en jeu) : ${entry.championDisplayName} récupère ${entry.spellNameFr}.`,
            durationMs: 6000,
          });
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeSpellCooldownCount, voiceAlertOnReady, toastAlertOnReady, toastAlertScope, speechSupported]);

  const handleToggleEnemySpell = (
    championKey: string,
    championDisplayName: string,
    spellId: number,
    spellNameFr: string,
    chatCode: string,
    durationSec: number,
    forceStart = false,
    team: 'ALLY' | 'ENEMY' = 'ENEMY',
    spellIconUrl?: string,
  ) => {
    const key = `${championKey}:${spellId}`;
    const now = Date.now();
    setSpellTickNow(now);
    setSpellCooldowns((prev) => {
      const next = { ...prev };
      if (!forceStart && next[key] && next[key].expiresAt > now) {
        delete next[key];
      } else {
        next[key] = {
          expiresAt: now + durationSec * 1000,
          totalSec: durationSec,
          championKey,
          championDisplayName,
          spellId,
          spellNameFr,
          chatCode,
          team,
          spellIconUrl,
        };
      }
      return next;
    });
  };

  const handleCancelSpellCooldown = (entryKey: string) => {
    setSpellCooldowns((prev) => {
      if (!(entryKey in prev)) return prev;
      const next = { ...prev };
      delete next[entryKey];
      return next;
    });
  };

  const handleScoutLobby = async () => {
    if (!spectatorGame?.participants || spectatorGame.participants.length === 0) return;
    setScoutingLobby(true);
    setScoutError(null);
    setShowSpectatorPanel(true);
    try {
      const res = await fetch('/api/riot/lobby-scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participants: spectatorGame.participants,
          region,
        }),
      });
      const json = (await res.json()) as {
        participants?: LobbyScoutParticipant[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Scouting impossible.');
      const nextMap: Record<string, LobbyScoutParticipant> = {};
      for (const entry of json.participants || []) {
        nextMap[`${entry.teamId}:${entry.championId}:${entry.riotId}`] = entry;
      }
      setLobbyScoutMap(nextMap);
    } catch (err) {
      setScoutError(err instanceof Error ? err.message : 'Erreur de scouting.');
    } finally {
      setScoutingLobby(false);
    }
  };

  useEffect(() => {
    if (initialActiveGame) {
      setSpectatorGame(initialActiveGame);
    }
  }, [initialActiveGame]);

  const fetchLatest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/live/latest');
      if (res.ok) {
        const data = (await res.json()) as LiveCoachSnapshot;
        setSnapshot(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatest();
  }, []);

  // Détection automatique de l'ordre des compétences (1 -> 18) et suivi auto de l'étape de partie
  useEffect(() => {
    if (!snapshot) return;
    setSkillTracker((prev) => {
      const next = reconcileSkillOrderState(
        prev,
        snapshot.championName,
        snapshot.activeAbilityLevels,
        snapshot.gameTimeSec,
      );
      try {
        localStorage.setItem(SKILL_ORDER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    if (autoFollowStage && activeStage !== 'all' && activeStage !== 'voice') {
      const recommended: LiveGameStage =
        snapshot.gameTimeSec < 180
          ? 'start'
          : snapshot.gameTimeSec < 840
            ? 'lane'
            : 'teamfight';
      if (recommended !== activeStage) {
        setActiveStage(recommended);
      }
    }
  }, [
    snapshot?.championName,
    snapshot?.gameTimeSec,
    snapshot?.activeAbilityLevels?.Q,
    snapshot?.activeAbilityLevels?.W,
    snapshot?.activeAbilityLevels?.E,
    snapshot?.activeAbilityLevels?.R,
    autoFollowStage,
  ]);

  const handleSimulateSkillPoint = (key: AbilityKey) => {
    if (!snapshot) return;
    setSkillTracker((prev) => {
      const base =
        prev && prev.championName.toLowerCase() === snapshot.championName.toLowerCase()
          ? prev
          : createInitialSkillOrderState(snapshot.championName, snapshot.activeAbilityLevels, snapshot.gameTimeSec);
      if (base.sequence.length >= 18) return base;
      const nextLevels = { ...base.lastLevels, [key]: base.lastLevels[key] + 1 };
      const next: SkillOrderTrackerState = {
        championName: base.championName,
        lastGameTimeSec: snapshot.gameTimeSec,
        lastLevels: nextLevels,
        sequence: [
          ...base.sequence,
          {
            step: base.sequence.length + 1,
            key,
            newRank: nextLevels[key],
            gameTimeSec: snapshot.gameTimeSec,
            inferred: false,
          },
        ],
      };
      try {
        localStorage.setItem(SKILL_ORDER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleResetSkillOrder = () => {
    if (!snapshot) return;
    const fresh = createInitialSkillOrderState(snapshot.championName, null, snapshot.gameTimeSec);
    setSkillTracker(fresh);
    try {
      localStorage.setItem(SKILL_ORDER_STORAGE_KEY, JSON.stringify(fresh));
    } catch {
      // ignore
    }
  };

  // Précharge automatiquement les compétences (Passif, A/Z/E/R) des champions en partie depuis Data Dragon
  useEffect(() => {
    if (!snapshot) return;
    const rawNames = new Set<string>();
    if (snapshot.championName) rawNames.add(snapshot.championName);
    for (const p of snapshot.allyPlayers || []) {
      if (p.championName) rawNames.add(p.championName);
    }
    for (const e of snapshot.enemyPlayers || []) {
      if (e.championName) rawNames.add(e.championName);
    }

    const candidates = Array.from(rawNames);
    if (candidates.length === 0) return;

    // Sélection par défaut : premier adversaire (pour connaître ses sorts/délais) ou votre champion en Entraînement solo
    setSelectedKitChampName((prev) => {
      if (prev && candidates.includes(prev)) return prev;
      return snapshot.enemyPlayers?.[0]?.championName || snapshot.championName || candidates[0];
    });

    let active = true;
    for (const rawName of candidates) {
      const ddId = resolveChampionDisplay(champions, rawName).champion?.id || rawName;
      if (!ddId || fetchedKitIdsRef.current.has(ddId)) continue;
      fetchedKitIdsRef.current.add(ddId);
      fetch(`/api/ddragon/champion/${encodeURIComponent(ddId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((detail: ChampionDetail | null) => {
          if (active && detail?.id) {
            setChampionKits((prev) => ({ ...prev, [ddId]: detail }));
          }
        })
        .catch(() => {
          fetchedKitIdsRef.current.delete(ddId);
        });
    }

    return () => {
      active = false;
    };
  }, [snapshot, champions]);

  // Détection automatique continue du pont Windows (127.0.0.1:38421) hors iframe,
  // ou rafraîchissement /api/live/latest toutes les 4s si l'utilisateur est dans l'aperçu iframe
  const lastIframeReceivedAtRef = useRef<string | null>(null);
  useEffect(() => {
    if (isInsideIframe) {
      const id = window.setInterval(() => {
        fetch('/api/live/latest')
          .then((res) => (res.ok ? res.json() : null))
          .then((data: LiveCoachSnapshot | null) => {
            if (!data) return;
            const hasLiveOrEvents =
              data.source === 'Live Client Data (127.0.0.1:2999)' ||
              (data.gameEvents && data.gameEvents.length > 0);
            if (hasLiveOrEvents && data.receivedAt !== lastIframeReceivedAtRef.current) {
              lastIframeReceivedAtRef.current = data.receivedAt;
              setSnapshot(data);
            }
          })
          .catch(() => {});
      }, 4000);
      return () => window.clearInterval(id);
    }

    if (bridgePollActive) return;

    let active = true;
    const probeBridge = () => {
      fetch('http://127.0.0.1:38421/health')
        .then((res) => {
          if (active && res.ok) {
            setBridgePollActive(true);
          }
        })
        .catch(() => {
          // Pont non lancé pour le moment : nouvelle tentative silencieuse dans 4s
        });
    };

    probeBridge();
    const probeId = window.setInterval(probeBridge, 4000);
    return () => {
      active = false;
      window.clearInterval(probeId);
    };
  }, [isInsideIframe, bridgePollActive]);

  const handleCheckSpectatorGame = async () => {
    setSpectatorLoading(true);
    setSpectatorError(null);
    try {
      const { gameName, tagLine } = parseRiotId(riotId);
      const res = await fetch(
        `/api/riot/active-game?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(
          tagLine,
        )}&region=${encodeURIComponent(region)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Impossible de vérifier Spectator-V5.');
      setSpectatorGame(data);
      setSpectatorCheckedAt(new Date().toLocaleTimeString('fr-FR'));
      onActiveGameDetected?.(data);
    } catch (err) {
      setSpectatorError(err instanceof Error ? err.message : 'Erreur Spectator-V5.');
    } finally {
      setSpectatorLoading(false);
    }
  };

  // Interroge automatiquement le pont local Windows (http://127.0.0.1:38421/health + /live)
  // ou en secours https://127.0.0.1:2999/liveclientdata/allgamedata
  const pollLocalBridge = async () => {
    try {
      let raw: any = null;
      let bridgeReachable = false;

      try {
        const healthRes = await fetch('http://127.0.0.1:38421/health');
        if (healthRes.ok) {
          bridgeReachable = true;
          const bridgeRes = await fetch('http://127.0.0.1:38421/live');
          if (bridgeRes.ok) {
            const candidate = await bridgeRes.json();
            if (candidate && !candidate.errorCode && (candidate.allPlayers || candidate.activePlayer)) {
              raw = candidate;
            }
          } else if (bridgeRes.status === 503) {
            // Vérifie si une page de runes client est déjà active en Champ Select ou Salon
            try {
              const stateRes = await fetch('http://127.0.0.1:38421/state');
              if (stateRes.ok) {
                const stateJson = await stateRes.json();
                const detected = extractDetectedRunePage(stateJson);
                if (detected) setClientRunePage(detected);
                if (
                  stateJson?.liveGame &&
                  !stateJson.liveGame.errorCode &&
                  (stateJson.liveGame.allPlayers || stateJson.liveGame.activePlayer)
                ) {
                  raw = stateJson.liveGame;
                }
              }
            } catch {
              // ignore
            }
            if (!raw) {
              onLiveGameEnded?.();
              setBridgeStatus(
                'Pont Windows connecté (port 38421) ! En attente que vous soyez chargé sur la carte (après l’écran de chargement de la partie ou de l’Outil d’entraînement)...',
              );
              return;
            }
          }
        }
      } catch {
        // Repli direct si le navigateur autorise 127.0.0.1:2999
        try {
          const directRes = await fetch('https://127.0.0.1:2999/liveclientdata/allgamedata');
          if (directRes.ok) {
            const candidate = await directRes.json();
            if (candidate && !candidate.errorCode && (candidate.allPlayers || candidate.activePlayer)) {
              bridgeReachable = true;
              raw = candidate;
            }
          }
        } catch {
          // ignore
        }
      }

      if (!raw || raw.error || raw.errorCode) {
        // En local (localhost:3000), le pont v3.4 pousse aussi directement sur /api/live/ingest
        if (!bridgeReachable) {
          try {
            const serverRes = await fetch('/api/live/latest');
            if (serverRes.ok) {
              const serverSnap = (await serverRes.json()) as LiveCoachSnapshot;
              if (serverSnap?.source === 'Live Client Data (127.0.0.1:2999)') {
                setSnapshot(serverSnap);
                const disp = resolveChampionDisplay(champions, serverSnap.championName).displayName;
                setBridgeStatus(
                  `Synchronisé via serveur local (${disp} · ${formatClock(serverSnap.gameTimeSec)})`,
                );
                return;
              }
            }
          } catch {
            // ignore
          }
        }

        if (isInsideIframe && !bridgeReachable) {
          setShowConnector(true);
        }
        setBridgeStatus(
          bridgeReachable
            ? 'Pont connecté, en attente que la partie soit chargée sur la carte (127.0.0.1:2999).'
            : isInsideIframe
              ? 'Aperçu Google AI Studio (iframe) : Chrome bloque la connexion automatique vers 127.0.0.1:38421. Cliquez sur « Ouvrir dans un onglet dédié » pour la détection auto, ou collez la commande PowerShell (Ctrl+V).'
              : 'Pont local 127.0.0.1:38421 non joignable. Vérifiez que lol-coach-bridge.bat v3.4 est lancé, acceptez la permission Chrome « Réseau local » si affichée, ou utilisez le Ctrl+V ci-dessous.',
        );
        return;
      }

      const parsed = parseLiveClientSnapshot(
        raw,
        'Live Client Data (127.0.0.1:2999)',
        preferredRole,
      );
      setSnapshot(parsed);
      const parsedDisplayName = resolveChampionDisplay(champions, parsed.championName).displayName;
      const modeSuffix =
        parsed.gameMode?.toUpperCase() === 'PRACTICETOOL' ? ' · Outil d’entraînement' : '';
      setBridgeStatus(
        `Synchronisé en direct (${parsedDisplayName} · ${formatClock(parsed.gameTimeSec)}${modeSuffix})`,
      );

      await fetch('/api/live/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allgamedata: raw, role: preferredRole }),
      }).catch(() => {});
    } catch {
      if (isInsideIframe) {
        setShowConnector(true);
      }
      setBridgeStatus(
        isInsideIframe
          ? 'Aperçu Google AI Studio (iframe) : Chrome bloque l’accès vers 127.0.0.1. Cliquez sur « Ouvrir dans un onglet dédié » pour l’auto-détection ou utilisez Ctrl+V.'
          : 'Pont local inaccessible depuis le navigateur. Vérifiez que lol-coach-bridge.bat v3.4 est ouvert ou utilisez Ctrl+V ci-dessous.',
      );
    }
  };

  useEffect(() => {
    if (!bridgePollActive) return;
    pollLocalBridge();
    const id = window.setInterval(pollLocalBridge, 3000);
    return () => window.clearInterval(id);
  }, [bridgePollActive, preferredRole]);

  const handleDownloadBridge = () => {
    downloadWindowsBridgeBat();
  };

  const getChampDisplay = (championName: string) =>
    resolveChampionDisplay(champions, championName);

  const getChampionByNumericId = (championId: number) =>
    champions.find((c) => Number(c.key) === championId);

  const getItemIcon = (itemId: number) =>
    itemId > 0 ? `https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/item/${itemId}.png` : undefined;

  const handleAdvanceSimulation = async () => {
    if (!snapshot) return;
    setIngestError(null);
    const nextTime = snapshot.gameTimeSec + 180;
    const allyRows = snapshot.allyPlayers || [];
    const enemyRows = snapshot.enemyPlayers || [];

    const simulatedPayload = {
      simulation: true,
      role: preferredRole,
      allgamedata: {
        activePlayer: {
          championName: snapshot.championName,
          level: Math.min(18, snapshot.level + 1),
          currentGold: snapshot.currentGold + 680,
          abilities: snapshot.activeAbilityLevels
            ? {
                Q: { abilityLevel: snapshot.activeAbilityLevels.Q },
                W: { abilityLevel: snapshot.activeAbilityLevels.W },
                E: { abilityLevel: snapshot.activeAbilityLevels.E },
                R: { abilityLevel: snapshot.activeAbilityLevels.R },
              }
            : undefined,
          championStats: snapshot.activeStats
            ? {
                ...snapshot.activeStats,
                maxHealth: snapshot.activeStats.maxHealth + 95,
                attackDamage: snapshot.activeStats.attackDamage + 4,
                armor: snapshot.activeStats.armor + 5,
              }
            : undefined,
          fullRunes: snapshot.fullRunesSummary
            ? {
                keystone: snapshot.fullRunesSummary.keystoneId
                  ? {
                      id: snapshot.fullRunesSummary.keystoneId,
                      displayName: snapshot.fullRunesSummary.keystoneName || '',
                    }
                  : undefined,
                primaryRuneTree: snapshot.fullRunesSummary.primaryTreeId
                  ? { id: snapshot.fullRunesSummary.primaryTreeId, displayName: '' }
                  : undefined,
                secondaryRuneTree: snapshot.fullRunesSummary.secondaryTreeId
                  ? { id: snapshot.fullRunesSummary.secondaryTreeId, displayName: '' }
                  : undefined,
                generalRunes: snapshot.fullRunesSummary.selectedRuneIds.map((id) => ({
                  id,
                  displayName: String(id),
                })),
                statRunes: snapshot.fullRunesSummary.statRuneIds.map((id) => ({
                  id,
                  rawDescription: '',
                })),
              }
            : undefined,
        },
        allPlayers: [
          ...allyRows.map((p, idx) => {
            const s1 = getSummonerSpellById(p.spell1Id ?? 4);
            const s2 = getSummonerSpellById(p.spell2Id ?? 14);
            return {
              championName: p.championName,
              riotId: p.riotId,
              team: 'ORDER' as const,
              position: p.position,
              level: Math.min(18, p.level + (idx === 0 ? 1 : 0)),
              scores: {
                kills: p.kills + (p.championName === snapshot.championName ? 1 : 0),
                deaths: p.deaths,
                assists: p.assists + 1,
                creepScore:
                  p.championName === snapshot.championName
                    ? p.cs + 14
                    : Math.round((nextTime / 60) * 6.5),
              },
              summonerSpells: {
                summonerSpellOne: { displayName: s1.nameFr },
                summonerSpellTwo: { displayName: s2.nameFr },
              },
              items: p.items.map((it) => ({
                itemID: it.itemId,
                displayName: it.displayName,
                price: it.price,
              })),
            };
          }),
          ...enemyRows.map((e) => {
            const [def1, def2] = inferDefaultEnemySpells(e.position);
            const s1 = getSummonerSpellById(e.spell1Id ?? def1);
            const s2 = getSummonerSpellById(e.spell2Id ?? def2);
            return {
              championName: e.championName,
              riotId: e.riotId,
              team: 'CHAOS' as const,
              position: e.position,
              level: Math.min(18, e.level + 1),
              scores: {
                kills: e.kills + (e.dangerLevel === 'Élevé' ? 1 : 0),
                deaths: e.deaths,
                assists: e.assists + 1,
                creepScore: e.cs + 18,
              },
              summonerSpells: {
                summonerSpellOne: { displayName: s1.nameFr },
                summonerSpellTwo: { displayName: s2.nameFr },
              },
              items: e.items.map((it) => ({
                itemID: it.itemId,
                displayName: it.displayName,
                price: it.price,
              })),
            };
          }),
        ],
        events: {
          Events: [{ EventID: 1, EventName: 'GameStart', EventTime: 0 }],
        },
        gameData: {
          gameMode: 'CLASSIC',
          gameTime: nextTime,
        },
      },
    };

    const res = await fetch('/api/live/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(simulatedPayload),
    });
    if (res.ok) {
      setSnapshot(await res.json());
      setAiAdvice(null);
    }
  };

  const ingestRawText = async (rawText: string) => {
    setIngestError(null);
    setIngestSuccess(null);
    try {
      const parsed = JSON.parse(rawText);
      const detectedPage = extractDetectedRunePage(parsed);
      if (detectedPage) {
        setClientRunePage(detectedPage);
      }
      const rawGameData = parsed.liveGame || parsed.allgamedata || parsed;
      if (!rawGameData?.allPlayers && !rawGameData?.activePlayer) {
        if (detectedPage) {
          setManualJson('');
          setShowConnector(false);
          setIngestSuccess(
            `Page de runes « ${detectedPage.pageName || 'Client LoL'} » chargée dans la grille ci-dessous (en attente de partie sur 127.0.0.1:2999).`,
          );
          return;
        }
      }
      const res = await fetch('/api/live/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allgamedata: rawGameData, role: preferredRole }),
      });
      const data = (await res.json()) as LiveCoachSnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error || 'JSON invalide');
      setSnapshot(data);
      setManualJson('');
      setShowConnector(false);
      const ingestedChampName = resolveChampionDisplay(champions, data.championName).displayName;
      setIngestSuccess(
        `Partie chargée en direct : ${ingestedChampName} (${formatClock(data.gameTimeSec)}) · Équipements des 10 joueurs & runes mis à jour.`,
      );
      setAiAdvice(null);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Format JSON Live Client Data invalide.');
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setIngestError('Le presse-papiers est vide.');
        return;
      }
      await ingestRawText(text);
    } catch {
      setIngestError(
        'Le bouton presse-papiers est bloqué par la sécurité iframe : cliquez simplement dans la zone texte ci-dessous et faites Ctrl+V (analyse immédiate).',
      );
    }
  };

  const handleTextareaPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && pasted.trim().startsWith('{')) {
      e.preventDefault();
      setManualJson(pasted);
      await ingestRawText(pasted);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await ingestRawText(text);
  };

  const speakLiveAdviceSummary = (advice: {
    immediateCall?: string;
    recallAdvice?: string;
    dangerWatch?: string;
  }) => {
    if (!snapshot || !speechSupported) return;
    const summaryText = buildLiveSpokenSummary(advice, snapshot, champions);
    const preferredVoice = loadPreferredVoiceUri() || getFrenchSpeechVoices()[0]?.voiceURI;
    speakCoachFeedback(summaryText, {
      rate: 1.05,
      voiceURI: preferredVoice,
      onStart: () => setIsSummarySpeaking(true),
      onEnd: () => setIsSummarySpeaking(false),
    });
  };

  const handleAskAiLive = async () => {
    if (!snapshot) return;
    setAiLoading(true);
    setAiError(null);
    stopCoachSpeech();
    setIsSummarySpeaking(false);
    const selfDisplay = resolveChampionDisplay(champions, snapshot.championName).displayName;

    try {
      const data = await postCoachJson<{
        immediateCall: string;
        recallAdvice: string;
        dangerWatch: string;
      }>('/api/coach/live-advice', { snapshot });
      const enriched = { ...data, sourceLabel: 'Analyse IA temps réel' };
      setAiAdvice(enriched);
      if (autoSpeakSummary && speechSupported) {
        speakLiveAdviceSummary(enriched);
      }
      onNotify?.({
        variant: 'info',
        title: `Analyse live prête · ${selfDisplay}`,
        description: autoSpeakSummary && speechSupported
          ? 'Synthèse vocale des points clés en cours de lecture.'
          : data.immediateCall,
      });
    } catch (err) {
      // Fallback déterministe immédiat pour ne jamais bloquer le coaching ou la synthèse vocale en partie
      const fallback = {
        ...buildDeterministicLiveAdvice(snapshot, champions),
        sourceLabel: 'Synthèse tactique locale (sans IA externe)',
      };
      setAiAdvice(fallback);
      setAiError(
        err instanceof Error
          ? `${err.message} — Bascule automatique sur l’analyse tactique locale.`
          : 'IA distante indisponible — Analyse tactique locale générée.',
      );
      if (autoSpeakSummary && speechSupported) {
        speakLiveAdviceSummary(fallback);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const spokenSummaryPreview = useMemo(() => {
    if (!snapshot || !aiAdvice) return '';
    return buildLiveSpokenSummary(aiAdvice, snapshot, champions);
  }, [snapshot, aiAdvice, champions]);

  // Commande universelle compatible PowerShell 7 (pwsh) ET PowerShell 5.1 (Windows 10/11)
  const clipboardCommand = UNIVERSAL_LIVE_CLIPBOARD_CMD;

  const handleCopyRelay = async () => {
    try {
      await navigator.clipboard.writeText(clipboardCommand);
      setCopiedRelay(true);
      window.setTimeout(() => setCopiedRelay(false), 2000);
    } catch {
      setIngestError('Sélectionnez la commande et copiez avec Ctrl+C.');
    }
  };

  const allyPlayers: LivePlayerEquipmentRow[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.allyPlayers && snapshot.allyPlayers.length > 0
      ? snapshot.allyPlayers
      : snapshot.rawSummary.allyTeam.map((name) => ({
          championName: name,
          riotId: name,
          team: 'ALLY',
          position: '-',
          level: snapshot.level,
          kills: 0,
          deaths: 0,
          assists: 0,
          cs: 0,
          isDead: false,
          items: [],
          dangerLevel: 'Normal',
        }));
  }, [snapshot]);

  const enemyPlayers: LivePlayerEquipmentRow[] = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.enemyPlayers && snapshot.enemyPlayers.length > 0
      ? snapshot.enemyPlayers
      : snapshot.enemyThreats.map((e) => ({
          championName: e.championName,
          riotId: e.championName,
          team: 'ENEMY',
          position: '-',
          level: e.level,
          kills: e.kills,
          deaths: 0,
          assists: 0,
          cs: e.cs,
          isDead: false,
          items: [],
          dangerLevel: e.dangerLevel,
        }));
  }, [snapshot]);

  const gankAnalysis = useMemo(() => {
    if (!snapshot) return null;
    return analyzeJungleGankDanger({
      enemyPlayers,
      spectatorParticipants: spectatorGame?.participants,
      selfChampionName: snapshot.championName,
      role: preferredRole,
      champions,
      gameTimeSec: snapshot.gameTimeSec,
      gameMode: snapshot.gameMode,
      dragonTimerSec: snapshot.dragonTimerSec,
      baronTimerSec: snapshot.baronTimerSec,
      sighting: jungleSighting,
    });
  }, [
    snapshot,
    enemyPlayers,
    spectatorGame?.participants,
    preferredRole,
    champions,
    jungleSighting,
  ]);

  const activeSpellCooldownKeys = useMemo(
    () =>
      new Set(
        Object.entries(spellCooldowns)
          .filter(([, e]) => e.expiresAt > spellTickNow)
          .map(([k]) => k),
      ),
    [spellCooldowns, spellTickNow],
  );

  useEffect(() => {
    try {
      localStorage.setItem(GANK_TOAST_STORAGE_KEY, String(gankToastEnabled));
    } catch {
      // ignore
    }
  }, [gankToastEnabled]);

  useEffect(() => {
    if (!gankToastEnabled || !gankAnalysis || !gankAnalysis.hasEnemyJungler || gankAnalysis.isAram) {
      return;
    }
    if (gankAnalysis.dangerLevel !== 'Critique' && gankAnalysis.dangerLevel !== 'Élevé') {
      return;
    }
    const now = Date.now();
    const prev = lastGankToastRef.current;
    if (prev.key === gankAnalysis.alertKey && now - prev.atMs < 75000) {
      return;
    }
    lastGankToastRef.current = { key: gankAnalysis.alertKey, atMs: now };
    onNotifyRef.current?.({
      variant: 'warning',
      title: `Danger Gank (${gankAnalysis.dangerLevel}) · ${gankAnalysis.laneLabel}`,
      description: `${gankAnalysis.headline} ${gankAnalysis.actionTip}`,
      durationMs: 6500,
    });
  }, [gankToastEnabled, gankAnalysis]);

  const handleUpdateJungleSighting = (zone: MapSightingZone) => {
    setJungleSighting({
      zone,
      spottedAtGameSec: zone === 'UNKNOWN' ? 0 : snapshot?.gameTimeSec ?? 0,
    });
  };

  if (!snapshot) return null;

  const selfChampDisplay = getChampDisplay(snapshot.championName);
  const spectatorBlue = (spectatorGame?.participants || []).filter((p) => p.teamId === 100);
  const spectatorRed = (spectatorGame?.participants || []).filter((p) => p.teamId === 200);

  const isAramMode = snapshot.gameMode?.toUpperCase() === 'ARAM';
  const hasCosmicInsightSelf = Boolean(snapshot.fullRunesSummary?.selectedRuneIds?.includes(8347));

  // Cibles vocales pour les 10 joueurs (adversaires prioritaires puis alliés)
  const allTrackablePlayersForVoice = [
    ...enemyPlayers.map((player) => ({ player, team: 'ENEMY' as const })),
    ...allyPlayers.map((player) => ({ player, team: 'ALLY' as const })),
  ].map(({ player, team }) => {
    const champDisp = getChampDisplay(player.championName);
    const matchingSpectator = (spectatorGame?.participants || []).find((sp) => {
      if (champDisp.champion && Number(champDisp.champion.key) === sp.championId) return true;
      return sp.riotId.toLowerCase() === player.riotId.toLowerCase();
    });
    const [fallback1, fallback2] = inferDefaultEnemySpells(player.position);
    const override =
      enemySpellOverrides[`${team}:${player.championName}`] ||
      enemySpellOverrides[player.championName];

    const spell1Id =
      override?.spell1Id ?? player.spell1Id ?? matchingSpectator?.spell1Id ?? fallback1;
    const spell2Id =
      override?.spell2Id ?? player.spell2Id ?? matchingSpectator?.spell2Id ?? fallback2;
    const isSelf = player.championName.toLowerCase() === snapshot.championName.toLowerCase();

    return {
      player,
      team,
      champDisp,
      spell1: getSummonerSpellById(spell1Id),
      spell2: getSummonerSpellById(spell2Id),
      isSelf,
    };
  });

  const enemyVoiceTargets: EnemySpellVoiceTarget[] = allTrackablePlayersForVoice.map((t) => ({
    championId: t.player.championName,
    displayName: t.champDisp.displayName,
    spell1Id: t.spell1.id,
    spell2Id: t.spell2.id,
  }));

  const handleVoiceSpellTranscript = (transcript: string): boolean => {
    const selfMatch = detectSelfAbilityOrSpellVoiceTrigger(transcript);
    if (selfMatch) {
      const selfTracker = allTrackablePlayersForVoice.find((t) => t.isSelf);
      if (selfMatch.kind === 'SUMMONER' && selfTracker) {
        const effective = computeEffectiveSpellCooldown(
          selfMatch.spell.cooldownSec,
          selfTracker.player.items.map((it) => it.itemId),
          {
            hasCosmicInsight: hasCosmicInsightSelf,
            isAram: isAramMode,
          },
        );
        handleToggleEnemySpell(
          selfTracker.player.championName,
          selfTracker.champDisp.displayName,
          selfMatch.spell.id,
          selfMatch.spell.nameFr,
          selfMatch.spell.chatCode,
          effective.cooldownSec,
          true,
          'ALLY',
        );
        onNotify?.({
          variant: 'info',
          title: `Chrono lancé au micro · Votre ${selfMatch.spell.nameFr}`,
          description: `Décompte démarré sur ${formatClock(effective.cooldownSec)}.`,
          durationMs: 4000,
        });
        return true;
      }

      if (selfMatch.kind === 'ABILITY') {
        const selfDdKey = selfChampDisplay.champion?.id || snapshot.championName;
        const selfKit = championKits[selfDdKey];
        const abilityIndex = { Q: 0, W: 1, E: 2, R: 3 }[selfMatch.abilityKey];
        const spell = selfKit?.spells?.[abilityIndex];
        const rank = snapshot.activeAbilityLevels?.[selfMatch.abilityKey] || 1;
        const haste = snapshot.activeStats?.abilityHaste ?? 0;
        const cdSec = parseSpellCooldownAtLevel(
          spell?.cooldownBurn,
          snapshot.level,
          selfMatch.abilityKey === 'R',
          rank,
          haste,
        );
        if (spell && cdSec) {
          const frKey =
            selfMatch.abilityKey === 'Q'
              ? 'A'
              : selfMatch.abilityKey === 'W'
                ? 'Z'
                : selfMatch.abilityKey;
          handleToggleEnemySpell(
            snapshot.championName,
            selfChampDisplay.displayName,
            1001 + abilityIndex,
            `${frKey} · ${spell.name}`,
            frKey,
            cdSec,
            true,
            'ALLY',
            spell.imageUrl,
          );
          onNotify?.({
            variant: 'info',
            title: `Chrono compétence · ${frKey} (${spell.name})`,
            description: `Décompte ${formatClock(cdSec)} (Niv.${rank}${haste > 0 ? `, ${haste} Hâte` : ''}).`,
            durationMs: 3800,
          });
          return true;
        }
      }
    }

    const match = detectEnemySpellVoiceTrigger(transcript, enemyVoiceTargets);
    if (!match) return false;
    const tracker = allTrackablePlayersForVoice.find(
      (t) => t.player.championName === match.enemy.championId,
    );
    if (!tracker) return false;

    const effective = computeEffectiveSpellCooldown(
      match.spell.cooldownSec,
      tracker.player.items.map((it) => it.itemId),
      {
        hasCosmicInsight: tracker.isSelf && hasCosmicInsightSelf,
        isAram: isAramMode,
      },
    );
    handleToggleEnemySpell(
      tracker.player.championName,
      tracker.champDisp.displayName,
      match.spell.id,
      match.spell.nameFr,
      match.spell.chatCode,
      effective.cooldownSec,
      true,
      tracker.team,
    );
    const modBadges = [
      effective.hasLucidityBoots ? 'Lucidité' : null,
      effective.hasCosmicInsight ? 'Cosmique' : null,
      effective.isAram ? 'ARAM' : null,
    ].filter(Boolean);
    onNotify?.({
      variant: 'info',
      title: `Chrono lancé au micro · ${tracker.champDisp.displayName}`,
      description: `${match.spell.nameFr} suivi sur ${formatClock(effective.cooldownSec)}${
        modBadges.length > 0 ? ` (${modBadges.join(' + ')})` : ''
      }.`,
      durationMs: 4200,
    });
    return true;
  };

  const handleCopyActiveTimersToChat = async () => {
    const now = Date.now();
    const parts: string[] = [];
    for (const entry of Object.values(spellCooldowns)) {
      if (entry.expiresAt <= now) continue;
      const leftSec = Math.ceil((entry.expiresAt - now) / 1000);
      const readyAtGameSec = snapshot.gameTimeSec + leftSec;
      parts.push(`${entry.championDisplayName} ${entry.chatCode} ${formatClock(readyAtGameSec)}`);
    }
    if (parts.length === 0) return;
    try {
      await navigator.clipboard.writeText(parts.join(' · '));
      setCopiedTimers(true);
      window.setTimeout(() => setCopiedTimers(false), 2000);
    } catch {
      // ignore clipboard restriction
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête Live Client Data & Connexion compacte */}
      <section className="rounded-2xl apple-surface p-5 sm:p-6 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex items-center gap-4">
            <SafeGameIcon
              src={selfChampDisplay.imageUrl}
              alt={selfChampDisplay.displayName}
              fallbackLabel={selfChampDisplay.displayName}
              sizeClass="w-12 h-12"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  En partie · Live — {selfChampDisplay.displayName} (Niv. {snapshot.level})
                </h1>
                {snapshot.gameMode?.toUpperCase() === 'PRACTICETOOL' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
                    Outil d’entraînement
                  </span>
                )}
                {spectatorGame?.inGame && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    Partie active détectée
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>{riotId} ({region})</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>Source : {snapshot.source}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono tabular-nums">Horloge : {formatClock(snapshot.gameTimeSec)}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={preferredRole}
              onChange={(e) => setPreferredRole(e.target.value as Role)}
              aria-label="Rôle joué"
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
            >
              {(['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  Rôle : {r}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setShowSpectatorPanel(true);
                void handleCheckSpectatorGame();
              }}
              disabled={spectatorLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Radar className={`w-3.5 h-3.5 text-amber-500 ${spectatorLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              {spectatorLoading ? 'Recherche...' : 'Détecter partie (Riot)'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isInsideIframe && !bridgePollActive) {
                  setShowConnector(true);
                }
                setBridgePollActive((v) => !v);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                bridgePollActive
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
              {bridgePollActive ? 'Pont auto (3s)' : 'Pont auto'}
            </button>

            {snapshot.source === 'Live Client Data (127.0.0.1:2999)' && onSaveLiveSessionMatch && (
              <button
                type="button"
                onClick={() => onSaveLiveSessionMatch(snapshot, true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/15 transition-colors whitespace-nowrap shrink-0"
                title="Enregistrer le stuff et les statistiques de cette session dans Après la partie"
              >
                <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                Sauvegarder en Post-Game
              </button>
            )}

            <button
              type="button"
              onClick={handleAdvanceSimulation}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              Simuler +3 min
            </button>

            <button
              type="button"
              onClick={() => setShowConnector((v) => !v)}
              aria-expanded={showConnector}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 hover:border-amber-500 transition-colors whitespace-nowrap shrink-0"
            >
              <span>{showConnector ? 'Masquer pont' : 'Configurer pont / JSON'}</span>
              {showConnector ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {ingestSuccess && (
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs text-emerald-700 dark:text-emerald-300">
            {ingestSuccess}
          </div>
        )}

        {snapshot.source === 'Simulation Live Client Data' && (
          <div className="p-3.5 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] text-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Mode Simulation actif — Aucune connexion en direct à votre client LoL pour le moment
                </span>
              </div>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
                {isInsideIframe
                  ? 'Dans l’aperçu intégré AI Studio, le navigateur bloque la connexion locale (127.0.0.1). Ouvrez l’app dans un onglet dédié et lancez lol-coach-bridge.bat sur Windows pour recevoir votre or, achats et points de compétences A/Z/E/R en temps réel.'
                  : 'Lancez lol-coach-bridge.bat (v3.4) sur Windows pendant votre partie : la connexion basculera automatiquement sur vos données en direct (127.0.0.1:2999). Note Riot Vanguard : les lancers de sorts (Flash, A/Z/E/R) se déclenchent en 1 clic ou au micro.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isInsideIframe && (
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  Ouvrir dans un onglet dédié
                </a>
              )}
              <button
                type="button"
                onClick={handleDownloadBridge}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-500/40 bg-white/80 dark:bg-[#121722] text-amber-800 dark:text-amber-200 hover:border-amber-500 transition-colors whitespace-nowrap"
              >
                <Download className="w-3 h-3" aria-hidden="true" />
                Télécharger lol-coach-bridge.bat (v3.4)
              </button>
            </div>
          </div>
        )}

        {bridgeStatus && (
          <div
            className={`p-3 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 ${
              bridgeStatus.startsWith('Synchronisé')
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                : isInsideIframe && bridgeStatus.includes('iframe')
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                  : 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300'
            }`}
          >
            <span>{bridgeStatus}</span>
            {isInsideIframe && !bridgeStatus.startsWith('Synchronisé') && (
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                Ouvrir dans un onglet dédié
              </a>
            )}
          </div>
        )}

        {/* Résultats Spectator-V5 (affichés à la demande ou si partie active détectée) */}
        {(showSpectatorPanel || spectatorGame?.inGame || spectatorError) && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            {spectatorError && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400">
                {spectatorError}
              </div>
            )}
            {spectatorGame?.inGame ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                    Spectator-V5 : Partie active ·{' '}
                    {mapQueueToLabelAndMode(spectatorGame.gameQueueConfigId, spectatorGame.gameMode).modeLabel} · Durée{' '}
                    <span className="font-mono tabular-nums">{formatClock(spectatorGame.gameLengthSec || 0)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleScoutLobby()}
                      disabled={scoutingLobby}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/15 disabled:opacity-50 transition-colors"
                    >
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      {scoutingLobby ? 'Scan rangs & maîtrises...' : 'Scanner le lobby (Rangs & Maîtrises)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSpectatorPanel((v) => !v)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      {showSpectatorPanel ? 'Replier les 10 joueurs Spectator' : 'Voir les 10 joueurs & bans'}
                    </button>
                  </div>
                </div>

                {scoutError && (
                  <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 text-[11px] text-rose-600 dark:text-rose-400">
                    {scoutError}
                  </div>
                )}

                {showSpectatorPanel && (
                  <>
                    {spectatorGame.bannedChampions && spectatorGame.bannedChampions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3.5 py-2 text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 mr-1">
                          Bans ({spectatorGame.bannedChampions.length}) :
                        </span>
                        {spectatorGame.bannedChampions.map((ban, idx) => {
                          const bannedChamp = getChampionByNumericId(ban.championId);
                          return (
                            <div
                              key={`${ban.championId}-${idx}`}
                              className="inline-flex items-center gap-1.5 pr-2 text-[11px] text-slate-600 dark:text-slate-300"
                            >
                              <SafeGameIcon
                                src={bannedChamp?.imageUrl}
                                alt={bannedChamp?.name || String(ban.championId)}
                                fallbackLabel={bannedChamp?.name || 'Ban'}
                                sizeClass="w-5 h-5"
                              />
                              <span>{bannedChamp?.name || `#${ban.championId}`}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { label: 'Équipe Bleue (100)', list: spectatorBlue },
                        { label: 'Équipe Rouge (200)', list: spectatorRed },
                      ].map((team) => (
                        <div
                          key={team.label}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 space-y-2.5"
                        >
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {team.label}
                          </div>
                          <div className="space-y-2">
                            {team.list.map((sp, idx) => {
                              const champ = getChampionByNumericId(sp.championId);
                              const isSelf = sp.riotId.toLowerCase() === riotId.toLowerCase();
                              const scout =
                                lobbyScoutMap[`${sp.teamId}:${sp.championId}:${sp.riotId}`];
                              const rankObj = scout?.soloRank || scout?.flexRank;
                              const formattedScoutRank = formatRankedQueue(rankObj);
                              const spell1 = getSummonerSpellById(sp.spell1Id);
                              const spell2 = getSummonerSpellById(sp.spell2Id);

                              return (
                                <div
                                  key={`${sp.riotId}-${idx}`}
                                  className="space-y-1 pb-1.5 border-b last:border-b-0 border-slate-200/70 dark:border-slate-800/70 text-xs"
                                >
                                  <div className="flex items-center gap-2">
                                    <SafeGameIcon
                                      src={champ?.imageUrl}
                                      alt={champ?.name || String(sp.championId)}
                                      fallbackLabel={champ?.name || 'LoL'}
                                      sizeClass="w-6 h-6"
                                    />
                                    <div className="flex items-center gap-0.5 shrink-0" title={`${spell1.nameFr} + ${spell2.nameFr}`}>
                                      <SafeGameIcon
                                        src={getSummonerSpellIconUrl(spell1.id, patchVersion)}
                                        alt={spell1.nameFr}
                                        fallbackLabel={spell1.shortLabel}
                                        sizeClass="w-4 h-4 rounded"
                                      />
                                      <SafeGameIcon
                                        src={getSummonerSpellIconUrl(spell2.id, patchVersion)}
                                        alt={spell2.nameFr}
                                        fallbackLabel={spell2.shortLabel}
                                        sizeClass="w-4 h-4 rounded"
                                      />
                                    </div>
                                    <span className="font-medium text-slate-900 dark:text-white truncate">
                                      {champ?.name || `Champion #${sp.championId}`}
                                      {isSelf && (
                                        <span className="ml-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                          (Vous)
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate ml-auto">
                                      {sp.riotId}
                                    </span>
                                  </div>
                                  {scout && (
                                    <div className="pl-8 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                      <span
                                        className={`font-semibold ${
                                          formattedScoutRank.isRanked
                                            ? formattedScoutRank.theme.textClass
                                            : 'text-slate-600 dark:text-slate-300'
                                        }`}
                                      >
                                        {formattedScoutRank.isRanked
                                          ? `${formattedScoutRank.divisionLabel} · ${formattedScoutRank.lp} LP (${formattedScoutRank.winRate}% WR)`
                                          : 'Non classé'}
                                      </span>
                                      {scout.championMasteryLevel > 0 && (
                                        <span>
                                          · M{scout.championMasteryLevel} (
                                          {Math.round(scout.championMasteryPoints / 1000)}k pts)
                                        </span>
                                      )}
                                      {scout.tags.length > 0 && (
                                        <span className="font-sans text-amber-600 dark:text-amber-400">
                                          · {scout.tags.join(' · ')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : spectatorCheckedAt ? (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Vérifié à {spectatorCheckedAt} : aucune partie publique active retournée par Spectator-V5 pour{' '}
                  <strong className="text-slate-700 dark:text-slate-200">{riotId}</strong> (normal en salon ou Outil d’entraînement).
                </span>
                <button
                  type="button"
                  onClick={() => setShowSpectatorPanel(false)}
                  className="text-[11px] underline shrink-0"
                >
                  Fermer
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* Panneau de connexion Live Client Data (replié par défaut pendant la partie) */}
        {showConnector && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            {isInsideIframe && (
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    Mode aperçu intégré (iframe) détecté
                  </div>
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    Ouvrir dans un onglet dédié
                  </a>
                </div>
                <p className="leading-relaxed">
                  Dans la fenêtre d’aperçu, Chrome bloque l’accès local{' '}
                  <code className="px-1 py-0.5 rounded bg-amber-500/10">127.0.0.1:38421</code>. Utilisez la commande PowerShell +{' '}
                  <strong>Ctrl+V</strong> ci-dessous, ou ouvrez dans un onglet dédié pour utiliser{' '}
                  <code className="px-1 py-0.5 rounded bg-amber-500/10">lol-coach-bridge.bat</code>.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-slate-900 dark:text-white">
                  Méthode automatique Windows (Classée, ARAM &amp; Outil d’entraînement)
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Lancez <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">lol-coach-bridge.bat</code>{' '}
                  (v3.4 — rafraîchit toutes les 1,5s + runes LCU) dans un onglet dédié : la détection bascule automatiquement sans manipulation.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadBridge}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Télécharger lol-coach-bridge.bat (v3.4)
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Import rapide par PowerShell + <strong>Ctrl+V</strong> :
              </div>
              <div className="relative">
                <pre className="p-3 pr-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                  {clipboardCommand}
                </pre>
                <button
                  type="button"
                  onClick={handleCopyRelay}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  {copiedRelay ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedRelay ? 'Copié' : 'Copier'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ClipboardPaste className="w-3.5 h-3.5" aria-hidden="true" />
                Coller depuis le presse-papiers
              </button>

              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <FileUp className="w-3.5 h-3.5" aria-hidden="true" />
                Importer un fichier .json
                <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="sr-only" />
              </label>

              <button
                type="button"
                onClick={pollLocalBridge}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Tester le pont maintenant
              </button>
            </div>

            <div className="space-y-2">
              <textarea
                rows={2}
                value={manualJson}
                onChange={(e) => setManualJson(e.target.value)}
                onPaste={handleTextareaPaste}
                placeholder='Cliquez ici et faites Ctrl+V pour analyser immédiatement le JSON de 127.0.0.1:2999/liveclientdata/allgamedata'
                className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
              />
              {ingestError && <p className="text-xs text-rose-500">{ingestError}</p>}
              {manualJson.trim() && (
                <button
                  type="button"
                  onClick={() => ingestRawText(manualJson)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950"
                >
                  Analyser ce snapshot
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Priorité immédiate + Navigation par étapes chronologiques style Apple (visible dès le haut de page) */}
      {(() => {
        const showAll = activeStage === 'all';
        const showStart = showAll || activeStage === 'start';
        const showLane = showAll || activeStage === 'lane';
        const showTeamfight = showAll || activeStage === 'teamfight';
        const showVoice = showAll || activeStage === 'voice';
        const topAlert = snapshot.alerts?.[0];
        const effectiveSkillTracker =
          skillTracker ||
          createInitialSkillOrderState(
            snapshot.championName,
            snapshot.activeAbilityLevels,
            snapshot.gameTimeSec,
          );

        const stageTabs: Array<{ id: LiveGameStage; label: string; hint: string }> = [
          { id: 'all', label: 'Tout voir', hint: 'Affichage complet sans filtre' },
          { id: 'start', label: '1. Départ (0–3m)', hint: 'Équipement, compétences 1→18 & runes' },
          { id: 'lane', label: '2. Phase de lane', hint: 'Radar jungle, Win Rate voie & sorts' },
          { id: 'teamfight', label: '3. Mid / Late', hint: 'Contre-objets, teamfight & builds' },
          { id: 'voice', label: '4. Coach Vocal & IA', hint: 'Synthèse audio & micro' },
        ];

        return (
          <>
            <div className="rounded-2xl apple-surface p-3.5 sm:p-4 space-y-3">
              {topAlert && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-black/[0.06] dark:border-white/[0.08] text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-[#007AFF] dark:text-[#0A84FF] shrink-0">
                      À faire maintenant ·
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white truncate">
                      {topAlert.message}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    {topAlert.action}
                  </span>
                </div>
              )}

              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Étapes de la partie"
                  className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#0D0F14] border border-black/[0.05] dark:border-white/[0.07]"
                >
                  {stageTabs.map((tab) => {
                    const selected = activeStage === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        title={tab.hint}
                        onClick={() => {
                          setActiveStage(tab.id);
                          setAutoFollowStage(false);
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 ${
                          selected
                            ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white shadow-xs font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Interrupteur Apple iOS bien visible pour le suivi automatique selon le chrono */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoFollowStage}
                  onClick={() => setAutoFollowStage((prev) => !prev)}
                  title="Bascule automatiquement entre Départ (0-3m), Phase de lane (3-14m) et Mid/Late (14m+) selon l'horloge du match"
                  className="inline-flex items-center justify-between gap-3 px-3 py-1.5 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-slate-50/90 dark:bg-[#0F1117] hover:border-[#007AFF]/40 transition-colors self-start xl:self-auto shrink-0"
                >
                  <div className="text-left">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                      Suivi auto selon l’horloge
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                      {autoFollowStage
                        ? `Actif (${formatClock(snapshot.gameTimeSec)} → ${
                            snapshot.gameTimeSec < 180
                              ? 'Départ'
                              : snapshot.gameTimeSec < 840
                                ? 'Lane'
                                : 'Mid / Late'
                          })`
                        : 'Manuel (cliquez pour activer)'}
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                      autoFollowStage ? 'bg-[#34C759]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-200 mt-0.5 ${
                        autoFollowStage ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>

      {/* Télémétrie Live */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl apple-surface p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">KDA &amp; Score équipe</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.kda}
          </div>
          <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Équipe {snapshot.allyKills} – {snapshot.enemyKills}
          </div>
        </div>

        <div className="rounded-2xl apple-surface p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Rythme CS Live</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.csPerMin} <span className="text-xs font-normal text-slate-400">/min</span>
          </div>
          <div
            className={`mt-0.5 text-[11px] font-mono tabular-nums ${
              snapshot.csPaceDelta >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {snapshot.csPaceDelta >= 0 ? `+${snapshot.csPaceDelta}` : snapshot.csPaceDelta} vs cible ({snapshot.targetCsPerMin})
          </div>
        </div>

        <div className="rounded-2xl apple-surface p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Or en poche</div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {snapshot.currentGold} po
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {snapshot.currentGold >= 1300 ? 'Fenêtre de rappel optimale' : 'Continuer à farmer'}
          </div>
        </div>

        <div className="rounded-2xl apple-surface p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" aria-hidden="true" />
            Prochain Dragon
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.dragonTimerSec === 0 ? 'Disponible' : formatClock(snapshot.dragonTimerSec ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Préparer vision à -45s
          </div>
        </div>

        <div className="rounded-2xl apple-surface p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" aria-hidden="true" />
            Baron Nashor
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {snapshot.baronTimerSec === 0 ? 'Disponible' : formatClock(snapshot.baronTimerSec ?? 0)}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Rivière nord
          </div>
        </div>
      </section>

      {/* Mes Compétences A/Z/E/R & Sorts en direct (calcul exact rang + Ability Haste) */}
      {(() => {
        const selfDdKey = selfChampDisplay.champion?.id || snapshot.championName;
        const selfKit = championKits[selfDdKey];
        const selfHaste = snapshot.activeStats?.abilityHaste ?? 0;
        const selfTracker = allTrackablePlayersForVoice.find((t) => t.isSelf);
        const abilityDefs: Array<{ key: AbilityKey; fr: string; idx: number }> = [
          { key: 'Q', fr: 'A', idx: 0 },
          { key: 'W', fr: 'Z', idx: 1 },
          { key: 'E', fr: 'E', idx: 2 },
          { key: 'R', fr: 'R', idx: 3 },
        ];

        if (!selfKit && !selfTracker) return null;

        return (
          <section className="rounded-2xl apple-surface p-4 sm:p-5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Timer className="w-4 h-4 text-[#007AFF] dark:text-[#0A84FF] shrink-0" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Mes Compétences &amp; Sorts ({selfChampDisplay.displayName})
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  · {selfHaste} Hâte de compétence
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Rangs &amp; Hâte synchronisés en auto · Clic ou micro (« Mon A », « Mon ultime », « Mon flash ») pour lancer le timer (Riot Vanguard bloque la lecture auto des touches).
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {selfKit &&
                abilityDefs.map((ab) => {
                  const spell = selfKit.spells?.[ab.idx];
                  if (!spell) return null;
                  const rank = snapshot.activeAbilityLevels?.[ab.key] ?? 0;
                  const effectiveRank = rank > 0 ? rank : 1;
                  const cdSec =
                    parseSpellCooldownAtLevel(
                      spell.cooldownBurn,
                      snapshot.level,
                      ab.key === 'R',
                      effectiveRank,
                      selfHaste,
                    ) ?? 10;
                  const abilityEntryId = 1001 + ab.idx;
                  const entryKey = `${snapshot.championName}:${abilityEntryId}`;
                  const entry = spellCooldowns[entryKey];
                  const leftSec =
                    entry && entry.expiresAt > spellTickNow
                      ? Math.ceil((entry.expiresAt - spellTickNow) / 1000)
                      : 0;
                  const pctLeft =
                    leftSec > 0 && entry?.totalSec
                      ? Math.min(100, Math.max(5, Math.round((leftSec / entry.totalSec) * 100)))
                      : 0;

                  return (
                    <button
                      key={`self-ability-${ab.key}`}
                      type="button"
                      onClick={() =>
                        handleToggleEnemySpell(
                          snapshot.championName,
                          selfChampDisplay.displayName,
                          abilityEntryId,
                          `${ab.fr} · ${spell.name}`,
                          ab.fr,
                          cdSec,
                          false,
                          'ALLY',
                          spell.imageUrl,
                        )
                      }
                      title={
                        leftSec > 0
                          ? `${ab.fr} (${spell.name}) en recharge : ${formatClock(leftSec)} — Cliquer pour annuler`
                          : `Lancer le timer ${ab.fr} (${spell.name}) : ${cdSec}s`
                      }
                      className={`relative overflow-hidden flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                        leftSec > 0
                          ? 'border-[#007AFF]/60 bg-[#007AFF]/10 text-[#007AFF] dark:text-[#0A84FF]'
                          : rank > 0
                            ? 'border-black/[0.07] dark:border-white/[0.09] bg-slate-50/90 dark:bg-[#0E1015] text-slate-900 dark:text-white hover:border-[#007AFF]/50'
                            : 'border-dashed border-black/[0.08] dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#0E1015]/60 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <SafeGameIcon
                        src={spell.imageUrl}
                        alt={spell.name}
                        fallbackLabel={ab.fr}
                        sizeClass={`w-8 h-8 rounded-lg shrink-0 ${
                          leftSec > 0 || rank === 0 ? 'opacity-65 grayscale-[35%]' : ''
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span className="font-bold uppercase tracking-wider">
                            {ab.fr} {rank > 0 ? `· N.${rank}` : ''}
                          </span>
                          <span className="font-mono tabular-nums font-semibold">
                            {leftSec > 0 ? formatClock(leftSec) : `${cdSec}s`}
                          </span>
                        </div>
                        <div className="text-[11px] font-medium truncate mt-0.5 text-slate-700 dark:text-slate-200">
                          {spell.name}
                        </div>
                      </div>
                      {leftSec > 0 && (
                        <div
                          className="absolute bottom-0 left-0 h-0.5 bg-[#007AFF] dark:bg-[#0A84FF] transition-all duration-500"
                          style={{ width: `${pctLeft}%` }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}

              {selfTracker &&
                [selfTracker.spell1, selfTracker.spell2].map((sumSpell, sIdx) => {
                  const eff = computeEffectiveSpellCooldown(
                    sumSpell.cooldownSec,
                    selfTracker.player.items.map((it) => it.itemId),
                    {
                      hasCosmicInsight: hasCosmicInsightSelf,
                      isAram: isAramMode,
                    },
                  );
                  const entryKey = `${selfTracker.player.championName}:${sumSpell.id}`;
                  const entry = spellCooldowns[entryKey];
                  const leftSec =
                    entry && entry.expiresAt > spellTickNow
                      ? Math.ceil((entry.expiresAt - spellTickNow) / 1000)
                      : 0;
                  const pctLeft =
                    leftSec > 0 && entry?.totalSec
                      ? Math.min(100, Math.max(5, Math.round((leftSec / entry.totalSec) * 100)))
                      : 0;

                  return (
                    <button
                      key={`self-sum-${sumSpell.id}-${sIdx}`}
                      type="button"
                      onClick={() =>
                        handleToggleEnemySpell(
                          selfTracker.player.championName,
                          selfTracker.champDisp.displayName,
                          sumSpell.id,
                          sumSpell.nameFr,
                          sumSpell.chatCode,
                          eff.cooldownSec,
                          false,
                          'ALLY',
                        )
                      }
                      className={`relative overflow-hidden flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all ${
                        leftSec > 0
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-black/[0.07] dark:border-white/[0.09] bg-slate-50/90 dark:bg-[#0E1015] text-slate-900 dark:text-white hover:border-amber-500/50'
                      }`}
                    >
                      <SafeGameIcon
                        src={getSummonerSpellIconUrl(sumSpell.id, patchVersion)}
                        alt={sumSpell.nameFr}
                        fallbackLabel={sumSpell.shortLabel}
                        sizeClass={`w-8 h-8 rounded-lg shrink-0 ${
                          leftSec > 0 ? 'opacity-65 grayscale-[35%]' : ''
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span className="font-bold uppercase tracking-wider">
                            Sort {sIdx === 0 ? 'D' : 'F'}
                          </span>
                          <span className="font-mono tabular-nums font-semibold">
                            {leftSec > 0 ? formatClock(leftSec) : formatClock(eff.cooldownSec)}
                          </span>
                        </div>
                        <div className="text-[11px] font-medium truncate mt-0.5 text-slate-700 dark:text-slate-200">
                          {sumSpell.shortLabel}
                        </div>
                      </div>
                      {leftSec > 0 && (
                        <div
                          className="absolute bottom-0 left-0 h-0.5 bg-amber-500 transition-all duration-500"
                          style={{ width: `${pctLeft}%` }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
            </div>
          </section>
        );
      })()}

      {/* Rappel visuel dynamique des sorts ennemis détectés via gameEvent */}
      {(showStart || showLane || showTeamfight) && (
        <LiveEnemyGameEventsWidget
          gameEvents={snapshot.gameEvents || []}
          enemyPlayers={enemyPlayers}
          champions={champions}
          championKits={championKits}
          patchVersion={patchVersion}
          gameTimeSec={snapshot.gameTimeSec}
          snapshotReceivedAtMs={snapshotReceivedAtMs}
          nowMs={gameEventNowMs}
          dismissedEventIds={dismissedGameEventIds}
          onDismissEvent={(eventId) =>
            setDismissedGameEventIds((prev) => {
              const next = new Set(prev);
              next.add(eventId);
              return next;
            })
          }
          onClearDismissed={() => setDismissedGameEventIds(new Set())}
        />
      )}

            {/* ÉTAPE 1 : DÉPART (Équipement de départ + Ordre des compétences 1 -> 18) */}
            {showStart && (
              <LivePhaseStartPanel
                snapshot={snapshot}
                role={preferredRole}
                champion={selfChampDisplay.champion}
                championKit={championKits[selfChampDisplay.champion?.id || snapshot.championName]}
                itemsCatalog={items}
                patchVersion={patchVersion}
                skillTracker={effectiveSkillTracker}
                onSimulateSkillPoint={handleSimulateSkillPoint}
                onResetSkillOrder={handleResetSkillOrder}
              />
            )}

            {/* ÉTAPE 2 : RADAR JUNGLE & ALERTE DANGER GANK */}
            {showLane && gankAnalysis && (
              <LiveJungleGankAlertPanel
                analysis={gankAnalysis}
                patchVersion={patchVersion}
                role={preferredRole}
                gameTimeSec={snapshot.gameTimeSec}
                sighting={jungleSighting}
                onUpdateSighting={handleUpdateJungleSighting}
                gankToastEnabled={gankToastEnabled}
                onToggleGankToast={setGankToastEnabled}
              />
            )}

            {/* SORTS D'INVOCATEUR DES 10 JOUEURS & TIMELINE (Départ / Lane / Teamfight) */}
            {(showStart || showLane || showTeamfight) &&
              (allyPlayers.length + enemyPlayers.length > 0 ||
                snapshot.source === 'Live Client Data (127.0.0.1:2999)') && (
                <>
                  <LiveSummonerSpellsTracker
                    allyPlayers={allyPlayers}
                    enemyPlayers={enemyPlayers}
                    selfChampionName={snapshot.championName}
                    spectatorParticipants={spectatorGame?.participants}
                    champions={champions}
                    patchVersion={patchVersion}
                    gameTimeSec={snapshot.gameTimeSec}
                    gameMode={snapshot.gameMode}
                    hasCosmicInsightSelf={hasCosmicInsightSelf}
                    sourceLabel={snapshot.source}
                    spellCooldowns={spellCooldowns}
                    spellTickNow={spellTickNow}
                    spellOverrides={enemySpellOverrides}
                    onToggleSpell={(
                      championKey,
                      championDisplayName,
                      spellId,
                      spellNameFr,
                      chatCode,
                      durationSec,
                      team,
                    ) =>
                      handleToggleEnemySpell(
                        championKey,
                        championDisplayName,
                        spellId,
                        spellNameFr,
                        chatCode,
                        durationSec,
                        false,
                        team,
                      )
                    }
                    onOverrideSpell={(championKey, slot, spellId) =>
                      setEnemySpellOverrides((prev) => ({
                        ...prev,
                        [championKey]: {
                          ...prev[championKey],
                          [slot]: spellId,
                        },
                      }))
                    }
                    onResetAll={() => setSpellCooldowns({})}
                    voiceAlertOnReady={voiceAlertOnReady}
                    onToggleVoiceAlert={setVoiceAlertOnReady}
                    toastAlertOnReady={toastAlertOnReady}
                    onToggleToastAlert={setToastAlertOnReady}
                    toastAlertScope={toastAlertScope}
                    onChangeToastAlertScope={setToastAlertScope}
                    speechSupported={speechSupported}
                    onCopyTimers={handleCopyActiveTimersToChat}
                    copiedTimers={copiedTimers}
                  />

                  {(showLane || showTeamfight) && (
                    <LiveSpellCooldownTimeline
                      spellCooldowns={spellCooldowns}
                      spellTickNow={spellTickNow}
                      champions={champions}
                      patchVersion={patchVersion}
                      gameTimeSec={snapshot.gameTimeSec}
                      onCancelCooldown={handleCancelSpellCooldown}
                      onResetAll={() => setSpellCooldowns({})}
                    />
                  )}

                  <LiveCompositionSynergyPanel
                    selfChampionName={snapshot.championName}
                    allyPlayers={allyPlayers}
                    preferredRole={preferredRole}
                    champions={champions}
                    championKits={championKits}
                    gameTimeSec={snapshot.gameTimeSec}
                    gameMode={snapshot.gameMode}
                    activeSpellCooldownKeys={activeSpellCooldownKeys}
                  />
                </>
              )}

            {/* ÉTAPE 2 : COMPÉTENCES DES JOUEURS EN PARTIE */}
            {showLane && (
              <section
                ref={abilitiesSectionRef}
                className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16181D] p-5 space-y-4"
              >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
              <span>Compétences des joueurs en partie (Passif · A · Z · E · R)</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Cliquez sur n’importe quel champion allié ou adverse pour voir ses 5 sorts, délais par rang, coûts, portées et conseils de contre (avec vos niveaux de sorts en direct pour votre champion).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllAbilitiesPanel((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-sky-500 transition-colors self-start sm:self-auto shrink-0"
          >
            <span>{showAllAbilitiesPanel ? 'Replier' : 'Déplier'}</span>
            {showAllAbilitiesPanel ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {showAllAbilitiesPanel && (() => {
          const allMatchPlayers = [
            ...allyPlayers.map((p) => ({ ...p, group: 'ALLY' as const })),
            ...enemyPlayers.map((p) => ({ ...p, group: 'ENEMY' as const })),
          ];
          const activeRow =
            allMatchPlayers.find((p) => p.championName === selectedKitChampName) ||
            allMatchPlayers[0] || {
              championName: snapshot.championName,
              riotId: snapshot.championName,
              team: 'ALLY' as const,
              position: preferredRole,
              level: snapshot.level,
              kills: 0,
              deaths: 0,
              assists: 0,
              cs: snapshot.cs,
              isDead: false,
              spell1Id: 4,
              spell2Id: 14,
              items: [],
              dangerLevel: 'Normal' as const,
              group: 'ALLY' as const,
            };

          const activeDisp = getChampDisplay(activeRow.championName);
          const ddKey = activeDisp.champion?.id || activeRow.championName;
          const activeKit = championKits[ddKey];
          const isSelfSelected =
            activeRow.championName.toLowerCase() === snapshot.championName.toLowerCase();
          const s1 = getSummonerSpellById(activeRow.spell1Id ?? 4);
          const s2 = getSummonerSpellById(activeRow.spell2Id ?? 14);
          const ultSpell = activeKit?.spells?.[3];
          const ultCdSec = parseSpellCooldownAtLevel(ultSpell?.cooldownBurn, activeRow.level, true);
          const ultKey = `${activeRow.championName}:999`;
          const ultExp = spellCooldowns[ultKey]?.expiresAt;
          const ultLeft = ultExp && ultExp > spellTickNow ? Math.ceil((ultExp - spellTickNow) / 1000) : 0;
          const skillRanks = isSelfSelected && snapshot.activeAbilityLevels
            ? [
                snapshot.activeAbilityLevels.Q,
                snapshot.activeAbilityLevels.W,
                snapshot.activeAbilityLevels.E,
                snapshot.activeAbilityLevels.R,
              ]
            : null;

          return (
            <div className="space-y-4">
              {/* Sélecteur des champions de la partie */}
              <div className="flex flex-wrap items-center gap-2">
                {allMatchPlayers.map((pl, idx) => {
                  const disp = getChampDisplay(pl.championName);
                  const selected = pl.championName === activeRow.championName;
                  const isSelf =
                    pl.championName.toLowerCase() === snapshot.championName.toLowerCase();
                  return (
                    <button
                      key={`kit-pill-${pl.championName}-${idx}`}
                      type="button"
                      onClick={() => setSelectedKitChampName(pl.championName)}
                      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                        selected
                          ? pl.group === 'ENEMY'
                            ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-semibold'
                            : 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                      }`}
                    >
                      <SafeGameIcon
                        src={disp.imageUrl}
                        alt={disp.displayName}
                        fallbackLabel={disp.displayName}
                        sizeClass="w-5 h-5"
                      />
                      <span>{disp.displayName}</span>
                      <span className="text-[10px] font-mono tabular-nums opacity-75">
                        N.{pl.level}
                      </span>
                      {isSelf && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          (Vous)
                        </span>
                      )}
                      {pl.group === 'ENEMY' && !selected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500/80" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Détail des 5 compétences du champion sélectionné */}
              {activeKit ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <SafeGameIcon
                        src={activeKit.imageUrl}
                        alt={activeKit.name}
                        fallbackLabel={activeKit.name}
                        sizeClass="w-11 h-11"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {activeKit.name}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                            {activeKit.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              activeRow.group === 'ENEMY'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                            }`}
                          >
                            {isSelfSelected
                              ? 'Vous'
                              : activeRow.group === 'ENEMY'
                                ? 'Adversaire'
                                : 'Allié'}{' '}
                            · Niv. {activeRow.level}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                          <span>Ressource : {activeKit.partype}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            Sorts :
                            <SafeGameIcon
                              src={getSummonerSpellIconUrl(s1.id, patchVersion)}
                              alt={s1.nameFr}
                              fallbackLabel={s1.shortLabel}
                              sizeClass="w-4 h-4 rounded"
                            />
                            {s1.shortLabel} +
                            <SafeGameIcon
                              src={getSummonerSpellIconUrl(s2.id, patchVersion)}
                              alt={s2.nameFr}
                              fallbackLabel={s2.shortLabel}
                              sizeClass="w-4 h-4 rounded"
                            />
                            {s2.shortLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {ultCdSec && activeRow.group === 'ENEMY' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleEnemySpell(
                            activeRow.championName,
                            activeKit.name,
                            999,
                            `Ultime (R) ${ultSpell?.name || ''}`,
                            'R',
                            ultCdSec,
                            false,
                            activeRow.group,
                          )
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors shrink-0 ${
                          ultLeft > 0
                            ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-800 dark:text-slate-100 hover:border-rose-500'
                        }`}
                      >
                        <Timer className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {ultLeft > 0
                            ? `Ultime (R) en CD : ${formatClock(ultLeft)}`
                            : `Suivre Ultime R (${ultCdSec}s)`}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Passif + A/Z/E/R */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                    {/* Passif */}
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <SafeGameIcon
                          src={activeKit.passive.imageUrl}
                          alt={activeKit.passive.name}
                          fallbackLabel="P"
                          sizeClass="w-9 h-9 rounded-lg shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Passif
                          </div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                            {activeKit.passive.name}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {stripSpellHtml(activeKit.passive.description)}
                      </p>
                    </div>

                    {/* A / Z / E / R */}
                    {activeKit.spells.slice(0, 4).map((spell, sIdx) => {
                      const keyLabel = ['A (Q)', 'Z (W)', 'E', 'R (Ultime)'][sIdx] || 'S';
                      const rank = skillRanks ? skillRanks[sIdx] : null;
                      return (
                        <div
                          key={spell.id}
                          className={`rounded-lg border p-3 space-y-2 ${
                            rank !== null && rank > 0
                              ? 'border-sky-500/40 bg-white dark:bg-[#121722]'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722]'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <SafeGameIcon
                              src={spell.imageUrl}
                              alt={spell.name}
                              fallbackLabel={keyLabel[0]}
                              sizeClass="w-9 h-9 rounded-lg shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                                  {keyLabel}
                                </span>
                                {rank !== null && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums font-semibold ${
                                      rank > 0
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500'
                                    }`}
                                  >
                                    {rank > 0 ? `Niv. ${rank}` : 'Non appris'}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">
                                {spell.name}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                            <span>CD : {spell.cooldownBurn}s</span>
                            {spell.costBurn !== '0' && <span>Coût : {spell.costBurn}</span>}
                            <span>Portée : {spell.rangeBurn}</span>
                          </div>

                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {stripSpellHtml(spell.description)}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Conseils tactiques officiels Riot */}
                  {(activeKit.enemytips.length > 0 || activeKit.allytips.length > 0) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      {activeKit.enemytips.length > 0 && (
                        <div className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 space-y-1 text-[11px]">
                          <div className="font-semibold text-rose-600 dark:text-rose-400">
                            Comment contrer {activeKit.name}
                          </div>
                          <ul className="space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                            {activeKit.enemytips.slice(0, 2).map((tip, i) => (
                              <li key={i}>· {tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {activeKit.allytips.length > 0 && (
                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1 text-[11px]">
                          <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                            Points forts &amp; combos de {activeKit.name}
                          </div>
                          <ul className="space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
                            {activeKit.allytips.slice(0, 2).map((tip, i) => (
                              <li key={i}>· {tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-xs text-slate-500 dark:text-slate-400">
                  Chargement des compétences de {activeDisp.displayName} depuis Data Dragon...
                </div>
              )}
            </div>
          );
        })()}
      </section>
            )}

      {/* ÉTAPE 4 : ANALYSE TACTIQUE INSTANTANÉE + COACH VOCAL */}
      {showVoice && (
      <>
      <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16181D] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Analyse instantanée &amp; Synthèse vocale Web Speech</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cliquez sur <strong>Analyser</strong> pour obtenir les 3 points clés de votre situation et entendre immédiatement un résumé vocal rapide.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {speechSupported && (
              <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSpeakSummary}
                  onChange={(e) => setAutoSpeakSummary(e.target.checked)}
                  className="rounded border-slate-300 accent-amber-500"
                />
                <span>Synthèse vocale auto</span>
              </label>
            )}

            {aiAdvice && speechSupported && (
              <button
                type="button"
                onClick={() => {
                  if (isSummarySpeaking) {
                    stopCoachSpeech();
                    setIsSummarySpeaking(false);
                  } else {
                    speakLiveAdviceSummary(aiAdvice);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isSummarySpeaking
                    ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isSummarySpeaking ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Couper la voix</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                    <span>Réécouter la synthèse</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleAskAiLive}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{aiLoading ? 'Analyse en cours...' : 'Analyser'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {snapshot.alerts.map((al, idx) => (
              <div key={idx} className="p-4 space-y-1 bg-white dark:bg-[#121722]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {al.category}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      al.priority === 'Haute'
                        ? 'text-rose-600 dark:text-rose-400'
                        : al.priority === 'Moyenne'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    Priorité {al.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{al.message}</p>
                <p className="text-xs text-sky-700 dark:text-sky-400 font-medium">{al.action}</p>
              </div>
            ))}
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-500" aria-hidden="true" />
                <span>Points clés &amp; Synthèse vocale</span>
              </h3>
              {aiAdvice?.sourceLabel && (
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {aiAdvice.sourceLabel}
                </span>
              )}
            </div>

            {aiError && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{aiError}</p>
            )}

            {aiAdvice ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3">
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      1. Action immédiate (30s) :{' '}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">{aiAdvice.immediateCall}</span>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3">
                    <span className="font-semibold text-sky-600 dark:text-sky-400">
                      2. Rappel &amp; achat :{' '}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">{aiAdvice.recallAdvice}</span>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3">
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      3. Vigilance menace :{' '}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">{aiAdvice.dangerWatch}</span>
                  </div>
                </div>

                {spokenSummaryPreview && (
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        Texte synthétisé (Web Speech) :{' '}
                      </span>
                      <span>« {spokenSummaryPreview} »</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Appuyez sur <strong>Analyser</strong> pour évaluer instantanément votre or en poche, vos timers d’objectifs, l’équipement adverse et déclencher la synthèse vocale rapide des points clés.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Coach Vocal & Détection Micro de Moments Clés */}
      <VoiceMomentCoachPanel
        snapshot={snapshot}
        onNotify={onNotify}
        onTranscriptDetected={handleVoiceSpellTranscript}
      />
      </>
      )}

      {/* ÉTAPE 3 : ADAPTATION PROACTIVE (En difficulté / Avance) */}
      {showTeamfight && snapshot.comebackAdvice ? (
        <section className="rounded-xl border border-rose-500/35 bg-rose-500/5 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              Plan d’urgence proactif — Adaptation en difficulté
            </h2>
            <span className="text-xs font-mono tabular-nums text-rose-600 dark:text-rose-300">
              {snapshot.comebackAdvice.triggerReason}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-rose-500/20 text-xs leading-relaxed">
            <div className="space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Pivot équipement immédiat (Prochain rappel)
              </div>
              <p className="text-slate-700 dark:text-slate-200">
                {snapshot.comebackAdvice.priorityItemHint}
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900 dark:text-white">
                Ajustement gameplay &amp; macro
              </div>
              <p className="text-slate-700 dark:text-slate-200">
                {snapshot.comebackAdvice.gameplayPivot}
              </p>
            </div>
          </div>
        </section>
      ) : showTeamfight && snapshot.gameState === 'AHEAD' ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            Dynamique favorable (En avance)
          </div>
          <p className="text-slate-700 dark:text-slate-300">
            Convertissez votre avance économique : dépensez votre or avant les objectifs neutres et posez la vision profonde pour verrouiller la rivière.
          </p>
        </section>
      ) : null}

      {/* Rappel Checklist Entraînement Active pendant la partie */}
      {showTeamfight && trainingFocus && trainingFocus.goals.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              Checklist Entraînement Active ({trainingFocus.dominantRole} · Mode{' '}
              {trainingFocus.intensity === 'strict' ? 'Exigeant' : 'Standard'})
            </h2>
            <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Forme récente :{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {trainingFocus.formScore}/100
              </span>{' '}
              · {trainingFocus.formTier}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {trainingFocus.goals.map((goal) => (
              <div
                key={goal.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {goal.category}
                  </span>
                  <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {goal.passedCount}/{goal.totalCount} récents
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                  {goal.inGameReminder}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ÉTAPE 2 : STATISTIQUES ACTUELLES & COMPARATIF WIN RATE DANS LA VOIE */}
      {showLane && (snapshot.activeStats || snapshot.enemyPlayers.length > 0) && (
        <section className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16181D] p-5">
          {snapshot.activeStats && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Statistiques actuelles de {selfChampDisplay.displayName}
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Incluant runes & objets équipés
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: 'PV Max', value: `${snapshot.activeStats.maxHealth}` },
                  { label: 'Dégâts Att. (AD)', value: `${snapshot.activeStats.attackDamage}` },
                  { label: 'Puissance (AP)', value: `${snapshot.activeStats.abilityPower}` },
                  { label: 'Armure', value: `${snapshot.activeStats.armor}` },
                  { label: 'Résist. Mag.', value: `${snapshot.activeStats.magicResist}` },
                  { label: 'Vit. Attaque', value: `${snapshot.activeStats.attackSpeed}` },
                  { label: 'Vitesse dép.', value: `${snapshot.activeStats.moveSpeed}` },
                ].map((st) => (
                  <div
                    key={st.label}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3 py-2.5"
                  >
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{st.label}</div>
                    <div className="mt-1 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {st.value}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <LiveLaneMatchupTable
            riotId={riotId}
            region={region}
            playerChampionName={snapshot.championName}
            role={preferredRole}
            enemyPlayers={snapshot.enemyPlayers}
            spectatorParticipants={spectatorGame?.participants}
            lobbyScoutMap={lobbyScoutMap}
            champions={champions}
            matches={matches}
          />
        </section>
      )}

      {/* ÉTAPE 1 : RUNES ÉQUIPÉES */}
      {showStart && (snapshot.fullRunesSummary?.primaryTreeId || clientRunePage?.primaryTreeId) && (() => {
        const useLiveRunes = Boolean(
          snapshot.fullRunesSummary?.primaryTreeId &&
            (snapshot.source !== 'Simulation Live Client Data' || !clientRunePage),
        );
        const rs = snapshot.fullRunesSummary;
        const primaryTreeId = useLiveRunes ? rs!.primaryTreeId : clientRunePage!.primaryTreeId;
        const secondaryTreeId = useLiveRunes ? rs!.secondaryTreeId : clientRunePage!.secondaryTreeId;
        const keystoneId = useLiveRunes ? rs!.keystoneId : clientRunePage!.keystoneId;
        const selectedRuneIds = useLiveRunes ? rs!.selectedRuneIds : clientRunePage!.selectedRuneIds;
        const clientStatIds = clientRunePage?.selectedShardRowIndices
          ? [
              [5008, 5005, 5007][clientRunePage.selectedShardRowIndices[0]] ?? 5008,
              [5008, 5010, 5001][clientRunePage.selectedShardRowIndices[1]] ?? 5008,
              [5011, 5013, 5001][clientRunePage.selectedShardRowIndices[2]] ?? 5011,
            ]
          : [];
        const statRuneIds = useLiveRunes ? rs!.statRuneIds : clientStatIds;

        return (
          <VisualRunePage
            runeTrees={runeTrees}
            primaryTreeId={primaryTreeId}
            secondaryTreeId={secondaryTreeId}
            keystoneId={keystoneId}
            selectedRuneIds={selectedRuneIds}
            statRuneIds={statRuneIds}
            championName={useLiveRunes ? selfChampDisplay.displayName : undefined}
            pageTitle={
              !useLiveRunes && clientRunePage?.pageName
                ? `Page de runes client · « ${clientRunePage.pageName} »`
                : `Page de runes équipée en partie · ${selfChampDisplay.displayName}`
            }
            sourceLabel={useLiveRunes ? snapshot.source : clientRunePage?.sourceLabel}
          />
        );
      })()}

      {/* ÉTAPE 3 : ANALYSE DES OBJETS ENNEMIS & CONTRE-OBJETS DATA DRAGON */}
      {showTeamfight && (
      <>
      <LiveCounterItemsPanel
        enemyPlayers={enemyPlayers}
        allyPlayers={allyPlayers}
        selfChampionName={snapshot.championName}
        role={preferredRole}
        champions={champions}
        items={items}
        patchVersion={patchVersion}
        activeStats={snapshot.activeStats}
        currentGold={snapshot.currentGold}
        gameMode={snapshot.gameMode}
      />

      {/* Équipement actuel des 10 joueurs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {[
          {
            title: 'Votre équipe · Équipements actuels',
            icon: Shield,
            iconClass: 'text-sky-500',
            rows: allyPlayers,
            showDanger: false,
          },
          {
            title: 'Équipe adverse · Équipements & Menaces',
            icon: Swords,
            iconClass: 'text-rose-500',
            rows: enemyPlayers,
            showDanger: true,
          },
        ].map((teamBlock) => {
          const Icon = teamBlock.icon;
          return (
            <section
              key={teamBlock.title}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Icon className={`w-4 h-4 ${teamBlock.iconClass}`} aria-hidden="true" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {teamBlock.title}
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4 text-left font-medium">Champion</th>
                      <th className="py-2.5 px-2 text-right font-medium">Niv</th>
                      <th className="py-2.5 px-2 text-right font-medium">K/D/A</th>
                      <th className="py-2.5 px-2 text-right font-medium">CS</th>
                      <th className="py-2.5 px-3 text-left font-medium">Équipement actuel</th>
                      {teamBlock.showDanger && (
                        <th className="py-2.5 px-4 text-right font-medium">Menace</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {teamBlock.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={teamBlock.showDanger ? 6 : 5}
                          className="py-6 px-4 text-center text-xs text-slate-500 dark:text-slate-400"
                        >
                          Aucun champion adverse dans cette session (Outil d’entraînement solo sans bot IA).
                        </td>
                      </tr>
                    ) : (
                      teamBlock.rows.map((player, idx) => {
                        const rowChamp = getChampDisplay(player.championName);
                        const isSelf =
                          player.championName.toLowerCase() === snapshot.championName.toLowerCase();
                        const totalItemsGold = player.items.reduce((acc, it) => acc + (it.price || 0), 0);
                        const rowSpell1 = getSummonerSpellById(player.spell1Id ?? 4);
                        const rowSpell2 = getSummonerSpellById(player.spell2Id ?? 14);
                        return (
                          <tr
                            key={`${player.championName}-${idx}`}
                            className={
                              isSelf
                                ? 'bg-amber-500/5 dark:bg-amber-500/10'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                            }
                          >
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedKitChampName(player.championName);
                                    setShowAllAbilitiesPanel(true);
                                    abilitiesSectionRef.current?.scrollIntoView({
                                      behavior: 'smooth',
                                      block: 'center',
                                    });
                                  }}
                                  title={`Voir les compétences (Passif, A/Z/E/R) de ${rowChamp.displayName}`}
                                  className="shrink-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/60"
                                >
                                  <SafeGameIcon
                                    key={`live-champ-${player.championName}-${idx}`}
                                    src={rowChamp.imageUrl}
                                    alt={rowChamp.displayName}
                                    fallbackLabel={rowChamp.displayName}
                                    sizeClass="w-8 h-8"
                                  />
                                </button>
                                <div className="flex flex-col gap-0.5 shrink-0" title={`${rowSpell1.nameFr} + ${rowSpell2.nameFr}`}>
                                  <SafeGameIcon
                                    src={getSummonerSpellIconUrl(rowSpell1.id, patchVersion)}
                                    alt={rowSpell1.nameFr}
                                    fallbackLabel={rowSpell1.shortLabel}
                                    sizeClass="w-3.5 h-3.5 rounded"
                                  />
                                  <SafeGameIcon
                                    src={getSummonerSpellIconUrl(rowSpell2.id, patchVersion)}
                                    alt={rowSpell2.nameFr}
                                    fallbackLabel={rowSpell2.shortLabel}
                                    sizeClass="w-3.5 h-3.5 rounded"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                                    {rowChamp.displayName}
                                    {isSelf && (
                                      <span className="ml-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                        (Vous)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {player.riotId !== player.championName ? player.riotId : player.position}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {player.level}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                              {player.kills}/{player.deaths}/{player.assists}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              {player.cs}
                            </td>
                            <td className="py-2.5 px-3">
                              {player.items.length === 0 ? (
                                <span className="text-[11px] text-slate-400">Aucun objet</span>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1">
                                  {player.items.slice(0, 7).map((it, itemIdx) => (
                                    <div
                                      key={`${player.championName}-item-${it.itemId}-${itemIdx}`}
                                      title={`${it.displayName}${it.price ? ` (${it.price} po)` : ''}`}
                                    >
                                      <SafeGameIcon
                                        src={getItemIcon(it.itemId)}
                                        alt={it.displayName}
                                        fallbackLabel={it.displayName}
                                        sizeClass="w-7 h-7"
                                      />
                                    </div>
                                  ))}
                                  {totalItemsGold > 0 && (
                                    <span className="ml-1 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                      {totalItemsGold.toLocaleString('fr-FR')} po
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            {teamBlock.showDanger && (
                              <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                <span
                                  className={`font-semibold ${
                                    player.dangerLevel === 'Élevé'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : player.dangerLevel === 'Moyen'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {player.dangerLevel}
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      </>
      )}
          </>
        );
      })()}

      {/* Fin de vue LiveCoachView */}
    </div>
  );
}
