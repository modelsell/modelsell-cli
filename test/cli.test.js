import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { renderBanner, renderTargetMenu, run } from '../src/cli.js';

async function tempHome() {
  return mkdtemp(path.join(tmpdir(), 'modelsell-cli-'));
}

const catalog = {
  featured_model_names: ['gpt-6-sol', 'glm-5.1'],
  data: [
    { model_name: 'gpt-5.5', category: 'text', supported_endpoint_types: ['openai-response', 'openai'], context_length: 1050000, max_output_tokens: 128000 },
    { model_name: 'gpt-5.6-sol', category: 'text', supported_endpoint_types: ['openai-response', 'openai'], context_length: 1050000, max_output_tokens: 128000 },
    { model_name: 'gpt-6-sol', category: 'text', supported_endpoint_types: ['openai'], context_length: 1050000 },
    { model_name: 'claude-sonnet-5-5', category: 'text', supported_endpoint_types: ['anthropic', 'openai'] },
    { model_name: 'claude-opus-5-5', category: 'text', supported_endpoint_types: ['anthropic', 'openai'] },
    { model_name: 'claude-opus-4-8', category: 'text', supported_endpoint_types: ['anthropic', 'openai'] },
    { model_name: 'claude-haiku-5-5', category: 'text', supported_endpoint_types: ['anthropic', 'openai'] },
    { model_name: 'claude-fable-5-1', category: 'text', supported_endpoint_types: ['anthropic', 'openai'] },
    { model_name: 'gemini-3.1-pro-preview', category: 'text', supported_endpoint_types: ['gemini', 'openai'] },
    { model_name: 'gemini-3.8-flash', category: 'text', supported_endpoint_types: ['gemini', 'openai'] },
    { model_name: 'glm-5.1', category: 'text', supported_endpoint_types: ['openai'], context_length: 204800, max_output_tokens: 128000 }
  ]
};
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
// The key-scoped list hides gpt-5.6-sol, so recommendations must respect it.
const fetch = async url => url.pathname === '/api/pricing'
  ? json(catalog)
  : json({ data: catalog.data.filter(m => m.model_name !== 'gpt-5.6-sol').map(m => ({ id: m.model_name })) });
const offline = async () => { throw new Error('offline'); };

test('prints help without starting interactive prompts', async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line = '') => lines.push(String(line));
  try {
    const code = await run(['--help'], { HOME: await tempHome() });
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
  }
  assert.match(lines.join('\n'), /Usage:/);
});

test('prints Chinese help for Chinese locales', async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line = '') => lines.push(String(line));
  try {
    const code = await run(['--help'], { HOME: await tempHome(), LANG: 'zh_CN.UTF-8' });
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
  }
  assert.match(lines.join('\n'), /用法:/);
  assert.match(lines.join('\n'), /配置 Codex、Claude Code、Gemini CLI、OpenClaw、OpenCode、Qwen Code、Crush、Droid、Kimi CLI、WorkBuddy 和 CodeBuddy/);
});

test('configures selected target in non-interactive mode', async () => {
  const home = await tempHome();
  const originalLog = console.log;
  console.log = () => {};
  try {
    const code = await run(
      ['configure', '--target', 'gemini', '--api-key', 'sk-test', '--gemini-model', 'gemini-test', '--yes'],
      { HOME: home },
      { fetch }
    );
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
  }

  const env = await readFile(path.join(home, '.gemini', '.env'), 'utf8');
  assert.match(env, /^GEMINI_API_KEY=sk-test$/m);
  assert.match(env, /^GEMINI_MODEL=gemini-test$/m);
});

test('configures OpenClaw target in non-interactive mode', async () => {
  const home = await tempHome();
  const originalLog = console.log;
  console.log = () => {};
  try {
    const code = await run(
      ['configure', '--target', 'openclaw', '--api-key', 'sk-test', '--yes'],
      { HOME: home },
      { fetch }
    );
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
  }

  const config = JSON.parse(await readFile(path.join(home, '.openclaw', 'openclaw.json'), 'utf8'));
  const env = await readFile(path.join(home, '.openclaw', '.env'), 'utf8');
  assert.equal(config.agents.defaults.model.primary, 'modelsell-responses/gpt-5.5');
  assert.equal(config.models.providers.modelsell.apiKey, '${MODELSELL_API_KEY}');
  assert.equal(config.models.providers.modelsell.api, 'openai-completions');
  assert.deepEqual(config.models.providers.modelsell.models.map(m => m.id), ['gpt-6-sol', 'gemini-3.1-pro-preview', 'glm-5.1']);
  assert.deepEqual(config.models.providers['modelsell-anthropic'].models.map(m => m.id), ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1']);
  assert.deepEqual(config.agents.defaults.model.fallbacks.slice(0, 2), ['modelsell-anthropic/claude-sonnet-5-5', 'modelsell/gemini-3.1-pro-preview']);
  assert.match(env, /^MODELSELL_API_KEY=sk-test$/m);
  assert.doesNotMatch(env, /^OPENAI_API_KEY=/m);
});

test('uses USERPROFILE as home directory when HOME is not set', async () => {
  const home = await tempHome();
  const originalLog = console.log;
  const originalHome = process.env.HOME;
  console.log = () => {};
  try {
    delete process.env.HOME;
    const code = await run(
      ['configure', '--target', 'codex', '--api-key', 'sk-test', '--yes'],
      { USERPROFILE: home },
      { fetch: offline, log: () => {} }
    );
    assert.equal(code, 0);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    console.log = originalLog;
  }

  const credentials = JSON.parse(await readFile(path.join(home, '.config', 'modelsell', 'credentials.json'), 'utf8'));
  assert.equal(credentials.apiKey, 'sk-test');
  assert.match(await readFile(path.join(home, '.codex', 'config.toml'), 'utf8'), /model = "gpt-5.5"/);
});

test('uses HOMEDRIVE and HOMEPATH as home directory when HOME and USERPROFILE are not set', async () => {
  const home = await tempHome();
  const originalLog = console.log;
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  console.log = () => {};
  try {
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    const code = await run(
      ['configure', '--target', 'claude', '--api-key', 'sk-test', '--yes'],
      { HOMEDRIVE: home, HOMEPATH: '' },
      { fetch }
    );
    assert.equal(code, 0);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = originalUserProfile;
    }
    console.log = originalLog;
  }

  const settings = JSON.parse(await readFile(path.join(home, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.env.ANTHROPIC_AUTH_TOKEN, 'sk-test');
});

test('interactive mode shows banner and lets user choose a target by number', async () => {
  const home = await tempHome();
  const prompts = [];
  const output = [];
  const answers = ['4', '', 'sk-ui', 'gemini-ui'];

  const code = await run(['configure'], { HOME: home, NO_COLOR: '1' }, {
    fetch,
    log: (line = '') => output.push(String(line)),
    question: async (prompt) => {
      prompts.push(prompt);
      return answers.shift() ?? '';
    }
  });

  assert.equal(code, 0);
  assert.match(output.join('\n'), /ModelSell CLI/);
  assert.match(output.join('\n'), /Select what you want to configure/);
  assert.deepEqual(prompts, [
    'Choose [1]: ',
    'Base URL [https://www.modelsell.com]: ',
    'API key: ',
    'Gemini CLI model [gemini-3.1-pro-preview]: '
  ]);

  const env = await readFile(path.join(home, '.gemini', '.env'), 'utf8');
  assert.match(env, /^GEMINI_API_KEY=sk-ui$/m);
  assert.match(env, /^GEMINI_MODEL=gemini-ui$/m);
});

test('interactive mode uses Chinese descriptions and prompts for Chinese locales', async () => {
  const home = await tempHome();
  const prompts = [];
  const output = [];
  const answers = ['4', '', 'sk-ui', 'gemini-ui'];

  const code = await run(['configure'], { HOME: home, NO_COLOR: '1', LANG: 'zh_CN.UTF-8' }, {
    fetch,
    log: (line = '') => output.push(String(line)),
    question: async (prompt) => {
      prompts.push(prompt);
      return answers.shift() ?? '';
    }
  });

  assert.equal(code, 0);
  assert.match(output.join('\n'), /配置 Codex、Claude Code、Gemini CLI、OpenClaw、OpenCode、Qwen Code、Crush、Droid、Kimi CLI、WorkBuddy 和 CodeBuddy/);
  assert.match(output.join('\n'), /请选择要配置的工具/);
  assert.deepEqual(prompts, [
    '请选择 [1]: ',
    '基础 URL [https://www.modelsell.com]: ',
    'API 密钥: ',
    'Gemini CLI 模型 [gemini-3.1-pro-preview]: '
  ]);
});

test('renders colorful ModelSell CLI banner', () => {
  const banner = renderBanner({ color: true });
  assert.match(banner, /\u001b\[/);
  assert.match(banner, /ModelSell CLI/);
  assert.match(banner, /Configure Codex, Claude Code, Gemini CLI, OpenClaw, OpenCode, Qwen Code, Crush, Droid, Kimi CLI, WorkBuddy, and CodeBuddy/);
});

test('interactive OpenClaw configuration does not prompt for a single model', async () => {
  const home = await tempHome();
  const prompts = [];
  const output = [];
  const answers = ['5', '', 'sk-openclaw'];

  const code = await run(['configure'], { HOME: home, NO_COLOR: '1' }, {
    fetch,
    log: (line = '') => output.push(String(line)),
    question: async (prompt) => {
      prompts.push(prompt);
      return answers.shift() ?? '';
    }
  });

  assert.equal(code, 0);
  assert.deepEqual(prompts, [
    'Choose [1]: ',
    'Base URL [https://www.modelsell.com]: ',
    'API key: '
  ]);
  assert.match(output.join('\n'), /OpenClaw/);
});

test('renders Gemini-like numbered target menu', () => {
  const menu = renderTargetMenu();
  assert.match(menu, /1\. All/);
  assert.match(menu, /2\. Codex/);
  assert.match(menu, /3\. Claude Code/);
  assert.match(menu, /4\. Gemini CLI/);
  assert.match(menu, /5\. OpenClaw/);
  assert.match(menu, /6\. OpenCode/);
  assert.match(menu, /10\. Kimi CLI/);
  assert.match(menu, /11\. WorkBuddy/);
  assert.match(menu, /12\. CodeBuddy/);
});

test('interactive Codex defaults come from the key-scoped live catalog', async () => {
  const home = await tempHome();
  const prompts = [];
  const answers = ['2', '', 'sk-ui', ''];
  await run(['configure'], { HOME: home, NO_COLOR: '1' }, {
    fetch,
    log: () => {},
    question: async prompt => { prompts.push(prompt); return answers.shift() ?? ''; }
  });
  assert.equal(prompts.at(-1), 'Codex model [gpt-5.5]: ');
});

test('configures OpenCode with the ModelSell provider', async () => {
  const home = await tempHome();
  await run(['configure', '--target', 'opencode', '--api-key', 'sk-oc', '--yes'], { HOME: home }, { fetch, log: () => {} });
  const config = JSON.parse(await readFile(path.join(home, '.config', 'opencode', 'opencode.json'), 'utf8'));
  assert.equal(config.model, 'modelsell/gpt-5.5');
  assert.equal(config.provider.modelsell.npm, '@ai-sdk/openai-compatible');
  assert.equal(config.provider.modelsell.options.baseURL, 'https://www.modelsell.com/v1');
  assert.deepEqual(config.provider.modelsell.models['glm-5.1'].limit, { context: 204800, output: 128000 });
});
