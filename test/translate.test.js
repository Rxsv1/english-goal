'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTranslator, fromEnv } = require('../src/translate');
const Grammar = require('../public/grammar-core.js');

// A pretend fetch: records what was sent and answers like the real service would.
function fakeFetch(answer, status = 200) {
  const calls = [];
  const fn = async (url, opts) => {
    const call = { url, opts, body: opts.body ? JSON.parse(opts.body) : null };
    calls.push(call);
    return { ok: status < 400, status, json: async () => (typeof answer === 'function' ? answer(call) : answer) };
  };
  fn.calls = calls;
  return fn;
}

test('MyMemory is the default and needs no key; the others are off until they have what they need', async () => {
  assert.equal(fromEnv({}).provider, 'mymemory');
  assert.equal(fromEnv({}).enabled, true);
  for (const provider of ['google', 'deepl']) {
    const t = createTranslator({ provider, key: '' });
    assert.equal(t.enabled, false);
    await assert.rejects(() => t.translate(['Hello']), /not set up/);
  }
  assert.equal(createTranslator({ provider: 'libretranslate' }).enabled, false);
  assert.equal(createTranslator({ provider: 'libretranslate', url: 'https://t.example.com' }).enabled, true);
  assert.equal(fromEnv({ TRANSLATE_API_KEY: ' abc ', TRANSLATE_PROVIDER: 'deepl' }).provider, 'deepl');
  assert.equal(createTranslator({ provider: 'nonsense' }).provider, 'mymemory');
});

test('MyMemory: one request per sentence, the answers stay in order, entities are decoded, "no translation" is left empty', async () => {
  const f = fakeFetch(c => {
    const q = decodeURIComponent(new URL(c.url).searchParams.get('q'));
    if (q === 'Untranslatable') return { responseData: { translatedText: 'Untranslatable' }, responseStatus: 200 };
    return { responseData: { translatedText: `هذا &#39;${q}&#39; &amp; أكثر` }, responseStatus: 200 };
  });
  const t = createTranslator({ email: 'teacher@example.com', fetchImpl: f });
  const out = await t.translate(['We like tea', 'Untranslatable', 'She is reading']);
  assert.deepEqual(out, ["هذا 'We like tea' & أكثر", '', "هذا 'She is reading' & أكثر"]);
  assert.equal(f.calls.length, 3);
  const u = new URL(f.calls[0].url);
  assert.equal(u.hostname, 'api.mymemory.translated.net');
  assert.equal(u.searchParams.get('langpair'), 'en|ar');
  assert.equal(u.searchParams.get('de'), 'teacher@example.com');
  assert.equal(f.calls[0].opts.method, 'GET');
  assert.equal(createTranslator({ fetchImpl: fakeFetch({ responseData: { translatedText: 'مرحبا' }, responseStatus: 200 }) }).enabled, true);
});

test('MyMemory: when the free daily limit is used up the message says what to do', async () => {
  for (const answer of [{ quotaFinished: true, responseData: { translatedText: 'x' }, responseStatus: 200 }, { responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.' }, responseStatus: 200 }, { responseData: { translatedText: '' }, responseStatus: '429' }]) {
    await assert.rejects(() => createTranslator({ fetchImpl: fakeFetch(answer) }).translate(['We like tea']), /TRANSLATE_EMAIL/);
  }
  await assert.rejects(() => createTranslator({ fetchImpl: fakeFetch({}, 429) }).translate(['We like tea']), /TRANSLATE_EMAIL/);
});

test('LibreTranslate: your own server, batch of sentences, key only if given', async () => {
  const f = fakeFetch(c => ({ translatedText: c.body.q.map(x => 'ar:' + x) }));
  const t = createTranslator({ provider: 'libretranslate', url: 'https://translate.example.com/', fetchImpl: f });
  assert.deepEqual(await t.translate(['Hello', 'Bye bye']), ['ar:Hello', 'ar:Bye bye']);
  assert.equal(f.calls[0].url, 'https://translate.example.com/translate');
  assert.equal(f.calls[0].body.api_key, undefined);
  assert.deepEqual([f.calls[0].body.source, f.calls[0].body.target], ['en', 'ar']);
  const f2 = fakeFetch(c => ({ translatedText: c.body.q }));
  await createTranslator({ provider: 'libretranslate', url: 'https://t.example.com/translate', key: 'K', fetchImpl: f2 }).translate(['Hi']);
  assert.equal(f2.calls[0].url, 'https://t.example.com/translate');
  assert.equal(f2.calls[0].body.api_key, 'K');
  await assert.rejects(() => createTranslator({ provider: 'libretranslate', url: 'https://t.example.com', fetchImpl: fakeFetch({}, 400) }).translate(['Hi']), /LibreTranslate refused/);
});

test('Google: sends English to Arabic in one batch and returns the Arabic in the same order', async () => {
  const f = fakeFetch(c => ({ data: { translations: c.body.q.map(x => ({ translatedText: 'ar:' + x })) } }));
  const t = createTranslator({ provider: 'google', key: 'K E Y', fetchImpl: f });
  assert.deepEqual(await t.translate(['Hello world', 'We like tea']), ['ar:Hello world', 'ar:We like tea']);
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /translation\.googleapis\.com.*key=K%20E%20Y/);
  assert.deepEqual([f.calls[0].body.source, f.calls[0].body.target, f.calls[0].body.format], ['en', 'ar', 'text']);
});

test('DeepL: a free key (…:fx) uses the free address and the key goes in a header, never in the address', async () => {
  const f = fakeFetch(c => ({ translations: c.body.text.map(x => ({ text: 'ar:' + x })) }));
  const t = createTranslator({ provider: 'deepl', key: 'abc:fx', fetchImpl: f });
  assert.deepEqual(await t.translate(['Hi there']), ['ar:Hi there']);
  assert.match(f.calls[0].url, /api-free\.deepl\.com/);
  assert.equal(f.calls[0].opts.headers.Authorization, 'DeepL-Auth-Key abc:fx');
  assert.ok(!f.calls[0].url.includes('abc'));
  assert.equal(f.calls[0].body.target_lang, 'AR');
  const paid = fakeFetch(c => ({ translations: c.body.text.map(x => ({ text: x })) }));
  await createTranslator({ provider: 'deepl', key: 'abc', fetchImpl: paid }).translate(['Hi']);
  assert.match(paid.calls[0].url, /\/\/api\.deepl\.com/);
});

test('long lists are sent in batches of 100', async () => {
  const f = fakeFetch(c => ({ data: { translations: c.body.q.map(x => ({ translatedText: x })) } }));
  const out = await createTranslator({ provider: 'google', key: 'k', fetchImpl: f }).translate(Array.from({ length: 250 }, (_, i) => `Sentence ${i}`));
  assert.equal(out.length, 250);
  assert.deepEqual(f.calls.map(c => c.body.q.length), [100, 100, 50]);
});

test('problems with the service become plain messages', async () => {
  for (const [status, re] of [[403, /refused the key/], [429, /limit/], [500, /had a problem/]]) {
    await assert.rejects(() => createTranslator({ provider: 'google', key: 'k', fetchImpl: fakeFetch({ error: { message: 'x' } }, status) }).translate(['Hi']), re);
  }
  const offline = async () => { throw new Error('ENOTFOUND'); };
  await assert.rejects(() => createTranslator({ provider: 'google', key: 'k', fetchImpl: offline }).translate(['Hi']), /Could not reach/);
  await assert.rejects(() => createTranslator({ provider: 'google', key: 'k', fetchImpl: fakeFetch({ data: { translations: [] } }) }).translate(['Hi']), /does not understand/);
});

test('a line can end with its Arabic after " // "', () => {
  assert.deepEqual(Grammar.splitAr('She is reading a book // هي تقرأ كتاباً'), { text: 'She is reading a book', ar: 'هي تقرأ كتاباً' });
  assert.deepEqual(Grammar.splitAr('She [is|are|am] here'), { text: 'She [is|are|am] here', ar: '' });
  assert.deepEqual(Grammar.splitAr('A // B // C'), { text: 'A', ar: 'B // C' });
  assert.equal(Grammar.toLine({ en: 'We like tea', ar: 'نحب الشاي' }), 'We like tea // نحب الشاي');
  assert.equal(Grammar.toLine({ en: 'She is happy today', gap: { index: 1, answer: 'is', options: ['is', 'are', 'am'] }, ar: 'هي سعيدة' }), 'She [is|are|am] happy today // هي سعيدة');
  assert.equal(Grammar.toLine({ en: 'We like tea' }), 'We like tea');
});
