import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { WebSocketServer } from 'ws';
import { runAPI } from '../src/api-cli.js';
import { apiURL } from '../src/api/client.js';
import { normalizeBase } from '../src/api/config.js';
import { protocols, resolveProtocol, prepareRequest, chooseProtocol } from '../src/api/protocols.js';
import { taskState } from '../src/api/tasks.js';

const catalogModels = [
  { model_name: 'chat', supported_endpoint_types: ['openai'] },
  { model_name: 'claude', supported_endpoint_types: ['anthropic'] },
  { model_name: 'gemini', supported_endpoint_types: ['gemini'] },
  { model_name: 'responses', supported_endpoint_types: ['openai-response'] },
  { model_name: 'image', category: 'image', supported_endpoint_types: ['image-generation'] },
  { model_name: 'video', category: 'video', supported_endpoint_types: ['openai'] },
  { model_name: 'seedance', category: 'video', supported_endpoint_types: ['seedance2-native-video'] },
  { model_name: 'Tripo/3d', category: '3d', supported_endpoint_types: ['dashscope.tripo.3d'] },
  { model_name: 'tts-1', category: 'audio', supported_endpoint_types: ['openai'] },
  { model_name: 'whisper-1', category: 'audio', supported_endpoint_types: ['openai'] },
  { model_name: 'suno_music', supported_endpoint_types: ['openai'] },
  { model_name: 'mj_imagine', supported_endpoint_types: ['openai'] },
  { model_name: 'private-unavailable', supported_endpoint_types: ['openai'] }
];

async function fixture(t, handler = () => null) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'modelsell-model-test-'));
  const calls = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks), text = bytes.toString();
      let body; try { body = JSON.parse(text); } catch { /* multipart */ }
      const call = { url: req.url, method: req.method, headers: req.headers, bytes, text, body };
      calls.push(call);
      if (await handler(call, res)) return;
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/pricing') res.end(JSON.stringify({ success: true, data: catalogModels, supported_endpoint: { 'seedance2-native-video': { path: '/api/v3/contents/generations/tasks', method: 'POST', config: { parameters: { watermark: { type: 'boolean' }, duration: { type: 'integer' } } } } } }));
      else if (req.url === '/v1/models') res.end(JSON.stringify({ data: catalogModels.filter(m => m.model_name !== 'private-unavailable').map(m => ({ id: m.model_name })) }));
      else res.end(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }));
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: { message: e.message } })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(home, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { HOME: home, MODELSELL_CONFIG_DIR: path.join(home, 'config'), MODELSELL_BASE_URL: base, MODELSELL_API_KEY: 'sk-fixture-only' };
  const invoke = async (args, override = {}, input = '') => {
    let out = '', err = '';
    const code = await runAPI(args, { ...env, ...override }, { cwd: home, stdout: { write: s => { out += s; } }, stderr: { write: s => { err += s; } }, stdin: typeof input === 'string' ? Readable.from([input]) : input });
    let json; try { json = JSON.parse(out); } catch { /* stream */ }
    return { code, out, err, json };
  };
  return { invoke, calls, home, env, base, server };
}

test('catalog uses the key model list; public discovery does not send the key', async t => {
  const f = await fixture(t);
  const got = await f.invoke(['models', '--json']);
  assert.equal(got.code, 0);
  assert.equal(got.json.scope, 'api-key');
  assert(!got.json.models.some(m => m.id === 'private-unavailable'));
  assert.equal(f.calls[0].headers.authorization, undefined);
  assert.equal(f.calls[1].headers.authorization, 'Bearer sk-fixture-only');
  const all = await f.invoke(['models', '--all', '--json']);
  assert(all.json.models.some(m => m.id === 'private-unavailable'));
});

for (const [model, endpoint, expected, key] of [
  ['chat', 'openai', '/v1/chat/completions', 'messages'],
  ['claude', 'anthropic', '/v1/messages', 'messages'],
  ['responses', 'openai-response', '/v1/responses', 'input'],
  ['gemini', 'gemini', '/v1beta/models/gemini:generateContent', 'contents'],
  ['image', 'image-generation', '/v1/images/generations', 'prompt'],
  ['seedance', 'seedance2-native-video', '/api/v3/contents/generations/tasks', 'content'],
  ['Tripo/3d', 'dashscope.tripo.3d', '/api/v1/services/aigc/video-generation/3d-generation', 'input'],
  ['vector', 'embeddings', '/v1/embeddings', 'input'],
  ['rerank', 'jina-rerank', '/v1/rerank', 'query'],
  ['suno_music', 'suno', '/suno/submit/music', 'gpt_description_prompt'],
  ['mj_imagine', 'midjourney', '/mj/submit/imagine', 'prompt']
]) {
  test(`invokes ${endpoint} with preserved parameters`, async t => {
    const f = await fixture(t);
    const got = await f.invoke(['run', model, '--endpoint', endpoint, '-p', '你好', '-i', 'temperature=0', '-i', 'metadata.enabled=false', ...(endpoint === 'jina-rerank' ? ['-i', 'documents=["a","b"]'] : []), '--json']);
    assert.equal(got.code, 0, got.out);
    const call = f.calls.find(c => c.method === 'POST');
    assert.equal(call.url, expected);
    assert(call.body[key]);
    assert.equal(call.body.temperature, 0);
    assert.equal(call.body.metadata.enabled, false);
    if (endpoint === 'anthropic') assert.equal(call.headers['anthropic-version'], '2023-06-01');
    if (['suno', 'midjourney', 'gemini'].includes(endpoint)) assert.equal(call.body.model, undefined);
  });
}

test('dynamic schema flags preserve zero/false and reject typos before submission', async t => {
  const f = await fixture(t);
  const got = await f.invoke(['run', 'seedance', '-p', 'sea', '--watermark', 'false', '--duration', '0', '--json']);
  assert.equal(got.code, 0, got.out);
  assert.equal(f.calls.find(c => c.method === 'POST').body.watermark, false);
  assert.equal(f.calls.find(c => c.method === 'POST').body.duration, 0);
  const before = f.calls.filter(c => c.method === 'POST').length;
  const bad = await f.invoke(['run', 'seedance', '-p', 'sea', '--duraton', '5', '--json']);
  assert.equal(bad.code, 1);
  assert.match(bad.json.error.message, /Unknown flag/);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, before);
});

test('aliases merge defaults, JSON file and CLI overrides, without using project credentials', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.home, 'modelsell.json'), JSON.stringify({ baseUrl: 'https://attacker.invalid', apiKey: 'wrong', defaultModel: 'hero', aliases: { hero: { model: 'chat', input: { temperature: 0.5, max_tokens: 100 } } } }));
  const got = await f.invoke(['run', '--input-file', '-', '-i', 'temperature=0', '-p', 'unchanged', '--json'], {}, '{"max_tokens":50}');
  assert.equal(got.code, 0, got.out);
  const sent = f.calls.find(c => c.method === 'POST');
  assert.equal(sent.body.max_tokens, 50);
  assert.equal(sent.body.temperature, 0);
  assert.equal(sent.body.messages[0].content, 'unchanged');
  assert.equal(sent.headers.authorization, 'Bearer sk-fixture-only');
});

test('dry-run never sends a generation or reads local media', async t => {
  const f = await fixture(t);
  const got = await f.invoke(['run', 'image', '-p', 'unchanged', '-i', 'image=@missing.png', '--dry-run', '--json']);
  assert.equal(got.code, 0, got.out);
  assert.equal(got.json.body.image, '@missing.png');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});

test('multipart transcription uploads bytes and preserves zero values', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.home, 'sample.wav'), 'sample-audio');
  const got = await f.invoke(['run', 'whisper-1', '--file', 'file=sample.wav', '-i', 'temperature=0', '--json']);
  assert.equal(got.code, 0, got.out);
  const sent = f.calls.find(c => c.method === 'POST');
  assert.equal(sent.url, '/v1/audio/transcriptions');
  assert.match(sent.headers['content-type'], /multipart\/form-data; boundary=/);
  assert.match(sent.text, /filename="sample.wav"/);
  assert.match(sent.text, /sample-audio/);
  assert.match(sent.text, /name="temperature"\r\n\r\n0/);
});

test('explicit @ markers become data URIs; bare paths and @@ are literal', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.home, 'sample.png'), 'png');
  const got = await f.invoke(['run', 'image', '-p', 'draw', '-i', 'image=@sample.png', '-i', 'metadata.path=sample.png', '-i', 'metadata.literal=@@example', '--json']);
  assert.equal(got.code, 0, got.out);
  const sent = f.calls.find(c => c.method === 'POST').body;
  assert.equal(sent.image, 'data:image/png;base64,cG5n');
  assert.equal(sent.metadata.path, 'sample.png');
  assert.equal(sent.metadata.literal, '@example');
});

for (const variant of ['video', 'seedance', 'Tripo/3d', 'suno_music', 'mj_imagine']) {
  test(`${variant} submission polls the matching task protocol`, async t => {
    let polls = 0;
    const f = await fixture(t, (call, res) => {
      const submit = {
        video: { id: 'task-test', status: 'queued' },
        seedance: { id: 'task-test' },
        'Tripo/3d': { output: { task_id: 'task-test', task_status: 'PENDING' } },
        suno_music: { code: 'success', data: 'task-test' },
        mj_imagine: { code: 1, result: 'task-test' }
      };
      if (call.method === 'POST') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(submit[variant])); return true; }
      if (call.url.includes('task-test')) {
        polls++;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 'success', data: { task_id: 'task-test', status: polls < 2 ? 'IN_PROGRESS' : 'SUCCESS', result_url: polls < 2 ? undefined : 'https://cdn.example/result.mp4' } })); return true;
      }
    });
    const got = await f.invoke(['run', variant, '-p', 'a scene', '--poll-interval', '0.001', '--json']);
    assert.equal(got.code, 0, got.out);
    assert.equal(got.json.task_id, 'task-test');
    assert.equal(got.json.status, 'success');
    assert.deepEqual(got.json.outputs, ['https://cdn.example/result.mp4']);
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
    assert.equal(polls, 2);
    assert.match(got.err, /Task submitted/);
    const history = await f.invoke(['history', '--json']);
    assert.equal(history.json.tasks[0].id, 'task-test');
  });
}

test('no-wait + wait resumes persisted task without resubmitting', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.method === 'POST' || call.url.includes('/resume')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'resume', status: call.method === 'POST' ? 'queued' : 'completed' })); return true;
    }
  });
  const submitted = await f.invoke(['run', 'video', '-p', 'test', '--no-wait', '--json']);
  assert.equal(submitted.code, 0, submitted.out);
  const done = await f.invoke(['wait', 'resume', '--poll-interval', '0.001', '--json']);
  assert.equal(done.code, 0, done.out);
  assert.equal(done.json.status, 'completed');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('failed tasks have nonzero status and retain task IDs', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.method === 'POST' || call.url.includes('/failed-id')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'failed-id', status: call.method === 'POST' ? 'queued' : 'failed', error: call.method === 'POST' ? undefined : { message: 'Generation failed' } })); return true;
    }
  });
  const got = await f.invoke(['run', 'video', '-p', 'test', '--poll-interval', '0.001', '--json']);
  assert.equal(got.code, 1);
  assert.equal(got.json.error.task_id, 'failed-id');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('polling timeout includes resumable ID and never repeats submit', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.method === 'POST' || call.url.includes('/pending-id')) {
      res.setHeader('Content-Type', 'application/json'); res.end('{"id":"pending-id","status":"queued"}'); return true;
    }
  });
  const got = await f.invoke(['run', 'video', '-p', 'test', '--timeout', '0.08', '--poll-interval', '0.01', '--json']);
  assert.equal(got.code, 1, got.out);
  assert.equal(got.json.error.task_id, 'pending-id');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('SSE parser handles split UTF-8/CRLF frames and emits JSONL', async t => {
  const f = await fixture(t, async (call, res) => {
    if (call.method !== 'POST') return;
    res.setHeader('Content-Type', 'text/event-stream');
    const bytes = Buffer.from('data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
    for (const byte of bytes) res.write(Buffer.from([byte]));
    res.end(); return true;
  });
  const text = await f.invoke(['run', 'chat', '-p', 'test', '--stream']);
  assert.equal(text.code, 0, text.err);
  assert.equal(text.out, '你好\n');
  const json = await f.invoke(['run', 'chat', '-p', 'test', '--stream', '--json']);
  assert.equal(json.code, 0, json.out);
  assert.equal(JSON.parse(json.out).choices[0].delta.content, '你好');
});

test('incomplete SSE and SSE error frames fail clearly', async t => {
  let mode = 'incomplete';
  const f = await fixture(t, (call, res) => {
    if (call.method !== 'POST') return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.end(mode === 'incomplete' ? 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n' : 'data: {"type":"error","error":{"message":"bad"}}\n\n'); return true;
  });
  assert.equal((await f.invoke(['run', 'chat', '-p', 'test', '--stream'])).code, 1);
  mode = 'error';
  assert.equal((await f.invoke(['run', 'chat', '-p', 'test', '--stream'])).code, 1);
  const json = await f.invoke(['run', 'chat', '-p', 'test', '--stream', '--json']);
  assert.equal(json.out.trim().split('\n').length, 1);
  assert.equal(JSON.parse(json.out).error.message, 'bad');
});

test('speech writes exact binary and refuses missing/existing output before billing', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.method !== 'POST') return;
    res.setHeader('Content-Type', 'audio/mpeg'); res.end(Buffer.from([0, 1, 2, 255])); return true;
  });
  assert.equal((await f.invoke(['run', 'tts-1', '-p', 'hello', '--json'])).code, 1);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  const good = await f.invoke(['run', 'tts-1', '-p', 'hello', '--output', 'speech.mp3', '--json']);
  assert.equal(good.code, 0, good.out);
  assert.deepEqual(await readFile(path.join(f.home, 'speech.mp3')), Buffer.from([0, 1, 2, 255]));
  assert.equal((await f.invoke(['run', 'tts-1', '-p', 'hello', '--output', 'speech.mp3', '--json'])).code, 1);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('HTTP-200 business failures redact keys and do not retry', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.method !== 'POST') return;
    res.setHeader('Content-Type', 'application/json'); res.end('{"code":400,"message":"bad sk-fixture-only"}'); return true;
  });
  const got = await f.invoke(['run', 'chat', '-p', 'test', '--json']);
  assert.equal(got.code, 1);
  assert(!got.out.includes('sk-fixture-only'));
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('native request can invoke an arbitrary gateway route without catalog coupling', async t => {
  const f = await fixture(t);
  const got = await f.invoke(['request', '/material/assets', '--method', 'POST', '--input-file', '-', '--json'], {}, '{"model":"native","enabled":false,"count":0}');
  assert.equal(got.code, 0, got.out);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].body, { model: 'native', enabled: false, count: 0 });
});

test('redirects and absolute paths cannot receive API credentials', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.url === '/redirect') { res.writeHead(302, { Location: '/secret-target' }); res.end(); return true; }
  });
  assert.equal((await f.invoke(['request', '/redirect', '--json'])).code, 1);
  assert(!f.calls.some(c => c.url === '/secret-target'));
  assert.equal((await f.invoke(['request', 'https://attacker.invalid/', '--json'])).code, 1);
  assert.equal((await f.invoke(['request', '//attacker.invalid', '--json'])).code, 1);
  assert.equal((await f.invoke(['request', '/v1/models', '-H', 'Authorization:Bearer other', '--json'])).code, 1);
});

test('login uses stdin, validates live, stores private credentials; origin changes do not reuse them', async t => {
  const f = await fixture(t);
  const login = await f.invoke(['login', '--key-stdin', '--json'], { MODELSELL_API_KEY: '' }, 'sk-private\n');
  assert.equal(login.code, 0, login.out);
  assert(!login.out.includes('sk-private'));
  const file = path.join(f.home, 'config/credentials.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const status = await f.invoke(['status', '--json'], { MODELSELL_API_KEY: '' });
  assert.equal(status.json.authenticated, true);
  const other = await f.invoke(['status', '--base-url', 'https://other.example', '--json'], { MODELSELL_API_KEY: '' });
  assert.equal(other.json.authenticated, false);
});

test('project skill installation is idempotent and protects edited skills', async t => {
  const f = await fixture(t);
  const install = await f.invoke(['skill', 'install', '--json']);
  assert.equal(install.code, 0, install.out);
  assert.equal(install.json.files.length, 2);
  assert.equal((await f.invoke(['skill', 'install', '--json'])).code, 0);
  await writeFile(install.json.files[0], 'custom');
  assert.equal((await f.invoke(['skill', 'install', '--json'])).code, 1);
  assert.equal(await readFile(install.json.files[0], 'utf8'), 'custom');
});

test('realtime bridges JSONL input and output with authenticated WebSocket', async t => {
  const f = await fixture(t);
  const wss = new WebSocketServer({ server: f.server });
  t.after(() => { for (const c of wss.clients) c.terminate(); wss.close(); });
  let handshake, received;
  wss.on('connection', (ws, req) => {
    handshake = req;
    ws.on('message', bytes => { received = JSON.parse(bytes.toString()); ws.send('{"type":"response.done"}'); ws.close(1000); });
  });
  const got = await f.invoke(['realtime', 'audio-model', '--timeout', '2', '--json'], {}, '{"type":"response.create"}\n');
  assert.equal(got.code, 0, got.out);
  assert.equal(received.type, 'response.create');
  assert.equal(got.json.type, 'response.done');
  assert.equal(handshake.headers.authorization, 'Bearer sk-fixture-only');
  assert.equal(handshake.url, '/v1/realtime?model=audio-model');
});

test('rejects prototype keys, conflicting model, missing files, and conflicting prompt before POST', async t => {
  const f = await fixture(t);
  for (const args of [
    ['run', 'chat', '-i', '__proto__.polluted=true'],
    ['run', 'chat', '-p', 'test', '-i', 'model=other'],
    ['run', 'image', '-p', 'test', '-i', 'image=@missing.png'],
    ['run', 'chat', '-p', 'test', '-i', 'messages=[]']
  ]) assert.equal((await f.invoke([...args, '--json'])).code, 1);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  assert.equal({}.polluted, undefined);
});

test('routing covers mislabeled media and preserves native model names', () => {
  assert.equal(chooseProtocol('wan3.0-video', { category: 'video', supported_endpoint_types: ['openai'] }), 'openai-video');
  assert.equal(chooseProtocol('mimo-v2.5-tts', { category: 'audio', supported_endpoint_types: ['openai'] }), 'openai');
  assert.equal(chooseProtocol('qwen-realtime', {}), 'realtime');
  const protocol = resolveProtocol('kling-v3', { supported_endpoint_types: ['kling'] }, { kling: { path: '/kling', method: 'POST' } });
  assert.equal(protocol.path, '/v1/video/generations');
  assert.equal(normalizeBase('https://example.com/v1/'), 'https://example.com');
  assert.throws(() => apiURL('https://example.com', '/\\evil.example'));
  assert.throws(() => normalizeBase('http://example.com'));
  assert.equal(taskState({ output: { task_id: 'tripo', task_status: 'SUCCEEDED' } }).done, true);
  const p = { ...protocols.gemini, type: 'gemini' };
  assert.equal(prepareRequest(p, 'foo/bar', { prompt: 'test' }, true).route, '/v1beta/models/foo%2Fbar:streamGenerateContent?alt=sse');
});

test('downloads authenticated media and embedded images to actual files', async t => {
  let base;
  const f = await fixture(t, (call, res) => {
    if (call.method === 'POST') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ input: { image_url: `${base}/input.png` }, data: [{ url: `${base}/v1/videos/done/content` }, { b64_json: 'iVBORw0KGgo=' }] })); return true;
    }
    if (call.url.endsWith('/content')) { res.setHeader('Content-Type', 'video/mp4'); res.end('video-bytes'); return true; }
  });
  base = f.base;
  const got = await f.invoke(['run', 'image', '-p', 'media', '--download', 'outputs', '--json']);
  assert.equal(got.code, 0, got.out);
  assert.deepEqual(got.json.files.map(p => path.basename(p)), ['output-1.mp4', 'output-2.png']);
  assert.equal(await readFile(got.json.files[0], 'utf8'), 'video-bytes');
  assert.deepEqual(await readFile(got.json.files[1]), Buffer.from('iVBORw0KGgo=', 'base64'));
  assert(!f.calls.some(c => c.url === '/input.png'));
  assert.equal(f.calls.find(c => c.url.endsWith('/content')).headers.authorization, 'Bearer sk-fixture-only');
});

test('failed download is an error even when generation succeeded', async t => {
  let base;
  const f = await fixture(t, (call, res) => {
    if (call.method === 'POST') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ url: `${base}/missing.mp4` }] })); return true; }
    if (call.url === '/missing.mp4') { res.writeHead(404); res.end('expired'); return true; }
  });
  base = f.base;
  const got = await f.invoke(['run', 'image', '-p', 'test', '--download', 'out', '--json']);
  assert.equal(got.code, 1);
  await assert.rejects(stat(path.join(f.home, 'out/output-1.mp4')), { code: 'ENOENT' });
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('rate-limited GET polling retries but a rate-limited submit does not', async t => {
  let polls = 0;
  const f = await fixture(t, (call, res) => {
    if (call.url === '/submit429') { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"slow down"}}'); return true; }
    if (call.method === 'POST') { res.setHeader('Content-Type', 'application/json'); res.end('{"id":"retry-task","status":"queued"}'); return true; }
    if (call.url.includes('retry-task')) {
      if (++polls === 1) { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"slow down"}}'); }
      else { res.setHeader('Content-Type', 'application/json'); res.end('{"id":"retry-task","status":"completed"}'); }
      return true;
    }
  });
  const got = await f.invoke(['run', 'video', '-p', 'test', '--poll-interval', '0.001', '--json']);
  assert.equal(got.code, 0, got.out);
  assert.equal(polls, 2);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  const limited = await f.invoke(['request', '/submit429', '--method', 'POST', '--json']);
  assert.equal(limited.code, 1);
  assert.equal(f.calls.filter(c => c.url === '/submit429').length, 1);
});

test('custom native jobs with only an ID support explicit fetch paths and history', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.method === 'POST' || call.url === '/native/only-id') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(call.method === 'POST' ? { id: 'only-id' } : { id: 'only-id', status: 'succeeded' })); return true;
    }
  });
  const got = await f.invoke(['request', '/native', '--method', 'POST', '--fetch-path', '/native/{task_id}', '--poll-interval', '0.001', '--json']);
  assert.equal(got.code, 0, got.out);
  assert.equal(got.json.status, 'succeeded');
  const imported = await f.invoke(['show', 'external', '--fetch-path', '/native/only-id', '--json']);
  assert.equal(imported.code, 0, imported.out);
  assert.equal((await f.invoke(['history', '--json'])).code, 0);
});

test('an advertised new protocol is usable without adding a client adapter', async t => {
  const f = await fixture(t, (call, res) => {
    if (call.url === '/api/pricing') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        data: [{ model_name: 'new-model', supported_endpoint_types: ['new-provider'] }],
        supported_endpoint: {
          'new-provider': { path: '/new/submit', method: 'POST', config: { parameters: { custom: { type: 'boolean' } } } }
        }
      })); return true;
    }
    if (call.url === '/v1/models') { res.setHeader('Content-Type', 'application/json'); res.end('{"data":[{"id":"new-model"}]}'); return true; }
  });
  const got = await f.invoke(['run', 'new-model', '--custom', 'false', '-i', 'native={"n":0}', '--json']);
  assert.equal(got.code, 0, got.out);
  const sent = f.calls.find(c => c.method === 'POST');
  assert.equal(sent.url, '/new/submit');
  assert.deepEqual(sent.body, { model: 'new-model', custom: false, native: { n: 0 } });
});
