/* RTX Chart — চার্ট ইঞ্জিন: ক্যান্ডেল (নীল/সাদা), ইন্ডিকেটর সিস্টেম (কাস্টম সহ), ড্রয়িং টুল */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var C = { bg: '#000000', text: '#9aa0a6', grid: '#0f0f0f', border: '#1f1f1f', up: '#2979ff', down: '#ffffff', draw: '#ffffff' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  var chart, candle, vol, wrap, canvas, ctx;
  var candles = [], tfSec = 60, prec = 2;
  var hoverCb = function () {}, moreCb = function () {}, toolCb = function () {};
  var loadingMore = false, noMoreFlag = false, indTimer = 0;

  function store(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function err(m) { if (R.onError) R.onError(m); }

  /* ================= টেকনিক্যাল অ্যানালাইসিস হেল্পার ================= */
  var ta = {
    sma: function (a, p) {
      var o = new Array(a.length).fill(null), s = 0;
      for (var i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; }
      return o;
    },
    ema: function (a, p) {
      var o = new Array(a.length).fill(null), k = 2 / (p + 1), e = null;
      for (var i = 0; i < a.length; i++) {
        if (i === p - 1) { var s = 0; for (var j = 0; j < p; j++) s += a[j]; e = s / p; o[i] = e; }
        else if (i >= p) { e = a[i] * k + e * (1 - k); o[i] = e; }
      }
      return o;
    },
    stdev: function (a, p) {
      var m = ta.sma(a, p), o = new Array(a.length).fill(null);
      for (var i = p - 1; i < a.length; i++) {
        var s = 0; for (var j = i - p + 1; j <= i; j++) s += (a[j] - m[i]) * (a[j] - m[i]);
        o[i] = Math.sqrt(s / p);
      }
      return o;
    },
    rsi: function (a, p) {
      p = p || 14;
      var o = new Array(a.length).fill(null), g = 0, l = 0;
      for (var i = 1; i < a.length; i++) {
        var d = a[i] - a[i - 1];
        if (i <= p) {
          g += Math.max(d, 0); l += Math.max(-d, 0);
          if (i === p) { g /= p; l /= p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
        } else {
          g = (g * (p - 1) + Math.max(d, 0)) / p; l = (l * (p - 1) + Math.max(-d, 0)) / p;
          o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
        }
      }
      return o;
    },
    highest: function (a, p) {
      var o = new Array(a.length).fill(null);
      for (var i = p - 1; i < a.length; i++) { var m = -Infinity; for (var j = i - p + 1; j <= i; j++) if (a[j] > m) m = a[j]; o[i] = m; }
      return o;
    },
    lowest: function (a, p) {
      var o = new Array(a.length).fill(null);
      for (var i = p - 1; i < a.length; i++) { var m = Infinity; for (var j = i - p + 1; j <= i; j++) if (a[j] < m) m = a[j]; o[i] = m; }
      return o;
    }
  };

  /* ================= ইন্ডিকেটর সিস্টেম ================= */
  var IND = { defs: {}, order: [], active: {} };
  IND.register = function (def) {
    IND.defs[def.id] = def;
    if (IND.order.indexOf(def.id) < 0) IND.order.push(def.id);
  };
  IND.isOn = function (id) { return !!IND.active[id]; };
  function persistActive() { save('rtx_ind', Object.keys(IND.active)); }

  IND.toggle = function (id, on) {
    var def = IND.defs[id]; if (!def) return;
    if (on === undefined) on = !IND.active[id];
    if (on) {
      if (IND.active[id]) return;
      if (def.special) { IND.active[id] = {}; if (vol) vol.applyOptions({ visible: true }); persistActive(); return; }
      var series = {}, scaleId = def.own ? 'own_' + id : undefined;
      def.lines.forEach(function (l, idx) {
        var opts = { color: l.color, lineWidth: l.width || 1, lineStyle: l.style || 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
        if (scaleId) opts.priceScaleId = scaleId;
        series[l.key] = chart.addLineSeries(opts);
        if (idx === 0 && def.levels) def.levels.forEach(function (lv) {
          series[l.key].createPriceLine({ price: lv, color: '#444', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        });
      });
      if (scaleId) chart.priceScale(scaleId).applyOptions({ scaleMargins: { top: 0.78, bottom: 0.02 }, visible: false });
      IND.active[id] = { series: series };
      compute(id);
    } else {
      var a = IND.active[id]; if (!a) return;
      if (def.special) { if (vol) vol.applyOptions({ visible: false }); }
      else Object.keys(a.series).forEach(function (k) { chart.removeSeries(a.series[k]); });
      delete IND.active[id];
    }
    persistActive();
  };

  function compute(id) {
    var a = IND.active[id], def = IND.defs[id];
    if (!a || !def || def.special) return;
    var out;
    try { out = def.compute(candles, def.params || {}, ta); }
    catch (e) { err('ইন্ডিকেটর "' + def.name + '" এ সমস্যা: ' + e.message); return; }
    if (Array.isArray(out)) { var tmp = {}; tmp[def.lines[0].key] = out; out = tmp; }
    def.lines.forEach(function (l) {
      var arr = out && out[l.key]; if (!arr) return;
      var pts = [];
      for (var i = 0; i < arr.length && i < candles.length; i++) {
        var v = arr[i];
        if (typeof v === 'number' && isFinite(v)) pts.push({ time: candles[i].time, value: v });
      }
      a.series[l.key].setData(pts);
    });
  }
  function recomputeAll() { Object.keys(IND.active).forEach(compute); }
  function scheduleInd() {
    if (indTimer) return;
    indTimer = setTimeout(function () { indTimer = 0; recomputeAll(); }, 300);
  }

  /* নিজের ইন্ডিকেটর: কোড লিখে সেভ করলেই চার্টে বসে যায় */
  function makeCustom(o) {
    var fn = new Function('candles', 'ta', 'params', o.code);
    return {
      id: o.id, name: o.name, custom: true, own: !!o.own, code: o.code,
      lines: [{ key: 'v', color: o.color || '#ffd54f', width: 2 }],
      compute: function (c, p, t) { return fn(c, t, p); }
    };
  }
  IND.addCustom = function (o) {
    try {
      var id = 'c_' + Date.now().toString(36);
      var def = makeCustom({ id: id, name: o.name, code: o.code, color: o.color, own: o.own });
      var test = def.compute(candles.slice(-300), {}, ta);
      if (!Array.isArray(test)) return { error: 'কোডকে অবশ্যই একটা অ্যারে return করতে হবে (প্রতি ক্যান্ডেলের জন্য একটি সংখ্যা)।' };
      var list = store('rtx_custom', []);
      list.push({ id: id, name: o.name, code: o.code, color: o.color, own: !!o.own });
      save('rtx_custom', list);
      IND.register(def);
      IND.toggle(id, true);
      return { id: id };
    } catch (e) { return { error: 'কোডে ভুল আছে: ' + e.message }; }
  };
  IND.removeCustom = function (id) {
    IND.toggle(id, false);
    delete IND.defs[id];
    IND.order = IND.order.filter(function (x) { return x !== id; });
    save('rtx_custom', store('rtx_custom', []).filter(function (x) { return x.id !== id; }));
  };

  /* বিল্ট-ইন ইন্ডিকেটর */
  var closes = function (c) { return c.map(function (x) { return x.close; }); };
  IND.register({ id: 'volume', name: 'Volume', special: true, lines: [] });
  IND.register({ id: 'ema20', name: 'EMA 20', lines: [{ key: 'v', color: '#ffd54f' }], compute: function (c, p, t) { return t.ema(closes(c), 20); } });
  IND.register({ id: 'ema50', name: 'EMA 50', lines: [{ key: 'v', color: '#ff9800' }], compute: function (c, p, t) { return t.ema(closes(c), 50); } });
  IND.register({ id: 'ema200', name: 'EMA 200', lines: [{ key: 'v', color: '#ab47bc' }], compute: function (c, p, t) { return t.ema(closes(c), 200); } });
  IND.register({ id: 'sma20', name: 'SMA 20', lines: [{ key: 'v', color: '#26c6da' }], compute: function (c, p, t) { return t.sma(closes(c), 20); } });
  IND.register({
    id: 'bb', name: 'Bollinger Bands (20, 2)',
    lines: [{ key: 'u', color: '#78909c' }, { key: 'm', color: '#546e7a', style: 2 }, { key: 'l', color: '#78909c' }],
    compute: function (c, p, t) {
      var cl = closes(c), m = t.sma(cl, 20), s = t.stdev(cl, 20);
      return {
        u: m.map(function (v, i) { return v == null ? null : v + 2 * s[i]; }),
        m: m,
        l: m.map(function (v, i) { return v == null ? null : v - 2 * s[i]; })
      };
    }
  });
  IND.register({
    id: 'vwap', name: 'VWAP (প্রতিদিন রিসেট)', lines: [{ key: 'v', color: '#f06292' }],
    compute: function (c) {
      var pv = 0, vv = 0, day = -1;
      return c.map(function (x) {
        var d = Math.floor(x.time / 86400);
        if (d !== day) { day = d; pv = 0; vv = 0; }
        pv += ((x.high + x.low + x.close) / 3) * x.volume; vv += x.volume;
        return vv ? pv / vv : null;
      });
    }
  });
  IND.register({
    id: 'rsi14', name: 'RSI 14 (নিচে আলাদা স্কেলে)', own: true, levels: [70, 30],
    lines: [{ key: 'v', color: '#ffffff' }],
    compute: function (c, p, t) { return t.rsi(closes(c), 14); }
  });

  /* ================= ড্রয়িং ইঞ্জিন ================= */
  var DR = { tool: 'cursor', items: [], draft: null, temp: null, magnet: true, stay: false, key: '', rev: 0, down: null, moved: false };
  var ONE = { hline: 1, vline: 1, text: 1 };

  function t2l(t) {
    var n = candles.length; if (!n) return 0;
    var f = candles[0].time, la = candles[n - 1].time;
    if (t <= f) return (t - f) / tfSec;
    if (t >= la) return n - 1 + (t - la) / tfSec;
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (candles[m].time <= t) lo = m; else hi = m; }
    var a = candles[lo].time, b = candles[hi].time;
    return lo + (t - a) / ((b - a) || 1);
  }
  function l2t(l) {
    var n = candles.length; if (!n) return 0;
    if (l <= 0) return candles[0].time + l * tfSec;
    if (l >= n - 1) return candles[n - 1].time + (l - (n - 1)) * tfSec;
    var lo = Math.floor(l), hi = Math.ceil(l), a = candles[lo].time, b = candles[hi].time;
    return a + (l - lo) * (b - a);
  }
  function X(t) { return chart.timeScale().logicalToCoordinate(t2l(t)); }
  function Y(p) { return candle.priceToCoordinate(p); }
  function plotW() { var rw = 56; try { rw = chart.priceScale('right').width(); } catch (_) {} return wrap.clientWidth - rw; }
  function plotH() { var th = 26; try { th = chart.timeScale().height(); } catch (_) {} return wrap.clientHeight - th; }

  function toPt(x, y) {
    var l = chart.timeScale().coordinateToLogical(x), p = candle.coordinateToPrice(y);
    if (l == null || p == null) return null;
    if (DR.magnet) {
      var li = Math.round(l);
      if (li >= 0 && li < candles.length) {
        var c = candles[li], best = null, bd = 18;
        l = li;
        [c.open, c.high, c.low, c.close].forEach(function (v) {
          var yy = Y(v); if (yy == null) return;
          var d = Math.abs(yy - y); if (d < bd) { bd = d; best = v; }
        });
        if (best != null) p = best;
      }
    }
    return { t: l2t(l), p: p };
  }

  function rayEnd(x1, y1, x2, y2, W) {
    var dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < 1e-6) return [x1, dy >= 0 ? plotH() : 0];
    var t = dx > 0 ? (W - x1) / dx : (0 - x1) / dx;
    return [x1 + dx * t, y1 + dy * t];
  }

  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function dot(x, y) {
    ctx.save(); ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function tag(text, x, y) {
    ctx.save(); ctx.font = '11px system-ui,sans-serif';
    var w = ctx.measureText(text).width + 10;
    ctx.fillStyle = '#fff'; ctx.fillRect(x - w, y - 8, w, 16);
    ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.fillText(text, x - w + 5, y + 0.5);
    ctx.restore();
  }

  function drawItem(it) {
    var W = plotW(), H = plotH(), col = it.color || C.draw;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.globalAlpha = 1;
    var x1 = X(it.p1.t), y1 = Y(it.p1.p);
    if (x1 == null || y1 == null) return;
    var T = it.type;
    if (T === 'hline') { line(0, y1, W, y1); tag(it.p1.p.toFixed(prec), W, y1); return; }
    if (T === 'vline') { line(x1, 0, x1, H); return; }
    if (T === 'text') { ctx.font = '13px system-ui,sans-serif'; ctx.fillText(it.text || '', x1, y1); return; }
    var x2 = X(it.p2.t), y2 = Y(it.p2.p);
    if (x2 == null || y2 == null) return;
    if (T === 'trend') { line(x1, y1, x2, y2); dot(x1, y1); dot(x2, y2); }
    else if (T === 'ray') { var e = rayEnd(x1, y1, x2, y2, W); line(x1, y1, e[0], e[1]); dot(x1, y1); dot(x2, y2); }
    else if (T === 'rect') {
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); dot(x1, y1); dot(x2, y2);
    }
    else if (T === 'fib') {
      var xa = Math.min(x1, x2), xb = Math.max(x1, x2);
      ctx.font = '10px system-ui,sans-serif';
      FIB.forEach(function (l) {
        var pr = it.p2.p + (it.p1.p - it.p2.p) * l, yy = Y(pr); if (yy == null) return;
        ctx.globalAlpha = (l === 0 || l === 1) ? 1 : 0.65; ctx.strokeStyle = col; line(xa, yy, xb, yy);
        ctx.globalAlpha = 1; ctx.fillStyle = '#bdbdbd'; ctx.fillText(l + '  (' + pr.toFixed(prec) + ')', xa + 4, yy - 3);
      });
      ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.5; ctx.strokeStyle = col; line(x1, y1, x2, y2);
      ctx.setLineDash([]); ctx.globalAlpha = 1; dot(x1, y1); dot(x2, y2);
    }
    else if (T === 'measure') {
      var dp = it.p2.p - it.p1.p, up = dp >= 0, pc = it.p1.p ? dp / it.p1.p * 100 : 0;
      var bars = Math.round(t2l(it.p2.t) - t2l(it.p1.t));
      ctx.fillStyle = up ? 'rgba(41,121,255,0.18)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeStyle = up ? C.up : '#fff'; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      var txt = (dp >= 0 ? '+' : '') + dp.toFixed(prec) + ' (' + (pc >= 0 ? '+' : '') + pc.toFixed(2) + '%)  ' + Math.abs(bars) + ' বার';
      ctx.font = '11px system-ui,sans-serif';
      var tw = ctx.measureText(txt).width + 12, cx = (x1 + x2) / 2, ty = up ? Math.min(y1, y2) - 22 : Math.max(y1, y2) + 6;
      ctx.fillStyle = up ? C.up : '#fff'; ctx.fillRect(cx - tw / 2, ty, tw, 18);
      ctx.fillStyle = up ? '#fff' : '#000'; ctx.textBaseline = 'middle'; ctx.fillText(txt, cx - tw / 2 + 6, ty + 9);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function render() {
    if (!ctx) return;
    var w = wrap.clientWidth, h = wrap.clientHeight, dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, plotW(), plotH()); ctx.clip();
    DR.items.forEach(drawItem);
    if (DR.temp) drawItem(DR.temp);
    if (DR.draft) drawItem(DR.draft);
    ctx.restore();
  }

  var lastSig = '';
  function loop() {
    if (chart && candles.length) {
      var r = chart.timeScale().getVisibleLogicalRange();
      var pc = candles[candles.length - 1].close;
      var s = [r && r.from, r && r.to, Y(pc), Y(pc * 1.1), wrap.clientWidth, wrap.clientHeight, DR.rev, DR.draft && DR.draft.p2.t, DR.draft && DR.draft.p2.p].join('|');
      if (s !== lastSig) { lastSig = s; render(); }
    }
    requestAnimationFrame(loop);
  }

  /* হিট টেস্ট (ইরেজারের জন্য) */
  function segs(it) {
    var x1 = X(it.p1.t), y1 = Y(it.p1.p); if (x1 == null || y1 == null) return [];
    var W = plotW(), H = plotH();
    if (it.type === 'hline') return [[0, y1, W, y1]];
    if (it.type === 'vline') return [[x1, 0, x1, H]];
    if (it.type === 'text') return [[x1 - 5, y1 - 5, x1 + 60, y1 - 5]];
    var x2 = X(it.p2.t), y2 = Y(it.p2.p); if (x2 == null || y2 == null) return [];
    if (it.type === 'trend') return [[x1, y1, x2, y2]];
    if (it.type === 'ray') { var e = rayEnd(x1, y1, x2, y2, W); return [[x1, y1, e[0], e[1]]]; }
    if (it.type === 'rect' || it.type === 'measure') return [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]];
    if (it.type === 'fib') {
      var out = [];
      FIB.forEach(function (l) { var yy = Y(it.p2.p + (it.p1.p - it.p2.p) * l); if (yy != null) out.push([Math.min(x1, x2), yy, Math.max(x1, x2), yy]); });
      return out;
    }
    return [];
  }
  function distSeg(px, py, s) {
    var dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy, t = l2 ? ((px - s[0]) * dx + (py - s[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s[0] + t * dx), py - (s[1] + t * dy));
  }
  function eraseAt(x, y) {
    var bi = -1, bd = 20;
    DR.items.forEach(function (it, i) {
      segs(it).forEach(function (s) { var d = distSeg(x, y, s); if (d < bd) { bd = d; bi = i; } });
    });
    if (bi >= 0) { DR.items.splice(bi, 1); persistDraw(); DR.rev++; }
  }

  function persistDraw() { if (DR.key) save('rtx_draw_' + DR.key, DR.items); }
  function loadDraw(key) { DR.key = key; DR.items = store('rtx_draw_' + key, []); DR.draft = null; DR.temp = null; DR.rev++; }

  function finish(item) {
    DR.draft = null; DR.down = null;
    if (item.type === 'text') {
      var t = window.prompt('টেক্সট লেখো');
      if (!t) { if (!DR.stay) api.drawing.setTool('cursor'); return; }
      item.text = t;
    }
    if (item.type === 'measure') DR.temp = item;
    else { DR.items.push(item); persistDraw(); }
    DR.rev++;
    if (!DR.stay && item.type !== 'measure') api.drawing.setTool('cursor');
  }

  function bindPointer() {
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    canvas.addEventListener('pointerdown', function (e) {
      if (DR.tool === 'cursor') return;
      var p = pos(e);
      if (p.x > plotW() || p.y > plotH()) return;
      e.preventDefault();
      if (DR.tool === 'eraser') { eraseAt(p.x, p.y); return; }
      var pt = toPt(p.x, p.y); if (!pt) return;
      if (DR.tool === 'measure' && !DR.draft) DR.temp = null;
      if (ONE[DR.tool]) { finish({ type: DR.tool, p1: pt, color: C.draw }); return; }
      if (!DR.draft) {
        DR.draft = { type: DR.tool, p1: pt, p2: pt, color: C.draw };
        DR.down = p; DR.moved = false;
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      } else {
        DR.draft.p2 = pt; finish(DR.draft);
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!DR.draft) return;
      var p = pos(e), pt = toPt(p.x, p.y); if (!pt) return;
      DR.draft.p2 = pt;
      if (DR.down && Math.hypot(p.x - DR.down.x, p.y - DR.down.y) > 8) DR.moved = true;
    });
    canvas.addEventListener('pointerup', function (e) {
      if (DR.draft && DR.moved) finish(DR.draft);
    });
    canvas.addEventListener('pointercancel', function () { DR.draft = null; DR.rev++; });
  }

  /* ================= পাবলিক API ================= */
  function precisionFor(p) { return p >= 1000 ? 2 : p >= 100 ? 3 : p >= 10 ? 4 : p >= 0.1 ? 5 : 6; }
  function volPoint(c) { return { time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(41,121,255,0.45)' : 'rgba(255,255,255,0.35)' }; }
  function showRecent(n) {
    var w = wrap.clientWidth || 360, bars = Math.max(30, Math.floor(w / 8));
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(-5, n - bars), to: n + 6 });
  }

  var api = R.chart = {
    indicators: IND, ta: ta,
    init: function (container) {
      wrap = container.parentElement;
      var tick = function (t, type) {
        var d = new Date(t * 1000);
        if (type === 0) return String(d.getFullYear());
        if (type === 1) return MON[d.getMonth()];
        if (type === 2) return String(d.getDate());
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
      };
      chart = LightweightCharts.createChart(container, {
        autoSize: true,
        layout: { background: { type: 'solid', color: C.bg }, textColor: C.text, fontSize: 11 },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: '#666', labelBackgroundColor: '#2979ff' },
          horzLine: { color: '#666', labelBackgroundColor: '#2979ff' }
        },
        rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.08, bottom: 0.2 } },
        timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7, minBarSpacing: 1.5, tickMarkFormatter: tick },
        localization: {
          timeFormatter: function (t) { var d = new Date(t * 1000); return d.getDate() + ' ' + MON[d.getMonth()] + " '" + String(d.getFullYear()).slice(2) + '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        kineticScroll: { touch: true, mouse: false }
      });
      candle = chart.addCandlestickSeries({
        upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down,
        wickUpColor: C.up, wickDownColor: C.down, priceLineColor: '#888'
      });
      vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

      chart.subscribeCrosshairMove(function (param) {
        if (!param || !param.time || !param.seriesData) { hoverCb(null); return; }
        hoverCb(param.seriesData.get(candle) || null);
      });
      chart.timeScale().subscribeVisibleLogicalRangeChange(function (r) {
        if (!r || loadingMore || noMoreFlag || candles.length < 20) return;
        if (r.from < 15) { loadingMore = true; moreCb(candles[0].time); }
      });

      canvas = document.createElement('canvas'); canvas.id = 'draw';
      wrap.appendChild(canvas); ctx = canvas.getContext('2d');
      bindPointer();
      requestAnimationFrame(loop);

      /* সেভ করা কাস্টম ইন্ডিকেটর ও চালু ইন্ডিকেটর ফিরিয়ে আনা */
      store('rtx_custom', []).forEach(function (o) { try { IND.register(makeCustom(o)); } catch (_) {} });
      var saved = store('rtx_ind', ['volume']);
      IND.toggle('volume', saved.indexOf('volume') >= 0);
      saved.forEach(function (id) { if (id !== 'volume' && IND.defs[id]) IND.toggle(id, true); });
    },

    setData: function (arr, sec, key) {
      candles = arr.slice(); tfSec = sec; noMoreFlag = false; loadingMore = false;
      var last = candles[candles.length - 1];
      prec = precisionFor(last ? last.close : 1);
      candle.applyOptions({ priceFormat: { type: 'price', precision: prec, minMove: Math.pow(10, -prec) } });
      candle.setData(candles);
      vol.setData(candles.map(volPoint));
      loadDraw(key);
      recomputeAll();
      showRecent(candles.length);
    },
    update: function (c) {
      var last = candles[candles.length - 1];
      if (last && c.time < last.time) return;
      if (last && c.time === last.time) candles[candles.length - 1] = c; else candles.push(c);
      candle.update(c); vol.update(volPoint(c)); scheduleInd();
    },
    prepend: function (older) {
      if (!older.length) { noMoreFlag = true; loadingMore = false; return; }
      var ts = chart.timeScale(), r = ts.getVisibleLogicalRange(), n = older.length;
      candles = older.concat(candles);
      candle.setData(candles); vol.setData(candles.map(volPoint));
      recomputeAll();
      if (r) ts.setVisibleLogicalRange({ from: r.from + n, to: r.to + n });
      loadingMore = false; DR.rev++;
    },
    noMore: function () { noMoreFlag = true; loadingMore = false; },
    onHover: function (cb) { hoverCb = cb; },
    onNeedMore: function (cb) { moreCb = cb; },
    last: function () { return candles[candles.length - 1]; },
    candles: function () { return candles; },
    fmt: function (p) { return Number(p).toFixed(prec); },
    goLatest: function () { chart.timeScale().scrollToRealTime(); },
    raw: function () { return chart; },

    drawing: {
      setTool: function (t) {
        DR.draft = null; DR.temp = null; DR.tool = t; DR.rev++;
        if (canvas) { canvas.style.pointerEvents = t === 'cursor' ? 'none' : 'auto'; canvas.style.cursor = t === 'eraser' ? 'pointer' : 'crosshair'; }
        toolCb(t);
      },
      tool: function () { return DR.tool; },
      undo: function () { DR.items.pop(); persistDraw(); DR.rev++; },
      clearAll: function () { DR.items = []; DR.temp = null; persistDraw(); DR.rev++; },
      count: function () { return DR.items.length; },
      toggleMagnet: function () { DR.magnet = !DR.magnet; return DR.magnet; },
      magnet: function () { return DR.magnet; },
      toggleStay: function () { DR.stay = !DR.stay; return DR.stay; },
      stay: function () { return DR.stay; },
      onToolChange: function (cb) { toolCb = cb; }
    }
  };
})(window.RTX);
