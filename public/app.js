/* WordStack - student app */
(function () {
  'use strict';

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

  const storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } },
  };

  const settings = Object.assign({ sound: true }, storage.get('ws:settings', {}));
  const saveSettings = () => storage.set('ws:settings', settings);

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

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error || `Something went wrong (${res.status}).`);
      e.status = res.status;
      if (res.status === 401 && !url.startsWith('/api/auth/') && url !== '/api/me') { me = null; saveHome(null); goLogin(); }
      if (res.status === 403 && /disabled/i.test(e.message)) { me = null; toast(e.message); goLogin(); }
      throw e;
    }
    return data;
  }

  /* ---------- Offline-safe progress saving ---------- */
  // Progress calls go through an outbox: if the network fails they are kept and sent later,
  // so a finished sentence is never lost.
  const outbox = {
    key: 'ws:outbox',
    items() { return storage.get(this.key, []); },
    save(list) { storage.set(this.key, list); },
    flushing: false,
    async send(url, body) {
      const item = { id: uid(), user: me && me.id, url, body };
      try {
        return await api('POST', url, body);
      } catch (e) {
        if (!e.status || e.status >= 500 || e.status === 429) {
          this.save([...this.items(), item]);
          return null;
        }
        throw e;
      }
    },
    async flush() {
      if (this.flushing || !me) return;
      this.flushing = true;
      try {
        for (const item of this.items()) {
          if (item.user !== me.id) continue;
          try {
            await api('POST', item.url, item.body);
          } catch (e) {
            if (!e.status || e.status >= 500 || e.status === 429 || e.status === 401) break; // try again later
          }
          this.save(this.items().filter(x => x.id !== item.id));
        }
      } finally {
        this.flushing = false;
      }
    },
  };
  window.addEventListener('online', () => outbox.flush());

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
    if (!canSpeak) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice ? voice.lang : 'en-US';
    if (voice) u.voice = voice;
    u.rate = slow ? 0.6 : 0.9;
    if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
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
    if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
    route();
  }
  function goLogin() {
    const here = location.pathname + location.search;
    if (/^\/(login|signup)/.test(location.pathname)) return;
    navigate('/login' + (here && here !== '/' ? `?next=${encodeURIComponent(here)}` : ''), true);
  }

  function route() {
    viewId++;
    if (cleanup) { cleanup(); cleanup = null; }
    stopSpeech();
    window.scrollTo(0, 0);
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/login') return showAuth('login');
    if (path === '/signup') return showAuth('signup');
    if (!me) return goLogin();
    let m;
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)$/))) return showLessonHub(m[1]);
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)\/u\/([a-z0-9]+)\/(learn|build|review)$/i))) return showLessonStep(m[1], m[2], m[3]);
    if ((m = path.match(/^\/lesson\/([a-z0-9-]+)\/(learn|build|review)$/))) return navigate(`/lesson/${m[1]}`, true);
    if (path === '/practice') return showPractice();
    if (path === '/profile') return showProfile();
    if (path !== '/') history.replaceState(null, '', '/');
    showHome();
  }
  window.addEventListener('popstate', route);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
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
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
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
        meRequest = null; // never reuse an answer that belongs to someone else
        await loadMe();
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

  const STATUS_LABEL = {
    new: 'New',
    learning: 'Learning',
    building: 'In progress',
    completed: 'Completed',
  };

  function statusText(p) {
    if (p.completed) return '✓ Completed';
    if (p.status === 'new' || p.currentUnit === null) return 'New';
    const u = p.units[p.currentUnit];
    const where = p.unitsTotal > 1 ? `Unit ${p.currentUnit + 1}/${p.unitsTotal} · ` : '';
    return where + (u.learned ? `${u.solved}/${u.total} built` : 'learning');
  }

  function unitStepText(p) {
    if (p.currentUnit === null) return 'Completed';
    const u = p.units[p.currentUnit];
    const where = p.unitsTotal > 1 ? `Unit ${p.currentUnit + 1} · ${u.title} · ` : '';
    return where + (u.learned ? `Step 2 · ${u.solved} of ${u.total} built` : 'Step 1 · learning the sentences');
  }

  // The last home screen is kept on this device. It is read once, synchronously, when the script starts, so
  // the lesson list can be drawn at once while fresh data loads. Fresh data then replaces it only if it differs.
  let homeCache = storage.get('ws:home', null);
  const saveHome = data => { homeCache = data; storage.set('ws:home', data); };

  async function showHome() {
    document.title = config.appName;
    const my = viewId;
    const cached = homeCache && me && homeCache.uid === me.id ? homeCache : null;
    if (cached) renderHome(cached.lessons, cached.stats); else showSkeleton('home');
    let lessons, stats;
    try {
      const [l, m] = await Promise.all([api('GET', '/api/lessons'), freshMe()]);
      lessons = l.lessons; stats = m.stats; me = m.user;
    } catch (e) {
      if (my === viewId && !cached && e.status !== 401) errorView(e, showHome);
      return;
    }
    const fresh = { uid: me.id, user: me, lessons, stats };
    const changed = !cached || JSON.stringify([cached.lessons, cached.stats]) !== JSON.stringify([lessons, stats]);
    saveHome(fresh);
    if (my === viewId && changed) renderHome(lessons, stats);
    outbox.flush();
  }

  function renderHome(lessons, stats) {
    const cont = lessons
      .filter(l => !l.progress.completed && l.progress.lastActivityAt)
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
      assigned.length ? h('section', { class: 'section' },
        h('h2', null, 'For you'),
        h('div', { class: 'lesson-grid' }, assigned.map(lessonCard))) : null,
      h('section', { class: 'section' },
        h('h2', null, 'All lessons'),
        lessons.length ? chips : h('p', { class: 'empty' }, 'No lessons yet. Your teacher will add some soon.'),
        grid)
    );
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
  let lessonCache = null; // { slug, lesson, progress }

  async function loadLesson(slug) {
    const data = await api('GET', `/api/lessons/${slug}`);
    lessonCache = { slug, ...data };
    return lessonCache;
  }

  const unitPath = (slug, unit, step) => `/lesson/${slug}/u/${unit.id}/${step}`;

  async function showLessonHub(slug) {
    const my = viewId;
    showSkeleton('hub');
    let data;
    try { data = await loadLesson(slug); } catch (e) { if (my === viewId && e.status !== 401) errorView(e, () => showLessonHub(slug)); return; }
    if (my !== viewId) return;
    lessonCache = null;
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
        action = up.learned
          ? h('a', { class: 'btn btn-primary btn-block btn-play', href: unitPath(slug, unit, 'build'), 'data-link': true }, '▶ ', up.solved ? 'Continue' : 'Play')
          : h('a', { class: 'btn btn-primary btn-block btn-play', href: unitPath(slug, unit, 'learn'), 'data-link': true }, '▶ ', up.status === 'learning' ? 'Continue' : 'Start');
      }
      // Any unit the student can open can be revisited: read the cards again, practise, or start it over.
      const again = !up.locked && up.status !== 'new' ? h('div', { class: 'unit-actions' },
        h('a', { class: 'btn btn-ghost btn-sm', href: unitPath(slug, unit, 'learn'), 'data-link': true, html: ICON.cards + ' Cards' }),
        up.learned ? h('a', { class: 'btn btn-ghost btn-sm', href: unitPath(slug, unit, 'review'), 'data-link': true, html: ICON.puzzle + ' Practise' }) : null,
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
                  h('span', { class: up.completed ? 'ok' : '', html: ICON.puzzle }, `Build ${up.solved}/${up.total}`),
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
        p.completed ? h('div', { class: 'hub-actions' }, h('a', { class: 'btn btn-primary btn-block', href: '/', 'data-link': true }, 'Choose another lesson')) : null)
    );
  }

  async function showLessonStep(slug, unitId, step) {
    const my = viewId;
    let data = lessonCache && lessonCache.slug === slug ? lessonCache : null;
    if (!data) {
      showSkeleton('step');
      try { data = await loadLesson(slug); }
      catch (e) { if (my === viewId && e.status !== 401) errorView(e, () => showLessonStep(slug, unitId, step)); return; }
      if (my !== viewId) return;
    }
    lessonCache = null; // refetch next time so progress is fresh
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
    const learnUrl = `/api/lessons/${slug}/units/${unit.id}/learn`;
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
    if (!canSpeak) { listen.disabled = true; slow.disabled = true; listen.title = 'Speech is not supported on this device'; }

    setView(
      h('div', { class: 'game-top' },
        h('a', { class: 'icon-btn', href: `/lesson/${slug}`, 'data-link': true, 'aria-label': 'Back to lesson', html: ICON.back }),
        h('div', { class: 'lesson-name' }, h('span', { class: 'step-chip' }, unitChip(lesson, unitIndex, 'Learn')), ' ', lesson.units.length > 1 ? unit.title : lesson.title),
        pill, soundButton()),
      h('div', { class: 'progress-track', role: 'progressbar' }, fill),
      jump,
      h('p', { class: 'prompt' }, restart ? '👀 Look and listen again' : '👀 Look and listen'),
      card,
      h('div', { class: 'listen-row' }, listen, slow),
      h('div', { class: 'actions' }, prev, next),
      restart ? h('p', { class: 'skip-row' }, h('a', { href: reviewPath, 'data-link': true }, 'Already know them? Skip to building ›')) : null
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
      card.classList.remove('flip-in'); void card.offsetWidth; card.classList.add('flip-in');
      prev.disabled = i === 0;
      next.innerHTML = i === total - 1 ? (restart || !up.learned ? 'Start building ' : 'Done ') + ICON.next : 'Next ' + ICON.next;
      next.className = 'btn ' + (i === total - 1 ? 'btn-accent' : 'btn-primary');
      prev.className = 'btn btn-ghost';
      shownAt = Date.now();
      if (autoSpeak && settings.sound) setTimeout(() => speakCard(false), 250);
    }

    const secondsOnCard = () => Math.min(120, Math.round((Date.now() - shownAt) / 1000));

    async function go(delta) {
      const secs = secondsOnCard();
      if (delta > 0 && i === total - 1) {
        next.disabled = true;
        await outbox.send(learnUrl, { index: i, done: true, seconds: secs }).catch(e => toast(e.message));
        next.disabled = false;
        sfx.finish();
        if (restart) navigate(reviewPath, true);
        else if (!up.learned) { toast('Great! Now build the sentences 🧩'); navigate(unitPath(slug, unit, 'build'), true); }
        else navigate(`/lesson/${slug}`, true);
        return;
      }
      i = Math.max(0, Math.min(total - 1, i + delta));
      reach = Math.max(reach, i);
      sfx.card();
      if (delta > 0 && !up.learned) outbox.send(learnUrl, { index: i, seconds: secs }).catch(() => {});
      render(true);
    }

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
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);

    if (up.status === 'new') outbox.send(learnUrl, { index: 0, seconds: 0 }).catch(() => {});
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
    const { lesson, slug, items, mode, exitPath, unit, unitIndex, restart, chain } = o;
    const tracked = Boolean(slug);
    const total = tracked ? unit.sentences.length : items.length;
    let doneCount = tracked && mode === 'build' ? unit.sentences.filter(s => s.stars).length : 0;
    document.title = `${mode === 'practice' ? 'Practice' : 'Build'} · ${lesson.title} · ${config.appName}`;

    const results = []; // stars per item this round
    let pos = 0, round = null, sortables = [];
    const saves = []; // every save request of this round, so the result screen waits for all of them
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
      h('div', { class: 'actions' }, prevBtn, resetBtn, hintBtn, checkHint, nextBtn)
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
      if (settings.sound && canSpeak) { const r = round; setTimeout(() => { if (round === r && !r.solved) speak(r.sentence); }, 350); }
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
      let saved = null;
      if (tracked) {
        saved = outbox.send(`/api/lessons/${slug}/solve`, { sentence: round.sentence, mistakes: round.mistakes, hints: round.hints, seconds, cid: round.cid })
          .catch(e => { toast(e.message); return null; });
        saves.push(saved);
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
      solvedPanel.classList.remove('pop'); void solvedPanel.offsetWidth; solvedPanel.classList.add('pop');
      // Practising a sentence again: a better result than before is added as extra stars.
      if (saved) {
        const thisRound = round;
        saved.then(r => {
          if (r && r.replay && r.extra > 0 && round === thisRound)
            solvedPanel.append(h('div', { class: 'extra-tag' }, `+${r.extra} extra ${r.extra === 1 ? 'star' : 'stars'} added to your score!`));
        });
      }
      const praise = s === 3 ? ['Perfect! 🌟', 'Excellent! 🎉', 'Amazing! 🤩'] : s === 2 ? ['Well done! 👏', 'Great job! 😊', 'Nice work! 👍'] : ['You got it! 💪', 'Good job, keep going! 🌈'];
      feedback.textContent = praise[(Math.random() * praise.length) | 0];
      feedback.className = 'feedback good';
      resetBtn.hidden = true; hintBtn.hidden = true; peekBtn.hidden = true; nextBtn.hidden = false; checkHint.hidden = true;
      nextBtn.innerHTML = (pos + 1 < items.length ? 'Next ' : 'Finish ') + ICON.next;
      nextBtn.focus({ preventScroll: true });
      sfx.win(); confetti(40);
      if (settings.sound) setTimeout(() => speak(round.sentence), 450);
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
      tile.classList.remove('flash'); void tile.offsetWidth; tile.classList.add('flash');
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
      peekTimer = setTimeout(() => { if (round === r && !r.solved && feedback.classList.contains('peek')) { feedback.textContent = ''; feedback.className = 'feedback'; } }, 3000);
    });
    prevBtn.addEventListener('click', () => { stopSpeech(); if (pos > 0) { pos--; loadRound(); window.scrollTo(0, 0); } });
    resetBtn.addEventListener('click', resetRound);
    hintBtn.addEventListener('click', hint);
    listenBtn.addEventListener('click', () => speak(round.sentence));
    nextBtn.addEventListener('click', () => {
      stopSpeech();
      if (++pos < items.length) { loadRound(); window.scrollTo(0, 0); } else finish();
    });

    const onKey = e => {
      if (e.key === 'Enter' && round && round.solved && document.activeElement !== nextBtn && !nextBtn.hidden) nextBtn.click();
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => { document.removeEventListener('keydown', onKey); sortables.forEach(s => s.destroy()); };

    async function finish() {
      cleanup(); cleanup = null;
      const outcomes = tracked ? await Promise.all(saves) : [];
      const offline = outcomes.some(r => r === null);
      const extraGained = outcomes.reduce((a, r) => a + ((r && r.extra) || 0), 0);
      const earned = results.reduce((a, b) => a + (b || 0), 0);
      const max = items.length * 3;
      const building = tracked && mode === 'build';
      const unitDone = building; // a build round only ends when every remaining sentence of the unit is built
      const serverDone = outcomes.some(r => r && r.completed);
      const lessonDone = building && (outcomes.length && !offline ? serverDone : unitIndex === lesson.units.length - 1);
      const nextUnit = tracked ? lesson.units[unitIndex + 1] : null;
      const nextOpen = nextUnit && o.progress && o.progress.units[unitIndex + 1] && !o.progress.units[unitIndex + 1].locked;
      const weak = items.filter((_, i) => (results[i] || 0) < 3);
      const replayed = tracked && mode === 'review';

      const actions = h('div', { class: 'result-actions' });
      if (tracked) {
        if (building && !lessonDone && nextUnit)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, nextUnit, 'learn'), 'data-link': true, html: `Next: Unit ${unitIndex + 2} · ` },
            nextUnit.title, h('span', { html: ICON.next })));
        else if (replayed && chain && nextOpen)
          actions.append(h('a', { class: 'btn btn-primary', href: unitPath(slug, nextUnit, 'learn') + '?restart=1&chain=1', 'data-link': true, html: `Next: Unit ${unitIndex + 2} · ` },
            nextUnit.title, h('span', { html: ICON.next })));
        actions.append(h('a', { class: 'btn ' + (actions.children.length ? 'btn-ghost' : 'btn-primary'), href: `/lesson/${slug}`, 'data-link': true }, 'Back to lesson'));
        if (mode === 'review' && weak.length) actions.append(h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => runPuzzle({ ...o, items: weak }) }, `Practise ${plural(weak.length, 'hard sentence')}`));
        actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true }, 'All lessons'));
      } else {
        if (weak.length) actions.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => runPuzzle({ ...o, items: weak }) }, `Practise ${plural(weak.length, 'hard sentence')}`));
        actions.append(h('button', { class: 'btn ' + (weak.length ? 'btn-ghost' : 'btn-primary'), type: 'button', onclick: () => runPuzzle(o) }, 'Play again'));
        actions.append(h('a', { class: 'btn btn-ghost', href: '/practice', 'data-link': true }, 'Edit my text'));
        actions.append(h('a', { class: 'btn btn-ghost', href: '/', 'data-link': true }, 'Back to lessons'));
      }

      const pct = earned / max;
      const multi = tracked && lesson.units.length > 1;
      const title = lessonDone ? 'Lesson complete!' : unitDone && multi ? `Unit ${unitIndex + 1} complete!` : pct === 1 ? 'Perfect!' : pct >= 0.7 ? 'Well done!' : 'Good effort!';
      setView(h('section', { class: 'results' },
        h('div', { class: 'celebration', 'aria-hidden': 'true' }, lessonDone || pct === 1 ? '🏆' : pct >= 0.7 ? '🎉' : '💪'),
        h('div', { class: 'stars', 'aria-hidden': 'true' }, starNodes(Math.round(pct * 3))),
        h('h1', null, title),
        h('p', { class: 'subtitle' }, `You earned ${earned} of ${max} stars in this round.`),
        extraGained > 0 ? h('p', { class: 'extra-banner' }, `+${extraGained} extra ${extraGained === 1 ? 'star' : 'stars'} added to your score!`) : null,
        replayed && extraGained === 0 && !offline ? h('p', { class: 'muted' }, 'Your saved progress is safe. Only better results than before are added.') : null,
        building && !lessonDone && nextUnit ? h('p', { class: 'muted' }, `Next up: Unit ${unitIndex + 2} is now open. Your progress is saved.`) : null,
        offline ? h('p', { class: 'muted' }, 'You are offline. Your progress will be saved when you reconnect.') : null,
        h('ul', { class: 'result-list' }, items.map((it, i) => h('li', null,
          h('span', null, it.en),
          h('span', { class: 's', 'aria-label': `${results[i] || 0} stars` }, starNodes(results[i] || 0))))),
        actions));
      sfx.finish(); confetti(lessonDone ? 200 : 120);
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
  async function showProfile() {
    document.title = `My profile · ${config.appName}`;
    const my = viewId;
    showSkeleton('profile');
    let data;
    try { data = await freshMe(); } catch (e) { if (my === viewId && e.status !== 401) errorView(e, showProfile); return; }
    if (my !== viewId) return;
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
      try { const r = await api('PATCH', '/api/me', { name: nameInput.value }); me = r.user; meRequest = null; saveHome(null); toast('Name saved'); }
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
      me = null; meRequest = null; saveHome(null);
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
  // /api/me is asked for once and shared: the app start and the home screen both need it.
  let meRequest = null;
  function freshMe() {
    if (!meRequest) meRequest = api('GET', '/api/me').finally(() => setTimeout(() => { meRequest = null; }, 1500));
    return meRequest;
  }

  async function loadMe() {
    try {
      me = (await freshMe()).user;
      outbox.flush();
    } catch (e) {
      // Only a real "not logged in" answer logs out. With no network we keep what we know, so the app still opens offline.
      if (e.status === 401 || e.status === 403 || !me) me = null;
    }
  }

  (async function boot() {
    const onAuth = /^\/(login|signup)$/.test(location.pathname);
    const cached = location.pathname === '/' && homeCache ? homeCache : null;
    if (cached) me = cached.user; // local data: paint the home screen right away, check the login in the background
    const cfg = api('GET', '/api/config').then(c => { config = { ...config, ...c }; }).catch(() => { /* offline: use defaults */ });
    const who = onAuth ? Promise.resolve() : loadMe();
    if (onAuth || cached) route(); // nothing to wait for
    await Promise.all([cfg, who]);
    if (onAuth) { if (!config.allowSignup && location.pathname === '/signup') route(); }
    else if (cached) { if (!me) { saveHome(null); goLogin(); } }
    else route();
  })();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
