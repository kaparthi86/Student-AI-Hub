/**
 * Enhanced listings — node-linked, auto-availability, rich filters
 */

import { store, makeId, parsePrice, formatPrice } from './store.js';

function validateListing(body) {
  const { node_id, price_per_hour } = body;
  if (!node_id || typeof node_id !== 'string') throw new Error('node_id is required');
  parsePrice(price_per_hour); // throws if invalid
  if (body.min_hours !== undefined && (!Number.isInteger(body.min_hours) || body.min_hours < 1))
    throw new Error('min_hours must be integer >= 1');
  if (body.max_hours !== undefined && (!Number.isInteger(body.max_hours) || body.max_hours < 1))
    throw new Error('max_hours must be integer >= 1');
}

function isListingAvailable(listing) {
  const node = store.nodes.get(listing.node_id);
  if (!node || node.attestation_status !== 'attested') return false;
  const hasActive = [...store.reservations.values()].some(
    r => r.listing_id === listing.listing_id && r.status === 'active'
  );
  return !hasActive;
}

export function createListing(providerId, body) {
  validateListing(body);
  const node = store.nodes.get(body.node_id);
  if (!node) { const e = new Error('node not found'); e.status = 404; throw e; }
  if (node.provider_id !== providerId) { const e = new Error('node does not belong to you'); e.status = 403; e.code = 'forbidden'; throw e; }

  const listing = {
    listing_id: makeId('lst'),
    provider_id: providerId,
    node_id: body.node_id,
    accelerator_type: node.accelerator_type || 'gpu',
    accelerator_model: node.accelerator_model || node.gpu_model,
    gpu_model: node.gpu_model,
    gpu_count: node.gpu_count,
    vram_gb: node.vram_gb_per_gpu * node.gpu_count,
    interconnect: node.interconnect,
    region: node.region,
    price_per_hour: body.price_per_hour,
    currency: 'USD',
    spot: body.spot === true,
    min_hours: body.min_hours ?? 1,
    max_hours: body.max_hours ?? 720,
    network_bandwidth_gbps: body.network_bandwidth_gbps ?? null,
    storage_gb: body.storage_gb ?? null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    view_count: 0,
    reservation_count: 0,
    created_at: new Date().toISOString(),
  };
  store.listings.set(listing.listing_id, listing);
  return { ...listing, available: isListingAvailable(listing) };
}

export function listListings(filters = {}) {
  let results = [...store.listings.values()];

  if (filters.accelerator_type) {
    results = results.filter(l => (l.accelerator_type || 'gpu') === String(filters.accelerator_type).toLowerCase());
  }
  if (filters.gpu_model) results = results.filter(l => l.gpu_model === filters.gpu_model);
  if (filters.accelerator_model) results = results.filter(l => (l.accelerator_model || l.gpu_model) === filters.accelerator_model);
  if (filters.region) results = results.filter(l => l.region === filters.region);
  if (filters.spot !== undefined) results = results.filter(l => l.spot === (filters.spot === 'true' || filters.spot === true));
  if (filters.interconnect) results = results.filter(l => l.interconnect === filters.interconnect);
  if (filters.min_vram_gb) results = results.filter(l => l.vram_gb >= Number(filters.min_vram_gb));
  if (filters.max_price_per_hour) {
    const maxPrice = parsePrice(filters.max_price_per_hour);
    results = results.filter(l => parsePrice(l.price_per_hour) <= maxPrice);
  }
  if (filters.tags) {
    const wantTags = filters.tags.split(',').map(t => t.trim());
    results = results.filter(l => wantTags.every(t => l.tags.includes(t)));
  }

  const withAvail = results.map(l => ({ ...l, available: isListingAvailable(l) }));

  if (filters.available !== undefined) {
    const want = filters.available === 'true' || filters.available === true;
    return withAvail.filter(l => l.available === want);
  }
  return withAvail;
}

export function getListing(listingId) {
  const listing = store.listings.get(listingId);
  if (!listing) { const e = new Error('listing not found'); e.status = 404; throw e; }
  listing.view_count++;
  return { ...listing, available: isListingAvailable(listing) };
}

export function updateListing(providerId, listingId, body) {
  const listing = store.listings.get(listingId);
  if (!listing) { const e = new Error('listing not found'); e.status = 404; throw e; }
  if (listing.provider_id !== providerId) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }

  if (body.price_per_hour !== undefined) { parsePrice(body.price_per_hour); listing.price_per_hour = body.price_per_hour; }
  if (body.spot !== undefined) listing.spot = body.spot === true;
  if (body.tags !== undefined && Array.isArray(body.tags)) listing.tags = body.tags;
  if (body.max_hours !== undefined) { if (!Number.isInteger(body.max_hours) || body.max_hours < 1) throw new Error('max_hours must be integer >= 1'); listing.max_hours = body.max_hours; }
  return { ...listing, available: isListingAvailable(listing) };
}

export function deleteListing(providerId, listingId) {
  const listing = store.listings.get(listingId);
  if (!listing) { const e = new Error('listing not found'); e.status = 404; throw e; }
  if (listing.provider_id !== providerId) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }
  store.listings.delete(listingId);
  return { deleted: true };
}

export { isListingAvailable };
