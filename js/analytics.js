// ফাইলের নাম / পাথ: js/analytics.js
// পাথ: js/analytics.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — পারফরম্যান্স বিশ্লেষণ
   ১) metrics     : জয়ের হার, প্রত্যাশা (Expectancy), Profit Factor, সর্বোচ্চ ড্রডাউন, পরপর লস
   ২) walkForward : ট্রেড ৬০% / ২০% / ২০% তিন ভাগে ভাগ করে দেখে (শেখা / যাচাই / অদেখা টেস্ট) — তিন ভাগেই লাভ থাকলে ভরসা বাড়ে
   ৩) monteCarlo  : একই ট্রেডগুলো ১০০০ বার এলোমেলো ক্রমে সাজিয়ে দেখে — ভাগ্য খারাপ হলে সর্বোচ্চ কত ক্ষতি হতে পারে
   ফলাফল R-এ গোনা হয় (SL = −১R, ব্রেক-ইভেন = ০, TP3 = +tp3R)। ডলারে গোনা হয় ট্রেডের নিজের riskUsd × R দিয়ে।
   এখানে কোনো ভবিষ্যদ্বাণী নেই, শুধু আগের ট্রেডের হিসাব। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  function closedOf(trades) { return trades.filter(function (t) { return t.status === 4 || t.status === 5 || t.status === 6 || t.status === 9; }); }
  /* আংশিক ক্লোজ: TP1/TP2/TP3-এ পজিশনের কত % বন্ধ হবে (ডিফল্ট ৫০/৩০/২০, সেটিংসে বদলানো যায়)। [0,0,100] = পুরোনো নিয়ম (সবটা TP3-তে) */
  var SPLIT = [0.5, 0.3, 0.2];
  function setSplit(p1, p2, p3) {
    var a = [+p1, +p2, +p3].map(function (x) { return isFinite(x) && x >= 0 ? x : 0; }), s = a[0] + a[1] + a[2];
    SPLIT = s > 0 ? a.map(function (x) { return x / s; }) : [0.5, 0.3, 0.2];
  }
  /* ট্রেডের মোট বাস্তব R = আগে বন্ধ হওয়া অংশের লাভ + বাকি অংশের ফলাফল (TP3: +r3, SL: −১, BE: ০, সময়শেষ: exitR)। BE-তে ফেরার আগে নেওয়া আংশিক লাভ মুছে যায় না */
  function rOf(t) {
    var st = t.status; if (st !== 4 && st !== 5 && st !== 6 && st !== 9) return null;
    var tr = t.tpR && t.tpR.length >= 3 ? t.tpR : [1, 2, t.rr3 || 3];
    var evs = t.events || [], has2 = st === 4 || evs.some(function (e) { return e.type === 'TP2' || e.type === 'TP3'; });
    var has1 = st === 4 || !!t.tp1Hit || has2;
    var banked = (has1 ? SPLIT[0] * tr[0] : 0) + (has2 ? SPLIT[1] * tr[1] : 0);
    var rem = 1 - (has1 ? SPLIT[0] : 0) - (has2 ? SPLIT[1] : 0);
    var ex = st === 4 ? tr[2] : st === 5 ? -1 : st === 6 ? 0 : (t.exitR || 0);
    return banked + rem * ex;
  }

  function metrics(trades) {
    var cl = closedOf(trades), n = cl.length, open = trades.filter(function (t) { return t.status >= 0 && t.status <= 3; }).length;   // চলমান = লিমিটের অপেক্ষায় + এন্ট্রি হয়ে চলছে (মিস/বাতিল নয়)
    var m = { n: n, open: open, wins: 0, losses: 0, be: 0, tp1: 0, tp3: 0, winRate: 0, tp1Rate: 0, tp3Rate: 0, slRate: 0, beRate: 0, totalR: 0, expR: 0, avgWinR: 0, avgLossR: -1, pf: 0, maxDDR: 0, maxLossStreak: 0, totalUsd: null, maxDDUsd: null, avgRiskUsd: null, rs: [] };
    if (!n) return m;
    var gw = 0, gl = 0, eq = 0, peak = 0, dd = 0, streak = 0, maxStreak = 0, usd = 0, eqU = 0, peakU = 0, ddU = 0, hasUsd = true, riskSum = 0, riskN = 0;
    cl.forEach(function (t) {
      var r = rOf(t); m.rs.push(r);
      if (t.tp1Hit) m.tp1++;
      if (t.status === 4) m.tp3++;
      if (r > 0) { m.wins++; gw += r; streak = 0; } else if (r < 0) { m.losses++; gl += -r; streak++; if (streak > maxStreak) maxStreak = streak; } else { m.be++; }
      eq += r; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq;
      if (t.riskUsd === null || t.riskUsd === undefined || isNaN(t.riskUsd)) hasUsd = false;
      else { var u = r * t.riskUsd; usd += u; eqU += u; if (eqU > peakU) peakU = eqU; if (peakU - eqU > ddU) ddU = peakU - eqU; riskSum += t.riskUsd; riskN++; }
    });
    m.winRate = m.wins / n * 100; m.tp1Rate = m.tp1 / n * 100; m.tp3Rate = m.tp3 / n * 100; m.slRate = m.losses / n * 100; m.beRate = m.be / n * 100;
    m.totalR = eq; m.expR = eq / n; m.avgWinR = m.wins ? gw / m.wins : 0; m.avgLossR = -1;
    m.pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0);
    m.maxDDR = dd; m.maxLossStreak = maxStreak;
    if (hasUsd && riskN) { m.totalUsd = usd; m.maxDDUsd = ddU; m.avgRiskUsd = riskSum / riskN; }
    return m;
  }

  /* totalBars = চার্টে মোট বন্ধ ক্যান্ডেল। প্রতিটি ট্রেড তার এন্ট্রি-বার অনুযায়ী ৩ ভাগের একটিতে পড়ে */
  function walkForward(trades, totalBars) {
    var a = Math.floor(totalBars * 0.6), b = Math.floor(totalBars * 0.8);
    var parts = [[], [], []];
    trades.forEach(function (t) { parts[t.bar < a ? 0 : t.bar < b ? 1 : 2].push(t); });
    var res = { train: metrics(parts[0]), val: metrics(parts[1]), test: metrics(parts[2]), bounds: [a, b] };
    var all = [res.train, res.val, res.test];
    res.enough = all.every(function (x) { return x.n >= 5; });
    res.consistent = res.enough && all.every(function (x) { return x.expR > 0; });
    return res;
  }

  function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function pct(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))]; }

  /* rs = R-এর তালিকা; opts: {runs, seed, balance, avgRiskUsd, ruinPct} */
  function monteCarlo(rs, opts) {
    opts = opts || {};
    var runs = opts.runs || 1000, n = rs.length, rand = rng(opts.seed || 12345);
    if (n < 8) return { ok: false, why: 'মন্টে কার্লোর জন্য কমপক্ষে ৮টি বন্ধ ট্রেড দরকার, এখন আছে ' + n + 'টি।' };
    var finals = [], dds = [], loss = 0, ruin = 0, balance = opts.balance > 0 ? opts.balance : null, rk = opts.avgRiskUsd > 0 ? opts.avgRiskUsd : null, ruinFrac = (opts.ruinPct || 30) / 100;
    for (var r = 0; r < runs; r++) {
      var eq = 0, peak = 0, dd = 0;
      for (var k = 0; k < n; k++) { eq += rs[Math.floor(rand() * n)]; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; }
      finals.push(eq); dds.push(dd);
      if (eq < 0) loss++;
      if (balance && rk && dd * rk >= balance * ruinFrac) ruin++;
    }
    finals.sort(function (a, b) { return a - b; }); dds.sort(function (a, b) { return a - b; });
    var out = { ok: true, runs: runs, n: n, finalP5: pct(finals, 0.05), finalP50: pct(finals, 0.5), finalP95: pct(finals, 0.95), ddP50: pct(dds, 0.5), ddP95: pct(dds, 0.95), probLoss: loss / runs, probRuin: balance && rk ? ruin / runs : null, ruinPct: opts.ruinPct || 30 };
    if (rk) { out.ddP95Usd = out.ddP95 * rk; out.finalP5Usd = out.finalP5 * rk; out.finalP50Usd = out.finalP50 * rk; out.finalP95Usd = out.finalP95 * rk; }
    return out;
  }

  /* সহজ বাংলা রায় — কখনো "জিতবেই" বলে না */
  function verdict(m, wf, mc) {
    if (m.n < 20) return { level: 'few', text: 'বন্ধ ট্রেড মাত্র ' + m.n + 'টি। এত কম ট্রেডে ভালো-খারাপ বলা যায় না। আরও পুরোনো ক্যান্ডেল লোড করো বা বড় টাইমফ্রেম দেখো।' };
    if (m.expR <= 0) return { level: 'bad', text: 'এই চার্টে গড়ে প্রতি ট্রেডে ' + m.expR.toFixed(2) + 'R, অর্থাৎ ক্ষতি বা শূন্য। এই মার্কেট/টাইমফ্রেমে আপাতত ট্রেড না করাই ভালো, বা সেটিং বদলে আবার দেখো।' };
    var notes = [];
    if (wf && wf.enough && !wf.consistent) notes.push('তিন ভাগের সবকটিতে লাভ নেই, মানে ফলাফল সময়ের সাথে বদলায়');
    if (wf && !wf.enough) notes.push('প্রতি ভাগে ট্রেড কম, তাই ভাগ-ভাগ যাচাই দুর্বল');
    if (mc && mc.ok && mc.probLoss > 0.2) notes.push('ট্রেডের ক্রম বদলালে ' + Math.round(mc.probLoss * 100) + '% ক্ষেত্রে শেষে লস হতো');
    if (m.pf < 1.2) notes.push('Profit Factor ' + (isFinite(m.pf) ? m.pf.toFixed(2) : '∞') + ' খুব কম');
    if (notes.length) return { level: 'warn', text: 'গড়ে প্রতি ট্রেডে +' + m.expR.toFixed(2) + 'R, কিন্তু সতর্কতা: ' + notes.join('; ') + '। ডেমোতে আরও যাচাই করো।' };
    return { level: 'good', text: 'গড়ে প্রতি ট্রেডে +' + m.expR.toFixed(2) + 'R, তিন ভাগেই লাভ, আর মন্টে কার্লোতেও লসের সম্ভাবনা কম। এটা ভালো লক্ষণ, কিন্তু ভবিষ্যতের গ্যারান্টি নয়। আগে ডেমোতে চালাও।' };
  }

  /* ইঞ্জিন-ভিত্তিক বিস্তারিত ফলাফল (সব সংখ্যা সরাসরি ট্রেডের স্ট্যাটাস/ইভেন্ট থেকে গোনা, কোনো অনুমান নেই)
     signals   = মোট সিগন্যাল (যতগুলো ট্রেড তৈরি হয়েছে)
     entered   = এন্ট্রি ধরেছে (স্ট্যাটাস ১–৬)   missed = লিমিটে দাম ফেরেনি (৮)   replaced = নতুন সিগন্যালে বাতিল (৭)   pending = লিমিটের অপেক্ষায় (০)
     open      = এন্ট্রি হয়েছে কিন্তু এখনো শেষ হয়নি (১–৩)   closed = শেষ হয়েছে (TP3 / SL / BE)
     শেষ হওয়া ট্রেডের মধ্যে: tp1/tp2/tp3 = অন্তত ওই টার্গেট ছুঁয়েছে (জমা গণনা), sl = শুরু থেকে SL, be = TP1 ছুঁয়ে SL এন্ট্রিতে ফিরে বেরিয়েছে, expired = সময়শেষে ক্লোজ দামে বন্ধ (স্ট্যাটাস ৯)
     expAll = পুরো পজিশন TP3-তে/SL-এ (বর্তমান নিয়ম)   expTp1 / expTp2 = যদি পুরো পজিশন TP1 / TP2-তেই বন্ধ করা হতো */
  function breakdown(trades) {
    var b = { signals: trades.length, expired: 0, entered: 0, missed: 0, replaced: 0, pending: 0, open: 0, openTp1: 0, closed: 0, tp1: 0, tp2: 0, tp3: 0, sl: 0, slAfterTp1: 0, be: 0, buy: 0, sell: 0, winRate: 0, tp1Rate: 0, tp2Rate: 0, tp3Rate: 0, slRate: 0, beRate: 0, expAll: 0, expTp1: 0, expTp2: 0, totalR: 0 };
    var sAll = 0, sT1 = 0, sT2 = 0;
    trades.forEach(function (t) {
      if (t.dir === 1) b.buy++; else b.sell++;
      var st = t.status;
      if (st === 0) { b.pending++; return; }
      if (st === 7) { b.replaced++; return; }
      if (st === 8) { b.missed++; return; }
      b.entered++;
      if (st >= 1 && st <= 3) { b.open++; if (t.tp1Hit) b.openTp1++; return; }
      if (st !== 4 && st !== 5 && st !== 6 && st !== 9) return;
      b.closed++;
      var ev = t.events || [], has2 = st === 4, q;
      for (q = 0; q < ev.length; q++) if (ev[q].type === 'TP2') has2 = true;
      var hit1 = !!t.tp1Hit || st === 4 || st === 6, tr = t.tpR || [];
      var r1 = tr[0] > 0 ? tr[0] : 1, r2 = tr[1] > 0 ? tr[1] : 2;
      if (hit1) b.tp1++;
      if (has2) b.tp2++;
      if (st === 4) b.tp3++;
      else if (st === 6) b.be++;
      else if (st === 9) b.expired++;
      else { b.sl++; if (t.tp1Hit) b.slAfterTp1++; }
      sAll += rOf(t);
      sT1 += hit1 ? r1 : st === 9 ? rOf(t) : -1;
      sT2 += has2 ? r2 : st === 9 ? rOf(t) : -1;
    });
    var n = b.closed;
    if (n) {
      b.winRate = b.tp3 / n * 100; b.tp1Rate = b.tp1 / n * 100; b.tp2Rate = b.tp2 / n * 100; b.tp3Rate = b.tp3 / n * 100; b.slRate = b.sl / n * 100; b.beRate = b.be / n * 100;
      b.totalR = sAll; b.expAll = sAll / n; b.expTp1 = sT1 / n; b.expTp2 = sT2 / n;
    }
    return b;
  }
  /* একাধিক মার্কেট/টাইমফ্রেমের breakdown যোগ করা (শুধু গণনার সংখ্যা যোগ হয়, হার আবার হিসাব হয়) */
  function addBreakdown(list) {
    var keys = ['signals', 'expired', 'entered', 'missed', 'replaced', 'pending', 'open', 'openTp1', 'closed', 'tp1', 'tp2', 'tp3', 'sl', 'slAfterTp1', 'be', 'buy', 'sell'];
    var o = {}, sums = { totalR: 0, t1: 0, t2: 0 };
    keys.forEach(function (k) { o[k] = 0; });
    list.forEach(function (x) { keys.forEach(function (k) { o[k] += x[k] || 0; }); sums.totalR += x.totalR || 0; sums.t1 += (x.expTp1 || 0) * (x.closed || 0); sums.t2 += (x.expTp2 || 0) * (x.closed || 0); });
    var n = o.closed;
    o.winRate = n ? o.tp3 / n * 100 : 0; o.tp1Rate = n ? o.tp1 / n * 100 : 0; o.tp2Rate = n ? o.tp2 / n * 100 : 0; o.tp3Rate = n ? o.tp3 / n * 100 : 0; o.slRate = n ? o.sl / n * 100 : 0; o.beRate = n ? o.be / n * 100 : 0;
    o.totalR = sums.totalR; o.expAll = n ? sums.totalR / n : 0; o.expTp1 = n ? sums.t1 / n : 0; o.expTp2 = n ? sums.t2 / n : 0;
    return o;
  }

  R.analytics = { metrics: metrics, walkForward: walkForward, monteCarlo: monteCarlo, verdict: verdict, rOf: rOf, setSplit: setSplit, closedOf: closedOf, breakdown: breakdown, addBreakdown: addBreakdown };
})(window.RTX);
