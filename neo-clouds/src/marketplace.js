/**
 * Neo Clouds GPU Marketplace — production entry point
 */

import { createMarketplaceServer } from './server.js';
import { seedDemoMarketplace } from './seed.js';

const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '0.0.0.0';

const seedInfo = seedDemoMarketplace();
const server = createMarketplaceServer();

server.listen(PORT, HOST, () => {
  const domain = process.env.CANONICAL_DOMAIN || 'neocloudsmarketplace.com';
  console.log(`Neo Clouds Marketplace listening on http://${HOST}:${PORT}`);
  console.log(`Canonical domain: https://${domain}`);
  if (seedInfo) {
    console.log('SEED_DEMO=1 — demo listings and models loaded.');
  }
  if (process.env.BETA_TESTING === '1') {
    console.log(`Beta banner: ${process.env.BETA_MESSAGE || '(default message)'}`);
  }
});
