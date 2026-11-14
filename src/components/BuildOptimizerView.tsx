import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Brain,
  Check,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Radar,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
} from 'lucide-react';
import { computeBuildRecommendation } from '../engines/buildEngine.ts';
import type {
  ChampionSummary,
  DDragonBootstrap,
  DetectedRunePage,
  GameModeContext,
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
import { SafeGameIcon } from './SafeGameIcon.tsx';

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
const PICKER_TAGS = ['Tous', 'Fighter', 'Mage', 'Assassin', 'Tank', 'Marksman', 'Support'];

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
        playerChampion,
        duoPartner,
        role,
        enemies: enemyChampions,
        items: ddragon.items,
        runeTrees: ddragon.runeTrees,
        tendencies,
      }),
    [ddragon, gameMode, playerChampion, duoPartner, role, enemyChampions, tendencies],
  );

  const filteredChampions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ddragon.champions.filter((c) => {
      const matchesTag = pickerTag === 'Tous' || c.tags.includes(pickerTag);
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
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
      const res = await fetch('/api/coach/build-rationale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation, tendencies }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
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

      {/* Sélection Champion Joueur + Partenaire Duo + 5 Adversaires */}
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

          <div className="flex flex-wrap items-center gap-3">
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
                      ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950'
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Votre champion + Partenaire de Duo / Allié */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Votre champion
              </div>
              <button
                type="button"
                onClick={() => setPickerTarget({ type: 'player' })}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] hover:border-amber-500/60 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <SafeGameIcon
                    key={`builder-player-${playerChampion.id}`}
                    src={playerChampion.imageUrl}
                    alt={playerChampion.name}
                    fallbackLabel={playerChampion.name}
                    sizeClass="w-11 h-11"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {playerChampion.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {playerChampion.tags.join(' / ')}
                    </div>
                  </div>
                </div>
                <Pencil className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                  {role === 'SUPPORT'
                    ? 'Votre ADC (Duo)'
                    : role === 'ADC'
                      ? 'Votre Support (Duo)'
                      : 'Allié clé / Duo'}
                </span>
                {duoPartner && (
                  <button
                    type="button"
                    onClick={() => {
                      manualOverrideRef.current = true;
                      setDuoPartnerId(null);
                      setAiPlan(null);
                    }}
                    className="text-[11px] text-slate-400 hover:text-rose-400"
                  >
                    Retirer
                  </button>
                )}
              </div>

              {duoPartner ? (
                <button
                  type="button"
                  onClick={() => setPickerTarget({ type: 'duo' })}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-sky-500/30 bg-sky-500/5 hover:border-sky-500/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <SafeGameIcon
                      key={`builder-duo-${duoPartner.id}`}
                      src={duoPartner.imageUrl}
                      alt={duoPartner.name}
                      fallbackLabel={duoPartner.name}
                      sizeClass="w-11 h-11"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                        {duoPartner.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {duoPartner.tags.join(' / ')}
                      </div>
                    </div>
                  </div>
                  <Pencil className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickerTarget({ type: 'duo' })}
                  className="w-full h-[68px] flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-sky-500 hover:text-sky-400 transition-colors"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Ajouter un partenaire de duo
                </button>
              )}
            </div>
          </div>

          {/* 5 champions adverses */}
          <div className="lg:col-span-7 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Champions adverses (cliquez sur un slot pour choisir parmi les {ddragon.champions.length} champions)
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

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {enemyIds.map((id, idx) => {
                const enemy = id ? ddragon.champions.find((c) => c.id === id) : null;
                return (
                  <button
                    key={`${id || 'empty'}-${idx}`}
                    type="button"
                    onClick={() => setPickerTarget({ type: 'enemy', index: idx })}
                    className="group flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] hover:border-amber-500/70 transition-colors"
                  >
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">
                      {gameMode === 'ARAM' ? `Adversaire ${idx + 1}` : ENEMY_SLOT_LABELS[idx]}
                    </span>
                    {enemy ? (
                      <>
                        <SafeGameIcon
                          key={`builder-enemy-${idx}-${enemy.id}`}
                          src={enemy.imageUrl}
                          alt={enemy.name}
                          fallbackLabel={enemy.name}
                          sizeClass="w-11 h-11"
                        />
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate w-full text-center">
                          {enemy.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-11 h-11 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="text-xs text-slate-400 truncate w-full text-center">
                          En attente...
                        </span>
                      </>
                    )}
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 opacity-80 group-hover:opacity-100">
                      Choisir
                    </span>
                  </button>
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

            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">Tanks / Frontline</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.tankCount}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">Sources de soin</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.highHealCount}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">Menaces Burst</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.burstThreatCount}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0D121C] border border-slate-200/70 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">Contrôles majeurs (CC)</div>
                <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {recommendation.threatSummary.ccThreatCount}
                </div>
              </div>
            </div>
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
              {[recommendation.boots, ...recommendation.coreItems].map((rec) => (
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
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white">
                        {rec.item.name}
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
              ))}
            </div>

            {recommendation.situationalItems.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Options situationnelles (4e / 5e emplacement)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {recommendation.situationalItems.map((rec) => (
                    <div
                      key={rec.item.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] space-y-2"
                    >
                      <div className="flex items-center gap-2.5">
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
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                        {rec.reasons[0]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Section Pleine Largeur : Page de Runes officielle (Client LoL) avec comparaison directe */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        {(() => {
          const showingCurrent = runeViewMode === 'current' && Boolean(detectedRunePage);

          const recPrimaryTree = recommendation.runes.primaryTree;
          const recSecondaryTree = recommendation.runes.secondaryTree;
          const recSelectedIds = new Set([
            ...(recommendation.runes.keystone ? [recommendation.runes.keystone.id] : []),
            ...recommendation.runes.primarySlots.map((r) => r.id),
            ...recommendation.runes.secondarySlots.map((r) => r.id),
          ]);

          const curPrimaryTree = detectedRunePage?.primaryTreeId
            ? ddragon.runeTrees.find((t) => t.id === detectedRunePage.primaryTreeId) || recPrimaryTree
            : recPrimaryTree;
          const curSecondaryTree = detectedRunePage?.secondaryTreeId
            ? ddragon.runeTrees.find((t) => t.id === detectedRunePage.secondaryTreeId) || recSecondaryTree
            : recSecondaryTree;

          const activePrimaryTree = showingCurrent ? curPrimaryTree : recPrimaryTree;
          const activeSecondaryTree = showingCurrent ? curSecondaryTree : recSecondaryTree;

          const activeKeystoneId = showingCurrent
            ? detectedRunePage?.keystoneId
            : recommendation.runes.keystone?.id;

          const activeRuneIds = showingCurrent
            ? new Set(detectedRunePage?.selectedRuneIds || [])
            : recSelectedIds;

          const activeShardIndices: [number, number, number] = showingCurrent && detectedRunePage?.selectedShardRowIndices
            ? detectedRunePage.selectedShardRowIndices
            : [
                recommendation.runes.shardRows[0]?.selectedIndex ?? 0,
                recommendation.runes.shardRows[1]?.selectedIndex ?? 0,
                recommendation.runes.shardRows[2]?.selectedIndex ?? 0,
              ];

          const activeShardLabels = showingCurrent && detectedRunePage?.shardLabels?.length === 3
            ? detectedRunePage.shardLabels
            : recommendation.runes.shards;

          const matchingCount = detectedRunePage
            ? detectedRunePage.selectedRuneIds.filter((id) => recSelectedIds.has(id)).length
            : null;

          const cleanText = (raw: string) =>
            raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

          const allRunesInTree = (tree: typeof activePrimaryTree) =>
            (tree?.slots || []).flatMap((s) => s.runes);

          const selectedPrimaryList = allRunesInTree(activePrimaryTree).filter(
            (r) => r.id === activeKeystoneId || activeRuneIds.has(r.id),
          );
          const selectedSecondaryList = (activeSecondaryTree?.slots || [])
            .slice(1, 4)
            .flatMap((s) => s.runes)
            .filter((r) => activeRuneIds.has(r.id));

          const shardShortTokens = [
            ['+9 AD/AP', '+10% AS', '+8 Hâte'],
            ['+9 AD/AP', '+2% Vit.', '+PV/niv'],
            ['+65 PV', '+10% Tén.', '+PV/niv'],
          ];

          return (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Page de Runes officielle (Client LoL)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {showingCurrent && detectedRunePage ? (
                      <>
                        <span>
                          Page détectée{detectedRunePage.pageName ? ` : « ${detectedRunePage.pageName} »` : ''}
                        </span>
                        <span className="mx-2" aria-hidden="true">·</span>
                        <span>Source : {detectedRunePage.sourceLabel}</span>
                        {matchingCount !== null && (
                          <>
                            <span className="mx-2" aria-hidden="true">·</span>
                            <span className={matchingCount === 6 ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>
                              {matchingCount}/6 runes alignées avec la méta
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <span>
                          {activePrimaryTree?.name} + {activeSecondaryTree?.name}
                        </span>
                        {detectedRunePage && matchingCount !== null && (
                          <>
                            <span className="mx-2" aria-hidden="true">·</span>
                            <span className="text-sky-500 font-medium">
                              Page équipée détectée ({matchingCount}/6 runes identiques)
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>

                {/* Sélecteur Conseillée vs Page équipée (Client LoL) */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={() => setRuneViewMode('recommended')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      !showingCurrent
                        ? 'bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Page conseillée (Méta)
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
                        ? 'bg-sky-600 text-white'
                        : detectedRunePage
                          ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                          : 'text-slate-400 dark:text-slate-500 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    {detectedRunePage
                      ? `Votre page équipée${detectedRunePage.pageName ? ` (${detectedRunePage.pageName})` : ''}`
                      : 'Votre page (non détectée)'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                {/* Colonne 1 : Arbre Principal (Grille visuelle + Noms lisibles à côté) */}
                <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-4 flex flex-col justify-between gap-4">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      {activePrimaryTree && (
                        <SafeGameIcon
                          src={activePrimaryTree.imageUrl}
                          alt={activePrimaryTree.name}
                          fallbackLabel={activePrimaryTree.name}
                          sizeClass="w-8 h-8"
                          className="rounded-full border-0"
                        />
                      )}
                      <div>
                        <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                          {activePrimaryTree?.name || 'Arbre Principal'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Branche principale (4 runes)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rangée 0 : Runes fondamentales */}
                  {activePrimaryTree?.slots?.[0] && (
                    <div className="flex items-center justify-around gap-2 py-1">
                      {activePrimaryTree.slots[0].runes.map((rune) => {
                        const active = rune.id === activeKeystoneId;
                        const differsFromRec = showingCurrent && active && !recSelectedIds.has(rune.id);
                        return (
                          <div
                            key={rune.id}
                            title={`${rune.name} — ${cleanText(rune.shortDesc)}`}
                            className={`flex flex-col items-center gap-1 transition-all ${
                              active ? 'scale-105' : 'opacity-35 grayscale hover:opacity-85 hover:grayscale-0'
                            }`}
                          >
                            <div
                              className={`p-0.5 rounded-full ${
                                active
                                  ? differsFromRec
                                    ? 'ring-2 ring-sky-400 bg-sky-500/20'
                                    : 'ring-2 ring-amber-400 bg-amber-500/20 shadow-md shadow-amber-500/20'
                                  : 'border border-slate-700/60'
                              }`}
                            >
                              <SafeGameIcon
                                src={rune.imageUrl}
                                alt={rune.name}
                                fallbackLabel={rune.name}
                                sizeClass="w-11 h-11"
                                className="rounded-full border-0"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Rangées 1 à 3 : Runes mineures */}
                  <div className="space-y-3">
                    {(activePrimaryTree?.slots || []).slice(1, 4).map((slot, rowIdx) => (
                      <div
                        key={rowIdx}
                        className="flex items-center justify-around gap-2 pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80"
                      >
                        {slot.runes.map((rune) => {
                          const active = activeRuneIds.has(rune.id);
                          const differsFromRec = showingCurrent && active && !recSelectedIds.has(rune.id);
                          return (
                            <div
                              key={rune.id}
                              title={`${rune.name} — ${cleanText(rune.shortDesc)}`}
                              className={`p-0.5 rounded-full transition-all ${
                                active
                                  ? differsFromRec
                                    ? 'ring-2 ring-sky-400 bg-sky-500/20 scale-105'
                                    : 'ring-2 ring-amber-400 bg-amber-500/15 scale-105'
                                  : 'opacity-35 grayscale hover:opacity-85 hover:grayscale-0'
                              }`}
                            >
                              <SafeGameIcon
                                src={rune.imageUrl}
                                alt={rune.name}
                                fallbackLabel={rune.name}
                                sizeClass="w-9 h-9"
                                className="rounded-full border-0"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Liste claire & lisible des 4 runes actives */}
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    {selectedPrimaryList.map((rune, idx) => (
                      <div key={rune.id} className="flex items-baseline justify-between gap-2">
                        <span
                          className={
                            idx === 0
                              ? 'font-semibold text-amber-600 dark:text-amber-400'
                              : 'font-medium text-slate-800 dark:text-slate-200'
                          }
                        >
                          {idx === 0 ? '★ ' : '· '}
                          {rune.name}
                        </span>
                        {showingCurrent && !recSelectedIds.has(rune.id) && (
                          <span className="text-[11px] text-sky-500 shrink-0">Différente de la méta</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Colonne 2 : Arbre Secondaire */}
                <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-4 flex flex-col justify-between gap-4">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                    {activeSecondaryTree && (
                      <SafeGameIcon
                        src={activeSecondaryTree.imageUrl}
                        alt={activeSecondaryTree.name}
                        fallbackLabel={activeSecondaryTree.name}
                        sizeClass="w-8 h-8"
                        className="rounded-full border-0"
                      />
                    )}
                    <div>
                      <div className="text-sm font-bold text-sky-600 dark:text-sky-400">
                        {activeSecondaryTree?.name || 'Arbre Secondaire'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Branche secondaire (2 runes)
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 my-auto">
                    {(activeSecondaryTree?.slots || []).slice(1, 4).map((slot, rowIdx) => (
                      <div
                        key={rowIdx}
                        className={`flex items-center justify-around gap-2 ${
                          rowIdx > 0 ? 'pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80' : ''
                        }`}
                      >
                        {slot.runes.map((rune) => {
                          const active = activeRuneIds.has(rune.id);
                          return (
                            <div
                              key={rune.id}
                              title={`${rune.name} — ${cleanText(rune.shortDesc)}`}
                              className={`p-0.5 rounded-full transition-all ${
                                active
                                  ? 'ring-2 ring-sky-400 bg-sky-500/20 scale-105'
                                  : 'opacity-35 grayscale hover:opacity-85 hover:grayscale-0'
                              }`}
                            >
                              <SafeGameIcon
                                src={rune.imageUrl}
                                alt={rune.name}
                                fallbackLabel={rune.name}
                                sizeClass="w-9 h-9"
                                className="rounded-full border-0"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                    {selectedSecondaryList.map((rune) => (
                      <div key={rune.id} className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-sky-600 dark:text-sky-400">
                          · {rune.name}
                        </span>
                        {showingCurrent && !recSelectedIds.has(rune.id) && (
                          <span className="text-[11px] text-amber-500 shrink-0">Hors méta</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Colonne 3 : Fragments de statistiques 3x3 sans débordement */}
                <div className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] p-4 flex flex-col justify-between gap-4">
                  <div className="pb-2.5 border-b border-slate-200 dark:border-slate-800">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      Fragments (3×3)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Statistiques bonus de début de partie
                    </div>
                  </div>

                  <div className="space-y-3 my-auto">
                    {recommendation.runes.shardRows.map((row, rIdx) => {
                      const chosenIdx = activeShardIndices[rIdx] ?? row.selectedIndex;
                      return (
                        <div key={row.rowLabel} className="space-y-1">
                          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {row.rowLabel}
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {row.options.map((opt, cIdx) => {
                              const active = cIdx === chosenIdx;
                              const shortLbl = shardShortTokens[rIdx]?.[cIdx] || opt.slice(0, 7);
                              return (
                                <div
                                  key={opt}
                                  title={opt}
                                  className={`py-1.5 px-1 rounded-md text-center text-[11px] font-mono tabular-nums border whitespace-nowrap overflow-hidden ${
                                    active
                                      ? showingCurrent
                                        ? 'border-sky-400 bg-sky-500/15 text-sky-600 dark:text-sky-300 font-bold'
                                        : 'border-amber-400 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold'
                                      : 'border-slate-200 dark:border-slate-800 text-slate-400 opacity-50'
                                  }`}
                                >
                                  {shortLbl}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    {activeShardLabels.map((lbl, idx) => (
                      <div key={idx}>· {lbl}</div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {showingCurrent
                  ? 'Comparaison directe avec la page conseillée : les runes entourées en bleu sur votre page actuelle ne correspondent pas à la recommandation optimale pour ce match-up.'
                  : recommendation.runes.rationale}
              </p>
            </>
          );
        })()}
      </section>

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

      {/* Modal Sélecteur Universel de Champion (173 champions + filtres par classe) */}
      {pickerTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Sélectionner un champion"
        >
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white">
                  {pickerTarget.type === 'player'
                    ? 'Choisir votre champion'
                    : pickerTarget.type === 'duo'
                      ? 'Choisir votre partenaire de duo / allié clé'
                      : `Choisir l'adversaire (${ENEMY_SLOT_LABELS[pickerTarget.index ?? 0]})`}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Liste complète : {filteredChampions.length} / {ddragon.champions.length} champions affichés
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPickerTarget(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher parmi les 173 champions (ex: Tahm Kench, Lulu, Jinx, Zed...)"
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
                {PICKER_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setPickerTag(tag)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      pickerTag === tag
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 max-h-[420px] overflow-y-auto grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {filteredChampions.map((champ) => (
                <button
                  key={champ.id}
                  type="button"
                  onClick={() => handleSelectChampion(champ.id)}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg border border-transparent hover:border-amber-500/60 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <SafeGameIcon
                    src={champ.imageUrl}
                    alt={champ.name}
                    fallbackLabel={champ.name}
                    sizeClass="w-11 h-11"
                  />
                  <span className="text-xs text-slate-800 dark:text-slate-200 truncate w-full text-center">
                    {champ.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
