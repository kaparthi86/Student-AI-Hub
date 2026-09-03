/**
 * Neo Clouds GPU Marketplace — v1
 * Single-file REST API, no dependencies, ESM, Node 18+
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Money arithmetic — BigInt scaled to 1_000_000
// ---------------------------------------------------------------------------
const SCALE = 1_000_000n;

function parsePrice(str) {
  if (typeof str !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(str)) {
    throw new Error(`Invalid price: ${str}`);
  }
  const [intPart, fracPart = ''] = str.split('.');
  const frac = fracPart.padEnd(6, '0');
  return BigInt(intPart) * SCALE + BigInt(frac);
}

function formatPrice(scaled) {
  const intPart = scaled / SCALE;
  const fracPart = scaled % SCALE;
  // Keep at least 2 decimal places, strip trailing zeros beyond that
  const fracStr = String(fracPart).padStart(6, '0').replace(/0{1,4}$/, '');
  return `${intPart}.${fracStr}`;
}

function multiplyPrice(scaledUnit, count) {
  return scaledUnit * BigInt(count);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function validateProvider({ name, region }) {
  if (!name || typeof name !== 'string') throw new Error('name is required');
  if (!region || typeof region !== 'string') throw new Error('region is required');
}

function validateListing(body) {
  const { gpu_model, gpu_count, vram_gb, price_per_hour } = body;
  if (!gpu_model || typeof gpu_model !== 'string') throw new Error('gpu_model is required');
  if (!Number.isInteger(gpu_count) || gpu_count < 1) throw new Error('gpu_count must be integer ≥ 1');
  if (!Number.isInteger(vram_gb) || vram_gb < 1) throw new Error('vram_gb must be integer ≥ 1');
  parsePrice(price_per_hour); // throws if invalid
}

function validateReservation(body) {
  const { listing_id, customer_id, hours } = body;
  if (!listing_id) throw new Error('listing_id is required');
  if (!customer_id) throw new Error('customer_id is required');
  if (!Number.isInteger(hours) || hours < 1 || hours > 720) throw new Error('hours must be 1..720');
}

// ---------------------------------------------------------------------------
// Request body parser
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function send(res, status, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

function notFound(res) { send(res, 404, { error: 'Not found' }); }
function badRequest(res, msg) { send(res, 400, { error: msg }); }

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------
function matchRoute(method, pathname, routes) {
  for (const [m, pattern, handler] of routes) {
    if (m !== method && m !== '*') continue;
    const keys = [];
    const regexStr = pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
    const match = new RegExp(`^${regexStr}$`).exec(pathname);
    if (match) {
      const params = {};
      keys.forEach((k, i) => { params[k] = decodeURIComponent(match[i + 1]); });
      return { handler, params };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route handlers (all receive store as first argument)
// ---------------------------------------------------------------------------

async function createProvider(store, req, res) {
  const body = await readBody(req);
  const { provider_id, name, region } = body;
  try { validateProvider({ name, region }); } catch (e) { return badRequest(res, e.message); }
  const id = provider_id || randomUUID();
  if (store.providers.has(id)) return send(res, 409, { error: 'provider_id already exists' });
  const provider = { provider_id: id, name, region };
  store.providers.set(id, provider);
  send(res, 201, provider);
}

function listProviders(store, _req, res) {
  send(res, 200, [...store.providers.values()]);
}

async function createListing(store, req, res, params) {
  if (!store.providers.has(params.provider_id)) return notFound(res);
  const body = await readBody(req);
  body.gpu_count = body.gpu_count ?? 1;
  try { validateListing(body); } catch (e) { return badRequest(res, e.message); }

  const listing = {
    listing_id:     body.listing_id || randomUUID(),
    provider_id:    params.provider_id,
    gpu_model:      body.gpu_model,
    gpu_count:      body.gpu_count,
    vram_gb:        body.vram_gb,
    interconnect:   body.interconnect ?? null,
    region:         body.region || store.providers.get(params.provider_id).region,
    spot:           body.spot ?? false,
    price_per_hour: body.price_per_hour,
    currency:       body.currency || 'USD',
    available:      body.available ?? true,
    created_at:     new Date().toISOString(),
  };
  if (store.listings.has(listing.listing_id)) return send(res, 409, { error: 'listing_id already exists' });
  store.listings.set(listing.listing_id, listing);
  send(res, 201, listing);
}

function listListings(store, req, res) {
  const url = new URL(req.url, 'http://x');
  const q = url.searchParams;
  let result = [...store.listings.values()];

  if (q.has('gpu_model'))   result = result.filter(l => l.gpu_model === q.get('gpu_model'));
  if (q.has('region'))      result = result.filter(l => l.region === q.get('region'));
  if (q.has('spot'))        result = result.filter(l => l.spot === (q.get('spot') === 'true'));
  if (q.has('available'))   result = result.filter(l => l.available === (q.get('available') === 'true'));
  if (q.has('min_vram_gb')) result = result.filter(l => l.vram_gb >= Number(q.get('min_vram_gb')));
  if (q.has('max_price_per_hour')) {
    try {
      const max = parsePrice(q.get('max_price_per_hour'));
      result = result.filter(l => parsePrice(l.price_per_hour) <= max);
    } catch { return badRequest(res, 'Invalid max_price_per_hour'); }
  }
  send(res, 200, result);
}

function getListing(store, _req, res, params) {
  const l = store.listings.get(params.listing_id);
  if (!l) return notFound(res);
  send(res, 200, l);
}

async function patchListing(store, req, res, params) {
  const l = store.listings.get(params.listing_id);
  if (!l) return notFound(res);
  const body = await readBody(req);
  if (body.price_per_hour !== undefined) {
    try { parsePrice(body.price_per_hour); } catch (e) { return badRequest(res, e.message); }
    l.price_per_hour = body.price_per_hour;
  }
  if (body.available !== undefined) l.available = Boolean(body.available);
  send(res, 200, l);
}

function deleteListing(store, _req, res, params) {
  const l = store.listings.get(params.listing_id);
  if (!l) return notFound(res);
  const hasActive = [...store.reservations.values()].some(
    r => r.listing_id === params.listing_id && r.status === 'active'
  );
  if (hasActive) return badRequest(res, 'Cannot delete listing with active reservations');
  store.listings.delete(params.listing_id);
  send(res, 200, { deleted: true });
}

async function createReservation(store, req, res) {
  const body = await readBody(req);
  try { validateReservation(body); } catch (e) { return badRequest(res, e.message); }

  const listing = store.listings.get(body.listing_id);
  if (!listing) return badRequest(res, 'listing not found');
  if (!listing.available) return send(res, 400, { error: 'listing is not available' });

  const priceScaled = parsePrice(listing.price_per_hour);
  const totalScaled = multiplyPrice(priceScaled, body.hours);

  const starts_at = body.starts_at ? new Date(body.starts_at).toISOString() : new Date().toISOString();
  const ends_at = new Date(new Date(starts_at).getTime() + body.hours * 3600_000).toISOString();

  const reservation = {
    reservation_id: body.reservation_id || randomUUID(),
    listing_id:     body.listing_id,
    customer_id:    body.customer_id,
    hours:          body.hours,
    total_price:    formatPrice(totalScaled),
    currency:       listing.currency,
    status:         'active',
    reserved_at:    new Date().toISOString(),
    starts_at,
    ends_at,
  };

  listing.available = false;
  store.reservations.set(reservation.reservation_id, reservation);
  send(res, 201, reservation);
}

function listReservations(store, req, res) {
  const url = new URL(req.url, 'http://x');
  const customerId = url.searchParams.get('customer_id');
  let result = [...store.reservations.values()];
  if (customerId) result = result.filter(r => r.customer_id === customerId);
  send(res, 200, result);
}

function getReservation(store, _req, res, params) {
  const r = store.reservations.get(params.reservation_id);
  if (!r) return notFound(res);
  send(res, 200, r);
}

async function cancelReservation(store, _req, res, params) {
  const r = store.reservations.get(params.reservation_id);
  if (!r) return notFound(res);
  if (r.status !== 'active') return badRequest(res, 'reservation is not active');
  r.status = 'cancelled';
  const listing = store.listings.get(r.listing_id);
  if (listing) listing.available = true;
  send(res, 200, r);
}

function getStats(store, _req, res) {
  const allListings = [...store.listings.values()];
  const activeRes = [...store.reservations.values()].filter(r => r.status === 'active');
  const available = allListings.filter(l => l.available);
  const gpuModels = [...new Set(allListings.map(l => l.gpu_model))].sort();

  let cheapest = null;
  for (const l of allListings) {
    const p = parsePrice(l.price_per_hour);
    if (cheapest === null || p < cheapest) cheapest = p;
  }

  send(res, 200, {
    total_listings:      allListings.length,
    available_listings:  available.length,
    providers:           store.providers.size,
    reservations_active: activeRes.length,
    cheapest_per_hour:   cheapest !== null ? formatPrice(cheapest) : null,
    gpu_models:          gpuModels,
  });
}

function health(_store, _req, res) {
  send(res, 200, { ok: true, service: 'neo-clouds-marketplace' });
}

// ---------------------------------------------------------------------------
// Route table factory
// ---------------------------------------------------------------------------
function buildRoutes(store) {
  return [
    ['GET',    '/health',                                   (q, r)    => health(store, q, r)],
    ['POST',   '/v1/providers',                             (q, r)    => createProvider(store, q, r)],
    ['GET',    '/v1/providers',                             (q, r)    => listProviders(store, q, r)],
    ['POST',   '/v1/providers/:provider_id/listings',       (q, r, p) => createListing(store, q, r, p)],
    ['GET',    '/v1/listings',                              (q, r)    => listListings(store, q, r)],
    ['GET',    '/v1/listings/:listing_id',                  (q, r, p) => getListing(store, q, r, p)],
    ['PATCH',  '/v1/listings/:listing_id',                  (q, r, p) => patchListing(store, q, r, p)],
    ['DELETE', '/v1/listings/:listing_id',                  (q, r, p) => deleteListing(store, q, r, p)],
    ['POST',   '/v1/reservations',                          (q, r)    => createReservation(store, q, r)],
    ['GET',    '/v1/reservations',                          (q, r)    => listReservations(store, q, r)],
    ['GET',    '/v1/reservations/:reservation_id',          (q, r, p) => getReservation(store, q, r, p)],
    ['POST',   '/v1/reservations/:reservation_id/cancel',   (q, r, p) => cancelReservation(store, q, r, p)],
    ['GET',    '/v1/stats',                                 (q, r)    => getStats(store, q, r)],
  ];
}

// ---------------------------------------------------------------------------
// Server factory (exported for tests)
// ---------------------------------------------------------------------------
export function createMarketplaceServer() {
  const store = {
    providers:    new Map(),
    listings:     new Map(),
    reservations: new Map(),
  };
  const routes = buildRoutes(store);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const match = matchRoute(req.method, pathname, routes);
    if (!match) return notFound(res);
    try {
      await match.handler(req, res, match.params);
    } catch (err) {
      const status = err.status || 500;
      send(res, status, { error: err.message });
    }
  });
  return server;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const PORT = process.env.PORT || 8788;
  const server = createMarketplaceServer();
  server.listen(PORT, () => {
    console.log(`Neo Clouds Marketplace listening on port ${PORT}`);
  });
}
