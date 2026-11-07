'use strict';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SENTENCES = 200;
const MAX_UNITS = 30;
const UNIT_ID_RE = /^[a-z0-9]{4,24}$/i;
const crypto = require('crypto');
const Grammar = require('../public/grammar-core'); // understands [is|are|am] gaps (shared with the editor and the app)
const newUnitId = () => crypto.randomBytes(5).toString('hex');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** Number of playable word tiles in a sentence (same rule as the client tokenizer). */
function countWords(en) {
  return String(en)
    .trim()
    .split(/\s+/)
    .map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean).length;
}

const str = v => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/**
 * Validates and normalises lesson input from the admin API.
 * Returns { lesson } on success or { errors: [..] } on failure.
 */
function validateLesson(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { errors: ['Lesson must be an object.'] };

  const title = str(input.title);
  if (!title) errors.push('Title is required.');
  else if (title.length > 80) errors.push('Title must be 80 characters or fewer.');

  const slug = str(input.slug).toLowerCase() || slugify(title);
  if (!slug) errors.push('Link name (slug) is required.');
  else if (!SLUG_RE.test(slug) || slug.length > 60)
    errors.push('Link name may use only a-z, 0-9 and single dashes (max 60 characters).');

  const level = str(input.level).toUpperCase() || 'A1';
  if (!LEVELS.includes(level)) errors.push(`Level must be one of ${LEVELS.join(', ')}.`);

  const description = str(input.description);
  if (description.length > 200) errors.push('Description must be 200 characters or fewer.');

  const emoji = str(input.emoji) || '📘';
  if ([...emoji].length > 8) errors.push('Icon must be a single emoji.');

  const published = input.published === undefined ? true : Boolean(input.published);

  const visibility = input.visibility === 'assigned' ? 'assigned' : 'public';
  let assignedUserIds;
  if (input.assignedUserIds !== undefined) {
    if (!Array.isArray(input.assignedUserIds) || !input.assignedUserIds.every(x => typeof x === 'string'))
      errors.push('Assigned students must be a list.');
    else if (input.assignedUserIds.length > 5000) errors.push('Too many assigned students.');
    else assignedUserIds = [...new Set(input.assignedUserIds)];
  }

  // Units: [{ id?, title, sentences:[{en}] }]. A plain "sentences" list becomes one unit.
  let rawUnits = input.units;
  if (!Array.isArray(rawUnits) || rawUnits.length === 0) {
    rawUnits = Array.isArray(input.sentences) && input.sentences.length ? [{ title: 'Unit 1', sentences: input.sentences }] : [];
  }
  const units = [];
  const seenText = new Map();
  const seenIds = new Set();
  let total = 0;
  if (rawUnits.length === 0) errors.push('Add at least one sentence.');
  else if (rawUnits.length > MAX_UNITS) errors.push(`A lesson can have at most ${MAX_UNITS} units.`);
  else {
    rawUnits.forEach((u, ui) => {
      const un = ui + 1;
      const utitle = str(u && u.title) || `Unit ${un}`;
      if (utitle.length > 60) errors.push(`Unit ${un}: title must be 60 characters or fewer.`);
      let id = typeof (u && u.id) === 'string' && UNIT_ID_RE.test(u.id) ? u.id : newUnitId();
      while (seenIds.has(id)) id = newUnitId();
      seenIds.add(id);
      const list = Array.isArray(u && u.sentences) ? u.sentences : [];
      if (list.length > MAX_SENTENCES) { errors.push(`Unit ${un} (${utitle}): at most ${MAX_SENTENCES} sentences.`); return; }
      if (!list.length) errors.push(`Unit ${un} (${utitle}): add at least one sentence.`);
      const out = [];
      list.forEach((sn, i) => {
        const where = rawUnits.length > 1 ? `Unit ${un}, sentence ${i + 1}` : `Sentence ${i + 1}`;
        // A line may carry one grammar gap, written like: She [is|are|am] reading a book.
        const parsed = Grammar.parseLine(typeof sn === 'string' ? sn : sn && typeof sn.en === 'string' ? sn.en : '');
        if (parsed.error) return errors.push(`${where}: ${parsed.error}`);
        const en = str(parsed.en);
        let gap = parsed.gap;
        if (!gap && sn && typeof sn === 'object' && sn.gap !== undefined && sn.gap !== null) {
          const checked = Grammar.checkGap(sn.gap, en);
          if (checked.error) return errors.push(`${where}: ${checked.error}`);
          gap = checked.gap;
        }
        if (!en) return errors.push(`${where}: English text is required.`);
        if (en.length > 200) return errors.push(`${where}: must be 200 characters or fewer.`);
        if (!/\p{Script=Latin}/u.test(en)) return errors.push(`${where}: must contain English words.`);
        if (countWords(en) < 2) return errors.push(`${where}: needs at least 2 words.`);
        if (countWords(en) > 20) return errors.push(`${where}: has more than 20 words - split it up.`);
        if (seenText.has(en)) return errors.push(`${where}: this sentence is already used (${seenText.get(en)}).`);
        seenText.set(en, where);
        out.push(gap ? { en, gap } : { en });
      });
      total += out.length;
      units.push({ id, title: utitle, sentences: out });
    });
    if (total > MAX_SENTENCES) errors.push(`A lesson can have at most ${MAX_SENTENCES} sentences in total.`);
  }
  const sentences = units.flatMap(u => u.sentences);

  if (errors.length) return { errors };
  return { lesson: { title, slug, level, description, emoji, published, visibility, units, sentences }, assignedUserIds };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates user fields. Pass { requirePassword:false } when the password is optional (admin edits). */
function validateUser(input, { requirePassword = true, partial = false } = {}) {
  const errors = [];
  const out = {};
  if (!input || typeof input !== 'object') return { errors: ['Invalid data.'] };

  if (!partial || input.name !== undefined) {
    const name = str(input.name);
    if (name.length < 2) errors.push('Please enter your name (at least 2 letters).');
    else if (name.length > 60) errors.push('Name must be 60 characters or fewer.');
    else out.name = name;
  }
  if (!partial || input.email !== undefined) {
    const email = str(input.email).toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) errors.push('Please enter a valid email address.');
    else out.email = email;
  }
  if (input.password !== undefined && input.password !== '') {
    const pw = input.password;
    if (typeof pw !== 'string' || pw.length < 8) errors.push('Password must be at least 8 characters.');
    else if (pw.length > 128) errors.push('Password must be 128 characters or fewer.');
    else out.password = pw;
  } else if (requirePassword) {
    errors.push('Password must be at least 8 characters.');
  }
  if (partial && input.disabled !== undefined) out.disabled = Boolean(input.disabled);
  return errors.length ? { errors } : { user: out };
}

module.exports = { newUnitId, validateLesson, validateUser, slugify, countWords, LEVELS, SLUG_RE };
