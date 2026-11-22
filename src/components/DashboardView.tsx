import { useMemo, useState } from 'react';
import { motion, type Variants } from 'motion/react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  Eye,
  FolderSync,
  ListChecks,
  MapPin,
  RefreshCw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  X,
} from 'lucide-react';
import { ContextualTacticalAdvice } from './ContextualTacticalAdvice.tsx';
import { DuoSynergyAnalysis } from './DuoSynergyAnalysis.tsx';
import { PerformanceRadarAndDuoPanel } from './PerformanceRadarAndDuoPanel.tsx';
import { RankedTierCrest } from './RankedTierCrest.tsx';
import { SafeGameIcon } from './SafeGameIcon.tsx';
import { SectionInfoTooltip } from './SectionInfoTooltip.tsx';
import type { ToastItem } from './ToastContainer.tsx';
import { TopChampionsChart } from './TopChampionsChart.tsx';
import { postCoachJson } from '../engines/aiConfig.ts';
import {
  analyzePlayerPlaystyleAndRecommendChampions,
  formatRecommenderRoleLabel,
  type RecommenderRoleFilter,
} from '../engines/championRecommender.ts';
import { downloadRecentMatchesExport } from '../engines/matchExportEngine.ts';
import {
  computeFrequentTeammates,
  computeMobalyticsStyleProfile,
} from '../engines/performanceProfileEngine.ts';
import { buildCareerSynthesisDataset } from '../engines/postGameEngine.ts';
import {
  buildTrainingFocusReport,
  type TrainingIntensity,
} from '../engines/trainingGoalsEngine.ts';
import type {
  CareerAiSynthesis,
  CareerSynthesisDataset,
  ChampionSummary,
  MatchRecord,
  PlayerProfileResponse,
  Role,
} from '../engines/types.ts';
import {
  formatChampionDisplayName,
  getChampionIconUrl,
  resolveChampionDisplay,
} from '../utils/championDisplay.ts';
import { formatRankedQueue } from '../utils/rankedDisplay.ts';

function hydrateCareerSynthesis(
  raw: CareerAiSynthesis | null,
  dataset: CareerSynthesisDataset,
  riotId: string,
  champions: ChampionSummary[] = [],
): CareerAiSynthesis | null {
  if (!raw) return null;

  const topZones = dataset.zoneTotals.filter((z) => z.deaths > 0);
  const topZone = topZones[0];
  const secondZone = topZones[1];
  const topChamps = [...dataset.championStats].sort((a, b) => b.games - a.games);
  const bestChamp = [...dataset.championStats].sort((a, b) => b.winRate - a.winRate)[0];
  const worstDeathChamp = [...dataset.championStats].sort((a, b) => b.avgDeaths - a.avgDeaths)[0];

  const defaultSummary = `Sur ${dataset.gamesAnalyzed} parties archivées pour ${riotId}, le bilan est de ${dataset.wins}V - ${dataset.losses}D (${dataset.winRate}% WR) avec ${dataset.avgDeaths} morts/partie, ${dataset.avgCsPerMin} CS/min et ${dataset.isolatedDeathPct}% de morts isolées.`;

  const defaultPosErrors: CareerAiSynthesis['recurringPositioningErrors'] = [
    {
      zoneOrPattern: topZone
        ? `${topZone.zone} (${topZone.deaths} morts)`
        : 'Sur-extension en mid-game sans vision',
      frequencyNote: topZone
        ? `${topZone.deaths} morts (${topZone.isolatedDeaths} isolées, ${topZone.preObjectiveDeaths} pré-objectif)`
        : `${dataset.isolatedDeathPct}% de morts isolées sur ${dataset.gamesAnalyzed} matchs`,
      correction:
        'Posez une Balise de contrôle dans la rivière ou la jonction jungle avant de dépasser la moitié de la carte, et reculez dès que 2 ennemis disparaissent de la mini-carte.',
    },
    {
      zoneOrPattern: secondZone
        ? `${secondZone.zone} (${secondZone.deaths} morts)`
        : 'Morts 60s avant les objectifs neutres',
      frequencyNote: secondZone
        ? `${secondZone.deaths} morts (${secondZone.isolatedDeaths} isolées)`
        : `${dataset.preObjectiveDeathPct}% de morts avant Dragon ou Baron`,
      correction:
        'Déclenchez votre rappel à -55s avant Dragon/Baron pour revenir avec vos objets complets et votre balise brouilleuse, au lieu de contester seul en retard.',
    },
    {
      zoneOrPattern: 'Transitions de milieu de partie (12–24 min)',
      frequencyNote: `${dataset.phaseDeaths.mid12To24m} morts enregistrées entre 12 et 24 minutes`,
      correction:
        'Après la chute de la T1, poussez la vague seulement jusqu’à votre ligne de vision sécurisée puis pivotez vers votre carry ou votre jungler.',
    },
  ];

  const rawPos = Array.isArray(raw.recurringPositioningErrors) ? raw.recurringPositioningErrors : [];
  const recurringPositioningErrors = (rawPos.length > 0 ? rawPos : defaultPosErrors.slice(0, 2)).map(
    (item, idx) => {
      const fb = defaultPosErrors[idx % defaultPosErrors.length];
      return {
        zoneOrPattern: item?.zoneOrPattern?.trim() || fb.zoneOrPattern,
        frequencyNote: item?.frequencyNote?.trim() || fb.frequencyNote,
        correction: item?.correction?.trim() || fb.correction,
      };
    },
  );

  const defaultAdjustments: CareerAiSynthesis['gameplayAdjustments'] = [
    {
      area: 'Survie & Gestion des risques',
      currentHabit: `${dataset.avgDeaths} morts par match en moyenne (${dataset.isolatedDeathPct}% isolées).`,
      targetAdjustment:
        'Plafonner à 5 morts max en respectant la règle des 3 secondes sans information adverse.',
      expectedImpact: 'Moins de primes cédées et +4 à 6% de présence active en teamfight décisif.',
    },
    {
      area: 'Tempo & Contrôle des objectifs',
      currentHabit: `${dataset.preObjectiveDeathPct}% des morts surviennent dans les 60s précédant un objectif.`,
      targetAdjustment:
        'Rappel systématique à -55s du Dragon/Baron pour acheter et sécuriser la vision en groupe.',
      expectedImpact: 'Arrivée en supériorité ou à égalité numérique sur les Dragons/Hérauts.',
    },
    {
      area: 'Économie & Rythme de lane',
      currentHabit:
        dataset.avgGoldDiffAt15 !== null
          ? `Écart moyen à 15 min : ${dataset.avgGoldDiffAt15 >= 0 ? '+' : ''}${dataset.avgGoldDiffAt15} or (${dataset.avgCsPerMin} CS/min).`
          : `Rythme global de ${dataset.avgCsPerMin} CS/min sur vos parties archivées.`,
      targetAdjustment:
        'Sécuriser chaque vague canon et les objets à faible coût quand votre lane est sous pression.',
      expectedImpact: 'Accélère votre pic à 2 objets de 1 à 2 minutes.',
    },
  ];

  const rawAdj = Array.isArray(raw.gameplayAdjustments) ? raw.gameplayAdjustments : [];
  const gameplayAdjustments = (rawAdj.length > 0 ? rawAdj : defaultAdjustments).map((adj, idx) => {
    const fb = defaultAdjustments[idx % defaultAdjustments.length];
    return {
      area: adj?.area?.trim() || fb.area,
      currentHabit: adj?.currentHabit?.trim() || fb.currentHabit,
      targetAdjustment: adj?.targetAdjustment?.trim() || fb.targetAdjustment,
      expectedImpact: adj?.expectedImpact?.trim() || fb.expectedImpact,
    };
  });

  const defaultPoolAdvice =
    topChamps.length > 0
      ? `Votre pool est centré sur ${topChamps
          .slice(0, 3)
          .map((c) => `${formatChampionDisplayName(champions, c.championName)} (${c.games}p, ${c.winRate}% WR)`)
          .join(', ')}. ${
          bestChamp
            ? `Votre meilleur rendement est sur ${formatChampionDisplayName(champions, bestChamp.championName)} (${bestChamp.winRate}% WR). `
            : ''
        }${
          worstDeathChamp && worstDeathChamp.avgDeaths >= 6.5
            ? `Attention sur ${formatChampionDisplayName(champions, worstDeathChamp.championName)} (${worstDeathChamp.avgDeaths} morts/m) : privilégiez un démarrage défensif.`
            : 'Gardez ce noyau de 2 à 3 champions pour consolider vos réflexes.'
        }`
      : 'Concentrez-vous sur 2 à 3 champions maîtrisés pour stabiliser vos prises de décision.';

  const defaultPlan = [
    `Partie 1 : Rester sous 5 morts en évitant toute avancée seule dans ${
      topZone ? topZone.zone : 'la rivière non éclairée'
    }.`,
    'Partie 2 : Déclencher chaque rappel 55 secondes avant Dragon/Baron avec au moins 1 Balise de contrôle.',
    `Partie 3 : Adapter votre 2e objet dès que l’équipe adverse prend l’avantage (${
      bestChamp ? `sur ${formatChampionDisplayName(champions, bestChamp.championName)}` : 'en priorité défensive'
    }).`,
  ];

  const rawPlan = Array.isArray(raw.threeGameActionPlan)
    ? raw.threeGameActionPlan.map((s) => s?.trim()).filter(Boolean)
    : [];

  return {
    schemaVersion: raw.schemaVersion ?? 1,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    gamesAnalyzed: raw.gamesAnalyzed || dataset.gamesAnalyzed,
    executiveSummary: raw.executiveSummary?.trim() || defaultSummary,
    recurringPositioningErrors,
    gameplayAdjustments,
    championPoolAdvice: raw.championPoolAdvice?.trim() || defaultPoolAdvice,
    threeGameActionPlan: rawPlan.length >= 3 ? rawPlan.slice(0, 3) : [...rawPlan, ...defaultPlan].slice(0, 3),
  };
}
import {
  downloadWindowsBridgeBat,
  formatMatchQueueLabel,
  normalizeLcuHistoryToMatches,
  UNIVERSAL_HISTORY_CLIPBOARD_CMD,
} from '../utils/liveBridge.ts';

interface DashboardViewProps {
  profile: PlayerProfileResponse | null;
  loading: boolean;
  error: string | null;
  riotConfigured: boolean;
  champions: ChampionSummary[];
  patchVersion: string;
  autoSyncEnabled: boolean;
  lastSyncedAt: string | null;
  onToggleAutoSync: () => void;
  onDeepSync: () => void;
  onRetrySync: () => void;
  onDismissError: () => void;
  onMergeLocalMatches: (matches: MatchRecord[]) => number;
  onSelectMatchForReview: (match: MatchRecord) => void;
  onNavigateToBuilds: (championName?: string, duoChampionName?: string) => void;
  onNavigateToLive: () => void;
  onNavigateToPostGame?: () => void;
  onNavigateToSettings?: () => void;
  careerSynthesis?: CareerAiSynthesis | null;
  geminiConfigured?: boolean;
  onSaveCareerSynthesis?: (synthesis: CareerAiSynthesis) => void;
  defaultRole?: Role;
  trainingIntensity?: TrainingIntensity;
  onChangeTrainingIntensity?: (intensity: TrainingIntensity) => void;
  onNotify?: (toast: Omit<ToastItem, 'id'>) => void;
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const dashboardContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.045,
    },
  },
};

const dashboardSectionVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: EASE_OUT,
    },
  },
};

const subCardGridVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.035,
    },
  },
};

const subCardItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: EASE_OUT,
    },
  },
};

export function DashboardView({
  profile,
  loading,
  error,
  riotConfigured,
  champions,
  patchVersion,
  autoSyncEnabled,
  lastSyncedAt,
  onToggleAutoSync,
  onDeepSync,
  onRetrySync,
  onDismissError,
  onMergeLocalMatches,
  onSelectMatchForReview,
  onNavigateToBuilds,
  onNavigateToLive,
  onNavigateToPostGame,
  onNavigateToSettings,
  careerSynthesis = null,
  geminiConfigured = true,
  onSaveCareerSynthesis,
  defaultRole = 'SUPPORT',
  trainingIntensity = 'standard',
  onChangeTrainingIntensity,
  onNotify,
}: DashboardViewProps) {
  const [showLocalImport, setShowLocalImport] = useState(false);
  const [localImporting, setLocalImporting] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pasteHistoryJson, setPasteHistoryJson] = useState('');
  const [copiedHistCmd, setCopiedHistCmd] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [recRoleFilter, setRecRoleFilter] = useState<RecommenderRoleFilter>('AUTO');
  const [includePlayedInRecs, setIncludePlayedInRecs] = useState(false);
  const [sectionMode, setSectionMode] = useState<'essential' | 'progression' | 'history' | 'all'>('essential');

  const careerDataset = useMemo(
    () => buildCareerSynthesisDataset(profile?.matches || [], profile?.tendencies),
    [profile?.matches, profile?.tendencies],
  );

  const trainingReport = useMemo(
    () => buildTrainingFocusReport(profile?.matches || [], trainingIntensity, defaultRole),
    [profile?.matches, trainingIntensity, defaultRole],
  );

  const championFit = useMemo(
    () =>
      analyzePlayerPlaystyleAndRecommendChampions(
        profile?.matches || [],
        champions,
        recRoleFilter,
        includePlayedInRecs,
        profile?.championMasteries || [],
      ),
    [profile?.matches, profile?.championMasteries, champions, recRoleFilter, includePlayedInRecs],
  );

  const hydratedSynthesis = useMemo(
    () => hydrateCareerSynthesis(careerSynthesis, careerDataset, profile?.riotId || '', champions),
    [careerSynthesis, careerDataset, profile?.riotId, champions],
  );

  const mobalyticsProfile = useMemo(
    () => computeMobalyticsStyleProfile(profile?.matches || [], defaultRole),
    [profile?.matches, defaultRole],
  );

  const frequentTeammates = useMemo(
    () => computeFrequentTeammates(profile?.matches || [], profile?.riotId || ''),
    [profile?.matches, profile?.riotId],
  );

  const isLegacySynthesis = Boolean(careerSynthesis && (!careerSynthesis.schemaVersion || careerSynthesis.schemaVersion < 2));

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  const getChampIcon = (championName: string) => getChampionIconUrl(champions, championName);

  const applyRawHistoryJson = (rawObj: any) => {
    const converted = normalizeLcuHistoryToMatches(rawObj, champions, profile?.riotId || '');
    if (converted.length === 0) {
      setLocalErr(
        'Aucune partie trouvée dans ce JSON (vérifiez que League of Legends est ouvert et utilisez la commande /history).',
      );
      return;
    }
    const added = onMergeLocalMatches(converted);
    setPasteHistoryJson('');
    setShowLocalImport(false);
    setLocalMsg(
      added > 0
        ? `${added} partie(s) locale(s) ajoutée(s) à votre historique (incluant vos parties Personnalisées) !`
        : `${converted.length} partie(s) lues depuis le client LoL (déjà présentes dans votre historique).`,
    );
  };

  const handleFetchLocalHistory = async () => {
    setLocalImporting(true);
    setLocalErr(null);
    setLocalMsg(null);
    try {
      const res = await fetch('http://127.0.0.1:38421/history');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Historique client indisponible.');
      applyRawHistoryJson(data);
    } catch {
      setShowLocalImport(true);
      setLocalErr(
        isInsideIframe
          ? 'Accès à 127.0.0.1:38421 bloqué dans l’aperçu iframe : copiez la commande ci-dessous dans PowerShell puis faites Ctrl+V (ou ouvrez l’app hors iframe).'
          : 'Pont local 127.0.0.1:38421 non détecté. Téléchargez et lancez lol-coach-bridge.bat v3.4 puis réessayez.',
      );
    } finally {
      setLocalImporting(false);
    }
  };

  const handleCopyHistCmd = async () => {
    try {
      await navigator.clipboard.writeText(UNIVERSAL_HISTORY_CLIPBOARD_CMD);
      setCopiedHistCmd(true);
      window.setTimeout(() => setCopiedHistCmd(false), 2000);
    } catch {
      setLocalErr('Sélectionnez la commande et copiez avec Ctrl+C.');
    }
  };

  const handleGenerateCareerSynthesis = async () => {
    if (!profile || careerDataset.gamesAnalyzed === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await postCoachJson<CareerAiSynthesis>('/api/coach/career-synthesis', {
        riotId: profile.riotId,
        region: profile.region,
        dataset: careerDataset,
      });
      onSaveCareerSynthesis?.(data);
      onNotify?.({
        variant: 'success',
        title: `Synthèse Globale IA prête (${data.gamesAnalyzed} matchs)`,
        description:
          'Votre Conseil Tactique Contextuel et votre plan d’action sur 3 parties ont été actualisés.',
      });
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Erreur lors de l’appel à la synthèse globale IA.',
      );
    } finally {
      setAiLoading(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] animate-pulse" />
      </div>
    );
  }

  // Si aucune donnée n'est encore chargée et qu'une erreur survient
  if (error && !profile) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-rose-600 dark:text-rose-400">
            Erreur de synchronisation Riot API
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{error}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href="https://developer.riotgames.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-800 dark:text-slate-100 hover:border-amber-500/60 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            Régénérer sur Riot Developer
          </a>
          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
              Guide &amp; Paramètres API
            </button>
          )}
          <button
            type="button"
            onClick={onRetrySync}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Réessayer maintenant
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const { tendencies, rankedSolo, rankedFlex, challenges, serverStatus, matches, activeGame } = profile;
  const soloRankInfo = formatRankedQueue(rankedSolo);
  const flexRankInfo = formatRankedQueue(rankedFlex);

  return (
    <motion.div
      key={`${profile.riotId}-${profile.region}`}
      variants={dashboardContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-7"
    >
      {/* Bannière d'erreur non-bloquante : conserve le profil et les parties déjà synchronisées */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              Erreur de synchronisation Riot API (mode archive locale actif)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{error}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="https://developer.riotgames.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500/60 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
              Portail Riot
            </a>
            {onNavigateToSettings && (
              <button
                type="button"
                onClick={onNavigateToSettings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                Guide API
              </button>
            )}
            <button
              type="button"
              onClick={onRetrySync}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Réessayer
            </button>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Fermer l'alerte"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!riotConfigured && (
        <motion.section
          variants={dashboardSectionVariants}
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-slate-700 dark:text-slate-300 space-y-1.5"
        >
          <div className="font-semibold text-amber-700 dark:text-amber-400">
            Mode aperçu : clé serveur RIOT_API_KEY non renseignée
          </div>
          <p className="leading-relaxed">
            Pour synchroniser automatiquement toutes les vraies parties de{' '}
            <span className="font-mono font-semibold">{profile.riotId}</span> (sans aucun import JSON manuel), créez une clé sur{' '}
            <a
              href="https://developer.riotgames.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:text-amber-500"
            >
              developer.riotgames.com
            </a>{' '}
            (connexion avec votre compte Riot habituel), puis ajoutez-la sous le nom{' '}
            <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">RIOT_API_KEY</code> dans{' '}
            <strong>Settings &gt; Secrets</strong>.
          </p>
        </motion.section>
      )}

      {/* En-tête Profil, Classement Officiel & Provenance */}
      <motion.section
        variants={dashboardSectionVariants}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <SafeGameIcon
              src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/profileicon/${profile.profileIconId}.png`}
              alt={`Icône d'invocateur ${profile.riotId}`}
              fallbackLabel={profile.riotId}
              sizeClass="w-14 h-14"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                  {profile.riotId}
                </h1>
                <SectionInfoTooltip
                  title="Profil & Niveau en Classé"
                  description="Affiche l’identité du compte Riot actif, ses rangs officiels Solo/Duo et Flex 5v5 (League-V4), la provenance des données et le raccourci vers l’optimisation de build ou le Coach Live."
                  usageTip="Si une partie en cours est détectée, un bouton vert apparaît ici pour ouvrir le Coach Temps Réel en un clic."
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>Serveur {profile.region}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono tabular-nums">Niveau {profile.level}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>Source : {profile.source}</span>
                {serverStatus && (
                  <>
                    <span aria-hidden="true" className="mx-2">·</span>
                    <span
                      className={
                        serverStatus.healthy
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400 font-semibold'
                      }
                    >
                      {serverStatus.healthy
                        ? `État ${serverStatus.platform} : OK`
                        : `${serverStatus.incidents.length + serverStatus.maintenances.length} incident/maintenance Riot`}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeGame.inGame && (
              <button
                type="button"
                onClick={onNavigateToLive}
                className="px-4 py-2 text-xs font-semibold rounded-full bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 shadow-xs"
              >
                Partie en cours · Ouvrir Coach Live
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateToBuilds(matches[0]?.player.championName)}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-[#007AFF] hover:bg-[#0066D6] dark:bg-[#0A84FF] dark:hover:bg-[#2994FF] text-white transition-colors whitespace-nowrap shrink-0 shadow-xs"
            >
              Préparer un build
            </button>
          </div>
        </div>

        {/* Cartes Niveau en Classé (Solo/Duo & Flex 5v5) */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {[
            { key: 'solo', queueLabel: 'Classé Solo / Duo', info: soloRankInfo },
            { key: 'flex', queueLabel: 'Classé Flex 5v5', info: flexRankInfo },
          ].map(({ key, queueLabel, info }) => (
            <div
              key={key}
              className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 ${info.theme.borderClass} ${info.theme.softBgClass}`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <RankedTierCrest tier={info.tierKey} sizeClass="w-10 h-10" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span>{queueLabel}</span>
                    {info.hotStreak && (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        · Série de victoires
                      </span>
                    )}
                  </div>
                  <div className={`text-base font-bold tracking-tight truncate ${info.theme.textClass}`}>
                    {info.divisionLabel}
                    {info.isRanked && (
                      <span className="ml-2 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-200">
                        {info.lp} LP
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                {info.isRanked ? (
                  <>
                    <div
                      className={`text-xs font-mono tabular-nums font-bold ${
                        info.winRate >= 50
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {info.winRate}% WR
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {info.wins}V - {info.losses}D ({info.totalGames}p)
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Saison non placée
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {serverStatus && !serverStatus.healthy && (
          <div className="mt-4 pt-3 border-t border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Alerte officielle Riot sur {serverStatus.platform} (LoL-Status-V4)
            </div>
            {serverStatus.incidents.map((inc) => (
              <p key={`inc-${inc.id}`} className="text-[11px]">
                · Incident ({inc.severity}) : {inc.title}
              </p>
            ))}
            {serverStatus.maintenances.map((m) => (
              <p key={`maint-${m.id}`} className="text-[11px]">
                · Maintenance ({m.status}) : {m.title}
              </p>
            ))}
          </div>
        )}
      </motion.section>

      {/* Parcours guidé en 3 étapes + Sélecteur de vue Apple */}
      <motion.section
        variants={dashboardSectionVariants}
        className="rounded-2xl apple-surface p-4 sm:p-5 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => onNavigateToBuilds(matches[0]?.player.championName)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0F1117] px-3.5 py-2.5 text-left hover:border-[#007AFF]/40 dark:hover:border-[#0A84FF]/40 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[#007AFF] dark:text-[#0A84FF]">
                Étape 1 · Avant la partie
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                Choisir build, runes &amp; match-up
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#007AFF] dark:group-hover:text-[#0A84FF] shrink-0 transition-colors" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onNavigateToLive}
            className={`group flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
              activeGame.inGame
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-black/[0.06] dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0F1117] hover:border-emerald-500/40'
            }`}
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Étape 2 · En partie (Live)
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                Départ, compétences &amp; sorts en direct
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 shrink-0 transition-colors" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => (onNavigateToPostGame ? onNavigateToPostGame() : matches[0] && onSelectMatchForReview(matches[0]))}
            className="group flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-slate-50/80 dark:bg-[#0F1117] px-3.5 py-2.5 text-left hover:border-[#007AFF]/40 dark:hover:border-[#0A84FF]/40 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Étape 3 · Après la partie
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                Débriefing, carte &amp; objectifs
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#007AFF] dark:group-hover:text-[#0A84FF] shrink-0 transition-colors" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-black/[0.06] dark:border-white/[0.07]">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Affichage ciblé pour éviter la surcharge d’informations :
          </div>
          <div
            role="tablist"
            aria-label="Sections du tableau de bord"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#0D0F14] border border-black/[0.05] dark:border-white/[0.07]"
          >
            {(
              [
                { id: 'essential', label: 'Essentiel' },
                { id: 'progression', label: 'Progression & Duo' },
                { id: 'history', label: `Historique (${matches.length})` },
                { id: 'all', label: 'Tout voir' },
              ] as const
            ).map((tab) => {
              const active = sectionMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSectionMode(tab.id)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-[#1E222D] text-slate-900 dark:text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </motion.section>

      {/* Conseil Tactique Contextuel (Astuce quotidienne pilotée par careerSynthesis) */}
      {(sectionMode === 'essential' || sectionMode === 'all') && matches.length > 0 && (
        <motion.section variants={dashboardSectionVariants}>
          <ContextualTacticalAdvice
            careerSynthesis={hydratedSynthesis}
            dataset={careerDataset}
            matches={matches}
            champions={champions}
            riotId={profile.riotId}
            dominantRole={trainingReport.dominantRole}
            aiLoading={aiLoading}
            geminiConfigured={geminiConfigured}
            onGenerateCareerSynthesis={handleGenerateCareerSynthesis}
            onNavigateToBuilds={(championName) => onNavigateToBuilds(championName)}
            onNotify={onNotify}
          />
        </motion.section>
      )}

      {/* Grille des 4 KPIs principaux (espacement isolé pour zéro chevauchement au survol) */}
      {(sectionMode === 'essential' || sectionMode === 'all') && (
      <motion.section variants={dashboardSectionVariants} className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <h2 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Indicateurs clés de performance
          </h2>
          <SectionInfoTooltip
            title="Indicateurs clés de performance"
            description="Résume vos 4 métriques fondamentales sur l’ensemble des parties analysées : taux de victoire, rythme de farm, morts en sur-extension et contrôle de vision."
            usageTip="Identifiez en 3 secondes si votre priorité du jour est la survie, la vision ou le farming."
          />
        </div>

        <motion.div
          variants={subCardGridVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-0.5"
        >
          <motion.div
            variants={subCardItemVariants}
            className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Taux de victoire récent</span>
              <TrendingUp className="w-4 h-4 text-amber-500" aria-hidden="true" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {tendencies.winRate}%
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Calculé sur {tendencies.gamesAnalyzed} parties analysées
            </p>
          </motion.div>

          <motion.div
            variants={subCardItemVariants}
            className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Rythme de farming moyen</span>
              <Crosshair className="w-4 h-4 text-sky-500" aria-hidden="true" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {tendencies.avgCsPerMin} <span className="text-sm font-normal text-slate-400">CS/min</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cible recommandée : 7.0+ CS/min
            </p>
          </motion.div>

          <motion.div
            variants={subCardItemVariants}
            className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Morts isolées / sur-extension</span>
              <ShieldAlert className="w-4 h-4 text-rose-500" aria-hidden="true" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {Math.round(tendencies.enemyJungleDeathRate * 100)}%
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Moyenne de {tendencies.avgDeaths} morts par match
            </p>
          </motion.div>

          <motion.div
            variants={subCardItemVariants}
            className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Contrôle de vision</span>
              <Eye className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {tendencies.avgVisionPerMin} <span className="text-sm font-normal text-slate-400">/ min</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {Math.round(tendencies.preObjectiveDeathRate * 100)}% de morts avant objectif
            </p>
          </motion.div>
        </motion.div>
      </motion.section>
      )}

      {/* Profil de Performance 5 Axes (style Mobalytics) & Synergie Coéquipiers / Duos Famille */}
      {(sectionMode === 'progression' || sectionMode === 'all') && mobalyticsProfile && (
        <motion.section variants={dashboardSectionVariants}>
          <PerformanceRadarAndDuoPanel
            performanceProfile={mobalyticsProfile}
            frequentTeammates={frequentTeammates}
            challenges={challenges}
            champions={champions}
            onSyncExtended={onDeepSync}
          />
        </motion.section>
      )}

      {/* Programme d'Entraînement Actif & Score de Forme (Connecté à Post-Game & Coach Live) */}
      {(sectionMode === 'essential' || sectionMode === 'all') && trainingReport.goals.length > 0 && (
        <motion.section
          variants={dashboardSectionVariants}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                  <span>Programme d’Entraînement Actif · Score de Forme</span>
                </h2>
                <SectionInfoTooltip
                  title="Programme d’Entraînement & Score de Forme"
                  description="Transforme automatiquement vos faiblesses récentes en 3 défis mesurables adaptés à votre rôle principal, vérifiés sur vos 5 dernières parties."
                  usageTip="Cliquez sur une pastille de match (V/×) pour ouvrir la partie correspondante en Analyse Post-Game. Ces objectifs sont aussi rappelés dans le Coach Temps Réel."
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {trainingReport.formSummary} (Rôle calibré :{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {trainingReport.dominantRole}
                </span>
                )
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C]">
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Forme actuelle
                  </div>
                  <div
                    className={`text-xs font-semibold ${
                      trainingReport.formScore >= 72
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : trainingReport.formScore >= 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {trainingReport.formTier}
                  </div>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {trainingReport.formScore}
                  <span className="text-xs font-normal text-slate-400">/100</span>
                </div>
              </div>

              {onChangeTrainingIntensity && (
                <div
                  className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800"
                  role="group"
                  aria-label="Niveau d'exigence de l'entraînement"
                >
                  {(
                    [
                      { id: 'standard', label: 'Standard' },
                      { id: 'strict', label: 'Exigeant' },
                    ] as Array<{ id: TrainingIntensity; label: string }>
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onChangeTrainingIntensity(mode.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                        trainingIntensity === mode.id
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <motion.div
            variants={subCardGridVariants}
            className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-0.5"
          >
            {trainingReport.goals.map((goal) => {
              const pct =
                goal.totalCount > 0 ? Math.round((goal.passedCount / goal.totalCount) * 100) : 0;
              return (
                <motion.div
                  key={goal.id}
                  variants={subCardItemVariants}
                  className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 flex flex-col justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        {goal.category}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {goal.passedCount}/{goal.totalCount} validées
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      {goal.title}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      <span>{goal.targetLabel}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {goal.currentAvgLabel}
                      </span>
                    </div>

                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          pct >= 60
                            ? 'bg-emerald-500'
                            : pct >= 40
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      5 derniers matchs :
                    </span>
                    <div className="flex items-center gap-1.5">
                      {goal.checks.map((chk) => {
                        const targetMatch = matches.find((m) => m.matchId === chk.matchId);
                        const chkChampDisplay = formatChampionDisplayName(champions, chk.championName);
                        return (
                          <button
                            key={chk.matchId}
                            type="button"
                            onClick={() => targetMatch && onSelectMatchForReview(targetMatch)}
                            title={`${chkChampDisplay} (${chk.win ? 'V' : 'D'}) : ${chk.measuredLabel} — Cliquer pour inspecter`}
                            className={`w-6 h-6 rounded-md text-[10px] font-mono font-bold flex items-center justify-center border transition-colors ${
                              chk.passed
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
                                : 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25'
                            }`}
                          >
                            {chk.passed ? '✓' : '×'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </motion.section>
      )}

      {/* ADN Gameplay & Champions recommandés pour vous */}
      {(sectionMode === 'progression' || sectionMode === 'all') && championFit.recommendations.length > 0 && (
        <motion.section
          variants={dashboardSectionVariants}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-4"
        >
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                <span>Champions recommandés pour votre gameplay</span>
                <span className="text-slate-400" aria-hidden="true">·</span>
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {championFit.dna.archetypeTitle}
                </span>
                <SectionInfoTooltip
                  title="ADN Gameplay & Recommandations"
                  description="Analyse votre style (jeu collectif, portée, dégâts préférés, rôle dominant) sur vos parties archivées pour suggérer 4 champions particulièrement adaptés à vos réflexes."
                  usageTip="Filtrez par rôle ou activez « Nouveaux à découvrir » pour élargir votre champion pool."
                />
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {championFit.dna.archetypeSummary}{' '}
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                  ({championFit.dna.gamesAnalyzed} parties · {championFit.dna.assistSharePct}% jeu collectif ·{' '}
                  {championFit.dna.preferredRange} · {championFit.dna.preferredDamage})
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800">
                {(
                  [
                    { id: 'AUTO', label: `Auto (${formatRecommenderRoleLabel(championFit.dna.dominantRole)})` },
                    { id: 'TOP', label: 'Top' },
                    { id: 'JUNGLE', label: 'Jungle' },
                    { id: 'MID', label: 'Mid' },
                    { id: 'ADC', label: 'ADC' },
                    { id: 'SUPPORT', label: 'Support' },
                  ] as Array<{ id: RecommenderRoleFilter; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRecRoleFilter(opt.id)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                      recRoleFilter === opt.id
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIncludePlayedInRecs((prev) => !prev)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  includePlayedInRecs
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {includePlayedInRecs ? 'Tout le catalogue' : 'Nouveaux à découvrir'}
              </button>
            </div>
          </div>

          <motion.div
            key={`${recRoleFilter}-${includePlayedInRecs}`}
            variants={subCardGridVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-1"
          >
            {championFit.recommendations.map((rec) => (
              <motion.div
                key={rec.champion.id}
                variants={subCardItemVariants}
                className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3.5 flex flex-col justify-between gap-2.5 transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SafeGameIcon
                        src={rec.champion.imageUrl}
                        alt={rec.champion.name}
                        fallbackLabel={rec.champion.name}
                        sizeClass="w-9 h-9"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {rec.champion.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {formatRecommenderRoleLabel(rec.recommendedRole)} · {rec.styleLabel}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      {rec.matchScore}%
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                    {rec.whyItFits}
                  </p>
                  <p className="text-[11px] text-sky-700 dark:text-sky-400 leading-snug">
                    Atout : {rec.gameplayBenefit}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                    {rec.masteryLevel && rec.masteryPoints
                      ? `Maîtrise ${rec.masteryLevel} · ${Math.round(rec.masteryPoints / 1000)}k`
                      : rec.alreadyPlayedGames > 0
                        ? `${rec.alreadyPlayedGames} partie(s) récente(s)`
                        : 'Nouveau pour vous'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateToBuilds(rec.champion.name)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    <span>Préparer le build</span>
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>
      )}

      {/* Visualisation Recharts : Champions les plus joués (Winrate & KDA) */}
      {(sectionMode === 'progression' || sectionMode === 'all') && (
        <>
          <motion.div variants={dashboardSectionVariants}>
            <TopChampionsChart
              championStats={tendencies.championStats}
              matches={matches}
              champions={champions}
              getChampIcon={getChampIcon}
              onSelectChampion={(championName) => onNavigateToBuilds(championName)}
            />
          </motion.div>

          {/* Analyse de synergie : Champions les plus joués vs Meilleurs duos alliés */}
          <motion.div variants={dashboardSectionVariants}>
            <DuoSynergyAnalysis
              matches={matches}
              championStats={tendencies.championStats}
              champions={champions}
              getChampIcon={getChampIcon}
              onSelectDuoForBuild={(championName, duoChampionName) =>
                onNavigateToBuilds(championName, duoChampionName)
              }
            />
          </motion.div>
        </>
      )}

      {/* Coaching Proactif Carrière (Ensemble des parties analysées) */}
      {(sectionMode === 'progression' || sectionMode === 'all') && (tendencies.proactiveAlerts?.length || tendencies.championStats?.length || tendencies.trend) && (
        <motion.section
          variants={dashboardSectionVariants}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                <span>Coaching Proactif Carrière ({tendencies.gamesAnalyzed} parties cumulées)</span>
                <SectionInfoTooltip
                  title="Coaching Proactif Carrière"
                  description="Compare vos parties récentes aux plus anciennes et génère des alertes concrètes sur vos tendances (morts, vision, farming) ainsi qu’un résumé de votre pool actif."
                  usageTip="Utilisez les boutons « Optimiser » sur les alertes prioritaires pour ajuster votre build."
                />
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Analyse transversale de toutes vos parties archivées : chaque nouvelle partie affine automatiquement ces conseils et vos builds.
              </p>
            </div>
            {lastSyncedAt && (
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                Dernière sync : {lastSyncedAt}
              </div>
            )}
          </div>

          {/* Progression temporelle (Récent vs Ancien) */}
          {tendencies.trend && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tendance Winrate ({tendencies.trend.recentGames} récentes vs {tendencies.trend.earlierGames})
                </div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums inline-flex items-center gap-1 ${
                    tendencies.trend.winRateDelta >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {tendencies.trend.winRateDelta >= 0 ? (
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                  )}
                  {tendencies.trend.winRateDelta > 0 ? '+' : ''}
                  {tendencies.trend.winRateDelta}%
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Évolution Morts / partie</div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums inline-flex items-center gap-1 ${
                    tendencies.trend.deathsDelta <= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {tendencies.trend.deathsDelta > 0 ? '+' : ''}
                  {tendencies.trend.deathsDelta}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Évolution CS / min</div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums inline-flex items-center gap-1 ${
                    tendencies.trend.csPerMinDelta >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {tendencies.trend.csPerMinDelta > 0 ? '+' : ''}
                  {tendencies.trend.csPerMinDelta}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Évolution Vision / min</div>
                <div
                  className={`mt-1 text-base font-bold font-mono tabular-nums inline-flex items-center gap-1 ${
                    tendencies.trend.visionDelta >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {tendencies.trend.visionDelta > 0 ? '+' : ''}
                  {tendencies.trend.visionDelta}
                </div>
              </div>
            </div>
          )}

          {/* Alertes Proactives */}
          {tendencies.proactiveAlerts && tendencies.proactiveAlerts.length > 0 && (
            <motion.div
              variants={subCardGridVariants}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1"
            >
              {tendencies.proactiveAlerts.map((alert) => {
                const isHigh = alert.priority === 'Haute';
                const isPositive = alert.priority === 'Positif';
                return (
                  <motion.div
                    key={alert.id}
                    variants={subCardItemVariants}
                    className={`relative rounded-xl border p-4 space-y-2 transition-[border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:shadow-sm ${
                      isHigh
                        ? 'border-rose-500/30 bg-rose-500/5'
                        : isPositive
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-amber-500/30 bg-amber-500/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                        {isPositive ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertTriangle
                            className={`w-4 h-4 shrink-0 ${
                              isHigh ? 'text-rose-500' : 'text-amber-500'
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <span>{alert.title}</span>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          isHigh
                            ? 'text-rose-600 dark:text-rose-400'
                            : isPositive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {alert.area} · {alert.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {alert.detail}
                    </p>
                    <div className="pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-200/70 dark:border-slate-800">
                      <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                        Action : {alert.recommendation}
                      </span>
                      {alert.championTarget && (
                        <button
                          type="button"
                          onClick={() => onNavigateToBuilds(alert.championTarget)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 shrink-0 whitespace-nowrap"
                        >
                          <Swords className="w-3 h-3" aria-hidden="true" />
                          Optimiser {formatChampionDisplayName(champions, alert.championTarget)}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {/* Maîtrise par Champion */}
          {tendencies.championStats && tendencies.championStats.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Performance cumulée par champion (Pool récent)
              </div>
              <motion.div
                variants={subCardGridVariants}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1"
              >
                {tendencies.championStats.slice(0, 4).map((cs) => {
                  const csDisp = resolveChampionDisplay(champions, cs.championName);
                  return (
                    <motion.div
                      key={cs.championName}
                      variants={subCardItemVariants}
                      className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3 flex items-center justify-between gap-3 transition-[transform,border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:z-10 [@media(hover:hover)]:hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SafeGameIcon
                          src={csDisp.imageUrl}
                          alt={csDisp.displayName}
                          fallbackLabel={csDisp.displayName}
                          sizeClass="w-9 h-9"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {csDisp.displayName}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {cs.games}p ·{' '}
                            <span
                              className={
                                cs.winRate >= 50
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : 'text-rose-600 dark:text-rose-400 font-semibold'
                              }
                            >
                              {cs.winRate}% WR
                            </span>{' '}
                            · {cs.kdaRatio} KDA
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigateToBuilds(cs.championName)}
                        title={`Préparer un build pour ${csDisp.displayName}`}
                        className="px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"
                      >
                        Build
                      </button>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          )}
        </motion.section>
      )}

      {/* Synthèse Globale IA (Analyse long terme sur l'ensemble des matchs stockés localement) */}
      {(sectionMode === 'progression' || sectionMode === 'all') && (
      <motion.section
        variants={dashboardSectionVariants}
        className="rounded-2xl apple-surface p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Synthèse Globale IA — Tendances &amp; Positionnement</span>
              <SectionInfoTooltip
                title="Synthèse Globale IA"
                description="Croise toutes vos parties archivées (zones de mort sur la carte, écarts à 15 min, pool de champions) pour générer un diagnostic IA long terme et un plan d’action sur 3 matchs."
                usageTip="Actualisez cette analyse après une nouvelle session de 5 à 10 parties."
              />
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Agrège vos{' '}
              <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-200">
                {careerDataset.gamesAnalyzed}
              </span>{' '}
              matchs archivés localement pour corriger vos erreurs de placement récurrentes et ajuster votre gameplay sur la durée.
              {careerSynthesis && (
                <>
                  <span aria-hidden="true" className="mx-1.5">·</span>
                  <span className="font-mono tabular-nums">
                    Dernière synthèse : {careerSynthesis.gamesAnalyzed} matchs le{' '}
                    {new Date(careerSynthesis.generatedAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {careerSynthesis && careerDataset.gamesAnalyzed > careerSynthesis.gamesAnalyzed && (
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                +{careerDataset.gamesAnalyzed - careerSynthesis.gamesAnalyzed} nouvelle(s) partie(s) à inclure
              </span>
            )}
            <button
              type="button"
              onClick={handleGenerateCareerSynthesis}
              disabled={aiLoading || careerDataset.gamesAnalyzed === 0 || !geminiConfigured}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {aiLoading
                ? `Analyse de ${careerDataset.gamesAnalyzed} matchs...`
                : careerSynthesis
                  ? `Actualiser l'analyse (${careerDataset.gamesAnalyzed} matchs)`
                  : `Générer la synthèse IA (${careerDataset.gamesAnalyzed} matchs)`}
            </button>
          </div>
        </div>

        {/* Strip de données agrégées sur l'ensemble des matchs (Preuves chiffrées) */}
        {careerDataset.gamesAnalyzed > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4">
            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Bilan archivé ({careerDataset.gamesAnalyzed} matchs)
              </div>
              <div className="mt-1 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {careerDataset.wins}V - {careerDataset.losses}D ({careerDataset.winRate}%)
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                {careerDataset.avgDeaths} morts · {careerDataset.avgVisionPerMin} vis/min
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Morts par phase (0–12 / 12–24 / 24m+)
              </div>
              <div className="mt-1 text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {careerDataset.phaseDeaths.early0To12m} / {careerDataset.phaseDeaths.mid12To24m} /{' '}
                {careerDataset.phaseDeaths.late24mPlus}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                {careerDataset.isolatedDeathPct}% isolées · {careerDataset.preObjectiveDeathPct}% pré-objectif
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Écart moyen @15 min (Or / CS)
              </div>
              <div
                className={`mt-1 text-sm font-bold font-mono tabular-nums ${
                  careerDataset.avgGoldDiffAt15 === null
                    ? 'text-slate-500 dark:text-slate-400'
                    : careerDataset.avgGoldDiffAt15 >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {careerDataset.avgGoldDiffAt15 !== null
                  ? `${careerDataset.avgGoldDiffAt15 >= 0 ? '+' : ''}${careerDataset.avgGoldDiffAt15} or`
                  : 'Timeline N/A'}
                {careerDataset.avgCsDiffAt15 !== null && (
                  <span className="text-slate-500 dark:text-slate-400 font-normal">
                    {' '}
                    ({careerDataset.avgCsDiffAt15 >= 0 ? '+' : ''}
                    {careerDataset.avgCsDiffAt15} CS)
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                Rythme global : {careerDataset.avgCsPerMin} CS/min
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Zones les plus punitives
              </div>
              {careerDataset.zoneTotals.filter((z) => z.deaths > 0).length > 0 ? (
                <div className="mt-1 space-y-0.5">
                  {careerDataset.zoneTotals
                    .filter((z) => z.deaths > 0)
                    .slice(0, 2)
                    .map((z) => (
                      <div
                        key={z.zone}
                        className="text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2"
                      >
                        <span className="truncate font-sans font-medium">{z.zone}</span>
                        <span className="text-rose-600 dark:text-rose-400 shrink-0">
                          {z.deaths}m ({z.isolatedDeaths} isol.)
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Aucune coordonnée de mort archivée
                </div>
              )}
            </div>
          </div>
        )}

        {!geminiConfigured && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              Clé serveur <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">GEMINI_API_KEY</code> non détectée : renseignez-la dans Settings &gt; Secrets (ou via le lanceur) pour activer la synthèse IA.
            </span>
            {onNavigateToSettings && (
              <button
                type="button"
                onClick={onNavigateToSettings}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
              >
                Ouvrir Compte &amp; Réglages
              </button>
            )}
          </div>
        )}

        {aiError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-3">
            <span>{aiError}</span>
            <button
              type="button"
              onClick={handleGenerateCareerSynthesis}
              className="px-3 py-1 font-semibold rounded-md border border-rose-500/40 hover:bg-rose-500/10 whitespace-nowrap shrink-0"
            >
              Réessayer
            </button>
          </div>
        )}

        {aiLoading ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-lg bg-slate-100 dark:bg-slate-800/60 animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : hydratedSynthesis ? (
          <div className="space-y-5">
            {isLegacySynthesis && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Cette synthèse provient d’un cache antérieur (complétée automatiquement depuis vos métriques). Cliquez sur « Actualiser l’analyse » pour générer un diagnostic IA complet v2.
                </span>
              </div>
            )}

            {/* Diagnostic exécutif long terme */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-1.5">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Bilan global sur {hydratedSynthesis.gamesAnalyzed} parties
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {hydratedSynthesis.executiveSummary}
              </p>
            </div>

            {/* Erreurs de positionnement récurrentes */}
            {hydratedSynthesis.recurringPositioningErrors.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden="true" />
                  <span>Erreurs de positionnement récurrentes détectées</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {hydratedSynthesis.recurringPositioningErrors.map((item, idx) => (
                    <div
                      key={`${item.zoneOrPattern}-${idx}`}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        {item.zoneOrPattern}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-rose-600 dark:text-rose-400">
                        {item.frequencyNote}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1 border-t border-slate-200/70 dark:border-slate-800">
                        <strong className="text-slate-800 dark:text-slate-100">Correction :</strong>{' '}
                        {item.correction}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ajustements de gameplay basés sur les tendances */}
            {hydratedSynthesis.gameplayAdjustments.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <SlidersHorizontal
                    className="w-3.5 h-3.5 text-amber-500 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Ajustements de gameplay recommandés</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {hydratedSynthesis.gameplayAdjustments.map((adj, idx) => (
                    <div
                      key={`${adj.area}-${idx}`}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2"
                    >
                      <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {adj.area}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          Habitude actuelle :
                        </span>{' '}
                        {adj.currentHabit}
                      </div>
                      <div className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed">
                        <span className="font-semibold">Ajustement :</span> {adj.targetAdjustment}
                      </div>
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                        Impact attendu : {adj.expectedImpact}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pool de champions + Plan d'action 3 parties */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5 text-sky-500 shrink-0" aria-hidden="true" />
                  <span>Lecture du pool de champions</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {hydratedSynthesis.championPoolAdvice}
                </p>
              </div>

              <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-2.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
                  <span>Plan d’action concret — 3 prochaines parties</span>
                </div>
                <ol className="space-y-1.5">
                  {hydratedSynthesis.threeGameActionPlan.map((step, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed flex items-start gap-2"
                    >
                      <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                        0{i + 1}.
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              Cliquez sur <strong>Générer la synthèse IA</strong> pour croiser toutes vos parties archivées ({careerDataset.gamesAnalyzed} matchs), repérer vos zones de mort récurrentes sur la carte et obtenir un plan d’entraînement personnalisé.
            </span>
          </div>
        )}
      </motion.section>
      )}

      {/* Aperçu des 6 dernières parties & Export hors-ligne (l'historique complet et la carte sont dans Analyse Post-Game) */}
      {(sectionMode === 'history' || sectionMode === 'all') && (
      <motion.section
        variants={dashboardSectionVariants}
        className="rounded-2xl apple-surface overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
                <span>Dernières parties &amp; export rapide ({matches.length} archivées)</span>
                <SectionInfoTooltip
                  title="Aperçu des dernières parties & Export"
                  description="Affiche vos 6 matchs les plus récents pour un accès immédiat, ainsi que l’export CSV/JSON de vos 10 dernières parties. L’historique complet filtrable et la carte tactique sont dans Analyse Post-Game."
                  usageTip="Cliquez sur « Analyser » à droite d’un match ou ouvrez Analyse Post-Game pour voir toutes vos parties."
                />
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Aperçu des 6 derniers matchs synchronisés · Retrouvez la liste complète, les filtres et les courbes dans Analyse Post-Game.
              </p>
            </div>

            {onNavigateToPostGame && matches.length > 0 && (
              <button
                type="button"
                onClick={onNavigateToPostGame}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                <span>Historique complet ({matches.length})</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleAutoSync}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                autoSyncEnabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              Auto-sync (5 min) : {autoSyncEnabled ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={onDeepSync}
              disabled={loading || !riotConfigured}
              title="Récupérer jusqu'à 25 parties récentes via Riot Match-V5"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Sync étendue (25 parties)
            </button>

            <button
              type="button"
              onClick={handleFetchLocalHistory}
              disabled={localImporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <FolderSync className={`w-3.5 h-3.5 text-sky-500 ${localImporting ? 'animate-spin' : ''}`} aria-hidden="true" />
              {localImporting ? 'Lecture client...' : 'Importer parties locales (Personnalisées)'}
            </button>

            {matches.length > 0 && (
              <div
                role="group"
                aria-label="Exporter les 10 dernières parties"
                className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] overflow-hidden shrink-0"
              >
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">
                  <Download className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                  Exporter ({Math.min(10, matches.length)})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const { count, filename } = downloadRecentMatchesExport('csv', matches, {
                      riotId: profile.riotId,
                      limit: 10,
                    });
                    onNotify?.({
                      variant: 'info',
                      title: `Export CSV généré (${count} ${count > 1 ? 'parties' : 'partie'})`,
                      description: `Fichier prêt pour Excel / analyse hors-ligne : ${filename}`,
                    });
                  }}
                  title="Exporter les statistiques des 10 dernières parties en CSV (Excel)"
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-500/15 hover:text-amber-600 dark:hover:text-amber-400 border-r border-slate-200 dark:border-slate-700 transition-colors whitespace-nowrap"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { count, filename } = downloadRecentMatchesExport('json', matches, {
                      riotId: profile.riotId,
                      limit: 10,
                    });
                    onNotify?.({
                      variant: 'info',
                      title: `Export JSON généré (${count} ${count > 1 ? 'parties' : 'partie'})`,
                      description: `Fichier prêt pour analyse hors-ligne : ${filename}`,
                    });
                  }}
                  title="Exporter les statistiques des 10 dernières parties en JSON"
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-500/15 hover:text-amber-600 dark:hover:text-amber-400 transition-colors whitespace-nowrap"
                >
                  JSON
                </button>
              </div>
            )}
          </div>
        </div>

        {(localMsg || localErr || showLocalImport) && (
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] space-y-2.5 text-xs">
            {localMsg && (
              <div className="text-emerald-600 dark:text-emerald-400 font-medium">{localMsg}</div>
            )}
            {localErr && (
              <div className="text-rose-600 dark:text-rose-400">{localErr}</div>
            )}
            {showLocalImport && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-300">
                  <span>
                    Lancez <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">lol-coach-bridge.bat</code> (v3.4), puis copiez l’historique local et collez avec <strong>Ctrl+V</strong> :
                  </span>
                  <button
                    type="button"
                    onClick={downloadWindowsBridgeBat}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Télécharger pont v3.4
                  </button>
                </div>
                <div className="relative">
                  <pre className="p-2 pr-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                    {UNIVERSAL_HISTORY_CLIPBOARD_CMD}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyHistCmd}
                    className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    {copiedHistCmd ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedHistCmd ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={pasteHistoryJson}
                  onChange={(e) => setPasteHistoryJson(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted && pasted.trim().startsWith('{')) {
                      e.preventDefault();
                      try {
                        applyRawHistoryJson(JSON.parse(pasted));
                      } catch {
                        setLocalErr('JSON invalide collé dans la zone.');
                      }
                    }
                  }}
                  placeholder="Cliquez ici et faites Ctrl+V pour importer vos parties Personnalisées du client LoL..."
                  className="w-full p-2 text-[11px] font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 px-6 text-left font-medium">Champion, Rôle &amp; Mode</th>
                <th className="py-3 px-4 text-left font-medium">Issue</th>
                <th className="py-3 px-4 text-right font-medium">K / D / A</th>
                <th className="py-3 px-4 text-right font-medium">Farming</th>
                <th className="py-3 px-4 text-right font-medium">Vision</th>
                <th className="py-3 px-4 text-right font-medium">Durée &amp; Date</th>
                <th className="py-3 px-6 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {matches.slice(0, 6).map((m) => {
                const durMin = Math.round(m.gameDurationSec / 60);
                const p = m.player;
                const pDisp = resolveChampionDisplay(champions, p.championName);
                const oppName = m.laneOpponent
                  ? formatChampionDisplayName(champions, m.laneOpponent.championName)
                  : '';
                const queueLabel = formatMatchQueueLabel(
                  m.queueId,
                  m.gameMode,
                  m.queueId === 0 ? 'CUSTOM_GAME' : undefined,
                );
                const dateLabel = m.gameCreation
                  ? new Date(m.gameCreation).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                    })
                  : '';

                return (
                  <tr
                    key={m.matchId}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <SafeGameIcon
                          src={pDisp.imageUrl}
                          alt={pDisp.displayName}
                          fallbackLabel={pDisp.displayName}
                          sizeClass="w-9 h-9"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{pDisp.displayName}</span>
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              {queueLabel}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {p.teamPosition !== 'UNKNOWN' ? p.teamPosition : 'Libre'}
                            {oppName ? ` vs ${oppName}` : ''}
                            <span aria-hidden="true" className="mx-1.5">·</span>
                            Patch {m.gameVersion}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-semibold ${
                          p.win
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {p.win ? 'Victoire' : 'Défaite'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {p.kills}/{p.deaths}/{p.assists}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <div className="text-slate-900 dark:text-slate-100">{p.cs} CS</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {p.csPerMin.toFixed(1)}/min
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {p.visionScore}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                      <div className="text-slate-700 dark:text-slate-300">{durMin} min</div>
                      {dateLabel && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {dateLabel}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectMatchForReview(m)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                      >
                        Analyser
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {matches.length > 6 && onNavigateToPostGame && (
          <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs bg-slate-50/70 dark:bg-[#0D121C]">
            <span className="text-slate-500 dark:text-slate-400">
              Affichage des 6 dernières parties sur {matches.length} archivées.
            </span>
            <button
              type="button"
              onClick={onNavigateToPostGame}
              className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
            >
              <span>Voir les {matches.length} parties dans Analyse Post-Game</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </motion.section>
      )}
    </motion.div>
  );
}
