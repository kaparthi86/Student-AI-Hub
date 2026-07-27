/* Minimal service worker: enables install (Chrome/Edge) without intercepting traffic.
 * A pass-through fetch handler (respondWith(fetch(...))) adds latency on Safari/WebKit.
 * Keeping a no-op fetch listener preserves installability without owning every request.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  /* Intentionally do not call respondWith — browser uses the network path directly. */
});
