// ফাইলের নাম: structure.js
// পাথ: js/structure.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — মার্কেট স্ট্রাকচার ইঞ্জিন
   সুইং হাই/লো, ট্রেন্ডের ধরন (HH/HL বা LH/LL), BOS (স্ট্রাকচার ভাঙা), CHoCH (ট্রেন্ড বদলের প্রথম ভাঙা),
   লিকুইডিটি (সমান হাই/লো), Fair Value Gap (FVG), Order Block (OB), Premium/Discount।
   কঠোর নিয়ম: একটি সুইং পয়েন্ট "নিশ্চিত" হয় ডানদিকে ৩টি ক্যান্ডেল বন্ধ হওয়ার পর। নিশ্চিত হওয়ার আগে তা ব্যবহার হয় না।
   তাই চার্টে পুরোনো সিগন্যাল আর লাইভ সিগন্যালে কোনো পার্থক্য হয় না। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var KIND_BN = { swingH: 'সুইং হাই', swingL: 'সুইং লো', eqH: 'সমান হাইয়ের লিকুইডিটি', eqL: 'সমান লোর লিকুইডিটি', bearOB: 'বিয়ারিশ অর্ডার ব্লক', bullOB: 'বুলিশ অর্ডার ব্লক', bearFVG: 'বিয়ারিশ FVG', bullFVG: 'বুলিশ FVG' };
  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  /* O,H,L,C = অ্যারে; atr = ATR(14) অ্যারে (null থাকতে পারে); opts.len = সুইং দৈর্ঘ্য (ডিফল্ট ৩) */
  function compute(O, H, L, C, atr, opts) {
    opts = opts || {};
    var n = C.length, Ls = opts.len || 3, i, j, k;
    var trend = new Array(n).fill(0), bos = new Array(n).fill(0), choch = new Array(n).fill(0), bosLvl = new Array(n).fill(null);
    var eqH = new Array(n).fill(null), eqL = new Array(n).fill(null), disp = new Array(n).fill(0);
    var bullZone = new Array(n).fill(null), bearZone = new Array(n).fill(null), bullOB = new Array(n).fill(null), bearOB = new Array(n).fill(null);
    var pd = new Array(n).fill(null), prevHigh = new Array(n).fill(null), prevLow = new Array(n).fill(null);
    var phs = [], pls = [], zones = [], obs = [], brokenH = false, brokenL = false, eqHL = null, eqLL = null;

    function a14(x) { return nn(atr[x]) ? atr[x] : null; }

    for (i = 0; i < n; i++) {
      var A = a14(i);
      // ১) নিশ্চিত সুইং পয়েন্ট (বাঁদিকে কঠোর, ডানদিকে অকঠোর — ULTRA-র মতোই)
      var c0 = i - Ls, isPH = false, isPL = false;
      if (c0 - Ls >= 0) {
        isPH = true; isPL = true;
        for (j = c0 - Ls; j <= i; j++) {
          if (j === c0) continue;
          if (j < c0) { if (H[j] >= H[c0]) isPH = false; if (L[j] <= L[c0]) isPL = false; }
          else { if (H[j] > H[c0]) isPH = false; if (L[j] < L[c0]) isPL = false; }
        }
      }
      if (isPH) {
        phs.push({ p: H[c0], i: c0, c: i }); brokenH = false;
        var tolH = A !== null ? 0.2 * A : H[c0] * 0.0005;
        for (k = phs.length - 2; k >= Math.max(0, phs.length - 6); k--) if (Math.abs(phs[k].p - H[c0]) <= tolH) { eqHL = Math.max(phs[k].p, H[c0]); break; }
      }
      if (isPL) {
        pls.push({ p: L[c0], i: c0, c: i }); brokenL = false;
        var tolL = A !== null ? 0.2 * A : L[c0] * 0.0005;
        for (k = pls.length - 2; k >= Math.max(0, pls.length - 6); k--) if (Math.abs(pls[k].p - L[c0]) <= tolL) { eqLL = Math.min(pls[k].p, L[c0]); break; }
      }

      // ২) BOS / CHoCH (আগের বারের ট্রেন্ড অবস্থা দেখে ঠিক হয়)
      var prevT = i > 0 ? trend[i - 1] : 0, bull = false, bear = false, lvlB = null, lvlS = null;
      if (phs.length && !brokenH && C[i] > phs[phs.length - 1].p) { bull = true; lvlB = phs[phs.length - 1].p; brokenH = true; }
      if (pls.length && !brokenL && C[i] < pls[pls.length - 1].p) { bear = true; lvlS = pls[pls.length - 1].p; brokenL = true; }
      if (bull && bear) { if (C[i] >= O[i]) bear = false; else bull = false; }
      if (bull) { bosLvl[i] = lvlB; if (prevT >= 0) bos[i] = 1; else choch[i] = 1; }
      if (bear) { bosLvl[i] = lvlS; if (prevT <= 0) bos[i] = -1; else choch[i] = -1; }

      // ৩) ট্রেন্ডের ধরন: শেষ দুই সুইং হাই ও লো তুলনা
      if (phs.length >= 2 && pls.length >= 2) {
        var h1 = phs[phs.length - 1].p, h0 = phs[phs.length - 2].p, l1 = pls[pls.length - 1].p, l0 = pls[pls.length - 2].p;
        trend[i] = (h1 > h0 && l1 > l0) ? 1 : (h1 < h0 && l1 < l0) ? -1 : 0;
      }
      prevHigh[i] = phs.length ? phs[phs.length - 1].p : null;
      prevLow[i] = pls.length ? pls[pls.length - 1].p : null;
      if (prevHigh[i] !== null && prevLow[i] !== null && prevHigh[i] > prevLow[i]) pd[i] = (C[i] - prevLow[i]) / (prevHigh[i] - prevLow[i]);

      // ৪) সমান হাই/লো লিকুইডিটি: ক্লোজ ভেঙে গেলে মুছে যায়
      if (eqHL !== null && C[i] > eqHL) eqHL = null;
      if (eqLL !== null && C[i] < eqLL) eqLL = null;
      eqH[i] = eqHL; eqL[i] = eqLL;

      // ৫) ডিসপ্লেসমেন্ট: বড় বডির জোরালো ক্যান্ডেল
      if (A !== null) {
        var body = Math.abs(C[i] - O[i]), rg = H[i] - L[i];
        if (rg > 0 && body >= 1.2 * A && body / rg >= 0.6) disp[i] = C[i] > O[i] ? 1 : -1;
      }

      // ৬) ছোঁয়া হিসাব (এই বারের আগে তৈরি হওয়া অমিটিগেটেড জোন) — তারপর মিটিগেশন
      for (k = zones.length - 1; k >= 0; k--) {
        var z = zones[k]; if (z.mit !== null || z.bar >= i) continue;
        if (L[i] <= z.top && H[i] >= z.bot) { if (z.dir === 1 && bullZone[i] === null) bullZone[i] = z; if (z.dir === -1 && bearZone[i] === null) bearZone[i] = z; }
      }
      for (k = obs.length - 1; k >= 0; k--) {
        var ob = obs[k]; if (ob.mit !== null || ob.bar >= i) continue;
        if (L[i] <= ob.top && H[i] >= ob.bot) { if (ob.dir === 1 && bullOB[i] === null) bullOB[i] = ob; if (ob.dir === -1 && bearOB[i] === null) bearOB[i] = ob; }
      }
      for (k = 0; k < zones.length; k++) {
        var zz = zones[k]; if (zz.mit !== null || zz.bar >= i) continue;
        if ((zz.dir === 1 && C[i] < zz.bot) || (zz.dir === -1 && C[i] > zz.top) || i - zz.bar > 60) zz.mit = i;
      }
      for (k = 0; k < obs.length; k++) {
        var oo = obs[k]; if (oo.mit !== null || oo.bar >= i) continue;
        if ((oo.dir === 1 && C[i] < oo.bot) || (oo.dir === -1 && C[i] > oo.top) || i - oo.bar > 80) oo.mit = i;
      }

      // ৭) নতুন FVG (তিন ক্যান্ডেলের ফাঁক) — এই বারেই জানা যায়
      if (i >= 2 && A !== null) {
        if (L[i] > H[i - 2] && (L[i] - H[i - 2]) >= 0.1 * A) zones.push({ dir: 1, top: L[i], bot: H[i - 2], bar: i, disp: disp[i - 1] === 1, mit: null, kind: 'bullFVG' });
        if (H[i] < L[i - 2] && (L[i - 2] - H[i]) >= 0.1 * A) zones.push({ dir: -1, top: L[i - 2], bot: H[i], bar: i, disp: disp[i - 1] === -1, mit: null, kind: 'bearFVG' });
      }

      // ৮) নতুন Order Block: BOS/CHoCH-এর আগের শেষ উল্টো রঙের ক্যান্ডেল
      var ev = bos[i] || choch[i];
      if (ev !== 0) {
        for (k = i - 1; k >= Math.max(0, i - 12); k--) {
          if ((ev === 1 && C[k] < O[k]) || (ev === -1 && C[k] > O[k])) { obs.push({ dir: ev, top: H[k], bot: L[k], bar: i, src: k, mit: null, kind: ev === 1 ? 'bullOB' : 'bearOB' }); break; }
        }
      }
    }

    /* i নং বারে, দাম price-এর ওপরে/নিচে থাকা বাধা বা লিকুইডিটি লেভেলের তালিকা (কাছেরটা আগে)।
       শুধু i পর্যন্ত জানা তথ্য ব্যবহার হয়। side: 'above' | 'below' */
    function levels(i, price, side) {
      var out = [], k;
      var alive = function (z) { return z.bar < i && (z.mit === null || z.mit > i); };
      if (side === 'above') {
        for (k = 0; k < phs.length; k++) if (phs[k].c <= i && phs[k].p > price && i - phs[k].i <= 150) out.push({ price: phs[k].p, kind: 'swingH' });
        if (eqH[i] !== null && eqH[i] > price) out.push({ price: eqH[i], kind: 'eqH' });
        zones.forEach(function (z) { if (z.dir === -1 && alive(z) && z.bot > price) out.push({ price: z.bot, kind: 'bearFVG' }); });
        obs.forEach(function (z) { if (z.dir === -1 && alive(z) && z.bot > price) out.push({ price: z.bot, kind: 'bearOB' }); });
        out.sort(function (a, b) { return a.price - b.price; });
      } else {
        for (k = 0; k < pls.length; k++) if (pls[k].c <= i && pls[k].p < price && i - pls[k].i <= 150) out.push({ price: pls[k].p, kind: 'swingL' });
        if (eqL[i] !== null && eqL[i] < price) out.push({ price: eqL[i], kind: 'eqL' });
        zones.forEach(function (z) { if (z.dir === 1 && alive(z) && z.top < price) out.push({ price: z.top, kind: 'bullFVG' }); });
        obs.forEach(function (z) { if (z.dir === 1 && alive(z) && z.top < price) out.push({ price: z.top, kind: 'bullOB' }); });
        out.sort(function (a, b) { return b.price - a.price; });
      }
      return out;
    }

    /* SL-এর জন্য: i পর্যন্ত নিশ্চিত শেষ সুইং। side 'low' = price-এর নিচের সুইং লো; 'high' = ওপরের সুইং হাই */
    function lastPivot(i, side, price, maxAge) {
      var arr = side === 'low' ? pls : phs, k;
      for (k = arr.length - 1; k >= 0; k--) {
        var p = arr[k]; if (p.c > i) continue;
        if (i - p.i > maxAge) return null;
        if (side === 'low' ? p.p < price : p.p > price) return p;
      }
      return null;
    }

    return {
      trend: trend, bos: bos, choch: choch, bosLvl: bosLvl, eqH: eqH, eqL: eqL, disp: disp,
      bullZone: bullZone, bearZone: bearZone, bullOB: bullOB, bearOB: bearOB, pd: pd, prevHigh: prevHigh, prevLow: prevLow,
      zones: zones, obs: obs, phs: phs, pls: pls, levels: levels, lastPivot: lastPivot, KIND_BN: KIND_BN
    };
  }

  R.structure = { compute: compute, KIND_BN: KIND_BN };
})(window.RTX);
