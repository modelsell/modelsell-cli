import { readFile, readdir, lstat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { Client, APIError, apiURL, headersFrom, positiveNumber, businessError } from './api/client.js';
import { loadSettings, saveJSON, readJSON } from './api/config.js';
import { parseArgs, buildInput, encodeBody, readStdin, safeObject } from './api/input.js';
import { catalog, summarizeModel } from './api/catalog.js';
import { serveMCP, MCP_HELP } from './api/mcp.js';
import { protocols, resolveProtocol, prepareRequest } from './api/protocols.js';
import { taskState, rememberTask, recalledTask, waitTask, extractOutputs, extractText, saveBytes, saveResponse, downloadOutputs } from './api/tasks.js';
import { consumeSSE, realtime } from './api/stream.js';
import { agentSkill } from './api/skill.js';

export const API_COMMANDS = new Set(['login', 'logout', 'status', 'models', 'schema', 'endpoints', 'run', 'request', 'show', 'wait', 'history', 'usage', 'price', 'download', 'upload', 'init', 'aliases', 'skill', 'realtime', 'mcp']);
export const API_HELP = `
Model invocation / 模型调用:
  modelsell login [--key-stdin]             Validate and save an API key
  modelsell models [query] [--type video]   Live catalog; --all public, --compact brief
  modelsell run [model|alias] -p "..."      Run text, image, video, audio or 3D models
  modelsell run <model> --help              Model endpoint and parameter help
  modelsell schema <model> [--json]         Live metadata + protocol defaults
  modelsell endpoints                      List protocol adapters
  modelsell show <task-id>                 Retrieve a saved task
  modelsell wait <task-id>                  Resume polling without resubmission
  modelsell request /path [options]        Native HTTP API; default method GET
  modelsell realtime <model>               WebSocket JSONL input/output
  modelsell upload --input-file asset.json POST /api/assets/upload (provider-specific)
  modelsell download <url> --output file   Save an output
  modelsell usage                          API-key quota, in server quota units
  modelsell price <model>                  Public pricing metadata (not a quote)
  modelsell history                       Locally recorded tasks
  modelsell init                          Create modelsell.json for aliases/defaults
  modelsell aliases                       List project aliases
  modelsell skill install                 Install project skill for Codex/Claude
  modelsell mcp                           MCP server (stdio) for agents; mcp --help
  modelsell status | logout                Inspect/clear model API login

Run options:
  -p, --prompt TEXT             Prompt shortcut for the selected protocol
  -i, --input KEY=VALUE         Repeatable native parameters; JSON values allowed
  --input-file FILE|-          Full JSON object from a file or stdin
  --endpoint TYPE              Explicit protocol (see endpoints)
  --path /PATH                 Explicit native submit path
  --file FIELD=PATH            Multipart local file (repeatable)
  --multipart                  Multipart fields without files
  --stream                     Stream text; with --json emits JSONL events
  --no-wait                    Submit and return the task ID
  --fetch-path /tasks/{task_id} Override task polling path (GET)
  --dry-run                    Preview method/path/body without submitting
  --output FILE                Save raw response (required for speech audio)
  --download DIR               Download output URLs/base64 media to a directory
  --json                       One JSON result; progress goes to stderr
  --timeout SECONDS            Request / task wait limit (default 600)
  --poll-interval SECONDS      Task polling interval (default 2)
  --base-url URL               API origin; credentials never read from projects
  -H, --header NAME:VALUE      Additional protocol header
  --force                      Allow overwriting output files

Auth: MODELSELL_API_KEY, MODELSELL_BASE_URL; Node.js 18+ or packaged binary.
Existing modelsell configure / config commands still configure Agent tools.
`;

async function hiddenKey(stdin, stderr) {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error('Use MODELSELL_API_KEY or login --key-stdin in non-interactive environments.');
  stderr.write('ModelSell API key (hidden): ');
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true); stdin.resume();
  return new Promise((resolve, reject) => {
    let key = '';
    const finish = (error) => {
      stdin.off('data', onData); stdin.setRawMode(wasRaw); stdin.pause(); stderr.write('\n');
      error ? reject(error) : resolve(key.trim());
    };
    const onData = chunk => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') return finish(new Error('Login cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') key = key.slice(0, -1);
        else if (char >= ' ') key += char;
      }
    };
    stdin.on('data', onData);
  });
}

export async function runAPI(argv, env = process.env, io = {}) {
  const startedAt = Date.now();
  const stdout = io.stdout || process.stdout, stderr = io.stderr || process.stderr, stdin = io.stdin || process.stdin;
  const write = text => stdout.write(text);
  const emit = value => write(JSON.stringify(value, null, 2) + '\n');
  const progress = text => { if (!io.quiet) stderr.write(text + '\n'); };
  const cwd = io.cwd || process.cwd();
  let settings, flags = { json: argv.includes('--json') };
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort(new Error('Cancelled. Submitted tasks can still be queried.'));
  process.once('SIGINT', cancel);
  try {
    const command = argv[0];
    const parsed = parseArgs(argv.slice(1)); flags = parsed.flags;
    const [arg, ...rest] = parsed.positional;
    if (rest.length) throw new Error('Too many positional arguments.');
    if (command === 'mcp') {
      if (flags.help) { flags.json ? emit({ help: MCP_HELP }) : write(MCP_HELP); return 0; }
      if (arg || Object.keys(parsed.dynamic).length) throw new Error('Use modelsell mcp [--base-url URL].');
      return await serveMCP({ runAPI, env, flags, stdin, stdout, stderr, cwd, fetch: io.fetch });
    }
    if (flags.help && (!['run', 'schema'].includes(command) || !arg)) { flags.json ? emit({ help: API_HELP }) : write(API_HELP); return 0; }
    if (!['run', 'request', 'upload'].includes(command) && Object.keys(parsed.dynamic).length) throw new Error(`Unknown option: ${Object.keys(parsed.dynamic)[0]}`);
    settings = await loadSettings(env, flags, cwd);
    const timeout = positiveNumber(flags.timeout, 600, '--timeout') * 1000;
    const interval = positiveNumber(flags['poll-interval'], 2, '--poll-interval') * 1000;
    const client = new Client(settings, { timeout, fetch: io.fetch, signal: cancellation.signal });
    const headers = headersFrom(flags);
    const output = (value, human) => flags.json ? emit(value) : write((human === undefined ? JSON.stringify(value, null, 2) : human) + '\n');

    if (command === 'status') {
      output({ base_url: settings.baseUrl, authenticated: Boolean(settings.apiKey), credential_source: env.MODELSELL_API_KEY ? 'environment' : settings.apiKey ? 'stored' : 'none', config_dir: settings.dir }); return 0;
    }
    if (command === 'login') {
      const apiKey = (flags['key-stdin'] ? await readStdin(stdin) : env.MODELSELL_API_KEY || await hiddenKey(stdin, stderr)).trim();
      if (!apiKey || /\s/.test(apiKey)) throw new Error('Enter a single non-empty API key.');
      client.apiKey = apiKey; settings.apiKey = apiKey;
      const validation = await client.request('/v1/models');
      if (!Array.isArray(validation.data)) throw new Error('API key validation returned an invalid model list.');
      await saveJSON(path.join(settings.dir, 'credentials.json'), { baseUrl: settings.baseUrl, apiKey });
      output({ authenticated: true, base_url: settings.baseUrl }, 'API key validated and saved.'); return 0;
    }
    if (command === 'logout') {
      await saveJSON(path.join(settings.dir, 'credentials.json'), {});
      output({ stored_credentials_removed: true, environment_key_active: Boolean(env.MODELSELL_API_KEY) }); return 0;
    }
    if (command === 'init') {
      const file = path.join(cwd, 'modelsell.json');
      await saveBytes(file, JSON.stringify({ defaultModel: flags['default-model'] || '', aliases: {} }, null, 2) + '\n', flags.force);
      output({ file }); return 0;
    }
    if (command === 'aliases') { output(settings.project.aliases || {}); return 0; }
    if (command === 'skill') {
      if (arg !== 'install') throw new Error('Use modelsell skill install [--target codex|claude|all].');
      const targets = flags.target || 'all';
      if (!['all', 'codex', 'claude'].includes(targets)) throw new Error('Skill target must be codex, claude, or all.');
      const files = (targets === 'all' ? ['.agents', '.claude'] : [targets === 'codex' ? '.agents' : '.claude']).map(d => path.join(cwd, d, 'skills/modelsell/SKILL.md'));
      for (const file of files) {
        let current; try { current = await readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        if (current !== undefined && current !== agentSkill && !flags.force) throw new Error(`Skill already exists: ${file}. Use --force to replace it.`);
      }
      for (const file of files) await saveBytes(file, agentSkill, true);
      output({ files }); return 0;
    }
    if (command === 'usage') { output(await client.request('/api/usage/token/')); return 0; }
    if (command === 'history') {
      const dir = path.join(settings.dir, 'tasks');
      let names = []; try { names = await readdir(dir); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const records = await Promise.all(names.filter(n => n.endsWith('.json')).map(n => readJSON(path.join(dir, n), null)));
      output({ scope: 'local', tasks: records.filter(r => r?.base_url === settings.baseUrl).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, positiveNumber(flags.limit, 20, '--limit')).map(({ raw, ...r }) => r) }); return 0;
    }
    if (command === 'download') {
      if (!arg || !flags.output) throw new Error('Use modelsell download URL --output FILE.');
      const url = new URL(arg), base = new URL(settings.baseUrl);
      let response, cleanup = () => {};
      if (url.origin === base.origin) {
        const basePath = base.pathname.replace(/\/$/, '');
        if (!url.pathname.startsWith(basePath + '/')) throw new Error('Download path is outside API base.');
        ({ response, cleanup } = await client.request(url.pathname.slice(basePath.length) + url.search, { raw: true }));
      } else {
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('External download requires an HTTPS URL without credentials.');
        response = await client.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeout) });
      }
      try {
        if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
        output({ file: await saveResponse(path.resolve(cwd, flags.output), response, flags.force) });
      } finally { cleanup(); }
      return 0;
    }
    if (command === 'realtime') {
      if (!arg) throw new Error('Use modelsell realtime MODEL.');
      await realtime(client, arg, { stdin, write, signal: cancellation.signal, headers }); return 0;
    }

    let model, protocol, body, route, method = 'POST', record;
    if (['show', 'wait'].includes(command)) {
      if (!arg) throw new Error('A task ID is required.');
      record = await recalledTask(settings, arg);
      if (record && record.base_url !== settings.baseUrl) throw new Error('Task belongs to a different API origin.');
      if (flags['fetch-path']) record = { created_at: new Date().toISOString(), ...record, id: arg, fetch_path: flags['fetch-path'].replaceAll('{task_id}', encodeURIComponent(arg)), fetch_method: 'GET' };
      if (!record?.fetch_path) throw new Error('Task is not in local history. Supply --fetch-path /path/{task_id}.');
      record.raw = await client.request(record.fetch_path, { method: record.fetch_method || 'GET' });
      const raw = command === 'wait' ? await poll(record) : record.raw;
      await finish(raw, record.model, record);
      return 0;
    }
    if (['request', 'upload'].includes(command)) {
      route = flags.path || (command === 'upload' ? '/api/assets/upload' : arg);
      if (!route) throw new Error('Use modelsell request /path.');
      method = (flags.method || (command === 'upload' ? 'POST' : 'GET')).toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) throw new Error('Unsupported HTTP method.');
      body = await buildInput(flags, parsed.dynamic, {}, stdin, cwd);
      if (['GET', 'HEAD'].includes(method) && (Object.keys(body).length || flags.file?.length || flags.multipart)) throw new Error('GET/HEAD cannot send a body; use query parameters in the path.');
    } else {
      const data = await catalog(client, { all: flags.all || ['schema', 'price', 'endpoints'].includes(command) || flags.help });
      if (data.warning) progress(data.warning);
      if (command === 'models') {
        const query = (arg || '').toLowerCase();
        const models = data.models.filter(m => (!query || [m.id, m.description, m.category].some(v => String(v || '').toLowerCase().includes(query))) && (!flags.type || m.category === flags.type || m.supported_endpoint_types?.includes(flags.type) || m.output_modalities?.includes(flags.type)));
        output({ scope: data.scope, models: flags.compact ? models.map(summarizeModel) : models }, models.map(m => `${m.id}\t${m.category || ''}\t${(m.supported_endpoint_types || []).join(',')}`).join('\n')); return 0;
      }
      if (command === 'endpoints') { output({ protocol_adapters: protocols, live_endpoints: data.endpoints }); return 0; }
      const token = arg || settings.project.defaultModel;
      const alias = settings.project.aliases?.[token];
      model = alias?.model || token;
      if (!model || typeof model !== 'string') throw new Error('Specify a model ID or set defaultModel in modelsell.json.');
      const entry = data.models.find(m => m.id === model);
      if (!entry && !['schema', 'price'].includes(command) && !flags.help && !flags.endpoint && !flags.path) throw new Error(`Model ${model} is not in the available catalog. Check models or explicitly select --endpoint.`);
      if (command === 'price') {
        if (!entry) throw new Error('No public pricing metadata for this model.');
        output({ model, kind: 'public-pricing-metadata', quote: false, note: 'Group/account-specific prices and usage determine the actual charge. Ratios and quotas are server units.', pricing: entry }); return 0;
      }
      protocol = flags.path ? { type: 'native', path: flags.path, method: flags.method || 'POST', parameters: {} } : resolveProtocol(model, entry, data.endpoints, flags.endpoint || alias?.endpoint);
      if (command === 'schema' || flags.help) {
        const info = { model, endpoint: protocol, model_metadata: entry || null, note: 'Endpoint schemas may be partial. -i and --input-file pass native fields unchanged.' };
        output(info, `${model}\n${protocol.method} ${protocol.path}\nSchema: ${protocol.schema_source || 'native'} (may be partial)\n` + Object.entries(protocol.parameters || {}).map(([k, s]) => `  --${k.replaceAll('_', '-')}\t${s.type || 'any'}${s.required ? ' (required)' : ''}\t${s.description || ''}${s.enum ? ' [' + s.enum.join(', ') + ']' : ''}`).join('\n') + '\nUse -i key=value or --input-file FILE for all native fields.'); return 0;
      }
      if (protocol.websocket) throw new Error(`Use modelsell realtime ${model} for JSONL WebSocket events.`);
      body = await buildInput(flags, parsed.dynamic, safeObject(alias?.input || {}), stdin, cwd, protocol.parameters);
      ({ route, body } = prepareRequest(protocol, model, body, flags.stream));
      method = protocol.method || 'POST';
      if (protocol.multipart) flags.multipart = true;
      if (protocol.binary && !flags.output) throw new Error('Speech returns binary audio. Specify --output FILE before submitting.');
      if (['transcription', 'translation', 'openai-image-edit'].includes(protocol.type) && !(flags.file || []).some(f => f.startsWith(protocol.type === 'openai-image-edit' ? 'image=' : 'file='))) throw new Error('This endpoint requires --file image=PATH (image edit) or --file file=PATH (audio).');
    }
    apiURL(settings.baseUrl, route);
    if (flags['fetch-path']) apiURL(settings.baseUrl, flags['fetch-path'].replaceAll('{task_id}', 'preview'));
    if (flags.stream && (flags.output || flags.download)) throw new Error('Use shell redirection for streams; --output/--download are for non-stream responses.');
    if (flags['dry-run']) { output({ model, method, path: route, body, files: flags.file || [], multipart: Boolean(flags.multipart), submit: false }); return 0; }
    if (flags.output) {
      const file = path.resolve(cwd, flags.output);
      try {
        const stat = await lstat(file);
        if (!flags.force || !stat.isFile()) throw new Error(`Output already exists: ${file}. Choose a new file or use --force for regular files.`);
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      // Check the nearest existing parent before a potentially billable submission.
      let parent = path.dirname(file);
      while (true) {
        try { await access(parent, constants.W_OK); break; }
        catch (error) { if (error.code !== 'ENOENT' || parent === path.dirname(parent)) throw error; parent = path.dirname(parent); }
      }
    }
    const encoded = ['GET', 'HEAD'].includes(method) ? undefined : await encodeBody(body, flags, cwd);
    const { response, cleanup } = await client.request(route, { method, body: encoded, headers: { ...protocol?.headers, ...headers }, raw: true });
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) { await consumeSSE(response, { json: flags.json, write }); return 0; }
      if (!contentType.includes('json')) {
        if (flags.output) output({ model, file: await saveResponse(path.resolve(cwd, flags.output), response, flags.force), content_type: contentType });
        else if (/^(text\/|$)/.test(contentType)) { const text = await response.text(); output({ response: text }, text); }
        else throw new Error('Binary response requires --output FILE.');
        return 0;
      }
      let raw = await response.json();
      cleanup();
      const error = businessError(raw);
      if (error) throw new APIError(error, { response: raw });
      const state = taskState(raw);
      const fetchPath = flags['fetch-path'] || protocol?.fetch_path;
      // An image request ID is not always a task ID; only poll pending/task-shaped responses.
      const pending = state.id && fetchPath && (flags['fetch-path'] || state.status || raw.task_id || raw.taskId || typeof raw.data === 'string' || typeof raw.result === 'string' || raw.output?.task_id || raw.data?.task_id || ['seedance2-native-video', 'videos', 'openai-video', 'dashscope.tripo.3d'].includes(protocol?.type));
      if (pending) {
        record = { id: String(state.id), model, endpoint: protocol?.type, fetch_path: fetchPath.replaceAll('{task_id}', encodeURIComponent(state.id)), fetch_method: protocol?.fetch_method || 'GET', created_at: new Date().toISOString(), raw };
        try { await rememberTask(settings, record); }
        catch (error) { throw new APIError(`Task submitted, but local history could not be saved: ${error.message}`, { task_id: record.id, fetch_path: record.fetch_path }); }
        progress(`Task submitted: ${record.id}. Resume: modelsell wait ${record.id}`);
        if (!flags['no-wait']) raw = await poll(record);
      }
      await finish(raw, model, record);
    } finally { cleanup(); }
    return 0;

    async function poll(task) {
      try { return await waitTask(client, task, { timeout, interval, signal: cancellation.signal, progress }); }
      catch (error) {
        if (error.details?.response) await rememberTask(settings, { ...task, status: taskState(error.details.response).status, raw: error.details.response });
        throw error;
      }
    }

    async function finish(raw, modelName, task) {
      const state = taskState(raw);
      if (task) await rememberTask(settings, { ...task, status: state.status, raw });
      if (state.failed) throw new APIError(state.reason || 'Task failed.', { task_id: task?.id || state.id, response: raw });
      const result = { ...(modelName ? { model: modelName } : {}), ...(task ? { task_id: task.id, status: state.status || 'submitted', fetch_path: task.fetch_path } : {}), elapsed_ms: Date.now() - startedAt, outputs: extractOutputs(raw), response: raw };
      if (flags.output) result.file = await saveBytes(path.resolve(cwd, flags.output), JSON.stringify(raw, null, 2) + '\n', flags.force);
      if (flags.download) result.files = await downloadOutputs(client, raw, flags.download, cwd, flags.force);
      output(result, extractText(raw) || result.outputs.join('\n') || JSON.stringify(result, null, 2));
    }
  } catch (error) {
    let message = error.message || String(error);
    const redact = value => {
      let text = JSON.stringify(value);
      for (const secret of [settings?.apiKey, env.MODELSELL_API_KEY].filter(Boolean)) text = text.split(secret).join('[REDACTED]');
      return JSON.parse(text);
    };
    const failure = redact({ error: { message, ...error.details } });
    if (flags.json) {
      if (flags.stream || argv[0] === 'realtime') write(JSON.stringify(failure) + '\n');
      else emit(failure);
    } else stderr.write(`Error: ${failure.error.message}${failure.error.task_id ? ` (task: ${failure.error.task_id})` : ''}\n`);
    return cancellation.signal.aborted ? 130 : 1;
  } finally { process.removeListener('SIGINT', cancel); }
}
