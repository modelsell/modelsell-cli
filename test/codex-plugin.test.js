import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { agentSkill } from '../src/api/skill.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Codex marketplace lists the modelsell plugin', async () => {
  const marketplace = JSON.parse(await read('.agents/plugins/marketplace.json'));
  assert.equal(marketplace.name, 'modelsell');
  const entry = marketplace.plugins.find(p => p.name === 'modelsell');
  assert.deepEqual(entry.source, { source: 'local', path: './plugins/modelsell' });
});

test('Codex plugin manifest matches the package version and ships its assets', async () => {
  const manifest = JSON.parse(await read('plugins/modelsell/.codex-plugin/plugin.json'));
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(manifest.name, 'modelsell');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.skills, './skills/');
  await read(`plugins/modelsell/${manifest.interface.logo.replace(/^\.\//, '')}`);
});

test('Codex plugin skill stays in sync with modelsell skill install', async () => {
  assert.equal(await read('plugins/modelsell/skills/modelsell/SKILL.md'), agentSkill);
  assert.match(await read('plugins/modelsell/skills/modelsell-setup/SKILL.md'), /^---\nname: modelsell-setup\n/);
});

test('Codex plugin bundles the modelsell MCP server', async () => {
  const manifest = JSON.parse(await read('plugins/modelsell/.codex-plugin/plugin.json'));
  assert.equal(manifest.mcpServers, './.mcp.json');
  const { mcpServers } = JSON.parse(await read('plugins/modelsell/.mcp.json'));
  assert.deepEqual([mcpServers.modelsell.command, ...mcpServers.modelsell.args], ['modelsell', 'mcp']);
  assert.ok(mcpServers.modelsell.env_vars.includes('MODELSELL_API_KEY'));
});
