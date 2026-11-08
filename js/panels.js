/* RTX Chart — নিচের আলাদা প্যানেল: RSI ও MACD (মূল চার্টের সাথে সিঙ্ক) */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var ta = R.chart.ta;

  function calcMacd(cl, f, s, g) {
    f = f || 12; s = s || 26; g = g || 9;
    var ef = ta.ema(cl, f), es = ta.ema(cl, s);
    var macd = cl.map(function (_, i) { return (ef[i] == null || es[i] == null) ? null : ef[i] - es[i]; });
    var sig = new Array(cl.length).fill(null), hist = new Array(cl.length).fill(null);
    var start = macd.findIndex(function (v) { return v != null; });
    if (start >= 0) {
      var seg = ta.ema(macd.slice(start), g);
      for (var i = 0; i < seg.length; i++) {
        sig[start + i] = seg[i];
        if (seg[i] != null) hist[start + i] = macd[start + i] - seg[i];
      }
    }
    return { macd: macd, signal: sig, hist: hist };
  }
  R.panels = { calcMacd: calcMacd };

  if (typeof document === 'undefined' || typeof LightweightCharts === 'undefined') return;
  var host = document.getElementById('panels');
  if (!host) return;

  var main = null, active = {}, idxMap = {}, timer = 0;
  function store(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function num(v, d) { return v == null ? '--' : (Math.abs(v) >= 1 ? v.toFixed(d || 2) : v.toFixed(5)); }

  function rangeEq(a, b) { return a && b && Math.abs(a.from - b.from) < 0.01 && Math.abs(a.to - b.to) < 0.01; }
  function syncFromMain() {
    if (!main) return;
    var r = main.timeScale().getVisibleLogicalRange(); if (!r) return;
    Object.keys(active).forEach(function (id) {
      var ts = active[id].chart.timeScale();
      if (!rangeEq(ts.getVisibleLogicalRange(), r)) ts.setVisibleLogicalRange(r);
    });
  }

  function ensureMain() {
    if (main) return true;
    var m = R.chart.raw && R.chart.raw(); if (!m) return false;
    main = m;
    try { main.priceScale('right').applyOptions({ minimumWidth: 64 }); } catch (_) {}
    main.timeScale().subscribeVisibleLogicalRangeChange(syncFromMain);
    main.subscribeCrosshairMove(function (param) {
      var idx = (param && param.time != null && idxMap[param.time] != null) ? idxMap[param.time] : null;
      Object.keys(active).forEach(function (id) { show(active[id], idx); });
    });
    return true;
  }

  function show(p, idx) {
    var n = R.chart.candles().length;
    if (idx == null || idx < 0 || idx >= n) idx = n - 1;
    if (!p.vals) { p.title.textContent = p.id === 'rsi' ? 'RSI 14' : 'MACD 12 26 9'; return; }
    if (p.id === 'rsi') {
      var v = p.vals.rsi[idx];
      p.title.innerHTML = 'RSI 14 <b>' + (v == null ? '--' : v.toFixed(1)) + '</b>';
    } else {
      p.title.innerHTML = 'MACD 12 26 9 &nbsp; <b>' + num(p.vals.macd[idx], 3) + '</b> &nbsp; Signal ' + num(p.vals.signal[idx], 3) + ' &nbsp; Hist ' + num(p.vals.hist[idx], 3);
    }
  }

  function pts(arr, cs) {
    var out = new Array(cs.length);
    for (var i = 0; i < cs.length; i++) {
      var v = arr[i];
      out[i] = (typeof v === 'number' && isFinite(v)) ? { time: cs[i].time, value: v } : { time: cs[i].time };
    }
    return out;
  }

  function recompute() {
    var cs = R.chart.candles();
    if (!cs.length) return;
    idxMap = {};
    for (var i = 0; i < cs.length; i++) idxMap[cs[i].time] = i;
    var cl = cs.map(function (c) { return c.close; });
    Object.keys(active).forEach(function (id) {
      var p = active[id];
      if (id === 'rsi') {
        var r = ta.rsi(cl, 14);
        p.vals = { rsi: r };
        p.s.rsi.setData(pts(r, cs));
      } else {
        var m = calcMacd(cl);
        p.vals = m;
        p.s.hist.setData(cs.map(function (c, j) {
          var h = m.hist[j];
          return h == null ? { time: c.time } : { time: c.time, value: h, color: h >= 0 ? 'rgba(41,121,255,0.7)' : 'rgba(255,255,255,0.55)' };
        }));
        p.s.macd.setData(pts(m.macd, cs));
        p.s.sig.setData(pts(m.signal, cs));
      }
      show(p, null);
    });
    syncFromMain();
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = 0; recompute(); }, 300);
  }

  function mkPanel(id) {
    var box = el('div', 'panel'), body = el('div', 'panel-body'), title = el('div', 'panel-title');
    box.appendChild(body); box.appendChild(title); host.appendChild(box);
    var ch = LightweightCharts.createChart(body, {
      autoSize: true,
      layout: { background: { type: 'solid', color: '#000000' }, textColor: '#9aa0a6', fontSize: 10 },
      grid: { vertLines: { color: '#0f0f0f' }, horzLines: { color: '#0f0f0f' } },
      rightPriceScale: { borderColor: '#1f1f1f', minimumWidth: 64, scaleMargins: { top: 0.14, bottom: 0.14 } },
      timeScale: { visible: false, borderColor: '#1f1f1f', rightOffset: 6, barSpacing: 7, minBarSpacing: 1.5 },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#666', labelVisible: false }, horzLine: { color: '#444' } },
      handleScroll: false, handleScale: false
    });
    var p = { id: id, box: box, chart: ch, title: title, s: {}, vals: null };
    var line = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    if (id === 'rsi') {
      p.s.rsi = ch.addLineSeries(Object.assign({ color: '#e0e0e0', lineWidth: 1.5,
        autoscaleInfoProvider: function () { return { priceRange: { minValue: 0, maxValue: 100 } }; } }, line));
      [70, 30].forEach(function (lv) {
        p.s.rsi.createPriceLine({ price: lv, color: '#444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
      });
    } else {
      p.s.hist = ch.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
      p.s.macd = ch.addLineSeries(Object.assign({ color: '#2979ff', lineWidth: 1.5 }, line));
      p.s.sig = ch.addLineSeries(Object.assign({ color: '#ffffff', lineWidth: 1 }, line));
    }
    ch.subscribeCrosshairMove(function (param) {
      show(p, (param && param.time != null && idxMap[param.time] != null) ? idxMap[param.time] : null);
    });
    show(p, null);
    return p;
  }

  function setPanel(id, on) {
    if (on && !active[id]) {
      active[id] = mkPanel(id);
      ensureMain(); recompute();
    } else if (!on && active[id]) {
      active[id].chart.remove(); active[id].box.remove(); delete active[id];
    }
    save('rtx_panels', Object.keys(active));
    chips.querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', !!active[b.dataset.p]); });
  }

  var chips = el('div', 'pchips');
  chips.innerHTML = '<span>প্যানেল</span><button data-p="rsi">RSI</button><button data-p="macd">MACD</button>';
  host.appendChild(chips);
  chips.onclick = function (e) {
    var b = e.target.closest('button'); if (!b) return;
    setPanel(b.dataset.p, !active[b.dataset.p]);
  };

  /* চার্টের ডেটা বদলালেই প্যানেল আপডেট */
  ['setData', 'prepend'].forEach(function (name) {
    var f = R.chart[name];
    R.chart[name] = function () { var r = f.apply(this, arguments); ensureMain(); recompute(); return r; };
  });
  var fu = R.chart.update;
  R.chart.update = function () { var r = fu.apply(this, arguments); schedule(); return r; };

  store('rtx_panels', []).forEach(function (id) { if (id === 'rsi' || id === 'macd') setPanel(id, true); });
})(window.RTX);
