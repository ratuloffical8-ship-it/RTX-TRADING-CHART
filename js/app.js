// ফাইলের নাম: app.js
// পাথ: js/app.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — অ্যাপ লজিক: টপবার, টুলবার, লাইভ ডেটা, ইন্ডিকেটর শিট, শেখা ও দৈনিক টাস্ক */
(function (R) {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };

  var state = { symbol: store.get('rtx_sym', 'BTCUSDT'), tf: store.get('rtx_tf', '15m') };
  if (!R.SYMBOLS.some(function (s) { return s.id === state.symbol; })) state.symbol = 'BTCUSDT';
  if (!R.TFS.some(function (t) { return t.id === state.tf; })) state.tf = '15m';
  var live = null, token = 0, demo = false, view = 'chart';

  /* ---------- টোস্ট ---------- */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  R.onError = toast;

  /* ---------- টপবার ---------- */
  function buildTop() {
    var sel = $('#symbol');
    sel.innerHTML = R.SYMBOLS.map(function (s) { return '<option value="' + s.id + '">' + s.name + '</option>'; }).join('');
    sel.value = state.symbol;
    sel.onchange = function () { state.symbol = sel.value; store.set('rtx_sym', state.symbol); load(); };

    var bar = $('#tfbar');
    bar.innerHTML = R.TFS.map(function (t) { return '<button data-tf="' + t.id + '">' + t.label + '</button>'; }).join('');
    bar.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.tf = b.dataset.tf; store.set('rtx_tf', state.tf); markTf(); load();
    };
    markTf();

    $('#btn-fs').onclick = async function () {
      var d = document, e = d.documentElement;
      try {
        if (!d.fullscreenElement) {
          await (e.requestFullscreen || e.webkitRequestFullscreen).call(e);
          try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) {}
        } else {
          try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (_) {}
          await d.exitFullscreen();
        }
      } catch (_) { toast('ফুলস্ক্রিন সাপোর্ট নেই। ফোন ঘুরিয়ে ল্যান্ডস্কেপ করো।'); }
    };
    $('#btn-indicators').onclick = openSheet;
  }
  function markTf() {
    document.querySelectorAll('#tfbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.tf === state.tf); });
  }
  function setStatus(on) { var d = $('#status'); d.className = 'dot ' + (on ? 'on' : 'off'); d.title = on ? 'লাইভ' : 'অফলাইন'; }

  /* ---------- দাম ও লেজেন্ড ---------- */
  function updatePrice() {
    var cs = R.chart.candles(), last = cs[cs.length - 1]; if (!last) return;
    $('#price-val').textContent = R.chart.fmt(last.close);
    var tf = R.TFS.find(function (t) { return t.id === state.tf; });
    var back = Math.max(0, cs.length - 1 - Math.round(86400 / tf.sec));
    var ref = cs[back].open, pc = ref ? (last.close - ref) / ref * 100 : 0;
    var el = $('#price-chg'); el.textContent = (pc >= 0 ? '+' : '') + pc.toFixed(2) + '%';
    el.className = pc >= 0 ? 'up' : 'dn';
  }
  function legend(c) {
    if (!c) return;
    var f = R.chart.fmt, up = c.close >= c.open, ch = c.close - c.open, pc = c.open ? ch / c.open * 100 : 0;
    var s = R.SYMBOLS.find(function (x) { return x.id === state.symbol; });
    $('#legend').innerHTML = '<span class="l-sym">' + s.name + ' · ' + state.tf + (demo ? ' · ডেমো' : '') + '</span><br>' +
      'O ' + f(c.open) + ' H ' + f(c.high) + ' L ' + f(c.low) + ' C ' + f(c.close) +
      ' <span class="' + (up ? 'up' : 'dn') + '">' + (ch >= 0 ? '+' : '') + pc.toFixed(2) + '%</span>';
  }

  /* ---------- ডেটা লোড ---------- */
  async function load() {
    var my = ++token;
    if (live) { live.close(); live = null; }
    var ld = $('#loading'); ld.style.display = 'flex'; ld.style.background = ''; ld.textContent = 'লোড হচ্ছে…'; setStatus(false);
    var tf = R.TFS.find(function (t) { return t.id === state.tf; }), arr;
    demo = false;
    try { arr = await R.data.klines(state.symbol, state.tf, 1000); }
    catch (e) {
      /* নকল ক্যান্ডেল দেখানো হয় না: আসল ডেটা না এলে শুধু বার্তা */
      if (my !== token) return;
      var nokey = e && e.message === 'NO_KEY';
      ld.style.background = '#000';
      ld.innerHTML = (nokey ? '🧮 টুলস ট্যাবে Twelve Data key দাও, তারপর ফরেক্স চার্ট আসবে।' : 'আসল ডেটা আনা যায়নি। ইন্টারনেট চেক করো।') + '<br><br><button class="btn primary" id="retry">আবার চেষ্টা করো</button>';
      var rb = document.getElementById('retry'); if (rb) rb.onclick = load;
      return;
    }
    if (my !== token) return;
    R.chart.setData(arr, tf.sec, state.symbol);
    updatePrice(); legend(R.chart.last());
    ld.style.display = 'none';
    var onCandle = function (c) { if (my !== token) return; R.chart.update(c); updatePrice(); legend(c); };
    live = demo ? R.data.demoLive(tf.sec, R.chart.last, onCandle, setStatus)
                : R.data.live(state.symbol, state.tf, onCandle, setStatus);
  }

  /* ---------- ড্রয়িং টুলবার ---------- */
  var TOOLS = [
    ['cursor', '✥', 'কার্সর (চার্ট স্ক্রল/জুম)'],
    ['trend', '╱', 'ট্রেন্ড লাইন'],
    ['ray', '↗', 'রে (ডানে বাড়ানো লাইন)'],
    ['hline', '―', 'হরাইজন্টাল লাইন'],
    ['vline', '│', 'ভার্টিক্যাল লাইন'],
    ['rect', '▭', 'বক্স (জোন)'],
    ['fib', '<small>Fib</small>', 'ফিবোনাচি রিট্রেসমেন্ট'],
    ['text', '<small>T</small>', 'টেক্সট'],
    ['measure', '📏', 'মাপ (দাম, %, বার)'],
    ['eraser', '⌫', 'ইরেজার (লাইনের কাছে ট্যাপ)']
  ];
  function buildToolbar() {
    var D = R.chart.drawing, html = '';
    TOOLS.forEach(function (t) { html += '<button data-tool="' + t[0] + '" title="' + t[2] + '">' + t[1] + '</button>'; });
    html += '<div class="sep"></div>' +
      '<button id="t-magnet" title="ম্যাগনেট (ক্যান্ডেলে স্ন্যাপ)">🧲</button>' +
      '<button id="t-stay" title="টুল চালু রাখো">🔒</button>' +
      '<button id="t-undo" title="আনডু">↶</button>' +
      '<button id="t-clear" title="সব মুছো">🗑</button>' +
      '<button id="t-latest" title="সর্বশেষ ক্যান্ডেলে যাও">⏭</button>';
    var tb = $('#toolbar'); tb.innerHTML = html;
    tb.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) { D.setTool(b.dataset.tool); return; }
      if (b.id === 't-magnet') { D.toggleMagnet(); b.classList.toggle('active', D.magnet()); toast(D.magnet() ? 'ম্যাগনেট চালু' : 'ম্যাগনেট বন্ধ'); }
      else if (b.id === 't-stay') { D.toggleStay(); b.classList.toggle('active', D.stay()); toast(D.stay() ? 'টুল চালু থাকবে' : 'একবার আঁকলে কার্সরে ফিরবে'); }
      else if (b.id === 't-undo') D.undo();
      else if (b.id === 't-clear') { if (D.count() && confirm('এই সিম্বলের সব ড্রয়িং মুছে ফেলবে?')) D.clearAll(); }
      else if (b.id === 't-latest') R.chart.goLatest();
    };
    $('#t-magnet').classList.toggle('active', D.magnet());
    D.onToolChange(function (t) {
      tb.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.toggle('active', b.dataset.tool === t); });
    });
    D.setTool('cursor');
  }

  /* ---------- ইন্ডিকেটর শিট ---------- */
  var SAMPLE = '// candles: [{time, open, high, low, close, volume}, ...]\n' +
    '// ta: sma, ema, stdev, rsi, highest, lowest\n' +
    '// return: প্রতি ক্যান্ডেলের জন্য একটি সংখ্যা (বা null)\n' +
    'const c = candles.map(x => x.close);\n' +
    'return ta.ema(c, 21);';
  function closeSheet() { var s = $('#sheet'); if (s) s.remove(); }
  function openSheet() {
    closeSheet();
    var IND = R.chart.indicators;
    var rows = IND.order.map(function (id) {
      var d = IND.defs[id];
      return '<div class="row"><label><input type="checkbox" data-ind="' + id + '"' + (IND.isOn(id) ? ' checked' : '') + '><span>' + esc(d.name) + '</span></label>' +
        (d.custom ? '<button class="del" data-del="' + id + '" title="মুছো">✕</button>' : '') + '</div>';
    }).join('');
    var box = document.createElement('div'); box.id = 'sheet';
    var tzNow = R.chart.tz();
    box.innerHTML = '<div class="sheet-body"><div class="sheet-h"><b>ইন্ডিকেটর</b><button id="sheet-x">✕</button></div>' +
      '<div class="row"><label style="flex:1">চার্টের সময় দেখাও</label><select id="tz-sel" style="background:#111;color:#fff;border:1px solid #262626;border-radius:8px;padding:6px 8px">' +
      '<option value="local"' + (tzNow === 'local' ? ' selected' : '') + '>ফোনের সময়</option><option value="utc"' + (tzNow === 'utc' ? ' selected' : '') + '>UTC</option></select></div>' + rows +
      '<hr><b>নিজের ইন্ডিকেটর যোগ করো</b>' +
      '<p class="hint">নিচে JavaScript লেখো। <code>candles</code> আর <code>ta</code> ব্যবহার করে একটা অ্যারে return করো। সেভ করলেই চার্টে বসে যাবে এবং ফোনে সেভ থাকবে।</p>' +
      '<input type="text" id="c-name" placeholder="ইন্ডিকেটরের নাম" value="My EMA">' +
      '<div class="row2"><input type="color" id="c-color" value="#ffd54f"><label><input type="checkbox" id="c-own"> আলাদা স্কেলে (নিচের দিকে)</label></div>' +
      '<textarea id="c-code" rows="9" spellcheck="false"></textarea>' +
      '<button class="primary" id="c-save">সেভ করে চালু করো</button></div>';
    document.body.appendChild(box);
    box.querySelector('#c-code').value = SAMPLE;
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.id === 'sheet-x') { closeSheet(); return; }
      var del = e.target.closest('[data-del]');
      if (del) { IND.removeCustom(del.dataset.del); openSheet(); }
    });
    box.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'tz-sel') { R.chart.setTz(t.value); toast(t.value === 'utc' ? 'সময় এখন UTC' : 'সময় এখন ফোনের সময়'); return; }
      if (t.dataset && t.dataset.ind) IND.toggle(t.dataset.ind, t.checked);
    });
    box.querySelector('#c-save').onclick = function () {
      var res = IND.addCustom({
        name: box.querySelector('#c-name').value.trim() || 'Custom',
        color: box.querySelector('#c-color').value,
        own: box.querySelector('#c-own').checked,
        code: box.querySelector('#c-code').value
      });
      if (res.error) toast(res.error); else { toast('ইন্ডিকেটর যোগ হয়েছে'); openSheet(); }
    };
  }

  /* ---------- শেখা ---------- */
  function buildLearn() {
    var el = $('#view-learn'), done = store.get('rtx_lessons', {});
    var html = '<h2 class="pg">ট্রেডিং শেখা</h2>' +
      '<div class="card warn">এটা শেখার জন্য, আর্থিক পরামর্শ নয়। ট্রেডিংয়ে টাকা হারানোর ঝুঁকি আছে। আগে ডেমো বা পেপার ট্রেডে অনুশীলন করো।</div>' +
      '<div class="card"><b id="l-prog">০</b><div class="bar"><i id="l-bar"></i></div></div>';
    R.LESSONS.forEach(function (l) {
      html += '<details class="lesson" data-id="' + l.id + '"><summary><span>' + l.icon + '</span>' + esc(l.title) + '<span class="tick">✓</span></summary><div class="body"><ul>' +
        l.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul><div class="practice"><b>অনুশীলন:</b> ' + esc(l.practice) +
        '</div><button class="btn" data-done="' + l.id + '"></button></div></details>';
    });
    el.innerHTML = html;
    function refresh() {
      var n = 0;
      el.querySelectorAll('details.lesson').forEach(function (d) {
        var ok = !!done[d.dataset.id]; if (ok) n++;
        d.classList.toggle('done', ok);
        d.querySelector('[data-done]').textContent = ok ? '✓ সম্পন্ন (আবার ট্যাপ করলে বাতিল)' : 'সম্পন্ন করেছি';
      });
      $('#l-prog').textContent = n + ' / ' + R.LESSONS.length + ' পাঠ সম্পন্ন';
      $('#l-bar').style.width = (n / R.LESSONS.length * 100) + '%';
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-done]'); if (!b) return;
      done[b.dataset.done] = !done[b.dataset.done]; store.set('rtx_lessons', done); refresh();
    });
    refresh();
  }

  /* ---------- দৈনিক টাস্ক ---------- */
  function dayKey(d) { return (d || new Date()).toLocaleDateString('en-CA'); }
  function buildTasks() {
    var el = $('#view-tasks');
    el.innerHTML = '<h2 class="pg">আজকের টাস্ক</h2><div class="muted" id="t-date" style="margin:-6px 0 10px"></div>' +
      '<div class="stats"><div class="stat"><b id="t-count">0</b><span class="muted">আজ সম্পন্ন</span></div><div class="stat"><b id="t-streak">0</b><span class="muted">টানা দিন</span></div></div>' +
      '<div class="card" style="margin-top:10px"><div class="bar" style="margin:0 0 6px"><i id="t-bar"></i></div><div id="t-list"></div>' +
      '<div class="addrow"><input type="text" id="t-new" placeholder="নিজের টাস্ক যোগ করো"><button class="btn primary" id="t-add">+</button></div></div>' +
      '<div class="card"><b>গত ৭ দিন</b><div class="week" id="t-week"></div></div>' +
      '<div class="card"><b>আজকের প্ল্যান ও শিক্ষা</b><p class="muted" style="margin:4px 0 8px">আজ কী শিখলাম, কাল কী করব?</p><textarea class="note" id="t-note" placeholder="এখানে লেখো…"></textarea></div>';
    $('#t-date').textContent = new Date().toLocaleDateString('bn-BD', { weekday: 'long', day: 'numeric', month: 'long' });

    function all() { return store.get('rtx_tasks_done', {}); }
    function custom() { return store.get('rtx_tasks_custom', []); }
    function coreDone(day) { var m = all()[day] || {}; return R.DAILY.filter(function (t) { return m[t.id]; }).length; }
    function streak() {
      var d = new Date(), n = 0;
      if (coreDone(dayKey(d)) < R.DAILY.length) d.setDate(d.getDate() - 1);
      while (coreDone(dayKey(d)) >= R.DAILY.length) { n++; d.setDate(d.getDate() - 1); if (n > 400) break; }
      return n;
    }
    function refresh() {
      var today = dayKey(), m = all()[today] || {}, list = R.DAILY.concat(custom());
      $('#t-list').innerHTML = list.map(function (t) {
        var isC = t.id.indexOf('u_') === 0;
        return '<label class="task' + (m[t.id] ? ' done' : '') + '"><input type="checkbox" data-t="' + t.id + '"' + (m[t.id] ? ' checked' : '') + '><span>' + esc(t.text) + '</span>' +
          (isC ? '<button class="del" data-del="' + t.id + '">✕</button>' : '') + '</label>';
      }).join('');
      var n = list.filter(function (t) { return m[t.id]; }).length;
      $('#t-count').textContent = n + '/' + list.length;
      $('#t-bar').style.width = (list.length ? n / list.length * 100 : 0) + '%';
      $('#t-streak').textContent = streak();
      var wk = '', names = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি'];
      for (var i = 6; i >= 0; i--) {
        var d = new Date(); d.setDate(d.getDate() - i);
        var ok = coreDone(dayKey(d)) >= R.DAILY.length;
        wk += '<div><i class="' + (ok ? 'ok' : '') + '">' + (ok ? '✓' : '·') + '</i>' + names[d.getDay()] + '</div>';
      }
      $('#t-week').innerHTML = wk;
    }
    el.addEventListener('change', function (e) {
      var t = e.target; if (!t.dataset || !t.dataset.t) return;
      var a = all(), day = dayKey(); a[day] = a[day] || {}; a[day][t.dataset.t] = t.checked; store.set('rtx_tasks_done', a); refresh();
    });
    el.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) { e.preventDefault(); store.set('rtx_tasks_custom', custom().filter(function (x) { return x.id !== del.dataset.del; })); refresh(); return; }
      if (e.target.id === 't-add') {
        var inp = $('#t-new'), v = inp.value.trim(); if (!v) return;
        var c = custom(); c.push({ id: 'u_' + Date.now().toString(36), text: v }); store.set('rtx_tasks_custom', c); inp.value = ''; refresh();
      }
    });
    var note = $('#t-note'), nk = 'rtx_note_' + dayKey();
    note.value = store.get(nk, '');
    note.oninput = function () { store.set(nk, note.value); };
    refresh();
  }

  /* ---------- নেভিগেশন ---------- */
  function buildNav() {
    $('#bottomnav').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      view = b.dataset.view;
      document.querySelectorAll('#bottomnav button').forEach(function (x) { x.classList.toggle('active', x === b); });
      document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
      document.body.classList.toggle('view-chart', view === 'chart');
      $('#btn-indicators').hidden = view !== 'chart';
      closeSheet();
    };
  }

  /* ---------- শুরু ---------- */
  function start() {
    buildTop(); buildNav(); window.addEventListener('rtx-fx-refresh', function (e) { var d = e.detail || {}; if (d.symbol === state.symbol && d.tf === state.tf) load(); }); if (R.school) R.school.build($('#view-tasks')); else buildTasks();
    $('#btn-indicators').hidden = false;
    if (typeof LightweightCharts === 'undefined') {
      $('#loading').textContent = 'চার্ট লাইব্রেরি লোড হয়নি। ইন্টারনেট চেক করে পেজ রিফ্রেশ করো।';
      return;
    }
    R.chart.init($('#chart'));
    R.chart.onHover(function (c) { legend(c || R.chart.last()); });
    R.chart.onNeedMore(async function (firstTime) {
      var tf = R.TFS.find(function (t) { return t.id === state.tf; });
      try {
        var older = demo ? R.data.demo(state.symbol, tf.sec, 500, firstTime)
                         : await R.data.klines(state.symbol, state.tf, 1000, firstTime * 1000 - 1);
        R.chart.prepend(older);
      } catch (e) { R.chart.noMore(); }
    });
    buildToolbar();
    load();
  }
  start();
})(window.RTX);
