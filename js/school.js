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
  if (!S.done) S.done = {}; if (!S.days) S.days = {}; if (!S.pre) S.pre = {}; if (!S.sp) S.sp = {}; if (!S.sph) S.sph = []; if (!S.qh) S.qh = []; if (!S.aq) S.aq = []; if (!S.tab) S.tab = 'today';
  var lessonsDone = lsGet('rtx_lessons', {}), PQ = null;
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

  var TABS = [['today', '📅 আজ'], ['course', '📖 কোর্স'], ['words', '🔤 শব্দকোষ'], ['lessons', '📚 পাঠমালা'], ['practice', '🧪 প্র্যাকটিস']];

  /* ---------- 🔤 শব্দকোষ (আগের "শেখো" ট্যাব) ---------- */
  function wordsHtml() {
    var T = R.help ? R.help.TERMS : {};
    return '<div class="card"><b>সিগন্যাল কীভাবে পড়বে (৫ ধাপ)</b><ol class="why-ol"><li>প্রথমে <b>বাজারের অবস্থা</b> দেখো। অস্থির হলে ট্রেড নয়।</li><li><b>গ্রেড ও স্কোর</b> দেখো। নতুন হলে A বা A+ ছাড়া ট্রেড নিও না।</li><li><b>"কেন এই সিগন্যাল"</b> পড়ো। কারণ না বুঝলে ট্রেড নিও না।</li><li><b>SL ও লট</b> দেখো। SL-এ কত ডলার যাবে, সেটা সহ্য করতে পারলে তবেই।</li><li>প্রথমে <b>ডেমো/পেপার</b>। আগে অন্তত ২ সপ্তাহ।</li></ol></div>' +
      '<div class="card"><b>শব্দের মানে (চাপ দিলে খুলবে)</b><div class="lgrid">' + Object.keys(T).map(function (k) { return '<button type="button" class="ihelp lrow" data-h="' + k + '">' + esc(T[k][0]) + '</button>'; }).join('') + '</div></div>';
  }

  /* ---------- 📚 পাঠমালা (আগের "শেখা" ট্যাবের পাঠ) ---------- */
  function lessonsHtml() {
    var L = R.LESSONS || [], n = 0;
    var items = L.map(function (l) {
      var ok = !!lessonsDone[l.id]; if (ok) n++;
      return '<details class="lesson' + (ok ? ' done' : '') + '"><summary><span>' + l.icon + '</span>' + esc(l.title) + '<span class="tick">✓</span></summary><div class="body"><ul>' + l.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><div class="practice"><b>অনুশীলন:</b> ' + esc(l.practice) + '</div><button class="btn" data-lsn="' + l.id + '">' + (ok ? '✓ সম্পন্ন (আবার ট্যাপ করলে বাতিল)' : 'সম্পন্ন করেছি') + '</button></div></details>';
    }).join('');
    return '<div class="card"><b>' + n + ' / ' + L.length + ' পাঠ সম্পন্ন</b><div class="bar"><i style="width:' + (L.length ? n / L.length * 100 : 0) + '%"></i></div><div class="muted" style="font-size:12px">এগুলো ১১২ দিনের কোর্সের পাশাপাশি আলাদা সংক্ষিপ্ত পাঠ।</div></div>' + items;
  }

  /* ---------- 🎯 আজকের বিশেষ টাস্ক (AI, প্রতিদিন নতুন, আগেরটা পুনরাবৃত্তি হয় না) ---------- */
  function taskCardHtml() {
    var t = S.sp[dkey()], ended = doneCount() >= DAYS.length;
    if (t) return '<div class="card"><b>🎯 আজকের বিশেষ টাস্ক' + (ended ? ' (রিভিশন সিরিজ)' : '') + '</b><div class="sc-out">' + (R.ai ? R.ai.md(t.text) : esc(t.text)) + '</div><label class="sc-chk" style="margin-top:8px"><input type="checkbox" data-stdone="1"' + (t.done ? ' checked' : '') + '>আমি করেছি</label></div>';
    return '<div class="card"><b>🎯 আজকের বিশেষ টাস্ক</b><div class="muted" style="font-size:12px;margin:4px 0">পাঠের বাইরে, তোমার জার্নাল ও আজকের পাঠ দেখে AI একটি নতুন টাস্ক দেবে। প্রতিদিন আলাদা। ' + (ended ? 'কোর্স শেষ, তাই এখন রিভিশন সিরিজ চলছে।' : '') + '</div><button class="btn primary" data-stask="1">আজকের নতুন টাস্ক নাও</button><div id="sc-tout"></div></div>';
  }
  function offlineTask() {
    var D = DAYS[cur], pool = ['চার্টে ' + D.title + ' সম্পর্কিত একটি উদাহরণ খুঁজে স্ক্রিনশট নাও ও নিজের ভাষায় ৩ লাইন লেখো।', 'আজকের চার্টে একটি সিগন্যাল বা সেটআপ বেছে নাও। SL কোথায় বসবে ও কেন, লিখে রাখো (ট্রেড নিতে হবে না)।', 'গতকালের গোল্ড ৫ মিনিট চার্টে সবচেয়ে বড় লিকুইডিটি সুইপটি খুঁজে চিহ্নিত করো।', 'পেপার ট্রেডে একটি ট্রেড নাও না, শুধু এন্ট্রি-SL-TP-র ছক আঁকো ও ঝুঁকি ডলারে হিসাব করো।', 'আজ কোন কোন সময়ে বাজার সবচেয়ে বেশি নড়ল, লিখে রাখো (লন্ডন/নিউইয়র্ক খোলার সময় মিলিয়ে)।'];
    var pick = pool.filter(function (x) { return S.sph.indexOf(x.slice(0, 40)) < 0; });
    return '**টাস্ক (অফলাইন):** ' + (pick.length ? pick[Math.floor(Math.random() * pick.length)] : pool[Math.floor(Math.random() * pool.length)]);
  }
  async function aiTask() {
    var out = document.getElementById('sc-tout'); if (busy) return; busy = true;
    var D = DAYS[cur], ended = doneCount() >= DAYS.length, topic = ended ? R.COURSE.weeks[Math.floor(Math.random() * R.COURSE.weeks.length)].t : (D.wt + ' — ' + D.title);
    var prompt = 'বিষয়: ' + topic + '\nমূল কথা: ' + (ended ? 'পুরো কোর্স শেষ, এখন রিভিশন' : D.learn) + '\n\nশিক্ষার্থীর সর্বশেষ জার্নাল:\n' + journalBrief() + '\n\nআগে যে টাস্কগুলো দেওয়া হয়েছে (এগুলো আবার দেবে না):\n' + (S.sph.slice(-10).join('\n') || 'নেই') + '\n\nআজকের জন্য একটিই নতুন, ছোট (১৫-৩০ মিনিটের) টাস্ক দাও। কাঠামো: **টাস্কের নাম** (এক লাইন), তারপর ৩-৪টি ধাপ, শেষে "কেন এটা জরুরি" এক লাইন। শুধু ডেমো/চার্টে করার মতো, আসল টাকায় ট্রেড করতে বলবে না। নতুন সংখ্যা: ' + Date.now() % 997;
    if (out) out.innerHTML = '<div class="note-info">AI টাস্ক বানাচ্ছে…</div>';
    var txt;
    try { var j = await R.ai.ask(SYS, prompt, null); txt = j.text; }
    catch (e) { txt = offlineTask() + '\n\n(AI এখন পায়নি: ' + e.message + '। তাই এই সাধারণ টাস্ক দেওয়া হলো)'; }
    S.sp[dkey()] = { text: txt, done: false }; S.sph.push(String(txt).replace(/[*#\n]/g, ' ').trim().slice(0, 40)); if (S.sph.length > 60) S.sph.shift(); save();
    busy = false; paintTab();
  }

  /* ---------- 🧪 প্র্যাকটিস (অসীম, পুনরাবৃত্তি ছাড়া) ---------- */
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function firstSent(x) { var m = String(x).split(/[।\.]\s/)[0]; return m.length > 110 ? m.slice(0, 107) + '…' : m; }
  function quickQ() {
    var T = R.help ? R.help.TERMS : {}, keys = Object.keys(T); if (keys.length < 5) return null;
    var fresh = keys.filter(function (k) { return S.qh.indexOf(k) < 0; }); if (!fresh.length) { S.qh = []; fresh = keys; }
    var k = fresh[Math.floor(Math.random() * fresh.length)], wrong = shuffle(keys.filter(function (x) { return x !== k; })).slice(0, 3);
    var opts = shuffle([k].concat(wrong)).map(function (x) { return { k: x, t: firstSent(T[x][1]) }; });
    S.qh.push(k); if (S.qh.length > 80) S.qh.shift(); save();
    return { q: '"' + T[k][0].replace(/\?$/, '') + '" মানে কী?', o: opts.map(function (x) { return x.t; }), a: opts.findIndex(function (x) { return x.k === k; }), w: T[k][1] };
  }
  function practiceHtml() {
    var h = '<div class="card"><b>🧪 প্র্যাকটিস</b><div class="muted" style="font-size:12px;margin:4px 0">দুই রকম। <b>দ্রুত কুইজ</b> AI ছাড়া, যত খুশি, একই প্রশ্ন সব শেষ না হওয়া পর্যন্ত আসে না। <b>AI কুইজ</b> তোমার এখনকার পাঠ অনুযায়ী ৩টি নতুন প্রশ্ন বানায় (দিনে ৪ বার)।</div><div class="sc-ai"><button class="btn primary" data-pnew="1">⚡ দ্রুত কুইজ</button><button class="btn" data-pai="1">🤖 AI কুইজ (৩টি)</button></div></div>';
    if (PQ) h += PQ.map(function (q, qi) {
      var ans = q.picked !== undefined;
      return '<div class="card"><b>' + (qi + 1) + ') ' + esc(q.q) + '</b>' + q.o.map(function (o, oi) { var cls = !ans ? '' : (oi === q.a ? ' up' : (oi === q.picked ? ' dn' : '')); return '<button class="btn pq-o' + cls + '" style="display:block;width:100%;text-align:left;margin-top:6px;' + (ans && oi === q.a ? 'border-color:#4caf50;' : ans && oi === q.picked ? 'border-color:#ff5252;' : '') + '" data-pq="' + qi + '|' + oi + '"' + (ans ? ' disabled' : '') + '>' + esc(o) + '</button>'; }).join('') + (ans ? '<div class="note-info" style="margin-top:8px">' + (q.picked === q.a ? '✅ ঠিক!' : '❌ ঠিক উত্তর: ' + esc(q.o[q.a])) + '<br>' + esc(q.w || '') + '</div>' : '') + '</div>';
    }).join('');
    return h + '<div id="pq-msg"></div>';
  }
  async function aiPractice() {
    var msg = document.getElementById('pq-msg'), today = dkey(), cnt = lsGet('rtx_school_pq', {}); if (busy) return;
    if ((cnt[today] || 0) >= 4) { if (msg) msg.innerHTML = '<div class="note-warn">আজ ৪ বার AI কুইজ নেওয়া হয়ে গেছে (লিমিট বাঁচাতে)। "দ্রুত কুইজ" যত খুশি করতে পারো, বা কাল আবার এসো।</div>'; return; }
    if (!R.ai) { if (msg) msg.innerHTML = '<div class="note-warn">AI মডিউল লোড হয়নি।</div>'; return; }
    busy = true; if (msg) msg.innerHTML = '<div class="note-info">AI প্রশ্ন বানাচ্ছে…</div>';
    var fo = firstOpen(), seen = DAYS.slice(Math.max(0, fo - 14), fo + 1).map(function (d) { return d.title; }).join('; ');
    var prompt = 'শিক্ষার্থী এখন ' + DAYS[fo].wt + ' (দিন ' + (fo + 1) + '/১১২)-এ আছে। সাম্প্রতিক পাঠ: ' + seen + '\n\nএই বিষয়গুলো থেকে ঠিক ৩টি বহুনির্বাচনী প্রশ্ন (সহজ → একটু কঠিন), প্রতিটিতে ৪টি অপশন, একটিই সঠিক।\nএই প্রশ্নগুলো আগে করা হয়েছে, আবার করবে না:\n' + (S.aq.slice(-20).join('\n') || 'নেই') + '\n\nউত্তর শুধু JSON অ্যারে, আর কিছু লিখবে না, ফরম্যাট: [{"q":"প্রশ্ন","o":["ক","খ","গ","ঘ"],"a":0,"w":"কেন এটা ঠিক, ১-২ লাইনে"}]। a = সঠিক অপশনের নম্বর (০ থেকে ৩)। সব বাংলায়। সিরিয়াল: ' + Date.now() % 9973;
    try {
      var j = await R.ai.ask(SYS, prompt, null), t = String(j.text).replace(/```json|```/g, ''), a = t.indexOf('['), b = t.lastIndexOf(']'), arr = JSON.parse(t.slice(a, b + 1));
      arr = arr.filter(function (x) { return x && x.q && Array.isArray(x.o) && x.o.length >= 2 && x.a >= 0 && x.a < x.o.length; }).slice(0, 3);
      if (!arr.length) throw new Error('AI-র উত্তর পড়া যায়নি, আবার চেষ্টা করো');
      PQ = arr; arr.forEach(function (x) { S.aq.push(String(x.q).slice(0, 50)); }); if (S.aq.length > 60) S.aq.shift(); save();
      cnt[today] = (cnt[today] || 0) + 1; lsSet('rtx_school_pq', cnt); busy = false; paintTab();
    } catch (e) { busy = false; if (msg) msg.innerHTML = '<div class="note-warn">' + esc(e.message) + '</div>'; }
  }

  function tabBar() { return '<div class="mrow" style="margin:10px 0;flex-wrap:wrap;gap:6px">' + TABS.map(function (x) { return '<button class="mbtn' + (S.tab === x[0] ? ' on' : '') + '" data-tab="' + x[0] + '" style="flex:1 1 30%">' + x[1] + '</button>'; }).join('') + '</div>'; }
  function tabHtml() {
    if (S.tab === 'course') return preHtml() + '<h3 style="margin:14px 0 6px">সব সপ্তাহ</h3><div id="sc-weeks">' + weeksHtml() + '</div><div class="btnrow"><button class="btn" id="sc-reset">কোর্স নতুন করে শুরু (প্রগতি মুছবে)</button></div>';
    if (S.tab === 'words') return wordsHtml();
    if (S.tab === 'lessons') return lessonsHtml();
    if (S.tab === 'practice') return practiceHtml();
    return taskCardHtml() + '<div id="sc-today">' + todayHtml() + '</div>';
  }
  function paintTab() { var b = document.getElementById('sc-body'); if (b) b.innerHTML = tabHtml(); var t = document.getElementById('sc-tabs'); if (t) t.innerHTML = tabBar(); }
  function setTab(k) { S.tab = k; save(); paintTab(); var b = document.getElementById('sc-tabs'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'start' }); }
  function render() {
    var n = doneCount();
    el.innerHTML = '<h2 class="pg">🏫 RTX স্কুল</h2>' +
      '<div class="card warn">এখানে একদম শুরু থেকে ১৬ সপ্তাহে (৪ মাসে) ট্রেডিং শেখানো হবে। প্রতিদিন একটি নতুন পাঠ, সঙ্গে AI-র নতুন টাস্ক ও কুইজ। তাড়াহুড়ো নেই, একদিন বাদ গেলেও পরের দিন সেখান থেকেই শুরু। এটা শেখার জন্য, আর্থিক পরামর্শ নয়, আর কোনো কোর্সই লাভের নিশ্চয়তা দেয় না।</div>' +
      '<div class="stats"><div class="stat"><b>' + n + '/' + DAYS.length + '</b><span class="muted">দিন সম্পূর্ণ</span></div><div class="stat"><b>' + streak() + '</b><span class="muted">টানা দিন</span></div></div>' +
      '<div class="card" style="margin-top:10px"><div class="bar" style="margin:0"><i style="width:' + (n / DAYS.length * 100) + '%"></i></div></div>' +
      '<div id="sc-tabs">' + tabBar() + '</div><div id="sc-body">' + tabHtml() + '</div>';
  }
  function refreshToday() { paintTab(); }
  function refreshStats() { if (!el) return; var st = el.querySelector('.stats'); if (st) st.innerHTML = '<div class="stat"><b>' + doneCount() + '/' + DAYS.length + '</b><span class="muted">দিন সম্পূর্ণ</span></div><div class="stat"><b>' + streak() + '</b><span class="muted">টানা দিন</span></div>'; var b = el.querySelector('.bar i'); if (b) b.style.width = (doneCount() / DAYS.length * 100) + '%'; }

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
      if (t.dataset && t.dataset.stdone) { var sp = S.sp[dkey()]; if (sp) { sp.done = t.checked; save(); } return; }
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
      if (d.tab) { setTab(d.tab); return; }
      if (d.stask) { aiTask(); return; }
      if (d.pnew) { var q1 = quickQ(); PQ = q1 ? [q1] : null; paintTab(); return; }
      if (d.pai) { aiPractice(); return; }
      if (d.pq) { var pr = d.pq.split('|'), qq = PQ && PQ[+pr[0]]; if (qq && qq.picked === undefined) { qq.picked = +pr[1]; paintTab(); } return; }
      if (d.lsn) { lessonsDone[d.lsn] = !lessonsDone[d.lsn]; lsSet('rtx_lessons', lessonsDone); paintTab(); return; }
      if (d.day !== undefined) { cur = +d.day; S.cur = cur; S.tab = 'today'; save(); paintTab(); document.getElementById('sc-tabs').scrollIntoView({ block: 'start' }); return; }
      if (t.id === 'sc-prev' && cur > 0) { cur--; S.cur = cur; save(); refreshToday(); return; }
      if (t.id === 'sc-next' && cur < DAYS.length - 1) { cur++; S.cur = cur; save(); refreshToday(); document.getElementById('sc-tabs').scrollIntoView({ block: 'start' }); return; }
      if (t.id === 'sc-reset') { if (window.confirm('পুরো কোর্সের প্রগতি মুছে নতুন করে শুরু করবে?')) { S = { done: {}, days: {}, pre: {}, cur: null, sp: S.sp, sph: S.sph, qh: S.qh, aq: S.aq, tab: 'course' }; save(); notes = {}; lsSet('rtx_school_notes', notes); cur = 0; render(); } }
    });
  }

  function open(tab) { if (!el) return; S.tab = tab || S.tab; save(); var b = document.querySelector('#bottomnav button[data-view="tasks"]'); if (b) b.click(); paintTab(); }
  R.school = { build: build, DAYS: DAYS, open: open };
})(window.RTX);
