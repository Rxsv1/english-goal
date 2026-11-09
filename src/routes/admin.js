'use strict';

const crypto = require('crypto');
const express = require('express');
const auth = require('../auth');
const { validateLesson, validateUser, LEVELS } = require('../validate');
const { summarize, unitsOf, groupSolved, groupGrammar, groupUnits, groupQuiz, PASSED_QUIZ_SQL, streak, STREAK_TYPES_SQL, EXTRA_SQL } = require('../progress');
const { slugify } = require('../validate');
const Words = require('../../public/words-core');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// A list of ids sent by the dashboard: strings only, and not absurdly many.
const isIdList = v => Array.isArray(v) && v.length <= 5000 && v.every(x => typeof x === 'string' && x.length <= 64);

const lessonOut = (l, extra = {}) => ({
  id: l.id,
  slug: l.slug,
  title: l.title,
  level: l.level,
  description: l.description,
  emoji: l.emoji,
  published: l.published,
  visibility: l.visibility,
  arStep: l.ar_step !== false,
  wordsCount: l.words && typeof l.words === 'object' ? Object.keys(l.words).length : 0,
  position: l.position,
  count: l.sentences.length,
  unitsCount: unitsOf(l).length,
  updatedAt: l.updated_at,
  ...extra,
});

const userOut = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  disabled: u.disabled,
  createdAt: u.created_at,
  lastSeenAt: u.last_seen_at,
  arabic: Boolean(u.arabic_enabled),
});

module.exports = function adminRoutes(pool) {
  const r = express.Router();
  const loginLimit = auth.limiter(10, 15 * 60 * 1000);

  r.post('/login', (req, res) => {
    if (!auth.ADMIN_PASSWORD) return res.status(503).json({ error: 'Admin is disabled. Set the ADMIN_PASSWORD environment variable.' });
    if (loginLimit.hit(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    const password = req.body && req.body.password;
    if (typeof password !== 'string' || !auth.safeEqual(password, auth.ADMIN_PASSWORD))
      return res.status(401).json({ error: 'Wrong password.' });
    loginLimit.clear(req.ip);
    res.json({ token: auth.adminToken() });
  });

  r.use(auth.requireAdmin);

  /* ================= Overview ================= */
  r.get('/overview', wrap(async (req, res) => {
    const [counts, week, recent] = await Promise.all([
      pool.query(`SELECT
          (SELECT COUNT(*) FROM users)::int AS users,
          (SELECT COUNT(*) FROM users WHERE last_seen_at > now() - interval '1 day')::int AS active_today,
          (SELECT COUNT(*) FROM users WHERE last_seen_at > now() - interval '7 days')::int AS active_week,
          (SELECT COUNT(*) FROM lessons)::int AS lessons`),
      pool.query(`SELECT
          COUNT(*) FILTER (WHERE type = 'sentence_solved')::int AS solved,
          COUNT(*) FILTER (WHERE type = 'lesson_complete')::int AS completed,
          COUNT(*) FILTER (WHERE type = 'signup')::int AS signups
        FROM events WHERE created_at > now() - interval '7 days'`),
      recentEvents({ limit: 40 }),
    ]);
    const daily = await pool.query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS day,
             COUNT(e.id) FILTER (WHERE e.type = 'sentence_solved')::int AS solved,
             COUNT(DISTINCT e.user_id)::int AS learners
      FROM generate_series((now() AT TIME ZONE 'UTC')::date - 13, (now() AT TIME ZONE 'UTC')::date, interval '1 day') d
      LEFT JOIN events e ON (e.created_at AT TIME ZONE 'UTC')::date = d
        AND e.type IN ('sentence_solved', 'cards_done', 'lesson_start')
      GROUP BY d ORDER BY d`);
    const c = counts.rows[0], w = week.rows[0];
    res.json({
      stats: {
        users: c.users, activeToday: c.active_today, activeWeek: c.active_week, lessons: c.lessons,
        solvedWeek: w.solved, completedWeek: w.completed, signupsWeek: w.signups,
      },
      daily: daily.rows,
      recent,
    });
  }));

  async function recentEvents({ userId = null, lessonId = null, limit = 50 } = {}) {
    const { rows } = await pool.query(
      `SELECT e.id, e.type, e.data, e.created_at, u.id AS user_id, u.name AS user_name, l.title AS lesson_title, l.emoji AS lesson_emoji
       FROM events e JOIN users u ON u.id = e.user_id LEFT JOIN lessons l ON l.id = e.lesson_id
       WHERE ($1::text IS NULL OR e.user_id = $1) AND ($2::text IS NULL OR e.lesson_id = $2)
       ORDER BY e.created_at DESC, e.id DESC LIMIT $3`, // events saved together share a timestamp; the id keeps their order stable
      [userId, lessonId, limit]
    );
    return rows.map(e => {
      const d = { ...e.data };
      delete d.cid;
      return { id: e.id, type: e.type, data: d, at: e.created_at, userId: e.user_id, userName: e.user_name, lessonTitle: e.lesson_title, lessonEmoji: e.lesson_emoji };
    });
  }

  r.get('/activity', wrap(async (req, res) => {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    res.json({ events: await recentEvents({ userId: req.query.user || null, lessonId: req.query.lesson || null, limit }) });
  }));

  /* ================= Students ================= */
  const USER_STATS_SQL = `
    SELECT u.*, COALESCE(sp.solved,0)::int AS solved, COALESCE(sp.stars,0)::int AS stars, COALESCE(sp.extra,0)::int AS extra,
           COALESCE(lp.completed,0)::int AS lessons_completed, COALESCE(lp.started,0)::int AS lessons_started,
           COALESCE(lp.time,0)::int AS time_spent
    FROM users u
    LEFT JOIN (SELECT user_id, COUNT(*) AS solved, SUM(stars) AS stars, SUM(${EXTRA_SQL}) AS extra FROM sentence_progress GROUP BY user_id) sp ON sp.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed, COUNT(*) AS started,
                      SUM(time_spent_sec) AS time FROM lesson_progress GROUP BY user_id) lp ON lp.user_id = u.id`;

  const statsOut = u => ({
    sentencesSolved: u.solved, stars: u.stars, extraStars: u.extra, lessonsCompleted: u.lessons_completed,
    lessonsStarted: u.lessons_started, timeSpent: u.time_spent,
  });

  // The student list: besides the totals, when each student was last active, which lesson they are on, and their quiz results.
  r.get('/users', wrap(async (req, res) => {
    const [{ rows }, last, current, quiz, lastQuiz] = await Promise.all([
      pool.query(`${USER_STATS_SQL} ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC`),
      pool.query('SELECT user_id, MAX(last_activity_at) AS at FROM lesson_progress GROUP BY user_id'),
      // the lesson they worked on most recently that is not finished (or, if all are finished, the latest one)
      pool.query(`SELECT DISTINCT ON (lp.user_id) lp.user_id, l.title, l.emoji, lp.completed_at
                  FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id
                  ORDER BY lp.user_id, (lp.completed_at IS NULL) DESC, lp.last_activity_at DESC`),
      pool.query(`SELECT user_id, COUNT(*) FILTER (WHERE passed AND NOT grandfathered)::int AS passed_n, COUNT(*)::int AS attempts
                  FROM quiz_attempts WHERE NOT grandfathered GROUP BY user_id`),
      pool.query(`SELECT DISTINCT ON (user_id) user_id, score, total, passed, created_at FROM quiz_attempts
                  WHERE NOT grandfathered ORDER BY user_id, created_at DESC`),
    ]);
    const lastBy = new Map(last.rows.map(x => [x.user_id, x.at]));
    const curBy = new Map(current.rows.map(x => [x.user_id, x]));
    const qBy = new Map(quiz.rows.map(x => [x.user_id, x]));
    const lqBy = new Map(lastQuiz.rows.map(x => [x.user_id, x]));
    res.json({
      users: rows.map(u => {
        const c = curBy.get(u.id), q = qBy.get(u.id), lq = lqBy.get(u.id);
        return {
          ...userOut(u),
          stats: statsOut(u),
          lastActiveAt: lastBy.get(u.id) || null,
          currentLesson: c ? { title: c.title, emoji: c.emoji, completed: Boolean(c.completed_at) } : null,
          quiz: { passed: q ? q.passed_n : 0, attempts: q ? q.attempts : 0, last: lq ? { score: lq.score, total: lq.total, passed: lq.passed, at: lq.created_at } : null },
        };
      }),
    });
  }));

  // Students who need a look: nothing done for 7 days (and still lessons to do), or 3 failed tries at the same quiz.
  r.get('/attention', wrap(async (req, res) => {
    const [inactive, failing] = await Promise.all([
      pool.query(`
        SELECT u.id, u.name, u.email, COALESCE(MAX(lp.last_activity_at), u.created_at) AS last_active,
               (SELECT COUNT(*) FROM lessons l WHERE l.published AND (l.visibility = 'public'
                  OR EXISTS (SELECT 1 FROM lesson_assignments a WHERE a.lesson_id = l.id AND a.user_id = u.id)))::int AS visible,
               COUNT(lp.lesson_id) FILTER (WHERE lp.completed_at IS NOT NULL)::int AS done
        FROM users u LEFT JOIN lesson_progress lp ON lp.user_id = u.id
        WHERE NOT u.disabled
        GROUP BY u.id
        HAVING COALESCE(MAX(lp.last_activity_at), u.created_at) < now() - interval '7 days'`),
      pool.query(`
        SELECT u.id AS user_id, u.name, u.email, l.* , a.scope, COUNT(*)::int AS fails
        FROM quiz_attempts a JOIN users u ON u.id = a.user_id JOIN lessons l ON l.id = a.lesson_id
        WHERE NOT a.voided AND NOT a.passed AND NOT u.disabled
          AND NOT EXISTS (SELECT 1 FROM quiz_attempts p WHERE p.user_id = a.user_id AND p.lesson_id = a.lesson_id
                          AND p.scope = a.scope AND p.passed AND NOT p.voided)
        GROUP BY u.id, u.name, u.email, l.id, a.scope
        HAVING COUNT(*) >= 3`),
    ]);
    const byUser = new Map();
    const entry = (id, name, email) => { if (!byUser.has(id)) byUser.set(id, { userId: id, name, email, reasons: [] }); return byUser.get(id); };
    for (const x of inactive.rows) {
      if (x.visible <= x.done) continue; // nothing left to do
      entry(x.id, x.name, x.email).reasons.push({ type: 'inactive', days: Math.floor((Date.now() - new Date(x.last_active).getTime()) / 86400000), lastActiveAt: x.last_active });
    }
    for (const x of failing.rows) {
      entry(x.user_id, x.name, x.email).reasons.push({ type: 'quiz', lesson: x.title, emoji: x.emoji, quiz: scopeLabel(x, x.scope), fails: x.fails });
    }
    res.json({ students: [...byUser.values()].sort((a, b) => b.reasons.length - a.reasons.length || a.name.localeCompare(b.name)) });
  }));

  // "Unit 2 · Discussing results" / "Final quiz" for a quiz scope of a lesson row.
  function scopeLabel(lesson, scope) {
    if (scope === 'final') return 'Final quiz';
    const units = unitsOf(lesson);
    const i = units.findIndex(u => 'unit:' + u.id === scope);
    return i < 0 ? 'Unit quiz' : units.length > 1 ? `Unit ${i + 1} · ${units[i].title}` : 'Quiz';
  }

  // Every quiz attempt of one student, with each question and what they chose (not the automatic credit for old progress).
  r.get('/users/:id/quiz', wrap(async (req, res) => {
    const uid = req.params.id;
    const [att, live] = await Promise.all([
      pool.query(`SELECT a.id, a.scope, a.score, a.total, a.passed, a.details, a.seconds, a.voided, a.created_at AS attempt_at, l.*, a.id AS attempt_id
                  FROM quiz_attempts a JOIN lessons l ON l.id = a.lesson_id
                  WHERE a.user_id = $1 AND NOT a.grandfathered ORDER BY a.created_at DESC, a.id DESC LIMIT 100`, [uid]),
      pool.query(`SELECT a.lesson_id, a.scope, BOOL_OR(a.passed) AS passed, BOOL_AND(a.grandfathered) AS credit, l.*
                  FROM quiz_attempts a JOIN lessons l ON l.id = a.lesson_id
                  WHERE a.user_id = $1 AND NOT a.voided GROUP BY a.lesson_id, a.scope, l.id`, [uid]),
    ]);
    res.json({
      attempts: att.rows.map(a => ({
        id: a.attempt_id, lessonId: a.id, lesson: a.title, emoji: a.emoji, scope: a.scope, label: scopeLabel(a, a.scope),
        score: a.score, total: a.total, passed: a.passed, voided: a.voided, seconds: a.seconds, at: a.attempt_at, details: a.details,
      })),
      live: live.rows.map(x => ({ lessonId: x.lesson_id, lesson: x.title, emoji: x.emoji, scope: x.scope, label: scopeLabel(x, x.scope), passed: x.passed, credit: x.credit })),
    });
  }));

  // The teacher lets a student take a quiz again: its attempts are "voided", so it no longer counts as passed.
  // The unit/lesson that depended on it is open again until the student passes.
  r.post('/users/:id/lessons/:lessonId/quiz/reset', wrap(async (req, res) => {
    const { id: uid, lessonId } = req.params;
    const scope = String((req.body && req.body.scope) || '').slice(0, 80);
    if (scope !== 'final' && !scope.startsWith('unit:')) return res.status(400).json({ error: 'Unknown quiz.' });
    const { rows: [l] } = await pool.query('SELECT * FROM lessons WHERE id = $1', [lessonId]);
    if (!l) return res.status(404).json({ error: 'Lesson not found.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const v = await client.query('UPDATE quiz_attempts SET voided = TRUE WHERE user_id = $1 AND lesson_id = $2 AND scope = $3 AND NOT voided', [uid, lessonId, scope]);
      if (!v.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'This student has not taken that quiz.' }); }
      await client.query('UPDATE lesson_progress SET completed_at = NULL WHERE user_id = $1 AND lesson_id = $2', [uid, lessonId]);
      await client.query("INSERT INTO events (user_id, lesson_id, type, data) VALUES ($1,$2,'quiz_reset',$3::jsonb)",
        [uid, lessonId, JSON.stringify({ scope, label: scopeLabel(l, scope) })]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.status(204).end();
  }));

  r.post('/users', wrap(async (req, res) => {
    const { user, errors } = validateUser(req.body);
    if (errors) return res.status(400).json({ error: errors[0] });
    const id = crypto.randomUUID();
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4) RETURNING *',
        [id, user.email, user.name, await auth.hashPassword(user.password)]);
      res.status(201).json({ user: userOut(rows[0]) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'A student with this email already exists.' });
      throw e;
    }
  }));

  r.get('/users/:id', wrap(async (req, res) => {
    const uid = req.params.id;
    const { rows: [u] } = await pool.query(`${USER_STATS_SQL} WHERE u.id = $1`, [uid]);
    if (!u) return res.status(404).json({ error: 'Student not found.' });

    const [lessons, lp, sp, up, assigned, days, events, daily, qa, speak] = await Promise.all([
      pool.query(`SELECT l.*, (SELECT COUNT(*) FROM lesson_assignments a WHERE a.lesson_id = l.id)::int AS assigned_count
                  FROM lessons l ORDER BY l.position, l.title`),
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1`, [uid]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1', [uid]),
      pool.query('SELECT lesson_id FROM lesson_assignments WHERE user_id = $1', [uid]),
      pool.query(`SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM events
                  WHERE user_id = $1 AND type IN ${STREAK_TYPES_SQL} ORDER BY d DESC LIMIT 400`, [uid]),
      recentEvents({ userId: uid, limit: 400 }),
      pool.query(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(e.id)::int AS solved
        FROM generate_series((now() AT TIME ZONE 'UTC')::date - 13, (now() AT TIME ZONE 'UTC')::date, interval '1 day') d
        LEFT JOIN events e ON (e.created_at AT TIME ZONE 'UTC')::date = d AND e.user_id = $1 AND e.type = 'sentence_solved'
        GROUP BY d ORDER BY d`, [uid]),
      pool.query(`SELECT lesson_id, scope, passed FROM quiz_attempts WHERE user_id = $1 AND ${PASSED_QUIZ_SQL}`, [uid]),
      // speaking: how each sentence the student said out loud went (lowest scores first)
      pool.query(`SELECT s.sentence, s.best_score, s.tries, s.passed, s.heard, l.title AS lesson_title, l.emoji AS lesson_emoji
                  FROM speaking_scores s JOIN lessons l ON l.id = s.lesson_id WHERE s.user_id = $1 ORDER BY s.best_score, s.tries DESC, s.sentence`, [uid]),
    ]);
    const lpMap = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const solved = groupSolved(sp.rows);
    const extras = groupSolved(sp.rows, 'extra');
    const grammars = groupGrammar(sp.rows);
    const unitMap = groupUnits(up.rows);
    const quizBy = groupQuiz(qa.rows);
    const assignedIds = new Set(assigned.rows.map(x => x.lesson_id));

    res.json({
      user: userOut(u),
      stats: { ...statsOut(u), streak: streak(days.rows.map(x => x.d)) },
      lessons: lessons.rows.map(l => ({
        ...lessonOut(l, { assignedCount: l.assigned_count }),
        assignedToUser: assignedIds.has(l.id),
        visibleToUser: l.published && (l.visibility === 'public' || assignedIds.has(l.id)),
        progress: summarize(l, lpMap.get(l.id), solved.get(l.id), unitMap.get(l.id), extras.get(l.id), grammars.get(l.id), quizBy.get(l.id)),
      })),
      daily: daily.rows,
      events,
      speaking: {
        count: speak.rows.length,
        average: speak.rows.length ? Math.round(speak.rows.reduce((a, x) => a + x.best_score, 0) / speak.rows.length) : null,
        lowest: speak.rows.slice(0, 8).map(x => ({ sentence: x.sentence, score: x.best_score, tries: x.tries, passed: x.passed, heard: x.heard, lesson: x.lesson_title, emoji: x.lesson_emoji })),
      },
    });
  }));

  r.patch('/users/:id', wrap(async (req, res) => {
    const { user, errors } = validateUser(req.body, { partial: true, requirePassword: false });
    if (errors) return res.status(400).json({ error: errors[0] });
    const sets = [], vals = [req.params.id];
    if (user.name !== undefined) { vals.push(user.name); sets.push(`name = $${vals.length}`); }
    if (user.email !== undefined) { vals.push(user.email); sets.push(`email = $${vals.length}`); }
    if (user.disabled !== undefined) { vals.push(user.disabled); sets.push(`disabled = $${vals.length}`); }
    if (user.password !== undefined) { vals.push(await auth.hashPassword(user.password)); sets.push(`password_hash = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change.' });
    try {
      const { rows } = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
      if (!rows[0]) return res.status(404).json({ error: 'Student not found.' });
      res.json({ user: userOut(rows[0]) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Another student already uses this email.' });
      throw e;
    }
  }));

  r.delete('/users/:id', wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Student not found.' });
    res.status(204).end();
  }));

  // Replace the list of private lessons given to one student.
  r.put('/users/:id/assignments', wrap(async (req, res) => {
    const ids = req.body && req.body.lessonIds;
    if (!isIdList(ids)) return res.status(400).json({ error: 'lessonIds must be a list.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM lesson_assignments WHERE user_id = $1', [req.params.id]);
      await client.query(
        'INSERT INTO lesson_assignments (lesson_id, user_id) SELECT id, $1 FROM lessons WHERE id = ANY($2::text[]) AND EXISTS (SELECT 1 FROM users WHERE id = $1)',
        [req.params.id, ids]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.status(204).end();
  }));

  // Take one private lesson away from one student (their saved progress is kept).
  r.delete('/users/:id/assignments/:lessonId', wrap(async (req, res) => {
    await pool.query('DELETE FROM lesson_assignments WHERE user_id = $1 AND lesson_id = $2', [req.params.id, req.params.lessonId]);
    res.status(204).end();
  }));

  // Create a lesson that belongs to this student only (no need to make it public first).
  r.post('/users/:id/lessons', wrap((req, res) => saveLesson(req, res, null, { forUser: req.params.id })));

  /* ================= Lessons ================= */
  r.get('/lessons', wrap(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT l.*,
        (SELECT COUNT(*) FROM lesson_assignments a WHERE a.lesson_id = l.id)::int AS assigned_count,
        (SELECT COALESCE(array_agg(u.name ORDER BY u.name), '{}') FROM (
           SELECT u.name FROM lesson_assignments a JOIN users u ON u.id = a.user_id WHERE a.lesson_id = l.id ORDER BY u.name LIMIT 3) u) AS assigned_names,
        (SELECT COUNT(*) FROM lesson_progress p WHERE p.lesson_id = l.id)::int AS started_count,
        (SELECT COUNT(*) FROM lesson_progress p WHERE p.lesson_id = l.id AND p.completed_at IS NOT NULL)::int AS completed_count
      FROM lessons l ORDER BY l.position, l.title`);
    res.json({
      lessons: rows.map(l => lessonOut(l, { assignedCount: l.assigned_count, assignedNames: l.assigned_names, startedCount: l.started_count, completedCount: l.completed_count })),
      levels: LEVELS,
    });
  }));

  r.get('/lessons/:id', wrap(async (req, res) => {
    const { rows: [l] } = await pool.query('SELECT * FROM lessons WHERE id = $1', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Lesson not found.' });
    const a = await pool.query('SELECT user_id FROM lesson_assignments WHERE lesson_id = $1', [l.id]);
    res.json({ lesson: lessonOut(l, { units: unitsOf(l), sentences: l.sentences, words: l.words || {}, assignedUserIds: a.rows.map(x => x.user_id) }) });
  }));

  // Per-student progress for one lesson.
  r.get('/lessons/:id/progress', wrap(async (req, res) => {
    const { rows: [l] } = await pool.query('SELECT * FROM lessons WHERE id = $1', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Lesson not found.' });
    const [users, lp, sp, qa] = await Promise.all([
      pool.query(`SELECT u.* FROM users u WHERE $2 = 'public' OR EXISTS (SELECT 1 FROM lesson_assignments a WHERE a.lesson_id = $1 AND a.user_id = u.id)
                    OR EXISTS (SELECT 1 FROM lesson_progress p WHERE p.lesson_id = $1 AND p.user_id = u.id)
                  ORDER BY u.name`, [l.id, l.visibility]),
      pool.query('SELECT * FROM lesson_progress WHERE lesson_id = $1', [l.id]),
      pool.query(`SELECT user_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE lesson_id = $1`, [l.id]),
      pool.query(`SELECT user_id, scope, passed FROM quiz_attempts WHERE lesson_id = $1 AND ${PASSED_QUIZ_SQL}`, [l.id]),
    ]);
    const quizByUser = groupQuiz(qa.rows, 'user_id');
    const up = await pool.query('SELECT * FROM unit_progress WHERE lesson_id = $1', [l.id]);
    const unitsByUser = groupUnits(up.rows, 'user_id');
    const lpMap = new Map(lp.rows.map(x => [x.user_id, x]));
    const byUser = groupSolved(sp.rows, 'stars', 'user_id');
    const extraByUser = groupSolved(sp.rows, 'extra', 'user_id');
    const grammarByUser = groupGrammar(sp.rows, 'user_id');
    res.json({
      lesson: lessonOut(l, { units: unitsOf(l).map(u => ({ id: u.id, title: u.title, count: u.sentences.length })) }),
      students: users.rows.map(u => ({ ...userOut(u), progress: summarize(l, lpMap.get(u.id), byUser.get(u.id), unitsByUser.get(u.id), extraByUser.get(u.id), grammarByUser.get(u.id), quizByUser.get(u.id)) })),
    });
  }));

  // The sentences students find hardest in one lesson: wrong tries and hints while building, wrong grammar choices, wrong quiz answers.
  r.get('/lessons/:id/hard', wrap(async (req, res) => {
    const { rows: [l] } = await pool.query('SELECT * FROM lessons WHERE id = $1', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Lesson not found.' });
    const [sp, qz] = await Promise.all([
      pool.query(`SELECT sentence, COUNT(*)::int AS students, COALESCE(SUM(total_mistakes),0)::int AS mistakes, COALESCE(SUM(total_hints),0)::int AS hints,
                         COALESCE(SUM(grammar_mistakes),0)::int AS grammar, COALESCE(SUM(times_solved),0)::int AS plays
                  FROM sentence_progress WHERE lesson_id = $1 GROUP BY sentence`, [l.id]),
      pool.query(`SELECT d->>'sentence' AS sentence, COUNT(*)::int AS asked,
                         COUNT(*) FILTER (WHERE NOT (d->>'correct')::boolean)::int AS wrong,
                         COUNT(DISTINCT a.user_id) FILTER (WHERE NOT (d->>'correct')::boolean)::int AS students_wrong
                  FROM quiz_attempts a, jsonb_array_elements(a.details) d
                  WHERE a.lesson_id = $1 AND NOT a.grandfathered GROUP BY 1`, [l.id]),
    ]);
    const spBy = new Map(sp.rows.map(x => [x.sentence, x])), qzBy = new Map(qz.rows.map(x => [x.sentence, x]));
    const out = [];
    unitsOf(l).forEach((u, ui) => u.sentences.forEach(sn => {
      const a = spBy.get(sn.en) || {}, q = qzBy.get(sn.en) || {};
      const score = (a.mistakes || 0) + (a.hints || 0) + (a.grammar || 0) + (q.wrong || 0);
      if (score > 0) out.push({
        sentence: sn.en, unit: unitsOf(l).length > 1 ? `Unit ${ui + 1}` : null, students: a.students || 0, plays: a.plays || 0,
        mistakes: a.mistakes || 0, hints: a.hints || 0, grammar: a.grammar || 0, quizAsked: q.asked || 0, quizWrong: q.wrong || 0, quizStudentsWrong: q.students_wrong || 0, score,
      });
    }));
    out.sort((x, y) => y.score - x.score);
    res.json({ sentences: out.slice(0, 15) });
  }));

  // "Hardest to say": the sentences of one lesson with the lowest speaking scores (the average of each student's best score), and how many tries they took.
  r.get('/lessons/:id/speaking', wrap(async (req, res) => {
    const { rows: [l] } = await pool.query('SELECT id FROM lessons WHERE id = $1', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Lesson not found.' });
    const { rows } = await pool.query(
      `SELECT sentence, COUNT(*)::int AS students, ROUND(AVG(best_score))::int AS avg_score, MIN(best_score)::int AS worst,
              SUM(tries)::int AS tries, COUNT(*) FILTER (WHERE NOT passed)::int AS not_passed
       FROM speaking_scores WHERE lesson_id = $1 GROUP BY sentence ORDER BY AVG(best_score), SUM(tries) DESC, sentence LIMIT 15`, [l.id]);
    res.json({ sentences: rows.map(x => ({ sentence: x.sentence, students: x.students, avgScore: x.avg_score, worst: x.worst, tries: x.tries, notPassed: x.not_passed })) });
  }));

  // "Lessons open one by one": on by default. Off = every lesson is open (the flag 'lessons_open_all' exists).
  r.get('/lock', wrap(async (req, res) => {
    res.json({ on: !(await pool.query("SELECT 1 FROM app_flags WHERE key = 'lessons_open_all'")).rowCount });
  }));
  r.put('/lock', wrap(async (req, res) => {
    const on = Boolean(req.body && req.body.on);
    if (on) await pool.query("DELETE FROM app_flags WHERE key = 'lessons_open_all'");
    else await pool.query("INSERT INTO app_flags (key) VALUES ('lessons_open_all') ON CONFLICT DO NOTHING");
    res.json({ on });
  }));

  async function saveAssignments(client, lessonId, userIds) {
    if (userIds === undefined) return;
    await client.query('DELETE FROM lesson_assignments WHERE lesson_id = $1', [lessonId]);
    if (userIds.length) await client.query(
      'INSERT INTO lesson_assignments (lesson_id, user_id) SELECT $1, id FROM users WHERE id = ANY($2::text[])', [lessonId, userIds]);
  }

  // Finds a link name that is not used yet (adds -2, -3... when needed).
  async function freeSlug(client, base) {
    const root = (slugify(base) || 'lesson').slice(0, 52).replace(/-+$/, '');
    let slug = root;
    for (let n = 2; n < 200; n++) {
      const { rowCount } = await client.query('SELECT 1 FROM lessons WHERE slug = $1', [slug]);
      if (!rowCount) return slug;
      slug = `${root}-${n}`;
    }
    return `${root}-${crypto.randomBytes(3).toString('hex')}`;
  }

  /**
   * Creates or updates a lesson. With { forUser } the lesson is created as private to that one
   * student (link name made unique automatically).
   */
  /* ================= Arabic on the cards =================
   * The Arabic text of every sentence is stored with the sentence (the "ar" field). The teacher adds it by sending the
   * lessons' sentences to an AI model and pasting its answer back here (see the Lessons page); a student only sees it when
   * the teacher switched Arabic on for that student.
   */
  const ARABIC_RE = /[\u0600-\u06FF]/;
  const normEn = t => String(t).trim().replace(/\s+/g, ' '); // sentences are stored with single spaces
  const ARABIC_PROMPT =
    'You are a careful translator from English to Modern Standard Arabic for learners of English. ' +
    'The JSON below has a list "sentences"; each item has an "en" (English) and an empty "ar". ' +
    'Fill in every "ar" with a natural, correct Arabic translation of its "en" (clear everyday Arabic, no transliteration, no explanations). ' +
    'Do NOT change any "en" (not even a typo), keep the same items in the same order, and do not add or remove items. ' +
    'Answer with ONLY the JSON, in exactly the same shape, with no text before or after it and no markdown.';

  // Every sentence of every lesson that has no Arabic yet (once per different English text), a batch at a time, for the AI.
  r.get('/arabic/export', wrap(async (req, res) => {
    const size = Math.min(300, Math.max(1, parseInt(req.query.size, 10) || 100));
    const all = req.query.all === '1';
    const { rows } = await pool.query('SELECT units FROM lessons ORDER BY position, title');
    const seen = new Set(), list = [];
    for (const l of rows) for (const u of unitsOf(l)) for (const sn of u.sentences) {
      if (seen.has(sn.en) || (!all && sn.ar)) continue;
      seen.add(sn.en);
      list.push({ en: sn.en, ar: all ? sn.ar || '' : '' });
    }
    res.set('Content-Disposition', 'attachment; filename="sentences-for-translation.json"');
    res.json({ instructions: ARABIC_PROMPT, sentencesLeft: list.length, sentences: list.slice(0, size) });
  }));

  // How far the lessons have got, and the instruction to give to the AI.
  r.get('/arabic/status', wrap(async (req, res) => {
    const [{ rows }, { rows: [c] }] = await Promise.all([
      pool.query('SELECT id, title, emoji, units FROM lessons ORDER BY position, title'),
      pool.query('SELECT COUNT(*)::int AS students, COUNT(*) FILTER (WHERE arabic_enabled)::int AS on FROM users'),
    ]);
    let total = 0, ready = 0;
    const lessons = rows.map(l => {
      const sents = unitsOf(l).flatMap(u => u.sentences);
      const done = sents.filter(sn => sn.ar).length;
      total += sents.length; ready += done;
      return { id: l.id, title: l.title, emoji: l.emoji, total: sents.length, ready: done };
    });
    res.json({ total, ready, lessons, students: c.students, studentsOn: c.on, prompt: ARABIC_PROMPT });
  }));

  // Walks through whatever the AI sent back and collects English -> Arabic pairs. Understands: the file from "Download" (a list of
  // { en, ar }), a plain map { "English": "Arabic" }, and the lessons file (units > sentences > { en, ar }).
  function collectPairs(node, out = new Map(), depth = 0) {
    if (depth > 8 || out.size > 50000 || node === null || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.slice(0, 50000).forEach(x => collectPairs(x, out, depth + 1)); return out; }
    if (typeof node.en === 'string') { if (typeof node.ar === 'string') out.set(normEn(node.en), node.ar); return out; }
    const entries = Object.entries(node);
    if (entries.length && entries.every(([, v]) => typeof v === 'string')) { entries.forEach(([k, v]) => out.set(normEn(k), v)); return out; }
    entries.forEach(([, v]) => collectPairs(v, out, depth + 1));
    return out;
  }

  // Adds the Arabic to the sentences it matches EXACTLY. Nothing else in a lesson is touched (so progress is safe), a sentence the AI
  // changed simply does not match, and an answer that is not Arabic text is refused. `replace` also overwrites Arabic that exists.
  r.post('/arabic/import', wrap(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Nothing to add. Paste the AI\'s answer first.' });
    const replace = !Array.isArray(body) && Boolean(body.replace);
    const pairs = collectPairs(Array.isArray(body) ? body : (body.data !== undefined ? body.data : body));
    pairs.delete('replace');
    if (!pairs.size) return res.status(400).json({ error: 'No translations found in that text. It should be a list of items like {"en": "...", "ar": "..."}.' });
    const rejected = [];
    const good = new Map();
    for (const [en, raw] of pairs) {
      const ar = String(raw).trim().replace(/\s+/g, ' ');
      if (!ar || ar.length > 300 || !ARABIC_RE.test(ar)) rejected.push(en); else good.set(en, ar);
    }
    const matched = new Set();
    let updated = 0, unchanged = 0, lessonsChanged = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id, units FROM lessons FOR UPDATE');
      for (const l of rows) {
        const units = unitsOf(l);
        let changed = false;
        for (const u of units) for (const sn of u.sentences) {
          const ar = good.get(sn.en);
          if (ar === undefined) continue;
          matched.add(sn.en);
          if (sn.ar && (!replace || sn.ar === ar)) { unchanged++; continue; }
          sn.ar = ar; updated++; changed = true;
        }
        if (changed) {
          await client.query('UPDATE lessons SET units = $2::jsonb, sentences = $3::jsonb, updated_at = now() WHERE id = $1',
            [l.id, JSON.stringify(units), JSON.stringify(units.flatMap(u => u.sentences))]);
          lessonsChanged++;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const notFound = [...good.keys()].filter(en => !matched.has(en));
    res.json({ updated, unchanged, lessonsChanged, received: pairs.size, notFound: notFound.length, notFoundExamples: notFound.slice(0, 5), rejected: rejected.length, rejectedExamples: rejected.slice(0, 5) });
  }));

  /* ================= Word meanings (tap a word on a card) =================
   * Each lesson keeps { word: Arabic meaning } (the "words" column). The teacher fills it by hand in the lesson editor, in a JSON file, or like the Arabic
   * of the sentences: download the words that have no meaning yet, give the file to an AI, paste its answer back. Only words that really appear in a
   * lesson's sentences get a meaning, only Arabic text is accepted, existing meanings are kept unless the teacher asks to replace them, and nothing else
   * in a lesson (sentences, units, progress) is touched.
   */
  const WORDS_PROMPT =
    'You are a careful translator from English to Modern Standard Arabic for learners of English. ' +
    'The JSON below has a list "words"; each item has a "word" (one English word), an "example" (a sentence that uses it, only to show which meaning is meant) and an empty "ar". ' +
    'Fill in every "ar" with the Arabic meaning of that word as it is used in its example (one or two Arabic words, no transliteration, no explanations). ' +
    'Do NOT change any "word" or "example", keep the same items in the same order, and do not add or remove items. ' +
    'Answer with ONLY the JSON, in exactly the same shape, with no text before or after it and no markdown.';

  // The different words (not the tiny ones) of every lesson that have no meaning in that lesson yet, with one example sentence each.
  function wordsOverview(rows) {
    const examples = new Map();      // word -> first sentence that uses it
    const missing = new Set();       // words that lack a meaning in at least one lesson that uses them
    const all = new Set();
    const lessons = rows.map(l => {
      const have = l.words && typeof l.words === 'object' ? l.words : {};
      const keys = new Set();
      for (const u of unitsOf(l)) for (const sn of u.sentences) for (const k of Words.keysOf(sn.en)) {
        if (Words.SKIP.has(k)) continue;
        keys.add(k);
        if (!examples.has(k)) examples.set(k, sn.en);
      }
      let ready = 0;
      for (const k of keys) { all.add(k); if (have[k]) ready++; else missing.add(k); }
      return { id: l.id, title: l.title, emoji: l.emoji, total: keys.size, ready };
    });
    return { examples, missing, all, lessons };
  }

  r.get('/words/export', wrap(async (req, res) => {
    const size = Math.min(300, Math.max(1, parseInt(req.query.size, 10) || 100));
    const everything = req.query.all === '1';
    const { rows } = await pool.query('SELECT id, title, emoji, units, words FROM lessons ORDER BY position, title');
    const { examples, missing, all } = wordsOverview(rows);
    const list = [];
    for (const k of everything ? all : missing) {
      const had = everything ? (rows.map(l => l.words && l.words[k]).find(Boolean) || '') : '';
      list.push({ word: k, ar: had, example: examples.get(k) });
    }
    res.set('Content-Disposition', 'attachment; filename="words-for-translation.json"');
    res.json({ instructions: WORDS_PROMPT, wordsLeft: list.length, words: list.slice(0, size) });
  }));

  r.get('/words/status', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT id, title, emoji, units, words FROM lessons ORDER BY position, title');
    const { missing, all, lessons } = wordsOverview(rows);
    res.json({ total: all.size, ready: all.size - missing.size, lessons, prompt: WORDS_PROMPT });
  }));

  // Whatever the AI sent back, as word -> Arabic pairs. Understands the downloaded file (items with "word" and "ar"), a plain map { "airport": "مطار" },
  // and a lessons file (each lesson's "words").
  function collectWordPairs(node, out = new Map(), depth = 0) {
    if (depth > 8 || out.size > 50000 || node === null || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.slice(0, 50000).forEach(x => collectWordPairs(x, out, depth + 1)); return out; }
    const w = typeof node.word === 'string' ? node.word : typeof node.en === 'string' ? node.en : null;
    if (w !== null) { if (typeof node.ar === 'string') out.set(Words.key(w), node.ar); return out; }
    const entries = Object.entries(node);
    if (entries.length && entries.every(([, v]) => typeof v === 'string')) { entries.forEach(([k, v]) => out.set(Words.key(k), v)); return out; }
    entries.forEach(([, v]) => collectWordPairs(v, out, depth + 1));
    return out;
  }

  r.post('/words/import', wrap(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Nothing to add. Paste the AI\'s answer first.' });
    const replace = !Array.isArray(body) && Boolean(body.replace);
    const pairs = collectWordPairs(Array.isArray(body) ? body : (body.data !== undefined ? body.data : body));
    pairs.delete('replace');
    if (!pairs.size) return res.status(400).json({ error: 'No word meanings found in that text. It should be a list of items like {"word": "airport", "ar": "..."}.' });
    const rejected = [];
    const good = new Map();
    for (const [k, raw] of pairs) {
      const ar = String(raw).trim().replace(/\s+/g, ' ');
      if (!Words.validKey(k) || !ar || ar.length > Words.MAX_MEANING || !Words.ARABIC_RE.test(ar)) rejected.push(k || '?'); else good.set(k, ar);
    }
    const matched = new Set();
    let updated = 0, unchanged = 0, lessonsChanged = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id, units, words FROM lessons FOR UPDATE');
      for (const l of rows) {
        const have = l.words && typeof l.words === 'object' ? { ...l.words } : {};
        let changed = false;
        const used = new Set(unitsOf(l).flatMap(u => u.sentences.flatMap(sn => Words.keysOf(sn.en))));
        for (const [k, ar] of good) {
          if (!used.has(k)) continue; // only words that really are in this lesson
          matched.add(k);
          if (have[k] && (!replace || have[k] === ar)) { unchanged++; continue; }
          if (!have[k] && Object.keys(have).length >= Words.MAX_WORDS) continue;
          have[k] = ar; updated++; changed = true;
        }
        if (changed) { await client.query('UPDATE lessons SET words = $2::jsonb, updated_at = now() WHERE id = $1', [l.id, JSON.stringify(have)]); lessonsChanged++; }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const notFound = [...good.keys()].filter(k => !matched.has(k));
    res.json({ updated, unchanged, lessonsChanged, received: pairs.size, notFound: notFound.length, notFoundExamples: notFound.slice(0, 5), rejected: rejected.length, rejectedExamples: rejected.slice(0, 5) });
  }));

  // Arabic on the cards: switched on for one student, or for everyone at once.
  r.put('/users/:id/arabic', wrap(async (req, res) => {
    const enabled = Boolean(req.body && req.body.enabled);
    const { rowCount } = await pool.query('UPDATE users SET arabic_enabled = $2 WHERE id = $1', [req.params.id, enabled]);
    if (!rowCount) return res.status(404).json({ error: 'Student not found.' });
    res.json({ enabled });
  }));
  r.put('/arabic', wrap(async (req, res) => {
    const enabled = Boolean(req.body && req.body.enabled);
    const { rowCount } = await pool.query('UPDATE users SET arabic_enabled = $1', [enabled]);
    res.json({ enabled, count: rowCount });
  }));
  async function saveLesson(req, res, id, { forUser = null } = {}) {
    const input = forUser && req.body && typeof req.body === 'object' ? { ...req.body, visibility: 'assigned', assignedUserIds: [forUser] } : req.body;
    const { lesson: d, assignedUserIds, errors } = validateLesson(input);
    if (errors) return res.status(400).json({ error: errors[0], errors });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (forUser) {
        const u = await client.query('SELECT 1 FROM users WHERE id = $1', [forUser]);
        if (!u.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Student not found.' }); }
        d.slug = await freeSlug(client, d.slug);
      }
      let row;
      if (id) {
        ({ rows: [row] } = await client.query(
          `UPDATE lessons SET slug=$2, title=$3, level=$4, description=$5, emoji=$6, published=$7, visibility=$8,
                  sentences=$9::jsonb, units=$10::jsonb, ar_step=COALESCE($11::boolean, ar_step), words=COALESCE($12::jsonb, words), updated_at=now() WHERE id=$1 RETURNING *`,
          [id, d.slug, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units), d.arStep === undefined ? null : d.arStep,
            d.words === undefined ? null : JSON.stringify(d.words)]));
        if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Lesson not found.' }); }
      } else {
        ({ rows: [row] } = await client.query(
          `INSERT INTO lessons (id, slug, title, level, description, emoji, published, visibility, position, sentences, units, ar_step, words)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(position) + 1, 0) FROM lessons),$9::jsonb,$10::jsonb,COALESCE($11::boolean, TRUE),COALESCE($12::jsonb, '{}'::jsonb)) RETURNING *`,
          [crypto.randomUUID(), d.slug, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units), d.arStep === undefined ? null : d.arStep,
            d.words === undefined ? null : JSON.stringify(d.words)]));
      }
      await saveAssignments(client, row.id, assignedUserIds);
      await client.query('COMMIT');
      res.status(id ? 200 : 201).json({ lesson: lessonOut(row, { units: unitsOf(row) }) });
    } catch (e) {
      await client.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: `The link name "${d.slug}" is already used by another lesson.` });
      throw e;
    } finally {
      client.release();
    }
  }

  r.post('/lessons', wrap((req, res) => saveLesson(req, res, null)));
  r.put('/lessons/:id', wrap((req, res) => saveLesson(req, res, req.params.id)));

  r.delete('/lessons/:id', wrap(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM lessons WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Lesson not found.' });
    res.status(204).end();
  }));

  r.post('/reorder', wrap(async (req, res) => {
    const ids = req.body && req.body.ids;
    if (!isIdList(ids)) return res.status(400).json({ error: 'ids must be a list.' });
    await pool.query('UPDATE lessons l SET position = t.pos FROM unnest($1::text[]) WITH ORDINALITY AS t(id, pos) WHERE l.id = t.id', [ids]);
    res.status(204).end();
  }));

  r.get('/export', wrap(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM lessons ORDER BY position, title');
    res.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      lessons: rows.map(l => ({ title: l.title, slug: l.slug, level: l.level, emoji: l.emoji, description: l.description,
        published: l.published, visibility: l.visibility, arStep: l.ar_step !== false, words: l.words || {},
        units: unitsOf(l).map(u => ({ title: u.title, ...(u.tip ? { tip: u.tip } : {}), ...(u.tipAr ? { tipAr: u.tipAr } : {}), sentences: u.sentences })) })),
    });
  }));

  // Bulk import: same slug = update (keeps student progress), new slug = create.
  r.post('/import', wrap(async (req, res) => {
    const list = Array.isArray(req.body) ? req.body : req.body && req.body.lessons;
    if (!Array.isArray(list) || list.length === 0) return res.status(400).json({ error: 'The file has no lessons.' });
    if (list.length > 200) return res.status(400).json({ error: 'Import at most 200 lessons at once.' });
    // assignTo: a student id. Every imported lesson is created as private to that student.
    const assignTo = !Array.isArray(req.body) && req.body && typeof req.body.assignTo === 'string' ? req.body.assignTo : null;
    if (assignTo) {
      const u = await pool.query('SELECT 1 FROM users WHERE id = $1', [assignTo]);
      if (!u.rowCount) return res.status(404).json({ error: 'Student not found.' });
    }
    const checked = [];
    for (const [i, item] of list.entries()) {
      const { lesson, errors } = validateLesson({ ...item, assignedUserIds: undefined, ...(assignTo ? { visibility: 'assigned' } : {}) });
      if (errors) return res.status(400).json({ error: `Lesson ${i + 1} (${(item && item.title) || 'untitled'}): ${errors[0]}` });
      checked.push(lesson);
    }
    let created = 0, updated = 0;
    const fileOrder = []; // the lessons of the file, in the order of the file
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const d of checked) {
        if (assignTo) d.slug = await freeSlug(client, d.slug); // never overwrite someone else's lesson
        const { rows: [existing] } = await client.query('SELECT id, units FROM lessons WHERE slug = $1', [d.slug]);
        if (existing) {
          // Keep unit ids when a unit with the same title already exists, so card progress is kept.
          const byTitle = new Map(unitsOf(existing).map(u => [u.title.toLowerCase(), u.id]));
          const used = new Set();
          const oldById = new Map(unitsOf(existing).map(u => [u.id, u]));
          const fileItem = list[checked.indexOf(d)];
          const rawUnits = fileItem && Array.isArray(fileItem.units) ? fileItem.units : [];
          d.units.forEach((u, k) => {
            const keep = byTitle.get(u.title.toLowerCase());
            if (keep && !used.has(keep)) { u.id = keep; used.add(keep); }
            // An older file without any "tip" must not wipe the tips the teacher already wrote for that unit.
            const raw = rawUnits[k], was = oldById.get(u.id);
            if (was && raw && typeof raw === 'object' && raw.tip === undefined && raw.tipAr === undefined) {
              if (was.tip) u.tip = was.tip;
              if (was.tipAr) u.tipAr = was.tipAr;
            }
          });
          await client.query(
            `UPDATE lessons SET title=$2, level=$3, description=$4, emoji=$5, published=$6, visibility=$7, sentences=$8::jsonb,
               units=$9::jsonb, ar_step=COALESCE($10::boolean, ar_step), words=COALESCE($11::jsonb, words), updated_at=now() WHERE id=$1`,
            [existing.id, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units), d.arStep === undefined ? null : d.arStep,
              d.words === undefined ? null : JSON.stringify(d.words)]);
          updated++;
          fileOrder.push(existing.id);
          continue;
        }
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO lessons (id, slug, title, level, description, emoji, published, visibility, position, sentences, units, ar_step, words)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(position) + 1, 0) FROM lessons),$9::jsonb,$10::jsonb,COALESCE($11::boolean, TRUE),COALESCE($12::jsonb, '{}'::jsonb))`,
          [id, d.slug, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units), d.arStep === undefined ? null : d.arStep,
            d.words === undefined ? null : JSON.stringify(d.words)]);
        if (assignTo) await client.query('INSERT INTO lesson_assignments (lesson_id, user_id) VALUES ($1,$2)', [id, assignTo]);
        created++;
        fileOrder.push(id);
      }
      // The order of the lessons in the file is the order in the app. The lessons of the file are put in file order in the places they
      // already take (lessons that are not in the file stay exactly where they are; new lessons come after the others). Not for a
      // student's private import.
      if (!assignTo) {
        const wanted = [...new Set(fileOrder)];
        const inFile = new Set(wanted);
        const { rows: now } = await client.query('SELECT id FROM lessons ORDER BY position, title');
        let next = 0;
        const sequence = now.map(x => (inFile.has(x.id) ? wanted[next++] : x.id));
        await client.query('UPDATE lessons l SET position = t.pos - 1 FROM unnest($1::text[]) WITH ORDINALITY AS t(id, pos) WHERE l.id = t.id', [sequence]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ created, updated });
  }));

  // Spreadsheet of every student x lesson.
  r.get('/export/progress.csv', wrap(async (req, res) => {
    const [users, lessons, lp, sp] = await Promise.all([
      pool.query('SELECT * FROM users ORDER BY name'),
      pool.query('SELECT * FROM lessons ORDER BY position, title'),
      pool.query('SELECT * FROM lesson_progress'),
      pool.query(`SELECT user_id, lesson_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress`),
    ]);
    const assigned = await pool.query('SELECT lesson_id, user_id FROM lesson_assignments');
    const up = await pool.query('SELECT * FROM unit_progress');
    const qzRows = await pool.query(`SELECT user_id, lesson_id, scope, passed FROM quiz_attempts WHERE ${PASSED_QUIZ_SQL}`);
    const qzMap = new Map();
    for (const row of qzRows.rows) {
      const k = row.user_id + '|' + row.lesson_id;
      if (!qzMap.has(k)) qzMap.set(k, { units: new Set(), final: false });
      if (row.scope === 'final') qzMap.get(k).final = true; else qzMap.get(k).units.add(String(row.scope).replace(/^unit:/, ''));
    }
    const upMap = new Map();
    for (const row of up.rows) {
      const k = row.user_id + '|' + row.lesson_id;
      if (!upMap.has(k)) upMap.set(k, new Map());
      upMap.get(k).set(row.unit_id, row);
    }
    const assignedSet = new Set(assigned.rows.map(a => a.lesson_id + '|' + a.user_id));
    const lpMap = new Map(lp.rows.map(x => [x.user_id + '|' + x.lesson_id, x]));
    const spMap = new Map(), exMap = new Map(), grMap = new Map();
    for (const row of sp.rows) {
      const k = row.user_id + '|' + row.lesson_id;
      if (!spMap.has(k)) spMap.set(k, new Map());
      spMap.get(k).set(row.sentence, row.stars);
      if (row.extra) {
        if (!exMap.has(k)) exMap.set(k, new Map());
        exMap.get(k).set(row.sentence, row.extra);
      }
      if (row.gdone) {
        if (!grMap.has(k)) grMap.set(k, new Set());
        grMap.get(k).add(row.sentence);
      }
    }
    const esc = v => {
      const s = v === null || v === undefined ? '' : String(v);
      const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // avoid spreadsheet formula injection
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [['Student', 'Email', 'Lesson', 'Level', 'Status', 'Units done', 'Total units', 'Cards learned', 'Sentences solved', 'Total sentences', 'Stars', 'Of which extra (from retries)', 'Max stars', 'Minutes spent', 'Completed at', 'Last activity'].join(',')];
    for (const u of users.rows) {
      for (const l of lessons.rows) {
        const k = u.id + '|' + l.id;
        const visible = l.visibility === 'public' || assignedSet.has(l.id + '|' + u.id);
        if (!visible && !lpMap.has(k)) continue;
        const p = summarize(l, lpMap.get(k), spMap.get(k), upMap.get(k), exMap.get(k), grMap.get(k), qzMap.get(k));
        lines.push([u.name, u.email, l.title, l.level, p.status, p.unitsCompleted, p.unitsTotal, p.units.filter(u => u.learned).length + '/' + p.unitsTotal, p.solved, p.total, p.stars, p.extra, p.maxStars,
          Math.round(p.timeSpent / 60), p.completedAt ? new Date(p.completedAt).toISOString() : '',
          p.lastActivityAt ? new Date(p.lastActivityAt).toISOString() : ''].map(esc).join(','));
      }
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="student-progress.csv"');
    res.send('﻿' + lines.join('\n'));
  }));

  return r;
};
