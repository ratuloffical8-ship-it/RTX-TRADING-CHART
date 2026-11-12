// ফাইলের নাম: analytics.js
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

  function closedOf(trades) { return trades.filter(function (t) { return t.status === 4 || t.status === 5 || t.status === 6; }); }
  function rOf(t) {
    var tp3 = t.tpR && t.tpR[2] ? t.tpR[2] : (t.rr3 || 3);
    return t.status === 4 ? tp3 : t.status === 5 ? -1 : t.status === 6 ? 0 : null;
  }

  function metrics(trades) {
    var cl = closedOf(trades), n = cl.length, open = trades.length - n;
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

  R.analytics = { metrics: metrics, walkForward: walkForward, monteCarlo: monteCarlo, verdict: verdict, rOf: rOf, closedOf: closedOf };
})(window.RTX);
