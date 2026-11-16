import {
  Bot,
  Check,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AI_PROVIDER_CATALOG,
  getProviderDefinition,
  loadSavedAiSelection,
  saveAiSelection,
  type AiProvidersResponse,
  type AiUserSelection,
} from '../engines/aiConfig.ts';
import type { RiotPlatform, Role, SavedPlayerProfile } from '../engines/types.ts';
import { downloadMacAppLauncher, downloadWindowsAppLauncher } from '../utils/appLauncher.ts';

interface SettingsViewProps {
  defaultRiotId: string;
  defaultRegion: RiotPlatform;
  defaultRole: Role;
  darkMode: boolean;
  autoSyncEnabled: boolean;
  patchVersion: string;
  riotConfigured: boolean;
  riotKeyStartsWithRgapi: boolean;
  riotKeyLength: number;
  geminiConfigured: boolean;
  savedProfiles: SavedPlayerProfile[];
  onSavePreferences: (prefs: {
    riotId: string;
    region: RiotPlatform;
    role: Role;
    darkMode: boolean;
    autoSyncEnabled: boolean;
  }) => void;
  onSaveProfile: (profile: Omit<SavedPlayerProfile, 'id'> & { id?: string }) => void;
  onDeleteProfile: (id: string) => void;
  onSwitchProfile: (profile: SavedPlayerProfile) => void;
  onRefreshDataDragon: () => Promise<void>;
  onAiSelectionChange?: (selection: AiUserSelection) => void;
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

const ROLES: Role[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

const ENV_TEMPLATE_SNIPPET = `# Fichier .env à créer à la racine du projet (ne jamais le publier sur GitHub !)
RIOT_API_KEY="RGAPI-VOTRE-CLE-RIOT-ICI"
GEMINI_API_KEY="VOTRE-CLE-GEMINI-AI-STUDIO-ICI"
# Fournisseurs IA optionnels (décommentez ceux que vous utilisez) :
# ANTHROPIC_API_KEY="sk-ant-..."
# OPENAI_API_KEY="sk-..."
# OPENROUTER_API_KEY="sk-or-..."
# MISTRAL_API_KEY=""
# GROQ_API_KEY=""
# DEEPSEEK_API_KEY=""
# CUSTOM_AI_BASE_URL="http://127.0.0.1:11434/v1"
PORT=3000`;

const TERMINAL_QUICKSTART_SNIPPET = `git clone <URL_DE_VOTRE_DEPOT_GITHUB>
cd lol-ai-coach
npm install
cp .env.example .env
npm run dev`;

export function SettingsView({
  defaultRiotId,
  defaultRegion,
  defaultRole,
  darkMode,
  autoSyncEnabled,
  patchVersion,
  riotConfigured,
  riotKeyStartsWithRgapi,
  riotKeyLength,
  geminiConfigured,
  savedProfiles,
  onSavePreferences,
  onSaveProfile,
  onDeleteProfile,
  onSwitchProfile,
  onRefreshDataDragon,
  onAiSelectionChange,
}: SettingsViewProps) {
  const [riotId, setRiotId] = useState(defaultRiotId);
  const [region, setRegion] = useState<RiotPlatform>(defaultRegion);
  const [role, setRole] = useState<Role>(defaultRole);
  const [themeDark, setThemeDark] = useState(darkMode);
  const [autoSync, setAutoSync] = useState(autoSyncEnabled);
  const [savedNotice, setSavedNotice] = useState(false);
  const [refreshingDd, setRefreshingDd] = useState(false);

  // Configuration Multi-Fournisseurs IA & Choix du Modèle
  const [aiSelection, setAiSelection] = useState<AiUserSelection>(() => loadSavedAiSelection());
  const [customModelMode, setCustomModelMode] = useState<boolean>(() => {
    const initial = loadSavedAiSelection();
    const def = getProviderDefinition(initial.provider);
    return !def.models.some((m) => m.id === initial.model);
  });
  const [aiProvidersStatus, setAiProvidersStatus] = useState<AiProvidersResponse | null>(null);
  const [loadingAiProviders, setLoadingAiProviders] = useState(false);
  const [aiSavedNotice, setAiSavedNotice] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Formulaire ajout profil Famille / Amis
  const [newLabel, setNewLabel] = useState('');
  const [newRiotId, setNewRiotId] = useState('');
  const [newRegion, setNewRegion] = useState<RiotPlatform>('EUW1');
  const [newRole, setNewRole] = useState<Role>('MID');
  const [profileAddedNotice, setProfileAddedNotice] = useState(false);

  const [copiedBlock, setCopiedBlock] = useState<'env' | 'cmd' | null>(null);

  const fetchAiProviders = async (forceRefresh = false) => {
    setLoadingAiProviders(true);
    try {
      const res = await fetch(`/api/ai/providers${forceRefresh ? '?refresh=1' : ''}`);
      if (res.ok) {
        const data = (await res.json()) as AiProvidersResponse;
        setAiProvidersStatus(data);
      }
    } catch {
      // ignore network error
    } finally {
      setLoadingAiProviders(false);
    }
  };

  useEffect(() => {
    void fetchAiProviders(false);
  }, []);

  useEffect(() => {
    setRiotId(defaultRiotId);
    setRegion(defaultRegion);
    setRole(defaultRole);
    setThemeDark(darkMode);
    setAutoSync(autoSyncEnabled);
  }, [defaultRiotId, defaultRegion, defaultRole, darkMode, autoSyncEnabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSavePreferences({
      riotId: riotId.trim() || 'Boulvae#EUW',
      region,
      role,
      darkMode: themeDark,
      autoSyncEnabled: autoSync,
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiotId.trim()) return;
    onSaveProfile({
      label: newLabel.trim() || newRiotId.split('#')[0],
      riotId: newRiotId.trim(),
      region: newRegion,
      role: newRole,
    });
    setNewLabel('');
    setNewRiotId('');
    setProfileAddedNotice(true);
    window.setTimeout(() => setProfileAddedNotice(false), 2500);
  };

  const handleCopySnippet = async (kind: 'env' | 'cmd', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBlock(kind);
      window.setTimeout(() => setCopiedBlock(null), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleRefreshDd = async () => {
    setRefreshingDd(true);
    try {
      await Promise.all([onRefreshDataDragon(), fetchAiProviders(true)]);
    } finally {
      setRefreshingDd(false);
    }
  };

  const activeProviderDef = getProviderDefinition(aiSelection.provider);
  const activeProviderStatus = aiProvidersStatus?.providers.find(
    (p) => p.id === aiSelection.provider,
  );
  const availableModelsForActive = [
    ...activeProviderDef.models,
    ...(activeProviderStatus?.detectedModels || [])
      .filter((mId) => !activeProviderDef.models.some((m) => m.id === mId))
      .map((mId) => ({ id: mId, label: `${mId} (Détecté sur Ollama)`, note: 'Modèle local installé' })),
  ];

  const handleSelectProvider = (providerId: AiUserSelection['provider']) => {
    const def = getProviderDefinition(providerId);
    const detectedLocal =
      aiProvidersStatus?.providers.find((p) => p.id === providerId)?.detectedModels?.[0];
    const nextModel = detectedLocal || def.defaultModel;
    const next: AiUserSelection = {
      ...aiSelection,
      provider: providerId,
      model: nextModel,
      customBaseUrl: aiSelection.customBaseUrl || def.defaultBaseUrl,
    };
    setAiSelection(next);
    setCustomModelMode(false);
    setAiTestResult(null);
  };

  const handleSaveAiConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveAiSelection(aiSelection);
    setAiSelection(saved);
    onAiSelectionChange?.(saved);
    setAiSavedNotice(true);
    window.setTimeout(() => setAiSavedNotice(false), 2500);
  };

  const handleTestAiConnection = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiConfig: aiSelection }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        providerLabel?: string;
        model?: string;
        latencyMs?: number;
        replyPreview?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Échec du test (${res.status}).`);
      }
      setAiTestResult({
        ok: true,
        latencyMs: json.latencyMs,
        message: `${json.providerLabel} (${json.model}) connecté : « ${json.replyPreview} »`,
      });
    } catch (err) {
      setAiTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Test de connexion impossible.',
      });
    } finally {
      setAiTesting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* 1. Préférences du joueur actif */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-500" aria-hidden="true" />
            Paramètres du profil &amp; préférences
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enregistrées localement dans votre navigateur (et dans votre archive multi-parties personnelle).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="pref-riot-id"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Riot ID actif (Pseudo#TAG)
              </label>
              <input
                id="pref-riot-id"
                type="text"
                value={riotId}
                onChange={(e) => setRiotId(e.target.value)}
                placeholder="Boulvae#EUW"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pref-region"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Serveur par défaut
              </label>
              <select
                id="pref-region"
                value={region}
                onChange={(e) => setRegion(e.target.value as RiotPlatform)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0E14] text-slate-900 dark:text-white"
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="pref-role"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Rôle principal
              </label>
              <select
                id="pref-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
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

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={themeDark}
                  onChange={(e) => setThemeDark(e.target.checked)}
                  className="rounded border-slate-300 accent-amber-500"
                />
                Activer le mode sombre par défaut
              </label>
              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="rounded border-slate-300 accent-amber-500"
                />
                Auto-synchronisation proactive en arrière-plan (toutes les 5 minutes)
              </label>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {savedNotice && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Préférences enregistrées et synchronisées
                </span>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 dark:hover:bg-amber-400 transition-colors"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                Enregistrer et synchroniser
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* 2. Profils Famille & Amis (changement en 1 clic) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-500" aria-hidden="true" />
            Profils Famille &amp; Amis (changement rapide en 1 clic)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ajoutez vos comptes, ceux de vos enfants ou de vos amis. Chaque profil conserve son propre historique cumulé et ses tendances de coaching.
          </p>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {savedProfiles.map((prof) => {
            const isActive =
              prof.riotId.toLowerCase() === defaultRiotId.trim().toLowerCase() &&
              prof.region === defaultRegion;
            return (
              <div
                key={prof.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                  isActive ? 'bg-amber-500/5' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <span>{prof.label}</span>
                    {isActive && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        · Profil actif
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                    {prof.riotId} · {prof.region} · Rôle {prof.role}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => onSwitchProfile(prof)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:opacity-90 transition-opacity"
                    >
                      Activer &amp; synchroniser
                    </button>
                  )}
                  {savedProfiles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteProfile(prof.id)}
                      aria-label={`Supprimer le profil ${prof.label}`}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={handleAddProfile}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3"
        >
          <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            Ajouter un membre de la famille ou un ami
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Prénom / Surnom (ex: Léo)"
              aria-label="Prénom ou surnom"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
            />
            <input
              type="text"
              value={newRiotId}
              onChange={(e) => setNewRiotId(e.target.value)}
              placeholder="Pseudo#TAG (obligatoire)"
              aria-label="Riot ID du joueur"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
            />
            <select
              value={newRegion}
              onChange={(e) => setNewRegion(e.target.value as RiotPlatform)}
              aria-label="Région du profil"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              aria-label="Rôle favori du profil"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            {profileAddedNotice ? (
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Profil ajouté ! Sélectionnable dans la barre du haut ou ci-dessus.
              </span>
            ) : (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Astuce : une seule clé Riot API suffit pour synchroniser tous vos comptes.
              </span>
            )}
            <button
              type="submit"
              disabled={!newRiotId.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              Ajouter le profil
            </button>
          </div>
        </form>
      </section>

      {/* 3. Fournisseurs IA, Abonnements & Choix du Modèle */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
              <span>Fournisseur IA, Abonnements &amp; Choix du Modèle</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Choisissez le moteur IA et le modèle exact utilisés pour vos plans de match, débriefings, coaching live et explications de passifs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchAiProviders(true)}
            disabled={loadingAiProviders}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingAiProviders ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Actualiser la détection
          </button>
        </div>

        {/* Grille de sélection du fournisseur IA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {AI_PROVIDER_CATALOG.map((prov) => {
            const st = aiProvidersStatus?.providers.find((p) => p.id === prov.id);
            const isSelected = aiSelection.provider === prov.id;
            const isReady = Boolean(st?.available);

            return (
              <button
                key={prov.id}
                type="button"
                onClick={() => handleSelectProvider(prov.id)}
                className={`p-3.5 rounded-xl border text-left transition-all space-y-2 flex flex-col justify-between ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] hover:border-amber-500/50'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      {prov.name}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${
                        isReady
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-[#0B0E14] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isReady
                        ? 'Prêt'
                        : prov.category === 'local-subscription'
                          ? 'Local PC'
                          : prov.category === 'local-server'
                            ? 'Local'
                            : 'Clé requise'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    {prov.description}
                  </p>
                </div>
                <div className="pt-1 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  <span className="truncate">
                    {prov.envVarName ? prov.envVarName : 'CLI local (sans clé)'}
                  </span>
                  {isSelected && (
                    <span className="font-sans font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                      Sélectionné
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Panneau de configuration du fournisseur sélectionné & choix du modèle */}
        <form
          onSubmit={handleSaveAiConfig}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                <span>Configuration active : {activeProviderDef.name}</span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Statut serveur :{' '}
                <span
                  className={
                    activeProviderStatus?.available
                      ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                      : 'font-semibold text-amber-600 dark:text-amber-400'
                  }
                >
                  {activeProviderStatus?.reason || 'Vérification en cours...'}
                </span>
              </p>
            </div>
            <a
              href={activeProviderDef.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline shrink-0"
            >
              <span>Documentation / Portail</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ai-model-select"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Modèle IA utilisé
                </label>
                <button
                  type="button"
                  onClick={() => setCustomModelMode((prev) => !prev)}
                  className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline"
                >
                  {customModelMode ? 'Choisir dans la liste' : 'Saisir un ID personnalisé'}
                </button>
              </div>

              {customModelMode ? (
                <input
                  id="ai-model-select"
                  type="text"
                  value={aiSelection.model}
                  onChange={(e) =>
                    setAiSelection((prev) => ({ ...prev, model: e.target.value }))
                  }
                  placeholder={`Ex : ${activeProviderDef.defaultModel}`}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              ) : (
                <select
                  id="ai-model-select"
                  value={
                    availableModelsForActive.some((m) => m.id === aiSelection.model)
                      ? aiSelection.model
                      : activeProviderDef.defaultModel
                  }
                  onChange={(e) =>
                    setAiSelection((prev) => ({ ...prev, model: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                >
                  {availableModelsForActive.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.note}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {aiSelection.provider === 'openai-compatible' ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="ai-custom-base-url"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  URL du serveur compatible OpenAI (Ollama / LM Studio)
                </label>
                <input
                  id="ai-custom-base-url"
                  type="url"
                  value={aiSelection.customBaseUrl || ''}
                  onChange={(e) =>
                    setAiSelection((prev) => ({ ...prev, customBaseUrl: e.target.value }))
                  }
                  placeholder="http://127.0.0.1:11434/v1"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0E14] p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed flex flex-col justify-center">
                {aiSelection.provider === 'claude-code' ? (
                  <>
                    <strong className="text-slate-900 dark:text-white">
                      Abonnement Claude Pro / Max via Claude Code :
                    </strong>
                    <span>
                      Sur votre PC, lancez <code className="font-mono">claude login</code> une fois dans votre terminal puis démarrez l’app en local (<code className="font-mono">npm run dev</code> ou l’assistant). Aucune clé API payante nécessaire.
                    </span>
                  </>
                ) : activeProviderDef.envVarName ? (
                  <>
                    <strong className="text-slate-900 dark:text-white">
                      Variable serveur sécurisée : <code className="font-mono">{activeProviderDef.envVarName}</code>
                    </strong>
                    <span>
                      Ajoutez cette variable dans <strong>Settings &gt; Secrets</strong> (sur AI Studio) ou dans votre fichier local <code className="font-mono">.env</code>. Aucune clé secrète n’est jamais stockée dans le navigateur.
                    </span>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={aiSelection.fallbackToGemini}
                onChange={(e) =>
                  setAiSelection((prev) => ({ ...prev, fallbackToGemini: e.target.checked }))
                }
                className="rounded border-slate-300 accent-amber-500"
              />
              Bascule automatique sur Gemini si ce fournisseur est indisponible
            </label>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {aiSavedNotice && (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Moteur IA enregistré !
                </span>
              )}
              <button
                type="button"
                onClick={handleTestAiConnection}
                disabled={aiTesting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-800 dark:text-slate-100 hover:border-amber-500/60 disabled:opacity-50 transition-colors"
              >
                <Sparkles className={`w-3.5 h-3.5 text-amber-500 ${aiTesting ? 'animate-spin' : ''}`} aria-hidden="true" />
                {aiTesting ? 'Test en cours...' : 'Tester la connexion'}
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 transition-colors"
              >
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                Activer ce moteur IA
              </button>
            </div>
          </div>

          {aiTestResult && (
            <div
              className={`rounded-lg border p-3 text-xs leading-relaxed ${
                aiTestResult.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              <div className="font-semibold flex items-center justify-between gap-2">
                <span>{aiTestResult.ok ? 'Connexion IA confirmée' : 'Connexion IA refusée / non configurée'}</span>
                {typeof aiTestResult.latencyMs === 'number' && (
                  <span className="font-mono tabular-nums text-[11px]">{aiTestResult.latencyMs} ms</span>
                )}
              </div>
              <p className="mt-1">{aiTestResult.message}</p>
            </div>
          )}
        </form>

        <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200 select-none">
            Comment connecter un abonnement Claude Code, ChatGPT/OpenAI ou un modèle local ?
          </summary>
          <div className="mt-3 space-y-2.5 text-slate-600 dark:text-slate-300 leading-relaxed">
            <p>
              <strong>1. Claude Code (Abonnement Anthropic Pro / Max) :</strong> Anthropic permet d’utiliser votre abonnement via le terminal local <code className="font-mono">claude login</code>. Quand vous lancez LoL AI Coach sur votre ordinateur (avec l’assistant ou <code className="font-mono">npm run dev</code>), le serveur détecte automatiquement Claude Code et l’utilise sans aucune clé API payante.
            </p>
            <p>
              <strong>2. OpenAI (ChatGPT API), Anthropic API, OpenRouter, Mistral, Groq, DeepSeek :</strong> Les abonnements web grand public (ChatGPT Plus / Claude.ai web) n’offrent pas de connexion OAuth pour les applications externes. Pour connecter ces modèles à LoL AI Coach depuis le cloud ou votre PC, ajoutez simplement la variable correspondante (ex. <code className="font-mono">OPENAI_API_KEY</code> ou <code className="font-mono">ANTHROPIC_API_KEY</code>) dans <strong>Settings &gt; Secrets</strong> ou dans <code className="font-mono">.env</code>.
            </p>
            <p>
              <strong>3. Gratuit 100 % hors-ligne sur votre PC (Ollama / LM Studio) :</strong> Lancez Ollama sur votre PC (<code className="font-mono">ollama run qwen2.5:14b</code>), choisissez <strong>Serveur Local / Compatible OpenAI</strong> ci-dessus, cliquez sur <em>Actualiser la détection</em> et vos modèles installés apparaissent automatiquement.
            </p>
          </div>
        </details>
      </section>

      {/* 4. État des services serveur */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Sources de données &amp; état des services
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Vérification en lecture seule des variables serveur configurées dans votre environnement.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefreshDd}
            disabled={refreshingDd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingDd ? 'animate-spin' : ''}`} aria-hidden="true" />
            Re-vérifier les clés &amp; Data Dragon (Patch {patchVersion})
          </button>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">Data Dragon Officiel</div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Champions, objets, runes et minimap map11.png synchronisés automatiquement sans clé.
              </div>
            </div>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
              Patch {patchVersion}
            </span>
          </div>

          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Variable serveur RIOT_API_KEY
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                {riotConfigured
                  ? `Détectée (${riotKeyLength} caractères, préfixe RGAPI- : ${riotKeyStartsWithRgapi ? 'Oui' : 'Non'}).`
                  : 'Non configurée côté serveur.'}
              </div>
            </div>
            <span
              className={`font-semibold shrink-0 ${
                riotConfigured && riotKeyStartsWithRgapi
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {riotConfigured ? 'Présente' : 'Absente'}
            </span>
          </div>

          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-900 dark:text-white">
                Coach IA Gemini (GEMINI_API_KEY)
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Analyse tactique post-game, plans de match-up et conseils vocaux/live via le serveur Express.
              </div>
            </div>
            <span
              className={`font-semibold shrink-0 ${
                geminiConfigured
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {geminiConfigured ? 'Prêt' : 'Non configuré'}
            </span>
          </div>
        </div>
      </section>

      {/* 4. Configuration facile pour non-techniciens (Famille & Amis) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-500" aria-hidden="true" />
            Configuration facile des clés API (Sans toucher au code ni au fichier .env)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Par sécurité, aucune clé secrète ne se saisit directement dans la page web (afin qu’un visiteur ne puisse jamais lire ou écraser les clés du serveur). Deux solutions ultra-simples existent pour vos enfants et vos amis :
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1 : Lien partagé */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Globe className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
              Option 1 · Via le lien partagé (0 installation)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>La plus simple pour la famille :</strong> vous configurez <code className="font-mono">RIOT_API_KEY</code> (et <code className="font-mono">GEMINI_API_KEY</code>) une seule fois dans <strong>Settings &gt; Secrets</strong> de Google AI Studio.
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Ensuite, vos enfants et amis ouvrent simplement le lien de l’application et utilisent le sélecteur de profils ci-dessus : <strong>ils n’ont rien à installer ni aucune clé à créer</strong> !
            </p>
          </div>

          {/* Option 2 : Assistant double-clic pour PC GitHub */}
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              Option 2 · Sur leur PC depuis GitHub (Double-clic)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Après avoir téléchargé le projet depuis GitHub, il suffit de <strong>double-cliquer</strong> sur l’assistant inclus dans le dossier (aucune commande à taper, aucun fichier <code className="font-mono">.env</code> à éditer) :
            </p>
            <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
              <li>1. L’assistant installe l’application tout seul au premier lancement.</li>
              <li>2. Il ouvre la page Riot : il suffit de copier-coller la clé quand la fenêtre la demande (il crée le fichier <code className="font-mono">.env</code> automatiquement).</li>
              <li>3. Il démarre le serveur et ouvre le coach dans le navigateur !</li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={downloadWindowsAppLauncher}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Assistant Windows (.bat)
              </button>
              <button
                type="button"
                onClick={downloadMacAppLauncher}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-800 dark:text-slate-100 hover:border-amber-500/60 transition-colors"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Assistant Mac (.command)
              </button>
            </div>
          </div>
        </div>

        {/* Liens directs vers les portails officiels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="https://developer.riotgames.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 hover:border-amber-500/50 transition-colors flex items-start justify-between gap-3"
          >
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Portail officiel Riot Developer (Clé gratuite)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Connectez-vous avec n’importe quel compte Riot puis cliquez sur <strong>Copy</strong>. Astuce : demandez une <em>Personal API Key</em> gratuite pour qu’elle n’expire plus toutes les 24h !
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          </a>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 hover:border-amber-500/50 transition-colors flex items-start justify-between gap-3"
          >
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                Google AI Studio (Clé Gemini optionnelle)
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Créez une clé gratuite pour activer les résumés stratégiques et les débriefings vocaux/tactiques IA.
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          </a>
        </div>

        {/* Détails avancés repliables pour ne pas encombrer les débutants */}
        <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200 select-none">
            Mode avancé (pour développeurs : fichier .env &amp; commandes terminal)
          </summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Modèle de fichier <code className="font-mono">.env</code>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopySnippet('env', ENV_TEMPLATE_SNIPPET)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {copiedBlock === 'env' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {copiedBlock === 'env' ? 'Copié !' : 'Copier le modèle .env'}
                </button>
              </div>
              <pre className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0E14] text-[11px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                {ENV_TEMPLATE_SNIPPET}
              </pre>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
                  Commandes terminal manuelles
                </span>
                <button
                  type="button"
                  onClick={() => handleCopySnippet('cmd', TERMINAL_QUICKSTART_SNIPPET)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {copiedBlock === 'cmd' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {copiedBlock === 'cmd' ? 'Copié !' : 'Copier les commandes'}
                </button>
              </div>
              <pre className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0E14] text-[11px] font-mono text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
                {TERMINAL_QUICKSTART_SNIPPET}
              </pre>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}

