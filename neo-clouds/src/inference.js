/**
 * Inference gateway — model registry + simulated chat completions + usage metering
 */

import { store, makeId, parsePrice, formatPrice, SCALE } from './store.js';

export function registerModel(providerId, body) {
  const { node_id, model_name, model_family, context_length, input_price_per_1k_tokens, output_price_per_1k_tokens } = body;
  if (!node_id) throw new Error('node_id is required');
  if (!model_name) throw new Error('model_name is required');
  parsePrice(input_price_per_1k_tokens);
  parsePrice(output_price_per_1k_tokens);

  const node = store.nodes.get(node_id);
  if (!node) { const e = new Error('node not found'); e.status = 404; throw e; }
  if (node.provider_id !== providerId) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }

  const model = {
    model_id: makeId('mdl'),
    node_id,
    provider_id: providerId,
    model_name,
    model_family: model_family || 'unknown',
    context_length: context_length || 4096,
    input_price_per_1k_tokens,
    output_price_per_1k_tokens,
    currency: 'USD',
    status: 'available',
    created_at: new Date().toISOString(),
  };
  store.models.set(model.model_id, model);
  return model;
}

export function listModels() {
  return [...store.models.values()].filter(m => m.status === 'available');
}

export function deleteModel(providerId, modelId) {
  const model = store.models.get(modelId);
  if (!model) { const e = new Error('model not found'); e.status = 404; throw e; }
  if (model.provider_id !== providerId) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }
  store.models.delete(modelId);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

const CANNED_RESPONSE = 'Hello! I am a Neo Clouds simulated assistant. This is a canned demonstration response — no real GPU or TPU ran this request, and you were not charged.';

function resolveModel(modelRef) {
  for (const m of store.models.values()) {
    if (m.status === 'available' && (m.model_id === modelRef || m.model_name === modelRef)) {
      return m;
    }
  }
  return null;
}

function estimateInputTokens(messages) {
  // rough: 4 chars per token
  const text = messages.map(m => m.content || '').join(' ');
  return Math.max(1, Math.ceil(text.length / 4));
}

function calcCost(model, inputTokens, outputTokens) {
  const inPrice = parsePrice(model.input_price_per_1k_tokens);
  const outPrice = parsePrice(model.output_price_per_1k_tokens);
  const cost = (inPrice * BigInt(inputTokens) + outPrice * BigInt(outputTokens)) / 1000n;
  return formatPrice(cost);
}

function recordUsage({ model, inputTokens, outputTokens, customerId }) {
  const cost = calcCost(model, inputTokens, outputTokens);
  store.usageEvents.push({
    usage_id: makeId('usg'),
    model_id: model.model_id,
    model_name: model.model_name,
    customer_id: customerId,
    provider_id: model.provider_id,
    node_id: model.node_id,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
    simulated: true,
    payment_collected: false,
    timestamp: new Date().toISOString(),
  });
  return cost;
}

export function chatCompletionSync(account, body) {
  const { model: modelRef, messages, max_tokens } = body;
  if (!modelRef) throw new Error('model is required');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages is required');

  const model = resolveModel(modelRef);
  if (!model) { const e = new Error(`model '${modelRef}' not found or unavailable`); e.status = 404; throw e; }

  const responseText = CANNED_RESPONSE.slice(0, max_tokens ? max_tokens * 4 : undefined);
  const inputTokens = estimateInputTokens(messages);
  const outputTokens = Math.ceil(responseText.length / 4);
  const costUsd = recordUsage({ model, inputTokens, outputTokens, customerId: account.account_id });

  const completionId = makeId('cmp');
  return {
    id: completionId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model.model_name,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: responseText },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      cost_usd: costUsd,
      simulated: true,
      payment_collected: false,
    },
  };
}

// streaming SSE — returns an async generator of SSE lines
export async function* chatCompletionStream(account, body) {
  const { model: modelRef, messages, max_tokens } = body;
  if (!modelRef) throw new Error('model is required');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages is required');

  const model = resolveModel(modelRef);
  if (!model) { const e = new Error(`model '${modelRef}' not found or unavailable`); e.status = 404; throw e; }

  const responseText = CANNED_RESPONSE.slice(0, max_tokens ? max_tokens * 4 : undefined);
  const inputTokens = estimateInputTokens(messages);
  const completionId = makeId('cmp');

  for (const char of responseText) {
    const chunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: model.model_name,
      choices: [{ index: 0, delta: { content: char }, finish_reason: null }],
    };
    yield `data: ${JSON.stringify(chunk)}\n\n`;
  }

  yield `data: [DONE]\n\n`;

  const outputTokens = Math.ceil(responseText.length / 4);
  recordUsage({ model, inputTokens, outputTokens, customerId: account.account_id });
}

// ---------------------------------------------------------------------------
// Usage queries
// ---------------------------------------------------------------------------

export function queryUsage(account, { from, to } = {}) {
  let events = store.usageEvents;
  if (account.role === 'customer') events = events.filter(e => e.customer_id === account.account_id);
  if (account.role === 'provider') events = events.filter(e => e.provider_id === account.account_id);
  if (from) { const d = new Date(from); events = events.filter(e => new Date(e.timestamp) >= d); }
  if (to)   { const d = new Date(to);   events = events.filter(e => new Date(e.timestamp) <= d); }
  return events;
}

export function usageSummary(account, filters) {
  const events = queryUsage(account, filters);
  let totalIn = 0, totalOut = 0, totalCost = 0n;
  for (const e of events) {
    totalIn += e.input_tokens;
    totalOut += e.output_tokens;
    // re-parse cost
    const [int, frac = ''] = e.cost_usd.split('.');
    const fracPadded = frac.padEnd(6, '0');
    totalCost += BigInt(int) * SCALE + BigInt(fracPadded);
  }
  return {
    total_input_tokens: totalIn,
    total_output_tokens: totalOut,
    total_cost_usd: formatPrice(totalCost),
    simulated: true,
    payment_collected: false,
  };
}
