'use strict';

const crypto = require('crypto');
const express = require('express');
const auth = require('../auth');
const { validateUser } = require('../validate');
const { lessonLocks } = require('../../public/progress-core');
const { starsFor, summarize, unitsOf, groupSolved, groupGrammar, groupUnits, groupQuiz, PASSED_QUIZ_SQL, streak, STREAK_TYPES_SQL, EXTRA_SQL, VISIBLE_SQL } = require('../progress');
const Quiz = require('../../public/quiz-core');
const Review = require('../../public/review-core');
const Speak = require('../../public/speak-core');
const Words = require('../../public/words-core');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clampInt = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(+v) ? Math.round(+v) : 0));

module.exports = function studentRoutes(pool) {
  const r = express.Router();
  const requireUser = auth.userMiddleware(pool);
  const loginLimit = auth.limiter(10, 15 * 60 * 1000);
  const signupLimit = auth.limiter(10, 60 * 60 * 1000);
  const allowSignup = !/^(0|false|no)$/i.test(process.env.ALLOW_SIGNUP || '');

  const logEvent = (userId, lessonId, type, data = {}) =>
    pool.query('INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,$3,$4::jsonb)', [userId, lessonId, type, JSON.stringify(data)]);
  // The activity log is for the teacher. If writing to it fails, the student must still be able to log in or sign up.
  const logQuietly = (...args) => logEvent(...args).catch(e => console.error('[events] could not log:', e.message));

  const publicUser = u => ({ id: u.id, name: u.name, email: u.email, createdAt: u.created_at, arabic: Boolean(u.arabic_enabled) });

  /* ================= Auth ================= */
  r.get('/config', (req, res) => res.json({ appName: process.env.APP_NAME || 'WordStack', allowSignup }));

  r.post('/auth/signup', wrap(async (req, res) => {
    if (!allowSignup) return res.status(403).json({ error: 'Sign-up is closed. Ask your teacher for an account.' });
    if (signupLimit.hit(req.ip)) return res.status(429).json({ error: 'Too many sign-ups. Try again later.' });
    const { user, errors } = validateUser(req.body);
    if (errors) return res.status(400).json({ error: errors[0] });
    const id = crypto.randomUUID();
    try {
      await pool.query('INSERT INTO users (id, email, name, password_hash, last_seen_at) VALUES ($1,$2,$3,$4, now())',
        [id, user.email, user.name, await auth.hashPassword(user.password)]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
      throw e;
    }
    await logQuietly(id, null, 'signup');
    auth.setUserCookie(req, res, id);
    res.status(201).json({ user: { id, name: user.name, email: user.email } });
  }));

  r.post('/auth/login', wrap(async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const key = req.ip + '|' + email;
    if (loginLimit.hit(key)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    if (email.length > 254) return res.status(401).json({ error: 'Wrong email or password.' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const u = rows[0];
    // Always do the same amount of work, so the response time does not reveal whether the email exists.
    const passwordOk = await auth.verifyPassword(password, u ? u.password_hash : auth.DUMMY_HASH);
    if (!u || !passwordOk) return res.status(401).json({ error: 'Wrong email or password.' });
    if (u.disabled) return res.status(403).json({ error: 'Your account has been disabled. Please contact your teacher.' });
    loginLimit.clear(key);
    await pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [u.id]);
    await logQuietly(u.id, null, 'login');
    auth.setUserCookie(req, res, u.id);
    res.json({ user: publicUser(u) });
  }));

  r.post('/auth/logout', (req, res) => {
    auth.clearUserCookie(req, res);
    res.status(204).end();
  });

  /* ================= Everything below needs a logged-in student ================= */
  r.use(requireUser);

  async function loadStats(uid) {
    const [sp, lp, days] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS solved, COALESCE(SUM(stars),0)::int AS stars, COALESCE(SUM(${EXTRA_SQL}),0)::int AS extra FROM sentence_progress WHERE user_id = $1`, [uid]),
      pool.query('SELECT COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed, COALESCE(SUM(time_spent_sec),0)::int AS time FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM events
                  WHERE user_id = $1 AND type IN ${STREAK_TYPES_SQL} ORDER BY d DESC LIMIT 400`, [uid]),
    ]);
    return {
      sentencesSolved: sp.rows[0].solved,
      stars: sp.rows[0].stars,
      extraStars: sp.rows[0].extra,
      lessonsCompleted: lp.rows[0].completed,
      timeSpent: lp.rows[0].time,
      streak: streak(days.rows.map(x => x.d)),
    };
  }

  r.get('/me', wrap(async (req, res) => {
    res.json({ user: publicUser(req.user), stats: await loadStats(req.user.id) });
  }));

  // Everything the app needs to run, in one request: the student, their stats, and every lesson they can
  // open with all its sentences and their own progress. The app keeps this on the device and works from it,
  // so no screen ever waits for the network (see public/app.js).
  r.get('/app', wrap(async (req, res) => {
    const uid = req.user.id;
    const [stats, lessons, lp, sp, up, qa, rv] = await Promise.all([
      loadStats(uid),
      pool.query(`SELECT l.* FROM lessons l WHERE ${VISIBLE_SQL} ORDER BY l.position, l.title`, [uid]),
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone, arb_done AS adone FROM sentence_progress WHERE user_id = $1`, [uid]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, scope, passed FROM quiz_attempts WHERE user_id = $1 AND ${PASSED_QUIZ_SQL}`, [uid]),
      // the sentences due for review today (most overdue first), from lessons the student can open
      pool.query(`SELECT ri.lesson_id, ri.sentence, ri.stage FROM review_items ri JOIN lessons l ON l.id = ri.lesson_id
                  WHERE ri.user_id = $1 AND ri.due_on IS NOT NULL AND ri.due_on <= (now() AT TIME ZONE 'UTC')::date AND ${VISIBLE_SQL}
                  ORDER BY ri.due_on, ri.stage, ri.sentence LIMIT 200`, [uid]),
    ]);
    const quizBy = groupQuiz(qa.rows);
    const lpMap = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const lessonById = new Map(lessons.rows.map(l => [l.id, l]));
    const reviews = rv.rows.filter(x => { // a sentence the teacher has since removed or rewritten is not asked
      const l = lessonById.get(x.lesson_id);
      return l && unitsOf(l).some(u => u.sentences.some(sn => sn.en === x.sentence));
    }).map(x => ({ slug: lessonById.get(x.lesson_id).slug, sentence: x.sentence, stage: x.stage }));
    const arbDone = new Set(sp.rows.filter(x => x.adone).map(x => x.lesson_id + '|' + x.sentence)); // Arabic -> English step finished
    const solved = groupSolved(sp.rows);
    const extras = groupSolved(sp.rows, 'extra');
    const grammars = groupGrammar(sp.rows);
    const unitMap = groupUnits(up.rows);
    const iso = d => (d ? new Date(d).toISOString() : null);
    res.set('Cache-Control', 'no-store');
    res.json({
      user: publicUser(req.user),
      stats,
      lock: await lockIsOn(), // lessons open one by one; the app works out which are closed with the same rule (lessonLocks)
      reviews,
      lessons: lessons.rows.map(l => {
        const s = solved.get(l.id) || new Map(), x = extras.get(l.id) || new Map(), g = grammars.get(l.id) || new Set();
        const p = lpMap.get(l.id);
        const qz = quizBy.get(l.id) || { units: new Set(), final: false };
        return {
          slug: l.slug,
          finalPassed: qz.final,
          title: l.title,
          level: l.level,
          description: l.description,
          emoji: l.emoji,
          assigned: l.visibility === 'assigned',
          arStep: l.ar_step !== false,
          // the meanings of the words of this lesson, for every student (the Arabic switch of the cards does not matter here)
          ...(() => {
            const have = l.words && typeof l.words === 'object' ? l.words : {};
            const used = new Set(unitsOf(l).flatMap(u => u.sentences.flatMap(sn => Words.keysOf(sn.en))));
            const words = Object.fromEntries(Object.entries(have).filter(([k]) => used.has(k)));
            return Object.keys(words).length ? { words } : {};
          })(),
          units: unitsOf(l).map(u => ({
            id: u.id,
            title: u.title,
            quizPassed: qz.units.has(u.id),
            // the grammar tip (and its Arabic, only for students the teacher switched Arabic on for)
            ...(u.tip ? { tip: u.tip } : {}), ...(req.user.arabic_enabled && u.tipAr ? { tipAr: u.tipAr } : {}),
            // the Arabic is only sent to students the teacher switched it on for
            sentences: u.sentences.map(sn => ({ en: sn.en, stars: s.get(sn.en) || 0, extra: x.get(sn.en) || 0, ...(sn.gap ? { gap: sn.gap, gdone: g.has(sn.en) } : {}), ...(req.user.arabic_enabled && sn.ar ? { ar: sn.ar } : {}),
              // The Arabic -> English step shows the Arabic whether or not the card switch is on, so it travels in its own field ("arq").
              ...(l.ar_step !== false && sn.ar ? { arq: sn.ar, ...(arbDone.has(l.id + '|' + sn.en) ? { arbDone: true } : {}) } : {}) })),
          })),
          lp: p ? { started_at: iso(p.started_at), last_activity_at: iso(p.last_activity_at), completed_at: iso(p.completed_at), time_spent_sec: p.time_spent_sec } : null,
          unitRows: [...(unitMap.get(l.id) || new Map()).values()].map(r => ({ unit_id: r.unit_id, learn_index: r.learn_index, learned_at: iso(r.learned_at) })),
        };
      }),
    });
  }));

  r.patch('/me', wrap(async (req, res) => {
    const { user, errors } = validateUser({ name: req.body && req.body.name }, { partial: true, requirePassword: false });
    if (errors) return res.status(400).json({ error: errors[0] });
    await pool.query('UPDATE users SET name = $2 WHERE id = $1', [req.user.id, user.name]);
    res.json({ user: { ...publicUser(req.user), name: user.name } });
  }));

  r.post('/me/password', wrap(async (req, res) => {
    const { current, password } = req.body || {};
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await auth.verifyPassword(String(current || ''), rows[0].password_hash)))
      return res.status(400).json({ error: 'Your current password is wrong.' });
    const { errors } = validateUser({ password }, { partial: true, requirePassword: true });
    if (errors) return res.status(400).json({ error: errors[0] });
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await auth.hashPassword(password)]);
    res.status(204).end();
  }));

  /* ================= Lessons & progress ================= */
  r.get('/lessons', wrap(async (req, res) => {
    const uid = req.user.id;
    const [lessons, lp, sp, up, qa] = await Promise.all([
      pool.query(`SELECT l.* FROM lessons l WHERE ${VISIBLE_SQL} ORDER BY l.position, l.title`, [uid]),
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1`, [uid]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, scope, passed FROM quiz_attempts WHERE user_id = $1 AND ${PASSED_QUIZ_SQL}`, [uid]),
    ]);
    const lpMap = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const solved = groupSolved(sp.rows);
    const extras = groupSolved(sp.rows, 'extra');
    const grammars = groupGrammar(sp.rows);
    const unitMap = groupUnits(up.rows);
    const quizBy = groupQuiz(qa.rows);
    res.set('Cache-Control', 'no-store');
    res.json({
      lessons: lessons.rows.map(l => ({
        slug: l.slug,
        title: l.title,
        level: l.level,
        description: l.description,
        emoji: l.emoji,
        assigned: l.visibility === 'assigned',
        count: l.sentences.length,
        progress: summarize(l, lpMap.get(l.id), solved.get(l.id), unitMap.get(l.id), extras.get(l.id), grammars.get(l.id), quizBy.get(l.id)),
      })),
    });
  }));

  // Lessons open one by one (see lessonLocks in progress-core.js). The teacher can switch this off (app_flags 'lessons_open_all').
  const lockIsOn = async () => !(await pool.query("SELECT 1 FROM app_flags WHERE key = 'lessons_open_all'")).rowCount;

  // True when this lesson is still closed for the student: a lesson for everybody, not started yet, whose previous lesson (by level, then order) is not finished.
  async function isLessonLocked(uid, lesson) {
    if (lesson.visibility !== 'public' || !(await lockIsOn())) return null;
    const [chain, lp] = await Promise.all([
      pool.query("SELECT id, slug, title, level FROM lessons WHERE published AND visibility = 'public' ORDER BY position, title"),
      pool.query('SELECT lesson_id, completed_at FROM lesson_progress WHERE user_id = $1', [uid]),
    ]);
    const have = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const locks = lessonLocks(chain.rows.map(l => ({ slug: l.slug, title: l.title, level: l.level, assigned: false, started: have.has(l.id), completed: Boolean(have.get(l.id) && have.get(l.id).completed_at) })));
    const lock = locks.get(lesson.slug);
    return lock && lock.locked ? lock.by : null;
  }

  async function loadVisibleLesson(uid, slug, { ignoreLock = false } = {}) {
    const { rows } = await pool.query(`SELECT l.* FROM lessons l WHERE l.slug = $2 AND ${VISIBLE_SQL}`, [uid, slug]);
    const lesson = rows[0] || null;
    if (lesson && !ignoreLock) {
      const by = await isLessonLocked(uid, lesson);
      if (by) throw Object.assign(new Error('lesson locked'), { status: 403, publicMessage: `Finish “${by.title}” first to open this lesson.` });
    }
    return lesson;
  }

  r.get('/lessons/:slug', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const [lp, sp, up, qa] = await Promise.all([
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
      pool.query(`SELECT sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2`, [uid, lesson.id]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
      pool.query(`SELECT lesson_id, scope, passed FROM quiz_attempts WHERE user_id = $1 AND lesson_id = $2 AND ${PASSED_QUIZ_SQL}`, [uid, lesson.id]),
    ]);
    const quiz = groupQuiz(qa.rows).get(lesson.id);
    const solved = new Map(sp.rows.map(x => [x.sentence, x.stars]));
    const extras = new Map(sp.rows.filter(x => x.extra).map(x => [x.sentence, x.extra]));
    const grammar = new Set(sp.rows.filter(x => x.gdone).map(x => x.sentence));
    const unitRows = new Map(up.rows.map(x => [x.unit_id, x]));
    res.set('Cache-Control', 'no-store');
    res.json({
      lesson: {
        slug: lesson.slug,
        title: lesson.title,
        level: lesson.level,
        description: lesson.description,
        emoji: lesson.emoji,
        assigned: lesson.visibility === 'assigned',
        units: unitsOf(lesson).map(u => ({
          id: u.id,
          title: u.title,
          ...(u.tip ? { tip: u.tip } : {}), ...(req.user.arabic_enabled && u.tipAr ? { tipAr: u.tipAr } : {}),
          sentences: u.sentences.map(s => ({ en: s.en, stars: solved.get(s.en) || 0, extra: extras.get(s.en) || 0, ...(s.gap ? { gap: s.gap, gdone: grammar.has(s.en) } : {}) })),
        })),
      },
      progress: summarize(lesson, lp.rows[0], solved, unitRows, extras, grammar, quiz),
    });
  }));

  // True when this unit is still locked for the student (a brand-new unit behind an unfinished one).
  async function isUnitLocked(db, uid, lesson, unitId) {
    const [sp, up, qa] = await Promise.all([
      db.query('SELECT sentence, stars, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
      db.query('SELECT * FROM unit_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
      db.query(`SELECT lesson_id, scope, passed FROM quiz_attempts WHERE user_id = $1 AND lesson_id = $2 AND ${PASSED_QUIZ_SQL}`, [uid, lesson.id]),
    ]);
    const p = summarize(lesson, null, new Map(sp.rows.map(x => [x.sentence, x.stars])), new Map(up.rows.map(x => [x.unit_id, x])),
      undefined, new Set(sp.rows.filter(x => x.gdone).map(x => x.sentence)), groupQuiz(qa.rows).get(lesson.id));
    const u = p.units.find(x => x.id === unitId);
    return Boolean(u && u.locked);
  }

  // Creates the lesson_progress row on first activity; returns true when it was new.
  async function touchLesson(client, uid, lessonId, seconds) {
    const { rows } = await client.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, time_spent_sec) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, lesson_id) DO UPDATE
         SET last_activity_at = now(), time_spent_sec = lesson_progress.time_spent_sec + EXCLUDED.time_spent_sec
       RETURNING (xmax = 0) AS inserted`,
      [uid, lessonId, seconds]
    );
    return rows[0].inserted;
  }

  // A sentence the student found hard goes into (or back to the start of) their review schedule: first review tomorrow.
  // If it was already scheduled it goes back to stage 0 and is never pushed later than it already was.
  async function markWeak(client, uid, lessonId, sentence) {
    await client.query(
      `INSERT INTO review_items (user_id, lesson_id, sentence, stage, due_on)
       VALUES ($1,$2,$3,0,(now() AT TIME ZONE 'UTC')::date + $4::int)
       ON CONFLICT (user_id, lesson_id, sentence) DO UPDATE SET
         stage = 0, weak_count = review_items.weak_count + 1,
         due_on = LEAST(COALESCE(review_items.due_on, EXCLUDED.due_on), EXCLUDED.due_on)`,
      [uid, lessonId, sentence, Review.INTERVALS[0]]);
  }

  /**
   * Called inside a transaction after progress changed. A unit is finished when all its sentences are built, all its
   * grammar gaps answered and its quiz passed; the lesson is finished when every unit is (and, with more than one unit,
   * the final quiz is passed). The teacher's log gets one entry for each, once. `unit` is null after the final quiz.
   */
  async function completionChecks(client, uid, lesson, unit) {
    const { rows } = await client.query('SELECT sentence, stars, grammar_done FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]);
    const qa = await client.query(`SELECT lesson_id, scope, passed FROM quiz_attempts WHERE user_id = $1 AND lesson_id = $2 AND ${PASSED_QUIZ_SQL}`, [uid, lesson.id]);
    const quiz = groupQuiz(qa.rows).get(lesson.id) || { units: new Set(), final: false };
    const solved = new Map(rows.map(x => [x.sentence, x.stars]));
    const answered = new Set(rows.filter(x => x.grammar_done).map(x => x.sentence));
    const isDone = u => u.sentences.every(sn => solved.has(sn.en) && (!sn.gap || answered.has(sn.en))) && quiz.units.has(u.id);
    const allSentences = unitsOf(lesson).flatMap(u => u.sentences);
    const allDone = unitsOf(lesson).every(isDone) && (unitsOf(lesson).length < 2 || quiz.final);
    const unitDone = unit ? isDone(unit) : false;
    let justCompleted = false, unitJustCompleted = false;
    if (unit && unitDone) {
      const already = await client.query(
        "SELECT 1 FROM events WHERE user_id = $1 AND lesson_id = $2 AND type = 'unit_complete' AND data->>'unitId' = $3", [uid, lesson.id, unit.id]);
      if (!already.rowCount) {
        unitJustCompleted = true;
        const ustars = unit.sentences.reduce((a, sn) => a + (solved.get(sn.en) || 0), 0);
        await client.query(
          "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'unit_complete',$3::jsonb)",
          [uid, lesson.id, JSON.stringify({ unit: unit.title, unitId: unit.id, stars: ustars, maxStars: unit.sentences.length * 3 })]);
      }
    }
    if (allDone) {
      const upd = await client.query(
        'UPDATE lesson_progress SET completed_at = now() WHERE user_id = $1 AND lesson_id = $2 AND completed_at IS NULL', [uid, lesson.id]);
      if (upd.rowCount) {
        justCompleted = true;
        const total = allSentences.reduce((a, sn) => a + (solved.get(sn.en) || 0), 0);
        await client.query(
          "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'lesson_complete',$3::jsonb)",
          [uid, lesson.id, JSON.stringify({ stars: total, maxStars: allSentences.length * 3 })]);
      }
    }
    return { allDone, unitDone, justCompleted, unitJustCompleted };
  }

  // Step 1 - learning cards for one unit. Progress only moves forward.
  r.post('/lessons/:slug/units/:unitId/learn', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const unit = unitsOf(lesson).find(u => u.id === req.params.unitId);
    if (!unit) return res.status(404).json({ error: 'This unit no longer exists.' });
    if (await isUnitLocked(pool, uid, lesson, unit.id)) return res.status(403).json({ error: 'Finish the previous unit first.' });
    const index = clampInt(req.body && req.body.index, 0, Math.max(0, unit.sentences.length - 1));
    const seconds = clampInt(req.body && req.body.seconds, 0, 600);
    const done = Boolean(req.body && req.body.done);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (await touchLesson(client, uid, lesson.id, seconds)) await client.query(
        "INSERT INTO events (user_id, lesson_id, type) VALUES ($1,$2,'lesson_start')", [uid, lesson.id]);
      const prev = await client.query(
        'SELECT learned_at FROM unit_progress WHERE user_id = $1 AND lesson_id = $2 AND unit_id = $3 FOR UPDATE', [uid, lesson.id, unit.id]);
      const wasLearned = Boolean(prev.rows[0] && prev.rows[0].learned_at);
      const { rows } = await client.query(
        `INSERT INTO unit_progress (user_id, lesson_id, unit_id, learn_index, learned_at)
         VALUES ($1,$2,$3,$4, CASE WHEN $5 THEN now() END)
         ON CONFLICT (user_id, lesson_id, unit_id) DO UPDATE SET
           learn_index = GREATEST(unit_progress.learn_index, EXCLUDED.learn_index),
           learned_at = COALESCE(unit_progress.learned_at, EXCLUDED.learned_at)
         RETURNING learned_at`,
        [uid, lesson.id, unit.id, index, done]
      );
      if (done && !wasLearned) await client.query(
        "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'cards_done',$3::jsonb)",
        [uid, lesson.id, JSON.stringify({ unit: unit.title, unitId: unit.id, cards: unit.sentences.length })]);
      await client.query('COMMIT');
      res.json({ learned: Boolean(rows[0].learned_at) });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // Step 2 - a sentence was built correctly. Best result is kept; progress never goes back.
  r.post('/lessons/:slug/solve', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const b = req.body || {};
    const sentence = String(b.sentence || '').slice(0, 400); // lessons cap sentences at 200 characters
    const unit = unitsOf(lesson).find(u => u.sentences.some(s => s.en === sentence));
    if (!unit) return res.status(400).json({ error: 'This sentence is not in the lesson any more.' });
    const mistakes = clampInt(b.mistakes, 0, 999);
    const hints = clampInt(b.hints, 0, 999);
    const seconds = clampInt(b.seconds, 0, 600);
    const cid = typeof b.cid === 'string' ? b.cid.slice(0, 64) : null;
    const stars = starsFor(mistakes, hints);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uid + lesson.id]);
      if (cid) {
        const dup = await client.query(
          "SELECT 1 FROM events WHERE user_id = $1 AND type = 'sentence_solved' AND data ? 'cid' AND data->>'cid' = $2", [uid, cid]);
        if (dup.rowCount) { await client.query('ROLLBACK'); return res.json({ duplicate: true }); }
      }
      if (await isUnitLocked(client, uid, lesson, unit.id)) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Finish the previous unit first.' }); }
      if (await touchLesson(client, uid, lesson.id, seconds)) await client.query(
        "INSERT INTO events (user_id, lesson_id, type) VALUES ($1,$2,'lesson_start')", [uid, lesson.id]);

      // Practising again is practice only: the stars from the first time stay exactly as they were
      // (no more, no less), so there is never any "extra". Only the practice counters are updated.
      const prevRow = await client.query(
        'SELECT stars FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3', [uid, lesson.id, sentence]);
      const replay = prevRow.rowCount > 0;
      const before = replay ? prevRow.rows[0].stars : 0;
      const extra = 0;
      const { rows: sp } = await client.query(
        `INSERT INTO sentence_progress (user_id, lesson_id, sentence, stars, base_stars, best_mistakes, best_hints, total_mistakes, total_hints)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$5,$6)
         ON CONFLICT (user_id, lesson_id, sentence) DO UPDATE SET
           stars = sentence_progress.stars,
           best_mistakes = LEAST(sentence_progress.best_mistakes, EXCLUDED.best_mistakes),
           best_hints = LEAST(sentence_progress.best_hints, EXCLUDED.best_hints),
           times_solved = sentence_progress.times_solved + 1,
           total_mistakes = sentence_progress.total_mistakes + EXCLUDED.total_mistakes,
           total_hints = sentence_progress.total_hints + EXCLUDED.total_hints,
           last_solved_at = now()
         RETURNING stars`,
        [uid, lesson.id, sentence, stars, mistakes, hints]
      );
      await client.query(
        "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'sentence_solved',$3::jsonb)",
        [uid, lesson.id, JSON.stringify({ sentence, unit: unit.title, unitId: unit.id, stars, mistakes, hints, seconds,
          ...(replay ? { replay: true } : {}), ...(cid ? { cid } : {}) })]);
      if (!replay && (mistakes > 0 || hints > 0)) await markWeak(client, uid, lesson.id, sentence); // first try with mistakes or hints = weak

      const done = await completionChecks(client, uid, lesson, unit);
      await client.query('COMMIT');
      res.json({ stars, best: sp[0].stars, extra, replay, completed: done.allDone, justCompleted: done.justCompleted, unitCompleted: done.unitDone, unitJustCompleted: done.unitJustCompleted });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // Step 3 - a grammar gap was answered correctly (the sentence must have been built first).
  r.post('/lessons/:slug/grammar', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const b = req.body || {};
    const sentence = String(b.sentence || '').slice(0, 400);
    const unit = unitsOf(lesson).find(u => u.sentences.some(sn => sn.en === sentence && sn.gap));
    if (!unit) return res.status(400).json({ error: 'This sentence has no grammar gap.' });
    const mistakes = clampInt(b.mistakes, 0, 999);
    const seconds = clampInt(b.seconds, 0, 600);
    const cid = typeof b.cid === 'string' ? b.cid.slice(0, 64) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uid + lesson.id]);
      if (cid) {
        const dup = await client.query(
          "SELECT 1 FROM events WHERE user_id = $1 AND type = 'grammar_solved' AND data ? 'cid' AND data->>'cid' = $2", [uid, cid]);
        if (dup.rowCount) { await client.query('ROLLBACK'); return res.json({ duplicate: true }); }
      }
      if (await isUnitLocked(client, uid, lesson, unit.id)) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Finish the previous unit first.' }); }
      const prev = await client.query(
        'SELECT grammar_done FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3 FOR UPDATE', [uid, lesson.id, sentence]);
      if (!prev.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Build this sentence first.' }); }
      const first = !prev.rows[0].grammar_done;
      await touchLesson(client, uid, lesson.id, seconds);
      await client.query(
        'UPDATE sentence_progress SET grammar_done = TRUE, grammar_mistakes = grammar_mistakes + $4 WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3',
        [uid, lesson.id, sentence, first ? mistakes : 0]);
      await client.query(
        "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'grammar_solved',$3::jsonb)",
        [uid, lesson.id, JSON.stringify({ sentence, unit: unit.title, unitId: unit.id, mistakes, ...(first ? {} : { replay: true }), ...(cid ? { cid } : {}) })]);
      if (first && mistakes > 0) await markWeak(client, uid, lesson.id, sentence); // a wrong grammar word = weak
      const done = await completionChecks(client, uid, lesson, unit);
      await client.query('COMMIT');
      res.json({ completed: done.allDone, justCompleted: done.justCompleted, unitCompleted: done.unitDone, unitJustCompleted: done.unitJustCompleted });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // Speaking check on a learning card. The phone sends the text(s) the speech recognition heard (up to 3 tries); the server scores them itself with the
  // same code the phone used, keeps the best score, the number of tries and the last text heard for the teacher. It never changes progress or stars.
  r.post('/lessons/:slug/speak', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const b = req.body || {};
    const sentence = String(b.sentence || '').slice(0, 400);
    const unit = unitsOf(lesson).find(u => u.sentences.some(sn => sn.en === sentence));
    if (!unit) return res.status(400).json({ error: 'This sentence is not in the lesson any more.' });
    const heard = (Array.isArray(b.heard) ? b.heard : []).filter(x => typeof x === 'string').slice(0, Speak.MAX_TRIES).map(x => x.slice(0, 300));
    if (!heard.length) return res.status(400).json({ error: 'Nothing was heard.' });
    const seconds = clampInt(b.seconds, 0, 600);
    const cid = typeof b.cid === 'string' ? b.cid.slice(0, 64) : null;
    // every try is scored; the best one counts, and the try that was best is the text the teacher reads
    const scored = heard.map(text => ({ text, ...Speak.check(sentence, text) }));
    const top = scored.reduce((a, x) => (x.percent > a.percent ? x : a), scored[0]);
    const passed = scored.some(x => x.pass);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uid + lesson.id]);
      if (cid) {
        const dup = await client.query(
          "SELECT 1 FROM events WHERE user_id = $1 AND type = 'speak_checked' AND data ? 'cid' AND data->>'cid' = $2", [uid, cid]);
        if (dup.rowCount) { await client.query('ROLLBACK'); return res.json({ duplicate: true }); }
      }
      const { rows: [row] } = await client.query(
        `INSERT INTO speaking_scores (user_id, lesson_id, sentence, best_score, last_score, tries, passed, heard)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7)
         ON CONFLICT (user_id, lesson_id, sentence) DO UPDATE SET
           heard = CASE WHEN EXCLUDED.best_score >= speaking_scores.best_score THEN EXCLUDED.heard ELSE speaking_scores.heard END,
           best_score = GREATEST(speaking_scores.best_score, EXCLUDED.best_score), last_score = EXCLUDED.last_score,
           tries = speaking_scores.tries + EXCLUDED.tries, checks = speaking_scores.checks + 1,
           passed = speaking_scores.passed OR EXCLUDED.passed, updated_at = now()
         RETURNING best_score, tries, passed`,
        [uid, lesson.id, sentence, top.percent, heard.length, passed, top.text]);
      await client.query(
        "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'speak_checked',$3::jsonb)",
        [uid, lesson.id, JSON.stringify({ sentence, unit: unit.title, unitId: unit.id, score: top.percent, tries: heard.length, passed, heard: top.text, seconds, ...(cid ? { cid } : {}) })]);
      await client.query('COMMIT');
      res.json({ score: top.percent, passed, best: row.best_score, tries: row.tries });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // Daily review: one answered question. Right = first try, no hints. A right answer moves the sentence to its next interval (1, 3, 7, 14, 30 days),
  // a wrong one sends it back to 1 day. An answer given before the sentence is due can only send it back, never move it forward. Stars never change.
  r.post('/review/answer', wrap(async (req, res) => {
    const uid = req.user.id;
    const b = req.body || {};
    const lesson = await loadVisibleLesson(uid, String(b.slug || '').slice(0, 80), { ignoreLock: true }); // reviews of earlier work are never blocked
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const sentence = String(b.sentence || '').slice(0, 400);
    const unit = unitsOf(lesson).find(u => u.sentences.some(sn => sn.en === sentence));
    if (!unit) return res.status(400).json({ error: 'This sentence is not in the lesson any more.' });
    const kind = b.kind === 'grammar' ? 'grammar' : 'build';
    if (kind === 'grammar' && !unit.sentences.some(sn => sn.en === sentence && sn.gap)) return res.status(400).json({ error: 'This sentence has no grammar gap.' });
    const mistakes = clampInt(b.mistakes, 0, 999);
    const hints = kind === 'build' ? clampInt(b.hints, 0, 999) : 0;
    const seconds = clampInt(b.seconds, 0, 600);
    const cid = typeof b.cid === 'string' ? b.cid.slice(0, 64) : null;
    const correct = Review.isCorrect(mistakes, hints);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uid + lesson.id]);
      if (cid) {
        const dup = await client.query(
          "SELECT 1 FROM events WHERE user_id = $1 AND type = 'review_answered' AND data ? 'cid' AND data->>'cid' = $2", [uid, cid]);
        if (dup.rowCount) { await client.query('ROLLBACK'); return res.json({ duplicate: true }); }
      }
      const { rows: [row] } = await client.query(
        `SELECT stage, due_on IS NOT NULL AND due_on <= (now() AT TIME ZONE 'UTC')::date AS due FROM review_items
         WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3 FOR UPDATE`, [uid, lesson.id, sentence]);
      if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'This sentence is not in your review list.' }); }
      const early = correct && !row.due; // not due yet and right: nothing moves (it was already reviewed)
      const next = early ? { stage: row.stage, days: null, same: true } : Review.afterReview(row.stage, correct);
      if (!early) await client.query(
        `UPDATE review_items SET stage = $4, due_on = CASE WHEN $5::int IS NULL THEN NULL ELSE (now() AT TIME ZONE 'UTC')::date + $5::int END,
           review_count = review_count + 1, wrong_count = wrong_count + $6, last_reviewed_at = now()
         WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3`,
        [uid, lesson.id, sentence, next.stage, next.days, correct ? 0 : 1]);
      await client.query(
        "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'review_answered',$3::jsonb)",
        [uid, lesson.id, JSON.stringify({ sentence, kind, correct, mistakes, ...(kind === 'build' ? { hints } : {}), seconds, stage: next.stage,
          ...(early ? { early: true } : { nextInDays: next.days }), ...(cid ? { cid } : {}) })]);
      await client.query('COMMIT');
      res.json({ correct, stage: next.stage, nextInDays: early ? null : next.days, early });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // Optional step between Build and Grammar - the student sees only the Arabic and builds the English sentence. The result of the first try is kept
  // for the teacher (mistakes, hints, seconds); later tries are practice. It gives no stars and is not needed to finish a unit.
  r.post('/lessons/:slug/arbuild', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const b = req.body || {};
    const sentence = String(b.sentence || '').slice(0, 400);
    const unit = lesson.ar_step === false ? null : unitsOf(lesson).find(u => u.sentences.some(sn => sn.en === sentence && sn.ar));
    if (!unit) return res.status(400).json({ error: 'This sentence has no Arabic step.' });
    const mistakes = clampInt(b.mistakes, 0, 999);
    const hints = clampInt(b.hints, 0, 999);
    const seconds = clampInt(b.seconds, 0, 600);
    const cid = typeof b.cid === 'string' ? b.cid.slice(0, 64) : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uid + lesson.id]);
      if (cid) {
        const dup = await client.query(
          "SELECT 1 FROM events WHERE user_id = $1 AND type = 'arbuild_solved' AND data ? 'cid' AND data->>'cid' = $2", [uid, cid]);
        if (dup.rowCount) { await client.query('ROLLBACK'); return res.json({ duplicate: true }); }
      }
      if (await isUnitLocked(client, uid, lesson, unit.id)) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Finish the previous unit first.' }); }
      const prev = await client.query(
        'SELECT arb_done FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3 FOR UPDATE', [uid, lesson.id, sentence]);
      if (!prev.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Build this sentence first.' }); }
      const first = !prev.rows[0].arb_done;
      await touchLesson(client, uid, lesson.id, seconds);
      await client.query(
        `UPDATE sentence_progress SET arb_done = TRUE, arb_times = arb_times + 1,
           arb_mistakes = CASE WHEN $4 THEN $5 ELSE arb_mistakes END, arb_hints = CASE WHEN $4 THEN $6 ELSE arb_hints END,
           arb_seconds = CASE WHEN $4 THEN $7 ELSE arb_seconds END
         WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3`,
        [uid, lesson.id, sentence, first, mistakes, hints, seconds]);
      await client.query(
        "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'arbuild_solved',$3::jsonb)",
        [uid, lesson.id, JSON.stringify({ sentence, unit: unit.title, unitId: unit.id, mistakes, hints, seconds, ...(first ? {} : { replay: true }), ...(cid ? { cid } : {}) })]);
      if (first && (mistakes > 0 || hints > 0)) await markWeak(client, uid, lesson.id, sentence);
      await client.query('COMMIT');
      res.json({ first });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // Step 4 - a quiz attempt. `scope` is 'unit:<unitId>' (the mini quiz at the end of a unit) or 'final' (the whole lesson).
  // The phone only sends the seed it used and the answers it chose; the server builds the same quiz again and marks it
  // itself, so a pass can never be made up. Passing is what finishes the unit / lesson; failing just means "try again".
  r.post('/lessons/:slug/quiz', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const b = req.body || {};
    const scope = String(b.scope || '').slice(0, 80);
    const units = unitsOf(lesson);
    const everything = units.flatMap(u => u.sentences);
    let unit = null;
    if (scope === 'final') {
      if (units.length < 2) return res.status(400).json({ error: 'This lesson has no final quiz.' });
    } else if (scope.startsWith('unit:')) {
      unit = units.find(u => u.id === scope.slice(5));
      if (!unit) return res.status(404).json({ error: 'This unit no longer exists.' });
    } else return res.status(400).json({ error: 'Unknown quiz.' });
    const seed = clampInt(b.seed, 0, 2147483646);
    const seconds = clampInt(b.seconds, 0, 3600);
    const cid = typeof b.cid === 'string' ? b.cid.slice(0, 64) : null;
    const questions = Quiz.build({ sentences: unit ? unit.sentences : everything, context: everything, seed, noListen: Boolean(b.noListen) });
    const picks = Array.isArray(b.picks) ? b.picks.slice(0, 50).map(x => (Number.isInteger(x) ? x : -1)) : [];
    if (!questions.length || picks.length !== questions.length) return res.status(400).json({ error: 'Answer every question.' });
    const graded = Quiz.grade(questions, picks);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [uid + lesson.id]);
      if (cid) {
        const dup = await client.query('SELECT 1 FROM quiz_attempts WHERE user_id = $1 AND cid = $2', [uid, cid]);
        if (dup.rowCount) { await client.query('ROLLBACK'); return res.json({ duplicate: true }); }
      }
      // The quiz is the last step: everything must be built (and the grammar answered) first; the final quiz needs every unit finished.
      const sp = await client.query('SELECT sentence, stars, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]);
      const up = await client.query('SELECT * FROM unit_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]);
      const qa = await client.query(`SELECT lesson_id, scope, passed FROM quiz_attempts WHERE user_id = $1 AND lesson_id = $2 AND ${PASSED_QUIZ_SQL}`, [uid, lesson.id]);
      const state = summarize(lesson, null, new Map(sp.rows.map(x => [x.sentence, x.stars])), new Map(up.rows.map(x => [x.unit_id, x])),
        undefined, new Set(sp.rows.filter(x => x.gdone).map(x => x.sentence)), groupQuiz(qa.rows).get(lesson.id));
      if (unit) {
        const u = state.units.find(x => x.id === unit.id);
        if (u.locked) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Finish the previous unit first.' }); }
        if (!u.quizReady && !u.quizPassed) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Build the sentences and finish the grammar first.' }); }
      } else if (!state.units.every(u => u.completed)) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'Finish every unit first.' });
      }
      if (await touchLesson(client, uid, lesson.id, seconds)) await client.query(
        "INSERT INTO events (user_id, lesson_id, type) VALUES ($1,$2,'lesson_start')", [uid, lesson.id]);
      const details = questions.map((q, i) => ({
        sentence: q.sentence, type: q.type, prompt: q.prompt, options: q.options, answer: q.answer, picked: graded.results[i].picked, correct: graded.results[i].correct,
      }));
      await client.query(
        'INSERT INTO quiz_attempts (user_id, lesson_id, scope, score, total, passed, details, seconds, cid) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)',
        [uid, lesson.id, scope, graded.score, graded.total, graded.passed, JSON.stringify(details), seconds, cid]);
      await client.query(
        "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'quiz_attempt',$3::jsonb)",
        [uid, lesson.id, JSON.stringify({ scope, ...(unit ? { unit: unit.title, unitId: unit.id } : {}), score: graded.score, total: graded.total, needed: graded.needed, passed: graded.passed, seconds })]);
      // every sentence the student got wrong in this quiz is weak
      for (const d of new Set(details.filter(x => !x.correct && typeof x.sentence === 'string').map(x => x.sentence))) await markWeak(client, uid, lesson.id, d);
      const done = await completionChecks(client, uid, lesson, unit);
      await client.query('COMMIT');
      res.json({
        score: graded.score, total: graded.total, needed: graded.needed, passed: graded.passed,
        results: graded.results.map(x => ({ correct: x.correct, answer: x.answer })),
        completed: done.allDone, justCompleted: done.justCompleted, unitCompleted: done.unitDone, unitJustCompleted: done.unitJustCompleted,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  // "Start over": the student replays a unit (or the whole lesson) from the first sentence. Nothing is
  // reset - saved progress, stars and unlocked units stay. This only leaves a note for the teacher.
  r.post('/lessons/:slug/restart', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const unitId = req.body && typeof req.body.unitId === 'string' ? req.body.unitId : null;
    const unit = unitId ? unitsOf(lesson).find(u => u.id === unitId) : null;
    if (unitId && !unit) return res.status(404).json({ error: 'This unit no longer exists.' });
    await logQuietly(uid, lesson.id, 'restart', unit ? { unit: unit.title, unitId: unit.id } : {});
    res.status(204).end();
  }));

  return r;
};
