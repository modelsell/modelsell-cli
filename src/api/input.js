import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const booleans = new Set(['json', 'help', 'stream', 'no-wait', 'dry-run', 'all', 'key-stdin', 'multipart', 'force']);
const values = new Set(['base-url', 'endpoint', 'input-file', 'input', 'prompt', 'output', 'download', 'timeout', 'poll-interval', 'type', 'method', 'path', 'fetch-path', 'header', 'file', 'target', 'limit', 'default-model']);
const repeat = new Set(['input', 'header', 'file']);
const short = { h: 'help', p: 'prompt', i: 'input', o: 'output', H: 'header' };
export function parseArgs(args) {
  const flags = {}, dynamic = {}, positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { positional.push(...args.slice(i + 1)); break; }
    if (!arg.startsWith('-')) { positional.push(arg); continue; }
    const match = arg.match(/^--?([^=]+)(?:=(.*))?$/s);
    if (!match) throw new Error(`Invalid option: ${arg}`);
    const key = short[match[1]] || match[1];
    let value = match[2];
    if (booleans.has(key)) {
      if (value !== undefined) throw new Error(`--${key} does not accept a value`);
      flags[key] = true; continue;
    }
    if (value === undefined) {
      value = args[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    }
    if (values.has(key)) {
      if (repeat.has(key)) (flags[key] ||= []).push(value); else flags[key] = value;
    } else dynamic[key.replaceAll('-', '_')] = value;
  }
  return { flags, dynamic, positional };
}

export function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function safeObject(value) {
  if (!object(value)) throw new Error('Input JSON must be an object.');
  return value;
}
export function parseValue(value) { try { return JSON.parse(value); } catch { return value; } }
export function setInput(target, key, value) {
  const parts = key.split('.');
  if (parts.some(p => !p || ['__proto__', 'constructor', 'prototype'].includes(p))) throw new Error(`Invalid input key: ${key}`);
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (cursor[part] !== undefined && !object(cursor[part])) throw new Error(`Conflicting input: ${key}`);
    cursor = cursor[part] ||= {};
  }
  cursor[parts.at(-1)] = value;
}

export async function readStdin(stdin) {
  let text = '';
  for await (const chunk of stdin) text += chunk;
  return text;
}

export async function buildInput(flags, dynamic, defaults, stdin, cwd, parameters = {}) {
  let body = { ...defaults };
  if (flags['input-file']) {
    const raw = flags['input-file'] === '-' ? await readStdin(stdin) : await readFile(path.resolve(cwd, flags['input-file']), 'utf8');
    body = { ...body, ...safeObject(JSON.parse(raw)) };
  }
  for (const pair of flags.input || []) {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error('Use -i key=value (repeatable).');
    setInput(body, pair.slice(0, eq), parseValue(pair.slice(eq + 1)));
  }
  for (const [key, value] of Object.entries(dynamic)) {
    if (!Object.hasOwn(parameters, key)) throw new Error(`Unknown flag --${key.replaceAll('_', '-')}. Use -i ${key}=value for native/provider parameters, or schema to inspect inputs.`);
    setInput(body, key, parameters[key].type === 'string' ? value : parseValue(value));
  }
  if (flags.prompt !== undefined) body.prompt = flags.prompt;
  return body;
}

const mimes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
export async function localFile(filename, cwd) {
  const file = path.resolve(cwd, filename);
  if ((await stat(file)).size > 100 * 1024 * 1024) throw new Error('Local files must be at most 100 MiB. Use a hosted URL for larger media.');
  return { bytes: await readFile(file), name: path.basename(file), mime: mimes[path.extname(file).toLowerCase()] || 'application/octet-stream' };
}

export async function encodeBody(body, flags, cwd) {
  if (flags.multipart || flags.file?.length) {
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) form.append(key, object(value) || Array.isArray(value) ? JSON.stringify(value) : String(value));
    for (const pair of flags.file || []) {
      const eq = pair.indexOf('=');
      if (eq < 1) throw new Error('Use --file field=./path (repeatable).');
      const f = await localFile(pair.slice(eq + 1), cwd);
      form.append(pair.slice(0, eq), new Blob([f.bytes], { type: f.mime }), f.name);
    }
    return form;
  }
  // Only explicit @ markers read files; strings without @ pass through unchanged.
  async function visit(value) {
    if (typeof value === 'string' && value.startsWith('@@')) return value.slice(1);
    if (typeof value === 'string' && value.startsWith('@')) {
      const f = await localFile(value.slice(1), cwd);
      return `data:${f.mime};base64,${f.bytes.toString('base64')}`;
    }
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (object(value)) return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await visit(v)])));
    return value;
  }
  return JSON.stringify(await visit(body));
}
