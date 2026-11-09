'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const compression = require('compression');
const { createPool, migrate } = require('./src/db');
const auth = require('./src/auth');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const APP_NAME = (process.env.APP_NAME || 'WordStack').trim().slice(0, 40) || 'WordStack';
const PUBLIC_DIR = path.join(__dirname, 'public');

const pool = createPool();
pool.on('error', err => console.error('[db] idle client error:', err.message));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '1mb' }));

/* ---------- Security headers ---------- */
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  });
  next();
});

// Basic CSRF protection: state-changing API calls must be JSON (HTML forms can't send that cross-site).
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json'))
    return res.status(415).json({ error: 'Requests must be sent as JSON.' });
  next();
});

/* ---------- API ---------- */
app.get('/healthz', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(503).json({ ok: false }); }
});
app.use('/api/admin', require('./src/routes/admin')(pool));
app.use('/api', require('./src/routes/student')(pool));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

/* ---------- Pages (app name filled in) ---------- */
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rawPages = {};
for (const name of ['index.html', 'admin.html']) {
  rawPages[name] = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8').replace(/\{\{APP_NAME\}\}/g, escapeHtml(APP_NAME));
}

// Skeleton screens live as <template id="sk-NAME"> in the HTML files. The server copies the one that fits the
// requested URL into the page, so the placeholder is painted straight from the first byte, before any JavaScript runs.
const skeletons = {};
for (const html of Object.values(rawPages))
  for (const m of html.matchAll(/<template id="sk-([a-z-]+)">([\s\S]*?)<\/template>/g)) skeletons[m[1]] = m[2];

const studentSkeleton = p =>
  /^\/(login|signup)\/?$/.test(p) ? 'auth'
    : /^\/lesson\/[^/]+\/(u\/|final$)/.test(p) ? 'step'
      : /^\/lesson\//.test(p) ? 'hub'
        : p === '/profile' ? 'profile'
          : p === '/practice' ? 'practice'
            : 'home';

// Which kind of screen each skeleton belongs to; the style sheet uses it to size the page on large screens.
const LAYOUT_OF = { home: 'wide', hub: 'wide', step: 'game', practice: 'game', profile: 'narrow', auth: 'narrow' };

const rendered = new Map(); // "page:kind" -> final HTML, built once
function renderPage(name, kind) {
  const key = name + ':' + kind;
  if (!rendered.has(key)) {
    const layer = `<div class="sk-layer" data-kind="${kind}" role="status" aria-label="Loading">${skeletons[kind] || ''}</div>`;
    rendered.set(key, rawPages[name].replace('{{SKELETON}}', layer).replace('{{LAYOUT}}', LAYOUT_OF[kind] || 'wide'));
  }
  return rendered.get(key);
}
const sendPage = (name, kindFor) => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(renderPage(name, kindFor(req.path)));
};

app.get('/manifest.webmanifest', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/manifest+json').send(JSON.stringify({
    name: APP_NAME,
    short_name: APP_NAME,
    description: 'Learn English one sentence at a time.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F4F7FB',
    theme_color: '#2FB5AB',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }));
});

app.get('/admin', sendPage('admin.html', () => 'tiles'));
app.get(['/', '/login', '/signup', '/profile', '/practice', '/completed', '/lesson/:slug', '/lesson/:slug/:step', '/lesson/:slug/u/:unit/:step'], sendPage('index.html', studentSkeleton));

app.use(express.static(PUBLIC_DIR, {
  index: false,
  setHeaders(res, file) {
    if (file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
    else res.set('Cache-Control', 'public, max-age=300');
  },
}));
app.use((req, res) => res.status(404).type('html').send(renderPage('index.html', studentSkeleton(req.path))));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File is too large (max 1 MB).' });
  // Bad requests (for example a malformed URL) are the caller's mistake, not a server failure.
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Bad request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ---------- Start ---------- */
(async function start() {
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(pool);
      break;
    } catch (err) {
      console.error(`[db] Could not connect or set up the database (attempt ${attempt}): ${err.message}`);
      if (/password must be a string/.test(err.message))
        console.error('[db] Hint: DATABASE_URL has no password. Copy it again after clicking "Reveal", or add PGPASSWORD.');
      if (attempt >= 5) process.exit(1);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  const server = app.listen(PORT, HOST, () => {
    console.log(`${APP_NAME} running on http://${HOST}:${PORT}`);
    if (!auth.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set - the /admin page is disabled.');
  });
  // Load balancers keep connections open for about 60 s; staying open a little longer avoids sporadic 502s.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // A redeploy sends SIGTERM: finish the requests in progress (a child's last save!), then close the database.
  let stopping = false;
  const shutdown = signal => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${signal} received, finishing open requests...`);
    setTimeout(() => process.exit(0), 10000).unref(); // never hang a redeploy
    server.close(() => pool.end().catch(() => {}).then(() => process.exit(0)));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();

// A forgotten .catch somewhere must not take the whole app (and every student's session) down.
process.on('unhandledRejection', reason => console.error('[server] unhandled rejection:', reason && reason.stack ? reason.stack : reason));
