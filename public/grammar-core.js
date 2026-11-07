/* WordStack - grammar gaps, shared by the server, the teacher's editor and the student app.
 *
 * A teacher marks one word of a sentence like this:    She [is|are|am] reading a book.
 * The first word inside the brackets is the right answer; the other two are the wrong choices the student sees.
 * Writing only the answer, [is], fills in the two wrong choices for a few well-known word families (see AUTO).
 * A sentence with a gap is stored as  { en: "She is reading a book.", gap: { index: 1, answer: "is", options: ["is","are","am"] } }
 * where index is the position of the word in en when it is split at spaces.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GrammarCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WORD = /^[\p{L}][\p{L}'’-]*$/u;
  const stripEdges = t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  // Word families where the wrong choices are always really wrong (so a student can never be marked wrong for a
  // correct answer): be, have and do. Articles and prepositions are left to the teacher, because "a" or "the",
  // "in" or "at" can often both be right.
  const AUTO = {
    am: ['am', 'is', 'are'], is: ['is', 'are', 'am'], are: ['are', 'is', 'am'],
    was: ['was', 'were', 'been'], were: ['were', 'was', 'been'],
    have: ['have', 'has', 'having'], has: ['has', 'have', 'having'],
    do: ['do', 'does', 'doing'], does: ['does', 'do', 'doing'],
  };

  const isCapital = w => w.charAt(0) !== w.charAt(0).toLowerCase();
  const withCase = (word, like) => (isCapital(like) ? word.charAt(0).toUpperCase() + word.slice(1) : word);

  /** The three choices for a word, right one first, or null when it is not one of the well-known families. */
  function autoOptions(answer) {
    const family = AUTO[String(answer).toLowerCase()];
    return family ? family.map(w => withCase(w, answer)) : null;
  }

  /**
   * Reads one line the teacher typed. Returns { en, gap } (gap is null when there are no brackets)
   * or { error } with a message the teacher can act on.
   */
  function parseLine(raw) {
    const text = String(raw === null || raw === undefined ? '' : raw).trim();
    const open = text.indexOf('['), close = text.indexOf(']');
    if (open < 0 && close < 0) return { en: text.replace(/\s+/g, ' '), gap: null };
    if (open < 0 || close < open || text.indexOf('[', open + 1) >= 0 || text.indexOf(']', close + 1) >= 0)
      return { error: 'Use exactly one pair of brackets, like [is|are|am].' };

    const parts = text.slice(open + 1, close).split('|').map(x => x.trim());
    if (!parts.every(w => WORD.test(w)))
      return { error: 'Inside the brackets write single words separated by |, for example [is|are|am].' };
    const answer = parts[0];
    let options = parts;
    if (parts.length === 1) {
      options = autoOptions(answer);
      if (!options) return { error: `Add the two wrong choices for “${answer}”, for example [${answer}|…|…].` };
    } else if (parts.length !== 3) {
      return { error: 'A grammar gap needs exactly 3 choices: the right word first, then two wrong ones.' };
    }
    if (new Set(options.map(o => o.toLowerCase())).size !== 3) return { error: 'The 3 choices must all be different.' };

    const before = text.slice(0, open), after = text.slice(close + 1);
    if (/[\p{L}\p{N}]$/u.test(before) || /^[\p{L}\p{N}]/u.test(after)) return { error: 'The brackets must replace a whole word.' };
    const head = before.replace(/\s+/g, ' ').replace(/^ /, '');
    const en = (head + answer + after.replace(/\s+/g, ' ')).trim();
    const index = en.slice(0, head.length).split(' ').length - 1; // the word the gap sits in
    return { en, gap: { index, answer, options } };
  }

  /** Checks a gap that arrives as data (JSON import, API). Returns { gap } or { error }. */
  function checkGap(gap, en) {
    const bad = message => ({ error: message });
    if (!gap || typeof gap !== 'object') return bad('The grammar gap is not valid.');
    const { index, answer, options } = gap;
    if (!Number.isInteger(index) || index < 0) return bad('The grammar gap has no valid word position.');
    if (typeof answer !== 'string' || !WORD.test(answer)) return bad('The grammar answer must be a single word.');
    if (!Array.isArray(options) || options.length !== 3 || !options.every(o => typeof o === 'string' && WORD.test(o)))
      return bad('A grammar gap needs exactly 3 choices.');
    if (new Set(options.map(o => o.toLowerCase())).size !== 3) return bad('The 3 choices must all be different.');
    if (!options.includes(answer)) return bad('The right answer must be one of the 3 choices.');
    const token = String(en).split(' ')[index];
    if (token === undefined || stripEdges(token).toLowerCase() !== answer.toLowerCase())
      return bad('The grammar gap does not match the word in the sentence.');
    return { gap: { index, answer, options: [...options] } };
  }

  /** A stored sentence as the line the teacher edits ("She [is|are|am] reading"). */
  function toLine(sentence) {
    const gap = sentence && sentence.gap;
    if (!gap) return sentence ? sentence.en : '';
    const words = sentence.en.split(' ');
    const word = words[gap.index];
    if (word === undefined) return sentence.en;
    words[gap.index] = word.replace(stripEdges(word), `[${gap.options.join('|')}]`);
    return words.join(' ');
  }

  /**
   * Suggests a gap for a plain sentence (the first form of be / have / do it finds), as an editable line,
   * or null when the sentence has none of them.
   */
  function suggestLine(en) {
    const words = String(en).split(' ');
    for (let i = 0; i < words.length; i++) {
      const core = stripEdges(words[i]);
      const options = AUTO[core.toLowerCase()] && autoOptions(core);
      if (options) { words[i] = words[i].replace(core, `[${options.join('|')}]`); return words.join(' '); }
    }
    return null;
  }

  return { parseLine, checkGap, toLine, suggestLine, autoOptions };
});
