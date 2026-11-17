// ফাইলের নাম / পাথ: js/smc.js
/* RTX Chart — Advanced SMC ইঞ্জিন (সিগন্যাল জেনারেটর)
   ক্রম (বুলিশ; বেয়ারিশ হুবহু উল্টো):
   ১) সেল-সাইড লিকুইডিটি সুইপ: নিশ্চিত সুইং লো-র নিচে উইক টেনে ওই ক্যান্ডেলেই লেভেলের ওপরে বন্ধ (reclaim)।
   ২) ডিসপ্লেসমেন্ট + MSS: সুইপের পর ২০ ক্যান্ডেলের মধ্যে সুইপের আগের নিশ্চিত সুইং হাই-এর ওপরে বড় বডির (≥ ০.৭×ATR, বডি/রেঞ্জ ≥ ০.৫৫) ক্যান্ডেল বন্ধ।
   ৩) জোন: ওই মুভে তৈরি FVG (≥ ০.১×ATR) — না থাকলে সুইপ থেকে মুভের আগের শেষ বিপরীত ক্যান্ডেলের OB।
      জোন ডিসকাউন্টে (ডিলিং রেঞ্জের নিচের ৭০%-এর মধ্যে) থাকতে হবে; বুলিশে প্রিমিয়ামে কেনা হবে না।
   ৪) এন্ট্রি: ৩০ ক্যান্ডেলের মধ্যে দাম জোনে ফিরে ছুঁলে, ছোঁয়ার ক্যান্ডেলে বা পরের ৩ ক্যান্ডেলের মধ্যে M5 ক্যান্ডেল অনুকূলে বন্ধ হলে সিগন্যাল (রিজেকশন/কনফার্মেশন)।
      জোনের নিচে বন্ধ হলে বা সুইপের শেষ প্রান্ত ভাঙলে সেটআপ বাতিল (mitigated/invalidated)। এক সেটআপে একটাই সিগন্যাল।
   কঠোর নিয়ম: প্রতিটি ক্যান্ডেল i-তে শুধু i পর্যন্ত ডেটা ব্যবহার হয় (সুইং নিশ্চিত হয় ডানে ৩ ক্যান্ডেল বন্ধ হলে), তাই রিপেইন্ট নেই।
   SL: সুইপের শেষ প্রান্ত (lvl) strat.js-এর লিকুইডিটি SL-এ যায়; TP/লিকুইডিটি/R:R পরীক্ষা strat.js-এর সাধারণ গেট থেকে।
   সতর্কতা: নিয়মগুলো ICT/SMC-র প্রচলিত বর্ণনার সরল রূপ; লাভজনক প্রমাণিত নয়। আসল ডেটার "তুলনা করো" টেবিল দেখে সিদ্ধান্ত নাও। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  var CFG = { len: 3, sweepMin: 0.03, sweepAge: 60, mssWin: 20, retWin: 30, dispBody: 0.7, dispRatio: 0.55, fvgMin: 0.1, discount: 0.7, maxFar: 2.0, maxSetups: 4 };

  /* O,H,L,C, atr = অ্যারে (atr-এ null থাকতে পারে) → { sig, lvl, info } */
  function signals(O, H, L, C, atr, n, opt) {
    var X = Object.assign({}, CFG, opt || {}), Ls = X.len;
    var sig = new Array(n).fill(0), lvl = new Array(n).fill(null), info = new Array(n).fill(null);
    var phs = [], pls = [], setups = [], used = {}, i, j, q, s, c0, isPH, isPL;

    for (i = 0; i < n; i++) {
      var a = atr[i];
      // ক) নিশ্চিত সুইং (ডানে Ls ক্যান্ডেল বন্ধ হওয়ার পর)
      c0 = i - Ls;
      if (c0 - Ls >= 0) {
        isPH = true; isPL = true;
        for (j = c0 - Ls; j <= i; j++) {
          if (j === c0) continue;
          if (j < c0) { if (H[j] >= H[c0]) isPH = false; if (L[j] <= L[c0]) isPL = false; }
          else { if (H[j] > H[c0]) isPH = false; if (L[j] < L[c0]) isPL = false; }
        }
        if (isPH) phs.push({ p: H[c0], i: c0, c: i, id: 'h' + c0 });
        if (isPL) pls.push({ p: L[c0], i: c0, c: i, id: 'l' + c0 });
      }
      if (!nn(a) || a <= 0) continue;

      // খ) নতুন সুইপ (এই ক্যান্ডেলে) — শুধু i-এর আগে নিশ্চিত হওয়া সুইং-এর বিপরীতে
      if (setups.length < X.maxSetups) {
        var pl = null, ph = null;
        for (q = pls.length - 1; q >= 0 && i - pls[q].i <= X.sweepAge; q--) { if (pls[q].c < i) { pl = pls[q]; break; } }
        for (q = phs.length - 1; q >= 0 && i - phs[q].i <= X.sweepAge; q--) { if (phs[q].c < i) { ph = phs[q]; break; } }
        if (pl && !used[pl.id] && L[i] < pl.p - X.sweepMin * a && C[i] > pl.p) {
          // সুইপের আগের সর্বশেষ নিশ্চিত সুইং হাই (MSS লেভেল) — অবশ্যই বর্তমান দামের ওপরে
          var hr = null; for (q = phs.length - 1; q >= 0; q--) { if (phs[q].c < i && phs[q].p > C[i]) { hr = phs[q]; break; } }
          if (hr) { used[pl.id] = 1; setups.push({ d: 1, sw: i, swLvl: pl.p, ext: L[i], ref: hr.p, stage: 0, top: 0, bot: 0, kind: '', mss: -1, tb: -1 }); }
        }
        if (ph && !used[ph.id] && H[i] > ph.p + X.sweepMin * a && C[i] < ph.p) {
          var lr = null; for (q = pls.length - 1; q >= 0; q--) { if (pls[q].c < i && pls[q].p < C[i]) { lr = pls[q]; break; } }
          if (lr) { used[ph.id] = 1; setups.push({ d: -1, sw: i, swLvl: ph.p, ext: H[i], ref: lr.p, stage: 0, top: 0, bot: 0, kind: '', mss: -1, tb: -1 }); }
        }
      }

      // গ) চলমান সেটআপ এগোনো (সুইপ ক্যান্ডেল নিজে বাদ)
      var fireD = 0, fireS = null;
      for (q = setups.length - 1; q >= 0; q--) {
        s = setups[q]; if (s.sw === i) continue;
        var d = s.d, body = Math.abs(C[i] - O[i]), rg = H[i] - L[i];
        if (s.stage === 0) {
          // সুইপের শেষ প্রান্ত নতুন করে বাড়ে/কমে (আরও গভীর সুইপ)
          if (d === 1) s.ext = Math.min(s.ext, L[i]); else s.ext = Math.max(s.ext, H[i]);
          if (i - s.sw > X.mssWin) { setups.splice(q, 1); continue; }
          var brk = d === 1 ? C[i] > s.ref : C[i] < s.ref;
          if (brk && body >= X.dispBody * a && rg > 0 && body / rg >= X.dispRatio && (d === 1 ? C[i] > O[i] : C[i] < O[i])) {
            // জোন খোঁজা: মুভে তৈরি সবচেয়ে সাম্প্রতিক FVG, নইলে OB
            var top = null, bot = null, kind = '';
            for (j = i; j >= s.sw + 2; j--) {
              if (d === 1 && L[j] > H[j - 2] && (L[j] - H[j - 2]) >= X.fvgMin * a) { top = L[j]; bot = H[j - 2]; kind = 'FVG'; break; }
              if (d === -1 && H[j] < L[j - 2] && (L[j - 2] - H[j]) >= X.fvgMin * a) { top = L[j - 2]; bot = H[j]; kind = 'FVG'; break; }
            }
            if (top === null) {
              for (j = i - 1; j >= s.sw; j--) {
                if ((d === 1 && C[j] < O[j]) || (d === -1 && C[j] > O[j])) { top = H[j]; bot = L[j]; kind = 'OB'; break; }
              }
            }
            if (top === null) { setups.splice(q, 1); continue; }
            // প্রিমিয়াম/ডিসকাউন্ট: ডিলিং রেঞ্জ = সুইপের শেষ প্রান্ত ↔ MSS লেভেল
            var lo = d === 1 ? s.ext : s.ref, hi = d === 1 ? s.ref : s.ext, mid = (top + bot) / 2, pos = hi > lo ? (mid - lo) / (hi - lo) : 0.5;
            if (d === 1 ? pos > X.discount : pos < 1 - X.discount) { setups.splice(q, 1); continue; }
            s.stage = 1; s.mss = i; s.top = top; s.bot = bot; s.kind = kind; s.pos = pos;
          }
        } else {
          if (i - s.mss > X.retWin) { setups.splice(q, 1); continue; }
          // বাতিল: জোনের ওপারে বন্ধ (mitigated) বা সুইপের শেষ প্রান্ত ভাঙা
          if (d === 1 ? (C[i] < s.bot - 0.1 * a || L[i] < s.ext - 0.05 * a) : (C[i] > s.top + 0.1 * a || H[i] > s.ext + 0.05 * a)) { setups.splice(q, 1); continue; }
          if (i > s.mss && (d === 1 ? L[i] <= s.top : H[i] >= s.bot)) s.tb = i;   // জোন ছোঁয়া (এই ক্যান্ডেলে বা সম্প্রতি)
          var touched = s.tb >= 0 && i - s.tb <= 3;
          var confirm = d === 1 ? (C[i] > O[i] && C[i] > s.bot + 0.3 * (s.top - s.bot) && (body >= 0.3 * a || (Math.min(O[i], C[i]) - L[i]) >= 0.4 * rg))
                                : (C[i] < O[i] && C[i] < s.top - 0.3 * (s.top - s.bot) && (body >= 0.3 * a || (H[i] - Math.max(O[i], C[i])) >= 0.4 * rg));
          var farOk = d === 1 ? C[i] - s.top <= X.maxFar * a : s.bot - C[i] <= X.maxFar * a;
          if (touched && confirm && farOk && i > s.mss) { if (!fireD) { fireD = d; fireS = s; } else if (fireD !== d) { fireD = 2; } setups.splice(q, 1); }
        }
      }
      if (fireD === 1 || fireD === -1) {
        sig[i] = fireD; lvl[i] = fireS.ext;
        info[i] = { dir: fireD, sweepAt: fireS.sw, swLvl: fireS.swLvl, ext: fireS.ext, mssLvl: fireS.ref, mssAt: fireS.mss, zone: fireS.kind, top: fireS.top, bot: fireS.bot, pos: fireS.pos };
      }
    }
    return { sig: sig, lvl: lvl, info: info };
  }

  R.smc = { signals: signals, CFG: CFG };
})(window.RTX);
