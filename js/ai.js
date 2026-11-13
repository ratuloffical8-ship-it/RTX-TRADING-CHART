// ফাইলের নাম: ai.js
// পাথ: js/ai.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — Gemini AI সহায়ক (সিগন্যাল ব্যাখ্যা + জার্নাল রিভিউ)
   কী ব্রাউজারে থাকে না: সব কল যায় আপনার Render প্রক্সির /ai এন্ডপয়েন্টে।
   লিমিট বাঁচাতে: শুধু বাটন চাপলে কল হয়, একই প্রশ্নের উত্তর ফোনে সেভ থাকে, ২০ সেকেন্ডের বিরতি, ছোট প্রম্পট। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';
  if (typeof document === 'undefined') return;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function proxy() { var v = ''; try { v = localStorage.getItem('rtx_proxy') || ''; } catch (_) {} return v.replace(/\/+$/, ''); }
  function md(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }

  var SYS = 'তুমি একজন ধৈর্যশীল ট্রেডিং শিক্ষক। শুধু নিচে দেওয়া তথ্য ব্যবহার করো, নিজে থেকে দাম, খবর বা সংখ্যা বানিও না। ভবিষ্যৎ দাম বলার চেষ্টা কোরো না। উত্তর বাংলায়, সর্বোচ্চ ১৮০ শব্দ, সহজ ভাষায়, শেষে এক লাইনে মনে করিয়ে দাও এটা আর্থিক পরামর্শ নয়।';
  var lastCall = 0, busy = false;

  async function ask(system, prompt, key) {
    var base = proxy(); if (!base) throw new Error('আগে 🧮 টুলসে প্রক্সি URL দাও');
    var cache = lsGet('rtx_ai_cache', {});
    if (key && cache[key]) return { text: cache[key].t, model: cache[key].m, cached: true };
    var wait = lastCall + 20000 - Date.now();
    if (wait > 0) throw new Error('একটু অপেক্ষা করো, ' + Math.ceil(wait / 1000) + ' সেকেন্ড পরে আবার চাপো (লিমিট বাঁচাতে)');
    lastCall = Date.now();
    var token = '';
    try { token = localStorage.getItem('rtx_ai_token') || ''; } catch (_) {}
    async function go(tk) {
      var h = { 'Content-Type': 'application/json' }; if (tk) h['X-App-Token'] = tk;
      var r = await fetch(base + '/ai', { method: 'POST', headers: h, body: JSON.stringify({ system: system, prompt: prompt }) });
      var j = await r.json().catch(function () { return {}; });
      return { r: r, j: j };
    }
    var o = await go(token);
    if (o.r.status === 401) {
      var t = window.prompt('AI-এর গোপন টোকেন দাও (Render-এ APP_TOKEN যা দিয়েছ):');
      if (!t) throw new Error('টোকেন লাগবে');
      try { localStorage.setItem('rtx_ai_token', t.trim()); } catch (_) {}
      o = await go(t.trim());
    }
    if (!o.r.ok) throw new Error(o.j.error || ('সার্ভার ত্রুটি ' + o.r.status));
    if (key) {
      var keys = Object.keys(cache); if (keys.length > 40) delete cache[keys[0]];
      cache[key] = { t: o.j.text, m: o.j.model }; lsSet('rtx_ai_cache', cache);
    }
    return o.j;
  }

  function show(el, html) { if (el) el.innerHTML = html; }
  function result(j) { return '<div class="card">' + md(j.text) + '<div class="muted" style="font-size:11px;margin-top:6px">' + esc(j.model || '') + (j.cached ? ' · সেভ করা উত্তর (লিমিট খরচ হয়নি)' : '') + '</div></div>'; }

  /* ---------- সিগন্যাল ব্যাখ্যা ---------- */
  var SYS_SIG = 'তুমি একজন ধৈর্যশীল ট্রেডিং শিক্ষক। একদম নতুন, ছোট বাচ্চার মতো শিক্ষার্থীকে বোঝাচ্ছ। সহজ বাংলায়, ছোট বাক্যে লেখো। কঠিন শব্দ (BOS, FVG, ATR ইত্যাদি) এলে সাথে সাথে এক লাইনে মানে বলে দাও। নিচের তথ্যই একমাত্র সত্য। নিজে থেকে কোনো সংখ্যা, দাম বা খবর বানাবে না। ভবিষ্যৎ দাম বা জেতার নিশ্চয়তা দেবে না। কাঠামো: ১) এক লাইনে সারকথা ২) কেন সিগন্যাল এলো (প্রতিটি কারণ আলাদা পয়েন্টে, সহজ উপমা সহ) ৩) SL, TP ও ঝুঁকি কত ডলার ৪) কোন ঘটনায় এই ট্রেড ভুল প্রমাণ হবে ৫) নতুনের জন্য একটি সতর্কতা। সর্বোচ্চ ২৮০ শব্দ। এটা আর্থিক পরামর্শ নয়।';

  function facts(t, info, now, sec) {
    var f = function (x) { return Number(x).toFixed(info.dec); }, w = t.why, L = [];
    function bias(b) { return b === 1 ? 'বুলিশ' : b === -1 ? 'বেয়ারিশ' : 'নিরপেক্ষ'; }
    L.push('মার্কেট: ' + info.sym + ', টাইমফ্রেম: ' + sec + ' সেকেন্ড');
    L.push('সিগন্যাল: ' + (t.dir === 1 ? 'BUY' : 'SELL') + ', গ্রেড ' + t.grade + ', স্কোর ' + t.score + '/100, অবস্থা ' + t.status);
    L.push('এন্ট্রি ' + f(t.entry) + ', SL ' + f(t.sl) + ', TP1 ' + f(t.tp1) + ', TP2 ' + f(t.tp2) + ', TP3 ' + f(t.tp3));
    if (t.lot !== null && t.lot !== undefined) L.push('লট ' + t.lot.toFixed(2) + ', SL-এ ক্ষতি $' + (t.riskUsd === null ? '?' : t.riskUsd.toFixed(2)) + (t.riskPct != null ? ' = ব্যালেন্সের ' + t.riskPct.toFixed(2) + '%' : ''));
    if (w) {
      L.push('মোড: ' + w.modeBn);
      L.push('বাজারের অবস্থা: ' + w.regimeBn + ' (' + w.regimeDesc + ')');
      L.push('এন্ট্রির ধরন: ' + w.typeBn + (w.setups.length ? ', সেটআপ: ' + w.setups.join(' + ') : '') + (w.xl.length ? ', XL: ' + w.xl.join(' + ') : ''));
      L.push('ট্রেন্ড ইন্ডিকেটর: UT Bot ' + bias(w.trendFamily.ut) + ', JDT ' + bias(w.trendFamily.jdt) + ', Supertrend ' + bias(w.trendFamily.supertrend) + ' (মিলেছে ' + w.trendFamily.agree + '/৩)');
      L.push('বড় টাইমফ্রেম: 4H ' + bias(w.htf.h4) + ', 1H ' + bias(w.htf.h1) + (w.htf.counterTrend ? ' (একটি উল্টো, ঝুঁকি বেশি)' : ''));
      L.push('স্ট্রাকচার: ' + bias(w.structure.trend) + (w.structure.recent ? ', সাম্প্রতিক ' + w.structure.recent : '') + (w.structure.inZone ? ', গুরুত্বপূর্ণ জোনে' : ''));
      L.push('স্কোর ভাগ: সেটআপ ' + w.parts.setup + '/30, মোমেন্টাম ' + w.parts.momentum + '/15, ট্রেন্ড ' + w.parts.trend + '/15, বড় টাইমফ্রেম ' + w.parts.htf + '/15, স্ট্রাকচার ' + w.parts.structure + '/15, বাজারের অবস্থা ' + w.parts.regime + '/10');
      L.push('SL কেন ওখানে: ' + w.sl.text);
      L.push('TP: ' + w.tp.r.join('R, ') + 'R' + (w.tp.obstacle ? ', সামনের বাধা ' + w.tp.obstacle : ', সামনে বড় বাধা নেই'));
      L.push('১০টি শর্তের ফল: ' + w.gate.map(function (g) { return (g.ok ? '✔ ' : '✘ ') + g.label; }).join('; '));
    } else L.push('ধরন: ' + t.mode + (t.extra ? ', একমত: ' + t.extra : '') + ' (পুরোনো ইঞ্জিন, বিস্তারিত কারণ নেই)');
    if (now && now.last && now.last.status !== 'signal') L.push('সর্বশেষ ক্যান্ডেলে: ' + now.last.text);
    return L.join('\n');
  }

  async function explain() {
    var out = document.getElementById('ai-out'), st = R.ultra && R.ultra.getState && R.ultra.getState();
    if (busy || !out) return;
    if (!st || !st.res || !st.res.trades.length) { show(out, '<div class="note-warn">ব্যাখ্যা করার মতো কোনো সিগন্যাল এখনো নেই।</div>'); return; }
    var t = st.res.trades[st.res.trades.length - 1], info = st.info;
    var p = facts(t, info, st.res.now, st.sec);
    busy = true; show(out, '<div class="note-info">AI ভাবছে…</div>');
    try { show(out, result(await ask(SYS_SIG, p, 'sig2|' + info.sym + '|' + st.sec + '|' + t.time + '|' + t.status))); }
    catch (e) { show(out, '<div class="note-warn">' + esc(e.message) + '</div>'); }
    busy = false;
  }

  /* ---------- জার্নাল রিভিউ ---------- */
  async function review() {
    var out = document.getElementById('ai-jout'); if (busy || !out) return;
    var tr = lsGet('rtx_journal', []).slice(-25);
    if (tr.length < 3) { show(out, '<div class="note-warn">রিভিউয়ের জন্য কমপক্ষে ৩টি ট্রেড জার্নালে লেখো।</div>'); return; }
    var lines = tr.map(function (t) {
      var risk = Math.abs(t.entry - t.stop), r = (t.exit != null && risk > 0) ? ((t.side === 'buy' ? t.exit - t.entry : t.entry - t.exit) / risk).toFixed(2) + 'R' : 'চলমান';
      return t.symbol + ' ' + t.side + ' ফলাফল ' + r + ' | কারণ: ' + String(t.reason || '').slice(0, 80) + ' | শিক্ষা: ' + String(t.lesson || '').slice(0, 80);
    }).join('\n');
    var sys = 'তুমি একজন ট্রেডিং কোচ। শুধু দেওয়া জার্নাল দেখে বাংলায় সর্বোচ্চ ১৮০ শব্দে বলো: ১) বারবার কোন ভুল দেখা যাচ্ছে ২) কোন অভ্যাস ভালো ৩) আগামী সপ্তাহে একটি করণীয়। নতুন তথ্য বানিও না। শেষে লেখো এটা আর্থিক পরামর্শ নয়।';
    busy = true; show(out, '<div class="note-info">AI ভাবছে…</div>');
    try { show(out, result(await ask(sys, lines, 'jr|' + tr.length + '|' + (tr[tr.length - 1].ts || 0)))); }
    catch (e) { show(out, '<div class="note-warn">' + esc(e.message) + '</div>'); }
    busy = false;
  }

  document.addEventListener('click', function (e) {
    var id = e.target && e.target.id;
    if (id === 'ai-explain') explain();
    else if (id === 'ai-review') review();
  });
  var nav = document.getElementById('bottomnav');
  if (nav) nav.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.dataset.view !== 'journal') return;
    setTimeout(function () {
      var v = document.getElementById('view-journal'); if (!v || document.getElementById('ai-review')) return;
      var d = document.createElement('div'); d.innerHTML = '<div class="card"><b>🤖 AI জার্নাল রিভিউ</b><div class="muted" style="font-size:12px;margin:4px 0 8px">শেষ ২৫টি ট্রেড দেখে ভুল ও ভালো অভ্যাস বলবে। বাটন চাপলেই শুধু কল হয়।</div><div class="btnrow"><button class="btn primary" id="ai-review">রিভিউ করো</button></div><div id="ai-jout"></div></div>';
      v.appendChild(d.firstChild);
    }, 60);
  });
  R.ai = { ask: ask, md: md, esc: esc };
})(window.RTX);
