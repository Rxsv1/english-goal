'use strict';

/**
 * End-to-end API tests. They start the real server against a PostgreSQL database, so they only run
 * when TEST_DATABASE_URL is set (the database is wiped first - use an empty one!):
 *
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/wordstack_test npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const DB = process.env.TEST_DATABASE_URL;
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const skip = DB ? false : 'set TEST_DATABASE_URL to run the API tests';

let server;
let adminToken;

async function call(method, url, body, { token, cookie } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}
const admin = (method, url, body) => call(method, '/api/admin' + url, body, { token: adminToken });

async function newStudent(name) {
  const email = `${name.toLowerCase()}-${Date.now()}@example.com`;
  const created = await admin('POST', '/users', { name, email, password: 'password123' });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const login = await call('POST', '/api/auth/login', { email, password: 'password123' });
  assert.equal(login.status, 200);
  const cookie = login.setCookie.split(';')[0];
  const as = (method, url, body) => call(method, '/api' + url, body, { cookie });
  return { id: created.data.user.id, name, as };
}

const lessonBody = (title, extra = {}) => ({
  title,
  units: [
    { title: 'One', sentences: [{ en: 'I like green apples' }, { en: 'She is reading a book' }] },
    { title: 'Two', sentences: [{ en: 'We are going home now' }] },
  ],
  ...extra,
});

const solve = (s, slug, sentence, mistakes = 0, hints = 0) =>
  s.as('POST', `/lessons/${slug}/solve`, { sentence, mistakes, hints, cid: Math.random().toString(36) });

before(async () => {
  if (skip) return;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT), ADMIN_PASSWORD: 'admin-pass', SESSION_SECRET: 'test-secret', ALLOW_SIGNUP: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  adminToken = (await call('POST', '/api/admin/login', { password: 'admin-pass' })).data.token;
});

after(() => { if (server) server.kill(); });

test('admin can create a lesson inside a student card, private to that student', { skip }, async () => {
  const sara = await newStudent('Sara');
  const omar = await newStudent('Omar');

  const made = await admin('POST', `/users/${sara.id}/lessons`, lessonBody('Sara special'));
  assert.equal(made.status, 201, JSON.stringify(made.data));
  assert.equal(made.data.lesson.visibility, 'assigned');
  const slug = made.data.lesson.slug;

  // Same title again: the link name is made unique automatically instead of failing.
  const again = await admin('POST', `/users/${sara.id}/lessons`, lessonBody('Sara special'));
  assert.equal(again.status, 201);
  assert.notEqual(again.data.lesson.slug, slug);

  const saraLessons = (await sara.as('GET', '/lessons')).data.lessons;
  const mine = saraLessons.find(l => l.slug === slug);
  assert.ok(mine, 'Sara sees her private lesson');
  assert.equal(mine.assigned, true);
  const omarLessons = (await omar.as('GET', '/lessons')).data.lessons;
  assert.ok(!omarLessons.some(l => l.slug === slug), 'Omar does not see it');
  assert.equal((await omar.as('GET', `/lessons/${slug}`)).status, 404);

  // Unknown student
  assert.equal((await admin('POST', '/users/nope/lessons', lessonBody('X'))).status, 404);

  // Student card shows it as assigned, with the count of students who have it
  const card = (await admin('GET', `/users/${sara.id}`)).data;
  const row = card.lessons.find(l => l.slug === slug);
  assert.equal(row.assignedToUser, true);
  assert.equal(row.assignedCount, 1);

  // Take it away again: Sara loses it, Omar was never affected.
  assert.equal((await admin('DELETE', `/users/${sara.id}/assignments/${made.data.lesson.id}`)).status, 204);
  assert.ok(!(await sara.as('GET', '/lessons')).data.lessons.some(l => l.slug === slug));
});

test('importing JSON from a student card keeps the lessons private and never overwrites others', { skip }, async () => {
  const kim = await newStudent('Kim');
  const other = await newStudent('Lee');
  const pub = await admin('POST', '/lessons', lessonBody('Shared public lesson', { slug: 'shared-public' }));
  assert.equal(pub.status, 201);

  const r = await admin('POST', '/import', {
    assignTo: kim.id,
    lessons: [
      { title: 'Imported for Kim', slug: 'imported-kim', units: [{ title: 'U', sentences: [{ en: 'Where is the station' }] }] },
      // same link name as a public lesson: must become a NEW private lesson, not overwrite it
      { title: 'Shared public lesson', slug: 'shared-public', visibility: 'public', units: [{ title: 'U', sentences: [{ en: 'Totally different words' }] }] },
    ],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.created, 2);
  assert.equal(r.data.updated, 0);

  const kimSlugs = (await kim.as('GET', '/lessons')).data.lessons.map(l => l.slug);
  assert.ok(kimSlugs.includes('imported-kim'));
  assert.ok(!(await other.as('GET', '/lessons')).data.lessons.some(l => l.slug === 'imported-kim'));
  const stillPublic = (await admin('GET', `/lessons/${pub.data.lesson.id}`)).data.lesson;
  assert.equal(stillPublic.visibility, 'public');
  assert.equal(stillPublic.units[0].sentences[0].en, 'I like green apples');
});

test('retrying keeps progress, a better score is counted as extra, a worse one changes nothing', { skip }, async () => {
  const ana = await newStudent('Ana');
  const made = await admin('POST', `/users/${ana.id}/lessons`, lessonBody('Retry lesson'));
  const slug = made.data.lesson.slug;
  const lesson = (await ana.as('GET', `/lessons/${slug}`)).data.lesson;
  const [u1, u2] = lesson.units;

  // Unit 2 is locked until unit 1 is finished (enforced on the server, not just hidden).
  assert.equal((await solve(ana, slug, 'We are going home now')).status, 403);

  // First time: 3 mistakes = 1 star, then 1 mistake = 2 stars
  const a = await solve(ana, slug, 'I like green apples', 3, 0);
  assert.equal(a.data.stars, 1);
  assert.equal(a.data.extra, 0);
  assert.equal(a.data.replay, false);
  await solve(ana, slug, 'She is reading a book', 1, 0);

  let p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.units[0].completed, true);
  assert.equal(p.units[0].stars, 3);
  assert.equal(p.units[0].extra, 0);
  assert.equal(p.units[1].locked, false);

  // Practise again, perfectly: 1 -> 3 stars = +2 extra, 2 -> 3 stars = +1 extra
  const b = await solve(ana, slug, 'I like green apples', 0, 0);
  assert.equal(b.data.replay, true);
  assert.equal(b.data.extra, 2);
  assert.equal(b.data.best, 3);
  assert.equal((await solve(ana, slug, 'She is reading a book', 0, 0)).data.extra, 1);

  p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.units[0].stars, 6);
  assert.equal(p.units[0].extra, 3);
  assert.equal(p.units[0].completed, true, 'progress is still there');

  // A worse retry never lowers anything and gives no extra
  const worse = await solve(ana, slug, 'I like green apples', 9, 0);
  assert.equal(worse.data.extra, 0);
  assert.equal(worse.data.best, 3);
  // ...and a repeat of an equally good result gives no extra either
  assert.equal((await solve(ana, slug, 'I like green apples', 0, 0)).data.extra, 0);

  p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.units[0].stars, 6);
  assert.equal(p.units[0].extra, 3);
  const sentences = (await ana.as('GET', `/lessons/${slug}`)).data.lesson.units[0].sentences;
  assert.deepEqual(sentences.map(s => [s.stars, s.extra]), [[3, 2], [3, 1]]);

  // Lesson finishes only once; extra from retries is reported in the profile and to the teacher.
  const done = await solve(ana, slug, 'We are going home now', 0, 0);
  assert.equal(done.data.completed, true);
  assert.equal(done.data.justCompleted, true);
  assert.equal((await solve(ana, slug, 'We are going home now', 0, 0)).data.justCompleted, false);

  const me = (await ana.as('GET', '/me')).data;
  assert.equal(me.stats.extraStars, 3);
  assert.equal(me.stats.stars, 9);

  const card = (await admin('GET', `/users/${ana.id}`)).data;
  assert.equal(card.stats.extraStars, 3);
  assert.equal(card.lessons.find(l => l.slug === slug).progress.extra, 3);
  const csv = await fetch(BASE + '/api/admin/export/progress.csv', { headers: { Authorization: 'Bearer ' + adminToken } });
  assert.match(await csv.text(), /Of which extra/);

  // Restarting the lesson is recorded for the teacher but resets nothing.
  assert.equal((await ana.as('POST', `/lessons/${slug}/restart`, {})).status, 204);
  assert.equal((await ana.as('POST', `/lessons/${slug}/restart`, { unitId: u1.id })).status, 204);
  assert.equal((await ana.as('POST', `/lessons/${slug}/restart`, { unitId: 'nope' })).status, 404);
  p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.completed, true);
  assert.equal(p.stars, 9);
  const events = (await admin('GET', `/activity?user=${ana.id}`)).data.events;
  assert.ok(events.some(e => e.type === 'restart'));
  assert.ok(events.some(e => e.type === 'sentence_solved' && e.data.replay && e.data.extra === 2));
  assert.ok(u2.id);
});

test('a unit the student already finished is never locked, even if a new unit is added before it', { skip }, async () => {
  const bo = await newStudent('Bo');
  const made = await admin('POST', `/users/${bo.id}/lessons`, lessonBody('Reorder lesson'));
  const slug = made.data.lesson.slug;
  const lesson = (await bo.as('GET', `/lessons/${slug}`)).data.lesson;
  await solve(bo, slug, 'I like green apples');
  await solve(bo, slug, 'She is reading a book');
  await solve(bo, slug, 'We are going home now');

  // Teacher puts a brand-new unit first (existing units keep their ids, so progress is kept).
  const full = (await admin('GET', `/lessons/${made.data.lesson.id}`)).data.lesson;
  const units = [{ title: 'New first unit', sentences: [{ en: 'Brand new sentence here' }] }, ...full.units];
  const upd = await admin('PUT', `/lessons/${full.id}`, { ...full, units, assignedUserIds: undefined });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));

  const p = (await bo.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.units[0].locked, false);
  assert.equal(p.units[1].locked, false, 'finished unit stays open');
  assert.equal(p.units[2].locked, false, 'finished unit stays open');
  assert.ok(lesson.units.length === 2);
});

test('the on-device progress rules give exactly the same result as the server', { skip }, async () => {
  const Core = require('../public/progress-core.js');
  const eva = await newStudent('Eva');
  const made = await admin('POST', `/users/${eva.id}/lessons`, lessonBody('Parity lesson'));
  const slug = made.data.lesson.slug;
  const snapshot = async () => (await eva.as('GET', '/app')).data;
  const mine = d => d.lessons.find(l => l.slug === slug);

  // Start from the bootstrap data, then apply every action locally AND on the server.
  const local = await snapshot();
  const raw = mine(local);
  const u1 = raw.units[0], u2 = raw.units[1];
  const steps = [
    ['learn', u1.id, 0, false], ['learn', u1.id, 1, true],
    ['solve', 'I like green apples', 0, 3],          // 1 star
    ['solve', 'She is reading a book', 0, 1],        // 2 stars
    ['solve', 'I like green apples', 0, 0],          // retry, perfect: +2 extra
    ['solve', 'She is reading a book', 5, 5],        // worse retry: nothing changes
    ['learn', u2.id, 0, true],
    ['solve', 'We are going home now', 0, 0],        // finishes the lesson
    ['solve', 'We are going home now', 2, 0],
  ];
  for (const [kind, a, b, c] of steps) {
    if (kind === 'learn') {
      Core.applyLearn(raw, a, b, c, 0, new Date().toISOString());
      assert.equal((await eva.as('POST', `/lessons/${slug}/units/${a}/learn`, c ? { index: b, done: true } : { index: b })).status, 200);
    } else {
      const stars = Core.starsFor(b, c);
      const r = Core.applySolve(raw, local.stats, a, stars, 0, new Date().toISOString());
      const server = await solve(eva, slug, a, b, c);
      assert.equal(server.status, 200, JSON.stringify(server.data));
      assert.equal(r.extra, server.data.extra, `extra for "${a}"`);
      assert.equal(r.best, server.data.best, `best for "${a}"`);
      assert.equal(r.completed, server.data.completed, `completed after "${a}"`);
    }
  }

  const remote = await snapshot();
  // Everything except the clock times (device and server clocks differ by a few milliseconds).
  const plain = m => { const o = JSON.parse(JSON.stringify(m)); for (const k of ['startedAt', 'lastActivityAt', 'completedAt']) o[k] = o[k] ? 'set' : null; return o; };
  // The progress numbers must match what the server works out from its own data.
  assert.deepEqual(plain(Core.modelOf(raw)), plain(Core.modelOf(mine(remote))));
  assert.deepEqual(local.stats, { ...remote.stats, streak: local.stats.streak }, 'overall stats');
  // ...and what the classic per-lesson endpoint reports.
  const classic = (await eva.as('GET', `/lessons/${slug}`)).data.progress;
  assert.deepEqual(plain(Core.modelOf(mine(remote))), plain(classic));
});

test('GET /app returns only what the student may see, in one request', { skip }, async () => {
  const mia = await newStudent('Mia');
  const other = await newStudent('Noa');
  const made = await admin('POST', `/users/${other.id}/lessons`, lessonBody('Noa only'));
  const data = (await mia.as('GET', '/app')).data;
  assert.equal(data.user.name, 'Mia');
  assert.ok(Array.isArray(data.lessons) && data.lessons.length >= 1);
  assert.ok(!data.lessons.some(l => l.slug === made.data.lesson.slug), "another student's private lesson is not included");
  assert.ok(data.lessons.every(l => l.units.every(u => u.sentences.every(s => typeof s.en === 'string' && s.stars === 0))));
  assert.equal((await call('GET', '/api/app')).status, 401, 'needs a login');
});

test('malformed requests are answered politely, never with a server error', { skip }, async () => {
  const kai = await newStudent('Kai');
  // a damaged cookie (bad % escape) must mean "not logged in", not a crash
  const badCookie = await fetch(BASE + '/api/app', { headers: { Cookie: 'ws_session=%E0%A4%A' } });
  assert.equal(badCookie.status, 401);
  // a malformed address is the caller's mistake (4xx), not a server failure
  const badUrl = await fetch(BASE + '/lesson/%E0%A4%A');
  assert.ok(badUrl.status >= 400 && badUrl.status < 500, `got ${badUrl.status}`);
  // absurdly long input
  const longSentence = 'x'.repeat(50000);
  assert.equal((await kai.as('POST', '/lessons/anything/solve', { sentence: longSentence })).status, 404);
  const lessons = (await kai.as('GET', '/app')).data.lessons;
  assert.equal((await kai.as('POST', `/lessons/${lessons[0].slug}/solve`, { sentence: longSentence })).status, 400);
  // wrong types everywhere
  assert.equal((await kai.as('POST', `/lessons/${lessons[0].slug}/solve`, { sentence: { a: 1 }, mistakes: 'abc', hints: [] })).status, 400);
  assert.equal((await call('POST', '/api/auth/login', { email: { $ne: 1 }, password: 12345 })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'a'.repeat(500) + '@x.com', password: 'p' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'kai@example.com', password: 'p'.repeat(100000) })).status, 401);
  // login for an unknown email gives the same answer as a wrong password
  const unknown = await call('POST', '/api/auth/login', { email: 'nobody-here@example.com', password: 'password123' });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.error, 'Wrong email or password.');
  // lists sent by the dashboard are bounded and typed
  assert.equal((await admin('POST', '/reorder', { ids: Array.from({ length: 6000 }, (_, i) => 'id' + i) })).status, 400);
  assert.equal((await admin('POST', '/reorder', { ids: ['ok', 5] })).status, 400);
  assert.equal((await admin('PUT', `/users/${kai.id}/assignments`, { lessonIds: 'nope' })).status, 400);
  // a unit with far too many sentences is refused before it is processed
  const huge = await admin('POST', '/lessons', { title: 'Huge', units: [{ title: 'U', sentences: Array.from({ length: 300 }, (_, i) => ({ en: `Sentence number ${i} here` })) }] });
  assert.equal(huge.status, 400);
});

test('starter lessons do not come back after a teacher deleted them', { skip }, async () => {
  const { Pool } = require('pg');
  const { migrate } = require('../src/db');
  const pool = new Pool({ connectionString: DB });
  try {
    await pool.query('DELETE FROM lessons');
    await migrate(pool); // what happens at every restart; students exist, so nothing is re-added
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM lessons');
    assert.equal(rows[0].n, 0);
  } finally {
    await pool.end();
  }
});

test('compressed responses are served', { skip }, async () => {
  const res = await fetch(BASE + '/app.js', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
});
