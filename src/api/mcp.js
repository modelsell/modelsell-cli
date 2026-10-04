import { Readable, Writable } from 'node:stream';
import { createInterface } from 'node:readline';

export const MCP_HELP = `
modelsell mcp: Model Context Protocol server over stdio.

Agents get tools to list, inspect, run and resume every ModelSell model.
Credentials come from MODELSELL_API_KEY or modelsell login, never from tool input.

Register it:
  Codex        codex mcp add modelsell -- modelsell mcp
               (or install the ModelSell Codex plugin, which bundles it)
  Claude Code  claude mcp add modelsell -- modelsell mcp
  Gemini CLI   gemini mcp add modelsell modelsell mcp
  Other        command "modelsell", args ["mcp"]

Video and other long jobs can exceed a client's tool timeout. Raise it
(Codex: tool_timeout_sec = 900) or run with wait=false and resume with
modelsell_get_task.
`;

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const string = description => ({ type: 'string', description });
const number = description => ({ type: 'number', description });
const boolean = description => ({ type: 'boolean', description });

export const tools = [
  {
    name: 'modelsell_status',
    description: 'Show the ModelSell API origin and whether an API key is configured. Never returns the key.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    args: () => ['status']
  },
  {
    name: 'modelsell_list_models',
    description: 'Search ModelSell models. With an API key only models that key can call are listed; all=true shows the public catalog, which does not imply access. Returns compact summaries: id, category, endpoints (protocols), modalities and docs links.',
    inputSchema: { type: 'object', properties: {
      query: string('Substring matched against model id, description and category'),
      type: string('Filter by category (text, image, video, audio, 3d, vector), endpoint type or output modality'),
      all: boolean('Show the public catalog instead of models available to the API key'),
      full: boolean('Return full pricing metadata instead of compact summaries')
    } },
    annotations: { readOnlyHint: true },
    args: a => ['models', ...(a.query ? [a.query] : []), ...opt('--type', a.type), ...(a.all ? ['--all'] : []), ...(a.full ? [] : ['--compact'])]
  },
  {
    name: 'modelsell_describe_model',
    description: 'Show the protocol, HTTP path, known parameters, docs_url and metadata for a model before running it. Parameter lists can be partial; documented native fields can still be passed in input.',
    inputSchema: { type: 'object', required: ['model'], properties: {
      model: string('Model ID or project alias'),
      endpoint: string('Explicit protocol, for models that support several (see endpoints in list_models)')
    } },
    annotations: { readOnlyHint: true },
    args: a => ['schema', a.model, ...opt('--endpoint', a.endpoint)]
  },
  {
    name: 'modelsell_run_model',
    description: 'Run a ModelSell model: text, image, video, audio, embeddings, rerank or 3D. The prompt is placed in the right field for the protocol; input passes native parameters unchanged. Async jobs are polled until done unless wait=false. A submission is billable and is never retried: on a timeout, resume with modelsell_get_task instead of running again. Use dry_run to preview the request for free.',
    inputSchema: { type: 'object', required: ['model'], properties: {
      model: string('Model ID or project alias'),
      prompt: string('Prompt text'),
      input: { type: 'object', description: 'Native request fields, e.g. {"size":"1024x1024"} or {"messages":[...]}. Strings starting with @ are read as local files and sent as data URIs.' },
      endpoint: string('Explicit protocol, e.g. anthropic, gemini, image-generation, openai-video, seedance2-native-video, speech, embeddings'),
      files: { type: 'object', additionalProperties: { type: 'string' }, description: 'Multipart uploads as {field: local path}, e.g. {"file": "./speech.wav"} or {"image": "./photo.png"}' },
      download_dir: string('Directory to save generated media into (relative to the server working directory)'),
      output_file: string('Save the raw response here; required for speech, which returns binary audio'),
      wait: boolean('Poll async jobs until finished (default true). false returns a task_id right after submission'),
      timeout_seconds: number('Request and polling limit (default 600)'),
      dry_run: boolean('Return the method, path and body without sending anything')
    } },
    args: a => [
      'run', a.model, ...opt('--prompt', a.prompt), ...opt('--endpoint', a.endpoint),
      ...(a.input ? ['--input-file', '-'] : []),
      ...Object.entries(a.files || {}).flatMap(([field, file]) => [`--file=${field}=${file}`]),
      ...opt('--download', a.download_dir), ...opt('--output', a.output_file), ...opt('--timeout', a.timeout_seconds),
      ...(a.wait === false ? ['--no-wait'] : []), ...(a.dry_run ? ['--dry-run'] : [])
    ],
    stdin: a => a.input && JSON.stringify(a.input)
  },
  {
    name: 'modelsell_get_task',
    description: 'Check or resume an async task (video, music, 3D, Midjourney...) without resubmitting it. wait=true polls until it finishes.',
    inputSchema: { type: 'object', required: ['task_id'], properties: {
      task_id: string('Task ID returned by modelsell_run_model'),
      wait: boolean('Poll until finished (default false: check once)'),
      download_dir: string('Directory to save outputs into once finished'),
      fetch_path: string('Polling path such as /v1/video/generations/{task_id}, for tasks not submitted from this machine'),
      timeout_seconds: number('Polling limit (default 600)')
    } },
    args: a => [a.wait ? 'wait' : 'show', a.task_id, ...opt('--download', a.download_dir), ...opt('--fetch-path', a.fetch_path), ...opt('--timeout', a.timeout_seconds)]
  },
  {
    name: 'modelsell_list_tasks',
    description: 'List async tasks recorded on this machine, newest first.',
    inputSchema: { type: 'object', properties: { limit: number('Maximum tasks (default 20)') } },
    annotations: { readOnlyHint: true },
    args: a => ['history', ...opt('--limit', a.limit)]
  },
  {
    name: 'modelsell_api_request',
    description: 'Call a native ModelSell API path on the configured origin, for features the run tool does not cover. POST requests can be billable.',
    inputSchema: { type: 'object', required: ['path'], properties: {
      path: string('Path beginning with /, e.g. /v1/models'),
      method: string('GET (default), POST, PUT, PATCH, DELETE or HEAD'),
      body: { type: 'object', description: 'JSON body for non-GET requests' }
    } },
    args: a => ['request', a.path, ...opt('--method', a.method), ...(a.body ? ['--input-file', '-'] : [])],
    stdin: a => a.body && JSON.stringify(a.body)
  }
];

// --flag=value keeps values that start with a dash from being read as options.
function opt(flag, value) { return value === undefined || value === null || value === '' ? [] : [`${flag}=${value}`]; }

export async function callTool(name, args, { runAPI, env, flags = {}, cwd, fetch }) {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  if (args === null || typeof args !== 'object' || Array.isArray(args)) throw Object.assign(new Error('Tool arguments must be an object.'), { code: -32602 });
  for (const key of tool.inputSchema.required || []) if (args[key] === undefined || args[key] === '') throw Object.assign(new Error(`Missing argument: ${key}`), { code: -32602 });
  const argv = [...tool.args(args), '--json', ...opt('--base-url', flags['base-url'])];
  let out = '', err = '';
  const input = tool.stdin?.(args);
  const code = await runAPI(argv, env, {
    cwd, fetch, quiet: true,
    stdin: Readable.from(input ? [input] : []),
    stdout: new Writable({ write(chunk, _, done) { out += chunk; done(); } }),
    stderr: new Writable({ write(chunk, _, done) { err += chunk; done(); } })
  });
  let text = out.trim() || err.trim() || '{}';
  // Report an unfinished poll as a resumable state rather than a failure.
  try {
    const result = JSON.parse(text);
    if (code && /^Polling timed out/.test(result.error?.message || '')) {
      text = JSON.stringify({ status: 'pending', task_id: result.error.task_id, fetch_path: result.error.fetch_path, next: 'Call modelsell_get_task with wait=true. Do not run the model again.' }, null, 2);
      return { content: [{ type: 'text', text }], isError: false };
    }
  } catch { /* plain-text output */ }
  return { content: [{ type: 'text', text }], isError: code !== 0 };
}

export async function serveMCP({ runAPI, env, flags, stdin, stdout, stderr, cwd, fetch }) {
  const send = message => stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  const pending = new Set();
  const lines = createInterface({ input: stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); }
    catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    const work = handle(message).then(result => {
      if (message.id !== undefined && result !== undefined) send({ id: message.id, result });
    }, error => {
      if (message.id !== undefined) send({ id: message.id, error: { code: error.code || -32603, message: error.message } });
      else stderr.write(`modelsell mcp: ${error.message}\n`);
    });
    pending.add(work); work.finally(() => pending.delete(work));
  }
  await Promise.all(pending);
  return 0;

  async function handle({ method, params = {}, id }) {
    if (method === 'initialize') {
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'modelsell', version: '0.3.0' },
        instructions: 'Use modelsell_list_models to find a model, modelsell_describe_model to see its parameters and docs, then modelsell_run_model. Never resubmit a billable job after a timeout; resume it with modelsell_get_task.'
      };
    }
    if (method === 'ping') return {};
    if (method === 'tools/list') return { tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) })) };
    if (method === 'tools/call') return callTool(params.name, params.arguments || {}, { runAPI, env, flags, cwd, fetch });
    if (method?.startsWith('notifications/')) return undefined;
    if (id === undefined) return undefined;
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}
