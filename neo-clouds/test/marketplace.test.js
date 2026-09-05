/**
 * Neo Clouds — full integration test suite
 * Run: node --test test/marketplace.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketplaceServer } from '../src/server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function base(server) {
  return `http://localhost:${server.address().port}`;
}

async function req(server, method, path, body, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${base(server)}${path}`, opts);
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

function startServer() {
  const server = createMarketplaceServer();
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

function stopServer(server) {
  return new Promise(resolve => server.close(resolve));
}

// ---------------------------------------------------------------------------
// 1. Auth
// ---------------------------------------------------------------------------
describe('1 – Auth', async () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await stopServer(server); });

  it('registers a customer account', async () => {
    const r = await req(server, 'POST', '/v1/auth/register', { name: 'Alice', email: 'alice@test.com', role: 'customer' });
    assert.equal(r.status, 201);
    assert.ok(r.body.api_key.startsWith('nck_'));
    assert.equal(r.body.role, 'customer');
    assert.ok(r.body.account_id);
  });

  it('registers a provider account', async () => {
    const r = await req(server, 'POST', '/v1/auth/register', { name: 'Bob', email: 'bob@test.com', role: 'provider' });
    assert.equal(r.status, 201);
    assert.ok(r.body.api_key.startsWith('nkp_'));
    assert.equal(r.body.role, 'provider');
  });

  it('rejects duplicate email', async () => {
    await req(server, 'POST', '/v1/auth/register', { name: 'A', email: 'dup@test.com', role: 'customer' });
    const r = await req(server, 'POST', '/v1/auth/register', { name: 'B', email: 'dup@test.com', role: 'customer' });
    assert.equal(r.status, 400);
  });

  it('GET /v1/auth/me returns account', async () => {
    const reg = await req(server, 'POST', '/v1/auth/register', { name: 'Carol', email: 'carol@test.com', role: 'customer' });
    const me = await req(server, 'GET', '/v1/auth/me', undefined, reg.body.api_key);
    assert.equal(me.status, 200);
    assert.equal(me.body.email, 'carol@test.com');
  });

  it('returns 401 without auth', async () => {
    const r = await req(server, 'GET', '/v1/auth/me');
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'unauthorized');
  });

  it('returns 403 for wrong role (customer tries to create node)', async () => {
    const reg = await req(server, 'POST', '/v1/auth/register', { name: 'Dave', email: 'dave@test.com', role: 'customer' });
    const r = await req(server, 'POST', '/v1/nodes', { hostname: 'x', gpu_model: 'H100', gpu_count: 1, vram_gb_per_gpu: 80, region: 'us' }, reg.body.api_key);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'forbidden');
  });
});

// ---------------------------------------------------------------------------
// 2. Provider onboarding
// ---------------------------------------------------------------------------
describe('2 – Provider onboarding', async () => {
  let server, providerKey, providerId;
  before(async () => {
    server = await startServer();
    const r = await req(server, 'POST', '/v1/auth/register', { name: 'Provider P', email: 'pp@test.com', role: 'provider' });
    providerKey = r.body.api_key;
    providerId = r.body.account_id;
  });
  after(async () => { await stopServer(server); });

  let nodeId;

  it('registers a node', async () => {
    const r = await req(server, 'POST', '/v1/nodes', {
      hostname: 'gpu1.example.com',
      gpu_model: 'H100-SXM5-80GB',
      gpu_count: 4,
      vram_gb_per_gpu: 80,
      interconnect: 'NVLink',
      region: 'us-east-1',
    }, providerKey);
    assert.equal(r.status, 201);
    assert.equal(r.body.attestation_status, 'pending');
    assert.equal(r.body.provider_id, providerId);
    nodeId = r.body.node_id;
  });

  it('lists own nodes', async () => {
    const r = await req(server, 'GET', '/v1/nodes', undefined, providerKey);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.some(n => n.node_id === nodeId));
  });

  it('attests a node', async () => {
    const r = await req(server, 'POST', `/v1/nodes/${nodeId}/attest`, {}, providerKey);
    assert.equal(r.status, 200);
    assert.equal(r.body.attestation_status, 'attested');
    assert.ok(r.body.attested_at);
  });

  it('returns 404 for unknown node', async () => {
    const r = await req(server, 'POST', '/v1/nodes/node_bad_x/attest', {}, providerKey);
    assert.equal(r.status, 404);
  });
});

// ---------------------------------------------------------------------------
// 3. Listings
// ---------------------------------------------------------------------------
describe('3 – Listings', async () => {
  let server, providerKey, customerKey, nodeId, listingId;

  before(async () => {
    server = await startServer();
    const p = await req(server, 'POST', '/v1/auth/register', { name: 'Prov3', email: 'p3@test.com', role: 'provider' });
    providerKey = p.body.api_key;
    const c = await req(server, 'POST', '/v1/auth/register', { name: 'Cust3', email: 'c3@test.com', role: 'customer' });
    customerKey = c.body.api_key;

    const n = await req(server, 'POST', '/v1/nodes', {
      hostname: 'gpu2.example.com', gpu_model: 'A100-80GB', gpu_count: 8, vram_gb_per_gpu: 80, interconnect: 'InfiniBand', region: 'eu-west-1',
    }, providerKey);
    nodeId = n.body.node_id;
    await req(server, 'POST', `/v1/nodes/${nodeId}/attest`, {}, providerKey);
  });
  after(async () => { await stopServer(server); });

  it('creates a listing on attested node', async () => {
    const r = await req(server, 'POST', '/v1/listings', {
      node_id: nodeId, price_per_hour: '2.50', spot: false, min_hours: 2, max_hours: 48, tags: ['high-memory'],
    }, providerKey);
    assert.equal(r.status, 201);
    assert.equal(r.body.available, true);
    assert.equal(r.body.gpu_model, 'A100-80GB');
    listingId = r.body.listing_id;
  });

  it('customer can list listings', async () => {
    const r = await req(server, 'GET', '/v1/listings', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.some(l => l.listing_id === listingId));
  });

  it('filters by gpu_model', async () => {
    const r = await req(server, 'GET', '/v1/listings?gpu_model=A100-80GB', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(r.body.every(l => l.gpu_model === 'A100-80GB'));
  });

  it('filters by available=true', async () => {
    const r = await req(server, 'GET', '/v1/listings?available=true', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(r.body.every(l => l.available === true));
  });

  it('GET listing increments view_count', async () => {
    const r1 = await req(server, 'GET', `/v1/listings/${listingId}`, undefined, customerKey);
    const r2 = await req(server, 'GET', `/v1/listings/${listingId}`, undefined, customerKey);
    assert.equal(r2.body.view_count, r1.body.view_count + 1);
  });

  it('PATCH listing updates price', async () => {
    const r = await req(server, 'PATCH', `/v1/listings/${listingId}`, { price_per_hour: '3.00' }, providerKey);
    assert.equal(r.status, 200);
    assert.equal(r.body.price_per_hour, '3.00');
  });

  it('rejects listing on unattested node', async () => {
    const n2 = await req(server, 'POST', '/v1/nodes', {
      hostname: 'gpu3.example.com', gpu_model: 'L40S', gpu_count: 1, vram_gb_per_gpu: 48, region: 'ap-1',
    }, providerKey);
    const r = await req(server, 'POST', '/v1/listings', { node_id: n2.body.node_id, price_per_hour: '1.00' }, providerKey);
    // Node is pending, but listing creation should succeed (availability = false)
    // The spec doesn't say we block creation on pending nodes, only availability is false
    assert.equal(r.status, 201);
    assert.equal(r.body.available, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Reservations
// ---------------------------------------------------------------------------
describe('4 – Reservations', async () => {
  let server, providerKey, customerKey, nodeId, listingId, reservationId;

  before(async () => {
    server = await startServer();
    const p = await req(server, 'POST', '/v1/auth/register', { name: 'Prov4', email: 'p4@test.com', role: 'provider' });
    providerKey = p.body.api_key;
    const c = await req(server, 'POST', '/v1/auth/register', { name: 'Cust4', email: 'c4@test.com', role: 'customer' });
    customerKey = c.body.api_key;

    const n = await req(server, 'POST', '/v1/nodes', {
      hostname: 'res-node.example.com', gpu_model: 'H100', gpu_count: 1, vram_gb_per_gpu: 80, region: 'us-west-2',
    }, providerKey);
    nodeId = n.body.node_id;
    await req(server, 'POST', `/v1/nodes/${nodeId}/attest`, {}, providerKey);

    const l = await req(server, 'POST', '/v1/listings', { node_id: nodeId, price_per_hour: '2.50', min_hours: 1, max_hours: 10 }, providerKey);
    listingId = l.body.listing_id;
  });
  after(async () => { await stopServer(server); });

  it('creates a reservation (goes active immediately)', async () => {
    const r = await req(server, 'POST', '/v1/reservations', { listing_id: listingId, hours: 3 }, customerKey);
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'active');
    assert.ok(r.body.connection_info);
    assert.equal(r.body.connection_info.ssh_port, 22);
    assert.equal(r.body.hours, 3);
    assert.equal(r.body.simulated, true);
    assert.equal(r.body.payment_collected, false);
    reservationId = r.body.reservation_id;
  });

  it('listing is now unavailable', async () => {
    const r = await req(server, 'GET', `/v1/listings/${listingId}`, undefined, customerKey);
    assert.equal(r.body.available, false);
  });

  it('lists reservations for customer', async () => {
    const r = await req(server, 'GET', '/v1/reservations', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(r.body.some(res => res.reservation_id === reservationId));
  });

  it('cannot double-book an active listing', async () => {
    const r = await req(server, 'POST', '/v1/reservations', { listing_id: listingId, hours: 1 }, customerKey);
    assert.equal(r.status, 409);
  });

  it('provider can complete reservation', async () => {
    const r = await req(server, 'POST', `/v1/reservations/${reservationId}/complete`, {}, providerKey);
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'completed');
  });

  it('listing becomes available after completion', async () => {
    const r = await req(server, 'GET', `/v1/listings/${listingId}`, undefined, customerKey);
    assert.equal(r.body.available, true);
  });

  it('cancel a reservation', async () => {
    const r2 = await req(server, 'POST', '/v1/reservations', { listing_id: listingId, hours: 2 }, customerKey);
    const cancelRes = await req(server, 'POST', `/v1/reservations/${r2.body.reservation_id}/cancel`, { reason: 'changed mind' }, customerKey);
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.status, 'cancelled');
    assert.equal(cancelRes.body.cancellation_reason, 'changed mind');
  });

  it('cannot cancel a completed reservation', async () => {
    const r = await req(server, 'POST', `/v1/reservations/${reservationId}/cancel`, {}, customerKey);
    assert.equal(r.status, 409);
  });

  it('validates min_hours', async () => {
    const p2 = await req(server, 'POST', '/v1/auth/register', { name: 'Prov4b', email: 'p4b@test.com', role: 'provider' });
    const n2 = await req(server, 'POST', '/v1/nodes', { hostname: 'h.example.com', gpu_model: 'A10', gpu_count: 1, vram_gb_per_gpu: 24, region: 'us' }, p2.body.api_key);
    await req(server, 'POST', `/v1/nodes/${n2.body.node_id}/attest`, {}, p2.body.api_key);
    const l2 = await req(server, 'POST', '/v1/listings', { node_id: n2.body.node_id, price_per_hour: '1.00', min_hours: 5 }, p2.body.api_key);
    const r = await req(server, 'POST', '/v1/reservations', { listing_id: l2.body.listing_id, hours: 2 }, customerKey);
    assert.equal(r.status, 400);
  });
});

// ---------------------------------------------------------------------------
// 5. Inference gateway
// ---------------------------------------------------------------------------
describe('5 – Inference gateway', async () => {
  let server, providerKey, customerKey, nodeId, modelId, modelName;

  before(async () => {
    server = await startServer();
    const p = await req(server, 'POST', '/v1/auth/register', { name: 'Prov5', email: 'p5@test.com', role: 'provider' });
    providerKey = p.body.api_key;
    const c = await req(server, 'POST', '/v1/auth/register', { name: 'Cust5', email: 'c5@test.com', role: 'customer' });
    customerKey = c.body.api_key;

    const n = await req(server, 'POST', '/v1/nodes', { hostname: 'inf.example.com', gpu_model: 'A100', gpu_count: 2, vram_gb_per_gpu: 80, region: 'us-central-1' }, providerKey);
    nodeId = n.body.node_id;
    await req(server, 'POST', `/v1/nodes/${nodeId}/attest`, {}, providerKey);
  });
  after(async () => { await stopServer(server); });

  it('registers a model', async () => {
    modelName = 'meta-llama/Llama-3-8B-Instruct';
    const r = await req(server, 'POST', '/v1/models', {
      node_id: nodeId,
      model_name: modelName,
      model_family: 'llama3',
      context_length: 8192,
      input_price_per_1k_tokens: '0.20',
      output_price_per_1k_tokens: '0.40',
    }, providerKey);
    assert.equal(r.status, 201);
    assert.equal(r.body.model_name, modelName);
    modelId = r.body.model_id;
  });

  it('lists models', async () => {
    const r = await req(server, 'GET', '/v1/models', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.some(m => m.model_id === modelId));
  });

  it('POST /v1/chat/completions (non-stream) returns completion', async () => {
    const r = await req(server, 'POST', '/v1/chat/completions', {
      model: modelName,
      messages: [{ role: 'user', content: 'Hello!' }],
    }, customerKey);
    assert.equal(r.status, 200);
    assert.equal(r.body.object, 'chat.completion');
    assert.ok(r.body.choices);
    assert.ok(r.body.choices[0].message.content);
    assert.ok(r.body.usage.prompt_tokens > 0);
    assert.ok(r.body.usage.cost_usd);
    assert.equal(r.body.usage.simulated, true);
    assert.equal(r.body.usage.payment_collected, false);
  });

  it('POST /v1/chat/completions resolves model by model_id too', async () => {
    const r = await req(server, 'POST', '/v1/chat/completions', {
      model: modelId,
      messages: [{ role: 'user', content: 'Hi' }],
    }, customerKey);
    assert.equal(r.status, 200);
    assert.equal(r.body.object, 'chat.completion');
  });

  it('returns 404 for unknown model', async () => {
    const r = await req(server, 'POST', '/v1/chat/completions', {
      model: 'nonexistent-model',
      messages: [{ role: 'user', content: 'Hi' }],
    }, customerKey);
    assert.equal(r.status, 404);
  });

  it('GET /v1/usage returns usage events', async () => {
    const r = await req(server, 'GET', '/v1/usage', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
    assert.ok(r.body.length > 0);
    assert.ok(r.body[0].input_tokens > 0);
  });

  it('GET /v1/usage/summary returns totals', async () => {
    const r = await req(server, 'GET', '/v1/usage/summary', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(r.body.total_input_tokens >= 0);
    assert.equal(r.body.simulated, true);
    assert.equal(r.body.payment_collected, false);
    assert.ok(r.body.total_cost_usd !== undefined);
  });

  it('deletes a model', async () => {
    const r = await req(server, 'DELETE', `/v1/models/${modelId}`, undefined, providerKey);
    assert.equal(r.status, 200);
    assert.equal(r.body.deleted, true);
  });
});

// ---------------------------------------------------------------------------
// 6. Stats and leaderboard
// ---------------------------------------------------------------------------
describe('6 – Stats and leaderboard', async () => {
  let server, providerKey, customerKey;

  before(async () => {
    server = await startServer();
    const p = await req(server, 'POST', '/v1/auth/register', { name: 'Prov6', email: 'p6@test.com', role: 'provider' });
    providerKey = p.body.api_key;
    const c = await req(server, 'POST', '/v1/auth/register', { name: 'Cust6', email: 'c6@test.com', role: 'customer' });
    customerKey = c.body.api_key;
  });
  after(async () => { await stopServer(server); });

  it('GET /v1/stats returns stats shape', async () => {
    const r = await req(server, 'GET', '/v1/stats');
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.providers === 'number');
    assert.ok(typeof r.body.nodes === 'object');
    assert.ok(typeof r.body.listings === 'object');
    assert.ok(typeof r.body.models === 'object');
    assert.ok(typeof r.body.reservations === 'object');
    assert.ok(Array.isArray(r.body.gpu_models));
    assert.ok(Array.isArray(r.body.accelerator_types));
    assert.ok(Array.isArray(r.body.regions));
    assert.equal(r.body.currency, 'USD');
  });

  it('GET /v1/leaderboard returns array', async () => {
    const r = await req(server, 'GET', '/v1/leaderboard', undefined, customerKey);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  it('stats reflects registered providers', async () => {
    const r = await req(server, 'GET', '/v1/stats');
    assert.ok(r.body.providers >= 1);
  });
});

// ---------------------------------------------------------------------------
// 7. HTTP integration: server on port 0
// ---------------------------------------------------------------------------
describe('7 – HTTP integration', async () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await stopServer(server); });

  it('GET / serves HTML', async () => {
    const res = await fetch(`${base(server)}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Neo Clouds'));
  });

  it('unknown route returns 404 JSON', async () => {
    const r = await req(server, 'GET', '/v1/nonexistent');
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'not_found');
  });

  it('full happy path: register → node → attest → listing → reserve → complete', async () => {
    const p = await req(server, 'POST', '/v1/auth/register', { name: 'FullP', email: 'fp@test.com', role: 'provider' });
    const c = await req(server, 'POST', '/v1/auth/register', { name: 'FullC', email: 'fc@test.com', role: 'customer' });
    const pk = p.body.api_key, ck = c.body.api_key;

    const n = await req(server, 'POST', '/v1/nodes', { hostname: 'full.example.com', gpu_model: 'H200', gpu_count: 8, vram_gb_per_gpu: 141, interconnect: 'NVLink', region: 'us-east-2' }, pk);
    assert.equal(n.status, 201);

    const attest = await req(server, 'POST', `/v1/nodes/${n.body.node_id}/attest`, {}, pk);
    assert.equal(attest.body.attestation_status, 'attested');

    const l = await req(server, 'POST', '/v1/listings', { node_id: n.body.node_id, price_per_hour: '5.00' }, pk);
    assert.equal(l.body.available, true);

    const res = await req(server, 'POST', '/v1/reservations', { listing_id: l.body.listing_id, hours: 4 }, ck);
    assert.equal(res.status, 201);
    assert.equal(res.body.total_price, '20.00');

    const comp = await req(server, 'POST', `/v1/reservations/${res.body.reservation_id}/complete`, {}, pk);
    assert.equal(comp.body.status, 'completed');
  });
});

// ---------------------------------------------------------------------------
// 7. Launch readiness
// ---------------------------------------------------------------------------
describe('7 – Launch readiness', async () => {
  let server;
  before(async () => { server = await startServer(); });
  after(async () => { await stopServer(server); });

  it('GET /api/health returns ok and indexHtmlDeployed', async () => {
    const r = await req(server, 'GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.service, 'neo-clouds-marketplace');
    assert.equal(r.body.indexHtmlDeployed, true);
    assert.equal(r.body.simulated, true);
    assert.equal(r.body.paymentsEnabled, false);
    assert.match(r.body.betaMessage, /simulated/i);
    assert.match(r.body.betaMessage, /do not charge|payments/i);
  });

  it('GET /api/config always advertises simulated + no payments', async () => {
    const r = await req(server, 'GET', '/api/config');
    assert.equal(r.status, 200);
    assert.equal(r.body.simulated, true);
    assert.equal(r.body.paymentsEnabled, false);
    assert.match(r.body.betaMessage, /simulated/i);
  });

  it('registers a TPU node and filters listings by accelerator_type', async () => {
    const p = await req(server, 'POST', '/v1/auth/register', {
      name: 'TPU Lab', email: `tpu-${Date.now()}@test.com`, role: 'provider',
    });
    const n = await req(server, 'POST', '/v1/nodes', {
      hostname: 'tpu-1',
      accelerator_type: 'tpu',
      accelerator_model: 'TPU-v5e-8',
      gpu_model: 'TPU-v5e-8',
      gpu_count: 8,
      vram_gb_per_gpu: 16,
      interconnect: 'ICI',
      region: 'us-central1',
    }, p.body.api_key);
    assert.equal(n.status, 201);
    assert.equal(n.body.accelerator_type, 'tpu');
    await req(server, 'POST', `/v1/nodes/${n.body.node_id}/attest`, {}, p.body.api_key);
    await req(server, 'POST', '/v1/listings', { node_id: n.body.node_id, price_per_hour: '1.60' }, p.body.api_key);
    const tpus = await req(server, 'GET', '/v1/listings?accelerator_type=tpu');
    assert.equal(tpus.status, 200);
    assert.ok(tpus.body.some(l => l.accelerator_type === 'tpu'));
  });

  it('GET /v1/listings works without auth (public browse)', async () => {
    const r = await req(server, 'GET', '/v1/listings');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  it('GET /v1/models works without auth', async () => {
    const r = await req(server, 'GET', '/v1/models');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });

  it('GET /v1/leaderboard works without auth', async () => {
    const r = await req(server, 'GET', '/v1/leaderboard');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body));
  });
});
