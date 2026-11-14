// ফাইলের নাম: ultra.js
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
    swingLen: 3, sweepWin: 6, wyMaxAtr: 10, qmMaxAge: 40, fibMinAtr: 2.5, fibMaxAge: 60,
    slBuf: 0.25, slMinAtr: 0.6, slMaxAtr: 3, tp1R: 1, tp2R: 2, tp3R: 3,
    balance: 1000, riskPct: 1, useSess: true, volFilter: true, volLow: 0.5, volHigh: 3,
    showHist: true, maxHist: 10,
    power: true, gUltra: true, gXl: true, gUt: true, gJdt: true, pwVotes: 2, pwWin: 3, pwMinScore: 70, pwHtf: true, autoOpt: true,
    xOC: true, xBrk: true, xDon: true, xMA: true, xST: true, xAr: true,
    mode: 'smart', engine: 'raid', entryMode: 'retest', maxRiskPct: 10, lotMode: 'fixed', lot: 0.01, costOn: true, specs: {}, newsBlocks: []
  };
  var ENG = ['Sweep Reclaim', 'CRT + TBS', 'Wyckoff + ICT', 'QM + SMC', 'Price Action + Fib'];
  var SHORT = { 'Sweep Reclaim': 'Sweep', 'CRT + TBS': 'CRT', 'Wyckoff + ICT': 'Wyckoff', 'QM + SMC': 'QM', 'Price Action + Fib': 'Fib' };
  var STAT = { 0: 'PENDING', 8: 'MISSED', 1: 'ACTIVE', 2: 'TP1 HIT', 3: 'TP2 HIT', 4: 'TP3 HIT', 5: 'SL HIT', 6: 'BREAK-EVEN', 7: 'REPLACED' };
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
  function sessOf(t, tfSec, info, cfg) {
    var raw, name;
    if (tfSec >= 86400) { raw = true; name = 'n/a (D/W)'; return { ok: true, name: name }; }
    var m = Math.floor((t % 86400) / 60);
    var lon = m >= 420 && m < 960, ny = m >= 750 && m < 1260, tok = m >= 0 && m < 540;
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
      var bullSw = cfg.enSweep && swBullBar !== null && i > swBullBar && C[i] > swBullLvl && C[i] > O[i] && C[i] > H[i - 1];
      var bearSw = cfg.enSweep && swBearBar !== null && i > swBearBar && C[i] < swBearLvl && C[i] < O[i] && C[i] < L[i - 1];
      var lvB1 = bullSw ? swBullExt : null, lvS1 = bearSw ? swBearExt : null;

      // ইঞ্জিন ২: CRT + TBS
      var crtIdx = -1;
      for (k = 3; k <= 20; k++) { if (i - k < 0) break; if (crtIdx === -1 && (H[i - k] - L[i - k]) > 1.8 * a) crtIdx = k; }
      var crtH = crtIdx > 0 ? H[i - crtIdx] : null, crtL = crtIdx > 0 ? L[i - crtIdx] : null;
      var bullCrt = cfg.enCrt && crtIdx > 0 && L[i - 1] < crtL && L[i - 1] <= L[i - 2] && C[i] > Math.max(O[i - 1], C[i - 1]) && C[i] > crtL && C[i] < crtH && C[i] > O[i];
      var bearCrt = cfg.enCrt && crtIdx > 0 && H[i - 1] > crtH && H[i - 1] >= H[i - 2] && C[i] < Math.min(O[i - 1], C[i - 1]) && C[i] < crtH && C[i] > crtL && C[i] < O[i];
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
      var bullWy = cfg.enWyck && wyRange && spL !== null && C[i] > O[i] && C[i] > H[i - 1] && C[i] > wyL && C[i] < wyH;
      var bearWy = cfg.enWyck && wyRange && spH !== null && C[i] < O[i] && C[i] < L[i - 1] && C[i] < wyH && C[i] > wyL;
      var lvB3 = bullWy ? Math.min(spL, wyL) : null, lvS3 = bearWy ? Math.max(spH, wyH) : null;

      // ইঞ্জিন ৪: Quasimodo + SMC
      var neckB = null;
      if (nn(phi3) && nn(pli1) && nn(pli3)) {
        if (phi3 > pli1 && phi3 < pli3) neckB = ph3;
        else if (nn(phi2) && phi2 > pli1 && phi2 < pli3) neckB = ph2;
        else if (nn(phi1) && phi1 > pli1 && phi1 < pli3) neckB = ph1;
      }
      var neckS = null;
      if (nn(pli3) && nn(phi1) && nn(phi3)) {
        if (pli3 > phi1 && pli3 < phi3) neckS = pl3;
        else if (nn(pli2) && pli2 > phi1 && pli2 < phi3) neckS = pl2;
        else if (nn(pli1) && pli1 > phi1 && pli1 < phi3) neckS = pl1;
      }
      var qmBull = nn(pl1) && nn(pl2) && nn(pl3) && nn(pli3) && pl2 < pl1 && pl3 > pl2 && (i - pli3) <= cfg.qmMaxAge;
      var qmBear = nn(ph1) && nn(ph2) && nn(ph3) && nn(phi3) && ph2 > ph1 && ph3 < ph2 && (i - phi3) <= cfg.qmMaxAge;
      var bullQm = cfg.enQm && qmBull && nn(neckB) && C[i] > neckB && C[i - 1] <= neckB && C[i] > O[i];
      var bearQm = cfg.enQm && qmBear && nn(neckS) && C[i] < neckS && C[i - 1] >= neckS && C[i] < O[i];
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
      for (k = 0; k < 5; k++) { if (bF[k]) bullCnt++; if (sF[k]) bearCnt++; }
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
      swBullBar = null; swBullLvl = null; swBullExt = null; swBearBar = null; swBearLvl = null; swBearExt = null;
    }

    var li = n - 1, last = n ? sessOf(T[li], tfSec, info, cfg) : { ok: false, name: '-' };
    return {
      trades: trades, closed: n,
      arr: { atr: atr, atrAvg: atrAvg, h4: h4, h1: h1, ct: ct, rawDir: rawDir, rawLvl: rawLvl, rawEng: rawEng },
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

  var FIELDS = [
    ['power', 'bool', '🔥 POWER কনসেনসাস (সব স্ট্র্যাটেজির ভোট)'], ['gUltra', 'bool', 'ভোটার: ULTRA (৫ ইঞ্জিন)'], ['gXl', 'bool', 'ভোটার: XL (OC/Breakout/Donchian/MA/Supertrend/Aroon)'],
    ['xOC', 'bool', 'XL এর ভেতরে: OC'], ['xBrk', 'bool', 'XL এর ভেতরে: Breakout'], ['xDon', 'bool', 'XL এর ভেতরে: Donchian'], ['xMA', 'bool', 'XL এর ভেতরে: MA Cross'], ['xST', 'bool', 'XL এর ভেতরে: Supertrend'], ['xAr', 'bool', 'XL এর ভেতরে: Aroon'],
    ['gUt', 'bool', 'ভোটার: UT Bot (Luxy)'], ['gJdt', 'bool', 'ভোটার: JDT Supertrend'],
    ['pwVotes', 'num', 'সর্বনিম্ন কয়টি গ্রুপ একমত হতে হবে (১-৪)', 1, 4], ['pwWin', 'num', 'ভোটের জানালা (বার)', 1, 10], ['pwMinScore', 'num', 'POWER ন্যূনতম স্কোর', 30, 100], ['pwHtf', 'bool', 'POWER: HTF উল্টো হলে বাদ'],
    ['htfMode', 'select', 'HTF ফিল্টার (4H + 1H)', ['Strict', 'Normal', 'Off']],
    ['minScore', 'num', 'ন্যূনতম স্কোর', 30, 100], ['cooldown', 'num', 'সিগন্যালের পর বিরতি (বার)', 0, 200],
    ['oneTrade', 'bool', 'একসাথে একটাই লাইভ ট্রেড'], ['beOn', 'bool', 'TP1 এর পর SL ব্রেক-ইভেনে'],
    ['enSweep', 'bool', 'ইঞ্জিন: Sweep Reclaim'], ['enCrt', 'bool', 'ইঞ্জিন: CRT + TBS'], ['enWyck', 'bool', 'ইঞ্জিন: Wyckoff + ICT'],
    ['enQm', 'bool', 'ইঞ্জিন: QM + SMC'], ['enFib', 'bool', 'ইঞ্জিন: Price Action + Fib'],
    ['swingLen', 'num', 'সুইং দৈর্ঘ্য', 1, 10], ['sweepWin', 'num', 'Sweep: কনফার্মেশনের সর্বোচ্চ বার', 2, 20],
    ['wyMaxAtr', 'num', 'Wyckoff: রেঞ্জের সর্বোচ্চ প্রস্থ (×ATR)', 2, 50], ['qmMaxAge', 'num', 'QM: শেষ সুইং থেকে সর্বোচ্চ বার', 10, 500],
    ['fibMinAtr', 'num', 'Fib: ন্যূনতম ইমপালস (×ATR)', 1, 50], ['fibMaxAge', 'num', 'Fib: ইমপালসের পর সর্বোচ্চ বার', 10, 500],
    ['slBuf', 'num', 'SL বাফার (×ATR)', 0, 5], ['slMinAtr', 'num', 'ন্যূনতম SL দূরত্ব (×ATR)', 0.1, 10], ['slMaxAtr', 'num', 'সর্বোচ্চ SL দূরত্ব (×ATR)', 0.5, 20],
    ['tp1R', 'num', 'TP1 (R)', 0.1, 20], ['tp2R', 'num', 'TP2 (R)', 0.1, 20], ['tp3R', 'num', 'TP3 (R)', 0.1, 50],
    ['balance', 'num', 'অ্যাকাউন্ট ব্যালেন্স ($)', 1, 100000000], ['riskPct', 'num', 'ঝুঁকি প্রতি ট্রেডে (%)', 0.1, 10],
    ['useSess', 'bool', 'সেশন ফিল্টার (ফরেক্স/সোনায়)'], ['volFilter', 'bool', 'ভোলাটিলিটি ফিল্টার'],
    ['volLow', 'num', 'ATR < গড় × এর কম হলে বাদ', 0.1, 5], ['volHigh', 'num', 'ATR > গড় × এর বেশি হলে বাদ', 1, 20],
    ['showHist', 'bool', 'পুরোনো ট্রেডও চার্টে দেখাও'], ['maxHist', 'num', 'সর্বোচ্চ কয়টি পুরোনো ট্রেড আঁকবে', 1, 40]
  ];

  var cfg = Object.assign({}, DEF, lsGet('rtx_ultra_cfg', {}));
  if (!lsGet('rtx_ultra_cfg', {}).entryMode) { cfg.engine = 'raid'; cfg.entryMode = 'retest'; cfg.maxRiskPct = 10; cfg.lotMode = 'fixed'; lsSet('rtx_ultra_cfg', cfg); try { localStorage.removeItem('rtx_ultra_opt'); } catch (_) {} }
  var optStore = lsGet('rtx_ultra_opt', {}), lastAlertKey = '';
  function optKey() { return cur.sym + '|' + cur.sec; }
  function effCfg() { var o = cfg.autoOpt && optStore[optKey()]; if (o && o.engine && o.engine !== cfg.engine) o = null; return o ? Object.assign({}, cfg, o) : cfg; }
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

  function recompute(silent) {
    var info = marketInfo(cur.sym), ec = effCfg();
    if (!cfg.on) { R.chart.setMarkers([]); R.chart.setOverlay(null); state.res = null; state.warn = ''; paint(); return; }
    var all = R.chart.candles();
    if (all.length < 70) { state.res = null; R.chart.setMarkers([]); R.chart.setOverlay(null); paint(); return; }
    var h = htfStore[cur.sym] || { h4: null, h1: null, d: null }, mode = cfg.htfMode, warn = '';
    if (!h.h4 && !h.h1) { if (mode !== 'Off' && cur.sec < 14400) warn = 'HTF (4H/1H) ডেটা পাওয়া যায়নি, তাই এখন HTF ফিল্টার ছাড়াই চলছে।'; if (cur.sec < 14400) mode = 'Off'; }
    state.warn = warn;
    var res;
    try { res = engine(all.slice(0, all.length - 1), h, ec, info, cur.sec, mode); }
    catch (e) { say('ULTRA ত্রুটি: ' + e.message); return; }
    if (cfg.power && R.power) {
      try { res = R.power.run(all.slice(0, all.length - 1), res, ec, info, cur.sec, mode); }
      catch (e) { say('POWER ত্রুটি: ' + e.message); return; }
    }
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
  function EM() { return (cfg.engine === 'raid' && R.raid) ? R.raid : R.decision; }
  function whyHtml(t, info, mny) {
    var w = t.why, b = t.dir === 1, f = function (p) { return Number(p).toFixed(info.dec); };
    if (!w) return '<div class="note-info">পুরোনো (Classic) ইঞ্জিনের সিগন্যাল: ' + esc(t.mode) + (t.extra ? ' · ' + esc(t.extra) : '') + '। বিস্তারিত কারণ শুধু নতুন ইঞ্জিনে পাওয়া যায় (সেটিংস → উন্নত → ইঞ্জিন)।</div>';
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
    ls.push('<b>৮) অতিরিক্ত সমর্থন:</b> ' + (r.div ? 'RSI ডাইভারজেন্স আছে ✅' : 'RSI ডাইভারজেন্স নেই') + ' · ' + (r.pdOk ? (b ? 'ডিসকাউন্ট' : 'প্রিমিয়াম') + ' এলাকায় ✅' : 'প্রিমিয়াম/ডিসকাউন্ট মেলেনি') + ' · সেশন: ' + esc(r.session));
    ls.push('<b>স্কোর ' + w.score + '/১০০</b> (ন্যূনতম ' + w.minScore + '): সুইপ ' + P.sweep + '/' + M.sweep + ' · CISD ' + P.cisd + '/' + M.cisd + ' · বড় টাইমফ্রেম ' + P.htf + '/' + M.htf + ' · লাভ-ঝুঁকি ' + P.rr + '/' + M.rr + ' · প্রসঙ্গ ' + P.ctx + '/' + M.ctx + '। স্কোর শুধু কয়টা শর্ত মিলেছে তা বলে, জেতার সম্ভাবনা নয়।');
    ls.push('<b>ঝুঁকি:</b> ' + mny.lot.toFixed(2) + ' লটে SL ছুঁলে ক্ষতি ' + money(mny.risk) + (mny.pct !== null ? ' = ব্যালেন্স ' + money(mny.bal) + '-এর ' + mny.pct.toFixed(2) + '%' : '') + (w.risk.warn ? ' ⚠️ ৫%-এর বেশি' : '') + (w.costs.on ? '। স্প্রেড ' + w.costs.spread + ' ও স্লিপেজ ' + w.costs.slip + ' হিসাবে ধরা আছে' : ''));
    var g = w.gate.map(function (x) { return '<div class="gate ' + (x.ok ? 'ok' : 'no') + '">' + (x.ok ? '✅' : '❌') + ' ' + esc(x.label) + (x.note ? '<span>' + esc(x.note) + '</span>' : '') + '</div>'; }).join('');
    return '<div class="why"><div class="why-h">কেন এই সিগন্যাল এলো?</div><ol>' + ls.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol><details class="fold"><summary>৮টি শর্তের পরীক্ষা (সবগুলো ✅ হলেই সিগন্যাল)</summary><div class="fbody">' + g + '</div></details></div>';
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

    var D = EM(), mk = C.mode || 'smart';
    var al = now.alert;
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
        kv('ধরন', esc(t.mode) + (t.extra ? ' · ' + esc(t.extra) : '')) + kv(t.status === 0 ? 'লিমিট এন্ট্রি (দাম ফিরলে)' : 'এন্ট্রি', f(t.entry)) +
        kv('SL', f(t.slNow) + (t.beMoved ? ' (ব্রেক-ইভেন)' : ' (' + pip(t.entry - t.sl) + ' · ' + money(-mny.risk, true) + ')'), 'dn') +
        kv('TP1', f(t.tp1) + ' (' + pip(t.tp1 - t.entry) + ' · ' + money(mny.tp1, true) + ')', 'up') + kv('TP2', f(t.tp2) + ' (' + pip(t.tp2 - t.entry) + ' · ' + money(mny.tp2, true) + ')', 'up') + kv('TP3', f(t.tp3) + ' (' + pip(t.tp3 - t.entry) + ' · ' + money(mny.tp3, true) + ')', 'up') +
        kv('লট', mny.lot.toFixed(2)) + kv('SL-এ ক্ষতি', money(mny.risk) + (mny.pct !== null ? ' (ব্যালেন্সের ' + mny.pct.toFixed(2) + '%)' : ''), 'dn') + '</div>';
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
    h += '<div class="card verdict ' + v.level + '"><b>সহজ রায়</b><div>' + esc(v.text) + '</div></div>';
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
    h += '<div class="card"><b>🎯 অটো-সেটআপ</b><div class="muted" style="font-size:12px;margin:4px 0 8px">এই মার্কেট ও টাইমফ্রেমে ' + (R.opt ? R.opt.COMBOS : '') + 'টি সেটিং পরীক্ষা করে সেরাটা শেষ ৩৫% অদেখা ডেটায় যাচাই করে। কয়েক সেকেন্ড লাগে।</div><div class="btnrow"><button class="btn primary" id="ul-opt">খোঁজো</button><button class="btn" id="ul-optoff">অটো-সেটআপ মুছো</button></div><div id="ul-optres">' + optHtml + '</div></div>';
    h += '<div class="note-info">সব হিসাব শুধু এই চার্টে এখন যে ক্যান্ডেল লোড আছে তার। পুরোনো ফল ভবিষ্যতের গ্যারান্টি নয়। আসল টাকায় আগে ডেমোতে যাচাই করো।</div>';
    return h;
  }

  /* ---------- ট্যাব ৩: সেটিংস ---------- */
  var SFIELDS = [
    ['balance', 'num', 'অ্যাকাউন্ট ব্যালেন্স ($)', 1, 100000000],
    ['lotMode', 'select', 'লট কীভাবে ঠিক হবে', [['fixed', 'স্থির লট (আমি সবসময় একই লটে ট্রেড করি)'], ['risk', 'ঝুঁকি % থেকে হিসাব']]],
    ['lot', 'num', 'স্থির লট (যেমন 0.01)', 0.01, 100],
    ['riskPct', 'num', 'ঝুঁকি % (শুধু "ঝুঁকি %" মোডে)', 0.1, 10],
    ['entryMode', 'select', 'এন্ট্রির ধরন', [['retest', 'রিটেস্ট এন্ট্রি — দাম ফিরলে লিমিট (SL ছোট, কিছু ট্রেড মিস হয়)'], ['fast', 'দ্রুত এন্ট্রি — CISD বন্ধ হতেই (প্রায় সব ট্রেড ধরা পড়ে)']]],
    ['maxRiskPct', 'num', 'এক ট্রেডে সর্বোচ্চ ঝুঁকি (ব্যালেন্সের %)', 0.5, 50],
    ['mode', 'select', 'সিগন্যাল মোড', [['safe', 'SAFE — কম কিন্তু সেরা'], ['smart', 'SMART — ভারসাম্য'], ['aggressive', 'AGGRESSIVE — বেশি সিগন্যাল']]],
    ['costOn', 'bool', 'স্প্রেড ও স্লিপেজ খরচ হিসাবে ধরো'], ['useSess', 'bool', 'সেশন ফিল্টার (সোনায়)'], ['volFilter', 'bool', 'ভোলাটিলিটি ফিল্টার']
  ];
  var ALLF = [];
  function rebuildAllF() { ALLF = SFIELDS.concat(FIELDS.filter(function (x) { return ['balance', 'riskPct', 'useSess', 'volFilter'].indexOf(x[0]) < 0; })); }
  rebuildAllF();
  FIELDS.push(['engine', 'select', 'ইঞ্জিন', [['raid', 'লিকুইডিটি রেইড (সুইপ + CISD) — প্রস্তাবিত'], ['decision', 'আগের নতুন (স্কোর ভিত্তিক)'], ['classic', 'পুরোনো (শুধু ভোট গণনা)']]]);
  rebuildAllF();

  function fieldHtml(fd, grid) {
    var key = fd[0], type = fd[1], label = fd[2];
    if (type === 'bool') return '<div class="row"><label><input type="checkbox" data-k="' + key + '"' + (cfg[key] ? ' checked' : '') + '><span>' + label + '</span></label></div>';
    if (type === 'select') return '<label class="field full"><span>' + label + '</span><select data-k="' + key + '">' + fd[3].map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + v + '"' + (cfg[key] === v ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></label>';
    return '<label class="field"><span>' + label + '</span><input type="number" inputmode="decimal" step="any" data-k="' + key + '" value="' + cfg[key] + '"></label>';
  }
  function previewHtml() {
    var info = marketInfo(cur.sym || 'XAUUSDT'), C = effCfg(), spec = R.trade.specFor(info, C), lot = C.lot > 0 ? C.lot : 0.01, mk = C.mode || 'smart';
    var M = C.engine === 'raid' ? { maxRiskPct: C.maxRiskPct > 0 ? C.maxRiskPct : 10 } : (R.decision ? Object.assign({}, R.decision.MODES[mk], C.ov || {}) : { maxRiskPct: 3 });
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
    h += '<div class="card"><b>💰 অ্যাকাউন্ট ও লট</b><div class="fgrid">' + SFIELDS.filter(function (x) { return ['balance', 'lot', 'riskPct', 'maxRiskPct'].indexOf(x[0]) >= 0; }).map(fieldHtml).join('') + '</div>' + SFIELDS.filter(function (x) { return ['lotMode', 'entryMode', 'mode'].indexOf(x[0]) >= 0; }).map(fieldHtml).join('') + '<div id="set-prev">' + previewHtml() + '</div></div>';
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
      if (fd[1] === 'bool') rows += fieldHtml(fd); else grid += fieldHtml(fd);
    });
    return '<div class="fgrid">' + grid + '</div>' + rows;
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
