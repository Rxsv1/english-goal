'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');
const seed = require('./seed');
const { newUnitId } = require('./validate');

function createPool() {
  if (!process.env.DATABASE_URL && !process.env.PGHOST) {
    throw new Error(
      'DATABASE_URL is not set. Create a PostgreSQL database in CranL and add its connection string ' +
      'as the DATABASE_URL environment variable.'
    );
  }
  const ssl = /^(1|true|require)$/i.test(process.env.PGSSL || '') ? { rejectUnauthorized: false } : undefined;
  // pg also reads PGPASSWORD / PGUSER / PGHOST etc. for anything missing from DATABASE_URL.
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: 10,
    connectionTimeoutMillis: 10000, // fail fast instead of queueing forever when the database is unreachable
    idleTimeoutMillis: 30000,
    statement_timeout: 30000,       // one runaway query must not hold a connection for ever
  });
}

/** Creates or upgrades all tables. Safe to run on every start. */
async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(84211)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lessons (
        id          TEXT PRIMARY KEY,
        slug        TEXT UNIQUE NOT NULL,
        title       TEXT NOT NULL,
        level       TEXT NOT NULL DEFAULT 'A1',
        description TEXT NOT NULL DEFAULT '',
        emoji       TEXT NOT NULL DEFAULT '📘',
        published   BOOLEAN NOT NULL DEFAULT TRUE,
        position    INTEGER NOT NULL DEFAULT 0,
        sentences   JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE lessons ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';

      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        disabled      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at  TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS lesson_assignments (
        lesson_id  TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (lesson_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS lesson_assignments_user ON lesson_assignments(user_id);

      CREATE TABLE IF NOT EXISTS lesson_progress (
        user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id        TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        learn_index      INTEGER NOT NULL DEFAULT 0,
        learned_at       TIMESTAMPTZ,
        completed_at     TIMESTAMPTZ,
        started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        time_spent_sec   INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, lesson_id)
      );

      CREATE TABLE IF NOT EXISTS sentence_progress (
        user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id       TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        sentence        TEXT NOT NULL,
        stars           INTEGER NOT NULL,
        best_mistakes   INTEGER NOT NULL DEFAULT 0,
        best_hints      INTEGER NOT NULL DEFAULT 0,
        times_solved    INTEGER NOT NULL DEFAULT 1,
        total_mistakes  INTEGER NOT NULL DEFAULT 0,
        total_hints     INTEGER NOT NULL DEFAULT 0,
        first_solved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_solved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id, sentence)
      );

      CREATE TABLE IF NOT EXISTS events (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id  TEXT REFERENCES lessons(id) ON DELETE SET NULL,
        type       TEXT NOT NULL,
        data       JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS events_user_time ON events(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS events_time ON events(created_at DESC);
      CREATE INDEX IF NOT EXISTS events_cid ON events((data->>'cid')) WHERE data ? 'cid';

      ALTER TABLE lessons ADD COLUMN IF NOT EXISTS units JSONB;
      CREATE TABLE IF NOT EXISTS unit_progress (
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id   TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        unit_id     TEXT NOT NULL,
        learn_index INTEGER NOT NULL DEFAULT 0,
        learned_at  TIMESTAMPTZ,
        started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, lesson_id, unit_id)
      );

      -- Retries: "stars" is always the best result ever; "base_stars" is what the student got the first
      -- time. The difference is the "extra" earned by practising again. Neither can ever go down.
      ALTER TABLE sentence_progress ADD COLUMN IF NOT EXISTS base_stars INTEGER;
      UPDATE sentence_progress SET base_stars = stars WHERE base_stars IS NULL;

      -- Grammar step: a sentence with a gap is answered once (the right word chosen); mistakes are kept for the teacher.
      ALTER TABLE sentence_progress ADD COLUMN IF NOT EXISTS grammar_done BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE sentence_progress ADD COLUMN IF NOT EXISTS grammar_mistakes INTEGER NOT NULL DEFAULT 0;

      -- Speeds up the "already finished this unit/lesson?" checks as the activity log grows.
      CREATE INDEX IF NOT EXISTS events_user_lesson_type ON events(user_id, lesson_id, type);
    `);

    // Upgrade: lessons made before units existed become a single unit, keeping students' card progress.
    const old = await client.query('SELECT id FROM lessons WHERE units IS NULL');
    for (const { id } of old.rows) {
      const unitId = newUnitId();
      await client.query(
        `UPDATE lessons SET units = jsonb_build_array(jsonb_build_object('id', $2::text, 'title', 'Unit 1', 'sentences', sentences))
         WHERE id = $1 AND units IS NULL`, [id, unitId]);
      await client.query(
        `INSERT INTO unit_progress (user_id, lesson_id, unit_id, learn_index, learned_at, started_at)
         SELECT user_id, lesson_id, $2, learn_index, learned_at, started_at FROM lesson_progress WHERE lesson_id = $1
         ON CONFLICT DO NOTHING`, [id, unitId]);
    }
    if (old.rows.length) console.log(`[db] Upgraded ${old.rows.length} lessons to units`);

    // Starter lessons go into a brand-new database only. A teacher who deleted every lesson on purpose
    // (and already has students) must not see them come back after a restart.
    const { rows } = await client.query('SELECT (SELECT COUNT(*) FROM lessons)::int AS lessons, (SELECT COUNT(*) FROM users)::int AS users');
    if (rows[0].lessons === 0 && rows[0].users === 0) {
      for (const [i, l] of seed.entries()) {
        await client.query(
          `INSERT INTO lessons (id, slug, title, level, description, emoji, published, position, units, sentences)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
          [crypto.randomUUID(), l.slug, l.title, l.level, l.description, l.emoji, l.published, i,
           JSON.stringify(l.units), JSON.stringify(l.units.flatMap(u => u.sentences))]
        );
      }
      console.log(`[db] Added ${seed.length} starter lessons`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(84211)').catch(() => {});
    client.release();
  }
}

module.exports = { createPool, migrate };
