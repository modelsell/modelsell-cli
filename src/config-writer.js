import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import TOML from '@iarna/toml';

export const DEFAULT_BASE_URL = 'https://www.modelsell.com';
export const DEFAULT_TARGETS = ['codex', 'claude', 'gemini'];

const DEFAULT_MODELS = {
  codex: 'gpt-5.5',
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-3.1-pro-preview'
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

  const targets = options.targets?.length ? options.targets : DEFAULT_TARGETS;
  return {
    homeDir: options.homeDir ?? process.env.HOME,
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

function pickModel(options, target) {
  return options.models[target] || options.model || getDefaultModel(target);
}

async function readToml(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return text.trim() ? TOML.parse(text) : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Failed to read TOML config ${filePath}: ${error.message}`);
  }
}

async function readJson(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
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
    const text = await readFile(filePath, 'utf8');
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
