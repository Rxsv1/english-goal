/* Faisal English Goal - sentence-building game */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const MAX_PRACTICE = 30;
  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  };

  /* ================================================================ */
  /* Utilities                                                         */
  /* ================================================================ */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // only used with our own static SVG strings
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }

  const storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } },
  };

  const settings = Object.assign({ sound: true, speak: true }, storage.get('sp:settings', {}));
  const saveSettings = () => storage.set('sp:settings', settings);

  // progress = { [lessonSlug]: { [sentenceText]: bestStars } } - keyed by text so edits don't shift results
  const progress = storage.get('sp:progress', {});
  const saveProgress = () => storage.set('sp:progress', progress);
  function lessonStars(slug, sentences) {
    const p = progress[slug] || {};
    return sentences.reduce((sum, s) => sum + (p[s.en || s] || 0), 0);
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function api(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.status = res.status; throw e; }
    return data;
  }

  async function shareLink(title, path) {
    const url = location.origin + path;
    if (navigator.share) {
      try { await navigator.share({ title, text: `Practise English: ${title}`, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copied!'); } catch (e) { prompt('Copy this link:', url); }
  }

  /* ---------- Sound, speech, confetti ---------- */
  let audioCtx;
  function tone(freq, at, dur, type) {
    if (!settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), s = audioCtx.currentTime + at;
      o.type = type || 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.16, s); g.gain.exponentialRampToValueAtTime(0.001, s + dur);
      o.connect(g); g.connect(audioCtx.destination); o.start(s); o.stop(s + dur);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    tap: () => tone(660, 0, 0.06, 'sine'),
    wrong: () => { tone(220, 0, 0.15, 'square'); tone(196, 0.12, 0.2, 'square'); },
    hint: () => tone(440, 0, 0.12),
    win: () => { tone(523, 0, 0.15); tone(659, 0.12, 0.15); tone(784, 0.24, 0.3); },
    finish: () => { tone(523, 0, 0.15); tone(659, 0.15, 0.15); tone(784, 0.3, 0.15); tone(1047, 0.45, 0.4); },
  };

  const canSpeak = 'speechSynthesis' in window;
  let voice = null;
  function pickVoice() {
    if (!canSpeak) return;
    const vs = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    voice = vs.find(v => /en[-_]US/i.test(v.lang) && /google|natural|samantha/i.test(v.name))
      || vs.find(v => /en[-_](US|GB)/i.test(v.lang)) || vs[0] || null;
  }
  if (canSpeak) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }
  function speak(text, slow) {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'en-US';
    if (voice) u.voice = voice;
    u.rate = slow ? 0.6 : 0.9;
    speechSynthesis.speak(u);
  }
  const stopSpeech = () => { if (canSpeak) speechSynthesis.cancel(); };

  const cv = document.getElementById('confetti');
  const cx = cv.getContext('2d');
  let confettiRun = 0;
  function confetti(n) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const run = ++confettiRun;
    cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#FF6B6B', '#2FB5AB', '#FFB703', '#7FCFB0', '#8E7CFF'];
    const ps = Array.from({ length: n }, () => ({
      x: innerWidth / 2, y: innerHeight * 0.45, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 3,
      s: 6 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], r: Math.random() * 6,
    }));
    let f = 0;
    (function step() {
      if (run !== confettiRun) return;
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const p of ps) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += 0.2;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); cx.restore();
      }
      if (++f < 110) requestAnimationFrame(step); else cx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  /* ================================================================ */
  /* Text processing                                                   */
  /* ================================================================ */
  const stripEdges = t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  /** Sentence -> list of word tiles. Keeps numbers, apostrophes and hyphens inside words. */
  function tokenize(sentence) {
    return sentence.trim().split(/\s+/).map(stripEdges).filter(Boolean);
  }

  /** Lower-cases the first word so the capital letter doesn't reveal it (keeps "I", "I'm", acronyms). */
  function hideCapital(words) {
    const out = [...words];
    const w = out[0];
    if (w && !/^I(['’](m|ll|ve|d))?$/.test(w) && w.slice(1) === w.slice(1).toLowerCase())
      out[0] = w.charAt(0).toLowerCase() + w.slice(1);
    return out;
  }

  const ABBR = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|No|e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|[A-Z])\.$/i;
  /** Splits pasted text into sentences. Handles "Mr. Smith", "3.5", "U.S." and line breaks. */
  function splitSentences(text) {
    const out = [];
    for (const line of text.replace(/\r/g, '').split(/\n+/)) {
      let buf = '';
      for (const part of line.split(/(?<=[.!?…])\s+/)) {
        buf = buf ? buf + ' ' + part : part;
        if (!ABBR.test(buf)) { out.push(buf.trim()); buf = ''; }
      }
      if (buf.trim()) out.push(buf.trim());
    }
    return out
      .map(s => s.split(/\s+/).filter(t => /[\p{Script=Latin}\p{N}]/u.test(t)).join(' ')) // drop non-English tokens
      .filter(s => /\p{Script=Latin}/u.test(s) && tokenize(s).length >= 2);
  }

  function shuffle(words) {
    if (words.length < 2 || words.every(w => w === words[0])) return [...words];
    const a = [...words];
    for (let tries = 0; tries < 50; tries++) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (a.join(' ') !== words.join(' ')) break;
    }
    return a;
  }

  const starsFor = penalty => (penalty === 0 ? 3 : penalty <= 2 ? 2 : 1);
  function starNodes(n, max = 3) {
    return [h('span', null, '★'.repeat(n)), h('span', { class: 'off' }, '★'.repeat(max - n))];
  }

  /* ================================================================ */
  /* Router                                                            */
  /* ================================================================ */
  let cleanup = null;
  function navigate(path, replace) {
    if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
    route();
  }
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    stopSpeech();
    window.scrollTo(0, 0);
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const m = path.match(/^\/lesson\/([a-z0-9-]+)$/);
    if (m) return showLesson(m[1]);
    if (path === '/practice') return showPractice();
    if (path !== '/') history.replaceState(null, '', '/');
    showLibrary();
  }
  window.addEventListener('popstate', route);
  app.addEventListener('contextmenu', e => { if (e.target.closest('.tile')) e.preventDefault(); });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });

  function setView(...nodes) {
    app.replaceChildren(...nodes);
  }

  function soundButton() {
    const b = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sound on or off' });
    const sync = () => { b.textContent = settings.sound ? '🔊' : '🔇'; b.setAttribute('aria-pressed', String(settings.sound)); };
    b.addEventListener('click', () => {
      settings.sound = !settings.sound; settings.speak = settings.sound; saveSettings(); sync();
      if (!settings.sound) stopSpeech();
    });
    sync();
    return b;
  }

  function appBar() {
    return h('header', { class: 'appbar' },
      h('a', { class: 'brand', href: '/', 'data-link': true }, h('img', { src: '/icons/icon.svg', alt: '' }), 'English Goal'),
      h('div', { class: 'tools' }, soundButton()));
  }

  /* ================================================================ */
  /* Library                                                           */
  /* ================================================================ */
  let libraryCache = null;
  let levelFilter = storage.get('sp:level', 'All');

  async function showLibrary() {
    document.title = 'Faisal English Goal';
    const grid = h('div', { class: 'lesson-grid' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by level' });
    const body = h('div', null, h('div', { class: 'state' }, h('div', { class: 'spinner' }), 'Loading lessons…'));
    setView(
      appBar(),
      h('h1', null, 'Faisal English Goal'),
      h('p', { class: 'subtitle' }, 'Put the words in the right order to build each sentence.'),
      body
    );

    let lessons;
    try {
      lessons = (await api('/api/lessons')).lessons;
      libraryCache = lessons;
    } catch (e) {
      lessons = libraryCache;
      if (!lessons) {
        body.replaceChildren(h('div', { class: 'state' }, h('div', { class: 'big' }, '📡'),
          h('p', null, "Couldn't load lessons. Check your connection."),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: showLibrary }, 'Try again')));
        return;
      }
    }

    const levels = ['All', ...new Set(lessons.map(l => l.level))].sort((a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)));
    if (!levels.includes(levelFilter)) levelFilter = 'All';

    const draw = () => {
      chips.replaceChildren(...(levels.length > 2 ? levels.map(lv => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(lv === levelFilter),
        onclick: () => { levelFilter = lv; storage.set('sp:level', lv); draw(); },
      }, lv)) : []));
      const shown = lessons.filter(l => levelFilter === 'All' || l.level === levelFilter);
      grid.replaceChildren(
        ...shown.map(lessonCard),
        h('a', { class: 'lesson-card card-practice', href: '/practice', 'data-link': true },
          h('div', { class: 'top' }, h('span', { class: 'emoji' }, '✍️')),
          h('div', { class: 'title' }, 'Practise your own text'),
          h('div', { class: 'desc' }, 'Paste any English text and turn it into a puzzle.'))
      );
    };
    draw();
    body.replaceChildren(lessons.length ? chips : '', grid);
  }

  function lessonCard(l) {
    const max = l.count * 3;
    const p = progress[l.slug] || {};
    const earned = Object.values(p).reduce((a, b) => a + b, 0);
    const pct = max ? Math.min(100, Math.round((earned / max) * 100)) : 0;
    const fill = h('div', { class: 'mini-fill' });
    fill.style.width = pct + '%';
    return h('a', { class: 'lesson-card' + (pct === 100 ? ' done' : ''), href: `/lesson/${l.slug}`, 'data-link': true },
      h('div', { class: 'top' }, h('span', { class: 'emoji' }, l.emoji || '📘'), h('span', { class: 'level' }, l.level)),
      h('div', { class: 'title' }, l.title),
      h('div', { class: 'desc' }, l.description || ''),
      h('div', { class: 'mini-track', 'aria-hidden': 'true' }, fill),
      h('div', { class: 'meta' }, h('span', null, `${l.count} sentences`), h('span', null, earned ? `⭐ ${Math.min(earned, max)} / ${max}` : 'New')));
  }

  /* ================================================================ */
  /* Practice (paste your own text)                                    */
  /* ================================================================ */
  function showPractice() {
    document.title = 'Practise your text · English Goal';
    const ta = h('textarea', { dir: 'ltr', placeholder: 'Paste English text here. Each sentence becomes a puzzle.', 'aria-label': 'Your English text' });
    ta.value = storage.get('sp:practice', '');
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    ta.addEventListener('input', () => { msg.textContent = ''; storage.set('sp:practice', ta.value); });

    const start = () => {
      const sentences = splitSentences(ta.value);
      if (!sentences.length) { msg.textContent = 'Please enter at least one English sentence with two or more words.'; ta.focus(); return; }
      if (sentences.length > MAX_PRACTICE) toast(`Using the first ${MAX_PRACTICE} of ${sentences.length} sentences.`);
      playLesson({ slug: null, title: 'My text', sentences: sentences.slice(0, MAX_PRACTICE).map(en => ({ en })) }, null, '/practice');
    };

    setView(
      h('header', { class: 'appbar' },
        h('a', { class: 'btn btn-ghost btn-sm', href: '/', 'data-link': true, html: ICON.back + ' Lessons' }),
        h('div', { class: 'tools' }, soundButton())),
      h('h1', null, 'Practise your own text'),
      h('p', { class: 'subtitle' }, 'Sentences are split automatically. Numbers and contractions are kept.'),
      h('div', { class: 'card' }, ta),
      msg,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: start }, 'Start'),
        h('button', {
          class: 'btn btn-ghost', type: 'button', onclick: () => {
            ta.value = "The quick brown fox jumps over the lazy dog. My sister reads a book every night. We are going to the beach tomorrow. Can you help me with my homework? Mr. Brown has 2 cats and a dog. She doesn't like cold weather.";
            ta.dispatchEvent(new Event('input'));
          },
        }, 'Try an example'))
    );
  }

  /* ================================================================ */
  /* Lesson loading                                                    */
  /* ================================================================ */
  async function showLesson(slug) {
    setView(h('div', { class: 'state' }, h('div', { class: 'spinner' }), 'Loading lesson…'));
    try {
      const { lesson } = await api(`/api/lessons/${slug}`);
      playLesson(lesson, null, '/');
    } catch (e) {
      setView(appBar(), h('div', { class: 'state' },
        h('div', { class: 'big' }, e.status === 404 ? '🔍' : '📡'),
        h('p', null, e.status === 404 ? "This lesson doesn't exist or was removed." : "Couldn't load the lesson. Check your connection."),
        h('div', { class: 'row-actions' },
          e.status === 404 ? null : h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => showLesson(slug) }, 'Try again'),
          h('a', { class: 'btn btn-primary', href: '/', 'data-link': true }, 'See all lessons'))));
    }
  }

  /* ================================================================ */
  /* Game                                                              */
  /* ================================================================ */
  /**
   * @param lesson   { slug|null, title, sentences:[{en}] }
   * @param indices  which sentences to play (null = all) - used for "practise weak sentences"
   * @param exitPath where the back button goes
   */
  function playLesson(lesson, indices, exitPath) {
    document.title = `${lesson.title} · English Goal`;
    const order = indices || lesson.sentences.map((_, i) => i);
    const results = {}; // index -> stars this run
    let pos = 0;
    let round = null;
    let sortables = [];

    /* ---------- Static layout ---------- */
    const progressPill = h('div', { class: 'pill' });
    const fill = h('div', { class: 'progress-fill' });
    const answer = h('div', { class: 'zone answer-zone', 'data-placeholder': 'Tap or drag the words here', 'aria-label': 'Your sentence' });
    const pool = h('div', { class: 'zone pool-zone', 'aria-label': 'Available words' });
    const answerBox = h('div', { class: 'answer-box' }, answer);
    const feedback = h('p', { class: 'feedback', role: 'status' });
    const solvedPanel = h('div', { class: 'solved-panel', hidden: true });

    const resetBtn = h('button', { class: 'btn btn-ghost', type: 'button', html: ICON.reset + ' Reset', 'aria-label': 'Put the words back and shuffle' });
    const hintBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, '💡 Hint');
    const listenBtn = h('button', { class: 'btn btn-ghost', type: 'button', hidden: true }, '🔊 Listen');
    const slowBtn = h('button', { class: 'btn btn-ghost', type: 'button', hidden: true, 'aria-label': 'Listen slowly' }, '🐢 Slow');
    const nextBtn = h('button', { class: 'btn btn-accent', type: 'button', hidden: true, html: 'Next ' + ICON.next });
    if (!canSpeak) { listenBtn.remove(); slowBtn.remove(); }

    const exit = () => navigate(exitPath);
    setView(
      h('div', { class: 'game-top' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Leave lesson', html: ICON.back, onclick: exit }),
        h('div', { class: 'lesson-name' }, lesson.title),
        progressPill, soundButton()),
      h('div', { class: 'progress-track', role: 'progressbar', 'aria-label': 'Lesson progress' }, fill),
      h('p', { class: 'prompt' }, 'Put the words in the correct order'),
      answerBox, pool, feedback, solvedPanel,
      h('div', { class: 'actions' }, resetBtn, hintBtn, listenBtn, slowBtn, nextBtn)
    );

    /* ---------- Round logic ---------- */
    const tilesIn = zone => [...zone.children];
    const words = zone => tilesIn(zone).map(t => t.dataset.word);

    function makeTile(word) {
      return h('button', { class: 'tile', type: 'button', 'data-word': word }, word);
    }

    function loadRound() {
      const idx = order[pos];
      const sentence = lesson.sentences[idx].en;
      const target = hideCapital(tokenize(sentence));
      round = { idx, sentence, target, mistakes: 0, hints: 0, solved: false, lastWrong: null };

      answer.replaceChildren();
      pool.replaceChildren(...shuffle(target).map(makeTile));
      answerBox.classList.remove('solved');
      solvedPanel.hidden = true;
      feedback.textContent = ''; feedback.className = 'feedback';
      resetBtn.hidden = false; hintBtn.hidden = false;
      listenBtn.hidden = true; slowBtn.hidden = true; nextBtn.hidden = true;
      progressPill.textContent = `${pos + 1} / ${order.length}`;
      fill.style.width = `${(pos / order.length) * 100}%`;
      sortables.forEach(s => s.option('disabled', false));
    }

    // Moves the dragged/tapped word and checks the answer.
    function afterChange(fromHint) {
      if (round.solved) return;
      tilesIn(answer).forEach(t => t.classList.remove('wrong', 'right'));
      feedback.textContent = ''; feedback.className = 'feedback';
      if (pool.children.length) return;

      const current = words(answer);
      if (current.join(' ') === round.target.join(' ')) return success();

      const key = current.join(' ');
      if (!fromHint && key !== round.lastWrong) { round.mistakes++; sfx.wrong(); if (navigator.vibrate) navigator.vibrate(60); }
      round.lastWrong = key;
      tilesIn(answer).forEach((t, k) => t.classList.add(t.dataset.word === round.target[k] ? 'right' : 'wrong'));
      feedback.textContent = 'Not quite. Move the red words.';
      feedback.className = 'feedback bad';
    }

    function success() {
      round.solved = true;
      const s = starsFor(round.mistakes + round.hints);
      results[round.idx] = Math.max(results[round.idx] || 0, s);
      if (lesson.slug) {
        const p = (progress[lesson.slug] = progress[lesson.slug] || {});
        p[round.sentence] = Math.max(p[round.sentence] || 0, s);
        saveProgress();
      }
      sortables.forEach(x => x.option('disabled', true));
      tilesIn(answer).forEach(t => { t.classList.remove('wrong', 'right'); t.classList.add('solved'); t.tabIndex = -1; });
      answerBox.classList.add('solved');
      fill.style.width = `${((pos + 1) / order.length) * 100}%`;
      solvedPanel.replaceChildren(
        h('div', { class: 'sentence' }, round.sentence),
        h('div', { class: 'stars', 'aria-label': `${s} of 3 stars` }, starNodes(s)));
      solvedPanel.hidden = false;
      solvedPanel.classList.remove('pop'); void solvedPanel.offsetWidth; solvedPanel.classList.add('pop');
      const praise = s === 3 ? ['Perfect!', 'Excellent!', 'Amazing!'] : s === 2 ? ['Well done!', 'Great job!', 'Nice work!'] : ['You got it!', 'Good job, keep practising!'];
      feedback.textContent = praise[(Math.random() * praise.length) | 0];
      feedback.className = 'feedback good';
      resetBtn.hidden = true; hintBtn.hidden = true;
      listenBtn.hidden = false; slowBtn.hidden = false; nextBtn.hidden = false;
      nextBtn.innerHTML = (pos + 1 < order.length ? 'Next ' : 'Finish ') + ICON.next;
      nextBtn.focus({ preventScroll: true });
      sfx.win(); confetti(40);
      if (settings.speak) setTimeout(() => speak(round.sentence), 450);
    }

    function hint() {
      if (round.solved) return;
      const cur = tilesIn(answer);
      let i = cur.findIndex((t, k) => t.dataset.word !== round.target[k]);
      if (i < 0) i = cur.length; // all placed words are right, add the next one
      const want = round.target[i];
      const tile = tilesIn(pool).find(t => t.dataset.word === want) || cur.find((t, k) => k > i && t.dataset.word === want);
      if (!tile) return;
      answer.insertBefore(tile, answer.children[i] || null);
      round.hints++;
      tile.classList.remove('flash'); void tile.offsetWidth; tile.classList.add('flash');
      sfx.hint();
      afterChange(true);
      if (!round.solved && !pool.children.length) return;
      if (!round.solved) { feedback.textContent = `“${want}” is word ${i + 1}.`; feedback.className = 'feedback'; }
    }

    function resetRound() {
      if (round.solved) return;
      pool.replaceChildren(...shuffle(round.target).map(makeTile));
      answer.replaceChildren();
      afterChange(true);
    }

    /* ---------- Input: tap ---------- */
    let lastDragEnd = 0;
    function onTap(e) {
      const tile = e.target.closest('.tile');
      if (!tile || round.solved || Date.now() - lastDragEnd < 250) return;
      if (tile.parentElement === pool) answer.appendChild(tile); else pool.appendChild(tile);
      sfx.tap();
      afterChange(false);
      // keep keyboard focus in a sensible place
      const next = pool.querySelector('.tile') || answer.querySelector('.tile:last-child');
      if (e.detail === 0 && next) next.focus();
    }
    answer.addEventListener('click', onTap);
    pool.addEventListener('click', onTap);

    /* ---------- Input: drag ---------- */
    if (window.Sortable) {
      const opts = {
        group: 'words',
        animation: 150,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        forceFallback: true,
        fallbackOnBody: true,
        fallbackTolerance: 6,
        fallbackClass: 'dragging',
        ghostClass: 'ghost',
        swapThreshold: 0.6,
        onEnd: () => { lastDragEnd = Date.now(); afterChange(false); },
      };
      sortables = [Sortable.create(answer, opts), Sortable.create(pool, opts)];
    }

    /* ---------- Buttons ---------- */
    resetBtn.addEventListener('click', resetRound);
    hintBtn.addEventListener('click', hint);
    listenBtn.addEventListener('click', () => speak(round.sentence));
    slowBtn.addEventListener('click', () => speak(round.sentence, true));
    nextBtn.addEventListener('click', () => {
      stopSpeech();
      if (++pos < order.length) { loadRound(); window.scrollTo(0, 0); } else finish();
    });

    const onKey = e => {
      if (e.key === 'Enter' && round && round.solved && document.activeElement !== nextBtn && !nextBtn.hidden) nextBtn.click();
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => { document.removeEventListener('keydown', onKey); sortables.forEach(s => s.destroy()); };

    /* ---------- Results ---------- */
    function finish() {
      cleanup(); cleanup = null;
      const earned = order.reduce((a, i) => a + (results[i] || 0), 0);
      const max = order.length * 3;
      const weak = order.filter(i => (results[i] || 0) < 3);
      const pct = earned / max;
      const actions = h('div', { class: 'result-actions' });
      if (weak.length) actions.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => playLesson(lesson, weak, exitPath) }, `Practise ${weak.length} hard sentence${weak.length > 1 ? 's' : ''}`));
      actions.append(h('button', { class: 'btn ' + (weak.length ? 'btn-ghost' : 'btn-primary'), type: 'button', onclick: () => playLesson(lesson, null, exitPath) }, 'Play again'));
      if (lesson.slug) actions.append(h('button', { class: 'btn btn-ghost', type: 'button', html: ICON.share + ' Share this lesson', onclick: () => shareLink(lesson.title, `/lesson/${lesson.slug}`) }));
      actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true }, lesson.slug ? 'All lessons' : 'Back to lessons'));
      if (!lesson.slug) actions.append(h('a', { class: 'btn btn-ghost', href: '/practice', 'data-link': true }, 'Edit my text'));

      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, pct === 1 ? '🏆' : pct >= 0.7 ? '🎉' : '💪'),
        h('h1', null, pct === 1 ? 'Perfect!' : pct >= 0.7 ? 'Well done!' : 'Good effort!'),
        h('p', { class: 'subtitle' }, `You earned ${earned} of ${max} stars in “${lesson.title}”.`),
        h('ul', { class: 'result-list' }, order.map(i => h('li', null,
          h('span', null, lesson.sentences[i].en),
          h('span', { class: 's', 'aria-label': `${results[i] || 0} stars` }, starNodes(results[i] || 0))))),
        actions));
      sfx.finish(); confetti(170);
    }

    loadRound();
  }

  /* ================================================================ */
  /* Boot                                                              */
  /* ================================================================ */
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
