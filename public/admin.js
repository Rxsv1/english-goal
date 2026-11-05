/* Lesson Manager - admin page */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const views = { login: $('login-view'), list: $('list-view'), edit: $('edit-view') };
  const TOKEN_KEY = 'sp:adminToken';
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
  let lessons = [];
  let levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  let editing = null; // lesson id or null for new
  let slugTouched = false;
  let dirty = false;

  /* ---------- helpers ---------- */
  function show(name) {
    Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
    $('logout').hidden = name === 'login';
    window.scrollTo(0, 0);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401 && url !== '/api/admin/login') { logout(); throw new Error('Your session expired. Please log in again.'); }
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const slugify = t => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const countWords = s => s.trim().split(/\s+/).map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean).length;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---------- auth ---------- */
  function logout() {
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    show('login');
    $('password').focus();
  }
  $('logout').addEventListener('click', logout);

  $('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    $('login-msg').textContent = '';
    try {
      const data = await api('POST', '/api/admin/login', { password: $('password').value });
      token = data.token;
      try { localStorage.setItem(TOKEN_KEY, token); } catch (err) {}
      $('password').value = '';
      loadList();
    } catch (err) {
      $('login-msg').textContent = err.message;
    }
  });

  /* ---------- list ---------- */
  async function loadList() {
    show('list');
    const msg = $('list-msg');
    msg.hidden = false; msg.textContent = 'Loading…';
    try {
      const data = await api('GET', '/api/admin/lessons');
      lessons = data.lessons; levels = data.levels || levels;
      renderList();
    } catch (err) {
      msg.textContent = err.message;
    }
  }

  function renderList() {
    const list = $('lesson-list');
    list.replaceChildren();
    const msg = $('list-msg');
    msg.hidden = lessons.length > 0;
    msg.textContent = 'No lessons yet. Click “New lesson” to create one.';

    for (const l of lessons) {
      const li = el('li', 'admin-item' + (l.published ? '' : ' draft'));
      li.dataset.id = l.id;
      const handle = el('span', 'handle', '☰'); handle.title = 'Drag to reorder'; handle.setAttribute('aria-hidden', 'true');
      const info = el('div', 'info');
      const name = el('div', 'name', l.title);
      if (!l.published) name.append(el('span', 'badge-draft', 'Draft'));
      info.append(name, el('div', 'sub', `${l.level} · ${l.count} sentences · /lesson/${l.slug}`));

      const btns = el('div', 'btns');
      const edit = el('button', 'btn btn-ghost btn-sm', 'Edit'); edit.type = 'button';
      edit.addEventListener('click', () => openEditor(l.id));
      const copy = el('button', 'btn btn-ghost btn-sm', 'Copy link'); copy.type = 'button';
      copy.addEventListener('click', async () => {
        const url = `${location.origin}/lesson/${l.slug}`;
        try { await navigator.clipboard.writeText(url); toast('Link copied: ' + url); } catch (e) { prompt('Copy this link:', url); }
      });
      const open = el('a', 'btn btn-ghost btn-sm', 'Open'); open.href = `/lesson/${l.slug}`; open.target = '_blank'; open.rel = 'noopener';
      btns.append(edit, copy);
      if (l.published) btns.append(open);

      li.append(handle, el('span', 'emoji', l.emoji || '📘'), info, btns);
      list.append(li);
    }
  }

  if (window.Sortable) {
    Sortable.create($('lesson-list'), {
      handle: '.handle',
      animation: 150,
      forceFallback: true,
      onEnd: async () => {
        const ids = [...$('lesson-list').children].map(li => li.dataset.id);
        lessons.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        try { await api('POST', '/api/admin/reorder', { ids }); toast('Order saved'); } catch (e) { toast(e.message); loadList(); }
      },
    });
  }

  /* ---------- import / export ---------- */
  $('export-btn').addEventListener('click', async e => {
    e.preventDefault();
    try {
      const data = await api('GET', '/api/admin/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lessons-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) { toast(err.message); }
  });

  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const list = Array.isArray(json) ? json : json.lessons || (json.title ? [json] : null);
      if (!list) throw new Error('This file does not contain lessons.');
      if (!confirm(`Import ${list.length} lesson(s)? Lessons with the same link name will be replaced.`)) return;
      const r = await api('POST', '/api/admin/import', { lessons: list });
      toast(`Imported: ${r.created} new, ${r.updated} updated`);
      loadList();
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message);
    }
  });

  /* ---------- editor ---------- */
  const f = {
    title: $('f-title'), emoji: $('f-emoji'), slug: $('f-slug'), level: $('f-level'),
    desc: $('f-desc'), sentences: $('f-sentences'), published: $('f-published'),
  };

  function fillLevels() {
    f.level.replaceChildren(...levels.map(lv => { const o = el('option', null, lv); o.value = lv; return o; }));
  }

  async function openEditor(id) {
    editing = id || null;
    fillLevels();
    $('edit-msg').textContent = '';
    $('delete-btn').hidden = !editing;
    $('edit-title').textContent = editing ? 'Edit lesson' : 'New lesson';
    let l = { title: '', emoji: '📘', slug: '', level: 'A1', description: '', sentences: [], published: true };
    if (editing) {
      try { l = (await api('GET', `/api/admin/lessons/${editing}`)).lesson; } catch (err) { toast(err.message); return; }
    }
    f.title.value = l.title; f.emoji.value = l.emoji; f.slug.value = l.slug; f.level.value = l.level;
    f.desc.value = l.description; f.published.checked = l.published;
    f.sentences.value = l.sentences.map(s => s.en).join('\n');
    slugTouched = Boolean(editing);
    dirty = false;
    checkSentences();
    show('edit');
    f.title.focus();
  }

  function parseSentences() {
    return f.sentences.value.split('\n').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  }

  function checkSentences() {
    const lines = parseSentences();
    const box = $('sentence-check');
    const problems = [];
    lines.forEach((s, i) => {
      const n = countWords(s);
      if (!/\p{Script=Latin}/u.test(s)) problems.push(`Line ${i + 1}: needs English words.`);
      else if (n < 2) problems.push(`Line ${i + 1}: needs at least 2 words.`);
      else if (n > 20) problems.push(`Line ${i + 1}: ${n} words (max 20).`);
      else if (s.length > 200) problems.push(`Line ${i + 1}: too long (max 200 characters).`);
    });
    if (lines.length > 100) problems.push(`You have ${lines.length} sentences (max 100).`);
    box.replaceChildren(el('span', problems.length ? '' : 'ok', `${lines.length} sentence${lines.length === 1 ? '' : 's'}${problems.length ? '' : lines.length ? ' ✓' : ''}`));
    if (problems.length) {
      const ul = el('ul');
      problems.slice(0, 8).forEach(p => ul.append(el('li', null, p)));
      if (problems.length > 8) ul.append(el('li', null, `…and ${problems.length - 8} more`));
      box.append(ul);
    }
    return problems.length === 0 && lines.length > 0;
  }

  f.sentences.addEventListener('input', () => { dirty = true; checkSentences(); });
  f.title.addEventListener('input', () => { dirty = true; if (!slugTouched) f.slug.value = slugify(f.title.value); });
  f.slug.addEventListener('input', () => { dirty = true; slugTouched = true; });
  f.slug.addEventListener('blur', () => { f.slug.value = slugify(f.slug.value); });
  [f.emoji, f.desc, f.level, f.published].forEach(x => x.addEventListener('input', () => { dirty = true; }));

  $('edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('edit-msg');
    msg.textContent = '';
    if (!f.title.value.trim()) { msg.textContent = 'Please add a title.'; f.title.focus(); return; }
    if (!checkSentences()) { msg.textContent = 'Please fix the sentences above.'; f.sentences.focus(); return; }
    const body = {
      title: f.title.value, emoji: f.emoji.value, slug: slugify(f.slug.value || f.title.value), level: f.level.value,
      description: f.desc.value, published: f.published.checked, sentences: parseSentences().map(en => ({ en })),
    };
    const btn = $('save-btn');
    btn.disabled = true;
    try {
      if (editing) await api('PUT', `/api/admin/lessons/${editing}`, body);
      else await api('POST', '/api/admin/lessons', body);
      dirty = false;
      toast('Lesson saved');
      loadList();
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('cancel-btn').addEventListener('click', () => {
    if (dirty && !confirm('Discard your changes?')) return;
    dirty = false;
    loadList();
  });

  $('delete-btn').addEventListener('click', async () => {
    if (!editing || !confirm(`Delete “${f.title.value}”? Students will no longer be able to open it.`)) return;
    try { await api('DELETE', `/api/admin/lessons/${editing}`); dirty = false; toast('Lesson deleted'); loadList(); }
    catch (err) { $('edit-msg').textContent = err.message; }
  });

  $('new-btn').addEventListener('click', () => openEditor(null));

  window.addEventListener('beforeunload', e => { if (dirty && !views.edit.hidden) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- boot ---------- */
  if (token) loadList(); else show('login');
})();
