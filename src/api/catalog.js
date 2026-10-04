export async function catalog(client, { all = false } = {}) {
  let pricing;
  try { pricing = await client.request('/api/pricing', { auth: false }); }
  catch (error) {
    if (all || !client.apiKey) throw error;
    pricing = { data: [], supported_endpoint: {}, warning: 'Public metadata unavailable; choose --endpoint to run models without protocol metadata.' };
  }
  if (!Array.isArray(pricing.data)) throw new Error('Invalid model catalog response.');
  let models = pricing.data.map(m => ({ ...m, id: m.model_name }));
  let scope = 'public';
  if (client.apiKey && !all) {
    const allowed = await client.request('/v1/models');
    if (!Array.isArray(allowed.data)) throw new Error('Invalid authorized model list.');
    const byId = new Map(models.map(m => [m.id, m]));
    models = allowed.data.map(m => ({ ...m, ...byId.get(m.id), id: m.id }));
    scope = 'api-key';
  }
  return { models, endpoints: pricing.supported_endpoint || {}, scope, ...(pricing.warning ? { warning: pricing.warning } : {}) };
}

// A token-light view for agents; the full metadata is still available without --compact.
export function summarizeModel(m) {
  const docs = [...new Set(Object.values(m.supported_endpoints || {}).map(e => e?.docs_url).filter(Boolean))];
  const description = String(m.description || '');
  const summary = {
    id: m.id,
    category: m.category,
    endpoints: m.supported_endpoint_types,
    input: m.input_modalities,
    output: m.output_modalities,
    capabilities: m.capabilities,
    context_length: m.context_length,
    max_output_tokens: m.max_output_tokens,
    description: description.length > 160 ? description.slice(0, 157) + '...' : description || undefined,
    docs: docs.length ? docs : undefined
  };
  return Object.fromEntries(Object.entries(summary).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)));
}
