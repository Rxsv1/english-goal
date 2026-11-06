'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
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
const pages = {};
for (const name of ['index.html', 'admin.html']) {
  pages[name] = fs.readFileSync(path.join(PUBLIC_DIR, name), 'utf8').replace(/\{\{APP_NAME\}\}/g, escapeHtml(APP_NAME));
}
const sendPage = name => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(pages[name]);
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

app.get('/admin', sendPage('admin.html'));
app.get(['/', '/login', '/signup', '/profile', '/practice', '/lesson/:slug', '/lesson/:slug/:step', '/lesson/:slug/u/:unit/:step'], sendPage('index.html'));

app.use(express.static(PUBLIC_DIR, {
  index: false,
  setHeaders(res, file) {
    if (file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
    else res.set('Cache-Control', 'public, max-age=300');
  },
}));
app.use((req, res) => res.status(404).type('html').send(pages['index.html']));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File is too large (max 1 MB).' });
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
  app.listen(PORT, HOST, () => {
    console.log(`${APP_NAME} running on http://${HOST}:${PORT}`);
    if (!auth.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set - the /admin page is disabled.');
  });
})();
