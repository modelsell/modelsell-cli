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
