// ফাইলের নাম: power.js
// পাথ: js/power.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* এই ফাইল এখন "ডিসপ্যাচার": R.power.run নতুন ইঞ্জিন (decision.js) চালায়। পুরোনো ভোটিং সিস্টেম 'ক্লাসিক' হিসেবে রাখা আছে।
   cfg.engine === 'classic' হলে (বা অটো-সেটআপ optimize.js পুরোনো পদ্ধতিতে noBoard:true দিলে) ক্লাসিক চলে। */
/* RTX Chart — POWER: সব স্ট্র্যাটেজি একসাথে (ভোটিং/কনসেনসাস) + প্রতিটির ব্যাকটেস্ট স্কোরবোর্ড
   ভোটার গ্রুপ: ULTRA (৫ ইঞ্জিন) · XL (OC, Breakout, Donchian, MA Cross, Supertrend, Aroon) · UT Bot (Luxy) · JDT Supertrend
   সব সিগন্যাল শুধু বন্ধ ক্যান্ডেলে। একই ক্যান্ডেলে SL ও TP দুটোই ছুঁলে SL আগে ধরা হয়। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  /* ---------- গাণিতিক হেল্পার ---------- */
  function rma(a, n) {
    var o = new Array(a.length).fill(null), s = 0;
    for (var i = 0; i < a.length; i++) { if (i < n) { s += a[i]; if (i === n - 1) o[i] = s / n; } else o[i] = (a[i] + (n - 1) * o[i - 1]) / n; }
    return o;
  }
  function atrN(H, L, C, n) {
    var tr = H.map(function (h, i) { return i === 0 ? h - L[0] : Math.max(h - L[i], Math.abs(h - C[i - 1]), Math.abs(L[i] - C[i - 1])); });
    return rma(tr, n);
  }
  function smaArr(a, n) {
    var o = new Array(a.length).fill(null), s = 0;
    for (var i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; }
    return o;
  }
  function Z(n) { return new Array(n).fill(0); }

  /* ---------- XL: ৬টি ইঞ্জিন (সিগন্যাল: +1 / -1 / 0) ---------- */
  function engOC(O, H, L, C, n) {
    var s = Z(n), body = O.map(function (o, i) { return Math.abs(C[i] - o); });
    for (var i = 51; i < n; i++) {
      var sum = 0; for (var j = i - 50; j < i; j++) sum += body[j];
      var avg = sum / 50;
      if (avg > 0 && body[i] >= 3 * avg) {
        if (C[i] > O[i] && C[i] > Math.max(O[i - 1], C[i - 1])) s[i] = 1;
        else if (C[i] < O[i] && C[i] < Math.min(O[i - 1], C[i - 1])) s[i] = -1;
      }
    }
    return s;
  }
  function engDon(H, L, C, n) {
    var s = Z(n), up = new Array(n).fill(null), lo = new Array(n).fill(null), i, j;
    for (i = 20; i < n; i++) { var h = -Infinity, l = Infinity; for (j = i - 20; j < i; j++) { if (H[j] > h) h = H[j]; if (L[j] < l) l = L[j]; } up[i] = h; lo[i] = l; }
    for (i = 21; i < n; i++) {
      if (C[i] > up[i] && !(C[i - 1] > up[i - 1])) s[i] = 1;
      else if (C[i] < lo[i] && !(C[i - 1] < lo[i - 1])) s[i] = -1;
    }
    return s;
  }
  function engMA(C, n) {
    var s = Z(n), f = R.ultra.emaPine(C, 9), m = R.ultra.emaPine(C, 21), sl = R.ultra.emaPine(C, 55), prev = 0;
    for (var i = 0; i < n; i++) {
      var st = i < 55 ? 0 : (f[i] > m[i] && m[i] > sl[i]) ? 1 : (f[i] < m[i] && m[i] < sl[i]) ? -1 : 0;
      if (st !== 0 && st !== prev) s[i] = st;
      prev = st;
    }
    return s;
  }
  function engAroon(H, L, n, len) {
    var s = Z(n), up = new Array(n).fill(null), dn = new Array(n).fill(null), i, j;
    for (i = len; i < n; i++) {
      var hi = -Infinity, hiI = i, lo = Infinity, loI = i;
      for (j = i - len; j <= i; j++) { if (H[j] >= hi) { hi = H[j]; hiI = j; } if (L[j] <= lo) { lo = L[j]; loI = j; } }
      up[i] = 100 * (len - (i - hiI)) / len; dn[i] = 100 * (len - (i - loI)) / len;
    }
    for (i = len + 1; i < n; i++) {
      if (up[i] > dn[i] && up[i - 1] <= dn[i - 1]) s[i] = 1;
      else if (dn[i] > up[i] && dn[i - 1] <= up[i - 1]) s[i] = -1;
    }
    return s;
  }
  function engBrk(H, L, C, atr, n) {
    var s = Z(n);
    for (var i = 31; i < n; i++) {
      var a = atr[i]; if (!nn(a) || a <= 0) continue;
      var hi = -Infinity, lo = Infinity, best = 0, bh = 0, bl = 0;
      for (var len = 1; len <= 30; len++) {
        var k = i - len; if (k < 0) break;
        if (H[k] > hi) hi = H[k]; if (L[k] < lo) lo = L[k];
        if (hi - lo <= 2 * a) { if (len >= 5) { best = len; bh = hi; bl = lo; } } else break;
      }
      if (best >= 5) {
        if (C[i] > bh && C[i - 1] <= bh) s[i] = 1;
        else if (C[i] < bl && C[i - 1] >= bl) s[i] = -1;
      }
    }
    return s;
  }
  /* Supertrend (সাধারণ): ফ্লিপ = সিগন্যাল */
  function stStd(H, L, C, n, period, mult) {
    var atr = atrN(H, L, C, period), up = new Array(n).fill(null), dn = new Array(n).fill(null), dir = new Array(n).fill(1), flip = Z(n);
    for (var i = 0; i < n; i++) {
      if (!nn(atr[i])) continue;
      var m = (H[i] + L[i]) / 2, u = m - mult * atr[i], d = m + mult * atr[i];
      if (i > 0 && nn(up[i - 1])) { u = C[i - 1] > up[i - 1] ? Math.max(u, up[i - 1]) : u; d = C[i - 1] < dn[i - 1] ? Math.min(d, dn[i - 1]) : d; }
      up[i] = u; dn[i] = d;
      var t = i > 0 ? dir[i - 1] : 1;
      if (i > 0 && nn(dn[i - 1])) { if (t === -1 && C[i] > dn[i - 1]) t = 1; else if (t === 1 && C[i] < up[i - 1]) t = -1; }
      dir[i] = t;
      if (i > 0 && nn(atr[i - 1]) && t !== dir[i - 1]) flip[i] = t;
    }
    return { dir: dir, flip: flip };
  }

  /* ---------- JDT Supertrend (বাফার জোনসহ) ---------- */
  function jdt(H, L, C, n) {
    var atr = atrN(H, L, C, 10), tu = new Array(n).fill(0), td = new Array(n).fill(0), tr = new Array(n).fill(1), sig = Z(n);
    for (var i = 0; i < n; i++) {
      if (!nn(atr[i])) { tu[i] = (H[i] + L[i]) / 2; td[i] = tu[i]; continue; }
      var m = (H[i] + L[i]) / 2, up = m - 3 * atr[i], dn = m + 3 * atr[i];
      tu[i] = (i > 0 && C[i - 1] > tu[i - 1]) ? Math.max(up, tu[i - 1]) : up;
      td[i] = (i > 0 && C[i - 1] < td[i - 1]) ? Math.min(dn, td[i - 1]) : dn;
      if (i > 0) tr[i] = C[i] > td[i - 1] ? 1 : C[i] < tu[i - 1] ? -1 : tr[i - 1];
      var st = tr[i] === 1 ? tu[i] : td[i], buf = st * 0.01 / 100;
      if (i > 0 && nn(atr[i - 1])) {
        if (C[i] > st + buf && tr[i - 1] === -1) sig[i] = 1;
        else if (C[i] < st - buf && tr[i - 1] === 1) sig[i] = -1;
      }
    }
    return sig;
  }

  /* ---------- Luxy UT Bot (ATR ট্রেইলিং স্টপ, Smart Chop সহ) ---------- */
  function engUT(H, L, C, V, atr14, atrAvg, n, tfSec, info) {
    var p = tfSec <= 300 ? [1.0, 7, 1.3] : tfSec <= 3600 ? [1.5, 10, 1.1] : tfSec < 604800 ? [2.0, 14, 1.0] : [2.5, 20, 0.9];
    var assetMult = info.isFx ? 0.8 : info.isXAU ? 1.0 : 1.5;
    var xatr = atrN(H, L, C, p[1]), vsma = smaArr(V, 20), stop = new Array(n).fill(null), sig = Z(n), last = -1e9;
    for (var i = 0; i < n; i++) {
      if (!nn(xatr[i])) continue;
      var prev = i > 0 ? stop[i - 1] : null;
      if (!nn(prev)) { stop[i] = C[i]; continue; }
      var vr = nn(atr14[i]) && nn(atrAvg[i]) && atrAvg[i] > 0 ? atr14[i] / atrAvg[i] : 1;
      var adapt = vr < 0.8 ? 0.85 : vr > 1.2 ? 1.15 : 1.0;
      var er = 0;
      if (i >= 10) { var chg = Math.abs(C[i] - C[i - 10]), tot = 0; for (var j = i - 9; j <= i; j++) tot += Math.abs(C[j] - C[j - 1]); er = tot > 0 ? chg / tot : 0; }
      var volR = nn(vsma[i]) && vsma[i] > 0 ? Math.max(0.8, Math.min(1.2, V[i] / vsma[i])) : 1;
      var dist = xatr[i] * p[0] * assetMult * adapt * volR * (1 + (1 - er) * p[2]), c = C[i], c1 = C[i - 1];
      if (c > prev && c1 > prev) stop[i] = Math.max(prev, c - dist);
      else if (c < prev && c1 < prev) stop[i] = Math.min(prev, c + dist);
      else if (c > prev) stop[i] = c - dist;
      else stop[i] = c + dist;
      if (i > 0 && nn(stop[i - 1]) && i - last >= 3) {
        if (C[i] > stop[i] && C[i - 1] <= stop[i - 1]) { sig[i] = 1; last = i; }
        else if (C[i] < stop[i] && C[i - 1] >= stop[i - 1]) { sig[i] = -1; last = i; }
      }
    }
    return sig;
  }

  /* ---------- ব্যাকটেস্ট (সব স্ট্র্যাটেজির জন্য একই নিয়ম: SL 1.5×ATR, TP 2R) ---------- */
  function sim(sig, atr, H, L, C, n) {
    var w = 0, l = 0, i = 0, j;
    while (i < n - 1) {
      if (sig[i] !== 0 && nn(atr[i]) && atr[i] > 0) {
        var d = sig[i], e = C[i], r = 1.5 * atr[i], sl = e - d * r, tp = e + d * r * 2, res = 0;
        for (j = i + 1; j < n; j++) {
          var hs = d === 1 ? L[j] <= sl : H[j] >= sl, ht = d === 1 ? H[j] >= tp : L[j] <= tp;
          if (hs) { res = -1; break; }
          if (ht) { res = 1; break; }
        }
        if (res === 0) break;
        if (res === 1) w++; else l++;
        i = j + 1;
      } else i++;
    }
    var t = w + l;
    return { n: t, win: t ? w / t * 100 : 0, exp: t ? (w * 2 - l) / t : 0 };
  }

  /* ================= কনসেনসাস ইঞ্জিন ================= */
  function prep(cs, base, info, tfSec) {
    var n = cs.length, i, k;
    var O = [], H = [], L = [], C = [], V = [], T = [];
    for (i = 0; i < n; i++) { O[i] = cs[i].open; H[i] = cs[i].high; L[i] = cs[i].low; C[i] = cs[i].close; V[i] = cs[i].volume || 0; T[i] = cs[i].time; }
    var A = base.arr, atr = A.atr, atrAvg = A.atrAvg, h4 = A.h4, h1 = A.h1, ct = A.ct;
    var mt = info.mintick, dec = info.dec;
    function rt(x) { return +(Math.round(x / mt) * mt).toFixed(dec); }

    var oc = engOC(O, H, L, C, n), don = engDon(H, L, C, n), ma = engMA(C, n), ar = engAroon(H, L, n, 14), br = engBrk(H, L, C, atr, n);
    var st = stStd(H, L, C, n, 10, 3), ut = engUT(H, L, C, V, atr, atrAvg, n, tfSec, info), jd = jdt(H, L, C, n);
    var XL = [['OC', oc], ['Breakout', br], ['Donchian', don], ['MA Cross', ma], ['Supertrend', st.flip], ['Aroon', ar]];
    var xl = Z(n), xlN = new Array(n);
    for (i = 0; i < n; i++) {
      var sum = 0, nm = [];
      XL.forEach(function (e) { if (e[1][i] !== 0) { sum += e[1][i]; nm.push(e[0]); } });
      xl[i] = sum > 0 ? 1 : sum < 0 ? -1 : 0; xlN[i] = nm;
    }
    var ule = A.rawDir;

    // প্রসঙ্গ ফিল্টার: EMA100, VWAP (দৈনিক রিসেট), Heikin Ashi, ফিবো গোল্ডেন জোন
    var e100 = R.ultra.emaPine(C, 100), vw = new Array(n), pv = 0, vv = 0, day = -1;
    var haC = [], haO = [];
    for (i = 0; i < n; i++) {
      var d0 = Math.floor(T[i] / 86400); if (d0 !== day) { day = d0; pv = 0; vv = 0; }
      var tp3 = (H[i] + L[i] + C[i]) / 3, w = V[i] > 0 ? V[i] : 1; pv += tp3 * w; vv += w; vw[i] = pv / vv;
      haC[i] = (O[i] + H[i] + L[i] + C[i]) / 4; haO[i] = i === 0 ? (O[0] + C[0]) / 2 : (haO[i - 1] + haC[i - 1]) / 2;
    }

    return { n: n, tf: tfSec, A: A, O: O, H: H, L: L, C: C, V: V, T: T, atr: atr, atrAvg: atrAvg, h4: h4, h1: h1, ct: ct, XL: XL, xl: xl, xlN: xlN, ut: ut, jd: jd, st: st, ule: ule, e100: e100, vw: vw, haC: haC, haO: haO };
  }

  function getP(cs, base, info, tfSec) { return (base._pw && base._pw.n === cs.length && base._pw.tf === tfSec) ? base._pw : (base._pw = prep(cs, base, info, tfSec)); }

  function runClassic(cs, base, cfg, info, tfSec, htfMode) {
    var P = getP(cs, base, info, tfSec);
    var n = P.n, i, k, A = P.A, O = P.O, H = P.H, L = P.L, C = P.C, V = P.V, T = P.T, atr = P.atr, atrAvg = P.atrAvg, h4 = P.h4, h1 = P.h1, ct = P.ct;
    var XL = P.XL, xl = Z(n), xlN = new Array(n), ut = P.ut, jd = P.jd, st = P.st, ule = P.ule, e100 = P.e100, vw = P.vw, haC = P.haC, haO = P.haO;
    var mt = info.mintick, dec = info.dec;
    function rt(x) { return +(Math.round(x / mt) * mt).toFixed(dec); }

    var xon = [cfg.xOC !== false, cfg.xBrk !== false, cfg.xDon !== false, cfg.xMA !== false, cfg.xST !== false, cfg.xAr !== false];
    for (i = 0; i < n; i++) {
      var xs = 0, xm = [];
      for (k = 0; k < 6; k++) if (xon[k] && XL[k][1][i] !== 0) { xs += XL[k][1][i]; xm.push(XL[k][0]); }
      xl[i] = xs > 0 ? 1 : xs < 0 ? -1 : 0; xlN[i] = xm;
    }
    var enG = [!!cfg.gUltra, !!cfg.gXl, !!cfg.gUt, !!cfg.gJdt], gArr = [ule, xl, ut, jd], gName = ['ULTRA', 'XL', 'UT Bot', 'JDT ST'];
    var win = Math.max(1, cfg.pwWin | 0), minV = Math.max(1, Math.min(4, cfg.pwVotes | 0));
    var trades = [], cur = null, lastSig = -100000, sigBars = Z(n);

    for (i = 0; i < n; i++) {
      var a = atr[i];
      if (cur && cur.status >= 1 && cur.status <= 3 && i > cur.bar) {
        var ev = R.ultra.stepTrade(cur, H[i], L[i], i, cfg.beOn);
        cur.endTime = T[i];
        for (k = 0; k < ev.length; k++) cur.events.push({ time: T[i], type: ev[k] });
      }
      if (!nn(a) || a <= 0 || i < 60) continue;
      var fired = 0;
      for (k = 0; k < 4; k++) if (enG[k] && gArr[k][i] !== 0) fired = gArr[k][i];
      if (fired === 0) continue;

      // ভোট গণনা (জানালার মধ্যে একই দিকের গ্রুপ)
      var vb = 0, vs = 0, who = [];
      for (k = 0; k < 4; k++) {
        if (!enG[k]) continue;
        var hb = false, hs = false;
        for (var q = Math.max(0, i - win + 1); q <= i; q++) { if (gArr[k][q] === 1) hb = true; if (gArr[k][q] === -1) hs = true; }
        if (hb) vb++; if (hs) vs++;
        who.push([k, hb, hs]);
      }
      var dir = vb > vs ? 1 : vs > vb ? -1 : 0, votes = dir === 1 ? vb : vs;
      if (dir === 0 || votes < minV) continue;
      // নতুন ট্রিগার: এই বারেই অন্তত একটি গ্রুপ ওই দিকে সিগন্যাল দিয়েছে
      var trig = false; for (k = 0; k < 4; k++) if (enG[k] && gArr[k][i] === dir) trig = true;
      if (!trig) continue;

      var live = cur && cur.status >= 1 && cur.status <= 3;
      var se = R.ultra.sessOf(T[i], tfSec, info, cfg);
      var volOK = !cfg.volFilter || (nn(atrAvg[i]) && a >= atrAvg[i] * cfg.volLow && a <= atrAvg[i] * cfg.volHigh);
      if (!(se.ok && volOK && (i - lastSig > cfg.cooldown) && !(cfg.oneTrade && live))) continue;
      var H4 = h4[i], H1 = h1[i];
      if (cfg.pwHtf && htfMode !== 'Off' && (H4 === -dir || H1 === -dir)) continue;

      // স্কোর
      var sc = 35 + 12 * votes;
      sc += H4 === dir ? 10 : (H4 === 0 ? 4 : 0); sc += H1 === dir ? 8 : (H1 === 0 ? 3 : 0);
      sc += (dir === 1 ? C[i] > e100[i] : C[i] < e100[i]) ? 5 : 0;
      sc += ct[i] === dir ? 5 : 0;
      sc += (dir === 1 ? haC[i] > haO[i] : haC[i] < haO[i]) ? 3 : 0;
      sc += (dir === 1 ? C[i] > vw[i] : C[i] < vw[i]) ? 3 : 0;
      sc += st.dir[i] === dir ? 4 : 0;
      var rh = -Infinity, rl = Infinity; for (k = Math.max(0, i - 49); k <= i; k++) { if (H[k] > rh) rh = H[k]; if (L[k] < rl) rl = L[k]; }
      var rg = rh - rl, f618 = dir === 1 ? rh - rg * 0.618 : rl + rg * 0.618, f800 = dir === 1 ? rh - rg * 0.8 : rl + rg * 0.8;
      sc += (rg > 0 && C[i] >= Math.min(f618, f800) && C[i] <= Math.max(f618, f800)) ? 3 : 0;
      var score = Math.min(100, Math.round(sc));
      if (score < cfg.pwMinScore) continue;

      // এন্ট্রি / SL (স্ট্রাকচার) / TP
      var entry = rt(C[i]), ext = dir === 1 ? Infinity : -Infinity;
      for (k = Math.max(0, i - 4); k <= i; k++) ext = dir === 1 ? Math.min(ext, L[k]) : Math.max(ext, H[k]);
      if (ule[i] === dir && nn(A.rawLvl[i])) ext = dir === 1 ? Math.min(ext, A.rawLvl[i]) : Math.max(ext, A.rawLvl[i]);
      var rawDist = dir === 1 ? entry - (ext - cfg.slBuf * a) : (ext + cfg.slBuf * a) - entry;
      var dist = Math.max(rawDist, cfg.slMinAtr * a);
      if (!(dist > 0 && dist <= cfg.slMaxAtr * a)) continue;
      var sl = rt(entry - dir * dist), riskD = Math.abs(entry - sl);
      if (!(riskD > mt * 2)) continue;
      var tp1 = rt(entry + dir * riskD * cfg.tp1R), tp2 = rt(entry + dir * riskD * cfg.tp2R), tp3 = rt(entry + dir * riskD * cfg.tp3R);

      var pvl = info.qUsd ? info.pip * info.cSize : (info.baseUsd ? info.pip * info.cSize / entry : null);
      var slPips = riskD / info.pip, riskUsd = cfg.balance * cfg.riskPct / 100;
      var lotRaw = (pvl !== null && pvl > 0 && slPips > 0) ? riskUsd / (slPips * pvl) : null;
      var lot = lotRaw === null ? null : Math.max(0.01, Math.round(lotRaw * 100) / 100);

      var agree = [];
      who.forEach(function (x) {
        if (!(dir === 1 ? x[1] : x[2])) return;
        var nm = gName[x[0]];
        if (x[0] === 1) { var names = []; for (var qq = Math.max(0, i - win + 1); qq <= i; qq++) if (xl[qq] === dir) names = names.concat(xlN[qq]); nm += '(' + names.filter(function (v, ix, ar2) { return ar2.indexOf(v) === ix; }).join('+') + ')'; }
        agree.push(nm);
      });
      if (live) cur.status = 7;
      cur = {
        dir: dir, bar: i, time: T[i], endTime: T[i], end: i, status: 1, score: score, grade: score >= 85 ? 'A+ ULTRA' : score >= 75 ? 'A STRONG' : 'B',
        entry: entry, sl: sl, slNow: sl, tp1: tp1, tp2: tp2, tp3: tp3, lot: lot, riskUsd: riskUsd, riskD: riskD,
        mode: 'POWER ' + votes + '/' + enG.filter(Boolean).length, extra: agree.join(', '), events: [], tp1Hit: false, beMoved: false
      };
      trades.push(cur); lastSig = i; sigBars[i] = dir;
    }

    // স্কোরবোর্ড
    if (cfg.noBoard) return { trades: trades, closed: n, now: base.now, board: null };
    return { trades: trades, closed: n, now: base.now, board: makeBoard(P, sigBars) };
  }

  /* প্রতিটি স্ট্র্যাটেজির আলাদা ব্যাকটেস্ট স্কোরবোর্ড (SL 1.5×ATR, TP 2R) */
  function makeBoard(P, sigBars) {
    var rows = [['POWER (কনসেনসাস)', sigBars], ['ULTRA', P.ule]].concat(P.XL.map(function (e) { return [e[0], e[1]]; })).concat([['UT Bot', P.ut], ['JDT Supertrend', P.jd]]);
    return rows.map(function (r) { var q = sim(r[1], P.atr, P.H, P.L, P.C, P.n); return { name: r[0], n: q.n, win: q.win, exp: q.exp }; });
  }

  function run(cs, base, cfg, info, tfSec, htfMode) {
    if (cfg.strategy && cfg.strategy !== 'raid' && R.strat && R.strat.isStrat(cfg.strategy)) return R.strat.run(cs, base, cfg, info, tfSec, htfMode);
    if (cfg.engine === 'raid' && R.raid) return R.raid.run(cs, base, cfg, info, tfSec, htfMode);
    if ((cfg.engine === 'classic' || cfg.noBoard) || !R.decision) return runClassic(cs, base, cfg, info, tfSec, htfMode);
    return R.decision.run(cs, base, cfg, info, tfSec, htfMode);
  }

  R.power = { run: run, runClassic: runClassic, prep: getP, board: makeBoard, sim: sim,  engines: { oc: engOC, don: engDon, ma: engMA, aroon: engAroon, brk: engBrk, st: stStd, jdt: jdt, ut: engUT }, atrN: atrN };
})(window.RTX);

/* ---------- TradingView ট্যাব: অফিসিয়াল ফ্রি উইজেট (কী লাগে না, অরিজিনাল ক্যান্ডেল) ---------- */
(function (R) {
  'use strict';
  if (typeof document === 'undefined') return;
  var sec = document.getElementById('view-tv'); if (!sec) return;
  var st = document.createElement('style'); st.textContent = '#view-tv.active{display:flex;flex-direction:column;overflow:hidden;background:#000}#view-tv .tradingview-widget-container{flex:1;min-height:0}'; document.head.appendChild(st);
  var DEFAULT = 'OANDA:XAUUSD', loaded = false;
  function sym() { try { return localStorage.getItem('rtx_tv_sym') || DEFAULT; } catch (_) { return DEFAULT; } }
  function build() {
    var s = sym();
    sec.innerHTML = '<div class="row" style="padding:8px;display:flex;gap:6px"><input id="tv-sym" style="flex:1" value="' + s.replace(/"/g, '') + '" placeholder="OANDA:XAUUSD"><button class="btn" id="tv-go">লোড</button></div>' +
      '<div style="padding:0 8px 6px;font-size:12px;color:#8b8b8b">উদাহরণ: OANDA:XAUUSD · FX:EURUSD · BINANCE:BTCUSDT · TVC:DXY। এটা TradingView-এর নিজের চার্ট, তাই ক্যান্ডেল একদম অরিজিনাল। তবে আমাদের সিগন্যাল এর ওপর আঁকা যায় না। সিগন্যাল দেখতে "চার্ট" ট্যাবে BINANCE সিম্বল ব্যবহার করো।</div>' +
      '<div id="tv-box" class="tradingview-widget-container"></div>';
    var box = document.getElementById('tv-box'), inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget'; inner.style.height = '100%'; box.appendChild(inner);
    var sc = document.createElement('script'); sc.async = true;
    sc.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    sc.text = JSON.stringify({ autosize: true, symbol: s, interval: '15', timezone: 'Asia/Dhaka', theme: 'dark', style: '1', locale: 'en', backgroundColor: '#000000', gridColor: 'rgba(255,255,255,0.06)', allow_symbol_change: true, hide_side_toolbar: false, save_image: true, support_host: 'https://www.tradingview.com' });
    box.appendChild(sc);
    document.getElementById('tv-go').onclick = function () { var v = document.getElementById('tv-sym').value.trim(); if (v) { try { localStorage.setItem('rtx_tv_sym', v); } catch (_) {} build(); } };
  }
  document.querySelectorAll('#bottomnav button').forEach(function (b) {
    if (b.getAttribute('data-view') === 'tv') b.addEventListener('click', function () { if (!loaded) { loaded = true; build(); } });
  });
})(window.RTX);
