/**
 * Neo Clouds GPU Marketplace — v1 entry point
 */

import { createMarketplaceServer } from './server.js';

export { createMarketplaceServer } from './server.js';

const PORT = process.env.PORT || 3000;
const server = createMarketplaceServer();
server.listen(PORT, () => {
  console.log(`Neo Clouds Marketplace listening on http://localhost:${PORT}`);
});
