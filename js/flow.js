// ফাইলের নাম: flow.js
// পাথ: js/flow.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — 📊 অর্ডারফ্লো (শুধু ক্রিপ্টো: BTC, ETH, ETC)
   ডেটা সরাসরি Binance থেকে ব্রাউজারে আসে (কোনো key, কোনো সার্ভার লাগে না):
   • aggTrade স্ট্রিম  → Time & Sales (টেপ), Delta, Footprint
   • depth20 স্ট্রিম    → DOM (লাইভ অর্ডারবুক ল্যাডার)
   • REST depth (৩ সেকেন্ডে একবার, হিটম্যাপ ট্যাব খোলা থাকলে) → লিকুইডিটি হিটম্যাপ
   • klines-এর taker-buy ভলিউম → আসল ঐতিহাসিক Delta ও CVD (লাইভ স্ট্রিম ছাড়াই ইতিহাস পাওয়া যায়)
   গোল্ড (XAU/USD): OTC বাজার, আসল ট্রেড/অর্ডারবুক ডেটা কেউ ফ্রি দেয় না, তাই এখানে এগুলো নেই। এটা লুকাইনি, ট্যাবে স্পষ্ট লেখা আছে।
   গুরুত্বপূর্ণ সীমা: Footprint/টেপ/হিটম্যাপ শুধু সাইট খোলা থাকা সময়ের লাইভ ডেটা থেকে জমে, পুরোনো ক্যান্ডেলের ফুটপ্রিন্ট ফ্রিতে পাওয়া যায় না।
   এগুলো সিগন্যালের "কনফার্মেশন" হিসেবে কাজ করে (বোনাস স্কোর), কোনোটিই একা সিগন্যাল দেয় না। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';
  if (typeof document === 'undefined') return;

  var MAP = { BTCUSDT: 'BTCUSDT', 'BTC/USD': 'BTCUSDT', ETHUSDT: 'ETHUSDT', ETCUSDT: 'ETCUSDT' };
  var BIG = { BTCUSDT: 0.5, ETHUSDT: 5, ETCUSDT: 500 };      // "বড় ট্রেড" সীমা (কয়েন)
  var TFS = { '1m': 60, '5m': 300, '15m': 900 };
  var BLUE = '#2979ff', WHITE = '#e8e8e8';

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function curSym() { var s = $('symbol'); return s ? s.value : ''; }
  function supported(sym) { return !!MAP[sym]; }
  function niceStep(price) {
    var t = price * 0.00012, e = Math.pow(10, Math.floor(Math.log(t) / Math.LN10)), m = t / e;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
  }
  function dd() { return ST.dec === undefined || ST.dec === null ? 2 : ST.dec; }
  function fmt(n, d) { return Number(n).toFixed(d); }
  function decOf(step) { var s = String(step); return s.indexOf('.') < 0 ? 0 : s.split('.')[1].length; }

  /* ---------- অবস্থা ---------- */
  var ST = { sym: null, ws: null, closed: true, retry: 0, tape: [], bucket: {}, order: [], bids: [], asks: [], hist: [], heat: [], tf: lsGet('rtx_flow_tf', '5m'), step: 0, dec: 2, big: 0.5, lastPx: 0, tab: lsGet('rtx_flow_tab', 'delta'), histSym: null, connected: false, started: 0, trades: 0, heatTimer: null, fpIdx: 0 };

  function reset(sym) {
    ST.sym = sym; ST.tape = []; ST.bucket = {}; ST.order = []; ST.bids = []; ST.asks = []; ST.hist = []; ST.heat = []; ST.step = 0; ST.lastPx = 0; ST.trades = 0; ST.started = Date.now(); ST.big = BIG[sym] || 1; ST.fpIdx = 0;
  }
  function bucketFor(t) {
    var sec = TFS[ST.tf] || 300, k = Math.floor(t / 1000 / sec) * sec, b = ST.bucket[ST.tf + k];
    if (!b) {
      b = ST.bucket[ST.tf + k] = { t: k, o: null, h: -Infinity, l: Infinity, c: null, buy: 0, sell: 0, lv: {} };
      ST.order.push(ST.tf + k); if (ST.order.length > 80) { delete ST.bucket[ST.order.shift()]; }
    }
    return b;
  }
  function onTrade(p, q, isBuyerMaker, t) {
    if (!ST.step) { ST.step = niceStep(p); ST.dec = decOf(ST.step); }
    var side = isBuyerMaker ? 's' : 'b';                      // buyer maker = বিক্রেতা আগ্রাসী
    ST.lastPx = p; ST.trades++;
    ST.tape.unshift({ t: t, p: p, q: q, s: side }); if (ST.tape.length > 80) ST.tape.pop();
    var b = bucketFor(t); if (b.o === null) b.o = p; b.c = p; if (p > b.h) b.h = p; if (p < b.l) b.l = p;
    var key = (Math.round(p / ST.step) * ST.step).toFixed(ST.dec), lv = b.lv[key] || (b.lv[key] = { b: 0, s: 0 });
    if (side === 'b') { b.buy += q; lv.b += q; } else { b.sell += q; lv.s += q; }
  }

  /* ---------- সংযোগ ---------- */
  function connect() {
    if (!ST.sym) return;
    var s = ST.sym.toLowerCase();
    try { ST.ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + s + '@aggTrade/' + s + '@depth20@100ms'); } catch (e) { sched(); return; }
    ST.closed = false;
    ST.ws.onopen = function () { ST.connected = true; ST.retry = 0; if (ST.started === 0) ST.started = Date.now(); paintSoft(); };
    ST.ws.onmessage = function (e) {
      try {
        var m = JSON.parse(e.data), d = m.data; if (!d) return;
        if (d.e === 'aggTrade') onTrade(+d.p, +d.q, !!d.m, d.T);
        else if (d.bids) { ST.bids = d.bids.map(function (x) { return [+x[0], +x[1]]; }); ST.asks = d.asks.map(function (x) { return [+x[0], +x[1]]; }); }
      } catch (_) {}
    };
    ST.ws.onclose = function () { ST.connected = false; if (!ST.closed) sched(); };
    ST.ws.onerror = function () { try { ST.ws.close(); } catch (_) {} };
  }
  function sched() { ST.retry++; setTimeout(function () { if (!ST.closed) connect(); }, Math.min(1000 * ST.retry, 6000)); }
  function stop() { ST.closed = true; ST.connected = false; try { ST.ws && ST.ws.close(); } catch (_) {} ST.ws = null; }
  function ensure() {
    var sym = MAP[curSym()];
    if (!sym) { stop(); return false; }
    if (ST.sym !== sym || !ST.ws) { stop(); reset(sym); connect(); loadHist(); }
    return true;
  }

  /* ---------- ঐতিহাসিক Delta (taker-buy ভলিউম থেকে, আসল ডেটা) ---------- */
  async function loadHist(symArg) {
    var sym = symArg || ST.sym, tf = ST.tf; if (!sym || !R.data) return;
    ST.histWant = sym; ST.histT = Date.now();
    try {
      var cs = await R.data.klines(sym, tf, 200); if (ST.histWant !== sym || ST.tf !== tf) return; ST.histSym = sym;
      var cvd = 0; ST.hist = cs.filter(function (c) { return c.buyVol !== undefined; }).map(function (c) { var d = 2 * c.buyVol - c.volume; cvd += d; return { t: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume, d: d, cvd: cvd }; });
      paintSoft();
    } catch (_) {}
  }
  function histWithLive() {
    var h = ST.hist.slice(), sec = TFS[ST.tf] || 300, nowB = ST.bucket[ST.tf + Math.floor(Date.now() / 1000 / sec) * sec];
    if (h.length && nowB && nowB.o !== null) { var last = h[h.length - 1]; if (last.t === nowB.t) { /* চলমান ক্যান্ডেল: ইতিহাসের মান আরও নির্ভুল, তাই লাইভ ডেল্টা আলাদা দেখাই */ } }
    return h;
  }

  /* ---------- সিগন্যালের জন্য: শেষ ক্যান্ডেলগুলোর Delta বিশ্লেষণ ---------- */
  function insight() {
    var h = ST.hist; if (h.length < 20 || ST.histSym !== MAP[curSym()]) return null;
    var out = [], l = h[h.length - 2] || h[h.length - 1], rng = 0, i, n = 0, avgD = 0;
    for (i = h.length - 16; i < h.length - 1; i++) { rng += (h[i].h - h[i].l); avgD += Math.abs(h[i].d); n++; }
    rng /= n; avgD /= n;
    var lr = l.h - l.l, up = l.c >= l.o;
    if (Math.abs(l.d) > avgD * 1.8 && lr < rng * 0.8) out.push('🧲 শোষণ (Absorption): শেষ বন্ধ ক্যান্ডেলে ' + (l.d > 0 ? 'অনেক আগ্রাসী ক্রয়' : 'অনেক আগ্রাসী বিক্রি') + ' হয়েছে কিন্তু দাম বেশি নড়েনি। উল্টো পক্ষের বড় অর্ডার ওটা শুষে নিচ্ছে, দিক বদলের সম্ভাবনা বাড়ে।');
    if (up && l.d < 0) out.push('⚠️ ডাইভারজেন্স: ক্যান্ডেল ওপরে বন্ধ হয়েছে কিন্তু Delta ঋণাত্মক। ওঠার পেছনে আসল ক্রেতা কম।');
    if (!up && l.d > 0) out.push('⚠️ ডাইভারজেন্স: ক্যান্ডেল নিচে বন্ধ হয়েছে কিন্তু Delta ধনাত্মক। নামার পেছনে আসল বিক্রেতা কম।');
    var a = h[h.length - 6], b = h[h.length - 2];
    if (a && b && b.c > a.c && b.cvd < a.cvd) out.push('📉 CVD ডাইভারজেন্স: গত ৫ ক্যান্ডেলে দাম বেড়েছে কিন্তু CVD কমেছে (ক্রেতার জোর দুর্বল)।');
    if (a && b && b.c < a.c && b.cvd > a.cvd) out.push('📈 CVD ডাইভারজেন্স: গত ৫ ক্যান্ডেলে দাম কমেছে কিন্তু CVD বেড়েছে (বিক্রেতার জোর দুর্বল)।');
    if (!out.length) out.push('এখন বিশেষ কোনো অর্ডারফ্লো সংকেত নেই।');
    return out;
  }
  /* dir: 1 = BUY, -1 = SELL → বর্তমান অর্ডারফ্লো মিলছে কিনা (ultra.js সিগন্যালের পাশে দেখায়) */
  function confirm(dir) {
    var sym = MAP[curSym()]; if (!sym) return { ok: null, note: 'গোল্ডে অর্ডারফ্লো ডেটা নেই (OTC বাজার)।' };
    if (!ST.hist.length || ST.histSym !== sym) return { ok: null, note: 'অর্ডারফ্লো (Delta) লোড হচ্ছে…' };
    var h = ST.hist, l = h[h.length - 2] || h[h.length - 1], p = h[h.length - 3] || l, sum = l.d + p.d, ok = dir === 1 ? sum > 0 : sum < 0;
    return { ok: ok, note: 'শেষ ২ বন্ধ ক্যান্ডেলের Delta ' + (sum >= 0 ? '+' : '') + fmt(sum, sym === 'BTCUSDT' ? 2 : 1) + ' (' + (sum > 0 ? 'ক্রেতা আগ্রাসী' : 'বিক্রেতা আগ্রাসী') + ') — ' + (ok ? 'সিগন্যালের দিকের সাথে মেলে ✅' : 'সিগন্যালের উল্টো ⚠️') };
  }

  /* সিগন্যাল প্যানেল খুললে শুধু ইতিহাস (REST) আনি, লাইভ স্ট্রিম চালু করি না (ব্যাটারি/ডেটা বাঁচাতে) */
  function prime() {
    var sym = MAP[curSym()]; if (!sym) return;
    if (ST.histSym !== sym || !ST.hist.length || Date.now() - (ST.histT || 0) > 45000) loadHist(sym);
  }

  /* ---------- হিটম্যাপ ডেটা (REST depth ৩ সেকেন্ডে একবার) ---------- */
  async function sampleHeat() {
    if (!ST.sym || ST.tab !== 'heat' || !$('fl-sheet') || document.hidden) return;
    try {
      var r = await fetch('https://api.binance.com/api/v3/depth?symbol=' + ST.sym + '&limit=500'); if (!r.ok) return;
      var d = await r.json(), mid = (+d.bids[0][0] + +d.asks[0][0]) / 2, step = ST.step || niceStep(mid), cell = {}, dec = ST.dec;
      function add(a, side) { a.forEach(function (x) { var k = (Math.round(+x[0] / step) * step).toFixed(dec); cell[k] = (cell[k] || 0) + +x[1]; }); }
      add(d.bids, 'b'); add(d.asks, 'a');
      ST.heat.push({ t: Date.now(), mid: mid, cell: cell }); if (ST.heat.length > 120) ST.heat.shift();
      if (ST.tab === 'heat') paintBody();
    } catch (_) {}
  }

  /* ---------- UI ---------- */
  var css = document.createElement('style');
  css.textContent = '#fl-sheet{position:fixed;inset:0;z-index:57;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center}#btn-flow.on{border-color:#2979ff;color:#2979ff}' +
    '.fl-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 10px}.fl-tabs button{flex:1 1 28%;background:#111;border:1px solid #262626;color:#bbb;border-radius:10px;padding:9px 4px;font-size:13px}.fl-tabs button.on{background:var(--blue);border-color:var(--blue);color:#fff}' +
    '.fl-row{display:flex;justify-content:space-between;font:12px/1.9 ui-monospace,Menlo,monospace;border-bottom:1px solid #131313;padding:0 4px}.fl-b{color:' + BLUE + '}.fl-s{color:' + WHITE + '}.fl-big{background:#10203a;font-weight:700}' +
    '.fl-dom{display:grid;grid-template-columns:1fr 1fr 1fr;font:12px/1.9 ui-monospace,Menlo,monospace}.fl-dom div{position:relative;padding:0 6px;border-bottom:1px solid #131313;overflow:hidden}.fl-dom i{position:absolute;top:0;bottom:0;right:0;opacity:.28}' +
    '.fl-fp{width:100%;border-collapse:collapse;font:12px/1.8 ui-monospace,Menlo,monospace;text-align:center}.fl-fp td{border-bottom:1px solid #131313;padding:0 4px}.fl-fp .poc{outline:1px solid #fff}.fl-fp .imb-b{background:#12306a;color:#fff}.fl-fp .imb-s{background:#444;color:#fff}' +
    '.fl-cv{width:100%;display:block;background:#080808;border-radius:8px;margin:6px 0}.fl-note{font-size:12px;color:#9a9a9a;line-height:1.7;margin:6px 0}';
  document.head.appendChild(css);

  function noSupportHtml() {
    return '<div class="card warn"><b>এই মার্কেটে অর্ডারফ্লো নেই</b><div class="fl-note">গোল্ড (XAU/USD) OTC বাজার। এর কোনো কেন্দ্রীয় অর্ডারবুক বা আসল ট্রেড-ফিড নেই, তাই Delta, Footprint, DOM, হিটম্যাপ, টেপ ফ্রিতে (বা টাকা দিয়েও) সঠিকভাবে পাওয়া যায় না। কোনো ফ্রি সাইট এগুলো দেখালে সেটা আনুমানিক বা ভুয়া।<br><br>গোল্ডে সিগন্যালের জন্য সুইপ, CISD, বড় টাইমফ্রেম, সেশন ও VWAP ব্যবহার হচ্ছে।<br><br>BTC, ETH, ETC মার্কেটে গিয়ে 📊 চাপলে এগুলো দেখবে।</div></div>';
  }
  function head() {
    var st = ST.connected ? '<span class="fl-b">● লাইভ</span>' : '<span class="fl-s">○ সংযোগ হচ্ছে…</span>', note = curSym() === 'BTC/USD' ? ' · BTCUSDT-র ফ্লো (BTC/USD-র নয়)' : '';
    var mins = ST.started ? Math.floor((Date.now() - ST.started) / 60000) : 0;
    return '<div class="fl-note">' + esc(ST.sym || '') + note + ' · ' + st + ' · ' + ST.trades + ' ট্রেড জমেছে (' + mins + ' মিনিট ধরে) · ফুটপ্রিন্ট টাইমফ্রেম: ' +
      Object.keys(TFS).map(function (k) { return '<button data-fltf="' + k + '" style="background:' + (ST.tf === k ? 'var(--blue)' : '#111') + ';border:1px solid #262626;color:#fff;border-radius:8px;padding:3px 9px;margin-left:4px">' + k + '</button>'; }).join('') + '</div>';
  }

  /* — ডেল্টা ট্যাব — */
  function deltaHtml() {
    var ins = insight(), h = ST.hist, last = h[h.length - 2];
    var out = '<div class="card"><b>Delta ও CVD (আসল ডেটা)</b><div class="fl-note">Delta = আগ্রাসী ক্রেতার ভলিউম − আগ্রাসী বিক্রেতার ভলিউম। নীল = ক্রেতা জোরালো, সাদা = বিক্রেতা জোরালো। CVD = Delta-র ক্রমযোগ। এই ইতিহাস Binance-এর taker-buy ভলিউম থেকে, তাই পেছনের ক্যান্ডেলেও নির্ভুল।</div>' +
      (h.length ? '<canvas id="fl-cv1" class="fl-cv" height="120"></canvas><canvas id="fl-cv2" class="fl-cv" height="100"></canvas><div class="fl-note">শেষ বন্ধ ক্যান্ডেল: Delta <b class="' + (last.d >= 0 ? 'fl-b' : 'fl-s') + '">' + (last.d >= 0 ? '+' : '') + fmt(last.d, 2) + '</b>, ভলিউম ' + fmt(last.v, 2) + '</div>' : '<div class="note-info">ইতিহাস লোড হচ্ছে…</div>') + '</div>';
    if (ins) out += '<div class="card"><b>🔎 এখনকার অর্ডারফ্লো সংকেত</b>' + ins.map(function (x) { return '<div class="fl-note">' + esc(x) + '</div>'; }).join('') + '<div class="fl-note">এগুলো শুধু কনফার্মেশন, একা সিগন্যাল নয়।</div></div>';
    return out;
  }
  function drawDelta() {
    var h = ST.hist.slice(-60), c1 = $('fl-cv1'), c2 = $('fl-cv2'); if (!h.length || !c1 || !c2) return;
    [c1, c2].forEach(function (c) { c.width = c.clientWidth * (window.devicePixelRatio || 1); c.height = (c === c1 ? 120 : 100) * (window.devicePixelRatio || 1); });
    var g = c1.getContext('2d'), W = c1.width, H = c1.height, mx = 0, i; h.forEach(function (x) { mx = Math.max(mx, Math.abs(x.d)); }); mx = mx || 1;
    g.fillStyle = '#080808'; g.fillRect(0, 0, W, H); g.strokeStyle = '#333'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    var bw = W / h.length;
    h.forEach(function (x, k) { var y = x.d / mx * (H / 2 - 4); g.fillStyle = x.d >= 0 ? BLUE : WHITE; g.fillRect(k * bw + 1, y >= 0 ? H / 2 - y : H / 2, Math.max(1, bw - 2), Math.abs(y)); });
    g = c2.getContext('2d'); W = c2.width; H = c2.height; g.fillStyle = '#080808'; g.fillRect(0, 0, W, H);
    var lo = Infinity, hi = -Infinity; h.forEach(function (x) { lo = Math.min(lo, x.cvd); hi = Math.max(hi, x.cvd); }); if (hi === lo) hi = lo + 1;
    g.strokeStyle = BLUE; g.lineWidth = 2 * (window.devicePixelRatio || 1); g.beginPath();
    h.forEach(function (x, k) { var X = k * bw + bw / 2, Y = H - 6 - (x.cvd - lo) / (hi - lo) * (H - 12); if (k) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.stroke();
    g.fillStyle = '#888'; g.font = (11 * (window.devicePixelRatio || 1)) + 'px sans-serif'; g.fillText('CVD (জমা Delta)', 6, 14 * (window.devicePixelRatio || 1));
  }

  /* — টেপ — */
  function tapeHtml() {
    var d = dd();
    return '<div class="card"><b>Time & Sales (সরাসরি ট্রেডের তালিকা)</b><div class="fl-note">নীল = ক্রেতা আগ্রাসী (দাম আস্কে কিনেছে), সাদা = বিক্রেতা আগ্রাসী। নীল ব্যাকগ্রাউন্ড = বড় ট্রেড (≥ ' + ST.big + ' কয়েন)।</div>' +
      (ST.tape.length ? ST.tape.map(function (x) { var tm = new Date(x.t).toLocaleTimeString('en-GB'); return '<div class="fl-row ' + (x.q >= ST.big ? 'fl-big ' : '') + (x.s === 'b' ? 'fl-b' : 'fl-s') + '"><span>' + tm + '</span><span>' + fmt(x.p, d) + '</span><span>' + fmt(x.q, 4) + '</span></div>'; }).join('') : '<div class="note-info">ট্রেডের অপেক্ষায়…</div>') + '</div>';
  }

  /* — DOM — */
  function domHtml() {
    var A = ST.asks.slice(0, 12), B = ST.bids.slice(0, 12); if (!A.length || !B.length) return '<div class="card"><div class="note-info">অর্ডারবুকের অপেক্ষায়…</div></div>';
    var mx = 0, sb = 0, sa = 0; A.concat(B).forEach(function (x) { mx = Math.max(mx, x[1]); }); B.forEach(function (x) { sb += x[1]; }); A.forEach(function (x) { sa += x[1]; });
    var d = dd(), imb = sb / (sb + sa) * 100, spread = A[0][0] - B[0][0], cumA = 0, cumB = 0;
    var rows = A.slice().reverse().map(function (x, i, arr) { return x; }), out = '';
    var ca = []; A.forEach(function (x) { cumA += x[1]; ca.push(cumA); }); ca.reverse();
    rows.forEach(function (x, i) { out += '<div style="color:#bbb">' + fmt(ca[i], 3) + '</div><div class="fl-s" style="text-align:center;color:' + WHITE + '">' + fmt(x[0], d) + '</div><div>' + fmt(x[1], 4) + '<i style="width:' + (x[1] / mx * 100) + '%;background:' + WHITE + '"></i></div>'; });
    out += '<div></div><div style="text-align:center;background:#161616;color:#fff">স্প্রেড ' + fmt(spread, d) + '</div><div></div>';
    B.forEach(function (x) { cumB += x[1]; out += '<div style="color:#bbb">' + fmt(cumB, 3) + '</div><div class="fl-b" style="text-align:center">' + fmt(x[0], d) + '</div><div>' + fmt(x[1], 4) + '<i style="width:' + (x[1] / mx * 100) + '%;background:' + BLUE + '"></i></div>'; });
    return '<div class="card"><b>DOM (লাইভ অর্ডারবুক, কাছের ১২ লেভেল)</b><div class="fl-note">ওপরে সাদা = বিক্রির অর্ডার (Ask), নিচে নীল = কেনার অর্ডার (Bid)। বাঁয়ে জমা পরিমাণ, ডানে ওই লেভেলের পরিমাণ। কাছের ১০ লেভেলে ক্রেতার ভাগ: <b class="' + (imb >= 50 ? 'fl-b' : 'fl-s') + '">' + fmt(imb, 0) + '%</b> (৫০%-এর বেশি = কেনার চাপ বেশি, তবে অর্ডার যেকোনো সময় সরে যেতে পারে)।</div><div class="fl-dom">' + out + '</div></div>';
  }

  /* — ফুটপ্রিন্ট — */
  function fpHtml() {
    var keys = ST.order.filter(function (k) { return k.indexOf(ST.tf) === 0; }), n = keys.length;
    if (!n) return '<div class="card"><div class="note-info">ফুটপ্রিন্ট জমতে শুরু করেছে, কিছুক্ষণ অপেক্ষা করো। (পুরোনো ক্যান্ডেলের ফুটপ্রিন্ট ফ্রিতে পাওয়া যায় না, সাইট খোলা থাকলে এখন থেকে জমবে।)</div></div>';
    var idx = Math.max(0, Math.min(n - 1, n - 1 - ST.fpIdx)), b = ST.bucket[keys[idx]], d = dd();
    var prices = Object.keys(b.lv).map(Number).sort(function (x, y) { return y - x; }), mxv = 0, poc = null;
    prices.forEach(function (p) { var l = b.lv[p.toFixed(d)] || { b: 0, s: 0 }, t = l.b + l.s; if (t > mxv) { mxv = t; poc = p; } });
    var rows = prices.map(function (p, i) {
      var l = b.lv[p.toFixed(d)], dn = prices[i + 1] !== undefined ? b.lv[prices[i + 1].toFixed(d)] : null, up = prices[i - 1] !== undefined ? b.lv[prices[i - 1].toFixed(d)] : null;
      var impB = dn && l.b >= 3 * Math.max(dn.s, 0.0001) && l.b > 0, impS = up && l.s >= 3 * Math.max(up.b, 0.0001) && l.s > 0;
      return '<tr' + (p === poc ? ' class="poc"' : '') + '><td class="fl-s ' + (impS ? 'imb-s' : '') + '">' + fmt(l.s, 3) + '</td><td>' + fmt(p, d) + (p === poc ? ' ◀POC' : '') + '</td><td class="fl-b ' + (impB ? 'imb-b' : '') + '">' + fmt(l.b, 3) + '</td></tr>';
    }).join('');
    var delta = b.buy - b.sell;
    return '<div class="card"><b>Footprint (' + ST.tf + ' ক্যান্ডেল, প্রতি দামে বিক্রি × ক্রয়)</b><div class="fl-note">বাঁয়ে সাদা = এই দামে আগ্রাসী বিক্রি, ডানে নীল = আগ্রাসী ক্রয়। উজ্জ্বল ঘর = ইমব্যালান্স (বিপরীত দিকের তুলনায় ৩ গুণ বা বেশি, আড়াআড়ি তুলনায়)। ◀POC = সবচেয়ে বেশি ভলিউমের দাম।</div>' +
      '<div class="fl-row"><button class="btn" data-fpmv="1">← আগের</button><span>ক্যান্ডেল ' + new Date(b.t * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + (ST.fpIdx === 0 ? ' (চলমান)' : '') + '</span><button class="btn" data-fpmv="-1"' + (ST.fpIdx === 0 ? ' disabled' : '') + '>পরের →</button></div>' +
      '<div class="fl-row"><span>Delta: <b class="' + (delta >= 0 ? 'fl-b' : 'fl-s') + '">' + (delta >= 0 ? '+' : '') + fmt(delta, 3) + '</b></span><span>মোট: ' + fmt(b.buy + b.sell, 3) + '</span></div>' +
      '<table class="fl-fp">' + rows + '</table></div>';
  }

  /* — হিটম্যাপ — */
  function heatHtml() {
    return '<div class="card"><b>লিকুইডিটি হিটম্যাপ</b><div class="fl-note">কোন দামে কত অর্ডার জমে আছে তার সময়ভিত্তিক ছবি (৩ সেকেন্ডে একটি করে)। উজ্জ্বল = বেশি অর্ডার। সাদা রেখা = বাজারদর। <b>সীমা:</b> Binance-এর কাছের ৫০০ লেভেল (প্রায় ±০.১% রেঞ্জ), এই ট্যাব খোলা থাকলে জমে। বড় প্রতিষ্ঠানের গোপন (iceberg) বা অন্য এক্সচেঞ্জের অর্ডার এখানে দেখা যায় না। অর্ডার সরেও যেতে পারে (স্পুফিং), তাই এটা একা সংকেত নয়।</div><canvas id="fl-hm" class="fl-cv" height="260"></canvas>' + (ST.heat.length < 3 ? '<div class="note-info">ছবি তৈরি হতে ~১৫ সেকেন্ড লাগবে…</div>' : '') + '</div>';
  }
  function drawHeat() {
    var c = $('fl-hm'), H = ST.heat; if (!c || H.length < 2) return;
    var dpr = window.devicePixelRatio || 1; c.width = c.clientWidth * dpr; c.height = 260 * dpr;
    var g = c.getContext('2d'), W = c.width, Hh = c.height, last = H[H.length - 1], mid = last.mid, lo = mid * 0.9992, hi = mid * 1.0008, step = ST.step || niceStep(mid), rows = Math.max(10, Math.round((hi - lo) / step)), ch = Hh / rows, mx = 0, i, k;
    H.forEach(function (s) { Object.keys(s.cell).forEach(function (p) { var pr = +p; if (pr >= lo && pr <= hi && s.cell[p] > mx) mx = s.cell[p]; }); });
    g.fillStyle = '#050505'; g.fillRect(0, 0, W, Hh); var cw = W / 120;
    H.forEach(function (s, xi) {
      Object.keys(s.cell).forEach(function (p) {
        var pr = +p; if (pr < lo || pr > hi) return; var v = Math.sqrt(s.cell[p] / mx), y = Hh - (pr - lo) / (hi - lo) * Hh;
        g.fillStyle = pr <= s.mid ? 'rgba(41,121,255,' + (0.1 + v * 0.9) + ')' : 'rgba(255,255,255,' + (0.08 + v * 0.8) + ')'; g.fillRect((xi + 120 - H.length) * cw, y - ch / 2, cw + 1, ch + 1);
      });
    });
    g.strokeStyle = '#fff'; g.lineWidth = dpr; g.beginPath();
    H.forEach(function (s, xi) { var X = (xi + 120 - H.length) * cw + cw / 2, Y = Hh - (s.mid - lo) / (hi - lo) * Hh; if (xi) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.stroke();
    g.fillStyle = '#aaa'; g.font = (10 * dpr) + 'px sans-serif'; g.fillText(fmt(hi, ST.dec), 4, 12 * dpr); g.fillText(fmt(lo, ST.dec), 4, Hh - 4);
  }

  var TABS = [['delta', 'Δ ডেল্টা'], ['tape', '🧾 টেপ'], ['dom', '📶 DOM'], ['fp', '🦶 ফুটপ্রিন্ট'], ['heat', '🔥 হিটম্যাপ']];
  function paintBody() {
    var b = $('fl-body'); if (!b) return;
    if (!MAP[curSym()]) { b.innerHTML = noSupportHtml(); return; }
    var y = b.scrollTop, h = ST.tab === 'tape' ? tapeHtml() : ST.tab === 'dom' ? domHtml() : ST.tab === 'fp' ? fpHtml() : ST.tab === 'heat' ? heatHtml() : deltaHtml();
    b.innerHTML = head() + h; b.scrollTop = y;
    if (ST.tab === 'delta') drawDelta(); if (ST.tab === 'heat') drawHeat();
  }
  var soft = 0;
  function paintSoft() { var now = Date.now(); if (now - soft < 400) return; soft = now; if ($('fl-sheet')) paintBody(); }
  function setTab(k) { ST.tab = k; lsSet('rtx_flow_tab', k); var t = $('fl-tabs'); if (t) t.innerHTML = tabsHtml(); paintBody(); if (k === 'heat') sampleHeat(); }
  function tabsHtml() { return TABS.map(function (x) { return '<button data-fltab="' + x[0] + '" class="' + (ST.tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join(''); }

  var tick = null;
  function closeSheet() { var s = $('fl-sheet'); if (s) s.remove(); clearInterval(tick); clearInterval(ST.heatTimer); tick = null; ST.heatTimer = null; var b = $('btn-flow'); if (b) b.classList.remove('on'); }
  function openSheet() {
    closeSheet();
    var ok = ensure(), box = document.createElement('div'); box.id = 'fl-sheet';
    box.innerHTML = '<div class="sheet-body"><div class="sheet-h"><b>📊 অর্ডারফ্লো</b><button id="fl-x">✕</button></div>' + (ok ? '<div id="fl-tabs" class="fl-tabs">' + tabsHtml() + '</div>' : '') + '<div id="fl-body"></div></div>';
    document.body.appendChild(box); var bt = $('btn-flow'); if (bt) bt.classList.add('on');
    paintBody();
    box.addEventListener('click', function (e) {
      var t = e.target, d = t.dataset || {};
      if (t === box || t.id === 'fl-x') { closeSheet(); return; }
      if (d.fltab) { setTab(d.fltab); return; }
      if (d.fltf) { ST.tf = d.fltf; lsSet('rtx_flow_tf', ST.tf); ST.fpIdx = 0; ST.hist = []; loadHist(); paintBody(); return; }
      if (d.fpmv) { ST.fpIdx = Math.max(0, ST.fpIdx + (+d.fpmv)); paintBody(); return; }
    });
    tick = setInterval(function () { if (!document.hidden && Date.now() - (ST.histT || 0) > 30000) loadHist(MAP[curSym()]); if (!document.hidden && (ST.tab === 'tape' || ST.tab === 'dom' || ST.tab === 'fp' || ST.tab === 'delta')) paintBody(); }, 1000);
    ST.heatTimer = setInterval(sampleHeat, 3000); if (ST.tab === 'heat') sampleHeat();
  }

  var btn = $('btn-flow');
  if (btn) btn.onclick = openSheet;
  /* চার্টের মার্কেট বদলালে স্ট্রিম নতুন মার্কেটে যায় (শিট খোলা না থাকলেও, যাতে ফুটপ্রিন্ট জমতে থাকে — শুধু একবার চালু করলে) */
  var symSel = $('symbol');
  if (symSel) symSel.addEventListener('change', function () { if (ST.ws || ST.sym) { if (!ensure()) { stop(); ST.sym = null; } if ($('fl-sheet')) closeSheet(); } });

  R.flow = { open: openSheet, supported: supported, prime: prime, confirm: confirm, insight: insight, state: ST, hist: function () { return ST.hist; } };
})(window.RTX);
