const field = (type, description, required = false) => ({ type, description, ...(required ? { required } : {}) });
const text = field('string', 'Text prompt');
const messages = field('array', 'Messages including text, tools, images or audio', true);
const chatFields = { messages, temperature: field('number', 'Sampling temperature'), max_tokens: field('integer', 'Maximum output tokens'), tools: field('array', 'Tool definitions'), stream: field('boolean', 'Stream events'), response_format: field('object', 'Output format') };
const imageFields = { prompt: text, size: field('string', 'Image size'), n: field('integer', 'Number of images'), image: field('string', 'URL or @file (data URI)'), response_format: field('string', 'url or b64_json') };
const videoFields = { prompt: text, duration: field('number', 'Duration in seconds (provider dependent)'), seconds: field('integer', 'Duration for compatible providers'), size: field('string', 'Video size'), image: field('string', 'Reference image URL or @file'), images: field('array', 'Reference images'), metadata: field('object', 'Provider-specific options') };
const def = (path, parameters = {}, extra = {}) => ({ path, method: 'POST', parameters, schema_source: 'protocol-defaults', ...extra });

export const protocols = {
  openai: def('/v1/chat/completions', chatFields),
  'openai-response': def('/v1/responses', { input: field('string', 'Text or input items', true), instructions: text, tools: field('array', 'Tools'), max_output_tokens: field('integer', 'Output limit') }),
  'openai-response-compact': def('/v1/responses/compact', { input: field('array', 'Conversation items', true) }),
  'openai-alpha-search': def('/v1/alpha/search', { query: text }),
  completions: def('/v1/completions', { prompt: text, max_tokens: field('integer', 'Output limit') }),
  anthropic: def('/v1/messages', { ...chatFields, max_tokens: field('integer', 'Required output limit', true), system: text }, { headers: { 'anthropic-version': '2023-06-01' } }),
  gemini: def('/v1beta/models/{model}:generateContent', { contents: field('array', 'Native Gemini contents', true), generationConfig: field('object', 'Generation configuration'), tools: field('array', 'Tools') }, { modelInPath: true }),
  'gemini-image-generation': def('/v1beta/models/{model}:predict', { instances: field('array', 'Prediction inputs', true), parameters: field('object', 'Prediction options') }, { modelInPath: true }),
  'gemini-embedding': def('/v1beta/models/{model}:embedContent', { content: field('object', 'Content to embed', true), taskType: text }, { modelInPath: true }),
  'image-generation': def('/v1/images/generations', imageFields, { fetch_path: '/v1/tasks/{task_id}' }),
  'openai-image-edit': def('/v1/images/edits', { ...imageFields, mask: text }, { multipart: true, fetch_path: '/v1/tasks/{task_id}' }),
  embeddings: def('/v1/embeddings', { input: field('string', 'Text or array of inputs', true), dimensions: field('integer', 'Vector dimensions') }),
  'jina-rerank': def('/v1/rerank', { query: text, documents: field('array', 'Documents', true), top_n: field('integer', 'Result count') }),
  moderations: def('/v1/moderations', { input: field('string', 'Moderation input', true) }),
  speech: def('/v1/audio/speech', { input: field('string', 'Text to speak', true), voice: text, response_format: field('string', 'mp3, wav, etc.'), speed: field('number', 'Playback speed') }, { binary: true }),
  transcription: def('/v1/audio/transcriptions', { language: text, response_format: text, prompt: text }, { multipart: true }),
  translation: def('/v1/audio/translations', { response_format: text, prompt: text }, { multipart: true }),
  'openai-video': def('/v1/video/generations', videoFields, { fetch_path: '/v1/video/generations/{task_id}' }),
  videos: def('/v1/videos', videoFields, { fetch_path: '/v1/videos/{task_id}' }),
  'seedance2-native-video': def('/api/v3/contents/generations/tasks', { content: field('array', 'Native text/image/video/audio items', true), duration: field('integer', 'Seconds'), ratio: text, resolution: text, watermark: field('boolean', 'Watermark'), generate_audio: field('boolean', 'Generate audio') }, { fetch_path: '/api/v3/contents/generations/tasks/{task_id}' }),
  'dashscope.tripo.3d': def('/api/v1/services/aigc/video-generation/3d-generation', { input: field('object', 'Native Tripo inputs', true), parameters: field('object', 'Native parameters') }, { fetch_path: '/api/v1/tasks/{task_id}' }),
  // The public /kling metadata is a family prefix, not a callable submit path.
  kling: def('/v1/video/generations', videoFields, { fetch_path: '/v1/video/generations/{task_id}' }),
  suno: def('/suno/submit/music', { prompt: text, gpt_description_prompt: text, mv: text, title: text, tags: text, make_instrumental: field('boolean', 'Instrumental only') }, { fetch_path: '/suno/fetch/{task_id}', noModel: true }),
  midjourney: def('/mj/submit/imagine', { prompt: text, base64Array: field('array', 'Reference image data URIs'), taskId: text, customId: text }, { fetch_path: '/mj/task/{task_id}/fetch', noModel: true }),
  realtime: def('/v1/realtime', {}, { websocket: true })
};

export function chooseProtocol(model, entry = {}) {
  if (model.startsWith('suno_')) return 'suno';
  if (model.startsWith('mj_')) return 'midjourney';
  if (/realtime/i.test(model)) return 'realtime';
  const types = entry.supported_endpoint_types || [];
  const specific = types.find(t => !['openai', 'anthropic', 'gemini', 'openai-response', 'openai-response-compact'].includes(t));
  if (specific) return specific;
  if (entry.category === 'video') return 'openai-video';
  if (/rerank/i.test(model)) return 'jina-rerank';
  if (entry.category === 'vector' || /embedding/i.test(model)) return types.includes('gemini') && model.startsWith('gemini') ? 'gemini-embedding' : 'embeddings';
  // MiMo audio is carried in Chat Completions; do not send it to /audio/*.
  if (/^mimo-/i.test(model)) return 'openai';
  if (/^(tts-|gpt-.*-tts)/i.test(model)) return 'speech';
  if (/whisper|transcribe/i.test(model)) return 'transcription';
  if (entry.category === 'image') return 'image-generation';
  if (types.includes('openai-response') && !types.includes('openai')) return 'openai-response';
  if (types.includes('openai')) return 'openai';
  return types[0] || null;
}

export function resolveProtocol(model, entry, endpointMap, selected) {
  const type = selected || chooseProtocol(model, entry);
  if (!type) throw new Error(`No protocol metadata for ${model}. Choose --endpoint or use modelsell request.`);
  const builtin = protocols[type];
  // Per-model metadata can carry its own submit/fetch paths and docs; prefer it over the global map.
  const advertised = entry?.supported_endpoints?.[type] || endpointMap[type];
  if (!builtin && !advertised) throw new Error(`Unknown endpoint ${type}. Use modelsell endpoints or --path /native/path.`);
  const live = typeof advertised === 'string' ? { path: advertised } : (advertised || {});
  const config = live.config || {};
  const result = { ...builtin, ...live, type,
    path: type === 'kling' ? builtin.path : config.submit_path || live.path || builtin?.path,
    fetch_path: config.fetch_path || builtin?.fetch_path,
    fetch_method: config.fetch_method || 'GET',
    parameters: { ...builtin?.parameters, ...config.parameters },
    schema_source: config.parameters ? 'live-endpoint-metadata' : 'protocol-defaults',
    ...(live.docs_url ? { docs_url: live.docs_url } : {})
  };
  if (type === 'seedance2-native-video') delete result.parameters.prompt;
  if (type === 'suno' && model.startsWith('suno_')) result.path = `/suno/submit/${encodeURIComponent(model.slice(5))}`;
  if (type === 'midjourney' && model.startsWith('mj_')) {
    const action = model.slice(3);
    const known = ['imagine', 'describe', 'blend', 'shorten', 'modal', 'edits', 'video'];
    result.path = `/mj/submit/${known.includes(action) ? action : 'action'}`;
  }
  if (!result.path) throw new Error(`Endpoint ${type} has no submit path.`);
  return result;
}

export function prepareRequest(protocol, model, input, stream) {
  const body = structuredClone(input);
  const prompt = body.prompt;
  if (prompt !== undefined) {
    const assign = (key, value) => { if (body[key] !== undefined) throw new Error(`Use either --prompt or ${key}, not both.`); body[key] = value; delete body.prompt; };
    switch (protocol.type) {
      case 'openai': case 'anthropic': assign('messages', [{ role: 'user', content: prompt }]); break;
      case 'openai-response': case 'embeddings': case 'speech': case 'moderations': assign('input', prompt); break;
      case 'gemini': assign('contents', [{ role: 'user', parts: [{ text: prompt }] }]); break;
      case 'gemini-embedding': assign('content', { parts: [{ text: prompt }] }); break;
      case 'seedance2-native-video': assign('content', [{ type: 'text', text: prompt }]); break;
      case 'dashscope.tripo.3d': assign('input', { prompt }); break;
      case 'jina-rerank': assign('query', prompt); break;
      case 'suno': if (model === 'suno_music' && body.custom_mode !== true && body.custom_mode !== 1) assign('gpt_description_prompt', prompt); break;
    }
  }
  if (body.model !== undefined && body.model !== model) throw new Error('Input model conflicts with the selected model.');
  if (!protocol.noModel && !protocol.modelInPath) body.model = model;
  let route = protocol.path.replaceAll('{model}', encodeURIComponent(model));
  if (protocol.type === 'gemini-embedding') body.model = `models/${model}`;
  if (stream) {
    if (protocol.type === 'gemini') route = route.replace(':generateContent', ':streamGenerateContent') + '?alt=sse';
    else if (['openai', 'anthropic', 'openai-response', 'completions'].includes(protocol.type)) body.stream = true;
    else throw new Error(`--stream is unavailable for ${protocol.type}.`);
  }
  if (protocol.type === 'anthropic' && body.max_tokens === undefined) body.max_tokens = 4096;
  // Metadata is often partial. Check declared requirements/types, but allow native extras.
  for (const [key, spec] of Object.entries(protocol.parameters || {})) {
    const value = body[key];
    if (spec.required && value === undefined) throw new Error(`Missing input ${key}; see modelsell schema ${model}.`);
    if (value === undefined) continue;
    if (spec.enum && !spec.enum.includes(value)) throw new Error(`${key} must be one of: ${spec.enum.join(', ')}`);
    const flexible = ['input', 'system', 'prompt'].includes(key);
    if (!flexible && spec.type && !({ string: typeof value === 'string', boolean: typeof value === 'boolean', integer: Number.isInteger(value), number: typeof value === 'number' && Number.isFinite(value), array: Array.isArray(value), object: value !== null && typeof value === 'object' && !Array.isArray(value) })[spec.type]) throw new Error(`${key} must be ${spec.type}.`);
  }
  return { route, body };
}
