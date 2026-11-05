/* Offline support: app shell is cached; lessons use network-first with cache fallback. */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const SHELL_FILES = ['/', '/app.js', '/style.css', '/vendor/Sortable.min.js', '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackUrl || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackUrl || req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/admin')) return;

  if (url.pathname.startsWith('/api/lessons')) {
    e.respondWith(networkFirst(req, DATA));
  } else if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL, '/'));
  } else {
    e.respondWith(
      caches.match(req).then(hit => {
        const fresh = fetch(req).then(res => {
          if (res.ok) caches.open(SHELL).then(c => c.put(req, res.clone()));
          return res;
        });
        return hit || fresh;
      })
    );
  }
});
