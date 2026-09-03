/**
 * Marketplace stats and discovery
 */

import { store, parsePrice } from './store.js';

export function getStats() {
  const accounts = [...store.accounts.values()];
  const providers = accounts.filter(a => a.role === 'provider');
  const nodes = [...store.nodes.values()];
  const listings = [...store.listings.values()];
  const models = [...store.models.values()];
  const reservations = [...store.reservations.values()];

  // Compute availability
  const availableListings = listings.filter(l => {
    const node = store.nodes.get(l.node_id);
    if (!node || node.attestation_status !== 'attested') return false;
    return ![...store.reservations.values()].some(r => r.listing_id === l.listing_id && r.status === 'active');
  });

  const gpuModels = [...new Set(nodes.map(n => n.gpu_model))];
  const regions = [...new Set(nodes.map(n => n.region))];

  let cheapest = null;
  for (const l of availableListings) {
    try {
      const p = parsePrice(l.price_per_hour);
      if (cheapest === null || p < cheapest.price) {
        cheapest = { price: p, str: l.price_per_hour };
      }
    } catch { /* skip */ }
  }

  return {
    providers: providers.length,
    nodes: { total: nodes.length, attested: nodes.filter(n => n.attestation_status === 'attested').length },
    listings: { total: listings.length, available: availableListings.length },
    models: { total: models.length, available: models.filter(m => m.status === 'available').length },
    reservations: { active: reservations.filter(r => r.status === 'active').length, total: reservations.length },
    gpu_models: gpuModels,
    regions,
    cheapest_per_hour: cheapest ? cheapest.str : null,
    currency: 'USD',
  };
}

export function getLeaderboard() {
  const providers = [...store.accounts.values()].filter(a => a.role === 'provider');

  const data = providers.map(p => {
    const providerListings = [...store.listings.values()].filter(l => l.provider_id === p.account_id);
    const reservationCount = providerListings.reduce((s, l) => s + l.reservation_count, 0);
    const regions = [...new Set(providerListings.map(l => l.region))];

    let totalPrice = 0n;
    let priceCount = 0;
    for (const l of providerListings) {
      try { totalPrice += parsePrice(l.price_per_hour); priceCount++; } catch { /* skip */ }
    }
    const avgPrice = priceCount > 0
      ? (totalPrice / BigInt(priceCount))
      : 0n;

    const avgStr = priceCount > 0
      ? (() => {
          const SCALE = 1_000_000n;
          const intPart = avgPrice / SCALE;
          const fracPart = avgPrice % SCALE;
          const fracStr = String(fracPart).padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
          return `${intPart}.${fracStr}`;
        })()
      : '0.00';

    return {
      provider_id: p.account_id,
      name: p.name,
      region: regions[0] || null,
      reservation_count: reservationCount,
      avg_price_per_hour: avgStr,
    };
  });

  return data
    .sort((a, b) => b.reservation_count - a.reservation_count)
    .slice(0, 5);
}
