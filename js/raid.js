// ফাইলের নাম: raid.js
// পাথ: js/raid.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — "লিকুইডিটি রেইড রিভার্সাল" ইঞ্জিন (Batch D)
   ধারণা (ICT/SMC): বড় খেলোয়াড়রা আগের হাই/লো-র ওপরে-নিচে জমে থাকা স্টপ লস সংগ্রহ করে (লিকুইডিটি সুইপ), তারপর উল্টো দিকে দাম ঘোরায়।
   ধাপ: ১) লিকুইডিটি পুল চিহ্নিত  ২) সুইপ (উইক ভেঙে ভেতরে ফিরে বন্ধ)  ৩) CISD (দিক বদলের নিশ্চিত ক্যান্ডেল)
        ৪) এন্ট্রি: "দ্রুত" (CISD বন্ধ হতেই) বা "রিটেস্ট" (দাম ফিরলে লিমিট)  ৫) SL সুইপের চূড়ার বাইরে  ৬) TP উল্টো দিকের লিকুইডিটিতে।
   সিগন্যাল শুধু বন্ধ ক্যান্ডেলে। একই ক্যান্ডেলে SL ও TP দুটোই ছুঁলে SL আগে ধরা হয়। লিমিট এন্ট্রি দাম না ফিরলে "মিস" হয় (লস নয়, ট্রেডও নয়)। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }
  function Z(n) { return new Array(n).fill(0); }

  /* তিনটি মোড: শুরুর মান (পরীক্ষায় প্রমাণিত সেরা নয়) — cfg.ov দিয়ে বদলানো যায় */
  var MODES = {
    safe: { minScore: 80, minRR: 2.5, htf: 'strict', maxSweepAtr: 2.0, pend: 10, volLow: 0.6, volHigh: 2.5 },
    smart: { minScore: 70, minRR: 2.0, htf: 'normal', maxSweepAtr: 2.5, pend: 12, volLow: 0.5, volHigh: 3 },
    aggressive: { minScore: 60, minRR: 1.5, htf: 'loose', maxSweepAtr: 3.0, pend: 14, volLow: 0.4, volHigh: 3.5 }
  };
  var MODE_INFO = {
    safe: { name: 'SAFE (নিরাপদ)', desc: 'শুধু সেরা সেটআপ। বড় টাইমফ্রেম মিলতে হবে, লাভ-ঝুঁকির অনুপাত কমপক্ষে ১:২.৫। সিগন্যাল কম আসে।' },
    smart: { name: 'SMART (সুষম, শুরুর জন্য)', desc: 'ভারসাম্যপূর্ণ। বড় টাইমফ্রেম বিপরীতে থাকলে বাদ, লাভ-ঝুঁকির অনুপাত কমপক্ষে ১:২।' },
    aggressive: { name: 'AGGRESSIVE (বেশি সিগন্যাল)', desc: 'বেশি সিগন্যাল। একটি বড় টাইমফ্রেম উল্টো হলেও চলে, অনুপাত কমপক্ষে ১:১.৫। লসের হারও বেশি হতে পারে।' }
  };
  var ENTRY_BN = { retest: 'রিটেস্ট এন্ট্রি (দাম ফিরলে লিমিট)', fast: 'দ্রুত এন্ট্রি (CISD বন্ধ হতেই)' };
  var KIND_BN = { swingH: 'আগের সুইং হাই', swingL: 'আগের সুইং লো', eqH: 'সমান হাই (Equal Highs)', eqL: 'সমান লো (Equal Lows)', pdh: 'আগের দিনের হাই', pdl: 'আগের দিনের লো', asiaH: 'এশিয়া সেশনের হাই', asiaL: 'এশিয়া সেশনের লো', bullFVG: 'বুলিশ FVG', bearFVG: 'বেয়ারিশ FVG', bullOB: 'বুলিশ OB', bearOB: 'বেয়ারিশ OB' };
  var STRONG = { eqH: 1, eqL: 1, pdh: 1, pdl: 1, asiaH: 1, asiaL: 1 };
  var REJ_BN = {
    htf: 'বড় টাইমফ্রেম (4H/1H) বিপরীতে', sweepq: 'সুইপ খুব বড় (এটা ব্রেকআউট হতে পারে)', nocisd: 'সুইপের পর CISD আসেনি', session: 'সেশনের বাইরে', vol: 'ভোলাটিলিটি ঠিক নেই', news: 'নিউজ-বিরতির সময়',
    sl: 'SL গ্রহণযোগ্য নয় (খুব কাছে বা খুব দূরে)', rr: 'লিকুইডিটি পর্যন্ত লাভ-ঝুঁকির অনুপাত কম', score: 'স্কোর সীমার নিচে', live: 'আগের ট্রেড এখনো চলছে', lotrisk: 'ব্যালেন্সের তুলনায় ঝুঁকি বেশি', missed: 'লিমিট এন্ট্রি মেলেনি (দাম ফেরেনি)'
  };

  function bnB(b) { return b === 1 ? 'বুলিশ' : b === -1 ? 'বেয়ারিশ' : 'নিরপেক্ষ'; }
  function rsiArr(C, p) {
    var n = C.length, o = new Array(n).fill(null), g = 0, l = 0, i;
    for (i = 1; i < n; i++) {
      var ch = C[i] - C[i - 1], up = ch > 0 ? ch : 0, dn = ch < 0 ? -ch : 0;
      if (i <= p) { g += up; l += dn; if (i === p) { g /= p; l /= p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
      else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    }
    return o;
  }

  /* আগের দিনের হাই/লো ও এশিয়া সেশন (UTC ০০:০০–০৭:০০) রেঞ্জ */
  function dayLevels(T, H, L) {
    var n = T.length, pdh = new Array(n).fill(null), pdl = new Array(n).fill(null), ah = new Array(n).fill(null), al = new Array(n).fill(null);
    var day = -1, cH = -Infinity, cL = Infinity, pH = null, pL = null, aH = -Infinity, aL = Infinity, i;
    for (i = 0; i < n; i++) {
      var d = Math.floor(T[i] / 86400), secs = T[i] % 86400;
      if (d !== day) { if (day !== -1 && isFinite(cH)) { pH = cH; pL = cL; } day = d; cH = -Infinity; cL = Infinity; aH = -Infinity; aL = Infinity; }
      if (secs < 7 * 3600) { aH = Math.max(aH, H[i]); aL = Math.min(aL, L[i]); }
      pdh[i] = pH; pdl[i] = pL;
      if (secs >= 7 * 3600 && isFinite(aH)) { ah[i] = aH; al[i] = aL; }
      cH = Math.max(cH, H[i]); cL = Math.min(cL, L[i]);
    }
    return { pdh: pdh, pdl: pdl, ah: ah, al: al };
  }

  /* d = -1 (SELL): ওপরে থাকা পুল (হাই) সুইপ। d = +1 (BUY): নিচে থাকা পুল (লো) সুইপ।
     CISD লেভেল: সুইপের চূড়ার কাছের শেষ ≤৪টি একই-দিকের ক্যান্ডেলের ওপেনের সবচেয়ে ভেতরের মান */
  function cisdLevel(d, e, O, C) {
    var k = e, skip = 0, lvl = null, cnt = 0;
    function same(x) { return d === -1 ? C[x] > O[x] : C[x] < O[x]; }
    while (k >= 0 && !same(k) && skip < 2) { k--; skip++; }
    while (k >= 0 && same(k) && cnt < 4) { lvl = lvl === null ? O[k] : (d === -1 ? Math.min(lvl, O[k]) : Math.max(lvl, O[k])); k--; cnt++; }
    return lvl;
  }

  function prepR(P, info, tfSec) {
    var n = P.n, i, k;
    var S = R.structure.compute(P.O, P.H, P.L, P.C, P.atr, { len: 3 });
    var RG = R.regime.compute(P.O, P.H, P.L, P.C);
    var DL = dayLevels(P.T, P.H, P.L), rsi = rsiArr(P.C, 14);
    var O = P.O, H = P.H, L = P.L, C = P.C, atr = P.atr, T = P.T;
    var phAt = {}, plAt = {};
    S.phs.forEach(function (p) { (phAt[p.c] = phAt[p.c] || []).push(p); });
    S.pls.forEach(function (p) { (plAt[p.c] = plAt[p.c] || []).push(p); });
    var actH = [], actL = [], events = [], lastEqH = null, lastEqL = null, lastPdh = null, lastPdl = null, lastAh = null, lastAl = null, lastDay = -1;
    var useAsia = tfSec <= 3600;

    function addPool(list, p, kind, bar, atrv) {
      var tol = (nn(atrv) ? 0.15 * atrv : p * 0.0003), q;
      for (q = 0; q < list.length; q++) if (Math.abs(list[q].p - p) <= tol) { if (STRONG[kind] && !STRONG[list[q].kind]) list[q].kind = kind; return; }
      list.push({ p: p, kind: kind, born: bar, broken: null, ext: null, extI: null });
      if (list.length > 60) list.shift();
    }
    function sweepStep(list, d, j, a, outList) {
      var q;
      for (q = list.length - 1; q >= 0; q--) {
        var pl = list[q], beyond = d === -1 ? H[j] > pl.p : L[j] < pl.p;
        if (j - pl.born > 220) { list.splice(q, 1); continue; }
        if (beyond) {
          if (pl.broken === null) { pl.broken = j; pl.ext = d === -1 ? H[j] : L[j]; pl.extI = j; }
          else if (d === -1 ? H[j] > pl.ext : L[j] < pl.ext) { pl.ext = d === -1 ? H[j] : L[j]; pl.extI = j; }
        }
        if (pl.broken !== null) {
          var back = d === -1 ? C[j] < pl.p : C[j] > pl.p, deep = d === -1 ? C[j] > pl.p + 0.35 * a : C[j] < pl.p - 0.35 * a;
          if (back) {
            var wick = Math.abs(pl.ext - pl.p);
            if (wick >= 0.08 * a) outList.push({ d: d, pool: { p: pl.p, kind: pl.kind }, ext: pl.ext, extI: pl.extI, sweepBar: j, wickAtr: wick / a, big: wick / a });
            list.splice(q, 1);
          } else if (deep || j - pl.broken >= 3) list.splice(q, 1);
        }
      }
    }

    for (i = 0; i < n; i++) {
      var a = nn(atr[i]) ? atr[i] : null, nw = [];
      (phAt[i] || []).forEach(function (p) { addPool(actH, p.p, 'swingH', i, a); });
      (plAt[i] || []).forEach(function (p) { addPool(actL, p.p, 'swingL', i, a); });
      if (S.eqH[i] !== null && S.eqH[i] !== lastEqH) { addPool(actH, S.eqH[i], 'eqH', i, a); } lastEqH = S.eqH[i];
      if (S.eqL[i] !== null && S.eqL[i] !== lastEqL) { addPool(actL, S.eqL[i], 'eqL', i, a); } lastEqL = S.eqL[i];
      if (DL.pdh[i] !== null && DL.pdh[i] !== lastPdh) { addPool(actH, DL.pdh[i], 'pdh', i, a); lastPdh = DL.pdh[i]; }
      if (DL.pdl[i] !== null && DL.pdl[i] !== lastPdl) { addPool(actL, DL.pdl[i], 'pdl', i, a); lastPdl = DL.pdl[i]; }
      if (useAsia && DL.ah[i] !== null && DL.ah[i] !== lastAh) { addPool(actH, DL.ah[i], 'asiaH', i, a); lastAh = DL.ah[i]; }
      if (useAsia && DL.al[i] !== null && DL.al[i] !== lastAl) { addPool(actL, DL.al[i], 'asiaL', i, a); lastAl = DL.al[i]; }
      if (a === null || i < 30) continue;
      sweepStep(actH, -1, i, a, nw); sweepStep(actL, 1, i, a, nw);
      // একই ক্যান্ডেলে একাধিক পুল: সবচেয়ে শক্তিশালী ধরনটি রাখি (আর একই দিকে একটিই)
      [-1, 1].forEach(function (dd) {
        var cand = nw.filter(function (e) { return e.d === dd; });
        if (!cand.length) return;
        cand.sort(function (x, y) { return (STRONG[y.pool.kind] ? 1 : 0) - (STRONG[x.pool.kind] ? 1 : 0); });
        var ev = cand[0]; ev.confl = cand.length;
        ev.lvl = cisdLevel(dd, ev.extI, O, C);
        if (ev.lvl !== null) events.push(ev);
      });
    }
    // শেষে এখনো জীবিত পুলগুলো (আগাম এলার্টের জন্য)
    return { S: S, RG: RG, DL: DL, rsi: rsi, events: events, actH: actH, actL: actL, n: n };
  }

  function run(cs, base, cfg, info, tfSec, htfMode) {
    var P = R.power.prep(cs, base, info, tfSec);
    var D = (base._rd && base._rd.n === P.n && base._rd.tf === tfSec) ? base._rd : (base._rd = (function () { var x = prepR(P, info, tfSec); x.tf = tfSec; return x; })());
    var n = P.n, i, k;
    var O = P.O, H = P.H, L = P.L, C = P.C, T = P.T, atr = P.atr, atrAvg = P.atrAvg, h4 = P.h4, h1 = P.h1, S = D.S, RG = D.RG, DL = D.DL, rsi = D.rsi;
    var mk = MODES[cfg.mode] ? cfg.mode : 'smart', M = Object.assign({}, MODES[mk], cfg.ov || {});
    var entryMode = cfg.entryMode === 'fast' ? 'fast' : 'retest';
    var spec = R.trade.specFor(info, cfg), mt = info.mintick, dec = info.dec;
    function rt(x) { return +(Math.round(x / mt) * mt).toFixed(dec); }
    var lotMode = cfg.lotMode === 'risk' ? 'risk' : 'fixed', lotFixed = cfg.lot > 0 ? +cfg.lot : 0.01, balance = cfg.balance > 0 ? +cfg.balance : 1000, riskPctCfg = cfg.riskPct > 0 ? +cfg.riskPct : 1;
    var maxRiskPct = nn(cfg.maxRiskPct) && cfg.maxRiskPct > 0 ? +cfg.maxRiskPct : 10;
    var tpMax = cfg.tpMaxR > 0 ? +cfg.tpMaxR : 8, slMinAtr = cfg.slMinAtr > 0 && cfg.slMinAtr < 1 ? +cfg.slMinAtr : 0.35, slMaxAtr = cfg.slMaxAtr > 0 ? +cfg.slMaxAtr : 3;
    var halfCost = cfg.costOn !== false ? (spec.spread / 2 + spec.slip) : 0;

    var evByBar = {};
    D.events.forEach(function (e, idx) { e.id = idx; (evByBar[e.sweepBar] = evByBar[e.sweepBar] || []).push(e); });
    var open = [];          // CISD-র অপেক্ষায় থাকা সুইপ
    var trades = [], cur = null, stats = { candidates: 0, signals: 0, rejected: {} }, lastEval = null, sigDone = {};
    function rej(key) { stats.rejected[key] = (stats.rejected[key] || 0) + 1; }

    function htfCheck(d, i) {
      var H4 = h4[i], H1 = h1[i], opp = (H4 === -d ? 1 : 0) + (H1 === -d ? 1 : 0), same = (H4 === d ? 1 : 0) + (H1 === d ? 1 : 0), ok = true;
      if (htfMode === 'Off') ok = true;
      else if (M.htf === 'strict') ok = opp === 0 && same >= 1;
      else if (M.htf === 'normal') ok = opp === 0;
      else ok = opp <= 1 && same >= (opp === 1 ? 1 : 0);
      var pts = htfMode === 'Off' ? 10 : (same === 2 ? 20 : (same === 1 && opp === 0) ? 15 : (opp === 0 ? 8 : same === 1 ? 5 : 0));
      return { ok: ok, H4: H4, H1: H1, opp: opp, same: same, pts: pts, note: '4H ' + bnB(H4) + ', 1H ' + bnB(H1) + (htfMode === 'Off' ? ' (ফিল্টার বন্ধ)' : '') };
    }

    function divergence(ev) {
      var arr = ev.d === -1 ? S.phs : S.pls, k2;
      for (k2 = arr.length - 1; k2 >= 0; k2--) {
        var pv = arr[k2]; if (pv.c >= ev.extI || pv.i >= ev.extI) continue;
        if (ev.sweepBar - pv.i > 80) return false;
        if (!nn(rsi[ev.extI]) || !nn(rsi[pv.i])) return false;
        return ev.d === -1 ? (ev.ext > pv.p && rsi[ev.extI] < rsi[pv.i]) : (ev.ext < pv.p && rsi[ev.extI] > rsi[pv.i]);
      }
      return false;
    }

    /* একটি (সুইপ + CISD) সংমিশ্রণ থেকে ট্রেড পরিকল্পনা ও সব শর্ত পরীক্ষা */
    function evaluate(ev, m) {
      var d = ev.d, a = atr[m], G = [], parts = {}, notes = [];
      function gate(nr, key, label, ok, note, block) { G.push({ n: nr, key: key, label: label, ok: !!ok, note: note || '', block: block !== false }); }
      var hc = htfCheck(d, m);
      gate(1, 'htf', 'বড় টাইমফ্রেম (4H/1H) বিরোধী নয়', hc.ok, hc.note);
      var kindBn = KIND_BN[ev.pool.kind], wickAtr = Math.abs(ev.ext - ev.pool.p) / a;
      var sweepOk = wickAtr <= M.maxSweepAtr;
      gate(2, 'sweepq', 'লিকুইডিটি সুইপ পরিষ্কার', sweepOk, kindBn + ' (' + ev.pool.p + ') ' + (d === -1 ? 'ছাড়িয়ে ওপরে ' : 'ছাড়িয়ে নিচে ') + wickAtr.toFixed(2) + '×ATR উইক টেনে ভেতরে ফিরে বন্ধ' + (sweepOk ? '' : ' — অতিরিক্ত বড়, ব্রেকআউটের মতো'));
      var body = Math.abs(O[m] - C[m]) / a;
      gate(3, 'cisd', 'CISD নিশ্চিত', true, 'ক্যান্ডেল ' + (d === -1 ? 'নিচে' : 'ওপরে') + ' ' + ev.lvl + '-এর ' + (d === -1 ? 'নিচে' : 'ওপরে') + ' বন্ধ, বডি ' + body.toFixed(2) + '×ATR');

      // এন্ট্রি
      var fvg = d === -1 ? (m >= 2 && H[m] < L[m - 2] ? { top: L[m - 2], bot: H[m] } : null) : (m >= 2 && L[m] > H[m - 2] ? { top: L[m], bot: H[m - 2] } : null);
      var limit, mode2 = entryMode, entryNote;
      if (entryMode === 'fast') { limit = C[m]; entryNote = 'CISD ক্যান্ডেল বন্ধ হওয়ার দামে সঙ্গে সঙ্গে'; }
      else {
        var mid = fvg ? (fvg.top + fvg.bot) / 2 : (C[m] + ev.lvl) / 2;
        var cap = d === -1 ? ev.ext - 0.3 * a : ev.ext + 0.3 * a;
        limit = d === -1 ? Math.min(mid, cap) : Math.max(mid, cap);
        if ((d === -1 && limit <= C[m]) || (d === 1 && limit >= C[m])) { limit = C[m]; mode2 = 'fast'; entryNote = 'রিটেস্ট জোন পাওয়া যায়নি, তাই দ্রুত এন্ট্রি'; }
        else entryNote = (fvg ? 'CISD-র তৈরি FVG-র মাঝামাঝি (' : 'CISD লেভেল ও বর্তমান দামের মাঝামাঝি (') + rt(limit) + ') দাম ফিরলে লিমিট';
      }
      var entry = rt(limit + d * halfCost), buf = spec.spread + Math.max(0.1 * a, 2 * mt), slLvl = rt(ev.ext - d * buf), riskD = Math.abs(entry - slLvl);
      var okSL = (entry - slLvl) * d > 0 && riskD >= Math.max(slMinAtr * a, spec.spread * 3) && riskD <= slMaxAtr * a;
      gate(4, 'sl', 'SL সুইপের চূড়ার বাইরে, গ্রহণযোগ্য দূরত্বে', okSL, 'সুইপের ' + (d === -1 ? 'সর্বোচ্চ ' : 'সর্বনিম্ন ') + rt(ev.ext) + ' + বাফার ' + rt(buf) + ' → SL ' + slLvl + ' (দূরত্ব ' + (riskD / a).toFixed(2) + '×ATR)');

      // TP: উল্টো দিকের লিকুইডিটি
      var side = d === -1 ? 'below' : 'above', lv = S.levels(m, entry, side).map(function (o) { return { price: o.price, kind: o.kind, pool: o.kind === 'swingL' || o.kind === 'swingH' || o.kind === 'eqL' || o.kind === 'eqH' }; });
      var extra = d === -1 ? [['pdl', DL.pdl[m]], ['asiaL', DL.al[m]]] : [['pdh', DL.pdh[m]], ['asiaH', DL.ah[m]]];
      extra.forEach(function (x) { if (nn(x[1]) && ((d === -1 && x[1] < entry) || (d === 1 && x[1] > entry))) lv.push({ price: x[1], kind: x[0], pool: true }); });
      lv.sort(function (x, y) { return Math.abs(x.price - entry) - Math.abs(y.price - entry); });
      var margin = 0.1 * a + spec.spread / 2, rOf = function (p) { return Math.abs(p - entry) / riskD; };
      var tp3 = null, tp3o = null, q, capped = false;
      if (okSL) {
        for (q = 0; q < lv.length; q++) { if (lv[q].pool && rOf(lv[q].price) - margin / riskD >= M.minRR) { tp3o = lv[q]; break; } }
        if (tp3o) { tp3 = rt(tp3o.price + d * margin); if (rOf(tp3) > tpMax) { tp3 = rt(entry + d * riskD * tpMax); capped = true; } }
      }
      var tpOk = !!tp3 && rOf(tp3) >= M.minRR - 1e-9;
      var rr = tp3 ? rOf(tp3) : 0;
      gate(5, 'rr', 'TP লিকুইডিটিতে, লাভ-ঝুঁকি ≥ ১:' + M.minRR, okSL ? tpOk : true, !okSL ? 'SL না পাওয়ায় যাচাই হয়নি' : tpOk ? 'TP3 = ' + KIND_BN[tp3o.kind] + ' (' + tp3o.price + ') → ১:' + rr.toFixed(1) + (capped ? ' (সর্বোচ্চ ' + tpMax + 'R-এ সীমিত)' : '') : 'ন্যূনতম ১:' + M.minRR + ' দূরত্বে কোনো লিকুইডিটি পাওয়া যায়নি');
      var tp1 = null, tp2 = null, tpR = [0, 0, 0], tpNotes = [];
      if (okSL && tpOk) {
        var r3 = rr, c1 = null, c2 = null;
        for (q = 0; q < lv.length; q++) { var rq = rOf(lv[q].price) - margin / riskD; if (!c1 && rq >= 0.9 && rq <= r3 * 0.7) c1 = lv[q]; }
        var r1 = c1 ? rOf(c1.price) - margin / riskD : Math.max(1, r3 * 0.4);
        for (q = 0; q < lv.length; q++) { var rq2 = rOf(lv[q].price) - margin / riskD; if (rq2 >= r1 + 0.4 && rq2 <= r3 - 0.4) { c2 = lv[q]; break; } }
        var r2 = c2 ? rOf(c2.price) - margin / riskD : (r1 + r3) / 2;
        tp1 = rt(entry + d * riskD * r1); tp2 = rt(entry + d * riskD * r2);
        tpR = [r1, r2, r3];
        tpNotes.push(c1 ? 'TP1 = ' + KIND_BN[c1.kind] + ' (Exit Level-1)' : 'TP1 = ১R-এর কাছাকাছি প্রথম আংশিক লাভ');
        if (c2) tpNotes.push('TP2 = ' + KIND_BN[c2.kind]);
      }

      // সেশন, ভোলাটিলিটি, নিউজ
      var se = R.ultra.sessOf(T[m], tfSec, info, cfg), volOK = !cfg.volFilter || (nn(atrAvg[m]) && a >= atrAvg[m] * M.volLow && a <= atrAvg[m] * M.volHigh), newsHit = false;
      (cfg.newsBlocks || []).forEach(function (b) { if (T[m] >= b[0] && T[m] <= b[1]) newsHit = true; });
      var subKey = !se.ok ? 'session' : !volOK ? 'vol' : newsHit ? 'news' : null;
      gate(6, subKey || 'session', 'সেশন, ভোলাটিলিটি ও নিউজ ঠিক আছে', !subKey, !subKey ? se.name + ', ভোলাটিলিটি স্বাভাবিক' : subKey === 'session' ? 'এখন ' + se.name : subKey === 'vol' ? 'ATR গড়ের তুলনায় অস্বাভাবিক' : 'নিউজ-বিরতির সময়');

      // স্কোর (মোট ১০০): সুইপ ২৫ + CISD ২০ + HTF ২০ + লাভ-ঝুঁকি ১৫ + প্রসঙ্গ ২০
      var strong = !!STRONG[ev.pool.kind], div = divergence(ev), pdv = S.pd[m], pdOk = nn(pdv) && (d === -1 ? pdv > 0.55 : pdv < 0.45), lonny = se.name === 'London' || se.name === 'New York' || se.name === 'London+NY';
      parts.sweep = Math.min(25, (strong ? 17 : 11) + (wickAtr >= 0.3 ? 4 : 2) + (ev.confl > 1 ? 4 : 0));
      parts.cisd = Math.min(20, 12 + (body >= 1 ? 4 : body >= 0.6 ? 2 : 0) + (fvg ? 4 : 0));
      parts.htf = hc.pts;
      parts.rr = rr >= 4 ? 15 : rr >= 3 ? 12 : rr >= 2 ? 9 : rr >= 1.5 ? 5 : 0;
      var hasDelta = cs[m] && cs[m].buyVol !== undefined && cs[m - 1] && cs[m - 1].buyVol !== undefined, dsum = 0, dOk = false;
      if (hasDelta) { var k0 = Math.max(ev.extI, m - 1), kk; for (kk = k0; kk <= m; kk++) dsum += 2 * cs[kk].buyVol - cs[kk].volume; dOk = d === -1 ? dsum < 0 : dsum > 0; }
      parts.ctx = hasDelta ? ((pdOk ? 5 : 0) + (lonny || info.isCrypto ? 4 : 0) + (div ? 4 : 0) + (S.trend[m] === d ? 3 : 0) + (dOk ? 4 : 0)) : ((pdOk ? 6 : 0) + (lonny || info.isCrypto ? 5 : 0) + (div ? 5 : 0) + (S.trend[m] === d ? 4 : 0));
      var score = Math.min(100, Math.round(parts.sweep + parts.cisd + parts.htf + parts.rr + parts.ctx));
      gate(7, 'score', 'স্কোর সীমা পার (' + M.minScore + ')', score >= M.minScore, 'স্কোর ' + score + '/১০০');

      // ঝুঁকি ও লট
      var live = cur && cur.status >= 1 && cur.status <= 3, rkKey = null, rkNote = '', lot = null, riskUsd = null, riskPct = null, warn = false;
      if (cfg.oneTrade !== false && live) { rkKey = 'live'; rkNote = 'আগের ট্রেড এখনো চলছে'; }
      if (okSL) {
        lot = lotMode === 'risk' ? R.trade.lotFromRisk(info, spec, balance, riskPctCfg, riskD, entry) : lotFixed;
        if (lot !== null) { riskUsd = R.trade.dollarRisk(info, spec, lot, riskD, entry); riskPct = riskUsd !== null ? riskUsd / balance * 100 : null; }
        if (!rkKey && riskPct !== null && riskPct > maxRiskPct) { rkKey = 'lotrisk'; rkNote = lot.toFixed(2) + ' লটে এই SL-এ ঝুঁকি $' + riskUsd.toFixed(2) + ' = ব্যালেন্সের ' + riskPct.toFixed(1) + '% (সীমা ' + maxRiskPct + '%, সেটিংসে বদলানো যায়)'; }
        if (!rkKey) { warn = riskPct !== null && riskPct > 5; rkNote = lot.toFixed(2) + ' লটে ঝুঁকি $' + (riskUsd === null ? '?' : riskUsd.toFixed(2)) + (riskPct !== null ? ' = ব্যালেন্সের ' + riskPct.toFixed(1) + '%' : '') + (warn ? ' (৫%-এর বেশি, সাবধান)' : ''); }
      }
      gate(8, rkKey || 'risk', 'ঝুঁকির সীমা ঠিক আছে', !rkKey, rkNote);

      var failed = G.filter(function (g) { return !g.ok && g.block; })[0] || null;
      return { ok: !failed, fail: failed, gate: G, parts: parts, score: score, d: d, entry: entry, limit: limit, entryMode: mode2, entryNote: entryNote, sl: slLvl, riskD: riskD, tp1: tp1, tp2: tp2, tp3: tp3, tpR: tpR, tpNotes: tpNotes, tp3o: tp3o, rr: rr, lot: lot, riskUsd: riskUsd, riskPct: riskPct, warn: warn, hc: hc, kindBn: kindBn, wickAtr: wickAtr, body: body, fvg: !!fvg, div: div, pdOk: pdOk, se: se, strong: strong, capped: capped, hasDelta: hasDelta, dOk: dOk, dsum: dsum };
    }

    function brief(d) { return d === 1 ? 'BUY' : 'SELL'; }

    for (i = 0; i < n; i++) {
      // ১) চলমান / অপেক্ষমাণ ট্রেডের অবস্থা
      if (cur) {
        var bt = cur.dir === 1;
        if (cur.status === 0 && i > cur.bar) {
          var fillHit = bt ? L[i] <= cur.limit : H[i] >= cur.limit, hit1 = bt ? H[i] >= cur.tp1 : L[i] <= cur.tp1;
          if (fillHit) {
            cur.status = 1; cur.fillBar = i; cur.fillTime = T[i]; cur.events.push({ time: T[i], type: 'FILL' });
            if (bt ? L[i] <= cur.sl : H[i] >= cur.sl) { cur.status = 5; cur.events.push({ time: T[i], type: 'SL' }); cur.end = i; cur.endTime = T[i]; }
          } else if (hit1 || (i - cur.bar) > cur.pend) { cur.status = 8; cur.end = i; cur.endTime = T[i]; cur.events.push({ time: T[i], type: 'MISS' }); rej('missed'); }
          else cur.endTime = T[i];
        } else if (cur.status >= 1 && cur.status <= 3 && i > cur.fillBar) {
          var evs = R.trade.step(cur, H[i], L[i], i, cfg.beOn !== false);
          cur.endTime = T[i];
          for (k = 0; k < evs.length; k++) cur.events.push({ time: T[i], type: evs[k] });
        }
      }
      if (!nn(atr[i]) || i < 60) continue;

      // ২) নতুন সুইপ (এই বারে নিশ্চিত হয়েছে) → CISD-র অপেক্ষায় রাখি
      (evByBar[i] || []).forEach(function (e) { open.push(e); stats.candidates++; });

      // ৩) CISD খোঁজা
      var fired = [];
      for (k = open.length - 1; k >= 0; k--) {
        var e = open[k], d = e.d, a = atr[i];
        if (i - e.sweepBar > 8) { rej('nocisd'); open.splice(k, 1); continue; }
        if (i > e.sweepBar && (d === -1 ? H[i] > e.ext : L[i] < e.ext)) { rej('nocisd'); open.splice(k, 1); continue; }  // চূড়া ভাঙল, সুইপ ব্যর্থ
        var cis = d === -1 ? (C[i] < e.lvl && O[i] > C[i] && (O[i] - C[i]) >= 0.35 * a) : (C[i] > e.lvl && C[i] > O[i] && (C[i] - O[i]) >= 0.35 * a);
        if (cis) { fired.push(e); open.splice(k, 1); }
      }
      if (!fired.length) { if (i === n - 1) lastEval = null; continue; }
      fired.sort(function (x, y) { return (STRONG[y.pool.kind] ? 1 : 0) - (STRONG[x.pool.kind] ? 1 : 0); });
      var ev0 = fired[0], dd = ev0.d, evl = evaluate(ev0, i);
      if (i === n - 1) lastEval = { status: evl.ok ? 'signal' : 'rejected', key: evl.fail ? evl.fail.key : null, text: evl.ok ? 'সিগন্যাল তৈরি হয়েছে' : (evl.fail.label + ' — ' + evl.fail.note), gate: evl.gate, dir: dd, type: 'setup', score: evl.score };
      if (!evl.ok) { rej(evl.fail.key); continue; }
      stats.signals++;
      var grade = evl.score >= 90 ? 'A+' : evl.score >= 80 ? 'A' : evl.score >= 70 ? 'B' : 'C';
      var w = {
        engine: 'raid', mode: mk, modeBn: MODE_INFO[mk].name, type: 'setup', typeBn: 'লিকুইডিটি রেইড রিভার্সাল', regime: RG.reg[i], regimeBn: R.regime.NAMES[RG.reg[i]], regimeDesc: R.regime.DESC[RG.reg[i]],
        setups: ['লিকুইডিটি সুইপ + CISD'], xl: [], trendFamily: { ut: 0, jdt: 0, supertrend: 0, agree: 0 }, htf: { h4: evl.hc.H4, h1: evl.hc.H1, counterTrend: evl.hc.opp === 1 },
        structure: { trend: S.trend[i], recent: null, inZone: evl.fvg, premiumDiscount: nn(S.pd[i]) ? +S.pd[i].toFixed(2) : null },
        parts: evl.parts, partsMax: { sweep: 25, cisd: 20, htf: 20, rr: 15, ctx: 20 }, score: evl.score, minScore: M.minScore, gate: evl.gate,
        sl: { kind: 'liquidity', text: 'সুইপের ' + (dd === -1 ? 'সর্বোচ্চ' : 'সর্বনিম্ন') + ' ' + rt(ev0.ext) + '-এর বাইরে বাফারসহ', widened: false },
        tp: { r: evl.tpR.map(function (x) { return +x.toFixed(2); }), notes: evl.tpNotes, room: null, obstacle: null },
        risk: { lot: evl.lot, usd: evl.riskUsd, pct: evl.riskPct, balance: balance, lotMode: lotMode, warn: evl.warn }, costs: { spread: spec.spread, slip: spec.slip, on: cfg.costOn !== false },
        raid: { poolKind: ev0.pool.kind, poolKindBn: evl.kindBn, poolPrice: ev0.pool.p, ext: rt(ev0.ext), wickAtr: +evl.wickAtr.toFixed(2), sweepTime: T[ev0.sweepBar], cisdLvl: rt(ev0.lvl), cisdBody: +evl.body.toFixed(2), fvg: evl.fvg, div: evl.div, pdOk: evl.pdOk, session: evl.se.name, entryMode: evl.entryMode, entryNote: evl.entryNote, rr: +evl.rr.toFixed(2), tp3Kind: evl.tp3o ? evl.tp3o.kind : null, tp3KindBn: evl.tp3o ? KIND_BN[evl.tp3o.kind] : null, tp3Price: evl.tp3o ? evl.tp3o.price : null, capped: evl.capped, hasDelta: evl.hasDelta, deltaOk: evl.dOk, delta: evl.dsum }
      };
      if (cur && cur.status === 0) { cur.status = 7; cur.endTime = T[i]; }
      var pending = evl.entryMode === 'retest';
      cur = {
        dir: dd, bar: i, time: T[i], endTime: T[i], end: i, status: pending ? 0 : 1, score: evl.score, grade: grade, entry: evl.entry, limit: evl.limit, sl: evl.sl, slNow: evl.sl,
        tp1: evl.tp1, tp2: evl.tp2, tp3: evl.tp3, tpR: evl.tpR, beLevel: rt(evl.entry + dd * halfCost), lot: evl.lot, riskUsd: evl.riskUsd, riskPct: evl.riskPct, riskD: evl.riskD,
        mode: 'RAID ' + (pending ? 'রিটেস্ট' : 'দ্রুত'), extra: evl.kindBn + ' সুইপ → CISD', entryType: 'setup', events: [], tp1Hit: false, beMoved: false, why: w,
        pend: M.pend, fillBar: pending ? null : i, fillTime: pending ? null : T[i]
      };
      trades.push(cur);
    }

    /* ----- আগাম এলার্ট (সর্বশেষ বন্ধ ক্যান্ডেলের অবস্থা থেকে) ----- */
    var li = n - 1, now = base.now ? Object.assign({}, base.now) : {}, alert = null, aL = nn(atr[li]) ? atr[li] : null;
    if (n > 60 && aL) {
      var pcur = cur && cur.status === 0 ? cur : null;
      if (pcur) alert = { stage: 'pending', dir: pcur.dir, level: pcur.limit, text: brief(pcur.dir) + ' লিমিট অপেক্ষায়: দাম ' + rt(pcur.limit) + '-এ ফিরলে এন্ট্রি। SL ' + pcur.sl + '। দাম না ফিরলে ট্রেড নেবে না (' + Math.max(0, pcur.pend - (li - pcur.bar)) + ' ক্যান্ডেল বাকি)।' };
      else if (open.length) {
        var oe = open[open.length - 1];
        alert = { stage: 'swept', dir: oe.d, level: oe.lvl, text: KIND_BN[oe.pool.kind] + ' (' + oe.pool.p + ') সুইপ হয়ে গেছে। ' + (oe.d === -1 ? 'এখন ' + rt(oe.lvl) + '-এর নিচে বড় বেয়ারিশ ক্যান্ডেল বন্ধ হলে SELL সিগন্যাল আসবে।' : 'এখন ' + rt(oe.lvl) + '-এর ওপরে বড় বুলিশ ক্যান্ডেল বন্ধ হলে BUY সিগন্যাল আসবে।') + ' প্রস্তুত থাকো, এখনো ঢুকো না।' };
      } else {
        var cl = C[li], best = null;
        D.actH.forEach(function (p) { var dist = p.p - cl; if (dist > 0 && dist <= 1.5 * aL && (!best || dist < best.dist)) best = { d: -1, p: p.p, kind: p.kind, dist: dist }; });
        D.actL.forEach(function (p) { var dist = cl - p.p; if (dist > 0 && dist <= 1.5 * aL && (!best || dist < best.dist)) best = { d: 1, p: p.p, kind: p.kind, dist: dist }; });
        if (best) {
          var hh = htfCheck(best.d, li);
          alert = { stage: 'watch', dir: best.d, level: best.p, text: 'দাম ' + KIND_BN[best.kind] + ' (' + rt(best.p) + ')-এর কাছে (' + rt(best.dist) + ' দূরে)। এখানে লিকুইডিটি সুইপ হতে পারে, তারপর ' + brief(best.d) + ' সেটআপ। ' + (hh.ok ? 'বড় টাইমফ্রেম বিরোধী নয়।' : 'সাবধান: বড় টাইমফ্রেম বিপরীতে (' + hh.note + ')।') + ' এখনো সিগন্যাল নয়, শুধু প্রস্তুতি।' };
        }
      }
    }
    now.regime = n ? RG.reg[li] : null; now.regimeBn = n ? R.regime.NAMES[RG.reg[li]] : '-'; now.struct = n ? S.trend[li] : 0; now.pd = n ? S.pd[li] : null; now.adx = n ? RG.adx[li] : null;
    now.mode = mk; now.modeBn = MODE_INFO[mk].name; now.entryMode = entryMode; now.alert = alert;
    now.last = lastEval || (alert ? { status: 'wait', text: alert.text } : { status: 'none', text: 'এখন কোনো লিকুইডিটির কাছে দাম নেই, সুইপ-CISD সেটআপও চলছে না। অপেক্ষা করো।' });
    return { trades: trades, closed: n, now: now, board: null, stats: stats, engine: 'raid' };
  }

  R.raid = { run: run, MODES: MODES, MODE_INFO: MODE_INFO, REJ_BN: REJ_BN, KIND_BN: KIND_BN, ENTRY_BN: ENTRY_BN };
})(window.RTX);
