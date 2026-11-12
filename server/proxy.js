/* RTX Chart — Yahoo Finance প্রক্সি (Render Web Service)। কোনো লাইব্রেরি লাগে না (Node 18+) */
const http = require('http');
const PORT = process.env.PORT || 3000;
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const cache = new Map();

function send(res, code, body) {
  res.writeHead(code, { 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type, X-App-Token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}


/* ================= Gemini AI (ফ্রি কী, অটো মডেল ও কী ফলব্যাক) =================
   Render Environment:  GEMINI_KEYS = key1,key2,key3   (ব্রাউজারে কখনো কী যায় না)
   ঐচ্ছিক: APP_TOKEN (নিজের গোপন পাসওয়ার্ড), ALLOWED_ORIGIN (সাইটের URL), GEMINI_MODELS (কমা দিয়ে, সেরা আগে),
           AI_DAILY_MAX (দিনে সর্বোচ্চ কল, ডিফল্ট 120), AI_IP_HOURLY (প্রতি ঘণ্টায় প্রতি ডিভাইস, ডিফল্ট 15) */
const GKEYS = (process.env.GEMINI_KEYS || '').split(',').map(x => x.trim()).filter(Boolean);
const GAPI = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const DAILY_MAX = parseInt(process.env.AI_DAILY_MAX || '120', 10), IP_HOURLY = parseInt(process.env.AI_IP_HOURLY || '15', 10);
const cool = new Map();            // "keyIndex|model" -> কখন পর্যন্ত বিশ্রাম
const badModel = new Map();        // model -> কখন পর্যন্ত বাদ
const badKey = new Map();          // keyIndex -> কখন পর্যন্ত বাদ
const aiCache = new Map();         // hash -> {t, v}
const ipHits = new Map();          // ip -> [timestamps]
let modelList = { t: 0, v: [] }, daily = { d: '', n: 0 }, rr = 0;

function verOf(name) { const m = name.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; }
async function models() {
  if (process.env.GEMINI_MODELS) return process.env.GEMINI_MODELS.split(',').map(x => x.trim()).filter(Boolean);
  if (Date.now() - modelList.t < 6 * 3600e3 && modelList.v.length) return modelList.v;
  try {
    const r = await fetch(GAPI + '/models?pageSize=200', { headers: { 'x-goog-api-key': GKEYS[0] } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const names = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(n => /^gemini-\d/.test(n) && /flash/.test(n) && !/image|tts|live|audio|embed|robot|computer|thinking|exp|vision/.test(n));
    // নতুন ভার্সন আগে; একই ভার্সনে lite পরে; "latest" ও তারিখওয়ালা নাম পরে
    names.sort((a, b) => (verOf(b) - verOf(a)) || ((/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0)) || ((/\d{3,}|latest|preview/.test(a) ? 1 : 0) - (/\d{3,}|latest|preview/.test(b) ? 1 : 0)) || a.length - b.length);
    const uniq = [...new Set(names)].slice(0, 5);
    if (uniq.length) { modelList = { t: Date.now(), v: uniq.concat(FALLBACK_MODELS.filter(x => !uniq.includes(x))) }; return modelList.v; }
  } catch (e) { /* ফলব্যাকে যাও */ }
  modelList = { t: Date.now() - 5 * 3600e3, v: FALLBACK_MODELS };
  return FALLBACK_MODELS;
}
function retryMs(txt, dflt) {
  const m = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(txt || ''); let ms = m ? Math.ceil(parseFloat(m[1]) * 1000) + 1000 : dflt;
  if (/PerDay|per day|daily/i.test(txt || '')) ms = Math.max(ms, 3 * 3600e3);
  return ms;
}
async function callGemini(system, prompt) {
  const ms = await models(), now = Date.now(), errs = [];
  for (const model of ms) {
    if ((badModel.get(model) || 0) > now) continue;
    for (let t = 0; t < GKEYS.length; t++) {
      const ki = (rr + t) % GKEYS.length;
      if ((badKey.get(ki) || 0) > Date.now() || (cool.get(ki + '|' + model) || 0) > Date.now()) continue;
      try {
        const r = await fetch(GAPI + '/models/' + model + ':generateContent', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GKEYS[ki] },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1800 } })
        });
        const txt = await r.text();
        if (r.status === 429) { cool.set(ki + '|' + model, Date.now() + retryMs(txt, 65000)); errs.push('k' + ki + ' ' + model + ' 429'); continue; }
        if (r.status === 401 || r.status === 403) { badKey.set(ki, Date.now() + 3600e3); errs.push('k' + ki + ' key ' + r.status); continue; }
        if (r.status === 404 || r.status === 400) { badModel.set(model, Date.now() + 6 * 3600e3); errs.push(model + ' ' + r.status); break; }
        if (!r.ok) { errs.push(model + ' HTTP ' + r.status); continue; }
        const j = JSON.parse(txt), out = ((j.candidates || [])[0] || {}).content;
        const text = out && out.parts ? out.parts.map(p => p.text || '').join('').trim() : '';
        if (!text) { errs.push(model + ' empty'); break; }
        rr = (ki + 1) % GKEYS.length;
        return { text, model };
      } catch (e) { errs.push(model + ' ' + e.message); }
    }
  }
  const e = new Error('সব মডেল/কী এখন ব্যস্ত বা সীমা শেষ। কিছুক্ষণ পরে চেষ্টা করো।'); e.detail = errs.slice(-6); throw e;
}
function clientIp(req) { return ((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim(); }
function readBody(req) { return new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 20000) { no(new Error('too big')); req.destroy(); } }); req.on('end', () => ok(b)); req.on('error', no); }); }

async function handleAi(req, res) {
  if (!GKEYS.length) return send(res, 503, { error: 'সার্ভারে GEMINI_KEYS সেট করা নেই' });
  if (process.env.APP_TOKEN && req.headers['x-app-token'] !== process.env.APP_TOKEN) return send(res, 401, { error: 'token' });
  if (process.env.ALLOWED_ORIGIN && req.headers.origin && req.headers.origin !== process.env.ALLOWED_ORIGIN) return send(res, 403, { error: 'origin' });
  let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'bad body' }); }
  const prompt = String(body.prompt || '').slice(0, 7000), system = String(body.system || '').slice(0, 2000);
  if (prompt.length < 10) return send(res, 400, { error: 'empty' });
  const key = require('crypto').createHash('sha1').update(system + '\n' + prompt).digest('hex'), hit = aiCache.get(key);
  if (hit && Date.now() - hit.t < 600e3) return send(res, 200, Object.assign({ cached: true }, hit.v));   // একই প্রশ্নে লিমিট খরচ হয় না
  const ip = clientIp(req), nowT = Date.now(), arr = (ipHits.get(ip) || []).filter(t => nowT - t < 3600e3);
  if (arr.length >= IP_HOURLY) return send(res, 429, { error: 'ঘণ্টায় ' + IP_HOURLY + 'টির বেশি AI অনুরোধ নয়। পরে চেষ্টা করো।' });
  const day = new Date().toISOString().slice(0, 10); if (daily.d !== day) daily = { d: day, n: 0 };
  if (daily.n >= DAILY_MAX) return send(res, 429, { error: 'আজকের AI সীমা (' + DAILY_MAX + ') শেষ। কাল চেষ্টা করো।' });
  try {
    const v = await callGemini(system, prompt);
    arr.push(nowT); ipHits.set(ip, arr); daily.n++;
    if (aiCache.size > 200) aiCache.clear();
    aiCache.set(key, { t: nowT, v });
    send(res, 200, v);
  } catch (e) { send(res, 503, { error: e.message, detail: e.detail }); }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (u.pathname === '/') return send(res, 200, { ok: true, name: 'rtx-proxy', ai: GKEYS.length + ' key' });
  if (u.pathname === '/ai' && req.method === 'POST') return handleAi(req, res);
  if (u.pathname !== '/y') return send(res, 404, { error: 'not found' });
  const symbol = u.searchParams.get('symbol') || '', interval = u.searchParams.get('interval') || '15m';
  const p1 = parseInt(u.searchParams.get('p1'), 10), p2 = parseInt(u.searchParams.get('p2'), 10);
  if (!/^[A-Za-z0-9=\.\-\^]{1,20}$/.test(symbol) || !/^(1m|2m|5m|15m|30m|60m|90m|1h|1d|5d|1wk|1mo)$/.test(interval) || !(p1 > 0) || !(p2 > p1))
    return send(res, 400, { error: 'bad params' });
  const key = [symbol, interval, p1, p2].join('|'), hit = cache.get(key);
  if (hit && Date.now() - hit.t < 4000) return send(res, 200, hit.b);
  let last = 'unknown';
  for (const h of HOSTS) {
    try {
      const url = h + '/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=' + interval + '&period1=' + p1 + '&period2=' + p2 + '&includePrePost=false';
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      const txt = await r.text();
      if (!r.ok) { last = 'Yahoo HTTP ' + r.status; continue; }
      if (cache.size > 300) cache.clear();
      cache.set(key, { t: Date.now(), b: txt });
      return send(res, 200, txt);
    } catch (e) { last = e.message; }
  }
  send(res, 502, { error: last });
}).listen(PORT, () => console.log('proxy on ' + PORT));
