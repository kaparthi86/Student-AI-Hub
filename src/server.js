/**
 * Neo Clouds — HTTP server wiring
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Router } from './router.js';
import { authenticate, requireAuth, requireRole, registerAccount } from './auth.js';
import { registerNode, listNodes, attestNode, deregisterNode } from './providers.js';
import { createListing, listListings, getListing, updateListing, deleteListing } from './listings.js';
import { createReservation, listReservations, getReservation, cancelReservation, completeReservation } from './reservations.js';
import { registerModel, listModels, deleteModel, chatCompletionSync, chatCompletionStream, queryUsage, usageSummary } from './inference.js';
import { getStats, getLeaderboard } from './stats.js';
import { healthPayload, betaBannerText } from './health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function json(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function ok(res, body) { json(res, 200, body); }
function created(res, body) { json(res, 201, body); }
function err(res, status, code, message) { json(res, status, { error: code, message }); }

function handleError(res, e) {
  if (e.code === 'unauthorized' || e.status === 401) return err(res, 401, 'unauthorized', e.message);
  if (e.code === 'forbidden'    || e.status === 403) return err(res, 403, 'forbidden',    e.message || 'forbidden');
  if (e.status === 404) return err(res, 404, 'not_found', e.message);
  if (e.status === 409) return err(res, 409, 'conflict',  e.message);
  return err(res, 400, 'bad_request', e.message);
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------
function serveStatic(res, filePath, contentType) {
  if (!existsSync(filePath)) {
    res.writeHead(404); res.end('Not found');
    return;
  }
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

// ---------------------------------------------------------------------------
// Router setup
// ---------------------------------------------------------------------------
export function buildRouter() {
  const router = new Router();

  // Auth
  router.post('/v1/auth/register', async (req, res) => {
    try {
      const body = await readBody(req);
      const account = registerAccount(body);
      created(res, account);
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/auth/me', async (req, res) => {
    try {
      const account = authenticate(req);
      requireAuth(account);
      ok(res, account);
    } catch (e) { handleError(res, e); }
  });

  // Nodes
  router.post('/v1/nodes', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      const body = await readBody(req);
      created(res, registerNode(account.account_id, body));
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/nodes', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      ok(res, listNodes(account.account_id));
    } catch (e) { handleError(res, e); }
  });

  router.post('/v1/nodes/:node_id/attest', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      ok(res, attestNode(account.account_id, req.params.node_id));
    } catch (e) { handleError(res, e); }
  });

  router.delete('/v1/nodes/:node_id', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      ok(res, deregisterNode(account.account_id, req.params.node_id));
    } catch (e) { handleError(res, e); }
  });

  // Listings
  router.post('/v1/listings', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      const body = await readBody(req);
      created(res, createListing(account.account_id, body));
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/listings', async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const filters = Object.fromEntries(url.searchParams);
      ok(res, listListings(filters));
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/listings/:listing_id', async (req, res) => {
    try {
      ok(res, getListing(req.params.listing_id));
    } catch (e) { handleError(res, e); }
  });

  router.patch('/v1/listings/:listing_id', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      const body = await readBody(req);
      ok(res, updateListing(account.account_id, req.params.listing_id, body));
    } catch (e) { handleError(res, e); }
  });

  router.delete('/v1/listings/:listing_id', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      ok(res, deleteListing(account.account_id, req.params.listing_id));
    } catch (e) { handleError(res, e); }
  });

  // Reservations
  router.post('/v1/reservations', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'customer');
      const body = await readBody(req);
      created(res, createReservation(account.account_id, body));
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/reservations', async (req, res) => {
    try {
      const account = authenticate(req);
      requireAuth(account);
      ok(res, listReservations(account));
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/reservations/:reservation_id', async (req, res) => {
    try {
      const account = authenticate(req);
      requireAuth(account);
      ok(res, getReservation(account, req.params.reservation_id));
    } catch (e) { handleError(res, e); }
  });

  router.post('/v1/reservations/:reservation_id/cancel', async (req, res) => {
    try {
      const account = authenticate(req);
      requireAuth(account);
      const body = await readBody(req);
      ok(res, cancelReservation(account, req.params.reservation_id, body.reason));
    } catch (e) { handleError(res, e); }
  });

  router.post('/v1/reservations/:reservation_id/complete', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      ok(res, completeReservation(account.account_id, req.params.reservation_id));
    } catch (e) { handleError(res, e); }
  });

  // Models
  router.post('/v1/models', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      const body = await readBody(req);
      created(res, registerModel(account.account_id, body));
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/models', async (req, res) => {
    try {
      ok(res, listModels());
    } catch (e) { handleError(res, e); }
  });

  router.delete('/v1/models/:model_id', async (req, res) => {
    try {
      const account = authenticate(req);
      requireRole(account, 'provider');
      ok(res, deleteModel(account.account_id, req.params.model_id));
    } catch (e) { handleError(res, e); }
  });

  // Inference
  router.post('/v1/chat/completions', async (req, res) => {
    try {
      const account = authenticate(req);
      requireAuth(account);
      const body = await readBody(req);

      if (body.stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        for await (const chunk of chatCompletionStream(account, body)) {
          res.write(chunk);
        }
        res.end();
      } else {
        ok(res, chatCompletionSync(account, body));
      }
    } catch (e) { handleError(res, e); }
  });

  // Usage
  router.get('/v1/usage', async (req, res) => {
    try {
      const account = authenticate(req);
      requireAuth(account);
      const url = new URL(req.url, 'http://x');
      ok(res, queryUsage(account, { from: url.searchParams.get('from'), to: url.searchParams.get('to') }));
    } catch (e) { handleError(res, e); }
  });

  router.get('/v1/usage/summary', async (req, res) => {
    try {
      const account = authenticate(req);
      requireAuth(account);
      const url = new URL(req.url, 'http://x');
      ok(res, usageSummary(account, { from: url.searchParams.get('from'), to: url.searchParams.get('to') }));
    } catch (e) { handleError(res, e); }
  });

  // Stats
  router.get('/v1/stats', async (req, res) => {
    try { ok(res, getStats()); } catch (e) { handleError(res, e); }
  });

  router.get('/v1/leaderboard', async (req, res) => {
    try {
      ok(res, getLeaderboard());
    } catch (e) { handleError(res, e); }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------
export function createMarketplaceServer() {
  const router = buildRouter();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const pathname = url.pathname;

    // Health (Render + uptime monitors)
    if (pathname === '/health' || pathname === '/api/health') {
      return ok(res, healthPayload());
    }

    if (pathname === '/api/config') {
      return ok(res, {
        betaMessage: betaBannerText(),
        canonicalDomain: process.env.CANONICAL_DOMAIN || 'neocloudsmarketplace.com',
      });
    }

    // Legal
    if (pathname === '/privacy.html') {
      return serveStatic(res, join(PUBLIC_DIR, 'privacy.html'), 'text/html; charset=utf-8');
    }
    if (pathname === '/terms.html') {
      return serveStatic(res, join(PUBLIC_DIR, 'terms.html'), 'text/html; charset=utf-8');
    }
    if (pathname === '/manifest.webmanifest') {
      return serveStatic(res, join(PUBLIC_DIR, 'manifest.webmanifest'), 'application/manifest+json');
    }

    // Static files
    if (pathname === '/' || pathname === '/index.html') {
      return serveStatic(res, join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
    }
    if (pathname.startsWith('/public/')) {
      const filePath = join(PUBLIC_DIR, pathname.slice('/public/'.length));
      return serveStatic(res, filePath, 'application/octet-stream');
    }

    // Attach params to req — populated by router
    req.params = {};

    const match = router.match(req.method, pathname);
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found', message: `${req.method} ${pathname} not found` }));
      return;
    }

    req.params = match.params;
    await match.handler(req, res);
  });

  return server;
}
