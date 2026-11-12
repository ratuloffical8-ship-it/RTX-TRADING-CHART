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
    xOC: true, xBrk: true, xDon: true, xMA: true, xST: true, xAr: true
  };
  var ENG = ['Sweep Reclaim', 'CRT + TBS', 'Wyckoff + ICT', 'QM + SMC', 'Price Action + Fib'];
  var SHORT = { 'Sweep Reclaim': 'Sweep', 'CRT + TBS': 'CRT', 'Wyckoff + ICT': 'Wyckoff', 'QM + SMC': 'QM', 'Price Action + Fib': 'Fib' };
  var STAT = { 0: 'NONE', 1: 'ACTIVE', 2: 'TP1 HIT', 3: 'TP2 HIT', 4: 'TP3 HIT', 5: 'SL HIT', 6: 'BREAK-EVEN', 7: 'REPLACED' };
  var MINTICK = { BTCUSDT: 0.01, ETHUSDT: 0.01, BNBUSDT: 0.01, SOLUSDT: 0.01, XRPUSDT: 0.0001, DOGEUSDT: 0.00001, ADAUSDT: 0.0001, LTCUSDT: 0.01, XAUUSDT: 0.01, PAXGUSDT: 0.01 };

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  /* ================= বাজারের তথ্য (পিপ, কন্ট্রাক্ট) ================= */
  function marketInfo(sym) {
    sym = String(sym || '');
    var fx = sym.indexOf('/') > 0, parts = fx ? sym.split('/') : [sym.replace(/USDT$/, ''), sym.slice(-4) === 'USDT' ? 'USDT' : ''];
    var isXAU = sym.indexOf('XAU') >= 0, isBTC = sym.indexOf('BTC') >= 0, isJPY = sym.indexOf('JPY') >= 0;
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
    var rawDir = new Array(n).fill(0), rawLvl = new Array(n).fill(null);

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
      arr: { atr: atr, atrAvg: atrAvg, h4: h4, h1: h1, ct: ct, rawDir: rawDir, rawLvl: rawLvl },
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
  var optStore = lsGet('rtx_ultra_opt', {});
  function optKey() { return cur.sym + '|' + cur.sec; }
  function effCfg() { var o = cfg.autoOpt && optStore[optKey()]; return o ? Object.assign({}, cfg, o) : cfg; }
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
      return { time: t.time, position: b ? 'belowBar' : 'aboveBar', color: b ? '#2979ff' : '#ffffff', shape: b ? 'arrowUp' : 'arrowDown', text: (b ? 'BUY ' : 'SELL ') + (SHORT[t.mode] || 'P' + t.mode.split(' ')[1].split('/')[0]) + ' ' + t.score };
    }));
    R.chart.setOverlay(draw);

    var key = cur.sym + '|' + cur.sec;
    if (seenKey !== key || silent) { seenKey = key; res.trades.forEach(function (t) { seen[key + t.time] = 1; }); }
    else res.trades.forEach(function (t) {
      if (seen[key + t.time]) return;
      seen[key + t.time] = 1;
      if (t.bar >= res.closed - 2) {
        say('⚡ ' + (t.dir === 1 ? 'BUY' : 'SELL') + ' সিগন্যাল · ' + t.mode + ' · স্কোর ' + t.score);
        try { if (navigator.vibrate) navigator.vibrate(200); } catch (_) {}
      }
    });
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

  /* ---------- UI: সিগন্যাল বক্স ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#ul-sheet{position:fixed;inset:0;z-index:56;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center}' +
    '#btn-ultra.on{border-color:#2979ff;color:#2979ff}' +
    '.ul-big{font-size:16px;font-weight:700;padding:2px 0}';
  document.head.appendChild(css);

  var btn = $('btn-ultra');
  function paint() {
    if (btn) btn.classList.toggle('on', !!cfg.on);
    var d = $('ul-dash'); if (d) d.innerHTML = dashHtml();
  }
  function kv(k, v, cls) { return '<div class="kv"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>'; }
  function biasTxt(b) { return b === 1 ? '<b class="up">BULLISH</b>' : b === -1 ? '<b class="dn">BEARISH</b>' : '<b style="color:#8b8b8b">NEUTRAL</b>'; }

  function dashHtml() {
    if (!cfg.on) return '<div class="card muted">ULTRA বন্ধ আছে। চালু করতে উপরের বাক্সে টিক দাও।</div>';
    var res = state.res;
    if (!res) return '<div class="card muted">ডেটা লোড হচ্ছে বা ক্যান্ডেল কম (কমপক্ষে ৭০টি লাগে)।</div>';
    var info = state.info, now = res.now, t = res.trades[res.trades.length - 1], lc = R.chart.last(), C = state.cfg || cfg;
    var f = function (p) { return Number(p).toFixed(info.dec); }, pip = function (d) { return (Math.abs(d) / info.pip).toFixed(1) + 'p'; };
    var live = t && t.status >= 1 && t.status <= 3;
    var h = '';
    if (cfg.autoOpt && optStore[optKey()]) h += '<div class="note-info" style="margin:0 0 8px">🎯 এই মার্কেট/টাইমফ্রেমের অটো-সেটআপ চালু আছে (SL, TP, ভোট বদলানো)।</div>';
    if (state.warn) h += '<div class="note-warn" style="margin:0 0 8px">' + esc(state.warn) + '</div>';
    h += '<div class="card">' +
      kv('Symbol', esc(info.sym) + ' | ' + esc(info.name)) + kv('Market Price', lc ? f(lc.close) : '-') +
      kv('Pip Size', info.pip + (nn(now.atr) ? ' (ATR ' + (now.atr / info.pip).toFixed(1) + 'p)' : '')) +
      kv('Session', esc(now.sessName) + (now.sessOk ? ' (OK)' : ' (OFF)')) +
      '<div class="kv"><span>HTF 4H</span>' + biasTxt(now.h4) + '</div><div class="kv"><span>HTF 1H</span>' + biasTxt(now.h1) + '</div>' +
      '<div class="kv"><span>Chart Trend</span>' + biasTxt(now.trend) + '</div></div>';
    h += '<div class="card">' + kv('SIGNAL', !t ? 'NO SIGNAL (scanning)' : (t.dir === 1 ? 'BUY' : 'SELL') + (live ? ' - LIVE' : ' - ENDED'), !t ? '' : t.dir === 1 ? 'up' : 'dn');
    if (t) {
      h += kv('Mode', esc(t.mode)) + kv('Confluence', t.extra ? esc(t.extra) : 'none extra') + kv('Grade / Score', esc(t.grade) + ' / ' + t.score + '/100') +
        kv('Entry', f(t.entry)) + kv('SL', f(t.slNow) + (t.beMoved ? ' (BE)' : ' (' + pip(t.entry - t.sl) + ')'), 'dn') +
        kv('TP1', f(t.tp1) + ' (' + pip(t.tp1 - t.entry) + ')', 'up') + kv('TP2', f(t.tp2) + ' (' + pip(t.tp2 - t.entry) + ')', 'up') + kv('TP3', f(t.tp3) + ' (' + pip(t.tp3 - t.entry) + ')', 'up') +
        kv('RR (to TP3)', '1:' + C.tp3R) + kv('Lot (risk ' + C.riskPct + '%)', t.lot === null ? 'n/a' : t.lot.toFixed(2) + ' lot = $' + t.riskUsd.toFixed(2)) +
        kv('Status', STAT[t.status], live ? 'up' : '');
    }
    h += kv('Filters', (now.volOK ? 'Vol OK' : 'Vol OFF') + ' | HTF ' + C.htfMode + ' | Min ' + (C.power ? C.pwMinScore : C.minScore)) + '</div>';
    var tot = res.trades.length, tp1 = 0, sl = 0, be = 0, run = 0;
    res.trades.forEach(function (x) { if (x.tp1Hit) tp1++; if (x.status === 5) sl++; if (x.status === 6) be++; if (x.status >= 1 && x.status <= 3) run++; });
    h += '<div class="card">' + kv('লোড করা চার্টে মোট সিগন্যাল', String(tot)) + kv('TP1 ছুঁয়েছে', tp1 + ' / ' + tot) + kv('SL হিট', String(sl)) + kv('ব্রেক-ইভেন', String(be)) + kv('চলমান', String(run)) +
      '<div class="note-info">এটা শুধু এই চার্টে এখন যে ক্যান্ডেল লোড আছে তার হিসাব। ভবিষ্যতের ফলের গ্যারান্টি নয়।</div></div>';
    if (res.board) {
      h += '<div class="card"><b>📊 স্ট্র্যাটেজি স্কোরবোর্ড</b> <span class="muted">(SL 1.5×ATR, TP 2R, লোড করা ক্যান্ডেলে)</span>';
      res.board.forEach(function (r) { h += kv(esc(r.name), r.n ? r.n + ' ট্রেড · জয় ' + r.win.toFixed(0) + '% · ' + (r.exp >= 0 ? '+' : '') + r.exp.toFixed(2) + 'R' : '—', r.n && r.exp > 0 ? 'up' : r.n ? 'dn' : ''); });
      h += '<div class="note-info">জয় ৩৩%-এর বেশি ও +R হলে ২R টার্গেটে লাভজনক ছিল। যে স্ট্র্যাটেজি এই সিম্বল/টাইমফ্রেমে খারাপ, সেটার ভোট বন্ধ করে দাও।</div></div>';
    }
    return h;
  }

  function fieldsHtml() {
    var grid = '', rows = '';
    FIELDS.forEach(function (fd) {
      var key = fd[0], type = fd[1], label = fd[2];
      if (type === 'bool') rows += '<div class="row"><label><input type="checkbox" data-k="' + key + '"' + (cfg[key] ? ' checked' : '') + '><span>' + label + '</span></label></div>';
      else if (type === 'select') grid += '<label class="field full"><span>' + label + '</span><select data-k="' + key + '">' + fd[3].map(function (o) { return '<option' + (cfg[key] === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></label>';
      else grid += '<label class="field"><span>' + label + '</span><input type="number" inputmode="decimal" step="any" data-k="' + key + '" value="' + cfg[key] + '"></label>';
    });
    return '<div class="fgrid">' + grid + '</div>' + rows;
  }


  /* ---------- অটো-সেটআপ ---------- */
  var lastOpt = null, optBusy = false;
  async function runOpt() {
    var out = $('ul-optres'); if (!out || optBusy) return;
    optBusy = true; var sym = cur.sym, sec = cur.sec, key = optKey();
    try {
      out.innerHTML = '<div class="note-info">ইতিহাস লোড হচ্ছে…</div>';
      var all = R.chart.candles().slice(0, -1), pages = 0;
      while (pages < 4 && all.length) {
        var more = await R.data.klines(sym, R.TFS.filter(function (t) { return t.sec === sec; })[0].id, 1000, all[0].time * 1000 - 1).catch(function () { return []; });
        more = more.filter(function (c) { return c.time < all[0].time; });
        if (!more.length) break; all = more.concat(all); pages++;
      }
      if (all.length < 600) { out.innerHTML = '<div class="note-warn">ক্যান্ডেল মাত্র ' + all.length + 'টি পাওয়া গেছে, ভালো যাচাইয়ের জন্য কমপক্ষে ৬০০ দরকার।</div>'; optBusy = false; return; }
      var h = htfStore[sym] || { h4: null, h1: null, d: null }, mode = cfg.htfMode;
      if (!h.h4 && !h.h1 && sec < 14400) mode = 'Off';
      var res = await R.opt.search(all, h, cfg, marketInfo(sym), sec, mode, function (p) { out.innerHTML = '<div class="note-info">খোঁজা হচ্ছে… ' + Math.round(p * 100) + '%</div>'; });
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
      html += '<div class="note-info">অনেক সেটিং থেকে সেরাটা বাছলে ভাগ্যের প্রভাব থাকে, তাই টেস্টের সংখ্যাই আসল। ৭০%+ TP3 হিট সাধারণত পাওয়া যায় না, আর কোনো সেটিং ভবিষ্যতের গ্যারান্টি দেয় না। ডেমোতে যাচাই না করে আসল টাকায় ট্রেড কোরো না।</div>';
      if (cur.sym === sym && cur.sec === sec) out.innerHTML = html;
    } catch (e) { out.innerHTML = '<div class="note-warn">ত্রুটি: ' + esc(e.message) + '</div>'; }
    optBusy = false;
  }

  function closeSheet() { var s = $('ul-sheet'); if (s) s.remove(); }
  function openSheet() {
    closeSheet();
    var box = document.createElement('div'); box.id = 'ul-sheet';
    box.innerHTML = '<div class="sheet-body"><div class="sheet-h"><b>⚡ RTX ULTRA PRO MAX</b><button id="ul-x">✕</button></div>' +
      '<div class="row"><label><input type="checkbox" id="ul-on"' + (cfg.on ? ' checked' : '') + '><span>চার্টে ULTRA সিগন্যাল চালু</span></label></div>' +
      '<div class="card"><b>🎯 অটো-সেটআপ</b><div class="muted" style="font-size:12px;margin:4px 0 8px">এই মার্কেট ও টাইমফ্রেমে আগের ডেটায় সেরা সেটিং খুঁজে শেষ ৩৫% ডেটায় যাচাই করে দেখায়।</div><div class="btnrow"><button class="btn primary" id="ul-opt">খোঁজো</button><button class="btn" id="ul-optoff">অটো-সেটআপ মুছো</button></div><div id="ul-optres"></div></div>' +
      '<div class="card"><b>🤖 AI সহায়ক</b><div class="muted" style="font-size:12px;margin:4px 0 8px">সর্বশেষ সিগন্যাল বাংলায় ব্যাখ্যা করবে। বাটন চাপলেই শুধু কল হয়, একই সিগন্যালে দ্বিতীয়বার লিমিট খরচ হয় না।</div><div class="btnrow"><button class="btn primary" id="ai-explain">এই সিগন্যাল ব্যাখ্যা করো</button></div><div id="ai-out"></div></div>' +
      '<div id="ul-dash"></div>' +
      '<details class="fold"><summary>⚙️ সেটিংস</summary><div class="fbody" id="ul-cfg">' + fieldsHtml() +
      '<div class="btnrow"><button class="btn" id="ul-reset">ডিফল্টে ফেরাও</button></div></div></details>' +
      '<div class="note-info">সিগন্যাল শুধু বন্ধ হওয়া ক্যান্ডেলে আসে, তাই ক্যান্ডেল বন্ধ হওয়ার পর কয়েক সেকেন্ড দেরিতে দেখা যায়। এন্ট্রি = সিগন্যাল ক্যান্ডেলের ক্লোজ। একই ক্যান্ডেলে SL ও TP দুটোই ছুঁলে SL আগে ধরা হয়। স্কোর মানে কনফ্লুয়েন্সের গণনা, জেতার সম্ভাবনা নয়। কোনো ইন্ডিকেটরই নিখুঁত নয়, আর এটা আর্থিক পরামর্শ নয়।</div></div>';
    document.body.appendChild(box);
    paint();
    box.addEventListener('click', function (e) {
      if (e.target.id === 'ul-opt') { runOpt(); return; }
      if (e.target.id === 'ul-optoff') { delete optStore[optKey()]; lsSet('rtx_ultra_opt', optStore); $('ul-optres').innerHTML = '<div class="note-info">এই মার্কেটের অটো-সেটআপ মুছে গেছে।</div>'; sched(0, true); return; }
      if (e.target.dataset && e.target.dataset.apply !== undefined) { var r = lastOpt.top[+e.target.dataset.apply]; if (r) { optStore[optKey()] = r.cfg; lsSet('rtx_ultra_opt', optStore); say('অটো-সেটআপ বসানো হয়েছে'); sched(0, true); } return; }
      if (e.target === box || e.target.id === 'ul-x') { closeSheet(); return; }
      if (e.target.id === 'ul-reset') { cfg = Object.assign({}, DEF); lsSet('rtx_ultra_cfg', cfg); $('ul-cfg').innerHTML = fieldsHtml() + '<div class="btnrow"><button class="btn" id="ul-reset">ডিফল্টে ফেরাও</button></div>'; $('ul-on').checked = cfg.on; sched(0, true); }
    });
    box.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'ul-on') { cfg.on = t.checked; lsSet('rtx_ultra_cfg', cfg); sched(0, true); return; }
      var key = t.dataset && t.dataset.k; if (!key) return;
      var fd = FIELDS.filter(function (x) { return x[0] === key; })[0];
      if (fd[1] === 'bool') cfg[key] = t.checked;
      else if (fd[1] === 'select') cfg[key] = t.value;
      else {
        var v = parseFloat(t.value);
        if (!isFinite(v)) v = DEF[key];
        v = Math.min(fd[4], Math.max(fd[3], v));
        if (key === 'swingLen' || key === 'cooldown' || key === 'maxHist' || key === 'sweepWin' || key === 'qmMaxAge' || key === 'fibMaxAge' || key === 'minScore') v = Math.round(v);
        cfg[key] = v; t.value = v;
      }
      lsSet('rtx_ultra_cfg', cfg); sched(0, true);
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
