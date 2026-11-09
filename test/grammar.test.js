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

test('"?? reason" after a gap becomes gap.why, and goes back to the same line', () => {
  const r = G.parseLine('She [is|are|am] reading. ?? We use "is" with she.');
  assert.equal(r.error, undefined);
  assert.equal(r.en, 'She is reading.');
  assert.deepEqual(r.gap, { index: 1, answer: 'is', options: ['is', 'are', 'am'], why: 'We use "is" with she.' });
  assert.equal(G.toLine({ en: r.en, gap: r.gap }), 'She [is|are|am] reading. ?? We use "is" with she.');
  // no reason: nothing changes (older lessons and lines behave exactly as before)
  assert.deepEqual(G.parseLine('She [is|are|am] reading.').gap, { index: 1, answer: 'is', options: ['is', 'are', 'am'] });
  // the reason may use brackets or bars without confusing the gap
  assert.equal(G.parseLine('She [is] reading ?? Use [is] with "she" | not are').gap.why, 'Use [is] with "she" | not are');
});

test('a reason needs a gap, has a length limit, and works together with the Arabic', () => {
  assert.match(G.parseLine('She is reading ?? why').error, /needs a grammar gap/);
  assert.match(G.parseLine('She [is] reading ?? ' + 'x'.repeat(141)).error, /140 characters/);
  assert.match(G.parseLine('She [is] reading ?? a // b').error, /cannot contain \/\//);
  // "?? reason // الترجمة" and "// الترجمة ?? reason" both give the same two parts
  for (const line of ['She [is] reading ?? We use is. // هي تقرأ', 'She [is] reading // هي تقرأ ?? We use is.']) {
    const { text, ar } = G.splitAr(line);
    assert.equal(ar, 'هي تقرأ');
    assert.equal(G.parseLine(text).gap.why, 'We use is.');
  }
  assert.equal(G.toLine({ en: 'She is reading', gap: { index: 1, answer: 'is', options: ['is', 'are', 'am'], why: 'Because.' }, ar: 'هي تقرأ' }),
    'She [is|are|am] reading ?? Because. // هي تقرأ');
  // a normal Arabic line without a reason is untouched
  assert.deepEqual(G.splitAr('She is reading // هي تقرأ'), { text: 'She is reading', ar: 'هي تقرأ' });
});

test('"why" sent as data (JSON import) is checked', () => {
  const gap = why => ({ index: 1, answer: 'is', options: ['is', 'are', 'am'], ...(why === undefined ? {} : { why }) });
  assert.deepEqual(G.checkGap(gap('Because she is one person.'), 'She is reading').gap.why, 'Because she is one person.');
  assert.equal(G.checkGap(gap(''), 'She is reading').gap.why, undefined, 'an empty reason is simply left out');
  assert.equal(G.checkGap(gap('  a   b '), 'She is reading').gap.why, 'a b');
  assert.match(G.checkGap(gap(5), 'She is reading').error, /must be text/);
  assert.match(G.checkGap(gap('x'.repeat(141)), 'She is reading').error, /140/);
  assert.equal(G.checkGap(gap(undefined), 'She is reading').gap.why, undefined);
});
