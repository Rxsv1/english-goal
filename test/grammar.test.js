'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/grammar-core.js');

test('a line without brackets is just a sentence', () => {
  assert.deepEqual(G.parseLine('  Where is   the desk?  '), { en: 'Where is the desk?', gap: null });
});

test('a gap with three choices: the first is the right answer', () => {
  const r = G.parseLine('She [is|are|am] reading a book.');
  assert.equal(r.en, 'She is reading a book.');
  assert.deepEqual(r.gap, { index: 1, answer: 'is', options: ['is', 'are', 'am'] });
  // spaces around the bars are fine
  assert.deepEqual(G.parseLine('She [ is | are | am ] reading').gap.options, ['is', 'are', 'am']);
});

test('writing only the answer fills in the wrong choices for be / have / do', () => {
  assert.deepEqual(G.parseLine('I [am] ready.').gap.options, ['am', 'is', 'are']);
  assert.deepEqual(G.parseLine('They [were] late.').gap.options, ['were', 'was', 'been']);
  assert.deepEqual(G.parseLine('She [has] a bag.').gap.options, ['has', 'have', 'having']);
  assert.deepEqual(G.parseLine('[Does] she like tea?').gap.options, ['Does', 'Do', 'Doing']); // keeps the capital letter
  // a word it does not know needs the teacher's own wrong choices
  assert.match(G.parseLine('I live [in] Cairo.').error, /two wrong choices/);
  assert.deepEqual(G.parseLine('I live [in|on|at] Cairo.').gap.options, ['in', 'on', 'at']);
});

test('the position of the gap is found even next to punctuation', () => {
  assert.equal(G.parseLine('[Is] she here?').gap.index, 0);
  assert.equal(G.parseLine('Where [are] you?').gap.index, 1);
  const r = G.parseLine('Tom said: ("[is]" is a word)');
  assert.equal(r.error, undefined);
  assert.equal(r.en.split(' ')[r.gap.index].includes('is'), true);
});

test('mistakes in the brackets give clear messages, never a crash', () => {
  assert.match(G.parseLine('She [is reading').error, /exactly one pair/);
  assert.match(G.parseLine('She [is] reading [a|an|the] book').error, /exactly one pair/);
  assert.match(G.parseLine('She [is|are] reading').error, /exactly 3 choices/);
  assert.match(G.parseLine('She [is|are|are] reading').error, /different/);
  assert.match(G.parseLine('She [is not|are|am] reading').error, /single words/);
  assert.match(G.parseLine('She[is|are|am]reading').error, /whole word/);
  for (const weird of [null, undefined, 5, {}, '[', ']', '[]', '[|]', '[a|b|c]']) assert.doesNotThrow(() => G.parseLine(weird));
});

test('data from an import is checked too', () => {
  const ok = G.checkGap({ index: 1, answer: 'is', options: ['is', 'are', 'am'] }, 'She is reading');
  assert.equal(ok.error, undefined);
  assert.match(G.checkGap({ index: 1, answer: 'is', options: ['are', 'am', 'was'] }, 'She is reading').error, /one of the 3/);
  assert.match(G.checkGap({ index: 0, answer: 'is', options: ['is', 'are', 'am'] }, 'She is reading').error, /does not match/);
  assert.match(G.checkGap({ index: 9, answer: 'is', options: ['is', 'are', 'am'] }, 'She is reading').error, /does not match/);
  assert.match(G.checkGap('x', 'She is').error, /not valid/);
  assert.match(G.checkGap({ index: 1, answer: 'is', options: ['is', 'are'] }, 'She is').error, /exactly 3/);
});

test('a stored sentence turns back into the line the teacher edits', () => {
  for (const line of ['She [is|are|am] reading a book.', '[Is|Are|Am] she here?', 'I live [in|on|at] Cairo.', 'No gap here.']) {
    const parsed = G.parseLine(line);
    assert.equal(G.toLine({ en: parsed.en, gap: parsed.gap }), line);
  }
});

test('suggested gaps are always valid lines and only use the safe word families', () => {
  assert.equal(G.suggestLine('She is reading a book.'), 'She [is|are|am] reading a book.');
  assert.equal(G.suggestLine('Where are you from?'), 'Where [are|is|am] you from?');
  assert.equal(G.suggestLine('I have one small bag.'), 'I [have|has|having] one small bag.');
  assert.equal(G.suggestLine('Can I see your passport, please?'), null); // nothing safe to blank out
  for (const s of ['She is happy.', 'Is she here?', 'They were late.', 'Do you like tea?', 'He has a car.']) {
    const line = G.suggestLine(s);
    const parsed = G.parseLine(line);
    assert.equal(parsed.error, undefined, line);
    assert.equal(parsed.en, s);
  }
});
