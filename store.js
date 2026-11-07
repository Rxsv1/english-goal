'use strict';

/**
 * Lesson storage.
 *  - DATABASE_URL set  -> PostgreSQL (use this on CranL: data survives redeploys)
 *  - otherwise         -> JSON file in DATA_DIR (handy for local development)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seed = require('./seed');

class ConflictError extends Error {}

const toPublic = (l, full) => {
  const out = {
    id: l.id,
    slug: l.slug,
    title: l.title,
    level: l.level,
    description: l.description,
    emoji: l.emoji,
    published: l.published,
    position: l.position,
    count: l.sentences.length,
    updatedAt: l.updatedAt,
  };
  if (full) out.sentences = l.sentences;
  return out;
};

/* ------------------------------------------------------------------ */
/* File store                                                          */
/* ------------------------------------------------------------------ */
class FileStore {
  constructor(dir) {
    this.file = path.join(dir, 'lessons.json');
    fs.mkdirSync(dir, { recursive: true });
    this.lessons = [];
  }

  async init() {
    if (fs.existsSync(this.file)) {
      this.lessons = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } else {
      const now = new Date().toISOString();
      this.lessons = seed.map((l, i) => ({ ...l, id: crypto.randomUUID(), position: i, createdAt: now, updatedAt: now }));
      this._save();
    }
  }

  _save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.lessons, null, 2));
    fs.renameSync(tmp, this.file);
  }

  _sorted() {
    return [...this.lessons].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }

  async list({ includeDrafts = false } = {}) {
    return this._sorted().filter(l => includeDrafts || l.published).map(l => toPublic(l, false));
  }

  async getBySlug(slug, { includeDrafts = false } = {}) {
    const l = this.lessons.find(x => x.slug === slug && (includeDrafts || x.published));
    return l ? toPublic(l, true) : null;
  }

  async getById(id) {
    const l = this.lessons.find(x => x.id === id);
    return l ? toPublic(l, true) : null;
  }

  async exportAll() {
    return this._sorted().map(l => toPublic(l, true));
  }

  async create(data) {
    if (this.lessons.some(l => l.slug === data.slug)) throw new ConflictError('slug');
    const now = new Date().toISOString();
    const position = this.lessons.reduce((m, l) => Math.max(m, l.position + 1), 0);
    const lesson = { ...data, id: crypto.randomUUID(), position, createdAt: now, updatedAt: now };
    this.lessons.push(lesson);
    this._save();
    return toPublic(lesson, true);
  }

  async update(id, data) {
    const l = this.lessons.find(x => x.id === id);
    if (!l) return null;
    if (this.lessons.some(x => x.slug === data.slug && x.id !== id)) throw new ConflictError('slug');
    Object.assign(l, data, { updatedAt: new Date().toISOString() });
    this._save();
    return toPublic(l, true);
  }

  async remove(id) {
    const before = this.lessons.length;
    this.lessons = this.lessons.filter(l => l.id !== id);
    if (this.lessons.length === before) return false;
    this._save();
    return true;
  }

  async reorder(ids) {
    ids.forEach((id, i) => {
      const l = this.lessons.find(x => x.id === id);
      if (l) l.position = i;
    });
    this._save();
  }
}

/* ------------------------------------------------------------------ */
/* PostgreSQL store                                                    */
/* ------------------------------------------------------------------ */
class PgStore {
  constructor(url) {
    const { Pool } = require('pg');
    const ssl = /^(1|true|require)$/i.test(process.env.PGSSL || '') ? { rejectUnauthorized: false } : undefined;
    this.pool = new Pool({ connectionString: url, ssl, max: 5 });
  }

  async init() {
    await this.pool.query(`
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
      )`);
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS n FROM lessons');
    if (rows[0].n === 0) {
      for (const [i, l] of seed.entries()) await this._insert(l, i);
    }
  }

  _row(r) {
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      level: r.level,
      description: r.description,
      emoji: r.emoji,
      published: r.published,
      position: r.position,
      sentences: r.sentences,
      updatedAt: r.updated_at,
    };
  }

  async _insert(l, position) {
    const { rows } = await this.pool.query(
      `INSERT INTO lessons (id, slug, title, level, description, emoji, published, position, sentences)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
      [crypto.randomUUID(), l.slug, l.title, l.level, l.description, l.emoji, l.published, position, JSON.stringify(l.sentences)]
    );
    return this._row(rows[0]);
  }

  async list({ includeDrafts = false } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM lessons ${includeDrafts ? '' : 'WHERE published'} ORDER BY position, title`
    );
    return rows.map(r => toPublic(this._row(r), false));
  }

  async getBySlug(slug, { includeDrafts = false } = {}) {
    const { rows } = await this.pool.query(
      `SELECT * FROM lessons WHERE slug = $1 ${includeDrafts ? '' : 'AND published'}`,
      [slug]
    );
    return rows[0] ? toPublic(this._row(rows[0]), true) : null;
  }

  async getById(id) {
    const { rows } = await this.pool.query('SELECT * FROM lessons WHERE id = $1', [id]);
    return rows[0] ? toPublic(this._row(rows[0]), true) : null;
  }

  async exportAll() {
    const { rows } = await this.pool.query('SELECT * FROM lessons ORDER BY position, title');
    return rows.map(r => toPublic(this._row(r), true));
  }

  async create(data) {
    try {
      const { rows } = await this.pool.query('SELECT COALESCE(MAX(position) + 1, 0)::int AS p FROM lessons');
      return toPublic(await this._insert(data, rows[0].p), true);
    } catch (e) {
      if (e.code === '23505') throw new ConflictError('slug');
      throw e;
    }
  }

  async update(id, d) {
    try {
      const { rows } = await this.pool.query(
        `UPDATE lessons SET slug=$2, title=$3, level=$4, description=$5, emoji=$6, published=$7,
                sentences=$8::jsonb, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [id, d.slug, d.title, d.level, d.description, d.emoji, d.published, JSON.stringify(d.sentences)]
      );
      return rows[0] ? toPublic(this._row(rows[0]), true) : null;
    } catch (e) {
      if (e.code === '23505') throw new ConflictError('slug');
      throw e;
    }
  }

  async remove(id) {
    const { rowCount } = await this.pool.query('DELETE FROM lessons WHERE id = $1', [id]);
    return rowCount > 0;
  }

  async reorder(ids) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [i, id] of ids.entries()) await client.query('UPDATE lessons SET position=$2 WHERE id=$1', [id, i]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

function createStore() {
  if (process.env.DATABASE_URL) {
    console.log('[store] Using PostgreSQL');
    return new PgStore(process.env.DATABASE_URL);
  }
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  console.warn(`[store] DATABASE_URL not set - using file storage in ${dir}.`);
  console.warn('[store] On CranL, add a PostgreSQL database so lessons survive redeploys.');
  return new FileStore(dir);
}

module.exports = { createStore, ConflictError };
