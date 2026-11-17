/* WordStack - the quiz, shared by the server and the student app.
 *
 * A quiz is made from the lesson's own sentences, always as multiple choice with 3 options:
 *   listen  - hear a sentence, choose the sentence that was said
 *   word    - a sentence with one word missing, choose the missing word
 *   order   - read three sentences, choose the one whose words are in the right order
 * Everything is worked out from a number (the "seed"), so the phone can show the quiz and the server can build exactly
 * the same quiz again to mark the answers itself (a student cannot send a made-up pass). Same code, same result.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuizCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_QUESTIONS = 10;      // at most one question per sentence, and never more than this
  const PASS_PERCENT = 70;       // the pass mark

  // A small seeded random number generator (mulberry32): the same seed always gives the same numbers.
  function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(list, rnd) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const coreOf = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const lower = s => s.toLowerCase();
  const isCapital = w => w.charAt(0) !== w.charAt(0).toLowerCase();
  const withCase = (word, like) => (isCapital(like) ? word.charAt(0).toUpperCase() + word.slice(1) : word.charAt(0).toLowerCase() + word.slice(1));
  const tokens = en => String(en).split(/\s+/).filter(Boolean);

  // Words that are too small or too common to be a good "missing word".
  const SMALL = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'it', 'is', 'are', 'am', 'was', 'were', 'be', 'i', 'you', 'he', 'she', 'we', 'they', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'do', 'does', 'did', 'have', 'has', 'had', 'not', 'no', 'so', 'as', 'if']);
  // Only used when a lesson is too small to offer enough other words.
  const FILLER = ['time', 'people', 'home', 'good', 'work', 'always', 'before', 'because', 'little', 'every'];

  /** Sentences that look like this one (close in length) first; the rest in a random order. */
  function others(sentence, context, rnd) {
    const key = lower(sentence);
    const seen = new Set([key]);
    const list = [];
    for (const c of context) { const k = lower(c); if (!seen.has(k)) { seen.add(k); list.push(c); } }
    const n = tokens(sentence).length;
    return shuffled(list, rnd).sort((a, b) => Math.abs(tokens(a).length - n) - Math.abs(tokens(b).length - n));
  }

  /** The sentence with two neighbouring words swapped (a sentence that reads wrong), or null. */
  function swapped(sentence, rnd, avoid) {
    const t = tokens(sentence);
    const spots = [];
    for (let i = 0; i < t.length - 1; i++) if (lower(coreOf(t[i])) !== lower(coreOf(t[i + 1]))) spots.push(i);
    for (const i of shuffled(spots, rnd)) {
      const u = [...t];
      [u[i], u[i + 1]] = [u[i + 1], u[i]];
      // keep the capital letter and the full stop where they were
      if (isCapital(t[0])) u[0] = withCase(u[0], t[0]); else u[0] = u[0].charAt(0).toLowerCase() + u[0].slice(1);
      const lastPunct = (t[t.length - 1].match(/[^\p{L}\p{N}]+$/u) || [''])[0];
      u[t.length - 1] = coreOf(u[t.length - 1]) + lastPunct;
      const s = u.join(' ');
      if (!avoid.has(lower(s))) return s;
    }
    return null;
  }

  function makeListen(s, context, rnd) {
    const wrong = others(s.en, context, rnd).slice(0, 2);
    const avoid = new Set([lower(s.en), ...wrong.map(lower), ...context.map(lower)]);
    while (wrong.length < 2) {
      const v = swapped(s.en, rnd, avoid);
      if (!v) break;
      avoid.add(lower(v)); wrong.push(v);
    }
    if (!wrong.length) return null;
    return { type: 'listen', prompt: 'Listen. Which sentence did you hear?', speak: s.en, correct: s.en, wrong };
  }

  function makeWord(s, context, rnd) {
    const t = tokens(s.en);
    let index = -1, options = null;
    if (s.gap && Number.isInteger(s.gap.index) && t[s.gap.index] !== undefined && Array.isArray(s.gap.options) && s.gap.options.length === 3) {
      index = s.gap.index;
      options = s.gap.options.map(String);
    } else {
      const cands = t.map((w, i) => i).filter(i => { const c = lower(coreOf(t[i])); return c.length >= 3 && !SMALL.has(c); });
      if (!cands.length) return null;
      index = cands[Math.floor(rnd() * cands.length)];
    }
    const word = t[index];
    const answer = coreOf(word);
    if (!answer) return null;
    if (!options) {
      const inSentence = new Set(t.map(w => lower(coreOf(w))));
      const pool = [...new Set(context.flatMap(c => tokens(c).map(coreOf)).filter(w => w.length >= 3 && !inSentence.has(lower(w))).map(lower))];
      const near = shuffled(pool, rnd).sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length));
      const wrong = near.slice(0, 2);
      for (const f of FILLER) { if (wrong.length >= 2) break; if (!inSentence.has(f) && !wrong.includes(f) && f !== lower(answer)) wrong.push(f); }
      options = [answer, ...wrong.map(w => withCase(w, answer))];
    }
    const at = word.indexOf(answer);
    const before = t.slice(0, index).join(' ') + (index ? ' ' : '') + word.slice(0, Math.max(0, at));
    const after = word.slice(Math.max(0, at) + answer.length) + (index < t.length - 1 ? ' ' : '') + t.slice(index + 1).join(' ');
    const wrong = options.filter(o => lower(o) !== lower(answer));
    return { type: 'word', prompt: 'Choose the missing word.', before, after, correct: answer, wrong: wrong.slice(0, 2) };
  }

  function makeOrder(s, context, rnd) {
    const avoid = new Set([lower(s.en), ...context.map(lower)]);
    const wrong = [];
    while (wrong.length < 2) {
      const v = swapped(s.en, rnd, avoid);
      if (!v) break;
      avoid.add(lower(v)); wrong.push(v);
    }
    if (!wrong.length) return null;
    return { type: 'order', prompt: 'Which sentence is correct?', correct: s.en, wrong };
  }

  /**
   * Builds the questions of one quiz.
   * @param o.sentences  [{ en, gap? }] the sentences this quiz is about (one unit, or the whole lesson)
   * @param o.context    [{ en }] every sentence of the lesson (the source of the wrong options)
   * @param o.seed       integer: the same seed gives the same quiz
   * @param o.noListen   true on a phone that cannot speak: no listening questions
   * @returns [{ type, prompt, sentence, speak?, before?, after?, options:[3 strings], answer:index }]
   */
  function build({ sentences, context, seed, noListen }) {
    const rnd = rng(seed);
    const all = (Array.isArray(context) && context.length ? context : sentences).map(x => x.en);
    const chosen = shuffled((sentences || []).filter(s => s && typeof s.en === 'string' && s.en.trim()), rnd).slice(0, MAX_QUESTIONS);
    const order = noListen ? ['word', 'order'] : ['listen', 'word', 'order'];
    const out = [];
    chosen.forEach((s, i) => {
      const first = i % order.length;
      let made = null;
      for (let k = 0; k < order.length && !made; k++) {
        const kind = order[(first + k) % order.length];
        made = kind === 'listen' ? makeListen(s, all, rnd) : kind === 'word' ? makeWord(s, all, rnd) : makeOrder(s, all, rnd);
      }
      if (!made) return; // a one-word sentence cannot make a fair question
      const options = shuffled([made.correct, ...made.wrong], rnd);
      const q = { type: made.type, prompt: made.prompt, sentence: s.en, options, answer: options.indexOf(made.correct) };
      if (made.speak) q.speak = made.speak;
      if (made.type === 'word') { q.before = made.before; q.after = made.after; }
      out.push(q);
    });
    return out;
  }

  /** How many right answers are needed to pass (70%, rounded up, at least 1). */
  const needed = total => Math.max(1, Math.ceil((total * PASS_PERCENT) / 100));

  /** Marks the answers: picks[i] is the index of the option chosen for question i (or -1 for none). */
  function grade(questions, picks) {
    const results = questions.map((q, i) => ({ picked: Number.isInteger(picks && picks[i]) ? picks[i] : -1, answer: q.answer, correct: picks && picks[i] === q.answer }));
    const score = results.filter(r => r.correct).length;
    const total = questions.length;
    return { score, total, needed: needed(total), passed: total > 0 && score >= needed(total), results };
  }

  return { build, grade, needed, MAX_QUESTIONS, PASS_PERCENT };
});
