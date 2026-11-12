// ফাইলের নাম: trade.js
// পাথ: js/trade.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — ট্রেড ইঞ্জিন: এন্ট্রি দাম, SL, TP, খরচ (স্প্রেড/স্লিপেজ), লট ও ঝুঁকির হিসাব, ঝুঁকি নিয়ন্ত্রণ
   লটের হিসাব: লাভ/লস (ডলার) = লট × কন্ট্রাক্ট সাইজ × দামের পরিবর্তন।
     সোনা (XAUUSD): ১ লট = ১০০ আউন্স, তাই ০.০১ লটে দাম ১ ডলার নড়লে ১ ডলার লাভ/লস।
     BTC/ETH/ETC (Exness): ১ লট = ১ কয়েন ধরা হয়েছে, তাই ০.০১ লটে BTC $১০০ নড়লে $১ লাভ/লস।
   কন্ট্রাক্ট সাইজ ও স্প্রেড ব্রোকার ভেদে আলাদা, তাই সেটিংসে নিজের ব্রোকারের মান বসানোর ব্যবস্থা আছে (cfg.specs)। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  /* আনুমানিক ডিফল্ট — আসল স্প্রেড ব্রোকারের সাইট দেখে সেটিংসে বদলাও */
  var SPECS = {
    XAUUSDT: { cSize: 100, spread: 0.20, slip: 0.05 }, PAXGUSDT: { cSize: 100, spread: 0.20, slip: 0.05 }, 'XAU/USD': { cSize: 100, spread: 0.20, slip: 0.05 },
    BTCUSDT: { cSize: 1, spread: 20, slip: 2 }, 'BTC/USD': { cSize: 1, spread: 20, slip: 2 }, BTCUSD: { cSize: 1, spread: 20, slip: 2 },
    ETHUSDT: { cSize: 1, spread: 1.5, slip: 0.3 }, ETCUSDT: { cSize: 1, spread: 0.05, slip: 0.01 }
  };
  function specFor(info, cfg) {
    var base = SPECS[info.sym] || { cSize: info.cSize || 1, spread: info.mintick * 20, slip: info.mintick * 3 };
    var ov = cfg && cfg.specs && cfg.specs[info.sym];
    return Object.assign({}, base, ov || {});
  }

  /* ঝুঁকি (ডলারে) = লট × কন্ট্রাক্ট × দূরত্ব। USD কোটেড হলে সরাসরি, USD বেস হলে দাম দিয়ে ভাগ */
  function dollarRisk(info, spec, lot, dist, price) {
    if (info.qUsd) return lot * spec.cSize * dist;
    if (info.baseUsd && price > 0) return lot * spec.cSize * dist / price;
    return null;
  }
  /* ঝুঁকি % থেকে লট (০.০১ ধাপে নিচের দিকে), সর্বনিম্ন ০.০১ */
  function lotFromRisk(info, spec, balance, riskPct, dist, price) {
    var perLot = dollarRisk(info, spec, 1, dist, price);
    if (!(perLot > 0)) return null;
    var lot = Math.floor((balance * riskPct / 100) / perLot * 100) / 100;
    return Math.max(0.01, lot);
  }

  var SLORDER = { structure: ['structure', 'liquidity'], liquidity: ['liquidity'], atr: ['atr'], auto: ['structure', 'liquidity', 'atr'] };
  var SLKIND_BN = { structure: 'স্ট্রাকচার SL (নিশ্চিত সুইংয়ের বাইরে)', liquidity: 'লিকুইডিটি SL (সুইপের শেষ প্রান্তের বাইরে)', atr: 'ATR SL (ভোলাটিলিটি অনুযায়ী দূরত্ব)' };

  /* এন্ট্রি, SL ও TP তৈরি।
     x = { dir, i, close, H, L, a (ATR), S (structure), rt (দাম রাউন্ডার), spec, cost (true/false),
           slMode, slBuf, slMin, slMax, atrMult, minRoomR, tp1R, tp2R, tp3R, setupLvl }
     সফল হলে ok:true, নইলে ok:false ও fail ('sl' বা 'room') + কারণ। */
  function plan(x) {
    var d = x.dir, a = x.a, rt = x.rt, i = x.i, k, mt = x.mt || 0;
    var halfCost = x.cost ? (x.spec.spread / 2 + x.spec.slip) : 0;
    var entry = rt(x.close + d * halfCost);
    var minD = x.slMin * a, maxD = x.slMax * a, order = SLORDER[x.slMode] || SLORDER.auto, chosen = null, notes = [];

    for (k = 0; k < order.length && !chosen; k++) {
      var kind = order[k], lvl = null;
      if (kind === 'structure') {
        var pv = x.S.lastPivot(i, d === 1 ? 'low' : 'high', entry, 80);
        if (pv) lvl = pv.p - d * x.slBuf * a;
      } else if (kind === 'liquidity') {
        var ext = d === 1 ? Infinity : -Infinity, q;
        for (q = Math.max(0, i - 7); q <= i; q++) ext = d === 1 ? Math.min(ext, x.L[q]) : Math.max(ext, x.H[q]);
        if (nn(x.setupLvl)) ext = d === 1 ? Math.min(ext, x.setupLvl) : Math.max(ext, x.setupLvl);
        lvl = ext - d * x.slBuf * a;
      } else lvl = entry - d * x.atrMult * a;
      if (lvl === null) { notes.push(SLKIND_BN[kind] + ': পাওয়া যায়নি'); continue; }
      var dist = (entry - lvl) * d;
      if (!(dist > 0)) { notes.push(SLKIND_BN[kind] + ': ভুল দিকে'); continue; }
      var widened = false;
      if (dist < minD) { dist = minD; lvl = entry - d * minD; widened = true; }
      if (dist > maxD) { notes.push(SLKIND_BN[kind] + ': অনেক দূরে (' + (dist / a).toFixed(1) + '×ATR)'); continue; }
      chosen = { kind: kind, lvl: lvl, dist: dist, widened: widened };
    }
    if (!chosen) return { ok: false, fail: 'sl', note: 'গ্রহণযোগ্য SL পাওয়া যায়নি (' + notes.join('; ') + ')' };

    var sl = rt(chosen.lvl), riskD = Math.abs(entry - sl);
    if (!(riskD > mt * 2)) return { ok: false, fail: 'sl', note: 'SL দূরত্ব খুব ছোট' };

    // সামনের বাধা (বিপরীত লিকুইডিটি/জোন)
    var lv = x.S.levels(i, entry, d === 1 ? 'above' : 'below'), obsR = lv.map(function (o) { return { r: Math.abs(o.price - entry) / riskD, kind: o.kind, price: o.price }; });
    var nearest = obsR.length ? obsR[0] : null;
    if (nearest && nearest.r < x.minRoomR) {
      return { ok: false, fail: 'room', note: 'TP-র পথে ' + R.structure.KIND_BN[nearest.kind] + ' (' + nearest.price + ') মাত্র ' + nearest.r.toFixed(1) + 'R দূরে, জায়গা কম' };
    }
    var tpR = [x.tp1R, x.tp2R, x.tp3R], adj = [], prev = 0, margin = 0.1 * a / riskD, idx;
    for (idx = 0; idx < 3; idx++) {
      var r = tpR[idx];
      for (k = 0; k < obsR.length; k++) { var o = obsR[k]; if (o.r > prev + 0.15 && o.r < r) { r = Math.max(prev + 0.1, o.r - margin); adj.push('TP' + (idx + 1) + ' ' + R.structure.KIND_BN[o.kind] + '-এর ঠিক আগে'); break; } }
      if (r <= prev + 0.05) r = prev + 0.1;
      tpR[idx] = r; prev = r;
    }
    var tp1 = rt(entry + d * riskD * tpR[0]), tp2 = rt(entry + d * riskD * tpR[1]), tp3 = rt(entry + d * riskD * tpR[2]);
    return {
      ok: true, entry: entry, sl: sl, tp1: tp1, tp2: tp2, tp3: tp3, riskD: riskD, slKind: chosen.kind, slKindBn: SLKIND_BN[chosen.kind], widened: chosen.widened,
      tpR: tpR, tpNotes: adj, room: nearest ? nearest.r : null, obstacle: nearest ? R.structure.KIND_BN[nearest.kind] + ' (' + nearest.price + ')' : null,
      beLevel: rt(entry + d * halfCost), halfCost: halfCost
    };
  }

  /* একটি বন্ধ ক্যান্ডেলে ট্রেডের অবস্থা। একই ক্যান্ডেলে SL ও TP দুটোই ছুঁলে SL আগে ধরা হয়।
     status: ১=চলমান ২=TP1 ৩=TP2 ৪=TP3 ৫=SL ৬=ব্রেক-ইভেন */
  function step(t, hi, lo, idx, beOn) {
    var ev = [], tb = t.dir === 1;
    var slHit = tb ? lo <= t.slNow : hi >= t.slNow;
    if (slHit) { t.status = t.beMoved ? 6 : 5; ev.push(t.beMoved ? 'BE' : 'SL'); }
    else {
      if (t.status === 1 && (tb ? hi >= t.tp1 : lo <= t.tp1)) {
        t.status = 2; t.tp1Hit = true; ev.push('TP1');
        if (beOn) { t.slNow = t.beLevel; t.beMoved = true; }
      }
      if (t.status === 2 && (tb ? hi >= t.tp2 : lo <= t.tp2)) { t.status = 3; ev.push('TP2'); }
      if (t.status === 3 && (tb ? hi >= t.tp3 : lo <= t.tp3)) { t.status = 4; ev.push('TP3'); }
    }
    t.end = idx;
    return ev;
  }
  /* ট্রেড শেষ হলে ফলাফল R-এ (TP3 = +tp3R, SL = −১, ব্রেক-ইভেন = ০) */
  function resultR(t, tp3R) { return t.status === 4 ? tp3R : t.status === 5 ? -1 : t.status === 6 ? 0 : null; }

  /* ঝুঁকি নিয়ন্ত্রণ: দৈনিক লস সীমা (UTC দিন) ও পরপর লসের পর বিরতি */
  function RiskState(M) {
    this.M = M; this.dayR = {}; this.consec = 0; this.pauseUntil = -1;
  }
  RiskState.prototype.canTrade = function (time, bar) {
    var day = Math.floor(time / 86400);
    if ((this.dayR[day] || 0) <= -this.M.dailyLossR) return { ok: false, key: 'daily', why: 'আজকের লস সীমা (' + this.M.dailyLossR + 'R) ছুঁয়েছে, আজ আর নতুন ট্রেড নয়' };
    if (bar < this.pauseUntil) return { ok: false, key: 'consec', why: 'পরপর ' + this.M.maxConsec + 'টি লসের পর বিরতি চলছে (' + (this.pauseUntil - bar) + ' ক্যান্ডেল বাকি)' };
    return { ok: true };
  };
  RiskState.prototype.onClose = function (r, time, bar) {
    var day = Math.floor(time / 86400);
    this.dayR[day] = (this.dayR[day] || 0) + r;
    if (r < 0) { this.consec++; if (this.consec >= this.M.maxConsec) { this.pauseUntil = bar + this.M.pauseBars; this.consec = 0; } }
    else if (r > 0) this.consec = 0;
  };

  /* কোন সম্পদ একসাথে নড়ে (সম্পর্কিত ঝুঁকি গোনার জন্য) */
  function corrGroup(sym) {
    sym = String(sym || '');
    if (sym.indexOf('XAU') >= 0 || sym.indexOf('PAXG') >= 0) return 'gold';
    if (/BTC|ETH|ETC|SOL|XRP|DOGE|ADA|LTC|BNB/.test(sym)) return 'crypto';
    return 'fx:' + sym;
  }
  /* খোলা ট্রেডগুলোর মোট ঝুঁকি (একই গ্রুপে) — list: [{sym, riskUsd}] */
  function aggRisk(list, group, maxUsd) {
    var tot = 0; list.forEach(function (t) { if (corrGroup(t.sym) === group) tot += t.riskUsd || 0; });
    return { total: tot, ok: tot <= maxUsd };
  }

  R.trade = { SPECS: SPECS, specFor: specFor, dollarRisk: dollarRisk, lotFromRisk: lotFromRisk, plan: plan, step: step, resultR: resultR, RiskState: RiskState, corrGroup: corrGroup, aggRisk: aggRisk, SLKIND_BN: SLKIND_BN };
})(window.RTX);
