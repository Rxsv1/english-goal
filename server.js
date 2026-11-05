'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createStore, ConflictError } = require('./src/store');
const { validateLesson, LEVELS } = require('./src/validate');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.createHash('sha256').update('sp-session:' + ADMIN_PASSWORD).digest('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const store = createStore();
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

/* ---------- Helpers ---------- */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

function signToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(String(exp)).digest('base64url');
  return `${exp}.${sig}`;
}

function verifyToken(token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(exp).digest('base64url');
  return safeEqual(sig, expected);
}

// Small in-memory limiter for login attempts: 10 tries / 15 min per IP.
const attempts = new Map();
function loginLimited(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { n: 1, reset: now + 15 * 60 * 1000 });
    return false;
  }
  a.n++;
  return a.n > 10;
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin is disabled. Set the ADMIN_PASSWORD environment variable.' });
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) return res.status(401).json({ error: 'Please log in again.' });
  next();
}

/* ---------- Public API ---------- */
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/lessons', wrap(async (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ lessons: await store.list(), levels: LEVELS });
}));

app.get('/api/lessons/:slug', wrap(async (req, res) => {
  const lesson = await store.getBySlug(req.params.slug);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
  res.set('Cache-Control', 'no-cache');
  res.json({ lesson });
}));

/* ---------- Admin API ---------- */
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin is disabled. Set the ADMIN_PASSWORD environment variable.' });
  if (loginLimited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const password = req.body && req.body.password;
  if (typeof password !== 'string' || !safeEqual(password, ADMIN_PASSWORD))
    return res.status(401).json({ error: 'Wrong password.' });
  attempts.delete(req.ip);
  res.json({ token: signToken() });
});

app.use('/api/admin', requireAdmin);

app.get('/api/admin/lessons', wrap(async (req, res) => {
  res.json({ lessons: await store.list({ includeDrafts: true }), levels: LEVELS });
}));

app.get('/api/admin/lessons/:id', wrap(async (req, res) => {
  const lesson = await store.getById(req.params.id);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
  res.json({ lesson });
}));

app.get('/api/admin/export', wrap(async (req, res) => {
  res.set('Content-Disposition', 'attachment; filename="lessons-export.json"');
  res.json({ version: 1, exportedAt: new Date().toISOString(), lessons: await store.exportAll() });
}));

app.post('/api/admin/lessons', wrap(async (req, res) => {
  const { lesson, errors } = validateLesson(req.body);
  if (errors) return res.status(400).json({ error: errors[0], errors });
  try {
    res.status(201).json({ lesson: await store.create(lesson) });
  } catch (e) {
    if (e instanceof ConflictError) return res.status(409).json({ error: `The link name "${lesson.slug}" is already used by another lesson.` });
    throw e;
  }
}));

app.put('/api/admin/lessons/:id', wrap(async (req, res) => {
  const { lesson, errors } = validateLesson(req.body);
  if (errors) return res.status(400).json({ error: errors[0], errors });
  try {
    const updated = await store.update(req.params.id, lesson);
    if (!updated) return res.status(404).json({ error: 'Lesson not found.' });
    res.json({ lesson: updated });
  } catch (e) {
    if (e instanceof ConflictError) return res.status(409).json({ error: `The link name "${lesson.slug}" is already used by another lesson.` });
    throw e;
  }
}));

app.delete('/api/admin/lessons/:id', wrap(async (req, res) => {
  if (!(await store.remove(req.params.id))) return res.status(404).json({ error: 'Lesson not found.' });
  res.status(204).end();
}));

app.post('/api/admin/reorder', wrap(async (req, res) => {
  const ids = req.body && req.body.ids;
  if (!Array.isArray(ids) || !ids.every(x => typeof x === 'string')) return res.status(400).json({ error: 'ids must be a list.' });
  await store.reorder(ids);
  res.status(204).end();
}));

// Bulk import: { lessons: [...] } - existing slugs are updated, new ones created.
app.post('/api/admin/import', wrap(async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body && req.body.lessons;
  if (!Array.isArray(list) || list.length === 0) return res.status(400).json({ error: 'The file has no lessons.' });
  if (list.length > 200) return res.status(400).json({ error: 'Import at most 200 lessons at once.' });
  const checked = list.map((item, i) => {
    const r = validateLesson(item);
    return r.errors ? { error: `Lesson ${i + 1} (${(item && item.title) || 'untitled'}): ${r.errors[0]}` } : r;
  });
  const bad = checked.find(c => c.error);
  if (bad) return res.status(400).json({ error: bad.error });

  let created = 0, updated = 0;
  for (const { lesson } of checked) {
    const existing = await store.getBySlug(lesson.slug, { includeDrafts: true });
    if (existing) { await store.update(existing.id, lesson); updated++; }
    else { await store.create(lesson); created++; }
  }
  res.json({ created, updated });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

/* ---------- Static files & pages ---------- */
app.use(express.static(PUBLIC_DIR, {
  index: false,
  setHeaders(res, file) {
    if (/\.(html|webmanifest)$/.test(file) || file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
    else res.set('Cache-Control', 'public, max-age=3600');
  },
}));

const sendPage = name => (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, name));
};
app.get('/admin', sendPage('admin.html'));
app.get(['/', '/practice', '/lesson/:slug'], sendPage('index.html'));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File is too large (max 1 MB).' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ---------- Start ---------- */
store.init()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`Sentence Puzzle running on http://${HOST}:${PORT}`);
      if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set - the /admin page is disabled.');
    });
  })
  .catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
