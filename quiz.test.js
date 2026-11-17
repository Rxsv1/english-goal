'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Quiz = require('../public/quiz-core.js');

const sentences = [
  { en: "Amdahl's law describes the maximum speedup of a parallel program.", gap: { index: 2, answer: 'describes', options: ['describes', 'describing', 'describe'] } },
  { en: 'Distributed systems connect multiple autonomous computers together.' },
  { en: 'Middleware links distributed nodes into one unified system' },
  { en: 'We need to discuss the results' },
  { en: 'Hello world' },
];

test('a quiz is the same every time for the same seed, and differs between seeds', () => {
  const a = Quiz.build({ sentences, context: sentences, seed: 5 });
  assert.deepEqual(a, Quiz.build({ sentences, context: sentences, seed: 5 }));
  assert.notDeepEqual(a, Quiz.build({ sentences, context: sentences, seed: 6 }));
});

test('every question has distinct options, one right answer, and comes from the lesson', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const qs = Quiz.build({ sentences, context: sentences, seed });
    assert.equal(qs.length, 5, 'one question per sentence');
    for (const q of qs) {
      assert.ok(q.options.length >= 2 && q.options.length <= 3);
      assert.equal(new Set(q.options.map(o => o.toLowerCase())).size, q.options.length, 'options are different');
      assert.ok(q.answer >= 0 && q.answer < q.options.length);
      assert.ok(sentences.some(s => s.en === q.sentence));
      if (q.type === 'listen' || q.type === 'order') assert.equal(q.options[q.answer], q.sentence);
      if (q.type === 'word') assert.equal(q.before.length + q.options[q.answer].length + q.after.length >= q.sentence.length - 2, true);
      // the wrong "order" sentences really are different from every sentence of the lesson
      if (q.type === 'order') q.options.forEach((o, i) => { if (i !== q.answer) assert.ok(!sentences.some(s => s.en.toLowerCase() === o.toLowerCase())); });
    }
  }
});

test('a phone that cannot speak gets no listening questions; a grammar gap is used as the missing word', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const qs = Quiz.build({ sentences, context: sentences, seed, noListen: true });
    assert.ok(qs.every(q => q.type !== 'listen'));
    const g = qs.find(q => q.type === 'word' && q.sentence === sentences[0].en);
    if (g) assert.deepEqual([...g.options].sort(), ['describe', 'describes', 'describing']);
  }
});

test('at most 10 questions, and the pass mark is 70% rounded up', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ en: `Sentence number ${i} is here today` }));
  assert.equal(Quiz.build({ sentences: many, context: many, seed: 3 }).length, 10);
  assert.deepEqual([1, 3, 4, 5, 6, 8, 10].map(Quiz.needed), [1, 3, 3, 4, 5, 6, 7]);
  const qs = Quiz.build({ sentences, context: sentences, seed: 9 });
  assert.equal(Quiz.grade(qs, qs.map(q => q.answer)).passed, true);
  const wrong = qs.map((q, i) => (i < 2 ? q.answer : (q.answer + 1) % q.options.length));
  const g = Quiz.grade(qs, wrong);
  assert.equal(g.score, 2);
  assert.equal(g.passed, false);
  assert.equal(Quiz.grade(qs, []).score, 0);
});

test('a lesson with one tiny sentence still makes a fair question', () => {
  const one = [{ en: 'Hello world' }];
  const qs = Quiz.build({ sentences: one, context: one, seed: 4 });
  assert.equal(qs.length, 1);
  assert.ok(qs[0].options.length >= 2);
});
