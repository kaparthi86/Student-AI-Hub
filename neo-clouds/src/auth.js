/**
 * Auth — API key registration and middleware
 */

import { randomBytes } from 'node:crypto';
import { store, makeId } from './store.js';

function generateKey(role) {
  const prefix = role === 'provider' ? 'nkp' : 'nck';
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

export function registerAccount({ name, email, role }) {
  if (!name || typeof name !== 'string') throw new Error('name is required');
  if (!email || typeof email !== 'string') throw new Error('email is required');
  if (role !== 'provider' && role !== 'customer') throw new Error('role must be provider or customer');
  if (store.accountsByEmail.has(email)) throw new Error('email already registered');

  const api_key = generateKey(role);
  const account = {
    account_id: makeId('acc'),
    name,
    email,
    role,
    api_key,
    created_at: new Date().toISOString(),
  };
  store.accounts.set(api_key, account);
  store.accountsByEmail.set(email, account);
  store.accountsById.set(account.account_id, account);
  return account;
}

export function getAccountByKey(key) {
  return store.accounts.get(key) || null;
}

// ---------------------------------------------------------------------------
// Middleware helpers
// ---------------------------------------------------------------------------

export function authenticate(req) {
  const auth = req.headers['authorization'] || '';
  const match = auth.match(/^Bearer (.+)$/);
  if (!match) return null;
  return getAccountByKey(match[1]);
}

export function requireAuth(account) {
  if (!account) {
    const err = new Error('Missing or invalid API key');
    err.status = 401;
    err.code = 'unauthorized';
    throw err;
  }
}

export function requireRole(account, ...roles) {
  requireAuth(account);
  if (!roles.includes(account.role)) {
    const err = new Error(`Role '${account.role}' not allowed; need ${roles.join(' or ')}`);
    err.status = 403;
    err.code = 'forbidden';
    throw err;
  }
}
