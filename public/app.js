/* WordStack - student app */
(function () {
  'use strict';

  const Progress = window.ProgressCore; // the scoring rules, shared with the server (progress-core.js)
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
    return { gap: { index: g.index, answer: g.answer, options: [...g.options] }, gdone: Boolean(x.gdone) };
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
            sentences: u.sentences.filter(x => isObj(x) && typeof x.en === 'string' && x.en.trim())
              .map(x => ({ en: x.en, stars: clampNum(x.stars, 0, 3), extra: clampNum(x.extra, 0, 3), ...cleanGap(x) })),
          });
        }
        if (!units.length) continue;
        const lp = isObj(l.lp) ? l.lp : null;
        lessons.push({
          slug: l.slug, title: text(l.title), level: text(l.level), description: text(l.description), emoji: text(l.emoji) || '📘',
          assigned: Boolean(l.assigned),
          units,
          lp: lp ? { started_at: lp.started_at || null, last_activity_at: lp.last_activity_at || null, completed_at: lp.completed_at || null, time_spent_sec: toNum(lp.time_spent_sec) } : null,
          unitRows: (Array.isArray(l.unitRows) ? l.unitRows : []).filter(r => isObj(r) && typeof r.unit_id === 'string')
            .map(r => ({ unit_id: r.unit_id, learn_index: toNum(r.learn_index), learned_at: r.learned_at || null })),
        });
      }
      return {
        user: { id: d.user.id, name: text(d.user.name), email: text(d.user.email), createdAt: d.user.createdAt || null },
        stats: { sentencesSolved: toNum(st.sentencesSolved), stars: toNum(st.stars), extraStars: toNum(st.extraStars),
          lessonsCompleted: toNum(st.lessonsCompleted), timeSpent: toNum(st.timeSpent), streak: toNum(st.streak) },
        lessons,
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

  const lessonList = () => S.lessons.map(l => ({
    slug: l.slug, title: l.title, level: l.level, description: l.description, emoji: l.emoji, assigned: l.assigned,
    count: l.units.reduce((a, u) => a + u.sentences.length, 0), progress: modelOf(l),
  }));
  // A private copy for a screen to work with (a round must not change under its own feet).
  function lessonView(slug) {
    const raw = rawLesson(slug);
    if (!raw) return null;
    return {
      lesson: { slug: raw.slug, title: raw.title, level: raw.level, description: raw.description, emoji: raw.emoji, assigned: raw.assigned,
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
  let voice = null;
  function pickVoice() {
    if (!canSpeak) return;
    const vs = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    voice = vs.find(v => /en[-_]US/i.test(v.lang) && /google|natural|samantha/i.test(v.name))
      || vs.find(v => /en[-_](US|GB)/i.test(v.lang)) || vs[0] || null;
  }
  if (canSpeak) { pickVoice(); speechSynthesis.addEventListener('voiceschanged', pickVoice); }
  function speak(text, slow, onEnd) {
    if (!canSpeak || !text) { if (onEnd) onEnd(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = voice ? voice.lang : 'en-US';
      if (voice) u.voice = voice;
      u.rate = slow ? 0.6 : 0.9;
      if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
      speechSynthesis.speak(u);
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
    if (/^\/lesson\/[^/]+\/u\//.test(path) || path === '/practice') return 'game';
    if (path === '/profile' || path === '/login' || path === '/signup') return 'narrow';
    return 'wide';
  }

  function route() {
    viewId++;
    rerender = null;
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
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)$/))) return showLessonHub(m[1]);
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)\/u\/([a-z0-9]+)\/(learn|build|review|grammar)$/i))) return showLessonStep(m[1], m[2], m[3]);
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)\/(learn|build|review|grammar)$/))) return navigate(`/lesson/${m[1]}`, true);
    if (path === '/practice') return showPractice();
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

  function statusText(p) {
    if (p.completed) return '✓ Completed';
    if (p.status === 'new' || p.currentUnit === null) return 'New';
    const u = p.units[p.currentUnit];
    const where = p.unitsTotal > 1 ? `Unit ${p.currentUnit + 1}/${p.unitsTotal} · ` : '';
    return where + (u.learned ? (u.grammarReady ? 'grammar next' : `${u.solved}/${u.total} built`) : 'learning');
  }

  function unitStepText(p) {
    if (p.currentUnit === null) return 'Completed';
    const u = p.units[p.currentUnit];
    const where = p.unitsTotal > 1 ? `Unit ${p.currentUnit + 1} · ${u.title} · ` : '';
    return where + (u.grammarReady ? `Step 3 · grammar ${u.grammarDone} of ${u.grammarTotal}` : u.learned ? `Step 2 · ${u.solved} of ${u.total} built` : 'Step 1 · learning the sentences');
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
      .filter(l => l.progress.lastActivityAt)
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

    setView(
      appBar(),
      h('h1', null, `${greet}, ${firstName}`),
      h('p', { class: 'subtitle' }, stats.sentencesSolved ? 'Keep going, you are doing great! ⭐' : 'Tap a lesson to play! 🎈'),
      h('div', { class: 'stat-row' },
        statTile('star', stats.stars, 'Stars', stats.extraStars ? `+${stats.extraStars} extra` : null),
        statTile('check', stats.sentencesSolved, 'Sentences'),
        statTile('flame', stats.streak, 'Streak'),
        statTile('trophy', stats.lessonsCompleted, 'Lessons')),
      cont ? continueCard(cont) : null,
      finished.length ? completedLink(finished) : null,
      assigned.length ? h('section', { class: 'section' },
        h('h2', null, 'For you'),
        h('div', { class: 'lesson-grid' }, assigned.map(lessonCard))) : null,
      h('section', { class: 'section' },
        h('h2', null, 'All lessons'),
        lessons.length ? chips : h('p', { class: 'empty' }, finished.length ? 'You finished every lesson! 🎉 Play your own text below, or open a finished lesson to play it again.' : 'No lessons yet. Your teacher will add some soon.'),
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
    const started = p.status !== 'new';
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

    const hasProgress = p.units.some(u => u.status !== 'new');
    const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);

    const unitCards = lesson.units.map((unit, i) => {
      const up = p.units[i];
      const current = i === p.currentUnit;
      let action = null;
      if (current) {
        // The unit's three steps in order: read and say it, build it, then the grammar gap (if the unit has one).
        const step = !up.learned ? 'learn' : up.solved < up.total ? 'build' : 'grammar';
        const label = step === 'learn' ? (up.status === 'learning' ? 'Continue' : 'Start') : step === 'build' ? (up.solved ? 'Continue' : 'Play') : 'Continue';
        action = h('a', { class: 'btn btn-primary btn-block btn-play', href: unitPath(slug, unit, step), 'data-link': true }, '▶ ', label);
      }
      // Any unit the student can open can be revisited: read the cards again, practise, or start it over.
      const again = !up.locked && up.status !== 'new' ? h('div', { class: 'unit-actions' },
        h('a', { class: 'btn btn-ghost btn-sm', href: unitPath(slug, unit, 'learn'), 'data-link': true, html: ICON.cards + ' Cards' }),
        up.learned ? h('a', { class: 'btn btn-ghost btn-sm', href: unitPath(slug, unit, 'review'), 'data-link': true, html: ICON.puzzle + ' Practise' }) : null,
        up.learned && up.grammarTotal && up.solved === up.total ? h('a', { class: 'btn btn-ghost btn-sm', href: unitPath(slug, unit, 'grammar') + '?replay=1', 'data-link': true }, '✏️ Grammar') : null,
        up.learned ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', html: ICON.reset + ' Restart', title: 'Play this unit again from the first sentence. Your saved progress is kept.',
          onclick: () => restartUnit(i) }) : null) : null;

      // Every sentence of an opened unit: listen to it, or practise just that one.
      const sentences = up.learned ? h('details', { class: 'unit-sentences' },
        h('summary', null, `All ${plural(up.total, 'sentence')}`),
        h('ul', null, unit.sentences.map((sn, k) => h('li', null,
          h('span', { class: 'sn-text', lang: 'en' }, sn.en),
          h('span', { class: 'sn-stars', 'aria-label': `${sn.stars} of 3 stars` }, sn.stars ? stars(sn.stars) : '–', sn.extra ? h('small', { class: 'extra' }, ` +${sn.extra}`) : null),
          h('span', { class: 'sn-btns' },
            canSpeak ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Listen', html: ICON.sound, onclick: () => speak(sn.en) }) : null,
            h('a', { class: 'icon-btn', href: `${unitPath(slug, unit, 'review')}?only=${k}`, 'data-link': true, 'aria-label': 'Practise this sentence', html: ICON.puzzle })))))) : null;

      const learnTxt = up.learned ? 'Learned' : up.status === 'learning' ? `Learn ${up.learnIndex + 1}/${up.total}` : 'Learn';
      return h('li', { class: 'unit' + (up.completed ? ' done' : current ? ' current' : up.locked ? ' locked' : '') },
        h('div', { class: 'unit-head' },
          h('span', { class: 'step-num', html: up.completed ? ICON.check : up.locked ? ICON.lock : null }, up.completed || up.locked ? null : String(i + 1)),
          h('div', { class: 'step-body' },
            multi ? h('div', { class: 'unit-label' }, `Unit ${i + 1}`) : null,
            h('div', { class: 'step-title' }, multi ? unit.title : 'Your sentences'),
            up.locked
              ? h('div', { class: 'muted' }, `Finish Unit ${i} to open this unit`)
              : h('div', { class: 'unit-steps' },
                  h('span', { class: up.learned ? 'ok' : '', html: ICON.cards }, learnTxt),
                  h('span', { class: up.solved === up.total ? 'ok' : '', html: ICON.puzzle }, `Build ${up.solved}/${up.total}`),
                  up.grammarTotal ? h('span', { class: up.grammarDone === up.grammarTotal ? 'ok' : '' }, `✏️ Grammar ${up.grammarDone}/${up.grammarTotal}`) : null,
                  up.stars ? h('span', { class: 'star', html: ICON.star }, String(up.stars)) : null,
                  up.extra ? h('span', { class: 'extra', title: 'Stars gained by practising again' }, `+${up.extra} extra`) : null))),
        action,
        // Everything else is tucked away so a child only sees one big button.
        again || sentences ? h('details', { class: 'unit-more' }, h('summary', null, 'More'), again, sentences) : null);
    });

    // Start the lesson over from Unit 1. Nothing is deleted: saved progress and stars stay, and any
    // better result is added as extra.
    function restartUnit(i) {
      if (!confirm('Play this unit again from the first sentence?\n\nYour saved progress stays. If you do better than before, the difference is added as extra stars.')) return;
      api('POST', `/api/lessons/${slug}/restart`, { unitId: lesson.units[i].id }).catch(() => {});
      navigate(`${unitPath(slug, lesson.units[i], 'learn')}?restart=1`);
    }
    function restartLesson() {
      if (!confirm('Start this lesson over from the beginning?\n\nYour saved progress stays. If you do better than before, the difference is added as extra stars.')) return;
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
        !p.completed && p.status === 'new' ? h('p', { class: 'how' }, '👀 Look and listen', h('span', { class: 'arrow' }, ' → '), '🧩 Build the sentence') : null,
        h('ol', { class: 'units' }, unitCards),
        hasProgress ? h('details', { class: 'start-over' },
          h('summary', null, 'More options'),
          h('button', { class: 'btn btn-ghost btn-block', type: 'button', html: ICON.reset + ' Start lesson over', onclick: restartLesson }),
          h('p', { class: 'muted' }, 'Replay everything from Unit 1. Your saved progress is never lost, and better results count as extra stars.')) : null,
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
    if (step === 'build') {
      const items = unit.sentences.filter(s => !s.stars);
      if (!items.length) return navigate(`/lesson/${slug}`, true);
      return runPuzzle({ ...ctx, items, mode: 'build', exitPath: `/lesson/${slug}` });
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
    const jump = h('div', { class: 'jump-grid', hidden: true, role: 'group', 'aria-label': 'Jump to a sentence' });
    const fill = h('div', { class: 'progress-fill' });
    const num = h('div', { class: 'card-num' });
    const text = h('p', { class: 'card-sentence', lang: 'en' });
    const card = h('div', { class: 'learn-card', tabindex: '-1' }, num, text, h('p', { class: 'card-tip' }, 'Tap any word to hear it'));
    const listen = h('button', { class: 'btn btn-ghost btn-big', type: 'button', html: ICON.sound + ' Listen' });
    const slow = h('button', { class: 'btn btn-ghost btn-big', type: 'button', html: '🐢 Slowly' });
    const prev = h('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Previous sentence', html: ICON.back });
    const next = h('button', { class: 'btn btn-primary', type: 'button' });
    // The first time through (and when starting over) every sentence must be said out loud before moving on.
    const needSay = !up.learned || restart;
    const saidOut = new Set();
    const say = h('button', { class: 'btn btn-accent btn-big btn-say', type: 'button', hidden: !needSay });
    if (!canSpeak) { listen.disabled = true; slow.disabled = true; listen.title = 'Speech is not supported on this device'; }

    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: `/lesson/${slug}`, 'data-link': true, 'aria-label': 'Back to lesson', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, unitChip(lesson, unitIndex, 'Learn')), ' ', lesson.units.length > 1 ? unit.title : lesson.title),
        pill, soundButton()),
      h('div', { class: 'progress-track', role: 'progressbar' }, fill),
      jump,
      h('p', { class: 'prompt' }, needSay ? '👀 Read it  ·  🔊 Listen  ·  🗣️ Say it out loud' : '👀 Look and listen'),
      card,
      h('div', { class: 'listen-row' }, listen, slow),
      needSay ? h('div', { class: 'say-row' }, say) : null,
      h('div', { class: 'actions' }, prev, next),
      restart ? h('p', { class: 'skip-row' }, h('a', { href: reviewPath, 'data-link': true }, 'Already know them? Skip to building ›')) : null,
      h('p', { class: 'kbd-hint' }, needSay ? '←  →  next / previous  ·  Space listen  ·  S I said it' : '←  →  next / previous  ·  Space listen') // shown on computers only
    );

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

    function render(autoSpeak) {
      const s = sentences[i].en;
      pill.textContent = `${i + 1} / ${total}`;
      fill.style.width = `${((i + 1) / total) * 100}%`;
      num.textContent = `Sentence ${i + 1}`;
      text.replaceChildren(...s.split(/\s+/).flatMap((w, k) => [
        k ? ' ' : '',
        h('span', { class: 'word', role: 'button', tabindex: '0', onclick: () => speak(stripEdges(w) || w, true),
          onkeydown: e => { if (e.key === 'Enter') speak(stripEdges(w) || w, true); } }, w),
      ]));
      restartAnimation(card, 'flip-in');
      prev.disabled = i === 0;
      const said = !needSay || saidOut.has(i);
      say.classList.toggle('done', said);
      say.textContent = said ? '✓ You said it' : '🗣️ I said it out loud';
      next.disabled = !said;
      next.innerHTML = i === total - 1 ? (restart || !up.learned ? 'Start building ' : 'Done ') + ICON.next : 'Next ' + ICON.next;
      next.className = 'btn ' + (i === total - 1 ? 'btn-accent' : 'btn-primary');
      prev.className = 'btn btn-ghost';
      shownAt = Date.now();
      if (autoSpeak && settings.sound) later(() => speakCard(false), 250);
    }

    const secondsOnCard = () => Math.min(120, Math.round((Date.now() - shownAt) / 1000));

    async function go(delta) {
      if (delta > 0 && needSay && !saidOut.has(i)) { toast('Say the sentence out loud first 🗣️'); return; }
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

    say.addEventListener('click', () => { if (saidOut.has(i)) return; saidOut.add(i); sfx.win(); render(false); next.focus({ preventScroll: true }); });
    listen.addEventListener('click', () => speakCard(false));
    slow.addEventListener('click', () => speakCard(true));
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));

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
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ' && !e.target.closest('button, [role="button"]')) { e.preventDefault(); speakCard(false); }
      else if ((e.key === 's' || e.key === 'S') && needSay && !e.ctrlKey && !e.metaKey && !e.altKey) say.click();
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);

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
    if (!Array.isArray(items) || !items.length) return navigate(exitPath || '/', true); // nothing to play
    const tracked = Boolean(slug);
    const total = tracked ? unit.sentences.length : items.length;
    let doneCount = tracked && mode === 'build' ? unit.sentences.filter(s => s.stars).length : 0;
    document.title = `${mode === 'practice' ? 'Practice' : 'Build'} · ${lesson.title} · ${config.appName}`;

    const results = []; // stars per item this round
    let pos = 0, round = null, sortables = [];
    const locals = []; // what each sentence of this round earned, worked out on the device at once
    const canGoBack = mode !== 'build';

    const pill = h('div', { class: 'pill' });
    const fill = h('div', { class: 'progress-fill' });
    const answer = h('div', { class: 'zone answer-zone', 'data-placeholder': 'Tap or drag the words here', 'aria-label': 'Your sentence' });
    const pool = h('div', { class: 'zone pool-zone', 'aria-label': 'Words to use' });
    const answerBox = h('div', { class: 'answer-box' }, answer);
    const feedback = h('p', { class: 'feedback', role: 'status' });
    const solvedPanel = h('div', { class: 'solved-panel', hidden: true });

    const resetBtn = h('button', { class: 'btn btn-ghost', type: 'button', html: ICON.reset + '<span class="lbl">Reset</span>', 'aria-label': 'Put the words back and shuffle' });
    const hintBtn = h('button', { class: 'btn btn-ghost', type: 'button', html: ICON.hint + '<span class="lbl">Hint</span>', 'aria-label': 'Hint' });
    const listenBtn = h('button', { class: 'btn btn-ghost btn-big', type: 'button', html: ICON.sound + ' Listen', 'aria-label': 'Listen to the sentence' });
    const checkHint = h('button', { class: 'btn btn-status', type: 'button', disabled: true, 'aria-hidden': 'true', tabindex: '-1' }, '');
    const prevBtn = h('button', { class: 'btn btn-ghost', type: 'button', hidden: true, 'aria-label': 'Previous sentence', title: 'Previous sentence', html: ICON.back });
    const peekBtn = h('button', { class: 'btn btn-ghost btn-big', type: 'button', html: '👀 Peek', 'aria-label': 'Peek at the sentence for 3 seconds (counts as a hint)' });
    const nextBtn = h('button', { class: 'btn btn-accent', type: 'button', hidden: true, html: 'Next ' + ICON.next });

    const chip = mode === 'practice' ? 'Practice' : unitChip(lesson, unitIndex, mode === 'review' ? 'Practise again' : 'Build');
    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: exitPath, 'data-link': true, 'aria-label': 'Leave', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, chip), ' ', tracked && lesson.units.length > 1 ? unit.title : lesson.title),
        pill, soundButton()),
      h('div', { class: 'progress-track', role: 'progressbar' }, fill),
      h('p', { class: 'prompt' }, '👆 Tap the words in the right order'),
      h('div', { class: 'listen-row listen-peek' }, canSpeak ? listenBtn : null, peekBtn),
      answerBox, pool, feedback, solvedPanel,
      h('div', { class: 'actions' }, prevBtn, resetBtn, hintBtn, checkHint, nextBtn),
      h('p', { class: 'kbd-hint' }, '1–9 pick a word  ·  Backspace undo  ·  H hint  ·  P peek  ·  L listen  ·  Enter next') // shown on computers only
    );

    const tilesIn = zone => [...zone.children];
    const words = zone => tilesIn(zone).map(t => t.dataset.word);
    const makeTile = word => h('button', { class: 'tile', type: 'button', 'data-word': word }, word);

    function updateBar() {
      if (mode === 'build') {
        pill.textContent = `${doneCount} / ${total}`;
        fill.style.width = `${(doneCount / total) * 100}%`;
      } else {
        pill.textContent = `${pos + 1} / ${items.length}`;
        fill.style.width = `${((pos + (round && round.solved ? 1 : 0)) / items.length) * 100}%`;
      }
    }

    function loadRound() {
      const sentence = items[pos].en;
      const target = hideCapital(tokenize(sentence));
      round = { sentence, target, mistakes: 0, hints: 0, solved: false, lastWrong: null, startedAt: Date.now(), cid: uid() };
      answer.replaceChildren();
      pool.replaceChildren(...shuffle(target).map(makeTile));
      answerBox.classList.remove('solved');
      solvedPanel.hidden = true;
      feedback.textContent = ''; feedback.className = 'feedback';
      resetBtn.hidden = false; hintBtn.hidden = false; peekBtn.hidden = false; nextBtn.hidden = true; checkHint.hidden = false;
      prevBtn.hidden = !(canGoBack && pos > 0);
      updateLeft();
      sortables.forEach(s => s.option('disabled', false));
      updateBar();
      // The sentence is read aloud first, so the child can listen and then build it.
      if (settings.sound && canSpeak) { const r = round; later(() => { if (round === r && !r.solved) speak(r.sentence); }, 350); }
    }

    function updateLeft() {
      const n = pool.children.length;
      checkHint.textContent = n ? `${n} left` : 'Almost! Move the orange words';
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
      if (!fromHint && key !== round.lastWrong) { round.mistakes++; sfx.wrong(); if (navigator.vibrate) navigator.vibrate(60); }
      round.lastWrong = key;
      tilesIn(answer).forEach((t, k) => t.classList.add(t.dataset.word === round.target[k] ? 'right' : 'wrong'));
      feedback.textContent = 'Almost! Try again 💪';
      feedback.className = 'feedback bad';
    }

    function success() {
      round.solved = true;
      const s = starsFor(round.mistakes + round.hints);
      results[pos] = s;
      const seconds = Math.min(600, Math.round((Date.now() - round.startedAt) / 1000));
      let local = null;
      if (tracked) {
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
      updateBar();
      solvedPanel.replaceChildren(
        h('div', { class: 'sentence' }, round.sentence),
        h('div', { class: 'stars', 'aria-label': `${s} of 3 stars` }, starNodes(s)));
      solvedPanel.hidden = false;
      restartAnimation(solvedPanel, 'pop');
      // Practising a sentence again: a better result than before is added as extra stars.
      if (local && local.replay && local.extra > 0)
        solvedPanel.append(h('div', { class: 'extra-tag' }, `+${local.extra} extra ${local.extra === 1 ? 'star' : 'stars'} added to your score!`));
      const praise = s === 3 ? ['Perfect! 🌟', 'Excellent! 🎉', 'Amazing! 🤩'] : s === 2 ? ['Well done! 👏', 'Great job! 😊', 'Nice work! 👍'] : ['You got it! 💪', 'Good job, keep going! 🌈'];
      feedback.textContent = praise[(Math.random() * praise.length) | 0];
      feedback.className = 'feedback good';
      resetBtn.hidden = true; hintBtn.hidden = true; peekBtn.hidden = true; nextBtn.hidden = false; checkHint.hidden = true;
      nextBtn.innerHTML = (pos + 1 < items.length ? 'Next ' : 'Finish ') + ICON.next;
      nextBtn.focus({ preventScroll: true });
      sfx.win(); confetti(40);
      if (settings.sound) later(() => speak(round.sentence), 450);
    }

    function hint() {
      if (round.solved) return;
      const cur = tilesIn(answer);
      let i = cur.findIndex((t, k) => t.dataset.word !== round.target[k]);
      if (i < 0) i = cur.length;
      const want = round.target[i];
      const tile = tilesIn(pool).find(t => t.dataset.word === want) || cur.find((t, k) => k > i && t.dataset.word === want);
      if (!tile) return;
      answer.insertBefore(tile, answer.children[i] || null);
      round.hints++;
      restartAnimation(tile, 'flash');
      sfx.hint();
      afterChange(true);
      if (!round.solved && pool.children.length) { feedback.textContent = `“${want}” is word ${i + 1}.`; feedback.className = 'feedback'; }
    }

    function resetRound() {
      if (round.solved) return;
      pool.replaceChildren(...shuffle(round.target).map(makeTile));
      answer.replaceChildren();
      afterChange(true);
    }

    let lastDragEnd = 0;
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
      const opts = {
        group: 'words', animation: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)',
        forceFallback: true, fallbackOnBody: true, fallbackTolerance: 6,
        fallbackClass: 'dragging', ghostClass: 'ghost', swapThreshold: 0.6,
        onEnd: () => { lastDragEnd = Date.now(); afterChange(false); },
      };
      sortables = [Sortable.create(answer, opts), Sortable.create(pool, opts)];
    }

    let peekTimer;
    peekBtn.addEventListener('click', () => {
      if (round.solved) return;
      round.hints++; // peeking is a hint, like the lightbulb
      clearTimeout(peekTimer);
      feedback.textContent = round.sentence; feedback.className = 'feedback peek';
      sfx.hint();
      const r = round;
      peekTimer = later(() => { if (round === r && !r.solved && feedback.classList.contains('peek')) { feedback.textContent = ''; feedback.className = 'feedback'; } }, 3000);
    });
    prevBtn.addEventListener('click', () => { stopSpeech(); if (pos > 0) { pos--; loadRound(); window.scrollTo(0, 0); } });
    resetBtn.addEventListener('click', resetRound);
    hintBtn.addEventListener('click', hint);
    listenBtn.addEventListener('click', () => speak(round.sentence));
    nextBtn.addEventListener('click', () => {
      clearScreenTimers();
      stopSpeech();
      if (++pos < items.length) { loadRound(); window.scrollTo(0, 0); } else finish();
    });

    // Play with the keyboard on a computer: number keys pick loose words, Backspace takes the last one back.
    const onKey = e => {
      if (!round || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'l' && !listenBtn.hidden) { listenBtn.click(); return; }
      if (round.solved) {
        if (key === 'Enter' && document.activeElement !== nextBtn && !nextBtn.hidden) nextBtn.click();
        return;
      }
      if (/^[1-9]$/.test(key)) { const tile = pool.children[Number(key) - 1]; if (tile) tile.click(); }
      else if (key === 'Backspace') { e.preventDefault(); const last = answer.lastElementChild; if (last) last.click(); }
      else if (key === 'h') hintBtn.click();
      else if (key === 'p') peekBtn.click();
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => { document.removeEventListener('keydown', onKey); sortables.forEach(s => s.destroy()); };

    function finish() {
      cleanup(); cleanup = null;
      const offline = tracked && (!navigator.onLine || outbox.items().length > 0);
      const extraGained = locals.reduce((a, r) => a + ((r && r.extra) || 0), 0);
      const earned = results.reduce((a, b) => a + (b || 0), 0);
      const max = items.length * 3;
      const building = tracked && mode === 'build';
      const now = tracked ? lessonView(slug) : null; // the up-to-date state, worked out on the device
      const unitNow = now && now.progress.units[unitIndex];
      // Built everything: if the unit has grammar gaps they come next, and the unit is not finished until they are answered.
      const grammarNext = Boolean(building && unitNow && unitNow.grammarReady);
      const unitDone = building && !grammarNext;
      const lessonDone = building && Boolean(now && now.progress.completed);
      const nextUnit = tracked ? lesson.units[unitIndex + 1] : null;
      const nextOpen = nextUnit && now && now.progress.units[unitIndex + 1] && !now.progress.units[unitIndex + 1].locked;
      const weak = items.filter((_, i) => (results[i] || 0) < 3);
      const replayed = tracked && mode === 'review';

      const actions = h('div', { class: 'result-actions' });
      if (tracked) {
        if (grammarNext)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'grammar'), 'data-link': true }, 'Next: Grammar ✏️'));
        else if (replayed && restart && unitNow && unitNow.grammarTotal)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, unit, 'grammar') + `?restart=1${chain ? '&chain=1' : ''}`, 'data-link': true }, 'Next: Grammar ✏️'));
        else if (building && !lessonDone && nextUnit)
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
      const title = grammarNext ? 'Great memory! 🧠' : lessonDone ? 'Lesson complete!' : unitDone && multi ? `Unit ${unitIndex + 1} complete!` : pct === 1 ? 'Perfect!' : pct >= 0.7 ? 'Well done!' : 'Good effort!';
      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, lessonDone || pct === 1 ? '🏆' : pct >= 0.7 ? '🎉' : '💪'),
        h('div', { class: 'stars', 'aria-hidden': 'true' }, starNodes(Math.round(pct * 3))),
        h('h1', null, title),
        h('p', { class: 'subtitle' }, `You earned ${earned} of ${max} stars in this round.`),
        extraGained > 0 ? h('p', { class: 'extra-banner' }, `+${extraGained} extra ${extraGained === 1 ? 'star' : 'stars'} added to your score!`) : null,
        replayed && extraGained === 0 && !offline ? h('p', { class: 'muted' }, 'Your saved progress is safe. Only better results than before are added.') : null,
        grammarNext ? h('p', { class: 'muted' }, 'Now a quick grammar check: choose the missing word. ✏️') : null,
        building && !grammarNext && !lessonDone && nextUnit ? h('p', { class: 'muted' }, `Next up: Unit ${unitIndex + 2} is now open. Your progress is saved.`) : null,
        offline ? h('p', { class: 'muted' }, 'You are offline. Your progress will be saved when you reconnect.') : null,
        h('ul', { class: 'result-list' }, items.map((it, i) => h('li', null,
          h('span', null, it.en),
          h('span', { class: 's', 'aria-label': `${results[i] || 0} stars` }, starNodes(results[i] || 0))))),
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

  function runGrammar(o) {
    const { lesson, slug, items, exitPath, unit, unitIndex, replay, chain, restart } = o;
    document.title = `Grammar · ${lesson.title} · ${config.appName}`;
    if (!items.length) return navigate(exitPath, true);
    let pos = 0, round = null;
    const firstTry = [];       // for each sentence: answered right at the first choice?
    const triesLeftBehind = []; // wrong choices before the right one

    const pill = h('div', { class: 'pill' });
    const fill = h('div', { class: 'progress-fill' });
    const num = h('div', { class: 'card-num' }, 'Fill the gap');
    const sentenceEl = h('p', { class: 'card-sentence', lang: 'en' });
    const card = h('div', { class: 'learn-card gap-card' }, num, sentenceEl);
    const choices = h('div', { class: 'gap-options', role: 'group', 'aria-label': 'Choose the missing word' });
    const feedback = h('p', { class: 'feedback', role: 'status' });
    const listenBtn = h('button', { class: 'btn btn-ghost btn-big', type: 'button', hidden: true, html: ICON.sound + ' Listen' });
    const nextBtn = h('button', { class: 'btn btn-accent', type: 'button', hidden: true });

    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: exitPath, 'data-link': true, 'aria-label': 'Leave', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, unitChip(lesson, unitIndex, 'Grammar')), ' ', lesson.units.length > 1 ? unit.title : lesson.title),
        pill, soundButton()),
      h('div', { class: 'progress-track', role: 'progressbar' }, fill),
      h('p', { class: 'prompt' }, '✏️ Choose the missing word'),
      card,
      choices,
      feedback,
      h('div', { class: 'listen-row' }, listenBtn),
      h('div', { class: 'actions' }, nextBtn),
      h('p', { class: 'kbd-hint' }, '1 2 3 choose  ·  L listen  ·  Enter next') // shown on computers only
    );

    function loadRound() {
      const it = items[pos];
      const { before, after } = splitAtGap(it.en, it.gap);
      const blank = h('span', { class: 'gap-blank', 'aria-label': 'missing word' });
      round = { it, blank, mistakes: 0, done: false, startedAt: Date.now(), cid: uid() };
      sentenceEl.replaceChildren(before, blank, after);
      choices.replaceChildren(...randomOrder(it.gap.options).map((word, k) => h('button', {
        class: 'gap-opt', type: 'button', 'data-word': word, onclick: e => choose(e.currentTarget),
      }, h('span', { class: 'gap-key', 'aria-hidden': 'true' }, String(k + 1)), word)));
      feedback.textContent = ''; feedback.className = 'feedback';
      card.classList.remove('right');
      listenBtn.hidden = true; nextBtn.hidden = true;
      pill.textContent = `${pos + 1} / ${items.length}`;
      fill.style.width = `${(pos / items.length) * 100}%`;
    }

    function choose(btn) {
      if (!round || round.done || btn.disabled) return;
      const word = btn.dataset.word;
      if (word !== round.it.gap.answer) {
        round.mistakes++;
        btn.disabled = true; btn.classList.add('wrong');
        feedback.textContent = 'Not that one. Try again 💪'; feedback.className = 'feedback bad';
        sfx.wrong(); if (navigator.vibrate) navigator.vibrate(60);
        return;
      }
      // Right: show the word in the sentence, save it on the device, tell the server in the background.
      round.done = true;
      firstTry[pos] = round.mistakes === 0;
      triesLeftBehind[pos] = round.mistakes;
      round.blank.textContent = word; round.blank.classList.add('filled');
      choices.querySelectorAll('.gap-opt').forEach(b => { b.disabled = true; if (b === btn) b.classList.add('right'); });
      card.classList.add('right');
      const seconds = Math.min(600, Math.round((Date.now() - round.startedAt) / 1000));
      noteGrammar(slug, round.it.en, seconds);
      outbox.send(`/api/lessons/${slug}/grammar`, { sentence: round.it.en, mistakes: round.mistakes, seconds, cid: round.cid }).catch(e => { toast(e.message); return null; });
      fill.style.width = `${((pos + 1) / items.length) * 100}%`;
      const praise = round.mistakes === 0 ? ['Perfect! 🌟', 'Excellent! 🎉', 'Amazing! 🤩'] : ['You got it! 💪', 'Good job! 👏'];
      feedback.textContent = praise[(Math.random() * praise.length) | 0] + '  Now say it out loud 🗣️'; feedback.className = 'feedback good';
      nextBtn.innerHTML = (pos + 1 < items.length ? 'Next ' : 'Finish ') + ICON.next;
      nextBtn.hidden = false; listenBtn.hidden = !canSpeak;
      nextBtn.focus({ preventScroll: true });
      sfx.win(); confetti(30);
      if (settings.sound) later(() => speak(round.it.en), 450);
    }

    nextBtn.addEventListener('click', () => {
      clearScreenTimers(); stopSpeech();
      if (++pos < items.length) { loadRound(); window.scrollTo(0, 0); } else finish();
    });
    listenBtn.addEventListener('click', () => speak(round.it.en));

    const onKey = e => {
      if (!round || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'l' && !listenBtn.hidden) listenBtn.click();
      else if (round.done) { if (key === 'Enter' && document.activeElement !== nextBtn && !nextBtn.hidden) nextBtn.click(); }
      else if (/^[1-3]$/.test(key)) { const b = choices.children[Number(key) - 1]; if (b) b.click(); }
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);

    function finish() {
      cleanup(); cleanup = null;
      const now = lessonView(slug);
      const unitNow = now && now.progress.units[unitIndex];
      const lessonDone = Boolean(now && now.progress.completed);
      const multi = lesson.units.length > 1;
      const nextUnit = lesson.units[unitIndex + 1];
      const nextOpen = nextUnit && now && now.progress.units[unitIndex + 1] && !now.progress.units[unitIndex + 1].locked;
      const right = firstTry.filter(Boolean).length;
      const offline = !navigator.onLine || outbox.items().length > 0;

      const actions = h('div', { class: 'result-actions' });
      if (nextOpen && (replay ? chain : unitNow && unitNow.completed)) {
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
        offline ? h('p', { class: 'muted' }, 'You are offline. Your progress will be saved when you reconnect.') : null,
        h('ul', { class: 'result-list' }, items.map((it, i) => h('li', null,
          h('span', null, it.en),
          h('span', { class: 's gram', 'aria-label': firstTry[i] ? 'right first time' : `${triesLeftBehind[i] || 0} wrong choices` }, firstTry[i] ? '✓' : `${triesLeftBehind[i] || 0}✗`)))),
        actions));
      sfx.finish(); confetti(lessonDone ? 200 : 90);
      scheduleSync(1500);
    }

    loadRound();
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
