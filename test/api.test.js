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
