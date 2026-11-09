/* WordStack - teacher dashboard */
(function () {
  'use strict';

  const view = document.getElementById('view');
  const tabs = document.getElementById('tabs');
  const TOKEN_KEY = 'ws:adminToken';
  const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  let levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  let dirty = false;
  let viewId = 0; // changes on every navigation, so a slow response can't draw over a newer screen

  /* ================= helpers ================= */
  // Phones and tablets from before 2020 do not have replaceChildren; this keeps every screen working on them.
  if (!Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function (...nodes) {
      while (this.firstChild) this.removeChild(this.firstChild);
      this.append(...nodes);
    };
  }

  // Runs `fn` at most once per frame, however often it is called (typing, scrolling...).
  function oncePerFrame(fn) {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fn(); });
    };
  }

  // The list of lessons uses drag-and-drop; it is torn down before that screen is replaced or drawn again.
  let activeSortable = null;
  function disposeSortable() {
    if (!activeSortable) return;
    try { activeSortable.destroy(); } catch (e) { /* already gone */ }
    activeSortable = null;
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // static icon strings only
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = Boolean(v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const REQUEST_TIMEOUT_MS = 30000;

  async function api(method, url, body, raw) {
    if (method !== 'GET') cache.clear(); // anything we change makes the remembered pages out of date
    // A request that never answers (bad signal) is cut off instead of leaving the screen waiting for ever.
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS) : 0;
    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
        signal: ctl ? ctl.signal : undefined,
      });
      if (res.status === 401 && url !== '/api/admin/login') { logout(); throw new Error('Your session expired. Please log in again.'); }
      if (raw && res.ok) return res;
      if (res.status === 204) return {};
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
      return data;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('The server took too long to answer. Please try again.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /* Pages already seen are kept in memory, so opening them again is instant. They are refreshed quietly in the
     background and redrawn only if something changed (and never while you are typing). */
  const cache = new Map();   // url -> { data, t }
  const inflight = new Map();
  function fetchFresh(url) {
    if (!inflight.has(url)) inflight.set(url, api('GET', url).then(d => { cache.set(url, { data: d, t: Date.now() }); return d; })
      .finally(() => inflight.delete(url)));
    return inflight.get(url);
  }
  function get(url) {
    const hit = cache.get(url);
    if (!hit) return fetchFresh(url);
    if (Date.now() - hit.t > 1500) {
      const my = viewId;
      fetchFresh(url).then(d => {
        const typing = document.activeElement && view.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (JSON.stringify(d) !== JSON.stringify(hit.data) && my === viewId && !dirty && !typing) route(true);
      }).catch(() => {});
    }
    return Promise.resolve(hit.data);
  }
  const warm = url => { if (token && !cache.has(url)) fetchFresh(url).catch(() => {}); };
  // Start loading the main lists early, and a student's page as soon as a finger or mouse gets near it.
  function warmMain() { warm('/api/admin/overview'); warm('/api/admin/users'); warm('/api/admin/lessons'); }
  function warmLink(e) {
    const a = e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    const m = a.getAttribute('href').match(/^#\/(students|lessons)\/([^/]+)(?:\/(progress))?$/);
    if (!m || m[2] === 'new') return;
    if (m[1] === 'students') warm(`/api/admin/users/${m[2]}`);
    else if (m[3]) warm(`/api/admin/lessons/${m[2]}/progress`);
  }
  document.addEventListener('pointerover', warmLink);
  document.addEventListener('touchstart', warmLink, { passive: true });

  async function download(url, filename) {
    try {
      const res = await api('GET', url, null, true);
      const blob = await res.blob();
      const a = h('a', { href: URL.createObjectURL(blob), download: filename });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast(e.message); }
  }

  const slugify = t => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const countWords = s => s.trim().split(/\s+/).map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean).length;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // Automatic grammar gaps (on by default; the teacher's choice is remembered on this computer).
  function autoGapsOn() { try { return localStorage.getItem('ws:admin-autogaps') !== '0'; } catch (e) { return true; } }
  // A plain sentence line gets a gap when it has a safe word (be / have / do); lines that already have a gap, or a typing mistake, are left alone.
  function withAutoGap(line) {
    const { text, ar } = GrammarCore.splitAr(line); // the Arabic after " // " is left alone
    const parsed = GrammarCore.parseLine(text);
    if (parsed.error || parsed.gap) return line;
    const withGap = GrammarCore.suggestLine(parsed.en);
    return withGap ? (ar ? `${withGap} // ${ar}` : withGap) : line;
  }
  // The same for lessons that come from an imported JSON file (sentences written as text or as { en }).
  function autoGapItems(items) {
    if (!autoGapsOn()) return items;
    const one = sn => (typeof sn === 'string' ? withAutoGap(sn)
      : sn && typeof sn === 'object' && typeof sn.en === 'string' && (sn.gap === undefined || sn.gap === null) ? { ...sn, en: withAutoGap(sn.en) } : sn);
    return items.map(l => {
      if (!l || typeof l !== 'object') return l;
      const out = { ...l };
      if (Array.isArray(l.units)) out.units = l.units.map(u => (u && Array.isArray(u.sentences) ? { ...u, sentences: u.sentences.map(one) } : u));
      if (Array.isArray(l.sentences)) out.sentences = l.sentences.map(one);
      return out;
    });
  }

  function timeAgo(d) {
    if (!d) return 'never';
    const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
    return new Date(d).toLocaleDateString();
  }
  function fmtTime(sec) {
    if (!sec) return '–';
    if (sec < 60) return `${sec}s`;
    const m = Math.round(sec / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  const STATUS = { new: 'Not started', learning: 'Learning cards', building: 'Building', completed: 'Completed' };
  const statusChip = p => h('span', { class: 'st st-' + p.status }, p.status === 'completed' ? '✓ ' + STATUS[p.status] : STATUS[p.status]);
  function progressBar(p) {
    const fill = h('span');
    fill.style.width = (p.total ? Math.round((p.solved / p.total) * 100) : 0) + '%';
    return h('span', null, h('span', { class: 'mini-bar' }, fill), `${p.solved}/${p.total}`);
  }
  const unitsCell = p => (p.unitsTotal > 1 ? `${p.unitsCompleted}/${p.unitsTotal}` : p.units[0] && p.units[0].learned ? 'cards ✓' : '–');
  function unitCell(u, multi) {
    if (u.completed) return h('span', { class: 'st st-completed' }, '✓');
    if (u.grammarReady) return h('span', { class: 'st st-building', title: 'Built everything, grammar still to do' }, `✏️ ${u.grammarDone}/${u.grammarTotal}`);
    if (u.quizReady) return h('span', { class: 'st st-building', title: 'Built everything, the quiz is still to do' }, '❓ quiz');
    if (u.learned) return h('span', { class: 'st st-building' }, `${u.solved}/${u.total}`);
    if (u.status === 'learning') return h('span', { class: 'st st-learning' }, `🃏 ${u.learnIndex + 1}/${u.total}`);
    return multi && u.locked ? '🔒' : '–';
  }
  // "⭐ 24/30" plus a small "+3 extra" when the student improved by practising again
  const starsCell = p => (p.stars ? h('span', null, `⭐ ${p.stars}/${p.maxStars}`, p.extra ? h('small', { class: 'extra', title: 'Stars gained by practising again' }, ` +${p.extra} extra`) : null) : '–');
  const avatar = name => h('span', { class: 'avatar', 'aria-hidden': 'true' }, (name || '?').trim().charAt(0).toUpperCase());
  // Shows a screen; if a skeleton is on screen the content fades in over it while the skeleton fades out.
  function setView(...nodes) {
    const kids = nodes.flat().filter(n => n !== null && n !== undefined && n !== false);
    const layer = view.querySelector(':scope > .sk-layer');
    view.removeAttribute('aria-busy');
    view.classList.remove('busy');
    if (!layer) return view.replaceChildren(...kids);
    view.replaceChildren(layer, ...kids);
    kids.forEach(k => k.classList && k.classList.add('reveal'));
    layer.classList.add('out');
    if (getComputedStyle(layer).animationName === 'none') layer.remove();
    else layer.addEventListener('animationend', () => layer.remove(), { once: true });
  }
  // First open: the skeleton from the HTML is already on screen, so there is nothing to do. Later, when a page has
  // not been seen yet, the current screen simply stays and a thin line runs along the top until the next one is ready.
  function loading() {
    if (view.querySelector(':scope > .sk-layer')) return;
    view.classList.add('busy');
  }
  const errorBox = e => setView(h('div', { class: 'state' }, h('div', { class: 'big' }, '⚠️'), h('p', null, e.message),
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: route }, 'Try again')));
  function backLink(href, text) {
    const a = h('a', { class: 'crumb', href, html: ICON_BACK });
    a.append(' ' + text);
    return a;
  }

  function describeEvent(ev) {
    const e = { ...ev, data: ev && ev.data && typeof ev.data === 'object' ? ev.data : {} };
    const L = e.lessonTitle ? `“${e.lessonTitle}”` : 'a lesson';
    switch (e.type) {
      case 'signup': return ['🆕', 'joined'];
      case 'login': return ['🔑', 'logged in'];
      case 'lesson_start': return ['▶️', `started ${L}`];
      case 'cards_done': return ['🃏', e.data.unit ? `learned the cards of “${e.data.unit}” in ${L}` : `learned the cards in ${L}`];
      case 'unit_complete': return ['🎯', `finished unit “${e.data.unit}” in ${L}`, e.data.maxStars ? `⭐ ${e.data.stars} / ${e.data.maxStars}` : ''];
      case 'sentence_solved': return [e.data.replay ? '🔁' : '✅', `${e.data.replay ? 'practised a sentence again' : 'built a sentence'} in ${L} ${'★'.repeat(e.data.stars || 0)}${e.data.extra ? ` (+${e.data.extra} extra)` : ''}`,
        `${e.data.sentence || ''} · ${plural(e.data.mistakes || 0, 'mistake')}, ${plural(e.data.hints || 0, 'hint')}${e.data.seconds ? ` · ${fmtTime(e.data.seconds)}` : ''}`];
      case 'quiz_attempt': return [e.data.passed ? '🎓' : '❓', `took ${e.data.unit ? `the quiz of unit “${e.data.unit}”` : 'the final quiz'} in ${L}: ${e.data.score}/${e.data.total} ${e.data.passed ? '✓ passed' : '✗ not passed'}`,
        `Needs ${e.data.needed}/${e.data.total}${e.data.seconds ? ` · ${fmtTime(e.data.seconds)}` : ''}`];
      case 'quiz_reset': return ['🔁', `quiz reset in ${L}: ${e.data.label || 'quiz'}`, 'The student takes it again'];
      case 'grammar_solved': return [e.data.replay ? '🔁' : '✏️', `${e.data.replay ? 'practised the grammar again' : 'chose the missing word'} in ${L}${e.data.mistakes ? ` (${plural(e.data.mistakes, 'wrong choice')})` : ''}`, e.data.sentence || ''];
      case 'restart': return ['🔄', e.data.unit ? `started unit “${e.data.unit}” over in ${L}` : `started ${L} over`, 'Saved progress was kept'];
      case 'lesson_complete': return ['🏆', `completed ${L}`, e.data.maxStars ? `⭐ ${e.data.stars} / ${e.data.maxStars}` : ''];
      default: return ['•', e.type];
    }
  }

  function feed(events, { showUser = true } = {}) {
    if (!events.length) return h('p', { class: 'muted' }, 'No activity yet.');
    return h('ul', { class: 'feed' }, events.map(e => {
      const [ico, text, small] = describeEvent(e);
      return h('li', null,
        h('span', { class: 'ico', 'aria-hidden': 'true' }, ico),
        h('div', { class: 'txt' },
          showUser ? h('a', { href: `#/students/${e.userId}` }, e.userName) : null, showUser ? ' ' : null, text,
          small ? h('small', null, small) : null),
        h('time', { datetime: e.at, title: new Date(e.at).toLocaleString() }, timeAgo(e.at)));
    }));
  }

  // A student's timeline: every step they took, grouped by day, with mistakes, hints and time spent. Filter by kind.
  const KINDS = { all: null, sentences: ['sentence_solved', 'grammar_solved', 'cards_done'], quizzes: ['quiz_attempt', 'quiz_reset'] };
  function timeline(events) {
    if (!events.length) return h('p', { class: 'muted' }, 'No activity yet.');
    const body = h('div', { class: 'timeline' });
    let kind = 'all';
    const chips = h('div', { class: 'chips-row' }, Object.entries({ all: 'Everything', sentences: 'Sentences & cards', quizzes: 'Quizzes' }).map(([k, label]) =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === kind), 'data-k': k, onclick: () => { kind = k; draw(); } }, label)));
    const draw = () => {
      chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === kind)));
      const list = events.filter(e => !KINDS[kind] || KINDS[kind].includes(e.type));
      const days = new Map();
      for (const e of list) { const k = new Date(e.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
      body.replaceChildren(...(list.length ? [...days].map(([day, evs]) => h('section', { class: 'tl-day' },
        h('h3', null, day, h('small', null, ` · ${plural(evs.length, 'step')}`)),
        h('ul', { class: 'feed' }, evs.map(e => {
          const [ico, text, small] = describeEvent(e);
          return h('li', null, h('span', { class: 'ico', 'aria-hidden': 'true' }, ico),
            h('div', { class: 'txt' }, text, small ? h('small', null, small) : null),
            h('time', { datetime: e.at, title: new Date(e.at).toLocaleString() }, new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
        })))) : [h('p', { class: 'muted' }, 'Nothing of this kind yet.')]));
    };
    draw();
    return h('div', null, chips, body);
  }

  // The quiz attempts of one student: each one opens to show every question, what the student chose and the right answer.
  // "Reset" lets the student take that quiz again (the unit or lesson is open again until they pass).
  function quizPanel(q, userId, reload) {
    const KIND = { listen: '🔊 Listen', word: '✏️ Missing word', order: '🔀 Word order' };
    const liveList = q.live.length ? h('ul', { class: 'admin-list' }, q.live.map(x => h('li', { class: 'admin-item' },
      h('div', { class: 'info' },
        h('div', { class: 'name' }, `${x.emoji || '📘'} ${x.lesson} · ${x.label}`),
        h('div', { class: 'sub' }, x.passed ? (x.credit ? '✓ Passed (finished before quizzes existed)' : '✓ Passed') : 'Taken, not passed yet')),
      h('div', { class: 'btns' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'The student takes this quiz again', onclick: async () => {
        if (!confirm(`Reset “${x.label}” in “${x.lesson}”?\n\nThe student has to pass it again before the ${x.scope === 'final' ? 'lesson' : 'unit'} counts as finished. The old attempts stay in the list.`)) return;
        try { await api('POST', `/api/admin/users/${userId}/lessons/${x.lessonId}/quiz/reset`, { scope: x.scope }); toast('Quiz reset'); reload(); } catch (e) { toast(e.message); }
      } }, '🔁 Reset quiz'))))) : h('p', { class: 'muted' }, 'No quiz taken yet.');
    const attempts = q.attempts.length ? h('div', { class: 'attempts' }, q.attempts.map(a => h('details', { class: 'attempt' + (a.passed ? ' pass' : ' fail') + (a.voided ? ' voided' : '') },
      h('summary', null,
        h('span', { class: 'sc' }, `${a.score}/${a.total}`),
        h('span', { class: 'what' }, `${a.emoji || '📘'} ${a.lesson} · ${a.label}`),
        a.voided ? h('span', { class: 'tag tag-off' }, 'reset') : null,
        h('span', { class: 'when' }, `${a.passed ? '✓ passed' : '✗ not passed'} · ${timeAgo(a.at)}${a.seconds ? ` · ${fmtTime(a.seconds)}` : ''}`)),
      h('ol', { class: 'qa-list' }, (a.details || []).map(d => {
        const picked = Number.isInteger(d.picked) && d.picked >= 0 ? d.options[d.picked] : '(no answer)';
        return h('li', { class: d.correct ? 'ok' : 'bad' },
          h('span', { class: 'mark' }, d.correct ? '✓' : '✗'),
          h('div', null,
            h('div', { class: 'qk' }, `${KIND[d.type] || d.type} · `, h('span', { lang: 'en' }, d.sentence)),
            d.correct ? h('small', null, `Chose “${picked}”`) : h('small', null, 'Chose “', h('b', null, picked), '” · right answer “', h('b', null, d.options[d.answer]), '”')));
      }))))) : null;
    return h('div', { class: 'panel' }, h('h2', null, '❓ Quizzes'), liveList, attempts ? h('h3', { class: 'sub-h' }, 'Every attempt') : null, attempts);
  }

  function barChart(days, key, label) {
    const max = Math.max(1, ...days.map(d => d[key]));
    return h('div', { class: 'bars', role: 'img', 'aria-label': label },
      days.map(d => {
        const bar = h('div', { class: 'bar' + (d[key] ? '' : ' zero'), title: `${d.day}: ${d[key]}` });
        bar.style.height = Math.max(3, Math.round((d[key] / max) * 100)) + '%';
        const dt = new Date(d.day + 'T00:00:00Z');
        return h('div', { class: 'bar-col' }, h('span', { class: 'n' }, d[key] || ''), bar,
          h('small', null, dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })));
      }));
  }

  /* ================= auth ================= */
  function logout() {
    token = null;
    cache.clear();
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    showLogin();
  }
  document.getElementById('logout').addEventListener('click', logout);

  function showLogin() {
    tabs.hidden = true;
    document.getElementById('logout').hidden = true;
    const pw = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    const form = h('form', { class: 'card form' },
      h('div', null, h('label', { for: 'password' }, 'Teacher password'), pw),
      h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Log in'), msg);
    form.addEventListener('submit', async e => {
      e.preventDefault(); msg.textContent = '';
      try {
        token = (await api('POST', '/api/admin/login', { password: pw.value })).token;
        try { localStorage.setItem(TOKEN_KEY, token); } catch (err) {}
        route();
        warmMain();
      } catch (err) { msg.textContent = err.message; }
    });
    setView(h('section', { class: 'auth' },
      h('h1', null, 'Teacher dashboard'),
      h('p', { class: 'subtitle' }, 'Manage lessons and follow your students.'), form));
    pw.focus();
  }

  /* ================= router ================= */
  const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

  function route(keepScroll) {
    viewId++;
    disposeSortable();
    if (!token) return showLogin();
    tabs.hidden = false;
    document.getElementById('logout').hidden = false;
    let parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).slice(0, 5);
    if (!parts.every(x => SAFE_SEGMENT.test(x))) parts = []; // an odd address just opens the overview
    const tab = parts[0] || 'overview';
    tabs.querySelectorAll('a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (keepScroll !== true) window.scrollTo(0, 0);
    if (tab === 'students') {
      if (parts[1] && parts[2] === 'lessons' && parts[3] === 'new') return showEditor(null, { userId: parts[1] });
      if (parts[1] && parts[2] === 'lessons' && parts[3] && parts[4] === 'edit') return showEditor(parts[3], { userId: parts[1] });
      return parts[1] ? showStudent(parts[1]) : showStudents();
    }
    if (tab === 'lessons') {
      if (parts[1] === 'new') return showEditor(null);
      if (parts[1] && parts[2] === 'edit') return showEditor(parts[1]);
      if (parts[1] && parts[2] === 'progress') return showLessonProgress(parts[1]);
      return showLessons();
    }
    showOverview();
  }
  let shownHash = location.hash; // the address of the screen on display
  window.addEventListener('hashchange', () => {
    if (location.hash === shownHash) return; // that was our own undo (below)
    if (dirty && !confirm('You have unsaved changes. Leave anyway?')) {
      location.replace(shownHash || '#/'); // stay on the screen being edited, and put its address back
      return;
    }
    dirty = false;
    shownHash = location.hash;
    route();
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ================= overview ================= */
  // "No activity for 9 days" / "Failed “Unit 1 · …” 3 times"
  const reasonText = r => (r.type === 'inactive' ? `No activity for ${plural(r.days, 'day')}` : `Failed the quiz “${r.quiz}” ${r.fails} times in “${r.lesson}”`);
  function attentionList(list) {
    return h('ul', { class: 'admin-list' }, list.map(a => h('a', { class: 'admin-item', href: `#/students/${a.userId}` },
      avatar(a.name),
      h('div', { class: 'info' }, h('div', { class: 'name' }, a.name), h('div', { class: 'sub' }, a.reasons.map(reasonText).join(' · '))))));
  }

  async function showOverview() {
    const my = viewId;
    loading('tiles');
    let d, attention = [];
    try { [d, attention] = await Promise.all([get('/api/admin/overview'), get('/api/admin/attention').then(a => a.students).catch(() => [])]); } catch (e) { return my === viewId ? errorBox(e) : undefined; }
    if (my !== viewId) return;
    const s = d.stats;
    const tile = (v, l) => h('div', { class: 'tile-stat' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'l' }, l));
    setView(
      h('div', { class: 'head-row' }, h('h1', null, 'Overview'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => download('/api/admin/export/progress.csv', 'student-progress.csv') }, '⬇️ Download progress (Excel/CSV)')),
      h('div', { class: 'tiles' },
        tile(s.users, 'Students'),
        tile(s.activeToday, 'Active today'),
        tile(s.activeWeek, 'Active this week'),
        tile(s.solvedWeek, 'Sentences built this week'),
        tile(s.completedWeek, 'Lessons completed this week'),
        tile(s.signupsWeek, 'New students this week')),
      attention.length ? h('div', { class: 'panel attention' }, h('h2', null, `⚠️ Needs attention (${attention.length})`), attentionList(attention)) : null,
      h('div', { class: 'panel' }, h('h2', null, 'Sentences built per day (last 14 days)'), barChart(d.daily, 'solved', 'Sentences built per day')),
      h('div', { class: 'panel' }, h('h2', null, 'Latest activity'), feed(d.recent))
    );
  }

  /* ================= students ================= */
  async function showStudents() {
    const my = viewId;
    loading('list');
    let users, attention = [];
    try { [users, attention] = await Promise.all([get('/api/admin/users').then(r => r.users), get('/api/admin/attention').then(a => a.students).catch(() => [])]); } catch (e) { return my === viewId ? errorBox(e) : undefined; }
    if (my !== viewId) return;
    const needs = new Map(attention.map(a => [a.userId, a]));
    let only = 'all'; // 'all' or 'attention'

    const search = h('input', { class: 'search', type: 'search', placeholder: 'Search by name or email…', 'aria-label': 'Search students' });
    const list = h('div', { class: 'admin-list' });
    const filterRow = h('div', { class: 'chips-row' },
      h('button', { class: 'chip', type: 'button', 'data-k': 'all', onclick: () => { only = 'all'; draw(); } }, `All (${users.length})`),
      h('button', { class: 'chip', type: 'button', 'data-k': 'attention', onclick: () => { only = 'attention'; draw(); } }, `⚠️ Needs attention (${attention.length})`));
    // Arabic translation on the cards: a switch for each student, and one pair of buttons for everybody
    const arCount = h('span', { class: 'ar-count' });
    const setArabic = async (u, on) => {
      try { await api('PUT', `/api/admin/users/${u.id}/arabic`, { enabled: on }); u.arabic = on; cache.delete(`/api/admin/users/${u.id}`); draw(); toast(on ? `Arabic is on for ${u.name}` : `Arabic is off for ${u.name}`); }
      catch (e) { toast(e.message); }
    };
    const setArabicAll = async on => {
      if (!users.length) return;
      if (!confirm(`${on ? 'Turn Arabic translation ON' : 'Turn Arabic translation OFF'} for all ${plural(users.length, 'student')}?`)) return;
      try { await api('PUT', '/api/admin/arabic', { enabled: on }); users.forEach(u => { u.arabic = on; cache.delete(`/api/admin/users/${u.id}`); }); draw(); toast(on ? 'Arabic is on for everyone' : 'Arabic is off for everyone'); }
      catch (e) { toast(e.message); }
    };
    const arNote = h('small', { class: 'ar-note' }, 'Students translate a sentence themselves by tapping the ع button on a card. Nothing to translate for you.');
    api('GET', '/api/admin/translate/status').then(st => {
      arNote.textContent = st.enabled
        ? `Students translate a sentence themselves by tapping the ع button on a card (service: ${st.provider === 'mymemory' ? 'MyMemory, free' : st.provider}). Nothing to translate for you.`
        : 'Translation is not set up on the server, so the ع button will say it is not available (see the README).';
    }).catch(() => {});
    const arabicBar = h('div', { class: 'ar-bar' },
      h('span', { class: 'ar-ic', 'aria-hidden': 'true' }, 'ع'), h('div', { class: 'ar-text' }, arCount, arNote), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => setArabicAll(true) }, 'Enable for all'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => setArabicAll(false) }, 'Disable for all'));
    const quizText = u => (u.quiz.attempts ? `❓ ${u.quiz.passed} passed${u.quiz.last ? ` · last ${u.quiz.last.score}/${u.quiz.last.total} ${u.quiz.last.passed ? '✓' : '✗'}` : ''}` : '❓ no quiz yet');
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      filterRow.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.k === only)));
      const arOn = users.filter(u => u.arabic).length;
      arCount.textContent = `Arabic translation on the cards: on for ${arOn} of ${plural(users.length, 'student')}`;
      const shown = users.filter(u => (only === 'all' || needs.has(u.id)) && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)));
      list.replaceChildren(...(shown.length ? shown.map(u => h('a', { class: 'admin-item', href: `#/students/${u.id}` },
        avatar(u.name),
        h('div', { class: 'info' },
          h('div', { class: 'name' }, u.name, u.disabled ? h('span', { class: 'tag tag-off' }, 'Disabled') : null,
            needs.has(u.id) ? h('span', { class: 'tag tag-warn', title: needs.get(u.id).reasons.map(reasonText).join('\n') }, '⚠️ Needs attention') : null),
          h('div', { class: 'sub' }, `${u.email} · last active ${timeAgo(u.lastActiveAt || u.lastSeenAt)}`),
          h('div', { class: 'sub' }, u.currentLesson ? `${u.currentLesson.emoji} ${u.currentLesson.title}${u.currentLesson.completed ? ' (done)' : ''} · ` : 'No lesson started · ', quizText(u))),
        h('div', { class: 'nums' },
          h('button', {
            class: 'ar-toggle' + (u.arabic ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': String(Boolean(u.arabic)),
            title: u.arabic ? 'Arabic translation is ON for this student (click to turn off)' : 'Arabic translation is OFF for this student (click to turn on)',
            onclick: e => { e.preventDefault(); e.stopPropagation(); setArabic(u, !u.arabic); },
          }, 'ع'),
          h('span', { title: 'Sentences built' }, `✅ ${u.stats.sentencesSolved}`),
          h('span', { title: 'Stars' }, `⭐ ${u.stats.stars}`),
          h('span', { title: 'Lessons completed' }, `🏆 ${u.stats.lessonsCompleted}`),
          h('span', { title: 'Time spent' }, `⏱️ ${fmtTime(u.stats.timeSpent)}`)))) :
        [h('p', { class: 'state' }, users.length ? (only === 'attention' ? 'Nobody needs attention right now. 🎉' : 'No students match your search.') : 'No students yet. Share the app link so they can sign up, or add one here.')]));
    };
    search.addEventListener('input', oncePerFrame(draw));

    // Add-student form
    const f = { name: h('input', { id: 'n-name', maxlength: '60' }), email: h('input', { id: 'n-email', type: 'email', maxlength: '254' }), pw: h('input', { id: 'n-pw', type: 'text', maxlength: '128', placeholder: 'At least 8 characters' }) };
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    const addForm = h('form', { class: 'card form', hidden: true },
      h('h2', null, 'Add a student'),
      h('div', { class: 'grid-2' },
        h('div', { class: 'field grow' }, h('label', { for: 'n-name' }, 'Name'), f.name),
        h('div', { class: 'field grow' }, h('label', { for: 'n-email' }, 'Email'), f.email)),
      h('div', null, h('label', { for: 'n-pw' }, 'Password'), f.pw,
        h('p', { class: 'muted' }, 'Give these login details to the student. They can change the password later in their profile.')),
      msg,
      h('div', { class: 'toolbar' }, h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { addForm.hidden = true; } }, 'Cancel'),
        h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add student')));
    addForm.addEventListener('submit', async e => {
      e.preventDefault(); msg.textContent = '';
      try {
        await api('POST', '/api/admin/users', { name: f.name.value, email: f.email.value, password: f.pw.value });
        toast('Student added');
        showStudents();
      } catch (err) { msg.textContent = err.message; }
    });

    setView(
      h('div', { class: 'head-row' }, h('h1', null, `Students (${users.length})`),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => download('/api/admin/export/progress.csv', 'student-progress.csv') }, '⬇️ Download progress'),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { addForm.hidden = false; f.name.focus(); } }, '+ Add student'))),
      addForm,
      h('div', { class: 'section' }, search),
      arabicBar,
      h('div', { class: 'section' }, filterRow),
      h('div', { class: 'section' }, list)
    );
    draw();
  }

  async function showStudent(id) {
    const my = viewId;
    loading('tiles');
    let d, quiz = { attempts: [], live: [] };
    try { [d, quiz] = await Promise.all([get(`/api/admin/users/${id}`), fetchFresh(`/api/admin/users/${id}/quiz`).catch(() => quiz)]); } catch (e) { return my === viewId ? errorBox(e) : undefined; }
    if (my !== viewId) return;
    const u = d.user, s = d.stats;
    const tile = (v, l) => h('div', { class: 'tile-stat' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'l' }, l));

    // Lesson progress table: lessons the student can see, or has worked on
    const rows = d.lessons.filter(l => l.visibleToUser || l.progress.status !== 'new');
    const table = rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
      h('thead', null, h('tr', null, ...['Lesson', 'Status', 'Units done', 'Built', 'Stars', 'Time', 'Last activity'].map(t => h('th', null, t)))),
      h('tbody', null, rows.map(l => h('tr', null,
        h('td', null, `${l.emoji} `, h('a', { href: `#/lessons/${l.id}/progress` }, l.title), l.visibility === 'assigned' ? h('span', { class: 'tag tag-private' }, '🔒') : null),
        h('td', null, statusChip(l.progress)),
        h('td', null, unitsCell(l.progress)),
        h('td', null, progressBar(l.progress)),
        h('td', null, starsCell(l.progress)),
        h('td', null, fmtTime(l.progress.timeSpent)),
        h('td', null, timeAgo(l.progress.lastActivityAt))))))) : h('p', { class: 'muted' }, 'No lessons available.');

    // Private lessons: made for this student only, managed right here on the student's card.
    const first = u.name.split(/\s+/)[0];
    const mine = d.lessons.filter(l => l.visibility === 'assigned' && l.assignedToUser);
    const others = d.lessons.filter(l => l.visibility === 'assigned' && !l.assignedToUser);
    const mineList = mine.length ? h('ul', { class: 'admin-list' }, mine.map(l => h('li', { class: 'admin-item' + (l.published ? '' : ' draft') },
      h('span', { class: 'emoji' }, l.emoji || '📘'),
      h('div', { class: 'info' },
        h('div', { class: 'name' }, l.title,
          !l.published ? h('span', { class: 'tag tag-draft' }, 'Draft') : null,
          l.assignedCount > 1 ? h('span', { class: 'tag tag-private' }, `shared with ${l.assignedCount - 1} more`) : null),
        h('div', { class: 'sub' }, `${l.level} · ${plural(l.unitsCount || 1, 'unit')} · ${plural(l.count, 'sentence')} · `, statusChip(l.progress), ` ${l.progress.solved}/${l.progress.total} built`)),
      h('div', { class: 'btns' },
        h('a', { class: 'btn btn-ghost btn-sm', href: `#/students/${id}/lessons/${l.id}/edit` }, 'Edit'),
        h('a', { class: 'btn btn-ghost btn-sm', href: `#/lessons/${l.id}/progress` }, '📈'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: `Take this lesson away from ${first}. Their progress is kept.`, onclick: async () => {
          if (!confirm(`Remove “${l.title}” from ${u.name}? They will no longer see it. Their progress is kept.${l.assignedCount <= 1 ? '\n\nNobody else has this lesson, so it stays in your Lessons list.' : ''}`)) return;
          try { await api('DELETE', `/api/admin/users/${id}/assignments/${l.id}`); toast('Removed'); showStudent(id); } catch (e) { toast(e.message); }
        } }, 'Remove'),
        l.assignedCount <= 1 ? h('button', { class: 'btn btn-danger btn-sm', type: 'button', 'aria-label': 'Delete lesson', title: 'Delete this lesson and its progress', onclick: async () => {
          if (!confirm(`Delete “${l.title}” completely? ${u.name}'s progress in it will be deleted too.`)) return;
          try { await api('DELETE', `/api/admin/lessons/${l.id}`); toast('Lesson deleted'); showStudent(id); } catch (e) { toast(e.message); }
        } }, '🗑️') : null)))) : h('p', { class: 'muted' }, `No private lessons for ${first} yet. Click “New lesson for ${first}” and type or paste the sentences.`);

    const importIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    importIn.addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        const items = Array.isArray(json) ? json : json.lessons || (json.title ? [json] : null);
        if (!items) throw new Error('This file does not contain lessons.');
        if (!confirm(`Add ${plural(items.length, 'lesson')} for ${u.name} only?`)) return;
        const r = await api('POST', '/api/admin/import', { lessons: autoGapItems(items), assignTo: id });
        toast(`Added ${plural(r.created, 'lesson')} for ${first}`);
        showStudent(id);
      } catch (err) { toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message); }
    });

    const otherBoxes = others.map(l => h('label', { class: 'pick' },
      h('input', { type: 'checkbox', value: l.id }),
      h('span', null, `${l.emoji} ${l.title} `, h('small', null, `${l.level}${l.published ? '' : ' · draft'} · ${plural(l.assignedCount, 'student')}`))));
    const giveExisting = others.length ? h('details', { class: 'give-existing' },
      h('summary', null, `Give ${first} a private lesson you already made (${others.length})`),
      h('div', { class: 'pick-list' }, otherBoxes),
      h('div', { class: 'toolbar section' }, h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: async () => {
          const add = otherBoxes.map(b => b.querySelector('input')).filter(x => x.checked).map(x => x.value);
          if (!add.length) return toast('Tick at least one lesson.');
          try { await api('PUT', `/api/admin/users/${id}/assignments`, { lessonIds: [...mine.map(l => l.id), ...add] }); toast('Saved'); showStudent(id); } catch (e) { toast(e.message); }
        } }, 'Give to ' + first))) : null;

    const assignPanel = h('div', { class: 'panel' },
      h('div', { class: 'head-row' }, h('h2', null, `🔒 Private lessons for ${first}`),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => importIn.click() }, 'Import JSON'),
          h('a', { class: 'btn btn-primary btn-sm', href: `#/students/${id}/lessons/new` }, `+ New lesson for ${first}`), importIn)),
      h('p', { class: 'muted' }, `Only ${first} can see these lessons. Other students never do, and you don't have to publish anything first.`),
      mineList, giveExisting);

    // Account actions
    const nameIn = h('input', { id: 'e-name', value: u.name, maxlength: '60' });
    const emailIn = h('input', { id: 'e-email', type: 'email', value: u.email, maxlength: '254' });
    const msg = h('p', { class: 'form-msg', role: 'alert' });
    const editForm = h('form', { class: 'form', hidden: true },
      h('div', { class: 'grid-2' },
        h('div', { class: 'field grow' }, h('label', { for: 'e-name' }, 'Name'), nameIn),
        h('div', { class: 'field grow' }, h('label', { for: 'e-email' }, 'Email'), emailIn)),
      msg,
      h('div', { class: 'toolbar' }, h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { editForm.hidden = true; } }, 'Cancel'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Save')));
    editForm.addEventListener('submit', async e => {
      e.preventDefault(); msg.textContent = '';
      try { await api('PATCH', `/api/admin/users/${id}`, { name: nameIn.value, email: emailIn.value }); toast('Saved'); showStudent(id); }
      catch (err) { msg.textContent = err.message; }
    });

    const actions = h('div', { class: 'toolbar' },
      h('button', {
        class: 'btn btn-sm ' + (u.arabic ? 'btn-primary' : 'btn-ghost'), type: 'button', role: 'switch', 'aria-checked': String(Boolean(u.arabic)),
        title: 'Lets this student flip the cards to see the Arabic translation',
        onclick: async () => {
          try { await api('PUT', `/api/admin/users/${id}/arabic`, { enabled: !u.arabic }); cache.delete('/api/admin/users'); cache.delete(`/api/admin/users/${id}`); toast(u.arabic ? 'Arabic turned off' : 'Arabic turned on'); showStudent(id); }
          catch (e) { toast(e.message); }
        },
      }, `ع Arabic on the cards: ${u.arabic ? 'ON' : 'OFF'}`),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { editForm.hidden = !editForm.hidden; } }, '✏️ Edit details'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
        const pw = prompt(`New password for ${u.name} (at least 8 characters):`);
        if (pw === null) return;
        try { await api('PATCH', `/api/admin/users/${id}`, { password: pw }); toast('Password changed. Tell the student the new password.'); } catch (e) { toast(e.message); }
      } }, '🔑 Reset password'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
        if (!u.disabled && !confirm(`Disable ${u.name}? They will not be able to log in. Their progress is kept.`)) return;
        try { await api('PATCH', `/api/admin/users/${id}`, { disabled: !u.disabled }); toast(u.disabled ? 'Account enabled' : 'Account disabled'); showStudent(id); } catch (e) { toast(e.message); }
      } }, u.disabled ? '✅ Enable account' : '⛔ Disable account'),
      h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => {
        if (!confirm(`Delete ${u.name} and ALL their progress? This cannot be undone.`)) return;
        try { await api('DELETE', `/api/admin/users/${id}`); toast('Student deleted'); location.hash = '#/students'; } catch (e) { toast(e.message); }
      } }, '🗑️ Delete'));

    setView(
      backLink('#/students', 'All students'),
      h('div', { class: 'user-head' }, avatar(u.name),
        h('div', { class: 'who' },
          h('h1', null, u.name, u.disabled ? h('span', { class: 'tag tag-off' }, 'Disabled') : null),
          h('div', { class: 'muted' }, `${u.email} · joined ${new Date(u.createdAt).toLocaleDateString()} · last seen ${timeAgo(u.lastSeenAt)}`))),
      h('div', { class: 'section' }, actions),
      editForm,
      // Two columns on a computer: the student's numbers and lessons on the left, the quizzes and the timeline on the right.
      h('div', { class: 'cols section' },
      h('div', { class: 'col' },
      h('div', { class: 'tiles' },
        tile(s.sentencesSolved, 'Sentences built'),
        tile(`⭐ ${s.stars}`, 'Stars'),
        tile(`+${s.extraStars || 0}`, 'Extra stars (retries)'),
        tile(s.lessonsCompleted, 'Lessons completed'),
        tile(s.lessonsStarted, 'Lessons started'),
        tile(fmtTime(s.timeSpent), 'Learning time'),
        tile(`🔥 ${s.streak}`, 'Day streak')),
      h('div', { class: 'panel' }, h('h2', null, 'All lessons this student can see'), table),
      assignPanel,
      h('div', { class: 'panel' }, h('h2', null, 'Sentences practised per day (last 14 days)'), barChart(d.daily, 'solved', 'Sentences practised per day'))),
      h('div', { class: 'col' },
      quizPanel(quiz, id, () => showStudent(id)),
      h('div', { class: 'panel' }, h('h2', null, 'Timeline'), h('p', { class: 'muted' }, 'Every step this student took, with mistakes, hints and the time it took.'), timeline(d.events))))
    );
  }

  /* ================= lessons ================= */
  async function showLessons() {
    const my = viewId;
    loading('list');
    let lessons;
    try { const d = await get('/api/admin/lessons'); lessons = d.lessons; levels = d.levels || levels; } catch (e) { return my === viewId ? errorBox(e) : undefined; }
    if (my !== viewId) return;

    const list = h('ul', { class: 'admin-list' }, lessons.map(l => {
      const copy = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async e => {
        e.preventDefault();
        const url = `${location.origin}/lesson/${l.slug}`;
        try { await navigator.clipboard.writeText(url); toast('Link copied: ' + url); } catch (err) { prompt('Copy this link:', url); }
      } }, 'Copy link');
      return h('li', { class: 'admin-item' + (l.published ? '' : ' draft'), 'data-id': l.id },
        h('span', { class: 'handle', title: 'Drag to reorder', 'aria-hidden': 'true' }, '☰'),
        h('span', { class: 'emoji' }, l.emoji || '📘'),
        h('div', { class: 'info' },
          h('div', { class: 'name' }, l.title,
            !l.published ? h('span', { class: 'tag tag-draft' }, 'Draft') : null,
            l.visibility === 'assigned' ? h('span', { class: 'tag tag-private' }, `🔒 ${l.assignedCount ? (l.assignedNames || []).join(', ') + (l.assignedCount > (l.assignedNames || []).length ? ` +${l.assignedCount - l.assignedNames.length}` : '') : 'nobody yet'}`) : null),
          h('div', { class: 'sub' }, `${l.level} · ${plural(l.unitsCount || 1, 'unit')} · ${plural(l.count, 'sentence')} · ▶️ ${l.startedCount} started · 🏆 ${l.completedCount} completed`)),
        h('div', { class: 'btns' },
          h('a', { class: 'btn btn-ghost btn-sm', href: `#/lessons/${l.id}/progress` }, '📈 Progress'),
          h('a', { class: 'btn btn-ghost btn-sm', href: `#/lessons/${l.id}/edit` }, 'Edit'),
          copy));
    }));

    disposeSortable();
    if (window.Sortable) activeSortable = Sortable.create(list, {
      handle: '.handle', animation: 150, forceFallback: true,
      onEnd: async () => {
        const ids = [...list.children].map(li => li.dataset.id);
        try { await api('POST', '/api/admin/reorder', { ids }); toast('Order saved'); } catch (e) { toast(e.message); showLessons(); }
      },
    });

    const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileIn.addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        const items = Array.isArray(json) ? json : json.lessons || (json.title ? [json] : null);
        if (!items) throw new Error('This file does not contain lessons.');
        if (!confirm(`Import ${plural(items.length, 'lesson')}? Lessons with the same link name will be updated (student progress is kept).`)) return;
        const r = await api('POST', '/api/admin/import', { lessons: autoGapItems(items) });
        toast(`Imported: ${r.created} new, ${r.updated} updated`);
        showLessons();
      } catch (err) { toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message); }
    });

    setView(
      h('div', { class: 'head-row' }, h('h1', null, `Lessons (${lessons.length})`),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => fileIn.click() }, 'Import JSON'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => download('/api/admin/export', `lessons-${new Date().toISOString().slice(0, 10)}.json`) }, 'Export all'),
          h('a', { class: 'btn btn-primary btn-sm', href: '#/lessons/new' }, '+ New lesson'), fileIn)),
      h('p', { class: 'muted' }, 'Drag ☰ to change the order. Drafts are hidden from students. 🔒 lessons are only for selected students.'),
      lessons.length ? list : h('p', { class: 'state' }, 'No lessons yet. Click “New lesson” to create one.')
    );
  }

  // ctx = { userId }: editing from a student's card. The lesson stays private to that student.
  async function showEditor(id, ctx) {
    const my = viewId;
    loading('list');
    const home = ctx ? `#/students/${ctx.userId}` : '#/lessons';
    let lesson = { title: '', emoji: '📘', slug: '', level: 'A1', description: '', sentences: [], published: true, visibility: ctx ? 'assigned' : 'public', assignedUserIds: [] };
    let users = [];
    try {
      const [l, u] = await Promise.all([id ? api('GET', `/api/admin/lessons/${id}`) : null, get('/api/admin/users')]);
      if (l) lesson = l.lesson;
      users = u.users;
    } catch (e) { return my === viewId ? errorBox(e) : undefined; }
    if (my !== viewId) return;
    const owner = ctx ? users.find(x => x.id === ctx.userId) : null;
    if (ctx && !owner) return errorBox(new Error('Student not found.'));
    let slugTouched = Boolean(id);

    const f = {
      title: h('input', { id: 'f-title', maxlength: '80', value: lesson.title, placeholder: 'e.g. At the Restaurant' }),
      emoji: h('input', { id: 'f-emoji', maxlength: '8', value: lesson.emoji, placeholder: '📘' }),
      slug: h('input', { id: 'f-slug', maxlength: '60', value: lesson.slug, placeholder: 'at-the-restaurant', autocapitalize: 'off', spellcheck: 'false' }),
      level: h('select', { id: 'f-level' }, levels.map(lv => h('option', { value: lv }, lv))),
      desc: h('input', { id: 'f-desc', maxlength: '200', value: lesson.description, placeholder: 'Order food and ask for the bill.' }),
      published: h('input', { id: 'f-published', type: 'checkbox', checked: lesson.published }),
      visPublic: h('input', { type: 'radio', name: 'vis', value: 'public', checked: lesson.visibility !== 'assigned' }),
      visAssigned: h('input', { type: 'radio', name: 'vis', value: 'assigned', checked: lesson.visibility === 'assigned' }),
    };
    f.level.value = lesson.level;
    const check = h('div', { class: 'check' });
    const msg = h('p', { class: 'form-msg', role: 'alert' });

    // student picker
    const selected = new Set(lesson.assignedUserIds || []);
    const pickSearch = h('input', { class: 'search', type: 'search', placeholder: 'Search students…', 'aria-label': 'Search students' });
    const pickList = h('div', { class: 'pick-list' });
    const pickCount = h('span');
    const drawPicks = () => {
      const q = pickSearch.value.trim().toLowerCase();
      const shown = users.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.includes(q));
      pickList.replaceChildren(...(shown.length ? shown.map(u => {
        const cb = h('input', { type: 'checkbox', checked: selected.has(u.id), onchange: e => { if (e.target.checked) selected.add(u.id); else selected.delete(u.id); dirty = true; pickCount.textContent = `${selected.size} selected`; } });
        return h('label', { class: 'pick' }, cb, h('span', null, u.name, ' ', h('small', null, u.email)));
      }) : [h('p', { class: 'muted' }, users.length ? 'No students match.' : 'No students yet.')]));
      pickCount.textContent = `${selected.size} selected`;
    };
    pickSearch.addEventListener('input', oncePerFrame(drawPicks));
    const picker = h('div', { class: 'picker' }, pickSearch, pickList,
      h('div', { class: 'picker-foot' }, pickCount,
        h('span', { class: 'toolbar' },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { users.forEach(u => selected.add(u.id)); dirty = true; drawPicks(); } }, 'Select all'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { selected.clear(); dirty = true; drawPicks(); } }, 'Clear'))));
    const syncVis = () => { picker.hidden = !f.visAssigned.checked; };
    [f.visPublic, f.visAssigned].forEach(r => r.addEventListener('change', () => { dirty = true; syncVis(); }));
    drawPicks(); syncVis();

    // ---- Units editor ----
    const lines = text => text.split('\n').map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
    const units = (lesson.units && lesson.units.length ? lesson.units : [{ id: null, title: 'Unit 1', sentences: [] }])
      .map(u => ({ id: u.id || null, title: u.title, text: (u.sentences || []).map(x => GrammarCore.toLine(x)).join('\n') }));
    const unitsBox = h('div', { class: 'units-editor' });
    const scheduleCheck = oncePerFrame(() => checkSentences()); // re-checking every line on every key press would be wasteful

    function moveUnit(i, d) {
      const j = i + d;
      if (j < 0 || j >= units.length) return;
      [units[i], units[j]] = [units[j], units[i]];
      dirty = true;
      drawUnits();
    }
    function removeUnit(i) {
      if (units.length === 1) return;
      if (lines(units[i].text).length && !confirm(`Remove “${units[i].title || 'Unit ' + (i + 1)}” and its sentences?`)) return;
      units.splice(i, 1);
      dirty = true;
      drawUnits();
    }
    function drawUnits() {
      unitsBox.replaceChildren(...units.map((u, i) => {
        const title = h('input', { class: 'unit-title-input', value: u.title, maxlength: '60', placeholder: `e.g. At the airport`, 'aria-label': `Unit ${i + 1} title`,
          oninput: e => { u.title = e.target.value; dirty = true; } });
        const ta = h('textarea', { rows: '6', spellcheck: 'true', 'aria-label': `Unit ${i + 1} sentences`,
          placeholder: 'One sentence per line, for example:\nWhere is the check-in desk?\nCan I see your passport, please?',
          oninput: e => { u.text = e.target.value; dirty = true; msg.textContent = ''; scheduleCheck(); } });
        ta.value = u.text;
        u.ta = ta;
        u.check = h('div', { class: 'check' });
        return h('div', { class: 'unit-edit' },
          h('div', { class: 'unit-edit-head' },
            h('span', { class: 'unit-no' }, `Unit ${i + 1}`),
            title,
            h('button', { class: 'icon-btn', type: 'button', title: 'Move up', 'aria-label': 'Move unit up', disabled: i === 0, onclick: () => moveUnit(i, -1) }, '↑'),
            h('button', { class: 'icon-btn', type: 'button', title: 'Move down', 'aria-label': 'Move unit down', disabled: i === units.length - 1, onclick: () => moveUnit(i, 1) }, '↓'),
            h('button', { class: 'icon-btn', type: 'button', title: 'Remove unit', 'aria-label': 'Remove unit', disabled: units.length === 1, onclick: () => removeUnit(i) }, '✕')),
          ta, u.check);
      }));
      checkSentences();
    }

    function checkSentences() {
      const seen = new Map();
      let total = 0, bad = 0, firstBad = null;
      units.forEach((u, ui) => {
        const ls = lines(u.text);
        const problems = [];
        if (!ls.length) problems.push('Add at least one sentence.');
        ls.forEach((line, i) => {
          const parsed = GrammarCore.parseLine(GrammarCore.splitAr(line).text); // a line may carry a grammar gap (She [is|are|am] reading) and an Arabic part after //
          if (parsed.error) { problems.push(`Line ${i + 1}: ${parsed.error}`); return; }
          const x = parsed.en;
          const n = countWords(x);
          if (!/\p{Script=Latin}/u.test(x)) problems.push(`Line ${i + 1}: needs English words.`);
          else if (n < 2) problems.push(`Line ${i + 1}: needs at least 2 words.`);
          else if (n > 20) problems.push(`Line ${i + 1}: ${n} words (max 20).`);
          else if (x.length > 200) problems.push(`Line ${i + 1}: too long (max 200 characters).`);
          else if (seen.has(x)) problems.push(`Line ${i + 1}: already used in ${seen.get(x)}.`);
          seen.set(x, `Unit ${ui + 1}`);
        });
        total += ls.length;
        if (problems.length) { bad++; if (!firstBad) firstBad = u; }
        if (u.check) {
          u.check.replaceChildren(h('span', { class: problems.length ? '' : 'ok' }, `${plural(ls.length, 'sentence')}${problems.length ? '' : ' ✓'}`));
          if (problems.length) u.check.append(h('ul', null, problems.slice(0, 6).map(p => h('li', null, p)), problems.length > 6 ? h('li', null, `…and ${problems.length - 6} more`) : null));
        }
      });
      const tooMany = total > 200 || units.length > 30;
      check.replaceChildren(h('span', { class: bad || tooMany ? '' : 'ok' },
        `${plural(units.length, 'unit')} · ${plural(total, 'sentence')} in total${bad || tooMany ? '' : ' ✓'}`));
      if (tooMany) check.append(h('ul', null, h('li', null, 'Maximum 30 units and 200 sentences per lesson.')));
      checkSentences.firstBad = firstBad;
      return !bad && !tooMany;
    }

    const addUnitBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
      units.push({ id: null, title: `Unit ${units.length + 1}`, text: '' });
      dirty = true;
      drawUnits();
      const last = units[units.length - 1];
      last.ta.focus();
    } }, '+ Add unit');
    drawUnits();

    // Grammar step: put a gap into every sentence that has a safe word (be / have / do), or take all gaps away again.
    const mapLines = fn => {
      units.forEach(u => {
        u.text = u.text.split('\n').map(line => (line.trim() ? fn(line.trim()) : line)).join('\n');
        if (u.ta) u.ta.value = u.text;
      });
      dirty = true;
      msg.textContent = '';
      checkSentences();
    };
    // Grammar is part of every unit: when the lesson is saved, every sentence without a gap that has a safe word
    // (am/is/are, was/were, have/has, do/does) gets one automatically. The teacher can turn this off.
    const autoGaps = h('input', { id: 'f-autogaps', type: 'checkbox', checked: autoGapsOn() });
    autoGaps.addEventListener('change', () => { try { localStorage.setItem('ws:admin-autogaps', autoGaps.checked ? '1' : '0'); } catch (e) { /* ignore */ } });
    const suggestBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
      let added = 0, total = 0;
      mapLines(line => {
        total++;
        const { text, ar } = GrammarCore.splitAr(line);
        const parsed = GrammarCore.parseLine(text);
        if (parsed.error || parsed.gap) return line; // leave lines that already have a gap (or a mistake) alone
        const suggestion = GrammarCore.suggestLine(parsed.en);
        if (!suggestion) return line;
        added++;
        return ar ? `${suggestion} // ${ar}` : suggestion;
      });
      toast(added ? `Added a gap to ${added} of ${total} sentences. Check them, then save the lesson.` : 'No safe gaps found. Write your own, like [is|are|am].');
    } }, '✨ Suggest grammar gaps');
    const clearGapsBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
      mapLines(line => { const { text, ar } = GrammarCore.splitAr(line); const parsed = GrammarCore.parseLine(text); return parsed.error ? line : (ar ? `${parsed.en} // ${ar}` : parsed.en); });
      autoGaps.checked = false; autoGaps.dispatchEvent(new Event('change'));
      toast('All grammar gaps removed, and automatic gaps are switched off for saving.');
    } }, 'Remove all gaps');

    f.title.addEventListener('input', () => { dirty = true; if (!slugTouched) f.slug.value = slugify(f.title.value); });
    f.slug.addEventListener('input', () => { dirty = true; slugTouched = true; });
    f.slug.addEventListener('blur', () => { f.slug.value = slugify(f.slug.value); });
    [f.emoji, f.desc, f.level, f.published].forEach(x => x.addEventListener('input', () => { dirty = true; }));

    const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save lesson');
    const form = h('form', { class: 'card form', novalidate: true },
      h('div', { class: 'grid-2' },
        h('div', { class: 'field grow' }, h('label', { for: 'f-title' }, 'Title'), f.title),
        h('div', { class: 'field emoji-field' }, h('label', { for: 'f-emoji' }, 'Icon'), f.emoji)),
      h('div', { class: 'grid-2' },
        ctx ? null : h('div', { class: 'field grow' }, h('label', { for: 'f-slug' }, 'Link name'), h('div', { class: 'slug-wrap' }, h('span', null, '/lesson/'), f.slug)),
        h('div', { class: 'field' }, h('label', { for: 'f-level' }, 'Level'), f.level)),
      h('div', null, h('label', { for: 'f-desc' }, 'Short description ', h('span', { class: 'muted' }, '(optional)')), f.desc),
      h('div', null,
        h('label', null, 'Units and sentences'),
        h('p', { class: 'muted help' }, 'Split the lesson into small units (5 to 10 sentences each). Students learn and build one unit at a time. Each unit opens when the previous one is finished. Write one sentence per line, 2 to 20 words each.'),
        h('p', { class: 'muted help' }, 'Grammar step: after building, students choose the missing word, and then the unit ends. To choose the gap yourself, write one word of a sentence between brackets, like  She [is|are|am] reading.  The first word is the right answer; the other two are the wrong choices the student sees. Writing just [is] fills in the wrong choices for am/is/are, was/were, have/has and do/does. Sentences without brackets get a gap automatically when you save, if they contain one of those words (see the switch below).'),
        h('p', { class: 'muted help' }, 'Arabic: you do not need to translate anything. When a student you switched Arabic on for taps the Arabic button on a card, that one sentence is translated automatically and remembered. To use your own wording, write it after // on the same line, like  She is reading a book // هي تقرأ كتاباً.'),
        h('div', { class: 'toolbar' }, suggestBtn, clearGapsBtn),
        h('label', { class: 'switch' }, autoGaps, h('span', null, 'Add grammar gaps automatically when I save')),
        unitsBox,
        h('div', { class: 'toolbar' }, addUnitBtn, h('span', { class: 'spacer' }), check),
        id ? h('p', { class: 'muted' }, 'Tip: renaming or moving units keeps student progress. Changing a sentence’s text means students build that sentence again.') : null),
      ctx
        ? h('div', { class: 'private-note' }, `🔒 Private lesson: only ${owner.name} will see it.`)
        : h('div', null, h('label', null, 'Who can see this lesson?'),
            h('div', { class: 'radios' },
              h('label', { class: 'radio' }, f.visPublic, h('span', null, '🌍 All students')),
              h('label', { class: 'radio' }, f.visAssigned, h('span', null, '🔒 Only selected students'))),
            picker),
      h('label', { class: 'switch' }, f.published, h('span', null, ctx ? `Visible to ${owner.name} (untick to keep it as a hidden draft)` : 'Published (untick to keep it as a hidden draft)')),
      msg,
      h('div', { class: 'toolbar' },
        id ? h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: async () => {
          if (!confirm(`Delete “${f.title.value}”? All student progress for this lesson will be deleted too.`)) return;
          try { await api('DELETE', `/api/admin/lessons/${id}`); dirty = false; toast('Lesson deleted'); location.hash = home; } catch (e) { msg.textContent = e.message; }
        } }, 'Delete') : null,
        h('span', { class: 'spacer' }),
        h('a', { class: 'btn btn-ghost', href: home }, 'Cancel'),
        saveBtn));

    form.addEventListener('submit', async e => {
      e.preventDefault(); msg.textContent = '';
      if (!f.title.value.trim()) { msg.textContent = 'Please add a title.'; f.title.focus(); return; }
      if (!checkSentences()) { msg.textContent = 'Please fix the units above.'; if (checkSentences.firstBad) checkSentences.firstBad.ta.focus(); return; }
      const assigned = ctx ? true : f.visAssigned.checked;
      if (!ctx && assigned && !selected.size && !confirm('No students are selected, so nobody will see this lesson. Save anyway?')) return;
      const body = {
        title: f.title.value, emoji: f.emoji.value, slug: ctx && id ? lesson.slug : slugify(f.slug.value || f.title.value), level: f.level.value,
        description: f.desc.value, published: f.published.checked,
        units: units.map((u, i) => ({ ...(u.id ? { id: u.id } : {}), title: u.title.trim() || `Unit ${i + 1}`, sentences: lines(u.text).map(en => ({ en: autoGaps.checked ? withAutoGap(en) : en })) })),
        visibility: assigned ? 'assigned' : 'public',
        // From a student's card: new lessons go to that student; edits keep whoever already has it.
        ...(ctx ? (id ? {} : { assignedUserIds: [ctx.userId] }) : assigned ? { assignedUserIds: [...selected] } : {}),
      };
      saveBtn.disabled = true;
      try {
        if (id) await api('PUT', `/api/admin/lessons/${id}`, body);
        else if (ctx) await api('POST', `/api/admin/users/${ctx.userId}/lessons`, body);
        else await api('POST', '/api/admin/lessons', body);
        dirty = false;
        toast(ctx ? `Lesson saved for ${owner.name}` : 'Lesson saved');
        location.hash = home;
      } catch (err) { msg.textContent = err.message; }
      finally { saveBtn.disabled = false; }
    });

    dirty = false;
    setView(backLink(home, ctx ? `Back to ${owner.name}` : 'All lessons'),
      h('h1', null, ctx ? (id ? `Edit lesson for ${owner.name}` : `New lesson for ${owner.name}`) : (id ? 'Edit lesson' : 'New lesson')), form);
    f.title.focus();
  }

  async function showLessonProgress(id) {
    const my = viewId;
    loading('tiles');
    let d, hard = [];
    try { [d, hard] = await Promise.all([get(`/api/admin/lessons/${id}/progress`), fetchFresh(`/api/admin/lessons/${id}/hard`).then(r => r.sentences).catch(() => [])]); } catch (e) { return my === viewId ? errorBox(e) : undefined; }
    if (my !== viewId) return;
    const l = d.lesson;
    const st = d.students;
    const count = k => st.filter(x => x.progress.status === k).length;
    const tile = (v, lab) => h('div', { class: 'tile-stat' }, h('div', { class: 'v' }, String(v)), h('div', { class: 'l' }, lab));
    const order = { completed: 0, building: 1, learning: 2, new: 3 };
    const unitHeads = l.units.map((u, i) => h('th', { title: u.title }, l.units.length > 1 ? `U${i + 1}` : 'Cards'));
    if (l.units.length > 1) unitHeads.push(h('th', { title: 'Final quiz' }, 'Final'));
    st.sort((a, b) => order[a.progress.status] - order[b.progress.status] || b.progress.solved - a.progress.solved || a.name.localeCompare(b.name));

    setView(
      backLink('#/lessons', 'All lessons'),
      h('div', { class: 'head-row' }, h('h1', null, `${l.emoji} ${l.title}`),
        h('a', { class: 'btn btn-ghost btn-sm', href: `#/lessons/${l.id}/edit` }, 'Edit lesson')),
      l.units.length > 1 ? h('p', { class: 'muted' }, 'Units: ', l.units.map((u, i) => `U${i + 1} = ${u.title}`).join(' · ')) : null,
      h('p', { class: 'muted' }, `${l.level} · ${plural(l.count, 'sentence')} · ${l.visibility === 'assigned' ? '🔒 selected students only' : '🌍 all students'}${l.published ? '' : ' · draft'}`),
      h('div', { class: 'tiles' },
        tile(count('completed'), 'Completed'),
        tile(count('building'), 'Building'),
        tile(count('learning'), 'Learning cards'),
        tile(count('new'), 'Not started')),
      h('div', { class: 'panel' }, st.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, 'Student'), h('th', null, 'Status'), ...unitHeads,
          ...['Built', 'Stars', 'Time', 'Last activity'].map(t => h('th', null, t)))),
        h('tbody', null, st.map(s => h('tr', null,
          h('td', null, h('a', { href: `#/students/${s.id}` }, s.name)),
          h('td', null, statusChip(s.progress)),
          ...s.progress.units.map(u => h('td', { title: u.title }, unitCell(u, l.units.length > 1))),
          l.units.length > 1 ? h('td', { title: 'Final quiz' }, s.progress.finalPassed ? h('span', { class: 'st st-completed' }, '✓') : s.progress.finalReady ? '❓' : '–') : null,
          h('td', null, progressBar(s.progress)),
          h('td', null, starsCell(s.progress)),
          h('td', null, fmtTime(s.progress.timeSpent)),
          h('td', null, timeAgo(s.progress.lastActivityAt)))))))
        : h('p', { class: 'muted' }, 'No students can see this lesson yet.')),
      h('div', { class: 'panel' }, h('h2', null, '🔥 Hardest sentences'),
        h('p', { class: 'muted' }, 'Ranked by wrong tries and hints while building, wrong grammar choices and wrong quiz answers, across all students. Practise these in class.'),
        hard.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, ...['Sentence', 'Building: wrong tries / hints', 'Grammar wrong', 'Quiz wrong', 'Students'].map(t => h('th', null, t)))),
          h('tbody', null, hard.map(x => h('tr', null,
            h('td', { lang: 'en' }, x.unit ? h('small', { class: 'muted' }, x.unit + ' · ') : null, x.sentence),
            h('td', null, `${x.mistakes} / ${x.hints}`),
            h('td', null, x.grammar || '–'),
            h('td', null, x.quizWrong ? `${x.quizWrong} of ${x.quizAsked}` : '–'),
            h('td', null, x.students))))))
          : h('p', { class: 'muted' }, 'Nothing is hard yet: no mistakes, hints or wrong quiz answers so far.'))
    );
  }

  /* ================= boot ================= */
  route();
  warmMain();
})();
