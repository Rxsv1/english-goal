'use strict';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SENTENCES = 100;

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

  let slug = str(input.slug).toLowerCase() || slugify(title);
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

  const sentences = [];
  if (!Array.isArray(input.sentences) || input.sentences.length === 0) {
    errors.push('Add at least one sentence.');
  } else if (input.sentences.length > MAX_SENTENCES) {
    errors.push(`A lesson can have at most ${MAX_SENTENCES} sentences.`);
  } else {
    input.sentences.forEach((s, i) => {
      const en = str(s && s.en);
      const n = i + 1;
      if (!en) return errors.push(`Sentence ${n}: English text is required.`);
      if (en.length > 200) return errors.push(`Sentence ${n}: must be 200 characters or fewer.`);
      if (!/\p{Script=Latin}/u.test(en)) return errors.push(`Sentence ${n}: must contain English words.`);
      if (countWords(en) < 2) return errors.push(`Sentence ${n}: needs at least 2 words.`);
      if (countWords(en) > 20) return errors.push(`Sentence ${n}: has more than 20 words - split it up.`);
      sentences.push({ en });
    });
  }

  if (errors.length) return { errors };
  return { lesson: { title, slug, level, description, emoji, published, sentences } };
}

module.exports = { validateLesson, slugify, countWords, LEVELS, SLUG_RE };
