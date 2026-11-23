import {
  Bot,
  Check,
  Compass,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  Pencil,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type SettingsSectionTab = 'account' | 'ai' | 'services';
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
  onOpenOnboarding?: () => void;
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
  onOpenOnboarding,
}: SettingsViewProps) {
  const [settingsSection, setSettingsSection] = useState<SettingsSectionTab>('account');
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

  // Formulaire ajout / édition profil Famille / Amis
  const [newLabel, setNewLabel] = useState('');
  const [newRiotId, setNewRiotId] = useState('');
  const [newRegion, setNewRegion] = useState<RiotPlatform>('EUW1');
  const [newRole, setNewRole] = useState<Role>('MID');
  const [addingProfile, setAddingProfile] = useState(false);
  const [profileAddedNotice, setProfileAddedNotice] = useState<string | null>(null);
  const [profileAddError, setProfileAddError] = useState<string | null>(null);

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editRiotId, setEditRiotId] = useState('');
  const [editRegion, setEditRegion] = useState<RiotPlatform>('EUW1');
  const [editRole, setEditRole] = useState<Role>('MID');

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

  const normalizeRiotIdWithOptionalLabel = (
    rawRiotId: string,
    rawLabel: string,
  ): { canonical: string; gameName: string; tagLine: string; error?: string } => {
    const cleanLabel = rawLabel.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    let cleanInput = rawRiotId
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/＃/g, '#')
      .trim();

    // Cas malin : si l'utilisateur a mis le pseudo dans Surnom (ex: "jeanculderetour2")
    // et seulement "#3842" ou "3842" dans le champ Riot ID, on les combine proprement !
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
  };

  const handleAddProfile = async (e: React.FormEvent, activateAfterSave = true) => {
    e.preventDefault();
    setProfileAddError(null);
    setProfileAddedNotice(null);

    const parsed = normalizeRiotIdWithOptionalLabel(newRiotId, newLabel);
    if (parsed.error) {
      setProfileAddError(parsed.error);
      return;
    }

    let finalRiotId = parsed.canonical;
    let finalRegion = newRegion;
    let verifiedInfo = '';

    if (riotConfigured) {
      setAddingProfile(true);
      try {
        const res = await fetch(
          `/api/riot/player?gameName=${encodeURIComponent(
            parsed.gameName,
          )}&tagLine=${encodeURIComponent(parsed.tagLine)}&region=${encodeURIComponent(
            newRegion,
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
        finalRiotId = data.riotId || parsed.canonical;
        finalRegion = data.region || newRegion;
        verifiedInfo = ` · Niv. ${data.level || 30} (${data.matches?.length || 0} matchs trouvés)`;
      } catch (err) {
        setProfileAddError(
          err instanceof Error
            ? err.message
            : `Impossible de vérifier « ${parsed.canonical} » sur Riot API.`,
        );
        setAddingProfile(false);
        return;
      } finally {
        setAddingProfile(false);
      }
    }

    const finalLabel = newLabel.trim() || finalRiotId.split('#')[0];
    const profileToSave = {
      label: finalLabel,
      riotId: finalRiotId,
      region: finalRegion,
      role: newRole,
    };
    onSaveProfile(profileToSave);

    setNewLabel('');
    setNewRiotId('');
    setProfileAddedNotice(
      `Profil « ${finalLabel} » (${finalRiotId} · ${finalRegion}${verifiedInfo}) enregistré !`,
    );

    if (activateAfterSave) {
      onSwitchProfile({
        id: `prof-${Date.now()}`,
        ...profileToSave,
      });
    } else {
      window.setTimeout(() => setProfileAddedNotice(null), 4000);
    }
  };

  const startEditingProfile = (prof: SavedPlayerProfile) => {
    setEditingProfileId(prof.id);
    setEditLabel(prof.label);
    setEditRiotId(prof.riotId);
    setEditRegion(prof.region);
    setEditRole(prof.role);
  };

  const handleSaveEditedProfile = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    const parsed = normalizeRiotIdWithOptionalLabel(editRiotId, editLabel);
    if (parsed.error) {
      setProfileAddError(parsed.error);
      return;
    }
    setProfileAddError(null);
    onSaveProfile({
      id,
      label: editLabel.trim() || parsed.gameName,
      riotId: parsed.canonical,
      region: editRegion,
      role: editRole,
    });
    setEditingProfileId(null);
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
    <div className="space-y-6 max-w-4xl">
      {/* En-tête & navigation par onglets épurée */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-500 shrink-0" aria-hidden="true" />
            <span>Réglages &amp; Compte</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gérez votre Riot ID actif, vos profils Famille &amp; Amis, votre moteur IA et les lanceurs PC sans tout mélanger.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sections des réglages"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 shrink-0"
        >
          {(
            [
              { id: 'account', label: 'Compte & Famille', icon: Users },
              { id: 'ai', label: 'Moteur IA', icon: Bot },
              { id: 'services', label: 'Services & PC', icon: KeyRound },
            ] as Array<{ id: SettingsSectionTab; label: string; icon: typeof Users }>
          ).map((tab) => {
            const Icon = tab.icon;
            const active = settingsSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSettingsSection(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ONGLET 1 : COMPTE & FAMILLE */}
      {settingsSection === 'account' && (
        <div className="space-y-6">
          {/* 1. Préférences du joueur actif */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121722] p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Compte Riot actif &amp; préférences
              </h2>
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500" aria-hidden="true" />
              Profils Famille &amp; Amis (changement rapide en 1 clic)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Ajoutez vos comptes, ceux de vos enfants ou de vos amis. Chaque profil conserve son propre historique cumulé et ses tendances de coaching.
            </p>
          </div>
          {onOpenOnboarding && (
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/15 transition-colors whitespace-nowrap shrink-0"
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              Guide pas à pas · Partager avec mon fils
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {savedProfiles.map((prof) => {
            const isActive =
              prof.riotId.toLowerCase() === defaultRiotId.trim().toLowerCase() &&
              prof.region === defaultRegion;
            const isEditing = editingProfileId === prof.id;

            if (isEditing) {
              return (
                <form
                  key={prof.id}
                  onSubmit={(e) => handleSaveEditedProfile(e, prof.id)}
                  className="p-4 bg-slate-50 dark:bg-[#0D121C] space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Surnom"
                      aria-label="Surnom du profil"
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={editRiotId}
                      onChange={(e) => setEditRiotId(e.target.value)}
                      placeholder="Pseudo#TAG"
                      aria-label="Riot ID complet"
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                    />
                    <select
                      value={editRegion}
                      onChange={(e) => setEditRegion(e.target.value as RiotPlatform)}
                      aria-label="Région du profil"
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                    >
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as Role)}
                      aria-label="Rôle favori"
                      className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingProfileId(null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      Enregistrer
                    </button>
                  </div>
                </form>
              );
            }

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
                  <button
                    type="button"
                    onClick={() => startEditingProfile(prof)}
                    aria-label={`Modifier le profil ${prof.label}`}
                    title="Corriger le Pseudo#TAG ou le serveur"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/40 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
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
          onSubmit={(e) => void handleAddProfile(e, true)}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0D121C] p-4 space-y-3.5"
        >
          <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
            Ajouter un membre de la famille ou un ami
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="new-prof-label"
                className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                Surnom affiché (libre)
              </label>
              <input
                id="new-prof-label"
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex : Mon fils, Léo"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="new-prof-riot-id"
                className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                Riot ID complet : Pseudo#TAG
              </label>
              <input
                id="new-prof-riot-id"
                type="text"
                value={newRiotId}
                onChange={(e) => {
                  setNewRiotId(e.target.value);
                  if (profileAddError) setProfileAddError(null);
                }}
                placeholder="Ex : jeanculderetour2#3842"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="new-prof-region"
                className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                Serveur
              </label>
              <select
                id="new-prof-region"
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value as RiotPlatform)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
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
                htmlFor="new-prof-role"
                className="block text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                Rôle favori
              </label>
              <select
                id="new-prof-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0E14] text-slate-900 dark:text-white"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {profileAddError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {profileAddError}
            </div>
          )}

          {profileAddedNotice && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {profileAddedNotice}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Le serveur réel est détecté automatiquement si vous hésitez entre EUW1, EUN1 ou NA1.
            </span>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={addingProfile || !newRiotId.trim()}
                onClick={(e) => void handleAddProfile(e, false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                Ajouter à la liste
              </button>
              <button
                type="submit"
                disabled={addingProfile || !newRiotId.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 dark:bg-amber-500 text-white dark:text-slate-950 hover:bg-amber-500 disabled:opacity-50 whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                {addingProfile ? 'Vérification Riot...' : 'Vérifier, ajouter & ouvrir'}
              </button>
            </div>
          </div>
            </form>
          </section>
        </div>
      )}

      {/* ONGLET 2 : MOTEUR IA */}
      {settingsSection === 'ai' && (
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
                className={`p-3.5 rounded-xl border text-left transition-[border-color,background-color,box-shadow] duration-150 space-y-2 flex flex-col justify-between ${
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
                      {aiProvidersStatus?.environment === 'cloud'
                        ? 'En mode Cloud (ici sur le web), aucune fenêtre de connexion Claude ne peut s’ouvrir vers votre abonnement. Pour l’utiliser sans clé API payante, lancez l’app sur votre PC après '
                        : 'Sur votre PC, lancez '}
                      <code className="font-mono">claude login</code>
                      {aiProvidersStatus?.environment === 'cloud'
                        ? ' (c’est là que votre navigateur demandera la connexion à votre compte Claude Pro/Max), puis démarrez l’app en local avec '
                        : ' une fois dans votre terminal puis démarrez l’app en local ('}
                      <code className="font-mono">npm run dev</code>
                      {aiProvidersStatus?.environment === 'cloud'
                        ? ' ou l’assistant Windows/Mac).'
                        : ' ou l’assistant). Aucune clé API payante nécessaire.'}
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
      )}

      {/* ONGLET 3 : SERVICES & INSTALLATION PC */}
      {settingsSection === 'services' && (
        <div className="space-y-6">
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" aria-hidden="true" />
              Partage Famille &amp; Clés API (Sans toucher au code)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Votre clé permanente <code className="font-mono">RIOT_API_KEY</code> reste toujours côté serveur (jamais dans GitHub ni dans le navigateur). Selon la façon dont vous partagez avec votre fils, voici la règle :
            </p>
          </div>
          {onOpenOnboarding && (
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/15 transition-colors whitespace-nowrap shrink-0"
            >
              <Compass className="w-3.5 h-3.5" aria-hidden="true" />
              Ouvrir l’Onboarding pas à pas
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1 : Lien partagé */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Globe className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
              Option 1 · Lien web partagé (Votre clé permanente suffit !)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>La plus simple pour votre fils :</strong> comme <code className="font-mono">RIOT_API_KEY</code> est déjà configurée sur votre serveur (<strong>Settings &gt; Secrets</strong>), vous n’avez rien à cloner ni aucune autre clé à créer.
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Il ouvre simplement le lien de l’app, ajoute son <code className="font-mono">Pseudo#TAG</code> dans le sélecteur de profils et synchronise ses parties (100 req/2 min avec votre clé permanente).
            </p>
          </div>

          {/* Option 2 : Assistant double-clic pour PC GitHub */}
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
              Option 2 · S’il clone le repo sur son propre PC (GitHub)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Le fichier <code className="font-mono">.env</code> n’est jamais envoyé sur GitHub. S’il lance l’app en local sur son PC, il lui faut un <code className="font-mono">.env</code> chez lui (avec sa propre clé gratuite Riot, ou une copie privée de votre <code className="font-mono">.env</code>) :
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
      )}
    </div>
  );
}

