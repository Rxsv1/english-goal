/* WordStack - progress rules shared by the server and the browser.
 *
 * The browser keeps the student's whole world in memory and on the device, so every screen opens instantly.
 * It needs the exact same rules as the server to work out stars, units and "extra" without waiting for the network.
 * Keeping them in one file means the two can never disagree (see test/api.test.js, which checks they match).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProgressCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Stars for one solved sentence: perfect = 3, 1-2 mistakes/hints = 2, more = 1. */
  const starsFor = (mistakes, hints) => {
    const p = mistakes + hints;
    return p === 0 ? 3 : p <= 2 ? 2 : 1;
  };

  /** The lesson's units (older rows without units are treated as one unit). */
  const unitsOf = lesson => (Array.isArray(lesson.units) && lesson.units.length
    ? lesson.units
    : [{ id: 'main', title: 'Unit 1', sentences: Array.isArray(lesson.sentences) ? lesson.sentences : [] }]);

  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0); // never lets NaN reach the screen

  /**
   * Combines a lesson with one student's progress.
   * @param lesson   row with .units / .sentences
   * @param lp       lesson_progress row (or undefined)
   * @param solved   Map(sentenceText -> best stars) for this lesson
   * @param unitRows Map(unitId -> unit_progress row) for this lesson
   * @param extra    Map(sentenceText -> extra stars earned by practising again) for this lesson
   */
  function summarize(lesson, lp, solved, unitRows, extra) {
    solved = solved || new Map();
    unitRows = unitRows || new Map();
    extra = extra || new Map();
    let prevDone = true;
    const units = unitsOf(lesson).map(u => {
      const list = Array.isArray(u.sentences) ? u.sentences : [];
      const total = list.length;
      let done = 0, stars = 0, bonus = 0;
      for (const s of list) {
        const st = solved.get(s.en);
        if (st) { done++; stars += st; bonus += extra.get(s.en) || 0; }
      }
      const row = unitRows.get(u.id);
      const learned = Boolean(row && row.learned_at);
      const completed = total > 0 && done === total;
      // A unit is only locked while it is brand new. Anything the student already started or finished
      // stays open (e.g. when a teacher adds a unit before it), so they can always go back.
      const locked = !prevDone && !completed && !row && done === 0;
      prevDone = completed;
      return {
        id: u.id,
        title: u.title,
        total,
        solved: done,
        stars,
        extra: bonus,
        maxStars: total * 3,
        learned,
        learnIndex: row ? Math.max(0, Math.min(num(row.learn_index), total - 1)) : 0,
        completed,
        locked,
        status: completed ? 'completed' : learned ? 'building' : row ? 'learning' : 'new',
      };
    });

    const total = units.reduce((a, u) => a + u.total, 0);
    const done = units.reduce((a, u) => a + u.solved, 0);
    const stars = units.reduce((a, u) => a + u.stars, 0);
    const bonus = units.reduce((a, u) => a + u.extra, 0);
    const completed = total > 0 && done === total;
    const anyLearned = units.some(u => u.learned);
    const current = units.findIndex(u => !u.completed);
    const status = completed ? 'completed' : done > 0 || anyLearned ? 'building' : lp || unitRows.size ? 'learning' : 'new';
    return {
      total,
      solved: done,
      stars,
      extra: bonus,
      maxStars: total * 3,
      learned: units.every(u => u.learned),
      completed,
      unitsTotal: units.length,
      unitsCompleted: units.filter(u => u.completed).length,
      currentUnit: current < 0 ? null : current,
      completedAt: lp ? lp.completed_at : null,
      startedAt: lp ? lp.started_at : null,
      lastActivityAt: lp ? lp.last_activity_at : null,
      timeSpent: lp ? num(lp.time_spent_sec) : 0,
      status,
      units,
    };
  }

  /* ------------------------------------------------------------------ */
  /* The student's own copy of a lesson (what GET /api/app returns)      */
  /*   { slug, title, ..., units:[{ id, title, sentences:[{ en, stars,   */
  /*     extra }] }], lp: {..}|null, unitRows: [{ unit_id, learn_index,  */
  /*     learned_at }] }                                                 */
  /* ------------------------------------------------------------------ */

  /** Progress summary for one lesson copy. */
  function modelOf(raw) {
    const solved = new Map(), extra = new Map();
    for (const u of raw.units || []) for (const s of u.sentences || []) {
      if (s.stars) solved.set(s.en, s.stars);
      if (s.extra) extra.set(s.en, s.extra);
    }
    const rows = new Map((raw.unitRows || []).map(r => [r.unit_id, r]));
    return summarize({ units: raw.units }, raw.lp || undefined, solved, rows, extra);
  }

  function touchLesson(raw, seconds, now) {
    if (!raw.lp) raw.lp = { started_at: now, last_activity_at: now, completed_at: null, time_spent_sec: 0 };
    raw.lp.last_activity_at = now;
    raw.lp.time_spent_sec = num(raw.lp.time_spent_sec) + num(seconds);
  }

  /** Cards step: the progress only ever moves forward. */
  function applyLearn(raw, unitId, index, done, seconds, now) {
    touchLesson(raw, seconds, now);
    let row = (raw.unitRows = raw.unitRows || []).find(r => r.unit_id === unitId);
    if (!row) raw.unitRows.push(row = { unit_id: unitId, learn_index: 0, learned_at: null });
    row.learn_index = Math.max(num(row.learn_index), num(index));
    if (done && !row.learned_at) row.learned_at = now;
  }

  /**
   * A sentence was built. Same rules as the server: the best result is kept and can never go down;
   * a better result than before is added as "extra" on top of what the student first achieved.
   * Updates the lesson copy and the overall stats in place and returns what happened.
   */
  function applySolve(raw, stats, sentence, stars, seconds, now) {
    let found = null;
    for (const u of raw.units || []) for (const s of u.sentences || []) if (s.en === sentence) found = s;
    if (!found) return null;
    const lessonWasDone = modelOf(raw).completed;
    const before = num(found.stars);
    const replay = before > 0;
    const extra = replay ? Math.max(0, stars - before) : 0;
    found.stars = Math.max(before, stars);
    found.extra = num(found.extra) + extra;
    touchLesson(raw, seconds, now);
    const m = modelOf(raw);
    if (stats) {
      if (!replay) stats.sentencesSolved = num(stats.sentencesSolved) + 1;
      stats.stars = num(stats.stars) + found.stars - before;
      stats.extraStars = num(stats.extraStars) + extra;
      stats.timeSpent = num(stats.timeSpent) + num(seconds);
      if (!stats.streak) stats.streak = 1;
      if (m.completed && !lessonWasDone && !raw.lp.completed_at) { raw.lp.completed_at = now; stats.lessonsCompleted = num(stats.lessonsCompleted) + 1; }
    }
    return { stars, best: found.stars, extra, replay, completed: m.completed };
  }

  return { starsFor, unitsOf, summarize, modelOf, applyLearn, applySolve };
});
