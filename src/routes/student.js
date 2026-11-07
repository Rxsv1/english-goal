'use strict';

const crypto = require('crypto');
const express = require('express');
const auth = require('../auth');
const { validateUser } = require('../validate');
const { starsFor, summarize, unitsOf, groupSolved, groupGrammar, groupUnits, streak, EXTRA_SQL, VISIBLE_SQL } = require('../progress');

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
                  WHERE user_id = $1 AND type IN ('sentence_solved','cards_done','lesson_start') ORDER BY d DESC LIMIT 400`, [uid]),
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
    const [stats, lessons, lp, sp, up] = await Promise.all([
      loadStats(uid),
      pool.query(`SELECT l.* FROM lessons l WHERE ${VISIBLE_SQL} ORDER BY l.position, l.title`, [uid]),
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1`, [uid]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1', [uid]),
    ]);
    const lpMap = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const solved = groupSolved(sp.rows);
    const extras = groupSolved(sp.rows, 'extra');
    const grammars = groupGrammar(sp.rows);
    const unitMap = groupUnits(up.rows);
    const iso = d => (d ? new Date(d).toISOString() : null);
    res.set('Cache-Control', 'no-store');
    res.json({
      user: publicUser(req.user),
      stats,
      lessons: lessons.rows.map(l => {
        const s = solved.get(l.id) || new Map(), x = extras.get(l.id) || new Map(), g = grammars.get(l.id) || new Set();
        const p = lpMap.get(l.id);
        return {
          slug: l.slug,
          title: l.title,
          level: l.level,
          description: l.description,
          emoji: l.emoji,
          assigned: l.visibility === 'assigned',
          units: unitsOf(l).map(u => ({
            id: u.id,
            title: u.title,
            sentences: u.sentences.map(sn => ({ en: sn.en, stars: s.get(sn.en) || 0, extra: x.get(sn.en) || 0, ...(sn.gap ? { gap: sn.gap, gdone: g.has(sn.en) } : {}) })),
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
    const [lessons, lp, sp, up] = await Promise.all([
      pool.query(`SELECT l.* FROM lessons l WHERE ${VISIBLE_SQL} ORDER BY l.position, l.title`, [uid]),
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1`, [uid]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1', [uid]),
    ]);
    const lpMap = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const solved = groupSolved(sp.rows);
    const extras = groupSolved(sp.rows, 'extra');
    const grammars = groupGrammar(sp.rows);
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
        progress: summarize(l, lpMap.get(l.id), solved.get(l.id), unitMap.get(l.id), extras.get(l.id), grammars.get(l.id)),
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
      pool.query(`SELECT sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2`, [uid, lesson.id]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
    ]);
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
          sentences: u.sentences.map(s => ({ en: s.en, stars: solved.get(s.en) || 0, extra: extras.get(s.en) || 0, ...(s.gap ? { gap: s.gap, gdone: grammar.has(s.en) } : {}) })),
        })),
      },
      progress: summarize(lesson, lp.rows[0], solved, unitRows, extras, grammar),
    });
  }));

  // True when this unit is still locked for the student (a brand-new unit behind an unfinished one).
  async function isUnitLocked(db, uid, lesson, unitId) {
    const [sp, up] = await Promise.all([
      db.query('SELECT sentence, stars, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
      db.query('SELECT * FROM unit_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]),
    ]);
    const p = summarize(lesson, null, new Map(sp.rows.map(x => [x.sentence, x.stars])), new Map(up.rows.map(x => [x.unit_id, x])),
      undefined, new Set(sp.rows.filter(x => x.gdone).map(x => x.sentence)));
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

  /**
   * Called inside a transaction after progress changed. A unit is finished when all its sentences are built and all its
   * grammar gaps answered; the lesson is finished when every unit is. The teacher's log gets one entry for each, once.
   */
  async function completionChecks(client, uid, lesson, unit) {
    const { rows } = await client.query(
      'SELECT sentence, stars, grammar_done FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2', [uid, lesson.id]);
    const solved = new Map(rows.map(x => [x.sentence, x.stars]));
    const answered = new Set(rows.filter(x => x.grammar_done).map(x => x.sentence));
    const isDone = u => u.sentences.every(sn => solved.has(sn.en) && (!sn.gap || answered.has(sn.en)));
    const allSentences = unitsOf(lesson).flatMap(u => u.sentences);
    const allDone = unitsOf(lesson).every(isDone);
    const unitDone = isDone(unit);
    let justCompleted = false, unitJustCompleted = false;
    if (unitDone) {
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

      // Practising again never lowers anything. A better result raises the best score, and the
      // improvement is counted as "extra" on top of what the student first achieved.
      const prevRow = await client.query(
        'SELECT stars FROM sentence_progress WHERE user_id = $1 AND lesson_id = $2 AND sentence = $3', [uid, lesson.id, sentence]);
      const replay = prevRow.rowCount > 0;
      const before = replay ? prevRow.rows[0].stars : 0;
      const extra = replay ? Math.max(0, stars - before) : 0;
      const { rows: sp } = await client.query(
        `INSERT INTO sentence_progress (user_id, lesson_id, sentence, stars, base_stars, best_mistakes, best_hints, total_mistakes, total_hints)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$5,$6)
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
        [uid, lesson.id, JSON.stringify({ sentence, unit: unit.title, unitId: unit.id, stars, mistakes, hints, seconds,
          ...(replay ? { replay: true, extra } : {}), ...(cid ? { cid } : {}) })]);

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
