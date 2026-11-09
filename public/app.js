/* WordStack - student app */
(function () {
  'use strict';

  const Progress = window.ProgressCore; // the scoring rules, shared with the server (progress-core.js)
  const Quiz = window.QuizCore;         // the quiz maker and marker, shared with the server (quiz-core.js)
  const Review = window.ReviewCore;     // the daily review schedule rules, shared with the server (review-core.js)
  const Words = window.WordsCore;       // word meanings: matches a tapped word with the lesson's list, shared with the server (words-core.js)
  const Speak = window.SpeakCore;       // compares what the microphone heard with the sentence, shared with the server (speak-core.js)
  // The browser's speech recognition (Chrome, Edge, Safari on newer iPhones). Without it the cards keep the old "I said it out loud" button.
  // Nothing is asked of the student (no microphone permission) until they tap the microphone for the first time.
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let micBlocked = false; // set when the microphone / recognition does not work on this device: the old button is used from then on
  const app = document.getElementById('app');
  const APP_NAME = (document.querySelector('meta[name="app-name"]') || {}).content || 'WordStack';
  const MAX_PRACTICE = 30;
  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/></svg>',
    slow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/></svg>',
    hint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c.6 3.2 2.4 4.9 4 6.6 1.5 1.6 3 3.4 3 6.1A7 7 0 0 1 5 14.7c0-2 .8-3.6 2.2-5 .2 1.6.9 2.8 2.1 3.4C9.4 9 10.3 5.3 12 2z"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="14" rx="2.5"/><path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V17"/></svg>',
    puzzle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="8" height="6" rx="2"/><rect x="13" y="4" width="8" height="6" rx="2"/><rect x="3" y="14" width="11" height="6" rx="2"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    tap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  };

  /* ================================================================ */
  /* Utilities                                                         */
  /* ================================================================ */
  // Phones from before 2020 do not have replaceChildren; this keeps every screen working on them.
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function (...nodes) {
      while (this.firstChild) this.removeChild(this.firstChild);
      this.append(...nodes);
    };
  }

  // Pinch-zoom is switched off (the page also says so in its viewport tag). iPhones ignore that tag, so the gesture itself is stopped.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => document.addEventListener(type, e => e.preventDefault()));

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const toNum = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const clampNum = (v, min, max) => Math.min(max, Math.max(min, toNum(v)));

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // only ever used with the static ICON strings above
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }

  // Everything read from the device is treated as untrusted: it may be missing, damaged or from an older version.
  const storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode or full */ } },
  };

  const settings = (() => {
    const saved = storage.get('ws:settings', null);
    return { sound: isObj(saved) && typeof saved.sound === 'boolean' ? saved.sound : true };
  })();
  const saveSettings = () => storage.set('ws:settings', settings);

  // Timers that belong to the screen on display (spoken sentences, the peek). They are all cancelled when the
  // student leaves, so nothing speaks or changes on a screen that is no longer there.
  const screenTimers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { screenTimers.delete(id); fn(); }, ms);
    screenTimers.add(id);
    return id;
  }
  function clearScreenTimers() { screenTimers.forEach(clearTimeout); screenTimers.clear(); }

  // Restarts a CSS animation (remove the class, force one reflow, add it back).
  function restartAnimation(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // Round icon button (icon above a small label): used in the dock under the stage of every lesson step.
  function rbtn(icon, label, attrs) {
    const isSvg = icon.charAt(0) === '<';
    return h('button', { class: 'rbtn', type: 'button', 'aria-label': label, ...attrs },
      h('span', { class: 'ic' + (isSvg ? '' : ' emoji-ic'), html: isSvg ? icon : null }, isSvg ? null : icon),
      h('span', null, label));
  }

  // A row of dots for the progress inside a step: filled = done, ringed = the one being played now.
  // (With many sentences the dots turn into thin segments so the row still fits.)
  function progressDots(n) {
    const el = h('div', { class: 'dots' + (n > 14 ? ' many' : ''), role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n) },
      Array.from({ length: n }, () => h('i', { class: 'dot' })));
    const list = [...el.children];
    return {
      el,
      set(done, current) {
        list.forEach((d, k) => { d.className = 'dot' + (k < done ? ' on' : '') + (k === current ? ' cur' : ''); });
        el.setAttribute('aria-valuenow', String(done));
      },
    };
  }

  // Shrinks a text until it fits its box (long sentences on small phones) so the card never needs to scroll.
  function fitText(box, el, min) {
    el.style.fontSize = '';
    let px = parseFloat(getComputedStyle(el).fontSize) || 28;
    for (let n = 0; n < 48 && box.scrollHeight > box.clientHeight + 1 && px > (min || 16); n++) { px -= 1; el.style.fontSize = px + 'px'; }
  }

  // Calls fn when the window changes size (turning the phone) or when the web font has loaded. Returns a function that stops it.
  function onRelayout(fn) {
    window.addEventListener('resize', fn);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fn).catch(() => {});
    return () => window.removeEventListener('resize', fn);
  }

  // True on a computer-sized window (the same 900 px the computer style sheet uses). Phones and narrow windows get the phone layout.
  const pcQuery = window.matchMedia ? matchMedia('(min-width: 900px)') : null;
  const isPc = () => Boolean(pcQuery && pcQuery.matches);
  if (pcQuery && pcQuery.addEventListener) pcQuery.addEventListener('change', () => { closeSheet(); if (rerender) rerender(); });

  // A bottom sheet (used for the steps of a unit). It closes on a tap outside, on Escape, and when the screen changes.
  let sheetEl = null;
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  function showSheet(title, ...nodes) {
    closeSheet();
    const panel = h('div', { class: 'bsheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'bsheet-grab' }), h('h3', { class: 'bsheet-title' }, title), ...nodes);
    sheetEl = h('div', { class: 'bsheet-wrap' }, h('div', { class: 'bsheet-bg', onclick: closeSheet }), panel);
    document.body.append(sheetEl);
    return panel;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function formatTime(sec) {
    if (sec < 60) return `${sec}s`;
    const m = Math.round(sec / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  /* ---------- API ---------- */
  let me = null;
  let config = { appName: APP_NAME, allowSignup: true };

  const REQUEST_TIMEOUT_MS = 20000;

  async function api(method, url, body) {
    // A request that never answers (bad signal) is cut off, so it cannot block everything queued behind it.
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS) : 0;
    try {
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
        signal: ctl ? ctl.signal : undefined,
      });
      if (res.status === 204) return {};
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error((isObj(data) && data.error) || `Something went wrong (${res.status}).`);
        e.status = res.status;
        if (res.status === 401 && !url.startsWith('/api/auth/') && url !== '/api/me') { me = null; dropData(); goLogin(); }
        if (res.status === 403 && /disabled/i.test(e.message)) { me = null; toast(e.message); goLogin(); }
        throw e;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Offline-safe progress saving ---------- */
  // Progress calls go through an outbox: if the network fails they are kept and sent later,
  // so a finished sentence is never lost.
  const OUTBOX_MAX = 500; // a very long offline stretch must not fill the device
  const isRetryable = e => !e.status || e.status >= 500 || e.status === 429; // network trouble: keep and try again
  const outbox = {
    key: 'ws:outbox',
    items() {
      const v = storage.get(this.key, []);
      return Array.isArray(v) ? v.filter(i => isObj(i) && typeof i.url === 'string' && typeof i.id === 'string') : [];
    },
    save(list) { storage.set(this.key, list.slice(-OUTBOX_MAX)); },
    flushing: false,
    async send(url, body) {
      const item = { id: uid(), user: me && me.id, url, body };
      try {
        return await api('POST', url, body);
      } catch (e) {
        if (isRetryable(e)) {
          this.save([...this.items(), item]);
          return null;
        }
        throw e;
      }
    },
    async flush() {
      if (this.flushing || !me) return;
      this.flushing = true;
      let sent = 0;
      try {
        for (const item of this.items()) {
          if (item.user !== me.id) continue;
          try {
            await api('POST', item.url, item.body); sent++;
          } catch (e) {
            if (isRetryable(e) || e.status === 401) break; // try again later
          }
          this.save(this.items().filter(x => x.id !== item.id));
        }
      } catch (e) {
        /* the queue is kept; the next flush tries again */
      } finally {
        this.flushing = false;
        if (sent) scheduleSync(400);
      }
    },
  };
  window.addEventListener('online', () => { outbox.flush(); });

  // A slim bar at the top while the phone has no connection (progress keeps being saved on the phone).
  const offlineBar = document.getElementById('offline');
  function syncOfflineBar() {
    const off = !navigator.onLine;
    offlineBar.hidden = !off;
    offlineBar.textContent = off ? '📡 Offline · your progress is saved and will sync later' : '';
    document.documentElement.style.setProperty('--off', off ? offlineBar.offsetHeight + 'px' : '0px'); // the one-screen lessons make room for it
  }
  window.addEventListener('offline', syncOfflineBar);
  window.addEventListener('resize', () => { if (!offlineBar.hidden) syncOfflineBar(); });
  window.addEventListener('online', () => { syncOfflineBar(); toast('Back online ✓'); });
  syncOfflineBar();

  /* ---------- The student's data: in memory and on the device ---------- */
  // Everything the app needs (lessons, sentences, the student's own progress) is loaded once with GET /api/app and
  // saved on the device. It is read synchronously when the script starts, so every screen opens at once, with no
  // waiting for the network. Progress is applied here first (same rules as the server) and sent in the background.
  const APP_KEY = 'ws:app';
  const APP_VERSION = 1; // bump when the saved shape changes; older copies are then ignored and fetched again

  // Checks and cleans a copy of the student's data (from the server or from the device). Anything that is not
  // exactly the shape the screens expect is dropped, so damaged data can never break a screen.
  // A grammar gap is kept only when it is exactly right: 3 different choices that include the answer.
  function cleanGap(x) {
    const g = x.gap;
    if (!isObj(g) || typeof g.answer !== 'string' || !Number.isInteger(g.index) || g.index < 0
      || !Array.isArray(g.options) || g.options.length !== 3 || !g.options.every(o => typeof o === 'string') || !g.options.includes(g.answer)) return {};
    return { gap: { index: g.index, answer: g.answer, options: [...g.options], ...(typeof g.why === 'string' && g.why.trim() ? { why: g.why.slice(0, 140) } : {}) }, gdone: Boolean(x.gdone) };
  }

  function sanitizeApp(d) {
    try {
      if (!isObj(d) || !isObj(d.user) || typeof d.user.id !== 'string' || !Array.isArray(d.lessons)) return null;
      const st = isObj(d.stats) ? d.stats : {};
      const text = v => (v === null || v === undefined ? '' : String(v));
      const lessons = [];
      for (const l of d.lessons) {
        if (!isObj(l) || typeof l.slug !== 'string' || !Array.isArray(l.units)) continue;
        const units = [];
        for (const u of l.units) {
          if (!isObj(u) || typeof u.id !== 'string' || !Array.isArray(u.sentences)) continue;
          units.push({
            id: u.id,
            title: text(u.title),
            quizPassed: Boolean(u.quizPassed),
            ...(typeof u.tip === 'string' && u.tip.trim() ? { tip: u.tip.slice(0, 300) } : {}),
            ...(typeof u.tipAr === 'string' && u.tipAr.trim() ? { tipAr: u.tipAr.slice(0, 300) } : {}),
            sentences: u.sentences.filter(x => isObj(x) && typeof x.en === 'string' && x.en.trim())
              .map(x => ({ en: x.en, stars: clampNum(x.stars, 0, 3), extra: clampNum(x.extra, 0, 3), ...cleanGap(x), ...(typeof x.ar === 'string' && x.ar.trim() ? { ar: x.ar.slice(0, 300) } : {}),
                // "arq" = the Arabic shown in the Arabic -> English step (sent whether or not the card switch is on); "arbDone" = that step is done
                ...(typeof x.arq === 'string' && x.arq.trim() ? { arq: x.arq.slice(0, 300), ...(x.arbDone ? { arbDone: true } : {}) } : {}) })),
          });
        }
        if (!units.length) continue;
        const lp = isObj(l.lp) ? l.lp : null;
        lessons.push({
          slug: l.slug, title: text(l.title), level: text(l.level), description: text(l.description), emoji: text(l.emoji) || '📘',
          assigned: Boolean(l.assigned),
          finalPassed: Boolean(l.finalPassed),
          // word meanings { word: Arabic }: only plain strings are kept
          words: isObj(l.words) ? Object.fromEntries(Object.entries(l.words).filter(([k, v]) => k.length <= 40 && typeof v === 'string' && v.trim()).slice(0, 1000).map(([k, v]) => [k, v.slice(0, 80)])) : {},
          units,
          lp: lp ? { started_at: lp.started_at || null, last_activity_at: lp.last_activity_at || null, completed_at: lp.completed_at || null, time_spent_sec: toNum(lp.time_spent_sec) } : null,
          unitRows: (Array.isArray(l.unitRows) ? l.unitRows : []).filter(r => isObj(r) && typeof r.unit_id === 'string')
            .map(r => ({ unit_id: r.unit_id, learn_index: toNum(r.learn_index), learned_at: r.learned_at || null })),
        });
      }
      return {
        user: { id: d.user.id, name: text(d.user.name), email: text(d.user.email), createdAt: d.user.createdAt || null, arabic: Boolean(d.user.arabic) },
        stats: { sentencesSolved: toNum(st.sentencesSolved), stars: toNum(st.stars), extraStars: toNum(st.extraStars),
          lessonsCompleted: toNum(st.lessonsCompleted), timeSpent: toNum(st.timeSpent), streak: toNum(st.streak) },
        lessons,
        lock: d.lock !== false, // lessons open one by one (the teacher can switch it off)
        // the sentences due for review today: { slug, sentence, stage }
        reviews: (Array.isArray(d.reviews) ? d.reviews : []).filter(x => isObj(x) && typeof x.slug === 'string' && typeof x.sentence === 'string')
          .slice(0, 200).map(x => ({ slug: x.slug, sentence: x.sentence, stage: clampNum(x.stage, 0, 5) })),
      };
    } catch (e) {
      return null;
    }
  }

  function loadSaved() {
    const saved = storage.get(APP_KEY, null);
    // Older releases saved the data itself; newer ones wrap it with a version number.
    return sanitizeApp(isObj(saved) && saved.v === APP_VERSION ? saved.data : saved);
  }

  let S = null;                        // { user, stats, lessons: [...] }
  let bySlug = new Map();              // slug -> lesson, for instant lookups
  const setData = d => { S = d; bySlug = new Map(d ? d.lessons.map(l => [l.slug, l]) : []); };
  setData(loadSaved());                // read once, synchronously, when the script starts

  let synced = false;                  // true once this visit has heard from the server
  let rev = 0;                         // counts local changes, so a late server answer can never undo them
  let rerender = null;                 // redraws the current screen from S (only for screens that just display data)
  const models = new WeakMap();

  // Saving is batched: a burst of changes (a sentence solved, then the next...) is written once, shortly after,
  // instead of re-writing the whole copy every time. It is also written the moment the page is hidden or closed.
  let saveTimer = 0;
  function writeData() {
    saveTimer = 0;
    storage.set(APP_KEY, S ? { v: APP_VERSION, data: S } : null);
  }
  const saveData = () => { if (!saveTimer) saveTimer = setTimeout(writeData, 250); };
  function flushData() { if (saveTimer) { clearTimeout(saveTimer); writeData(); } }
  const dropData = () => {
    clearTimeout(saveTimer); saveTimer = 0;
    setData(null); synced = false;
    storage.set(APP_KEY, null); storage.set('ws:home', null);
  };
  window.addEventListener('pagehide', flushData);

  const rawLesson = slug => bySlug.get(slug) || null;
  const modelOf = raw => { let m = models.get(raw); if (!m) models.set(raw, m = Progress.modelOf(raw)); return m; };

  // Lessons open one by one: the same rule as the server (lessonLocks in progress-core.js). Level (A1 first), then the order of the lessons page.
  function lessonList() {
    const items = S.lessons.map(l => ({
      slug: l.slug, title: l.title, level: l.level, description: l.description, emoji: l.emoji, assigned: l.assigned,
      count: l.units.reduce((a, u) => a + u.sentences.length, 0), progress: modelOf(l),
      started: Boolean(l.lp) || (l.unitRows || []).length > 0, finished: Boolean(l.lp && l.lp.completed_at),
    }));
    const locks = S.lock === false ? new Map() : Progress.lessonLocks(items.map(l => ({ slug: l.slug, title: l.title, level: l.level, assigned: l.assigned, started: l.started, completed: l.finished })));
    items.forEach(l => { const k = locks.get(l.slug); l.locked = Boolean(k && k.locked); l.lockedBy = k && k.by ? k.by.title : null; });
    if (S.lock !== false) { // the lessons are shown in the order they open
      const rank = l => { const k = Progress.LEVELS.indexOf(String(l.level).toUpperCase()); return k < 0 ? Progress.LEVELS.length : k; };
      return items.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i).map(x => x.l);
    }
    return items;
  }
  const lockedLesson = slug => (S ? lessonList().find(l => l.slug === slug && l.locked) || null : null);
  // A private copy for a screen to work with (a round must not change under its own feet).
  function lessonView(slug) {
    const raw = rawLesson(slug);
    if (!raw) return null;
    return {
      lesson: { slug: raw.slug, title: raw.title, level: raw.level, description: raw.description, emoji: raw.emoji, assigned: raw.assigned, words: raw.words || {},
        units: JSON.parse(JSON.stringify(raw.units)) },
      progress: modelOf(raw),
    };
  }
  function noteLearn(slug, unitId, index, done, seconds) {
    const raw = rawLesson(slug);
    if (!raw) return;
    Progress.applyLearn(raw, unitId, index, done, seconds, new Date().toISOString());
    models.delete(raw); rev++; saveData();
  }
  // A grammar gap was answered right: saved on the device at once, like everything else.
  function noteGrammar(slug, sentence, seconds) {
    const raw = rawLesson(slug);
    const r = raw && Progress.applyGrammar(raw, S.stats, sentence, seconds, new Date().toISOString());
    if (!r) return { completed: false };
    models.delete(raw); rev++; saveData();
    return r;
  }
  // The Arabic -> English step was solved: remembered on the device at once (no stars, nothing is needed to finish the unit).
  function noteArb(slug, sentence, seconds) {
    const raw = rawLesson(slug);
    const r = raw && Progress.applyArb(raw, S.stats, sentence, seconds, new Date().toISOString());
    if (!r) return { first: false };
    models.delete(raw); rev++; saveData();
    return r;
  }
  // The sentences of a unit that the Arabic -> English step uses: built, with Arabic. Normally only the ones not done yet; `all` plays every one again.
  const arbItems = (unit, all) => unit.sentences.filter(sn => sn.arq && sn.stars && (all || !sn.arbDone));
  const arbCounts = unit => ({ total: unit.sentences.filter(sn => sn.arq).length, done: unit.sentences.filter(sn => sn.arq && sn.arbDone).length });

  // The sentences due for review, with what the screens need. A sentence whose lesson (or text) the teacher changed is simply left out.
  function reviewItems() {
    const out = [];
    for (const r of (S && S.reviews) || []) {
      const raw = rawLesson(r.slug);
      const sn = raw && raw.units.flatMap(u => u.sentences).find(x => x.en === r.sentence);
      if (sn) out.push({ slug: r.slug, sentence: r.sentence, stage: r.stage, hasGap: Boolean(sn.gap) });
    }
    return out;
  }
  // A review question was answered: it is no longer due today (right or wrong, its next review is tomorrow or later). Reviews never touch stars.
  function noteReview(slug, sentence) {
    if (!S) return;
    S.reviews = (S.reviews || []).filter(x => !(x.slug === slug && x.sentence === sentence));
    if (!S.stats.streak) S.stats.streak = 1; // a review counts for the day streak
    rev++; saveData();
  }

  // A quiz was finished: only passing changes the progress (the unit, or the lesson, can now be finished).
  function noteQuiz(slug, scope, passed, seconds) {
    const raw = rawLesson(slug);
    const r = raw && Progress.applyQuiz(raw, S.stats, scope, passed, seconds, new Date().toISOString());
    if (!r) return { completed: false, passed };
    models.delete(raw); rev++; saveData();
    return r;
  }
  function noteSolve(slug, sentence, stars, seconds) {
    const raw = rawLesson(slug);
    const r = raw && Progress.applySolve(raw, S.stats, sentence, stars, seconds, new Date().toISOString());
    if (!r) return { stars, best: stars, extra: 0, replay: false, completed: false };
    models.delete(raw); rev++; saveData();
    return r;
  }

  // Asks the server for the latest and quietly swaps it in. If the student did something meanwhile, or progress
  // is still waiting to be sent, the (older) answer is ignored and we ask again a moment later, waiting longer
  // each time (so a long offline stretch costs no battery).
  let syncing = false, syncTimer = 0, syncMisses = 0;
  function scheduleSync(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(refresh, ms == null ? 1500 : ms); }
  async function refresh() {
    if (syncing) return;
    syncing = true;
    const startRev = rev, hadData = Boolean(S);
    try {
      const d = sanitizeApp(await api('GET', '/api/app'));
      if (!d) throw new Error('Unexpected answer from the server.');
      if (startRev !== rev || outbox.items().length) {
        outbox.flush();
        syncMisses = Math.min(syncMisses + 1, 5);
        scheduleSync(Math.min(30000, 1500 * 2 ** syncMisses));
        return;
      }
      syncMisses = 0;
      const changed = JSON.stringify(d) !== JSON.stringify(S);
      setData(d); me = d.user; synced = true; saveData();
      if (!hadData || app.querySelector(':scope > .sk-layer')) route();        // a screen was waiting for data
      else if (changed && rerender) rerender();
    } catch (e) {
      if (!S && e.status !== 401) errorView(e, () => { refresh(); });
    } finally {
      syncing = false;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushData();
    else if (me) { outbox.flush(); scheduleSync(200); }
  });
  // The database is the source of truth: the phone also checks it when the connection comes back and once a minute
  // (never in the middle of a lesson step), so progress made on another device shows up here.
  window.addEventListener('online', () => { if (me) scheduleSync(300); });
  setInterval(() => { if (me && !document.hidden && navigator.onLine && !app.classList.contains('play')) scheduleSync(0); }, 60000);

  /* ---------- Sound, speech, confetti ---------- */
  let audioCtx;
  function tone(freq, at, dur, type) {
    if (!settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') { const r = audioCtx.resume(); if (r && r.catch) r.catch(() => {}); }
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
    card: () => tone(880, 0, 0.05, 'sine'),
    win: () => { tone(523, 0, 0.15); tone(659, 0.12, 0.15); tone(784, 0.24, 0.3); },
    finish: () => { tone(523, 0, 0.15); tone(659, 0.15, 0.15); tone(784, 0.3, 0.15); tone(1047, 0.45, 0.4); },
  };

  const canSpeak = 'speechSynthesis' in window;
  let voice = null;       // the most natural English voice this device has
  let localVoice = null;  // the best one that works without internet (used when the best one cannot be reached)

  // Every phone, tablet and computer has its own voices, so the app looks through them and picks the most natural English one.
  function voiceScore(v) {
    const name = v.name || '', lang = v.lang || '';
    let score = 0;
    if (/^en[-_]US$/i.test(lang)) score += 30;
    else if (/^en[-_](GB|AU|CA|IE|NZ|ZA|IN)$/i.test(lang)) score += 18;
    else score += 8;
    if (/natural|neural|online/i.test(name)) score += 50;                 // Microsoft's neural voices (Windows, Edge)
    if (/premium|enhanced/i.test(name)) score += 40;                       // high-quality voices downloaded on iPhone / Mac
    if (/siri/i.test(name)) score += 35;
    if (/google/i.test(name)) score += 25;                                 // Google's voices (Chrome, Android)
    if (/samantha|ava|allison|zoe|evan|nicky|aaron|aria|jenny|guy/i.test(name)) score += 10;
    if (v.localService === false) score += 15;                             // voices that run on a server usually sound better
    if (/compact|espeak|festival|mbrola/i.test(name)) score -= 40;         // the small, robotic ones
    return score;
  }
  function pickVoice() {
    if (!canSpeak) return;
    let english;
    try { english = speechSynthesis.getVoices().filter(v => /^en([-_]|$)/i.test(v.lang || '')); } catch (e) { return; }
    const best = list => list.reduce((top, v) => (!top || voiceScore(v) > voiceScore(top) ? v : top), null);
    voice = best(english);
    localVoice = best(english.filter(v => v.localService !== false));
  }
  if (canSpeak) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }

  function speak(text, slow, onEnd) {
    if (!canSpeak || !text) { if (onEnd) onEnd(); return; }
    try {
      if (!voice) pickVoice(); // phones often load their voices late and never announce it
      speechSynthesis.cancel();
      const say = v => {
        const u = new SpeechSynthesisUtterance(String(text));
        u.lang = v ? v.lang : 'en-US';
        if (v) u.voice = v;
        u.rate = slow ? 0.7 : 0.95; // very low rates make many phone voices sound broken
        u.onend = () => { if (onEnd) onEnd(); };
        u.onerror = e => {
          // An online voice that cannot be reached: say it with the best voice that works offline instead of staying silent.
          const cut = e && (e.error === 'canceled' || e.error === 'interrupted');
          if (!cut && v && v.localService === false && localVoice && localVoice !== v) { say(localVoice); return; }
          if (onEnd) onEnd();
        };
        speechSynthesis.speak(u);
      };
      say(voice);
    } catch (e) {
      if (onEnd) onEnd(); // speech is a bonus; the lesson goes on without it
    }
  }
  const stopSpeech = () => { if (canSpeak) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } } };

  const cv = document.getElementById('confetti');
  const cx = cv && cv.getContext ? cv.getContext('2d') : null;
  let confettiRun = 0;
  function confetti(n) {
    if (!cx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const run = ++confettiRun;
    cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#4F5BD5', '#8C96FF', '#F2A516', '#2F9E5B', '#18181B'];
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

  /* ---------- Text processing ---------- */
  const stripEdges = t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const tokenize = sentence => sentence.trim().split(/\s+/).map(stripEdges).filter(Boolean);

  /** Lower-cases the first word so its capital letter doesn't give it away (keeps "I", "I'm", acronyms). */
  function hideCapital(words) {
    const out = [...words];
    const w = out[0];
    if (w && !/^I(['’](m|ll|ve|d))?$/.test(w) && w.slice(1) === w.slice(1).toLowerCase())
      out[0] = w.charAt(0).toLowerCase() + w.slice(1);
    return out;
  }

  const ABBR = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|No|e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|[A-Z])\.$/i;
  // Cuts a line after every . ! ? … that is followed by spaces (the punctuation stays with its sentence).
  function splitAfterPunctuation(line) {
    const parts = [];
    const re = /[.!?…]\s+/g;
    let last = 0, m;
    while ((m = re.exec(line))) { parts.push(line.slice(last, m.index + 1)); last = m.index + m[0].length; }
    parts.push(line.slice(last));
    return parts;
  }
  function splitSentences(text) {
    const out = [];
    for (const line of String(text).replace(/\r/g, '').split(/\n+/)) {
      let buf = '';
      for (const part of splitAfterPunctuation(line)) {
        buf = buf ? buf + ' ' + part : part;
        if (!ABBR.test(buf)) { out.push(buf.trim()); buf = ''; }
      }
      if (buf.trim()) out.push(buf.trim());
    }
    return out
      .map(s => s.split(/\s+/).filter(t => /[\p{Script=Latin}\p{N}]/u.test(t)).join(' '))
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
  const starNodes = (n, max = 3) => [h('span', null, '★'.repeat(n)), h('span', { class: 'off' }, '★'.repeat(Math.max(0, max - n)))];

  /* ================================================================ */
  /* Router                                                            */
  /* ================================================================ */
  let cleanup = null;
  let viewId = 0; // changes on every navigation, so a slow response can't draw over a newer screen
  function navigate(path, replace) {
    try {
      // Opening the page you are already on must not add a second history entry.
      if (replace || path === location.pathname + location.search) history.replaceState(null, '', path); else history.pushState(null, '', path);
    } catch (e) {
      try { history.replaceState(null, '', '/'); } catch (e2) { /* keep the current address */ }
    }
    route();
  }
  function goLogin() {
    const here = location.pathname + location.search;
    if (/^\/(login|signup)/.test(location.pathname)) return;
    navigate('/login' + (here && here !== '/' ? `?next=${encodeURIComponent(here)}` : ''), true);
  }

  // Remembers how far each list screen was scrolled, so coming back (the arrow, or the phone's back button)
  // lands exactly where the student left, e.g. on the lesson they just opened, not at the top.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const scrollPos = new Map(); // "/path?query" -> scrollY
  const SCROLL_MEMORY_MAX = 200;
  let shownKey = null;         // the screen that is on display now
  let scrollQueued = false;
  // Scrolling fires very often; the position is noted at most once per frame.
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (!shownKey) return;
      scrollPos.delete(shownKey); // re-insert so the most recent screens are the ones kept
      scrollPos.set(shownKey, window.scrollY);
      if (scrollPos.size > SCROLL_MEMORY_MAX) scrollPos.delete(scrollPos.keys().next().value);
    });
  }, { passive: true });
  const isListScreen = p => p === '/' || p === '/completed' || /^\/lesson\/[a-z0-9-]+$/.test(p);

  // The kind of screen decides how wide the page may be on a computer (see the "large screens" part of style.css).
  function layoutFor(path) {
    if (/^\/lesson\/[^/]+\/(u\/|final$)/.test(path) || path === '/practice' || path === '/review') return 'game';
    if (path === '/profile' || path === '/login' || path === '/signup') return 'narrow';
    return 'wide';
  }

  function route() {
    viewId++;
    rerender = null;
    closeSheet();
    app.classList.remove('play');
    if (cleanup) { try { cleanup(); } catch (e) { /* the old screen is gone either way */ } cleanup = null; }
    clearScreenTimers();
    stopSpeech();
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const key = location.pathname + location.search;
    app.dataset.layout = layoutFor(path);
    const back = isListScreen(path) ? scrollPos.get(key) || 0 : 0;
    shownKey = null; // ignore the scroll jumps caused by swapping the screen
    const id = viewId;
    try {
      dispatch(path);
    } catch (e) {
      // One screen failing must not leave a blank page: show the normal "try again" screen instead.
      console.error(e);
      try { errorView({ message: 'Something went wrong. Please try again.' }, route); } catch (e2) { /* nothing more to do */ }
    }
    if (id !== viewId) return; // the screen sent us elsewhere; that route has already taken care of the scroll
    window.scrollTo(0, back);
    shownKey = key;
  }

  function dispatch(path) {
    if (path === '/login') return showAuth('login');
    if (path === '/signup') return showAuth('signup');
    if (!me) return goLogin();
    let m;
    // A closed lesson (the one before it is not finished yet) cannot be opened, not even with a typed link.
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)(\/|$)/))) {
      const closed = lockedLesson(m[1]);
      if (closed) { toast(`Finish “${closed.lockedBy}” first 🔒`); return navigate('/', true); }
    }
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)$/))) return showLessonHub(m[1]);
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)\/u\/([a-z0-9]+)\/(learn|build|arbuild|review|grammar|quiz)$/i))) return showLessonStep(m[1], m[2], m[3]);
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)\/final$/))) return showFinalQuiz(m[1]);
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)\/(learn|build|review|grammar)$/))) return navigate(`/lesson/${m[1]}`, true);
    if (path === '/practice') return showPractice();
    if (path === '/review') return showReview();
    if (path === '/profile') return showProfile();
    if (path === '/completed') return showCompleted();
    if (path !== '/') history.replaceState(null, '', '/');
    showHome();
  }
  window.addEventListener('popstate', route);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (a.hasAttribute('data-top')) scrollPos.delete(a.getAttribute('href')); // a fresh start at the top, not the old spot
    navigate(a.getAttribute('href'));
  });
  app.addEventListener('contextmenu', e => { if (e.target.closest('.tile')) e.preventDefault(); });

  // Shows a screen. If a skeleton is on screen, the new content fades in over it while the skeleton fades out
  // (pure CSS opacity), so the swap is smooth and nothing shifts.
  function setView(...nodes) {
    const kids = nodes.flat().filter(n => n !== null && n !== undefined && n !== false);
    app.classList.remove('play');
    const layer = app.querySelector(':scope > .sk-layer');
    app.removeAttribute('aria-busy');
    if (!layer) return app.replaceChildren(...kids);
    app.replaceChildren(layer, ...kids);
    kids.forEach(k => k.classList && k.classList.add('reveal'));
    layer.classList.add('out');
    if (getComputedStyle(layer).animationName === 'none') layer.remove(); // reduced motion: no fade
    else layer.addEventListener('animationend', () => layer.remove(), { once: true });
  }
  // Placeholder that mirrors the real screen. Same markup the server already put in the HTML (see index.html).
  function showSkeleton(kind) {
    const old = app.querySelector(':scope > .sk-layer');
    if (old && old.dataset.kind === kind && app.children.length === 1) return; // already showing it
    const layer = h('div', { class: 'sk-layer', 'data-kind': kind, role: 'status', 'aria-label': 'Loading' });
    layer.append(document.getElementById('sk-' + kind).content.cloneNode(true));
    app.replaceChildren(layer);
    app.setAttribute('aria-busy', 'true');
  }
  function errorView(e, retry) {
    setView(appBar(), h('div', { class: 'state' },
      h('div', { class: 'big', 'aria-hidden': 'true' }, e.status === 404 ? '🔍' : '📡'),
      h('p', null, e.status === 404 ? "This lesson doesn't exist or isn't available to you." : e.message || "Couldn't connect. Check your internet."),
      h('div', { class: 'row-actions' },
        retry && e.status !== 404 ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: retry }, 'Try again') : null,
        h('a', { class: 'btn btn-primary', href: '/', 'data-link': true }, 'Go home'))));
  }

  function soundButton() {
    const b = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Sound on or off' });
    const sync = () => { b.innerHTML = settings.sound ? ICON.sound : ICON.mute; b.setAttribute('aria-pressed', String(settings.sound)); };
    b.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); sync(); if (!settings.sound) stopSpeech(); });
    sync();
    return b;
  }

  function avatar(name, cls) {
    return h('span', { class: 'avatar ' + (cls || ''), 'aria-hidden': 'true' }, (name || '?').trim().charAt(0).toUpperCase());
  }

  function appBar() {
    return h('header', { class: 'appbar' },
      h('a', { class: 'brand', href: '/', 'data-link': true }, h('img', { src: '/icons/icon.svg', alt: '' }), config.appName),
      h('div', { class: 'tools' }, soundButton(),
        me ? h('a', { class: 'avatar-btn', href: '/profile', 'data-link': true, 'aria-label': 'My profile' }, avatar(me.name)) : null));
  }

  /* ================================================================ */
  /* Login / Sign up                                                   */
  /* ================================================================ */
  function showAuth(mode) {
    if (me) return navigate('/', true);
    if (mode === 'signup' && !config.allowSignup) return navigate('/login', true);
    const isSignup = mode === 'signup';
    document.title = `${isSignup ? 'Sign up' : 'Log in'} · ${config.appName}`;
    const next = new URLSearchParams(location.search).get('next');
    // Only an address inside this app is accepted: starts with a single '/', plain printable characters.
    const safeNext = typeof next === 'string' && /^\/(?![/\\])[\x21-\x7e]*$/.test(next) ? next : '/';
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    const name = h('input', { id: 'f-name', type: 'text', autocomplete: 'name', required: true, maxlength: '60', placeholder: 'e.g. Sara Ahmed' });
    const email = h('input', { id: 'f-email', type: 'email', autocomplete: 'email', required: true, maxlength: '254', placeholder: 'you@example.com', inputmode: 'email' });
    const password = h('input', { id: 'f-password', type: 'password', autocomplete: isSignup ? 'new-password' : 'current-password', required: true, minlength: isSignup ? '8' : null, maxlength: '128' });
    const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isSignup ? 'Create my account' : 'Log in');

    const form = h('form', { class: 'auth-form', novalidate: true },
      isSignup ? h('div', { class: 'field' }, h('label', { for: 'f-name' }, 'Your name'), name) : null,
      h('div', { class: 'field' }, h('label', { for: 'f-email' }, 'Email'), email),
      h('div', { class: 'field' }, h('label', { for: 'f-password' }, 'Password', isSignup ? h('span', { class: 'muted' }, ' (at least 8 characters)') : null), password),
      msg, submit);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      msg.textContent = '';
      if (isSignup && name.value.trim().length < 2) { msg.textContent = 'Please enter your name.'; name.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { msg.textContent = 'Please enter a valid email address.'; email.focus(); return; }
      if (isSignup && password.value.length < 8) { msg.textContent = 'Password must be at least 8 characters.'; password.focus(); return; }
      submit.disabled = true;
      try {
        const body = { email: email.value, password: password.value };
        if (isSignup) body.name = name.value;
        await api('POST', isSignup ? '/api/auth/signup' : '/api/auth/login', body);
        dropData(); // never keep anything that belongs to someone else
        const fresh = sanitizeApp(await api('GET', '/api/app'));
        if (!fresh) throw new Error('Unexpected answer from the server. Please try again.');
        setData(fresh); me = fresh.user; synced = true; saveData();
        outbox.flush();
        navigate(safeNext, true);
        if (isSignup) toast(`Welcome, ${me.name}`);
      } catch (err) {
        msg.textContent = err.message;
      } finally {
        submit.disabled = false;
      }
    });

    const qs = next ? `?next=${encodeURIComponent(next)}` : '';
    setView(h('section', { class: 'auth' },
      h('div', { class: 'auth-brand' }, h('img', { src: '/icons/icon.svg', alt: '' }), h('span', null, config.appName)),
      h('h1', null, isSignup ? 'Create your account' : 'Welcome back'),
      h('p', { class: 'subtitle' }, isSignup ? 'Learn English one sentence at a time.' : 'Log in to continue learning.'),
      h('div', { class: 'card' }, form),
      h('p', { class: 'auth-switch' },
        isSignup
          ? ['Already have an account? ', h('a', { href: '/login' + qs, 'data-link': true }, 'Log in')]
          : config.allowSignup ? ['New here? ', h('a', { href: '/signup' + qs, 'data-link': true }, 'Create an account')] : 'Ask your teacher for an account.'),
      !isSignup ? h('p', { class: 'auth-switch muted' }, 'Forgot your password? Ask your teacher to reset it.') : null));
    (isSignup ? name : email).focus();
  }

  /* ================================================================ */
  /* Home                                                              */
  /* ================================================================ */
  let levelFilter = storage.get('ws:level', 'All');

  // "Progress" means the student really did something: went past the first card, finished the cards, built or answered a sentence.
  // Just opening a lesson (which shows its first card) does not count, so it still says Start, not Continue.
  const didAnything = p => p.solved > 0 || p.units.some(u => u.learned || u.learnIndex > 0 || u.grammarDone > 0);

  function statusText(p) {
    if (p.completed) return '✓ Completed';
    if (p.currentUnit === null) return 'Final quiz';
    if (p.status === 'new' || !didAnything(p)) return 'New';
    const u = p.units[p.currentUnit];
    const where = p.unitsTotal > 1 ? `Unit ${p.currentUnit + 1}/${p.unitsTotal} · ` : '';
    return where + (u.learned ? (u.grammarReady ? 'grammar next' : u.quizReady ? 'quiz next' : `${u.solved}/${u.total} built`) : 'learning');
  }

  function unitStepText(p) {
    if (p.currentUnit === null) return p.completed ? 'Completed' : 'Final quiz · the last step';
    const u = p.units[p.currentUnit];
    const where = p.unitsTotal > 1 ? `Unit ${p.currentUnit + 1} · ${u.title} · ` : '';
    return where + (u.quizReady ? 'Step 4 · the quiz' : u.grammarReady ? `Step 3 · grammar ${u.grammarDone} of ${u.grammarTotal}` : u.learned ? `Step 2 · ${u.solved} of ${u.total} built` : 'Step 1 · learning the sentences');
  }

  // Once per phone: on an iPhone or iPad that runs in a normal browser tab, suggest adding the app to the Home Screen
  // (the installed app is full screen, without the browser bars).
  let showInstallTip = (() => {
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    if (!apple || installed || storage.get('ws:install-tip', false)) return false;
    storage.set('ws:install-tip', true);
    return true;
  })();
  const SHARE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  function installTip() {
    return h('div', { class: 'tip-card', role: 'note' },
      h('span', { class: 'tip-ic', 'aria-hidden': 'true' }, '📲'),
      h('div', { class: 'tip-text' }, h('b', null, 'Add to Home Screen'),
        h('span', { html: `Tap Share ${SHARE_ICON} then “Add to Home Screen” to open this app full screen.` })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Dismiss', html: '✕', onclick: () => { showInstallTip = false; if (rerender) rerender(); } }));
  }

  function showHome() {
    document.title = config.appName;
    if (!S) return showSkeleton('home');
    rerender = () => renderHome(lessonList(), S.stats);
    rerender();
    outbox.flush();
  }

  function renderHome(all, stats) {
    // Finished lessons move to their own page, so this list only holds what is still to do.
    const lessons = all.filter(l => !l.progress.completed);
    const finished = all.filter(l => l.progress.completed);
    const cont = lessons
      .filter(l => l.progress.lastActivityAt && didAnything(l.progress))
      .sort((a, b) => new Date(b.progress.lastActivityAt) - new Date(a.progress.lastActivityAt))[0];
    const assigned = lessons.filter(l => l.assigned);

    const levels = ['All', ...new Set(lessons.map(l => l.level))].sort((a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)));
    if (!levels.includes(levelFilter)) levelFilter = 'All';
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by level' });
    const grid = h('div', { class: 'lesson-grid' });
    const draw = () => {
      chips.replaceChildren(...(levels.length > 2 ? levels.map(lv => h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(lv === levelFilter),
        onclick: () => { levelFilter = lv; storage.set('ws:level', lv); draw(); },
      }, lv)) : []));
      grid.replaceChildren(
        ...lessons.filter(l => levelFilter === 'All' || l.level === levelFilter).map(lessonCard),
        h('a', { class: 'lesson-card card-practice', href: '/practice', 'data-link': true },
          h('span', { class: 'emoji', html: ICON.pen }),
          h('div', { class: 'body' },
            h('div', { class: 'title' }, 'Practise your own text'),
            h('div', { class: 'desc' }, 'Paste any English text and turn it into a puzzle.')),
          h('span', { class: 'chev', html: ICON.next })));
    };
    draw();

    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const firstName = me.name.split(/\s+/)[0];
    const hello = `${greet}, ${firstName}`;
    const hint = stats.sentencesSolved ? 'Keep going, you are doing great! ⭐' : 'Tap a lesson to play! 🎈';
    const emptyText = finished.length ? 'You finished every lesson! 🎉 Play your own text below, or open a finished lesson to play it again.' : 'No lessons yet. Your teacher will add some soon.';
    const dueN = reviewItems().length;
    const reviewCard = dueN ? h('a', { class: 'lesson-card card-review', href: '/review', 'data-link': true },
      h('span', { class: 'emoji', 'aria-hidden': 'true' }, '🧠'),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, `Review (${dueN})`),
        h('div', { class: 'desc' }, 'Hard sentences are back. A few minutes keeps them in your head.')),
      h('span', { class: 'chev', html: ICON.next })) : null;
    const statRow = () => h('div', { class: 'stat-row two' },
      statTile('star', stats.stars, 'Stars', stats.extraStars ? `+${stats.extraStars} extra` : null),
      statTile('flame', stats.streak, 'Day streak'));

    // On a computer: the greeting on top, then a sidebar (stats, Continue, level filter) and the grid of lessons.
    if (isPc()) {
      return setView(
        appBar(),
        h('div', { class: 'home-head' }, h('h1', null, hello), h('p', { class: 'subtitle' }, hint)),
        h('div', { class: 'home-grid' },
          h('aside', { class: 'home-side' },
            showInstallTip ? installTip() : null,
            statRow(),
            reviewCard,
            cont ? continueCard(cont) : null,
            finished.length ? completedLink(finished) : null),
          h('div', { class: 'home-main' },
            assigned.length ? h('section', { class: 'section' }, h('h2', null, 'For you'), h('div', { class: 'lesson-grid' }, assigned.map(lessonCard))) : null,
            h('section', { class: 'section' },
              // the level filter sits right above the grid, on the same line as the title
              h('div', { class: 'section-head' }, h('h2', null, 'All lessons'), lessons.length ? chips : null),
              lessons.length ? null : h('p', { class: 'empty' }, emptyText),
              grid))));
    }

    setView(
      appBar(),
      h('h1', null, hello),
      h('p', { class: 'subtitle' }, hint),
      showInstallTip ? installTip() : null,
      statRow(),
      reviewCard,
      cont ? continueCard(cont) : null,
      finished.length ? completedLink(finished) : null,
      assigned.length ? h('section', { class: 'section' },
        h('h2', null, 'For you'),
        h('div', { class: 'lesson-grid' }, assigned.map(lessonCard))) : null,
      h('section', { class: 'section' },
        h('h2', null, 'All lessons'),
        lessons.length ? chips : h('p', { class: 'empty' }, emptyText),
        grid)
    );
  }

  function completedLink(finished) {
    const stars = finished.reduce((a, l) => a + l.progress.stars, 0);
    return h('a', { class: 'lesson-card card-done', href: '/completed', 'data-link': true },
      h('span', { class: 'emoji', html: ICON.trophy }),
      h('div', { class: 'body' },
        h('div', { class: 'title' }, 'Completed lessons'),
        h('div', { class: 'desc' }, `${plural(finished.length, 'lesson')} finished · ★ ${stars}`)),
      h('span', { class: 'chev', html: ICON.next }));
  }

  // Every lesson the student has finished (open one to see the stars or play it again).
  function showCompleted() {
    document.title = `Completed lessons · ${config.appName}`;
    if (!S) return showSkeleton('home');
    const draw = () => {
      const done = lessonList().filter(l => l.progress.completed)
        .sort((a, b) => new Date(b.progress.completedAt || 0) - new Date(a.progress.completedAt || 0));
      const stars = done.reduce((a, l) => a + l.progress.stars, 0);
      setView(
        h('header', { class: 'appbar' },
          h('a', { class: 'icon-btn', href: '/', 'data-link': true, 'aria-label': 'Back to lessons', html: ICON.back }),
          h('div', { class: 'tools' }, soundButton())),
        h('h1', null, 'Completed lessons 🏆'),
        h('p', { class: 'subtitle' }, done.length ? `${plural(done.length, 'lesson')} finished · ★ ${stars} stars` : 'Finish a lesson and it will come here.'),
        done.length
          ? h('div', { class: 'lesson-grid' }, done.map(lessonCard))
          : h('div', { class: 'state' }, h('div', { class: 'big', 'aria-hidden': 'true' }, '🏆'), h('p', null, 'No finished lessons yet. Keep going, you can do it! 💪'),
              h('a', { class: 'btn btn-primary', href: '/', 'data-link': true }, 'Go to my lessons')));
    };
    rerender = draw;
    draw();
  }

  function statTile(iconName, value, label, sub) {
    return h('div', { class: 'stat' },
      h('div', { class: 'v' }, String(value)),
      sub ? h('div', { class: 'sub' }, sub) : null,
      h('div', { class: 'l' }, h('span', { class: 'i-' + iconName, 'aria-hidden': 'true', html: ICON[iconName === 'check' ? 'checkCircle' : iconName] }), label));
  }

  function continueCard(l) {
    const p = l.progress;
    const pct = p.total ? Math.round((p.solved / p.total) * 100) : 0;
    const fill = h('div', { class: 'cc-fill' });
    fill.style.width = Math.max(pct, 4) + '%';
    return h('a', { class: 'continue-card', href: `/lesson/${l.slug}`, 'data-link': true },
      h('span', { class: 'emoji', 'aria-hidden': 'true' }, l.emoji || '📘'),
      h('div', { class: 'info' },
        h('div', { class: 'label' }, 'Continue'),
        h('div', { class: 'title' }, l.title),
        h('div', { class: 'muted' }, unitStepText(p)),
        h('div', { class: 'cc-track', 'aria-hidden': 'true' }, fill)),
      h('span', { class: 'go', html: ICON.next }));
  }

  function lessonCard(l) {
    const p = l.progress;
    const pct = p.total ? Math.round((p.solved / p.total) * 100) : 0;
    const fill = h('div', { class: 'mini-fill' });
    fill.style.width = pct + '%';
    const started = didAnything(p);
    if (l.locked) {
      // closed: not a link, it only explains what to finish first
      return h('div', { class: 'lesson-card locked', role: 'button', tabindex: '0', 'aria-disabled': 'true', onclick: () => toast(`Finish “${l.lockedBy}” first 🔒`),
        onkeydown: e => { if (e.key === 'Enter') toast(`Finish “${l.lockedBy}” first 🔒`); } },
        h('span', { class: 'emoji', 'aria-hidden': 'true', html: ICON.lock }),
        h('div', { class: 'body' },
          h('div', { class: 'title-row' }, h('span', { class: 'title' }, l.title), h('span', { class: 'badges' }, h('span', { class: 'level' }, l.level))),
          h('div', { class: 'meta' }, h('span', { class: 'status' }, `Pass the quiz of “${l.lockedBy}” to open`))));
    }
    return h('a', { class: 'lesson-card' + (p.completed ? ' done' : ''), href: `/lesson/${l.slug}`, 'data-link': true },
      h('span', { class: 'emoji', 'aria-hidden': 'true' }, l.emoji || '📘'),
      h('div', { class: 'body' },
        h('div', { class: 'title-row' },
          h('span', { class: 'title' }, l.title),
          h('span', { class: 'badges' },
            h('span', { class: 'level' }, l.level),
            l.assigned ? h('span', { class: 'badge-you', title: 'Given to you by your teacher' }, 'For you') : null)),
        l.description ? h('div', { class: 'desc' }, l.description) : null,
        h('div', { class: 'meta' },
          started ? h('div', { class: 'mini-track', 'aria-hidden': 'true' }, fill) : null,
          h('span', { class: 'status status-' + p.status }, statusText(p).replace(/^✓ /, '')),
          p.completed ? h('span', { class: 'sep' }, '·') : !started ? h('span', { class: 'sep' }, '·') : null,
          p.completed ? h('span', null, `★ ${p.stars}/${p.maxStars}`) : !started ? h('span', null, p.unitsTotal > 1 ? plural(p.unitsTotal, 'unit') : plural(l.count, 'sentence')) : null)),
      h('span', { class: 'chev', html: ICON.next }));
  }

  /* ================================================================ */
  /* Lesson page: list of units                                        */
  /* ================================================================ */
  const unitPath = (slug, unit, step) => `/lesson/${slug}/u/${unit.id}/${step}`;

  // A lesson we don't have (yet): wait for the first answer from the server, then decide.
  function missingLesson(kind) {
    if (!synced) return showSkeleton(kind);
    errorView({ status: 404 });
  }

  function showLessonHub(slug) {
    const draw = () => { const data = lessonView(slug); if (data) renderHub(slug, data); else missingLesson('hub'); };
    rerender = draw;
    draw();
  }

  function renderHub(slug, data) {
    const { lesson, progress: p } = data;
    document.title = `${lesson.title} · ${config.appName}`;
    const multi = lesson.units.length > 1;

    const pct = p.total ? Math.round((p.solved / p.total) * 100) : 0;
    const fill = h('div', { class: 'progress-fill' });
    fill.style.width = pct + '%';

    const canRestart = didAnything(p);
    const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);

    // The unit that is open now shows its progress and one big button. Every other unit is a single row; tapping a row
    // opens a short list of that unit's steps (cards, practise, grammar, sentences).
    function buildSteps(i) {
      const unit = lesson.units[i];
      const up = p.units[i];
      const rowLink = (icon, title, sub, href) => h('a', { class: 'srow', href, 'data-link': true },
        h('span', { class: 'ic', html: icon.charAt(0) === '<' ? icon : null }, icon.charAt(0) === '<' ? null : icon),
        h('span', { class: 't' }, h('b', null, title), h('small', null, sub)),
        h('span', { class: 'chev', html: ICON.next }));
      const list = h('div', { class: 'bsheet-list' },
        rowLink(ICON.cards, 'Cards', up.learned ? 'Listen to each sentence and say it' : up.learnIndex > 0 ? `Continue · ${up.learnIndex + 1} of ${up.total}` : 'Learn the sentences', unitPath(slug, unit, 'learn')),
        up.learned ? rowLink(ICON.puzzle, 'Practise', `Build the sentences again · ${up.solved} of ${up.total} built`, unitPath(slug, unit, 'review')) : null,
        up.learned && up.solved === up.total && arbCounts(unit).total ? rowLink('🔤', 'Arabic → English', `Build the English from the Arabic · ${arbCounts(unit).done} of ${arbCounts(unit).total} done`,
          unitPath(slug, unit, 'arbuild') + (arbCounts(unit).done === arbCounts(unit).total ? '?replay=1' : '')) : null,
        up.learned && up.grammarTotal && up.solved === up.total ? rowLink('✏️', 'Grammar', `Choose the missing word · ${up.grammarDone} of ${up.grammarTotal}`, unitPath(slug, unit, 'grammar') + '?replay=1') : null,
        up.quizReady || up.quizPassed ? rowLink('❓', 'Quiz', up.quizPassed ? 'Passed · take it again if you like' : 'The last step of this unit', unitPath(slug, unit, 'quiz')) : null);
      let more = null;
      if (up.learned) {
        const ul = h('ul', { class: 'sn-list', hidden: true }, unit.sentences.map((sn, k) => h('li', null,
          h('span', { class: 'sn-text', lang: 'en' }, sn.en),
          h('span', { class: 'sn-stars', 'aria-label': `${sn.stars} of 3 stars` }, sn.stars ? stars(sn.stars) : '–', sn.extra ? h('small', { class: 'extra' }, ` +${sn.extra}`) : null),
          h('span', { class: 'sn-btns' },
            canSpeak ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Listen', html: ICON.sound, onclick: () => speak(sn.en) }) : null,
            h('a', { class: 'icon-btn', href: `${unitPath(slug, unit, 'review')}?only=${k}`, 'data-link': true, 'aria-label': 'Practise this sentence', html: ICON.puzzle })))));
        const toggle = h('button', { class: 'srow', type: 'button', 'aria-expanded': 'false' },
          h('span', { class: 'ic' }, '💬'),
          h('span', { class: 't' }, h('b', null, `All ${plural(up.total, 'sentence')}`), h('small', null, 'Listen or practise one')),
          h('span', { class: 'chev', html: ICON.next }));
        toggle.addEventListener('click', () => { ul.hidden = !ul.hidden; toggle.setAttribute('aria-expanded', String(!ul.hidden)); if (!ul.hidden) ul.scrollIntoView({ block: 'nearest' }); });
        list.append(toggle);
        more = ul;
      }
      return [list, more];
    }
    function openUnit(i) {
      const [list, more] = buildSteps(i);
      showSheet(multi ? `Unit ${i + 1} · ${lesson.units[i].title}` : 'Your sentences', list, more);
    }
    // On a computer the steps open inside the unit's own card instead of a pop-up.
    function toggleSteps(li, i) {
      const open = li.querySelector(':scope > .u-steps');
      if (open) { open.remove(); li.classList.remove('open'); return; }
      li.append(h('div', { class: 'u-steps' }, ...buildSteps(i)));
      li.classList.add('open');
    }

    const unitCards = lesson.units.map((unit, i) => {
      const up = p.units[i];
      const current = i === p.currentUnit;
      const cls = up.completed ? ' done' : current ? ' current' : up.locked ? ' locked' : '';
      let open = null;
      if (current) {
        // The unit's three steps in order: read and say it, build it, then the grammar gap (if the unit has one).
        // The optional Arabic -> English step comes right after Build, until the student starts the grammar (it can be skipped from its first screen).
        const ab = arbCounts(unit);
        const arbNow = up.solved === up.total && ab.total > ab.done && !up.grammarDone && !up.quizPassed;
        const step = !up.learned ? 'learn' : up.solved < up.total ? 'build' : arbNow ? 'arbuild' : up.grammarReady ? 'grammar' : 'quiz';
        const label = step === 'learn' ? (up.learnIndex > 0 ? 'Continue' : 'Start') : step === 'build' ? (up.solved ? 'Continue' : 'Play') : step === 'arbuild' ? (ab.done ? 'Continue' : 'Start') : step === 'grammar' ? (up.grammarDone ? 'Continue' : 'Start') : 'Take the quiz';
        const learnTxt = up.learned ? 'Learned' : up.learnIndex > 0 ? `Learn ${up.learnIndex + 1}/${up.total}` : 'Learn';
        open = h('div', { class: 'u-open' },
          h('div', { class: 'unit-steps' },
            h('span', { class: up.learned ? 'ok' : '', html: ICON.cards }, learnTxt),
            h('span', { class: up.solved === up.total ? 'ok' : '', html: ICON.puzzle }, `Build ${up.solved}/${up.total}`),
            ab.total ? h('span', { class: ab.done === ab.total ? 'ok' : '' }, `🔤 Arabic ${ab.done}/${ab.total}`) : null,
            up.grammarTotal ? h('span', { class: up.grammarDone === up.grammarTotal ? 'ok' : '' }, `✏️ Grammar ${up.grammarDone}/${up.grammarTotal}`) : null,
            h('span', { class: up.quizPassed ? 'ok' : '' }, `❓ Quiz ${up.quizPassed ? '✓' : '–'}`),
            up.stars ? h('span', { class: 'star', html: ICON.star }, String(up.stars)) : null),
          h('a', { class: 'btn btn-primary btn-block btn-play', href: unitPath(slug, unit, step), 'data-link': true }, '▶ ', label));
      }
      const sub = up.locked ? `Finish Unit ${i} to open` : up.completed ? `Completed · ★ ${up.stars}${up.extra ? ` +${up.extra}` : ''}` : null;
      const li = h('li', { class: 'u-item' + cls },
        h('button', {
          class: 'u-head', type: 'button', 'aria-label': multi ? `Unit ${i + 1}, ${unit.title}`: 'Your sentences',
          onclick: () => (up.locked ? toast(`Finish Unit ${i} first 🔒`) : isPc() ? toggleSteps(li, i) : openUnit(i)),
        },
          h('span', { class: 'step-num', html: up.completed ? ICON.check : up.locked ? ICON.lock : null }, up.completed || up.locked ? null : String(i + 1)),
          h('span', { class: 'u-text' },
            multi ? h('span', { class: 'unit-label' }, `Unit ${i + 1}`) : null,
            h('span', { class: 'step-title' }, multi ? unit.title : 'Your sentences'),
            sub ? h('span', { class: 'u-sub' }, sub) : null),
          up.locked ? null : h('span', { class: 'chev', html: ICON.next })),
        open);
      if (current && isPc()) toggleSteps(li, i); // the unit the student is on is open from the start
      return li;
    });

    // The final quiz: the last row, open once every unit is finished.
    if (p.hasFinal) {
      const ready = p.finalReady, passed = p.finalPassed, locked = !ready && !passed;
      unitCards.push(h('li', { class: 'u-item' + (passed ? ' done' : ready ? ' current' : ' locked') },
        h('button', {
          class: 'u-head', type: 'button', 'aria-label': 'Final quiz',
          onclick: () => (locked ? toast('Finish every unit first 🔒') : navigate(`/lesson/${slug}/final`)),
        },
          h('span', { class: 'step-num', html: passed ? ICON.check : locked ? ICON.lock : null }, passed || locked ? null : '🏁'),
          h('span', { class: 'u-text' },
            h('span', { class: 'unit-label' }, 'Lesson'),
            h('span', { class: 'step-title' }, 'Final quiz'),
            h('span', { class: 'u-sub' }, passed ? 'Passed' : ready ? 'Pass it to finish the lesson' : 'Finish every unit to open')),
          locked ? null : h('span', { class: 'chev', html: ICON.next })),
        ready ? h('div', { class: 'u-open' }, h('a', { class: 'btn btn-primary btn-block btn-play', href: `/lesson/${slug}/final`, 'data-link': true }, '▶ Take the final quiz')) : null));
    }

    // Start the lesson over from Unit 1. Nothing is deleted: saved progress and stars stay, and any
    // better result is added as extra.
    function restartUnit(i) {
      if (!confirm('Play this unit again from the first sentence?\n\nYour saved progress and stars stay the same. Playing again is practice.')) return;
      api('POST', `/api/lessons/${slug}/restart`, { unitId: lesson.units[i].id }).catch(() => {});
      navigate(`${unitPath(slug, lesson.units[i], 'learn')}?restart=1`);
    }
    function restartLesson() {
      if (!confirm('Start this lesson over from the beginning?\n\nYour saved progress and stars stay the same. Playing again is practice.')) return;
      api('POST', `/api/lessons/${slug}/restart`, {}).catch(() => {});
      navigate(`${unitPath(slug, lesson.units[0], 'learn')}?restart=1&chain=1`);
    }

    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: '/', 'data-link': true, 'aria-label': 'Back to lessons', html: ICON.back }),
        h('div', { class: 'lesson-name' }, ''), soundButton()),
      h('section', { class: 'hub' },
        h('div', { class: 'hub-emoji', 'aria-hidden': 'true' }, lesson.emoji || '📘'),
        h('h1', null, lesson.title),
        h('p', { class: 'subtitle' }, h('span', { class: 'level' }, lesson.level),
          lesson.assigned ? h('span', { class: 'badge-you' }, 'For you') : null,
          h('span', null, lesson.description || '')),
        p.completed ? h('div', { class: 'complete-banner', html: ICON.trophy }, 'Lesson completed', h('span', null, `★ ${p.stars}/${p.maxStars}`)) : null,
        h('div', { class: 'hub-progress' },
          h('div', { class: 'row' },
            h('div', { class: 'big-num' }, `${pct}%`, h('small', null, ' complete')),
            p.stars ? h('div', { class: 'pill' }, `★ ${p.stars}`, p.extra ? h('span', { class: 'extra' }, ` +${p.extra} extra`) : null) : null),
          h('div', { class: 'progress-track', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill),
          h('p', { class: 'muted' },
            multi ? `${p.unitsCompleted} of ${p.unitsTotal} units · ` : '', `${p.solved} of ${p.total} sentences built`)),
        h('ol', { class: 'units' }, unitCards),
        // The lesson's ONE settings button: starting over (the whole lesson, or a single unit of a longer lesson).
        canRestart ? h('details', { class: 'start-over' },
          h('summary', null, 'More'),
          h('div', { class: 'more-list' },
            h('button', { class: 'btn btn-ghost btn-block', type: 'button', html: ICON.reset + ' Start lesson over', onclick: restartLesson }),
            multi ? lesson.units.map((unit, i) => (p.units[i].learned
              ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', html: ICON.reset + ' ', onclick: () => restartUnit(i) }, `Restart Unit ${i + 1} · ${unit.title}`)
              : null)) : null),
          h('p', { class: 'muted' }, 'Replay from the first sentence. Replaying is practice: your saved progress and stars never change.')) : null,
        p.completed ? h('div', { class: 'hub-actions' }, h('a', { class: 'btn btn-primary btn-block', href: '/', 'data-link': true, 'data-top': true }, 'Choose another lesson')) : null)
    );
  }

  function showLessonStep(slug, unitId, step) {
    const data = lessonView(slug);
    if (!data) return missingLesson('step');
    const ui = data.lesson.units.findIndex(u => u.id === unitId);
    if (ui < 0) { toast('This unit was changed by your teacher.'); return navigate(`/lesson/${slug}`, true); }
    const unit = data.lesson.units[ui];
    const up = data.progress.units[ui];
    const q = new URLSearchParams(location.search);
    const flags = { restart: q.get('restart') === '1', chain: q.get('chain') === '1' };
    const ctx = { slug, lesson: data.lesson, unit, unitIndex: ui, up, progress: data.progress, ...flags };
    if (up.locked) { toast(`Finish Unit ${ui} first 🔒`); return navigate(`/lesson/${slug}`, true); }
    if (step === 'learn') return runCards(ctx);
    if (!up.learned) { toast('First learn the sentences 👀'); return navigate(unitPath(slug, unit, 'learn'), true); }
    if (step === 'quiz') {
      if (!(up.quizReady || up.quizPassed)) { toast(up.grammarReady ? 'Finish the grammar first ✏️' : 'Build the sentences first 🧩'); return navigate(unitPath(slug, unit, up.grammarReady ? 'grammar' : 'build'), true); }
      return runQuiz({ slug, lesson: data.lesson, unit, unitIndex: ui });
    }
    if (step === 'build') {
      const items = unit.sentences.filter(s => !s.stars);
      if (!items.length) return navigate(`/lesson/${slug}`, true);
      return runPuzzle({ ...ctx, items, mode: 'build', exitPath: `/lesson/${slug}` });
    }
    if (step === 'arbuild') {
      // The optional Arabic -> English step: everything must be built first; normally only the sentences not done yet, a replay plays them all.
      const replay = q.get('replay') === '1';
      if (up.solved < up.total) { toast('Build the sentences first 🧩'); return navigate(unitPath(slug, unit, 'build'), true); }
      const items = arbItems(unit, replay);
      if (!items.length) return navigate(`/lesson/${slug}`, true);
      return runPuzzle({ ...ctx, items, mode: 'arbuild', replay, exitPath: `/lesson/${slug}` });
    }
    if (step === 'grammar') {
      // Normally only the gaps still to answer, once everything is built; a replay (or a restart) plays them all again.
      const replay = q.get('replay') === '1' || flags.restart;
      if (!replay && up.solved < up.total) { toast('Build the sentences first 🧩'); return navigate(unitPath(slug, unit, 'build'), true); }
      const items = unit.sentences.filter(sn => sn.gap && sn.stars && (replay || !sn.gdone));
      if (!items.length) return navigate(`/lesson/${slug}`, true);
      return runGrammar({ ...ctx, items, replay, exitPath: `/lesson/${slug}` });
    }
    // Practise: the whole unit, or a single sentence picked from the list (?only=3).
    const only = q.has('only') ? parseInt(q.get('only'), 10) : null;
    const items = only !== null && unit.sentences[only] ? [unit.sentences[only]] : unit.sentences;
    return runPuzzle({ ...ctx, items, mode: 'review', exitPath: `/lesson/${slug}` });
  }

  // The final quiz of a lesson with several units (opens when every unit is finished).
  function showFinalQuiz(slug) {
    const data = lessonView(slug);
    if (!data) return missingLesson('step');
    const p = data.progress;
    if (!p.hasFinal) return navigate(`/lesson/${slug}`, true);
    if (!p.finalReady && !p.finalPassed) { toast('Finish every unit first 🔒'); return navigate(`/lesson/${slug}`, true); }
    return runQuiz({ slug, lesson: data.lesson, unit: null, unitIndex: 0 });
  }

  const unitChip = (lesson, unitIndex, step) =>
    lesson.units.length > 1 ? `Unit ${unitIndex + 1} · ${step}` : step;

  /* ================================================================ */
  /* Step 1 - Learning cards                                           */
  /* ================================================================ */
  function runCards({ slug, lesson, unit, unitIndex, up, restart, chain }) {
    document.title = `Learn · ${lesson.title} · ${config.appName}`;
    const sentences = unit.sentences;
    const total = sentences.length;
    if (!total) return navigate(`/lesson/${slug}`, true); // a unit without sentences has nothing to learn
    const learnUrl = `/api/lessons/${slug}/units/${unit.id}/learn`;
    // Progress is saved on the device at once and sent to the server in the background.
    const sendLearn = (index, done, seconds) => {
      noteLearn(slug, unit.id, index, done, seconds);
      return outbox.send(learnUrl, done ? { index, done: true, seconds } : { index, seconds });
    };
    let i = up.learned ? 0 : Math.min(up.learnIndex, total - 1);
    let reach = up.learned ? total - 1 : Math.min(up.learnIndex, total - 1); // furthest card the student may jump to
    let shownAt = Date.now();
    const qs = `?restart=1${chain ? '&chain=1' : ''}`;
    const reviewPath = unitPath(slug, unit, 'review') + qs;

    const pill = h('button', { class: 'pill pill-btn', type: 'button', 'aria-expanded': 'false', title: 'Jump to any sentence' });
    const jump = h('div', { class: 'jump-grid jump-pop', hidden: true, role: 'group', 'aria-label': 'Jump to a sentence' });
    const dots = progressDots(total);
    const num = h('div', { class: 'card-num' });
    const text = h('p', { class: 'card-sentence', lang: 'en' });
    const promptEl = h('p', { class: 'prompt' });
    const hasWords = Boolean(lesson.words && Object.keys(lesson.words).length);
    const defaultTip = hasWords ? 'Tap any word to hear it and see its meaning' : 'Tap any word to hear it';
    const tipLine = h('p', { class: 'card-tip' }, defaultTip); // also shows the result of a speaking try
    const card = h('div', { class: 'learn-card', tabindex: '-1' }, num, text, tipLine);
    const listen = rbtn(ICON.sound, 'Listen');
    const slow = rbtn('🐢', 'Slowly');
    const prev = rbtn(ICON.back, 'Back', { 'aria-label': 'Previous sentence' });
    // Arabic translation: the server only sends the Arabic ("ar") to students the teacher switched it on for, so the button is there
    // exactly when the lesson has Arabic for this student. Tapping it flips the card; a sentence without Arabic keeps the button off.
    const hasAr = sentences.some(sn => sn.ar);
    let showAr = false;
    const arBtn = hasAr ? rbtn('ع', 'Arabic', { 'aria-label': 'Show the Arabic translation' }) : null;
    // One main button: first "I said it out loud", then "Next".
    const next = h('button', { class: 'btn btn-main btn-primary', type: 'button' });
    // The first time through (and when starting over) every sentence must be said out loud before moving on.
    const needSay = !up.learned || restart;
    const saidOut = new Set();
    // Speaking check: with speech recognition the "I said it out loud" button becomes a microphone. The student says the sentence, the phone compares
    // what it heard with the sentence (speak-core.js) and colours the words it did not hear. Up to 3 tries, then they may continue anyway.
    const micOn = () => Boolean(SpeechRec) && !micBlocked && needSay;
    const spoken = new Map();            // card index -> { heard: [text per try], last: result of the latest try, sent, startedAt }
    const spokenOf = k => { let v = spoken.get(k); if (!v) spoken.set(k, v = { heard: [], last: null, sent: false, startedAt: 0 }); return v; };
    let listening = false, rec = null, micTimer = 0;
    if (!canSpeak) { listen.disabled = true; slow.disabled = true; listen.title = 'Speech is not supported on this device'; }

    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: `/lesson/${slug}`, 'data-link': true, 'aria-label': 'Back to lesson', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, unitChip(lesson, unitIndex, 'Learn'))),
        pill, soundButton()),
      dots.el,
      jump,
      h('div', { class: 'stage' },
        promptEl,
        card),
      h('div', { class: 'dock' },
        h('div', { class: 'tools' }, prev, listen, slow, arBtn),
        next,
        restart ? h('p', { class: 'skip-row' }, h('a', { href: reviewPath, 'data-link': true }, 'Already know them? Skip to building ›')) : null),
      h('p', { class: 'kbd-hint' }, (needSay ? '←  →  next / previous  ·  Space listen  ·  ' + (micOn() ? 'S microphone' : 'S I said it') : '←  →  next / previous  ·  Space listen') + (hasAr ? '  ·  A Arabic' : '')) // shown on computers only
    );
    app.classList.add('play');

    function drawJump() {
      jump.replaceChildren(...sentences.map((_, k) => h('button', {
        class: 'jump-n' + (k === i ? ' on' : ''), type: 'button', disabled: k > reach, 'aria-label': `Sentence ${k + 1}`,
        'aria-current': k === i ? 'true' : null,
        onclick: () => { i = k; sfx.card(); jump.hidden = true; pill.setAttribute('aria-expanded', 'false'); render(true); },
      }, String(k + 1))));
    }
    pill.addEventListener('click', () => {
      jump.hidden = !jump.hidden;
      pill.setAttribute('aria-expanded', String(!jump.hidden));
      if (!jump.hidden) drawJump();
    });

    function speakCard(s) {
      card.classList.add('speaking');
      speak(sentences[i].en, s, () => card.classList.remove('speaking'));
    }

    // Tapping a word also shows its Arabic meaning in a small bubble (when the lesson has one for it: matched without caring about capitals or
    // punctuation). It does not depend on the Arabic switch of the cards. A word without a meaning shows nothing, and the bubble takes no room
    // from the card, so nothing moves or scrolls. It closes when the student taps anywhere else, on the next card, or after a few seconds.
    let pop = null;
    function hideMeaning() { if (pop) { pop.remove(); pop = null; } }
    function showMeaning(span, word) {
      hideMeaning();
      const meaning = Words.lookup(lesson.words, word);
      if (!meaning) return;
      pop = h('div', { class: 'word-pop', role: 'tooltip', dir: 'rtl', lang: 'ar' }, meaning);
      pop.style.maxWidth = Math.min(card.clientWidth - 24, 300) + 'px';
      card.append(pop);
      const cr = card.getBoundingClientRect(), sr = span.getBoundingClientRect();
      const pw = pop.offsetWidth, ph = pop.offsetHeight, mid = sr.left - cr.left + sr.width / 2;
      const left = Math.max(8, Math.min(cr.width - pw - 8, mid - pw / 2));
      let top = sr.top - cr.top - ph - 10, below = false;
      if (top < 8) { top = sr.bottom - cr.top + 10; below = true; } // no room above the word: show it under the word
      pop.style.left = left + 'px'; pop.style.top = top + 'px';
      pop.style.setProperty('--ax', Math.max(14, Math.min(pw - 14, mid - left)) + 'px');
      pop.classList.toggle('below', below);
      later(hideMeaning, 5000);
    }
    const onTapAway = e => { if (!e.target.closest('.word, .word-pop')) hideMeaning(); };
    document.addEventListener('pointerdown', onTapAway);

    // The sentence on the card: in English (each word can be tapped to hear it) or, after the Arabic button, its Arabic translation.
    function drawText() {
      hideMeaning();
      const cur = sentences[i];
      if (showAr && cur.ar) {
        text.replaceChildren(cur.ar);
        text.setAttribute('dir', 'rtl'); text.lang = 'ar'; text.classList.add('is-ar');
        num.textContent = 'العربية · Arabic';
      } else {
        showAr = false;
        text.removeAttribute('dir'); text.lang = 'en'; text.classList.remove('is-ar');
        num.textContent = `Sentence ${i + 1}`;
        const marks = (spoken.get(i) || {}).last ? spoken.get(i).last.words : null; // which words the phone heard in the latest try
        text.replaceChildren(...cur.en.split(/\s+/).flatMap((w, k) => [
          k ? ' ' : '',
          h('span', { class: 'word' + (marks && marks[k] === true ? ' heard' : marks && marks[k] === false ? ' missed' : ''), role: 'button', tabindex: '0',
            onclick: e => { speak(stripEdges(w) || w, true); showMeaning(e.currentTarget, w); },
            onkeydown: e => { if (e.key === 'Enter') { speak(stripEdges(w) || w, true); showMeaning(e.currentTarget, w); } } }, w),
        ]));
      }
      if (arBtn) {
        arBtn.disabled = !cur.ar;
        arBtn.querySelector('.ic').textContent = showAr ? 'EN' : 'ع';
        arBtn.querySelector('span:last-child').textContent = showAr ? 'English' : 'Arabic';
        arBtn.setAttribute('aria-label', showAr ? 'Show the English sentence' : 'Show the Arabic translation');
      }
      fitText(card, text);
    }
    function flipArabic() {
      if (!arBtn || !sentences[i].ar) return;
      showAr = !showAr;
      drawText();
      restartAnimation(card, 'flip-card');
    }

    function render(autoSpeak) {
      const s = sentences[i].en;
      pill.textContent = `${i + 1} / ${total}`;
      dots.set(i, i);
      showAr = false; // every new card starts in English
      drawText();
      restartAnimation(card, 'flip-in');
      prev.disabled = i === 0;
      const said = !needSay || saidOut.has(i);
      const last = i === total - 1;
      listen.disabled = !canSpeak || listening; slow.disabled = !canSpeak || listening; // never play the sentence while the microphone is listening
      showSpeakLine();
      promptEl.textContent = needSay ? (micOn() ? '👀 Read  ·  🔊 Listen  ·  🎤 Say it' : '👀 Read  ·  🔊 Listen  ·  🗣️ Say it out loud') : '👀 Look and listen';
      if (!said && micOn()) {
        const left = Speak.MAX_TRIES - spokenOf(i).heard.length;
        next.className = 'btn btn-main btn-say' + (listening ? ' listening' : '');
        next.innerHTML = listening ? '🎤 Listening… tap to stop' : left === Speak.MAX_TRIES ? '🎤 Tap and say it' : left > 0 ? `🎤 Try again (${left} left)` : 'Continue anyway ' + ICON.next;
      } else if (!said) {
        next.className = 'btn btn-main btn-say';
        next.innerHTML = '🗣️ I said it out loud';
      } else {
        next.className = 'btn btn-main ' + (last ? 'btn-accent' : 'btn-primary');
        next.innerHTML = (last ? (restart || !up.learned ? 'Start building ' : 'Done ') : 'Next ') + ICON.next;
      }
      shownAt = Date.now();
      if (autoSpeak && settings.sound) later(() => speakCard(false), 250);
    }

    const secondsOnCard = () => Math.min(120, Math.round((Date.now() - shownAt) / 1000));

    // The first tap on the main button says "I said it out loud"; after that it moves on.
    function markSaid() {
      if (!needSay || saidOut.has(i)) return false;
      if (micOn()) { micTap(); return true; }
      saidOut.add(i); sfx.win(); render(false);
      return true;
    }

    // The line under the sentence: the hint to tap a word, or how the last speaking try went.
    function showSpeakLine() {
      const st = spoken.get(i);
      tipLine.classList.remove('good', 'bad');
      if (!micOn() || !st || !st.last) { tipLine.textContent = defaultTip; return; }
      const left = Speak.MAX_TRIES - st.heard.length;
      if (st.last.unclear) { tipLine.textContent = left > 0 ? 'I heard you, but could not understand. Try again, clearly!' : "I could not understand. Let's move on, you can practise this one again later."; tipLine.classList.add('bad'); fitText(card, text); return; }
      if (st.last.pass) { tipLine.textContent = `✅ ${st.last.percent}% heard. Well said!`; tipLine.classList.add('good'); }
      else if (left > 0) { tipLine.textContent = `${st.last.percent}% heard. The orange words were missed. Try again!`; tipLine.classList.add('bad'); }
      else { tipLine.textContent = `${st.last.percent}% heard. Let's move on, you can practise this one again later.`; tipLine.classList.add('bad'); }
      fitText(card, text);
    }
    function sendSpeak() {
      const st = spoken.get(i);
      if (!slug || !st || st.sent || !st.heard.length) return;
      st.sent = true;
      const seconds = Math.min(600, Math.round((Date.now() - st.startedAt) / 1000));
      outbox.send(`/api/lessons/${slug}/speak`, { sentence: sentences[i].en, heard: st.heard, seconds, cid: uid() }).catch(() => {});
    }
    function stopListening() {
      clearTimeout(micTimer);
      if (rec) { const r = rec; rec = null; r.onresult = r.onerror = r.onend = null; try { r.abort(); } catch (e) { /* already stopped */ } }
      listening = false;
    }
    // The microphone does not work here (permission refused, no network for the recognition, ...): from now on the old button is used.
    function micFailed(why) {
      micBlocked = true; stopListening();
      toast(why);
      render(false);
    }
    function micTap() {
      const st = spokenOf(i);
      if (listening) { try { rec.stop(); } catch (e) { stopListening(); render(false); } return; } // stop early: what was heard so far is still used
      if (st.heard.length >= Speak.MAX_TRIES) { sendSpeak(); saidOut.add(i); sfx.card(); render(false); return; } // 3 tries used: continue anyway
      stopSpeech(); clearScreenTimers(); // never listen to our own voice
      let r;
      try { r = new SpeechRec(); } catch (e) { return micFailed('The microphone is not available. Use the button instead.'); }
      rec = r; r.lang = 'en-US'; r.continuous = false; r.maxAlternatives = 3;
      r.interimResults = true; // iPhones often end the recording with only a "partial" result: it is used when no final one arrives
      let got = false, spoke = false, sound = false, nomatch = false, error = '', partial = null;
      const altsOf = res => { const out = []; for (let k = 0; res && k < res.length; k++) if (res[k] && typeof res[k].transcript === 'string') out.push(res[k].transcript); return out; };
      // One try is scored once: from the final result, or else from the last partial result when the browser ends without one.
      function takeTry(alts) {
        if (got || !alts || !alts.length) return;
        got = true;
        const best = Speak.best(sentences[i].en, alts);
        if (!st.startedAt) st.startedAt = Date.now();
        st.heard.push(best.text); st.last = best.result;
        if (best.result.pass) { sendSpeak(); saidOut.add(i); sfx.win(); } else { sfx.wrong(); if (st.heard.length >= Speak.MAX_TRIES) sendSpeak(); }
      }
      r.onresult = ev => {
        const list = ev.results || [];
        const last = list[list.length - 1];
        if (!last) return;
        if (last.isFinal) {
          takeTry(altsOf(last));
          // the browser closes the microphone by itself; if it does not within 1.5 seconds it is switched off by force
          clearTimeout(micTimer);
          micTimer = setTimeout(() => { if (rec === r) { stopListening(); drawText(); render(false); } }, 1500);
        } else partial = altsOf(last);
      };
      r.onsoundstart = () => { sound = true; };
      r.onnomatch = () => { nomatch = true; };
      r.onspeechstart = () => { // the student is speaking: allow up to 15 seconds for the whole sentence
        spoke = true; sound = true; clearTimeout(micTimer);
        micTimer = setTimeout(() => { if (rec === r) { try { r.stop(); } catch (e) { stopListening(); render(false); } } }, 15000);
      };
      r.onerror = ev => { error = (ev && ev.error) || 'error'; };
      r.onend = () => {
        if (rec !== r) return;
        stopListening();
        if (!got) takeTry(partial);
        if (!got) {
          if (/^(not-allowed|service-not-allowed|audio-capture|network|language-not-supported)$/.test(error)) return micFailed('The microphone does not work here. Use the button instead.');
          if (spoke || sound || nomatch) {
            // The phone detected speech but understood nothing (for example a wrong or unclear sentence): that is a failed try, every word is marked.
            got = true;
            if (!st.startedAt) st.startedAt = Date.now();
            st.heard.push(''); st.last = { ...Speak.check(sentences[i].en, ''), unclear: true };
            sfx.wrong(); if (st.heard.length >= Speak.MAX_TRIES) sendSpeak();
          } else toast(`I did not hear any sound. Tap the microphone and try again.${error && error !== 'no-speech' ? ` (${error})` : ''}`);
        }
        drawText(); render(false);
      };
      try { st.startedAt = st.startedAt || Date.now(); r.start(); } catch (e) { return micFailed('The microphone is not available. Use the button instead.'); }
      listening = true; render(false);
      // Never listens for long: if nobody speaks within 8 seconds it is asked to stop, and if it has not closed 1.5 seconds later it is switched off by force.
      micTimer = setTimeout(() => {
        if (rec !== r || spoke) return;
        try { r.stop(); } catch (e) { stopListening(); render(false); return; }
        micTimer = setTimeout(() => { if (rec === r) { stopListening(); drawText(); render(false); } }, 1500);
      }, 8000);
    }

    async function go(delta) {
      if (delta > 0 && needSay && !saidOut.has(i)) { toast(micOn() ? 'Tap the microphone and say the sentence first 🎤' : 'Say the sentence out loud first 🗣️'); return; }
      stopListening();
      const secs = secondsOnCard();
      if (delta > 0 && i === total - 1) {
        sendLearn(i, true, secs).catch(e => toast(e.message));
        scheduleSync(1500);
        sfx.finish();
        if (restart) navigate(reviewPath, true);
        else if (!up.learned) { toast('Great! Now build the sentences 🧩'); navigate(unitPath(slug, unit, 'build'), true); }
        else navigate(`/lesson/${slug}`, true);
        return;
      }
      i = Math.max(0, Math.min(total - 1, i + delta));
      reach = Math.max(reach, i);
      sfx.card();
      if (delta > 0 && !up.learned) sendLearn(i, false, secs).catch(() => {});
      render(true);
    }

    listen.addEventListener('click', () => speakCard(false));
    slow.addEventListener('click', () => speakCard(true));
    prev.addEventListener('click', () => go(-1));
    if (arBtn) arBtn.addEventListener('click', flipArabic);
    next.addEventListener('click', () => { if (!markSaid()) go(1); });

    // Swipe left/right on the card
    let sx = null, sy = null;
    card.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    card.addEventListener('pointerup', e => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    });
    const onKey = e => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'Escape') hideMeaning();
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ' && !e.target.closest('button, [role="button"]')) { e.preventDefault(); speakCard(false); }
      else if (e.key === 'Enter' && !e.target.closest('button, a, [role="button"]')) next.click(); // Enter works as the main button
      else if ((e.key === 's' || e.key === 'S') && needSay && !e.ctrlKey && !e.metaKey && !e.altKey) markSaid();
      else if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey && !e.altKey) flipArabic();
    };
    document.addEventListener('keydown', onKey);
    const stopRelayout = onRelayout(() => fitText(card, text));
    // The microphone is switched off at once when the app goes to the background or the page is left.
    const micOff = () => { if (listening) { stopListening(); render(false); } };
    const onHidden = () => { if (document.hidden) micOff(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', micOff);
    cleanup = () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onTapAway); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('pagehide', micOff); stopRelayout(); stopListening(); hideMeaning(); };

    if (up.status === 'new') sendLearn(0, false, 0).catch(() => {});
    render(true);
  }

  /* ================================================================ */
  /* Step 2 - Building puzzle (also used for "practise your own text") */
  /* ================================================================ */
  /**
   * @param o.lesson   { title, units } (or { title, sentences } for practice)
   * @param o.unit     the unit being played ({ id, title, sentences }), or null for practice
   * @param o.slug     lesson slug, or null for untracked practice
   * @param o.items    sentences to play in this round
   * @param o.mode     'build' | 'review' | 'practice'
   */
  function runPuzzle(o) {
    const { lesson, slug, items, mode, exitPath, unit, unitIndex, chain, restart } = o;
    const review = o.review || null; // one question of a daily review session: { pos, total, onAnswer(result), onNext() }
    if (!Array.isArray(items) || !items.length) return navigate(exitPath || '/', true); // nothing to play
    const arb = mode === 'arbuild'; // Arabic -> English: the student sees only the Arabic and builds the English sentence
    const tracked = Boolean(slug);
    const total = tracked ? unit.sentences.length : items.length;
    let doneCount = tracked && mode === 'build' ? unit.sentences.filter(s => s.stars).length : 0;
    document.title = `${mode === 'practice' ? 'Practice' : arb ? 'Arabic to English' : 'Build'} · ${lesson.title} · ${config.appName}`;

    const results = []; // stars per item this round
    let pos = 0, round = null, sortables = [];
    const locals = []; // what each sentence of this round earned, worked out on the device at once
    const canGoBack = mode !== 'build' && !arb && !review;
    const MIN_SCALE = 0.52; // the smallest the tiles may shrink to, so long sentences still fit on the screen

    const MAX_HINTS = 3; // hints per sentence; the number left is shown on the Hint button
    const dots = progressDots(review ? review.total : mode === 'build' ? total : items.length);
    const pill = h('div', { class: 'pill' });
    const answer = h('div', { class: 'zone answer-zone', 'data-placeholder': arb ? 'Tap the English words in order' : 'Tap the words in the right order', 'aria-label': 'Your sentence' });
    const pool = h('div', { class: 'zone pool-zone', 'aria-label': 'Words to use' });
    const measure = h('div', { class: 'zone pool-zone measure', 'aria-hidden': 'true' }); // invisible copy of all the words, used to size things
    const answerBox = h('div', { class: 'answer-box' }, answer);
    const tray = h('div', { class: 'tray' }, pool, measure);
    const feedback = h('p', { class: 'feedback', role: 'status' });
    const arPrompt = arb ? h('div', { class: 'ar-prompt', dir: 'rtl', lang: 'ar' }) : null; // the Arabic sentence to translate
    const stage = h('div', { class: 'stage puzzle-stage' }, arPrompt, answerBox, feedback, tray);

    // Hearing the sentence would give the answer away, so Listen only appears (in the result sheet) once it is solved.
    const hintBtn = rbtn(ICON.hint, 'Hint', { 'aria-label': 'Hint' });
    const hintBadge = h('span', { class: 'badge', 'aria-hidden': 'true' }, String(MAX_HINTS));
    hintBtn.querySelector('.ic').append(hintBadge);
    const prevBtn = rbtn(ICON.back, 'Back', { hidden: true, 'aria-label': 'Previous sentence' });
    const status = h('button', { class: 'btn btn-main btn-status', type: 'button', disabled: true, 'aria-hidden': 'true', tabindex: '-1' }, '');
    const dock = h('div', { class: 'dock' }, h('div', { class: 'tools' }, prevBtn, hintBtn), status);
    let sheet = null, listenBtn = null, nextBtn = null;

    const chip = review ? 'Review' : mode === 'practice' ? 'Practice' : unitChip(lesson, unitIndex, arb ? 'Arabic → English' : mode === 'review' ? 'Practise again' : 'Build');
    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: exitPath, 'data-link': true, 'aria-label': 'Leave', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, chip)),
        pill, soundButton()),
      dots.el,
      stage,
      dock,
      h('p', { class: 'kbd-hint' }, 'Backspace undo  ·  H hint  ·  Enter next') // shown on computers only
    );
    app.classList.add('play');

    const tilesIn = zone => [...zone.children];
    const words = zone => tilesIn(zone).map(t => t.dataset.word);
    const makeTile = word => h('button', { class: 'tile', type: 'button', 'data-word': word }, word);

    // Makes the answer box and the word tray fit the screen: the tiles shrink a little for long sentences, and both boxes
    // get a fixed height (they never grow or shrink while words move between them). How many lines a set of words needs
    // depends on their order, so the tray is sized for the shuffled order it really shows, and the answer box for the
    // right order or the tray's order (whichever needs more lines).
    let holding = false; // true while a word is being dragged
    function fit() {
      if (!round || holding) return;
      const cs = el => getComputedStyle(el);
      const vPad = el => ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((a, p) => a + (parseFloat(cs(el)[p]) || 0), 0);
      const heightOf = order => { measure.replaceChildren(...order.map(makeTile)); return measure.offsetHeight; };
      const st = cs(stage);
      if (arPrompt) { // the Arabic sentence may take at most 30% of the stage; a longer one gets a smaller font
        arPrompt.style.fontSize = ''; arPrompt.style.maxHeight = Math.floor(stage.clientHeight * 0.3) + 'px';
        let px = parseFloat(cs(arPrompt).fontSize) || 24;
        for (let n = 0; n < 30 && arPrompt.scrollHeight > arPrompt.clientHeight + 1 && px > 13; n++) { px -= 1; arPrompt.style.fontSize = px + 'px'; }
      }
      const inner = stage.clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
      const fixed = feedback.offsetHeight + (parseFloat(st.rowGap) || 10) * (arPrompt ? 3 : 2) + vPad(answerBox) + vPad(tray) + (arPrompt ? arPrompt.offsetHeight : 0);
      let k = 1, hPool = 0, hAnswer = 0;
      for (let n = 0; n < 16; n++) {
        stage.style.setProperty('--k', k.toFixed(3));
        hPool = heightOf(round.order);
        hAnswer = Math.max(hPool, heightOf(round.target));
        if (hPool + hAnswer + fixed <= inner || k <= MIN_SCALE) break;
        k = Math.max(MIN_SCALE, k - 0.04);
      }
      tray.style.height = Math.ceil(hPool + vPad(tray)) + 'px';
      answerBox.style.minHeight = Math.ceil(hAnswer + vPad(answerBox)) + 'px';
      measure.replaceChildren();
    }

    function updateBar() {
      if (mode === 'build') {
        pill.textContent = `${doneCount} / ${total}`;
        dots.set(doneCount, doneCount < total ? doneCount : -1);
      } else if (review) {
        const solved = Boolean(round && round.solved);
        pill.textContent = `${review.pos + 1} / ${review.total}`;
        dots.set(review.pos + (solved ? 1 : 0), solved ? -1 : review.pos);
      } else {
        const solved = Boolean(round && round.solved);
        pill.textContent = `${pos + 1} / ${items.length}`;
        dots.set(pos + (solved ? 1 : 0), solved ? -1 : pos);
      }
    }

    function updateHintBtn() {
      const left = Math.max(0, MAX_HINTS - round.hints);
      hintBadge.textContent = String(left);
      hintBtn.disabled = left === 0;
      hintBtn.setAttribute('aria-label', `Hint, ${left} left`);
    }

    function loadRound() {
      const sentence = items[pos].en;
      const target = hideCapital(tokenize(sentence));
      round = { sentence, target, order: shuffle(target), mistakes: 0, hints: 0, solved: false, lastWrong: null, startedAt: Date.now(), cid: uid() };
      if (sheet) { sheet.remove(); sheet = null; }
      if (arPrompt) arPrompt.textContent = items[pos].arq;
      answer.replaceChildren();
      pool.replaceChildren(...round.order.map(makeTile));
      answerBox.classList.remove('solved');
      tray.classList.remove('done');
      feedback.textContent = ''; feedback.className = 'feedback';
      hintBtn.hidden = false; status.hidden = false; updateHintBtn();
      prevBtn.hidden = !(canGoBack && pos > 0);
      fit();
      updateLeft();
      sortables.forEach(s => s.option('disabled', false));
      updateBar();
    }

    function updateLeft() {
      const n = pool.children.length;
      status.textContent = n ? `${n} left` : 'Swap the orange words';
      tray.classList.toggle('empty', n === 0);
    }

    function afterChange(fromHint) {
      if (round.solved) return;
      updateLeft();
      tilesIn(answer).forEach(t => t.classList.remove('wrong', 'right'));
      feedback.textContent = ''; feedback.className = 'feedback';
      if (pool.children.length) return;
      const current = words(answer);
      if (current.join(' ') === round.target.join(' ')) return success();
      const key = current.join(' ');
      // Every new wrong arrangement gets the buzz, but only the first one in a sentence counts as a mistake.
      if (!fromHint && key !== round.lastWrong) { if (!round.mistakes) round.mistakes = 1; sfx.wrong(); if (navigator.vibrate) navigator.vibrate(60); }
      round.lastWrong = key;
      tilesIn(answer).forEach((t, k) => t.classList.add(t.dataset.word === round.target[k] ? 'right' : 'wrong'));
      feedback.textContent = 'Almost! Try again 💪';
      feedback.className = 'feedback bad';
    }

    function goNext() {
      clearScreenTimers();
      stopSpeech();
      if (++pos < items.length) loadRound(); else finish();
    }

    function success() {
      round.solved = true;
      const s = starsFor(round.mistakes + round.hints);
      results[pos] = s;
      const seconds = Math.min(600, Math.round((Date.now() - round.startedAt) / 1000));
      let local = null;
      if (review) {
        // A review question: the session screen saves it (it never touches stars); nothing else happens here.
        review.onAnswer({ kind: 'build', mistakes: round.mistakes, hints: round.hints, seconds });
      } else if (arb) {
        // No stars here: the step only remembers how it went (mistakes, hints, seconds) for the teacher.
        noteArb(slug, round.sentence, seconds);
        outbox.send(`/api/lessons/${slug}/arbuild`, { sentence: round.sentence, mistakes: round.mistakes, hints: round.hints, seconds, cid: round.cid })
          .catch(e => { toast(e.message); return null; });
      } else if (tracked) {
        // Stars, extra and unlocks are worked out here and now (same rules as the server), so nothing waits for the network.
        local = noteSolve(slug, round.sentence, s, seconds);
        locals[pos] = local;
        outbox.send(`/api/lessons/${slug}/solve`, { sentence: round.sentence, mistakes: round.mistakes, hints: round.hints, seconds, cid: round.cid })
          .catch(e => { toast(e.message); return null; });
        if (mode === 'build') doneCount++;
      }
      sortables.forEach(x => x.option('disabled', true));
      tilesIn(answer).forEach(t => { t.classList.remove('wrong', 'right'); t.classList.add('solved'); t.tabIndex = -1; });
      answerBox.classList.add('solved');
      tray.classList.add('done');
      hintBtn.hidden = true; prevBtn.hidden = true; status.hidden = true;
      feedback.textContent = ''; feedback.className = 'feedback';
      updateBar();
      const praise = s === 3 ? ['Perfect! 🌟', 'Excellent! 🎉', 'Amazing! 🤩'] : s === 2 ? ['Well done! 👏', 'Great job! 😊', 'Nice work! 👍'] : ['You got it! 💪', 'Good job, keep going! 🌈'];
      listenBtn = rbtn(ICON.sound, 'Listen', { hidden: !canSpeak, 'aria-label': 'Listen to the sentence' });
      nextBtn = h('button', { class: 'btn btn-main btn-ok', type: 'button', html: ((review ? review.pos + 1 < review.total : pos + 1 < items.length) ? 'Next ' : 'Finish ') + ICON.next });
      listenBtn.addEventListener('click', () => speak(round.sentence));
      nextBtn.addEventListener('click', goNext);
      sheet = h('div', { class: 'sheet', role: 'status' },
        h('div', { class: 'sheet-head' },
          h('span', { class: 'sheet-msg' }, praise[(Math.random() * praise.length) | 0]),
          arb || review ? null : h('div', { class: 'stars', 'aria-label': `${s} of 3 stars` }, starNodes(s))),
        // Practising a sentence again never changes the saved stars.
        local && local.replay ? h('div', { class: 'sheet-extra' }, 'Practice: your saved stars stay the same.') : null,
        h('div', { class: 'sheet-row' }, listenBtn, nextBtn));
      dock.append(sheet);
      nextBtn.focus({ preventScroll: true });
      sfx.win(); confetti(40);
      if (settings.sound) later(() => speak(round.sentence), 450);
    }

    function hint() {
      if (round.solved || round.hints >= MAX_HINTS) return;
      const cur = tilesIn(answer);
      let i = cur.findIndex((t, k) => t.dataset.word !== round.target[k]);
      if (i < 0) i = cur.length;
      const want = round.target[i];
      const tile = tilesIn(pool).find(t => t.dataset.word === want) || cur.find((t, k) => k > i && t.dataset.word === want);
      if (!tile) return;
      answer.insertBefore(tile, answer.children[i] || null);
      round.hints++;
      updateHintBtn();
      restartAnimation(tile, 'flash');
      sfx.hint();
      afterChange(true);
      if (!round.solved && pool.children.length) { feedback.textContent = `“${want}” is word ${i + 1}.`; feedback.className = 'feedback'; }
    }

    let lastDragEnd = 0;
    // Tap a word to move it to the answer; tap a word in the answer to put it back.
    function onTap(e) {
      const tile = e.target.closest('.tile');
      if (!tile || round.solved || Date.now() - lastDragEnd < 250) return;
      if (tile.parentElement === pool) answer.appendChild(tile); else pool.appendChild(tile);
      sfx.tap();
      afterChange(false);
      const nxt = pool.querySelector('.tile') || answer.querySelector('.tile:last-child');
      if (e.detail === 0 && nxt) nxt.focus();
    }
    answer.addEventListener('click', onTap);
    pool.addEventListener('click', onTap);

    if (window.Sortable) {
      // The dragged copy stays inside the puzzle (fallbackOnBody: false), so it keeps the exact size and look of the tile; the
      // copy follows the finger with no animation (see .dragging in style.css); nothing is re-measured while a word is held.
      const opts = {
        group: 'words', animation: 120, easing: 'cubic-bezier(0.2, 0, 0, 1)',
        forceFallback: true, fallbackOnBody: false, fallbackTolerance: 4, emptyInsertThreshold: 28,
        fallbackClass: 'dragging', ghostClass: 'ghost', chosenClass: 'chosen', swapThreshold: 0.55,
        onStart: () => { holding = true; document.body.classList.add('is-dragging'); },
        onEnd: () => { holding = false; document.body.classList.remove('is-dragging'); lastDragEnd = Date.now(); afterChange(false); },
      };
      sortables = [Sortable.create(answer, opts), Sortable.create(pool, opts)];
    }

    prevBtn.addEventListener('click', () => { stopSpeech(); if (pos > 0) { pos--; loadRound(); } });
    hintBtn.addEventListener('click', hint);

    // Play with the keyboard on a computer: Backspace takes the last word back, H gives a hint, L plays the sound.
    const onKey = e => {
      if (!round || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'l' && round.solved && listenBtn && !listenBtn.hidden) { listenBtn.click(); return; }
      if (round.solved) {
        if (key === 'Enter' && nextBtn && document.activeElement !== nextBtn) nextBtn.click();
        return;
      }
      if (key === 'Backspace') { e.preventDefault(); const last = answer.lastElementChild; if (last) last.click(); }
      else if (key === 'h') hintBtn.click();
    };
    document.addEventListener('keydown', onKey);
    const stopRelayout = onRelayout(fit);
    cleanup = () => { document.removeEventListener('keydown', onKey); stopRelayout(); sortables.forEach(s => s.destroy()); document.body.classList.remove('is-dragging'); };

    // Results of the Arabic -> English step: no stars; it leads on to the grammar (or the quiz), and can always be left.
    function finishArb() {
      const now = lessonView(slug);
      const unitNow = now && now.progress.units[unitIndex];
      const perfect = results.filter(r => r === 3).length;
      const offline = !navigator.onLine || outbox.items().length > 0;
      const actions = h('div', { class: 'result-actions' });
      if (unitNow && unitNow.grammarReady) actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'grammar'), 'data-link': true }, 'Next: Grammar ✏️'));
      else if (unitNow && unitNow.quizReady) actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'quiz'), 'data-link': true }, 'Next: Quiz ❓'));
      actions.append(h('a', { class: 'btn ' + (actions.children.length ? 'btn-ghost' : 'btn-primary'), href: `/lesson/${slug}`, 'data-link': true }, 'Back to lesson'));
      actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true, 'data-top': true }, 'All lessons'));
      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, perfect === items.length ? '🎉' : '💪'),
        h('h1', null, 'Great translating! 🔤'),
        h('p', { class: 'subtitle' }, `No mistakes or hints: ${perfect} of ${items.length}.`),
        h('p', { class: 'muted' }, 'This step gives no stars. Your teacher can see how it went.'),
        offline ? h('p', { class: 'muted' }, 'You are offline. Your progress will be saved when you reconnect.') : null,
        h('details', { class: 'result-details' }, h('summary', null, `See ${items.length === 1 ? 'the sentence' : `all ${items.length} sentences`}`),
          h('ul', { class: 'result-list' }, items.map(it => h('li', null, h('span', { lang: 'en' }, it.en), h('span', { class: 'ar-mini', dir: 'rtl', lang: 'ar' }, it.arq))))),
        actions));
      sfx.finish(); confetti(90);
      scheduleSync(1500);
    }

    function finish() {
      cleanup(); cleanup = null;
      if (review) return review.onNext();
      if (arb) return finishArb();
      const offline = tracked && (!navigator.onLine || outbox.items().length > 0);
      const extraGained = locals.reduce((a, r) => a + ((r && r.extra) || 0), 0);
      const earned = results.reduce((a, b) => a + (b || 0), 0);
      const max = items.length * 3;
      const building = tracked && mode === 'build';
      const now = tracked ? lessonView(slug) : null; // the up-to-date state, worked out on the device
      const unitNow = now && now.progress.units[unitIndex];
      // Built everything: if the unit has grammar gaps they come next, and the unit is not finished until they are answered.
      const grammarNext = Boolean(building && unitNow && unitNow.grammarReady);
      // Sentences with Arabic come next (optional: the grammar / quiz link stays under it as "skip").
      const arbNext = Boolean(building && unitNow && unitNow.solved === unitNow.total && now && arbItems(now.lesson.units[unitIndex], false).length);
      const quizNext = Boolean(building && !grammarNext && unitNow && unitNow.quizReady); // built everything: the unit quiz is the last step
      const unitDone = building && !grammarNext && !quizNext;
      const lessonDone = building && Boolean(now && now.progress.completed);
      if (lessonDone) return showLessonComplete(slug, lesson, now.progress);
      const nextUnit = tracked ? lesson.units[unitIndex + 1] : null;
      const nextOpen = nextUnit && now && now.progress.units[unitIndex + 1] && !now.progress.units[unitIndex + 1].locked;
      const weak = items.filter((_, i) => (results[i] || 0) < 3);
      const replayed = tracked && mode === 'review';

      const actions = h('div', { class: 'result-actions' });
      if (tracked) {
        if (arbNext) {
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'arbuild'), 'data-link': true }, 'Next: Arabic → English 🔤'));
          const skipTo = grammarNext ? ['grammar', 'Skip to Grammar ✏️'] : quizNext ? ['quiz', 'Skip to the quiz ❓'] : null;
          if (skipTo) actions.append(h('a', { class: 'btn btn-ghost', href: unitPath(slug, unit, skipTo[0]), 'data-link': true }, skipTo[1]));
        } else if (grammarNext)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'grammar'), 'data-link': true }, 'Next: Grammar ✏️'));
        else if (quizNext)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'quiz'), 'data-link': true }, 'Next: Quiz ❓'));
        else if (replayed && restart && unitNow && unitNow.grammarTotal)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'grammar') + `?restart=1${chain ? '&chain=1' : ''}`, 'data-link': true }, 'Next: Grammar ✏️'));
        else if (building && !lessonDone && nextUnit && unitNow && unitNow.completed)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, nextUnit, 'learn'), 'data-link': true, html: `Next: Unit ${unitIndex + 2} · ` },
            nextUnit.title, h('span', { html: ICON.next })));
        else if (replayed && chain && nextOpen)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, nextUnit, 'learn') + '?restart=1&chain=1', 'data-link': true, html: `Next: Unit ${unitIndex + 2} · ` },
            nextUnit.title, h('span', { html: ICON.next })));
        actions.append(h('a', { class: 'btn ' + (actions.children.length ? 'btn-ghost' : 'btn-primary'), href: `/lesson/${slug}`, 'data-link': true }, 'Back to lesson'));
        if (mode === 'review' && weak.length) actions.append(h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => runPuzzle({ ...o, items: weak }) }, `Practise ${plural(weak.length, 'hard sentence')}`));
        actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true, 'data-top': true }, 'All lessons'));
      } else {
        if (weak.length) actions.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => runPuzzle({ ...o, items: weak }) }, `Practise ${plural(weak.length, 'hard sentence')}`));
        actions.append(h('button', { class: 'btn ' + (weak.length ? 'btn-ghost' : 'btn-primary'), type: 'button', onclick: () => runPuzzle(o) }, 'Play again'));
        actions.append(h('a', { class: 'btn btn-ghost', href: '/practice', 'data-link': true }, 'Edit my text'));
        actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true }, 'Back to lessons'));
      }

      const pct = earned / max;
      const multi = tracked && lesson.units.length > 1;
      const title = grammarNext ? 'Great memory! 🧠' : quizNext ? 'Great building! 🧩' : lessonDone ? 'Lesson complete!' : unitDone && multi ? `Unit ${unitIndex + 1} complete!` : pct === 1 ? 'Perfect!' : pct >= 0.7 ? 'Well done!' : 'Good effort!';
      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, lessonDone || pct === 1 ? '🏆' : pct >= 0.7 ? '🎉' : '💪'),
        h('div', { class: 'stars', 'aria-hidden': 'true' }, starNodes(Math.round(pct * 3))),
        h('h1', null, title),
        h('p', { class: 'subtitle' }, `You earned ${earned} of ${max} stars in this round.`),
        extraGained > 0 ? h('p', { class: 'extra-banner' }, `+${extraGained} extra ${extraGained === 1 ? 'star' : 'stars'} added to your score!`) : null,
        replayed && !offline ? h('p', { class: 'muted' }, 'This was practice. Your saved stars stay the same.') : null,
        arbNext ? h('p', { class: 'muted' }, 'Now the Arabic: read it and build the English sentence. 🔤 (You can skip this step.)') : null,
        !arbNext && grammarNext ? h('p', { class: 'muted' }, 'Now a quick grammar check: choose the missing word. ✏️') : null,
        !arbNext && quizNext ? h('p', { class: 'muted' }, 'Last step: a short quiz. Pass it to finish the unit. ❓') : null,
        building && !grammarNext && !quizNext && !lessonDone && nextUnit ? h('p', { class: 'muted' }, `Next up: Unit ${unitIndex + 2} is now open. Your progress is saved.`) : null,
        offline ? h('p', { class: 'muted' }, 'You are offline. Your progress will be saved when you reconnect.') : null,
        h('details', { class: 'result-details' }, h('summary', null, `See ${items.length === 1 ? 'the sentence' : `all ${items.length} sentences`}`),
          h('ul', { class: 'result-list' }, items.map((it, i) => h('li', null,
            h('span', null, it.en),
            h('span', { class: 's', 'aria-label': `${results[i] || 0} stars` }, starNodes(results[i] || 0)))))),
        actions));
      sfx.finish(); confetti(lessonDone ? 200 : 120);
      if (tracked) scheduleSync(1500); // check with the server in the background
    }

    loadRound();
  }

  /* ================================================================ */
  /* Step 3 - Grammar: a word is missing, choose the right one of three */
  /* ================================================================ */
  // Random order for the three choices. (The shared shuffle() never returns the order it was given, and the right word
  // is stored first, so it would never show up first. This one is a plain random order.)
  function randomOrder(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /** The sentence as pieces for the screen: words before, the gap (with any punctuation next to it), words after. */
  function splitAtGap(sentence, gap) {
    const words = sentence.split(' ');
    const word = words[gap.index] || '';
    const at = Math.max(0, word.toLowerCase().indexOf(gap.answer.toLowerCase()));
    return {
      before: words.slice(0, gap.index).join(' ') + (gap.index ? ' ' : '') + word.slice(0, at),
      after: word.slice(at + gap.answer.length) + (gap.index < words.length - 1 ? ' ' : '') + words.slice(gap.index + 1).join(' '),
    };
  }

  /* ---------- Grammar tip: a short explanation the teacher wrote for the unit ---------- */
  // English, plus the Arabic when the server sent it (only to students the teacher switched Arabic on for).
  const tipNodes = unit => [
    h('p', { class: 'gtip-text', lang: 'en' }, unit.tip),
    unit.tipAr ? h('p', { class: 'gtip-text gtip-ar', dir: 'rtl', lang: 'ar' }, unit.tipAr) : null,
  ];

  // The card shown before the Grammar step: read it, then "Start".
  function showGrammarTip(o, onStart) {
    const { lesson, unit, unitIndex, exitPath } = o;
    document.title = `Grammar tip · ${lesson.title} · ${config.appName}`;
    const body = h('div', { class: 'gtip-body' }, ...tipNodes(unit));
    const card = h('div', { class: 'learn-card gtip-card' }, h('div', { class: 'card-num' }, '💡 Grammar tip'), body);
    const start = h('button', { class: 'btn btn-main btn-primary', type: 'button', html: 'Start ' + ICON.next });
    const go = () => { if (cleanup) { cleanup(); cleanup = null; } onStart(); };
    start.addEventListener('click', go);
    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: exitPath, 'data-link': true, 'aria-label': 'Leave', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, unitChip(lesson, unitIndex, 'Grammar'))),
        soundButton()),
      h('div', { class: 'stage' }, card),
      h('div', { class: 'dock' }, start),
      h('p', { class: 'kbd-hint' }, 'Enter start') // shown on computers only
    );
    app.classList.add('play');
    const fit = () => fitText(card, body, 14);
    const onKey = e => { if (e.key === 'Enter' && !e.target.closest('button, a') && !e.repeat) go(); };
    document.addEventListener('keydown', onKey);
    const stopRelayout = onRelayout(fit);
    cleanup = () => { document.removeEventListener('keydown', onKey); stopRelayout(); };
    fit();
    start.focus({ preventScroll: true });
  }

  function runGrammar(o) {
    const { lesson, slug, items, exitPath, unit, unitIndex, replay, chain, restart } = o;
    const review = o.review || null; // one question of a daily review session: { pos, total, onAnswer(result), onNext() }
    document.title = `Grammar · ${lesson.title} · ${config.appName}`;
    if (!items.length) return navigate(exitPath, true);
    // A unit with a tip shows it first (every time the Grammar step starts); the Tip button opens it again.
    if (unit && unit.tip && !o.tipSeen) return showGrammarTip(o, () => runGrammar({ ...o, tipSeen: true }));
    let pos = 0, round = null;
    const firstTry = [];       // for each sentence: answered right at the first choice?
    const triesLeftBehind = []; // wrong choices before the right one

    const pill = h('div', { class: 'pill' });
    const dots = progressDots(review ? review.total : items.length);
    const num = h('div', { class: 'card-num' }, 'Fill the gap');
    const sentenceEl = h('p', { class: 'card-sentence', lang: 'en' });
    const whyEl = h('p', { class: 'gap-why', role: 'status', hidden: true }); // "why it's wrong", shown after a wrong choice
    const card = h('div', { class: 'learn-card gap-card' }, num, sentenceEl, whyEl);
    const tipBtn = unit && unit.tip ? h('button', { class: 'pill pill-btn', type: 'button', 'aria-label': 'Show the grammar tip' }, '💡 Tip') : null;
    const openTip = () => {
      const panel = showSheet('💡 Grammar tip', ...tipNodes(unit));
      panel.append(h('button', { class: 'btn btn-primary btn-block gtip-close', type: 'button', onclick: closeSheet }, 'Got it'));
    };
    if (tipBtn) tipBtn.addEventListener('click', openTip);
    const choices = h('div', { class: 'gap-options', role: 'group', 'aria-label': 'Choose the missing word' });
    const feedback = h('p', { class: 'feedback', role: 'status' });
    const dock = h('div', { class: 'dock' }, feedback, choices);
    let sheet = null, nextBtn = null;

    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: exitPath, 'data-link': true, 'aria-label': 'Leave', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, review ? 'Review' : unitChip(lesson, unitIndex, 'Grammar'))),
        tipBtn, pill, soundButton()),
      dots.el,
      h('div', { class: 'stage' }, card),
      dock,
      h('p', { class: 'kbd-hint' }, 'Keys 1 2 3 choose the first, second or third word  ·  Enter next' + (tipBtn ? '  ·  T tip' : '')) // shown on computers only
    );
    app.classList.add('play');

    function loadRound() {
      const it = items[pos];
      const { before, after } = splitAtGap(it.en, it.gap);
      const blank = h('span', { class: 'gap-blank', 'aria-label': 'missing word' });
      round = { it, blank, mistakes: 0, done: false, startedAt: Date.now(), cid: uid() };
      sentenceEl.replaceChildren(before, blank, after);
      fitText(card, sentenceEl);
      choices.replaceChildren(...randomOrder(it.gap.options).map(word => h('button', {
        class: 'gap-opt', type: 'button', 'data-word': word, onclick: e => choose(e.currentTarget),
      }, word)));
      choices.classList.remove('away');
      if (sheet) { sheet.remove(); sheet = null; }
      feedback.textContent = ''; feedback.className = 'feedback';
      whyEl.hidden = true; whyEl.textContent = '';
      card.classList.remove('right');
      pill.textContent = `${(review ? review.pos : pos) + 1} / ${review ? review.total : items.length}`;
      dots.set(review ? review.pos : pos, review ? review.pos : pos);
    }

    function choose(btn) {
      if (!round || round.done || btn.disabled) return;
      const word = btn.dataset.word;
      if (word !== round.it.gap.answer) {
        round.mistakes++;
        btn.disabled = true; btn.classList.add('wrong');
        // The teacher's reason ("We use is with she") is shown inside the card, so the screen never grows; without one the old message stays.
        const why = round.it.gap.why;
        if (why) { whyEl.textContent = '💡 ' + why; whyEl.hidden = false; fitText(card, sentenceEl); }
        feedback.textContent = why ? 'Try again 💪' : 'Not that one. Try again 💪'; feedback.className = 'feedback bad';
        sfx.wrong(); if (navigator.vibrate) navigator.vibrate(60);
        return;
      }
      // Right: show the word in the sentence, save it on the device, tell the server in the background.
      round.done = true;
      firstTry[pos] = round.mistakes === 0;
      triesLeftBehind[pos] = round.mistakes;
      round.blank.textContent = word; round.blank.classList.add('filled');
      fitText(card, sentenceEl);
      choices.querySelectorAll('.gap-opt').forEach(b => { b.disabled = true; if (b === btn) b.classList.add('right'); });
      choices.classList.add('away');
      card.classList.add('right');
      const seconds = Math.min(600, Math.round((Date.now() - round.startedAt) / 1000));
      if (review) review.onAnswer({ kind: 'grammar', mistakes: round.mistakes, hints: 0, seconds }); // the review screen saves it
      else {
        noteGrammar(slug, round.it.en, seconds);
        outbox.send(`/api/lessons/${slug}/grammar`, { sentence: round.it.en, mistakes: round.mistakes, seconds, cid: round.cid }).catch(e => { toast(e.message); return null; });
      }
      dots.set((review ? review.pos : pos) + 1, -1);
      feedback.textContent = ''; feedback.className = 'feedback';
      const praise = round.mistakes === 0 ? ['Perfect! 🌟', 'Excellent! 🎉', 'Amazing! 🤩'] : ['You got it! 💪', 'Good job! 👏'];
      nextBtn = h('button', { class: 'btn btn-main btn-ok', type: 'button', html: ((review ? review.pos + 1 < review.total : pos + 1 < items.length) ? 'Next ' : 'Finish ') + ICON.next });
      nextBtn.addEventListener('click', goNext);
      sheet = h('div', { class: 'sheet', role: 'status' },
        h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-msg' }, praise[(Math.random() * praise.length) | 0])),
        nextBtn);
      dock.append(sheet);
      nextBtn.focus({ preventScroll: true });
      sfx.win(); confetti(30);
    }

    function goNext() {
      clearScreenTimers(); stopSpeech();
      if (++pos < items.length) loadRound(); else finish();
    }

    const onKey = e => {
      if (!round || e.ctrlKey || e.metaKey || e.altKey || e.repeat || sheetEl) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 't' && tipBtn) return openTip();
      if (round.done) { if (key === 'Enter' && nextBtn && document.activeElement !== nextBtn) nextBtn.click(); }
      else if (/^[1-3]$/.test(key)) { const b = choices.children[Number(key) - 1]; if (b) b.click(); }
    };
    document.addEventListener('keydown', onKey);
    const stopRelayout = onRelayout(() => fitText(card, sentenceEl));
    cleanup = () => { document.removeEventListener('keydown', onKey); stopRelayout(); };

    function finish() {
      cleanup(); cleanup = null;
      if (review) return review.onNext();
      const now = lessonView(slug);
      const unitNow = now && now.progress.units[unitIndex];
      const lessonDone = Boolean(now && now.progress.completed);
      if (lessonDone && !replay) return showLessonComplete(slug, lesson, now.progress);
      const multi = lesson.units.length > 1;
      const nextUnit = lesson.units[unitIndex + 1];
      const nextOpen = nextUnit && now && now.progress.units[unitIndex + 1] && !now.progress.units[unitIndex + 1].locked;
      const right = firstTry.filter(Boolean).length;
      const offline = !navigator.onLine || outbox.items().length > 0;

      const actions = h('div', { class: 'result-actions' });
      if (!replay && unitNow && unitNow.quizReady) {
        actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'quiz'), 'data-link': true }, 'Next: Quiz ❓'));
      } else if (nextOpen && (replay ? chain : unitNow && unitNow.completed)) {
        actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, nextUnit, 'learn') + (restart && chain ? '?restart=1&chain=1' : ''), 'data-link': true, html: `Next: Unit ${unitIndex + 2} · ` },
          nextUnit.title, h('span', { html: ICON.next })));
      }
      actions.append(h('a', { class: 'btn ' + (actions.children.length ? 'btn-ghost' : 'btn-primary'), href: `/lesson/${slug}`, 'data-link': true }, 'Back to lesson'));
      actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true, 'data-top': true }, 'All lessons'));

      const title = lessonDone && !replay ? 'Lesson complete! 🏆' : unitNow && unitNow.completed && multi && !replay ? `Unit ${unitIndex + 1} complete!` : 'Grammar done! ✏️';
      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, lessonDone ? '🏆' : right === items.length ? '🎉' : '💪'),
        h('h1', null, title),
        h('p', { class: 'subtitle' }, `Right at the first choice: ${right} of ${items.length}.`),
        !replay && unitNow && unitNow.quizReady ? h('p', { class: 'muted' }, 'Last step: a short quiz. Pass it to finish the unit. ❓') : null,
        offline ? h('p', { class: 'muted' }, 'You are offline. Your progress will be saved when you reconnect.') : null,
        h('details', { class: 'result-details' }, h('summary', null, `See ${items.length === 1 ? 'the sentence' : `all ${items.length} sentences`}`),
          h('ul', { class: 'result-list' }, items.map((it, i) => h('li', null,
            h('span', null, it.en),
            h('span', { class: 's gram', 'aria-label': firstTry[i] ? 'right first time' : `${triesLeftBehind[i] || 0} wrong choices` }, firstTry[i] ? '✓' : `${triesLeftBehind[i] || 0}✗`))))),
        actions));
      sfx.finish(); confetti(lessonDone ? 200 : 90);
      scheduleSync(1500);
    }

    loadRound();
  }

  /* ================================================================ */
  /* Daily review: up to 10 hard sentences that are due today           */
  /* ================================================================ */
  // Each question is the normal Build puzzle or Grammar question (see `review` in runPuzzle / runGrammar), one after the other. Right = first try
  // without hints. Every answer is saved on the phone at once and sent to the server, which moves the sentence to its next interval (1, 3, 7, 14, 30
  // days; a wrong answer sends it back to 1 day). Reviews never change stars, but they count for the day streak.
  function showReview() {
    document.title = `Review · ${config.appName}`;
    if (!S) return showSkeleton('home');
    const due = reviewItems();
    if (!due.length) { toast('Nothing to review today 🎉'); return navigate('/', true); }
    const session = Review.pickSession(due);
    const total = session.length;
    const done = [];
    let pos = 0;

    function answered(it, r) {
      const correct = Review.isCorrect(r.mistakes, r.hints);
      done.push({ it, correct, next: Review.afterReview(it.stage, correct).days });
      noteReview(it.slug, it.sentence);
      outbox.send('/api/review/answer', { slug: it.slug, sentence: it.sentence, kind: r.kind, mistakes: r.mistakes, hints: r.hints || 0, seconds: r.seconds, cid: uid() })
        .catch(e => { toast(e.message); return null; });
    }

    function step() {
      if (pos >= total) return finishReview();
      const it = session[pos];
      const raw = rawLesson(it.slug);
      const sn = raw && raw.units.flatMap(u => u.sentences).find(x => x.en === it.sentence);
      if (!sn) { pos++; return step(); } // the teacher changed the lesson meanwhile
      const base = { lesson: { title: raw.title, units: [] }, items: [JSON.parse(JSON.stringify(sn))], exitPath: '/', unitIndex: 0,
        review: { pos, total, onAnswer: r => answered(it, r), onNext: () => { pos++; step(); } } };
      if (it.kind === 'grammar' && sn.gap) runGrammar({ ...base, slug: it.slug, unit: null, tipSeen: true });
      else runPuzzle({ ...base, slug: null, mode: 'review-q', unit: null });
    }

    function finishReview() {
      const right = done.filter(x => x.correct).length;
      const more = reviewItems().length;
      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, right === done.length ? '🧠' : '💪'),
        h('h1', null, 'Review done!'),
        h('p', { class: 'subtitle' }, `Right the first time: ${right} of ${done.length}.`),
        h('p', { class: 'muted' }, 'Reviews never change your stars. Sentences you got right come back later; the ones you missed come back tomorrow.'),
        h('details', { class: 'result-details', open: true }, h('summary', null, 'Your sentences'),
          h('ul', { class: 'result-list' }, done.map(x => h('li', null,
            h('span', { lang: 'en' }, x.it.sentence, h('small', { class: 'ar-mini' }, Review.whenText(x.next))),
            h('span', { class: 's gram', 'aria-label': x.correct ? 'right' : 'wrong' }, x.correct ? '✓' : '✗'))))),
        h('div', { class: 'result-actions' },
          more ? h('a', { class: 'btn btn-primary', href: '/review', 'data-link': true }, `Review more (${more})`) : null,
          h('a', { class: 'btn ' + (more ? 'btn-ghost' : 'btn-primary'), href: '/', 'data-link': true, 'data-top': true }, 'Back to lessons'))));
      sfx.finish(); confetti(done.length && right === done.length ? 160 : 80);
      scheduleSync(1500);
    }

    step();
  }

  /* ================================================================ */
  /* Step 4 - Quiz (the last step of every unit, and the final quiz)    */
  /* ================================================================ */
  // Three kinds of multiple-choice questions made from the lesson's own sentences (see quiz-core.js): listen and choose,
  // choose the missing word, choose the sentence that is in the right order. Pass mark 70%; no stars; try again until passed.
  function runQuiz(o) {
    const { slug, lesson, unit, unitIndex } = o;
    const scope = unit ? 'unit:' + unit.id : 'final';
    document.title = `${unit ? 'Quiz' : 'Final quiz'} · ${lesson.title} · ${config.appName}`;
    const everything = lesson.units.flatMap(u => u.sentences);
    const seed = 1 + Math.floor(Math.random() * 2147483000); // a new quiz every time
    const noListen = !canSpeak;
    const questions = Quiz.build({ sentences: unit ? unit.sentences : everything, context: everything, seed, noListen });
    if (!questions.length) return navigate(`/lesson/${slug}`, true);
    const picks = [];
    const startedAt = Date.now();
    let pos = 0, answered = false, sheet = null, nextBtn = null, blank = null;

    const dots = progressDots(questions.length);
    const pill = h('div', { class: 'pill' });
    const kind = h('div', { class: 'card-num' });
    const body = h('div', { class: 'quiz-body' });
    const card = h('div', { class: 'learn-card gap-card quiz-card' }, kind, body);
    const choices = h('div', { class: 'gap-options quiz-options', role: 'group', 'aria-label': 'Choose an answer' });
    const dock = h('div', { class: 'dock' }, choices);

    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: `/lesson/${slug}`, 'data-link': true, 'aria-label': 'Leave the quiz', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, unit ? unitChip(lesson, unitIndex, 'Quiz') : 'Final quiz')),
        pill, soundButton()),
      dots.el,
      h('div', { class: 'stage' }, card),
      dock,
      h('p', { class: 'kbd-hint' }, 'Keys 1 2 3 choose an answer  ·  L listen again  ·  Enter next')
    );
    app.classList.add('play');

    function show() {
      const q = questions[pos];
      answered = false; blank = null;
      if (sheet) { sheet.remove(); sheet = null; }
      pill.textContent = `${pos + 1} / ${questions.length}`;
      dots.set(pos, pos);
      kind.textContent = q.type === 'listen' ? 'Listen' : q.type === 'word' ? 'Missing word' : 'Read';
      body.replaceChildren();
      let fitEl = null;
      if (q.type === 'listen') {
        body.append(
          h('button', { class: 'quiz-play', type: 'button', 'aria-label': 'Play the sentence', html: ICON.sound, onclick: () => speak(q.speak) }),
          h('p', { class: 'quiz-prompt' }, q.prompt));
        later(() => speak(q.speak), 300);
      } else if (q.type === 'word') {
        blank = h('span', { class: 'gap-blank', 'aria-label': 'missing word' });
        fitEl = h('p', { class: 'card-sentence', lang: 'en' }, q.before, blank, q.after);
        body.append(fitEl, h('p', { class: 'quiz-prompt' }, q.prompt));
      } else {
        body.append(h('p', { class: 'quiz-prompt big' }, q.prompt), h('p', { class: 'quiz-sub' }, 'Look at the order of the words.'));
      }
      choices.replaceChildren(...q.options.map((text, i) => h('button', { class: 'gap-opt quiz-opt', type: 'button', onclick: () => choose(i) }, text)));
      choices.classList.remove('away');
      if (fitEl) fitText(card, fitEl);
    }

    function choose(i) {
      if (answered) return;
      answered = true;
      stopSpeech();
      const q = questions[pos];
      picks[pos] = i;
      const ok = i === q.answer;
      const right = q.options[q.answer];
      [...choices.children].forEach((b, k) => {
        b.disabled = true;
        if (k === q.answer) b.classList.add('right');
        else if (k === i) b.classList.add('wrong');
      });
      if (blank) { blank.textContent = right; blank.classList.add('filled'); }
      choices.classList.add('away');
      ok ? (sfx.win(), confetti(20)) : (sfx.wrong(), navigator.vibrate && navigator.vibrate(60));
      const praise = ['Correct! 🌟', 'Well done! 👏', 'Yes! 🎉', 'Great! 💪'];
      nextBtn = h('button', { class: 'btn btn-main ' + (ok ? 'btn-ok' : 'btn-primary'), type: 'button', html: (pos + 1 < questions.length ? 'Next ' : 'Finish ') + ICON.next });
      nextBtn.addEventListener('click', goNext);
      sheet = h('div', { class: 'sheet' + (ok ? '' : ' bad'), role: 'status' },
        h('div', { class: 'sheet-head' }, h('span', { class: 'sheet-msg' }, ok ? praise[(Math.random() * praise.length) | 0] : 'Not quite')),
        ok ? null : h('div', { class: 'sheet-answer' }, q.type === 'word' ? 'The missing word is: ' : 'The right answer is: ', h('b', null, right)),
        h('div', { class: 'sheet-row' }, canSpeak && q.type !== 'word' ? rbtn(ICON.sound, 'Listen', { onclick: () => speak(q.sentence) }) : null, nextBtn));
      dock.append(sheet);
      nextBtn.focus({ preventScroll: true });
    }

    function goNext() {
      clearScreenTimers(); stopSpeech();
      if (++pos < questions.length) show(); else finish();
    }

    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'l' && !answered && questions[pos].speak) speak(questions[pos].speak);
      else if (answered) { if (key === 'Enter' && nextBtn && document.activeElement !== nextBtn) nextBtn.click(); }
      else if (/^[1-3]$/.test(key)) { const b = choices.children[Number(key) - 1]; if (b) b.click(); }
    };
    document.addEventListener('keydown', onKey);
    const stopRelayout = onRelayout(() => { const t = body.querySelector('.card-sentence'); if (t) fitText(card, t); });
    cleanup = () => { document.removeEventListener('keydown', onKey); stopRelayout(); };

    function finish() {
      cleanup(); cleanup = null;
      const graded = Quiz.grade(questions, picks);
      const seconds = Math.min(3600, Math.round((Date.now() - startedAt) / 1000));
      // Marked here at once (same code as the server); the server marks it again from the seed and the answers.
      const local = noteQuiz(slug, unit ? unit.id : 'final', graded.passed, seconds);
      outbox.send(`/api/lessons/${slug}/quiz`, { scope, seed, noListen, picks, seconds, cid: uid() }).catch(e => { toast(e.message); return null; });
      scheduleSync(1500);
      const now = lessonView(slug);
      if (graded.passed && local.completed && now) return showLessonComplete(slug, lesson, now.progress);
      const p = now && now.progress;
      const offline = !navigator.onLine || outbox.items().length > 0;
      const actions = h('div', { class: 'result-actions' });
      if (graded.passed) {
        const nextUnit = unit ? lesson.units[unitIndex + 1] : null;
        if (nextUnit) actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, nextUnit, 'learn'), 'data-link': true, html: `Next: Unit ${unitIndex + 2} · ` }, nextUnit.title, h('span', { html: ICON.next })));
        else if (p && p.finalReady) actions.append(h('a', { class: 'btn btn-primary', href: `/lesson/${slug}/final`, 'data-link': true }, 'Final quiz ❓'));
      } else {
        actions.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => runQuiz(o) }, 'Try again'));
      }
      actions.append(h('a', { class: 'btn ' + (actions.children.length ? 'btn-ghost' : 'btn-primary'), href: `/lesson/${slug}`, 'data-link': true }, 'Back to lesson'));
      actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true, 'data-top': true }, 'All lessons'));
      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, graded.passed ? '🎉' : '💪'),
        h('h1', null, graded.passed ? (unit ? 'Quiz passed!' : 'Final quiz passed!') : 'Almost there!'),
        h('p', { class: 'subtitle' }, graded.passed ? `You got ${graded.score} of ${graded.total} right.` : `You got ${graded.score} of ${graded.total}. You need ${graded.needed} to pass.`),
        graded.passed && unit && p && p.finalReady ? h('p', { class: 'muted' }, 'Every unit is finished. One last thing: the final quiz.') : null,
        !graded.passed ? h('p', { class: 'muted' }, 'Look at the sentences again, then try a new quiz. You can try as many times as you like. 💪') : null,
        offline ? h('p', { class: 'muted' }, 'You are offline. Your result will be saved when you reconnect.') : null,
        h('details', { class: 'result-details' }, h('summary', null, 'See the answers'),
          h('ul', { class: 'result-list' }, questions.map((q, i) => h('li', null,
            h('span', null, q.sentence),
            h('span', { class: 's gram', 'aria-label': graded.results[i].correct ? 'right' : 'wrong' }, graded.results[i].correct ? '✓' : '✗'))))),
        actions));
      sfx.finish(); if (graded.passed) confetti(120);
    }

    show();
  }

  /* ================================================================ */
  /* Lesson complete: a full-screen celebration, then the next lesson   */
  /* ================================================================ */
  function showLessonComplete(slug, lesson, p) {
    document.title = `Lesson complete · ${lesson.title} · ${config.appName}`;
    const pct = p.maxStars ? p.stars / p.maxStars : 1;
    const next = lessonList().find(l => l.slug !== slug && !l.progress.completed && !l.locked);
    setView(
      h('div', { class: 'stage celeb' },
        h('div', { class: 'celeb-badge', 'aria-hidden': 'true' }, '🏆'),
        h('h1', null, 'Lesson complete!'),
        h('p', { class: 'celeb-title' }, `${lesson.emoji || '📘'} ${lesson.title}`),
        h('div', { class: 'stars celeb-stars', 'aria-label': `${Math.max(1, Math.round(pct * 3))} of 3 stars` }, starNodes(Math.max(1, Math.round(pct * 3)))),
        h('p', { class: 'celeb-total' }, h('b', null, `★ ${p.stars}`), ` of ${p.maxStars} stars`, p.extra ? ` · +${p.extra} extra` : ''),
        next ? null : h('p', { class: 'muted' }, 'You finished every lesson! 🎉')),
      h('div', { class: 'dock' },
        next ? h('a', { class: 'btn btn-main btn-accent', href: `/lesson/${next.slug}`, 'data-link': true, 'data-top': true, html: 'Next lesson ' + ICON.next }) : null,
        h('a', { class: 'btn btn-main ' + (next ? 'btn-ghost' : 'btn-primary'), href: '/', 'data-link': true, 'data-top': true }, 'All lessons')));
    app.classList.add('play');
    sfx.finish(); confetti(260);
    scheduleSync(1500); // check with the server in the background
  }

  /* ================================================================ */
  /* Practise your own text (not tracked)                              */
  /* ================================================================ */
  function showPractice() {
    document.title = `Practise your text · ${config.appName}`;
    const ta = h('textarea', { dir: 'ltr', placeholder: 'Paste English text here. Each sentence becomes a puzzle.', 'aria-label': 'Your English text' });
    ta.value = storage.get('ws:practice', '');
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    ta.addEventListener('input', () => { msg.textContent = ''; storage.set('ws:practice', ta.value); });

    const start = () => {
      const sentences = splitSentences(ta.value);
      if (!sentences.length) { msg.textContent = 'Please enter at least one English sentence with two or more words.'; ta.focus(); return; }
      if (sentences.length > MAX_PRACTICE) toast(`Using the first ${MAX_PRACTICE} of ${sentences.length} sentences.`);
      const items = sentences.slice(0, MAX_PRACTICE).map(en => ({ en }));
      runPuzzle({ lesson: { title: 'My text', sentences: items }, slug: null, items, mode: 'practice', exitPath: '/practice' });
    };

    setView(
      h('header', { class: 'appbar' },
        h('a', { class: 'icon-btn', href: '/', 'data-link': true, 'aria-label': 'Back to lessons', html: ICON.back }),
        h('div', { class: 'tools' }, soundButton())),
      h('h1', null, 'Practise your own text'),
      h('p', { class: 'subtitle' }, 'Sentences are split automatically. This practice is not saved to your progress.'),
      h('div', { class: 'card' }, ta),
      msg,
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: start }, 'Start'),
        h('button', {
          class: 'btn btn-ghost', type: 'button', onclick: () => {
            ta.value = "The quick brown fox jumps over the lazy dog. My sister reads a book every night. We are going to the beach tomorrow. Can you help me with my homework? Mr. Brown has two cats and a dog.";
            ta.dispatchEvent(new Event('input'));
          },
        }, 'Try an example'))
    );
  }

  /* ================================================================ */
  /* Profile                                                           */
  /* ================================================================ */
  function showProfile() {
    document.title = `My profile · ${config.appName}`;
    if (!S) return showSkeleton('profile');
    rerender = showProfile;
    const data = { user: S.user, stats: S.stats };
    me = data.user;
    const s = data.stats;

    const nameInput = h('input', { id: 'p-name', type: 'text', value: me.name, maxlength: '60', autocomplete: 'name' });
    const nameMsg = h('p', { class: 'form-msg', role: 'alert' });
    const nameForm = h('form', { class: 'auth-form', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'p-name' }, 'Your name'), nameInput),
      h('div', { class: 'field' }, h('label', null, 'Email'), h('div', { class: 'readonly' }, me.email)),
      nameMsg,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save name'));
    nameForm.addEventListener('submit', async e => {
      e.preventDefault(); nameMsg.textContent = '';
      try { const r = await api('PATCH', '/api/me', { name: nameInput.value }); me = r.user; S.user = r.user; saveData(); toast('Name saved'); }
      catch (err) { nameMsg.textContent = err.message; }
    });

    const cur = h('input', { id: 'p-cur', type: 'password', autocomplete: 'current-password' });
    const nw = h('input', { id: 'p-new', type: 'password', autocomplete: 'new-password', minlength: '8' });
    const pwMsg = h('p', { class: 'form-msg', role: 'alert' });
    const pwForm = h('form', { class: 'auth-form', novalidate: true },
      h('div', { class: 'field' }, h('label', { for: 'p-cur' }, 'Current password'), cur),
      h('div', { class: 'field' }, h('label', { for: 'p-new' }, 'New password ', h('span', { class: 'muted' }, '(at least 8 characters)')), nw),
      pwMsg,
      h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Change password'));
    pwForm.addEventListener('submit', async e => {
      e.preventDefault(); pwMsg.textContent = '';
      if (nw.value.length < 8) { pwMsg.textContent = 'New password must be at least 8 characters.'; return; }
      try { await api('POST', '/api/me/password', { current: cur.value, password: nw.value }); cur.value = ''; nw.value = ''; toast('Password changed'); }
      catch (err) { pwMsg.textContent = err.message; }
    });

    const logout = async () => {
      try { await api('POST', '/api/auth/logout'); } catch (e) { /* ignore */ }
      me = null; dropData();
      navigate('/login', true);
    };

    setView(
      h('header', { class: 'appbar' },
        h('a', { class: 'icon-btn', href: '/', 'data-link': true, 'aria-label': 'Back to lessons', html: ICON.back }),
        h('div', { class: 'tools' }, soundButton())),
      h('div', { class: 'profile-head' }, avatar(me.name, 'avatar-lg'),
        h('div', null, h('h1', null, me.name), h('p', { class: 'subtitle' }, `Since ${new Date(me.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} · ${formatTime(s.timeSpent)} learning`))),
      h('div', { class: 'stat-row' },
        statTile('star', s.stars, 'Stars', s.extraStars ? `+${s.extraStars} extra` : null),
        statTile('check', s.sentencesSolved, 'Sentences'),
        statTile('trophy', s.lessonsCompleted, 'Lessons'),
        statTile('flame', s.streak, 'Streak')),
      h('section', { class: 'section' }, h('h2', null, 'My details'), h('div', { class: 'card' }, nameForm)),
      h('section', { class: 'section' }, h('h2', null, 'Password'), h('div', { class: 'card' }, pwForm)),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn btn-danger', type: 'button', onclick: logout }, 'Log out'))
    );
  }

  /* ================================================================ */
  /* Boot                                                              */
  /* ================================================================ */
  (async function boot() {
    const onAuth = /^\/(login|signup)$/.test(location.pathname);
    const cfg = api('GET', '/api/config').then(c => { config = { ...config, ...c }; }).catch(() => { /* offline: use defaults */ });
    if (onAuth) {
      route();
      await cfg;
      if (!config.allowSignup && location.pathname === '/signup') route();
      return;
    }
    // Returning student: everything is on the device, so the screen opens at once and the server is asked in the background.
    // First visit: the skeleton from the HTML stays until the first answer arrives.
    if (S) { me = S.user; route(); }
    await Promise.all([cfg, refresh()]);
  })().catch(e => console.error(e));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
