export type AiProviderId =
  | 'gemini'
  | 'claude-code'
  | 'anthropic'
  | 'openai'
  | 'openrouter'
  | 'mistral'
  | 'groq'
  | 'deepseek'
  | 'openai-compatible';

export interface AiModelOption {
  id: string;
  label: string;
  note: string;
}

export interface AiProviderDefinition {
  id: AiProviderId;
  name: string;
  shortName: string;
  category: 'cloud-api' | 'local-subscription' | 'local-server';
  description: string;
  envVarName: string | null;
  requiresKey: boolean;
  defaultModel: string;
  models: AiModelOption[];
  docsUrl: string;
  defaultBaseUrl?: string;
}

export interface AiProviderStatus {
  id: AiProviderId;
  available: boolean;
  reason: string;
  detectedModels?: string[];
}

export interface AiProvidersResponse {
  environment: 'cloud' | 'local';
  providers: AiProviderStatus[];
}

export interface AiUserSelection {
  provider: AiProviderId;
  model: string;
  customBaseUrl?: string;
  fallbackToGemini: boolean;
}

export interface AiMetaInfo {
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  usedFallback?: boolean;
}

export const AI_PROVIDER_CATALOG: AiProviderDefinition[] = [
  {
    id: 'gemini',
    name: 'Google Gemini (AI Studio)',
    shortName: 'Gemini',
    category: 'cloud-api',
    description:
      'Moteur par défaut optimisé : supporte l’analyse structurée ultra-rapide et Google Search Grounding (U.GG / OP.GG).',
    envVarName: 'GEMINI_API_KEY',
    requiresKey: true,
    defaultModel: 'gemini-4-hydrogen',
    docsUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen (Flash)', note: 'Recommandé · Rapide & complet' },
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', note: 'Ultra-rapide · Quota élevé' },
      { id: 'gemini-4-argon', label: 'Gemini 4 Argon (Pro)', note: 'Raisonnement avancé (clé payante)' },
      { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', note: 'Analyse profonde (clé payante)' },
    ],
  },
  {
    id: 'claude-code',
    name: 'Claude Code CLI (Abonnement Anthropic Pro / Max)',
    shortName: 'Claude Code',
    category: 'local-subscription',
    description:
      'Utilise directement votre abonnement Claude Code (claude login) sans clé API payante lorsque l’app tourne sur votre PC.',
    envVarName: null,
    requiresKey: false,
    defaultModel: 'sonnet',
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/overview',
    models: [
      { id: 'sonnet', label: 'Claude Sonnet (via Claude Code)', note: 'Recommandé · Équilibre vitesse/qualité' },
      { id: 'opus', label: 'Claude Opus (via Claude Code)', note: 'Analyse tactique approfondie' },
      { id: 'haiku', label: 'Claude Haiku (via Claude Code)', note: 'Réponses instantanées (Live)' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude (API directe)',
    shortName: 'Claude API',
    category: 'cloud-api',
    description:
      'Connexion directe à l’API Messages d’Anthropic via ANTHROPIC_API_KEY configurée dans Secrets ou .env.',
    envVarName: 'ANTHROPIC_API_KEY',
    requiresKey: true,
    defaultModel: 'claude-sonnet-4-5',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'Recommandé · Excellent en coaching' },
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', note: 'Raisonnement maximal' },
      { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet', note: 'Rapide & fiable' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', note: 'Ultra-rapide & économique' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT / o-series API)',
    shortName: 'OpenAI',
    category: 'cloud-api',
    description:
      'Connexion directe à l’API OpenAI (ChatGPT / GPT-4.1 / GPT-4o / o4-mini) via OPENAI_API_KEY.',
    envVarName: 'OPENAI_API_KEY',
    requiresKey: true,
    defaultModel: 'gpt-4.1-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', note: 'Recommandé · Très rapide & économique' },
      { id: 'gpt-4.1', label: 'GPT-4.1', note: 'Haute précision tactique' },
      { id: 'gpt-4o', label: 'GPT-4o', note: 'Polyvalent classique' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', note: 'Ultra-léger' },
      { id: 'o4-mini', label: 'o4-mini', note: 'Raisonnement mathématique' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (Multi-modèles unifiés)',
    shortName: 'OpenRouter',
    category: 'cloud-api',
    description:
      'Une seule clé OPENROUTER_API_KEY pour accéder à Claude, GPT, DeepSeek, Llama ou Gemini selon vos crédits.',
    envVarName: 'OPENROUTER_API_KEY',
    requiresKey: true,
    defaultModel: 'anthropic/claude-sonnet-4.5',
    docsUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (OpenRouter)', note: 'Qualité rédactionnelle' },
      { id: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini (OpenRouter)', note: 'Rapide & précis' },
      { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3 (OpenRouter)', note: 'Très économique' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', note: 'Open weights performant' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI (Français natif)',
    shortName: 'Mistral',
    category: 'cloud-api',
    description:
      'Modèles européens Mistral AI excellents en français, via MISTRAL_API_KEY dans Secrets ou .env.',
    envVarName: 'MISTRAL_API_KEY',
    requiresKey: true,
    defaultModel: 'mistral-small-latest',
    docsUrl: 'https://console.mistral.ai/api-keys/',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small Latest', note: 'Rapide & économique' },
      { id: 'mistral-medium-latest', label: 'Mistral Medium Latest', note: 'Équilibré' },
      { id: 'mistral-large-latest', label: 'Mistral Large Latest', note: 'Haute précision' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq (Inférence temps réel)',
    shortName: 'Groq',
    category: 'cloud-api',
    description:
      'Latence quasi instantanée idéale pour le Coach Temps Réel en partie, via GROQ_API_KEY.',
    envVarName: 'GROQ_API_KEY',
    requiresKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    docsUrl: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', note: 'Recommandé · Ultra-rapide' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', note: 'Latence minimale' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek API',
    shortName: 'DeepSeek',
    category: 'cloud-api',
    description:
      'Modèles DeepSeek-V3 et Reasoner très économiques via DEEPSEEK_API_KEY.',
    envVarName: 'DEEPSEEK_API_KEY',
    requiresKey: true,
    defaultModel: 'deepseek-chat',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)', note: 'Recommandé · Coût minimal' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', note: 'Calcul & analyse avancée' },
    ],
  },
  {
    id: 'openai-compatible',
    name: 'Serveur Local / Compatible OpenAI (Ollama, LM Studio)',
    shortName: 'Local / Custom',
    category: 'local-server',
    description:
      'Connectez Ollama, LM Studio, vLLM ou LiteLLM gratuitement en local (ou tout endpoint compatible OpenAI via CUSTOM_AI_BASE_URL).',
    envVarName: 'CUSTOM_AI_BASE_URL',
    requiresKey: false,
    defaultModel: 'llama3.3',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
    docsUrl: 'https://ollama.com/download',
    models: [
      { id: 'llama3.3', label: 'Llama 3.3 (Ollama)', note: 'Modèle local polyvalent' },
      { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B (Ollama)', note: 'Très bon en JSON structuré' },
      { id: 'mistral', label: 'Mistral 7B (Ollama)', note: 'Léger pour PC standard' },
    ],
  },
];

export const AI_PREFS_STORAGE_KEY = 'lol_ai_coach_ai_prefs_v1';

export const DEFAULT_AI_SELECTION: AiUserSelection = {
  provider: 'gemini',
  model: 'gemini-4-hydrogen',
  customBaseUrl: 'http://127.0.0.1:11434/v1',
  fallbackToGemini: true,
};

export function getProviderDefinition(id: AiProviderId): AiProviderDefinition {
  return AI_PROVIDER_CATALOG.find((p) => p.id === id) || AI_PROVIDER_CATALOG[0];
}

export function loadSavedAiSelection(): AiUserSelection {
  if (typeof window === 'undefined') return DEFAULT_AI_SELECTION;
  try {
    const raw = window.localStorage.getItem(AI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SELECTION;
    const parsed = JSON.parse(raw) as Partial<AiUserSelection>;
    const provider = AI_PROVIDER_CATALOG.some((p) => p.id === parsed.provider)
      ? (parsed.provider as AiProviderId)
      : DEFAULT_AI_SELECTION.provider;
    const def = getProviderDefinition(provider);
    return {
      provider,
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : def.defaultModel,
      customBaseUrl:
        typeof parsed.customBaseUrl === 'string' && parsed.customBaseUrl.trim()
          ? parsed.customBaseUrl.trim()
          : def.defaultBaseUrl || DEFAULT_AI_SELECTION.customBaseUrl,
      fallbackToGemini:
        typeof parsed.fallbackToGemini === 'boolean' ? parsed.fallbackToGemini : true,
    };
  } catch {
    return DEFAULT_AI_SELECTION;
  }
}

export function saveAiSelection(selection: AiUserSelection): AiUserSelection {
  const def = getProviderDefinition(selection.provider);
  const normalized: AiUserSelection = {
    provider: def.id,
    model: selection.model.trim() || def.defaultModel,
    customBaseUrl: selection.customBaseUrl?.trim() || def.defaultBaseUrl,
    fallbackToGemini: Boolean(selection.fallbackToGemini),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AI_PREFS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage errors
    }
  }
  return normalized;
}

export async function postCoachJson<T>(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const aiConfig = loadSavedAiSelection();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      aiConfig,
    }),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json?.error || `Erreur serveur (${res.status}).`);
  }
  return json;
}
