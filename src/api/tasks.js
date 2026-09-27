import { mkdir, writeFile, link, rename, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { APIError, sleep } from './client.js';
import { readJSON, saveJSON } from './config.js';

export function taskState(raw) {
  const data = raw?.data && !Array.isArray(raw.data) && typeof raw.data === 'object' ? raw.data : raw;
  const native = raw?.output || raw?.task || data?.task || data;
  const status = String(native?.task_status || native?.status || data?.status || '').toLowerCase();
  const id = native?.task_id || native?.taskId || data?.task_id || data?.taskId || native?.id || raw?.id || (typeof raw?.data === 'string' ? raw.data : undefined) || (typeof raw?.result === 'string' ? raw.result : undefined);
  const done = ['succeeded', 'success', 'completed', 'done', 'finished'].includes(status);
  const failed = ['failed', 'failure', 'cancelled', 'canceled', 'error', 'expired', 'rejected'].includes(status);
  return { id, status, done, failed, reason: native?.error?.message || native?.fail_reason || native?.failReason || native?.message || native?.task_status_msg || raw?.error?.message };
}

export function taskFile(settings, id) {
  const key = createHash('sha256').update(`${settings.baseUrl}\n${id}`).digest('hex');
  return path.join(settings.dir, 'tasks', `${key}.json`);
}
export async function rememberTask(settings, record) { await saveJSON(taskFile(settings, record.id), { ...record, base_url: settings.baseUrl }); }
export async function recalledTask(settings, id) { return readJSON(taskFile(settings, id), null); }

export async function waitTask(client, record, { timeout, interval, signal, progress }) {
  const deadline = Date.now() + timeout;
  let last = record.raw;
  while (true) {
    const state = taskState(last);
    if (state.failed) throw new APIError(state.reason || `Task ${record.id} failed`, { task_id: record.id, status: state.status, response: last });
    if (state.done) return last;
    if (Date.now() >= deadline) throw new APIError('Polling timed out. Resume with modelsell wait; do not resubmit.', { task_id: record.id, fetch_path: record.fetch_path, response: last });
    progress?.(`Task ${record.id}: ${state.status || 'pending'}`);
    await sleep(Math.min(interval, Math.max(1, deadline - Date.now())), undefined, { signal });
    // Only GET polling can be retried safely; submissions are never retried.
    const previousTimeout = client.timeout;
    client.timeout = Math.min(previousTimeout, Math.max(1, deadline - Date.now()));
    try { last = await client.request(record.fetch_path, { method: record.fetch_method || 'GET' }); }
    catch (error) {
      if ((record.fetch_method || 'GET') !== 'GET' || ![429, 502, 503, 504].includes(error.details?.status)) {
        throw new APIError(error.message, { ...error.details, task_id: record.id, fetch_path: record.fetch_path });
      }
    } finally { client.timeout = previousTimeout; }
  }
}

export function extractOutputs(raw) {
  const found = new Set();
  function visit(value, key = '') {
    if (typeof value === 'string' && /^https?:\/\//.test(value) && /^(url|.*_url|imageUrl|videoUrl|outputs|videos|images|files|uri)$/i.test(key)) found.add(value);
    else if (Array.isArray(value)) value.forEach(v => visit(v, key));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
      if (!['input', 'inputs', 'request', 'messages'].includes(k)) visit(v, k);
    }
  }
  visit(raw);
  return [...found];
}
export function extractText(raw) {
  if (typeof raw === 'string') return raw;
  return raw?.choices?.map(c => typeof c.message?.content === 'string' ? c.message.content : c.text || '').join('') || raw?.output_text || raw?.text || raw?.content?.filter(c => c.type === 'text').map(c => c.text).join('') || raw?.candidates?.flatMap(c => c.content?.parts || []).map(p => p.text || '').join('') || (Array.isArray(raw?.output) ? raw.output.flatMap(o => o.content || []).map(c => c.text || '').join('') : '') || '';
}

export async function saveBytes(file, bytes, force = false) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    if (force) await rename(temp, file); else await link(temp, file);
  } finally { await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  return file;
}

export async function saveResponse(file, response, force = false) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    if (response.body) await pipeline(Readable.fromWeb(response.body), createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    else await writeFile(temp, '', { flag: 'wx', mode: 0o600 });
    if (force) await rename(temp, file); else await link(temp, file);
  } finally { await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  return file;
}

export async function downloadOutputs(client, raw, directory, cwd, force = false) {
  const outputs = extractOutputs(raw);
  const files = [];
  for (let i = 0; i < outputs.length; i++) {
    const url = new URL(outputs[i]);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid download URL.');
    const sameOrigin = url.origin === new URL(client.baseUrl).origin;
    let response, cleanup = () => {};
    if (sameOrigin) {
      const basePath = new URL(client.baseUrl).pathname.replace(/\/$/, '');
      if (!url.pathname.startsWith(basePath + '/')) throw new Error('Download URL is outside the configured API base path.');
      ({ response, cleanup } = await client.request(url.pathname.slice(basePath.length) + url.search, { raw: true }));
    } else {
      if (url.protocol !== 'https:') throw new Error('External downloads require HTTPS.');
      response = await client.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(client.timeout) });
    }
    try {
      if (!response.ok) throw new APIError(`Download failed: HTTP ${response.status}`, { output_url: outputs[i] });
      const contentExt = { 'video/mp4': '.mp4', 'audio/mpeg': '.mp3', 'image/png': '.png', 'image/jpeg': '.jpg', 'model/gltf-binary': '.glb' }[response.headers.get('content-type')?.split(';')[0]];
      const ext = path.extname(url.pathname).match(/^\.[a-z0-9]{1,8}$/i)?.[0] || contentExt || '.bin';
      files.push(await saveResponse(path.resolve(cwd, directory, `output-${i + 1}${ext}`), response, force));
    } finally { cleanup(); }
  }
  let index = outputs.length;
  function extension(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
    if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'webp';
    if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') return 'wav';
    if (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'mp3';
    return 'bin';
  }
  async function embedded(value) {
    if (Array.isArray(value)) { for (const item of value) await embedded(item); }
    else if (value && typeof value === 'object') {
      if (typeof value.b64_json === 'string') {
        const bytes = Buffer.from(value.b64_json, 'base64');
        files.push(await saveBytes(path.resolve(cwd, directory, `output-${++index}.${extension(bytes)}`), bytes, force));
      }
      if (typeof value.audio?.data === 'string') {
        const bytes = Buffer.from(value.audio.data, 'base64');
        files.push(await saveBytes(path.resolve(cwd, directory, `output-${++index}.${extension(bytes)}`), bytes, force));
      }
      if (value.inlineData?.data) {
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'audio/wav': 'wav' }[value.inlineData.mimeType] || 'bin';
        files.push(await saveBytes(path.resolve(cwd, directory, `output-${++index}.${ext}`), Buffer.from(value.inlineData.data, 'base64'), force));
      }
      for (const [key, item] of Object.entries(value)) if (!['b64_json', 'inlineData', 'input', 'inputs', 'request', 'messages'].includes(key)) await embedded(item);
    }
  }
  await embedded(raw);
  return files;
}
