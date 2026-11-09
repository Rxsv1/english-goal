/* WordStack - the speaking check, shared by the server and the browser.
 *
 * The phone listens with the browser's speech recognition and gets back text ("what it heard"). This file compares that text with the sentence:
 *   - case, punctuation and apostrophes are ignored ("Don't" = "dont"), hyphens split a word ("check-in" = "check in"),
 *     and the numbers 0-20 count as words ("2" = "two");
 *   - the words are matched in order (a longest-common-subsequence alignment), so a word said in the wrong place, or not said, is "missed";
 *   - a try passes when at least 80% of the sentence's words were heard.
 * The app uses it at once to colour the words it did not hear; the server uses the same code on the text the phone sends, so the score the
 * teacher sees is worked out by the server and cannot be made up by the phone. Only text is ever sent, never audio.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpeakCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PASS_PERCENT = 80;
  const MAX_TRIES = 3;
  const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

  /** The comparable words of a text: lower case, no punctuation or apostrophes, small numbers as words. */
  function tokens(text) {
    return String(text === null || text === undefined ? '' : text)
      .toLowerCase()
      .replace(/[’‘`´']/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map(t => (/^\d{1,2}$/.test(t) && Number(t) <= 20 ? NUMBERS[Number(t)] : t));
  }

  /**
   * Compares what was heard with the sentence.
   * @returns {{ score: number, percent: number, pass: boolean, matched: boolean[], words: (boolean|null)[], total: number, heardWords: number }}
   *   percent = 0..100 (whole number, rounded down); matched = one flag per word of the sentence; words = one flag per space-separated piece of the
   *   sentence as written (true = heard, false = missed, null = a piece without letters, like a lone dash), for colouring the words on the card.
   */
  function check(expected, heard) {
    const exp = tokens(expected), got = tokens(heard);
    const matched = new Array(exp.length).fill(false);
    // longest common subsequence of the two word lists; the expected words on it are the ones that were heard
    const n = exp.length, m = got.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i][j] = exp[i] === got[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (exp[i] === got[j]) { matched[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    const hits = matched.filter(Boolean).length;
    const percent = n ? Math.floor((hits * 100) / n) : 100;
    // one flag per piece of the sentence as it is written
    let k = 0;
    const words = String(expected === null || expected === undefined ? '' : expected).trim().split(/\s+/).filter(Boolean).map(piece => {
      const count = tokens(piece).length;
      if (!count) return null;
      const part = matched.slice(k, k + count);
      k += count;
      return part.every(Boolean);
    });
    return { score: n ? hits / n : 1, percent, pass: n === 0 || hits * 100 >= PASS_PERCENT * n, matched, words, total: n, heardWords: m };
  }

  /** The best of several alternatives the recognizer offered (it often gives 2-3 guesses). */
  function best(expected, alternatives) {
    let top = null;
    for (const text of Array.isArray(alternatives) ? alternatives : []) {
      const r = check(expected, text);
      if (!top || r.percent > top.result.percent) top = { text: String(text), result: r };
    }
    return top || { text: '', result: check(expected, '') };
  }

  return { check, best, tokens, PASS_PERCENT, MAX_TRIES };
});
