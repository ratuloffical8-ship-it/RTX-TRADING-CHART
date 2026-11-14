// ফাইলের নাম: tools.js
// পাথ: js/tools.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — টুলস: ফরেক্স ডেটা (Twelve Data), রিস্ক ক্যালকুলেটর, ট্রেড জার্নাল */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function say(m) { if (R.onError) R.onError(m); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return String(n).padStart(2, '0'); }

  /* =====================================================
     ১) ফরেক্স ডেটা — Twelve Data (নিজের API key লাগবে)
     ===================================================== */
  var FX = [
    { id: 'XAU/USD', base: 2650 }, { id: 'BTC/USD', base: 90000 }
  ];
  var FXBASE = {};
  FX.forEach(function (s) { FXBASE[s.id] = s.base; if (!R.SYMBOLS.some(function (x) { return x.id === s.id; })) R.SYMBOLS.push({ id: s.id, name: s.id }); });
  var IV = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '1h': '1h', '4h': '4h', '1d': '1day', '1w': '1week' };

  function isFx(sym) { return String(sym).indexOf('/') > 0; }
  function tdKey() { try { return localStorage.getItem('rtx_td_key') || ''; } catch (_) { return ''; } }
  function parseDT(s) {
    s = String(s);
    return Math.floor(Date.parse(s.length <= 10 ? s + 'T00:00:00Z' : s.replace(' ', 'T') + 'Z') / 1000);
  }
  function fmtDT(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds());
  }
  function agg(cs, sec) {
    var out = [], cur = null;
    cs.forEach(function (c) {
      var b = Math.floor(c.time / sec) * sec;
      if (!cur || cur.time !== b) {
        cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
        out.push(cur);
      } else {
        cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low);
        cur.close = c.close; cur.volume += c.volume;
      }
    });
    return out;
  }
  async function tdRaw(symbol, tf, size, endTime) {
    var key = tdKey(); if (!key) throw new Error('NO_KEY');
    var base = tf === '3m' ? '1min' : IV[tf];
    if (!base) throw new Error('এই টাইমফ্রেম ফরেক্সে নেই');
    var n = tf === '3m' ? Math.min(5000, size * 3 + 3) : size;
    var url = 'https://api.twelvedata.com/time_series?symbol=' + encodeURIComponent(symbol) + '&interval=' + base +
      '&outputsize=' + n + '&order=ASC&timezone=UTC&apikey=' + encodeURIComponent(key);
    if (endTime) url += '&end_date=' + encodeURIComponent(fmtDT(endTime));
    var r = await fetch(url), j = await r.json();
    if (!j || j.status === 'error' || !j.values) throw new Error((j && j.message) || 'Twelve Data থেকে ডেটা আসেনি');
    var cs = j.values.map(function (v) {
      return { time: parseDT(v.datetime), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +(v.volume || 0) };
    }).sort(function (a, b) { return a.time - b.time; });
    cs = cs.filter(function (c, i) { return i === 0 || c.time !== cs[i - 1].time; });
    return tf === '3m' ? agg(cs, 180) : cs;
  }

  /* ---------- Yahoo Finance (নিজের প্রক্সির মাধ্যমে, key লাগে না) ---------- */
  /* গোল্ডে আর চুপচাপ ফিউচার্স (GC=F) নয়: ফিউচার্সের দামে স্পটের চেয়ে তফাত থাকে, তাই ক্যান্ডেল কখনো মিলত কখনো অনেক ওপরে-নিচে যেত */
  var YSYM = { 'XAU/USD': ['XAUUSD=X'], 'BTC/USD': ['BTC-USD'] };
  // tf -> [Yahoo interval, বেস সেকেন্ড, গুণক, সর্বোচ্চ দিন]
  var YTF = { '1m': ['1m', 60, 1, 7], '3m': ['1m', 60, 3, 7], '5m': ['5m', 300, 1, 59], '15m': ['15m', 900, 1, 59], '30m': ['30m', 1800, 1, 59],
    '1h': ['60m', 3600, 1, 720], '4h': ['60m', 3600, 4, 720], '1d': ['1d', 86400, 1, 7000], '1w': ['1wk', 604800, 1, 7000] };
  function proxyUrl() { var v = ''; try { v = localStorage.getItem('rtx_proxy') || ''; } catch (_) {} return v.replace(/\/+$/, ''); }
  async function yh(symbol, tf, size, endTime) {
    var base = proxyUrl(); if (!base) throw new Error('NO_PROXY');
    var m = YTF[tf], ysl = [].concat(YSYM[symbol] || []); if (!m || !ysl.length) throw new Error('এই টাইমফ্রেম/সিম্বল Yahoo-তে নেই');
    var need = size * m[2] + m[2] + 2, p2 = endTime ? Math.floor(endTime / 1000) : Math.floor(Date.now() / 1000) + m[1];
    var span = Math.min(m[3] * 86400, Math.ceil(need * m[1] * 1.5) + 3 * 86400);
    var cs = [], lastErr = null;
    for (var yi = 0; yi < ysl.length && cs.length < 5; yi++) {
      try {
        var url = base + '/y?symbol=' + encodeURIComponent(ysl[yi]) + '&interval=' + m[0] + '&p1=' + (p2 - span) + '&p2=' + p2;
        var r = await fetch(url), j = await r.json();
        var res = j && j.chart && j.chart.result && j.chart.result[0];
        if (!res || !res.timestamp) throw new Error((j && (j.error || (j.chart && j.chart.error && j.chart.error.description))) || 'Yahoo থেকে ডেটা আসেনি');
        var q = res.indicators.quote[0]; cs = [];
        for (var i = 0; i < res.timestamp.length; i++) {
          if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
          cs.push({ time: res.timestamp[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume && q.volume[i] ? q.volume[i] : 0 });
        }
      } catch (e) { lastErr = e; cs = []; }
    }
    if (cs.length < 2) throw lastErr || new Error('Yahoo থেকে ডেটা আসেনি');
    cs = cs.filter(function (c, i) { return i === 0 || c.time !== cs[i - 1].time; });
    if (m[2] > 1) cs = agg(cs, m[1] * m[2]);
    return cs.slice(-size);
  }
  function fxSrc() { var v = ''; try { v = localStorage.getItem('rtx_fxsrc') || ''; } catch (_) {} if (v === 'td' && tdKey()) return 'td'; if (proxyUrl() && v !== 'td') return 'yahoo'; return tdKey() ? 'td' : 'yahoo'; }
  async function fxFetch(symbol, tf, size, endTime) {
    if (fxSrc() === 'yahoo') return yh(symbol, tf, size, endTime);
    return td(symbol, tf, size, endTime);
  }
  /* Twelve Data: প্রতি ৮ সেকেন্ডে সর্বোচ্চ ১টি কল (মিনিটে ৮-এর সীমার ভেতরে) + ৬০ সেকেন্ডের ক্যাশ */
  var tdCache = {}, tdChain = Promise.resolve(), tdLast = 0;
  function td(symbol, tf, size, endTime) {
    var k = [symbol, tf, size, endTime || 0].join('|'), c = tdCache[k];
    if (c && Date.now() - c.t < 60000) return Promise.resolve(c.v);
    var job = tdChain.then(async function () {
      var wait = tdLast + 8000 - Date.now(); if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
      try { var v = await tdRaw(symbol, tf, size, endTime); tdCache[k] = { t: Date.now(), v: v }; return v; }
      finally { tdLast = Date.now(); }
    });
    tdChain = job.catch(function () {});
    return job;
  }
  R.forex = { parseDT: parseDT, fmtDT: fmtDT, agg: agg, isFx: isFx };

  var origK = R.data.klines, origL = R.data.live, origD = R.data.demo;

  /* ---------- সোর্স লক (গোল্ডের ক্যান্ডেল অফসেট ঠিক করতে) ----------
     আগে সোর্স চুপচাপ বদলে যেত (স্পট ↔ ফিউচার্স), তাই একই চার্টে দুই সোর্সের ক্যান্ডেল মিশে দামে ফাঁক তৈরি হতো।
     এখন প্রথমবার যে সোর্স কাজ করে, পুরো সেশনে (পুরোনো ক্যান্ডেল আনা ও লাইভসহ) শুধু সেটাই চলে। সোর্স বদলাতে হলে রিলোড।
     গোল্ডের অগ্রাধিকার: Yahoo XAUUSD=X (স্পট) → না পেলে Binance XAUUSDT (এটা স্পট নয়, তাই চার্টে স্পষ্ট লেখা থাকে) */
  var LOCK = {}, FROMCACHE = {}, BG = {};
  function fire(symbol, tf) { try { window.dispatchEvent(new CustomEvent('rtx-fx-refresh', { detail: { symbol: symbol, tf: tf } })); } catch (_) {} }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  /* শেষ সফল ক্যান্ডেল ফোনে ক্যাশ: পরেরবার চার্ট সঙ্গে সঙ্গে খোলে, পেছনে নতুন ডেটা আসে */
  function ckey(s2, tf) { return 'rtx_fxc_' + s2 + '_' + tf; }
  function cacheGet(s2, tf) { try { var o = JSON.parse(localStorage.getItem(ckey(s2, tf)) || 'null'); if (o && Array.isArray(o.cs) && o.cs.length > 50 && Date.now() - o.t < 3 * 864e5) return o; } catch (_) {} return null; }
  function cachePut(s2, tf, cs) { try { localStorage.setItem(ckey(s2, tf), JSON.stringify({ t: Date.now(), src: LOCK[s2] || 'yahoo', cs: cs.slice(-600) })); } catch (_) {} }
  function post(s2, tf, cs) { return (tf === '3m' && cs.length > 1 && LOCK[s2] !== 'binance') ? cs.slice(1) : cs; }
  async function bgRefresh(symbol, tf, limit) {
    var k = symbol + '|' + tf; if (BG[k]) return; BG[k] = 1;
    for (var i = 0; i < 10; i++) {
      try { var cs = post(symbol, tf, await fxOne(symbol, tf, Math.min(limit || 1000, 1000), undefined, LOCK[symbol] || 'yahoo')); cachePut(symbol, tf, cs); FROMCACHE[symbol] = false; BG[k] = 0; fire(symbol, tf); return; }
      catch (e) { if (e && (e.message === 'NO_PROXY' || e.message === 'NO_KEY')) break; await sleep(8000); }
    }
    BG[k] = 0; FROMCACHE[symbol] = 'fail'; paintBadge(symbol);
  }
  /* সার্ভার ঘুমিয়ে থাকলে জাগাই; খোলা থাকলে ৯ মিনিট পরপর পিং (Render ফ্রি ১৫ মিনিট নিষ্ক্রিয় থাকলে ঘুমায়) */
  function wake() { var b = proxyUrl(); if (!b) return; try { fetch(b + '/', { mode: 'no-cors', cache: 'no-store' }).catch(function () {}); } catch (_) {} }
  setTimeout(wake, 300); setInterval(function () { if (!document.hidden) wake(); }, 9 * 60 * 1000);
  /* ফলব্যাকে নামার পর Yahoo জাগলে নিজে থেকে স্পটে ফিরি (পুরো চার্ট নতুন করে লোড, তাই সোর্স মিশে না) */
  function probeYahoo(symbol, tf) {
    var n = 0, iv = setInterval(async function () {
      if (++n > 24 || LOCK[symbol] !== 'binance') { clearInterval(iv); return; }
      try { await yh(symbol, tf, 2); clearInterval(iv); delete LOCK[symbol]; say('✅ Yahoo সার্ভার জেগেছে। গোল্ডের স্পট ডেটা (Exness-এর কাছাকাছি) লোড হচ্ছে…'); fire(symbol, tf); } catch (_) {}
    }, 15000);
  }
  function goldOff() { var v = parseFloat(localStorage.getItem('rtx_gold_off')); return isFinite(v) ? v : 0; }
  function applyOff(symbol, cs) {
    if (symbol !== 'XAU/USD') return cs;
    var o = goldOff(); if (!o) return cs;
    return cs.map(function (c) { return { time: c.time, open: c.open + o, high: c.high + o, low: c.low + o, close: c.close + o, volume: c.volume }; });
  }
  function srcLabel(symbol) {
    if (!isFx(symbol)) return 'Binance স্পট ' + symbol;
    var k = LOCK[symbol], off = symbol === 'XAU/USD' ? goldOff() : 0, tail = off ? ' · অফসেট ' + (off > 0 ? '+' : '') + off : '';
    if (!k) return symbol + ' সোর্স লোড হচ্ছে';
    if (FROMCACHE[symbol] === true) tail += ' · ক্যাশ, নতুন ডেটা আসছে…';
    if (FROMCACHE[symbol] === 'fail') tail += ' · ক্যাশ (নতুন ডেটা আনা যায়নি, সার্ভার চেক করো)';
    if (k === 'binance') return 'Binance ফিউচার্স XAUUSDT (স্পট নয়, Exness থেকে তফাত হতে পারে)' + tail;
    if (k === 'td') return 'Twelve Data ' + symbol + tail;
    return 'Yahoo ' + (YSYM[symbol] || [symbol])[0] + (symbol === 'XAU/USD' ? ' (স্পট)' : '') + tail;
  }
  R.data.sourceLabel = srcLabel;
  async function fxOne(symbol, tf, size, endTime, src) {
    if (src === 'binance') return origK.call(R.data, 'XAUUSDT', tf, size, endTime);
    if (src === 'td') return td(symbol, tf, size, endTime);
    return yh(symbol, tf, size, endTime);
  }
  async function lockedFetch(symbol, tf, size, endTime) {
    var k = LOCK[symbol];
    if (k) return fxOne(symbol, tf, size, endTime, k);
    var first = fxSrc() === 'td' ? 'td' : 'yahoo', cs;
    try {
      /* Render-এর ফ্রি প্রক্সি ঘুমিয়ে থাকলে জাগতে ৩০-৬০ সেকেন্ড লাগে, তাই ভুল সোর্সে নামার আগে ৩ বার চেষ্টা (৬ সেকেন্ড ফাঁকে) */
      var tries = symbol === 'XAU/USD' ? 5 : 1, lastE = null, wm = setTimeout(function () { say('গোল্ডের ডেটা সার্ভার ঘুম থেকে জাগছে, ৪০-৬০ সেকেন্ড লাগতে পারে। একবার জাগলে পরে দ্রুত খুলবে।'); }, 4000);
      for (var ti = 0; ti < tries; ti++) {
        try { cs = await fxOne(symbol, tf, size, endTime, first); LOCK[symbol] = first; lastE = null; break; }
        catch (e1) { lastE = e1; if (e1 && (e1.message === 'NO_PROXY' || e1.message === 'NO_KEY')) break; if (ti < tries - 1) await new Promise(function (r) { setTimeout(r, 8000); }); }
      }
      clearTimeout(wm);
      if (lastE) throw lastE;
    }
    catch (e) {
      if (symbol !== 'XAU/USD') throw e;
      cs = await fxOne(symbol, tf, size, endTime, 'binance'); LOCK[symbol] = 'binance'; probeYahoo(symbol, tf);
      setTimeout(function () { say('Yahoo থেকে গোল্ডের স্পট ডেটা আসেনি, তাই Binance XAUUSDT (ফিউচার্স) দেখানো হচ্ছে। দামে সামান্য তফাত থাকতে পারে।'); }, 1500);
    }
    return cs;
  }
  function paintBadge(symbol) {
    try {
      /* দেরিতে ফেরা অন্য মার্কেটের (যেমন গোল্ডের HTF) রিকোয়েস্ট যেন বর্তমান চার্টের ব্যাজ না বদলায় */
      var sel = document.getElementById('symbol'); if (sel && sel.value && symbol !== sel.value) return;
      var b = document.getElementById('src-badge');
      if (!b) {
        var wrap = document.getElementById('chart-wrap') || document.getElementById('chart'); if (!wrap || !wrap.parentNode) return;
        b = document.createElement('div'); b.id = 'src-badge'; b.style.cssText = 'font-size:11px;color:#8b8b8b;padding:2px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none';
        wrap.parentNode.insertBefore(b, wrap);
      }
      b.textContent = 'ডেটা সোর্স: ' + srcLabel(symbol);
    } catch (_) {}
  }

  R.data.klines = async function (symbol, tf, limit, endTime) {
    if (!isFx(symbol)) { var r0 = await origK.apply(R.data, arguments); setTimeout(function () { paintBadge(symbol); }, 0); return r0; }
    if (!endTime) {
      var cc = cacheGet(symbol, tf);
      if (cc) {
        if (!LOCK[symbol]) LOCK[symbol] = cc.src;
        var fresh = Date.now() - cc.t < 30000; FROMCACHE[symbol] = !fresh;
        if (!fresh) bgRefresh(symbol, tf, limit);
        setTimeout(function () { paintBadge(symbol); }, 0);
        return applyOff(symbol, cc.cs.slice());
      }
    }
    try {
      var cs = await lockedFetch(symbol, tf, Math.min(limit || 1000, 1000), endTime);
      cs = post(symbol, tf, cs); if (!endTime && LOCK[symbol] !== 'binance') cachePut(symbol, tf, cs);
      setTimeout(function () { paintBadge(symbol); }, 0);
      return applyOff(symbol, cs);
    } catch (e) {
      var m = (e.message === 'NO_KEY' || e.message === 'NO_PROXY') ? 'গোল্ড ও BTC/USD দেখতে 🧮 টুলস ট্যাবে Yahoo প্রক্সির URL দাও' : 'ডেটা সমস্যা: ' + e.message;
      setTimeout(function () { say(m); }, 3200);
      throw e;
    }
  };
  R.data.live = function (symbol, tf, onCandle, onStatus) {
    if (!isFx(symbol)) return origL.apply(R.data, arguments);
    var stop = false, timer, inner = null;
    async function tick() {
      if (stop) return;
      if (typeof document === 'undefined' || !document.hidden) {
        try {
          var k = LOCK[symbol];
          if (k === 'binance') {
            if (!inner) inner = origL.call(R.data, 'XAUUSDT', tf, function (c) { applyOff(symbol, [c]).forEach(onCandle); }, onStatus);
            return;
          }
          applyOff(symbol, (await lockedFetch(symbol, tf, 2)).slice(-2)).forEach(onCandle); onStatus(true);
        } catch (e) { onStatus(false); }
      }
      timer = setTimeout(tick, fxSrc() === 'yahoo' ? 10000 : 30000);
    }
    timer = setTimeout(tick, 5000); onStatus(true);
    return { close: function () { stop = true; clearTimeout(timer); if (inner) inner.close(); } };
  };
  R.data.demo = function (symbol, sec, n, endTimeSec) {
    var arr = origD.apply(R.data, arguments);
    if (!isFx(symbol)) return arr;
    var k = (FXBASE[symbol] || 1) / 100;
    return arr.map(function (c) { return { time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k, volume: c.volume }; });
  };

  /* =====================================================
     ২) হিসাবের ফাংশন (রিস্ক ও জার্নাল)
     ===================================================== */
  function calcRisk(o) {
    var bal = +o.balance, rp = +o.riskPct, e = +o.entry, s = +o.stop;
    var t = (o.target === '' || o.target == null) ? NaN : +o.target;
    if (!(bal > 0 && rp > 0 && e > 0 && s > 0)) return { error: 'ব্যালেন্স, রিস্ক %, এন্ট্রি ও স্টপলস দাও' };
    if (e === s) return { error: 'এন্ট্রি আর স্টপলস এক হতে পারে না' };
    var risk = bal * rp / 100, dist = Math.abs(e - s), units = risk / dist;
    var out = { side: s < e ? 'buy' : 'sell', riskAmt: risk, dist: dist, units: units, value: units * e, lots: units / 100000 };
    if (isFinite(t)) {
      var ok = out.side === 'buy' ? t > e : t < e;
      if (!ok) out.warn = 'টার্গেট ভুল দিকে আছে (' + (out.side === 'buy' ? 'বাই' : 'সেল') + ' ট্রেডে টার্গেট ' + (out.side === 'buy' ? 'এন্ট্রির উপরে' : 'এন্ট্রির নিচে') + ' হবে)';
      else {
        var rew = Math.abs(t - e);
        out.rr = rew / dist; out.profit = units * rew; out.breakEven = 100 / (1 + out.rr);
      }
    }
    if (rp > 2) out.caution = 'ঝুঁকি ২% এর বেশি। নতুনদের জন্য ১-২% এর মধ্যে রাখাই নিরাপদ।';
    return out;
  }
  function calcR(tr) {
    var e = +tr.entry, s = +tr.stop, risk = Math.abs(e - s);
    if (!risk || tr.exit == null || tr.exit === '' || !isFinite(+tr.exit)) return null;
    var d = tr.side === 'buy' ? (+tr.exit - e) : (e - +tr.exit);
    return d / risk;
  }
  function stats(trades) {
    var rs = trades.map(calcR).filter(function (x) { return x != null; });
    var wins = rs.filter(function (x) { return x > 0; }), loss = rs.filter(function (x) { return x <= 0; });
    var sum = rs.reduce(function (a, b) { return a + b; }, 0);
    var gw = wins.reduce(function (a, b) { return a + b; }, 0), gl = -loss.reduce(function (a, b) { return a + b; }, 0);
    return {
      total: trades.length, closed: rs.length,
      winRate: rs.length ? wins.length / rs.length * 100 : 0,
      avgR: rs.length ? sum / rs.length : 0, totalR: sum,
      pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      best: rs.length ? Math.max.apply(null, rs) : 0, worst: rs.length ? Math.min.apply(null, rs) : 0
    };
  }
  R.tools = { calcRisk: calcRisk, calcR: calcR, stats: stats };

  if (typeof document === 'undefined') return;

  /* =====================================================
     ৩) UI
     ===================================================== */
  function $(id) { return document.getElementById(id); }
  function fld(id, label, extra, full) {
    return '<label class="field' + (full ? ' full' : '') + '"><span>' + label + '</span><input id="' + id + '" type="number" inputmode="decimal" step="any" ' + (extra || '') + '></label>';
  }
  function money(x) { return (x < 0 ? '-' : '') + '$' + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function sgn(x, d) { return (x >= 0 ? '+' : '') + x.toFixed(d == null ? 2 : d); }

  /* ---------- টুলস পেজ ---------- */
  function buildTools() {
    var el = $('view-tools');
    el.innerHTML =
      '<h2 class="pg">রিস্ক ক্যালকুলেটর</h2>' +
      '<div class="card"><div class="fgrid">' +
      fld('rc-bal', 'ব্যালেন্স ($)', 'placeholder="1000"') + fld('rc-risk', 'রিস্ক (%)', 'placeholder="1"') +
      fld('rc-entry', 'এন্ট্রি দাম') + fld('rc-stop', 'স্টপলস') +
      fld('rc-target', 'টার্গেট (ঐচ্ছিক)', '', true) + '</div>' +
      '<div class="btnrow"><button class="btn" id="rc-price">চার্টের এখনকার দাম এন্ট্রিতে বসাও</button></div></div>' +
      '<div class="card" id="rc-out"><span class="muted">উপরের ঘরগুলো পূরণ করলে হিসাব এখানে আসবে।</span></div>' +
      '<div class="note-info">USD কোটেড ফরেক্স পেয়ারে (যেমন EUR/USD, GBP/USD) লট ≈ ইউনিট ÷ ১,০০,০০০। USD/JPY বা জোড়ার ক্ষেত্রে লাভ-লস অন্য মুদ্রায় আসে, তাই ব্রোকারের ক্যালকুলেটরে মিলিয়ে নিও।</div>' +
      '<h2 class="pg" style="margin-top:22px">ফরেক্স ডেটা সেটিংস</h2>' +
      '<div class="card"><label class="field"><span>Yahoo প্রক্সি URL (key লাগে না)</span><input id="px-url" type="url" autocomplete="off" placeholder="https://rtx-proxy.onrender.com"></label>' +
      '<label class="field"><span>ফরেক্স/সোনার সোর্স</span><select id="fx-src"><option value="">অটো (প্রক্সি থাকলে Yahoo)</option><option value="td">Twelve Data (key লাগবে)</option></select></label>' +
      '<div class="btnrow"><button class="btn primary" id="px-save">সেভ করো</button></div>' +
      '<div class="note-info">প্রক্সি দিলে গোল্ড (XAU/USD স্পট) ও BTC/USD Yahoo থেকে আসবে, Twelve Data লাগবে না। ফাঁকা রাখলে নিচের Twelve Data key ব্যবহার হবে।</div></div>' +
      '<div class="card"><label class="field"><span>গোল্ডের দামের অফসেট ($, Exness-এর সাথে মেলাতে)</span><input id="go-off" type="number" step="any" placeholder="0"></label>' +
      '<div class="btnrow"><button class="btn primary" id="go-save">সেভ করো</button></div>' +
      '<div class="note-info">কীভাবে মেলাবে: Exness-এ গোল্ডের এখনকার দাম আর এই চার্টের দাম একই সময়ে দেখো। যদি Exness ২ ডলার বেশি দেখায় তবে +2 লেখো, কম দেখালে -2। সব ক্যান্ডেল সেই পরিমাণ সরে যাবে। Exness-এর নিজস্ব ফিড হুবহু পাওয়া যায় না, তাই অফসেট কখনো কখনো আবার ঠিক করতে হতে পারে।</div></div>' +
      '<div class="card"><label class="field"><span>Twelve Data API key</span><input id="td-key" type="password" autocomplete="off" placeholder="এখানে key বসাও"></label>' +
      '<div class="btnrow"><button class="btn primary" id="td-save">সেভ করো</button></div>' +
      '<div class="note-info">twelvedata.com এ ফ্রি অ্যাকাউন্ট খুলে key নাও। ফ্রি প্ল্যানে রিকোয়েস্টের সীমা আছে (সাইটে দেখে নিও), তাই ফরেক্স চার্ট প্রতি ২০ সেকেন্ডে একবার আপডেট হয়। key শুধু তোমার ফোনের ব্রাউজারে সেভ থাকে, কোডে বা GitHub-এ যায় না।</div></div>';

    $('rc-bal').value = lsGet('rtx_rc_bal', ''); $('rc-risk').value = lsGet('rtx_rc_risk', '1');
    $('td-key').value = tdKey(); $('px-url').value = proxyUrl(); try { $('fx-src').value = localStorage.getItem('rtx_fxsrc') || ''; } catch (_) {}
    $('px-save').onclick = function () {
      var v = $('px-url').value.trim();
      try { if (v) localStorage.setItem('rtx_proxy', v); else localStorage.removeItem('rtx_proxy'); var fv = $('fx-src').value; if (fv) localStorage.setItem('rtx_fxsrc', fv); else localStorage.removeItem('rtx_fxsrc'); } catch (_) {}
      say('সেভ হয়েছে, রিলোড হচ্ছে…'); setTimeout(function () { location.reload(); }, 800);
    };

    function calc() {
      var o = { balance: $('rc-bal').value, riskPct: $('rc-risk').value, entry: $('rc-entry').value, stop: $('rc-stop').value, target: $('rc-target').value };
      lsSet('rtx_rc_bal', o.balance); lsSet('rtx_rc_risk', o.riskPct);
      var r = calcRisk(o), out = $('rc-out');
      if (r.error) { out.innerHTML = '<span class="muted">' + r.error + '</span>'; return; }
      var h = '<div class="kv"><span>দিক</span><b>' + (r.side === 'buy' ? 'বাই (লং)' : 'সেল (শর্ট)') + '</b></div>' +
        '<div class="kv"><span>সর্বোচ্চ ঝুঁকি</span><b>' + money(r.riskAmt) + '</b></div>' +
        '<div class="kv"><span>স্টপলস দূরত্ব</span><b>' + r.dist.toPrecision(5) + '</b></div>' +
        '<div class="kv"><span>পজিশন সাইজ</span><b>' + r.units.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' ইউনিট</b></div>' +
        '<div class="kv"><span>ফরেক্স লট (≈)</span><b>' + r.lots.toFixed(3) + '</b></div>' +
        '<div class="kv"><span>পজিশনের মোট মূল্য</span><b>' + money(r.value) + '</b></div>';
      if (r.rr != null) h += '<div class="kv"><span>রিস্ক : রিওয়ার্ড</span><b>1 : ' + r.rr.toFixed(2) + '</b></div>' +
        '<div class="kv"><span>টার্গেটে সম্ভাব্য লাভ</span><b>' + money(r.profit) + '</b></div>' +
        '<div class="kv"><span>লাভে থাকতে ন্যূনতম উইন রেট</span><b>' + r.breakEven.toFixed(1) + '%</b></div>';
      if (r.rr != null && r.rr < 2) h += '<div class="note-warn">R:R ১:২ এর কম। ভালো ট্রেডে কমপক্ষে ১:২ রাখার চেষ্টা করো।</div>';
      if (r.warn) h += '<div class="note-warn">' + r.warn + '</div>';
      if (r.caution) h += '<div class="note-warn">' + r.caution + '</div>';
      out.innerHTML = h;
    }
    ['rc-bal', 'rc-risk', 'rc-entry', 'rc-stop', 'rc-target'].forEach(function (id) { $(id).addEventListener('input', calc); });
    $('rc-price').onclick = function () {
      var c = R.chart.last(); if (!c) { say('চার্টে এখনো দাম আসেনি'); return; }
      $('rc-entry').value = R.chart.fmt(c.close); calc();
    };
    try { $('go-off').value = localStorage.getItem('rtx_gold_off') || ''; } catch (_) {}
    $('go-save').onclick = function () {
      var v = parseFloat($('go-off').value);
      try { if (isFinite(v) && v !== 0) localStorage.setItem('rtx_gold_off', String(v)); else localStorage.removeItem('rtx_gold_off'); } catch (_) {}
      say('অফসেট সেভ হয়েছে, রিলোড হচ্ছে…'); setTimeout(function () { location.reload(); }, 800);
    };
    $('td-save').onclick = function () {
      var v = $('td-key').value.trim();
      try { if (v) localStorage.setItem('rtx_td_key', v); else localStorage.removeItem('rtx_td_key'); } catch (_) {}
      say(v ? 'key সেভ হয়েছে, রিলোড হচ্ছে…' : 'key মুছে ফেলা হয়েছে');
      setTimeout(function () { location.reload(); }, 800);
    };
    calc();
  }

  /* ---------- জার্নাল ---------- */
  function trades() { return lsGet('rtx_journal', []); }
  function saveTrades(t) { lsSet('rtx_journal', t); }

  function buildJournal() {
    var el = $('view-journal');
    var curSym = lsGet('rtx_sym', 'BTCUSDT');
    var opts = R.SYMBOLS.map(function (s) { return '<option value="' + s.id + '"' + (s.id === curSym ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('');
    el.innerHTML =
      '<h2 class="pg">ট্রেড জার্নাল</h2>' +
      '<div class="sgrid" id="j-stats"></div>' +
      '<div class="card"><b>ইকুইটি কার্ভ (R এ)</b><canvas id="j-eq"></canvas></div>' +
      '<details class="fold" id="j-fold"><summary>＋ নতুন ট্রেড যোগ করো</summary><div class="fbody"><div class="fgrid">' +
      '<label class="field"><span>সিম্বল</span><select id="j-sym">' + opts + '</select></label>' +
      '<label class="field"><span>দিক</span><select id="j-side"><option value="buy">বাই</option><option value="sell">সেল</option></select></label>' +
      fld('j-entry', 'এন্ট্রি') + fld('j-stop', 'স্টপলস') + fld('j-target', 'টার্গেট') + fld('j-exit', 'এক্সিট (পরে দিলেও চলবে)') +
      '<label class="field full"><span>কেন ঢুকলাম?</span><textarea id="j-reason" placeholder="ট্রেন্ড, লেভেল, সিগন্যাল…"></textarea></label>' +
      '<label class="field full"><span>শিক্ষা / ভুল (পরে লিখলেও চলবে)</span><textarea id="j-lesson"></textarea></label></div>' +
      '<div class="note-info" id="j-prev"></div>' +
      '<div class="btnrow"><button class="btn primary" id="j-add">জার্নালে যোগ করো</button><button class="btn" id="j-price">চার্টের দাম</button></div></div></details>' +
      '<div id="j-list"></div>' +
      '<div class="btnrow"><button class="btn" id="j-csv">CSV এক্সপোর্ট (ব্যাকআপ)</button></div>' +
      '<div class="note-info">জার্নাল শুধু এই ফোনের ব্রাউজারে সেভ থাকে। ব্রাউজারের ডেটা মুছলে হারিয়ে যাবে, তাই মাঝে মাঝে CSV এক্সপোর্ট করে রাখো।</div>';

    function preview() {
      var e = +$('j-entry').value, s = +$('j-stop').value, t = +$('j-target').value, side = $('j-side').value, msg = '';
      if (e > 0 && s > 0 && e !== s) {
        if ((side === 'buy' && s > e) || (side === 'sell' && s < e)) msg = 'স্টপলস ভুল দিকে আছে।';
        else if (t > 0) {
          var rr = Math.abs(t - e) / Math.abs(e - s);
          msg = 'R:R = 1 : ' + rr.toFixed(2) + (rr < 2 ? '  (১:২ এর কম, ভেবে দেখো)' : '  ✓');
        }
      }
      $('j-prev').textContent = msg;
    }
    ['j-entry', 'j-stop', 'j-target', 'j-side'].forEach(function (id) { $(id).addEventListener('input', preview); });
    $('j-price').onclick = function () {
      var c = R.chart.last(); if (!c) { say('চার্টে এখনো দাম আসেনি'); return; }
      $('j-entry').value = R.chart.fmt(c.close); preview();
    };
    $('j-add').onclick = function () {
      var tr = {
        id: 't' + Date.now().toString(36), ts: Date.now(), symbol: $('j-sym').value, side: $('j-side').value,
        entry: +$('j-entry').value, stop: +$('j-stop').value,
        target: $('j-target').value === '' ? null : +$('j-target').value,
        exit: $('j-exit').value === '' ? null : +$('j-exit').value,
        reason: $('j-reason').value.trim(), lesson: $('j-lesson').value.trim()
      };
      if (!(tr.entry > 0 && tr.stop > 0) || tr.entry === tr.stop) { say('এন্ট্রি ও স্টপলস ঠিকভাবে দাও'); return; }
      if ((tr.side === 'buy' && tr.stop > tr.entry) || (tr.side === 'sell' && tr.stop < tr.entry)) { say('স্টপলস ভুল দিকে আছে'); return; }
      var all = trades(); all.push(tr); saveTrades(all);
      ['j-entry', 'j-stop', 'j-target', 'j-exit', 'j-reason', 'j-lesson'].forEach(function (id) { $(id).value = ''; });
      $('j-prev').textContent = ''; $('j-fold').open = false;
      say('জার্নালে যোগ হয়েছে'); refresh();
    };
    $('j-csv').onclick = function () {
      var rows = [['তারিখ', 'সিম্বল', 'দিক', 'এন্ট্রি', 'স্টপলস', 'টার্গেট', 'এক্সিট', 'R', 'কারণ', 'শিক্ষা']];
      trades().forEach(function (t) {
        var r = calcR(t);
        rows.push([new Date(t.ts).toISOString(), t.symbol, t.side, t.entry, t.stop, t.target == null ? '' : t.target, t.exit == null ? '' : t.exit, r == null ? '' : r.toFixed(2), t.reason, t.lesson]);
      });
      var csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
      a.download = 'rtx-journal.csv'; document.body.appendChild(a); a.click(); a.remove();
    };
    $('j-list').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]'), ex = e.target.closest('[data-exit]');
      if (del && confirm('এই ট্রেড মুছবে?')) { saveTrades(trades().filter(function (t) { return t.id !== del.dataset.del; })); refresh(); }
      if (ex) {
        var v = prompt('এক্সিট দাম কত?'); if (v == null || v === '' || !isFinite(+v)) return;
        var all = trades(); all.forEach(function (t) { if (t.id === ex.dataset.exit) t.exit = +v; }); saveTrades(all); refresh();
      }
    });
    document.getElementById('bottomnav').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b && b.dataset.view === 'journal') setTimeout(refresh, 0);
    });
    refresh();
  }

  function drawEq(all) {
    var cv = $('j-eq'); if (!cv) return;
    var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    var d = window.devicePixelRatio || 1; cv.width = w * d; cv.height = h * d;
    var c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h);
    var closed = all.filter(function (t) { return calcR(t) != null; }).sort(function (a, b) { return a.ts - b.ts; });
    if (closed.length < 1) { c.fillStyle = '#666'; c.font = '12px system-ui,sans-serif'; c.fillText('ট্রেড বন্ধ (এক্সিট দেওয়া) হলে এখানে গ্রাফ আসবে', 4, h / 2); return; }
    var pts = [0], s = 0; closed.forEach(function (t) { s += calcR(t); pts.push(s); });
    var mn = Math.min.apply(null, pts.concat(0)), mx = Math.max.apply(null, pts.concat(0));
    if (mx === mn) { mx += 1; mn -= 1; }
    var pad = 12, X = function (i) { return pad + (w - 2 * pad) * (pts.length === 1 ? 0 : i / (pts.length - 1)); };
    var Y = function (v) { return h - pad - (h - 2 * pad) * (v - mn) / (mx - mn); };
    c.strokeStyle = '#333'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, Y(0)); c.lineTo(w, Y(0)); c.stroke(); c.setLineDash([]);
    c.strokeStyle = '#2979ff'; c.lineWidth = 2; c.beginPath();
    pts.forEach(function (v, i) { if (i) c.lineTo(X(i), Y(v)); else c.moveTo(X(i), Y(v)); }); c.stroke();
    c.fillStyle = '#fff'; c.font = '11px system-ui,sans-serif'; c.fillText(sgn(s) + 'R', Math.min(w - 50, X(pts.length - 1) - 14), Math.max(12, Y(s) - 8));
  }

  function refresh() {
    var all = trades(), st = stats(all);
    var cell = function (v, l) { return '<div class="scell"><b>' + v + '</b><span>' + l + '</span></div>'; };
    $('j-stats').innerHTML =
      cell(st.closed + ' / ' + st.total, 'বন্ধ / মোট ট্রেড') + cell(st.winRate.toFixed(0) + '%', 'উইন রেট') +
      cell(sgn(st.avgR) + 'R', 'গড় R (এক্সপেক্টেন্সি)') + cell(sgn(st.totalR) + 'R', 'মোট R') +
      cell(st.pf === Infinity ? '∞' : st.pf.toFixed(2), 'প্রফিট ফ্যাক্টর') + cell(sgn(st.best) + 'R / ' + sgn(st.worst) + 'R', 'সেরা / সবচেয়ে খারাপ');
    var list = all.slice().sort(function (a, b) { return b.ts - a.ts; });
    $('j-list').innerHTML = list.length ? list.map(function (t) {
      var r = calcR(t), when = new Date(t.ts).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      var res = r == null ? '<button class="btn" data-exit="' + t.id + '">এক্সিট দাও</button>'
        : '<span class="res ' + (r > 0 ? 'up' : 'dn') + '">' + sgn(r) + 'R</span> <span class="muted">এক্সিট ' + t.exit + '</span>';
      return '<div class="trade"><div class="th"><b>' + esc(t.symbol) + '</b><span class="badge ' + t.side + '">' + (t.side === 'buy' ? 'BUY' : 'SELL') + '</span><span class="muted">' + when + '</span><button class="del" data-del="' + t.id + '">✕</button></div>' +
        '<div class="txt">এন্ট্রি ' + t.entry + ' · স্টপ ' + t.stop + (t.target != null ? ' · টার্গেট ' + t.target : '') + '</div><div>' + res + '</div>' +
        (t.reason ? '<div class="txt"><i>কারণ:</i> ' + esc(t.reason) + '</div>' : '') +
        (t.lesson ? '<div class="txt"><i>শিক্ষা:</i> ' + esc(t.lesson) + '</div>' : '') + '</div>';
    }).join('') : '<div class="card muted">এখনো কোনো ট্রেড নেই। পেপার ট্রেড লিখে শুরু করো।</div>';
    drawEq(all);
  }

  buildTools();
  buildJournal();
})(window.RTX);
