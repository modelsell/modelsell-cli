import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { runAPI } from '../src/api-cli.js';
import { resolveProtocol } from '../src/api/protocols.js';
import { summarizeModel } from '../src/api/catalog.js';

const pricing = {
  success: true,
  supported_endpoint: { 'openai-video': { path: '/v1/video/generations', method: 'POST' } },
  data: [
    { model_name: 'chat', category: 'text', description: 'x'.repeat(400), supported_endpoint_types: ['openai'], billing_expr: 'long' },
    { model_name: 'clip', category: 'video', supported_endpoint_types: ['openai-video'], supported_endpoints: { 'openai-video': { path: '/v1/video/generations', method: 'POST', docs_url: 'https://docs.example/clip', config: { submit_path: '/v2/clip', fetch_path: '/v2/clip/{task_id}' } } } }
  ]
};

async function session(t, messages, fetch) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'modelsell-mcp-test-'));
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
  const replies = {}, waiting = {};
  let buffer = '';
  stdout.on('data', d => {
    buffer += d;
    for (let i; (i = buffer.indexOf('\n')) >= 0; buffer = buffer.slice(i + 1)) {
      const m = JSON.parse(buffer.slice(0, i));
      replies[m.id] = m; waiting[m.id]?.();
    }
  });
  const done = runAPI(['mcp'], { MODELSELL_CONFIG_DIR: dir, MODELSELL_API_KEY: 'sk-test', HOME: dir }, { stdin, stdout, stderr, cwd: dir, fetch });
  // Like a real client, wait for each reply before the next request.
  for (const m of messages) {
    const reply = m.id === undefined ? null : new Promise(resolve => { waiting[m.id] = resolve; });
    stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
    await reply;
  }
  stdin.end();
  assert.equal(await done, 0);
  return replies;
}

const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('per-model endpoint metadata overrides the global endpoint map and exposes docs', () => {
  const protocol = resolveProtocol('clip', pricing.data[1], pricing.supported_endpoint);
  assert.equal(protocol.path, '/v2/clip');
  assert.equal(protocol.fetch_path, '/v2/clip/{task_id}');
  assert.equal(protocol.docs_url, 'https://docs.example/clip');
});

test('compact summaries drop pricing internals and truncate descriptions', () => {
  const summary = summarizeModel({ ...pricing.data[0], id: 'chat' });
  assert.equal(summary.billing_expr, undefined);
  assert.equal(summary.description.length, 160);
  assert.deepEqual(summarizeModel({ ...pricing.data[1], id: 'clip' }).docs, ['https://docs.example/clip']);
});

test('MCP server lists tools and runs models through the CLI without exposing the key', async t => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (url.pathname === '/api/pricing') return json(pricing);
    if (url.pathname === '/v1/models') return json({ data: [{ id: 'chat' }, { id: 'clip' }] });
    if (url.pathname === '/v1/chat/completions') return json({ choices: [{ message: { content: 'hi there' } }] });
    if (url.pathname === '/v2/clip') return json({ task_id: 'task-1', status: 'queued' });
    if (url.pathname === '/v2/clip/task-1') return json({ task_id: 'task-1', status: 'succeeded', url: 'https://cdn.example/v.mp4' });
    throw new Error(`unexpected ${url}`);
  };
  const r = await session(t, [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'modelsell_list_models', arguments: {} } },
    { id: 4, method: 'tools/call', params: { name: 'modelsell_run_model', arguments: { model: 'chat', prompt: '-starts with a dash', input: { temperature: 0 } } } },
    { id: 5, method: 'tools/call', params: { name: 'modelsell_run_model', arguments: { model: 'clip', prompt: 'waves', wait: false } } },
    { id: 6, method: 'tools/call', params: { name: 'modelsell_get_task', arguments: { task_id: 'task-1', wait: true } } },
    { id: 7, method: 'tools/call', params: { name: 'modelsell_run_model', arguments: {} } },
    { id: 8, method: 'nope' }
  ], fetch);
  assert.equal(r[1].result.protocolVersion, '2025-03-26');
  assert.ok(r[2].result.tools.some(tool => tool.name === 'modelsell_run_model'));
  const listed = JSON.parse(r[3].result.content[0].text);
  assert.deepEqual(listed.models.map(m => m.id), ['chat', 'clip']);
  assert.equal(listed.models[0].billing_expr, undefined);
  const chat = calls.find(c => c.url.endsWith('/v1/chat/completions'));
  assert.deepEqual(JSON.parse(chat.init.body), { temperature: 0, messages: [{ role: 'user', content: '-starts with a dash' }], model: 'chat' });
  assert.equal(JSON.parse(r[4].result.content[0].text).response.choices[0].message.content, 'hi there');
  assert.equal(JSON.parse(r[5].result.content[0].text).task_id, 'task-1');
  const task = JSON.parse(r[6].result.content[0].text);
  assert.equal(task.status, 'succeeded');
  assert.deepEqual(task.outputs, ['https://cdn.example/v.mp4']);
  assert.equal(r[7].error.code, -32602);
  assert.equal(r[8].error.code, -32601);
  assert.ok(!JSON.stringify(r).includes('sk-test'));
});

test('MCP reports an unfinished poll as resumable instead of failed', async t => {
  const fetch = async url => {
    if (url.pathname === '/api/pricing') return json(pricing);
    if (url.pathname === '/v1/models') return json({ data: [{ id: 'clip' }] });
    return json({ task_id: 'task-2', status: 'running' });
  };
  const r = await session(t, [{ id: 1, method: 'tools/call', params: { name: 'modelsell_run_model', arguments: { model: 'clip', prompt: 'slow', timeout_seconds: 0.05 } } }], fetch);
  assert.equal(r[1].result.isError, false);
  const body = JSON.parse(r[1].result.content[0].text);
  assert.equal(body.status, 'pending');
  assert.equal(body.task_id, 'task-2');
});
