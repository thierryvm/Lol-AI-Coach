import { useMemo, useState } from 'react';
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
  TrendingUp,
  X,
} from 'lucide-react';
import { buildCareerSynthesisDataset } from '../engines/postGameEngine.ts';
import type {
  CareerAiSynthesis,
  CareerSynthesisDataset,
  ChampionSummary,
  MatchRecord,
  PlayerProfileResponse,
} from '../engines/types.ts';

function hydrateCareerSynthesis(
  raw: CareerAiSynthesis | null,
  dataset: CareerSynthesisDataset,
  riotId: string,
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
          .map((c) => `${c.championName} (${c.games}p, ${c.winRate}% WR)`)
          .join(', ')}. ${
          bestChamp
            ? `Votre meilleur rendement est sur ${bestChamp.championName} (${bestChamp.winRate}% WR). `
            : ''
        }${
          worstDeathChamp && worstDeathChamp.avgDeaths >= 6.5
            ? `Attention sur ${worstDeathChamp.championName} (${worstDeathChamp.avgDeaths} morts/m) : privilégiez un démarrage défensif.`
            : 'Gardez ce noyau de 2 à 3 champions pour consolider vos réflexes.'
        }`
      : 'Concentrez-vous sur 2 à 3 champions maîtrisés pour stabiliser vos prises de décision.';

  const defaultPlan = [
    `Partie 1 : Rester sous 5 morts en évitant toute avancée seule dans ${
      topZone ? topZone.zone : 'la rivière non éclairée'
    }.`,
    'Partie 2 : Déclencher chaque rappel 55 secondes avant Dragon/Baron avec au moins 1 Balise de contrôle.',
    `Partie 3 : Adapter votre 2e objet dès que l’équipe adverse prend l’avantage (${
      bestChamp ? `sur ${bestChamp.championName}` : 'en priorité défensive'
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
import { SafeGameIcon } from './SafeGameIcon.tsx';
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
  onNavigateToBuilds: (championName?: string) => void;
  onNavigateToLive: () => void;
  onNavigateToSettings?: () => void;
  careerSynthesis?: CareerAiSynthesis | null;
  geminiConfigured?: boolean;
  onSaveCareerSynthesis?: (synthesis: CareerAiSynthesis) => void;
}

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
  onNavigateToSettings,
  careerSynthesis = null,
  geminiConfigured = true,
  onSaveCareerSynthesis,
}: DashboardViewProps) {
  const [showLocalImport, setShowLocalImport] = useState(false);
  const [localImporting, setLocalImporting] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pasteHistoryJson, setPasteHistoryJson] = useState('');
  const [copiedHistCmd, setCopiedHistCmd] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const careerDataset = useMemo(
    () => buildCareerSynthesisDataset(profile?.matches || [], profile?.tendencies),
    [profile?.matches, profile?.tendencies],
  );

  const hydratedSynthesis = useMemo(
    () => hydrateCareerSynthesis(careerSynthesis, careerDataset, profile?.riotId || ''),
    [careerSynthesis, careerDataset, profile?.riotId],
  );

  const isLegacySynthesis = Boolean(careerSynthesis && (!careerSynthesis.schemaVersion || careerSynthesis.schemaVersion < 2));

  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  const getChampIcon = (championName: string) => {
    const found = champions.find(
      (c) =>
        c.id.toLowerCase() === championName.toLowerCase() ||
        c.name.toLowerCase() === championName.toLowerCase(),
    );
    return found?.imageUrl;
  };

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
          : 'Pont local 127.0.0.1:38421 non détecté. Téléchargez et lancez lol-coach-bridge.bat v3.1 puis réessayez.',
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
      const res = await fetch('/api/coach/career-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riotId: profile.riotId,
          region: profile.region,
          dataset: careerDataset,
        }),
      });
      const data = (await res.json()) as CareerAiSynthesis & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Impossible de générer la synthèse globale IA.');
      }
      onSaveCareerSynthesis?.(data);
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

  const { tendencies, rankedSolo, matches, activeGame } = profile;

  return (
    <div className="space-y-6">
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
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
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
        </section>
      )}

      {/* En-tête Profil & Provenance claire */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <SafeGameIcon
              src={`https://ddragon.leagueoflegends.com/cdn/${patchVersion}/img/profileicon/${profile.profileIconId}.png`}
              alt={`Icône d'invocateur ${profile.riotId}`}
              fallbackLabel={profile.riotId}
              sizeClass="w-14 h-14"
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
                {profile.riotId}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>Serveur {profile.region}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span className="font-mono tabular-nums">Niveau {profile.level}</span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>
                  {rankedSolo
                    ? `${rankedSolo.tier} ${rankedSolo.rank} (${rankedSolo.lp} LP)`
                    : 'Non classé Solo/Duo'}
                </span>
                <span aria-hidden="true" className="mx-2">·</span>
                <span>Source : {profile.source}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeGame.inGame && (
              <button
                type="button"
                onClick={onNavigateToLive}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
              >
                Partie en cours détectée · Ouvrir Coach Live
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateToBuilds(matches[0]?.player.championName)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Préparer un build contre la meta
            </button>
          </div>
        </div>
      </section>

      {/* Grille des 4 KPIs principaux */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
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
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
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
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
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
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5">
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
        </div>
      </section>

      {/* Coaching Proactif Carrière (Ensemble des parties analysées) */}
      {(tendencies.proactiveAlerts?.length || tendencies.championStats?.length || tendencies.trend) && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" aria-hidden="true" />
                Coaching Proactif Carrière ({tendencies.gamesAnalyzed} parties cumulées)
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tendencies.proactiveAlerts.map((alert) => {
                const isHigh = alert.priority === 'Haute';
                const isPositive = alert.priority === 'Positif';
                return (
                  <div
                    key={alert.id}
                    className={`rounded-xl border p-4 space-y-2 ${
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
                        className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
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
                          Optimiser {alert.championTarget}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Maîtrise par Champion */}
          {tendencies.championStats && tendencies.championStats.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Performance cumulée par champion (Pool récent)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {tendencies.championStats.slice(0, 4).map((cs) => (
                  <div
                    key={cs.championName}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SafeGameIcon
                        src={getChampIcon(cs.championName)}
                        alt={cs.championName}
                        fallbackLabel={cs.championName}
                        sizeClass="w-9 h-9"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {cs.championName}
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
                      title={`Préparer un build pour ${cs.championName}`}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 shrink-0"
                    >
                      Build
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Synthèse Globale IA (Analyse long terme sur l'ensemble des matchs stockés localement) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Synthèse Globale IA — Tendances &amp; Positionnement</span>
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
                Ouvrir Paramètres
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
      </section>

      {/* Historique des parties synchronisées */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Historique de jeu &amp; détection d’erreurs ({matches.length} parties archivées)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Riot Match-V5 synchronise vos parties en matchmaking (Classée, Partie Accélérée, Draft, ARAM). Les parties « Personnalisée » restent locales sur votre PC.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                    Lancez <code className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800">lol-coach-bridge.bat</code> (v3.1), puis copiez l’historique local et collez avec <strong>Ctrl+V</strong> :
                  </span>
                  <button
                    type="button"
                    onClick={downloadWindowsBridgeBat}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Télécharger pont v3.1
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
              {matches.map((m) => {
                const durMin = Math.round(m.gameDurationSec / 60);
                const p = m.player;
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
                          src={getChampIcon(p.championName)}
                          alt={p.championName}
                          fallbackLabel={p.championName}
                          sizeClass="w-9 h-9"
                        />
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{p.championName}</span>
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              {queueLabel}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {p.teamPosition !== 'UNKNOWN' ? p.teamPosition : 'Libre'}
                            {m.laneOpponent ? ` vs ${m.laneOpponent.championName}` : ''}
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
      </section>
    </div>
  );
}
