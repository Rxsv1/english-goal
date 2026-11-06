'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  if (ADMIN_PASSWORD) {
    SECRET = crypto.createHash('sha256').update('wordstack-session:' + ADMIN_PASSWORD).digest('hex');
  } else {
    SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('[auth] SESSION_SECRET is not set - everyone will be logged out when the app restarts.');
  }
}

const USER_COOKIE = 'ws_session';
const USER_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const ADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ---------- passwords ---------- */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [algo, saltB64, hashB64] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/* ---------- signed tokens ---------- */
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function unsign(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/* ---------- cookies ---------- */
function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setUserCookie(req, res, userId) {
  res.cookie(USER_COOKIE, sign({ u: userId, exp: Date.now() + USER_TTL_MS }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: USER_TTL_MS,
    path: '/',
  });
}

function clearUserCookie(req, res) {
  res.clearCookie(USER_COOKIE, { httpOnly: true, sameSite: 'lax', secure: req.secure, path: '/' });
}

/* ---------- rate limiting (in memory) ---------- */
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return {
    hit(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
      h.n++;
      return h.n > max;
    },
    clear(key) { hits.delete(key); },
  };
}

/* ---------- middleware ---------- */
function userMiddleware(pool) {
  const SEEN_EVERY_MS = 5 * 60 * 1000;
  return async function requireUser(req, res, next) {
    try {
      const payload = unsign(readCookie(req, USER_COOKIE));
      if (!payload || !payload.u) return res.status(401).json({ error: 'Please log in.' });
      const { rows } = await pool.query(
        'SELECT id, email, name, disabled, created_at, last_seen_at FROM users WHERE id = $1',
        [payload.u]
      );
      const user = rows[0];
      if (!user) { clearUserCookie(req, res); return res.status(401).json({ error: 'Please log in.' }); }
      if (user.disabled) { clearUserCookie(req, res); return res.status(403).json({ error: 'Your account has been disabled. Please contact your teacher.' }); }
      if (!user.last_seen_at || Date.now() - new Date(user.last_seen_at).getTime() > SEEN_EVERY_MS) {
        pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [user.id]).catch(() => {});
      }
      req.user = user;
      next();
    } catch (e) {
      next(e);
    }
  };
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin is disabled. Set the ADMIN_PASSWORD environment variable.' });
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const payload = unsign(token);
  if (!payload || payload.a !== 1) return res.status(401).json({ error: 'Please log in again.' });
  next();
}

const adminToken = () => sign({ a: 1, exp: Date.now() + ADMIN_TTL_MS });

module.exports = {
  ADMIN_PASSWORD,
  hashPassword,
  verifyPassword,
  safeEqual,
  setUserCookie,
  clearUserCookie,
  limiter,
  userMiddleware,
  requireAdmin,
  adminToken,
};
