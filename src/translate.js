'use strict';

/**
 * Automatic English -> Arabic translation for the cards, done by an online translation service.
 *
 * The default is MyMemory: free, and it needs no account and no key. Set these on the server (on CranL: the app's
 * environment variables) only if you want something else:
 *   TRANSLATE_PROVIDER   'mymemory' (default, free) | 'libretranslate' (free software you run yourself) | 'google' | 'deepl'
 *   TRANSLATE_EMAIL      mymemory: any email address of yours; MyMemory then allows 50,000 characters a day instead of 5,000
 *   TRANSLATE_API_URL    libretranslate: the address of your LibreTranslate (e.g. https://translate.example.com); others: optional
 *   TRANSLATE_API_KEY    google / deepl: the key; libretranslate: its key, only if your server asks for one
 *
 * Translations are made once, when a teacher saves a lesson or presses "Translate missing to Arabic", and stored with the
 * sentence; students never trigger a translation. Only the English sentences are sent to the service.
 */

const GOOGLE_URL = 'https://translation.googleapis.com/language/translate/v2';
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const BATCH = 100;               // sentences per request (google, deepl, libretranslate)
const HAS_ARABIC = /[؀-ۿ]/;
const PROVIDERS = ['mymemory', 'libretranslate', 'google', 'deepl'];

const LIMIT = {
  mymemory: 'MyMemory\'s free daily limit is used up. Try again tomorrow, or set TRANSLATE_EMAIL on the server (any email address of yours) to raise the limit to 50,000 characters a day.',
  other: 'The translation limit has been reached. Try again later, or check your plan with the service.',
};
const entities = s => s.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function createTranslator({ provider, key, url, email, fetchImpl, timeoutMs = 20000 } = {}) {
  const wanted = String(provider || 'mymemory').toLowerCase();
  const name = PROVIDERS.includes(wanted) ? wanted : 'mymemory';
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  // MyMemory needs nothing; LibreTranslate needs its address; Google and DeepL need a key.
  const ready = name === 'mymemory' ? true : name === 'libretranslate' ? Boolean(url) : Boolean(key);
  const enabled = Boolean(ready && doFetch);

  async function request(method, endpoint, headers, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      res = await doFetch(endpoint, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}), signal: ctl.signal });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? 'The translation service took too long to answer. Try again.' : 'Could not reach the translation service. Check the server\'s internet connection.');
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) {
      if (res.status === 429 || res.status === 456) throw new Error(name === 'mymemory' ? LIMIT.mymemory : LIMIT.other);
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(name === 'libretranslate'
          ? 'Your LibreTranslate refused the request. Check TRANSLATE_API_URL and, if it asks for one, TRANSLATE_API_KEY, and that it has English and Arabic installed.'
          : 'The translation service refused the key. Check that TRANSLATE_API_KEY is right, that the translation service is switched on for it, and that billing is set up if the service asks for it.');
      }
      throw new Error(`The translation service had a problem (error ${res.status}). Try again.`);
    }
    return data;
  }

  async function google(texts) {
    const data = await request('POST', `${url || GOOGLE_URL}?key=${encodeURIComponent(key)}`, {}, { q: texts, source: 'en', target: 'ar', format: 'text' });
    const list = data && data.data && data.data.translations;
    if (!Array.isArray(list) || list.length !== texts.length) throw new Error('The translation service sent an answer the app does not understand.');
    return list.map(x => String(x.translatedText || ''));
  }

  async function deepl(texts) {
    const endpoint = url || (String(key).endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate');
    const data = await request('POST', endpoint, { Authorization: `DeepL-Auth-Key ${key}` }, { text: texts, source_lang: 'EN', target_lang: 'AR' });
    const list = data && data.translations;
    if (!Array.isArray(list) || list.length !== texts.length) throw new Error('The translation service sent an answer the app does not understand.');
    return list.map(x => String(x.text || ''));
  }

  async function libretranslate(texts) {
    const base = String(url).replace(/\/+$/, '');
    const data = await request('POST', /\/translate$/.test(base) ? base : `${base}/translate`, {}, { q: texts, source: 'en', target: 'ar', format: 'text', ...(key ? { api_key: key } : {}) });
    const list = data && data.translatedText;
    if (!Array.isArray(list) || list.length !== texts.length) throw new Error('The translation service sent an answer the app does not understand.');
    return list.map(String);
  }

  // MyMemory translates one sentence per request, so a few requests run side by side.
  async function mymemoryOne(text) {
    const q = `${url || MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent('en|ar')}${email ? `&de=${encodeURIComponent(email)}` : ''}`;
    const data = await request('GET', q, {});
    const got = String((data && data.responseData && data.responseData.translatedText) || '');
    if ((data && data.quotaFinished) || /MYMEMORY WARNING/i.test(got) || String(data && data.responseStatus) === '429') throw new Error(LIMIT.mymemory);
    if (data && data.responseStatus !== undefined && String(data.responseStatus) !== '200') throw new Error(`The translation service had a problem${data.responseDetails ? ` (${data.responseDetails})` : ''}. Try again.`);
    const clean = entities(got).trim();
    return HAS_ARABIC.test(clean) ? clean : ''; // when it has no real translation it sends the English back: better none than a wrong one
  }
  async function mymemory(texts) {
    const out = new Array(texts.length).fill('');
    let next = 0, failure = null;
    const worker = async () => {
      while (next < texts.length && !failure) {
        const i = next++;
        try { out[i] = await mymemoryOne(texts[i]); } catch (e) { failure = e; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (failure) throw failure;
    return out;
  }

  /** Translates a list of English sentences; returns the Arabic ones in the same order ('' where there is no usable translation). */
  async function translate(texts) {
    if (!enabled) throw new Error('Automatic translation is not set up on the server (see the README).');
    if (name === 'mymemory') return (await mymemory(texts.map(String))).map(s => s.slice(0, 300));
    const out = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const part = texts.slice(i, i + BATCH).map(String);
      out.push(...(await (name === 'deepl' ? deepl(part) : name === 'libretranslate' ? libretranslate(part) : google(part))));
    }
    return out.map(s => s.trim().slice(0, 300));
  }

  return { enabled, provider: name, translate };
}

/** Builds the translator from the environment variables. */
const fromEnv = (env = process.env) => createTranslator({
  provider: env.TRANSLATE_PROVIDER, key: (env.TRANSLATE_API_KEY || '').trim(), url: (env.TRANSLATE_API_URL || '').trim() || undefined, email: (env.TRANSLATE_EMAIL || '').trim() || undefined,
});

module.exports = { createTranslator, fromEnv };
