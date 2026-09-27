import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

export function configDir(env) {
  return env.MODELSELL_CONFIG_DIR || path.join(env.XDG_CONFIG_HOME || path.join(env.HOME || env.USERPROFILE || os.homedir(), '.config'), 'modelsell');
}

export async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error(`Cannot read ${file}: ${error.message}`); }
}

export async function saveJSON(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(tmp, file);
  await chmod(file, 0o600);
}

export function normalizeBase(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL must not contain credentials, query parameters, or fragments.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Use HTTPS for the API URL (HTTP is allowed on localhost).');
  }
  return url.toString().replace(/\/+$/, '').replace(/\/v1$/, '');
}

export async function loadSettings(env, flags, cwd) {
  const dir = configDir(env);
  const stored = await readJSON(path.join(dir, 'credentials.json'), {});
  const project = await readJSON(path.join(cwd, 'modelsell.json'), {});
  // Project files may define aliases, never a credential destination.
  const baseUrl = normalizeBase(flags['base-url'] || env.MODELSELL_BASE_URL || stored.baseUrl || 'https://www.modelsell.com');
  const apiKey = env.MODELSELL_API_KEY || (stored.baseUrl === baseUrl ? stored.apiKey : '') || '';
  return { dir, baseUrl, apiKey, project, stored };
}
