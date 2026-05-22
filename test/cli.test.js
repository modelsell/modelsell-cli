import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { renderBanner, renderTargetMenu, run } from '../src/cli.js';

async function tempHome() {
  return mkdtemp(path.join(tmpdir(), 'modelsell-cli-'));
}

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
  assert.match(lines.join('\n'), /配置 Codex、Claude Code 和 Gemini CLI/);
});

test('configures selected target in non-interactive mode', async () => {
  const home = await tempHome();
  const originalLog = console.log;
  console.log = () => {};
  try {
    const code = await run(
      ['configure', '--target', 'gemini', '--api-key', 'sk-test', '--gemini-model', 'gemini-test', '--yes'],
      { HOME: home }
    );
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
  }

  const env = await readFile(path.join(home, '.gemini', '.env'), 'utf8');
  assert.match(env, /^GEMINI_API_KEY=sk-test$/m);
  assert.match(env, /^GEMINI_MODEL=gemini-test$/m);
});

test('interactive mode shows banner and lets user choose a target by number', async () => {
  const home = await tempHome();
  const prompts = [];
  const output = [];
  const answers = ['4', '', 'sk-ui', 'gemini-ui'];

  const code = await run(['configure'], { HOME: home, NO_COLOR: '1' }, {
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
    log: (line = '') => output.push(String(line)),
    question: async (prompt) => {
      prompts.push(prompt);
      return answers.shift() ?? '';
    }
  });

  assert.equal(code, 0);
  assert.match(output.join('\n'), /配置 Codex、Claude Code 和 Gemini CLI/);
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
  assert.match(banner, /Configure Codex, Claude Code, and Gemini CLI/);
});

test('renders Gemini-like numbered target menu', () => {
  const menu = renderTargetMenu();
  assert.match(menu, /1\. All/);
  assert.match(menu, /2\. Codex/);
  assert.match(menu, /3\. Claude Code/);
  assert.match(menu, /4\. Gemini CLI/);
});
