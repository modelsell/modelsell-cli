// Picks agent defaults from the live ModelSell catalog so new releases are used
// without shipping a new CLI. Static fallbacks apply when the catalog is unreachable.

export const FALLBACK_MODELS = {
  codex: 'gpt-5.5',
  claude: 'claude-sonnet-5-5',
  claudeFamilies: { sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5', haiku: 'claude-haiku-5-5', fable: 'claude-fable-5-1' },
  gemini: 'gemini-3.1-pro-preview',
  qwen: 'qwen3.7-plus',
  kimi: 'gpt-5.5'
};

const FALLBACK_TEXT_MODELS = [
  { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 1050000, maxTokens: 128000, input: ['text', 'image'], endpoints: ['openai-response', 'openai'] },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', contextWindow: 1000000, maxTokens: 128000, input: ['text', 'image'], endpoints: ['anthropic', 'openai'] },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', contextWindow: 1000000, maxTokens: 128000, input: ['text', 'image'], endpoints: ['anthropic', 'openai'] },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', contextWindow: 1048576, maxTokens: 65536, input: ['text', 'image'], endpoints: ['gemini', 'openai'] },
  { id: 'qwen3.7-plus', name: 'Qwen 3.7 Plus', contextWindow: 1000000, maxTokens: 131072, input: ['text'], endpoints: ['openai'] },
  { id: 'glm-5.1', name: 'GLM-5.1', contextWindow: 204800, maxTokens: 128000, input: ['text'], endpoints: ['openai'] }
];

const versionOf = id => (id.match(/\d+(?:[.-]\d+)*/)?.[0] || '0').split(/[.-]/).map(Number);
function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}
const newest = (models, rank = () => 0) => [...models].sort((a, b) => compareVersions(versionOf(b.id), versionOf(a.id)) || rank(b) - rank(a))[0]?.id;
const supports = (model, type) => (model.endpoints || []).includes(type);

export async function loadAgentCatalog({ baseUrl, apiKey, fetch = globalThis.fetch, timeout = 8000 }) {
  const get = async (route, auth) => {
    const response = await fetch(new URL(baseUrl.replace(/\/+$/, '') + route), {
      headers: auth ? { Authorization: `Bearer ${apiKey}` } : {},
      redirect: 'error',
      signal: AbortSignal.timeout(timeout)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const pricing = await get('/api/pricing', false);
  let allowed = null;
  try { allowed = new Set((await get('/v1/models', true)).data.map(m => m.id)); } catch { /* public catalog only */ }
  const featured = new Set(pricing.featured_model_names || []);
  return pricing.data
    .filter(m => !allowed || allowed.has(m.model_name))
    .map(m => ({
      id: m.model_name,
      category: m.category,
      endpoints: m.supported_endpoint_types || [],
      contextWindow: m.context_length,
      maxTokens: m.max_output_tokens,
      input: (m.input_modalities || ['text']).filter(x => ['text', 'image'].includes(x)),
      featured: featured.has(m.model_name)
    }));
}

export function recommendModels(catalog) {
  if (!catalog?.length) return { ...FALLBACK_MODELS, textModels: FALLBACK_TEXT_MODELS, source: 'fallback' };
  const pick = (filter, fallback, rank) => newest(catalog.filter(filter), rank) || fallback;
  // Codex only speaks the Responses API.
  const codex = pick(m => /^gpt-\d/.test(m.id) && supports(m, 'openai-response'), FALLBACK_MODELS.codex, m => (m.featured ? 2 : 0) + (/-sol$/.test(m.id) ? 1 : 0));
  const claudeFamilies = Object.fromEntries(Object.entries(FALLBACK_MODELS.claudeFamilies).map(([family, fallback]) =>
    [family, pick(m => new RegExp(`^claude-${family}-\\d+(-\\d+)?$`).test(m.id) && supports(m, 'anthropic'), fallback)]));
  const gemini = pick(m => /^gemini-[\d.]+-pro(-preview)?$/.test(m.id) && supports(m, 'gemini'), null)
    || pick(m => /^gemini-[\d.]+-flash(-preview)?$/.test(m.id) && supports(m, 'gemini'), FALLBACK_MODELS.gemini);
  // Vendor CLIs default to their own vendor's newest featured model when the key has one.
  const vendor = re => pick(m => re.test(m.id) && m.category === 'text' && supports(m, 'openai') && m.featured, null)
    || pick(m => re.test(m.id) && m.category === 'text' && supports(m, 'openai'), codex);
  const qwen = vendor(/^qwen\d/), kimi = vendor(/^kimi-/);
  const chosen = new Set([codex, ...Object.values(claudeFamilies), gemini, qwen, kimi]);
  const textModels = catalog
    .filter(m => m.category === 'text' && supports(m, 'openai') && (m.featured || chosen.has(m.id)))
    .map(m => ({ ...m, name: m.id }));
  return { codex, claude: claudeFamilies.sonnet, claudeFamilies, gemini, qwen, kimi, textModels: textModels.length ? textModels : FALLBACK_TEXT_MODELS, source: 'catalog' };
}

// How an agent should reach a model: Claude over Anthropic Messages, GPT over Responses when
// ModelSell offers it, everything else over Chat Completions.
export function routeOf(model) {
  if (/^claude-/.test(model.id) && model.endpoints?.includes('anthropic')) return 'anthropic';
  if (/^gpt-/.test(model.id) && model.endpoints?.includes('openai-response')) return 'responses';
  return 'chat';
}
