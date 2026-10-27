import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import TOML from '@iarna/toml';
import { recommendModels, routeOf } from './agent-models.js';
import { configDir, saveJSON } from './api/config.js';

export const DEFAULT_BASE_URL = 'https://www.modelsell.com';
export const DEFAULT_TARGETS = ['codex', 'claude', 'gemini', 'openclaw', 'opencode', 'qwen', 'crush', 'droid', 'kimi', 'workbuddy', 'codebuddy'];

export function getDefaultModel(target, recommendations = recommendModels()) {
  return { claude: recommendations.claude, gemini: recommendations.gemini, qwen: recommendations.qwen, kimi: recommendations.kimi }[target] ?? recommendations.codex;
}

export async function applyConfiguration(options) {
  const normalized = normalizeOptions(options);
  const results = [];
  const writers = {
    codex: configureCodex, claude: configureClaude, gemini: configureGemini, openclaw: configureOpenClaw,
    opencode: configureOpenCode, qwen: configureQwen, crush: configureCrush, droid: configureDroid, kimi: configureKimi,
    workbuddy: options => configureBuddy(options, 'workbuddy'), codebuddy: options => configureBuddy(options, 'codebuddy')
  };

  for (const target of normalized.targets) {
    if (!writers[target]) throw new Error(`Unsupported target: ${target}`);
    results.push(await writers[target](normalized));
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
    models: options.models ?? {},
    recommendations: options.recommendations ?? recommendModels(),
    authCommand: options.authCommand ?? defaultAuthCommand(),
    configDir: options.configDir ?? configDir({ ...(options.env ?? {}), HOME: homeDir, USERPROFILE: homeDir }),
    xdgConfigHome: options.env?.XDG_CONFIG_HOME || path.join(homeDir, '.config')
  };
}

// Codex sends no credential for a custom provider unless env_key, a bearer token or an auth
// command is configured; auth.json is only used by OpenAI-authenticated providers. An auth
// command keeps the key out of config.toml, works for the desktop app, and leaves a
// ChatGPT login in auth.json untouched.
function defaultAuthCommand() {
  if (process.pkg) return { command: process.execPath, args: [] };
  const script = process.argv[1] && path.resolve(process.argv[1]);
  return script && /modelsell(\.js)?$/.test(script)
    ? { command: process.execPath, args: [script] }
    : { command: 'modelsell', args: [] };
}

async function configureCodex(options) {
  const filePath = path.join(options.homeDir, '.codex', 'config.toml');
  const credentialsPath = path.join(options.configDir, 'credentials.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  const current = await readToml(filePath);
  const model = pickModel(options, 'codex');
  const provider = {
    name: 'ModelSell',
    base_url: ensureV1Url(options.baseUrl),
    wire_api: 'responses',
    auth: {
      command: options.authCommand.command,
      args: [...options.authCommand.args, 'auth', 'token', '--base-url', options.baseUrl],
      timeout_ms: 10000,
      refresh_interval_ms: 0
    }
  };

  current.model = model;
  current.model_provider = 'modelsell';
  current.model_providers = {
    ...(isPlainObject(current.model_providers) ? current.model_providers : {}),
    modelsell: provider
  };

  await writeFile(filePath, TOML.stringify(current), { mode: 0o600 });
  await saveJSON(credentialsPath, { baseUrl: options.baseUrl, apiKey: options.apiKey });

  return { target: 'codex', files: [filePath, credentialsPath] };
}

async function configureClaude(options) {
  const filePath = path.join(options.homeDir, '.claude', 'settings.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  const settings = await readJson(filePath);
  const model = pickModel(options, 'claude');
  const families = options.recommendations.claudeFamilies;
  const env = { ...(isPlainObject(settings.env) ? settings.env : {}) };
  // Earlier versions pinned ANTHROPIC_MODEL, which overrides /model on every launch.
  if (env.ANTHROPIC_MODEL && env.ANTHROPIC_MODEL === env.ANTHROPIC_DEFAULT_SONNET_MODEL) delete env.ANTHROPIC_MODEL;
  // The model setting works on every Claude Code version and /model can still change it.
  settings.model = model;
  settings.env = {
    ...env,
    ANTHROPIC_AUTH_TOKEN: options.apiKey,
    ANTHROPIC_BASE_URL: options.baseUrl,
    ANTHROPIC_DEFAULT_SONNET_MODEL: families.sonnet,
    ANTHROPIC_DEFAULT_OPUS_MODEL: families.opus,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: families.haiku,
    ANTHROPIC_DEFAULT_FABLE_MODEL: families.fable,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1'
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
    auth: mergePlain(settings.security?.auth, {
      selectedType: 'gemini-api-key',
      enforcedType: 'gemini-api-key'
    })
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

// Only GPT models with Responses support and Claude models with Messages support use those
// adapters; every other model is served through Chat Completions.
function openClawProviders(recommendations) {
  const entry = m => ({
    id: m.id,
    name: m.name || m.id,
    input: m.input?.length ? m.input : ['text'],
    ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
    ...(m.maxTokens ? { maxTokens: m.maxTokens } : {})
  });
  const models = route => recommendations.textModels.filter(m => routeOf(m) === route).map(entry);
  return {
    modelsell: { api: 'openai-completions', baseUrl: '${MODELSELL_OPENAI_BASE_URL}', apiKey: '${MODELSELL_API_KEY}', models: models('chat') },
    'modelsell-responses': { api: 'openai-responses', baseUrl: '${MODELSELL_OPENAI_BASE_URL}', apiKey: '${MODELSELL_API_KEY}', models: models('responses') },
    'modelsell-anthropic': { api: 'anthropic-messages', baseUrl: '${MODELSELL_ANTHROPIC_BASE_URL}', apiKey: '${MODELSELL_API_KEY}', models: models('anthropic') }
  };
}

function providerRef(providers, id) {
  const name = Object.keys(providers).find(key => providers[key].models.some(m => m.id === id));
  return name && `${name}/${id}`;
}

async function configureOpenClaw(options) {
  const filePath = path.join(options.homeDir, '.openclaw', 'openclaw.json');
  const envPath = path.join(options.homeDir, '.openclaw', '.env');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);
  await backupIfExists(envPath);

  const config = await readJson(filePath);
  const providers = openClawProviders(options.recommendations);
  const primaryId = options.models.openclaw || options.model || options.recommendations.codex;
  const primary = providerRef(providers, primaryId) || `modelsell/${primaryId}`;
  const fallbacks = [options.recommendations.claudeFamilies.sonnet, options.recommendations.gemini, ...options.recommendations.textModels.map(m => m.id)]
    .map(id => providerRef(providers, id)).filter(ref => ref && ref !== primary);

  config.agents = mergePlain(config.agents, {
    defaults: mergePlain(config.agents?.defaults, {
      model: mergePlain(config.agents?.defaults?.model, {
        primary,
        fallbacks: [...new Set(fallbacks)].slice(0, 6)
      }),
      models: mergePlain(config.agents?.defaults?.models, openClawAgentModelAliases(providers))
    })
  });
  config.models = mergePlain(config.models, {
    providers: mergePlain(config.models?.providers, providers)
  });

  await writeJson(filePath, config);
  await writeEnvironmentFile(envPath, {
    MODELSELL_OPENAI_BASE_URL: ensureV1Url(options.baseUrl),
    MODELSELL_ANTHROPIC_BASE_URL: options.baseUrl,
    MODELSELL_API_KEY: options.apiKey
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

async function configureOpenCode(options) {
  const dir = path.join(options.homeDir, '.config', 'opencode');
  const jsonc = path.join(dir, 'opencode.jsonc');
  let filePath = path.join(dir, 'opencode.json');
  try { await access(filePath); } catch { try { await access(jsonc); filePath = jsonc; } catch { /* create opencode.json */ } }
  await mkdir(dir, { recursive: true });
  await backupIfExists(filePath);

  const config = await readJson(filePath, { jsonc: true });
  const model = options.models.opencode || options.model || options.recommendations.codex;
  const models = Object.fromEntries(options.recommendations.textModels.map(m => [m.id, {
    name: m.name || m.id,
    ...(m.contextWindow || m.maxTokens ? { limit: { context: m.contextWindow || 200000, output: m.maxTokens || 32000 } } : {})
  }]));
  if (!models[model]) models[model] = { name: model };

  config.$schema ??= 'https://opencode.ai/config.json';
  config.model = `modelsell/${model}`;
  config.provider = mergePlain(config.provider, {
    modelsell: {
      npm: '@ai-sdk/openai-compatible',
      name: 'ModelSell',
      options: { baseURL: ensureV1Url(options.baseUrl), apiKey: options.apiKey },
      models
    }
  });

  await writeJson(filePath, config);
  return { target: 'opencode', files: [filePath] };
}

// The recommended text models plus the selected default, so the default is always selectable.
function agentModels(options, model) {
  const models = [...options.recommendations.textModels];
  if (!models.some(m => m.id === model)) models.push({ id: model, name: model, endpoints: ['openai'] });
  return models;
}

const isModelSellUrl = (url, options) => typeof url === 'string' && stripTrailingSlash(url).replace(/\/v1$/, '') === options.baseUrl;
const authCommandLine = options => [options.authCommand.command, ...options.authCommand.args, 'auth', 'token', '--base-url', options.baseUrl].map(shellQuote).join(' ');

async function configureQwen(options) {
  const filePath = path.join(options.homeDir, '.qwen', 'settings.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  const settings = await readJson(filePath);
  const model = pickModel(options, 'qwen');
  const providers = isPlainObject(settings.modelProviders) ? settings.modelProviders : {};
  // Replace only ModelSell routes; other providers in the shared buckets stay as they are.
  const keep = id => (Array.isArray(providers[id]) ? providers[id] : []).filter(m => !isModelSellUrl(m?.baseUrl, options));
  const entry = (m, baseUrl) => ({
    id: m.id,
    name: `${m.name || m.id} (ModelSell)`,
    baseUrl,
    envKey: 'MODELSELL_API_KEY',
    ...(routeOf(m) === 'responses' ? { wireApi: 'responses' } : {}),
    ...(m.input?.includes('image') ? { capabilities: { vision: true } } : {}),
    ...(m.contextWindow ? { generationConfig: { contextWindowSize: m.contextWindow } } : {})
  });
  const models = agentModels(options, model);
  settings.modelProviders = {
    ...providers,
    openai: [...keep('openai'), ...models.filter(m => routeOf(m) !== 'anthropic').map(m => entry(m, ensureV1Url(options.baseUrl)))],
    // The Anthropic SDK appends /v1/messages itself, so this route takes the bare origin.
    anthropic: [...keep('anthropic'), ...models.filter(m => routeOf(m) === 'anthropic').map(m => entry(m, options.baseUrl))]
  };
  settings.env = { ...(isPlainObject(settings.env) ? settings.env : {}), MODELSELL_API_KEY: options.apiKey };
  const selected = models.find(m => m.id === model);
  settings.security = mergePlain(settings.security, {
    auth: mergePlain(settings.security?.auth, { selectedType: selected && routeOf(selected) === 'anthropic' ? 'anthropic' : 'openai' })
  });
  settings.model = mergePlain(settings.model, { name: model });

  await writeJson(filePath, settings);
  return { target: 'qwen', files: [filePath] };
}

const CRUSH_BEGIN = '# >>> modelsell (managed by modelsell configure; edits inside are replaced) >>>';
const CRUSH_END = '# <<< modelsell <<<';

async function configureCrush(options) {
  const filePath = path.join(options.xdgConfigHome, 'crush', 'crushrc');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  const model = pickModel(options, 'crush');
  const small = options.recommendations.claudeFamilies.haiku;
  const models = agentModels(options, model);
  const flags = m => [
    '--name', `${m.name || m.id} (ModelSell)`,
    ...(m.contextWindow ? ['--context-window', String(m.contextWindow)] : []),
    ...(m.maxTokens ? ['--default-max-tokens', String(Math.min(m.maxTokens, 64000))] : []),
    ...(m.input?.includes('image') ? ['--supports-images', 'true'] : [])
  ].map(shellQuote).join(' ');
  // Every ModelSell text model speaks Chat Completions; the key is read through the
  // modelsell credential helper so it never lands in crushrc.
  const block = [
    CRUSH_BEGIN,
    `provider add modelsell --name ModelSell --type openai-compat --base-url ${shellQuote(ensureV1Url(options.baseUrl))} --api-key "$(${authCommandLine(options)})"`,
    ...models.map(m => `model add ${shellQuote(`modelsell/${m.id}`)} ${flags(m)}`),
    `model large ${shellQuote(`modelsell/${model}`)}`,
    ...(models.some(m => m.id === small) ? [`model small ${shellQuote(`modelsell/${small}`)}`] : []),
    CRUSH_END
  ].join('\n');

  let current = '';
  try { current = await readFile(filePath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const start = current.indexOf(CRUSH_BEGIN), end = current.indexOf(CRUSH_END);
  const next = start >= 0 && end > start
    ? current.slice(0, start) + block + current.slice(end + CRUSH_END.length)
    : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${current ? '\n' : ''}${block}\n`;
  await writeFile(filePath, next, { mode: 0o600 });
  await saveJSON(path.join(options.configDir, 'credentials.json'), { baseUrl: options.baseUrl, apiKey: options.apiKey });
  return { target: 'crush', files: [filePath, path.join(options.configDir, 'credentials.json')] };
}

async function configureDroid(options) {
  const filePath = path.join(options.homeDir, '.factory', 'settings.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  const settings = await readJson(filePath);
  const model = pickModel(options, 'droid');
  const helper = authCommandLine(options);
  const entry = m => {
    const route = routeOf(m);
    return {
      model: m.id,
      displayName: `${m.name || m.id} (ModelSell)`,
      baseUrl: route === 'anthropic' ? options.baseUrl : ensureV1Url(options.baseUrl),
      apiKeyHelper: helper,
      provider: { anthropic: 'anthropic', responses: 'openai', chat: 'generic-chat-completion-api' }[route],
      ...(route === 'anthropic' ? { authMode: 'bearer' } : {}),
      ...(m.maxTokens ? { maxOutputTokens: m.maxTokens } : {}),
      ...(m.contextWindow ? { maxContextLimit: m.contextWindow - (m.maxTokens || 0) } : {}),
      ...(route === 'chat' && m.input?.includes('image') ? { noImageSupport: false } : {})
    };
  };
  const others = (Array.isArray(settings.customModels) ? settings.customModels : []).filter(m => !isModelSellUrl(m?.baseUrl, options));
  // The selected default goes first so it heads the Custom Models list in /model.
  const models = agentModels(options, model).sort((a, b) => (b.id === model) - (a.id === model));
  settings.customModels = [...others, ...models.map(entry)];

  await writeJson(filePath, settings);
  await saveJSON(path.join(options.configDir, 'credentials.json'), { baseUrl: options.baseUrl, apiKey: options.apiKey });
  return { target: 'droid', files: [filePath, path.join(options.configDir, 'credentials.json')] };
}

async function configureKimi(options) {
  const filePath = path.join(options.homeDir, '.kimi', 'config.toml');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  const config = await readToml(filePath);
  const model = pickModel(options, 'kimi');
  const providers = {
    chat: ['modelsell', 'openai_legacy', ensureV1Url(options.baseUrl)],
    responses: ['modelsell-responses', 'openai_responses', ensureV1Url(options.baseUrl)],
    anthropic: ['modelsell-anthropic', 'anthropic', options.baseUrl]
  };
  const models = isPlainObject(config.models) ? config.models : {};
  for (const [key, value] of Object.entries(models)) if (/^modelsell(-|$)/.test(value?.provider || '')) delete models[key];
  for (const m of agentModels(options, model)) {
    models[`modelsell/${m.id}`] = {
      provider: providers[routeOf(m)][0],
      model: m.id,
      ...(m.contextWindow ? { max_context_size: m.contextWindow } : {}),
      ...(m.input?.includes('image') ? { capabilities: ['image_in'] } : {})
    };
  }
  config.providers = isPlainObject(config.providers) ? config.providers : {};
  for (const [name, type, baseUrl] of Object.values(providers)) config.providers[name] = { type, base_url: baseUrl, api_key: options.apiKey };
  config.models = models;
  config.default_model = `modelsell/${model}`;

  await writeFile(filePath, TOML.stringify(config), { mode: 0o600 });
  return { target: 'kimi', files: [filePath] };
}

// WorkBuddy and CodeBuddy read custom models from models.json in their data directory
// (WORKBUDDY_CONFIG_DIR / CODEBUDDY_CONFIG_DIR override it) and reload it on change. WorkBuddy's
// UI saves a bare array; CodeBuddy's CLI only reads the { models, availableModels } form.
async function configureBuddy(options, target) {
  const envDir = target === 'workbuddy' ? options.env?.WORKBUDDY_CONFIG_DIR : options.env?.CODEBUDDY_CONFIG_DIR;
  const filePath = path.join(envDir?.trim() || path.join(options.homeDir, `.${target}`), 'models.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  await backupIfExists(filePath);

  let current;
  try { current = JSON.parse(stripUtf8Bom(await readFile(filePath, 'utf8')) || 'null'); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Failed to read JSON config ${filePath}: ${error.message}`); }
  const asArray = Array.isArray(current) || (current == null && target === 'workbuddy');
  const existing = Array.isArray(current) ? current : Array.isArray(current?.models) ? current.models : [];

  const model = pickModel(options, target);
  const url = `${ensureV1Url(options.baseUrl)}/chat/completions`;
  const models = agentModels(options, model).sort((a, b) => (b.id === model) - (a.id === model));
  const ids = new Set(models.map(m => m.id));
  // Keep the user's own entries, including ModelSell models this run does not manage.
  const others = existing.filter(m => !(ids.has(m?.id) && isModelSellUrl(String(m?.url || '').replace(/\/chat\/completions\/?$/, ''), options)));
  const entries = models.map(m => ({
    id: m.id,
    name: `${m.name || m.id} (ModelSell)`,
    vendor: 'Custom',
    url,
    apiKey: options.apiKey,
    supportsToolCall: true,
    supportsImages: Boolean(m.input?.includes('image')),
    useCustomProtocol: false,
    ...(m.contextWindow ? { maxInputTokens: m.contextWindow } : {}),
    ...(m.maxTokens ? { maxOutputTokens: m.maxTokens } : {})
  }));
  const list = [...entries, ...others];
  const next = asArray ? list : {
    ...(isPlainObject(current) ? current : {}),
    models: list,
    ...(Array.isArray(current?.availableModels) ? { availableModels: [...new Set([...entries.map(m => m.id), ...current.availableModels])] } : {})
  };

  await writeJson(filePath, next);
  return { target, files: [filePath] };
}

function pickModel(options, target) {
  return options.models[target] || options.model || getDefaultModel(target, options.recommendations);
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

async function readJson(filePath, { jsonc = false } = {}) {
  try {
    const text = stripUtf8Bom(await readFile(filePath, 'utf8'));
    return text.trim() ? JSON.parse(jsonc ? stripJsonComments(text) : text) : {};
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

// Drops // and /* */ comments and trailing commas outside strings (JSONC).
function stripJsonComments(text) {
  let out = '', inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') { inString = true; out += c; }
    else if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; }
    else if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2); if (i < 0) break; i++; }
    else if (c === ',' && /^\s*[}\]]/.test(text.slice(i + 1).replace(/^(\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/, m => m.replace(/\S/g, ' ')))) continue;
    else out += c;
  }
  return out;
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}
