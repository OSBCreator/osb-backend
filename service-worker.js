/* ═══════════════════════════════════════════════════════════════════════
   OSB SERVICE WORKER
   Makes the site installable and usable offline for its static pages,
   while guaranteeing every live data call (chat, newsroom, submissions,
   admin) always goes to the real server — never served from cache.
   ═══════════════════════════════════════════════════════════════════════ */

const VERSION = "osb-v1";
const SHELL_CACHE = VERSION + "-shell";
const RUNTIME_CACHE = VERSION + "-runtime";

// The core pages worth having available instantly / offline.
// Keep this list short and deliberate — it is downloaded on every first visit.
const SHELL_FILES = [
  "/",
  "/index.html",
  "/score.html",
  "/solace.html",
  "/community.html",
  "/contact.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/osb-emblem.png",
  "/osb-logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Anything matching these is LIVE DATA. Never cache. Always go to the network.
// This is the most important rule in this file — getting it wrong means a
// visitor could see a stale chat message, a stale newsroom, or (worse) a
// cached admin/score submission response.
const NEVER_CACHE = [
  "/functions/v1/", // every Supabase Edge Function: osb-api, osb-news, chat routes
  "/api/",
  "chat-console.html",
  "admin.html"
];

function isNeverCache(url) {
  return NEVER_CACHE.some(function (frag) { return url.includes(frag); });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL_FILES).catch(function (err) {
        // Don't let one missing file (e.g. a page not yet deployed) break
        // installation of everything else.
        console.warn("OSB SW: partial shell cache failure", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k.startsWith("osb-") && k !== SHELL_CACHE && k !== RUNTIME_CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return; // never intercept POST (chat sends, form submits, etc.)

  const url = req.url;

  // Rule 1 — live data and sensitive consoles: network only, no cache involved at all.
  if (isNeverCache(url)) {
    event.respondWith(fetch(req));
    return;
  }

  // Rule 2 — page navigations: try the network first (so content is fresh and
  // the newsroom/wire teaser etc. always attempt a live fetch), fall back to
  // the cached shell page, then to a dedicated offline page as a last resort.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match("/offline.html");
          });
        })
    );
    return;
  }

  // Rule 3 — static assets (images, icons): cache-first, refresh in background.
  event.respondWith(
    caches.match(req).then(function (cached) {
      const network = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});
