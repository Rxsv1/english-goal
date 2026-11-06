'use strict';

const crypto = require('crypto');
const express = require('express');
const auth = require('../auth');
const { validateUser } = require('../validate');
const { starsFor, summarize, unitsOf, groupSolved, groupUnits, streak, VISIBLE_SQL } = require('../progress');

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

  const publicUser = u => ({ id: u.id, name: u.name, email: u.email, createdAt: u.created_at });

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
    await logEvent(id, null, 'signup');
    auth.setUserCookie(req, res, id);
    res.status(201).json({ user: { id, name: user.name, email: user.email } });
  }));

  r.post('/auth/login', wrap(async (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const key = req.ip + '|' + email;
    if (loginLimit.hit(key)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const u = rows[0];
    if (!u || !(await auth.verifyPassword(password, u.password_hash)))
      return res.status(401).json({ error: 'Wrong email or password.' });
    if (u.disabled) return res.status(403).json({ error: 'Your account has been disabled. Please contact your teacher.' });
    loginLimit.clear(key);
    await pool.query('UPDATE users SET last_seen_at = now() WHERE id = $1', [u.id]);
    await logEvent(u.id, null, 'login');
    auth.setUserCookie(req, res, u.id);
    res.json({ user: publicUser(u) });
  }));

  r.post('/auth/logout', (req, res) => {
    auth.clearUserCookie(req, res);
    res.status(204).end();
  });

  /* ================= Everything below needs a logged-in student ================= */
  r.use(requireUser);

  r.get('/me', wrap(async (req, res) => {
    const uid = req.user.id;
    const [sp, lp, days] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS solved, COALESCE(SUM(stars),0)::int AS stars FROM sentence_progress WHERE user_id = $1', [uid]),
      pool.query('SELECT COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed, COALESCE(SUM(time_spent_sec),0)::int AS time FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM events
                  WHERE user_id = $1 AND type IN ('sentence_solved','cards_done','lesson_start') ORDER BY d DESC LIMIT 400`, [uid]),
    ]);
    res.json({
      user: publicUser(req.user),
      stats: {
        sentencesSolved: sp.rows[0].solved,
        stars: sp.rows[0].stars,
        lessonsCompleted: lp.rows[0].completed,
        timeSpent: lp.rows[0].time,
        streak: streak(days.rows.map(x => x.d)),
      },
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
    const [lessons, lp, sp, up] = await Promise.all([
      pool.query(`SELECT l.* FROM lessons l WHERE ${VISIBLE_SQL} ORDER BY l.position, l.title`, [uid]),
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query('SELECT lesson_id, sentence, stars FROM sentence_progress WHERE user_id = $1', [uid]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1', [uid]),
    ]);
    const lpMap = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const solved = groupSolved(sp.rows);
    const unitMap = groupUnits(up.rows);
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
        progress: summarize(l, lpMap.get(l.id), solved.get(l.id), unitMap.get(l.id)),
      })),
    });
  }));

  async function loadVisibleLesson(uid, slug) {
    const { rows } = await pool.query(`SELECT l.* FROM lessons l WHERE l.slug = $2 AND ${VISIBLE_SQL}`, [uid, slug]);
    return rows[0] || null;
  }

  r.get('/lessons/:slug', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const [lp, sp, up] = await Promise.all([
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
      pool.query('SELECT sentence, stars FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
    ]);
    const solved = new Map(sp.rows.map(x => [x.sentence, x.stars]));
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
          sentences: u.sentences.map(s => ({ en: s.en, stars: solved.get(s.en) || 0 })),
        })),
      },
      progress: summarize(lesson, lp.rows[0], solved, unitRows),
    });
  }));

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

  // Step 1 - learning cards for one unit. Progress only moves forward.
  r.post('/lessons/:slug/units/:unitId/learn', wrap(async (req, res) => {
    const uid = req.user.id;
    const lesson = await loadVisibleLesson(uid, req.params.slug);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
    const unit = unitsOf(lesson).find(u => u.id === req.params.unitId);
    if (!unit) return res.status(404).json({ error: 'This unit no longer exists.' });
    const index = clampInt(req.body && req.body.index, 0, unit.sentences.length - 1);
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
    const sentence = String(b.sentence || '');
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
      if (await touchLesson(client, uid, lesson.id, seconds)) await client.query(
        "INSERT INTO events (user_id, lesson_id, type) VALUES ($1,$2,'lesson_start')", [uid, lesson.id]);
      const { rows: sp } = await client.query(
        `INSERT INTO sentence_progress (user_id, lesson_id, sentence, stars, best_mistakes, best_hints, total_mistakes, total_hints)
         VALUES ($1,$2,$3,$4,$5,$6,$5,$6)
         ON CONFLICT (user_id, lesson_id, sentence) DO UPDATE SET
           stars = GREATEST(sentence_progress.stars, EXCLUDED.stars),
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
        [uid, lesson.id, JSON.stringify({ sentence, unit: unit.title, unitId: unit.id, stars, mistakes, hints, seconds, ...(cid ? { cid } : {}) })]);

      // Lesson complete when every current sentence is solved.
      const { rows: solvedRows } = await client.query(
        'SELECT sentence, stars FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]);
      const solved = new Map(solvedRows.map(x => [x.sentence, x.stars]));
      const allDone = lesson.sentences.every(s => solved.has(s.en));
      const unitDone = unit.sentences.every(s => solved.has(s.en));
      let justCompleted = false, unitJustCompleted = false;
      if (unitDone) {
        const already = await client.query(
          "SELECT 1 FROM events WHERE user_id = $1 AND lesson_id = $2 AND type = 'unit_complete' AND data->>'unitId' = $3", [uid, lesson.id, unit.id]);
        if (!already.rowCount) {
          unitJustCompleted = true;
          const ustars = unit.sentences.reduce((a, s) => a + (solved.get(s.en) || 0), 0);
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
          const total = [...solved.values()].reduce((a, x) => a + x, 0);
          await client.query(
            "INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'lesson_complete',$3::jsonb)",
            [uid, lesson.id, JSON.stringify({ stars: total, maxStars: lesson.sentences.length * 3 })]);
        }
      }
      await client.query('COMMIT');
      res.json({ stars, best: sp[0].stars, completed: allDone, justCompleted, unitCompleted: unitDone, unitJustCompleted });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }));

  return r;
};
