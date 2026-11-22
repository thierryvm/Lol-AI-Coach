import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Laptop,
  LayoutDashboard,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  Swords,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { RiotPlatform, Role, SavedPlayerProfile } from '../engines/types.ts';
import { downloadMacAppLauncher, downloadWindowsAppLauncher } from '../utils/appLauncher.ts';

export type OnboardingMode = 'share-web' | 'clone-pc' | 'self';

interface OnboardingShareWizardProps {
  activeRiotId: string;
  activeRegion: RiotPlatform;
  riotConfigured: boolean;
  riotKeyStartsWithRgapi: boolean;
  geminiConfigured: boolean;
  savedProfiles: SavedPlayerProfile[];
  onSaveProfile: (profile: Omit<SavedPlayerProfile, 'id'> & { id?: string }) => void;
  onSwitchProfile: (profile: SavedPlayerProfile) => void;
  onNavigateTab: (tab: 'dashboard' | 'builds' | 'postgame' | 'live' | 'settings') => void;
}

interface PersistedOnboardingState {
  mode: OnboardingMode;
  step: number;
  completedSteps: number[];
}

const ONBOARDING_STORAGE_KEY = 'lol_ai_coach_onboarding_v1';
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
const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

const STEP_LABELS = [
  { num: '01', title: 'Mode de partage' },
  { num: '02', title: 'Clé Riot permanente' },
  { num: '03', title: 'Ajouter & inviter' },
  { num: '04', title: 'Premiers pas en jeu' },
];

function loadOnboardingState(): PersistedOnboardingState {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedOnboardingState>;
      const validMode: OnboardingMode =
        parsed.mode === 'share-web' || parsed.mode === 'clone-pc' || parsed.mode === 'self'
          ? parsed.mode
          : 'share-web';
      const validStep =
        typeof parsed.step === 'number' && parsed.step >= 0 && parsed.step <= 3 ? parsed.step : 0;
      const validCompleted = Array.isArray(parsed.completedSteps)
        ? parsed.completedSteps.filter((n) => typeof n === 'number' && n >= 0 && n <= 3)
        : [];
      return { mode: validMode, step: validStep, completedSteps: validCompleted };
    }
  } catch {
    // ignore storage read error
  }
  return { mode: 'share-web', step: 0, completedSteps: [] };
}

function normalizeRiotIdDraft(
  rawRiotId: string,
  rawLabel: string,
): { canonical: string; gameName: string; tagLine: string; error?: string } {
  const cleanLabel = rawLabel.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  let cleanInput = rawRiotId
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/＃/g, '#')
    .trim();

  if (
    cleanLabel &&
    !cleanLabel.includes('#') &&
    (cleanInput.startsWith('#') || (/^[0-9]{2,5}$/.test(cleanInput) && !cleanInput.includes('#')))
  ) {
    const strippedTag = cleanInput.replace(/^#+/, '').trim();
    cleanInput = `${cleanLabel}#${strippedTag}`;
  }

  const hashIdx = cleanInput.indexOf('#');
  if (hashIdx === -1) {
    return {
      canonical: cleanInput,
      gameName: cleanInput,
      tagLine: '',
      error:
        'Format incomplet : saisissez le Pseudo et le #TAG ensemble dans « Riot ID complet » (exemple : jeanculderetour2#3842).',
    };
  }

  const gameName = cleanInput.slice(0, hashIdx).trim();
  const tagLine = cleanInput.slice(hashIdx + 1).replace(/^#+/, '').trim();
  if (!gameName || !tagLine) {
    return {
      canonical: cleanInput,
      gameName,
      tagLine,
      error:
        'Il manque le pseudo avant le « # » ou le TAG après le « # » (exemple : jeanculderetour2#3842).',
    };
  }

  return {
    canonical: `${gameName}#${tagLine}`,
    gameName,
    tagLine,
  };
}

export function OnboardingShareWizard({
  activeRiotId,
  activeRegion,
  riotConfigured,
  riotKeyStartsWithRgapi,
  geminiConfigured,
  savedProfiles,
  onSaveProfile,
  onSwitchProfile,
  onNavigateTab,
}: OnboardingShareWizardProps) {
  const [persisted, setPersisted] = useState<PersistedOnboardingState>(() => loadOnboardingState());
  const { mode, step, completedSteps } = persisted;

  // Formulaire direct d'ajout / vérification dans l'étape 3
  const [playerLabel, setPlayerLabel] = useState('');
  const [playerRiotId, setPlayerRiotId] = useState('');
  const [playerRegion, setPlayerRegion] = useState<RiotPlatform>(activeRegion || 'EUW1');
  const [playerRole, setPlayerRole] = useState<Role>('MID');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // ignore storage write error
    }
  }, [persisted]);

  const setMode = (nextMode: OnboardingMode) => {
    setPersisted((prev) => ({
      ...prev,
      mode: nextMode,
      completedSteps: prev.completedSteps.includes(0)
        ? prev.completedSteps
        : [...prev.completedSteps, 0],
    }));
  };

  const goToStep = (nextStep: number) => {
    const clamped = Math.max(0, Math.min(3, nextStep));
    setPersisted((prev) => ({
      ...prev,
      step: clamped,
      completedSteps:
        nextStep > prev.step && !prev.completedSteps.includes(prev.step)
          ? [...prev.completedSteps, prev.step]
          : prev.completedSteps,
    }));
  };

  const toggleStepDone = (idx: number) => {
    setPersisted((prev) => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(idx)
        ? prev.completedSteps.filter((s) => s !== idx)
        : [...prev.completedSteps, idx],
    }));
  };

  const resetOnboarding = () => {
    setPersisted({ mode: 'share-web', step: 0, completedSteps: [] });
    setVerifyError(null);
    setVerifiedSuccess(null);
  };

  const appPublicUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const latestTargetRiotId = useMemo(() => {
    const candidate = playerRiotId.trim();
    if (candidate.includes('#')) return candidate;
    const nonDefault = savedProfiles.find(
      (p) => p.riotId.toLowerCase() !== activeRiotId.toLowerCase(),
    );
    return nonDefault?.riotId || 'jeanculderetour2#3842';
  }, [playerRiotId, savedProfiles, activeRiotId]);

  const shareInviteText = useMemo(() => {
    if (mode === 'share-web') {
      return [
        `Salut ! Voici notre outil d’analyse League of Legends (LoL AI Coach) :`,
        `Lien : ${appPublicUrl}`,
        ``,
        `Tu n’as RIEN à installer ni aucune clé API à créer (tout passe par ma clé serveur).`,
        `Pour afficher tes parties en 10 secondes :`,
        `1. Ouvre le lien ci-dessus.`,
        `2. Clique sur le bouton de compte en haut à droite (ou va dans « Compte & Réglages »).`,
        `3. Ajoute ton Riot ID complet « ${latestTargetRiotId} » puis clique sur « Synchroniser ».`,
      ].join('\n');
    }
    if (mode === 'clone-pc') {
      return [
        `Procédure pour installer LoL AI Coach sur ton PC (via GitHub) :`,
        `1. Clone ou télécharge le projet GitHub sur ton ordinateur (Node.js installé).`,
        `2. Note importante : pour la sécurité, ma clé Riot n’est PAS dans le dépôt GitHub.`,
        `3. Crée un fichier « .env » à la racine (ou lance l’assistant double-clic Windows/Mac) :`,
        `   - Soit tu colles ta propre clé gratuite depuis https://developer.riotgames.com/`,
        `   - Soit je te transmets mon fichier .env en privé (jamais sur GitHub).`,
        `4. Lance l’application, ajoute « ${latestTargetRiotId} » et synchronise tes parties.`,
      ].join('\n');
    }
    return [
      `Mémo rapide LoL AI Coach (${appPublicUrl}) :`,
      `- Compte actif : ${activeRiotId} (${activeRegion})`,
      `- Avant la partie : Builds & Match-ups`,
      `- En partie : Coach Temps Réel (bouton Analyser vocal + micro)`,
      `- Après la partie : Analyse Post-Game & Export CSV/JSON`,
    ].join('\n');
  }, [mode, appPublicUrl, latestTargetRiotId, activeRiotId, activeRegion]);

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareInviteText);
      setCopiedInvite(true);
      window.setTimeout(() => setCopiedInvite(false), 2500);
    } catch {
      // ignore clipboard error
    }
  };

  const handleVerifyAndSavePlayer = async (e: React.FormEvent, switchNow = false) => {
    e.preventDefault();
    setVerifyError(null);
    setVerifiedSuccess(null);

    const parsed = normalizeRiotIdDraft(playerRiotId, playerLabel);
    if (parsed.error) {
      setVerifyError(parsed.error);
      return;
    }

    let resolvedRiotId = parsed.canonical;
    let resolvedRegion = playerRegion;
    let summaryNote = '';

    if (riotConfigured) {
      setVerifying(true);
      try {
        const res = await fetch(
          `/api/riot/player?gameName=${encodeURIComponent(
            parsed.gameName,
          )}&tagLine=${encodeURIComponent(parsed.tagLine)}&region=${encodeURIComponent(
            playerRegion,
          )}&count=15`,
        );
        const data = (await res.json()) as {
          riotId?: string;
          region?: RiotPlatform;
          level?: number;
          matches?: unknown[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'Compte Riot introuvable.');
        }
        resolvedRiotId = data.riotId || parsed.canonical;
        resolvedRegion = data.region || playerRegion;
        summaryNote = ` · Niv. ${data.level || 30} (${data.matches?.length || 0} matchs trouvés)`;
      } catch (err) {
        setVerifyError(
          err instanceof Error
            ? err.message
            : `Impossible de vérifier « ${parsed.canonical} » auprès de Riot.`,
        );
        setVerifying(false);
        return;
      } finally {
        setVerifying(false);
      }
    }

    const label = playerLabel.trim() || resolvedRiotId.split('#')[0];
    const profileData = {
      label,
      riotId: resolvedRiotId,
      region: resolvedRegion,
      role: playerRole,
    };

    onSaveProfile(profileData);
    setPlayerRiotId(resolvedRiotId);
    setPlayerRegion(resolvedRegion);
    setVerifiedSuccess(
      `Profil « ${label} » (${resolvedRiotId} · ${resolvedRegion}${summaryNote}) ajouté et prêt !`,
    );

    setPersisted((prev) => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(2)
        ? prev.completedSteps
        : [...prev.completedSteps, 2],
    }));

    if (switchNow) {
      onSwitchProfile({
        id: `prof-${Date.now()}`,
        ...profileData,
      });
    }
  };

  return (
    <section
      id="onboarding-partage"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-6"
    >
      {/* En-tête de l'assistant */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400">
            <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Onboarding pas à pas · Démarrage &amp; Partage Famille</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white text-balance">
            Configurer pour vous ou partager avec votre fils en 4 étapes
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
            Choisissez comment votre fils ou vos amis accèdent à l’outil, comprenez immédiatement ce que couvre votre clé Riot permanente et ajoutez son compte en direct.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {completedSteps.length}/4 étapes validées
          </span>
          {completedSteps.length > 0 && (
            <button
              type="button"
              onClick={resetOnboarding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Recommencer
            </button>
          )}
        </div>
      </div>

      {/* Barre des 4 étapes cliquables */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {STEP_LABELS.map((item, idx) => {
          const isCurrent = step === idx;
          const isDone = completedSteps.includes(idx);
          return (
            <button
              key={item.num}
              type="button"
              onClick={() => goToStep(idx)}
              className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors duration-150 flex items-center justify-between gap-2 ${
                isCurrent
                  ? 'border-sky-500 bg-sky-500/10 text-slate-900 dark:text-white'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] text-slate-600 dark:text-slate-300 hover:border-sky-500/40'
              }`}
            >
              <div className="min-w-0">
                <div className="text-[11px] font-mono tabular-nums font-semibold text-sky-600 dark:text-sky-400">
                  Étape {item.num}
                </div>
                <div className="text-xs font-semibold truncate">{item.title}</div>
              </div>
              {isDone && (
                <CheckCircle2
                  className="w-4 h-4 text-emerald-500 shrink-0"
                  aria-label="Étape validée"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Contenu dynamique de l'étape active */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-5 space-y-5">
        {/* ÉTAPE 1 : CHOIX DU SCÉNARIO */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                01. Comment votre fils (ou votre ami) va-t-il utiliser l’application ?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Sélectionnez votre cas pour adapter automatiquement les étapes 2 et 3.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <button
                type="button"
                onClick={() => setMode('share-web')}
                className={`text-left p-4 rounded-xl border transition-colors space-y-2 ${
                  mode === 'share-web'
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] hover:border-emerald-500/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Globe className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Recommandé · 0 installation
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Partager votre lien web à votre fils
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Il ouvre simplement votre URL dans son navigateur. Aucun clone GitHub ni aucune clé API à créer pour lui : votre clé permanente serveur suffit.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('clone-pc')}
                className={`text-left p-4 rounded-xl border transition-colors space-y-2 ${
                  mode === 'clone-pc'
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] hover:border-amber-500/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Laptop className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Pour le Pont Live PC
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Cloner le repo sur son propre PC
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Utile s’il veut faire tourner le serveur chez lui (ex. pour le Pont Windows 127.0.0.1:2999). Le fichier .env n’étant pas sur GitHub, il faudra configurer sa clé (ou votre .env privé).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('self')}
                className={`text-left p-4 rounded-xl border transition-colors space-y-2 ${
                  mode === 'self'
                    ? 'border-sky-500 bg-sky-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] hover:border-sky-500/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Users className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Usage direct
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Consulter ses parties depuis votre session
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Ajoutez son compte sur votre propre appareil et passez de votre profil au sien en 1 clic pour débriefer ensemble après vos parties.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : RÉPONSE CLAIRE SUR LA CLÉ PERMANENTE & SÉCURITÉ */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                02. Votre clé Riot permanente suffit-elle ? (Réponse claire)
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Tout dépend de l’endroit où tourne le serveur de l’application — voici la règle exacte sans zone d’ombre.
              </p>
            </div>

            {/* État en direct de votre serveur actuel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                    Clé Riot serveur actuelle
                  </span>
                  <span
                    className={`font-semibold ${
                      riotConfigured && riotKeyStartsWithRgapi
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {riotConfigured && riotKeyStartsWithRgapi ? 'Prête (RGAPI)' : 'À configurer'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Avec une Personal Key permanente, Riot autorise jusqu’à 100 requêtes / 2 min : largement suffisant pour vous et votre fils.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-3.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                    Clé Gemini IA serveur
                  </span>
                  <span
                    className={`font-semibold ${
                      geminiConfigured
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {geminiConfigured ? 'Prête' : 'Optionnelle'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Comme pour Riot, elle reste secrète sur le serveur et n’est jamais visible dans le navigateur de vos invités.
                </p>
              </div>
            </div>

            {/* Tableau comparatif précis */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3.5 text-left font-medium">Situation</th>
                    <th className="py-2.5 px-3.5 text-left font-medium">Cloner le repo GitHub ?</th>
                    <th className="py-2.5 px-3.5 text-left font-medium">Nouvelle clé Riot requise ?</th>
                    <th className="py-2.5 px-3.5 text-left font-medium">Ce qu’il faut savoir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  <tr className={mode === 'share-web' ? 'bg-emerald-500/5' : ''}>
                    <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-white">
                      1. Lien web partagé (hébergé par vous)
                    </td>
                    <td className="py-3 px-3.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      Non
                    </td>
                    <td className="py-3 px-3.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      Non, la vôtre suffit
                    </td>
                    <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300">
                      Votre clé reste dans les Secrets du serveur. Sur son PC, son navigateur mémorise juste son propre choix de profil (Pseudo#TAG).
                    </td>
                  </tr>
                  <tr className={mode === 'clone-pc' ? 'bg-amber-500/5' : ''}>
                    <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-white">
                      2. Clone GitHub sur le PC du fils
                    </td>
                    <td className="py-3 px-3.5 text-amber-600 dark:text-amber-400 font-semibold">
                      Oui (local PC)
                    </td>
                    <td className="py-3 px-3.5 text-slate-800 dark:text-slate-200 font-semibold">
                      Oui (ou copie privée du .env)
                    </td>
                    <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300">
                      Par sécurité, le fichier .env n’est jamais envoyé sur GitHub. Il faut soit qu’il crée sa propre clé gratuite sur Riot Developer Portal, soit que vous lui donniez votre .env en privé (jamais sur GitHub).
                    </td>
                  </tr>
                  <tr className={mode === 'self' ? 'bg-sky-500/5' : ''}>
                    <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-white">
                      3. Sur votre propre ordinateur
                    </td>
                    <td className="py-3 px-3.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      Déjà prêt
                    </td>
                    <td className="py-3 px-3.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                      Non, la vôtre suffit
                    </td>
                    <td className="py-3 px-3.5 text-slate-600 dark:text-slate-300">
                      Vous ajoutez son compte dans « Profils Famille &amp; Amis » et basculez entre vous deux en 1 clic.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {mode === 'clone-pc' && (
              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={downloadWindowsAppLauncher}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Télécharger l’assistant Windows (.bat)
                </button>
                <button
                  type="button"
                  onClick={downloadMacAppLauncher}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121722] text-slate-800 dark:text-slate-100 hover:border-amber-500 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Assistant Mac (.command)
                </button>
                <a
                  href="https://developer.riotgames.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-500 transition-colors"
                >
                  <span>Portail Riot Developer</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* ÉTAPE 3 : AJOUTER & VÉRIFIER LE JOUEUR + MESSAGE D'INVITATION */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                03. Tester &amp; enregistrer le compte joueur + préparer l’invitation
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Vérifiez tout de suite le compte (ex. <span className="font-mono">jeanculderetour2#3842</span>) sur les serveurs Riot : le serveur détectera automatiquement sa bonne région même si vous vous trompez dans la liste.
              </p>
            </div>

            <form
              onSubmit={(e) => void handleVerifyAndSavePlayer(e, false)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="onb-label"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Prénom / Surnom
                  </label>
                  <input
                    id="onb-label"
                    type="text"
                    value={playerLabel}
                    onChange={(e) => setPlayerLabel(e.target.value)}
                    placeholder="Ex : Mon fils"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="onb-riotid"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Riot ID complet (Pseudo#TAG)
                  </label>
                  <input
                    id="onb-riotid"
                    type="text"
                    value={playerRiotId}
                    onChange={(e) => setPlayerRiotId(e.target.value)}
                    placeholder="jeanculderetour2#3842"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="onb-region"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Serveur
                  </label>
                  <select
                    id="onb-region"
                    value={playerRegion}
                    onChange={(e) => setPlayerRegion(e.target.value as RiotPlatform)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                  >
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="onb-role"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Rôle favori
                  </label>
                  <select
                    id="onb-role"
                    value={playerRole}
                    onChange={(e) => setPlayerRole(e.target.value as Role)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {verifyError && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {verifyError}
                </div>
              )}

              {verifiedSuccess && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  {verifiedSuccess}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {savedProfiles.length} profil(s) mémorisé(s) dans ce navigateur.
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={verifying}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-sky-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    {verifying ? 'Vérification Riot...' : 'Vérifier & enregistrer'}
                  </button>
                  <button
                    type="button"
                    disabled={verifying}
                    onClick={(e) => void handleVerifyAndSavePlayer(e, true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    Vérifier &amp; ouvrir ses stats
                  </button>
                </div>
              </div>
            </form>

            {/* Message prêt à copier pour envoyer à son fils */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {mode === 'share-web'
                    ? 'Message prêt à envoyer à votre fils (Lien web · 0 installation)'
                    : mode === 'clone-pc'
                      ? 'Instructions à lui envoyer pour son PC (GitHub)'
                      : 'Votre fiche mémo rapide'}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyInvite()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-amber-500 transition-colors whitespace-nowrap shrink-0"
                >
                  {copiedInvite ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {copiedInvite ? 'Message copié !' : 'Copier le message'}
                </button>
              </div>
              <pre className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {shareInviteText}
              </pre>
            </div>
          </div>
        )}

        {/* ÉTAPE 4 : PREMIÈRE SESSION EN JEU */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                04. Vos 3 premiers clics dès que vous êtes prêts à jouer
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Chaque moment de la soirée a son écran dédié. Note : sur un lien web partagé, le mode Live utilise{' '}
                <span className="font-mono">Spectator-V5</span> automatiquement ; le Pont Windows{' '}
                <span className="font-mono">127.0.0.1:2999</span> (or en poche &amp; CS temps réel) ne sert que si le jeu tourne sur le même PC que l’app.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <button
                type="button"
                onClick={() => onNavigateTab('dashboard')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 hover:border-amber-500/60 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                  <span className="flex items-center gap-1.5">
                    <LayoutDashboard className="w-4 h-4 text-amber-500" aria-hidden="true" />
                    1. Tableau de bord
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Vérifier le Score de Forme, le conseil du jour et lancer une Synthèse Globale IA.
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('builds')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 hover:border-sky-500/60 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                  <span className="flex items-center gap-1.5">
                    <Swords className="w-4 h-4 text-sky-500" aria-hidden="true" />
                    2. Builds &amp; Match-ups
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Choisir votre champion, personnaliser les 5 cibles du simulateur et noter vos mémos.
                </p>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('live')}
                className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-4 hover:border-emerald-500/60 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                    3. Coach Temps Réel
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Cliquer sur « Analyser » pour entendre les priorités via Web Speech ou activer le micro.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Barre Précédent / Valider / Suivant */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Précédent
            </button>

            <button
              type="button"
              onClick={() => toggleStepDone(step)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                completedSteps.includes(step)
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500/50'
              }`}
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              {completedSteps.includes(step) ? 'Étape validée' : 'Marquer cette étape faite'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <button
                type="button"
                onClick={() => goToStep(step + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
              >
                <span>Étape suivante</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!completedSteps.includes(3)) toggleStepDone(3);
                  onNavigateTab('dashboard');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                Terminer &amp; ouvrir le Tableau de bord
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
