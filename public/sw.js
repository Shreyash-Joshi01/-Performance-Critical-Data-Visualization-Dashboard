/**
 * P2 "Service Worker" / "PWA" item. Plain static JS in /public, same reason
 * as /public/workers/dataProcessor.worker.js: a service worker (like a
 * dedicated Worker) is a separate script Next.js's webpack config doesn't
 * know how to bundle-and-register for you, so it's served as-is and
 * registered by URL (see the registration effect in app/layout.tsx).
 *
 * Scope, deliberately: this makes the *app shell* (the HTML/JS/CSS that
 * renders the dashboard UI) resilient to a flaky network and installable as
 * a standalone app (manifest.json) — it does NOT make the live data work
 * offline, because that would be dishonest. This dashboard's entire premise
 * is a real-time stream; a service worker serving yesterday's cached prices
 * while claiming to be "live" would be strictly worse than no offline
 * support at all. So /api/... requests are explicitly passed through
 * untouched (see the fetch handler below) — including the streaming NDJSON
 * endpoint, which a caching fetch handler would otherwise have to buffer in
 * full before it could even decide whether to cache it, defeating the
 * entire point of that route being a stream.
 *
 * Without this file: the dashboard still works identically over a normal
 * network connection (nothing here is on the hot rendering path), but a
 * flaky connection mid-navigation gets a browser error page instead of the
 * cached shell, and there's nothing for a browser to "install" as an app.
 */

const CACHE_VERSION = "perf-dashboard-v1";

self.addEventListener("install", (event) => {
  // Activate this version immediately rather than waiting for every open
  // tab of the old version to close — appropriate here because the cached
  // shell is a progressive-enhancement layer, not something a half-updated
  // version could corrupt (each response is just cached-or-refetched, there's
  // no schema/migration to get wrong).
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(["/manifest.json", "/icon.svg"]).catch(() => {
        // Pre-caching is best-effort — if it fails (e.g. offline on first
        // install), the runtime cache-as-you-go strategy below still works.
      }),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever handle same-origin GET requests. Cross-origin requests (fonts,
  // analytics, anything else) and non-GET requests (this app makes none on
  // the hot path, but Server Actions are POSTs — see app/actions.ts) are
  // left completely alone.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // The data API is intentionally never intercepted: /api/data streams
  // NDJSON and must always reflect a fresh, real request — a service worker
  // "helpfully" caching or replaying it would mean stale prices presented
  // as live ones, which is worse than the page just failing to load.
  if (url.pathname.startsWith("/api/")) return;

  // Next.js's built static assets (/_next/static/...) are content-hashed —
  // the filename itself changes whenever the content does, so a cached copy
  // is either exactly right or irrelevant, never stale. Cache-first is safe
  // and skips the network entirely once warm.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Everything else same-origin (the dashboard page, the worker script,
  // manifest/icon) — network-first so a normal visit always sees the latest
  // build, falling back to whatever's cached (from a previous visit) only
  // when the network request actually fails.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
