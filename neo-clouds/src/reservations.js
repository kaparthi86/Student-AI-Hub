/**
 * Reservations — full lifecycle: pending → active → completed | cancelled
 */

import { store, makeId, parsePrice, formatPrice } from './store.js';
import { isListingAvailable } from './listings.js';

export function createReservation(customerId, body) {
  const { listing_id, hours, starts_at } = body;
  if (!listing_id) throw new Error('listing_id is required');
  if (!Number.isInteger(hours) || hours < 1) throw new Error('hours must be positive integer');

  const listing = store.listings.get(listing_id);
  if (!listing) { const e = new Error('listing not found'); e.status = 404; throw e; }

  if (!isListingAvailable(listing)) {
    const e = new Error('listing is not available'); e.status = 409; throw e;
  }
  if (hours < listing.min_hours) throw new Error(`hours must be >= min_hours (${listing.min_hours})`);
  if (hours > listing.max_hours) throw new Error(`hours must be <= max_hours (${listing.max_hours})`);

  const node = store.nodes.get(listing.node_id);
  const priceScaled = parsePrice(listing.price_per_hour);
  const total = priceScaled * BigInt(hours);

  const startsAt = starts_at ? new Date(starts_at) : new Date();
  const endsAt = new Date(startsAt.getTime() + hours * 3600_000);

  const reservation = {
    reservation_id: makeId('res'),
    listing_id,
    node_id: listing.node_id,
    customer_id: customerId,
    provider_id: listing.provider_id,
    hours,
    total_price: formatPrice(total),
    currency: 'USD',
    status: 'active',
    reserved_at: new Date().toISOString(),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    cancelled_at: null,
    cancellation_reason: null,
    connection_info: {
      ssh_host: node.hostname,
      ssh_port: 22,
      note: 'SSH key exchange not yet implemented',
    },
  };

  store.reservations.set(reservation.reservation_id, reservation);
  listing.reservation_count++;
  return reservation;
}

export function listReservations(account) {
  return [...store.reservations.values()].filter(r => {
    if (account.role === 'customer') return r.customer_id === account.account_id;
    if (account.role === 'provider') return r.provider_id === account.account_id;
    return false;
  });
}

export function getReservation(account, reservationId) {
  const r = store.reservations.get(reservationId);
  if (!r) { const e = new Error('reservation not found'); e.status = 404; throw e; }
  if (account.role === 'customer' && r.customer_id !== account.account_id) {
    const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e;
  }
  if (account.role === 'provider' && r.provider_id !== account.account_id) {
    const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e;
  }
  return r;
}

export function cancelReservation(account, reservationId, reason) {
  const r = store.reservations.get(reservationId);
  if (!r) { const e = new Error('reservation not found'); e.status = 404; throw e; }
  const isCustomer = account.role === 'customer' && r.customer_id === account.account_id;
  const isProvider = account.role === 'provider' && r.provider_id === account.account_id;
  if (!isCustomer && !isProvider) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }
  if (r.status === 'completed') { const e = new Error('cannot cancel completed reservation'); e.status = 409; throw e; }
  if (r.status === 'cancelled') { const e = new Error('already cancelled'); e.status = 409; throw e; }

  r.status = 'cancelled';
  r.cancelled_at = new Date().toISOString();
  r.cancellation_reason = reason || null;
  return r;
}

export function completeReservation(providerId, reservationId) {
  const r = store.reservations.get(reservationId);
  if (!r) { const e = new Error('reservation not found'); e.status = 404; throw e; }
  if (r.provider_id !== providerId) { const e = new Error('forbidden'); e.status = 403; e.code = 'forbidden'; throw e; }
  if (r.status !== 'active') { const e = new Error('only active reservations can be completed'); e.status = 409; throw e; }
  r.status = 'completed';
  return r;
}
