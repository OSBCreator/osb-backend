/* ═══════════════════════════════════════════════════════════════════════
   OSB CHAT CONSOLE — SERVICE WORKER

   Purpose is installability only. This worker deliberately caches NOTHING.

   A live support console showing a cached queue or a stale conversation
   would be worse than useless — an operator could believe nobody is waiting
   when someone is. Every request goes to the network, every time.
   ═══════════════════════════════════════════════════════════════════════ */

self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  // Network only. No caching under any circumstance.
  event.respondWith(fetch(event.request));
});
