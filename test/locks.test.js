'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lessonLocks } = require('../public/progress-core.js');

const L = (slug, level, extra = {}) => ({ slug, title: slug.toUpperCase(), level, assigned: false, started: false, completed: false, ...extra });
const lockedSlugs = list => [...lessonLocks(list)].filter(([, v]) => v.locked).map(([k]) => k);

test('only the first lesson is open until it is finished, then the next one opens', () => {
  const list = [L('a', 'A1'), L('b', 'A1'), L('c', 'A1')];
  assert.deepEqual(lockedSlugs(list), ['b', 'c']);
  assert.equal(lessonLocks(list).get('b').by.title, 'A', 'it says which lesson to finish');
  list[0].completed = true;
  assert.deepEqual(lockedSlugs(list), ['c']);
  assert.equal(lessonLocks(list).get('c').by.slug, 'b');
  list[1].completed = true;
  assert.deepEqual(lockedSlugs(list), []);
});

test('the order is by level first (A1 before B1), then the order of the lessons page, whatever the order given', () => {
  const list = [L('b1-first', 'B1'), L('a2', 'A2'), L('a1-late', 'A1'), L('a1-early', 'A1')];
  // the page order is b1-first, a2, a1-late, a1-early; the chain is a1-late, a1-early, a2, b1-first
  assert.deepEqual(lockedSlugs(list).sort(), ['a1-early', 'a2', 'b1-first']);
  assert.equal(lessonLocks(list).get('a1-early').by.slug, 'a1-late');
  assert.equal(lessonLocks(list).get('a2').by.slug, 'a1-early');
  assert.equal(lessonLocks(list).get('b1-first').by.slug, 'a2');
  // unknown or missing levels go to the end
  assert.deepEqual(lockedSlugs([L('x', 'A1'), L('y', ''), L('z', 'Z9')]).sort(), ['y', 'z']);
});

test('private lessons are never closed and are not part of the chain', () => {
  const list = [L('a', 'A1'), L('mine', 'A1', { assigned: true }), L('b', 'A1')];
  assert.deepEqual(lockedSlugs(list), ['b'], 'b waits for a, not for the private lesson');
  assert.equal(lessonLocks(list).get('b').by.slug, 'a');
  assert.equal(lessonLocks(list).get('mine').locked, false);
});

test('a lesson the student already started or finished stays open (older progress keeps working)', () => {
  const list = [L('a', 'A1'), L('b', 'A1', { started: true }), L('c', 'A1'), L('d', 'A1', { completed: true })];
  assert.deepEqual(lockedSlugs(list), ['c'], 'b and d are open; c waits for b');
});

test('odd input never throws', () => {
  assert.deepEqual([...lessonLocks(undefined)], []);
  assert.deepEqual(lockedSlugs([L('only', 'A1')]), []);
});
