/**
 * In-process store — shared across all modules via module singleton.
 */

export const store = {
  accounts: new Map(),      // api_key -> account
  accountsByEmail: new Map(), // email -> account
  accountsById: new Map(),  // account_id -> account

  nodes: new Map(),         // node_id -> node
  listings: new Map(),      // listing_id -> listing
  reservations: new Map(),  // reservation_id -> reservation
  models: new Map(),        // model_id -> model
  usageEvents: [],          // append-only
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
let seq = 0;
export function makeId(prefix) {
  const ts = Date.now().toString(36);
  const s = (++seq).toString(36);
  return `${prefix}_${ts}_${s}`;
}

// ---------------------------------------------------------------------------
// Money arithmetic — BigInt scaled to 1_000_000
// ---------------------------------------------------------------------------
export const SCALE = 1_000_000n;

export function parsePrice(str) {
  if (typeof str !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(str)) {
    throw new Error(`Invalid price: ${str}`);
  }
  const [intPart, fracPart = ''] = str.split('.');
  const frac = fracPart.padEnd(6, '0');
  return BigInt(intPart) * SCALE + BigInt(frac);
}

export function formatPrice(scaled) {
  const intPart = scaled / SCALE;
  const fracPart = scaled % SCALE;
  const fracStr = String(fracPart).padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${intPart}.${fracStr}`;
}
