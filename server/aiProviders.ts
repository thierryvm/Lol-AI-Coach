import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  AI_PROVIDER_CATALOG,
  getProviderDefinition,
  type AiMetaInfo,
  type AiProviderId,
  type AiProvidersResponse,
  type AiProviderStatus,
  type AiUserSelection,
} from '../src/engines/aiConfig.ts';

const execFileAsync = promisify(execFile);

let cachedClaudeCliProbe: { expiresAt: number; available: boolean; versionNote: string } | null = null;
let cachedOllamaProbe: { expiresAt: number; available: boolean; models: string[] } | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY manquante côté serveur. Configurez-la dans Settings > Secrets ou .env.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

export function extractJsonObjectFromText(rawText: string): any {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Réponse IA non structurée : aucun objet JSON valide trouvé.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function probeClaudeCodeCli(force = false): Promise<{ available: boolean; versionNote: string }> {
  const now = Date.now();
  if (!force && cachedClaudeCliProbe && cachedClaudeCliProbe.expiresAt > now) {
    return {
      available: cachedClaudeCliProbe.available,
      versionNote: cachedClaudeCliProbe.versionNote,
    };
  }

  try {
    const { stdout } = await execFileAsync('claude', ['--version'], {
      timeout: 1500,
    });
    const version = stdout.trim().split('\n')[0] || 'Claude Code CLI';
    cachedClaudeCliProbe = {
      expiresAt: now + 60_000,
      available: true,
      versionNote: `Détecté localement (${version})`,
    };
  } catch {
    cachedClaudeCliProbe = {
      expiresAt: now + 60_000,
      available: false,
      versionNote:
        'Non détecté sur ce serveur (disponible quand vous lancez l’app sur votre PC avec `claude login`).',
    };
  }

  return {
    available: cachedClaudeCliProbe.available,
    versionNote: cachedClaudeCliProbe.versionNote,
  };
}

async function probeLocalOllama(force = false): Promise<{ available: boolean; models: string[] }> {
  const now = Date.now();
  if (!force && cachedOllamaProbe && cachedOllamaProbe.expiresAt > now) {
    return {
      available: cachedOllamaProbe.available,
      models: cachedOllamaProbe.models,
    };
  }

  const customUrl = process.env.CUSTOM_AI_BASE_URL?.trim();
  if (customUrl) {
    cachedOllamaProbe = { expiresAt: now + 30_000, available: true, models: [] };
    return { available: true, models: [] };
  }

  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(900),
    });
    if (res.ok) {
      const json = (await res.json()) as { models?: Array<{ name?: string }> };
      const models = Array.isArray(json.models)
        ? json.models.map((m) => String(m.name || '').trim()).filter(Boolean)
        : [];
      cachedOllamaProbe = { expiresAt: now + 30_000, available: true, models };
      return { available: true, models };
    }
  } catch {
    // Ollama non démarré localement
  }

  cachedOllamaProbe = { expiresAt: now + 30_000, available: false, models: [] };
  return { available: false, models: [] };
}

export async function getAiProvidersStatus(forceProbe = false): Promise<AiProvidersResponse> {
  const [claudeCli, ollama] = await Promise.all([
    probeClaudeCodeCli(forceProbe),
    probeLocalOllama(forceProbe),
  ]);

  const isCloud = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);

  const envMap: Record<string, string | undefined> = {
    gemini: process.env.GEMINI_API_KEY?.trim(),
    anthropic: process.env.ANTHROPIC_API_KEY?.trim(),
    openai: process.env.OPENAI_API_KEY?.trim(),
    openrouter: process.env.OPENROUTER_API_KEY?.trim(),
    mistral: process.env.MISTRAL_API_KEY?.trim(),
    groq: process.env.GROQ_API_KEY?.trim(),
    deepseek: process.env.DEEPSEEK_API_KEY?.trim(),
  };

  const providers: AiProviderStatus[] = AI_PROVIDER_CATALOG.map((def) => {
    if (def.id === 'claude-code') {
      return {
        id: def.id,
        available: claudeCli.available,
        reason: claudeCli.versionNote,
      };
    }

    if (def.id === 'openai-compatible') {
      const customEnvUrl = process.env.CUSTOM_AI_BASE_URL?.trim();
      if (customEnvUrl) {
        return {
          id: def.id,
          available: true,
          reason: `Endpoint serveur configuré (${customEnvUrl})`,
          detectedModels: ollama.models,
        };
      }
      if (ollama.available) {
        return {
          id: def.id,
          available: true,
          reason:
            ollama.models.length > 0
              ? `Ollama local actif (${ollama.models.length} modèle(s) détecté(s))`
              : 'Ollama local actif sur 127.0.0.1:11434',
          detectedModels: ollama.models,
        };
      }
      return {
        id: def.id,
        available: false,
        reason:
          'Aucun serveur local détecté sur 127.0.0.1:11434 (lancez Ollama/LM Studio en local ou définissez CUSTOM_AI_BASE_URL).',
      };
    }

    const key = envMap[def.id];
    return {
      id: def.id,
      available: Boolean(key),
      reason: key
        ? `Variable ${def.envVarName} configurée côté serveur`
        : `${def.envVarName} non définie dans Settings > Secrets ou .env`,
    };
  });

  return {
    environment: isCloud ? 'cloud' : 'local',
    providers,
  };
}

function buildSchemaPromptInstruction(responseSchema: Record<string, any>): string {
  return (
    `\n\nRÈGLE DE FORMAT STRICT :\n` +
    `Réponds EXCLUSIVEMENT avec un objet JSON valide (aucun texte avant, aucun texte après, pas de blocs markdown) respectant exactement ce schéma JSON :\n` +
    JSON.stringify(responseSchema, null, 2)
  );
}

function normalizeCustomBaseUrl(raw?: string): string {
  const candidate = (raw || process.env.CUSTOM_AI_BASE_URL || 'http://127.0.0.1:11434/v1').trim();
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('URL du serveur IA local invalide (exemple attendu : http://127.0.0.1:11434/v1).');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Seuls les protocoles http:// et https:// sont autorisés pour le serveur IA.');
  }
  return candidate.replace(/\/+$/, '');
}

async function callGeminiStructured(params: {
  model: string;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, any>;
}): Promise<any> {
  const ai = getGeminiClient();
  const isDefaultHydrogen = params.model === 'gemini-4-hydrogen';
  const attempts = isDefaultHydrogen
    ? [
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
        { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
      ]
    : [{ model: params.model, thinkingLevel: ThinkingLevel.LOW }];

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          ...(attempt.model.startsWith('gemini-3') || attempt.model.startsWith('gemini-4')
            ? { thinkingConfig: { thinkingLevel: attempt.thinkingLevel } }
            : {}),
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema as any,
        },
      });
      return JSON.parse((response.text ?? '{}').trim());
    } catch (err) {
      lastError = err;
      if (!isTransientAiError(err) && i === 0 && attempts.length > 1) {
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (isTransientAiError(lastError)) {
    throw new Error(
      'Le service IA Gemini connaît un pic de charge ou de quota momentané (429/503). Réessayez dans quelques secondes.',
    );
  }
  throw new Error(
    lastError instanceof Error
      ? `Gemini indisponible : ${lastError.message.slice(0, 160)}`
      : 'Gemini indisponible.',
  );
}

async function callAnthropicMessagesApi(params: {
  model: string;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, any>;
}): Promise<any> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'Clé ANTHROPIC_API_KEY manquante côté serveur. Ajoutez-la dans Settings > Secrets ou .env (ou utilisez Claude Code CLI en local).',
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 2048,
      system: params.systemInstruction + buildSchemaPromptInstruction(params.responseSchema),
      messages: [{ role: 'user', content: params.contents }],
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const json = (await res.json()) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Anthropic HTTP ${res.status}`;
    throw new Error(`Anthropic API (${params.model}) : ${msg}`);
  }

  const text = Array.isArray(json?.content)
    ? json.content
        .filter((b: any) => b?.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
    : '';
  return extractJsonObjectFromText(text);
}

async function callClaudeCodeCli(params: {
  model: string;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, any>;
}): Promise<any> {
  const probe = await probeClaudeCodeCli(false);
  if (!probe.available) {
    throw new Error(
      'Claude Code CLI (`claude`) n’est pas détecté sur cet environnement. Pour utiliser votre abonnement Claude Pro/Max via Claude Code, lancez l’application en local sur votre PC après `claude login`.',
    );
  }

  const fullPrompt =
    `${params.systemInstruction}\n\n` +
    `${params.contents}` +
    buildSchemaPromptInstruction(params.responseSchema);

  const args = ['-p', '--output-format', 'json'];
  if (params.model.trim()) {
    args.push('--model', params.model.trim());
  }
  args.push(fullPrompt);

  try {
    const { stdout } = await execFileAsync('claude', args, {
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const trimmed = stdout.trim();
    try {
      const cliWrapper = JSON.parse(trimmed);
      if (cliWrapper && typeof cliWrapper.result === 'string') {
        return extractJsonObjectFromText(cliWrapper.result);
      }
      if (cliWrapper && typeof cliWrapper === 'object' && !('result' in cliWrapper)) {
        return cliWrapper;
      }
    } catch {
      // Fallback extraction directe si sortie texte
    }
    return extractJsonObjectFromText(trimmed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Erreur Claude Code CLI (${params.model}) : ${msg.slice(0, 180)}`);
  }
}

async function callOpenAiCompatibleChat(params: {
  provider: AiProviderId;
  model: string;
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, any>;
  customBaseUrl?: string;
}): Promise<any> {
  let endpointUrl = '';
  let apiKey = '';
  const extraHeaders: Record<string, string> = {};

  switch (params.provider) {
    case 'openai':
      apiKey = process.env.OPENAI_API_KEY?.trim() || '';
      if (!apiKey) {
        throw new Error('Clé OPENAI_API_KEY manquante dans Settings > Secrets ou .env.');
      }
      endpointUrl = 'https://api.openai.com/v1/chat/completions';
      break;
    case 'openrouter':
      apiKey = process.env.OPENROUTER_API_KEY?.trim() || '';
      if (!apiKey) {
        throw new Error('Clé OPENROUTER_API_KEY manquante dans Settings > Secrets ou .env.');
      }
      endpointUrl = 'https://openrouter.ai/api/v1/chat/completions';
      extraHeaders['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
      extraHeaders['X-Title'] = 'LoL AI Coach';
      break;
    case 'mistral':
      apiKey = process.env.MISTRAL_API_KEY?.trim() || '';
      if (!apiKey) {
        throw new Error('Clé MISTRAL_API_KEY manquante dans Settings > Secrets ou .env.');
      }
      endpointUrl = 'https://api.mistral.ai/v1/chat/completions';
      break;
    case 'groq':
      apiKey = process.env.GROQ_API_KEY?.trim() || '';
      if (!apiKey) {
        throw new Error('Clé GROQ_API_KEY manquante dans Settings > Secrets ou .env.');
      }
      endpointUrl = 'https://api.groq.com/openai/v1/chat/completions';
      break;
    case 'deepseek':
      apiKey = process.env.DEEPSEEK_API_KEY?.trim() || '';
      if (!apiKey) {
        throw new Error('Clé DEEPSEEK_API_KEY manquante dans Settings > Secrets ou .env.');
      }
      endpointUrl = 'https://api.deepseek.com/chat/completions';
      break;
    case 'openai-compatible': {
      const base = normalizeCustomBaseUrl(params.customBaseUrl);
      endpointUrl = `${base}/chat/completions`;
      apiKey = process.env.CUSTOM_AI_API_KEY?.trim() || '';
      break;
    }
    default:
      throw new Error(`Fournisseur non supporté : ${params.provider}`);
  }

  const isReasoningModel =
    params.model.startsWith('o1') ||
    params.model.startsWith('o3') ||
    params.model.startsWith('o4') ||
    params.model.includes('reasoner');

  const body: Record<string, any> = {
    model: params.model,
    messages: [
      {
        role: 'system',
        content: params.systemInstruction + buildSchemaPromptInstruction(params.responseSchema),
      },
      { role: 'user', content: params.contents },
    ],
  };

  if (!isReasoningModel) {
    body.temperature = 0.25;
  }
  if (
    params.provider === 'openai' ||
    params.provider === 'mistral' ||
    params.provider === 'groq' ||
    params.provider === 'deepseek'
  ) {
    body.response_format = { type: 'json_object' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const errMsg = json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new Error(`${getProviderDefinition(params.provider).shortName} (${params.model}) : ${errMsg}`);
  }

  const contentText = String(json?.choices?.[0]?.message?.content || '');
  return extractJsonObjectFromText(contentText);
}

function resolveAiSelection(input?: Partial<AiUserSelection> | null): AiUserSelection {
  const provider: AiProviderId =
    input?.provider && AI_PROVIDER_CATALOG.some((p) => p.id === input.provider)
      ? input.provider
      : 'gemini';
  const def = getProviderDefinition(provider);
  return {
    provider,
    model: input?.model?.trim() || def.defaultModel,
    customBaseUrl: input?.customBaseUrl?.trim() || def.defaultBaseUrl,
    fallbackToGemini: typeof input?.fallbackToGemini === 'boolean' ? input.fallbackToGemini : true,
  };
}

export async function generateStructuredWithSelectedProvider(params: {
  contents: string;
  systemInstruction: string;
  responseSchema: Record<string, any>;
  aiConfig?: Partial<AiUserSelection> | null;
}): Promise<any> {
  const selection = resolveAiSelection(params.aiConfig);
  const def = getProviderDefinition(selection.provider);

  const executeForProvider = async (provider: AiProviderId, model: string) => {
    if (provider === 'gemini') {
      return callGeminiStructured({
        model,
        contents: params.contents,
        systemInstruction: params.systemInstruction,
        responseSchema: params.responseSchema,
      });
    }
    if (provider === 'claude-code') {
      return callClaudeCodeCli({
        model,
        contents: params.contents,
        systemInstruction: params.systemInstruction,
        responseSchema: params.responseSchema,
      });
    }
    if (provider === 'anthropic') {
      return callAnthropicMessagesApi({
        model,
        contents: params.contents,
        systemInstruction: params.systemInstruction,
        responseSchema: params.responseSchema,
      });
    }
    return callOpenAiCompatibleChat({
      provider,
      model,
      contents: params.contents,
      systemInstruction: params.systemInstruction,
      responseSchema: params.responseSchema,
      customBaseUrl: selection.customBaseUrl,
    });
  };

  try {
    const data = await executeForProvider(selection.provider, selection.model);
    const meta: AiMetaInfo = {
      provider: selection.provider,
      providerLabel: def.shortName,
      model: selection.model,
      usedFallback: false,
    };
    return { ...data, _aiMeta: meta };
  } catch (primaryErr) {
    if (
      selection.provider !== 'gemini' &&
      selection.fallbackToGemini &&
      Boolean(process.env.GEMINI_API_KEY?.trim())
    ) {
      const fallbackData = await executeForProvider('gemini', 'gemini-4-hydrogen');
      const meta: AiMetaInfo = {
        provider: 'gemini',
        providerLabel: 'Gemini (Bascule auto)',
        model: 'gemini-4-hydrogen',
        usedFallback: true,
      };
      return { ...fallbackData, _aiMeta: meta };
    }
    throw primaryErr;
  }
}

export async function testAiProviderConnection(
  aiConfig?: Partial<AiUserSelection> | null,
): Promise<{
  ok: boolean;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  latencyMs: number;
  replyPreview: string;
}> {
  const selection = resolveAiSelection(aiConfig);
  const def = getProviderDefinition(selection.provider);
  const startedAt = Date.now();

  const noFallbackConfig: AiUserSelection = {
    ...selection,
    fallbackToGemini: false,
  };

  const result = await generateStructuredWithSelectedProvider({
    contents: 'Réponds brièvement en français pour confirmer que la connexion IA pour LoL AI Coach fonctionne.',
    systemInstruction: 'Assistant test de connectivité pour LoL AI Coach.',
    responseSchema: {
      type: 'OBJECT',
      required: ['status', 'message'],
      properties: {
        status: { type: 'STRING', description: 'OK' },
        message: { type: 'STRING', description: 'Courte confirmation en français.' },
      },
    },
    aiConfig: noFallbackConfig,
  });

  return {
    ok: true,
    provider: selection.provider,
    providerLabel: def.shortName,
    model: selection.model,
    latencyMs: Date.now() - startedAt,
    replyPreview: String(result?.message || result?.status || 'Connexion IA opérationnelle.'),
  };
}
