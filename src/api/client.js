import { setTimeout as sleep } from 'node:timers/promises';

export class APIError extends Error {
  constructor(message, details = {}) { super(message); this.details = details; }
}
export function apiURL(base, route) {
  if (!route?.startsWith('/') || route.startsWith('//') || /[\\\r\n#]/.test(route)) throw new Error('API path must be a relative path beginning with a single /.');
  const baseURL = new URL(base);
  const url = new URL(base.replace(/\/$/, '') + route);
  if (url.origin !== baseURL.origin) throw new Error('API requests must stay on the configured origin.');
  return url;
}
export function headersFrom(flags) {
  const headers = {};
  for (const pair of flags.header || []) {
    const i = pair.indexOf(':');
    if (i < 1) throw new Error('Use --header Name:value.');
    const name = pair.slice(0, i).trim();
    if (/^(authorization|x-api-key|x-goog-api-key|host|cookie|content-length)$/i.test(name)) throw new Error(`Header ${name} is managed by the CLI.`);
    headers[name] = pair.slice(i + 1).trim();
  }
  return headers;
}
export function positiveNumber(value, fallback, name) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number.`);
  return n;
}
export function businessError(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.error || data.success === false || data.code === false || (typeof data.code === 'number' && ![0, 1, 21, 22, 200].includes(data.code)) || (typeof data.code === 'string' && !['success', 'SUCCESS', 'ok', '0', '200'].includes(data.code))) {
    return data.error?.message || data.message || data.msg || data.description || String(data.error || data.code || 'API request failed');
  }
  return null;
}
export class Client {
  constructor(settings, options = {}) {
    Object.assign(this, settings);
    this.timeout = options.timeout || 120000;
    this.fetch = options.fetch || globalThis.fetch;
    this.signal = options.signal;
  }
  async request(route, { method = 'GET', body, headers = {}, auth = true, raw = false } = {}) {
    if (auth && !this.apiKey) throw new Error('Set MODELSELL_API_KEY or run modelsell login.');
    const url = apiURL(this.baseUrl, route);
    const controller = new AbortController();
    const abort = () => controller.abort(this.signal.reason);
    this.signal?.addEventListener('abort', abort, { once: true });
    if (this.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error('Request timed out; a submitted generation may still be running. Do not blindly resubmit.')), this.timeout);
    const cleanup = () => { clearTimeout(timer); this.signal?.removeEventListener('abort', abort); };
    try {
      const response = await this.fetch(url, {
        method, body, redirect: 'error', signal: controller.signal,
        headers: { 'User-Agent': 'modelsell-cli/0.2.0', ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...headers, ...(auth ? { Authorization: `Bearer ${this.apiKey}` } : {}) }
      });
      if (!response.ok) {
        const text = await response.text();
        let data; try { data = JSON.parse(text); } catch { /* non-JSON gateway failure */ }
        throw new APIError(data?.error?.message || data?.message || `HTTP ${response.status} ${response.statusText}`, { status: response.status, request_id: response.headers.get('x-oneapi-request-id') || undefined });
      }
      if (raw) return { response, cleanup };
      const data = await response.json();
      const error = businessError(data);
      if (error) throw new APIError(error, { request_id: response.headers.get('x-oneapi-request-id') || undefined });
      cleanup();
      return data;
    } catch (error) { cleanup(); throw error; }
  }
  async json(route, body, options = {}) { return this.request(route, { method: 'POST', body: JSON.stringify(body), ...options }); }
}
export { sleep };
