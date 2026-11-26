/**
 * Self-unregistering cleanup Service Worker (audit 47.6 FE-01).
 *
 * Replaces the legacy cache-first `applify-v2` worker that cached navigation URLs
 * (including query strings like `/auth/callback?code=...`). Returning users whose browser
 * still had the old worker registered will download this file, wipe all caches,
 * unregister the worker, and release control back to the network.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        for (const client of clients) {
          if ('navigate' in client) client.navigate(client.url).catch(() => {});
        }
      })
  );
});
