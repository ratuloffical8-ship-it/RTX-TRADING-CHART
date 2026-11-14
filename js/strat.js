// ফাইলের নাম: strat.js
// পাথ: js/strat.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — "এক স্ট্র্যাটেজি, পুরো মার্কেট" রানার
   ড্রপডাউন থেকে যে স্ট্র্যাটেজি বাছা হবে, শুধু সেটিই সিগন্যাল দেবে। অন্য কোনো স্ট্র্যাটেজির ভোট মেশানো হয় না।
   ১২টি স্ট্র্যাটেজি: raid (raid.js-এ) + ULTRA-র ৫টি (sweep, crt, wyck, qm, fib) + XL-এর ৬টি (oc, brk, don, ma, st, ar)।
   এই ফাইল raid বাদে ১১টি চালায়। সিগন্যাল মোড (safe / smart / aggressive) বদলালে ফিল্টারগুলো বদলায়।
   SL/TP আসে পরীক্ষিত R.trade.plan() থেকে (স্ট্রাকচার/লিকুইডিটি SL, সামনের বাধা দেখে TP)।
   সিগন্যাল শুধু বন্ধ ক্যান্ডেলে। একই ক্যান্ডেলে SL ও TP দুটোই ছুঁলে SL আগে ধরা হয়। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function nn(v) { return v !== null && v !== undefined && !isNaN(v); }

  /* ---------- স্ট্র্যাটেজির তালিকা ---------- */
  var ORDER = ['raid', 'sweep', 'crt', 'wyck', 'qm', 'fib', 'oc', 'brk', 'don', 'ma', 'st', 'ar'];
  var DEFS = {
    raid: { name: 'Liquidity Raid (সুইপ + CISD)', short: 'Raid', group: 'রিভার্সাল', desc: 'দাম আগের হাই/লো-র স্টপ-জমা এলাকায় উইক টেনে ঢুকে ভেতরে ফিরলে, তারপর উল্টো দিকে জোরালো ক্যান্ডেল বন্ধ হলে সিগন্যাল। TP উল্টো দিকের লিকুইডিটিতে। (আলাদা ইঞ্জিন raid.js)' },
    sweep: { name: 'Sweep Reclaim', short: 'Sweep', src: 'ultra', idx: 0, group: 'রিভার্সাল', desc: 'দাম আগের সুইং হাই/লো (বা আগের দিনের হাই/লো) ছাড়িয়ে উইক টেনে আবার ভেতরে ফিরে বন্ধ হলো। তারপর ৬ ক্যান্ডেলের মধ্যে উল্টো দিকে জোরালো ক্যান্ডেল (আগের ক্যান্ডেলের হাই/লো ভেঙে) বন্ধ হলে সিগন্যাল। SL সুইপের চূড়ার বাইরে।' },
    crt: { name: 'CRT + TBS', short: 'CRT', src: 'ultra', idx: 1, group: 'রিভার্সাল', desc: 'একটা বড় ক্যান্ডেল (রেঞ্জ ১.৮×ATR-এর বেশি) আছে। পরের কোনো ক্যান্ডেল ওই বড় ক্যান্ডেলের হাই/লো ছাড়িয়ে গিয়ে ফাঁদ তৈরি করে, তারপর পরের ক্যান্ডেল উল্টো দিকে বড় ক্যান্ডেলের ভেতরে ফিরে বন্ধ হলে সিগন্যাল।' },
    wyck: { name: 'Wyckoff + ICT', short: 'Wyckoff', src: 'ultra', idx: 2, group: 'রিভার্সাল', desc: 'দাম কিছুক্ষণ সরু রেঞ্জে (সর্বোচ্চ ১০×ATR) থেকেছে। রেঞ্জের নিচে/ওপরে একবার ফাঁদ (Spring/Upthrust) ফেলে বডি ভেতরে ফিরে এসেছে। তারপর উল্টো দিকে জোরালো ক্যান্ডেল বন্ধ হলে সিগন্যাল।' },
    qm: { name: 'QM + SMC', short: 'QM', src: 'ultra', idx: 3, group: 'রিভার্সাল', desc: 'Quasimodo প্যাটার্ন: সুইং হাই/লো-র বিশেষ সাজানোর পর "নেকলাইন" ভেঙে ক্যান্ডেল বন্ধ হলে সিগন্যাল (বুলিশ হলে নেকলাইনের ওপরে, বেয়ারিশ হলে নিচে)। SL প্যাটার্নের চূড়ায়।' },
    fib: { name: 'Price Action + Fib', short: 'Fib', src: 'ultra', idx: 4, group: 'ট্রেন্ড-পুলব্যাক', desc: 'একটা জোরালো মুভ (ইমপালস, কমপক্ষে ২.৫×ATR) হলো। দাম সেটার ৫০%–৭৯% ফিবোনাচ্চি জোনে ফিরে এসে ট্রেন্ডের দিকে জোরালো ক্যান্ডেল (বডি ≥ ৪০%) বন্ধ হলে সিগন্যাল।' },
    oc: { name: 'OC (বড় বডি মোমেন্টাম)', short: 'OC', src: 'xl', idx: 0, group: 'ব্রেকআউট/মোমেন্টাম', desc: 'ক্যান্ডেলের বডি গত ৫০ ক্যান্ডেলের গড় বডির ৩ গুণ বা বেশি, এবং আগের ক্যান্ডেলের বাইরে বন্ধ হলো। অর্থাৎ হঠাৎ জোরালো ধাক্কা। সেই দিকেই সিগন্যাল।' },
    brk: { name: 'Breakout (বক্স ভাঙা)', short: 'Breakout', src: 'xl', idx: 1, group: 'ব্রেকআউট/মোমেন্টাম', desc: 'দাম অন্তত ৫ ক্যান্ডেল ধরে সরু বক্সে (উচ্চতা ২×ATR-এর মধ্যে) আটকে ছিল। বক্সের ওপরে বা নিচে প্রথম ক্যান্ডেল বন্ধ হলে সিগন্যাল।' },
    don: { name: 'Donchian (২০ ক্যান্ডেল চ্যানেল)', short: 'Donchian', src: 'xl', idx: 2, group: 'ব্রেকআউট/মোমেন্টাম', desc: 'গত ২০ ক্যান্ডেলের সর্বোচ্চের ওপরে (বা সর্বনিম্নের নিচে) প্রথমবার বন্ধ হলে সিগন্যাল। মানে নতুন ২০-ক্যান্ডেল হাই/লো।' },
    ma: { name: 'MA Cross (EMA 9/21/55)', short: 'MA', src: 'xl', idx: 3, group: 'ট্রেন্ড-ফলো', desc: 'EMA৯ > EMA২১ > EMA৫৫ সাজালে বুলিশ (উল্টো হলে বেয়ারিশ)। এই সাজানোটা যে ক্যান্ডেলে প্রথম তৈরি হয় সেখানেই সিগন্যাল। ট্রেন্ড শুরুর স্ট্র্যাটেজি, রেঞ্জ বাজারে ভুল সিগন্যাল বেশি দেয়।' },
    st: { name: 'Supertrend (১০, ৩)', short: 'Supertrend', src: 'xl', idx: 4, group: 'ট্রেন্ড-ফলো', desc: 'Supertrend লাইন দিক বদলালে (দাম লাইন ভেঙে বন্ধ হলে) সিগন্যাল। ট্রেন্ড-ফলো, রেঞ্জ বাজারে বারবার দিক বদলায়।' },
    ar: { name: 'Aroon (১৪)', short: 'Aroon', src: 'xl', idx: 5, group: 'ট্রেন্ড-ফলো', desc: 'Aroon Up লাইন Aroon Down-এর ওপরে ওঠা (বা উল্টো) ক্রস হলে সিগন্যাল। মানে সর্বশেষ ১৪ ক্যান্ডেলের মধ্যে নতুন হাই আগে এসেছে নাকি নতুন লো, সেটা বদলে গেল।' }
  };

  /* মোড: ফিল্টারের কড়াকড়ি। (শুরুর মান; আসল ডেটার ফলাফল দেখে ঠিক করার জিনিস) */
  var MODES = {
    safe: { minScore: 75, htf: 'strict', cooldown: 12, volLow: 0.6, volHigh: 2.5, pend: 10, minRoomR: 1.5 },
    smart: { minScore: 65, htf: 'normal', cooldown: 8, volLow: 0.5, volHigh: 3, pend: 8, minRoomR: 1.2 },
    aggressive: { minScore: 55, htf: 'loose', cooldown: 4, volLow: 0.4, volHigh: 3.5, pend: 6, minRoomR: 1.0 }
  };
  var MODE_INFO = {
    safe: { name: 'SAFE (নিরাপদ)', desc: 'স্কোর ৭৫+। বড় টাইমফ্রেম (4H/1H) অন্তত একটা মিলতে হবে, উল্টো থাকলে বাদ। সিগন্যালের মধ্যে ১২ ক্যান্ডেল বিরতি। TP পর্যন্ত কমপক্ষে ১.৫R জায়গা লাগে। সিগন্যাল কম আসে।' },
    smart: { name: 'SMART (সুষম, শুরুর জন্য)', desc: 'স্কোর ৬৫+। বড় টাইমফ্রেম উল্টো হলে বাদ (নিরপেক্ষ চলে)। ৮ ক্যান্ডেল বিরতি। TP পর্যন্ত কমপক্ষে ১.২R জায়গা।' },
    aggressive: { name: 'AGGRESSIVE (বেশি সিগন্যাল)', desc: 'স্কোর ৫৫+। একটা বড় টাইমফ্রেম উল্টো হলেও চলে। ৪ ক্যান্ডেল বিরতি। সিগন্যাল বেশি, কিন্তু SL-ও বেশি হতে পারে।' }
  };
  var REJ_BN = {
    htf: 'বড় টাইমফ্রেম (4H/1H) বিপরীতে', score: 'স্কোর সীমার নিচে', session: 'সেশনের বাইরে', vol: 'ভোলাটিলিটি ঠিক নেই', news: 'নিউজ-বিরতির সময়',
    sl: 'SL গ্রহণযোগ্য নয় (খুব কাছে বা খুব দূরে)', room: 'TP-র পথে বাধা, জায়গা কম', live: 'আগের ট্রেড এখনো চলছে', lotrisk: 'ব্যালেন্সের তুলনায় ঝুঁকি বেশি',
    cool: 'সদ্য সিগন্যাল/SL হয়েছে, বিরতি চলছে', missed: 'লিমিট এন্ট্রি মেলেনি (দাম ফেরেনি)'
  };
  var ENTRY_BN = { retest: 'রিটেস্ট এন্ট্রি (সিগন্যাল ক্যান্ডেলের বডিতে দাম ফিরলে লিমিট)', fast: 'দ্রুত এন্ট্রি (সিগন্যাল ক্যান্ডেল বন্ধ হতেই)' };
  var COOL_AFTER_SL = 12;

  function bnB(b) { return b === 1 ? 'বুলিশ' : b === -1 ? 'বেয়ারিশ' : 'নিরপেক্ষ'; }

  function isStrat(k) { return !!DEFS[k] && k !== 'raid'; }

  /* ---------- প্রস্তুতি (ক্যান্ডেল বদলালে আবার; স্ট্র্যাটেজি বদলালে না) ---------- */
  function prepS(P, info, base) {
    if (base._ss && base._ss.n === P.n) return base._ss;
    var S = R.structure.compute(P.O, P.H, P.L, P.C, P.atr, { len: 3 }), n = P.n, i, j, vs = new Array(n).fill(null), s = 0;
    for (i = 0; i < n; i++) { s += P.V[i]; if (i >= 20) s -= P.V[i - 20]; if (i >= 19) vs[i] = s / 20; }
    base._ss = { n: n, S: S, vsma: vs };
    return base._ss;
  }

  function signalsOf(key, base, P) {
    var df = DEFS[key], n = P.n, z = new Array(n).fill(0);
    if (df.src === 'ultra') {
      var A = base.arr || {};
      return { sig: (A.engSig && A.engSig[df.idx]) || z, lvl: (A.engLvl && A.engLvl[df.idx]) || null };
    }
    return { sig: (P.XL && P.XL[df.idx] && P.XL[df.idx][1]) || z, lvl: null };
  }

  /* ---------- মূল রানার ---------- */
  function run(cs, base, cfg, info, tfSec, htfMode) {
    var key = isStrat(cfg.strategy) ? cfg.strategy : 'sweep', df = DEFS[key];
    var P = R.power.prep(cs, base, info, tfSec), SS = prepS(P, info, base), S = SS.S, vsma = SS.vsma;
    var src = signalsOf(key, base, P), sig = src.sig, lvArr = src.lvl;
    var n = P.n, i, k, O = P.O, H = P.H, L = P.L, C = P.C, T = P.T, atr = P.atr, atrAvg = P.atrAvg, h4 = P.h4, h1 = P.h1, V = P.V, e100 = P.e100, vw = P.vw, haC = P.haC, haO = P.haO, ct = P.ct;
    var mk = MODES[cfg.mode] ? cfg.mode : 'smart', M = Object.assign({}, MODES[mk], cfg.ov || {});
    var entryMode = cfg.entryMode === 'fast' ? 'fast' : 'retest';
    var spec = R.trade.specFor(info, cfg), mt = info.mintick, dec = info.dec;
    function rt(x) { return +(Math.round(x / mt) * mt).toFixed(dec); }
    var lotMode = cfg.lotMode === 'risk' ? 'risk' : 'fixed', lotFixed = cfg.lot > 0 ? +cfg.lot : 0.01, balance = cfg.balance > 0 ? +cfg.balance : 1000, riskPctCfg = cfg.riskPct > 0 ? +cfg.riskPct : 1;
    var maxRiskPct = nn(cfg.maxRiskPct) && cfg.maxRiskPct > 0 ? +cfg.maxRiskPct : 10;
    var costOn = cfg.costOn !== false, halfCost = costOn ? (spec.spread / 2 + spec.slip) : 0;
    var tp1R = cfg.tp1R > 0 ? +cfg.tp1R : 1, tp2R = cfg.tp2R > 0 ? +cfg.tp2R : 2, tp3R = cfg.tp3R > 0 ? +cfg.tp3R : 3;
    var slMode = df.src === 'ultra' && key !== 'fib' ? 'liquidity' : 'auto';
    var trades = [], cur = null, stats = { candidates: 0, signals: 0, rejected: {} }, lastEval = null, lastSigBar = -1e9, lastSl = { '1': -1e9, '-1': -1e9 };
    function rej(kk) { stats.rejected[kk] = (stats.rejected[kk] || 0) + 1; }

    function htfCheck(d, m) {
      var H4 = h4[m], H1 = h1[m], opp = (H4 === -d ? 1 : 0) + (H1 === -d ? 1 : 0), same = (H4 === d ? 1 : 0) + (H1 === d ? 1 : 0), ok = true;
      if (htfMode === 'Off') ok = true;
      else if (M.htf === 'strict') ok = opp === 0 && same >= 1;
      else if (M.htf === 'normal') ok = opp === 0;
      else ok = opp <= 1 && same >= (opp === 1 ? 1 : 0);
      var pts = htfMode === 'Off' ? 12 : (H4 === d ? 15 : H4 === 0 ? 6 : 0) + (H1 === d ? 10 : H1 === 0 ? 4 : 0);
      return { ok: ok, H4: H4, H1: H1, opp: opp, same: same, pts: pts, note: '4H ' + bnB(H4) + ', 1H ' + bnB(H1) + (htfMode === 'Off' ? ' (ফিল্টার বন্ধ)' : '') };
    }

    /* একটি সিগন্যাল ক্যান্ডেল m (দিক d) থেকে ট্রেড পরিকল্পনা ও সব শর্ত পরীক্ষা */
    function evaluate(m, d) {
      var a = atr[m], G = [], parts = {};
      function gate(nr, kk, label, ok, note) { G.push({ n: nr, key: kk, label: label, ok: !!ok, note: note || '', block: true }); }
      var lvl = lvArr && nn(lvArr[m]) ? lvArr[m] : null;
      var hc = htfCheck(d, m);
      gate(1, 'htf', 'বড় টাইমফ্রেম (4H/1H) বিরোধী নয়', hc.ok, hc.note);
      gate(2, 'trigger', df.name + ' ট্রিগার হয়েছে', true, (d === 1 ? 'বুলিশ' : 'বেয়ারিশ') + ' সিগন্যাল ক্যান্ডেল বন্ধ হয়েছে' + (lvl !== null ? ', স্ট্রাকচার লেভেল ' + rt(lvl) : ''));

      // এন্ট্রি
      var limit, mode2 = entryMode, entryNote, body = Math.abs(C[m] - O[m]);
      if (entryMode === 'fast') { limit = C[m]; entryNote = 'সিগন্যাল ক্যান্ডেল বন্ধ হওয়ার দামে সঙ্গে সঙ্গে'; }
      else {
        var back = Math.min(Math.max(0.5 * body, 0.15 * a), 0.6 * a);
        limit = rt(C[m] - d * back);
        entryNote = 'সিগন্যাল ক্যান্ডেলের বডিতে দাম ' + rt(back) + ' পিছিয়ে ' + limit + '-এ এলে লিমিট (না এলে ট্রেড নেবে না)';
      }
      var pl = R.trade.plan({ dir: d, i: m, close: limit, H: H, L: L, a: a, S: S, rt: rt, mt: mt, spec: spec, cost: costOn, slMode: slMode, slBuf: cfg.slBuf >= 0 && cfg.slBuf !== undefined ? +cfg.slBuf : 0.25, slMin: cfg.slMinAtr > 0 ? cfg.slMinAtr : 0.6, slMax: cfg.slMaxAtr > 0 ? cfg.slMaxAtr : 3, atrMult: 1.5, minRoomR: M.minRoomR, tp1R: tp1R, tp2R: tp2R, tp3R: tp3R, setupLvl: lvl });
      gate(3, 'sl', 'SL গ্রহণযোগ্য জায়গায় বসেছে', pl.ok || pl.fail !== 'sl', pl.ok ? (pl.slKindBn + (pl.widened ? ' (ন্যূনতম দূরত্বে বাড়ানো হয়েছে)' : '') + ' → SL ' + pl.sl + ' (দূরত্ব ' + (pl.riskD / a).toFixed(2) + '×ATR)') : pl.note);
      gate(4, 'room', 'TP পর্যন্ত যথেষ্ট জায়গা আছে (≥ ' + M.minRoomR + 'R)', pl.ok || pl.fail !== 'room', pl.ok ? (pl.obstacle ? 'সবচেয়ে কাছের বাধা ' + pl.obstacle + ' — ' + pl.room.toFixed(1) + 'R দূরে' : 'সামনে কোনো বড় বাধা নেই') : (pl.fail === 'room' ? pl.note : 'SL না পাওয়ায় যাচাই হয়নি'));

      // সেশন, ভোলাটিলিটি, নিউজ
      var se = R.ultra.sessOf(T[m], tfSec, info, cfg), volOK = !cfg.volFilter || (nn(atrAvg[m]) && a >= atrAvg[m] * M.volLow && a <= atrAvg[m] * M.volHigh), newsHit = false;
      (cfg.newsBlocks || []).forEach(function (b) { if (T[m] >= b[0] && T[m] <= b[1]) newsHit = true; });
      var subKey = !se.ok ? 'session' : !volOK ? 'vol' : newsHit ? 'news' : null;
      gate(5, subKey || 'session', 'সেশন, ভোলাটিলিটি ও নিউজ ঠিক আছে', !subKey, !subKey ? se.name + ', ভোলাটিলিটি স্বাভাবিক' : subKey === 'session' ? 'এখন ' + se.name : subKey === 'vol' ? 'ATR গড়ের তুলনায় অস্বাভাবিক' : 'নিউজ-বিরতির সময়');

      // বিরতি: সিগন্যালের পর M.cooldown ক্যান্ডেল; একই দিকে SL-এর পর ১২ ক্যান্ডেল
      var coolKey = null, coolNote = 'শেষ সিগন্যাল/SL থেকে যথেষ্ট সময় গেছে';
      if (m - lastSigBar <= M.cooldown) { coolKey = 'cool'; coolNote = 'শেষ সিগন্যালের ' + (m - lastSigBar) + ' ক্যান্ডেল পর (ন্যূনতম বিরতি ' + (M.cooldown + 1) + ')'; }
      else if (m - lastSl[d] < COOL_AFTER_SL) { coolKey = 'cool'; coolNote = 'এই দিকে ' + (m - lastSl[d]) + ' ক্যান্ডেল আগে SL খেয়েছে, ' + COOL_AFTER_SL + ' ক্যান্ডেল (প্রায় ১ ঘণ্টা ৫মি-তে) অপেক্ষা'; }
      gate(6, coolKey || 'cool', 'সদ্য সিগন্যাল বা SL-এর পর বিরতি মানা হয়েছে', !coolKey, coolNote);

      // স্কোর (মোট ১০০): ট্রিগার ৪০ + HTF ২৫ + ট্রেন্ড ৮ + EMA100 ৫ + VWAP ৩ + HA ৩ + ক্যান্ডেল ৫ + ভলিউম ৮
      var vr = nn(vsma[m]) && vsma[m] > 0 ? V[m] / vsma[m] : null;
      parts.trigger = 40; parts.htf = hc.pts;
      parts.trend = ct[m] === d ? 8 : ct[m] === 0 ? 3 : 0;
      parts.ema = (d === 1 ? C[m] > e100[m] : C[m] < e100[m]) ? 5 : 0;
      parts.vwap = (d === 1 ? C[m] > vw[m] : C[m] < vw[m]) ? 3 : 0;
      parts.ha = (d === 1 ? haC[m] > haO[m] : haC[m] < haO[m]) ? 3 : 0;
      parts.candle = ((d === 1 ? C[m] > O[m] : C[m] < O[m]) && body >= 0.5 * a) ? 5 : 0;
      parts.vol = vr === null ? 0 : vr >= 1.3 ? 8 : vr >= 1 ? 4 : 0;
      var score = Math.min(100, parts.trigger + parts.htf + parts.trend + parts.ema + parts.vwap + parts.ha + parts.candle + parts.vol);
      gate(7, 'score', 'স্কোর সীমা পার (' + M.minScore + ')', score >= M.minScore, 'স্কোর ' + score + '/১০০');

      // ঝুঁকি ও লট
      var live = cur && cur.status >= 1 && cur.status <= 3, rkKey = null, rkNote = '', lot = null, riskUsd = null, riskPct = null, warn = false;
      if (cfg.oneTrade !== false && live) { rkKey = 'live'; rkNote = 'আগের ট্রেড এখনো চলছে'; }
      if (pl.ok) {
        lot = lotMode === 'risk' ? R.trade.lotFromRisk(info, spec, balance, riskPctCfg, pl.riskD, pl.entry) : lotFixed;
        if (lot !== null) { riskUsd = R.trade.dollarRisk(info, spec, lot, pl.riskD, pl.entry); riskPct = riskUsd !== null ? riskUsd / balance * 100 : null; }
        if (!rkKey && riskPct !== null && riskPct > maxRiskPct) { rkKey = 'lotrisk'; rkNote = lot.toFixed(2) + ' লটে এই SL-এ ঝুঁকি $' + riskUsd.toFixed(2) + ' = ব্যালেন্সের ' + riskPct.toFixed(1) + '% (সীমা ' + maxRiskPct + '%, সেটিংসে বদলানো যায়)'; }
        if (!rkKey) { warn = riskPct !== null && riskPct > 5; rkNote = lot.toFixed(2) + ' লটে ঝুঁকি $' + (riskUsd === null ? '?' : riskUsd.toFixed(2)) + (riskPct !== null ? ' = ব্যালেন্সের ' + riskPct.toFixed(1) + '%' : '') + (warn ? ' (৫%-এর বেশি, সাবধান)' : ''); }
      }
      gate(8, rkKey || 'risk', 'ঝুঁকির সীমা ঠিক আছে', !rkKey, rkNote);

      var failed = null;
      for (var q = 0; q < G.length; q++) if (!G[q].ok) { failed = G[q]; break; }
      return { ok: !failed, fail: failed, gate: G, parts: parts, score: score, d: d, entry: pl.ok ? pl.entry : null, limit: limit, entryMode: mode2, entryNote: entryNote, plan: pl, hc: hc, lot: lot, riskUsd: riskUsd, riskPct: riskPct, warn: warn, lvl: lvl, vr: vr, body: body / a };
    }

    for (i = 0; i < n; i++) {
      // ১) চলমান / অপেক্ষমাণ ট্রেড
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
        if (cur.status === 5 && !cur.slMark) { cur.slMark = 1; lastSl[cur.dir] = i; }
      }
      if (!nn(atr[i]) || atr[i] <= 0 || i < 60) continue;

      // ২) ট্রিগার
      var sg = sig[i];
      if (!sg) { if (i === n - 1) lastEval = null; continue; }
      var dd = sg > 0 ? 1 : -1;
      stats.candidates++;
      var evl = evaluate(i, dd);
      if (i === n - 1) lastEval = { status: evl.ok ? 'signal' : 'rejected', key: evl.fail ? evl.fail.key : null, text: evl.ok ? 'সিগন্যাল তৈরি হয়েছে' : (evl.fail.label + ' — ' + evl.fail.note), gate: evl.gate, dir: dd, type: 'setup', score: evl.score };
      if (!evl.ok) { rej(evl.fail.key); continue; }
      stats.signals++;
      var grade = evl.score >= 90 ? 'A+' : evl.score >= 80 ? 'A' : evl.score >= 70 ? 'B' : 'C', pl = evl.plan;
      var w = {
        engine: 'strat', strat: { key: key, name: df.name, desc: df.desc, group: df.group, lvl: evl.lvl !== null ? rt(evl.lvl) : null, entryMode: evl.entryMode, entryNote: evl.entryNote, body: +evl.body.toFixed(2), volRatio: evl.vr === null ? null : +evl.vr.toFixed(2), slKindBn: pl.slKindBn, obstacle: pl.obstacle, room: pl.room },
        mode: mk, modeBn: MODE_INFO[mk].name, type: 'setup', typeBn: df.name,
        htf: { h4: evl.hc.H4, h1: evl.hc.H1, counterTrend: evl.hc.opp === 1 },
        parts: evl.parts, partsMax: { trigger: 40, htf: 25, trend: 8, ema: 5, vwap: 3, ha: 3, candle: 5, vol: 8 }, score: evl.score, minScore: M.minScore, gate: evl.gate,
        sl: { kind: pl.slKind, text: pl.slKindBn, widened: pl.widened },
        tp: { r: pl.tpR.map(function (x) { return +x.toFixed(2); }), notes: pl.tpNotes, room: pl.room, obstacle: pl.obstacle },
        risk: { lot: evl.lot, usd: evl.riskUsd, pct: evl.riskPct, balance: balance, lotMode: lotMode, warn: evl.warn }, costs: { spread: spec.spread, slip: spec.slip, on: costOn }
      };
      if (cur && cur.status === 0) { cur.status = 7; cur.endTime = T[i]; }
      var pending = evl.entryMode === 'retest';
      cur = {
        dir: dd, bar: i, time: T[i], endTime: T[i], end: i, status: pending ? 0 : 1, score: evl.score, grade: grade, entry: pl.entry, limit: evl.limit, sl: pl.sl, slNow: pl.sl,
        tp1: pl.tp1, tp2: pl.tp2, tp3: pl.tp3, tpR: pl.tpR, beLevel: pl.beLevel, lot: evl.lot, riskUsd: evl.riskUsd, riskPct: evl.riskPct, riskD: pl.riskD,
        mode: df.short + (pending ? ' রিটেস্ট' : ' দ্রুত'), extra: df.name, entryType: 'setup', events: [], tp1Hit: false, beMoved: false, why: w,
        pend: M.pend, fillBar: pending ? null : i, fillTime: pending ? null : T[i]
      };
      trades.push(cur); lastSigBar = i;
    }

    /* ----- আগাম এলার্ট: শুধু লিমিট অপেক্ষায় থাকলে ----- */
    var li = n - 1, now = base.now ? Object.assign({}, base.now) : {}, alert = null;
    if (cur && cur.status === 0) alert = { stage: 'pending', dir: cur.dir, level: cur.limit, text: (cur.dir === 1 ? 'BUY' : 'SELL') + ' লিমিট অপেক্ষায়: দাম ' + cur.limit + '-এ ফিরলে এন্ট্রি। SL ' + cur.sl + '। দাম না ফিরলে ট্রেড নেবে না (' + Math.max(0, cur.pend - (li - cur.bar)) + ' ক্যান্ডেল বাকি)।' };
    now.alert = alert; now.last = lastEval;
    return { trades: trades, closed: n, now: now, board: null, stats: stats, engine: 'strat', strategy: key };
  }

  R.strat = { ORDER: ORDER, DEFS: DEFS, MODES: MODES, MODE_INFO: MODE_INFO, REJ_BN: REJ_BN, ENTRY_BN: ENTRY_BN, isStrat: isStrat, run: run };
})(window.RTX);
