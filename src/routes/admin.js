'use strict';

const crypto = require('crypto');
const express = require('express');
const auth = require('../auth');
const { validateLesson, validateUser, LEVELS } = require('../validate');
const { summarize, unitsOf, groupSolved, groupGrammar, groupUnits, streak, EXTRA_SQL } = require('../progress');
const { slugify } = require('../validate');

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

  r.get('/users', wrap(async (req, res) => {
    const { rows } = await pool.query(`${USER_STATS_SQL} ORDER BY u.last_seen_at DESC NULLS LAST, u.created_at DESC`);
    res.json({ users: rows.map(u => ({ ...userOut(u), stats: statsOut(u) })) });
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

    const [lessons, lp, sp, up, assigned, days, events, daily] = await Promise.all([
      pool.query(`SELECT l.*, (SELECT COUNT(*) FROM lesson_assignments a WHERE a.lesson_id = l.id)::int AS assigned_count
                  FROM lessons l ORDER BY l.position, l.title`),
      pool.query('SELECT * FROM lesson_progress WHERE user_id = $1', [uid]),
      pool.query(`SELECT lesson_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE user_id = $1`, [uid]),
      pool.query('SELECT * FROM unit_progress WHERE user_id = $1', [uid]),
      pool.query('SELECT lesson_id FROM lesson_assignments WHERE user_id = $1', [uid]),
      pool.query(`SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d FROM events
                  WHERE user_id = $1 AND type IN ('sentence_solved','cards_done','lesson_start') ORDER BY d DESC LIMIT 400`, [uid]),
      recentEvents({ userId: uid, limit: 60 }),
      pool.query(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(e.id)::int AS solved
        FROM generate_series((now() AT TIME ZONE 'UTC')::date - 13, (now() AT TIME ZONE 'UTC')::date, interval '1 day') d
        LEFT JOIN events e ON (e.created_at AT TIME ZONE 'UTC')::date = d AND e.user_id = $1 AND e.type = 'sentence_solved'
        GROUP BY d ORDER BY d`, [uid]),
    ]);
    const lpMap = new Map(lp.rows.map(x => [x.lesson_id, x]));
    const solved = groupSolved(sp.rows);
    const extras = groupSolved(sp.rows, 'extra');
    const grammars = groupGrammar(sp.rows);
    const unitMap = groupUnits(up.rows);
    const assignedIds = new Set(assigned.rows.map(x => x.lesson_id));

    res.json({
      user: userOut(u),
      stats: { ...statsOut(u), streak: streak(days.rows.map(x => x.d)) },
      lessons: lessons.rows.map(l => ({
        ...lessonOut(l, { assignedCount: l.assigned_count }),
        assignedToUser: assignedIds.has(l.id),
        visibleToUser: l.published && (l.visibility === 'public' || assignedIds.has(l.id)),
        progress: summarize(l, lpMap.get(l.id), solved.get(l.id), unitMap.get(l.id), extras.get(l.id), grammars.get(l.id)),
      })),
      daily: daily.rows,
      events,
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
    res.json({ lesson: lessonOut(l, { units: unitsOf(l), sentences: l.sentences, assignedUserIds: a.rows.map(x => x.user_id) }) });
  }));

  // Per-student progress for one lesson.
  r.get('/lessons/:id/progress', wrap(async (req, res) => {
    const { rows: [l] } = await pool.query('SELECT * FROM lessons WHERE id = $1', [req.params.id]);
    if (!l) return res.status(404).json({ error: 'Lesson not found.' });
    const [users, lp, sp] = await Promise.all([
      pool.query(`SELECT u.* FROM users u WHERE $2 = 'public' OR EXISTS (SELECT 1 FROM lesson_assignments a WHERE a.lesson_id = $1 AND a.user_id = u.id)
                    OR EXISTS (SELECT 1 FROM lesson_progress p WHERE p.lesson_id = $1 AND p.user_id = u.id)
                  ORDER BY u.name`, [l.id, l.visibility]),
      pool.query('SELECT * FROM lesson_progress WHERE lesson_id = $1', [l.id]),
      pool.query(`SELECT user_id, sentence, stars, ${EXTRA_SQL} AS extra, grammar_done AS gdone FROM sentence_progress WHERE lesson_id = $1`, [l.id]),
    ]);
    const up = await pool.query('SELECT * FROM unit_progress WHERE lesson_id = $1', [l.id]);
    const unitsByUser = groupUnits(up.rows, 'user_id');
    const lpMap = new Map(lp.rows.map(x => [x.user_id, x]));
    const byUser = groupSolved(sp.rows, 'stars', 'user_id');
    const extraByUser = groupSolved(sp.rows, 'extra', 'user_id');
    const grammarByUser = groupGrammar(sp.rows, 'user_id');
    res.json({
      lesson: lessonOut(l, { units: unitsOf(l).map(u => ({ id: u.id, title: u.title, count: u.sentences.length })) }),
      students: users.rows.map(u => ({ ...userOut(u), progress: summarize(l, lpMap.get(u.id), byUser.get(u.id), unitsByUser.get(u.id), extraByUser.get(u.id), grammarByUser.get(u.id)) })),
    });
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
                  sentences=$9::jsonb, units=$10::jsonb, updated_at=now() WHERE id=$1 RETURNING *`,
          [id, d.slug, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units)]));
        if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Lesson not found.' }); }
      } else {
        ({ rows: [row] } = await client.query(
          `INSERT INTO lessons (id, slug, title, level, description, emoji, published, visibility, position, sentences, units)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(position) + 1, 0) FROM lessons),$9::jsonb,$10::jsonb) RETURNING *`,
          [crypto.randomUUID(), d.slug, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units)]));
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
        published: l.published, visibility: l.visibility,
        units: unitsOf(l).map(u => ({ title: u.title, sentences: u.sentences })) })),
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
          for (const u of d.units) {
            const keep = byTitle.get(u.title.toLowerCase());
            if (keep && !used.has(keep)) { u.id = keep; used.add(keep); }
          }
          await client.query(
            `UPDATE lessons SET title=$2, level=$3, description=$4, emoji=$5, published=$6, visibility=$7, sentences=$8::jsonb,
               units=$9::jsonb, updated_at=now() WHERE id=$1`,
            [existing.id, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units)]);
          updated++;
          continue;
        }
        const id = crypto.randomUUID();
        await client.query(
          `INSERT INTO lessons (id, slug, title, level, description, emoji, published, visibility, position, sentences, units)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(position) + 1, 0) FROM lessons),$9::jsonb,$10::jsonb)`,
          [id, d.slug, d.title, d.level, d.description, d.emoji, d.published, d.visibility, JSON.stringify(d.sentences), JSON.stringify(d.units)]);
        if (assignTo) await client.query('INSERT INTO lesson_assignments (lesson_id, user_id) VALUES ($1,$2)', [id, assignTo]);
        created++;
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
        const p = summarize(l, lpMap.get(k), spMap.get(k), upMap.get(k), exMap.get(k), grMap.get(k));
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
