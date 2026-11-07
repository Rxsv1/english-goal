'use strict';

// The scoring rules live in public/progress-core.js so the browser (which keeps each student's progress
// on the device to feel instant) and the server always use exactly the same code.
const { starsFor, unitsOf, summarize } = require('../public/progress-core');

/** Groups unit_progress rows into Map(lessonId -> Map(unitId -> row)). */
function groupUnits(rows, key = 'lesson_id') {
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r[key])) out.set(r[key], new Map());
    out.get(r[key]).set(r.unit_id, r);
  }
  return out;
}

/**
 * Groups sentence_progress rows (needs sentence, stars, extra; plus lesson_id or user_id) into
 * Map(key -> Map(sentence -> value)). `field` is 'stars' (best result) or 'extra' (earned by retrying).
 */
function groupSolved(rows, field = 'stars', key = 'lesson_id') {
  const out = new Map();
  for (const r of rows) {
    if (field === 'extra' && !r.extra) continue;
    if (!out.has(r[key])) out.set(r[key], new Map());
    out.get(r[key]).set(r.sentence, r[field]);
  }
  return out;
}

/** Groups rows (needs sentence, gdone and lesson_id or user_id) into Map(key -> Set(sentences with the grammar answered)). */
function groupGrammar(rows, key = 'lesson_id') {
  const out = new Map();
  for (const r of rows) {
    if (!r.gdone) continue;
    if (!out.has(r[key])) out.set(r[key], new Set());
    out.get(r[key]).add(r.sentence);
  }
  return out;
}

/** SQL expression for the extra stars of a sentence_progress row. */
const EXTRA_SQL = 'GREATEST(stars - COALESCE(base_stars, stars), 0)';

/** Consecutive days (UTC) with activity, ending today or yesterday. `days` = sorted list of 'YYYY-MM-DD' desc. */
function streak(days) {
  if (!days.length) return 0;
  const dayMs = 86400000;
  const today = Math.floor(Date.now() / dayMs);
  const nums = days.map(d => Math.floor(Date.parse(d + 'T00:00:00Z') / dayMs));
  if (today - nums[0] > 1) return 0;
  let n = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i - 1] - nums[i] === 1) n++;
    else break;
  }
  return n;
}

/** SQL fragment: lessons a given user ($1) may see. */
const VISIBLE_SQL = `l.published AND (l.visibility = 'public' OR EXISTS (
  SELECT 1 FROM lesson_assignments a WHERE a.lesson_id = l.id AND a.user_id = $1))`;

module.exports = { starsFor, summarize, unitsOf, groupSolved, groupGrammar, groupUnits, streak, EXTRA_SQL, VISIBLE_SQL };
