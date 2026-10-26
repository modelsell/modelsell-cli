import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import TOML from '@iarna/toml';

import { applyConfiguration } from '../src/config-writer.js';

async function tempHome() {
  return mkdtemp(path.join(tmpdir(), 'modelsell-cli-'));
}

test('writes ModelSell config for Codex while preserving existing TOML settings', async () => {
  const home = await tempHome();
  const codexDir = path.join(home, '.codex');
  await mkdir(codexDir, { recursive: true });
  await writeFile(
    path.join(codexDir, 'config.toml'),
    [
      "model = 'old-model'",
      "model_provider = 'old-provider'",
      'disable_response_storage = true',
      '',
      '[projects]',
      "[projects.'/tmp/demo']",
      "trust_level = 'trusted'",
      ''
    ].join('\n'),
    'utf8'
  );

  await writeFile(path.join(codexDir, 'auth.json'), '{"auth_mode":"chatgpt"}', 'utf8');

  await applyConfiguration({
    homeDir: home,
    targets: ['codex'],
    apiKey: 'sk-test',
    baseUrl: 'https://www.modelsell.com',
    model: 'gpt-5.5',
    authCommand: { command: '/usr/local/bin/modelsell', args: [] }
  });

  const parsed = TOML.parse(await readFile(path.join(codexDir, 'config.toml'), 'utf8'));
  const auth = JSON.parse(await readFile(path.join(codexDir, 'auth.json'), 'utf8'));
  const credentials = JSON.parse(await readFile(path.join(home, '.config', 'modelsell', 'credentials.json'), 'utf8'));
  assert.equal(parsed.model, 'gpt-5.5');
  assert.equal(parsed.model_provider, 'modelsell');
  assert.equal(parsed.disable_response_storage, true);
  assert.equal(parsed.model_providers.modelsell.name, 'ModelSell');
  assert.equal(parsed.projects['/tmp/demo'].trust_level, 'trusted');
  assert.equal(parsed.model_providers.modelsell.base_url, 'https://www.modelsell.com/v1');
  assert.equal(parsed.model_providers.modelsell.wire_api, 'responses');
  assert.equal(parsed.model_providers.modelsell.env_key, undefined);
  assert.equal(parsed.model_providers.modelsell.requires_openai_auth, undefined);
  // Codex resolves the key through the auth command; the ChatGPT login is left alone.
  assert.deepEqual(parsed.model_providers.modelsell.auth, {
    command: '/usr/local/bin/modelsell',
    args: ['auth', 'token', '--base-url', 'https://www.modelsell.com'],
    timeout_ms: 10000,
    refresh_interval_ms: 0
  });
  assert.deepEqual(auth, { auth_mode: 'chatgpt' });
  assert.deepEqual(credentials, { baseUrl: 'https://www.modelsell.com', apiKey: 'sk-test' });
});

test('writes Claude Code settings env without removing unrelated settings', async () => {
  const home = await tempHome();
  const claudeDir = path.join(home, '.claude');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({ theme: 'dark', env: { EXISTING: '1', ANTHROPIC_MODEL: 'claude-sonnet-4-6', ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6' } }, null, 2),
    'utf8'
  );

  await applyConfiguration({
    homeDir: home,
    targets: ['claude'],
    apiKey: 'sk-claude',
    baseUrl: 'https://www.modelsell.com',
    model: 'claude-sonnet-4-6'
  });

  const settings = JSON.parse(await readFile(path.join(claudeDir, 'settings.json'), 'utf8'));
  assert.equal(settings.theme, 'dark');
  assert.equal(settings.env.EXISTING, '1');
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, 'sk-claude');
  assert.equal(settings.env.ANTHROPIC_BASE_URL, 'https://www.modelsell.com');
  // The old pinned ANTHROPIC_MODEL overrode /model on every launch.
  assert.equal(settings.env.ANTHROPIC_MODEL, undefined);
  assert.equal(settings.model, 'claude-sonnet-4-6');
  assert.equal(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-sonnet-5-5');
  assert.equal(settings.env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-5-5');
  assert.equal(settings.env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-5-5');
  assert.equal(settings.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY, '1');
});

test('writes Gemini settings and env file', async () => {
  const home = await tempHome();

  await applyConfiguration({
    homeDir: home,
    targets: ['gemini'],
    apiKey: 'sk-gemini',
    baseUrl: 'https://www.modelsell.com',
    model: 'gemini-3.1-pro-preview'
  });

  const settings = JSON.parse(await readFile(path.join(home, '.gemini', 'settings.json'), 'utf8'));
  const env = await readFile(path.join(home, '.gemini', '.env'), 'utf8');
  assert.equal(settings.security.auth.selectedType, 'gemini-api-key');
  assert.equal(settings.security.auth.enforcedType, 'gemini-api-key');
  assert.equal(settings.model.name, 'gemini-3.1-pro-preview');
  assert.match(env, /^GEMINI_API_KEY=sk-gemini$/m);
  assert.match(env, /^GEMINI_MODEL=gemini-3.1-pro-preview$/m);
  assert.match(env, /^GOOGLE_GEMINI_BASE_URL=https:\/\/www\.modelsell\.com$/m);
});

test('writes OpenClaw providers, model routing, and env file while preserving existing config', async () => {
  const home = await tempHome();
  const openclawDir = path.join(home, '.openclaw');
  await mkdir(openclawDir, { recursive: true });
  await writeFile(
    path.join(openclawDir, 'openclaw.json'),
    JSON.stringify({
      gateway: { mode: 'local' },
      agents: {
        defaults: {
          workspace: '/tmp/workspace',
          model: {
            primary: 'openai/gpt-4.1',
            fallbacks: ['openai/gpt-4.1-mini']
          },
          models: {
            'openai/gpt-4.1': { alias: 'GPT 4.1' }
          }
        }
      },
      models: {
        providers: {
          openai: {
            api: 'openai-responses',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-old',
            models: [{ id: 'gpt-4.1', name: 'GPT 4.1' }]
          }
        }
      }
    }, null, 2),
    'utf8'
  );

  await applyConfiguration({
    homeDir: home,
    targets: ['openclaw'],
    apiKey: 'sk-openclaw',
    baseUrl: 'https://www.modelsell.com',
    model: 'gpt-5.5'
  });

  const config = JSON.parse(await readFile(path.join(openclawDir, 'openclaw.json'), 'utf8'));
  const env = await readFile(path.join(openclawDir, '.env'), 'utf8');
  assert.equal(config.gateway.mode, 'local');
  assert.equal(config.agents.defaults.workspace, '/tmp/workspace');
  assert.equal(config.agents.defaults.model.primary, 'modelsell-responses/gpt-5.5');
  assert.deepEqual(config.agents.defaults.model.fallbacks.slice(0, 2), ['modelsell-anthropic/claude-sonnet-5-5', 'modelsell/gemini-3.1-pro-preview']);
  assert.deepEqual(config.agents.defaults.models['openai/gpt-4.1'], { alias: 'GPT 4.1' });
  assert.deepEqual(config.agents.defaults.models['modelsell-responses/gpt-5.5'], { alias: 'GPT-5.5' });
  assert.equal(config.models.providers.openai.apiKey, 'sk-old');
  // Only Responses-capable GPT models use openai-responses; other models use Chat Completions.
  assert.equal(config.models.providers.modelsell.api, 'openai-completions');
  assert.deepEqual(config.models.providers.modelsell.models.map(m => m.id), ['gemini-3.1-pro-preview', 'qwen3.7-plus', 'glm-5.1']);
  assert.deepEqual(config.models.providers.modelsell.models.at(-1), { id: 'glm-5.1', name: 'GLM-5.1', input: ['text'], contextWindow: 204800, maxTokens: 128000 });
  assert.equal(config.models.providers['modelsell-responses'].api, 'openai-responses');
  assert.deepEqual(config.models.providers['modelsell-anthropic'], {
    api: 'anthropic-messages',
    baseUrl: '${MODELSELL_ANTHROPIC_BASE_URL}',
    apiKey: '${MODELSELL_API_KEY}',
    models: [
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', input: ['text', 'image'], contextWindow: 1000000, maxTokens: 128000 },
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', input: ['text', 'image'], contextWindow: 1000000, maxTokens: 128000 }
    ]
  });
  assert.match(env, /^MODELSELL_OPENAI_BASE_URL=https:\/\/www\.modelsell\.com\/v1$/m);
  assert.match(env, /^MODELSELL_ANTHROPIC_BASE_URL=https:\/\/www\.modelsell\.com$/m);
  assert.match(env, /^MODELSELL_API_KEY=sk-openclaw$/m);
});

test('reads existing OpenClaw JSON config with UTF-8 BOM', async () => {
  const home = await tempHome();
  const openclawDir = path.join(home, '.openclaw');
  await mkdir(openclawDir, { recursive: true });
  await writeFile(
    path.join(openclawDir, 'openclaw.json'),
    `\uFEFF${JSON.stringify({ gateway: { mode: 'local' } }, null, 2)}`,
    'utf8'
  );

  await applyConfiguration({
    homeDir: home,
    targets: ['openclaw'],
    apiKey: 'sk-openclaw',
    baseUrl: 'https://www.modelsell.com',
    model: 'gpt-5.5'
  });

  const config = JSON.parse(await readFile(path.join(openclawDir, 'openclaw.json'), 'utf8'));
  assert.equal(config.gateway.mode, 'local');
  assert.equal(config.agents.defaults.model.primary, 'modelsell-responses/gpt-5.5');
});

test('reads and updates an existing OpenCode JSONC config', async () => {
  const home = await tempHome();
  const dir = path.join(home, '.config', 'opencode');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'opencode.jsonc'), '{\n  // theme\n  "theme": "a // b, }",\n  "plugin": ["x",],\n}\n', 'utf8');

  await applyConfiguration({ homeDir: home, targets: ['opencode'], apiKey: 'sk-oc', model: 'glm-5.1' });

  const config = JSON.parse(await readFile(path.join(dir, 'opencode.jsonc'), 'utf8'));
  assert.equal(config.theme, 'a // b, }');
  assert.deepEqual(config.plugin, ['x']);
  assert.equal(config.model, 'modelsell/glm-5.1');
  assert.equal(config.provider.modelsell.options.apiKey, 'sk-oc');
});

const recommendations = {
  codex: 'gpt-5.6-sol', claude: 'claude-sonnet-5-5', gemini: 'gemini-3.1-pro-preview', qwen: 'qwen3.7-plus', kimi: 'kimi-k3.1-pro',
  claudeFamilies: { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', haiku: 'claude-haiku-5-5', fable: 'claude-fable-5-1' },
  textModels: [
    { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol', endpoints: ['openai-response', 'openai'], contextWindow: 1050000, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'claude-sonnet-5-5', name: 'claude-sonnet-5-5', endpoints: ['anthropic', 'openai'], contextWindow: 1000000, maxTokens: 128000, input: ['text', 'image'] },
    { id: 'claude-haiku-5-5', name: 'claude-haiku-5-5', endpoints: ['anthropic', 'openai'], contextWindow: 1000000, maxTokens: 128000, input: ['text'] },
    { id: 'qwen3.7-plus', name: 'qwen3.7-plus', endpoints: ['openai'], contextWindow: 1000000, maxTokens: 131072, input: ['text'] },
    { id: 'kimi-k3.1-pro', name: 'kimi-k3.1-pro', endpoints: ['openai'], contextWindow: 1048576, input: ['text', 'image'] }
  ]
};
const authCommand = { command: '/opt/model sell/modelsell', args: [] };

test('writes Qwen Code model providers without touching other routes', async () => {
  const home = await tempHome();
  await mkdir(path.join(home, '.qwen'), { recursive: true });
  await writeFile(path.join(home, '.qwen', 'settings.json'), JSON.stringify({
    modelProviders: { openai: [{ id: 'mine', baseUrl: 'https://example.com/v1', envKey: 'MINE' }, { id: 'stale', baseUrl: 'https://www.modelsell.com/v1' }] },
    env: { MINE: 'x' }
  }), 'utf8');

  await applyConfiguration({ homeDir: home, targets: ['qwen'], apiKey: 'sk-qwen', recommendations });

  const settings = JSON.parse(await readFile(path.join(home, '.qwen', 'settings.json'), 'utf8'));
  assert.deepEqual(settings.modelProviders.openai.map(m => m.id), ['mine', 'gpt-5.6-sol', 'qwen3.7-plus', 'kimi-k3.1-pro']);
  assert.equal(settings.modelProviders.openai[1].wireApi, 'responses');
  assert.equal(settings.modelProviders.openai[2].wireApi, undefined);
  assert.deepEqual(settings.modelProviders.anthropic.map(m => [m.id, m.baseUrl]), [['claude-sonnet-5-5', 'https://www.modelsell.com'], ['claude-haiku-5-5', 'https://www.modelsell.com']]);
  assert.ok(settings.modelProviders.openai.slice(1).every(m => m.envKey === 'MODELSELL_API_KEY'));
  assert.deepEqual(settings.env, { MINE: 'x', MODELSELL_API_KEY: 'sk-qwen' });
  assert.equal(settings.security.auth.selectedType, 'openai');
  assert.equal(settings.model.name, 'qwen3.7-plus');
});

test('writes a replaceable Crush block that reads the key through modelsell', async () => {
  const home = await tempHome();
  const file = path.join(home, '.config', 'crush', 'crushrc');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'permissions allow view\n', 'utf8');

  for (let i = 0; i < 2; i++) await applyConfiguration({ homeDir: home, targets: ['crush'], apiKey: 'sk-crush', recommendations, authCommand });

  const rc = await readFile(file, 'utf8');
  assert.match(rc, /^permissions allow view\n/);
  assert.equal(rc.match(/>>> modelsell/g).length, 1);
  assert.match(rc, /provider add modelsell --name ModelSell --type openai-compat --base-url https:\/\/www\.modelsell\.com\/v1 --api-key "\$\('\/opt\/model sell\/modelsell' auth token --base-url https:\/\/www\.modelsell\.com\)"/);
  assert.match(rc, /model add modelsell\/qwen3\.7-plus --name 'qwen3\.7-plus \(ModelSell\)' --context-window 1000000 --default-max-tokens 64000/);
  assert.match(rc, /model large modelsell\/gpt-5\.6-sol/);
  assert.match(rc, /model small modelsell\/claude-haiku-5-5/);
  assert.doesNotMatch(rc, /sk-crush/);
});

test('writes Droid custom models with a key helper and per-protocol providers', async () => {
  const home = await tempHome();
  await mkdir(path.join(home, '.factory'), { recursive: true });
  await writeFile(path.join(home, '.factory', 'settings.json'), JSON.stringify({ customModels: [{ model: 'local', baseUrl: 'http://localhost:11434/v1', provider: 'generic-chat-completion-api' }] }), 'utf8');

  await applyConfiguration({ homeDir: home, targets: ['droid'], apiKey: 'sk-droid', recommendations, authCommand, model: 'qwen3.7-plus' });

  const settings = JSON.parse(await readFile(path.join(home, '.factory', 'settings.json'), 'utf8'));
  const byId = Object.fromEntries(settings.customModels.map(m => [m.model, m]));
  assert.deepEqual(settings.customModels.map(m => m.model), ['local', 'qwen3.7-plus', 'gpt-5.6-sol', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'kimi-k3.1-pro']);
  assert.equal(byId['gpt-5.6-sol'].provider, 'openai');
  assert.equal(byId['claude-sonnet-5-5'].provider, 'anthropic');
  assert.equal(byId['claude-sonnet-5-5'].baseUrl, 'https://www.modelsell.com');
  assert.equal(byId['claude-sonnet-5-5'].authMode, 'bearer');
  assert.equal(byId['qwen3.7-plus'].provider, 'generic-chat-completion-api');
  assert.equal(byId['kimi-k3.1-pro'].noImageSupport, false);
  assert.equal(byId['qwen3.7-plus'].apiKeyHelper, "'/opt/model sell/modelsell' auth token --base-url https://www.modelsell.com");
  assert.equal(byId['qwen3.7-plus'].maxContextLimit, 1000000 - 131072);
  assert.doesNotMatch(JSON.stringify(settings), /sk-droid/);
});

test('writes Kimi CLI providers and models and replaces earlier ModelSell models', async () => {
  const home = await tempHome();
  await mkdir(path.join(home, '.kimi'), { recursive: true });
  await writeFile(path.join(home, '.kimi', 'config.toml'), [
    'default_model = "kimi-for-coding"', 'theme = "light"', '',
    '[providers.kimi-for-coding]', 'type = "kimi"', 'base_url = "https://api.kimi.com/coding/v1"', 'api_key = "sk-own"', '',
    '[models.kimi-for-coding]', 'provider = "kimi-for-coding"', 'model = "kimi-for-coding"', '',
    '[models."modelsell/old"]', 'provider = "modelsell"', 'model = "old"', ''
  ].join('\n'), 'utf8');

  await applyConfiguration({ homeDir: home, targets: ['kimi'], apiKey: 'sk-kimi', recommendations });

  const config = TOML.parse(await readFile(path.join(home, '.kimi', 'config.toml'), 'utf8'));
  assert.equal(config.theme, 'light');
  assert.equal(config.default_model, 'modelsell/kimi-k3.1-pro');
  assert.equal(config.providers['kimi-for-coding'].api_key, 'sk-own');
  assert.deepEqual(config.providers.modelsell, { type: 'openai_legacy', base_url: 'https://www.modelsell.com/v1', api_key: 'sk-kimi' });
  assert.equal(config.providers['modelsell-responses'].type, 'openai_responses');
  assert.deepEqual(config.providers['modelsell-anthropic'], { type: 'anthropic', base_url: 'https://www.modelsell.com', api_key: 'sk-kimi' });
  assert.equal(config.models['modelsell/old'], undefined);
  assert.ok(config.models['kimi-for-coding']);
  assert.deepEqual(config.models['modelsell/kimi-k3.1-pro'], { provider: 'modelsell', model: 'kimi-k3.1-pro', max_context_size: 1048576, capabilities: ['image_in'] });
  assert.equal(config.models['modelsell/claude-sonnet-5-5'].provider, 'modelsell-anthropic');
  assert.equal(config.models['modelsell/gpt-5.6-sol'].provider, 'modelsell-responses');
});
