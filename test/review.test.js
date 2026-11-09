'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/review-core.js');

test('the schedule is 1, 3, 7, 14 and 30 days, then the sentence is finished', () => {
  assert.deepEqual(R.INTERVALS, [1, 3, 7, 14, 30]);
  // a new weak sentence waits 1 day; every right review moves it to the next interval
  let step = { stage: 0 };
  const days = [];
  for (let i = 0; i < 5; i++) { step = R.afterReview(step.stage, true); days.push(step.days); }
  assert.deepEqual(days, [3, 7, 14, 30, null], 'stage 0 -> 3 days, then 7, 14, 30, and finished');
  assert.equal(step.stage, R.FINISHED);
  // a finished sentence that is answered right stays finished
  assert.deepEqual(R.afterReview(R.FINISHED, true), { stage: R.FINISHED, days: null });
});

test('a wrong review always goes back to 1 day', () => {
  for (const stage of [0, 1, 2, 3, 4, 5]) assert.deepEqual(R.afterReview(stage, false), { stage: 0, days: 1 }, `from stage ${stage}`);
});

test('bad input never breaks the schedule', () => {
  for (const weird of [undefined, null, NaN, -4, 99, 'x', 1.5]) {
    const r = R.afterReview(weird, true);
    assert.ok(r.stage >= 0 && r.stage <= R.FINISHED, String(weird));
  }
});

test('right means no mistake and no hint', () => {
  assert.equal(R.isCorrect(0, 0), true);
  assert.equal(R.isCorrect(undefined, undefined), true);
  assert.equal(R.isCorrect(1, 0), false);
  assert.equal(R.isCorrect(0, 2), false);
});

test('a session has at most 10 sentences, most overdue first, and mixes Build and Grammar', () => {
  const due = Array.from({ length: 25 }, (_, i) => ({ slug: 'l', sentence: 's' + i, stage: 0, hasGap: i % 2 === 0 }));
  let n = 0; const seq = () => { n = (n * 7 + 3) % 10; return n / 10; }; // a repeatable "random"
  const s = R.pickSession(due, seq);
  assert.equal(s.length, 10);
  assert.deepEqual(new Set(s.map(x => x.sentence)), new Set(due.slice(0, 10).map(x => x.sentence)), 'the first 10 (most overdue) are asked');
  assert.ok(s.some(x => x.kind === 'grammar') && s.some(x => x.kind === 'build'), 'both kinds appear');
  for (const x of s) if (!x.hasGap) assert.equal(x.kind, 'build', 'no gap = always a Build question');
  // fewer than 10 due: just those
  assert.equal(R.pickSession(due.slice(0, 3), seq).length, 3);
  assert.deepEqual(R.pickSession([], seq), []);
  assert.deepEqual(R.pickSession(undefined, seq), []);
});

test('when every random draw says "build", a session with gaps still gets a Grammar question', () => {
  const due = [{ sentence: 'a', hasGap: true }, { sentence: 'b', hasGap: true }, { sentence: 'c', hasGap: false }];
  const s = R.pickSession(due, () => 0.99);
  assert.equal(s.filter(x => x.kind === 'grammar').length, 1);
  // a single gap sentence is left to chance (no forcing)
  assert.equal(R.pickSession([{ sentence: 'a', hasGap: true }], () => 0.99)[0].kind, 'build');
});

test('texts for the result screen and the teacher', () => {
  assert.equal(R.whenText(1), 'next review tomorrow');
  assert.equal(R.whenText(7), 'next review in 7 days');
  assert.equal(R.whenText(null), 'finished all reviews');
});
