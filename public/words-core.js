/* WordStack - word meanings ("tap a word to see its meaning"), shared by the server, the teacher's editor and the student app.
 *
 * A lesson has a list of words with their Arabic meaning:  { "airport": "مطار", "boarding": "صعود الطائرة" }
 * Words are matched without caring about case or punctuation: "Airport", "airport." and "(airport)" are all the word  airport.
 * A word that is not in the list simply has no meaning (nothing is shown).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WordsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ARABIC_RE = /[؀-ۿ]/;
  const MAX_WORD = 40;      // characters in a word
  const MAX_MEANING = 80;   // characters in a meaning
  const MAX_WORDS = 1000;   // words in one lesson

  // Tiny words that the "Download words without meaning" file leaves out (students know them; they only make the AI's job longer).
  // A teacher can still give any of them a meaning by hand.
  const SKIP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'am', 'are', 'was', 'were', 'be', 'and', 'or',
    'i', 'it', 'he', 'she', 'we', 'you', 'they', 'do', 'does', 'my', 'your', 'for', 'with']);

  /**
   * The key of a word: lower case, apostrophes made plain, punctuation around it removed. "Airport." -> "airport", "Don’t" -> "don't".
   * Returns '' when nothing is left (a lone dash, a number alone is kept).
   */
  function key(word) {
    return String(word === null || word === undefined ? '' : word)
      .toLowerCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }

  /** A key a teacher may use in a list: letters and numbers with inner hyphens or apostrophes ("check-in", "don't"), not too long. */
  const validKey = k => typeof k === 'string' && k.length > 0 && k.length <= MAX_WORD && /^[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*$/u.test(k);

  /** The different word keys of a sentence, in order, only those with a letter in them. */
  function keysOf(sentence) {
    const out = [];
    for (const piece of String(sentence === null || sentence === undefined ? '' : sentence).split(/\s+/)) {
      const k = key(piece);
      if (k && /\p{L}/u.test(k) && !out.includes(k)) out.push(k);
    }
    return out;
  }

  /**
   * Checks a { word: meaning } object from a file or a form. Returns { words } (keys made plain, meanings tidied) or { error }.
   * Each meaning must be Arabic text; a word may appear only once after making keys plain.
   */
  function check(input) {
    if (input === undefined || input === null) return { words: {} };
    if (typeof input !== 'object' || Array.isArray(input)) return { error: 'The word list must be an object like { "airport": "مطار" }.' };
    const entries = Object.entries(input);
    if (entries.length > MAX_WORDS) return { error: `A lesson can have at most ${MAX_WORDS} word meanings.` };
    const words = {};
    for (const [rawWord, rawMeaning] of entries) {
      const k = key(rawWord);
      if (!validKey(k)) return { error: `“${String(rawWord).slice(0, 30)}” is not a single word (letters, with an inner - or ' only).` };
      const meaning = typeof rawMeaning === 'string' ? rawMeaning.trim().replace(/\s+/g, ' ') : '';
      if (!meaning) return { error: `The meaning of “${k}” is empty.` };
      if (meaning.length > MAX_MEANING) return { error: `The meaning of “${k}” must be ${MAX_MEANING} characters or fewer.` };
      if (!ARABIC_RE.test(meaning)) return { error: `The meaning of “${k}” must be written in Arabic.` };
      if (Object.prototype.hasOwnProperty.call(words, k)) return { error: `The word “${k}” is in the list twice.` };
      words[k] = meaning;
    }
    return { words };
  }

  /** The lesson's list as the lines of the teacher's editor, "airport = مطار", sorted. */
  function toLines(words) {
    return Object.entries(words && typeof words === 'object' ? words : {}).sort((a, b) => a[0].localeCompare(b[0])).map(([w, m]) => `${w} = ${m}`).join('\n');
  }

  /** The editor's lines back into a { word: meaning } object. Returns { words } or { error } with the line number. */
  function fromLines(text) {
    const obj = {};
    const lines = String(text || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const at = line.indexOf('=');
      if (at < 0) return { error: `Line ${i + 1}: write the word, then =, then its Arabic meaning, like  airport = مطار` };
      const k = key(line.slice(0, at));
      if (Object.prototype.hasOwnProperty.call(obj, k)) return { error: `Line ${i + 1}: the word “${k}” is in the list twice.` };
      obj[k] = line.slice(at + 1);
    }
    return check(obj);
  }

  /** The meaning of a word as written on a card ("Airport," -> the meaning of airport), or '' when there is none. */
  function lookup(words, word) {
    if (!words || typeof words !== 'object') return '';
    const k = key(word);
    return k && Object.prototype.hasOwnProperty.call(words, k) && typeof words[k] === 'string' ? words[k] : '';
  }

  return { key, validKey, keysOf, check, toLines, fromLines, lookup, SKIP, ARABIC_RE, MAX_WORDS, MAX_WORD, MAX_MEANING };
});
