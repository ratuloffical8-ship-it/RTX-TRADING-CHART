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
    { id: 'EUR/USD', base: 1.08 }, { id: 'GBP/USD', base: 1.27 }, { id: 'USD/JPY', base: 150 },
    { id: 'AUD/USD', base: 0.66 }, { id: 'USD/CAD', base: 1.36 }, { id: 'USD/CHF', base: 0.88 },
    { id: 'GBP/JPY', base: 190 }, { id: 'XAU/USD', base: 2650, name: 'XAU/USD (Gold)' }
  ];
  var FXBASE = {};
  FX.forEach(function (s) { FXBASE[s.id] = s.base; R.SYMBOLS.push({ id: s.id, name: s.name || s.id }); });
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
  async function td(symbol, tf, size, endTime) {
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
  var YSYM = { 'EUR/USD': 'EURUSD=X', 'GBP/USD': 'GBPUSD=X', 'USD/JPY': 'USDJPY=X', 'AUD/USD': 'AUDUSD=X', 'USD/CAD': 'USDCAD=X', 'USD/CHF': 'USDCHF=X', 'GBP/JPY': 'GBPJPY=X', 'XAU/USD': 'GC=F' };
  // tf -> [Yahoo interval, বেস সেকেন্ড, গুণক, সর্বোচ্চ দিন]
  var YTF = { '1m': ['1m', 60, 1, 7], '3m': ['1m', 60, 3, 7], '5m': ['5m', 300, 1, 59], '15m': ['15m', 900, 1, 59], '30m': ['30m', 1800, 1, 59],
    '1h': ['60m', 3600, 1, 720], '4h': ['60m', 3600, 4, 720], '1d': ['1d', 86400, 1, 7000], '1w': ['1wk', 604800, 1, 7000] };
  function proxyUrl() { var v = ''; try { v = localStorage.getItem('rtx_proxy') || ''; } catch (_) {} return v.replace(/\/+$/, ''); }
  async function yh(symbol, tf, size, endTime) {
    var base = proxyUrl(); if (!base) throw new Error('NO_PROXY');
    var m = YTF[tf], ys = YSYM[symbol]; if (!m || !ys) throw new Error('এই টাইমফ্রেম/সিম্বল Yahoo-তে নেই');
    var need = size * m[2] + m[2] + 2, p2 = endTime ? Math.floor(endTime / 1000) : Math.floor(Date.now() / 1000) + m[1];
    var span = Math.min(m[3] * 86400, Math.ceil(need * m[1] * 1.5) + 3 * 86400);
    var url = base + '/y?symbol=' + encodeURIComponent(ys) + '&interval=' + m[0] + '&p1=' + (p2 - span) + '&p2=' + p2;
    var r = await fetch(url), j = await r.json();
    var res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.timestamp) throw new Error((j && (j.error || (j.chart && j.chart.error && j.chart.error.description))) || 'Yahoo থেকে ডেটা আসেনি');
    var q = res.indicators.quote[0], cs = [];
    for (var i = 0; i < res.timestamp.length; i++) {
      if (q.open[i] == null || q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
      cs.push({ time: res.timestamp[i], open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume && q.volume[i] ? q.volume[i] : 0 });
    }
    cs = cs.filter(function (c, i) { return i === 0 || c.time !== cs[i - 1].time; });
    if (m[2] > 1) cs = agg(cs, m[1] * m[2]);
    return cs.slice(-size);
  }
  async function fxFetch(symbol, tf, size, endTime) {
    if (proxyUrl()) return yh(symbol, tf, size, endTime);
    return td(symbol, tf, size, endTime);
  }
  R.forex = { parseDT: parseDT, fmtDT: fmtDT, agg: agg, isFx: isFx };

  var origK = R.data.klines, origL = R.data.live, origD = R.data.demo;
  R.data.klines = async function (symbol, tf, limit, endTime) {
    if (!isFx(symbol)) return origK.apply(R.data, arguments);
    try {
      var cs = await fxFetch(symbol, tf, Math.min(limit || 1000, 1000), endTime);
      if (tf === '3m' && cs.length > 1) cs.shift();
      return cs;
    } catch (e) {
      var m = (e.message === 'NO_KEY' || e.message === 'NO_PROXY') ? 'ফরেক্স দেখতে 🧮 টুলস ট্যাবে Yahoo প্রক্সির URL (বা Twelve Data key) দাও' : 'ফরেক্স ডেটা সমস্যা: ' + e.message;
      setTimeout(function () { say(m); }, 3200);
      throw e;
    }
  };
  R.data.live = function (symbol, tf, onCandle, onStatus) {
    if (!isFx(symbol)) return origL.apply(R.data, arguments);
    var stop = false, timer;
    async function tick() {
      if (stop) return;
      if (typeof document === 'undefined' || !document.hidden) {
        try { (await fxFetch(symbol, tf, 2)).slice(-2).forEach(onCandle); onStatus(true); }
        catch (e) { onStatus(false); }
      }
      timer = setTimeout(tick, proxyUrl() ? 10000 : 20000);
    }
    timer = setTimeout(tick, 5000); onStatus(true);
    return { close: function () { stop = true; clearTimeout(timer); } };
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
      '<div class="btnrow"><button class="btn primary" id="px-save">সেভ করো</button></div>' +
      '<div class="note-info">প্রক্সি দিলে ফরেক্স ও সোনা (GC=F) Yahoo থেকে আসবে, Twelve Data লাগবে না। ফাঁকা রাখলে নিচের Twelve Data key ব্যবহার হবে।</div></div>' +
      '<div class="card"><label class="field"><span>Twelve Data API key</span><input id="td-key" type="password" autocomplete="off" placeholder="এখানে key বসাও"></label>' +
      '<div class="btnrow"><button class="btn primary" id="td-save">সেভ করো</button></div>' +
      '<div class="note-info">twelvedata.com এ ফ্রি অ্যাকাউন্ট খুলে key নাও। ফ্রি প্ল্যানে রিকোয়েস্টের সীমা আছে (সাইটে দেখে নিও), তাই ফরেক্স চার্ট প্রতি ২০ সেকেন্ডে একবার আপডেট হয়। key শুধু তোমার ফোনের ব্রাউজারে সেভ থাকে, কোডে বা GitHub-এ যায় না।</div></div>';

    $('rc-bal').value = lsGet('rtx_rc_bal', ''); $('rc-risk').value = lsGet('rtx_rc_risk', '1');
    $('td-key').value = tdKey(); $('px-url').value = proxyUrl();
    $('px-save').onclick = function () {
      var v = $('px-url').value.trim();
      try { if (v) localStorage.setItem('rtx_proxy', v); else localStorage.removeItem('rtx_proxy'); } catch (_) {}
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
