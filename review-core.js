/* WordStack - the daily review (spaced repetition), shared by the server and the browser.
 *
 * A sentence the student found hard ("weak": mistakes or hints while building, a wrong grammar word, a wrong quiz answer) is put in a review
 * schedule. It comes back after 1 day, then 3, 7, 14 and 30 days. A correct review moves it to the next interval (after the 30-day one it is
 * finished); a wrong review sends it back to 1 day. One review session has up to 10 sentences, mixing Build and Grammar questions.
 * Reviews never change the saved stars.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReviewCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const INTERVALS = [1, 3, 7, 14, 30]; // days until the next review, for stage 0, 1, 2, 3, 4
  const FINISHED = INTERVALS.length;   // the stage of a sentence that has been through every interval
  const MAX_SESSION = 10;

  /**
   * What happens to a scheduled sentence after one review.
   * @param stage   the stage it is at now (0 = a new weak sentence, waiting for its 1-day review)
   * @param correct true when the student answered it right at the first try without hints
   * @returns { stage, days } - days until the next review, or null when the sentence has finished its schedule
   */
  function afterReview(stage, correct) {
    const s = Number.isInteger(stage) ? Math.max(0, Math.min(FINISHED, stage)) : 0;
    if (!correct) return { stage: 0, days: INTERVALS[0] };
    if (s + 1 >= FINISHED) return { stage: FINISHED, days: null };
    return { stage: s + 1, days: INTERVALS[s + 1] };
  }

  /** Right = no mistake and no hint. */
  const isCorrect = (mistakes, hints) => !(Number(mistakes) > 0) && !(Number(hints) > 0);

  /**
   * The sentences of one review session, in the order the student meets them.
   * @param due     due sentences, most overdue first: [{ slug, sentence, stage, hasGap }]
   * @param rnd     a function giving a number in [0, 1) (so tests can be exact)
   * @returns [{ ...item, kind: 'build' | 'grammar' }] - at most 10. A sentence with a grammar gap is asked as Grammar about half of the time;
   *          one without a gap is always a Build question. Two sentences of the same lesson are not forced apart: the order is shuffled.
   */
  function pickSession(due, rnd, max) {
    const random = typeof rnd === 'function' ? rnd : Math.random;
    const items = (Array.isArray(due) ? due : []).slice(0, max || MAX_SESSION).map(x => ({ ...x }));
    const withGap = items.filter(x => x.hasGap);
    items.forEach(x => { x.kind = x.hasGap && random() < 0.5 ? 'grammar' : 'build'; });
    // A session with gaps should really mix: when every question came out the same kind, flip one that can be a Grammar question.
    if (withGap.length >= 2 && items.every(x => x.kind === 'build')) withGap[0].kind = 'grammar';
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  }

  /** "tomorrow", "in 3 days", "done" - for the result screen and the teacher's timeline. */
  function whenText(days) {
    if (days === null || days === undefined) return 'finished all reviews';
    return days === 1 ? 'next review tomorrow' : `next review in ${days} days`;
  }

  return { INTERVALS, FINISHED, MAX_SESSION, afterReview, isCorrect, pickSession, whenText };
});
