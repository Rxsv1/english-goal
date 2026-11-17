'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const W = require('../public/words-core.js');

test('words are matched without caring about case or punctuation', () => {
  const words = { airport: 'مطار', "don't": 'لا', 'check-in': 'تسجيل الوصول' };
  for (const form of ['airport', 'Airport', 'AIRPORT', 'airport.', '(Airport)', '"airport,"', 'airport?!']) assert.equal(W.lookup(words, form), 'مطار', form);
  assert.equal(W.lookup(words, 'Don’t'), 'لا', 'a curly apostrophe is the same as a plain one');
  assert.equal(W.lookup(words, 'Check-in,'), 'تسجيل الوصول');
});

test('a word with no meaning shows nothing', () => {
  const words = { airport: 'مطار' };
  assert.equal(W.lookup(words, 'hotel'), '');
  assert.equal(W.lookup(words, ''), '');
  assert.equal(W.lookup(words, '...'), '');
  assert.equal(W.lookup(words, 'toString'), '', 'names like toString or constructor are not words');
  assert.equal(W.lookup(words, '__proto__'), '');
  assert.equal(W.lookup(null, 'airport'), '');
  assert.equal(W.lookup(undefined, undefined), '');
});

test('the words of a sentence: different, in order, only words with letters', () => {
  assert.deepEqual(W.keysOf('Where is the check-in desk? The desk is open, 24 hours.'), ['where', 'is', 'the', 'check-in', 'desk', 'open', 'hours']);
  assert.deepEqual(W.keysOf('  -  ... 5 '), []);
  assert.deepEqual(W.keysOf(null), []);
});

test('a list from a form or file is checked: single words, Arabic meanings, no duplicates', () => {
  const ok = W.check({ Airport: ' مطار ', 'Boarding.': 'صعود   الطائرة' });
  assert.deepEqual(ok.words, { airport: 'مطار', boarding: 'صعود الطائرة' });
  assert.deepEqual(W.check(undefined), { words: {} });
  assert.match(W.check({ 'two words': 'مطار' }).error, /not a single word/);
  assert.match(W.check({ airport: 'airport' }).error, /Arabic/);
  assert.match(W.check({ airport: '' }).error, /empty/);
  assert.match(W.check({ airport: 5 }).error, /empty/);
  assert.match(W.check({ airport: 'م'.repeat(81) }).error, /80 characters/);
  assert.match(W.check({ Airport: 'مطار', 'airport.': 'مطار' }).error, /twice/);
  assert.match(W.check([['airport', 'مطار']]).error, /object/);
  assert.match(W.check('x').error, /object/);
  assert.match(W.check({ ['x'.repeat(41)]: 'مطار' }).error, /not a single word/);
  const many = {}; for (let i = 0; i < 1001; i++) many['w' + i] = 'مطار';
  assert.match(W.check(many).error, /at most 1000/);
});

test('the editor lines turn into a list and back', () => {
  const text = 'boarding = صعود الطائرة\nairport = مطار\n\n  Gate = بوابة  ';
  const r = W.fromLines(text);
  assert.deepEqual(r.words, { boarding: 'صعود الطائرة', airport: 'مطار', gate: 'بوابة' });
  assert.equal(W.toLines(r.words), 'airport = مطار\nboarding = صعود الطائرة\ngate = بوابة');
  assert.deepEqual(W.fromLines(''), { words: {} });
  assert.match(W.fromLines('airport مطار').error, /Line 1.*then =/);
  assert.match(W.fromLines('airport = مطار\nAirport = مطار').error, /Line 2.*twice/);
  assert.match(W.fromLines('airport = airport').error, /Arabic/);
  assert.equal(W.fromLines('a = ب').words.a, 'ب');
});

test('the words left out of the download are the tiny function words only', () => {
  for (const w of ['a', 'the', 'is', 'to', 'of']) assert.equal(W.SKIP.has(w), true, w);
  for (const w of ['airport', 'book', 'like', 'have']) assert.equal(W.SKIP.has(w), false, w);
});
