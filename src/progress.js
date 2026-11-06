'use strict';

/** Stars for one solved sentence: perfect = 3, 1-2 mistakes/hints = 2, more = 1. */
const starsFor = (mistakes, hints) => {
  const p = mistakes + hints;
  return p === 0 ? 3 : p <= 2 ? 2 : 1;
};

/** The lesson's units (older rows without units are treated as one unit). */
const unitsOf = lesson => (Array.isArray(lesson.units) && lesson.units.length
  ? lesson.units
  : [{ id: 'main', title: 'Unit 1', sentences: lesson.sentences || [] }]);

/**
 * Combines a lesson with one student's progress.
 * @param lesson   row with .units / .sentences
 * @param lp       lesson_progress row (or undefined)
 * @param solved   Map(sentenceText -> stars) for this lesson
 * @param unitRows Map(unitId -> unit_progress row) for this lesson
 */
function summarize(lesson, lp, solved, unitRows) {
  solved = solved || new Map();
  unitRows = unitRows || new Map();
  let prevDone = true;
  const units = unitsOf(lesson).map(u => {
    const total = u.sentences.length;
    let done = 0, stars = 0;
    for (const s of u.sentences) {
      const st = solved.get(s.en);
      if (st) { done++; stars += st; }
    }
    const row = unitRows.get(u.id);
    const learned = Boolean(row && row.learned_at);
    const completed = total > 0 && done === total;
    const locked = !prevDone;
    prevDone = completed;
    return {
      id: u.id,
      title: u.title,
      total,
      solved: done,
      stars,
      maxStars: total * 3,
      learned,
      learnIndex: row ? Math.min(row.learn_index, Math.max(0, total - 1)) : 0,
      completed,
      locked,
      status: completed ? 'completed' : learned ? 'building' : row ? 'learning' : 'new',
    };
  });

  const total = units.reduce((a, u) => a + u.total, 0);
  const done = units.reduce((a, u) => a + u.solved, 0);
  const stars = units.reduce((a, u) => a + u.stars, 0);
  const completed = total > 0 && done === total;
  const anyLearned = units.some(u => u.learned);
  const current = units.findIndex(u => !u.completed);
  const status = completed ? 'completed' : done > 0 || anyLearned ? 'building' : lp || unitRows.size ? 'learning' : 'new';
  return {
    total,
    solved: done,
    stars,
    maxStars: total * 3,
    learned: units.every(u => u.learned),
    completed,
    unitsTotal: units.length,
    unitsCompleted: units.filter(u => u.completed).length,
    currentUnit: current < 0 ? null : current,
    completedAt: lp ? lp.completed_at : null,
    startedAt: lp ? lp.started_at : null,
    lastActivityAt: lp ? lp.last_activity_at : null,
    timeSpent: lp ? lp.time_spent_sec : 0,
    status,
    units,
  };
}

/** Groups unit_progress rows into Map(lessonId -> Map(unitId -> row)). */
function groupUnits(rows, key = 'lesson_id') {
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r[key])) out.set(r[key], new Map());
    out.get(r[key]).set(r.unit_id, r);
  }
  return out;
}

/** Groups sentence_progress rows into Map(lessonId -> Map(sentence -> stars)). */
function groupSolved(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.lesson_id)) out.set(r.lesson_id, new Map());
    out.get(r.lesson_id).set(r.sentence, r.stars);
  }
  return out;
}

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

module.exports = { starsFor, summarize, unitsOf, groupSolved, groupUnits, streak, VISIBLE_SQL };
