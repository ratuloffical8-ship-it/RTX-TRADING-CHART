// ফাইলের নাম: regime.js
// পাথ: js/regime.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — বাজারের অবস্থা চেনার ইঞ্জিন (Market Regime)
   বাজার এখন কোন অবস্থায় আছে, সেটা ৪ ভাগে ভাগ করে:
     trend    = একদিকে জোরে চলছে        (ADX ≥ ২২ এবং Choppiness ≤ ৫৫)
     range    = সাইডওয়েজ, এলোমেলো        (বাকি সব অবস্থা)
     breakout = সংকোচনের পর বেরিয়ে আসছে  (Bollinger প্রস্থ আগে ছোট ছিল, এখন বাড়ছে)
     volatile = অস্বাভাবিক বড় ওঠানামা    (ATR গড়ের ২ গুণ বা তার বেশি) → নতুন ট্রেড নিষিদ্ধ
   প্রতিটি বারের হিসাব শুধু ওই বার পর্যন্ত জানা ডেটা দিয়ে হয় (ভবিষ্যৎ ডেটা ব্যবহার হয় না)। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var NAMES = { trend: 'ট্রেন্ড (একদিকে চলছে)', range: 'রেঞ্জ (সাইডওয়েজ)', breakout: 'ব্রেকআউট (সংকোচনের পর বেরোচ্ছে)', volatile: 'অস্থির (বিপজ্জনক ওঠানামা)' };
  var DESC = {
    trend: 'দাম একদিকে জোরালোভাবে চলছে। এখানে ট্রেন্ডের দিকে ট্রেড ভালো কাজ করে, উল্টো দিকের রিভার্সাল ঝুঁকিপূর্ণ।',
    range: 'দাম একটা সীমার মধ্যে ওপর-নিচ করছে। এখানে লিকুইডিটি সুইপ ও রিজেকশনের সেটআপ ভালো, ব্রেকআউটে ভুয়া সিগন্যাল বেশি।',
    breakout: 'দাম কিছুদিন সংকুচিত থেকে এখন বেরিয়ে আসছে। এখানে ব্রেকআউট ও ট্রেন্ড-ফলো ভালো, রিভার্সাল সেটআপ বিপজ্জনক।',
    volatile: 'বাজারে অস্বাভাবিক বড় ওঠানামা চলছে। SL ঠিকমতো কাজ নাও করতে পারে, তাই নতুন ট্রেড নেওয়া হয় না।'
  };

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  /* Wilder-এর RMA: শুরুতে প্রথম n সংখ্যার গড় দিয়ে বীজ; শুরুর null বাদ দেয় */
  function rmaSeed(a, n) {
    var o = new Array(a.length).fill(null), s = -1, i, sum = 0;
    for (i = 0; i < a.length; i++) if (nn(a[i])) { s = i; break; }
    if (s < 0) return o;
    for (i = s; i < a.length; i++) {
      var k = i - s;
      if (k < n) { sum += a[i]; if (k === n - 1) o[i] = sum / n; }
      else o[i] = (a[i] + (n - 1) * o[i - 1]) / n;
    }
    return o;
  }
  function emaSeed(a, p) {
    var k = 2 / (p + 1), o = new Array(a.length), e = null;
    for (var i = 0; i < a.length; i++) { e = e === null ? a[i] : a[i] * k + e * (1 - k); o[i] = e; }
    return o;
  }

  /* O,H,L,C = সংখ্যার অ্যারে। রিটার্ন: প্রতি বারের অবস্থা ও সূচক */
  function compute(O, H, L, C) {
    var n = C.length, i, j;
    var tr = new Array(n), pdm = new Array(n), mdm = new Array(n);
    for (i = 0; i < n; i++) {
      tr[i] = i === 0 ? H[0] - L[0] : Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
      if (i === 0) { pdm[i] = 0; mdm[i] = 0; continue; }
      var up = H[i] - H[i - 1], dn = L[i - 1] - L[i];
      pdm[i] = (up > dn && up > 0) ? up : 0; mdm[i] = (dn > up && dn > 0) ? dn : 0;
    }
    var atr = rmaSeed(tr, 14), rt = rmaSeed(tr, 14), rp = rmaSeed(pdm, 14), rm = rmaSeed(mdm, 14), dx = new Array(n).fill(null);
    for (i = 0; i < n; i++) {
      if (!nn(rt[i]) || rt[i] <= 0) continue;
      var pdi = 100 * rp[i] / rt[i], mdi = 100 * rm[i] / rt[i], sm = pdi + mdi;
      dx[i] = sm > 0 ? 100 * Math.abs(pdi - mdi) / sm : 0;
    }
    var adx = rmaSeed(dx, 14);

    var chop = new Array(n).fill(null), bbw = new Array(n).fill(null), atrAvg = new Array(n).fill(null);
    var ln14 = Math.log(14);
    for (i = 13; i < n; i++) {
      var st = 0, hh = -Infinity, ll = Infinity;
      for (j = i - 13; j <= i; j++) { st += tr[j]; if (H[j] > hh) hh = H[j]; if (L[j] < ll) ll = L[j]; }
      chop[i] = hh > ll ? 100 * Math.log(st / (hh - ll)) / ln14 : 100;
    }
    for (i = 19; i < n; i++) {
      var m = 0, v = 0;
      for (j = i - 19; j <= i; j++) m += C[j]; m /= 20;
      for (j = i - 19; j <= i; j++) v += (C[j] - m) * (C[j] - m);
      bbw[i] = m > 0 ? 4 * Math.sqrt(v / 20) / m : null;
    }
    for (i = 62; i < n; i++) { var sa = 0; for (j = i - 49; j <= i; j++) sa += atr[j]; atrAvg[i] = sa / 50; }

    var e50 = emaSeed(C, 50), e200 = emaSeed(C, 200);
    var reg = new Array(n), bias = new Array(n), ready = new Array(n);
    for (i = 0; i < n; i++) {
      bias[i] = (C[i] > e50[i] && e50[i] > e200[i]) ? 1 : (C[i] < e50[i] && e50[i] < e200[i]) ? -1 : 0;
      ready[i] = nn(adx[i]) && nn(chop[i]) && nn(atrAvg[i]) && i >= 120;
      reg[i] = 'range';
      if (!ready[i]) continue;
      var volRatio = atr[i] / atrAvg[i], rng = H[i] - L[i];
      if (volRatio >= 2.0 || (atr[i] > 0 && rng >= 3.5 * atr[i])) { reg[i] = 'volatile'; continue; }
      // ব্রেকআউট: শেষ ১০ বারে Bollinger প্রস্থ সর্বনিম্ন চতুর্থাংশে ছিল, এখন ২৫% বেড়েছে
      var minRecent = Infinity, win = [];
      for (j = i - 10; j <= i - 1; j++) if (nn(bbw[j]) && bbw[j] < minRecent) minRecent = bbw[j];
      for (j = Math.max(0, i - 100); j <= i - 1; j++) if (nn(bbw[j])) win.push(bbw[j]);
      if (win.length >= 50 && nn(bbw[i]) && isFinite(minRecent)) {
        win.sort(function (a, b) { return a - b; });
        var p25 = win[Math.floor(win.length * 0.25)];
        if (minRecent <= p25 && bbw[i] >= 1.25 * minRecent && adx[i] >= 18) { reg[i] = 'breakout'; continue; }
      }
      if (adx[i] >= 22 && chop[i] <= 55) reg[i] = 'trend';
    }
    return { reg: reg, adx: adx, atr: atr, atrAvg: atrAvg, chop: chop, bbw: bbw, bias: bias, ready: ready, e50: e50, e200: e200 };
  }

  /* এই অবস্থায় এই ধরনের এন্ট্রি চলবে কি না
     type: 'setup' (রিভার্সাল/লিকুইডিটি) | 'breakout' | 'trend'
     mode: 'safe' | 'smart' | 'aggressive'; dir: ±১; bias: EMA-এর দিক */
  function allows(reg, type, mode, dir, bias) {
    if (reg === 'volatile') return { ok: false, why: 'বাজার এখন অস্থির, তাই নতুন ট্রেড নেওয়া হয় না' };
    if (reg === 'trend') {
      if (type === 'setup' && bias !== 0 && bias !== dir) return { ok: false, why: 'ট্রেন্ডের বাজারে ট্রেন্ডের উল্টো দিকের রিভার্সাল সেটআপ ঝুঁকিপূর্ণ' };
      return { ok: true };
    }
    if (reg === 'range') {
      if (type === 'setup') return { ok: true };
      if (mode === 'aggressive' && type === 'breakout') return { ok: true };
      return { ok: false, why: 'রেঞ্জের বাজারে ব্রেকআউট ও ট্রেন্ড-ফলো সিগন্যালে ভুয়া সংকেত বেশি হয়' };
    }
    if (reg === 'breakout') {
      if (type === 'setup' && mode !== 'aggressive') return { ok: false, why: 'ব্রেকআউটের সময় রিভার্সাল সেটআপ বিপজ্জনক' };
      return { ok: true };
    }
    return { ok: true };
  }

  R.regime = { compute: compute, allows: allows, NAMES: NAMES, DESC: DESC };
})(window.RTX);
