import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketplaceServer } from '../src/marketplace.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function base(server) {
  const { port } = server.address();
  return `http://localhost:${port}`;
}

async function req(server, method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${base(server)}${path}`, opts);
  const json = await res.json();
  return { status: res.status, body: json };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('1 – Provider create and list', async () => {
  const server = createMarketplaceServer();
  before(() => new Promise(r => server.listen(0, r)));
  after(()  => new Promise(r => server.close(r)));

  it('creates a provider and lists it', async () => {
    const create = await req(server, 'POST', '/v1/providers', { name: 'AcmeCo', region: 'us-east-1' });
    assert.equal(create.status, 201);
    assert.ok(create.body.provider_id);
    assert.equal(create.body.name, 'AcmeCo');

    const list = await req(server, 'GET', '/v1/providers');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].name, 'AcmeCo');
  });

  it('rejects provider without name', async () => {
    const r = await req(server, 'POST', '/v1/providers', { region: 'us-east-1' });
    assert.equal(r.status, 400);
  });
});

describe('2 – Listing create and filter', async () => {
  const server = createMarketplaceServer();
  before(() => new Promise(r => server.listen(0, r)));
  after(()  => new Promise(r => server.close(r)));

  let provider_id;

  it('setup: create provider', async () => {
    const r = await req(server, 'POST', '/v1/providers', { name: 'GpuCo', region: 'eu-west-1' });
    provider_id = r.body.provider_id;
  });

  it('creates listings', async () => {
    const l1 = await req(server, 'POST', `/v1/providers/${provider_id}/listings`, {
      gpu_model: 'H100-SXM5-80GB', gpu_count: 8, vram_gb: 80, price_per_hour: '2.50', region: 'us-east-1',
    });
    assert.equal(l1.status, 201);

    const l2 = await req(server, 'POST', `/v1/providers/${provider_id}/listings`, {
      gpu_model: 'A100-SXM4-40GB', gpu_count: 4, vram_gb: 40, price_per_hour: '1.20', region: 'eu-west-1',
    });
    assert.equal(l2.status, 201);
  });

  it('filters by gpu_model', async () => {
    const r = await req(server, 'GET', '/v1/listings?gpu_model=H100-SXM5-80GB');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].gpu_model, 'H100-SXM5-80GB');
  });

  it('filters by region', async () => {
    const r = await req(server, 'GET', '/v1/listings?region=eu-west-1');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].region, 'eu-west-1');
  });

  it('filters by max_price_per_hour', async () => {
    const r = await req(server, 'GET', '/v1/listings?max_price_per_hour=1.50');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].gpu_model, 'A100-SXM4-40GB');
  });
});

describe('3 – Reservation lifecycle', async () => {
  const server = createMarketplaceServer();
  before(() => new Promise(r => server.listen(0, r)));
  after(()  => new Promise(r => server.close(r)));

  let listing_id;
  let reservation_id;

  it('setup: provider + listing', async () => {
    const p = await req(server, 'POST', '/v1/providers', { name: 'ResCo', region: 'us-west-2' });
    const l = await req(server, 'POST', `/v1/providers/${p.body.provider_id}/listings`, {
      gpu_model: 'H100-SXM5-80GB', gpu_count: 1, vram_gb: 80, price_per_hour: '2.50',
    });
    listing_id = l.body.listing_id;
  });

  it('creates reservation and listing goes unavailable', async () => {
    const r = await req(server, 'POST', '/v1/reservations', {
      listing_id, customer_id: 'cust-1', hours: 4,
    });
    assert.equal(r.status, 201);
    reservation_id = r.body.reservation_id;
    assert.equal(r.body.status, 'active');
    assert.equal(r.body.total_price, '10.00');

    const l = await req(server, 'GET', `/v1/listings/${listing_id}`);
    assert.equal(l.body.available, false);
  });

  it('cancels reservation and listing becomes available again', async () => {
    const c = await req(server, 'POST', `/v1/reservations/${reservation_id}/cancel`);
    assert.equal(c.status, 200);
    assert.equal(c.body.status, 'cancelled');

    const l = await req(server, 'GET', `/v1/listings/${listing_id}`);
    assert.equal(l.body.available, true);
  });
});

describe('4 – Reserve unavailable listing', async () => {
  const server = createMarketplaceServer();
  before(() => new Promise(r => server.listen(0, r)));
  after(()  => new Promise(r => server.close(r)));

  it('returns 400 when listing is unavailable', async () => {
    const p = await req(server, 'POST', '/v1/providers', { name: 'UnavailCo', region: 'ap-southeast-1' });
    const l = await req(server, 'POST', `/v1/providers/${p.body.provider_id}/listings`, {
      gpu_model: 'A10G', gpu_count: 1, vram_gb: 24, price_per_hour: '0.75', available: false,
    });
    const listing_id = l.body.listing_id;

    const r = await req(server, 'POST', '/v1/reservations', {
      listing_id, customer_id: 'cust-x', hours: 2,
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /not available/i);
  });
});

describe('5 – Stats endpoint', async () => {
  const server = createMarketplaceServer();
  before(() => new Promise(r => server.listen(0, r)));
  after(()  => new Promise(r => server.close(r)));

  it('returns correct stats', async () => {
    const p = await req(server, 'POST', '/v1/providers', { name: 'StatCo', region: 'us-central-1' });
    const pid = p.body.provider_id;

    await req(server, 'POST', `/v1/providers/${pid}/listings`, {
      gpu_model: 'H100-SXM5-80GB', gpu_count: 8, vram_gb: 80, price_per_hour: '3.00',
    });
    await req(server, 'POST', `/v1/providers/${pid}/listings`, {
      gpu_model: 'A100-SXM4-40GB', gpu_count: 4, vram_gb: 40, price_per_hour: '1.50',
    });

    const s = await req(server, 'GET', '/v1/stats');
    assert.equal(s.status, 200);
    assert.equal(s.body.total_listings, 2);
    assert.equal(s.body.available_listings, 2);
    assert.equal(s.body.providers, 1);
    assert.equal(s.body.reservations_active, 0);
    assert.equal(s.body.cheapest_per_hour, '1.50');
    assert.ok(s.body.gpu_models.includes('H100-SXM5-80GB'));
  });
});

describe('6 – HTTP layer smoke test', async () => {
  const server = createMarketplaceServer();
  before(() => new Promise(r => server.listen(0, r)));
  after(()  => new Promise(r => server.close(r)));

  it('GET /health returns ok', async () => {
    const r = await fetch(`${base(server)}/health`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'neo-clouds-marketplace');
  });

  it('unknown route returns 404', async () => {
    const r = await fetch(`${base(server)}/v1/unknown`);
    assert.equal(r.status, 404);
  });
});
