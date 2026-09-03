/**
 * Health and launch metadata — mirrors AI Hub /api/health pattern.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const indexHtmlPath = join(PUBLIC_DIR, 'index.html');

export function betaBannerText() {
  if (process.env.BETA_TESTING !== '1') return '';
  return (
    process.env.BETA_MESSAGE ||
    'Neo Clouds is in early access. GPU listings and inference are simulated until providers connect real hardware.'
  );
}

export function healthPayload() {
  const prod = process.env.NODE_ENV === 'production';
  const indexHtmlDeployed = existsSync(indexHtmlPath);
  const base = {
    ok: true,
    service: 'neo-clouds-marketplace',
    betaMessage: betaBannerText(),
    indexHtmlDeployed,
    seedDemoEnabled: process.env.SEED_DEMO === '1',
    accounts: store.accounts.size,
    listings: store.listings.size,
    models: store.models.size,
    canonicalDomain: process.env.CANONICAL_DOMAIN || 'neocloudsmarketplace.com',
  };
  if (prod) return base;
  return {
    ...base,
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 8788,
    ...(indexHtmlDeployed
      ? {}
      : {
          deployHint:
            'Missing public/index.html. Set Render Root Directory to neo-clouds and redeploy.',
        }),
  };
}
