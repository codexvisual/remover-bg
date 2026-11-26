/* Service worker: cache AI model assets for instant repeat removals, and keep
   the app itself network-first so every deploy shows up immediately. */
const APP_CACHE = 'remover-bg-app-v3';
const AI_CACHE = 'remover-bg-ai-v1';
const LEGACY_CACHES = ['remover-bg-v1', 'remover-bg-v2'];
const AI_HOSTS = ['staticimgly.com', 'esm.sh', 'fonts.gstatic.com', 'fonts.googleapis.com'];

self.addEventListener('install', () => self.skipWaiting());

function isAiHost(host) {
  return AI_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

/* Move model files cached by older versions into the AI cache once, then
   drop the old shared cache so storage is not doubled. */
async function migrateLegacyCache() {
  try {
    const ai = await caches.open(AI_CACHE);
    for (const name of LEGACY_CACHES) {
      const legacy = await caches.open(name);
      const keys = await legacy.keys();
      if (!keys.length) { await caches.delete(name); continue; }
      for (const req of keys) {
        let host = '';
        try { host = new URL(req.url).hostname; } catch (e) { continue; }
        if (!isAiHost(host)) continue;
        const res = await legacy.match(req);
        if (res) await ai.put(req, res);
      }
      await caches.delete(name);
    }
  } catch (e) { /* keep working without the old caches */ }
}

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== AI_CACHE && LEGACY_CACHES.indexOf(k) === -1)
          .filter(k => k.indexOf('remover-bg') === 0)
          .map(k => caches.delete(k))
      ))
      .then(migrateLegacyCache)
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }

  // AI model / CDN assets: cache first, then network.
  if (isAiHost(url.hostname)) {
    event.respondWith(
      caches.open(AI_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Own pages and assets: network first, bypassing the HTTP cache, so new
  // deploys are never stale. Fall back to the cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_CACHE).then(async cache => {
        try {
          const res = await fetch(req, { cache: 'no-store' });
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return (await cache.match(req)) || Response.error();
        }
      })
    );
  }
});
