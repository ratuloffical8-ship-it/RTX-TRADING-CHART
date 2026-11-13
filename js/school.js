// ফাইলের নাম: school.js
// পাথ: js/school.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — 🏫 RTX স্কুল (টাস্ক ট্যাবের জায়গায়)
   ১৬ সপ্তাহ = ১১২ দিনের কোর্স (course.js)। প্রতিদিন একটি নতুন পাঠ, তিনটি ধাপ: শেখো, করো, লিখো।
   "আজকের পাঠ" = প্রথম যে দিনটি এখনো সম্পূর্ণ হয়নি। তাই একদিন বাদ গেলেও পাঠ এলোমেলো হয় না।
   AI শিক্ষক (Gemini, প্রক্সির /ai-এর মাধ্যমে) আজকের পাঠই আরও সহজ করে বোঝায়, প্রশ্ন করে পরীক্ষা নেয়, আর জার্নাল দেখে আজকের বিশেষ টাস্ক দেয়।
   প্রতিটি AI উত্তর ফোনে সেভ থাকে, একই বোতামে দ্বিতীয়বার লিমিট খরচ হয় না। সব ডেটা শুধু এই ফোনের ব্রাউজারে থাকে। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';
  if (typeof document === 'undefined' || !R.COURSE) return;

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dkey(d) { return (d || new Date()).toLocaleDateString('en-CA'); }

  var DAYS = [];
  R.COURSE.weeks.forEach(function (w, wi) { w.days.forEach(function (d, di) { DAYS.push({ i: DAYS.length, w: wi, d: di, wt: w.t, wg: w.g, title: d[0], learn: d[1], tryIt: d[2] }); }); });

  var SYS = 'তুমি RTX স্কুলের একজন ধৈর্যশীল শিক্ষক। শিক্ষার্থী ট্রেডিংয়ে একদম নতুন, তাকে ৮ বছরের শিশুকে শেখানোর মতো করে বোঝাও। সহজ বাংলায়, ছোট ছোট বাক্যে লেখো। কঠিন শব্দ এলে সাথে সাথে মানে বলো। দৈনন্দিন জীবনের উপমা (দোকান, ক্রিকেট, বাজার, রিকশা) দাও। শুধু দেওয়া পাঠের বিষয়ে কথা বলো। নিজে বানানো উদাহরণ হলে স্পষ্ট লেখো "কল্পিত উদাহরণ"। আসল দাম, খবর বা ভবিষ্যৎ দামের ভবিষ্যদ্বাণী বানাবে না। লাভের নিশ্চয়তা দেবে না। এটা আর্থিক পরামর্শ নয়। সর্বোচ্চ ৩০০ শব্দ।';

  var S = lsGet('rtx_school', { done: {}, days: {}, pre: {}, cur: null });
  if (!S.done) S.done = {}; if (!S.days) S.days = {}; if (!S.pre) S.pre = {};
  var notes = lsGet('rtx_school_notes', {});
  var qCount = lsGet('rtx_school_q', {});
  var cur = 0, el = null, busy = false;

  function isDone(i) { var x = S.done[i]; return !!(x && x.a && x.b && x.c); }
  function firstOpen() { for (var i = 0; i < DAYS.length; i++) if (!isDone(i)) return i; return DAYS.length - 1; }
  function doneCount() { var n = 0; for (var i = 0; i < DAYS.length; i++) if (isDone(i)) n++; return n; }
  function save() { lsSet('rtx_school', S); }
  function streak() {
    var d = new Date(), n = 0;
    if (!S.days[dkey(d)]) d.setDate(d.getDate() - 1);
    while (S.days[dkey(d)]) { n++; d.setDate(d.getDate() - 1); if (n > 400) break; }
    return n;
  }

  var css = document.createElement('style');
  css.textContent = '#view-tasks.active{display:block;overflow-y:auto;padding:12px 12px 24px;-webkit-overflow-scrolling:touch}' +
    '.sc-step{display:block;padding:10px 0;border-bottom:1px solid #161616}.sc-step:last-child{border-bottom:0}' +
    '.sc-step h4{margin:0 0 4px;font-size:14px}.sc-step p{margin:0 0 8px;font-size:14px;line-height:1.85;color:#d8d8d8}' +
    '.sc-chk{display:flex;align-items:center;gap:10px;font-size:13px;color:#bbb}.sc-chk input{width:20px;height:20px;accent-color:var(--blue)}' +
    '.sc-nav{display:flex;gap:8px;margin-top:10px}.sc-nav .btn{flex:1}' +
    '.sc-ai{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.sc-ai .btn{flex:1 1 30%;font-size:12px;padding:9px 6px}' +
    '.sc-note{width:100%;min-height:70px;background:#0b0b0b;color:#fff;border:1px solid #262626;border-radius:10px;padding:9px;font-size:14px;resize:vertical}' +
    '.sc-ask{display:flex;gap:6px;margin-top:6px}.sc-ask input{flex:1;background:#0b0b0b;color:#fff;border:1px solid #262626;border-radius:10px;padding:9px;font-size:14px}' +
    '.sc-day{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;margin:3px;border-radius:10px;background:#111;border:1px solid #262626;color:#bbb;font-size:12px}' +
    '.sc-day.ok{background:var(--blue);border-color:var(--blue);color:#fff}.sc-day.now{outline:2px solid #fff}' +
    '.sc-out{margin-top:8px;font-size:14px;line-height:1.85}';
  document.head.appendChild(css);

  function preHtml() {
    var n = 0, items = R.COURSE.pre.map(function (t, i) { var ck = !!S.pre[i]; if (ck) n++; return '<label class="sc-chk" style="padding:8px 0;border-bottom:1px solid #161616"><input type="checkbox" data-pre="' + i + '"' + (ck ? ' checked' : '') + '><span>' + esc(t) + '</span></label>'; }).join('');
    return '<details class="fold"><summary>✅ ট্রেডিং শুরুর আগে ১২টি জিনিস (' + n + '/১২)</summary><div class="fbody">' + items + '<div class="note-info">সবগুলো টিক না পড়া পর্যন্ত আসল টাকায় ট্রেড কোরো না। প্রথমে ডেমো।</div></div></details>';
  }

  function todayHtml() {
    var D = DAYS[cur], x = S.done[cur] || {}, ok = isDone(cur), isNow = cur === firstOpen();
    var h = '<div class="card"><div class="muted">' + esc(D.wt) + ' · দিন ' + (cur + 1) + '/' + DAYS.length + (ok ? ' · ✓ সম্পূর্ণ' : isNow ? ' · আজকের পাঠ' : '') + '</div>' +
      '<div style="font-size:17px;font-weight:700;margin:4px 0">' + esc(D.title) + '</div><div class="muted" style="margin-bottom:6px">এই সপ্তাহের লক্ষ্য: ' + esc(D.wg) + '</div>' +
      '<div class="sc-step"><h4>১) শেখো 📖</h4><p>' + esc(D.learn) + '</p><label class="sc-chk"><input type="checkbox" data-st="a"' + (x.a ? ' checked' : '') + '>আমি পড়েছি ও বুঝেছি</label></div>' +
      '<div class="sc-step"><h4>২) করো 🛠️</h4><p>' + esc(D.tryIt) + '</p><label class="sc-chk"><input type="checkbox" data-st="b"' + (x.b ? ' checked' : '') + '>আমি করেছি</label></div>' +
      '<div class="sc-step"><h4>৩) লিখো ✍️</h4><textarea class="sc-note" id="sc-note" placeholder="আজ কী শিখলাম, কী বুঝিনি, কী করলাম, নিজের ভাষায় লেখো">' + esc(notes[cur] || '') + '</textarea><label class="sc-chk" style="margin-top:6px"><input type="checkbox" data-st="c"' + (x.c ? ' checked' : '') + '>আমি লিখেছি</label></div>' +
      '<div class="sc-nav"><button class="btn" id="sc-prev"' + (cur === 0 ? ' disabled' : '') + '>← আগের</button><button class="btn' + (ok ? ' primary' : '') + '" id="sc-next"' + (cur >= DAYS.length - 1 ? ' disabled' : '') + '>পরের →</button></div></div>';
    h += '<div class="card"><b>🤖 AI শিক্ষক</b><div class="muted" style="font-size:12px;margin:4px 0">আজকের পাঠ নিয়ে সাহায্য নাও। প্রতিটি উত্তর সেভ থাকে, তাই লিমিট বাঁচে।</div><div class="sc-ai"><button class="btn primary" data-ai="explain">🧒 সহজ করে বোঝাও</button><button class="btn" data-ai="quiz">❓ আমাকে পরীক্ষা নাও</button><button class="btn" data-ai="task">🎯 আজকের বিশেষ টাস্ক</button></div>' +
      '<div class="sc-ask"><input type="text" id="sc-q" maxlength="300" placeholder="এই পাঠ নিয়ে নিজের প্রশ্ন লেখো"><button class="btn" data-ai="ask">জিজ্ঞেস</button></div><div class="sc-out" id="sc-out"></div></div>';
    return h;
  }

  function weeksHtml() {
    var fo = firstOpen();
    return R.COURSE.weeks.map(function (w, wi) {
      var days = DAYS.filter(function (d) { return d.w === wi; }), n = days.filter(function (d) { return isDone(d.i); }).length;
      return '<details class="fold"' + (DAYS[cur].w === wi ? ' open' : '') + '><summary>' + esc(w.t) + ' <span class="muted">(' + n + '/৭)</span></summary><div class="fbody"><div class="muted" style="margin-bottom:6px">' + esc(w.g) + '</div>' +
        days.map(function (d) { return '<button class="sc-day' + (isDone(d.i) ? ' ok' : '') + (d.i === cur ? ' now' : '') + '" data-day="' + d.i + '" title="' + esc(d.title) + '">' + (d.d + 1) + '</button>'; }).join('') +
        '<div class="muted" style="margin-top:6px">' + days.map(function (d) { return (d.d + 1) + ': ' + esc(d.title); }).join(' · ') + '</div></div></details>';
    }).join('');
  }

  function render() {
    var n = doneCount();
    el.innerHTML = '<h2 class="pg">🏫 RTX স্কুল</h2>' +
      '<div class="card warn">এখানে একদম শুরু থেকে ১৬ সপ্তাহে (৪ মাসে) ট্রেডিং শেখানো হবে। প্রতিদিন একটি নতুন পাঠ। তাড়াহুড়ো নেই, একদিন বাদ গেলেও পরের দিন সেখান থেকেই শুরু। এটা শেখার জন্য, আর্থিক পরামর্শ নয়, আর কোনো কোর্সই লাভের নিশ্চয়তা দেয় না।</div>' +
      '<div class="stats"><div class="stat"><b>' + n + '/' + DAYS.length + '</b><span class="muted">দিন সম্পূর্ণ</span></div><div class="stat"><b>' + streak() + '</b><span class="muted">টানা দিন</span></div></div>' +
      '<div class="card" style="margin-top:10px"><div class="bar" style="margin:0"><i style="width:' + (n / DAYS.length * 100) + '%"></i></div></div>' +
      preHtml() + '<div id="sc-today">' + todayHtml() + '</div><h3 style="margin:14px 0 6px">সব সপ্তাহ</h3><div id="sc-weeks">' + weeksHtml() + '</div>' +
      '<div class="btnrow"><button class="btn" id="sc-reset">কোর্স নতুন করে শুরু (প্রগতি মুছবে)</button></div>';
  }
  function refreshToday() { var t = document.getElementById('sc-today'); if (t) t.innerHTML = todayHtml(); var w = document.getElementById('sc-weeks'); if (w) w.innerHTML = weeksHtml(); }
  function refreshStats() { var st = el.querySelector('.stats'); if (st) st.innerHTML = '<div class="stat"><b>' + doneCount() + '/' + DAYS.length + '</b><span class="muted">দিন সম্পূর্ণ</span></div><div class="stat"><b>' + streak() + '</b><span class="muted">টানা দিন</span></div>'; var b = el.querySelector('.bar i'); if (b) b.style.width = (doneCount() / DAYS.length * 100) + '%'; }

  /* ---------- AI শিক্ষক ---------- */
  function journalBrief() {
    var j = lsGet('rtx_journal', []).slice(-5);
    if (!j.length) return 'জার্নালে এখনো কোনো ট্রেড নেই।';
    return j.map(function (t) {
      var risk = Math.abs(t.entry - t.stop), r = (t.exit != null && risk > 0) ? ((t.side === 'buy' ? t.exit - t.entry : t.entry - t.exit) / risk).toFixed(2) + 'R' : 'চলমান';
      return t.symbol + ' ' + t.side + ' ' + r + (t.lesson ? ' | শিক্ষা: ' + String(t.lesson).slice(0, 60) : '');
    }).join('\n');
  }
  async function ai(kind) {
    var out = document.getElementById('sc-out'); if (!out || busy) return;
    if (!R.ai) { out.innerHTML = '<div class="note-warn">AI মডিউল লোড হয়নি।</div>'; return; }
    var D = DAYS[cur], base = 'পাঠ: ' + D.wt + ', দিন ' + (D.d + 1) + ' — ' + D.title + '\nমূল কথা: ' + D.learn + '\nআজকের কাজ: ' + D.tryIt, prompt, key = null, today = dkey();
    if (kind === 'explain') { prompt = base + '\n\nএই পাঠটি একদম শিশুকে শেখানোর মতো করে বোঝাও। কাঠামো: ১) একটি ছোট গল্প বা উপমা ২) ধাপে ধাপে ব্যাখ্যা ৩) একটি কল্পিত উদাহরণ (সংখ্যাসহ) ৪) নতুনদের সাধারণ ভুল ৫) আজকের কাজটি কীভাবে করবে তার ধাপে ধাপে নির্দেশ।'; key = 'sch|e|' + cur; }
    else if (kind === 'quiz') { prompt = base + '\n\nএই পাঠ থেকে ঠিক ৩টি ছোট প্রশ্ন করো (সহজ থেকে একটু কঠিন)। প্রশ্ন নম্বর দিয়ে লেখো। উত্তর একদম শেষে "উত্তর সংকেত" হিসেবে আলাদা করে দাও।'; key = 'sch|q|' + cur; }
    else if (kind === 'task') { prompt = base + '\n\nশিক্ষার্থীর সর্বশেষ জার্নাল:\n' + journalBrief() + '\n\nআজকের জন্য ২টি নতুন, ছোট, করা-সম্ভব বিশেষ টাস্ক দাও যা এই পাঠ ও জার্নালের ভুল-ত্রুটির সাথে মেলে। প্রতিটি টাস্কের সাথে কেন এটা জরুরি তা এক লাইনে বলো, আর কীভাবে করবে ধাপে ধাপে বলো।'; key = 'sch|t|' + cur + '|' + today; }
    else {
      var q = (document.getElementById('sc-q').value || '').trim(); if (q.length < 4) { out.innerHTML = '<div class="note-warn">প্রশ্নটি একটু বিস্তারিত লেখো।</div>'; return; }
      var qk = today; qCount[qk] = qCount[qk] || 0;
      if (qCount[qk] >= 6) { out.innerHTML = '<div class="note-warn">আজ ৬টি প্রশ্ন করা হয়ে গেছে (লিমিট বাঁচাতে)। কাল আবার করো, বা পাঠ আবার পড়ো।</div>'; return; }
      prompt = base + '\n\nশিক্ষার্থীর প্রশ্ন: ' + q + '\n\nশুধু এই প্রশ্নের উত্তর সহজ বাংলায় দাও। প্রশ্ন ট্রেডিংয়ের বাইরের হলে বিনয়ের সাথে ফিরিয়ে দাও।'; key = 'sch|a|' + cur + '|' + q.slice(0, 80);
    }
    busy = true; out.innerHTML = '<div class="note-info">AI শিক্ষক ভাবছে…</div>';
    try {
      var j = await R.ai.ask(SYS, prompt, key);
      if (kind === 'ask' && !j.cached) { qCount[today] = (qCount[today] || 0) + 1; lsSet('rtx_school_q', qCount); }
      out.innerHTML = R.ai.md(j.text) + '<div class="muted" style="font-size:11px;margin-top:6px">' + esc(j.model || '') + (j.cached ? ' · সেভ করা উত্তর (লিমিট খরচ হয়নি)' : '') + '</div>';
    } catch (e) { out.innerHTML = '<div class="note-warn">' + esc(e.message) + '</div>'; }
    busy = false;
  }

  function build(target) {
    el = target; cur = S.cur !== null && S.cur >= 0 && S.cur < DAYS.length ? S.cur : firstOpen(); if (isDone(cur)) cur = firstOpen();
    render();
    el.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.pre !== undefined) { S.pre[t.dataset.pre] = t.checked; save(); var f = el.querySelector('details.fold summary'); if (f) f.firstChild.textContent = '✅ ট্রেডিং শুরুর আগে ১২টি জিনিস (' + R.COURSE.pre.filter(function (_, i) { return S.pre[i]; }).length + '/১২) '; return; }
      if (t.dataset && t.dataset.st) {
        var was = isDone(cur); S.done[cur] = S.done[cur] || {}; S.done[cur][t.dataset.st] = t.checked;
        if (!was && isDone(cur)) { S.days[dkey()] = (S.days[dkey()] || 0) + 1; S.done[cur].ts = Date.now(); }
        save(); refreshStats(); var w = document.getElementById('sc-weeks'); if (w) w.innerHTML = weeksHtml();
        if (!was && isDone(cur)) { var nx = document.getElementById('sc-next'); if (nx) nx.classList.add('primary'); if (R.onError) R.onError('🎉 আজকের পাঠ সম্পূর্ণ! এবার পরের দিনে যাও।'); }
      }
    });
    el.addEventListener('input', function (e) { if (e.target.id === 'sc-note') { notes[cur] = e.target.value; lsSet('rtx_school_notes', notes); } });
    el.addEventListener('click', function (e) {
      var t = e.target, d = t.dataset || {};
      if (d.ai) { ai(d.ai); return; }
      if (d.day !== undefined) { cur = +d.day; S.cur = cur; save(); refreshToday(); document.getElementById('sc-today').scrollIntoView({ block: 'start' }); return; }
      if (t.id === 'sc-prev' && cur > 0) { cur--; S.cur = cur; save(); refreshToday(); return; }
      if (t.id === 'sc-next' && cur < DAYS.length - 1) { cur++; S.cur = cur; save(); refreshToday(); document.getElementById('sc-today').scrollIntoView({ block: 'start' }); return; }
      if (t.id === 'sc-reset') { if (window.confirm('পুরো কোর্সের প্রগতি মুছে নতুন করে শুরু করবে?')) { S = { done: {}, days: {}, pre: {}, cur: null }; save(); notes = {}; lsSet('rtx_school_notes', notes); cur = 0; render(); } }
    });
  }

  R.school = { build: build, DAYS: DAYS };
})(window.RTX);
