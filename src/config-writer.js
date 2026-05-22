import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import TOML from '@iarna/toml';

export const DEFAULT_BASE_URL = 'https://www.modelsell.com';
export const DEFAULT_TARGETS = ['codex', 'claude', 'gemini', 'openclaw'];

const DEFAULT_MODELS = {
  codex: 'gpt-5.5',
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-3.1-pro-preview',
  openclaw: 'gpt-5.5'
};

const OPENCLAW_MODEL_CONFIG = {
  providers: {
    modelsell: {
      api: 'openai-responses',
      baseUrl: '${OPENAI_BASE_URL}',
      apiKey: '${OPENAI_API_KEY}',
      models: [
        { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 400000, maxTokens: 128000 },
        { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 400000, maxTokens: 128000 },
        { id: 'MiniMax/MiniMax-M2.7', name: 'MiniMax M2.7', contextWindow: 400000, maxTokens: 128000 },
        { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus', contextWindow: 400000, maxTokens: 128000 },
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', contextWindow: 400000, maxTokens: 128000 },
        { id: 'glm-5.1', name: 'GLM-5.1', contextWindow: 400000, maxTokens: 128000 }
      ]
    },
    'modelsell-anthropic': {
      api: 'anthropic-messages',
      baseUrl: '${ANTHROPIC_BASE_URL}',
      apiKey: '${ANTHROPIC_API_KEY}',
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, maxTokens: 128000 },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200000, maxTokens: 128000 }
      ]
    }
  },
  primaryModel: 'modelsell/gpt-5.5',
  fallbackModels: [
    'modelsell/kimi-k2.5',
    'modelsell/qwen3.6-plus',
    'modelsell/gemini-3.1-pro-preview',
    'modelsell/glm-5.1',
    'modelsell-anthropic/claude-sonnet-4-6',
    'modelsell-anthropic/claude-opus-4-6'
  ]
};

export function getDefaultModel(target) {
  return DEFAULT_MODELS[target] ?? 'gpt-5.5';
}

export async function applyConfiguration(options) {
  const normalized = normalizeOptions(options);
  const results = [];

  for (const target of normalized.targets) {
    if (target === 'codex') {
      results.push(await configureCodex(normalized));
    } else if (target === 'claude') {
      results.push(await configureClaude(normalized));
    } else if (target === 'gemini') {
      results.push(await configureGemini(normalized));
    } else if (target === 'openclaw') {
      results.push(await configureOpenClaw(normalized));
    } else {
      throw new Error(`Unsupported target: ${target}`);
    }
  }

  return results;
}

function normalizeOptions(options) {
  if (!options?.apiKey?.trim()) {
    throw new Error('API key is required.');
  }

  const homeDir = options.homeDir ?? resolveHomeDir(process.env);
  if (!homeDir) {
    throw new Error('Home directory could not be detected. Set HOME, USERPROFILE, or HOMEDRIVE/HOMEPATH.');
  }

  const targets = options.targets?.length ? options.targets : DEFAULT_TARGETS;
  return {
    homeDir,
    targets,
    apiKey: options.apiKey.trim(),
    baseUrl: stripTrailingSlash(options.baseUrl || DEFAULT_BASE_URL),
    model: options.model?.trim() || undefined,
    models: options.models ?? {}
  };
}

async function configureCodex(options) {
  const filePath = path.join(options.homeDir, '.codex', 'config.toml');
  const authPath = path.join(options.homeDir, '.codex', 'auth.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);
  await backupIfExists(authPath);

  const current = await readToml(filePath);
  const model = pickModel(options, 'codex');
  const provider = {
    name: 'modelsell',
    base_url: ensureV1Url(options.baseUrl),
    wire_api: 'responses'
  };

  current.model = model;
  current.model_provider = 'modelsell';
  current.model_providers = {
    ...(isPlainObject(current.model_providers) ? current.model_providers : {}),
    modelsell: provider
  };

  await writeFile(filePath, TOML.stringify(current), { mode: 0o600 });
  await writeJson(authPath, {
    auth_mode: 'apikey',
    OPENAI_API_KEY: options.apiKey
  });

  return { target: 'codex', files: [filePath, authPath] };
}

async function configureClaude(options) {
  const filePath = path.join(options.homeDir, '.claude', 'settings.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  const settings = await readJson(filePath);
  const model = pickModel(options, 'claude');
  settings.env = {
    ...(isPlainObject(settings.env) ? settings.env : {}),
    ANTHROPIC_AUTH_TOKEN: options.apiKey,
    ANTHROPIC_BASE_URL: options.baseUrl,
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model
  };

  await writeJson(filePath, settings);
  return { target: 'claude', files: [filePath] };
}

async function configureGemini(options) {
  const settingsPath = path.join(options.homeDir, '.gemini', 'settings.json');
  const envPath = path.join(options.homeDir, '.gemini', '.env');
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await backupIfExists(settingsPath);
  await backupIfExists(envPath);

  const model = pickModel(options, 'gemini');
  const settings = await readJson(settingsPath);
  settings.security = mergePlain(settings.security, {
    auth: mergePlain(settings.security?.auth, { selectedType: 'gemini-api-key' })
  });
  settings.model = mergePlain(settings.model, { name: model });

  await writeJson(settingsPath, settings);
  await writeEnvironmentFile(envPath, {
    GEMINI_API_KEY: options.apiKey,
    GEMINI_MODEL: model,
    GOOGLE_GEMINI_BASE_URL: options.baseUrl
  });

  return { target: 'gemini', files: [settingsPath, envPath] };
}

async function configureOpenClaw(options) {
  const filePath = path.join(options.homeDir, '.openclaw', 'openclaw.json');
  const envPath = path.join(options.homeDir, '.openclaw', '.env');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);
  await backupIfExists(envPath);

  const config = await readJson(filePath);
  const agentModels = openClawAgentModelAliases(OPENCLAW_MODEL_CONFIG.providers);

  config.agents = mergePlain(config.agents, {
    defaults: mergePlain(config.agents?.defaults, {
      model: mergePlain(config.agents?.defaults?.model, {
        primary: OPENCLAW_MODEL_CONFIG.primaryModel,
        fallbacks: [...OPENCLAW_MODEL_CONFIG.fallbackModels]
      }),
      models: mergePlain(config.agents?.defaults?.models, agentModels)
    })
  });
  config.models = mergePlain(config.models, {
    providers: mergePlain(config.models?.providers, cloneJson(OPENCLAW_MODEL_CONFIG.providers))
  });

  await writeJson(filePath, config);
  await writeEnvironmentFile(envPath, {
    OPENAI_BASE_URL: ensureV1Url(options.baseUrl),
    OPENAI_API_KEY: options.apiKey,
    ANTHROPIC_BASE_URL: options.baseUrl,
    ANTHROPIC_API_KEY: options.apiKey
  });
  return { target: 'openclaw', files: [filePath, envPath] };
}

function openClawAgentModelAliases(providers) {
  const aliases = {};
  for (const [providerName, provider] of Object.entries(providers)) {
    for (const model of provider.models) {
      aliases[`${providerName}/${model.id}`] = { alias: model.name };
    }
  }
  return aliases;
}

function pickModel(options, target) {
  return options.models[target] || options.model || getDefaultModel(target);
}

async function readToml(filePath) {
  try {
    const text = stripUtf8Bom(await readFile(filePath, 'utf8'));
    return text.trim() ? TOML.parse(text) : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Failed to read TOML config ${filePath}: ${error.message}`);
  }
}

async function readJson(filePath) {
  try {
    const text = stripUtf8Bom(await readFile(filePath, 'utf8'));
    return text.trim() ? JSON.parse(text) : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Failed to read JSON config ${filePath}: ${error.message}`);
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function writeEnvironmentFile(filePath, values) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const existing = await readEnv(filePath);
  const merged = { ...existing, ...values };
  const lines = Object.entries(merged).map(([key, value]) => `${key}=${shellEscapeEnv(value)}`);
  await writeFile(filePath, `${lines.join('\n')}\n`, { mode: 0o600 });
}

async function readEnv(filePath) {
  try {
    const text = stripUtf8Bom(await readFile(filePath, 'utf8'));
    const values = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const index = trimmed.indexOf('=');
      values[trimmed.slice(0, index)] = unquoteEnv(trimmed.slice(index + 1));
    }
    return values;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function backupIfExists(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  const backupPath = `${filePath}.bak.${timestamp()}`;
  await copyFile(filePath, backupPath);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function stripUtf8Bom(value) {
  return value.charCodeAt(0) === 0xFEFF ? value.slice(1) : value;
}

function ensureV1Url(value) {
  const stripped = stripTrailingSlash(value);
  return stripped.endsWith('/v1') ? stripped : `${stripped}/v1`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergePlain(left, right) {
  return { ...(isPlainObject(left) ? left : {}), ...right };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveHomeDir(env) {
  if (env.HOME) return env.HOME;
  if (env.USERPROFILE) return env.USERPROFILE;
  if (env.HOMEDRIVE && env.HOMEPATH !== undefined) return `${env.HOMEDRIVE}${env.HOMEPATH}`;
  return undefined;
}

function shellEscapeEnv(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function unquoteEnv(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
