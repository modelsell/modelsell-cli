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
