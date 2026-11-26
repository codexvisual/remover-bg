/* Service worker: cache AI model assets and static files for instant
   repeat visits and offline quick-mode operation. */
const CACHE = 'remover-bg-v1';
const AI_HOSTS = ['staticimgly.com', 'esm.sh', 'fonts.gstatic.com', 'fonts.googleapis.com'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }

  // AI model / CDN assets: cache first, then network.
  if (AI_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Own pages: network first so new deploys show immediately.
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req).then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => caches.match(req))
      );
      return;
    }
    // Code and assets: network first so new deploys are never stale.
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cache.match(req);
        }
      })
    );
  }
});
