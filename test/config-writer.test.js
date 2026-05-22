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

  await applyConfiguration({
    homeDir: home,
    targets: ['codex'],
    apiKey: 'sk-test',
    baseUrl: 'https://www.modelsell.com',
    model: 'gpt-5.5'
  });

  const parsed = TOML.parse(await readFile(path.join(codexDir, 'config.toml'), 'utf8'));
  const auth = JSON.parse(await readFile(path.join(codexDir, 'auth.json'), 'utf8'));
  assert.equal(parsed.model, 'gpt-5.5');
  assert.equal(parsed.model_provider, 'modelsell');
  assert.equal(parsed.disable_response_storage, true);
  assert.equal(parsed.model_providers.modelsell.name, 'modelsell');
  assert.equal(parsed.model_providers.modelsell.base_url, 'https://www.modelsell.com/v1');
  assert.equal(parsed.model_providers.modelsell.wire_api, 'responses');
  assert.equal(parsed.model_providers.modelsell.env_key, undefined);
  assert.equal(parsed.model_providers.modelsell.requires_openai_auth, undefined);
  assert.deepEqual(auth, {
    auth_mode: 'apikey',
    OPENAI_API_KEY: 'sk-test'
  });
});

test('writes Claude Code settings env without removing unrelated settings', async () => {
  const home = await tempHome();
  const claudeDir = path.join(home, '.claude');
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({ theme: 'dark', env: { EXISTING: '1' } }, null, 2),
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
  assert.equal(settings.env.ANTHROPIC_MODEL, 'claude-sonnet-4-6');
  assert.equal(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-sonnet-4-6');
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
  assert.equal(config.agents.defaults.model.primary, 'modelsell/gpt-5.5');
  assert.deepEqual(config.agents.defaults.model.fallbacks, [
    'modelsell/kimi-k2.5',
    'modelsell/qwen3.6-plus',
    'modelsell/gemini-3.1-pro-preview',
    'modelsell/glm-5.1',
    'modelsell-anthropic/claude-sonnet-4-6',
    'modelsell-anthropic/claude-opus-4-6'
  ]);
  assert.deepEqual(config.agents.defaults.models['openai/gpt-4.1'], { alias: 'GPT 4.1' });
  assert.deepEqual(config.agents.defaults.models['modelsell/gpt-5.5'], { alias: 'GPT-5.5' });
  assert.deepEqual(config.agents.defaults.models['modelsell-anthropic/claude-opus-4-6'], { alias: 'Claude Opus 4.6' });
  assert.equal(config.models.providers.openai.apiKey, 'sk-old');
  assert.deepEqual(config.models.providers.modelsell, {
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
  });
  assert.deepEqual(config.models.providers['modelsell-anthropic'], {
    api: 'anthropic-messages',
    baseUrl: '${ANTHROPIC_BASE_URL}',
    apiKey: '${ANTHROPIC_API_KEY}',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, maxTokens: 128000 },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200000, maxTokens: 128000 }
    ]
  });
  assert.match(env, /^OPENAI_BASE_URL=https:\/\/www\.modelsell\.com\/v1$/m);
  assert.match(env, /^OPENAI_API_KEY=sk-openclaw$/m);
  assert.match(env, /^ANTHROPIC_BASE_URL=https:\/\/www\.modelsell\.com$/m);
  assert.match(env, /^ANTHROPIC_API_KEY=sk-openclaw$/m);
});
