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

const QuizCore = require('../public/quiz-core.js');
// Takes a unit quiz ('unit:<id>') or the final quiz ('final') and answers every question right (or all wrong with right = false).
async function takeQuiz(s, slug, scope, { right = true, seed = 11 } = {}) {
  const lesson = (await s.as('GET', '/app')).data.lessons.find(l => l.slug === slug);
  const everything = lesson.units.flatMap(u => u.sentences);
  const unit = scope === 'final' ? null : lesson.units.find(u => 'unit:' + u.id === scope);
  const qs = QuizCore.build({ sentences: unit ? unit.sentences : everything, context: everything, seed, noListen: false });
  const picks = qs.map(q => (right ? q.answer : (q.answer + 1) % q.options.length));
  return s.as('POST', `/lessons/${slug}/quiz`, { scope, seed, noListen: false, picks, seconds: 5, cid: Math.random().toString(36) });
}

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

test('building a sentence again is practice: the first stars stay exactly as they were', { skip }, async () => {
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
  assert.equal(p.units[0].completed, false, 'the unit quiz is still to do');
  assert.equal(p.units[0].quizReady, true);
  assert.equal(p.units[1].locked, true);
  assert.equal((await takeQuiz(ana, slug, 'unit:' + u1.id)).data.unitCompleted, true);
  p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.units[0].completed, true);
  assert.equal(p.units[0].stars, 3);
  assert.equal(p.units[0].extra, 0);
  assert.equal(p.units[1].locked, false);

  // Practise again, perfectly: it is practice only, so the saved stars (1 and 2) do not change and nothing is added
  const b = await solve(ana, slug, 'I like green apples', 0, 0);
  assert.equal(b.data.replay, true);
  assert.equal(b.data.extra, 0);
  assert.equal(b.data.best, 1);
  assert.equal(b.data.stars, 3, 'the round itself still reports its own result');
  assert.equal((await solve(ana, slug, 'She is reading a book', 0, 0)).data.best, 2);

  p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.units[0].stars, 3);
  assert.equal(p.units[0].extra, 0);
  assert.equal(p.units[0].completed, true, 'progress is still there');

  // A worse retry never lowers anything either
  const worse = await solve(ana, slug, 'I like green apples', 9, 0);
  assert.equal(worse.data.extra, 0);
  assert.equal(worse.data.best, 1);

  p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.units[0].stars, 3);
  assert.equal(p.units[0].extra, 0);
  const sentences = (await ana.as('GET', `/lessons/${slug}`)).data.lesson.units[0].sentences;
  assert.deepEqual(sentences.map(s => [s.stars, s.extra]), [[1, 0], [2, 0]]);

  // Lesson finishes only once; extra from retries is reported in the profile and to the teacher.
  const done = await solve(ana, slug, 'We are going home now', 0, 0);
  assert.equal(done.data.completed, false, 'both quizzes are still to do');
  assert.equal((await takeQuiz(ana, slug, 'unit:' + u2.id)).data.completed, false, 'the final quiz is still to do');
  const fin = await takeQuiz(ana, slug, 'final');
  assert.equal(fin.data.completed, true);
  assert.equal(fin.data.justCompleted, true);
  assert.equal((await solve(ana, slug, 'We are going home now', 0, 0)).data.justCompleted, false);

  const me = (await ana.as('GET', '/me')).data;
  assert.equal(me.stats.extraStars, 0);
  assert.equal(me.stats.stars, 6);

  const card = (await admin('GET', `/users/${ana.id}`)).data;
  assert.equal(card.stats.extraStars, 0);
  assert.equal(card.lessons.find(l => l.slug === slug).progress.extra, 0);
  const csv = await fetch(BASE + '/api/admin/export/progress.csv', { headers: { Authorization: 'Bearer ' + adminToken } });
  assert.match(await csv.text(), /Of which extra/);

  // Restarting the lesson is recorded for the teacher but resets nothing.
  assert.equal((await ana.as('POST', `/lessons/${slug}/restart`, {})).status, 204);
  assert.equal((await ana.as('POST', `/lessons/${slug}/restart`, { unitId: u1.id })).status, 204);
  assert.equal((await ana.as('POST', `/lessons/${slug}/restart`, { unitId: 'nope' })).status, 404);
  p = (await ana.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(p.completed, true);
  assert.equal(p.stars, 6);
  const events = (await admin('GET', `/activity?user=${ana.id}`)).data.events;
  assert.ok(events.some(e => e.type === 'restart'));
  // newest first, and events written at the same instant keep a stable order (higher id first)
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1], b = events[i];
    assert.ok(new Date(a.at) > new Date(b.at) || (+new Date(a.at) === +new Date(b.at) && Number(a.id) > Number(b.id)), 'activity feed order is stable');
  }
  assert.ok(events.some(e => e.type === 'sentence_solved' && e.data.replay));
  assert.ok(u2.id);
});

test('a unit the student already finished is never locked, even if a new unit is added before it', { skip }, async () => {
  const bo = await newStudent('Bo');
  const made = await admin('POST', `/users/${bo.id}/lessons`, lessonBody('Reorder lesson'));
  const slug = made.data.lesson.slug;
  const lesson = (await bo.as('GET', `/lessons/${slug}`)).data.lesson;
  await solve(bo, slug, 'I like green apples');
  await solve(bo, slug, 'She is reading a book');
  assert.equal((await takeQuiz(bo, slug, 'unit:' + lesson.units[0].id)).status, 200);
  await solve(bo, slug, 'We are going home now');
  assert.equal((await takeQuiz(bo, slug, 'unit:' + lesson.units[1].id)).status, 200);

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
    ['solve', 'I like green apples', 0, 0],          // retry, perfect: practice only, stars stay
    ['solve', 'She is reading a book', 5, 5],        // worse retry: nothing changes
    ['quiz', u1.id],                                  // unit one is finished once its quiz is passed
    ['learn', u2.id, 0, true],
    ['solve', 'We are going home now', 0, 0],
    ['solve', 'We are going home now', 2, 0],
    ['quiz', u2.id],
    ['quiz', 'final'],                                // the lesson is finished
  ];
  for (const [kind, a, b, c] of steps) {
    if (kind === 'quiz') {
      const r = Core.applyQuiz(raw, local.stats, a, true, 5, new Date().toISOString()); // takeQuiz spends 5 seconds
      const server = await takeQuiz(eva, slug, a === 'final' ? 'final' : 'unit:' + a);
      assert.equal(server.status, 200, JSON.stringify(server.data));
      assert.equal(r.completed, server.data.completed, `completed after quiz ${a}`);
    } else if (kind === 'learn') {
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

test('the streak counts days with a finished sentence, not just opening a lesson', { skip }, async () => {
  const kai = await newStudent('Kai');
  const made = await admin('POST', `/users/${kai.id}/lessons`, lessonBody('Streak lesson'));
  const slug = made.data.lesson.slug;
  const unitId = (await kai.as('GET', `/lessons/${slug}`)).data.lesson.units[0].id;
  assert.equal((await kai.as('POST', `/lessons/${slug}/units/${unitId}/learn`, { index: 1, done: true })).status, 200);
  assert.equal((await kai.as('GET', '/me')).data.stats.streak, 0, 'only looking at cards is not a streak day');
  await solve(kai, slug, 'I like green apples', 0, 0);
  assert.equal((await kai.as('GET', '/me')).data.stats.streak, 1, 'a finished sentence is');
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

test('grammar gaps: a unit is finished only after reading, building AND choosing the right word', { skip }, async () => {
  const Core = require('../public/progress-core.js');
  const zoe = await newStudent('Zoe');

  // the teacher writes gaps as [right|wrong|wrong]; the bad ones are explained, not accepted
  const bad = await admin('POST', `/users/${zoe.id}/lessons`, { title: 'Bad gap', units: [{ title: 'U', sentences: [{ en: 'She [is|are] happy today' }] }] });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /exactly 3 choices/);

  const made = await admin('POST', `/users/${zoe.id}/lessons`, { title: 'Grammar lesson', units: [
    { title: 'One', sentences: [{ en: 'She [is|are|am] happy today' }, { en: 'We like green tea' }, { en: 'I [have] one small bag' }] },
    { title: 'Two', sentences: [{ en: 'They [were] very late' }] },
  ] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const slug = made.data.lesson.slug;

  // stored as a sentence with a gap; the "[have]" shorthand got its two wrong choices
  const raw = (await zoe.as('GET', '/app')).data.lessons.find(l => l.slug === slug);
  const [u1, u2] = raw.units;
  assert.deepEqual(u1.sentences[0], { en: 'She is happy today', stars: 0, extra: 0, gap: { index: 1, answer: 'is', options: ['is', 'are', 'am'] }, gdone: false });
  assert.deepEqual(u1.sentences[1], { en: 'We like green tea', stars: 0, extra: 0 });
  assert.deepEqual(u1.sentences[2].gap.options, ['have', 'has', 'having']);

  const grammar = (sentence, mistakes = 0) => zoe.as('POST', `/lessons/${slug}/grammar`, { sentence, mistakes, cid: Math.random().toString(36) });
  await zoe.as('POST', `/lessons/${slug}/units/${u1.id}/learn`, { index: 2, done: true });

  // the grammar step comes after building; it cannot be skipped to
  assert.equal((await grammar('She is happy today')).status, 409, 'not built yet');
  assert.equal((await grammar('We like green tea')).status, 400, 'that sentence has no gap');
  assert.equal((await grammar('They were very late')).status, 403, 'unit two is still locked');

  // build every sentence of unit one: NOT finished yet, the grammar is still to do
  for (const sn of u1.sentences) {
    const r = await solve(zoe, slug, sn.en);
    assert.equal(r.data.unitCompleted, false, 'built everything but the grammar is still open');
    assert.equal(r.data.completed, false);
  }
  let model = Core.modelOf((await zoe.as('GET', '/app')).data.lessons.find(l => l.slug === slug));
  assert.equal(model.units[0].grammarReady, true);
  assert.equal(model.units[0].completed, false);
  assert.equal(model.units[1].locked, true, 'the next unit stays closed');

  // answer the two gaps: the second answer finishes the unit and opens the next one
  const g1 = await grammar('She is happy today', 1);
  assert.equal(g1.status, 200);
  assert.equal(g1.data.unitCompleted, false);
  const g2 = await grammar('I have one small bag', 0);
  assert.equal(g2.data.unitCompleted, false, 'built and answered, but the quiz is still to do');
  assert.equal(g2.data.unitJustCompleted, false);
  model = Core.modelOf((await zoe.as('GET', '/app')).data.lessons.find(l => l.slug === slug));
  assert.equal(model.units[0].quizReady, true);
  assert.equal(model.units[1].locked, true, 'the next unit opens after the quiz');
  const q1 = await takeQuiz(zoe, slug, 'unit:' + u1.id);
  assert.equal(q1.data.unitCompleted, true);
  assert.equal(q1.data.unitJustCompleted, true);
  assert.equal(q1.data.completed, false);
  model = Core.modelOf((await zoe.as('GET', '/app')).data.lessons.find(l => l.slug === slug));
  assert.equal(model.units[0].completed, true);
  assert.equal(model.units[1].locked, false);
  assert.equal(model.units[0].grammarDone, 2);

  // answering again later is allowed and changes nothing (progress never goes back)
  assert.equal((await grammar('She is happy today', 3)).data.unitJustCompleted, false);

  // unit two finishes the lesson, once
  await zoe.as('POST', `/lessons/${slug}/units/${u2.id}/learn`, { index: 0, done: true });
  assert.equal((await solve(zoe, slug, 'They were very late')).data.completed, false, 'the last gap is still open');
  const last = await grammar('They were very late');
  assert.equal(last.data.completed, false, 'the quizzes are still to do');
  assert.equal((await takeQuiz(zoe, slug, 'unit:' + u2.id)).data.completed, false);
  const finalQ = await takeQuiz(zoe, slug, 'final');
  assert.equal(finalQ.data.completed, true);
  assert.equal(finalQ.data.justCompleted, true);
  assert.equal((await grammar('They were very late')).data.justCompleted, false);

  // the teacher sees it
  const events = (await admin('GET', `/activity?user=${zoe.id}`)).data.events;
  assert.equal(events.filter(e => e.type === 'grammar_solved').length >= 3, true);
  assert.equal(events.filter(e => e.type === 'lesson_complete').length, 1);
  const card = (await admin('GET', `/users/${zoe.id}`)).data.lessons.find(l => l.slug === slug);
  assert.equal(card.progress.completed, true);
  assert.equal(card.progress.grammarDone, 3);
});

test('grammar on the device follows the same rules as the server', { skip }, async () => {
  const Core = require('../public/progress-core.js');
  const lia = await newStudent('Lia');
  const made = await admin('POST', `/users/${lia.id}/lessons`, { title: 'Parity grammar', units: [{ title: 'U', sentences: [{ en: 'He [is|are|am] here' }, { en: 'Tea is hot' }] }] });
  const slug = made.data.lesson.slug;
  const local = (await lia.as('GET', '/app')).data;
  const raw = local.lessons.find(l => l.slug === slug);
  const unit = raw.units[0].id;
  const now = new Date().toISOString();

  Core.applyLearn(raw, unit, 1, true, 0, now);
  await lia.as('POST', `/lessons/${slug}/units/${unit}/learn`, { index: 1, done: true });
  assert.equal(Core.applyGrammar(raw, local.stats, 'He is here', 0, now), null, 'cannot answer before building (device)');
  for (const en of ['He is here', 'Tea is hot']) { Core.applySolve(raw, local.stats, en, 3, 0, now); await solve(lia, slug, en); }
  assert.equal(Core.modelOf(raw).completed, false, 'device: grammar still open');
  const device = Core.applyGrammar(raw, local.stats, 'He is here', 0, now);
  const server = await lia.as('POST', `/lessons/${slug}/grammar`, { sentence: 'He is here', mistakes: 0, cid: 'p1' });
  assert.equal(device.completed, false, 'device: the quiz is still to do');
  assert.equal(device.completed, server.data.completed);
  const dq = Core.applyQuiz(raw, local.stats, unit, true, 5, now);
  const sq = await takeQuiz(lia, slug, 'unit:' + unit);
  assert.equal(dq.completed, true);
  assert.equal(dq.completed, sq.data.completed);

  const remote = (await lia.as('GET', '/app')).data;
  const plain = m => { const o = JSON.parse(JSON.stringify(m)); for (const k of ['startedAt', 'lastActivityAt', 'completedAt']) o[k] = o[k] ? 'set' : null; return o; };
  assert.deepEqual(plain(Core.modelOf(raw)), plain(Core.modelOf(remote.lessons.find(l => l.slug === slug))));
  assert.equal(local.stats.lessonsCompleted, remote.stats.lessonsCompleted);
});

test('lessons imported with grammar gaps (bracket lines or data) keep them', { skip }, async () => {
  const r = await admin('POST', '/import', { lessons: [
    { title: 'Imported gaps', slug: 'imported-gaps', units: [{ title: 'U', sentences: [
      'Where [is|are|am] the desk?',
      { en: 'I live in Cairo', gap: { index: 2, answer: 'in', options: ['in', 'on', 'at'] } },
      { en: 'No gap here' },
    ] }] },
  ] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const lessons = (await admin('GET', '/lessons')).data.lessons;
  const full = (await admin('GET', `/lessons/${lessons.find(l => l.slug === 'imported-gaps').id}`)).data.lesson;
  const [a, b, c] = full.units[0].sentences;
  assert.deepEqual(a, { en: 'Where is the desk?', gap: { index: 1, answer: 'is', options: ['is', 'are', 'am'] } });
  assert.deepEqual(b.gap, { index: 2, answer: 'in', options: ['in', 'on', 'at'] });
  assert.equal(c.gap, undefined);
  const wrong = await admin('POST', '/import', { lessons: [{ title: 'X', slug: 'x-bad', units: [{ title: 'U', sentences: [{ en: 'I live in Cairo', gap: { index: 0, answer: 'in', options: ['in', 'on', 'at'] } }] }] }] });
  assert.equal(wrong.status, 400);
});

test('compressed responses are served', { skip }, async () => {
  const res = await fetch(BASE + '/app.js', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
});

test('quizzes: marked on the server, required to finish a unit and the lesson, can be retried, and the teacher can reset them', { skip }, async () => {
  const mo = await newStudent('Mo');
  const made = await admin('POST', `/users/${mo.id}/lessons`, lessonBody('Quiz lesson'));
  const slug = made.data.lesson.slug, lessonId = made.data.lesson.id;
  const app = () => mo.as('GET', '/app').then(r => r.data.lessons.find(l => l.slug === slug));
  const [u1, u2] = (await app()).units;

  // the quiz is the last step: not before building, and the final quiz not before every unit
  assert.equal((await takeQuiz(mo, slug, 'unit:' + u1.id)).status, 409, 'build first');
  assert.equal((await takeQuiz(mo, slug, 'final')).status, 409, 'finish the units first');
  assert.equal((await mo.as('POST', `/lessons/${slug}/quiz`, { scope: 'nope', seed: 1, picks: [] })).status, 400);
  await solve(mo, slug, 'I like green apples');
  await solve(mo, slug, 'She is reading a book');

  // a wrong quiz is only a try: nothing is finished, and it can be taken again
  const bad = await takeQuiz(mo, slug, 'unit:' + u1.id, { right: false, seed: 5 });
  assert.equal(bad.status, 200);
  assert.equal(bad.data.passed, false);
  assert.equal(bad.data.score, 0);
  assert.equal(bad.data.needed, 2);
  assert.equal(bad.data.unitCompleted, false);
  // the answers are marked by the server: a different number of answers is refused
  assert.equal((await mo.as('POST', `/lessons/${slug}/quiz`, { scope: 'unit:' + u1.id, seed: 5, picks: [0] })).status, 400);
  // the same try sent twice (a retry after a bad connection) counts once
  const once = { scope: 'unit:' + u1.id, seed: 6, noListen: false, picks: [9, 9], cid: 'same-try' };
  assert.equal((await mo.as('POST', `/lessons/${slug}/quiz`, once)).data.passed, false);
  assert.equal((await mo.as('POST', `/lessons/${slug}/quiz`, once)).data.duplicate, true);

  const good = await takeQuiz(mo, slug, 'unit:' + u1.id);
  assert.equal(good.data.passed, true);
  assert.equal(good.data.unitCompleted, true);
  let model = (await mo.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(model.units[0].completed, true);
  assert.equal(model.units[1].locked, false);

  await solve(mo, slug, 'We are going home now');
  assert.equal((await takeQuiz(mo, slug, 'final')).status, 409, 'unit two is not finished');
  assert.equal((await takeQuiz(mo, slug, 'unit:' + u2.id)).data.completed, false);
  model = (await mo.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(model.finalReady, true);
  assert.equal(model.completed, false, 'the final quiz is still to do');
  assert.equal((await takeQuiz(mo, slug, 'final', { right: false })).data.completed, false);
  assert.equal((await takeQuiz(mo, slug, 'final')).data.justCompleted, true);
  assert.equal((await mo.as('GET', `/lessons/${slug}`)).data.progress.completed, true);

  // the teacher reviews every attempt, with the questions and the student's answers
  const review = (await admin('GET', `/users/${mo.id}/quiz`)).data;
  const mine = review.attempts.filter(a => a.lessonId === lessonId);
  assert.equal(mine.length, 6);
  const failed = mine.find(a => a.scope.startsWith('unit:') && a.score === 0 && !a.passed);
  assert.ok(failed.details.length === 2 && failed.details.every(d => d.options.length >= 2 && d.correct === false && typeof d.picked === 'number'));
  assert.ok(review.live.some(x => x.scope === 'final' && x.passed));

  // ...and resets the final quiz: the lesson is open again until the student passes it once more
  assert.equal((await admin('POST', `/users/${mo.id}/lessons/${lessonId}/quiz/reset`, { scope: 'nope' })).status, 400);
  assert.equal((await admin('POST', `/users/${mo.id}/lessons/${lessonId}/quiz/reset`, { scope: 'final' })).status, 204);
  assert.equal((await admin('POST', `/users/${mo.id}/lessons/${lessonId}/quiz/reset`, { scope: 'final' })).status, 404, 'nothing left to reset');
  model = (await mo.as('GET', `/lessons/${slug}`)).data.progress;
  assert.equal(model.completed, false);
  assert.equal(model.finalReady, true);
  assert.equal((await mo.as('GET', '/me')).data.stats.lessonsCompleted, 0);
  assert.equal((await takeQuiz(mo, slug, 'final')).data.completed, true);
  assert.equal((await mo.as('GET', '/me')).data.stats.lessonsCompleted, 1);
  const events = (await admin('GET', `/activity?user=${mo.id}`)).data.events;
  assert.ok(events.some(e => e.type === 'quiz_attempt' && e.data.passed === false));
  assert.ok(events.some(e => e.type === 'quiz_reset'));
});

test('a lesson with one unit has no final quiz: its unit quiz finishes the lesson', { skip }, async () => {
  const jo = await newStudent('Jo');
  const made = await admin('POST', `/users/${jo.id}/lessons`, { title: 'Single unit', units: [{ title: 'Only', sentences: [{ en: 'She is reading a book' }, { en: 'We like green tea' }] }] });
  const slug = made.data.lesson.slug;
  const u = (await jo.as('GET', '/app')).data.lessons.find(l => l.slug === slug).units[0];
  await solve(jo, slug, 'She is reading a book');
  await solve(jo, slug, 'We like green tea');
  assert.equal((await takeQuiz(jo, slug, 'final')).status, 400);
  const r = await takeQuiz(jo, slug, 'unit:' + u.id);
  assert.equal(r.data.completed, true);
  assert.equal(r.data.justCompleted, true);
});

test('teacher: student list, needs-attention list, hardest sentences', { skip }, async () => {
  const ivy = await newStudent('Ivy');
  const made = await admin('POST', `/users/${ivy.id}/lessons`, lessonBody('Insight lesson'));
  const slug = made.data.lesson.slug, lessonId = made.data.lesson.id;
  const u1 = (await ivy.as('GET', '/app')).data.lessons.find(l => l.slug === slug).units[0];
  await solve(ivy, slug, 'I like green apples', 4, 1);   // a hard one: 4 mistakes, 1 hint
  await solve(ivy, slug, 'She is reading a book', 0, 0);
  // three failed tries at the same quiz => needs attention
  for (const seed of [21, 22, 23]) await takeQuiz(ivy, slug, 'unit:' + u1.id, { right: false, seed });

  const list = (await admin('GET', '/users')).data.users.find(x => x.id === ivy.id);
  assert.equal(list.quiz.attempts, 3);
  assert.equal(list.quiz.passed, 0);
  assert.equal(list.quiz.last.passed, false);
  assert.equal(list.currentLesson.title, 'Insight lesson');
  assert.ok(list.lastActiveAt);

  const att = (await admin('GET', '/attention')).data.students.find(x => x.userId === ivy.id);
  assert.ok(att, 'three failed tries put the student on the list');
  assert.ok(att.reasons.some(x => x.type === 'quiz' && x.fails === 3 && x.quiz.includes('One')));
  // a pass takes them off the quiz reason again
  await takeQuiz(ivy, slug, 'unit:' + u1.id);
  const after = (await admin('GET', '/attention')).data.students.find(x => x.userId === ivy.id);
  assert.ok(!after || !after.reasons.some(x => x.type === 'quiz'));

  // inactive: a student who started 8 days ago and did nothing since
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  try {
    const old = await newStudent('Old');
    await pool.query("UPDATE users SET created_at = now() - interval '8 days' WHERE id = $1", [old.id]);
    await admin('POST', `/users/${old.id}/lessons`, lessonBody('Old lesson'));
    const a2 = (await admin('GET', '/attention')).data.students.find(x => x.userId === old.id);
    assert.ok(a2 && a2.reasons.some(x => x.type === 'inactive' && x.days >= 8));
  } finally { await pool.end(); }

  const hard = (await admin('GET', `/lessons/${lessonId}/hard`)).data.sentences;
  assert.equal(hard[0].sentence, 'I like green apples');
  assert.equal(hard[0].mistakes, 4);
  assert.equal(hard[0].hints, 1);
  assert.ok(hard.some(x => x.quizWrong > 0), 'wrong quiz answers count too');
});

test('Arabic on the cards: the teacher adds it from an AI answer, and switches it on for students', { skip }, async () => {
  const nia = await newStudent('Nia');
  const sam = await newStudent('Sam');
  const made = await admin('POST', '/lessons', { title: 'Arabic lesson', units: [
    { title: 'A', sentences: [{ en: 'The quokka is reading a book // هي تقرأ كتاباً' }, { en: 'Quokkas like green tea' }, { en: 'Quokkas were late yesterday' }] },
    { title: 'B', sentences: [{ en: 'Quokkas like green tea too' }, { en: 'The quokka meeting was called yesterday' }] },
  ] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const slug = made.data.lesson.slug, lessonId = made.data.lesson.id;
  const arOf = async () => (await admin('GET', `/lessons/${lessonId}`)).data.lesson.units.flatMap(u => u.sentences).map(x => x.ar);
  const sentencesOf = async st => (await st.as('GET', '/app')).data.lessons.find(l => l.slug === slug).units.flatMap(u => u.sentences);

  // 1) what the teacher downloads for the AI: only sentences without Arabic, once each, with the instruction, a batch at a time
  const ex = (await admin('GET', '/arabic/export?size=3')).data;
  assert.equal(ex.sentences.length, 3);
  assert.ok(ex.sentences.every(x => x.ar === '' && typeof x.en === 'string'));
  assert.ok(!ex.sentences.some(x => x.en === 'The quokka is reading a book'), 'the teacher already wrote that one');
  assert.match(ex.instructions, /Do NOT change any "en"/);
  assert.ok(ex.sentencesLeft >= 4);
  const status0 = (await admin('GET', '/arabic/status')).data;
  assert.match(status0.prompt, /Modern Standard Arabic/);
  const mine0 = status0.lessons.find(l => l.id === lessonId);
  assert.deepEqual([mine0.total, mine0.ready], [5, 1]);

  // 2) the AI's answer: understood even with ``` marks removed by the app, as a list, as a map, or as the lessons file
  const imp1 = await admin('POST', '/arabic/import', { data: [
    { en: 'Quokkas like green tea', ar: 'نحب الشاي الأخضر' },
    { en: 'Quokkas were late yesterday', ar: 'لقد تأخروا أمس' },
    { en: 'A sentence that is in no lesson', ar: 'جملة ليست في أي درس' },          // does not match: reported, not added
    { en: 'The quokka meeting was called yesterday', ar: 'The meeting' },                  // not Arabic text: refused
  ] });
  assert.equal(imp1.status, 200, JSON.stringify(imp1.data));
  assert.equal(imp1.data.updated, 2);
  assert.equal(imp1.data.notFound, 1);
  assert.equal(imp1.data.rejected, 1);
  assert.deepEqual(imp1.data.notFoundExamples, ['A sentence that is in no lesson']);
  assert.deepEqual(await arOf(), ['هي تقرأ كتاباً', 'نحب الشاي الأخضر', 'لقد تأخروا أمس', undefined, undefined]);

  // Arabic that exists is kept unless the teacher asks to replace it; the map and the lessons-file shapes work too
  const imp2 = await admin('POST', '/arabic/import', { data: { 'Quokkas like green tea': 'شاي أخضر', 'Quokkas like green tea too': 'نحب الشاي الأخضر أيضا' } });
  assert.deepEqual([imp2.data.updated, imp2.data.unchanged], [1, 1]);
  assert.equal((await arOf())[1], 'نحب الشاي الأخضر');
  const imp3 = await admin('POST', '/arabic/import', { replace: true, data: { lessons: [{ title: 'x', units: [{ title: 'u', sentences: [{ en: 'Quokkas like green tea', ar: 'نحب الشاي الاخضر' }, { en: 'The quokka meeting was called yesterday', ar: 'تم استدعاء الاجتماع أمس' }] }] }] } });
  assert.equal(imp3.data.updated, 2);
  assert.deepEqual(await arOf(), ['هي تقرأ كتاباً', 'نحب الشاي الاخضر', 'لقد تأخروا أمس', 'نحب الشاي الأخضر أيضا', 'تم استدعاء الاجتماع أمس']);
  assert.equal((await admin('POST', '/arabic/import', { data: [] })).status, 400);
  assert.equal((await admin('POST', '/arabic/import', { data: [{ en: 'x' }] })).status, 400);
  // nothing else in the lesson changed: the same sentences, units and gaps
  const full = (await admin('GET', `/lessons/${lessonId}`)).data.lesson;
  assert.deepEqual(full.units.map(u => [u.title, u.sentences.map(x => x.en)]), [['A', ['The quokka is reading a book', 'Quokkas like green tea', 'Quokkas were late yesterday']], ['B', ['Quokkas like green tea too', 'The quokka meeting was called yesterday']]]);
  const left = (await admin('GET', '/arabic/export')).data;
  assert.ok(!left.sentences.some(x => x.en.startsWith('Quokkas like green tea')), 'translated sentences are no longer asked for');
  const all = (await admin('GET', '/arabic/export?all=1')).data;
  assert.ok(all.sentences.some(x => x.en === 'Quokkas like green tea' && x.ar === 'نحب الشاي الاخضر'));

  // 3) students: nothing without the switch; the teacher switches it on for one student, or for everybody
  assert.equal((await nia.as('GET', '/app')).data.user.arabic, false);
  assert.ok((await sentencesOf(nia)).every(x => x.ar === undefined));
  assert.equal((await admin('PUT', `/users/${nia.id}/arabic`, { enabled: true })).status, 200);
  assert.deepEqual((await sentencesOf(nia)).map(x => x.ar), await arOf());
  assert.ok((await sentencesOf(sam)).every(x => x.ar === undefined), 'another student still does not get it');
  assert.equal((await admin('GET', '/arabic/status')).data.studentsOn >= 1, true);
  const list = (await admin('GET', '/users')).data.users;
  assert.equal(list.find(u => u.id === nia.id).arabic, true);
  assert.equal(list.find(u => u.id === sam.id).arabic, false);
  assert.equal((await admin('PUT', '/users/nope/arabic', { enabled: true })).status, 404);
  assert.equal((await admin('PUT', '/arabic', { enabled: true })).data.enabled, true);
  assert.ok((await sentencesOf(sam)).some(x => typeof x.ar === 'string'));
  await admin('PUT', '/arabic', { enabled: false });
  assert.ok((await sentencesOf(nia)).every(x => x.ar === undefined), 'switching everybody off switches Nia off too');
  assert.equal((await newStudent('Late').then(st => st.as('GET', '/app'))).data.user.arabic, false, 'new students start with it off');

  // 4) the editor shows the Arabic after //, saving the same lines keeps it, a too-long text is refused, and a lessons file keeps its Arabic
  const lines = full.units.map(u => u.sentences.map(x => (x.ar ? `${x.en} // ${x.ar}` : x.en)));
  assert.equal((await admin('PUT', `/lessons/${lessonId}`, { title: 'Arabic lesson', slug, units: lines.map((ls, i) => ({ title: full.units[i].title, sentences: ls.map(en => ({ en })) })) })).status, 200);
  assert.deepEqual(await arOf(), ['هي تقرأ كتاباً', 'نحب الشاي الاخضر', 'لقد تأخروا أمس', 'نحب الشاي الأخضر أيضا', 'تم استدعاء الاجتماع أمس']);
  const long = await admin('POST', '/lessons', { title: 'Too long', units: [{ title: 'U', sentences: [{ en: 'We like tea', ar: 'ا'.repeat(301) }] }] });
  assert.equal(long.status, 400);
  assert.match(long.data.error, /300 characters/);
  const imp = await admin('POST', '/import', { lessons: [{ title: 'Imported arabic', slug: 'imported-arabic', units: [{ title: 'U', sentences: [{ en: 'We like tea', ar: 'نحب الشاي' }, { en: 'They were late' }] }] }] });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  const impLesson = (await admin('GET', '/lessons')).data.lessons.find(l => l.slug === 'imported-arabic');
  assert.deepEqual((await admin('GET', `/lessons/${impLesson.id}`)).data.lesson.units[0].sentences.map(x => x.ar), ['نحب الشاي', undefined]);
});

test('importing a lessons file puts the lessons in the order of the file; lessons that are not in the file stay where they are', { skip }, async () => {
  const mk = (title, slug) => ({ title, slug, units: [{ title: 'U', sentences: [{ en: `${title} sentence one` }, { en: `${title} sentence two` }] }] });
  const slugs = ['ord-a', 'ord-b', 'ord-c', 'ord-d'];
  for (const sl of slugs) assert.equal((await admin('POST', '/lessons', mk(sl.toUpperCase(), sl))).status, 201);
  const orderNow = async () => (await admin('GET', '/lessons')).data.lessons.map(l => l.slug).filter(x => x.startsWith('ord-') || x === 'ord-new');
  assert.deepEqual(await orderNow(), slugs);
  const all = (await admin('GET', '/export')).data.lessons;
  const byslug = Object.fromEntries(all.map(l => [l.slug, l]));

  // the whole file reversed (plus a new lesson in the middle): exactly that order
  const reversed = ['ord-d', 'ord-c', 'ord-new', 'ord-b', 'ord-a'].map(sl => byslug[sl] || mk('ORD-NEW', sl));
  const r1 = await admin('POST', '/import', { lessons: reversed });
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.deepEqual([r1.data.created, r1.data.updated], [1, 4]);
  assert.deepEqual(await orderNow(), ['ord-d', 'ord-c', 'ord-new', 'ord-b', 'ord-a']);

  // a partial file: only A and C, in the order A, C (they are C ... A now): they trade places, D, the new one and B stay where they are
  const before = (await admin('GET', '/lessons')).data.lessons.map(l => l.slug);
  const r2 = await admin('POST', '/import', { lessons: [byslug['ord-a'], byslug['ord-c']] });
  assert.equal(r2.status, 200);
  const after = (await admin('GET', '/lessons')).data.lessons.map(l => l.slug);
  const swap = x => (x === 'ord-c' ? 'ord-a' : x === 'ord-a' ? 'ord-c' : x);
  assert.deepEqual(after, before.map(swap), 'only the two lessons of the file traded places');
  // the order of the units and the sentences in a lesson follows the file too, and student progress stays (units are matched by title)
  const flipped = { ...byslug['ord-b'], units: [{ title: 'U2', sentences: [{ en: 'Brand new sentence here' }] }, ...byslug['ord-b'].units] };
  assert.equal((await admin('POST', '/import', { lessons: [flipped] })).status, 200);
  const bId = (await admin('GET', '/lessons')).data.lessons.find(l => l.slug === 'ord-b').id;
  assert.deepEqual((await admin('GET', `/lessons/${bId}`)).data.lesson.units.map(u => u.title), ['U2', 'U']);
  // a private import for a student never moves the other lessons
  const kay = await newStudent('Kay');
  const frozen = (await admin('GET', '/lessons')).data.lessons.map(l => l.slug).join();
  assert.equal((await admin('POST', '/import', { assignTo: kay.id, lessons: [mk('Kays', 'ord-kays')] })).status, 200);
  assert.equal((await admin('GET', '/lessons')).data.lessons.map(l => l.slug).filter(x => x !== 'ord-kays').join(), frozen);
});

test('grammar tips and "why": written in the editor or JSON, shown to students, kept by imports', { skip }, async () => {
  const tess = await newStudent('Tess');
  const made = await admin('POST', '/lessons', { title: 'Tips lesson', slug: 'tips-lesson', units: [
    { title: 'Be', tip: 'We use "is" with he, she and it.\n\n  We use "are" with you, we and they. ', tipAr: 'نستخدم is مع he و she و it', sentences: [
      'She [is|are|am] reading a book ?? We use "is" with she. // هي تقرأ كتاباً',
      { en: 'They are late today', gap: { index: 1, answer: 'are', options: ['are', 'is', 'am'], why: 'They is plural, so we use "are".' } },
      'I like green tea' ] },
    { title: 'No tip here', sentences: ['We like red apples'] },
  ] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const id = made.data.lesson.id;

  // 1) what the teacher gets back: tip lines tidied, the reason stored on the gap, the Arabic kept next to it
  const full = (await admin('GET', `/lessons/${id}`)).data.lesson;
  assert.equal(full.units[0].tip, 'We use "is" with he, she and it.\nWe use "are" with you, we and they.');
  assert.equal(full.units[0].tipAr, 'نستخدم is مع he و she و it');
  assert.deepEqual(full.units[0].sentences[0].gap, { index: 1, answer: 'is', options: ['is', 'are', 'am'], why: 'We use "is" with she.' });
  assert.equal(full.units[0].sentences[0].ar, 'هي تقرأ كتاباً');
  assert.equal(full.units[0].sentences[1].gap.why, 'They is plural, so we use "are".');
  assert.equal('tip' in full.units[1], false, 'a unit without a tip has no tip fields at all (older lessons look the same)');

  // 2) the student gets the tip and the reasons; the Arabic tip only once Arabic is switched on for them
  const view = async () => (await tess.as('GET', '/app')).data.lessons.find(l => l.slug === 'tips-lesson');
  let l = await view();
  assert.equal(l.units[0].tip, full.units[0].tip);
  assert.equal(l.units[0].tipAr, undefined);
  assert.equal(l.units[0].sentences[0].gap.why, 'We use "is" with she.');
  assert.equal(l.units[0].sentences[0].ar, undefined);
  assert.equal('tip' in l.units[1], false);
  await admin('PUT', `/users/${tess.id}/arabic`, { enabled: true });
  l = await view();
  assert.equal(l.units[0].tipAr, 'نستخدم is مع he و she و it');
  const one = (await tess.as('GET', '/lessons/tips-lesson')).data.lesson;
  assert.equal(one.units[0].tip, full.units[0].tip);
  assert.equal(one.units[0].tipAr, 'نستخدم is مع he و she و it');

  // 3) mistakes are explained, nothing is saved
  const bad1 = await admin('POST', '/lessons', { title: 'Bad why', units: [{ title: 'U', sentences: ['She is reading ?? no gap here'] }] });
  assert.equal(bad1.status, 400); assert.match(bad1.data.error, /needs a grammar gap/);
  const bad2 = await admin('POST', '/lessons', { title: 'Bad tip', units: [{ title: 'U', tip: 'x'.repeat(301), sentences: ['We like tea'] }] });
  assert.equal(bad2.status, 400); assert.match(bad2.data.error, /300 characters/);
  const bad3 = await admin('POST', '/lessons', { title: 'Bad why 2', units: [{ title: 'U', sentences: [{ en: 'She is reading', gap: { index: 1, answer: 'is', options: ['is', 'are', 'am'], why: 'y'.repeat(141) } }] }] });
  assert.equal(bad3.status, 400); assert.match(bad3.data.error, /140/);

  // 4) export -> import round trip keeps tips and reasons
  const exported = (await admin('GET', '/export')).data.lessons.find(x => x.slug === 'tips-lesson');
  assert.equal(exported.units[0].tip, full.units[0].tip);
  assert.equal(exported.units[0].tipAr, full.units[0].tipAr);
  assert.equal(exported.units[0].sentences[0].gap.why, 'We use "is" with she.');
  const copy = await admin('POST', '/import', { lessons: [{ ...exported, slug: 'tips-lesson-copy', title: 'Tips copy' }] });
  assert.equal(copy.status, 200, JSON.stringify(copy.data));
  const copyId = (await admin('GET', '/lessons')).data.lessons.find(x => x.slug === 'tips-lesson-copy').id;
  assert.equal((await admin('GET', `/lessons/${copyId}`)).data.lesson.units[0].tip, full.units[0].tip);

  // 5) an older file with no "tip" does NOT wipe the tips already written; an explicit empty tip does
  const oldFile = { lessons: [{ title: 'Tips lesson', slug: 'tips-lesson', units: [{ title: 'Be', sentences: ['She [is|are|am] reading a book', 'They [are|is|am] late today'] }] }] };
  assert.equal((await admin('POST', '/import', oldFile)).status, 200);
  const after = (await admin('GET', `/lessons/${id}`)).data.lesson;
  assert.equal(after.units[0].tip, full.units[0].tip);
  assert.equal(after.units[0].tipAr, full.units[0].tipAr);
  assert.equal(after.units[0].id, full.units[0].id, 'the unit keeps its id, so student progress is kept');
  oldFile.lessons[0].units[0].tip = '';
  await admin('POST', '/import', oldFile);
  assert.equal('tip' in (await admin('GET', `/lessons/${id}`)).data.lesson.units[0], false);
});

test('Arabic -> English step: needs the sentence built, works with the Arabic switch off, saved for the teacher, never changes stars or unit completion', { skip }, async () => {
  const Core = require('../public/progress-core.js');
  const lia = await newStudent('Lia');
  const made = await admin('POST', '/lessons', { title: 'Arabic build', slug: 'arabic-build', units: [
    { title: 'A', sentences: ['I like green apples // أحب التفاح الأخضر', 'She [is|are|am] reading a book // هي تقرأ كتابا', 'No Arabic here at all'] },
    { title: 'B', sentences: ['We are going home now // نحن ذاهبون إلى البيت الآن'] },
  ] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const lessonId = made.data.lesson.id;
  assert.equal(made.data.lesson.arStep, true, 'on by default');
  const view = async () => (await lia.as('GET', '/app')).data.lessons.find(l => l.slug === 'arabic-build');
  const arb = (sentence, mistakes = 0, hints = 0, extra = {}) => lia.as('POST', '/lessons/arabic-build/arbuild', { sentence, mistakes, hints, seconds: 7, cid: Math.random().toString(36), ...extra });

  // the Arabic of the step reaches the student although the Arabic switch for the cards is OFF; "ar" (the card flip) stays hidden
  let l = await view();
  const [s1, s2, s3] = l.units[0].sentences;
  assert.equal(s1.arq, 'أحب التفاح الأخضر');
  assert.equal(s1.ar, undefined, 'the card switch still controls the cards');
  assert.equal(s3.arq, undefined, 'a sentence without Arabic skips the step');
  assert.equal(s1.arbDone, undefined);

  // rules: built first, only sentences with Arabic, never in a locked unit
  assert.equal((await arb('I like green apples')).status, 409, 'not built yet');
  assert.equal((await arb('No Arabic here at all')).status, 400);
  assert.equal((await arb('Not in the lesson')).status, 400);
  assert.equal((await arb('We are going home now')).status, 403, 'unit B is still locked');
  const u1 = l.units[0];
  await lia.as('POST', `/lessons/arabic-build/units/${u1.id}/learn`, { index: 2, done: true });
  for (const sn of u1.sentences) assert.equal((await solve(lia, 'arabic-build', sn.en, 1, 0)).status, 200);

  // solving the step: the first result is what the teacher sees; later tries are practice
  const cid = 'same-cid';
  const first = await arb('I like green apples', 2, 1, { cid });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.first, true);
  assert.equal((await arb('I like green apples', 0, 0, { cid })).data.duplicate, true, 'a resent request is not counted twice');
  const again = await arb('I like green apples', 0, 0);
  assert.equal(again.data.first, false);
  assert.equal((await arb('She is reading a book', 0, 0)).data.first, true);

  l = await view();
  assert.equal(l.units[0].sentences[0].arbDone, true);
  assert.equal(l.units[0].sentences[1].arbDone, true);
  assert.equal(l.units[0].sentences[0].stars, 2, 'stars are untouched (1 mistake from building = 2 stars)');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  const row = (await pool.query("SELECT arb_done, arb_mistakes, arb_hints, arb_seconds, arb_times, stars FROM sentence_progress WHERE user_id = $1 AND sentence = 'I like green apples'", [lia.id])).rows[0];
  await pool.end();
  assert.deepEqual(row, { arb_done: true, arb_mistakes: 2, arb_hints: 1, arb_seconds: 7, arb_times: 2, stars: 2 }, 'first try kept; the resent duplicate is not counted');

  // the teacher's timeline shows it, with mistakes / hints / seconds, and a repeat is marked as practice
  const events = (await admin('GET', `/users/${lia.id}`)).data.events.filter(e => e.type === 'arbuild_solved');
  assert.equal(events.length, 3);
  const firstEv = events.find(e => e.data.sentence === 'I like green apples' && !e.data.replay);
  assert.deepEqual([firstEv.data.mistakes, firstEv.data.hints, firstEv.data.seconds], [2, 1, 7]);
  assert.equal(events.filter(e => e.data.replay).length, 1);
  assert.equal(events.some(e => 'cid' in e.data), false);

  // the unit is NOT finished by this step (grammar and the quiz still decide that), exactly as before
  const state = Core.modelOf(l);
  assert.equal(state.units[0].completed, false);
  assert.equal(state.units[0].grammarReady, true);
  // the device rule matches
  const raw = JSON.parse(JSON.stringify(l));
  raw.units[0].sentences[1].arbDone = false;
  const stats = { timeSpent: 0, streak: 0 };
  assert.deepEqual(Core.applyArb(raw, stats, 'She is reading a book', 4, new Date().toISOString()), { first: true });
  assert.deepEqual(Core.applyArb(raw, stats, 'She is reading a book', 4, new Date().toISOString()), { first: false });
  assert.equal(Core.applyArb(raw, stats, 'No Arabic here at all', 4, 'x'), null);
  assert.equal(raw.units[0].sentences[1].arbDone, true);
  assert.equal(stats.timeSpent, 8);

  // the teacher switches the step off for this lesson: nothing is sent, nothing is accepted; progress is kept
  const body = (await admin('GET', `/lessons/${lessonId}`)).data.lesson;
  const off = await admin('PUT', `/lessons/${lessonId}`, { ...body, arStep: false });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.equal(off.data.lesson.arStep, false);
  l = await view();
  assert.equal(l.units[0].sentences[0].arq, undefined);
  assert.equal((await arb('I like green apples')).status, 400);
  // an older file without "arStep" must not switch it back on; saving from the editor with arStep true does
  const file = (await admin('GET', '/export')).data.lessons.find(x => x.slug === 'arabic-build');
  assert.equal(file.arStep, false);
  delete file.arStep;
  assert.equal((await admin('POST', '/import', { lessons: [file] })).status, 200);
  assert.equal((await admin('GET', `/lessons/${lessonId}`)).data.lesson.arStep, false);
  assert.equal((await admin('PUT', `/lessons/${lessonId}`, { ...body, arStep: true })).data.lesson.arStep, true);
  assert.equal((await view()).units[0].sentences[0].arbDone, true, 'earlier results are still there');
});

// ---------- Daily review (spaced repetition) ----------
async function withDb(fn) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB });
  try { return await fn(pool); } finally { await pool.end(); }
}
const dayOffset = n => `((now() AT TIME ZONE 'UTC')::date + (${n}))`;

test('daily review: hard sentences enter the schedule, come back on the 1, 3, 7, 14, 30 day plan, never touch stars, and count for the streak', { skip }, async () => {
  const rae = await newStudent('Rae');
  const made = await admin('POST', '/lessons', { title: 'Review lesson', slug: 'review-lesson', units: [
    { title: 'A', sentences: ['I like green apples', 'She [is|are|am] reading a book', 'We like red tea', 'They have blue cars', 'He [has|have|having] a small bag'] },
  ] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const lessonId = made.data.lesson.id;
  const app = async () => (await rae.as('GET', '/app')).data;
  const unit = (await app()).lessons.find(l => l.slug === 'review-lesson').units[0];
  await rae.as('POST', `/lessons/review-lesson/units/${unit.id}/learn`, { index: 4, done: true });
  const rows = () => withDb(async p => (await p.query(
    "SELECT sentence, stage, to_char(due_on,'YYYY-MM-DD') AS due, (due_on - (now() AT TIME ZONE 'UTC')::date) AS in_days, weak_count FROM review_items WHERE user_id = $1 ORDER BY sentence", [rae.id])).rows);
  const sql = (q, a) => withDb(p => p.query(q, a));

  // 1) what makes a sentence weak: mistakes or hints while building. A perfect sentence is not scheduled.
  assert.equal((await solve(rae, 'review-lesson', 'I like green apples', 1, 0)).status, 200);        // a mistake
  assert.equal((await solve(rae, 'review-lesson', 'We like red tea', 0, 2)).status, 200);            // hints
  assert.equal((await solve(rae, 'review-lesson', 'They have blue cars', 0, 0)).status, 200);        // perfect
  assert.equal((await solve(rae, 'review-lesson', 'She is reading a book', 0, 0)).status, 200);      // perfect build, wrong grammar below
  assert.equal((await solve(rae, 'review-lesson', 'He has a small bag', 0, 0)).status, 200);         // perfect, a wrong quiz answer later
  let list = await rows();
  assert.deepEqual(list.map(x => [x.sentence, x.stage, x.in_days]), [['I like green apples', 0, 1], ['We like red tea', 0, 1]], 'first review tomorrow');
  // practising again with mistakes is practice only: it does not add a perfect sentence
  assert.equal((await solve(rae, 'review-lesson', 'They have blue cars', 3, 0)).status, 200);
  assert.equal((await rows()).length, 2);
  // a wrong grammar word
  assert.equal((await rae.as('POST', '/lessons/review-lesson/grammar', { sentence: 'She is reading a book', mistakes: 2, cid: 'g1' })).status, 200);
  assert.deepEqual((await rows()).map(x => x.sentence), ['I like green apples', 'She is reading a book', 'We like red tea']);
  // nothing is due yet (tomorrow), so the home screen has no Review card
  assert.deepEqual((await app()).reviews, []);

  // 2) a wrong quiz answer makes that sentence weak
  assert.equal((await rae.as('POST', '/lessons/review-lesson/grammar', { sentence: 'He has a small bag', mistakes: 0, cid: 'g2' })).status, 200);
  const q = await takeQuiz(rae, 'review-lesson', 'unit:' + unit.id, { right: false });
  assert.equal(q.status, 200, JSON.stringify(q.data));
  const afterQuiz = (await rows()).map(x => x.sentence);
  assert.ok(afterQuiz.includes('He has a small bag') && afterQuiz.includes('They have blue cars'), 'sentences answered wrong in the quiz are weak: ' + afterQuiz);

  // 3) due today: shown with the Review card data, most overdue first
  await sql(`UPDATE review_items SET due_on = ${dayOffset(0)} WHERE user_id = $1 AND sentence = 'We like red tea'`, [rae.id]);
  await sql(`UPDATE review_items SET due_on = ${dayOffset(-3)} WHERE user_id = $1 AND sentence = 'I like green apples'`, [rae.id]);
  assert.deepEqual((await app()).reviews, [{ slug: 'review-lesson', sentence: 'I like green apples', stage: 0 }, { slug: 'review-lesson', sentence: 'We like red tea', stage: 0 }]);
  const starsBefore = (await app()).lessons[0].units[0].sentences.map(x => x.stars);

  // 4) answering: right moves to the next interval, wrong goes back to 1 day, a resent request counts once
  const answer = (sentence, mistakes = 0, hints = 0, extra = {}) => rae.as('POST', '/review/answer', { slug: 'review-lesson', sentence, kind: 'build', mistakes, hints, seconds: 4, cid: Math.random().toString(36), ...extra });
  const dayOne = await answer('I like green apples');
  assert.deepEqual(dayOne.data, { correct: true, stage: 1, nextInDays: 3, early: false });
  assert.equal((await answer('I like green apples', 0, 0, { cid: 'dup' })).status, 200);
  assert.equal((await answer('I like green apples', 5, 5, { cid: 'dup' })).data.duplicate, true);
  assert.deepEqual((await app()).reviews.map(x => x.sentence), ['We like red tea'], 'answered sentences are no longer due today');
  const wrong = await answer('We like red tea', 0, 1);                                         // a hint = not right
  assert.deepEqual(wrong.data, { correct: false, stage: 0, nextInDays: 1, early: false });
  assert.deepEqual((await app()).reviews, []);
  // answering before it is due and right: nothing moves (it was just reviewed)
  const early = await answer('I like green apples');
  assert.deepEqual([early.data.early, early.data.stage], [true, 1]);
  // ...but a wrong answer even before it is due sends it back to 1 day
  assert.deepEqual((await answer('I like green apples', 1)).data, { correct: false, stage: 0, nextInDays: 1, early: false });

  // 5) the whole ladder: 1 -> 3 -> 7 -> 14 -> 30 -> finished
  const ladder = [];
  for (let i = 0; i < 5; i++) {
    await sql(`UPDATE review_items SET due_on = ${dayOffset(0)} WHERE user_id = $1 AND sentence = 'I like green apples'`, [rae.id]);
    const r = await answer('I like green apples');
    ladder.push([r.data.stage, r.data.nextInDays]);
  }
  assert.deepEqual(ladder, [[1, 3], [2, 7], [3, 14], [4, 30], [5, null]]);
  const finished = (await rows()).find(x => x.sentence === 'I like green apples');
  assert.deepEqual([finished.stage, finished.due], [5, null], 'finished: no more reviews');
  // weak again later (a new mistake in a quiz, say) starts the ladder again at 1 day
  assert.equal((await rae.as('POST', '/lessons/review-lesson/grammar', { sentence: 'She is reading a book', mistakes: 1, cid: 'g3' })).status, 200);
  await sql(`UPDATE review_items SET stage = 3, due_on = ${dayOffset(14)} WHERE user_id = $1 AND sentence = 'She is reading a book'`, [rae.id]);
  await solve(rae, 'review-lesson', 'She is reading a book', 0, 0);                              // practice with no mistakes: nothing changes
  assert.equal((await rows()).find(x => x.sentence === 'She is reading a book').stage, 3);
  await rae.as('POST', '/lessons/review-lesson/grammar', { sentence: 'She is reading a book', mistakes: 1, cid: 'g4' });
  assert.equal((await rows()).find(x => x.sentence === 'She is reading a book').stage, 3, 'a repeat grammar answer is practice, not a new weakness');

  // 6) rules for the endpoint
  assert.equal((await answer('Not in the lesson')).status, 400);
  assert.equal((await answer('We like red tea', 0, 0, { kind: 'grammar' })).status, 400, 'no gap in that sentence');
  assert.equal((await rae.as('POST', '/review/answer', { slug: 'nope', sentence: 'x' })).status, 404);
  assert.equal((await answer('He has a small bag', 0, 0, { kind: 'grammar' })).status, 200, 'a grammar question about a sentence with a gap');
  assert.equal((await rae.as('POST', '/review/answer', { slug: 'review-lesson', sentence: 'We like red tea', kind: 'build' })).status, 200);
  await sql('DELETE FROM review_items WHERE user_id = $1', [rae.id]);
  assert.equal((await answer('We like red tea')).status, 404, 'not in the review list');

  // 7) stars never changed by any of it
  assert.deepEqual((await app()).lessons[0].units[0].sentences.map(x => x.stars), starsBefore);

  // 8) the teacher sees it in the timeline; a review counts for the day streak
  const events = (await admin('GET', `/users/${rae.id}`)).data.events.filter(e => e.type === 'review_answered');
  assert.ok(events.length >= 8);
  const wrongEv = events.find(e => e.data.sentence === 'We like red tea' && e.data.correct === false);
  assert.deepEqual([wrongEv.data.kind, wrongEv.data.hints, wrongEv.data.nextInDays], ['build', 1, 1]);
  assert.ok(events.some(e => e.data.early === true));
  assert.equal(events.some(e => 'cid' in e.data), false);
  await sql("DELETE FROM events WHERE user_id = $1 AND type <> 'review_answered'", [rae.id]);
  assert.equal((await rae.as('GET', '/me')).data.stats.streak, 1, 'a day with only a review still counts');
  await sql("DELETE FROM events WHERE user_id = $1", [rae.id]);
  assert.equal((await rae.as('GET', '/me')).data.stats.streak, 0);
});

test('daily review: only lessons the student can open, and only sentences that still exist', { skip }, async () => {
  const ivy = await newStudent('Ivy');
  const made = await admin('POST', '/lessons', { title: 'Hidden review', slug: 'hidden-review', units: [{ title: 'A', sentences: ['The old sentence is here', 'The second sentence stays'] }] });
  const unit = (await ivy.as('GET', '/app')).data.lessons.find(l => l.slug === 'hidden-review').units[0];
  await ivy.as('POST', `/lessons/hidden-review/units/${unit.id}/learn`, { index: 1, done: true });
  await solve(ivy, 'hidden-review', 'The old sentence is here', 2, 0);
  await solve(ivy, 'hidden-review', 'The second sentence stays', 1, 0);
  await withDb(p => p.query('UPDATE review_items SET due_on = (now() AT TIME ZONE \'UTC\')::date WHERE user_id = $1', [ivy.id]));
  const due = async () => (await ivy.as('GET', '/app')).data.reviews.map(x => x.sentence);
  assert.deepEqual((await due()).sort(), ['The old sentence is here', 'The second sentence stays']);
  // the teacher rewrites one sentence: its old text is no longer asked
  const body = (await admin('GET', `/lessons/${made.data.lesson.id}`)).data.lesson;
  const edit = { ...body, units: [{ ...body.units[0], sentences: [{ en: 'The new sentence is here' }, body.units[0].sentences[1]] }] };
  assert.equal((await admin('PUT', `/lessons/${made.data.lesson.id}`, edit)).status, 200);
  assert.deepEqual(await due(), ['The second sentence stays']);
  // a draft lesson is not offered
  assert.equal((await admin('PUT', `/lessons/${made.data.lesson.id}`, { ...edit, published: false })).status, 200);
  assert.deepEqual(await due(), []);
});

test('daily review: the upgrade adds sentences students already found hard, spread over 7 days, and does it only once', { skip }, async () => {
  const { migrate } = require('../src/db');
  const tom = await newStudent('Tom');
  const sentences = Array.from({ length: 15 }, (_, i) => `Old hard sentence number ${i + 1} here`);
  const made = await admin('POST', '/lessons', { title: 'Old lesson', slug: 'old-hard-lesson', units: [{ title: 'A', sentences: [...sentences, 'A perfect old sentence', 'A sentence with a wrong quiz answer', 'A grandfathered quiz sentence'] }] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const lid = made.data.lesson.id;
  await withDb(async p => {
    for (const [i, s] of sentences.entries()) await p.query(
      "INSERT INTO sentence_progress (user_id, lesson_id, sentence, stars, base_stars, last_solved_at) VALUES ($1,$2,$3,$4,$4, now() - ($5 || ' minutes')::interval)", [tom.id, lid, s, 1 + (i % 2), i]);
    await p.query("INSERT INTO sentence_progress (user_id, lesson_id, sentence, stars, base_stars) VALUES ($1,$2,'A perfect old sentence',3,3)", [tom.id, lid]);
    await p.query("INSERT INTO sentence_progress (user_id, lesson_id, sentence, stars, base_stars) VALUES ($1,$2,'A sentence with a wrong quiz answer',3,3)", [tom.id, lid]);
    await p.query("INSERT INTO sentence_progress (user_id, lesson_id, sentence, stars, base_stars) VALUES ($1,$2,'A grandfathered quiz sentence',3,3)", [tom.id, lid]);
    await p.query("INSERT INTO quiz_attempts (user_id, lesson_id, scope, score, total, passed, details) VALUES ($1,$2,'final',1,2,false,$3::jsonb)",
      [tom.id, lid, JSON.stringify([{ sentence: 'A sentence with a wrong quiz answer', correct: false }, { sentence: 'A perfect old sentence', correct: true }])]);
    await p.query("INSERT INTO quiz_attempts (user_id, lesson_id, scope, score, total, passed, grandfathered, details) VALUES ($1,$2,'unit:x',1,1,true,true,$3::jsonb)",
      [tom.id, lid, JSON.stringify([{ sentence: 'A grandfathered quiz sentence', correct: false }])]);
    await p.query('DELETE FROM review_items WHERE user_id = $1', [tom.id]);
    await p.query("DELETE FROM app_flags WHERE key = 'review_backfill_v1'");
    await migrate(p); // what happens on the first start after the update
  });
  const rows = () => withDb(async p => (await p.query("SELECT sentence, (due_on - (now() AT TIME ZONE 'UTC')::date) AS d FROM review_items WHERE user_id = $1", [tom.id])).rows);
  let list = await rows();
  assert.equal(list.length, 16, '15 first tries with mistakes + 1 wrong quiz answer; the perfect and grandfathered ones are not added');
  assert.ok(!list.some(x => /perfect old|grandfathered/.test(x.sentence)));
  const perDay = {};
  for (const x of list) perDay[x.d] = (perDay[x.d] || 0) + 1;
  assert.deepEqual(Object.keys(perDay).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7], 'first reviews are spread over the next 7 days, none today');
  assert.ok(Math.max(...Object.values(perDay)) <= 3, JSON.stringify(perDay));
  // running the upgrade again (a restart) changes nothing, even after the student's schedule moved
  await withDb(async p => { await p.query("UPDATE review_items SET stage = 2 WHERE user_id = $1", [tom.id]); await migrate(p); });
  list = await rows();
  assert.equal(list.length, 16);
  assert.equal((await withDb(p => p.query("SELECT COUNT(*)::int AS n FROM review_items WHERE user_id = $1 AND stage = 2", [tom.id]))).rows[0].n, 16);
});

test('speaking check: the server scores the heard text itself, keeps the best score, and shows it to the teacher', { skip }, async () => {
  const pia = await newStudent('Pia');
  const raj = await newStudent('Raj');
  const made = await admin('POST', '/lessons', { title: 'Speaking lesson', slug: 'speaking-lesson', units: [{ title: 'A', sentences: ['Where is the check-in desk', 'I would like a window seat', 'We like green tea'] }] });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const lessonId = made.data.lesson.id;
  const speak = (st, sentence, heard, extra = {}) => st.as('POST', '/lessons/speaking-lesson/speak', { sentence, heard, seconds: 6, cid: Math.random().toString(36), ...extra });

  // scored by the server from the text: the phone cannot send a score (an extra "score" or "passed" is ignored)
  const first = await speak(pia, 'I would like a window seat', ['i would like seat'], { score: 100, passed: true });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.deepEqual([first.data.score, first.data.passed, first.data.tries], [66, false, 1]);
  // a later, better check: the best score is kept, tries add up, the text heard is the best one
  const second = await speak(pia, 'I would like a window seat', ['i would like a window', 'I would like a window seat'], { cid: 'c2' });
  assert.deepEqual([second.data.score, second.data.passed, second.data.best, second.data.tries], [100, true, 100, 3]);
  // a worse check later does not lower the best score or replace the best text
  const third = await speak(pia, 'I would like a window seat', ['window'], { cid: 'c3' });
  assert.deepEqual([third.data.score, third.data.best, third.data.passed], [16, 100, false], 'this check did not pass; the best score stays');
  assert.equal((await speak(pia, 'I would like a window seat', ['window'], { cid: 'c3' })).data.duplicate, true, 'a resent request counts once');
  // at most 3 tries are read, whatever the phone sends
  const many = await speak(raj, 'Where is the check-in desk', ['where desk', 'is the', 'check in', 'where is the check in desk'], { cid: 'm1' });
  assert.deepEqual([many.data.score, many.data.tries, many.data.passed], [33, 3, false], 'only the first 3 tries are read (the perfect 4th is ignored)');
  await speak(raj, 'We like green tea', ['we like green tea']);

  // rules
  assert.equal((await speak(pia, 'Not in the lesson', ['hello'])).status, 400);
  assert.equal((await speak(pia, 'We like green tea', [])).status, 400, 'nothing heard');
  assert.equal((await speak(pia, 'We like green tea', 'we like green tea')).status, 400, 'heard must be a list');
  assert.equal((await speak(pia, 'We like green tea', [5, null, {}])).status, 400, 'no text at all');
  assert.equal((await pia.as('POST', '/lessons/nope/speak', { sentence: 'x', heard: ['x'] })).status, 404);

  // the teacher sees every check in the timeline, with what was heard
  const events = (await admin('GET', `/users/${pia.id}`)).data.events.filter(e => e.type === 'speak_checked');
  assert.equal(events.length, 3);
  const e1 = events.find(e => e.data.score === 66);
  assert.deepEqual([e1.data.sentence, e1.data.heard, e1.data.tries, e1.data.passed, e1.data.seconds], ['I would like a window seat', 'i would like seat', 1, false, 6]);
  assert.equal(events.some(e => 'cid' in e.data), false);
  // ...a summary on the student's card (lowest first)...
  const card = (await admin('GET', `/users/${pia.id}`)).data.speaking;
  assert.deepEqual([card.count, card.average], [1, 100]);
  assert.deepEqual([card.lowest[0].sentence, card.lowest[0].score, card.lowest[0].tries, card.lowest[0].heard, card.lowest[0].passed], ['I would like a window seat', 100, 4, 'I would like a window seat', true], 'passed once = passed');
  // ...and "hardest to say" on the lesson's progress page: lowest average best score first
  const hard = (await admin('GET', `/lessons/${lessonId}/speaking`)).data.sentences;
  assert.deepEqual(hard.map(x => [x.sentence, x.avgScore, x.students, x.notPassed]),
    [['Where is the check-in desk', 33, 1, 1], ['I would like a window seat', 100, 1, 0], ['We like green tea', 100, 1, 0]]);
  assert.equal((await admin('GET', '/lessons/nope/speaking')).status, 404);
  // no effect on progress: nothing was built, no stars
  const lesson = (await pia.as('GET', '/app')).data.lessons.find(l => l.slug === 'speaking-lesson');
  assert.equal(lesson.units[0].sentences.every(s => s.stars === 0), true);
  assert.equal((await pia.as('GET', '/me')).data.stats.streak, 0, 'speaking alone is not a finished sentence');
});

test('word meanings: kept per lesson, matched without caring about case or punctuation, shown to every student, kept by imports', { skip }, async () => {
  const wen = await newStudent('Wen');
  const made = await admin('POST', '/lessons', { title: 'Words lesson', slug: 'words-lesson',
    words: { Airport: ' مطار ', 'Check-in.': 'تسجيل الوصول', 'Not here': 'ليست هنا' },
    units: [{ title: 'A', sentences: ['Where is the airport?', 'The check-in desk is open'] }] });
  assert.equal(made.status, 400, 'two words in one key is refused');
  assert.match(made.data.error, /not a single word/);
  const ok = await admin('POST', '/lessons', { title: 'Words lesson', slug: 'words-lesson',
    words: { Airport: ' مطار ', 'Check-in.': 'تسجيل الوصول', Hotel: 'فندق' },
    units: [{ title: 'A', sentences: ['Where is the airport?', 'The check-in desk is open'] }] });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const lessonId = ok.data.lesson.id;

  // stored with plain keys; the editor gets them back
  const full = (await admin('GET', `/lessons/${lessonId}`)).data.lesson;
  assert.deepEqual(full.words, { airport: 'مطار', 'check-in': 'تسجيل الوصول', hotel: 'فندق' });
  assert.equal(full.wordsCount, 3);

  // every student gets the meanings of the words that are in the lesson, although their Arabic switch for the cards is off
  const mine = async () => (await wen.as('GET', '/app')).data.lessons.find(l => l.slug === 'words-lesson');
  let l = await mine();
  assert.deepEqual(l.words, { airport: 'مطار', 'check-in': 'تسجيل الوصول' }, '"hotel" is not in any sentence, so it is not sent');
  assert.equal(l.units[0].sentences[0].ar, undefined);
  assert.equal(l.units[0].sentences[0].arq, undefined);
  // lessons without a list have no "words" at all (older lessons look the same)
  const plain = await admin('POST', '/lessons', lessonBody('No words here'));
  assert.equal((await wen.as('GET', '/app')).data.lessons.find(x => x.slug === plain.data.lesson.slug).words, undefined);

  // the list is checked
  const base = (await admin('GET', `/lessons/${lessonId}`)).data.lesson;
  for (const [words, re] of [[{ airport: 'airport' }, /Arabic/], [{ airport: '' }, /empty/], [{ 'two words': 'مطار' }, /single word/], [{ Airport: 'مطار', 'airport.': 'مطار' }, /twice/], [[], /object/]]) {
    const bad = await admin('PUT', `/lessons/${lessonId}`, { ...base, words });
    assert.equal(bad.status, 400, JSON.stringify(words));
    assert.match(bad.data.error, re);
  }
  assert.deepEqual((await admin('GET', `/lessons/${lessonId}`)).data.lesson.words, base.words, 'nothing was saved');

  // export -> import round trip keeps the words; an older file with no "words" keeps them; "words": {} clears them
  const exported = (await admin('GET', '/export')).data.lessons.find(x => x.slug === 'words-lesson');
  assert.deepEqual(exported.words, base.words);
  assert.equal((await admin('POST', '/import', { lessons: [{ ...exported, slug: 'words-lesson-copy', title: 'Words copy' }] })).status, 200);
  const copyId = (await admin('GET', '/lessons')).data.lessons.find(x => x.slug === 'words-lesson-copy').id;
  assert.deepEqual((await admin('GET', `/lessons/${copyId}`)).data.lesson.words, base.words);
  const older = { title: 'Words lesson', slug: 'words-lesson', units: [{ title: 'A', sentences: ['Where is the airport?', 'The check-in desk is open'] }] };
  assert.equal((await admin('POST', '/import', { lessons: [older] })).status, 200);
  assert.deepEqual((await admin('GET', `/lessons/${lessonId}`)).data.lesson.words, base.words, 'an older file does not erase the list');
  assert.equal((await admin('PUT', `/lessons/${lessonId}`, { ...base, words: undefined })).status, 200);
  assert.deepEqual((await admin('GET', `/lessons/${lessonId}`)).data.lesson.words, base.words);
  assert.equal((await admin('POST', '/import', { lessons: [{ ...older, words: {} }] })).status, 200);
  assert.deepEqual((await admin('GET', `/lessons/${lessonId}`)).data.lesson.words, {}, 'an explicit empty list clears it');
});

test('word meanings: download the words without meaning, give them to an AI, paste the answer back (same safety checks as the Arabic)', { skip }, async () => {
  const one = await admin('POST', '/lessons', { title: 'Flow words one', slug: 'flow-words-one', words: { zebra: 'حمار وحشي' }, units: [{ title: 'A', sentences: ['The Zebra is at the market.', 'A zebra likes quiet gardens'] }] });
  const two = await admin('POST', '/lessons', { title: 'Flow words two', slug: 'flow-words-two', units: [{ title: 'A', sentences: ['Zebra gardens are quiet'] }] });
  assert.equal(one.status, 201); assert.equal(two.status, 201);
  const wordsOf = async l => (await admin('GET', `/lessons/${l.data.lesson.id}`)).data.lesson.words;
  const unitsBefore = JSON.stringify((await admin('GET', `/lessons/${two.data.lesson.id}`)).data.lesson.units);

  // what the teacher downloads: different words once each (any case), no tiny words, with an example; words that already have a meaning are left out
  const mine = list => list.filter(x => ['zebra', 'market', 'quiet', 'gardens', 'likes', 'the', 'is', 'at', 'a'].includes(x.word));
  let ex = (await admin('GET', '/words/export?size=500')).data;
  assert.match(ex.instructions, /Do NOT change any "word"/);
  assert.ok(ex.words.every(x => x.ar === '' && typeof x.word === 'string' && typeof x.example === 'string'));
  assert.equal(new Set(ex.words.map(x => x.word)).size, ex.words.length, 'each word once');
  assert.deepEqual(mine(ex.words).map(x => x.word).sort(), ['gardens', 'likes', 'market', 'quiet', 'zebra'].sort(), 'zebra is missing in lesson two; tiny words are skipped');
  assert.equal(ex.words.find(x => x.word === 'market').example, 'The Zebra is at the market.');
  assert.equal(ex.words.find(x => x.word === 'quiet').word, 'quiet', 'lower case, no punctuation');
  assert.equal((await admin('GET', '/words/export?size=2')).data.words.length, 2, 'a batch at a time');
  assert.equal((await admin('GET', '/words/export?size=2')).data.wordsLeft, ex.wordsLeft);
  const st0 = (await admin('GET', '/words/status')).data;
  assert.match(st0.prompt, /Modern Standard Arabic/);
  const l1 = st0.lessons.find(x => x.id === one.data.lesson.id), l2 = st0.lessons.find(x => x.id === two.data.lesson.id);
  assert.deepEqual([l1.total, l1.ready, l2.total, l2.ready], [5, 1, 3, 0]);

  // the AI's answer: a word it changed does not match, English text is refused, nothing outside the words changes
  const imp = await admin('POST', '/words/import', { data: { words: [
    { word: 'Zebra', ar: 'حمار وحشي', example: 'ignored' },                 // capital letter: still the word "zebra"; lesson one already has it, lesson two gets it
    { word: 'market', ar: 'سوق' },
    { word: 'quiet', ar: 'quiet' },                                       // not Arabic: refused
    { word: 'zebras', ar: 'حمر وحشية' },                                   // not a word of any lesson (did the AI change it?): reported, not added
    { word: 'gardens', ar: 'حدائق' },
  ] } });
  assert.equal(imp.status, 200, JSON.stringify(imp.data));
  assert.deepEqual([imp.data.updated, imp.data.unchanged, imp.data.rejected, imp.data.notFound], [4, 1, 1, 1]); // zebra(two) + market(one) + gardens(one, two)
  assert.deepEqual(imp.data.notFoundExamples, ['zebras']);
  assert.deepEqual(imp.data.rejectedExamples, ['quiet']);
  assert.deepEqual(await wordsOf(one), { zebra: 'حمار وحشي', market: 'سوق', gardens: 'حدائق' });
  assert.deepEqual(await wordsOf(two), { zebra: 'حمار وحشي', gardens: 'حدائق' }, 'only words that are in that lesson');
  assert.equal(JSON.stringify((await admin('GET', `/lessons/${two.data.lesson.id}`)).data.lesson.units), unitsBefore, 'sentences and units are untouched');

  // existing meanings are kept unless the teacher asks to replace them; a map and a lessons file work too
  const keep = await admin('POST', '/words/import', { data: { market: 'سوق آخر', quiet: 'هادئ' } });
  assert.deepEqual([keep.data.updated, keep.data.unchanged], [2, 1]); // market is kept (already there); "quiet" is new in lesson one and in lesson two
  assert.equal((await wordsOf(one)).market, 'سوق');
  const repl = await admin('POST', '/words/import', { replace: true, data: { lessons: [{ title: 'x', words: { market: 'سوق آخر' } }] } });
  assert.equal(repl.data.updated, 1);
  assert.equal((await wordsOf(one)).market, 'سوق آخر');
  assert.equal((await admin('POST', '/words/import', { data: [] })).status, 400);
  assert.equal((await admin('POST', '/words/import', { data: [{ word: 'x' }] })).status, 400);

  // everything is ready now except the words nobody has given a meaning yet; the downloaded list gets shorter
  const ex2 = (await admin('GET', '/words/export?size=500')).data;
  assert.deepEqual(mine(ex2.words).map(x => x.word), ['likes']);
  const all = (await admin('GET', '/words/export?all=1&size=500')).data.words;
  assert.equal(all.find(x => x.word === 'market').ar, 'سوق آخر', 'all=1 also lists words that have a meaning');
});
