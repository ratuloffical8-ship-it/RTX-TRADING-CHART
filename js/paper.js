/* RTX Chart — পেপার ট্রেডিং: ভার্চুয়াল ব্যালেন্সে বাই/সেল অনুশীলন (আসল টাকা লাগে না) */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var KEY = 'rtx_paper', START = 10000;

  function fresh() { return { start: START, balance: START, open: [], hist: [] }; }
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v.balance === 'number' && Array.isArray(v.open) && Array.isArray(v.hist)) return v; } catch (_) {}
    return fresh();
  }
  var S = (typeof localStorage === 'undefined') ? fresh() : load();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }
  function say(m) { if (R.onError) R.onError(m); }

  /* ---------- হিসাব (পিওর ফাংশন) ---------- */
  function pnlOf(side, entry, price, units) { return (side === 'buy' ? price - entry : entry - price) * units; }

  /* একটা ক্যান্ডেলে স্টপলস বা টার্গেট ছোঁয়া হয়েছে কিনা। দুটোই ছুঁলে স্টপলস ধরা হয় (নিরাপদ ধরা) */
  function checkExit(pos, c) {
    var after = c.time > pos.openTs;
    var hi = after ? c.high : c.close, lo = after ? c.low : c.close;
    if (pos.side === 'buy') {
      if (lo <= pos.stop) return { price: pos.stop, why: 'স্টপলস' };
      if (pos.target != null && hi >= pos.target) return { price: pos.target, why: 'টার্গেট' };
    } else {
      if (hi >= pos.stop) return { price: pos.stop, why: 'স্টপলস' };
      if (pos.target != null && lo <= pos.target) return { price: pos.target, why: 'টার্গেট' };
    }
    return null;
  }

  function size(o) {
    var bal = +o.balance, rp = +o.riskPct, e = +o.entry, s = +o.stop, side = o.side;
    if (!(e > 0)) return { error: 'এখনো দাম আসেনি' };
    if (!(rp > 0) || rp > 10) return { error: 'রিস্ক ০ থেকে ১০% এর মধ্যে দাও' };
    if (!(s > 0)) return { error: 'স্টপলস দাও' };
    if ((side === 'buy' && s >= e) || (side === 'sell' && s <= e)) return { error: side === 'buy' ? 'বাই ট্রেডে স্টপলস এন্ট্রির নিচে হবে' : 'সেল ট্রেডে স্টপলস এন্ট্রির উপরে হবে' };
    var dist = Math.abs(e - s), riskAmt = bal * rp / 100, units = riskAmt / dist;
    if (units * e > bal * 100) return { error: 'স্টপলস খুব কাছে, সাইজ অতিরিক্ত বড় হয়ে যাচ্ছে' };
    return { units: units, riskAmt: riskAmt, dist: dist };
  }

  R.paper = { pnlOf: pnlOf, checkExit: checkExit, size: size, state: function () { return S; } };

  if (typeof document === 'undefined') return;

  /* ---------- বর্তমান চার্টের অবস্থা (setData/update হুক করে) ---------- */
  var cur = { symbol: null, price: null }, lastRender = 0;

  function toJournal(h) {
    try {
      var a = JSON.parse(localStorage.getItem('rtx_journal') || '[]');
      a.push({ id: 'p' + h.id, ts: h.openTs * 1000, symbol: h.symbol, side: h.side, entry: h.entry, stop: h.stop, target: h.target, exit: h.exit, reason: 'পেপার ট্রেড (অটো)', lesson: '' });
      localStorage.setItem('rtx_journal', JSON.stringify(a));
    } catch (_) {}
  }
  function closePos(id, price, why) {
    var i = S.open.findIndex(function (p) { return p.id === id; }); if (i < 0) return;
    var p = S.open.splice(i, 1)[0], pnl = pnlOf(p.side, p.entry, price, p.units);
    var h = Object.assign({}, p, { exit: price, pnl: pnl, r: p.riskAmt ? pnl / p.riskAmt : 0, why: why, closeTs: Math.floor(Date.now() / 1000) });
    S.balance += pnl; S.hist.unshift(h); if (S.hist.length > 200) S.hist.length = 200;
    persist(); toJournal(h);
    say(p.symbol + ' ' + (p.side === 'buy' ? 'বাই' : 'সেল') + ' বন্ধ (' + why + '): ' + (pnl >= 0 ? '+' : '-') + '$' + Math.abs(pnl).toFixed(2));
  }
  function onTick(c) {
    if (!cur.symbol) return;
    cur.price = c.close;
    S.open.slice().forEach(function (p) {
      if (p.symbol !== cur.symbol) return;
      var x = checkExit(p, c); if (x) closePos(p.id, x.price, x.why);
    });
    ui();
  }
  function scan(arr, sec) {
    S.open.slice().forEach(function (p) {
      if (p.symbol !== cur.symbol) return;
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i]; if (c.time + sec <= p.openTs) continue;
        var x = checkExit(p, c); if (x) { closePos(p.id, x.price, x.why); break; }
      }
    });
  }
  var fs = R.chart.setData, fu = R.chart.update;
  R.chart.setData = function (arr, sec, key) {
    var r = fs.apply(this, arguments);
    cur.symbol = key; cur.price = arr.length ? arr[arr.length - 1].close : null;
    scan(arr, sec); ui();
    return r;
  };
  R.chart.update = function (c) { var r = fu.apply(this, arguments); onTick(c); return r; };

  /* ---------- UI ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#pt-btn{position:absolute;top:6px;right:68px;z-index:6;background:#111;border:1px solid #2a2a2a;color:#fff;border-radius:16px;padding:5px 11px;font-size:12px}' +
    '#pt-btn.has{border-color:#2979ff}' +
    '#pt-sheet{position:fixed;inset:0;z-index:55;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center}' +
    '.seg{display:flex;gap:8px;margin-bottom:8px}' +
    '.seg button{flex:1;padding:10px;border-radius:10px;border:1px solid #2a2a2a;background:#111;color:#fff;font-size:14px;font-weight:700}' +
    '.seg button.on.buy{background:#2979ff;border-color:#2979ff}' +
    '.seg button.on.sell{background:#fff;color:#000;border-color:#fff}' +
    '.pos{border:1px solid #1c1c1c;border-radius:12px;padding:9px 11px;margin-top:8px;font-size:13px;line-height:1.7;background:#0b0b0b}' +
    '.pos .th{display:flex;align-items:center;gap:8px}' +
    '.pos .th button{margin-left:auto}' +
    '.pt-h{margin:12px 0 4px;font-size:13px;color:#8b8b8b}';
  document.head.appendChild(css);

  var wrap = document.getElementById('chart-wrap');
  var btn = document.createElement('button'); btn.id = 'pt-btn'; btn.textContent = '🎮 পেপার';
  if (wrap) wrap.appendChild(btn);
  var side = 'buy';

  function fp(x) { x = +x; return x >= 1000 ? x.toFixed(2) : x >= 10 ? x.toFixed(3) : x >= 1 ? x.toFixed(5) : x.toFixed(6); }
  function money(x) { return (x < 0 ? '-' : '') + '$' + Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function cls(x) { return x >= 0 ? 'up' : 'dn'; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function ui() {
    btn.textContent = '🎮 পেপার' + (S.open.length ? ' (' + S.open.length + ')' : '');
    btn.classList.toggle('has', S.open.length > 0);
    if (!$('pt-sheet')) return;
    var now = Date.now(); if (now - lastRender < 600) return; lastRender = now;
    renderDyn(); preview();
  }

  function renderDyn() {
    var d = $('pt-dyn'); if (!d) return;
    var unreal = 0;
    S.open.forEach(function (p) { if (p.symbol === cur.symbol && cur.price != null) unreal += pnlOf(p.side, p.entry, cur.price, p.units); });
    var eq = S.balance + unreal, wins = S.hist.filter(function (h) { return h.pnl > 0; }).length;
    var h = '<div class="card"><div class="kv"><span>ব্যালেন্স</span><b>' + money(S.balance) + '</b></div>' +
      '<div class="kv"><span>ইকুইটি (ভাসমান লাভ-লস সহ)</span><b class="' + cls(eq - S.start) + '">' + money(eq) + '</b></div>' +
      '<div class="kv"><span>মোট ফল</span><b class="' + cls(eq - S.start) + '">' + (eq >= S.start ? '+' : '') + ((eq - S.start) / S.start * 100).toFixed(2) + '%</b></div>' +
      '<div class="kv"><span>বন্ধ ট্রেড / উইন রেট</span><b>' + S.hist.length + ' / ' + (S.hist.length ? (wins / S.hist.length * 100).toFixed(0) : 0) + '%</b></div></div>';
    h += '<div class="pt-h">চালু ট্রেড</div>';
    if (!S.open.length) h += '<div class="muted">কোনো চালু ট্রেড নেই।</div>';
    S.open.forEach(function (p) {
      var here = p.symbol === cur.symbol && cur.price != null, pl = here ? pnlOf(p.side, p.entry, cur.price, p.units) : null;
      h += '<div class="pos"><div class="th"><b>' + esc(p.symbol) + '</b><span class="badge ' + p.side + '">' + (p.side === 'buy' ? 'BUY' : 'SELL') + '</span>' +
        '<button class="btn" data-close="' + p.id + '"' + (here ? '' : ' disabled') + '>বন্ধ করো</button></div>' +
        '<div class="muted">এন্ট্রি ' + fp(p.entry) + ' · স্টপ ' + fp(p.stop) + (p.target != null ? ' · টার্গেট ' + fp(p.target) : '') + '</div>' +
        '<div>সাইজ ' + p.units.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' · ঝুঁকি ' + money(p.riskAmt) + '</div>' +
        (here ? '<div>এখনকার ফল: <b class="' + cls(pl) + '">' + (pl >= 0 ? '+' : '') + money(pl) + ' (' + (pl / p.riskAmt >= 0 ? '+' : '') + (pl / p.riskAmt).toFixed(2) + 'R)</b></div>'
              : '<div class="muted">দাম দেখতে চার্টে ' + esc(p.symbol) + ' খোলো</div>') + '</div>';
    });
    h += '<div class="pt-h">শেষ ট্রেডগুলো</div>';
    if (!S.hist.length) h += '<div class="muted">এখনো কোনো বন্ধ ট্রেড নেই।</div>';
    S.hist.slice(0, 8).forEach(function (t) {
      h += '<div class="kv"><span>' + esc(t.symbol) + ' <span class="badge ' + t.side + '">' + (t.side === 'buy' ? 'BUY' : 'SELL') + '</span> <span class="muted">' + esc(t.why) + '</span></span>' +
        '<b class="' + cls(t.pnl) + '">' + (t.r >= 0 ? '+' : '') + t.r.toFixed(2) + 'R · ' + money(t.pnl) + '</b></div>';
    });
    d.innerHTML = h;
    var px = $('pt-px'); if (px) px.textContent = cur.price != null ? (cur.symbol + ' · ' + fp(cur.price)) : 'দাম আসেনি';
  }

  function preview() {
    var p = $('pt-prev'); if (!p) return;
    var tg = $('pt-target').value, t = tg === '' ? NaN : +tg;
    var r = size({ balance: S.balance, riskPct: $('pt-risk').value, entry: cur.price, stop: $('pt-stop').value, side: side });
    if (r.error) { p.textContent = r.error; return; }
    var txt = 'সাইজ ' + r.units.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' · ঝুঁকি ' + money(r.riskAmt);
    if (isFinite(t)) {
      var ok = side === 'buy' ? t > cur.price : t < cur.price;
      txt += ok ? ' · R:R 1:' + (Math.abs(t - cur.price) / r.dist).toFixed(2) : ' · টার্গেট ভুল দিকে';
    }
    p.textContent = txt;
  }

  function closeSheet() { var s = $('pt-sheet'); if (s) s.remove(); }
  function openSheet() {
    closeSheet();
    var box = document.createElement('div'); box.id = 'pt-sheet';
    box.innerHTML =
      '<div class="sheet-body"><div class="sheet-h"><b>🎮 পেপার ট্রেডিং</b><button id="pt-x">✕</button></div>' +
      '<div class="note-info" style="margin:0 0 8px">ভার্চুয়াল ' + money(START) + ' দিয়ে শুরু। আসল টাকা লাগে না। ফি ও স্প্রেড ধরা হয়নি, তাই আসল ট্রেডে ফল কিছুটা কম হবে।</div>' +
      '<div id="pt-dyn"></div>' +
      '<div class="pt-h">নতুন ট্রেড (মার্কেট দামে)</div><div class="card">' +
      '<div class="muted" style="margin-bottom:8px">এখনকার দাম: <b id="pt-px" style="color:#fff"></b></div>' +
      '<div class="seg"><button class="buy on" id="pt-buy">বাই</button><button class="sell" id="pt-sell">সেল</button></div>' +
      '<div class="fgrid">' +
      '<label class="field"><span>রিস্ক (%)</span><input id="pt-risk" type="number" inputmode="decimal" step="any"></label>' +
      '<label class="field"><span>স্টপলস</span><input id="pt-stop" type="number" inputmode="decimal" step="any"></label>' +
      '<label class="field full"><span>টার্গেট (ঐচ্ছিক)</span><input id="pt-target" type="number" inputmode="decimal" step="any"></label></div>' +
      '<div class="btnrow"><button class="btn" id="pt-sl1">স্টপ ১% দূরে</button><button class="btn" id="pt-tp2">টার্গেট ১:২</button></div>' +
      '<div class="note-info" id="pt-prev"></div>' +
      '<div class="btnrow"><button class="btn primary full" id="pt-go">অর্ডার দাও</button></div></div>' +
      '<div class="btnrow"><button class="btn" id="pt-reset">অ্যাকাউন্ট রিসেট</button></div></div>';
    document.body.appendChild(box);
    $('pt-risk').value = (function () { try { return JSON.parse(localStorage.getItem('rtx_pt_risk')) || 1; } catch (_) { return 1; } })();
    renderDyn(); preview();

    box.addEventListener('input', preview);
    box.addEventListener('click', function (e) {
      var t = e.target;
      if (t === box || t.id === 'pt-x') { closeSheet(); return; }
      var cl = t.closest('[data-close]');
      if (cl) { if (cur.price != null) { closePos(cl.dataset.close, cur.price, 'হাতে বন্ধ'); renderDyn(); ui(); } return; }
      if (t.id === 'pt-buy' || t.id === 'pt-sell') {
        side = t.id === 'pt-buy' ? 'buy' : 'sell';
        $('pt-buy').classList.toggle('on', side === 'buy'); $('pt-sell').classList.toggle('on', side === 'sell'); preview(); return;
      }
      if (t.id === 'pt-sl1') {
        if (cur.price == null) { say('দাম আসেনি'); return; }
        $('pt-stop').value = +(cur.price * (side === 'buy' ? 0.99 : 1.01)).toPrecision(7); preview(); return;
      }
      if (t.id === 'pt-tp2') {
        var s = +$('pt-stop').value;
        if (cur.price == null || !(s > 0)) { say('আগে স্টপলস দাও'); return; }
        $('pt-target').value = +(cur.price + (side === 'buy' ? 2 : -2) * Math.abs(cur.price - s)).toPrecision(7); preview(); return;
      }
      if (t.id === 'pt-go') { place(); return; }
      if (t.id === 'pt-reset') {
        if (confirm('পেপার অ্যাকাউন্ট রিসেট করবে? চালু ও বন্ধ সব ট্রেড মুছে যাবে।')) { S = fresh(); persist(); ui(); renderDyn(); preview(); }
      }
    });
  }

  function place() {
    if (cur.price == null || !cur.symbol) { say('চার্টে দাম আসার পর চেষ্টা করো'); return; }
    var rp = +$('pt-risk').value, stop = +$('pt-stop').value, tg = $('pt-target').value, target = tg === '' ? null : +tg;
    var r = size({ balance: S.balance, riskPct: rp, entry: cur.price, stop: stop, side: side });
    if (r.error) { say(r.error); return; }
    if (target != null && (!isFinite(target) || (side === 'buy' ? target <= cur.price : target >= cur.price))) { say('টার্গেট ভুল দিকে আছে'); return; }
    try { localStorage.setItem('rtx_pt_risk', JSON.stringify(rp)); } catch (_) {}
    S.open.push({
      id: Date.now().toString(36), symbol: cur.symbol, side: side, entry: cur.price, stop: stop, target: target,
      units: r.units, riskAmt: r.riskAmt, openTs: Math.floor(Date.now() / 1000)
    });
    persist(); say((side === 'buy' ? 'বাই' : 'সেল') + ' ট্রেড চালু হয়েছে');
    $('pt-stop').value = ''; $('pt-target').value = '';
    lastRender = 0; ui(); renderDyn(); preview();
  }

  btn.onclick = openSheet;
  ui();
})(window.RTX);
