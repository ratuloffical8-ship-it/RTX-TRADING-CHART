// ফাইলের নাম / পাথ: js/ultra.js
// পাথ: js/ultra.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — RTX ULTRA PRO MAX (Pine Script v6 থেকে JavaScript-এ রূপান্তর)
   ৫টি ইঞ্জিন: Sweep Reclaim, CRT + TBS, Wyckoff + ICT, QM + SMC, Price Action + Fib
   সিগন্যাল শুধু বন্ধ হওয়া ক্যান্ডেলে। এন্ট্রি = সিগন্যাল ক্যান্ডেলের ক্লোজ।
   একই ক্যান্ডেলে SL ও TP দুটোই ছুঁলে SL আগে ধরা হয়। স্কোর = কনফ্লুয়েন্স গণনা, সম্ভাবনা নয়। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var DEF = {
    on: true, htfMode: 'Strict', minScore: 65, cooldown: 8, oneTrade: true, beOn: true,
    enSweep: true, enCrt: true, enWyck: true, enQm: true, enFib: true,
    swingLen: 3, sweepWin: 6, wyMaxAtr: 6, qmMaxAge: 30, fibMinAtr: 2.5, fibMaxAge: 60,
    slBuf: 0.25, slMinAtr: 0.6, slMaxAtr: 3, tp1R: 1, tp2R: 2, tp3R: 3,
    balance: 1000, riskPct: 1, useSess: true, volFilter: true, volLow: 0.5, volHigh: 3,
    showHist: true, maxHist: 10,
    power: true, gUltra: true, gXl: true, gUt: true, gJdt: true, pwVotes: 2, pwWin: 3, pwMinScore: 70, pwHtf: true, autoOpt: true,
    xOC: true, xBrk: true, xDon: true, xMA: true, xST: true, xAr: true,
    mode: 'smart', engine: 'raid', strategy: 'raid', entryMode: 'retest', maxRiskPct: 10, maxHoldH: 6, tp1Pct: 50, tp2Pct: 30, tp3Pct: 20, lotMode: 'fixed', lot: 0.01, costOn: true, specs: {}, newsBlocks: []
  };
  var ENG = ['Sweep Reclaim', 'CRT + TBS', 'Wyckoff + ICT', 'QM + SMC', 'Price Action + Fib'];
  var SHORT = { 'Sweep Reclaim': 'Sweep', 'CRT + TBS': 'CRT', 'Wyckoff + ICT': 'Wyckoff', 'QM + SMC': 'QM', 'Price Action + Fib': 'Fib' };
  var STAT = { 0: 'PENDING', 8: 'MISSED', 1: 'ACTIVE', 2: 'TP1 HIT', 3: 'TP2 HIT', 4: 'TP3 HIT', 5: 'SL HIT', 6: 'BREAK-EVEN', 7: 'REPLACED', 9: 'TIME EXIT' };
  var MINTICK = { BTCUSDT: 0.01, ETHUSDT: 0.01, BNBUSDT: 0.01, SOLUSDT: 0.01, XRPUSDT: 0.0001, DOGEUSDT: 0.00001, ADAUSDT: 0.0001, LTCUSDT: 0.01, XAUUSDT: 0.01, PAXGUSDT: 0.01, ETCUSDT: 0.01 };

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  /* ================= বাজারের তথ্য (পিপ, কন্ট্রাক্ট) ================= */
  function marketInfo(sym) {
    sym = String(sym || '');
    var slash = sym.indexOf('/') > 0, parts = slash ? sym.split('/') : [sym.replace(/USDT$/, ''), sym.slice(-4) === 'USDT' ? 'USDT' : ''];
    var isXAU = sym.indexOf('XAU') >= 0, isBTC = sym.indexOf('BTC') >= 0, isJPY = sym.indexOf('JPY') >= 0, fx = slash && !isBTC && !/^ET[HC]/.test(sym);
    var mt = fx ? (isXAU ? 0.01 : isJPY ? 0.001 : 0.00001) : (MINTICK[sym] || 0.01);
    var pip = isXAU ? 0.10 : isBTC ? 1.0 : isJPY ? 0.01 : fx ? 0.0001 : mt * 10;
    return {
      sym: sym, isFx: fx, isCrypto: !fx, isXAU: isXAU, isBTC: isBTC, isJPY: isJPY,
      mintick: mt, dec: Math.max(0, Math.round(-Math.log(mt) / Math.LN10)), pip: pip,
      cSize: isXAU ? 100 : fx ? 100000 : 1,
      qUsd: parts[1] === 'USD' || parts[1] === 'USDT', baseUsd: parts[0] === 'USD',
      name: isXAU ? 'XAUUSD (Gold)' : isBTC ? 'BTCUSD' : isJPY ? 'JPY pair' : fx ? 'Forex' : 'Crypto'
    };
  }

  /* ================= সিরিজ হেল্পার (Pine-এর মতো) ================= */
  function emaPine(a, p) {
    var k = 2 / (p + 1), o = new Array(a.length), e = null;
    for (var i = 0; i < a.length; i++) { e = e === null ? a[i] : a[i] * k + e * (1 - k); o[i] = e; }
    return o;
  }
  function biasOf(closes) {
    var e50 = emaPine(closes, 50), e200 = emaPine(closes, 200);
    return closes.map(function (c, i) { return (c > e50[i] && e50[i] > e200[i]) ? 1 : (c < e50[i] && e50[i] < e200[i]) ? -1 : 0; });
  }
  function prepHtf(cs) {
    return { t: cs.map(function (c) { return c.time; }), bias: biasOf(cs.map(function (c) { return c.close; })) };
  }
  function prepDaily(cs) {
    return { t: cs.map(function (c) { return c.time; }), h: cs.map(function (c) { return c.high; }), l: cs.map(function (c) { return c.low; }) };
  }
  function lastLE(arr, x) {
    var lo = 0, hi = arr.length - 1, r = -1;
    while (lo <= hi) { var m = (lo + hi) >> 1; if (arr[m] <= x) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  /* সেশন সময় লন্ডন ও নিউ ইয়র্কের স্থানীয় ঘড়ি ধরে (গ্রীষ্মকালীন সময় DST নিজে থেকে মেলে) */
  var TZC = {};
  function tzOffMin(tz, t) {
    var day = Math.floor(t / 86400), k = tz + day;
    if (TZC[k] !== undefined) return TZC[k];
    var off = 0;
    try {
      var p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date((day * 86400 + 43200) * 1000)), o = {};
      p.forEach(function (x) { o[x.type] = +x.value; });
      off = Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute) / 1000 - (day * 86400 + 43200)) / 60);
    } catch (_) { off = tz === 'Europe/London' ? 0 : -300; }
    TZC[k] = off; return off;
  }
  function sessOf(t, tfSec, info, cfg) {
    var raw, name;
    if (tfSec >= 86400) { raw = true; name = 'n/a (D/W)'; return { ok: true, name: name }; }
    var m = Math.floor((t % 86400) / 60);
    var lm = ((m + tzOffMin('Europe/London', t)) % 1440 + 1440) % 1440, nm = ((m + tzOffMin('America/New_York', t)) % 1440 + 1440) % 1440;
    var lon = lm >= 420 && lm < 960, ny = nm >= 450 && nm < 960, tok = m >= 0 && m < 540;
    raw = lon || ny || (info.isJPY && tok);
    name = info.isCrypto ? '24/7' : (lon && ny) ? 'London+NY' : lon ? 'London' : ny ? 'New York' : (info.isJPY && tok) ? 'Tokyo' : 'Off-session';
    return { ok: !cfg.useSess || info.isCrypto || raw, name: name };
  }

  /* ================= একটি ট্রেডের ট্র্যাকিং (একটি বন্ধ ক্যান্ডেলে) ================= */
  function stepTrade(t, hi, lo, idx, beOn) {
    var ev = [], tb = t.dir === 1;
    var slHit = tb ? lo <= t.slNow : hi >= t.slNow;
    if (slHit) {
      var isBe = t.slNow === t.entry && t.status >= 2;
      t.status = isBe ? 6 : 5; ev.push(isBe ? 'BE' : 'SL');
    } else {
      if (t.status === 1 && (tb ? hi >= t.tp1 : lo <= t.tp1)) {
        t.status = 2; t.tp1Hit = true; ev.push('TP1');
        if (beOn) { t.slNow = t.entry; t.beMoved = true; }
      }
      if (t.status === 2 && (tb ? hi >= t.tp2 : lo <= t.tp2)) { t.status = 3; ev.push('TP2'); }
      if (t.status === 3 && (tb ? hi >= t.tp3 : lo <= t.tp3)) { t.status = 4; ev.push('TP3'); }
    }
    t.end = idx;
    return ev;
  }

  /* ================= মূল ইঞ্জিন ================= */
  function engine(cs, htf, cfg, info, tfSec, htfMode) {
    var n = cs.length, i, j, k;
    var O = [], H = [], L = [], C = [], T = [];
    for (i = 0; i < n; i++) { O[i] = cs[i].open; H[i] = cs[i].high; L[i] = cs[i].low; C[i] = cs[i].close; T[i] = cs[i].time; }
    var mt = info.mintick, dec = info.dec;
    function rt(x) { return +(Math.round(x / mt) * mt).toFixed(dec); }

    // ATR(14) — Pine ta.atr (RMA), SMA(ATR,50)
    var atr = new Array(n).fill(null), s = 0, tr;
    for (i = 0; i < n; i++) {
      tr = i === 0 ? H[0] - L[0] : Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
      if (i < 14) { s += tr; if (i === 13) atr[i] = s / 14; }
      else atr[i] = (tr + 13 * atr[i - 1]) / 14;
    }
    var atrAvg = new Array(n).fill(null);
    for (i = 62; i < n; i++) { var sa = 0; for (j = i - 49; j <= i; j++) sa += atr[j]; atrAvg[i] = sa / 50; }

    var e50 = emaPine(C, 50), e200 = emaPine(C, 200), ct = new Array(n);
    for (i = 0; i < n; i++) ct[i] = (C[i] > e50[i] && e50[i] > e200[i]) ? 1 : (C[i] < e50[i] && e50[i] < e200[i]) ? -1 : 0;

    var eq = new Array(n).fill(null);
    for (i = 49; i < n; i++) {
      var hh = -Infinity, ll = Infinity;
      for (j = i - 49; j <= i; j++) { if (H[j] > hh) hh = H[j]; if (L[j] < ll) ll = L[j]; }
      eq[i] = (hh + ll) / 2;
    }

    // HTF bias (আগের বন্ধ HTF বার)
    function htfSeries(series, secs) {
      var out = new Array(n).fill(0);
      for (var q = 0; q < n; q++) {
        if (tfSec >= secs) out[q] = q >= 1 ? ct[q - 1] : 0;
        else if (series) { var idx = lastLE(series.t, T[q]); out[q] = idx >= 1 ? series.bias[idx - 1] : 0; }
      }
      return out;
    }
    var h4 = htfSeries(htf && htf.h4, 14400), h1 = htfSeries(htf && htf.h1, 3600);

    // আগের দিনের হাই / লো (শুধু ইন্ট্রাডে)
    var pdH = new Array(n).fill(null), pdL = new Array(n).fill(null);
    if (tfSec < 86400 && htf && htf.d) {
      for (i = 0; i < n; i++) {
        var ds = Math.floor(T[i] / 86400) * 86400, jj = lastLE(htf.d.t, ds - 1);
        if (jj >= 0) { pdH[i] = htf.d.h[jj]; pdL[i] = htf.d.l[jj]; }
      }
    }

    // স্টেট
    var Ls = cfg.swingLen;
    var ph1 = null, ph2 = null, ph3 = null, phi1 = null, phi2 = null, phi3 = null;
    var pl1 = null, pl2 = null, pl3 = null, pli1 = null, pli2 = null, pli3 = null;
    var ph3H = new Array(n).fill(null), pl3H = new Array(n).fill(null);
    var lastFvgBull = null, lastFvgBear = null;
    var swBullBar = null, swBullLvl = null, swBullExt = null, swBearBar = null, swBearLvl = null, swBearExt = null;
    var lastSigBar = -100000, cur = null, trades = [];
    var rawDir = new Array(n).fill(0), rawLvl = new Array(n).fill(null), rawEng = new Array(n).fill(null);
    var engSig = [0, 1, 2, 3, 4].map(function () { return new Array(n).fill(0); }), engLvl = [0, 1, 2, 3, 4].map(function () { return new Array(n).fill(null); });

    for (i = 0; i < n; i++) {
      var a = atr[i];

      // কনফার্মড সুইং পিভট (swingLen বার পরে জানা যায়)
      var c0 = i - Ls;
      if (c0 - Ls >= 0) {
        var isPH = true, isPL = true;
        for (j = c0 - Ls; j <= i; j++) {
          if (j === c0) continue;
          if (j < c0) { if (H[j] >= H[c0]) isPH = false; if (L[j] <= L[c0]) isPL = false; }
          else { if (H[j] > H[c0]) isPH = false; if (L[j] < L[c0]) isPL = false; }
        }
        if (isPH) { ph1 = ph2; ph2 = ph3; ph3 = H[c0]; phi1 = phi2; phi2 = phi3; phi3 = c0; }
        if (isPL) { pl1 = pl2; pl2 = pl3; pl3 = L[c0]; pli1 = pli2; pli2 = pli3; pli3 = c0; }
      }
      ph3H[i] = ph3; pl3H[i] = pl3;

      if (i >= 2 && L[i] > H[i - 2]) lastFvgBull = i;
      if (i >= 2 && H[i] < L[i - 2]) lastFvgBear = i;
      var fvgRecBull = lastFvgBull !== null && i - lastFvgBull <= 10;
      var fvgRecBear = lastFvgBear !== null && i - lastFvgBear <= 10;

      var pl3p = i > 0 ? pl3H[i - 1] : null, ph3p = i > 0 ? ph3H[i - 1] : null;
      var pdl = pdL[i], pdh = pdH[i];
      var bullPool = (nn(pl3p) && L[i] < pl3p && C[i] > pl3p) ? pl3p : (nn(pdl) && L[i] < pdl && C[i] > pdl) ? pdl : null;
      var bearPool = (nn(ph3p) && H[i] > ph3p && C[i] < ph3p) ? ph3p : (nn(pdh) && H[i] > pdh && C[i] < pdh) ? pdh : null;

      // A) sweep স্টেট
      if (swBullBar !== null && i - swBullBar > cfg.sweepWin) { swBullBar = null; swBullLvl = null; swBullExt = null; }
      if (swBearBar !== null && i - swBearBar > cfg.sweepWin) { swBearBar = null; swBearLvl = null; swBearExt = null; }
      if (bullPool !== null) {
        if (swBullBar === null) { swBullBar = i; swBullLvl = bullPool; swBullExt = L[i]; }
        else swBullExt = Math.min(swBullExt, L[i]);
      } else if (swBullBar !== null) swBullExt = Math.min(swBullExt, L[i]);
      if (bearPool !== null) {
        if (swBearBar === null) { swBearBar = i; swBearLvl = bearPool; swBearExt = H[i]; }
        else swBearExt = Math.max(swBearExt, H[i]);
      } else if (swBearBar !== null) swBearExt = Math.max(swBearExt, H[i]);

      // B) চলমান ট্রেডের ট্র্যাকিং (এন্ট্রির পরের বার থেকে)
      if (cur && cur.status >= 1 && cur.status <= 3 && i > cur.bar) {
        var ev = stepTrade(cur, H[i], L[i], i, cfg.beOn);
        cur.endTime = T[i];
        for (j = 0; j < ev.length; j++) cur.events.push({ time: T[i], type: ev[j] });
      }

      // C) ইঞ্জিনের শর্ত
      if (!nn(a) || i < 3) continue;
      var bodyRatio = (H[i] - L[i]) > 0 ? Math.abs(C[i] - O[i]) / (H[i] - L[i]) : 0;

      // ইঞ্জিন ১: Sweep Reclaim
      var strongC = bodyRatio >= 0.5 && Math.abs(C[i] - O[i]) >= 0.25 * a;   // জোরালো কনফার্মেশন ক্যান্ডেল: বডি রেঞ্জের ৫০%+ ও ০.২৫×ATR+
      var bullSw = cfg.enSweep && swBullBar !== null && i > swBullBar && C[i] > swBullLvl && C[i] > O[i] && C[i] > H[i - 1] && strongC;
      var bearSw = cfg.enSweep && swBearBar !== null && i > swBearBar && C[i] < swBearLvl && C[i] < O[i] && C[i] < L[i - 1] && strongC;
      var lvB1 = bullSw ? swBullExt : null, lvS1 = bearSw ? swBearExt : null;
      if (cfg.perEngine) { if (bullSw) { swBullBar = null; swBullLvl = null; swBullExt = null; } if (bearSw) { swBearBar = null; swBearLvl = null; swBearExt = null; } }  // একক স্ট্র্যাটেজি: একটি সুইপ থেকে একটিই সিগন্যাল

      // ইঞ্জিন ২: CRT + TBS
      var crtIdx = -1;
      for (k = 3; k <= 20; k++) { if (i - k < 0) break; if (crtIdx === -1 && (H[i - k] - L[i - k]) > 1.8 * a) crtIdx = k; }
      var crtH = crtIdx > 0 ? H[i - crtIdx] : null, crtL = crtIdx > 0 ? L[i - crtIdx] : null;
      var crtFreshB = crtIdx > 0, crtFreshS = crtIdx > 0;   // ফাঁদ তাজা: CRT ক্যান্ডেলের পর থেকে ফাঁদের আগ পর্যন্ত কোনো ক্যান্ডেল CRT-র লো/হাইয়ের বাইরে বন্ধ হয়নি (বন্ধ হলে সেটা ব্রেকআউট, ফাঁদ নয়; শুধু উইক হলে চলে)
      for (k = crtIdx - 1; k >= 2 && crtIdx > 0; k--) { if (C[i - k] < crtL) crtFreshB = false; if (C[i - k] > crtH) crtFreshS = false; }
      var bullCrt = cfg.enCrt && crtFreshB && L[i - 1] < crtL && L[i - 1] <= L[i - 2] && C[i] > Math.max(O[i - 1], C[i - 1]) && C[i] > crtL && C[i] < crtH && C[i] > O[i] && bodyRatio >= 0.4;
      var bearCrt = cfg.enCrt && crtFreshS && H[i - 1] > crtH && H[i - 1] >= H[i - 2] && C[i] < Math.min(O[i - 1], C[i - 1]) && C[i] < crtH && C[i] > crtL && C[i] < O[i] && bodyRatio >= 0.4;
      var lvB2 = bullCrt ? L[i - 1] : null, lvS2 = bearCrt ? H[i - 1] : null;

      // ইঞ্জিন ৩: Wyckoff Spring / Upthrust
      var wyH = null, wyL = null;
      if (i - 25 >= 0) {
        var wh = -Infinity, wl = Infinity;
        for (j = i - 25; j <= i - 6; j++) { if (H[j] > wh) wh = H[j]; if (L[j] < wl) wl = L[j]; }
        wyH = wh; wyL = wl;
      }
      var wyRange = nn(wyH) && nn(wyL) && (wyH - wyL) <= cfg.wyMaxAtr * a;
      var spL = null, spH = null;
      for (k = 1; k <= 5; k++) {
        if (i - k < 0) break;
        if (spL === null && wyRange && L[i - k] < wyL && Math.min(O[i - k], C[i - k]) > wyL) spL = L[i - k];
        if (spH === null && wyRange && H[i - k] > wyH && Math.max(O[i - k], C[i - k]) < wyH) spH = H[i - k];
      }
      var bullWy = cfg.enWyck && wyRange && spL !== null && C[i] > O[i] && C[i] > H[i - 1] && C[i] > wyL && C[i] < wyH && strongC;
      var bearWy = cfg.enWyck && wyRange && spH !== null && C[i] < O[i] && C[i] < L[i - 1] && C[i] < wyH && C[i] > wyL && strongC;
      var lvB3 = bullWy ? Math.min(spL, wyL) : null, lvS3 = bearWy ? Math.max(spH, wyH) : null;

      // ইঞ্জিন ৪: Quasimodo + SMC
      var neckB = null;   // নেকলাইন = প্রথম ও শেষ সুইং-লো-র মাঝের সবচেয়ে উঁচু সুইং-হাই (শেষ ৩টি পিভটের মধ্যে)
      if (nn(phi3) && nn(pli1) && nn(pli3)) {
        if (phi3 > pli1 && phi3 < pli3) neckB = ph3;
        if (nn(phi2) && phi2 > pli1 && phi2 < pli3 && (neckB === null || ph2 > neckB)) neckB = ph2;
        if (nn(phi1) && phi1 > pli1 && phi1 < pli3 && (neckB === null || ph1 > neckB)) neckB = ph1;
      }
      var neckS = null;
      if (nn(pli3) && nn(phi1) && nn(phi3)) {
        if (pli3 > phi1 && pli3 < phi3) neckS = pl3;
        if (nn(pli2) && pli2 > phi1 && pli2 < phi3 && (neckS === null || pl2 < neckS)) neckS = pl2;
        if (nn(pli1) && pli1 > phi1 && pli1 < phi3 && (neckS === null || pl1 < neckS)) neckS = pl1;
      }
      var qmBull = nn(pl1) && nn(pl2) && nn(pl3) && nn(pli3) && pl2 < pl1 && pl3 > pl2 && (i - pli3) <= cfg.qmMaxAge;
      var qmBear = nn(ph1) && nn(ph2) && nn(ph3) && nn(phi3) && ph2 > ph1 && ph3 < ph2 && (i - phi3) <= cfg.qmMaxAge;
      var bullQm = cfg.enQm && qmBull && nn(neckB) && C[i] > neckB && C[i - 1] <= neckB && C[i] > O[i] && strongC;
      var bearQm = cfg.enQm && qmBear && nn(neckS) && C[i] < neckS && C[i - 1] >= neckS && C[i] < O[i] && strongC;
      var lvB4 = bullQm ? pl2 : null, lvS4 = bearQm ? ph2 : null;

      // ইঞ্জিন ৫: Price Action + Fib গোল্ডেন পকেট (৫০% - ৭৯%)
      var impUp = nn(phi3) && nn(pli3) && phi3 > pli3;
      var impRange = (nn(ph3) && nn(pl3)) ? ph3 - pl3 : null;
      var impOk = nn(impRange) && impRange >= cfg.fibMinAtr * a && (i - Math.max(phi3, pli3)) <= cfg.fibMaxAge;
      var bullFib = cfg.enFib && impOk && impUp && L[i] <= ph3 - impRange * 0.5 && L[i] > pl3 && C[i] > ph3 - impRange * 0.79 && C[i] > O[i] && bodyRatio >= 0.4 && C[i] < ph3;
      var bearFib = cfg.enFib && impOk && !impUp && H[i] >= pl3 + impRange * 0.5 && H[i] < ph3 && C[i] < pl3 + impRange * 0.79 && C[i] < O[i] && bodyRatio >= 0.4 && C[i] > pl3;
      var lvB5 = bullFib ? pl3 : null, lvS5 = bearFib ? ph3 : null;

      var bF = [lvB1 !== null, lvB2 !== null, lvB3 !== null, lvB4 !== null, lvB5 !== null];
      var sF = [lvS1 !== null, lvS2 !== null, lvS3 !== null, lvS4 !== null, lvS5 !== null];
      var bLv = [lvB1, lvB2, lvB3, lvB4, lvB5], sLv = [lvS1, lvS2, lvS3, lvS4, lvS5];
      var bullCnt = 0, bearCnt = 0;
      for (k = 0; k < 5; k++) { if (bF[k]) bullCnt++; if (sF[k]) bearCnt++; if (bF[k] && !sF[k]) { engSig[k][i] = 1; engLvl[k][i] = bLv[k]; } else if (sF[k] && !bF[k]) { engSig[k][i] = -1; engLvl[k][i] = sLv[k]; } }
      var dir = bullCnt > bearCnt ? 1 : bearCnt > bullCnt ? -1 : 0;
      rawDir[i] = dir;
      if (dir !== 0) { rawEng[i] = []; var fe = dir === 1 ? bF : sF; for (k = 0; k < 5; k++) if (fe[k]) rawEng[i].push(k); }
      if (dir !== 0) { var fa0 = dir === 1 ? bF : sF, la0 = dir === 1 ? bLv : sLv; rawLvl[i] = fa0[3] ? la0[3] : fa0[2] ? la0[2] : fa0[1] ? la0[1] : fa0[0] ? la0[0] : la0[4]; }

      // D) নতুন সিগন্যাল
      var live = cur && cur.status >= 1 && cur.status <= 3;
      var se = sessOf(T[i], tfSec, info, cfg);
      var atrOK = a > 0 && i >= 60;
      var volOK = !cfg.volFilter || (nn(atrAvg[i]) && a >= atrAvg[i] * cfg.volLow && a <= atrAvg[i] * cfg.volHigh);
      var gate = atrOK && se.ok && volOK && (i - lastSigBar > cfg.cooldown) && !(cfg.oneTrade && live);
      if (dir === 0 || !gate) continue;

      var pb = dir === 1, H4 = h4[i], H1 = h1[i];
      var htfOk = htfMode === 'Off' || (htfMode === 'Normal' ? (H4 !== -dir && H1 !== -dir) : (H4 !== -dir && H1 !== -dir && (H4 === dir || H1 === dir)));
      if (!htfOk) continue;

      var flArr = pb ? bF : sF, lvArr = pb ? bLv : sLv;
      var prim = flArr[3] ? 4 : flArr[2] ? 3 : flArr[1] ? 2 : flArr[0] ? 1 : 5;
      var lvl = lvArr[prim - 1], extras = [];
      for (k = 0; k < 5; k++) if (flArr[k] && k !== prim - 1) extras.push(ENG[k]);
      var cntAll = pb ? bullCnt : bearCnt;

      var sc = 40;
      sc += H4 === dir ? 20 : (H4 === 0 ? 8 : 0);
      sc += H1 === dir ? 15 : (H1 === 0 ? 6 : 0);
      sc += Math.min(cntAll - 1, 2) * 8;
      sc += (pb ? fvgRecBull : fvgRecBear) ? 5 : 0;
      sc += (nn(eq[i]) && (pb ? C[i] < eq[i] : C[i] > eq[i])) ? 4 : 0;
      var score = Math.min(100, Math.round(sc));
      var grade = score >= 85 ? 'A+ ULTRA' : score >= 75 ? 'A STRONG' : 'B';

      var entry = rt(C[i]), buf = cfg.slBuf * a;
      var rawDist = pb ? entry - (lvl - buf) : (lvl + buf) - entry;
      var dist = Math.max(rawDist, cfg.slMinAtr * a);
      var slOk = dist > 0 && dist <= cfg.slMaxAtr * a;
      var sl = rt(entry - dir * dist), riskD = Math.abs(entry - sl);
      if (!(slOk && riskD > mt * 2 && score >= cfg.minScore)) continue;
      var tp1 = rt(entry + dir * riskD * cfg.tp1R), tp2 = rt(entry + dir * riskD * cfg.tp2R), tp3 = rt(entry + dir * riskD * cfg.tp3R);

      var pv = info.qUsd ? info.pip * info.cSize : (info.baseUsd ? info.pip * info.cSize / entry : null);
      var slPips = riskD / info.pip, riskUsd = cfg.balance * cfg.riskPct / 100;
      var lotRaw = (pv !== null && pv > 0 && slPips > 0) ? riskUsd / (slPips * pv) : null;
      var lot = lotRaw === null ? null : Math.max(0.01, Math.round(lotRaw * 100) / 100);

      if (live) cur.status = 7;
      cur = {
        dir: dir, bar: i, time: T[i], endTime: T[i], end: i, status: 1, score: score, grade: grade,
        entry: entry, sl: sl, slNow: sl, tp1: tp1, tp2: tp2, tp3: tp3, lot: lot, riskUsd: riskUsd, riskD: riskD,
        mode: ENG[prim - 1], extra: extras.join(', '), events: [], tp1Hit: false, beMoved: false
      };
      trades.push(cur);
      lastSigBar = i;
      if (!cfg.perEngine) { swBullBar = null; swBullLvl = null; swBullExt = null; swBearBar = null; swBearLvl = null; swBearExt = null; }
    }

    var li = n - 1, last = n ? sessOf(T[li], tfSec, info, cfg) : { ok: false, name: '-' };
    return {
      trades: trades, closed: n,
      arr: { atr: atr, atrAvg: atrAvg, h4: h4, h1: h1, ct: ct, rawDir: rawDir, rawLvl: rawLvl, rawEng: rawEng, engSig: engSig, engLvl: engLvl },
      now: n ? {
        h4: h4[li], h1: h1[li], trend: ct[li], sessOk: last.ok, sessName: last.name,
        atr: atr[li], atrAvg: atrAvg[li],
        volOK: !cfg.volFilter || (nn(atrAvg[li]) && nn(atr[li]) && atr[li] >= atrAvg[li] * cfg.volLow && atr[li] <= atrAvg[li] * cfg.volHigh)
      } : null
    };
  }

  R.ultra = { DEF: DEF, engine: engine, stepTrade: stepTrade, marketInfo: marketInfo, emaPine: emaPine, biasOf: biasOf, lastLE: lastLE, sessOf: sessOf, prepHtf: prepHtf, prepDaily: prepDaily };

  if (typeof document === 'undefined' || !R.chart || !R.chart.setOverlay) return;

  /* =====================================================
     UI: চার্টে আঁকা, সিগন্যাল বক্স ও সেটিংস
     ===================================================== */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  function say(m) { if (R.onError) R.onError(m); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  /* সেটিংসের "উন্নত" ঘর। কোন ঘর কোন স্ট্র্যাটেজিতে কাজ করে সেটা fieldApplies() ঠিক করে, বাকিগুলো দেখানোই হয় না */
  var FIELDS = [
    ['htfMode', 'select', 'HTF ফিল্টার (4H + 1H) — Off করলে বড় টাইমফ্রেম দেখা হয় না', ['Strict', 'Normal', 'Off']],
    ['oneTrade', 'bool', 'একসাথে একটাই লাইভ ট্রেড'], ['beOn', 'bool', 'TP1 এর পর SL ব্রেক-ইভেনে'],
    ['swingLen', 'num', 'সুইং দৈর্ঘ্য (Sweep, QM, Fib)', 1, 10], ['sweepWin', 'num', 'Sweep: কনফার্মেশনের সর্বোচ্চ বার', 2, 20],
    ['wyMaxAtr', 'num', 'Wyckoff: রেঞ্জের সর্বোচ্চ প্রস্থ (×ATR)', 2, 50], ['qmMaxAge', 'num', 'QM: শেষ সুইং থেকে সর্বোচ্চ বার', 10, 500],
    ['fibMinAtr', 'num', 'Fib: ন্যূনতম ইমপালস (×ATR)', 1, 50], ['fibMaxAge', 'num', 'Fib: ইমপালসের পর সর্বোচ্চ বার', 10, 500],
    ['slBuf', 'num', 'SL বাফার (×ATR)', 0, 5], ['slMinAtr', 'num', 'ন্যূনতম SL দূরত্ব (×ATR)', 0.1, 10], ['slMaxAtr', 'num', 'সর্বোচ্চ SL দূরত্ব (×ATR)', 0.5, 20],
    ['tp1R', 'num', 'TP1 (R)', 0.1, 20], ['tp2R', 'num', 'TP2 (R)', 0.1, 20], ['tp3R', 'num', 'TP3 (R)', 0.1, 50],
    ['balance', 'num', 'অ্যাকাউন্ট ব্যালেন্স ($)', 1, 100000000], ['riskPct', 'num', 'ঝুঁকি প্রতি ট্রেডে (%)', 0.1, 10],
    ['useSess', 'bool', 'সেশন ফিল্টার (ফরেক্স/সোনায়)'], ['volFilter', 'bool', 'ভোলাটিলিটি ফিল্টার'],
    ['showHist', 'bool', 'পুরোনো ট্রেডও চার্টে দেখাও'], ['maxHist', 'num', 'সর্বোচ্চ কয়টি পুরোনো ট্রেড আঁকবে', 1, 40]
  ];
  var RAID_KEYS = ['htfMode', 'maxHoldH', 'oneTrade', 'beOn', 'slMinAtr', 'slMaxAtr', 'showHist', 'maxHist'];
  var SPEC_KEYS = { swingLen: ['sweep', 'qm', 'fib'], sweepWin: ['sweep'], wyMaxAtr: ['wyck'], qmMaxAge: ['qm'], fibMinAtr: ['fib'], fibMaxAge: ['fib'] };
  function fieldApplies(key) {
    if (cfg.strategy === 'raid') return RAID_KEYS.indexOf(key) >= 0;
    if (SPEC_KEYS[key]) return SPEC_KEYS[key].indexOf(cfg.strategy) >= 0;
    return true;
  }

  var cfg = Object.assign({}, DEF, lsGet('rtx_ultra_cfg', {}));
  if (!lsGet('rtx_ultra_cfg', {}).entryMode) { cfg.engine = 'raid'; cfg.entryMode = 'retest'; cfg.maxRiskPct = 10; cfg.lotMode = 'fixed'; lsSet('rtx_ultra_cfg', cfg); try { localStorage.removeItem('rtx_ultra_opt'); } catch (_) {} }
  if ((lsGet('rtx_ultra_cfg', {}).eng2 | 0) < 1) { cfg.eng2 = 1; if (cfg.wyMaxAtr === 10) cfg.wyMaxAtr = 6; if (cfg.qmMaxAge === 40) cfg.qmMaxAge = 30; }   // ইঞ্জিন কড়াকড়ি আপডেট (ভার্সন ১): শুধু পুরোনো ডিফল্ট মান বদলায়, ব্যবহারকারীর নিজের মান নয়
  if (!R.strat || !R.strat.DEFS[cfg.strategy]) cfg.strategy = 'raid';
  cfg.engine = cfg.strategy === 'raid' ? 'raid' : 'strat'; cfg.power = true;   // পুরোনো 'decision'/'classic' আর ড্রপডাউনে নেই
  lsSet('rtx_ultra_cfg', cfg);
  var optStore = lsGet('rtx_ultra_opt', {}), lastAlertKey = '';
  function optKey() { return cur.sym + '|' + cur.sec; }
  function effCfg() { var o = cfg.autoOpt && optStore[optKey()]; if (o && ((o.engine && o.engine !== cfg.engine) || (o.strategy || 'raid') !== cfg.strategy)) o = null; return o ? Object.assign({}, cfg, o) : cfg; }
  R.ultra.getState = function () { return { res: state.res, info: state.info, cfg: state.cfg, sym: cur.sym, sec: cur.sec }; };
  var cur = { sym: null, sec: 60 }, state = { res: null, warn: '' }, htfStore = {}, tm = 0, lastN = 0, seenKey = '', seen = {};

  /* ---------- HTF ডেটা (4H, 1H, দৈনিক) ---------- */
  async function loadHtf(sym) {
    var c = htfStore[sym];
    if (c && Date.now() - c.ts < 600000) return;
    var out = { ts: Date.now(), h4: null, h1: null, d: null };
    try { out.h4 = prepHtf(await R.data.klines(sym, '4h', 1000)); } catch (_) {}
    if (cur.sym !== sym) return;
    try { out.h1 = prepHtf(await R.data.klines(sym, '1h', 1000)); } catch (_) {}
    if (cur.sym !== sym) return;
    try { out.d = prepDaily(await R.data.klines(sym, '1d', 1000)); } catch (_) {}
    htfStore[sym] = out;
    if (cur.sym === sym) sched(0, true);
  }

  function sched(ms, silent) { clearTimeout(tm); tm = setTimeout(function () { recompute(silent); }, ms || 0); }

  /* ডেটা যাচাই: ক্রমহীন/ডুপ্লিকেট/ভুল OHLC ক্যান্ডেল বাদ। পুরোনো (স্টেল) ফিড চেনা। মার্কেট বন্ধ থাকলে (গোল্ড/BTC-USD শনি-রবি) স্টেল ধরা হয় না */
  function sanitize(cs) {
    var out = [], bad = 0, i, c, p;
    for (i = 0; i < cs.length; i++) {
      c = cs[i]; p = out[out.length - 1];
      if (!(isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close)) || c.high < Math.max(c.open, c.close) - 1e-9 || c.low > Math.min(c.open, c.close) + 1e-9 || c.low <= 0 || (p && c.time <= p.time)) { bad++; continue; }
      out.push(c);
    }
    return { cs: out, bad: bad };
  }
  function staleInfo(cs, sec, sym) {
    var last = cs[cs.length - 1]; if (!last) return null;
    var now = Date.now() / 1000, age = now - last.time, isFxS = String(sym).indexOf('/') > 0;
    if (isFxS) { var d = new Date(), dow = d.getUTCDay(), hr = d.getUTCHours(); if (dow === 6 || (dow === 0 && hr < 22) || (dow === 5 && hr >= 22)) return null; }
    return age > sec * 4 + 120 ? Math.round(age / 60) : null;
  }

  function recompute(silent) {
    if (R.analytics && R.analytics.setSplit) R.analytics.setSplit(cfg.tp1Pct, cfg.tp2Pct, cfg.tp3Pct);
    var info = marketInfo(cur.sym), ec = effCfg();
    if (!cfg.on) { R.chart.setMarkers([]); R.chart.setOverlay(null); state.res = null; state.warn = ''; paint(); return; }
    var all = R.chart.candles(), sn = sanitize(all); all = sn.cs;
    if (all.length < 70) { state.res = null; R.chart.setMarkers([]); R.chart.setOverlay(null); paint(); return; }
    var h = htfStore[cur.sym] || { h4: null, h1: null, d: null }, mode = cfg.htfMode, warn = '';
    if (!h.h4 && !h.h1) { if (mode !== 'Off' && cur.sec < 14400) warn = 'HTF (4H/1H) ডেটা পাওয়া যায়নি, তাই এখন HTF ফিল্টার ছাড়াই চলছে।'; if (cur.sec < 14400) mode = 'Off'; }
    if (sn.bad) warn += (warn ? ' ' : '') + 'ডেটায় ' + sn.bad + 'টি ভুল/ডুপ্লিকেট ক্যান্ডেল বাদ দিয়ে হিসাব হয়েছে।';
    var stale = staleInfo(all, cur.sec, cur.sym);
    if (stale) warn += (warn ? ' ' : '') + '⚠️ ডেটা পুরোনো: শেষ ক্যান্ডেল ' + stale + ' মিনিট আগের। নতুন সিগন্যাল বন্ধ রাখা হয়েছে, ফিড ঠিক হলে চালু হবে।';
    state.warn = warn;
    var res;
    try { res = engine(all.slice(0, all.length - 1), h, Object.assign({}, ec, { enSweep: true, enCrt: true, enWyck: true, enQm: true, enFib: true, perEngine: !!(R.strat && R.strat.isStrat(ec.strategy)) }), info, cur.sec, mode); }
    catch (e) { say('ULTRA ত্রুটি: ' + e.message); return; }
    if (cfg.power && R.power) {
      try { res = R.power.run(all.slice(0, all.length - 1), res, ec, info, cur.sec, mode); }
      catch (e) { say('POWER ত্রুটি: ' + e.message); return; }
    }
    if (stale && res && res.now) res.now.alert = null;   // পুরোনো ডেটায় নতুন প্রি-অ্যালার্ট/এন্ট্রি দেখাবো না
    state.res = res; state.info = info; state.cfg = ec;

    R.chart.setMarkers(res.trades.map(function (t) {
      var b = t.dir === 1;
      return { time: t.time, position: b ? 'belowBar' : 'aboveBar', color: b ? '#2979ff' : '#ffffff', shape: b ? 'arrowUp' : 'arrowDown', text: t.why ? (b ? 'BUY' : 'SELL') + ' · ' + t.grade + ' · ' + t.score : (b ? 'BUY ' : 'SELL ') + (SHORT[t.mode] || 'P' + t.mode.split(' ')[1].split('/')[0]) + ' ' + t.score };
    }));
    R.chart.setOverlay(draw);

    var key = cur.sym + '|' + cur.sec;
    if (seenKey !== key || silent) { seenKey = key; res.trades.forEach(function (t) { seen[key + t.time] = 1; }); }
    else res.trades.forEach(function (t) {
      if (seen[key + t.time]) return;
      seen[key + t.time] = 1;
      if (t.bar >= res.closed - 2) {
        say('⚡ ' + (t.dir === 1 ? 'BUY' : 'SELL') + ' সিগন্যাল · ' + (t.why ? t.grade : t.mode) + ' · স্কোর ' + t.score);
        try { if (navigator.vibrate) navigator.vibrate(200); } catch (_) {}
      }
    });
    var al = res.now && res.now.alert, ak = al ? al.stage + '|' + al.dir + '|' + al.level : '';
    if (ak && ak !== lastAlertKey && !silent && al.stage !== 'pending') { say((al.stage === 'swept' ? '⚠️ ' : '👀 ') + al.text); try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (_) {} }
    lastAlertKey = ak;
    paint();
  }

  /* ---------- চার্টে আঁকা ---------- */
  function draw(ctx, h) {
    var res = state.res; if (!res || !res.trades.length) return;
    var tr = res.trades, keep = cfg.showHist ? cfg.maxHist : 1, from = Math.max(0, tr.length - keep);
    for (var k = from; k < tr.length; k++) drawTrade(ctx, h, tr[k], k === tr.length - 1);
  }
  function drawTrade(ctx, h, t, isLast) {
    var x1 = h.X(t.time), x2 = h.X(t.endTime);
    var yE = h.Y(t.entry), yS = h.Y(t.sl), yN = h.Y(t.slNow), y1 = h.Y(t.tp1), y2 = h.Y(t.tp2), y3 = h.Y(t.tp3);
    if ([x1, x2, yE, yS, yN, y1, y2, y3].some(function (v) { return v === null || v === undefined || isNaN(v); })) return;
    if (x2 < x1 + 3) x2 = x1 + 3;
    if (x2 < 0 || x1 > h.W) return;
    var info = state.info || marketInfo(cur.sym), f = function (p) { return Number(p).toFixed(info.dec); };
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(41,121,255,0.15)'; ctx.fillRect(x1, Math.min(yE, y3), x2 - x1, Math.abs(y3 - yE));
    ctx.strokeStyle = 'rgba(41,121,255,0.55)'; ctx.strokeRect(x1, Math.min(yE, y3), x2 - x1, Math.abs(y3 - yE));
    ctx.fillStyle = 'rgba(255,77,77,0.15)'; ctx.fillRect(x1, Math.min(yE, yS), x2 - x1, Math.abs(yS - yE));
    ctx.strokeStyle = 'rgba(255,77,77,0.55)'; ctx.strokeRect(x1, Math.min(yE, yS), x2 - x1, Math.abs(yS - yE));
    function ln(y, col, dash) { ctx.strokeStyle = col; ctx.setLineDash(dash ? [5, 4] : []); ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); }
    ln(yE, 'rgba(255,255,255,0.8)', false);
    ln(yN, '#ff4d4d', true); ln(y1, '#2979ff', true); ln(y2, '#2979ff', true); ln(y3, '#2979ff', true);
    ctx.setLineDash([]);
    ctx.font = '10px system-ui,sans-serif'; ctx.textBaseline = 'alphabetic';
    var pip = function (d) { return (Math.abs(d) / info.pip).toFixed(1) + 'p'; };
    if (isLast) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff'; ctx.fillText('ENTRY ' + f(t.entry), x1 + 3, yE - 3);
      ctx.fillStyle = '#ff7a7a'; ctx.fillText((t.beMoved ? 'BE ' : 'SL ') + f(t.slNow) + (t.beMoved ? '' : ' (' + pip(t.entry - t.sl) + ')'), x1 + 3, t.beMoved ? yN + 11 : yN - 3);
      ctx.fillStyle = '#6ea8ff';
      ctx.fillText('TP1 ' + f(t.tp1) + ' (' + pip(t.tp1 - t.entry) + ')', x1 + 3, y1 - 3);
      ctx.fillText('TP2 ' + f(t.tp2) + ' (' + pip(t.tp2 - t.entry) + ')', x1 + 3, y2 - 3);
      ctx.fillText('TP3 ' + f(t.tp3) + ' (' + pip(t.tp3 - t.entry) + ')', x1 + 3, y3 - 3);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    ctx.fillText((t.dir === 1 ? 'BUY' : 'SELL') + ' · ' + STAT[t.status], x2 - 3, Math.min(yE, yS) - 4 + (t.dir === 1 ? Math.abs(yS - yE) + 12 : 0));
    ctx.textAlign = 'left';
  }

  /* ---------- UI: ৪ ট্যাবের ⚡ শিট (সিগন্যাল / ফলাফল / সেটিংস / শেখো) ---------- */
  var css = document.createElement('style');
  css.textContent = '#ul-sheet{position:fixed;inset:0;z-index:56;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center}#btn-ultra.on{border-color:#2979ff;color:#2979ff}';
  document.head.appendChild(css);

  var btn = $('btn-ultra');
  var TABS = [['sig', '📡 সিগন্যাল'], ['perf', '📊 ফলাফল'], ['set', '⚙️ সেটিংস']];
  var TAB = lsGet('rtx_ultra_tab', 'sig'); if (!TABS.some(function (x) { return x[0] === TAB; })) TAB = 'sig';
  var aiHtml = '', aiFor = '', optHtml = '';

  function kv(k, v, cls) { return '<div class="kv"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>'; }
  function kvh(k, hk, v, cls) { return '<div class="kv"><span>' + k + (R.help ? ' ' + R.help.btn(hk) : '') + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>'; }
  function biasTxt(b) { return b === 1 ? '<b class="up">বুলিশ ↑</b>' : b === -1 ? '<b class="dn">বেয়ারিশ ↓</b>' : '<b style="color:#8b8b8b">নিরপেক্ষ</b>'; }
  function bn(b) { return b === 1 ? 'বুলিশ' : b === -1 ? 'বেয়ারিশ' : 'নিরপেক্ষ'; }
  function money(v, sign) { if (v === null || v === undefined || isNaN(v)) return '?'; return (sign ? (v >= 0 ? '+' : '−') : '') + '$' + Math.abs(v).toFixed(2); }
  function pdTxt(v) { if (!nn(v)) return '-'; return v > 1 ? 'সাম্প্রতিক রেঞ্জের ওপরে (Premium)' : v < 0 ? 'সাম্প্রতিক রেঞ্জের নিচে (Discount)' : 'রেঞ্জের ' + Math.round(v * 100) + '% জায়গায় (' + (v < 0.5 ? 'Discount' : 'Premium') + ')'; }
  function setTab(t) { TAB = t; lsSet('rtx_ultra_tab', t); renderSheet(); }

  function paint() {
    if (btn) btn.classList.toggle('on', !!cfg.on);
    var b = $('ul-body'); if (!b) return;
    if (TAB === 'sig') { var ao = $('ai-out'); if (ao && ao.innerHTML) aiHtml = ao.innerHTML; b.innerHTML = sigHtml(); }
    else if (TAB === 'perf') b.innerHTML = perfHtml();
  }

  /* লট ও ডলারের হিসাব: ট্রেডের নিজের লট থাকলে সেটা, নইলে সেটিংসের স্থির লট */
  function tradeMoney(t, info, spec, C) {
    var lot = t.lot !== null && t.lot !== undefined ? t.lot : (C.lot > 0 ? C.lot : 0.01);
    var at = function (px) { return R.trade.dollarRisk(info, spec, lot, Math.abs(px - t.entry), t.entry); };
    var bal = C.balance > 0 ? C.balance : 1000, risk = at(t.sl);
    return { lot: lot, risk: risk, pct: risk === null ? null : risk / bal * 100, tp1: at(t.tp1), tp2: at(t.tp2), tp3: at(t.tp3), bal: bal };
  }

  /* ---------- "কেন এই সিগন্যাল" ব্যাখ্যা (সিগন্যালের সাথে জমা তথ্য থেকে) ---------- */
  function EM() { return (cfg.engine === 'raid' && R.raid) ? R.raid : (cfg.engine === 'strat' && R.strat) ? R.strat : R.decision; }
  function whyHtml(t, info, mny) {
    var w = t.why, b = t.dir === 1, f = function (p) { return Number(p).toFixed(info.dec); };
    if (!w) return '<div class="note-info">পুরোনো (Classic) ইঞ্জিনের সিগন্যাল: ' + esc(t.mode) + (t.extra ? ' · ' + esc(t.extra) : '') + '। বিস্তারিত কারণ শুধু নতুন ইঞ্জিনে পাওয়া যায় (সেটিংস → উন্নত → ইঞ্জিন)।</div>';
    if (w.strat) return whyStrat(t, w, info, mny);
    if (w.raid) return whyRaid(t, w, info, mny);
    var P = w.parts, M = w.partsMax, ls = [];
    ls.push('<b>বাজারের অবস্থা:</b> ' + esc(w.regimeBn) + '। ' + esc(w.regimeDesc));
    var trig = w.type === 'setup' ? 'সেটআপ (' + (w.setups.length ? esc(w.setups.join(' + ')) : 'ULTRA') + ')' : w.type === 'breakout' ? 'ব্রেকআউট / মোমেন্টাম' + (w.xl.length ? ' (XL: ' + esc(w.xl.join(' + ')) + ')' : '') : 'ট্রেন্ড-ফলো (ট্রেন্ড ইন্ডিকেটরগুলো একসাথে দিক বদলেছে)';
    ls.push('<b>এন্ট্রি ট্রিগার:</b> ' + trig + '। সিগন্যাল শুধু বন্ধ হওয়া ক্যান্ডেলে আসে, তাই মাঝপথে বদলায় না।');
    var tf = w.trendFamily;
    ls.push('<b>ট্রেন্ড নিশ্চিতকরণ:</b> UT Bot ' + bn(tf.ut) + ', JDT ' + bn(tf.jdt) + ', Supertrend ' + bn(tf.supertrend) + ' → ' + tf.agree + '/৩ ' + (b ? 'কেনার' : 'বেচার') + ' দিকে। (তিনটি একই ATR-ভিত্তিক, তাই মিলিয়ে ১টি ভোট ধরা হয়)');
    ls.push('<b>বড় টাইমফ্রেম:</b> 4H ' + bn(w.htf.h4) + ', 1H ' + bn(w.htf.h1) + (w.htf.counterTrend ? ' — একটি বড় টাইমফ্রেম উল্টো, তাই এটা ট্রেন্ডের বিপরীতের সেটআপ (ঝুঁকি বেশি)' : ''));
    var st = w.structure;
    ls.push('<b>মার্কেট স্ট্রাকচার:</b> ' + bn(st.trend) + (st.recent ? ', সাম্প্রতিক ' + esc(st.recent) : '') + (st.inZone ? ', গুরুত্বপূর্ণ জোনে (OB/FVG) আছে' : '') + (st.premiumDiscount !== null ? ', ' + pdTxt(st.premiumDiscount) : ''));
    ls.push('<b>স্কোর ' + w.score + '/১০০</b> (ন্যূনতম ' + w.minScore + '): সেটআপ ' + P.setup + '/' + M.setup + ' · মোমেন্টাম ' + P.momentum + '/' + M.momentum + ' · ট্রেন্ড ' + P.trend + '/' + M.trend + ' · HTF ' + P.htf + '/' + M.htf + ' · স্ট্রাকচার ' + P.structure + '/' + M.structure + ' · অবস্থা ' + P.regime + '/' + M.regime + '। স্কোর শুধু কয়টা শর্ত মিলেছে তা বলে, জেতার সম্ভাবনা নয়।');
    ls.push('<b>SL কেন ওখানে:</b> ' + esc(w.sl.text) + (w.sl.widened ? ' (খুব কাছে হওয়ায় ন্যূনতম দূরত্বে সরানো হয়েছে)' : '') + '। SL ছুঁলে ট্রেড ভুল প্রমাণিত হয়।');
    ls.push('<b>টার্গেট:</b> TP1 ' + w.tp.r[0] + 'R, TP2 ' + w.tp.r[1] + 'R, TP3 ' + w.tp.r[2] + 'R' + (w.tp.obstacle ? '। সবচেয়ে কাছের বাধা ' + esc(w.tp.obstacle) + ' (' + (w.tp.room !== null && w.tp.room !== undefined ? Number(w.tp.room).toFixed(1) + 'R দূরে' : '') + ')' : '। সামনে বড় কোনো বাধা নেই') + (w.tp.notes && w.tp.notes.length ? '। ' + esc(w.tp.notes.join('; ')) : ''));
    ls.push('<b>ঝুঁকি:</b> ' + mny.lot.toFixed(2) + ' লটে SL ছুঁলে ক্ষতি ' + money(mny.risk) + (mny.pct !== null ? ' = ব্যালেন্স ' + money(mny.bal) + '-এর ' + mny.pct.toFixed(2) + '%' : '') + (w.costs.on ? '। স্প্রেড ' + w.costs.spread + ' ও স্লিপেজ ' + w.costs.slip + ' হিসাবে ধরা আছে' : ''));
    var g = w.gate.map(function (x) { return '<div class="gate ' + (x.ok ? 'ok' : 'no') + '">' + (x.ok ? '✅' : '❌') + ' ' + esc(x.label) + (x.note ? '<span>' + esc(x.note) + '</span>' : '') + '</div>'; }).join('');
    return '<div class="why"><div class="why-h">কেন এই সিগন্যাল এলো?</div><ol>' + ls.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol><details class="fold"><summary>১০টি শর্তের পরীক্ষা (সবগুলো ✅ হলেই সিগন্যাল)</summary><div class="fbody">' + g + '</div></details></div>';
  }

  function whyRaid(t, w, info, mny) {
    var r = w.raid, b = t.dir === 1, P = w.parts, M = w.partsMax, ls = [], f = function (p) { return Number(p).toFixed(info.dec); };
    var side = b ? 'নিচের' : 'ওপরের';
    ls.push('<b>১) লিকুইডিটি পুল:</b> ' + side + ' ' + esc(r.poolKindBn) + ' (' + f(r.poolPrice) + ')। এখানে ' + (b ? 'সেলারদের' : 'বায়ারদের') + ' স্টপ লস জমে থাকে, বড় খেলোয়াড়দের কাছে এটা "জ্বালানি"।');
    ls.push('<b>২) সুইপ:</b> দাম ' + (b ? 'নিচে' : 'ওপরে') + ' ' + f(r.ext) + ' পর্যন্ত গিয়ে উইক টেনে ' + r.wickAtr + '×ATR ছাড়িয়ে আবার ভেতরে ফিরে বন্ধ হয়েছে। অর্থাৎ স্টপগুলো সংগ্রহ হয়ে গেছে, এটা আসল ব্রেকআউট নয়।');
    ls.push('<b>৩) CISD (দিক বদলের নিশ্চিতকরণ):</b> ' + (b ? 'ওপরে' : 'নিচে') + ' জোরালো ক্যান্ডেল (বডি ' + r.cisdBody + '×ATR) ' + f(r.cisdLvl) + '-এর ' + (b ? 'ওপরে' : 'নিচে') + ' বন্ধ হয়েছে' + (r.fvg ? ', সাথে FVG-ও তৈরি হয়েছে' : '') + '। এখন দাম ' + (b ? 'ওপরের' : 'নিচের') + ' দিকে ঘুরেছে বলে ধরা হয়।');
    ls.push('<b>৪) এন্ট্রি:</b> ' + esc(r.entryNote) + '। ' + (t.status === 0 ? 'এখনো লিমিট অপেক্ষায়; দাম না ফিরলে ট্রেড হবে না।' : ''));
    ls.push('<b>৫) বড় টাইমফ্রেম:</b> 4H ' + bn(w.htf.h4) + ', 1H ' + bn(w.htf.h1) + (w.htf.counterTrend ? ' — একটি বিপরীতে, ঝুঁকি বেশি' : ''));
    ls.push('<b>৬) SL কেন ওখানে:</b> সুইপের ' + (b ? 'সর্বনিম্ন' : 'সর্বোচ্চ') + ' ' + f(r.ext) + '-এর বাইরে বাফার সহ। দাম ওটা পার হলে সুইপের ধারণাই ভুল প্রমাণিত হয়।');
    ls.push('<b>৭) টার্গেট:</b> TP১ ' + w.tp.r[0].toFixed(1) + 'R, TP২ ' + w.tp.r[1].toFixed(1) + 'R, TP৩ ' + w.tp.r[2].toFixed(1) + 'R' + (r.tp3KindBn ? ' (TP৩ = ' + esc(r.tp3KindBn) + ' ' + f(r.tp3Price) + ')' : '') + (w.tp.notes.length ? '। ' + esc(w.tp.notes.join('; ')) : '') + (r.capped ? '। লিকুইডিটি অনেক দূরে, তাই সর্বোচ্চ সীমায় রাখা হয়েছে' : ''));
    ls.push('<b>৮) অতিরিক্ত সমর্থন:</b> ' + (r.div ? 'RSI ডাইভারজেন্স আছে ✅' : 'RSI ডাইভারজেন্স নেই') + ' · ' + (r.pdOk ? (b ? 'ডিসকাউন্ট' : 'প্রিমিয়াম') + ' এলাকায় ✅' : 'প্রিমিয়াম/ডিসকাউন্ট মেলেনি') + ' · সেশন: ' + esc(r.session) + (r.hasDelta ? ' · Delta (সুইপ→CISD): ' + (r.deltaOk ? 'দিকের সাথে মেলে ✅' : 'মেলেনি') : ''));
    ls.push('<b>স্কোর ' + w.score + '/১০০</b> (ন্যূনতম ' + w.minScore + '): সুইপ ' + P.sweep + '/' + M.sweep + ' · CISD ' + P.cisd + '/' + M.cisd + ' · বড় টাইমফ্রেম ' + P.htf + '/' + M.htf + ' · লাভ-ঝুঁকি ' + P.rr + '/' + M.rr + ' · প্রসঙ্গ ' + P.ctx + '/' + M.ctx + '। স্কোর শুধু কয়টা শর্ত মিলেছে তা বলে, জেতার সম্ভাবনা নয়।');
    ls.push('<b>ঝুঁকি:</b> ' + mny.lot.toFixed(2) + ' লটে SL ছুঁলে ক্ষতি ' + money(mny.risk) + (mny.pct !== null ? ' = ব্যালেন্স ' + money(mny.bal) + '-এর ' + mny.pct.toFixed(2) + '%' : '') + (w.risk.warn ? ' ⚠️ ৫%-এর বেশি' : '') + (w.costs.on ? '। স্প্রেড ' + w.costs.spread + ' ও স্লিপেজ ' + w.costs.slip + ' হিসাবে ধরা আছে' : ''));
    var g = w.gate.map(function (x) { return '<div class="gate ' + (x.ok ? 'ok' : 'no') + '">' + (x.ok ? '✅' : '❌') + ' ' + esc(x.label) + (x.note ? '<span>' + esc(x.note) + '</span>' : '') + '</div>'; }).join('');
    return '<div class="why"><div class="why-h">কেন এই সিগন্যাল এলো?</div><ol>' + ls.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol><details class="fold"><summary>৮টি শর্তের পরীক্ষা (সবগুলো ✅ হলেই সিগন্যাল)</summary><div class="fbody">' + g + '</div></details></div>';
  }

  function whyStrat(t, w, info, mny) {
    var s = w.strat, b = t.dir === 1, P = w.parts, M = w.partsMax, ls = [], f = function (p) { return Number(p).toFixed(info.dec); };
    ls.push('<b>১) স্ট্র্যাটেজি:</b> ' + esc(s.name) + ' (' + esc(s.group) + ')। ' + esc(s.desc));
    ls.push('<b>২) ট্রিগার:</b> এই বন্ধ ক্যান্ডেলে ওই শর্ত পূর্ণ হয়েছে, তাই ' + (b ? 'BUY' : 'SELL') + (s.lvl !== null ? '। স্ট্রাকচার লেভেল ' + f(s.lvl) : '') + '। ক্যান্ডেলের বডি ' + s.body + '×ATR' + (s.volRatio !== null ? ', ভলিউম গড়ের ' + s.volRatio + ' গুণ' : '') + '।');
    ls.push('<b>৩) এন্ট্রি:</b> ' + esc(s.entryNote) + '।' + (t.status === 0 ? ' এখনো লিমিট অপেক্ষায়; দাম না ফিরলে ট্রেড হবে না।' : ''));
    ls.push('<b>৪) বড় টাইমফ্রেম:</b> 4H ' + bn(w.htf.h4) + ', 1H ' + bn(w.htf.h1) + (w.htf.counterTrend ? ' — একটি বিপরীতে, ঝুঁকি বেশি' : ''));
    ls.push('<b>৫) SL কেন ওখানে:</b> ' + esc(s.slKindBn || w.sl.text) + (w.sl.widened ? ' (খুব কাছে হওয়ায় ন্যূনতম দূরত্বে সরানো হয়েছে)' : '') + '। দাম ওটা পার হলে এই সেটআপের ধারণাই ভুল প্রমাণিত হয়।');
    ls.push('<b>৬) টার্গেট:</b> TP১ ' + w.tp.r[0].toFixed(1) + 'R, TP২ ' + w.tp.r[1].toFixed(1) + 'R, TP৩ ' + w.tp.r[2].toFixed(1) + 'R' + (s.obstacle ? '। সবচেয়ে কাছের বাধা ' + esc(s.obstacle) + (s.room !== null && s.room !== undefined ? ' (' + Number(s.room).toFixed(1) + 'R দূরে)' : '') : '। সামনে বড় কোনো বাধা নেই') + (w.tp.notes && w.tp.notes.length ? '। ' + esc(w.tp.notes.join('; ')) : ''));
    ls.push('<b>স্কোর ' + w.score + '/১০০</b> (ন্যূনতম ' + w.minScore + '): ট্রিগার ' + P.trigger + '/' + M.trigger + ' · বড় টাইমফ্রেম ' + P.htf + '/' + M.htf + ' · ট্রেন্ড (EMA50/200) ' + P.trend + '/' + M.trend + ' · EMA100 ' + P.ema + '/' + M.ema + ' · VWAP ' + P.vwap + '/' + M.vwap + ' · Heikin Ashi ' + P.ha + '/' + M.ha + ' · ক্যান্ডেল ' + P.candle + '/' + M.candle + ' · ভলিউম ' + P.vol + '/' + M.vol + '। স্কোর শুধু কয়টা শর্ত মিলেছে তা বলে, জেতার সম্ভাবনা নয়।');
    ls.push('<b>ঝুঁকি:</b> ' + mny.lot.toFixed(2) + ' লটে SL ছুঁলে ক্ষতি ' + money(mny.risk) + (mny.pct !== null ? ' = ব্যালেন্স ' + money(mny.bal) + '-এর ' + mny.pct.toFixed(2) + '%' : '') + (w.risk.warn ? ' ⚠️ ৫%-এর বেশি' : '') + (w.costs.on ? '। স্প্রেড ' + w.costs.spread + ' ও স্লিপেজ ' + w.costs.slip + ' হিসাবে ধরা আছে' : ''));
    var g = w.gate.map(function (x) { return '<div class="gate ' + (x.ok ? 'ok' : 'no') + '">' + (x.ok ? '✅' : '❌') + ' ' + esc(x.label) + (x.note ? '<span>' + esc(x.note) + '</span>' : '') + '</div>'; }).join('');
    return '<div class="why"><div class="why-h">কেন এই সিগন্যাল এলো? (' + esc(s.name) + ')</div><ol>' + ls.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol><details class="fold"><summary>৯টি শর্তের পরীক্ষা (সবগুলো ✅ হলেই সিগন্যাল)</summary><div class="fbody">' + g + '</div></details></div>';
  }

  function stratCardHtml() {
    if (!R.strat) return '';
    var df = R.strat.DEFS[cfg.strategy] || R.strat.DEFS.raid;
    return '<div class="card"><label class="field full"><span>🎯 স্ট্র্যাটেজি — শুধু এটাই সিগন্যাল দেবে (সব মার্কেটে)</span><select data-k="strategy">' + R.strat.ORDER.map(function (k, ix) { return '<option value="' + k + '"' + (cfg.strategy === k ? ' selected' : '') + '>' + (ix + 1) + '. ' + esc(R.strat.DEFS[k].name) + '</option>'; }).join('') + '</select></label><div class="note-info"><b>' + esc(df.group) + ':</b> ' + esc(df.desc) + '</div></div>';
  }

  function ageTxt(t0) {   // সিগন্যাল ক্যান্ডেলের সময় থেকে এখন পর্যন্ত কত আগে
    var lc = R.chart.last(), d = lc ? Math.max(0, lc.time - t0) : 0, m = Math.round(d / 60);
    return (m < 60 ? m + ' মিনিট' : Math.floor(m / 60) + ' ঘণ্টা ' + (m % 60) + ' মিনিট') + ' আগে' + (d / cur.sec > 120 ? ' (চার্টের বাঁ দিকে সরে গেছে, পিছিয়ে স্ক্রল করলে দেখা যাবে)' : '');
  }

  /* ---------- সবার ওপরের পরিসংখ্যান বক্স (নির্বাচিত স্ট্র্যাটেজি অনুযায়ী) ---------- */
  function statBox(res, C) {
    var tr = res.trades || [], A = R.analytics, cl = A.closedOf(tr), w = 0, l = 0, be = 0, gw = 0, gl = 0, net = 0, wait = 0, act = 0, exp = 0, can = 0, i, r, t;
    for (i = 0; i < cl.length; i++) { r = A.rOf(cl[i]); net += r; if (r > 1e-9) { w++; gw += r; } else if (r < -1e-9) { l++; gl -= r; } else be++; }
    for (i = 0; i < tr.length; i++) { t = tr[i]; if (t.status === 0) wait++; else if (t.status >= 1 && t.status <= 3) act++; else if (t.status === 8) exp++; else if (t.status === 7) can++; }
    var wr = (w + l) ? w / (w + l) * 100 : null, pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : null), last = tr.length ? tr[tr.length - 1] : null;
    var DF = R.strat && R.strat.DEFS && R.strat.DEFS[cfg.strategy], nm = DF ? DF.short : cfg.strategy;
    var box = function (k, v, cls) { return '<div class="sbx"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>'; };
    var h = '<div class="card"><b>📊 ' + esc(nm) + ' — এই ' + esc(String(cur.sym)) + ' চার্টে</b><div class="sbxg">' +
      box('মোট সিগন্যাল', tr.length) + box('জয় (Win)', w, 'up') + box('লস (Loss)', l, l ? 'dn' : '') + box('ব্রেক-ইভেন', be) +
      box('চলমান (Active)', act) + box('লিমিটের অপেক্ষায়', wait) + box('মেয়াদ শেষ (Missed)', exp) + box('বাতিল (Replaced)', can) +
      box('জয়ের হার', wr === null ? 'N/A' : wr.toFixed(0) + '%', wr !== null && wr >= 50 ? 'up' : wr === null ? '' : 'dn') +
      box('মোট R', (net >= 0 ? '+' : '') + net.toFixed(2), net > 0 ? 'up' : net < 0 ? 'dn' : '') +
      box('Profit Factor', pf === null ? 'N/A' : isFinite(pf) ? pf.toFixed(2) : '∞') +
      box('শেষ সিগন্যাল', last ? ageTxt(last.time).replace(/ \(.*$/, '') : '—') + '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:6px">জয়ের হার = জয় ÷ (জয় + লস) — ব্রেক-ইভেন, মেয়াদ শেষ ও বাতিল হিসাবে ধরা হয় না। জয়/লস বলা হয় মোট R দেখে (TP1-এর আংশিক লাভসহ)। এটা ব্যাকটেস্ট, ভবিষ্যতের গ্যারান্টি নয়।' + (cl.length < 10 ? ' ⚠️ বন্ধ ট্রেড ' + cl.length + 'টি — নমুনা খুব কম, হারের ওপর ভরসা করো না।' : '') + '</div></div>';
    return h;
  }

  /* ---------- ট্যাব ১: সিগন্যাল ---------- */
  function sigHtml() {
    if (!cfg.on) return '<div class="card muted">ULTRA বন্ধ আছে। সেটিংস ট্যাবে গিয়ে চালু করো।</div>';
    var res = state.res;
    if (!res) return '<div class="card muted">ডেটা লোড হচ্ছে বা ক্যান্ডেল কম (কমপক্ষে ৭০টি লাগে)।</div>';
    var info = state.info, now = res.now || {}, C = state.cfg || cfg, spec = R.trade.specFor(info, C), lc = R.chart.last();
    var f = function (p) { return Number(p).toFixed(info.dec); }, pip = function (d) { return (Math.abs(d) / info.pip).toFixed(1) + 'p'; };
    var tr = res.trades, t = tr[tr.length - 1], live = t && t.status >= 0 && t.status <= 3, h = '';
    if (cfg.autoOpt && optStore[optKey()]) h += '<div class="note-info" style="margin:0 0 8px">🎯 এই মার্কেট/টাইমফ্রেমে অটো-সেটআপ চালু আছে, তাই মোড ও কিছু মান সেটা থেকে আসছে।</div>';
    if (state.warn) h += '<div class="note-warn" style="margin:0 0 8px">' + esc(state.warn) + '</div>';
    h += statBox(res, C);

    var D = EM(), mk = C.mode || 'smart';
    var al = now.alert;
    h += stratCardHtml();
    h += '<div class="card" style="padding:8px 12px"><button class="btn" style="width:100%" onclick="RTX.school&&RTX.school.open(\'words\')">📚 শব্দের মানে ও সিগন্যাল পড়া শিখো (🏫 স্কুল)</button></div>';
    if (al) h += '<div class="card alert-' + al.stage + '"><b>' + (al.stage === 'watch' ? '👀 প্রস্তুত থাকো' : al.stage === 'swept' ? '⚠️ সুইপ হয়েছে, CISD-র অপেক্ষা' : '⏳ লিমিট এন্ট্রির অপেক্ষা') + (al.dir ? ' · ' + (al.dir === 1 ? 'BUY' : 'SELL') + ' সম্ভাবনা' : '') + '</b><div class="note-info">' + esc(al.text) + '</div></div>';
    h += '<div class="card"><div class="mrow">' + ['safe', 'smart', 'aggressive'].map(function (m) { return '<button class="mbtn' + (mk === m ? ' on' : '') + '" data-mode="' + m + '">' + m.toUpperCase() + '</button>'; }).join('') + (R.help ? R.help.btn('mode') : '') + '</div>' +
      (D ? '<div class="note-info">' + esc(D.MODE_INFO[mk].desc) + '</div>' : '') + '</div>';

    var mkt = kv('মার্কেট', esc(info.sym) + ' | ' + esc(info.name)) + kv('দাম', lc ? f(lc.close) : '-');
    if (now.regimeBn) mkt += kvh('বাজারের অবস্থা', 'regime', esc(now.regimeBn)) + kvh('ADX', 'adx', nn(now.adx) ? now.adx.toFixed(1) : '-') + kvh('স্ট্রাকচার', 'structure', biasTxt(now.struct)) + (nn(now.pd) ? kvh('Premium/Discount', 'pd', pdTxt(now.pd)) : '');
    mkt += kvh('বড় টাইমফ্রেম 4H', 'htf', biasTxt(now.h4)) + kv('বড় টাইমফ্রেম 1H', biasTxt(now.h1)) + kv('সেশন', esc(now.sessName) + (now.sessOk ? ' (ঠিক আছে)' : ' (বন্ধ)')) + kvh('ATR', 'atr', nn(now.atr) ? (now.atr / info.pip).toFixed(1) + ' pip' : '-') +
      kv('ব্যালেন্স / লট', money(C.balance) + ' / ' + (C.lotMode === 'risk' ? 'ঝুঁকি ' + C.riskPct + '%' : (C.lot > 0 ? C.lot : 0.01).toFixed(2) + ' লট'));
    h += '<div class="card">' + mkt + '</div>';

    if (t) {
      var mny = tradeMoney(t, info, spec, C), isB = t.dir === 1;
      h += '<div class="card"><div class="sig-h"><span class="badge ' + (isB ? 'buy' : 'sell') + '">' + (isB ? 'BUY' : 'SELL') + '</span> <b>' + esc(t.grade) + ' · ' + t.score + '/১০০</b> ' + (R.help ? R.help.btn('grade') : '') + '<span class="sig-s ' + (live ? 'up' : '') + '">' + (t.status === 0 ? 'অপেক্ষায় · ' : live ? 'চলছে · ' : 'শেষ · ') + STAT[t.status] + '</span></div>' +
        kv('ধরন', esc(t.mode) + (t.extra ? ' · ' + esc(t.extra) : '')) + kv('সিগন্যাল এসেছে', ageTxt(t.time)) + kv(t.status === 0 ? 'লিমিট এন্ট্রি (দাম ফিরলে)' : 'এন্ট্রি', f(t.entry)) +
        kv('SL', f(t.slNow) + (t.beMoved ? ' (ব্রেক-ইভেন)' : ' (' + pip(t.entry - t.sl) + ' · ' + money(-mny.risk, true) + ')'), 'dn') +
        kv('TP1', f(t.tp1) + ' (' + pip(t.tp1 - t.entry) + ' · ' + money(mny.tp1, true) + ')', 'up') + kv('TP2', f(t.tp2) + ' (' + pip(t.tp2 - t.entry) + ' · ' + money(mny.tp2, true) + ')', 'up') + kv('TP3', f(t.tp3) + ' (' + pip(t.tp3 - t.entry) + ' · ' + money(mny.tp3, true) + ')', 'up') +
        kv('লট', mny.lot.toFixed(2)) + kv('SL-এ ক্ষতি', money(mny.risk) + (mny.pct !== null ? ' (ব্যালেন্সের ' + mny.pct.toFixed(2) + '%)' : ''), 'dn') + '</div>';
      if (R.flow && info.isCrypto) { R.flow.prime(); var fc = R.flow.confirm(t.dir); h += '<div class="card"><b>📊 অর্ডারফ্লো কনফার্মেশন (এখনকার)</b><div class="note-info">' + esc(fc.note) + '</div><button class="btn" style="width:100%;margin-top:6px" onclick="RTX.flow.open()">Delta, টেপ, DOM, ফুটপ্রিন্ট, হিটম্যাপ দেখো</button></div>'; }
      h += '<div class="card">' + whyHtml(t, info, mny) + '</div>';
    } else h += '<div class="card muted">এই চার্টে এখনো কোনো সিগন্যাল নেই।</div>';

    var ls = now.last;
    if (ls && ls.status !== 'signal') {
      h += '<div class="card"><b>এখন সিগন্যাল নেই কেন?</b><div class="note-info">' + esc(ls.text) + '</div>';
      if (ls.gate) h += '<details class="fold"><summary>শর্তগুলো দেখো (' + (ls.dir === 1 ? 'BUY' : 'SELL') + ' প্রার্থী, স্কোর ' + ls.score + ')</summary><div class="fbody">' + ls.gate.map(function (x) { return '<div class="gate ' + (x.ok ? 'ok' : 'no') + '">' + (x.ok ? '✅' : '❌') + ' ' + esc(x.label) + (x.note ? '<span>' + esc(x.note) + '</span>' : '') + '</div>'; }).join('') + '</div></details>';
      h += '<div class="note-info">সর্বশেষ বন্ধ ক্যান্ডেলের হিসাব। সিগন্যাল না আসা মানে সিস্টেম অপেক্ষা করছে, এটা ভালো লক্ষণ। জোর করে ট্রেড নিও না।</div></div>';
    }

    var sk = t ? t.time : 0; if (aiFor !== String(sk)) { aiFor = String(sk); aiHtml = ''; }
    h += '<div class="card"><b>🤖 AI সহায়ক</b><div class="muted" style="font-size:12px;margin:4px 0 8px">উপরের কারণগুলো AI আরও সহজ বাংলায় বুঝিয়ে বলবে। বাটন চাপলেই শুধু কল হয়, একই সিগন্যালে দ্বিতীয়বার লিমিট খরচ হয় না।</div><div class="btnrow"><button class="btn primary" id="ai-explain">এই সিগন্যাল ব্যাখ্যা করো</button></div><div id="ai-out">' + aiHtml + '</div></div>';
    h += '<div class="note-info">সিগন্যাল শুধু বন্ধ হওয়া ক্যান্ডেলে আসে, তাই ক্যান্ডেল বন্ধ হওয়ার কয়েক সেকেন্ড পরে দেখা যায়। একই ক্যান্ডেলে SL ও TP দুটোই ছুঁলে SL আগে ধরা হয়। এটা আর্থিক পরামর্শ নয়।</div>';
    return h;
  }

  /* ---------- ট্যাব ২: ফলাফল ---------- */
  function perfHtml() {
    var res = state.res; if (!res) return '<div class="card muted">ডেটা লোড হচ্ছে…</div>';
    var C = state.cfg || cfg, tr = res.trades, A = R.analytics, h = '';
    var m = A.metrics(tr), wf = A.walkForward(tr, res.closed), mc = A.monteCarlo(m.rs, { balance: C.balance, avgRiskUsd: m.avgRiskUsd }), v = A.verdict(m, wf, mc);
    h += statBox(res, C) + '<div class="card verdict ' + v.level + '"><b>সহজ রায়</b><div>' + esc(v.text) + '</div></div>';
    h += '<div class="card"><b>মোট হিসাব (লোড করা ক্যান্ডেলে)</b>' + kv('বন্ধ ট্রেড / চলমান', m.n + ' / ' + m.open) + kvh('জয়ের হার (লাভে শেষ)', 'winrate', m.winRate.toFixed(0) + '%') + kv('TP1 ছুঁয়েছে', m.tp1Rate.toFixed(0) + '%') + kv('TP3 পর্যন্ত গেছে', m.tp3Rate.toFixed(0) + '%') + kv('SL হিট', m.slRate.toFixed(0) + '%', 'dn') + kv('ব্রেক-ইভেন', m.beRate.toFixed(0) + '%') +
      kvh('প্রত্যাশা (প্রতি ট্রেডে)', 'expectancy', (m.expR >= 0 ? '+' : '') + m.expR.toFixed(2) + 'R', m.expR > 0 ? 'up' : m.n ? 'dn' : '') + kvh('Profit Factor', 'pf', isFinite(m.pf) ? m.pf.toFixed(2) : '∞') + kv('মোট R', (m.totalR >= 0 ? '+' : '') + m.totalR.toFixed(1) + 'R') +
      (m.totalUsd !== null ? kv('মোট লাভ/ক্ষতি (ডলারে)', money(m.totalUsd, true), m.totalUsd >= 0 ? 'up' : 'dn') : '') + kvh('সর্বোচ্চ ড্রডাউন', 'dd', m.maxDDR.toFixed(1) + 'R' + (m.maxDDUsd !== null ? ' = ' + money(m.maxDDUsd) : '')) + kv('পরপর সর্বোচ্চ লস', String(m.maxLossStreak)) + '</div>';
    var cols = [['শেখার (প্রথম ৬০%)', wf.train], ['যাচাই (পরের ২০%)', wf.val], ['অদেখা টেস্ট (শেষ ২০%)', wf.test]];
    h += '<div class="card"><b>ভাগ-ভাগ যাচাই</b> ' + (R.help ? R.help.btn('walk') : '') + cols.map(function (c) { return kv(c[0], c[1].n + ' ট্রেড · ' + (c[1].expR >= 0 ? '+' : '') + c[1].expR.toFixed(2) + 'R', c[1].n && c[1].expR > 0 ? 'up' : c[1].n ? 'dn' : ''); }).join('') + '<div class="note-info">' + (wf.consistent ? 'তিন ভাগেই লাভ, ভালো লক্ষণ।' : wf.enough ? 'সব ভাগে লাভ নেই, ফলাফল সময়ের সাথে বদলাচ্ছে।' : 'প্রতি ভাগে অন্তত ৫টি ট্রেড দরকার, এখন কম।') + '</div></div>';
    if (mc.ok) h += '<div class="card"><b>মন্টে কার্লো (১০০০ বার এলোমেলো ক্রমে)</b> ' + (R.help ? R.help.btn('mc') : '') + kv('মাঝামাঝি ফল', (mc.finalP50 >= 0 ? '+' : '') + mc.finalP50.toFixed(1) + 'R' + (mc.finalP50Usd !== undefined ? ' = ' + money(mc.finalP50Usd, true) : '')) + kv('খারাপ ভাগ্যে (সবচেয়ে খারাপ ৫%)', mc.finalP5.toFixed(1) + 'R' + (mc.finalP5Usd !== undefined ? ' = ' + money(mc.finalP5Usd, true) : ''), 'dn') + kv('খারাপ ভাগ্যে সর্বোচ্চ ড্রডাউন', mc.ddP95.toFixed(1) + 'R' + (mc.ddP95Usd !== undefined ? ' = ' + money(mc.ddP95Usd) : ''), 'dn') + kv('শেষে লস হওয়ার সম্ভাবনা', Math.round(mc.probLoss * 100) + '%') + (mc.probRuin !== null ? kv('ব্যালেন্সের ' + mc.ruinPct + '% হারানোর সম্ভাবনা', Math.round(mc.probRuin * 100) + '%', mc.probRuin > 0.1 ? 'dn' : '') : '') + '</div>';
    else h += '<div class="card muted">' + esc(mc.why) + '</div>';

    if (res.stats && EM()) {
      var rj = res.stats.rejected, RJ = EM().REJ_BN, keys = Object.keys(rj).sort(function (a, b) { return rj[b] - rj[a]; });
      h += '<div class="card"><b>সিস্টেম কতগুলো সুযোগ বাতিল করেছে</b>' + kv('প্রার্থী সুযোগ', String(res.stats.candidates)) + kv('সিগন্যাল হয়েছে', String(res.stats.signals), 'up') + keys.map(function (k) { return kv('বাতিল: ' + esc(RJ[k] || k), String(rj[k])); }).join('') + '<div class="note-info">বেশিরভাগ সুযোগ বাতিল হওয়াই স্বাভাবিক। এটাই সিগন্যালের মান বাঁচায়।</div></div>';
    }
    if (res.board) {
      h += '<div class="card"><b>📊 স্ট্র্যাটেজি স্কোরবোর্ড</b> <span class="muted">(SL 1.5×ATR, TP 2R)</span>';
      res.board.forEach(function (r) { h += kv(esc(r.name), r.n ? r.n + ' ট্রেড · জয় ' + r.win.toFixed(0) + '% · ' + (r.exp >= 0 ? '+' : '') + r.exp.toFixed(2) + 'R' : '—', r.n && r.exp > 0 ? 'up' : r.n ? 'dn' : ''); });
      h += '<div class="note-info">জয় ৩৩%-এর বেশি ও +R হলে ২R টার্গেটে লাভজনক ছিল।</div></div>';
    }
    h += '<div class="card"><b>🔬 ' + R.strat.ORDER.length + 'টি ইঞ্জিনের ফলাফল (এই মার্কেট ও টাইমফ্রেমে)</b><div class="muted" style="font-size:12px;margin:4px 0 8px">বর্তমান মোড ও এন্ট্রি ধরনে প্রতিটি ইঞ্জিন আলাদা চালিয়ে দেখায়: কয়টি সিগন্যাল এলো, কয়টি TP1/TP2/TP3 ছুঁলো, কয়টি SL খেলো, কয়টি জয়-লস। পুরোনো প্রায় ৬০০০ ক্যান্ডেল পর্যন্ত লোড করে (কয়েক সেকেন্ড লাগে)।</div><div class="btnrow"><button class="btn primary" id="ul-cmp">তুলনা করো</button></div><div id="ul-cmpres">' + cmpHtml + '</div></div>';
    h += '<div class="card"><b>🎯 অটো-সেটআপ</b><div class="muted" style="font-size:12px;margin:4px 0 8px">এই মার্কেট ও টাইমফ্রেমে ' + (R.opt ? R.opt.combosFor(cfg.engine) : '') + 'টি সেটিং পরীক্ষা করে সেরাটা শেষ ৩৫% অদেখা ডেটায় যাচাই করে। কয়েক সেকেন্ড লাগে।</div><div class="btnrow"><button class="btn primary" id="ul-opt">খোঁজো</button><button class="btn" id="ul-optoff">অটো-সেটআপ মুছো</button></div><div id="ul-optres">' + optHtml + '</div></div>';
    h += '<div class="note-info">সব হিসাব শুধু এই চার্টে এখন যে ক্যান্ডেল লোড আছে তার। পুরোনো ফল ভবিষ্যতের গ্যারান্টি নয়। আসল টাকায় আগে ডেমোতে যাচাই করো।</div>';
    return h;
  }

  /* ---------- ট্যাব ৩: সেটিংস ---------- */
  var SFIELDS = [
    ['balance', 'num', 'অ্যাকাউন্ট ব্যালেন্স ($)', 1, 100000000],
    ['lotMode', 'select', 'লট কীভাবে ঠিক হবে', [['fixed', 'স্থির লট (আমি সবসময় একই লটে ট্রেড করি)'], ['risk', 'ঝুঁকি % থেকে হিসাব']]],
    ['lot', 'num', 'স্থির লট (যেমন 0.01)', 0.01, 100],
    ['riskPct', 'num', 'ঝুঁকি % (শুধু "ঝুঁকি %" মোডে)', 0.1, 10],
    ['entryMode', 'select', 'এন্ট্রির ধরন', [['retest', 'রিটেস্ট এন্ট্রি — দাম একটু ফিরলে লিমিট (SL-এর দূরত্ব ছোট, কিছু ট্রেড মিস হয়)'], ['fast', 'দ্রুত এন্ট্রি — সিগন্যাল ক্যান্ডেল বন্ধ হতেই (প্রায় সব ট্রেড ধরা পড়ে)']]],
    ['maxRiskPct', 'num', 'এক ট্রেডে সর্বোচ্চ ঝুঁকি (ব্যালেন্সের %)', 0.5, 50],
    ['maxHoldH', 'num', 'ট্রেড সর্বোচ্চ কত ঘণ্টা খোলা থাকবে (এর পর ক্লোজ দামে বন্ধ, নতুন সিগন্যাল আসতে পারে)', 1, 72],
    ['tp1Pct', 'num', 'TP1-এ কত % পজিশন বন্ধ (R-এর হিসাবে)', 0, 100],
    ['tp2Pct', 'num', 'TP2-এ কত % পজিশন বন্ধ', 0, 100],
    ['tp3Pct', 'num', 'TP3-এ কত % পজিশন বন্ধ (তিনটার যোগফল ১০০ না হলে অনুপাত ধরা হয়)', 0, 100],
    ['mode', 'select', 'সিগন্যাল মোড', [['safe', 'SAFE — কম কিন্তু সেরা'], ['smart', 'SMART — ভারসাম্য'], ['aggressive', 'AGGRESSIVE — বেশি সিগন্যাল']]],
    ['costOn', 'bool', 'স্প্রেড ও স্লিপেজ খরচ হিসাবে ধরো'], ['useSess', 'bool', 'সেশন ফিল্টার (সোনায়)'], ['volFilter', 'bool', 'ভোলাটিলিটি ফিল্টার']
  ];
  var ALLF = [];
  function rebuildAllF() { ALLF = SFIELDS.concat(FIELDS.filter(function (x) { return ['balance', 'riskPct', 'useSess', 'volFilter'].indexOf(x[0]) < 0; })); }
  rebuildAllF();

  function fieldHtml(fd, grid) {
    var key = fd[0], type = fd[1], label = fd[2];
    if (type === 'bool') return '<div class="row"><label><input type="checkbox" data-k="' + key + '"' + (cfg[key] ? ' checked' : '') + '><span>' + label + '</span></label></div>';
    if (type === 'select') return '<label class="field full"><span>' + label + '</span><select data-k="' + key + '">' + fd[3].map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + v + '"' + (cfg[key] === v ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></label>';
    return '<label class="field"><span>' + label + '</span><input type="number" inputmode="decimal" step="any" data-k="' + key + '" value="' + cfg[key] + '"></label>';
  }
  function previewHtml() {
    var info = marketInfo(cur.sym || 'XAUUSDT'), C = effCfg(), spec = R.trade.specFor(info, C), lot = C.lot > 0 ? C.lot : 0.01, mk = C.mode || 'smart';
    var M = { maxRiskPct: C.maxRiskPct > 0 ? C.maxRiskPct : 10 };
    var per = R.trade.dollarRisk(info, spec, lot, 1, 1000), bal = C.balance > 0 ? C.balance : 1000, maxUsd = bal * M.maxRiskPct / 100;
    var h = '<div class="note-info"><b>' + esc(info.sym) + '</b>: ' + lot.toFixed(2) + ' লটে দাম ১ একক নড়লে লাভ/লস = <b>' + money(per) + '</b> (কন্ট্রাক্ট ' + spec.cSize + ')।<br>';
    h += 'ব্যালেন্স ' + money(bal) + ', ' + mk.toUpperCase() + ' মোডে এক ট্রেডে সর্বোচ্চ ঝুঁকি ' + M.maxRiskPct + '% = <b>' + money(maxUsd) + '</b>। ';
    if (per > 0) h += 'তাই SL সর্বোচ্চ <b>' + (maxUsd / per).toFixed(info.dec > 2 ? 2 : 2) + '</b> একক দূরে হলে সিগন্যাল আসবে; তার চেয়ে দূরে হলে "ব্যালেন্সের তুলনায় ঝুঁকি বেশি" বলে বাতিল হবে।';
    return h + '</div>';
  }
  function newsHtml() {
    var nb = cfg.newsBlocks || [], h = '';
    nb.forEach(function (b, i) { h += '<div class="kv"><span>' + new Date(b[0] * 1000).toLocaleString('bn-BD') + ' → ' + new Date(b[1] * 1000).toLocaleString('bn-BD') + '</span><button class="del" data-nwdel="' + i + '">✕</button></div>'; });
    return h || '<div class="note-info">কোনো নিউজ-বিরতি যোগ করা নেই।</div>';
  }
  function setHtml() {
    var info = marketInfo(cur.sym || 'XAUUSDT'), spec = R.trade.specFor(info, cfg), h = '';
    h += '<div class="card"><div class="row"><label><input type="checkbox" id="ul-on"' + (cfg.on ? ' checked' : '') + '><span>চার্টে সিগন্যাল চালু</span></label></div></div>';
    h += stratCardHtml();
    h += '<div class="card"><b>💰 অ্যাকাউন্ট ও লট</b><div class="fgrid">' + SFIELDS.filter(function (x) { return ['balance', 'lot', 'riskPct', 'maxRiskPct', 'maxHoldH', 'tp1Pct', 'tp2Pct', 'tp3Pct'].indexOf(x[0]) >= 0; }).map(fieldHtml).join('') + '</div>' + SFIELDS.filter(function (x) { return ['lotMode', 'entryMode', 'mode'].indexOf(x[0]) >= 0; }).map(fieldHtml).join('') + '<div id="set-prev">' + previewHtml() + '</div></div>';
    h += '<div class="card"><b>📐 ' + esc(info.sym) + ' — ব্রোকারের মান</b><div class="muted" style="font-size:12px;margin:4px 0 8px">Exness-এর স্পেসিফিকেশন দেখে মিলিয়ে নাও। ভুল হলে ডলারের হিসাবও ভুল আসবে।</div><div class="fgrid">' +
      [['cSize', 'কন্ট্রাক্ট সাইজ (১ লট = কত একক)'], ['spread', 'স্প্রেড (দামের এককে)'], ['slip', 'স্লিপেজ (দামের এককে)']].map(function (x) { return '<label class="field"><span>' + x[1] + '</span><input type="number" inputmode="decimal" step="any" data-sk="' + x[0] + '" value="' + spec[x[0]] + '"></label>'; }).join('') + '</div>' +
      SFIELDS.filter(function (x) { return ['costOn', 'useSess', 'volFilter'].indexOf(x[0]) >= 0; }).map(fieldHtml).join('') + '</div>';
    h += '<div class="card"><b>📰 নিউজ-বিরতি (এই সময়ে নতুন সিগন্যাল আসবে না)</b><div class="muted" style="font-size:12px;margin:4px 0 8px">বড় নিউজের (CPI, NFP, FOMC) সময় নিজে যোগ করো। সিস্টেম নিউজ নিজে জানে না।</div><div id="nw-list">' + newsHtml() + '</div><div class="fgrid"><label class="field"><span>শুরু</span><input type="datetime-local" id="nw-a"></label><label class="field"><span>শেষ</span><input type="datetime-local" id="nw-b"></label></div><div class="btnrow"><button class="btn" id="nw-add">বিরতি যোগ করো</button></div></div>';
    h += '<details class="fold"><summary>🔧 উন্নত সেটিংস</summary><div class="fbody" id="ul-cfg">' + advHtml() + '<div class="btnrow"><button class="btn" id="ul-reset">সব ডিফল্টে ফেরাও</button></div></div></details>';
    return h;
  }
  function advHtml() {
    var grid = '', rows = '';
    FIELDS.forEach(function (fd) {
      if (['balance', 'riskPct', 'useSess', 'volFilter'].indexOf(fd[0]) >= 0) return;
      if (!fieldApplies(fd[0])) return;
      if (fd[1] === 'bool') rows += fieldHtml(fd); else grid += fieldHtml(fd);
    });
    var note = cfg.strategy === 'raid' ? 'Raid ইঞ্জিনে SL সুইপের চূড়ায় আর TP উল্টো দিকের লিকুইডিটিতে বসে, তাই বাফার/TP-র R-এর ঘর এখানে নেই। কড়াকড়ি ঠিক হয় সিগন্যাল মোড (SAFE/SMART/AGGRESSIVE) থেকে।' : 'এখানে শুধু এই স্ট্র্যাটেজিতে কাজ করে এমন ঘরগুলোই দেখানো হচ্ছে। স্কোর, বিরতি ও ফিল্টারের কড়াকড়ি ঠিক হয় সিগন্যাল মোড থেকে।';
    return '<div class="note-info">' + note + '</div><div class="fgrid">' + grid + '</div>' + rows;
  }

  /* ---------- ট্যাব ৪: শেখো ---------- */
  function learnHtml() {
    var h = '<div class="card"><b>সিগন্যাল কীভাবে পড়বে (৫ ধাপ)</b><ol class="why-ol"><li>প্রথমে <b>বাজারের অবস্থা</b> দেখো। অস্থির হলে ট্রেড নয়।</li><li><b>গ্রেড ও স্কোর</b> দেখো। নতুন হলে A বা A+ ছাড়া ট্রেড নিও না।</li><li><b>"কেন এই সিগন্যাল"</b> পড়ো। কারণ না বুঝলে ট্রেড নিও না।</li><li><b>SL ও লট</b> দেখো। SL-এ কত ডলার যাবে, সেটা সহ্য করতে পারলে তবেই।</li><li>প্রথমে <b>ডেমো/পেপার</b>। পুরো কোর্স ও প্রতিদিনের টাস্ক টাস্ক ট্যাবে।</li></ol></div>';
    h += '<div class="card"><b>শব্দের মানে (চাপ দিলে খুলবে)</b><div class="lgrid">' + Object.keys(R.help ? R.help.TERMS : {}).map(function (k) { return '<button type="button" class="ihelp lrow" data-h="' + k + '">' + esc(R.help.TERMS[k][0]) + '</button>'; }).join('') + '</div></div>';
    return h;
  }

  /* ---------- অটো-সেটআপ ---------- */
  var lastOpt = null, optBusy = false;
  async function runOpt() {
    if (R.analytics && R.analytics.setSplit) R.analytics.setSplit(cfg.tp1Pct, cfg.tp2Pct, cfg.tp3Pct);
    if (optBusy) return;
    optBusy = true; var sym = cur.sym, sec = cur.sec, key = optKey();
    function put(html) { optHtml = html; var o = $('ul-optres'); if (o && TAB === 'perf') o.innerHTML = html; }
    try {
      put('<div class="note-info">ইতিহাস লোড হচ্ছে…</div>');
      var all = R.chart.candles().slice(0, -1), pages = 0;
      while (pages < 4 && all.length) {
        var more = await R.data.klines(sym, R.TFS.filter(function (t) { return t.sec === sec; })[0].id, 1000, all[0].time * 1000 - 1).catch(function () { return []; });
        more = more.filter(function (c) { return c.time < all[0].time; });
        if (!more.length) break; all = more.concat(all); pages++;
      }
      if (all.length < 600) { put('<div class="note-warn">ক্যান্ডেল মাত্র ' + all.length + 'টি পাওয়া গেছে, ভালো যাচাইয়ের জন্য কমপক্ষে ৬০০ দরকার।</div>'); optBusy = false; return; }
      var h = htfStore[sym] || { h4: null, h1: null, d: null }, mode = cfg.htfMode;
      if (!h.h4 && !h.h1 && sec < 14400) mode = 'Off';
      var res = await R.opt.search(all, h, cfg, marketInfo(sym), sec, mode, function (p) { put('<div class="note-info">খোঁজা হচ্ছে… ' + Math.round(p * 100) + '%</div>'); });
      lastOpt = res;
      var f1 = function (x) { return x.toFixed(0) + '%'; };
      var html = '<div class="note-info">' + res.bars + ' ক্যান্ডেল · ' + res.tested + 'টি সেটিং পরীক্ষা · ট্রেনিংয়ে টিকেছে ' + res.passedTrain + 'টি</div>';
      if (!res.top.length) html += '<div class="note-warn">এই মার্কেট/টাইমফ্রেমে এমন কোনো সেটিং পাওয়া যায়নি যা লাভজনক ছিল। এখানে ট্রেড না করাই ভালো, অন্য টাইমফ্রেম বা মার্কেট দেখো।</div>';
      res.top.forEach(function (r, i) {
        html += '<div class="card"><b>' + esc(r.label) + '</b>' +
          kv('ট্রেনিং', r.train.n + ' ট্রেড · TP3 ' + f1(r.train.hit3) + ' · SL ' + f1(r.train.n ? r.train.sl / r.train.n * 100 : 0) + ' · ' + r.train.exp.toFixed(2) + 'R') +
          kv('টেস্ট (অদেখা)', r.test.n + ' ট্রেড · TP3 ' + f1(r.test.hit3) + ' · SL ' + f1(r.test.n ? r.test.sl / r.test.n * 100 : 0) + ' · ' + r.test.exp.toFixed(2) + 'R', r.reliable ? 'up' : 'dn') +
          (r.reliable ? '' : '<div class="note-warn">টেস্টে টেকেনি বা ট্রেড খুব কম, নির্ভরযোগ্য নয়।</div>') +
          '<div class="btnrow"><button class="btn" data-apply="' + i + '">এটা বসাও</button></div></div>';
      });
      html += '<div class="note-info">অনেক সেটিং থেকে সেরাটা বাছলে ভাগ্যের প্রভাব থাকে, তাই টেস্টের সংখ্যাই আসল। কোনো সেটিং ভবিষ্যতের গ্যারান্টি দেয় না। ডেমোতে যাচাই না করে আসল টাকায় ট্রেড কোরো না।</div>';
      if (cur.sym === sym && cur.sec === sec) put(html);
    } catch (e) { put('<div class="note-warn">ত্রুটি: ' + esc(e.message) + '</div>'); }
    optBusy = false;
  }

  /* ---------- ১২ ইঞ্জিনের বিস্তারিত ফলাফল ----------
     প্রতিটি ইঞ্জিন আলাদা করে (বর্তমান মোড ও এন্ট্রি ধরনে) পুরো লোড-করা ইতিহাসে চালিয়ে ট্রেড গোনা হয়:
     সিগন্যাল, এন্ট্রি, মিস, চলমান, TP1/TP2/TP3, SL, ব্রেক-ইভেন, জয়/লস। সব সংখ্যা ট্রেডের আসল স্ট্যাটাস থেকে গোনা। */
  var cmpHtml = '', cmpBusy = false;
  var cmpStore = lsGet('rtx_cmp_store', {});
  function fmtR(x) { return (x >= 0 ? '+' : '') + x.toFixed(2); }
  function pctOf(a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; }
  function cmpTable(rows, selK) {
    var h = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table class="rtab"><thead><tr><th>ইঞ্জিন</th><th>সিগন্যাল</th><th>এন্ট্রি</th><th>মিস</th><th>চলমান</th><th>TP1</th><th>TP2</th><th>TP3 ✅</th><th>BE</th><th>TO</th><th>SL ❌</th><th>TP3%</th><th>R/ট্রেড</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var b = r.b, cls = b.closed >= 10 && b.expAll > 0 ? 'up' : b.closed && b.expAll < 0 ? 'dn' : '';
      h += '<tr' + (selK === r.k ? ' class="sel"' : '') + '><td>' + (selK === r.k ? '✅ ' : '') + esc(r.short) + '</td><td>' + b.signals + '</td><td>' + b.entered + '</td><td>' + b.missed + '</td><td>' + b.open + '</td><td>' + b.tp1 + '</td><td>' + b.tp2 + '</td><td><b>' + b.tp3 + '</b></td><td>' + b.be + '</td><td>' + b.expired + '</td><td><b>' + b.sl + '</b></td><td>' + pctOf(b.tp3, b.closed) + '</td><td class="' + cls + '">' + (b.closed ? fmtR(b.expAll) : '—') + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }
  function cmpDetail(r, selK) {
    var b = r.b, d = R.strat.DEFS[r.k];
    var head = (selK === r.k ? '✅ ' : '') + esc(d.name) + ' — সিগন্যাল ' + b.signals + ' · শেষ ' + b.closed + ' · TP3 ' + b.tp3 + ' · SL ' + b.sl;
    var body = '';
    if (!b.signals) body = '<div class="note-info">এই ইতিহাসে এই ইঞ্জিন কোনো সিগন্যাল দেয়নি (বা সব ফিল্টারে আটকেছে)।</div>';
    else {
      body += kv('মোট সিগন্যাল', b.signals + ' (BUY ' + b.buy + ' · SELL ' + b.sell + ')');
      body += kv('এন্ট্রি ধরেছে', b.entered + ' · মিস (লিমিটে দাম ফেরেনি) ' + b.missed + ' · নতুন সিগন্যালে বাতিল ' + b.replaced + ' · লিমিটের অপেক্ষায় ' + b.pending);
      body += kv('এখনো চলছে', b.open + (b.openTp1 ? ' (এর মধ্যে ' + b.openTp1 + 'টি TP1 ছুঁয়েছে)' : ''));
      body += kv('শেষ হয়েছে', b.closed + 'টি = TP3 ' + b.tp3 + ' + BE ' + b.be + ' + SL ' + b.sl + (b.expired ? ' + সময়শেষ ' + b.expired : ''));
      if (b.expired) body += kv('সময়শেষে বন্ধ (' + (cfg.maxHoldH > 0 ? cfg.maxHoldH : 6) + ' ঘণ্টার বেশি খোলা ছিল)', b.expired + 'টি, ক্লোজ দামে ধরা');
      body += kv('TP1 ছুঁয়েছে', b.tp1 + ' / ' + b.closed + ' (' + pctOf(b.tp1, b.closed) + ')');
      body += kv('TP2 ছুঁয়েছে', b.tp2 + ' / ' + b.closed + ' (' + pctOf(b.tp2, b.closed) + ')');
      body += kv('TP3 ছুঁয়েছে (পুরো জয়)', b.tp3 + ' / ' + b.closed + ' (' + pctOf(b.tp3, b.closed) + ')', 'up');
      body += kv('ব্রেক-ইভেন (TP1 ছুঁয়ে এন্ট্রিতে ফিরে বেরোল)', b.be + ' (' + pctOf(b.be, b.closed) + ')');
      body += kv('SL খেয়েছে (লস)', b.sl + ' (' + pctOf(b.sl, b.closed) + ')' + (b.slAfterTp1 ? ' · এর মধ্যে ' + b.slAfterTp1 + 'টি TP1 ছোঁয়ার পরে' : ''), b.sl ? 'dn' : '');
      if (b.closed) {
        body += kv('গড় ফল/ট্রেড: TP3-তে পুরো বন্ধ (এখনকার নিয়ম)', fmtR(b.expAll) + 'R · মোট ' + fmtR(b.totalR) + 'R', b.expAll > 0 ? 'up' : 'dn');
        body += kv('যদি পুরোটা TP1-এ বন্ধ করা হতো', fmtR(b.expTp1) + 'R', b.expTp1 > 0 ? 'up' : 'dn');
        body += kv('যদি পুরোটা TP2-তে বন্ধ করা হতো', fmtR(b.expTp2) + 'R', b.expTp2 > 0 ? 'up' : 'dn');
        body += kv('শেষ ৩৫% ক্যান্ডেলে (অদেখা অংশ)', r.tn + ' ট্রেড' + (r.tn ? ' · ' + fmtR(r.texp) + 'R' : ''), r.tn && r.texp > 0 ? 'up' : r.tn ? 'dn' : '');
      }
    }
    var pick = selK === r.k ? '' : '<div class="btnrow" style="margin:6px 0 0"><button class="btn" data-pick="' + r.k + '">এটা বাছো</button></div>';
    return '<details class="fold"><summary>' + head + '</summary><div class="fbody">' + body + pick + '</div></details>';
  }
  function cmpAggregate(mk) {
    var keys = Object.keys(cmpStore).filter(function (k) { return cmpStore[k].mk === mk; });
    if (keys.length < 2) return '';
    var rows = R.strat.ORDER.map(function (k) {
      var list = keys.map(function (kk) { return cmpStore[kk].rows[k]; }).filter(Boolean);
      return { k: k, short: R.strat.DEFS[k].short, b: R.analytics.addBreakdown(list), tn: 0, texp: 0 };
    });
    var names = keys.map(function (kk) { return esc(cmpStore[kk].label); }).join(', ');
    return '<div class="card"><b>📊 সব মার্কেট মিলিয়ে (সংরক্ষিত রান)</b><div class="muted" style="font-size:12px;margin:4px 0 8px">এই মোড ও এন্ট্রি ধরনে যেসব মার্কেট/টাইমফ্রেমে "তুলনা করো" চালানো হয়েছে সেগুলোর যোগফল: ' + names + '। আরও মার্কেটে চালালে এখানে যোগ হবে।</div>' + cmpTable(rows, cfg.strategy) + '<div class="btnrow"><button class="btn" id="ul-cmpclr">সংরক্ষিত রান মুছো</button></div></div>';
  }
  async function runCompare() {
    if (R.analytics && R.analytics.setSplit) R.analytics.setSplit(cfg.tp1Pct, cfg.tp2Pct, cfg.tp3Pct);
    if (cmpBusy || !R.strat) return;
    if (!R.analytics || !R.analytics.breakdown || !R.trade || !R.trade.expire) {   // কিছু ফাইল পুরোনো থেকে গেছে
      var oo = $('ul-cmpres'); cmpHtml = '<div class="note-warn">কিছু ফাইল পুরোনো ভার্সনে আছে। GitHub-এ <b>js/analytics.js</b>, <b>js/trade.js</b>, <b>js/ultra.js</b>, <b>js/strat.js</b>, <b>js/raid.js</b>, <b>js/power.js</b> — সবগুলো নতুন ফাইল দিয়ে বদলাও, Render-এ ডিপ্লয় শেষ হলে সাইট রিফ্রেশ করো।</div>'; if (oo) oo.innerHTML = cmpHtml; return;
    }
    cmpBusy = true; var sym = cur.sym, sec = cur.sec;
    function put(html) { cmpHtml = html; var o = $('ul-cmpres'); if (o && TAB === 'perf') o.innerHTML = html; }
    try {
      var all = R.chart.candles().slice(0, -1), pages = 0, tfo = R.TFS.filter(function (t) { return t.sec === sec; })[0];
      if (all.length < 100) { put('<div class="note-warn">তুলনার জন্য কমপক্ষে ১০০ ক্যান্ডেল লাগে (এখন ' + all.length + ')।</div>'); cmpBusy = false; return; }
      put('<div class="note-info">পুরোনো ইতিহাস লোড হচ্ছে…</div>');
      while (pages < 5 && tfo && all.length) {
        var more = await R.data.klines(sym, tfo.id, 1000, all[0].time * 1000 - 1).catch(function () { return []; });
        more = more.filter(function (c) { return c.time < all[0].time; });
        if (!more.length) break; all = more.concat(all); pages++;
      }
      if (cur.sym !== sym || cur.sec !== sec) { cmpBusy = false; return; }
      var cs = all, ec = effCfg(), info = marketInfo(sym), h = htfStore[sym] || { h4: null, h1: null, d: null }, mode = cfg.htfMode;
      if (!h.h4 && !h.h1 && sec < 14400) mode = 'Off';
      var base = engine(cs, h, Object.assign({}, ec, { enSweep: true, enCrt: true, enWyck: true, enQm: true, enFib: true, perEngine: true }), info, sec, mode);
      var split = Math.floor(cs.length * 0.65), rows = [], q;
      for (q = 0; q < R.strat.ORDER.length; q++) {
        var k = R.strat.ORDER[q];
        put('<div class="note-info">চলছে… ' + (q + 1) + '/' + R.strat.ORDER.length + ' (' + esc(R.strat.DEFS[k].name) + ')</div>');
        await new Promise(function (r) { setTimeout(r, 0); });
        var c2 = Object.assign({}, ec, { strategy: k, engine: k === 'raid' ? 'raid' : 'strat', power: true, noBoard: true, ov: {} });
        var res = R.power.run(cs, base, c2, info, sec, mode), te = R.opt.stats(res.trades, split, cs.length);
        rows.push({ k: k, short: R.strat.DEFS[k].short, b: R.analytics.breakdown(res.trades), tn: te.n, texp: te.exp });
      }
      var mk = (ec.mode || 'smart') + '|' + (ec.entryMode === 'fast' ? 'fast' : 'retest'), tfLabel = tfo ? tfo.label || tfo.id : String(sec);
      var store = {}; rows.forEach(function (r) { store[r.k] = r.b; });
      cmpStore[sym + '|' + sec + '|' + mk] = { mk: mk, label: sym + ' ' + tfLabel, ts: Date.now(), bars: cs.length, rows: store };
      lsSet('rtx_cmp_store', cmpStore);
      var days = cs.length > 1 ? Math.max(1, Math.round((cs[cs.length - 1].time - cs[0].time) / 86400)) : 0;
      var html = '<div class="note-info"><b>' + esc(sym) + ' ' + esc(tfLabel) + '</b> · ' + cs.length + ' ক্যান্ডেল (প্রায় ' + days + ' দিন) · মোড ' + esc((ec.mode || 'smart').toUpperCase()) + ' · ' + (ec.entryMode === 'fast' ? 'দ্রুত' : 'রিটেস্ট') + ' এন্ট্রি</div>';
      html += cmpTable(rows, cfg.strategy);
      html += '<div class="note-info">কীভাবে পড়বে: <b>সিগন্যাল</b> = মোট তৈরি হওয়া; <b>এন্ট্রি</b> = আসলে ঢুকেছে; <b>মিস</b> = রিটেস্ট লিমিটে দাম ফেরেনি (লস নয়); <b>চলমান</b> = এখনো শেষ হয়নি। <b>TP1/TP2</b> = শেষ হওয়া ট্রেডের মধ্যে কতটি অন্তত ওই টার্গেট ছুঁয়েছে (জমা গোনা, তাই TP1 ≥ TP2 ≥ TP3)। <b>TP3 ✅</b> = পুরো জয়। <b>BE</b> = TP1 ছুঁয়ে এন্ট্রিতে ফিরে বেরিয়েছে (লাভ-লস ০)। <b>SL ❌</b> = লস। শেষ হওয়া = TP3 + BE + SL + সময়শেষ (<b>TO</b> কলাম: বেশিক্ষণ খোলা থাকায় ক্লোজ দামে বন্ধ)। <b>R/ট্রেড</b> = গড় ফল (SL = −১R)। ইঞ্জিনের নামে চাপলে পুরো হিসাব খুলবে।</div>';
      rows.forEach(function (r) { html += cmpDetail(r, cfg.strategy); });
      html += '<div class="note-info">এটা শুধু এই চার্টে লোড হওয়া ' + cs.length + ' ক্যান্ডেলের পুরোনো হিসাব, ভবিষ্যতের গ্যারান্টি নয়। ট্রেড ৩০-এর কম হলে ফলাফল ভাগ্যও হতে পারে। একটাই মার্কেটে নয়, ৫টা মার্কেটেই চালিয়ে নিচের যোগফল দেখো।</div>';
      html += cmpAggregate(mk);
      if (cur.sym === sym && cur.sec === sec) put(html);
    } catch (e) { put('<div class="note-warn">ত্রুটি: ' + esc(e.message) + '</div>'); }
    cmpBusy = false;
  }

  function setStrategy(k) {
    if (!R.strat || !R.strat.DEFS[k]) return;
    cfg.strategy = k; cfg.engine = k === 'raid' ? 'raid' : 'strat'; cfg.power = true; lsSet('rtx_ultra_cfg', cfg);
    aiHtml = ''; aiFor = ''; lastAlertKey = '';
    say('স্ট্র্যাটেজি: ' + R.strat.DEFS[k].name + ' (এখন শুধু এটাই সিগন্যাল দেবে)');
    sched(0, true);
  }

  function setMode(m) {
    cfg.mode = m; lsSet('rtx_ultra_cfg', cfg);
    if (optStore[optKey()]) { delete optStore[optKey()]; lsSet('rtx_ultra_opt', optStore); say('মোড বদলানোয় এই মার্কেটের অটো-সেটআপ বাদ দেওয়া হয়েছে'); }
    sched(0, true);
  }

  function closeSheet() { var s = $('ul-sheet'); if (s) s.remove(); }
  function renderSheet() {
    var tb = $('ul-tabs'), b = $('ul-body'); if (!tb || !b) return;
    tb.innerHTML = TABS.map(function (x) { return '<button class="utab' + (TAB === x[0] ? ' on' : '') + '" data-tab="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    b.innerHTML = TAB === 'sig' ? sigHtml() : TAB === 'perf' ? perfHtml() : setHtml();
    b.scrollTop = 0;
  }
  function openSheet() {
    closeSheet();
    var box = document.createElement('div'); box.id = 'ul-sheet';
    box.innerHTML = '<div class="sheet-body"><div class="sheet-h"><b>⚡ RTX সিগন্যাল</b><button id="ul-x">✕</button></div><div id="ul-tabs" class="utabs"></div><div id="ul-body"></div></div>';
    document.body.appendChild(box);
    renderSheet();
    box.addEventListener('click', function (e) {
      var t = e.target, id = t.id, d = t.dataset || {};
      if (t === box || id === 'ul-x') { closeSheet(); return; }
      if (d.tab) { setTab(d.tab); return; }
      if (d.mode) { setMode(d.mode); return; }
      if (id === 'ul-opt') { runOpt(); return; }
      if (id === 'ul-cmp') { runCompare(); return; }
      if (id === 'ul-cmpclr') { cmpStore = {}; lsSet('rtx_cmp_store', cmpStore); cmpHtml = '<div class="note-info">সংরক্ষিত রান মুছে গেছে।</div>'; var oo = $('ul-cmpres'); if (oo) oo.innerHTML = cmpHtml; return; }
      if (d.pick) { setStrategy(d.pick); renderSheet(); return; }
      if (id === 'ul-optoff') { delete optStore[optKey()]; lsSet('rtx_ultra_opt', optStore); optHtml = '<div class="note-info">এই মার্কেটের অটো-সেটআপ মুছে গেছে।</div>'; sched(0, true); renderSheet(); return; }
      if (d.apply !== undefined) { var r = lastOpt && lastOpt.top[+d.apply]; if (r) { optStore[optKey()] = r.cfg; lsSet('rtx_ultra_opt', optStore); say('অটো-সেটআপ বসানো হয়েছে'); sched(0, true); } return; }
      if (id === 'nw-add') {
        var a = Date.parse($('nw-a').value) / 1000, b2 = Date.parse($('nw-b').value) / 1000;
        if (!isFinite(a) || !isFinite(b2) || b2 <= a) { say('শুরু ও শেষের সময় ঠিকমতো দাও (শেষ > শুরু)'); return; }
        cfg.newsBlocks = (cfg.newsBlocks || []).concat([[a, b2]]); lsSet('rtx_ultra_cfg', cfg); $('nw-list').innerHTML = newsHtml(); sched(0, true); return;
      }
      if (d.nwdel !== undefined) { cfg.newsBlocks = (cfg.newsBlocks || []).filter(function (_, i) { return i !== +d.nwdel; }); lsSet('rtx_ultra_cfg', cfg); $('nw-list').innerHTML = newsHtml(); sched(0, true); return; }
      if (id === 'ul-reset') { cfg = Object.assign({}, DEF); lsSet('rtx_ultra_cfg', cfg); renderSheet(); sched(0, true); }
    });
    box.addEventListener('change', function (e) {
      var t = e.target, d = t.dataset || {};
      if (t.id === 'ul-on') { cfg.on = t.checked; lsSet('rtx_ultra_cfg', cfg); sched(0, true); return; }
      if (d.sk) {
        var sv = parseFloat(t.value); if (!isFinite(sv) || sv <= 0) { t.value = R.trade.specFor(marketInfo(cur.sym), cfg)[d.sk]; return; }
        cfg.specs = cfg.specs || {}; cfg.specs[cur.sym] = Object.assign({}, cfg.specs[cur.sym] || {}); cfg.specs[cur.sym][d.sk] = sv;
        lsSet('rtx_ultra_cfg', cfg); var pv = $('set-prev'); if (pv) pv.innerHTML = previewHtml(); sched(0, true); return;
      }
      var key = d.k; if (!key) return;
      if (key === 'strategy') { setStrategy(t.value); renderSheet(); return; }
      var fd = ALLF.filter(function (x) { return x[0] === key; })[0]; if (!fd) return;
      if (key === 'mode') { setMode(t.value); var pv2 = $('set-prev'); if (pv2) pv2.innerHTML = previewHtml(); return; }
      if (fd[1] === 'bool') cfg[key] = t.checked;
      else if (fd[1] === 'select') cfg[key] = t.value;
      else {
        var v = parseFloat(t.value);
        if (!isFinite(v)) v = DEF[key];
        v = Math.min(fd[4], Math.max(fd[3], v));
        if (key === 'lot') v = Math.round(v * 100) / 100;
        if (key === 'swingLen' || key === 'cooldown' || key === 'maxHist' || key === 'sweepWin' || key === 'qmMaxAge' || key === 'fibMaxAge' || key === 'minScore') v = Math.round(v);
        cfg[key] = v; t.value = v;
      }
      lsSet('rtx_ultra_cfg', cfg);
      var pv3 = $('set-prev'); if (pv3) pv3.innerHTML = previewHtml();
      sched(0, true);
    });
  }

  if (btn) {
    btn.onclick = openSheet;
    var nav = $('bottomnav');
    if (nav) nav.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { btn.hidden = b.dataset.view !== 'chart'; closeSheet(); } });
  }

  /* ---------- চার্টের ডেটা বদলালে হিসাব আবার ---------- */
  var fs = R.chart.setData, fp = R.chart.prepend, fu = R.chart.update;
  R.chart.setData = function (arr, sec, key) {
    var r = fs.apply(this, arguments);
    cur.sym = key; cur.sec = sec; lastN = R.chart.candles().length;
    sched(0); loadHtf(key);
    return r;
  };
  R.chart.prepend = function () {
    var r = fp.apply(this, arguments);
    lastN = R.chart.candles().length; sched(120, true);
    return r;
  };
  R.chart.update = function () {
    var r = fu.apply(this, arguments);
    var n = R.chart.candles().length;
    if (n !== lastN) { lastN = n; sched(0); }
    return r;
  };
  paint();
})(window.RTX);
