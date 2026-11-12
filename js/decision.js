// ফাইলের নাম: decision.js
// পাথ: js/decision.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — নতুন POWER সিদ্ধান্ত ইঞ্জিন
   পুরোনো পদ্ধতিতে "কয়জন একমত" গোনা হতো। এখন প্রতিটি গ্রুপের আলাদা কাজ আছে:
     ১) সেটআপ     = ULTRA-র ৫টি ইঞ্জিন + BOS রিটেস্ট + ডিসপ্লেসমেন্ট/FVG   (কোথায় ঢুকব)
     ২) ট্রিগার    = XL-এর ব্রেকআউট/মোমেন্টাম বা স্ট্রাকচার ভাঙা           (কখন ঢুকব)
     ৩) ট্রেন্ড নিশ্চিতকরণ = UT Bot + JDT + Supertrend তিনটি মিলে মাত্র ১টি ভোট (একই ATR তথ্য বারবার গোনা বন্ধ)
     ৪) প্রসঙ্গ    = বড় টাইমফ্রেম (4H/1H) + মার্কেট স্ট্রাকচার + বাজারের অবস্থা
   স্কোর ১০০: সেটআপ/ট্রিগার ৩০ + মোমেন্টাম ১৫ + ট্রেন্ড ১৫ + HTF ১৫ + স্ট্রাকচার ১৫ + বাজারের অবস্থা ১০।
   স্কোর জেতার সম্ভাবনা নয়, শুধু কতগুলো শর্ত মিলেছে তা বলে।
   সিগন্যালের আগে ১০টি শর্তের "Quality Gate" পার হতে হয়। প্রতিটি সিগন্যালের সাথে why (কেন) তথ্য থাকে, AI ও ড্যাশবোর্ড এটা পড়ে বুঝিয়ে দেয়। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }
  function Z(n) { return new Array(n).fill(0); }

  /* তিনটি মোড — শুরুর মান (পরীক্ষায় প্রমাণিত সেরা মান নয়)। cfg.ov দিয়ে আলাদা মান বদলানো যায় */
  var MODES = {
    safe: { minScore: 85, htf: 'strict', slMode: 'structure', minRoomR: 1.5, cooldown: 12, volLow: 0.6, volHigh: 2.5, maxRiskPct: 2, needStructure: true, counter: false, dailyLossR: 2, maxConsec: 3, pauseBars: 20 },
    smart: { minScore: 75, htf: 'normal', slMode: 'auto', minRoomR: 1.5, cooldown: 8, volLow: 0.5, volHigh: 3, maxRiskPct: 3, needStructure: false, counter: false, dailyLossR: 2, maxConsec: 3, pauseBars: 12 },
    aggressive: { minScore: 65, htf: 'loose', slMode: 'auto', minRoomR: 1.0, cooldown: 5, volLow: 0.4, volHigh: 3.5, maxRiskPct: 5, needStructure: false, counter: true, dailyLossR: 2, maxConsec: 3, pauseBars: 8 }
  };
  var MODE_INFO = {
    safe: { name: 'SAFE (নিরাপদ)', desc: 'শুধু সবচেয়ে ভালো মানের সিগন্যাল। বড় টাইমফ্রেম পুরোপুরি মিলতে হবে, SL আসল স্ট্রাকচারে বসবে। সিগন্যাল কম আসে, ঝুঁকিও কম।' },
    smart: { name: 'SMART (সুষম, শুরুর জন্য)', desc: 'ভারসাম্যপূর্ণ। স্ট্রাকচার, মোমেন্টাম ও ট্রেন্ড মিলিয়ে সিদ্ধান্ত। শুরুতে এটা ব্যবহার করো।' },
    aggressive: { name: 'AGGRESSIVE (বেশি সিগন্যাল)', desc: 'বেশি সিগন্যাল, আগেভাগে ব্রেকআউট, কড়া শর্তে ট্রেন্ডের বিপরীতেও সেটআপ। ঝুঁকির সীমা তবু কড়া থাকে, কিন্তু লসের হারও বেশি হতে পারে।' }
  };
  var ULTRA_BN = ['লিকুইডিটি সুইপ রিক্লেইম', 'CRT + TBS', 'Wyckoff স্প্রিং/আপথ্রাস্ট', 'Quasimodo + SMC', 'প্রাইস অ্যাকশন + Fib গোল্ডেন পকেট'];
  var TYPE_BN = { setup: 'সেটআপ (রিভার্সাল/লিকুইডিটি)', breakout: 'ব্রেকআউট / মোমেন্টাম', trend: 'ট্রেন্ড-ফলো' };
  var REJ_BN = {
    regime: 'বাজারের অবস্থা উপযোগী নয়', htf: 'বড় টাইমফ্রেম (4H/1H) বিপরীতে', structure: 'স্ট্রাকচারের সমর্থন নেই', score: 'স্কোর সীমার নিচে',
    session: 'সেশনের বাইরে', vol: 'ভোলাটিলিটি ঠিক নেই', news: 'নিউজ-বিরতির সময়', live: 'আগের ট্রেড এখনো চলছে', cooldown: 'আগের সিগন্যালের পর বিরতি',
    daily: 'দৈনিক লস সীমা', consec: 'পরপর লসের বিরতি', lotrisk: 'ব্যালেন্সের তুলনায় ঝুঁকি বেশি', sl: 'গ্রহণযোগ্য SL নেই', room: 'TP পর্যন্ত জায়গা কম', conflict: 'BUY ও SELL দুই দিকেই ট্রিগার'
  };
  var BRK_NAMES = { 'OC': 1, 'Breakout': 1, 'Donchian': 1 };

  function modeOf(cfg) { var m = MODES[cfg.mode] ? cfg.mode : 'smart'; return { key: m, M: Object.assign({}, MODES[m], cfg.ov || {}) }; }
  function ffill(sig) { var o = Z(sig.length), s = 0; for (var i = 0; i < sig.length; i++) { if (sig[i] !== 0) s = sig[i]; o[i] = s; } return o; }

  /* সিগন্যাল-নির্ভর নয় এমন সব হিসাব একবার করে রাখা (cfg বদলালেও আবার করতে হয় না) */
  function prepD(P, info, tfSec) {
    var n = P.n, i, j;
    var reg = R.regime.compute(P.O, P.H, P.L, P.C);
    var S = R.structure.compute(P.O, P.H, P.L, P.C, P.atr, { len: 3 });
    var utS = ffill(P.ut), jdS = ffill(P.jd), stS = P.st.dir.map(function (v) { return v === -1 ? -1 : 1; });
    var sBOS = Z(n), sBOSlvl = new Array(n).fill(null), sDF = Z(n), sDFlvl = new Array(n).fill(null);
    var O = P.O, H = P.H, L = P.L, C = P.C, atr = P.atr;

    // BOS রিটেস্ট: স্ট্রাকচার ভাঙার পর ২০ বারের মধ্যে ভাঙা লেভেলে ফিরে এসে রিজেকশন ক্যান্ডেল
    for (i = 0; i < n; i++) {
      var d = S.bos[i] || S.choch[i]; if (d === 0 || !nn(S.bosLvl[i])) continue;
      var lvl = S.bosLvl[i];
      for (j = i + 1; j <= Math.min(n - 1, i + 20); j++) {
        var a = atr[j]; if (!nn(a)) continue;
        if (d === 1) {
          if (C[j] < lvl - 0.1 * a) break;
          if (L[j] <= lvl + 0.25 * a && C[j] > lvl && C[j] > O[j] && H[j] > L[j] && (C[j] - L[j]) >= 0.5 * (H[j] - L[j])) { if (sBOS[j] === 0) { sBOS[j] = 1; sBOSlvl[j] = L[j]; } break; }
        } else {
          if (C[j] > lvl + 0.1 * a) break;
          if (H[j] >= lvl - 0.25 * a && C[j] < lvl && C[j] < O[j] && H[j] > L[j] && (H[j] - C[j]) >= 0.5 * (H[j] - L[j])) { if (sBOS[j] === 0) { sBOS[j] = -1; sBOSlvl[j] = H[j]; } break; }
        }
      }
    }
    // ডিসপ্লেসমেন্ট + FVG: জোরালো ক্যান্ডেলের তৈরি ফাঁকে ১২ বারের মধ্যে ফিরে এসে রিজেকশন
    S.zones.forEach(function (z) {
      if (!z.disp) return;
      for (var q = z.bar + 1; q <= Math.min(n - 1, z.bar + 12); q++) {
        if (z.mit !== null && q >= z.mit) break;
        if (z.dir === 1) {
          if (C[q] < z.bot) break;
          if (L[q] <= z.top && C[q] > O[q] && C[q] > z.bot) { if (sDF[q] === 0) { sDF[q] = 1; sDFlvl[q] = Math.min(L[q], z.bot); } break; }
        } else {
          if (C[q] > z.top) break;
          if (H[q] >= z.bot && C[q] < O[q] && C[q] < z.top) { if (sDF[q] === 0) { sDF[q] = -1; sDFlvl[q] = Math.max(H[q], z.top); } break; }
        }
      }
    });
    return { n: n, tf: tfSec, reg: reg, S: S, utS: utS, jdS: jdS, stS: stS, sBOS: sBOS, sBOSlvl: sBOSlvl, sDF: sDF, sDFlvl: sDFlvl };
  }

  function run(cs, base, cfg, info, tfSec, htfMode) {
    var P = R.power.prep(cs, base, info, tfSec);
    var D = (base._dc && base._dc.n === P.n && base._dc.tf === tfSec) ? base._dc : (base._dc = prepD(P, info, tfSec));
    var n = P.n, i, k;
    var O = P.O, H = P.H, L = P.L, C = P.C, T = P.T, atr = P.atr, atrAvg = P.atrAvg, h4 = P.h4, h1 = P.h1, S = D.S, RG = D.reg;
    var mo = modeOf(cfg), M = mo.M, mode = mo.key, spec = R.trade.specFor(info, cfg), mt = info.mintick, dec = info.dec;
    function rt(x) { return +(Math.round(x / mt) * mt).toFixed(dec); }
    var rawEng = base.arr && base.arr.rawEng ? base.arr.rawEng : null, setupLvlArr = base.arr ? base.arr.rawLvl : null;

    // XL: গ্রুপ হিসেবে একটাই (ভেতরের মোডগুলো সেটিংসের টিক অনুযায়ী)
    var XL = P.XL, xon = [cfg.xOC !== false, cfg.xBrk !== false, cfg.xDon !== false, cfg.xMA !== false, cfg.xST !== false, cfg.xAr !== false];
    var xl = Z(n), xlN = new Array(n);
    for (i = 0; i < n; i++) {
      var xs = 0, xm = [];
      for (k = 0; k < 6; k++) if (xon[k] && XL[k][1][i] !== 0) { xs += XL[k][1][i]; xm.push(XL[k][0]); }
      xl[i] = xs > 0 ? 1 : xs < 0 ? -1 : 0; xlN[i] = xm;
    }
    var enSetup = cfg.gUltra !== false;

    var risk = new R.trade.RiskState(M);
    var lotMode = cfg.lotMode === 'risk' ? 'risk' : 'fixed', lotFixed = cfg.lot > 0 ? +cfg.lot : 0.01, balance = cfg.balance > 0 ? +cfg.balance : 1000, riskPctCfg = cfg.riskPct > 0 ? +cfg.riskPct : 1;
    var trades = [], cur = null, lastSig = -1e9, sigBars = Z(n), stats = { candidates: 0, signals: 0, rejected: {} }, lastEval = null;

    function famCount(i, d) { return (D.utS[i] === d ? 1 : 0) + (D.jdS[i] === d ? 1 : 0) + (D.stS[i] === d ? 1 : 0); }
    function recentBreak(i, d) { for (var q = Math.max(0, i - 9); q <= i; q++) if (S.bos[q] === d || S.choch[q] === d) return S.bos[q] === d ? 'BOS' : 'CHoCH'; return null; }
    function momRecent(i, d) { for (var q = Math.max(0, i - 2); q <= i; q++) if (xl[q] === d) return true; return false; }

    function candidate(i, d) {
      var eng = [];
      if (enSetup && P.ule[i] === d) {
        if (rawEng && rawEng[i] && rawEng[i].length) rawEng[i].forEach(function (e) { eng.push(ULTRA_BN[e]); });
        else eng.push('ULTRA সেটআপ');
      }
      if (D.sBOS[i] === d) eng.push('BOS রিটেস্ট');
      if (D.sDF[i] === d) eng.push('ডিসপ্লেসমেন্ট + FVG');
      var brk = xlN[i].filter(function (nm) { return BRK_NAMES[nm]; }), xlNow = xl[i] === d;
      var flip = P.ut[i] === d || P.jd[i] === d || P.st.flip[i] === d, strBreak = S.bos[i] === d || S.choch[i] === d;
      var type = null;
      if (eng.length) type = 'setup';
      else if ((xlNow && brk.length) || (strBreak && momRecent(i, d))) type = 'breakout';
      else if (flip && famCount(i, d) >= 2) type = 'trend';
      if (!type) return null;
      var lvl = null;
      if (type === 'setup') {
        var ls = [];
        if (P.ule[i] === d && nn(setupLvlArr[i])) ls.push(setupLvlArr[i]);
        if (D.sBOS[i] === d) ls.push(D.sBOSlvl[i]);
        if (D.sDF[i] === d) ls.push(D.sDFlvl[i]);
        if (ls.length) lvl = d === 1 ? Math.min.apply(null, ls) : Math.max.apply(null, ls);
      }
      return { dir: d, type: type, eng: eng, xlNames: xlN[i], xlNow: xlNow, flip: flip, strBreak: strBreak, lvl: lvl };
    }

    function evaluate(i, c) {
      var d = c.dir, a = atr[i], G = [], parts = {}, notes = [];
      var rgCode = RG.reg[i], bias = RG.bias[i];
      function gate(n, key, label, ok, note, block) { G.push({ n: n, key: key, label: label, ok: !!ok, note: note || '', block: block !== false }); }

      // ১) বাজারের অবস্থা
      var al = R.regime.allows(rgCode, c.type, mode, d, bias);
      gate(1, 'regime', 'বাজারের অবস্থা এই ধরনের এন্ট্রির উপযোগী', al.ok, R.regime.NAMES[rgCode] + (al.ok ? '' : ' — ' + al.why));

      // ২) বড় টাইমফ্রেম
      var H4 = h4[i], H1 = h1[i], opp = (H4 === -d ? 1 : 0) + (H1 === -d ? 1 : 0), same = (H4 === d ? 1 : 0) + (H1 === d ? 1 : 0), htfOk = true, htfNote = '4H ' + biasBn(H4) + ', 1H ' + biasBn(H1);
      if (htfMode !== 'Off') {
        if (M.htf === 'strict') htfOk = opp === 0 && same >= 1;
        else if (M.htf === 'normal') htfOk = opp === 0;
        else htfOk = opp === 0 || (opp === 1 && M.counter && c.type === 'setup');
        if (!htfOk) htfNote += ' — ' + (M.htf === 'strict' && opp === 0 ? 'কোনোটিই আমার দিকে নয়' : 'বিপরীতে');
      } else htfNote = 'HTF ফিল্টার বন্ধ';
      var counter = htfMode !== 'Off' && opp === 1 && htfOk;
      gate(2, 'htf', 'বড় টাইমফ্রেম (4H/1H) বিরোধী নয়', htfOk, htfNote);

      // স্কোর অংশ
      var nEng = c.eng.length + (c.type === 'setup' ? 0 : 0);
      parts.setup = c.type === 'setup' ? Math.min(30, 20 + 5 * (nEng - 1)) : c.type === 'breakout' ? 18 : 14;
      parts.momentum = c.xlNow ? 15 : (momRecent(i, d) ? 10 : 0);
      var fc = famCount(i, d); parts.trend = fc === 3 ? 15 : fc === 2 ? 10 : fc === 1 ? 4 : 0;
      parts.htf = htfMode === 'Off' ? 8 : ((H4 === d ? 8 : H4 === 0 ? 3 : 0) + (H1 === d ? 7 : H1 === 0 ? 2 : 0));
      var rb = recentBreak(i, d), zone = d === 1 ? (S.bullOB[i] || S.bullZone[i]) : (S.bearOB[i] || S.bearZone[i]), pdv = S.pd[i];
      var pdOk = nn(pdv) && (d === 1 ? pdv < 0.5 : pdv > 0.5);
      parts.structure = (S.trend[i] === d ? 5 : 0) + (rb ? 5 : 0) + (zone ? 3 : 0) + (pdOk ? 2 : 0);
      parts.regime = al.ok ? 10 : 0;
      var score = Math.min(100, Math.round(parts.setup + parts.momentum + parts.trend + parts.htf + parts.structure + parts.regime));

      // ৩) স্ট্রাকচার
      var stOk = S.trend[i] === d || !!rb || !!zone;
      gate(3, 'structure', 'মার্কেট স্ট্রাকচার সমর্থন করছে', stOk, 'ট্রেন্ড-স্ট্রাকচার ' + biasBn(S.trend[i]) + (rb ? ', সাম্প্রতিক ' + rb : '') + (zone ? ', গুরুত্বপূর্ণ জোনে আছে' : '') + (pdOk ? ', ' + (d === 1 ? 'ডিসকাউন্ট' : 'প্রিমিয়াম') + ' এলাকায়' : ''), !!M.needStructure);
      // ৪, ৫) ট্রিগার
      gate(4, 'trigger', 'এন্ট্রি ট্রিগার পাওয়া গেছে', true, TYPE_BN[c.type] + (c.eng.length ? ': ' + c.eng.join(' + ') : c.xlNames.length ? ': XL(' + c.xlNames.join('+') + ')' : ''));
      gate(5, 'closed', 'ট্রিগার ক্যান্ডেল বন্ধ হয়েছে', true, 'সিগন্যাল শুধু বন্ধ হওয়া ক্যান্ডেলে আসে');
      // ৬) স্কোর
      gate(6, 'score', 'স্কোর সীমা পার (' + M.minScore + ')', score >= M.minScore, 'স্কোর ' + score + '/100');

      // ৭, ৮) SL ও TP
      var pl = R.trade.plan({ dir: d, i: i, close: C[i], H: H, L: L, a: a, S: S, rt: rt, mt: mt, spec: spec, cost: cfg.costOn !== false, slMode: M.slMode, slBuf: cfg.slBuf > 0 ? cfg.slBuf : 0.25, slMin: cfg.slMinAtr > 0 ? cfg.slMinAtr : 0.6, slMax: cfg.slMaxAtr > 0 ? cfg.slMaxAtr : 3, atrMult: 1.5, minRoomR: M.minRoomR, tp1R: cfg.tp1R > 0 ? cfg.tp1R : 1, tp2R: cfg.tp2R > 0 ? cfg.tp2R : 2, tp3R: cfg.tp3R > 0 ? cfg.tp3R : 3, setupLvl: c.lvl });
      gate(7, 'sl', 'SL গ্রহণযোগ্য জায়গায় বসেছে', pl.ok || pl.fail !== 'sl', pl.ok ? (pl.slKindBn + (pl.widened ? ' (ন্যূনতম দূরত্বে বাড়ানো হয়েছে)' : '')) : pl.note);
      gate(8, 'room', 'TP পর্যন্ত যথেষ্ট জায়গা আছে', pl.ok || pl.fail !== 'room', pl.ok ? (pl.obstacle ? 'সবচেয়ে কাছের বাধা ' + pl.obstacle + ' — ' + pl.room.toFixed(1) + 'R দূরে' : 'সামনে কোনো বড় বাধা নেই') : (pl.fail === 'room' ? pl.note : 'SL না পাওয়ায় যাচাই হয়নি'));

      // ৯) সেশন, ভোলাটিলিটি, নিউজ
      var se = R.ultra.sessOf(T[i], tfSec, info, cfg), volOK = !cfg.volFilter || (nn(atrAvg[i]) && a >= atrAvg[i] * M.volLow && a <= atrAvg[i] * M.volHigh), newsHit = false;
      (cfg.newsBlocks || []).forEach(function (b) { if (T[i] >= b[0] && T[i] <= b[1]) newsHit = true; });
      var subKey = !se.ok ? 'session' : !volOK ? 'vol' : newsHit ? 'news' : null;
      gate(9, subKey || 'session', 'সেশন, ভোলাটিলিটি ও নিউজ ঠিক আছে', !subKey, !subKey ? se.name + ', ভোলাটিলিটি স্বাভাবিক' : subKey === 'session' ? 'এখন ' + se.name : subKey === 'vol' ? 'ATR গড়ের তুলনায় অস্বাভাবিক' : 'নিউজ-বিরতির সময়');

      // ১০) ঝুঁকি: চলমান ট্রেড, বিরতি, দৈনিক সীমা, পরপর লস, ব্যালেন্সের তুলনায় লটের ঝুঁকি
      var live = cur && cur.status >= 1 && cur.status <= 3, rk = risk.canTrade(T[i], i), rkKey = null, rkNote = '', lot = null, riskUsd = null, riskPct = null;
      if (cfg.oneTrade !== false && live) { rkKey = 'live'; rkNote = 'আগের ট্রেড এখনো চলছে'; }
      else if (i - lastSig <= M.cooldown) { rkKey = 'cooldown'; rkNote = 'আগের সিগন্যালের পর ' + M.cooldown + ' ক্যান্ডেলের বিরতি চলছে'; }
      else if (!rk.ok) { rkKey = rk.key; rkNote = rk.why; }
      if (pl.ok) {
        lot = lotMode === 'risk' ? R.trade.lotFromRisk(info, spec, balance, riskPctCfg, pl.riskD, pl.entry) : lotFixed;
        if (lot !== null) { riskUsd = R.trade.dollarRisk(info, spec, lot, pl.riskD, pl.entry); riskPct = riskUsd !== null ? riskUsd / balance * 100 : null; }
        if (!rkKey && riskPct !== null && riskPct > M.maxRiskPct) { rkKey = 'lotrisk'; rkNote = lot.toFixed(2) + ' লটে এই SL-এ ঝুঁকি $' + riskUsd.toFixed(2) + ' = ব্যালেন্সের ' + riskPct.toFixed(1) + '% (সীমা ' + M.maxRiskPct + '%)'; }
        if (!rkKey) rkNote = lot.toFixed(2) + ' লটে ঝুঁকি $' + (riskUsd === null ? '?' : riskUsd.toFixed(2)) + (riskPct !== null ? ' = ব্যালেন্সের ' + riskPct.toFixed(1) + '%' : '');
      }
      gate(10, rkKey || 'risk', 'ঝুঁকির সীমা ও বিরতি ঠিক আছে', !rkKey, rkNote);

      var failed = G.filter(function (g) { return !g.ok && g.block; })[0] || null;
      var pillars = [c.type === 'setup' || c.type === 'breakout' || c.type === 'trend', parts.momentum >= 10, fc >= 2, stOk && htfOk].filter(Boolean).length;
      return { ok: !failed, fail: failed, gate: G, parts: parts, score: score, plan: pl, lot: lot, riskUsd: riskUsd, riskPct: riskPct, pillars: pillars, rgCode: rgCode, H4: H4, H1: H1, counter: counter, rb: rb, zone: !!zone, pdOk: pdOk, fc: fc, stOk: stOk };
    }

    for (i = 0; i < n; i++) {
      // চলমান ট্রেডের অবস্থা (এন্ট্রির পরের বার থেকে)
      if (cur && cur.status >= 1 && cur.status <= 3 && i > cur.bar) {
        var evs = R.trade.step(cur, H[i], L[i], i, cfg.beOn !== false);
        cur.endTime = T[i];
        for (k = 0; k < evs.length; k++) cur.events.push({ time: T[i], type: evs[k] });
        var rr = R.trade.resultR(cur, cur.tpR[2]);
        if (rr !== null) risk.onClose(rr, T[i], i);
      }
      if (!nn(atr[i]) || i < 60) continue;
      var cb = candidate(i, 1), cs2 = candidate(i, -1);
      if (!cb && !cs2) { if (i === n - 1) lastEval = { status: 'none', text: 'এই ক্যান্ডেলে কোনো সেটআপ বা ট্রিগার নেই, তাই সিগন্যাল নেই।' }; continue; }
      stats.candidates++;
      if (cb && cs2) { stats.rejected.conflict = (stats.rejected.conflict || 0) + 1; if (i === n - 1) lastEval = { status: 'rejected', key: 'conflict', text: REJ_BN.conflict }; continue; }
      var cand = cb || cs2, ev = evaluate(i, cand);
      if (i === n - 1) lastEval = { status: ev.ok ? 'signal' : 'rejected', key: ev.fail ? ev.fail.key : null, text: ev.ok ? 'সিগন্যাল তৈরি হয়েছে' : (ev.fail.label + ' — ' + ev.fail.note), gate: ev.gate, dir: cand.dir, type: cand.type, score: ev.score };
      if (!ev.ok) { var kk = ev.fail.key; stats.rejected[kk] = (stats.rejected[kk] || 0) + 1; continue; }

      var pl = ev.plan, d = cand.dir, live2 = cur && cur.status >= 1 && cur.status <= 3;
      var grade = ev.score >= 90 ? 'A+' : ev.score >= 80 ? 'A' : ev.score >= 70 ? 'B' : 'C';
      var agree = [];
      if (cand.eng.length) agree.push('সেটআপ: ' + cand.eng.join(' + '));
      if (cand.xlNames.length) agree.push('XL: ' + cand.xlNames.join('+'));
      agree.push('ট্রেন্ড ' + ev.fc + '/৩');
      if (ev.rb) agree.push(ev.rb);
      var why = {
        mode: mode, modeBn: MODE_INFO[mode].name, type: cand.type, typeBn: TYPE_BN[cand.type], regime: ev.rgCode, regimeBn: R.regime.NAMES[ev.rgCode], regimeDesc: R.regime.DESC[ev.rgCode],
        setups: cand.eng, xl: cand.xlNames, trendFamily: { ut: D.utS[i], jdt: D.jdS[i], supertrend: D.stS[i], agree: ev.fc }, htf: { h4: ev.H4, h1: ev.H1, counterTrend: ev.counter },
        structure: { trend: S.trend[i], recent: ev.rb, inZone: ev.zone, premiumDiscount: nn(S.pd[i]) ? +S.pd[i].toFixed(2) : null },
        parts: ev.parts, partsMax: { setup: 30, momentum: 15, trend: 15, htf: 15, structure: 15, regime: 10 }, score: ev.score, minScore: M.minScore, gate: ev.gate,
        sl: { kind: pl.slKind, text: pl.slKindBn, widened: pl.widened }, tp: { r: pl.tpR, notes: pl.tpNotes, room: pl.room, obstacle: pl.obstacle },
        risk: { lot: ev.lot, usd: ev.riskUsd, pct: ev.riskPct, balance: balance, lotMode: lotMode }, costs: { spread: spec.spread, slip: spec.slip, on: cfg.costOn !== false }
      };
      if (live2) cur.status = 7;
      cur = {
        dir: d, bar: i, time: T[i], endTime: T[i], end: i, status: 1, score: ev.score, grade: grade,
        entry: pl.entry, sl: pl.sl, slNow: pl.sl, tp1: pl.tp1, tp2: pl.tp2, tp3: pl.tp3, tpR: pl.tpR, beLevel: pl.beLevel,
        lot: ev.lot, riskUsd: ev.riskUsd, riskPct: ev.riskPct, riskD: pl.riskD,
        mode: 'POWER ' + ev.pillars + '/4', extra: agree.join(' · '), entryType: cand.type, events: [], tp1Hit: false, beMoved: false, why: why
      };
      trades.push(cur); lastSig = i; sigBars[i] = d; stats.signals++;
    }

    var li = n - 1, now = base.now ? Object.assign({}, base.now) : {};
    now.regime = n ? RG.reg[li] : null; now.regimeBn = n ? R.regime.NAMES[RG.reg[li]] : '-'; now.struct = n ? S.trend[li] : 0; now.pd = n ? S.pd[li] : null; now.adx = n ? RG.adx[li] : null;
    now.mode = mode; now.modeBn = MODE_INFO[mode].name; now.last = lastEval || { status: 'none', text: 'ডেটা কম' };
    return { trades: trades, closed: n, now: now, board: cfg.noBoard ? null : R.power.board(P, sigBars), stats: stats, engine: 'decision' };
  }

  function biasBn(b) { return b === 1 ? 'বুলিশ' : b === -1 ? 'বেয়ারিশ' : 'নিরপেক্ষ'; }

  R.decision = { run: run, MODES: MODES, MODE_INFO: MODE_INFO, REJ_BN: REJ_BN, TYPE_BN: TYPE_BN };
})(window.RTX);
