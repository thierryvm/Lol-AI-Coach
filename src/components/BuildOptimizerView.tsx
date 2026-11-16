import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Brain,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FlaskConical,
  Gauge,
  Globe,
  Info,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Radar,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { postCoachJson } from '../engines/aiConfig.ts';
import { computeBuildRecommendation } from '../engines/buildEngine.ts';
import { computeStatAtLevel, isJunglerChampion } from '../engines/championEngine.ts';
import {
  computeFullChampionBuildStats,
  computePerItemImpactMatrix,
  extractRawDataDragonItemDetails,
  formatItemStatTags,
  parseExactItemStats,
  runCombinatorialBuildAndRuneSearch,
  simulateCombatDamageAgainstTarget,
  validateRuneConfiguration,
  type CombatTargetConfig,
} from '../engines/buildSimulator.ts';
import {
  buildDefaultSelectionForTrees,
  compareRunePages,
  selectionFromRecommendation,
  type RunePageSelection,
} from '../engines/runeEngine.ts';
import type {
  ChampionSummary,
  DDragonBootstrap,
  DetectedRunePage,
  GameModeContext,
  GameScenario,
  ItemData,
  PlayerProfileResponse,
  PlayerTendencies,
  RiotPlatform,
  Role,
} from '../engines/types.ts';
import {
  downloadWindowsBridgeBat,
  extractCompositionFromBridgePayload,
  extractCompositionFromSpectator,
  extractDetectedRunePage,
  type DetectedMatchComposition,
  UNIVERSAL_STATE_CLIPBOARD_CMD,
} from '../utils/liveBridge.ts';
import { PopularBuildSearch } from './PopularBuildSearch.tsx';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { VisualRunePage } from './VisualRunePage.tsx';

interface BuildOptimizerViewProps {
  ddragon: DDragonBootstrap;
  tendencies?: PlayerTendencies;
  initialChampionName?: string;
  initialRole?: Role;
  riotId: string;
  region: RiotPlatform;
  activeGame?: PlayerProfileResponse['activeGame'] | null;
  onActiveGameDetected?: (game: PlayerProfileResponse['activeGame']) => void;
}

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
const ENEMY_SLOT_LABELS = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const PICKER_TAG_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'Tous', label: 'Tous' },
  { id: 'Fighter', label: 'Combattants' },
  { id: 'Mage', label: 'Mages' },
  { id: 'Assassin', label: 'Assassins' },
  { id: 'Tank', label: 'Tanks' },
  { id: 'Marksman', label: 'Tireurs' },
  { id: 'Support', label: 'Supports' },
  { id: 'Jungler', label: 'Junglers' },
];

const SCENARIO_OPTIONS: Array<{ id: GameScenario; label: string; hint: string }> = [
  { id: 'balanced', label: 'Équilibré (50/50)', hint: 'Rythme standard' },
  { id: 'ahead', label: 'En avance (Snowball)', hint: 'Scaling & dégâts max' },
  { id: 'behind', label: 'Je me fais dominer', hint: 'Objets éco & survie' },
];

type ItemFilterKey =
  | 'all'
  | 'boots'
  | 'budget'
  | 'tank'
  | 'armor'
  | 'mr'
  | 'ad'
  | 'ap'
  | 'haste'
  | 'antiheal';

const ITEM_FILTER_OPTIONS: Array<{ id: ItemFilterKey; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'boots', label: 'Bottes' },
  { id: 'budget', label: 'Éco ≤ 2650 po' },
  { id: 'tank', label: 'PV / Tank' },
  { id: 'armor', label: 'Armure' },
  { id: 'mr', label: 'Résist. Mag.' },
  { id: 'ad', label: 'AD / Crit' },
  { id: 'ap', label: 'Puissance (AP)' },
  { id: 'haste', label: 'Hâte / CDR' },
  { id: 'antiheal', label: 'Anti-soin' },
];

function SlotPortraitCard({
  champion,
  slotLabel,
  subLabel,
  emptyLabel = 'En attente...',
  accentTone = 'amber',
  onClick,
  onClear,
}: {
  champion: ChampionSummary | null;
  slotLabel: string;
  subLabel?: string;
  emptyLabel?: string;
  accentTone?: 'amber' | 'sky' | 'rose';
  onClick: () => void;
  onClear?: () => void;
}) {
  const [imgStage, setImgStage] = useState<'loading' | 'square' | 'fallback'>('loading');

  useEffect(() => {
    setImgStage('loading');
  }, [champion?.id]);

  const borderHover =
    accentTone === 'sky'
      ? 'border-sky-500/40 hover:border-sky-400'
      : accentTone === 'rose'
        ? 'border-slate-200 dark:border-slate-800 hover:border-rose-500/70'
        : 'border-amber-500/45 hover:border-amber-400';

  const kickerColor =
    accentTone === 'sky'
      ? 'text-sky-300'
      : accentTone === 'rose'
        ? 'text-rose-300'
        : 'text-amber-300';

  if (!champion) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative aspect-[3/4] w-full rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0D121C] hover:border-amber-500/70 transition-colors flex flex-col items-center justify-between p-2.5 text-center"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {slotLabel}
        </span>
        <div className="w-10 h-10 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-amber-500 transition-colors">
          <Plus className="w-4 h-4" />
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 group-hover:text-amber-500 transition-colors">
          {emptyLabel}
        </span>
      </button>
    );
  }

  const src =
    imgStage === 'loading'
      ? `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`
      : champion.imageUrl;

  return (
    <div
      className={`group relative aspect-[3/4] w-full rounded-xl overflow-hidden border transition-all bg-[#0B0E14] ${borderHover}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full h-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {imgStage === 'fallback' ? (
          <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center text-sm font-bold text-slate-300">
            {champion.name.slice(0, 3).toUpperCase()}
          </div>
        ) : (
          <img
            src={src}
            alt={champion.name}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgStage((prev) => (prev === 'loading' ? 'square' : 'fallback'))}
            className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/35 to-black/40"
        />
        <div className="absolute inset-x-0 top-0 px-2.5 pt-2 flex items-center justify-between gap-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wider truncate ${kickerColor}`}>
            {slotLabel}
          </span>
          <Pencil
            className="w-3 h-3 text-white/70 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            aria-hidden="true"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5 pt-6">
          <div className="text-xs font-bold text-white truncate leading-tight">
            {champion.name}
          </div>
          <div className="text-[10px] text-slate-300 truncate mt-0.5">
            {subLabel || champion.tags.slice(0, 2).join(' · ')}
          </div>
        </div>
      </button>
      {onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          title="Retirer le partenaire"
          aria-label="Retirer le partenaire"
          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-slate-200 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function PickerPortraitTile({
  champion,
  selected,
  onSelect,
}: {
  champion: ChampionSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const [imgStage, setImgStage] = useState<'loading' | 'square' | 'fallback'>('loading');
  const src =
    imgStage === 'loading'
      ? `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champion.id}_0.jpg`
      : champion.imageUrl;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative aspect-[3/4] rounded-xl overflow-hidden text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
        selected
          ? 'border-2 border-amber-400 shadow-lg shadow-amber-500/20'
          : 'border border-slate-200 dark:border-slate-800 hover:border-amber-500/70'
      }`}
    >
      {imgStage === 'fallback' ? (
        <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center text-xs font-bold text-slate-300">
          {champion.name.slice(0, 3).toUpperCase()}
        </div>
      ) : (
        <img
          src={src}
          alt={champion.name}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgStage((prev) => (prev === 'loading' ? 'square' : 'fallback'))}
          className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent"
      />
      {selected && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-[9px] font-bold text-slate-950 uppercase tracking-wide">
          Actuel
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-4">
        <div className="text-[11px] font-semibold text-white truncate leading-tight">
          {champion.name}
        </div>
        <div className="text-[9px] text-slate-300 truncate mt-0.5">
          {champion.tags.slice(0, 2).join(' · ')}
        </div>
      </div>
    </button>
  );
}

const GAME_MODE_OPTIONS: Array<{ id: GameModeContext; label: string }> = [
  { id: 'CLASSIC', label: 'Faille (Classée / Normale)' },
  { id: 'SWIFTPLAY', label: 'Partie Accélérée' },
  { id: 'ARAM', label: 'ARAM' },
];

const PRESET_COMPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Full AD / Assassin', ids: ['Aatrox', 'LeeSin', 'Zed', 'Jinx', 'Nautilus'] },
  { label: 'Double Tank / Contrôle', ids: ['Ornn', 'Sejuani', 'Orianna', 'Ashe', 'Leona'] },
  { label: 'Poke Magique / Sustain', ids: ['Vladimir', 'Nidalee', 'Syndra', 'Ezreal', 'Soraka'] },
];

function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
  const trimmed = riotId.trim();
  if (trimmed.includes('#')) {
    const [gameName, tagLine] = trimmed.split('#');
    return { gameName: gameName || 'Boulvae', tagLine: tagLine || 'EUW' };
  }
  return { gameName: trimmed || 'Boulvae', tagLine: 'EUW' };
}

export function BuildOptimizerView({
  ddragon,
  tendencies,
  initialChampionName,
  initialRole = 'SUPPORT',
  riotId,
  region,
  activeGame,
  onActiveGameDetected,
}: BuildOptimizerViewProps) {
  const findChamp = (nameOrId?: string) => {
    if (!nameOrId) return ddragon.champions.find((c) => c.id === 'TahmKench') || ddragon.champions[0];
    return (
      ddragon.champions.find(
        (c) =>
          c.id.toLowerCase() === nameOrId.toLowerCase() ||
          c.name.toLowerCase() === nameOrId.toLowerCase(),
      ) || ddragon.champions[0]
    );
  };

  const [playerChampId, setPlayerChampId] = useState<string>(() => findChamp(initialChampionName).id);
  const [role, setRole] = useState<Role>(initialRole);
  const [gameMode, setGameMode] = useState<GameModeContext>('CLASSIC');
  const [scenario, setScenario] = useState<GameScenario>('balanced');
  const [duoPartnerId, setDuoPartnerId] = useState<string | null>('Jinx');
  const [enemyIds, setEnemyIds] = useState<string[]>(['Aatrox', 'Viego', 'Zed', 'Kaisa', 'Leona']);
  const [bannedChampIds, setBannedChampIds] = useState<string[]>([]);
  const [detectedAllies, setDetectedAllies] = useState<string[]>([]);
  const [detectionMeta, setDetectionMeta] = useState<{
    sourceLabel: string;
    phaseLabel: string;
    modeLabel: string;
    checkedAt: string;
  } | null>(null);

  const [showLiveSyncPanel, setShowLiveSyncPanel] = useState(false);
  const [spectatorChecking, setSpectatorChecking] = useState(false);
  const [bridgeAutoActive, setBridgeAutoActive] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [detectedRunePage, setDetectedRunePage] = useState<DetectedRunePage | null>(null);
  const [runeViewMode, setRuneViewMode] = useState<'recommended' | 'current'>('recommended');
  const [customRuneSelection, setCustomRuneSelection] = useState<RunePageSelection | null>(null);
  const [runeSimLevel, setRuneSimLevel] = useState<number>(11);

  // Atelier d'équipement interactif (6 emplacements + stacks Cœuracier + modale Data Dragon)
  const [customBuildItemIds, setCustomBuildItemIds] = useState<(string | null)[] | null>(null);
  const [heartsteelStacksHp, setHeartsteelStacksHp] = useState<number>(300);
  const [itemPickerSlotIdx, setItemPickerSlotIdx] = useState<number | null>(null);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [itemFilterKey, setItemFilterKey] = useState<ItemFilterKey>('all');

  // Simulateur d'impact par objet (Data Dragon brut) & dégâts infligés en temps réel
  const [combatDurationSec, setCombatDurationSec] = useState<number>(6);
  const [combatSpellCasts, setCombatSpellCasts] = useState<number>(2);
  const [targetArmorTier, setTargetArmorTier] = useState<'base' | 'standard' | 'tank' | 'custom'>('standard');
  const [selectedEnemyTargetId, setSelectedEnemyTargetId] = useState<string>('Aatrox');
  const [customTargetStats, setCustomTargetStats] = useState<{ hp: number; armor: number; mr: number }>({
    hp: 2100,
    armor: 110,
    mr: 75,
  });
  const [inspectedItemSlotIdx, setInspectedItemSlotIdx] = useState<number | null>(null);

  // Explication IA Gemini des passifs uniques d'objets et modification des formules du champion
  type PassiveExplainAnchor =
    | 'recommended-core'
    | 'recommended-sit'
    | 'recommended-web'
    | 'atelier'
    | 'simulator';
  interface PassiveAiExplanation {
    passiveTitle: string;
    coreMechanism: string;
    formulaModifications: string[];
    liveNumericProof: string;
    executionTip: string;
  }
  const [activePassiveExplain, setActivePassiveExplain] = useState<{
    item: ItemData;
    anchor: PassiveExplainAnchor;
  } | null>(null);
  const [passiveExplainCache, setPassiveExplainCache] = useState<Record<string, PassiveAiExplanation>>({});
  const [passiveExplainLoadingKey, setPassiveExplainLoadingKey] = useState<string | null>(null);
  const [passiveExplainError, setPassiveExplainError] = useState<string | null>(null);

  // Objets populaires trouvés via Recherche de Builds (Google Search U.GG / OP.GG)
  const [popularWebItems, setPopularWebItems] = useState<ItemData[]>([]);
  const [popularWebMeta, setPopularWebMeta] = useState<{
    summary: string;
    sources: Array<{ title: string; uri: string }>;
  } | null>(null);

  const manualOverrideRef = useRef(false);

  const [pickerTarget, setPickerTarget] = useState<{
    type: 'player' | 'duo' | 'enemy';
    index?: number;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickerTag, setPickerTag] = useState('Tous');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<{
    headline?: string;
    earlyGamePlan?: string;
    midGameSpike?: string;
    teamfightPositioning?: string;
    keyReminders?: string[];
  } | null>(null);

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  const applyDetectedComposition = (comp: DetectedMatchComposition) => {
    if (comp.playerChampId) {
      setPlayerChampId(comp.playerChampId);
    }
    if (comp.role) {
      setRole(comp.role);
    }
    setGameMode(comp.gameMode);
    setDuoPartnerId(comp.duoPartnerId);

    // Remplit exactement les champions adverses détectés (les slots non révélés en draft restent vides '')
    const paddedEnemies = Array.from({ length: 5 }, (_, i) => comp.enemyChampIds[i] || '');
    setEnemyIds(paddedEnemies);
    setBannedChampIds(comp.bannedChampIds);
    setDetectedAllies(comp.allyChampIds);
    setDetectionMeta({
      sourceLabel: comp.sourceLabel,
      phaseLabel: comp.phaseLabel,
      modeLabel: comp.modeLabel,
      checkedAt: new Date().toLocaleTimeString('fr-FR'),
    });
    setAiPlan(null);
  };

  // Auto-détection au lancement si Spectator-V5 a déjà trouvé une partie active lors de la synchro
  useEffect(() => {
    if (manualOverrideRef.current) return;
    if (activeGame?.inGame) {
      const comp = extractCompositionFromSpectator(activeGame, ddragon.champions, riotId);
      if (comp) {
        applyDetectedComposition(comp);
      }
    }
  }, [activeGame, ddragon.champions, riotId]);

  const handleDetectFromRiot = async () => {
    setSpectatorChecking(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const { gameName, tagLine } = parseRiotId(riotId);
      const res = await fetch(
        `/api/riot/active-game?gameName=${encodeURIComponent(gameName)}&tagLine=${encodeURIComponent(
          tagLine,
        )}&region=${encodeURIComponent(region)}`,
      );
      const data = (await res.json()) as PlayerProfileResponse['activeGame'] & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur Spectator-V5.');
      onActiveGameDetected?.(data);

      if (!data.inGame) {
        setSyncMessage(
          `Aucune partie publique en cours trouvée sur Riot Spectator-V5 pour ${riotId}. Remarque : pendant la sélection des champions (Draft/Classée/ARAM) ou en Outil d'entraînement, utilisez la détection locale (lol-coach-bridge.bat) ci-dessous.`,
        );
        return;
      }

      const comp = extractCompositionFromSpectator(data, ddragon.champions, riotId);
      if (comp) {
        manualOverrideRef.current = false;
        applyDetectedComposition(comp);
        setSyncMessage(
          `Composition importée depuis Riot Spectator-V5 (${comp.modeLabel}) : ${comp.enemyChampIds.length} adversaires et ${comp.bannedChampIds.length} ban(s) détectés.`,
        );
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Erreur lors de la détection Riot.');
    } finally {
      setSpectatorChecking(false);
    }
  };

  // Récupère automatiquement les runes actives si une vraie session Live a déjà été ingérée côté serveur
  useEffect(() => {
    let active = true;
    fetch('/api/live/latest')
      .then((r) => (r.ok ? r.json() : null))
      .then((snap) => {
        if (!active || !snap || snap.source === 'Simulation Live Client Data') return;
        const rs = snap.fullRunesSummary;
        if (!rs?.primaryTreeId) return;
        const extracted = extractDetectedRunePage({
          activePlayer: {
            fullRunes: {
              keystone: rs.keystoneId ? { id: rs.keystoneId, displayName: rs.keystoneName || '' } : undefined,
              primaryRuneTree: { id: rs.primaryTreeId, displayName: '' },
              secondaryRuneTree: rs.secondaryTreeId ? { id: rs.secondaryTreeId, displayName: '' } : undefined,
              generalRunes: (rs.selectedRuneIds || []).map((id: number) => ({ id, displayName: String(id) })),
              statRunes: (rs.statRuneIds || []).map((id: number) => ({ id, rawDescription: '' })),
            },
          },
        });
        if (extracted) {
          setDetectedRunePage(extracted);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const pollLocalBridgeState = async () => {
    setSyncError(null);
    try {
      const healthRes = await fetch('http://127.0.0.1:38421/health');
      if (!healthRes.ok) throw new Error('Bridge down');

      const res = await fetch('http://127.0.0.1:38421/state');
      if (!res.ok) {
        setSyncMessage(
          'Pont Windows connecté (port 38421), mais aucune session LoL active pour le moment.',
        );
        return;
      }
      const payload = await res.json();
      const runePage = extractDetectedRunePage(payload);
      if (runePage) {
        setDetectedRunePage(runePage);
      }

      const comp = extractCompositionFromBridgePayload(payload, ddragon.champions);
      if (!comp) {
        if (runePage) {
          setSyncMessage(
            `Pont Windows v3 connecté (${payload.phase || 'Salon'}) · Page de runes active détectée : « ${
              runePage.pageName || 'Page LoL'
            } ». Cliquez sur « Votre page équipée » ci-dessous pour la consulter.`,
          );
        } else {
          setSyncMessage(
            `Pont Windows v3 connecté · Client LoL en phase « ${payload.phase || 'Salon'} ». Lancez une sélection de champions, une partie ou l'Outil d'entraînement pour synchroniser automatiquement.`,
          );
        }
        return;
      }
      manualOverrideRef.current = false;
      applyDetectedComposition(comp);
      setSyncMessage(
        `${comp.phaseLabel} (${comp.modeLabel}) synchronisée en direct : ${comp.enemyChampIds.length}/5 adversaires révélés, ${comp.bannedChampIds.length} ban(s)${
          runePage ? ` · Runes « ${runePage.pageName || 'Actives'} » détectées` : ''
        }.`,
      );
    } catch {
      if (isInsideIframe) {
        setShowLiveSyncPanel(true);
        setSyncError(
          'Dans la fenêtre d’aperçu Google AI Studio (iframe), Chrome bloque l’accès vers 127.0.0.1:38421. Cliquez sur « Ouvrir hors iframe » ci-dessous ou collez le JSON avec Ctrl+V.',
        );
      } else {
        setSyncError(
          'Pont local 127.0.0.1:38421 inaccessible. Téléchargez et lancez le nouveau lol-coach-bridge.bat sur Windows.',
        );
      }
    }
  };

  useEffect(() => {
    if (!bridgeAutoActive) return;
    pollLocalBridgeState();
    const id = window.setInterval(pollLocalBridgeState, 3000);
    return () => window.clearInterval(id);
  }, [bridgeAutoActive, ddragon.champions]);

  const ingestPastedBridgeJson = async (raw: string) => {
    setSyncError(null);
    setSyncMessage(null);
    try {
      const parsed = JSON.parse(raw);
      const runePage = extractDetectedRunePage(parsed);
      if (runePage) {
        setDetectedRunePage(runePage);
      }

      const comp = extractCompositionFromBridgePayload(parsed, ddragon.champions);
      if (!comp) {
        if (runePage) {
          setPasteText('');
          setShowLiveSyncPanel(false);
          setRuneViewMode('current');
          setSyncMessage(
            `Page de runes « ${runePage.pageName || 'Client LoL'} » détectée (${runePage.sourceLabel}) et affichée ci-dessous ! (Aucune partie ou sélection active pour le moment).`,
          );
          return;
        }
        throw new Error(
          'Aucune sélection de champions, page de runes ni partie active trouvée dans ce JSON (vérifiez que votre client LoL ou votre partie est ouvert).',
        );
      }
      manualOverrideRef.current = false;
      applyDetectedComposition(comp);
      setPasteText('');
      setShowLiveSyncPanel(false);
      setSyncMessage(
        `${comp.phaseLabel} (${comp.modeLabel}) appliquée : ${comp.enemyChampIds.length} adversaire(s), ${comp.bannedChampIds.length} ban(s)${
          runePage ? ` · Runes « ${runePage.pageName || 'Actives'} » détectées` : ''
        }.`,
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'JSON invalide.');
    }
  };

  const handleCopyCmd = async () => {
    try {
      await navigator.clipboard.writeText(UNIVERSAL_STATE_CLIPBOARD_CMD);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 2000);
    } catch {
      setSyncError('Sélectionnez la commande et copiez avec Ctrl+C.');
    }
  };

  const playerChampion = useMemo(
    () => findChamp(playerChampId),
    [playerChampId, ddragon.champions],
  );

  const duoPartner = useMemo(
    () => (duoPartnerId ? ddragon.champions.find((c) => c.id === duoPartnerId) || null : null),
    [duoPartnerId, ddragon.champions],
  );

  const enemyChampions = useMemo(
    () =>
      enemyIds
        .filter(Boolean)
        .map((id) => ddragon.champions.find((c) => c.id === id))
        .filter((c): c is ChampionSummary => Boolean(c)),
    [enemyIds, ddragon.champions],
  );

  const bannedChampions = useMemo(
    () =>
      bannedChampIds
        .map((id) => ddragon.champions.find((c) => c.id === id))
        .filter((c): c is ChampionSummary => Boolean(c)),
    [bannedChampIds, ddragon.champions],
  );

  const recommendation = useMemo(
    () =>
      computeBuildRecommendation({
        patchVersion: ddragon.version,
        gameMode,
        scenario,
        playerChampion,
        duoPartner,
        role,
        enemies: enemyChampions,
        items: ddragon.items,
        runeTrees: ddragon.runeTrees,
        tendencies,
      }),
    [ddragon, gameMode, scenario, playerChampion, duoPartner, role, enemyChampions, tendencies],
  );

  useEffect(() => {
    setCustomRuneSelection(null);
    setCustomBuildItemIds(null);
  }, [playerChampion.id, role, gameMode]);

  useEffect(() => {
    setCustomBuildItemIds(null);
  }, [scenario]);

  const metaRuneSelection = useMemo(
    () => selectionFromRecommendation(recommendation.runes, ddragon.runeTrees),
    [recommendation.runes, ddragon.runeTrees],
  );

  const activeSandboxSelection = customRuneSelection || metaRuneSelection;

  const recommendedBuildItems = useMemo<ItemData[]>(
    () => [
      recommendation.boots.item,
      ...recommendation.coreItems.map((c) => c.item),
      ...recommendation.situationalItems.slice(0, 2).map((s) => s.item),
    ],
    [recommendation],
  );

  const itemByIdMap = useMemo(() => {
    const m = new Map<string, ItemData>();
    for (const it of ddragon.items) {
      m.set(it.id, it);
    }
    return m;
  }, [ddragon.items]);

  const sandboxSlots = useMemo<(ItemData | null)[]>(() => {
    if (!customBuildItemIds) {
      return Array.from({ length: 6 }, (_, i) => recommendedBuildItems[i] || null);
    }
    return customBuildItemIds.map((id) => (id ? itemByIdMap.get(id) || null : null));
  }, [customBuildItemIds, recommendedBuildItems, itemByIdMap]);

  const sandboxActiveItems = useMemo(
    () => sandboxSlots.filter((it): it is ItemData => Boolean(it)),
    [sandboxSlots],
  );

  const isBuildModified = customBuildItemIds !== null;

  const sandboxStats = useMemo(
    () =>
      computeFullChampionBuildStats({
        champion: playerChampion,
        role,
        level: runeSimLevel,
        items: sandboxActiveItems,
        runeSelection: activeSandboxSelection,
        threats: recommendation.threatSummary,
        heartsteelStacksHp,
      }),
    [
      playerChampion,
      role,
      runeSimLevel,
      sandboxActiveItems,
      activeSandboxSelection,
      recommendation.threatSummary,
      heartsteelStacksHp,
    ],
  );

  const recommendedStats = useMemo(
    () =>
      computeFullChampionBuildStats({
        champion: playerChampion,
        role,
        level: runeSimLevel,
        items: recommendedBuildItems,
        runeSelection: metaRuneSelection,
        threats: recommendation.threatSummary,
        heartsteelStacksHp,
      }),
    [
      playerChampion,
      role,
      runeSimLevel,
      recommendedBuildItems,
      metaRuneSelection,
      recommendation.threatSummary,
      heartsteelStacksHp,
    ],
  );

  const combinatorialResult = useMemo(
    () =>
      runCombinatorialBuildAndRuneSearch({
        gameMode,
        playerChampion,
        duoPartner,
        role,
        threats: recommendation.threatSummary,
        items: ddragon.items,
        runeTrees: ddragon.runeTrees,
        baseRuneSelection: metaRuneSelection,
        simLevel: runeSimLevel,
      }),
    [
      gameMode,
      playerChampion,
      duoPartner,
      role,
      recommendation.threatSummary,
      ddragon.items,
      ddragon.runeTrees,
      metaRuneSelection,
      runeSimLevel,
    ],
  );

  const activeCombatTarget = useMemo<CombatTargetConfig>(() => {
    if (targetArmorTier === 'custom') {
      return {
        id: 'custom',
        name: 'Mannequin personnalisé',
        hp: customTargetStats.hp,
        armor: customTargetStats.armor,
        mr: customTargetStats.mr,
      };
    }
    const matchedEnemy =
      enemyChampions.find((e) => e.id === selectedEnemyTargetId) || enemyChampions[0] || null;
    if (!matchedEnemy) {
      return {
        id: 'dummy',
        name: 'Cible standard',
        hp: 2100,
        armor: 100,
        mr: 70,
      };
    }
    const bonusHp = targetArmorTier === 'tank' ? 950 : targetArmorTier === 'standard' ? 350 : 0;
    const bonusArmor = targetArmorTier === 'tank' ? 85 : targetArmorTier === 'standard' ? 35 : 0;
    const bonusMr = targetArmorTier === 'tank' ? 65 : targetArmorTier === 'standard' ? 25 : 0;
    return {
      id: matchedEnemy.id,
      name: `${matchedEnemy.name} (Niv.${runeSimLevel})`,
      hp: Math.round(
        computeStatAtLevel(matchedEnemy.stats.hp, matchedEnemy.stats.hpperlevel, runeSimLevel) +
          bonusHp,
      ),
      armor: Math.round(
        computeStatAtLevel(matchedEnemy.stats.armor, matchedEnemy.stats.armorperlevel, runeSimLevel) +
          bonusArmor,
      ),
      mr: Math.round(
        computeStatAtLevel(
          matchedEnemy.stats.spellblock,
          matchedEnemy.stats.spellblockperlevel,
          runeSimLevel,
        ) + bonusMr,
      ),
    };
  }, [targetArmorTier, customTargetStats, enemyChampions, selectedEnemyTargetId, runeSimLevel]);

  const combatDamageResult = useMemo(
    () =>
      simulateCombatDamageAgainstTarget({
        champion: playerChampion,
        role,
        level: runeSimLevel,
        items: sandboxActiveItems,
        runeSelection: activeSandboxSelection,
        target: activeCombatTarget,
        durationSec: combatDurationSec,
        spellCasts: combatSpellCasts,
        heartsteelStacksHp,
        threats: recommendation.threatSummary,
      }),
    [
      playerChampion,
      role,
      runeSimLevel,
      sandboxActiveItems,
      activeSandboxSelection,
      activeCombatTarget,
      combatDurationSec,
      combatSpellCasts,
      heartsteelStacksHp,
      recommendation.threatSummary,
    ],
  );

  const perItemImpactRows = useMemo(
    () =>
      computePerItemImpactMatrix({
        champion: playerChampion,
        role,
        level: runeSimLevel,
        slots: sandboxSlots,
        runeSelection: activeSandboxSelection,
        target: activeCombatTarget,
        durationSec: combatDurationSec,
        spellCasts: combatSpellCasts,
        heartsteelStacksHp,
        threats: recommendation.threatSummary,
      }),
    [
      playerChampion,
      role,
      runeSimLevel,
      sandboxSlots,
      activeSandboxSelection,
      activeCombatTarget,
      combatDurationSec,
      combatSpellCasts,
      heartsteelStacksHp,
      recommendation.threatSummary,
    ],
  );

  const activeInspectedItemRow = useMemo(() => {
    if (perItemImpactRows.length === 0) return null;
    if (inspectedItemSlotIdx !== null) {
      const exact = perItemImpactRows.find((r) => r.slotIndex === inspectedItemSlotIdx);
      if (exact) return exact;
    }
    const duskOrCore =
      perItemImpactRows.find((r) => r.item.id === '2510') ||
      perItemImpactRows.find((r) => r.slotIndex > 0) ||
      perItemImpactRows[0];
    return duskOrCore || null;
  }, [perItemImpactRows, inspectedItemSlotIdx]);

  const runeComparison = useMemo(
    () =>
      compareRunePages({
        champ: playerChampion,
        role,
        threats: recommendation.threatSummary,
        runeTrees: ddragon.runeTrees,
        custom: activeSandboxSelection,
        meta: metaRuneSelection,
        level: runeSimLevel,
      }),
    [
      playerChampion,
      role,
      recommendation.threatSummary,
      ddragon.runeTrees,
      activeSandboxSelection,
      metaRuneSelection,
      runeSimLevel,
    ],
  );

  const purchasableCatalog = useMemo(() => {
    const mapKey = gameMode === 'ARAM' ? '12' : '11';
    const raw = ddragon.items.filter(
      (it) =>
        Number(it.id) < 100000 &&
        it.gold.purchasable &&
        it.gold.total >= 300 &&
        !it.tags.includes('Consumable') &&
        !it.tags.includes('Trinket') &&
        (!it.maps || it.maps[mapKey] !== false),
    );
    const dedup = new Map<string, ItemData>();
    for (const it of raw) {
      const k = it.name.trim().toLowerCase();
      const prev = dedup.get(k);
      if (!prev || Number(it.id) < Number(prev.id)) dedup.set(k, it);
    }
    return Array.from(dedup.values()).sort((a, b) => b.gold.total - a.gold.total);
  }, [ddragon.items, gameMode]);

  const filteredCatalogItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    return purchasableCatalog.filter((it) => {
      if (q) {
        const matchesName =
          it.name.toLowerCase().includes(q) || it.plaintext.toLowerCase().includes(q);
        if (!matchesName) return false;
      }
      if (itemFilterKey === 'all') return true;
      const st = parseExactItemStats(it);
      const txt = `${it.name} ${it.description}`.toLowerCase();
      if (itemFilterKey === 'boots') return it.tags.includes('Boots');
      if (itemFilterKey === 'budget') return !it.tags.includes('Boots') && it.gold.total >= 1800 && it.gold.total <= 2650;
      if (itemFilterKey === 'tank') return st.hp >= 250 || st.armor >= 35 || st.mr >= 35;
      if (itemFilterKey === 'armor') return st.armor > 0;
      if (itemFilterKey === 'mr') return st.mr > 0;
      if (itemFilterKey === 'ad') return st.ad > 0 || st.critChancePct > 0;
      if (itemFilterKey === 'ap') return st.ap > 0;
      if (itemFilterKey === 'haste') return st.abilityHaste > 0;
      if (itemFilterKey === 'antiheal') {
        return Boolean(txt.match(/hémorragie|blessures graves|épineuse|thornmail|mortal|morello|bourreau/));
      }
      return true;
    });
  }, [purchasableCatalog, itemSearchQuery, itemFilterKey]);

  const handleAssignItemToSlot = (slotIdx: number, item: ItemData | null) => {
    setCustomBuildItemIds((prev) => {
      const baseIds =
        prev || Array.from({ length: 6 }, (_, i) => recommendedBuildItems[i]?.id || null);
      const next = [...baseIds];
      next[slotIdx] = item ? item.id : null;
      return next;
    });
    setItemPickerSlotIdx(null);
  };

  const handleQuickTestItem = (item: ItemData) => {
    setCustomBuildItemIds((prev) => {
      const baseIds =
        prev || Array.from({ length: 6 }, (_, i) => recommendedBuildItems[i]?.id || null);
      if (baseIds.includes(item.id)) return baseIds;
      const next = [...baseIds];
      const emptyIdx = next.findIndex((id) => !id);
      if (emptyIdx !== -1) {
        next[emptyIdx] = item.id;
      } else {
        next[next.length - 1] = item.id;
      }
      return next;
    });
  };

  const handleApplyPopularBuildItems = (items: ItemData[]) => {
    const padded = Array.from({ length: 6 }, (_, i) => items[i]?.id || null);
    setCustomBuildItemIds(padded);
  };

  const hasUniquePassiveInfo = (item: ItemData): boolean => {
    const raw = extractRawDataDragonItemDetails(item);
    return raw.passives.length > 0 || Boolean(raw.scalingNote);
  };

  const buildPassiveExplainKey = (item: ItemData): string =>
    [
      item.id,
      playerChampion.id,
      role,
      runeSimLevel,
      sandboxStats.totals.hp,
      sandboxStats.totals.ad,
      sandboxStats.totals.ap,
      sandboxStats.totals.armor,
      sandboxStats.totals.mr,
      activeCombatTarget.id,
      activeCombatTarget.armor,
      activeCombatTarget.mr,
      combatDurationSec,
      combatSpellCasts,
      heartsteelStacksHp,
    ].join(':');

  const requestPassiveExplanation = async (item: ItemData, force = false) => {
    const cacheKey = buildPassiveExplainKey(item);
    if (!force && passiveExplainCache[cacheKey]) {
      setPassiveExplainError(null);
      return;
    }

    const rawDetails = extractRawDataDragonItemDetails(item);
    const matchingRow = perItemImpactRows.find((r) => r.item.id === item.id) || null;
    const baseHp = Math.round(
      computeStatAtLevel(playerChampion.stats.hp, playerChampion.stats.hpperlevel, runeSimLevel),
    );
    const baseAd = Math.round(
      computeStatAtLevel(
        playerChampion.stats.attackdamage,
        playerChampion.stats.attackdamageperlevel,
        runeSimLevel,
      ),
    );

    setPassiveExplainError(null);
    setPassiveExplainLoadingKey(cacheKey);
    try {
      const json = await postCoachJson<PassiveAiExplanation>('/api/coach/item-passive-formula', {
        championName: playerChampion.name,
        championId: playerChampion.id,
        championTags: playerChampion.tags,
        role,
        level: runeSimLevel,
        itemId: item.id,
        itemName: item.name,
        itemCost: item.gold.total,
        rawPassives: rawDetails.passives,
        scalingNote: rawDetails.scalingNote,
        championStats: {
          hp: sandboxStats.totals.hp,
          bonusHp: Math.max(0, sandboxStats.totals.hp - baseHp),
          baseAd,
          totalAd: sandboxStats.totals.ad,
          totalAp: sandboxStats.totals.ap,
          totalArmor: sandboxStats.totals.armor,
          totalMr: sandboxStats.totals.mr,
          attackSpeed: Number(sandboxStats.totals.attackSpeed.toFixed(3)),
          abilityHaste: sandboxStats.totals.abilityHaste,
        },
        targetStats: {
          name: activeCombatTarget.name,
          hp: activeCombatTarget.hp,
          armor: activeCombatTarget.armor,
          mr: activeCombatTarget.mr,
          effectiveArmor: combatDamageResult.effectiveArmor,
          effectiveMr: combatDamageResult.effectiveMr,
        },
        combatContext: {
          durationSec: combatDamageResult.durationSec,
          spellCasts: combatDamageResult.spellCasts,
          totalMitigatedDamage: combatDamageResult.totalMitigatedDamage,
          realDps: combatDamageResult.realDps,
          deltaTotalDamage: matchingRow ? matchingRow.deltaTotalDamage : null,
          deltaRealDps: matchingRow ? matchingRow.deltaRealDps : null,
          deltaCombatHealing: matchingRow ? matchingRow.deltaCombatHealing : null,
        },
      });
      setPassiveExplainCache((prev) => ({
        ...prev,
        [cacheKey]: json,
      }));
    } catch (err) {
      setPassiveExplainError(
        err instanceof Error
          ? err.message
          : 'Impossible de générer l’analyse Gemini du passif.',
      );
    } finally {
      setPassiveExplainLoadingKey((curr) => (curr === cacheKey ? null : curr));
    }
  };

  const handleTogglePassiveExplanation = (
    item: ItemData,
    anchor: PassiveExplainAnchor,
    slotIdx?: number,
  ) => {
    if (anchor === 'simulator' && typeof slotIdx === 'number') {
      setInspectedItemSlotIdx(slotIdx);
    }
    const isSameOpen =
      activePassiveExplain?.item.id === item.id && activePassiveExplain?.anchor === anchor;
    if (isSameOpen) {
      setActivePassiveExplain(null);
      setPassiveExplainError(null);
      return;
    }
    setActivePassiveExplain({ item, anchor });
    void requestPassiveExplanation(item, false);
  };

  const renderPassiveAiPanel = (item: ItemData) => {
    const cacheKey = buildPassiveExplainKey(item);
    const explanation = passiveExplainCache[cacheKey];
    const isLoading = passiveExplainLoadingKey === cacheKey;

    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50/70 dark:bg-[#0D121C] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-amber-500/25">
          <div className="flex items-center gap-2.5 min-w-0">
            <SafeGameIcon
              src={item.imageUrl}
              alt={item.name}
              fallbackLabel={item.name}
              sizeClass="w-8 h-8"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Impact IA du passif : {explanation?.passiveTitle || item.name}
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {playerChampion.name} Niv.{runeSimLevel} · {sandboxStats.totals.hp} PV · {sandboxStats.totals.ap} AP · vs {activeCombatTarget.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void requestPassiveExplanation(item, true)}
              disabled={isLoading}
              title="Recalculer avec Gemini"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Actualiser</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePassiveExplain(null)}
              aria-label="Fermer l’explication du passif"
              className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {isLoading && !explanation && (
          <div className="flex items-center gap-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" aria-hidden="true" />
            <span>
              Analyse Gemini des formules de {item.name} sur le kit de {playerChampion.name} en cours...
            </span>
          </div>
        )}

        {passiveExplainError && (
          <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-rose-700 dark:text-rose-300">
            <span>{passiveExplainError}</span>
            <button
              type="button"
              onClick={() => void requestPassiveExplanation(item, true)}
              className="px-2.5 py-1 rounded-md bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-500 shrink-0"
            >
              Réessayer
            </button>
          </div>
        )}

        {explanation && (
          <div className="space-y-3 text-xs">
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
              {explanation.coreMechanism}
            </p>

            {explanation.formulaModifications?.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Modifications des formules du champion
                </div>
                <ul className="space-y-1.5">
                  {explanation.formulaModifications.map((step, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-200 leading-relaxed"
                    >
                      <span className="text-amber-600 dark:text-amber-400 font-bold shrink-0">
                        {idx + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3 space-y-1">
                <div className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  Preuve chiffrée en direct
                </div>
                <p className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300 leading-relaxed">
                  {explanation.liveNumericProof}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Optimisation en combat
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  {explanation.executionTip}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const detectedAsSelection = useMemo<RunePageSelection | null>(() => {
    if (!detectedRunePage?.primaryTreeId) return null;
    const pTreeId = detectedRunePage.primaryTreeId;
    const sTreeId =
      detectedRunePage.secondaryTreeId ||
      ddragon.runeTrees.find((t) => t.id !== pTreeId)?.id ||
      pTreeId;
    const base = buildDefaultSelectionForTrees(ddragon.runeTrees, pTreeId, sTreeId);
    const pTree = ddragon.runeTrees.find((t) => t.id === pTreeId);
    const sTree = ddragon.runeTrees.find((t) => t.id === sTreeId);
    const pickedSet = new Set(detectedRunePage.selectedRuneIds);

    const primaryMinors = (pTree?.slots || [])
      .slice(1, 4)
      .map((sl, i) => sl.runes.find((r) => pickedSet.has(r.id))?.id || base.primaryMinorIds[i])
      .filter((id): id is number => Boolean(id));

    const secondaryMinors = (sTree?.slots || [])
      .slice(1, 4)
      .flatMap((sl) => sl.runes)
      .filter((r) => pickedSet.has(r.id))
      .map((r) => r.id)
      .slice(0, 2);

    return {
      primaryTreeId: pTreeId,
      secondaryTreeId: sTreeId,
      keystoneId: detectedRunePage.keystoneId || base.keystoneId,
      primaryMinorIds: primaryMinors.length === 3 ? primaryMinors : base.primaryMinorIds,
      secondaryMinorIds: secondaryMinors.length === 2 ? secondaryMinors : base.secondaryMinorIds,
      shardIndices: detectedRunePage.selectedShardRowIndices || [0, 0, 0],
    };
  }, [detectedRunePage, ddragon.runeTrees]);

  const pickerTagCounts = useMemo(() => {
    const counts: Record<string, number> = { Tous: ddragon.champions.length, Jungler: 0 };
    for (const c of ddragon.champions) {
      for (const t of c.tags) {
        counts[t] = (counts[t] || 0) + 1;
      }
      if (isJunglerChampion(c.id)) {
        counts.Jungler += 1;
      }
    }
    return counts;
  }, [ddragon.champions]);

  const currentPickerChampId = useMemo(() => {
    if (!pickerTarget) return null;
    if (pickerTarget.type === 'player') return playerChampId;
    if (pickerTarget.type === 'duo') return duoPartnerId;
    return typeof pickerTarget.index === 'number' ? enemyIds[pickerTarget.index] || null : null;
  }, [pickerTarget, playerChampId, duoPartnerId, enemyIds]);

  useEffect(() => {
    if (!pickerTarget && itemPickerSlotIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPickerTarget(null);
        setItemPickerSlotIdx(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickerTarget, itemPickerSlotIdx]);

  const filteredChampions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ddragon.champions.filter((c) => {
      const matchesTag =
        pickerTag === 'Tous' ||
        (pickerTag === 'Jungler' ? isJunglerChampion(c.id) : c.tags.includes(pickerTag));
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (isJunglerChampion(c.id) && 'jungler jungle'.includes(q)) ||
        c.tags.some((t) => t.toLowerCase().includes(q));
      return matchesTag && matchesQuery;
    });
  }, [ddragon.champions, searchQuery, pickerTag]);

  const handleSelectChampion = (champId: string) => {
    if (!pickerTarget) return;
    manualOverrideRef.current = true;
    if (pickerTarget.type === 'player') {
      setPlayerChampId(champId);
    } else if (pickerTarget.type === 'duo') {
      setDuoPartnerId(champId);
    } else if (typeof pickerTarget.index === 'number') {
      setEnemyIds((prev) => {
        const next = [...prev];
        next[pickerTarget.index!] = champId;
        return next;
      });
    }
    setAiPlan(null);
    setPickerTarget(null);
    setSearchQuery('');
    setPickerTag('Tous');
  };

  const handleGenerateAiPlan = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await postCoachJson<{
        headline?: string;
        earlyGamePlan?: string;
        midGameSpike?: string;
        teamfightPositioning?: string;
        keyReminders?: string[];
      }>('/api/coach/build-rationale', { recommendation, tendencies });
      setAiPlan(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Impossible de joindre le coach IA.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Détection automatique partie en cours & sélection des champions (Classée, Draft, Swiftplay, ARAM) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Radar className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Synchronisation en direct (Champ Select &amp; Partie)</span>
              {detectedRunePage && (
                <span className="ml-1 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                  · Runes client détectées
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {detectionMeta ? (
                <>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {detectionMeta.phaseLabel}
                  </span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span>{detectionMeta.modeLabel}</span>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span>{detectionMeta.sourceLabel} ({detectionMeta.checkedAt})</span>
                </>
              ) : (
                'Compatible Classée Solo/Flex (bans + runes), Draft, Partie Accélérée, ARAM et Outil d’entraînement.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDetectFromRiot}
              disabled={spectatorChecking}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${spectatorChecking ? 'animate-spin' : ''}`} aria-hidden="true" />
              {spectatorChecking ? 'Détection...' : 'Détecter partie (Riot API)'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isInsideIframe && !bridgeAutoActive) {
                  setShowLiveSyncPanel(true);
                }
                setBridgeAutoActive((v) => !v);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                bridgeAutoActive
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" aria-hidden="true" />
              {bridgeAutoActive ? 'Pont actif (3s)' : 'Sync Client LoL'}
            </button>

            <button
              type="button"
              onClick={() => setShowLiveSyncPanel((v) => !v)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {showLiveSyncPanel ? 'Masquer aide / Ctrl+V' : 'Aide pont / Ctrl+V'}
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/5 text-xs text-sky-700 dark:text-sky-300">
            {syncMessage}
          </div>
        )}
        {syncError && (
          <div className="px-3 py-2 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400">
            {syncError}
          </div>
        )}

        {/* Bans & Alliés détectés (compact) */}
        {(bannedChampions.length > 0 || detectedAllies.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2.5 border-t border-slate-200 dark:border-slate-800">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3 py-2 space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5 text-rose-500" aria-hidden="true" />
                Champions bannis ({bannedChampions.length})
              </div>
              {bannedChampions.length === 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Aucun bannissement actif ({gameMode === 'ARAM' ? 'ARAM' : gameMode === 'SWIFTPLAY' ? 'Partie Accélérée' : 'Draft'}).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {bannedChampions.map((ban, idx) => (
                    <div
                      key={`${ban.id}-${idx}`}
                      className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300"
                    >
                      <SafeGameIcon
                        src={ban.imageUrl}
                        alt={ban.name}
                        fallbackLabel={ban.name}
                        sizeClass="w-5 h-5"
                      />
                      <span>{ban.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {detectedAllies.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3 py-2 space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                  Votre équipe (cliquez un allié pour le définir en Duo)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detectedAllies
                    .filter((id) => id !== playerChampId)
                    .map((allyId, idx) => {
                      const ally = ddragon.champions.find((c) => c.id === allyId);
                      if (!ally) return null;
                      const selected = duoPartnerId === ally.id;
                      return (
                        <button
                          key={`${ally.id}-${idx}`}
                          type="button"
                          onClick={() => {
                            manualOverrideRef.current = true;
                            setDuoPartnerId(ally.id);
                            setAiPlan(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-colors ${
                            selected
                              ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold'
                              : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-sky-500/60'
                          }`}
                        >
                          <SafeGameIcon
                            src={ally.imageUrl}
                            alt={ally.name}
                            fallbackLabel={ally.name}
                            sizeClass="w-4 h-4"
                          />
                          <span>{ally.name}</span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {showLiveSyncPanel && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">
                  1. Champ Select, ARAM, Classée &amp; Outil d’entraînement
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  Le pont Windows{' '}
                  <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">lol-coach-bridge.bat</code>{' '}
                  (v3) lit vos champions, bans et <strong>votre page de runes active</strong> directement depuis le client LoL.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadWindowsBridgeBat}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Télécharger le pont v3 (Windows)
                  </button>
                  {isInsideIframe && (
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-amber-500 text-amber-600 dark:text-amber-400"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      Ouvrir hors iframe pour synchro auto
                    </a>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white">
                  2. Import rapide par Ctrl+V (si vous restez dans l’aperçu iframe)
                </div>
                <div className="relative">
                  <pre className="p-2 pr-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                    {UNIVERSAL_STATE_CLIPBOARD_CMD}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyCmd}
                    className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    {copiedCmd ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedCmd ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && pasted.trim().startsWith('{')) {
                      e.preventDefault();
                      setPasteText(pasted);
                      ingestPastedBridgeJson(pasted);
                    }
                  }}
                  placeholder="Cliquez ici et faites Ctrl+V pour charger votre Champ Select, vos runes actives ou votre partie en cours..."
                  className="w-full p-2 text-[11px] font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Sélection Champion Joueur + Partenaire Duo + 5 Adversaires (Portraits cohérents Champion Select) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white text-balance">
              Optimiseur de Build &amp; Runes selon votre Duo et la composition adverse
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span>{recommendation.provenance.join(' · ')}</span>
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span>
                Confiance : {recommendation.confidence} ({enemyChampions.length}/5 adversaires)
              </span>
              <span aria-hidden="true" className="mx-1.5">·</span>
              <span>Patch {recommendation.patchVersion}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Sélecteur de Mode (Classée/Normale, Swiftplay, ARAM) */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
              {GAME_MODE_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    manualOverrideRef.current = true;
                    setGameMode(m.id);
                    setAiPlan(null);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    gameMode === m.id
                      ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Sélecteur de Rôle */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    manualOverrideRef.current = true;
                    setRole(r);
                    setAiPlan(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    role === r
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Sélecteur de Dynamique de Partie (Proactif en avance / en difficulté) */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
              {SCENARIO_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.hint}
                  onClick={() => {
                    setScenario(opt.id);
                    setAiPlan(null);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    scenario === opt.id
                      ? opt.id === 'behind'
                        ? 'bg-rose-600 text-white font-semibold'
                        : opt.id === 'ahead'
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'bg-slate-900 dark:bg-slate-700 text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Votre champion + Partenaire de Duo (Grands portraits cohérents Champion Select) */}
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Votre Duo (cliquez pour changer)</span>
              <span className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {role}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SlotPortraitCard
                champion={playerChampion}
                slotLabel="Votre champion"
                accentTone="amber"
                onClick={() => setPickerTarget({ type: 'player' })}
              />
              <SlotPortraitCard
                champion={duoPartner}
                slotLabel={
                  role === 'SUPPORT'
                    ? 'Votre ADC'
                    : role === 'ADC'
                      ? 'Votre Support'
                      : 'Allié Duo'
                }
                emptyLabel="Ajouter Duo"
                accentTone="sky"
                onClick={() => setPickerTarget({ type: 'duo' })}
                onClear={
                  duoPartner
                    ? () => {
                        manualOverrideRef.current = true;
                        setDuoPartnerId(null);
                        setAiPlan(null);
                      }
                    : undefined
                }
              />
            </div>
          </div>

          {/* 5 champions adverses en portraits cohérents */}
          <div className="lg:col-span-8 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Composition adverse ({enemyChampions.length}/5 · cliquez un portrait pour modifier parmi {ddragon.champions.length} champions)
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {PRESET_COMPS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      manualOverrideRef.current = true;
                      setEnemyIds(preset.ids);
                      setAiPlan(null);
                    }}
                    className="text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 underline underline-offset-4 whitespace-nowrap shrink-0"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {enemyIds.map((id, idx) => {
                const enemy = id ? ddragon.champions.find((c) => c.id === id) || null : null;
                const prof = enemy
                  ? recommendation.threatSummary.profiles.find((p) => p.championId === enemy.id)
                  : null;
                const slotTitle =
                  gameMode === 'ARAM' ? `Adversaire ${idx + 1}` : ENEMY_SLOT_LABELS[idx];

                return (
                  <SlotPortraitCard
                    key={`enemy-slot-${idx}-${id || 'empty'}`}
                    champion={enemy}
                    slotLabel={slotTitle}
                    subLabel={
                      prof
                        ? `${prof.primaryDamage} · ${prof.keyThreats?.[0] || enemy?.tags[0] || ''}`
                        : undefined
                    }
                    emptyLabel="Choisir"
                    accentTone="rose"
                    onClick={() => setPickerTarget({ type: 'enemy', index: idx })}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Profil de menace + Projection (Gauche) & Ordre d'achat recommandé (Droite) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Swords className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Profil de dégâts &amp; menaces adverses
            </h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                <span className="text-orange-600 dark:text-orange-400 font-semibold">
                  Physique {recommendation.threatSummary.physicalShare}%
                </span>
                <span className="text-sky-600 dark:text-sky-400 font-semibold">
                  Magique {recommendation.threatSummary.magicShare}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-md bg-sky-500/30 overflow-hidden flex">
                <div
                  className="h-full bg-orange-500"
                  style={{ width: `${recommendation.threatSummary.physicalShare}%` }}
                />
                <div
                  className="h-full bg-sky-500"
                  style={{ width: `${recommendation.threatSummary.magicShare}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Tanks</div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.tankCount}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Soin</div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.highHealCount}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Burst</div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.burstThreatCount}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">CC</div>
                <div className="mt-0.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.ccThreatCount}
                </div>
              </div>
            </div>

            {/* Détail concret champion par champion avec contre recommandé */}
            {recommendation.threatSummary.profiles.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Menaces concrètes &amp; contres à prioriser
                </div>
                <div className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  {recommendation.threatSummary.profiles.map((prof, idx) => {
                    const champObj = ddragon.champions.find((c) => c.id === prof.championId);
                    const dmgColor =
                      prof.primaryDamage === 'Physique'
                        ? 'text-orange-600 dark:text-orange-400'
                        : prof.primaryDamage === 'Magique'
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-amber-600 dark:text-amber-400';

                    return (
                      <div
                        key={`${prof.championId}-${idx}`}
                        className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5 text-xs"
                      >
                        <SafeGameIcon
                          src={champObj?.imageUrl}
                          alt={prof.championName}
                          fallbackLabel={prof.championName}
                          sizeClass="w-8 h-8"
                        />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {prof.championName}
                            </span>
                            <span className={`text-[11px] font-semibold ${dmgColor}`}>
                              {prof.primaryDamage} · {prof.keyThreats?.join(' / ') || prof.archetype}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                            Contre : {prof.recommendedCounter}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-500" aria-hidden="true" />
                Projection de robustesse &amp; dégâts
              </h2>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Simulation théorique
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 text-left font-medium">Niveau</th>
                    <th className="py-2 text-right font-medium">EHP Phys.</th>
                    <th className="py-2 text-right font-medium">EHP Mag.</th>
                    <th className="py-2 text-right font-medium">Indice Off.</th>
                    <th className="py-2 text-right font-medium">Coût cumulé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono tabular-nums">
                  {recommendation.comparisonAtLevels.map((row) => (
                    <tr key={row.level}>
                      <td className="py-2 text-slate-800 dark:text-slate-200">Niv. {row.level}</td>
                      <td className="py-2 text-right text-orange-600 dark:text-orange-400">
                        {row.physicalEhp}
                      </td>
                      <td className="py-2 text-right text-sky-600 dark:text-sky-400">
                        {row.magicEhp}
                      </td>
                      <td className="py-2 text-right text-amber-600 dark:text-amber-400">
                        {row.offensiveIndex}
                      </td>
                      <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                        {row.totalGold} po
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-3">
            {recommendation.duoSynergyNotes.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                  Synergie Duo ({playerChampion.name} + {duoPartner?.name})
                </div>
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {recommendation.duoSynergyNotes.map((note, i) => (
                    <li key={i}>· {note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={recommendation.duoSynergyNotes.length > 0 ? 'pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5' : 'space-y-1.5'}>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Règles tactiques pour ce match-up
              </div>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {recommendation.laneWinConditions.map((cond, i) => (
                  <li key={i}>· {cond}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* Colonne Droite : Objets recommandés (Patch S16) */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Ordre d’achat recommandé (Patch {recommendation.patchVersion} ·{' '}
              {GAME_MODE_OPTIONS.find((m) => m.id === gameMode)?.label})
            </h2>

            {recommendation.supportQuestHint && (
              <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {recommendation.supportQuestHint}
              </div>
            )}

            <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {[recommendation.boots, ...recommendation.coreItems].map((rec) => {
                const showPassiveInfo = hasUniquePassiveInfo(rec.item);
                const isPassiveActive =
                  activePassiveExplain?.item.id === rec.item.id &&
                  activePassiveExplain?.anchor === 'recommended-core';

                return (
                  <div
                    key={`${rec.slotType}-${rec.item.id}`}
                    className="p-3.5 flex items-start gap-3.5 bg-white dark:bg-[#121722]"
                  >
                    <SafeGameIcon
                      key={`rec-item-${rec.item.id}`}
                      src={rec.item.imageUrl}
                      alt={rec.item.name}
                      fallbackLabel={rec.item.name}
                      sizeClass="w-11 h-11"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                            {rec.item.name}
                          </span>
                          {showPassiveInfo && (
                            <button
                              type="button"
                              onClick={() =>
                                handleTogglePassiveExplanation(rec.item, 'recommended-core')
                              }
                              aria-expanded={isPassiveActive}
                              aria-label={`Analyser l’impact du passif de ${rec.item.name} sur les formules de ${playerChampion.name}`}
                              title="Expliquer par IA comment ce passif modifie les formules du champion"
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold transition-colors shrink-0 ${
                                isPassiveActive
                                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400'
                              }`}
                            >
                              <Info className="w-3 h-3" aria-hidden="true" />
                              <span>Passif IA</span>
                            </button>
                          )}
                        </div>
                        <div className="text-xs font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {rec.slotType} · {rec.item.gold.total} po
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {rec.reasons.join(' ')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {activePassiveExplain?.anchor === 'recommended-core' &&
              renderPassiveAiPanel(activePassiveExplain.item)}

            {recommendation.situationalItems.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Options situationnelles (4e / 5e emplacement)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {recommendation.situationalItems.map((rec) => {
                    const showPassiveInfo = hasUniquePassiveInfo(rec.item);
                    const isPassiveActive =
                      activePassiveExplain?.item.id === rec.item.id &&
                      activePassiveExplain?.anchor === 'recommended-sit';

                    return (
                      <div
                        key={rec.item.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] space-y-2 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <SafeGameIcon
                                key={`sit-item-${rec.item.id}`}
                                src={rec.item.imageUrl}
                                alt={rec.item.name}
                                fallbackLabel={rec.item.name}
                                sizeClass="w-9 h-9"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {rec.item.name}
                                </div>
                                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                  {rec.item.gold.total} po
                                </div>
                              </div>
                            </div>
                            {showPassiveInfo && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleTogglePassiveExplanation(rec.item, 'recommended-sit')
                                }
                                aria-expanded={isPassiveActive}
                                aria-label={`Analyser l’impact du passif de ${rec.item.name} sur les formules de ${playerChampion.name}`}
                                title="Expliquer par IA comment ce passif modifie les formules du champion"
                                className={`p-1 rounded-md border transition-colors shrink-0 ${
                                  isPassiveActive
                                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400'
                                }`}
                              >
                                <Info className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {rec.reasons[0]}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleQuickTestItem(rec.item)}
                          className="w-full px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                        >
                          Tester dans l’atelier
                        </button>
                      </div>
                    );
                  })}
                </div>
                {activePassiveExplain?.anchor === 'recommended-sit' &&
                  renderPassiveAiPanel(activePassiveExplain.item)}
              </div>
            )}

            {popularWebItems.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
                    <span>Items populaires suggérés (U.GG / OP.GG)</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleApplyPopularBuildItems(popularWebItems.slice(0, 6))}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition-colors"
                  >
                    <Download className="w-3 h-3" aria-hidden="true" />
                    Charger la sélection Web dans l’atelier
                  </button>
                </div>

                {popularWebMeta?.summary && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {popularWebMeta.summary}
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {popularWebItems.slice(0, 6).map((webItem) => {
                    const showPassiveInfo = hasUniquePassiveInfo(webItem);
                    const isPassiveActive =
                      activePassiveExplain?.item.id === webItem.id &&
                      activePassiveExplain?.anchor === 'recommended-web';
                    const isAlreadyInAtelier = customBuildItemIds?.includes(webItem.id) ?? false;

                    return (
                      <div
                        key={`web-rec-${webItem.id}`}
                        className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/5 space-y-2 flex flex-col justify-between"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <SafeGameIcon
                              src={webItem.imageUrl}
                              alt={webItem.name}
                              fallbackLabel={webItem.name}
                              sizeClass="w-9 h-9"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {webItem.name}
                              </div>
                              <div className="text-[11px] font-mono tabular-nums text-sky-700 dark:text-sky-300">
                                {webItem.gold.total} po · Méta Web
                              </div>
                            </div>
                          </div>
                          {showPassiveInfo && (
                            <button
                              type="button"
                              onClick={() =>
                                handleTogglePassiveExplanation(webItem, 'recommended-web')
                              }
                              aria-expanded={isPassiveActive}
                              aria-label={`Analyser l’impact du passif de ${webItem.name} sur les formules de ${playerChampion.name}`}
                              title="Expliquer par IA comment ce passif modifie les formules du champion"
                              className={`p-1 rounded-md border transition-colors shrink-0 ${
                                isPassiveActive
                                  ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400'
                              }`}
                            >
                              <Info className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleQuickTestItem(webItem)}
                          className={`w-full px-2.5 py-1.5 text-[11px] font-semibold rounded-md border transition-colors ${
                            isAlreadyInAtelier
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-300'
                          }`}
                        >
                          {isAlreadyInAtelier ? 'Ajouté à l’atelier ✓' : 'Tester dans l’atelier'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {activePassiveExplain?.anchor === 'recommended-web' &&
                  renderPassiveAiPanel(activePassiveExplain.item)}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Recherche de Builds Populaires en direct (Google Search Grounding : U.GG / OP.GG / Lolalytics) */}
      <PopularBuildSearch
        champion={playerChampion}
        role={role}
        gameMode={gameMode}
        patchVersion={ddragon.version}
        onApplyBuild={handleApplyPopularBuildItems}
        onQuickTestItem={handleQuickTestItem}
        onSuggestionsUpdated={(items, meta) => {
          setPopularWebItems(items);
          setPopularWebMeta(meta);
        }}
      />

      {/* Atelier Équipement Interactif + Statistiques Exactes & Deltas en Temps Réel */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Atelier Équipement &amp; Statistiques Exactes ({playerChampion.name} Niv.{runeSimLevel})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Modifiez librement vos 6 emplacements ci-dessous : chaque statistique combine exactement la croissance Riot du champion, vos runes/fragments actifs et les statistiques complètes du patch {ddragon.version}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Slider Niveau 1 à 18 */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                Niveau <strong className="font-mono tabular-nums text-amber-600 dark:text-amber-400">{runeSimLevel}</strong>
              </span>
              <input
                type="range"
                min={1}
                max={18}
                value={runeSimLevel}
                onChange={(e) => setRuneSimLevel(Number(e.target.value))}
                aria-label="Simuler le niveau du champion"
                className="w-24 accent-amber-500 cursor-pointer"
              />
            </div>

            {sandboxActiveItems.some((it) => it.id === '3084' || it.name.toLowerCase().includes('cœuracier')) && (
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 text-[11px]">
                <span className="px-2 text-slate-500 dark:text-slate-400">Cœuracier :</span>
                {[0, 300, 600, 900].map((stHp) => (
                  <button
                    key={stHp}
                    type="button"
                    onClick={() => setHeartsteelStacksHp(stHp)}
                    className={`px-2 py-1 rounded font-mono tabular-nums transition-colors ${
                      heartsteelStacksHp === stHp
                        ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    +{stHp}
                  </button>
                ))}
              </div>
            )}

            {isBuildModified && (
              <button
                type="button"
                onClick={() => setCustomBuildItemIds(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Réinitialiser au conseillé
              </button>
            )}
          </div>
        </div>

        {/* 6 Emplacements d'équipement cliquables */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {sandboxSlots.map((item, slotIdx) => {
            const tags = item ? formatItemStatTags(item) : [];
            const showPassiveInfo = item ? hasUniquePassiveInfo(item) : false;
            const isPassiveActive =
              Boolean(item) &&
              activePassiveExplain?.item.id === item?.id &&
              activePassiveExplain?.anchor === 'atelier';

            return (
              <div
                key={`sandbox-slot-${slotIdx}-${item?.id || 'empty'}`}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400">
                  <span className="font-mono tabular-nums uppercase">Emplacement {slotIdx + 1}</span>
                  {item && (
                    <div className="flex items-center gap-1.5">
                      {showPassiveInfo && (
                        <button
                          type="button"
                          onClick={() => handleTogglePassiveExplanation(item, 'atelier')}
                          aria-expanded={isPassiveActive}
                          aria-label={`Analyser l’impact du passif de ${item.name} sur les formules de ${playerChampion.name}`}
                          title="Expliquer par IA comment ce passif modifie les formules du champion"
                          className={`p-0.5 rounded transition-colors ${
                            isPassiveActive
                              ? 'text-amber-600 dark:text-amber-400 bg-amber-500/15'
                              : 'text-slate-400 hover:text-amber-500'
                          }`}
                        >
                          <Info className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAssignItemToSlot(slotIdx, null)}
                        title="Vider cet emplacement"
                        aria-label={`Retirer ${item.name}`}
                        className="text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {item ? (
                  <button
                    type="button"
                    onClick={() => {
                      setItemSearchQuery('');
                      setItemFilterKey(slotIdx === 0 ? 'boots' : 'all');
                      setItemPickerSlotIdx(slotIdx);
                    }}
                    className="text-left space-y-2 group"
                  >
                    <div className="flex items-center gap-2.5">
                      <SafeGameIcon
                        src={item.imageUrl}
                        alt={item.name}
                        fallbackLabel={item.name}
                        sizeClass="w-10 h-10"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-amber-500 transition-colors">
                          {item.name}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          {item.gold.total} po
                        </div>
                      </div>
                    </div>
                    {tags.length > 0 && (
                      <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 leading-snug">
                        {tags.join(' · ')}
                      </div>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setItemSearchQuery('');
                      setItemFilterKey('all');
                      setItemPickerSlotIdx(slotIdx);
                    }}
                    className="py-4 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-amber-500 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-[11px] font-medium">Ajouter objet</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {activePassiveExplain?.anchor === 'atelier' &&
          renderPassiveAiPanel(activePassiveExplain.item)}

        {/* Bandeau de synthèse combat & rentabilité Or avec Delta en temps réel */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              label: 'Coût total',
              val: sandboxStats.combat.totalGold,
              ref: recommendedStats.combat.totalGold,
              suffix: ' po',
              inverseGood: true,
            },
            {
              label: 'Rentabilité Or',
              val: sandboxStats.combat.goldEfficiencyPct,
              ref: recommendedStats.combat.goldEfficiencyPct,
              suffix: '%',
            },
            {
              label: 'EHP Physique',
              val: sandboxStats.combat.physicalEhp,
              ref: recommendedStats.combat.physicalEhp,
              suffix: '',
            },
            {
              label: 'EHP Magique',
              val: sandboxStats.combat.magicEhp,
              ref: recommendedStats.combat.magicEhp,
              suffix: '',
            },
            {
              label: 'DPS Auto-attaques',
              val: sandboxStats.combat.autoDps,
              ref: recommendedStats.combat.autoDps,
              suffix: '/s',
            },
            {
              label: 'Impact Sorts',
              val: sandboxStats.combat.abilityImpactIndex,
              ref: recommendedStats.combat.abilityImpactIndex,
              suffix: '',
            },
          ].map((kpi) => {
            const diff = kpi.val - kpi.ref;
            const isGood = kpi.inverseGood ? diff <= 0 : diff >= 0;
            return (
              <div
                key={kpi.label}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-3.5 py-2.5"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{kpi.label}</div>
                <div className="mt-1 flex items-baseline justify-between gap-2 font-mono tabular-nums">
                  <span className="text-base font-bold text-slate-900 dark:text-white">
                    {kpi.val}
                    {kpi.suffix}
                  </span>
                  {diff !== 0 && (
                    <span
                      className={`text-[11px] font-semibold ${
                        isGood
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tableau complet des statistiques exactes (Base + Runes + Objets vs Conseillé) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-7 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 text-left font-medium">Statistique réelle</th>
                  <th className="py-2.5 px-3 text-right font-medium">Votre test</th>
                  <th className="py-2.5 px-3 text-right font-medium">Base + Runes + Objets</th>
                  <th className="py-2.5 px-4 text-right font-medium">Écart vs Conseillé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono tabular-nums">
                {[
                  {
                    label: 'Points de vie (PV)',
                    val: sandboxStats.totals.hp,
                    ref: recommendedStats.totals.hp,
                    breakdown: `${sandboxStats.sources.hp.base} base · +${sandboxStats.sources.hp.runes} run. · +${sandboxStats.sources.hp.items} obj.`,
                  },
                  {
                    label: 'Dégâts d’attaque (AD)',
                    val: sandboxStats.totals.ad,
                    ref: recommendedStats.totals.ad,
                    breakdown: `${sandboxStats.sources.ad.base} base · +${sandboxStats.sources.ad.runes} run. · +${sandboxStats.sources.ad.items} obj.`,
                  },
                  {
                    label: 'Puissance (AP)',
                    val: sandboxStats.totals.ap,
                    ref: recommendedStats.totals.ap,
                    breakdown: `0 base · +${sandboxStats.sources.ap.runes} run. · +${sandboxStats.sources.ap.items} obj.`,
                  },
                  {
                    label: 'Armure',
                    val: sandboxStats.totals.armor,
                    ref: recommendedStats.totals.armor,
                    breakdown: `${sandboxStats.sources.armor.base} base · +${sandboxStats.sources.armor.runes} run. · +${sandboxStats.sources.armor.items} obj.`,
                  },
                  {
                    label: 'Résistance magique',
                    val: sandboxStats.totals.mr,
                    ref: recommendedStats.totals.mr,
                    breakdown: `${sandboxStats.sources.mr.base} base · +${sandboxStats.sources.mr.runes} run. · +${sandboxStats.sources.mr.items} obj.`,
                  },
                  {
                    label: 'Vitesse d’attaque',
                    val: sandboxStats.totals.attackSpeed,
                    ref: recommendedStats.totals.attackSpeed,
                    decimals: 3,
                    breakdown: 'Base + Croissance + Runes + Objets',
                  },
                  {
                    label: 'Hâte de compétence (% CDR)',
                    val: sandboxStats.totals.abilityHaste,
                    ref: recommendedStats.totals.abilityHaste,
                    suffix: ` (${sandboxStats.totals.cooldownReductionPct}% CDR)`,
                    breakdown: `0 base · +${sandboxStats.sources.abilityHaste.runes} run. · +${sandboxStats.sources.abilityHaste.items} obj.`,
                  },
                  {
                    label: 'Vitesse de déplacement',
                    val: sandboxStats.totals.moveSpeed,
                    ref: recommendedStats.totals.moveSpeed,
                    breakdown: `${sandboxStats.sources.moveSpeed.base} base · +${sandboxStats.sources.moveSpeed.runes} run. · +${sandboxStats.sources.moveSpeed.items} obj.`,
                  },
                ].map((row) => {
                  const rawDiff = row.decimals
                    ? Number((row.val - row.ref).toFixed(row.decimals))
                    : Number((row.val - row.ref).toFixed(1));
                  const formattedVal = row.decimals ? row.val.toFixed(row.decimals) : row.val;
                  const formattedDiff =
                    rawDiff === 0
                      ? '—'
                      : row.decimals
                        ? `${rawDiff > 0 ? '+' : ''}${rawDiff.toFixed(row.decimals)}`
                        : rawDiff > 0
                          ? `+${rawDiff}`
                          : `${rawDiff}`;

                  return (
                    <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-4 font-sans text-slate-700 dark:text-slate-200">
                        {row.label}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900 dark:text-white">
                        {formattedVal}
                        {row.suffix || ''}
                      </td>
                      <td className="py-2 px-3 text-right text-[11px] font-sans text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {row.breakdown}
                      </td>
                      <td
                        className={`py-2 px-4 text-right font-semibold ${
                          rawDiff > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : rawDiff < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-400'
                        }`}
                      >
                        {formattedDiff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="xl:col-span-5 space-y-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 dark:text-white">
                  Statistiques secondaires &amp; utilitaires
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  Valeur objets : {sandboxStats.combat.statGoldValue} po
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                {[
                  {
                    label: 'Régén. PV de base',
                    val: `+${sandboxStats.totals.hpRegenPct}%`,
                    highlight: sandboxStats.totals.hpRegenPct > 0,
                  },
                  {
                    label: 'Soins / Boucliers reçus',
                    val: `+${sandboxStats.totals.healShieldReceivedPct}%`,
                    highlight: sandboxStats.totals.healShieldReceivedPct > 0,
                  },
                  {
                    label: 'Anti-soin (Hémorragie)',
                    val: sandboxStats.totals.antiHealPct > 0 ? `${sandboxStats.totals.antiHealPct}% actif` : '0%',
                    highlight: sandboxStats.totals.antiHealPct > 0,
                  },
                  {
                    label: 'On-Hit / Lame enchantée',
                    val: `+${sandboxStats.combat.onHitPerAttack} / +${sandboxStats.combat.spellbladeProcDmg}`,
                    highlight:
                      sandboxStats.combat.onHitPerAttack > 0 ||
                      sandboxStats.combat.spellbladeProcDmg > 0,
                  },
                  {
                    label: 'Double On-Hit',
                    val: sandboxStats.totals.doubleOnHitActive ? 'Actif (×2)' : 'Inactif',
                    highlight: sandboxStats.totals.doubleOnHitActive,
                  },
                  {
                    label: 'Sustain combat estimé',
                    val: `~${sandboxStats.combat.combatSustainPerSec} PV/s`,
                    highlight: sandboxStats.combat.combatSustainPerSec > 0,
                  },
                  {
                    label: 'Réd. dégâts AA / Crit',
                    val: `-${sandboxStats.totals.aaDamageReductionPct}% / -${sandboxStats.totals.critDamageReductionPct}%`,
                    highlight:
                      sandboxStats.totals.aaDamageReductionPct > 0 ||
                      sandboxStats.totals.critDamageReductionPct > 0,
                  },
                  {
                    label: 'Ténacité cumulée',
                    val: `${sandboxStats.totals.tenacityPct}%`,
                    highlight: sandboxStats.totals.tenacityPct > 0,
                  },
                  {
                    label: 'Soins & Boucliers donnés',
                    val: `+${sandboxStats.totals.healShieldPowerPct}%`,
                    highlight: sandboxStats.totals.healShieldPowerPct > 0,
                  },
                  {
                    label: 'Vol de vie / Omnivamp',
                    val: `${sandboxStats.totals.lifeStealPct}% / ${sandboxStats.totals.omnivampPct}%`,
                    highlight:
                      sandboxStats.totals.lifeStealPct > 0 ||
                      sandboxStats.totals.omnivampPct > 0,
                  },
                  {
                    label: 'Crit. / Pén. Arm. / Lét.',
                    val: `${sandboxStats.totals.critChancePct}% · ${sandboxStats.totals.armorPenPct}% / ${sandboxStats.totals.lethality}`,
                    highlight:
                      sandboxStats.totals.critChancePct > 0 ||
                      sandboxStats.totals.armorPenPct > 0 ||
                      sandboxStats.totals.lethality > 0,
                  },
                  {
                    label: 'Pén. Magique',
                    val: `${sandboxStats.totals.magicPenPct}% / +${sandboxStats.totals.magicPenFlat}`,
                    highlight:
                      sandboxStats.totals.magicPenPct > 0 ||
                      sandboxStats.totals.magicPenFlat > 0,
                  },
                  {
                    label: 'Mana max (Régén.)',
                    val: `${sandboxStats.totals.mana} (+${sandboxStats.totals.manaRegenPct}%)`,
                    highlight: sandboxStats.totals.manaRegenPct > 0,
                  },
                  {
                    label: 'Valeur Runes (Niv.' + runeSimLevel + ')',
                    val: `~${sandboxStats.combat.runeGoldValue} po`,
                    highlight: true,
                  },
                ].map((sec) => (
                  <div
                    key={sec.label}
                    className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#121722] px-3 py-2"
                  >
                    <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {sec.label}
                    </div>
                    <div
                      className={`mt-0.5 font-semibold ${
                        sec.highlight
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {sec.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Passifs uniques & synergies de combat actifs sur la configuration */}
        {sandboxStats.activePassives.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                Passifs uniques &amp; effets de combat actifs ({sandboxStats.activePassives.length})
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Calculés dynamiquement selon vos PV, AP, Armure, RM et le niveau {runeSimLevel}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {sandboxStats.activePassives.map((pas, idx) => {
                const matchedItem = sandboxActiveItems.find((it) => it.id === pas.itemId);
                return (
                  <div
                    key={`${pas.itemId}-${idx}`}
                    className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#121722] p-3 flex items-start gap-2.5 text-xs"
                  >
                    {matchedItem ? (
                      <SafeGameIcon
                        src={matchedItem.imageUrl}
                        alt={matchedItem.name}
                        fallbackLabel={matchedItem.name}
                        sizeClass="w-8 h-8"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <Swords className="w-4 h-4 text-amber-500" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {pas.itemName}
                        </span>
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          · {pas.effectTitle}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                        {pas.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Simulateur d'Impact par Objet (Data Dragon Brut) & Dégâts Infligés en Temps Réel */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Radar className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Simulateur d’Impact par Objet &amp; Dégâts Infligés en Temps Réel</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Isole l’apport marginal exact (Avec − Sans) de chacun de vos objets équipés sur les statistiques finales, les passifs uniques (ex. Aube et crépuscule / Aube de Haut-Lacère) et les dégâts réels infligés à la cible.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 text-xs">
              <span className="px-2 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Échange :
              </span>
              {[3, 6, 10].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => setCombatDurationSec(sec)}
                  className={`px-2.5 py-1 rounded font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                    combatDurationSec === sec
                      ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 text-xs">
              <span className="px-2 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                Sorts lancés :
              </span>
              {[0, 1, 2, 3, 4].map((casts) => (
                <button
                  key={casts}
                  type="button"
                  onClick={() => setCombatSpellCasts(casts)}
                  className={`px-2 py-1 rounded font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                    combatSpellCasts === casts
                      ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {casts}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Barre de sélection de cible (Adversaires réels Data Dragon ou Mannequin manuel) */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 mr-1">
              Cible simulée :
            </span>
            {enemyChampions.map((enemy) => {
              const isSelected = targetArmorTier !== 'custom' && activeCombatTarget.id === enemy.id;
              return (
                <button
                  key={enemy.id}
                  type="button"
                  onClick={() => {
                    setSelectedEnemyTargetId(enemy.id);
                    if (targetArmorTier === 'custom') setTargetArmorTier('standard');
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-700 dark:text-slate-300 hover:border-amber-500/50'
                  }`}
                >
                  <SafeGameIcon
                    src={enemy.imageUrl}
                    alt={enemy.name}
                    fallbackLabel={enemy.name}
                    sizeClass="w-5 h-5"
                  />
                  <span>{enemy.name}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setTargetArmorTier('custom')}
              className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap shrink-0 ${
                targetArmorTier === 'custom'
                  ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-600 dark:text-slate-400 hover:border-amber-500/50'
              }`}
            >
              Mannequin libre
            </button>
          </div>

          {targetArmorTier !== 'custom' ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 text-[11px]">
                {(
                  [
                    { id: 'base', label: 'Base pure' },
                    { id: 'standard', label: 'Stuff Standard' },
                    { id: 'tank', label: 'Stuff Tank' },
                  ] as const
                ).map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setTargetArmorTier(tier.id)}
                    className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0 ${
                      targetArmorTier === tier.id
                        ? 'bg-slate-900 dark:bg-slate-200 text-white dark:text-slate-950 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tier.label}
                  </button>
                ))}
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {activeCombatTarget.hp} PV · {activeCombatTarget.armor} Arm. · {activeCombatTarget.mr} RM
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="font-sans text-[11px] text-slate-500">PV</span>
                <input
                  type="range"
                  min={1000}
                  max={5000}
                  step={100}
                  value={customTargetStats.hp}
                  onChange={(e) =>
                    setCustomTargetStats((prev) => ({ ...prev, hp: Number(e.target.value) }))
                  }
                  className="w-24 accent-amber-500"
                />
                <span>{customTargetStats.hp}</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="font-sans text-[11px] text-slate-500">Armure</span>
                <input
                  type="range"
                  min={30}
                  max={300}
                  step={5}
                  value={customTargetStats.armor}
                  onChange={(e) =>
                    setCustomTargetStats((prev) => ({ ...prev, armor: Number(e.target.value) }))
                  }
                  className="w-20 accent-amber-500"
                />
                <span>{customTargetStats.armor}</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="font-sans text-[11px] text-slate-500">RM</span>
                <input
                  type="range"
                  min={30}
                  max={250}
                  step={5}
                  value={customTargetStats.mr}
                  onChange={(e) =>
                    setCustomTargetStats((prev) => ({ ...prev, mr: Number(e.target.value) }))
                  }
                  className="w-20 accent-amber-500"
                />
                <span>{customTargetStats.mr}</span>
              </label>
            </div>
          )}
        </div>

        {/* Synthèse temps réel des dégâts infligés sur la cible */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-4 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Dégâts réels sur {combatDamageResult.durationSec}s
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {combatDamageResult.totalMitigatedDamage}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {combatDamageResult.totalRawDamage} bruts · -{combatDamageResult.physicalMitigationPct}% Phys / -{combatDamageResult.magicMitigationPct}% Mag
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-4 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              DPS réel sur {combatDamageResult.target.name}
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {combatDamageResult.realDps} /s
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {combatDamageResult.autoAttacksCount} AA · {combatDamageResult.spellbladeProcsCount} Lame enchantée · {combatDamageResult.extraDoubleOnHitProcs} Double On-Hit
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-4 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              PV cible retirés (TTK estimé)
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {combatDamageResult.targetHpPctRemoved}%
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                ~{combatDamageResult.estimatedTtkSec}s
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-amber-500"
                style={{ width: `${combatDamageResult.targetHpPctRemoved}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] px-4 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Soin généré en duel ({combatDamageResult.durationSec}s)
            </div>
            <div className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              +{combatDamageResult.combatHealingTotal} PV
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              Aube · Désespoir · Kit {sandboxStats.totals.healShieldReceivedPct > 0 ? `(×1.25 Visage)` : ''}
            </div>
          </div>
        </div>

        {/* Décomposition des sources de dégâts (mitigés vs bruts) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 text-left font-medium">Objet équipé</th>
                  <th className="py-2.5 px-2 text-right font-medium">Rent.</th>
                  <th className="py-2.5 px-2 text-right font-medium">Δ Stats clés</th>
                  <th className="py-2.5 px-2 text-right font-medium">Δ EHP</th>
                  <th className="py-2.5 px-2 text-right font-medium">Δ Dégâts</th>
                  <th className="py-2.5 px-3 text-right font-medium">Δ DPS / Soin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono tabular-nums">
                {perItemImpactRows.map((row) => {
                  const isActive = activeInspectedItemRow?.slotIndex === row.slotIndex;
                  const statParts: string[] = [];
                  if (row.deltaHp) statParts.push(`+${row.deltaHp} PV`);
                  if (row.deltaAd) statParts.push(`+${row.deltaAd} AD`);
                  if (row.deltaAp) statParts.push(`+${row.deltaAp} AP`);
                  if (row.deltaArmor) statParts.push(`+${row.deltaArmor} Arm`);
                  if (row.deltaMr) statParts.push(`+${row.deltaMr} RM`);
                  if (row.deltaAh) statParts.push(`+${row.deltaAh} Hâte`);
                  if (row.deltaAs > 0) statParts.push(`+${row.deltaAs.toFixed(2)} AS`);
                  const totalEhpDelta = Math.round((row.deltaPhysicalEhp + row.deltaMagicEhp) / 2);

                  return (
                    <tr
                      key={`impact-slot-${row.slotIndex}-${row.item.id}`}
                      onClick={() => setInspectedItemSlotIdx(row.slotIndex)}
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-amber-500/10 dark:bg-amber-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-sans">
                        <div className="flex items-center gap-2.5">
                          <SafeGameIcon
                            src={row.item.imageUrl}
                            alt={row.item.name}
                            fallbackLabel={row.item.name}
                            sizeClass="w-7 h-7"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
                                {row.item.name}
                              </span>
                              {(row.rawDetails.passives.length > 0 || Boolean(row.rawDetails.scalingNote)) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePassiveExplanation(
                                      row.item,
                                      'simulator',
                                      row.slotIndex,
                                    );
                                  }}
                                  aria-expanded={
                                    activePassiveExplain?.item.id === row.item.id &&
                                    activePassiveExplain?.anchor === 'simulator'
                                  }
                                  aria-label={`Analyser l’impact du passif de ${row.item.name} sur les formules de ${playerChampion.name}`}
                                  title="Expliquer par IA comment ce passif modifie les formules du champion"
                                  className={`p-0.5 rounded border transition-colors shrink-0 ${
                                    activePassiveExplain?.item.id === row.item.id &&
                                    activePassiveExplain?.anchor === 'simulator'
                                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-400'
                                  }`}
                                >
                                  <Info className="w-3 h-3" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              Slot {row.slotIndex + 1} · {row.item.gold.total} po
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-700 dark:text-slate-300">
                        {row.goldEfficiencySelfPct}%
                      </td>
                      <td className="py-2.5 px-2 text-right font-sans text-[11px] text-slate-600 dark:text-slate-300 max-w-[155px]">
                        {statParts.slice(0, 3).join(' · ') || 'Passif unique'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-sky-600 dark:text-sky-400">
                        {totalEhpDelta > 0 ? `+${totalEhpDelta}` : totalEhpDelta}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-amber-600 dark:text-amber-400">
                        {row.deltaTotalDamage >= 0 ? `+${row.deltaTotalDamage}` : row.deltaTotalDamage}
                        {row.damageSharePct > 0 && (
                          <span className="block text-[10px] font-normal text-slate-500">
                            {row.damageSharePct}% total
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="text-slate-900 dark:text-white">
                          {row.deltaRealDps >= 0 ? `+${row.deltaRealDps}` : row.deltaRealDps}/s
                        </div>
                        {row.deltaCombatHealing > 0 && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            +{row.deltaCombatHealing} PV
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Panneau Droit : Données Brutes Data Dragon de l'objet sélectionné + Sources de dégâts */}
          <div className="lg:col-span-5 space-y-4">
            {activeInspectedItemRow && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <SafeGameIcon
                      src={activeInspectedItemRow.item.imageUrl}
                      alt={activeInspectedItemRow.item.name}
                      fallbackLabel={activeInspectedItemRow.item.name}
                      sizeClass="w-9 h-9"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {activeInspectedItemRow.rawDetails.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        Data Dragon ID #{activeInspectedItemRow.rawDetails.itemId} · {activeInspectedItemRow.rawDetails.goldTotal} po
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(activeInspectedItemRow.rawDetails.passives.length > 0 ||
                      Boolean(activeInspectedItemRow.rawDetails.scalingNote)) && (
                      <button
                        type="button"
                        onClick={() =>
                          handleTogglePassiveExplanation(
                            activeInspectedItemRow.item,
                            'simulator',
                            activeInspectedItemRow.slotIndex,
                          )
                        }
                        aria-expanded={
                          activePassiveExplain?.item.id === activeInspectedItemRow.item.id &&
                          activePassiveExplain?.anchor === 'simulator'
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold transition-colors ${
                          activePassiveExplain?.item.id === activeInspectedItemRow.item.id &&
                          activePassiveExplain?.anchor === 'simulator'
                            ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400'
                        }`}
                      >
                        <Info className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>
                          {activePassiveExplain?.item.id === activeInspectedItemRow.item.id &&
                          activePassiveExplain?.anchor === 'simulator'
                            ? 'Masquer IA'
                            : 'Formule IA'}
                        </span>
                      </button>
                    )}
                    <span className="text-[11px] font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                      +{activeInspectedItemRow.deltaTotalDamage} dégâts
                    </span>
                  </div>
                </div>

                {/* Stats brutes Data Dragon */}
                {activeInspectedItemRow.rawDetails.rawStatsEntries.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Valeurs brutes Data Dragon (`item.stats`)
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {activeInspectedItemRow.rawDetails.rawStatsEntries.map((st) => (
                        <span key={st.key}>
                          {st.label} : <strong className="text-slate-900 dark:text-slate-200">{st.value}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lignes parsées <stats> */}
                {activeInspectedItemRow.rawDetails.parsedStatsLines.length > 0 && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Stats fiche : </span>
                    {activeInspectedItemRow.rawDetails.parsedStatsLines.join(' · ')}
                  </div>
                )}

                {/* Passifs bruts Data Dragon */}
                {activeInspectedItemRow.rawDetails.passives.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Passifs / Actifs bruts Data Dragon
                    </div>
                    {activeInspectedItemRow.rawDetails.passives.map((pas, idx) => (
                      <div key={idx} className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        <strong className="text-slate-900 dark:text-white">
                          {pas.isActive ? '[Actif] ' : ''}
                          {pas.name} :
                        </strong>{' '}
                        {pas.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Formule de scaling Riot exacte (notamment là où Data Dragon laisse 0) */}
                {activeInspectedItemRow.rawDetails.scalingNote && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    <strong>Formule simulée en temps réel : </strong>
                    {activeInspectedItemRow.rawDetails.scalingNote}
                  </div>
                )}
              </div>
            )}

            {activePassiveExplain?.anchor === 'simulator' &&
              renderPassiveAiPanel(activePassiveExplain.item)}

            {/* Répartition exacte des dégâts infligés par canal */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2.5 text-xs">
              <div className="font-semibold text-slate-900 dark:text-white">
                Décomposition des {combatDamageResult.totalMitigatedDamage} dégâts réels
              </div>
              <div className="divide-y divide-slate-200/70 dark:divide-slate-800 font-mono tabular-nums">
                <div className="py-1.5 flex items-center justify-between gap-2">
                  <span className="font-sans text-slate-600 dark:text-slate-300">
                    Auto-attaques ({combatDamageResult.autoAttacksCount} coups · Physique)
                  </span>
                  <span className="font-semibold text-orange-600 dark:text-orange-400">
                    {combatDamageResult.physicalAutoMitigated} ({combatDamageResult.physicalAutoRaw} bruts)
                  </span>
                </div>
                <div className="py-1.5 flex items-center justify-between gap-2">
                  <span className="font-sans text-slate-600 dark:text-slate-300">
                    Effets à l’impact de base (Kit + Objets)
                  </span>
                  <span className="font-semibold text-sky-600 dark:text-sky-400">
                    {combatDamageResult.baseOnHitMitigated} ({combatDamageResult.baseOnHitRaw} bruts)
                  </span>
                </div>
                {combatDamageResult.doubleOnHitBonusMitigated > 0 && (
                  <div className="py-1.5 flex items-center justify-between gap-2">
                    <span className="font-sans text-amber-700 dark:text-amber-300 font-medium">
                      Bonus Double On-Hit ({combatDamageResult.extraDoubleOnHitProcs} procs bonus)
                    </span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      +{combatDamageResult.doubleOnHitBonusMitigated} (+{combatDamageResult.doubleOnHitBonusRaw} bruts)
                    </span>
                  </div>
                )}
                {combatDamageResult.itemPassivesBreakdown.map((pas) => (
                  <div key={pas.itemId} className="py-1.5 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-sans text-slate-700 dark:text-slate-200 font-medium">
                        {pas.itemName} · {pas.effectName}
                      </span>
                      <span
                        className={`font-semibold ${
                          pas.damageType === 'Physique'
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-sky-600 dark:text-sky-400'
                        }`}
                      >
                        {pas.mitigatedDamage} ({pas.rawDamage} bruts)
                      </span>
                    </div>
                    <div className="font-sans text-[10px] text-slate-500 dark:text-slate-400">
                      {pas.formulaNote}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Calculateur Multi-Combinaisons (Test réel de centaines de combinaisons Objets x Runes) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Calculateur Multi-Combinaisons — Meilleurs choix par situation</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Évaluation déterministe en direct de{' '}
              <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {combinatorialResult.testedCombinationsCount}
              </strong>{' '}
              combinaisons ({combinatorialResult.testedItemCombos} configurations d’objets × {combinatorialResult.testedRuneCombos} variantes de runes) sur le patch {ddragon.version}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {combinatorialResult.candidates.map((cand) => (
            <div
              key={cand.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {cand.scenarioTitle}
                    </div>
                    <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      {cand.scenarioBadge} · Score {cand.score}/100
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {cand.situationHint}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {cand.items.map((it) => (
                    <div key={it.id} title={`${it.name} (${it.gold.total} po)`}>
                      <SafeGameIcon
                        src={it.imageUrl}
                        alt={it.name}
                        fallbackLabel={it.name}
                        sizeClass="w-8 h-8"
                      />
                    </div>
                  ))}
                </div>

                <div className="text-[11px] text-slate-700 dark:text-slate-200 pt-1 border-t border-slate-200/70 dark:border-slate-800 space-y-0.5">
                  <div>
                    Runes : <strong>{cand.keystoneName}</strong> ({cand.primaryTreeName} + {cand.secondaryTreeName})
                  </div>
                  <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {cand.stats.combat.totalGold} po · {cand.stats.combat.goldEfficiencyPct}% eff. · DPS {cand.stats.combat.autoDps}/s
                  </div>
                </div>

                <ul className="space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                  {cand.reasons.map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => {
                  const paddedIds: (string | null)[] = Array.from(
                    { length: 6 },
                    (_, i) => cand.items[i]?.id || null,
                  );
                  setCustomBuildItemIds(paddedIds);
                  setCustomRuneSelection(cand.runeSelection);
                  setRuneViewMode('recommended');
                  if (cand.scenarioKey === 'behind') setScenario('behind');
                  else if (cand.scenarioKey === 'ahead') setScenario('ahead');
                  else setScenario('balanced');
                }}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors"
              >
                Charger ce build + runes
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Section Pleine Largeur : Page de Runes interactive (Client LoL) + Simulateur d'impact en temps réel */}
      {(() => {
        const showingCurrent = runeViewMode === 'current' && Boolean(detectedRunePage);
        const isModified = customRuneSelection !== null;

        const metaAllIds = new Set([
          metaRuneSelection.keystoneId,
          ...metaRuneSelection.primaryMinorIds,
          ...metaRuneSelection.secondaryMinorIds,
        ]);

        const displaySelection =
          showingCurrent && detectedAsSelection ? detectedAsSelection : activeSandboxSelection;

        const displayAllIds = [
          displaySelection.keystoneId,
          ...displaySelection.primaryMinorIds,
          ...displaySelection.secondaryMinorIds,
        ];

        const activeComparison = showingCurrent && detectedAsSelection
          ? compareRunePages({
              champ: playerChampion,
              role,
              threats: recommendation.threatSummary,
              runeTrees: ddragon.runeTrees,
              custom: detectedAsSelection,
              meta: metaRuneSelection,
              level: runeSimLevel,
            })
          : runeComparison;

        const verdictColors = {
          emerald: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/35 bg-emerald-500/10',
          sky: 'text-sky-600 dark:text-sky-400 border-sky-500/35 bg-sky-500/10',
          amber: 'text-amber-600 dark:text-amber-400 border-amber-500/35 bg-amber-500/10',
          rose: 'text-rose-600 dark:text-rose-400 border-rose-500/35 bg-rose-500/10',
        }[activeComparison.verdictTone];

        return (
          <div className="space-y-4">
            <VisualRunePage
              runeTrees={ddragon.runeTrees}
              primaryTreeId={displaySelection.primaryTreeId}
              secondaryTreeId={displaySelection.secondaryTreeId}
              keystoneId={displaySelection.keystoneId}
              selectedRuneIds={displayAllIds}
              shardIndicesOverride={displaySelection.shardIndices}
              compareRuneIds={showingCurrent || isModified ? metaAllIds : undefined}
              championName={playerChampion.name}
              editable={!showingCurrent}
              onChangeSelection={(next) => {
                setRuneViewMode('recommended');
                setCustomRuneSelection(next);
              }}
              onResetToMeta={isModified ? () => setCustomRuneSelection(null) : undefined}
              pageTitle={
                showingCurrent && detectedRunePage
                  ? `Page équipée${detectedRunePage.pageName ? ` · « ${detectedRunePage.pageName} »` : ''}`
                  : isModified
                    ? `${playerChampion.name} · Test en direct (${activeComparison.score}/100)`
                    : `${playerChampion.name} · Page conseillée (Méta)`
              }
              sourceLabel={
                showingCurrent && detectedRunePage
                  ? `${detectedRunePage.sourceLabel} · ${activeComparison.matchedCount}/6 alignées méta`
                  : isModified
                    ? `Bac à sable interactif (${activeComparison.matchedCount}/6 méta)`
                    : `Moteur S16 (${playerChampion.name})`
              }
              headerActions={
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[#08101C] border border-[#C8AA6E]/35">
                    <button
                      type="button"
                      onClick={() => setRuneViewMode('recommended')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        !showingCurrent
                          ? 'bg-[#C8AA6E] text-[#09121F]'
                          : 'text-[#C8C3B4] hover:text-white'
                      }`}
                    >
                      {isModified ? 'Bac à sable (Modifiée)' : 'Page conseillée / Test'}
                    </button>
                    <button
                      type="button"
                      disabled={!detectedRunePage}
                      onClick={() => setRuneViewMode('current')}
                      title={
                        detectedRunePage
                          ? 'Afficher votre page de runes actuellement utilisée dans League of Legends'
                          : 'Lancez le pont local ou collez votre partie pour détecter vos runes actives'
                      }
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        showingCurrent
                          ? 'bg-sky-500 text-white'
                          : detectedRunePage
                            ? 'text-[#F0E6D2] hover:bg-white/10'
                            : 'text-slate-500 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      {detectedRunePage
                        ? `Votre page équipée${detectedRunePage.pageName ? ` (${detectedRunePage.pageName})` : ''}`
                        : 'Votre page (non détectée)'}
                    </button>
                  </div>
                  {showingCurrent && detectedAsSelection && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRuneSelection(detectedAsSelection);
                        setRuneViewMode('recommended');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-400/50 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 transition-colors whitespace-nowrap"
                    >
                      Modifier cette page
                    </button>
                  )}
                </div>
              }
              footerNote={
                showingCurrent
                  ? 'Comparaison directe : les runes entourées en bleu sur votre page équipée diffèrent de la page méta recommandée.'
                  : isModified
                    ? 'Mode interactif actif : cliquez sur n’importe quel arbre, rune ou fragment pour mesurer son impact en jeu ci-dessous.'
                    : `${recommendation.runes.rationale} Cliquez sur une rune ou un fragment ci-dessus pour tester des variantes en direct.`
              }
            />

            {/* Simulateur d'impact en jeu (Stats Lv 1-18, Mécaniques & Verdict Comparatif) */}
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-amber-500" aria-hidden="true" />
                      Impact en jeu &amp; Comparatif interactif
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold rounded-md border font-mono tabular-nums ${verdictColors}`}
                    >
                      {activeComparison.verdict} · {activeComparison.score}/100
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {activeComparison.summary}
                  </p>
                </div>

                {/* Sélecteur de niveau pour voir l'impact réel du niveau 1 au niveau 18 */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Simuler au :</span>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
                    {[1, 6, 11, 18].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setRuneSimLevel(lvl)}
                        className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-md transition-colors ${
                          runeSimLevel === lvl
                            ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        Niv.{lvl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Tableau des statistiques comparées (Test vs Méta) */}
                <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Statistiques effectives ({playerChampion.name} Niv.{runeSimLevel})
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Base + Runes + Fragments
                    </span>
                  </div>

                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-1.5 text-left font-medium">Statistique</th>
                        <th className="py-1.5 text-right font-medium">Page active</th>
                        <th className="py-1.5 text-right font-medium">Méta</th>
                        <th className="py-1.5 text-right font-medium">Écart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-mono tabular-nums">
                      {activeComparison.statRows.map((row) => (
                        <tr key={row.key}>
                          <td className="py-2 font-sans text-slate-700 dark:text-slate-300">
                            {row.label}
                          </td>
                          <td className="py-2 text-right font-semibold text-slate-900 dark:text-white">
                            {row.customValue}
                          </td>
                          <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                            {row.metaValue}
                          </td>
                          <td
                            className={`py-2 text-right font-semibold ${
                              row.direction === 'up'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.direction === 'down'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400'
                            }`}
                          >
                            {row.deltaLabel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mécaniques de jeu activées + Points forts / Compromis */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 space-y-2 text-xs">
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Avantages de cette configuration
                      </div>
                      {activeComparison.pros.length === 0 ? (
                        <p className="text-slate-500 dark:text-slate-400">
                          Modifiez une rune ci-dessus pour observer les avantages spécifiques.
                        </p>
                      ) : (
                        <ul className="space-y-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                          {activeComparison.pros.map((pro, idx) => (
                            <li key={idx}>· {pro}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-2 text-xs">
                      <div className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                        Compromis &amp; points d’attention
                      </div>
                      {activeComparison.tradeoffs.length === 0 ? (
                        <p className="text-emerald-700 dark:text-emerald-300">
                          Aucun compromis critique détecté face à cette composition adverse.
                        </p>
                      ) : (
                        <ul className="space-y-1 text-slate-700 dark:text-slate-300 leading-relaxed">
                          {activeComparison.tradeoffs.map((t, idx) => (
                            <li key={idx}>· {t}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      Mécaniques de gameplay activées avec ce choix
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {activeComparison.mechanics.map((m, idx) => (
                        <div
                          key={`${m.source}-${idx}`}
                          className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#121722] space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {m.source}
                            </span>
                            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                              {m.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                            {m.effect}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preuves de validation mathématique des runes */}
                  {(() => {
                    const checks = validateRuneConfiguration({
                      champion: playerChampion,
                      role,
                      threats: recommendation.threatSummary,
                      selection: displaySelection,
                      stats: sandboxStats,
                    });
                    return (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            Contrôle &amp; preuves de validation des runes
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                            {checks.filter((c) => c.passed).length}/{checks.length} vérifiés
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {checks.map((chk) => (
                            <div
                              key={chk.label}
                              className="p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#121722] space-y-1"
                            >
                              <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                                {chk.passed ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
                                ) : (
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                                )}
                                <span className="truncate">{chk.label}</span>
                              </div>
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                                {chk.detail}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
          </div>
        );
      })()}

      {/* Plan tactique IA Gemini (Pleine largeur) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Plan de match stratégique IA
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Analyse contextualisée par Gemini sur votre duo, vos objets calculés et les menaces adverses.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateAiPlan}
            disabled={aiLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {aiLoading ? 'Analyse en cours...' : 'Générer le plan tactique IA'}
          </button>
        </div>

        {aiError && (
          <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-xs text-rose-600 dark:text-rose-400">
            {aiError}
          </div>
        )}

        {aiPlan ? (
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs leading-relaxed">
            {aiPlan.headline && (
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {aiPlan.headline}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Phase initiale / Early
                </div>
                <p className="text-slate-600 dark:text-slate-300">{aiPlan.earlyGamePlan}</p>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Mid-game &amp; Powerspikes
                </div>
                <p className="text-slate-600 dark:text-slate-300">{aiPlan.midGameSpike}</p>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  Placement Teamfight
                </div>
                <p className="text-slate-600 dark:text-slate-300">{aiPlan.teamfightPositioning}</p>
              </div>
            </div>
            {aiPlan.keyReminders && aiPlan.keyReminders.length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Rappels clés
                </div>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {aiPlan.keyReminders.map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          !aiLoading && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cliquez sur « Générer le plan tactique IA » pour obtenir les timings de puissance et la synergie de duo adaptés à cette composition.
            </p>
          )
        )}
      </section>

      {/* Modal Sélecteur Universel de Champion (Portraits Champion Select + filtres FR) */}
      {pickerTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Sélectionner un champion"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerTarget(null);
          }}
        >
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-base text-slate-900 dark:text-white">
                  {pickerTarget.type === 'player'
                    ? 'Choisir votre champion'
                    : pickerTarget.type === 'duo'
                      ? 'Choisir votre partenaire de duo / allié clé'
                      : `Choisir l'adversaire (${ENEMY_SLOT_LABELS[pickerTarget.index ?? 0]})`}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {filteredChampions.length} / {ddragon.champions.length} champions · Cliquez sur un portrait pour sélectionner
                </div>
              </div>

              <div className="flex items-center gap-2">
                {pickerTarget.type === 'duo' && duoPartnerId && (
                  <button
                    type="button"
                    onClick={() => {
                      manualOverrideRef.current = true;
                      setDuoPartnerId(null);
                      setAiPlan(null);
                      setPickerTarget(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Aucun partenaire (Solo)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPickerTarget(null)}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-[#0E131D]">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher parmi les 173 champions (ex: Tahm Kench, Lulu, Jinx, Zed...)"
                  className="w-full pl-10 pr-9 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
                {PICKER_TAG_OPTIONS.map((tag) => {
                  const active = pickerTag === tag.id;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => setPickerTag(tag.id)}
                      className={`flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                      }`}
                    >
                      <span>{tag.label}</span>
                      <span className={`font-mono tabular-nums text-[10px] ${active ? 'opacity-90' : 'opacity-70'}`}>
                        {pickerTagCounts[tag.id] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredChampions.length === 0 ? (
              <div className="py-14 text-center space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aucun champion trouvé pour « {searchQuery} ».
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPickerTag('Tous');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            ) : (
              <div className="p-4 pr-3 max-h-[460px] overflow-y-auto thin-scrollbar grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                {filteredChampions.map((champ) => (
                  <PickerPortraitTile
                    key={champ.id}
                    champion={champ}
                    selected={currentPickerChampId === champ.id}
                    onSelect={() => handleSelectChampion(champ.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Sélecteur d'Objet Data Dragon (Atelier Équipement) */}
      {itemPickerSlotIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choisir un objet Data Dragon"
          onClick={(e) => {
            if (e.target === e.currentTarget) setItemPickerSlotIdx(null);
          }}
        >
          <div className="w-full max-w-4xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-base text-slate-900 dark:text-white">
                  Choisir un objet — Emplacement {itemPickerSlotIdx + 1}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {filteredCatalogItems.length} objets officiels Patch {ddragon.version} · Stats extraites en temps réel
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAssignItemToSlot(itemPickerSlotIdx, null)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Vider l’emplacement
                </button>
                <button
                  type="button"
                  onClick={() => setItemPickerSlotIdx(null)}
                  aria-label="Fermer"
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-[#0E131D]">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  autoFocus
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  placeholder="Rechercher un objet (ex: Cœuracier, Randuin, Visage spirituel, Liandry...)"
                  className="w-full pl-10 pr-9 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {itemSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setItemSearchQuery('')}
                    aria-label="Effacer"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
                {ITEM_FILTER_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setItemFilterKey(f.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      itemFilterKey === f.id
                        ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 max-h-[440px] overflow-y-auto thin-scrollbar grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredCatalogItems.slice(0, 90).map((it) => {
                const tags = formatItemStatTags(it);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleAssignItemToSlot(itemPickerSlotIdx, it)}
                    className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] hover:border-amber-500/70 text-left transition-colors"
                  >
                    <SafeGameIcon
                      src={it.imageUrl}
                      alt={it.name}
                      fallbackLabel={it.name}
                      sizeClass="w-10 h-10"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {it.name}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                          {it.gold.total} po
                        </span>
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {tags.length > 0 ? tags.join(' · ') : it.plaintext || 'Objet utilitaire'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
