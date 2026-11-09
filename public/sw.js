/* Offline support. Everything is fetched from the network first, so updates show up
   immediately; the saved copy is only used when there is no internet.
   API calls are never cached (progress is queued by the app itself when offline). */
const VERSION = 'v26';
const SHELL = `shell-${VERSION}`;
const SHELL_FILES = ['/', '/app.js', '/progress-core.js', '/quiz-core.js', '/style.css', '/desktop.css', '/vendor/Sortable.min.js', '/icons/icon.svg'];

self.addEventListener('install', e => {
  // Each file is saved on its own: addAll() would give up on everything if a single file failed to download.
  e.waitUntil(
    caches.open(SHELL)
      .then(c => Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        // Keep a copy of normal same-origin pages and files for when the network is gone.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req.mode === 'navigate' ? '/' : req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then(hit => hit || caches.match('/')))
  );
});
