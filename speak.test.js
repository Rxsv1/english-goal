'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/speak-core.js');

test('case, punctuation and apostrophes are ignored', () => {
  const r = S.check("Where's the check-in desk, please?", 'WHERES the check in desk please');
  assert.equal(r.percent, 100);
  assert.equal(r.pass, true);
  assert.deepEqual(S.tokens("Don’t   stop!  (Really)"), ['dont', 'stop', 'really']);
  assert.deepEqual(S.tokens(null), []);
});

test('small numbers count as words either way', () => {
  assert.equal(S.check('I have two bags', 'I have 2 bags').percent, 100);
  assert.equal(S.check('I have 2 bags', 'I have two bags').percent, 100);
  assert.equal(S.check('I am 25 years old', 'I am 25 years old').percent, 100);
});

test('it passes at 80% of the words and highlights the ones that were not heard', () => {
  // 5 of 6 words = 83%: pass; the missing word is marked
  const ok = S.check('I would like a window seat', 'I would like a window');
  assert.equal(ok.percent, 83);
  assert.equal(ok.pass, true);
  assert.deepEqual(ok.words, [true, true, true, true, true, false]);
  // 4 of 5 = exactly 80%: pass
  assert.equal(S.check('She is reading a book', 'she is reading book').pass, true);
  // 3 of 5 = 60%: not a pass
  const no = S.check('She is reading a book', 'she reading book');
  assert.equal(no.percent, 60);
  assert.equal(no.pass, false);
  assert.deepEqual(no.words, [true, false, true, false, true]);
  // 3 of 4 = 75%: not a pass (so short sentences need every word)
  assert.equal(S.check('We like red tea', 'we like tea').pass, false);
  assert.equal(S.check('Good morning', 'morning').pass, false);
});

test('the words are matched in order and extra words do not hurt', () => {
  assert.equal(S.check('I like green apples', 'uh I really like green apples a lot').percent, 100);
  // the right words in the wrong order: only the longest ordered run counts
  const r = S.check('I like green apples', 'apples green like I');
  assert.equal(r.percent, 25);
  assert.equal(r.pass, false);
  // a repeated word is matched only as often as it was said
  assert.equal(S.check('very very good', 'very good').percent, 66);
});

test('words with a hyphen or punctuation are highlighted as one piece', () => {
  const r = S.check('Where is the check-in desk?', 'where is the desk');
  assert.deepEqual(r.words, [true, true, true, false, true]); // "check-in" lost one of its two words
  assert.equal(r.total, 6);
  assert.equal(r.percent, 66); // 4 of the 6 words (where, is, the, desk)
  assert.deepEqual(S.check('Yes - please', 'yes please').words, [true, null, true], 'a lone dash has no word to hear');
});

test('nothing heard, nothing to say, and odd input never throw', () => {
  assert.equal(S.check('Good morning', '').percent, 0);
  assert.equal(S.check('Good morning', '').pass, false);
  assert.equal(S.check('', 'anything').pass, true);
  for (const weird of [null, undefined, 5, {}, [], '   ']) assert.doesNotThrow(() => S.check(weird, weird));
});

test('the best of the recognizer\'s alternatives is used', () => {
  const b = S.best('She is reading a book', ['she is rating a back', 'she is reading a book', 'she is reading']);
  assert.equal(b.text, 'she is reading a book');
  assert.equal(b.result.percent, 100);
  assert.equal(S.best('Hello there', []).result.percent, 0);
  assert.equal(S.best('Hello there', undefined).text, '');
});
