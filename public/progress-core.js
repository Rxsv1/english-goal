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
   * @param grammar  Set(sentenceText) of sentences whose grammar gap the student has answered
   * @param quiz     { units: Set|Array of unit ids whose quiz is passed, final: true when the final quiz is passed }
   *
   * A unit is finished when everything is built, every grammar gap is answered AND its quiz is passed.
   * A lesson is finished when every unit is finished AND (for a lesson with more than one unit) the final quiz is passed.
   */
  function summarize(lesson, lp, solved, unitRows, extra, grammar, quiz) {
    solved = solved || new Map();
    unitRows = unitRows || new Map();
    extra = extra || new Map();
    grammar = grammar || new Set();
    const quizUnits = new Set(quiz && quiz.units ? [...quiz.units] : []);
    const unitList = unitsOf(lesson);
    const hasFinal = unitList.length > 1; // one unit: its own quiz is the lesson's quiz
    let prevDone = true;
    const units = unitList.map(u => {
      const list = Array.isArray(u.sentences) ? u.sentences : [];
      const total = list.length;
      let done = 0, stars = 0, bonus = 0;
      for (const s of list) {
        const st = solved.get(s.en);
        if (st) { done++; stars += st; bonus += extra.get(s.en) || 0; }
      }
      const row = unitRows.get(u.id);
      const learned = Boolean(row && row.learned_at);
      // A unit is finished when every sentence is built AND every grammar gap (if the teacher added any) is answered.
      const grammarTotal = list.filter(x => x.gap).length;
      const grammarDone = list.filter(x => x.gap && grammar.has(x.en)).length;
      const built = total > 0 && done === total && grammarDone === grammarTotal;
      const quizPassed = quizUnits.has(u.id);
      const completed = built && quizPassed;
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
        grammarTotal,
        grammarDone,
        grammarReady: total > 0 && done === total && grammarDone < grammarTotal, // everything built, the grammar step is next
        quizPassed,
        quizReady: built && !quizPassed, // built and grammar done: the unit quiz is next
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
    const unitsDone = total > 0 && units.every(u => u.completed);
    const finalPassed = hasFinal ? Boolean(quiz && quiz.final) : unitsDone;
    const completed = unitsDone && finalPassed;
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
      hasFinal,
      finalPassed: hasFinal && finalPassed,
      finalReady: hasFinal && unitsDone && !finalPassed, // every unit finished: the final quiz is next
      grammarTotal: units.reduce((a, u) => a + u.grammarTotal, 0),
      grammarDone: units.reduce((a, u) => a + u.grammarDone, 0),
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
    const solved = new Map(), extra = new Map(), grammar = new Set();
    for (const u of raw.units || []) for (const s of u.sentences || []) {
      if (s.stars) solved.set(s.en, s.stars);
      if (s.extra) extra.set(s.en, s.extra);
      if (s.gdone) grammar.add(s.en);
    }
    const rows = new Map((raw.unitRows || []).map(r => [r.unit_id, r]));
    const quiz = { units: (raw.units || []).filter(u => u.quizPassed).map(u => u.id), final: Boolean(raw.finalPassed) };
    return summarize({ units: raw.units }, raw.lp || undefined, solved, rows, extra, grammar, quiz);
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
   * A sentence was built. Same rules as the server: the stars from the first time are kept exactly as they were;
   * building a sentence again is practice and never changes the stars (so "extra" is always 0).
   * Updates the lesson copy and the overall stats in place and returns what happened.
   */
  function applySolve(raw, stats, sentence, stars, seconds, now) {
    let found = null;
    for (const u of raw.units || []) for (const s of u.sentences || []) if (s.en === sentence) found = s;
    if (!found) return null;
    const lessonWasDone = modelOf(raw).completed;
    const before = num(found.stars);
    const replay = before > 0;
    const extra = 0;
    found.stars = replay ? before : stars;
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

  /**
   * A grammar gap was answered correctly. Only possible once the sentence has been built (same rule as the server).
   * Returns null when it does not apply, otherwise { completed } for the whole lesson.
   */
  function applyGrammar(raw, stats, sentence, seconds, now) {
    let found = null;
    for (const u of raw.units || []) for (const s of u.sentences || []) if (s.en === sentence && s.gap) found = s;
    if (!found || !num(found.stars)) return null;
    const lessonWasDone = modelOf(raw).completed;
    found.gdone = true;
    touchLesson(raw, seconds, now);
    const m = modelOf(raw);
    if (stats) {
      stats.timeSpent = num(stats.timeSpent) + num(seconds);
      if (!stats.streak) stats.streak = 1;
      if (m.completed && !lessonWasDone && !raw.lp.completed_at) { raw.lp.completed_at = now; stats.lessonsCompleted = num(stats.lessonsCompleted) + 1; }
    }
    return { completed: m.completed };
  }

  /**
   * The Arabic -> English step was solved for a sentence that was already built. It gives no stars and is not needed to finish a unit; it only
   * remembers that the step was done (same rule as the server). Returns null when it does not apply, otherwise { first }.
   */
  function applyArb(raw, stats, sentence, seconds, now) {
    let found = null;
    for (const u of raw.units || []) for (const s of u.sentences || []) if (s.en === sentence && s.arq) found = s;
    if (!found || !num(found.stars)) return null;
    const first = !found.arbDone;
    found.arbDone = true;
    touchLesson(raw, seconds, now);
    if (stats) {
      stats.timeSpent = num(stats.timeSpent) + num(seconds);
      if (!stats.streak) stats.streak = 1;
    }
    return { first };
  }

  /**
   * A quiz was passed (scope = 'final' or a unit id). Only passing changes anything; a failed attempt is just a try.
   * Returns { completed } for the whole lesson.
   */
  function applyQuiz(raw, stats, scope, passed, seconds, now) {
    const lessonWasDone = modelOf(raw).completed;
    touchLesson(raw, seconds, now);
    if (passed) {
      if (scope === 'final') raw.finalPassed = true;
      else { const u = (raw.units || []).find(x => x.id === scope); if (u) u.quizPassed = true; }
    }
    const m = modelOf(raw);
    if (stats) {
      stats.timeSpent = num(stats.timeSpent) + num(seconds);
      if (m.completed && !lessonWasDone && !raw.lp.completed_at) { raw.lp.completed_at = now; stats.lessonsCompleted = num(stats.lessonsCompleted) + 1; }
    }
    return { completed: m.completed, passed: Boolean(passed) };
  }

  return { starsFor, unitsOf, summarize, modelOf, applyLearn, applySolve, applyGrammar, applyArb, applyQuiz };
});
