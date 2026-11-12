// ফাইলের নাম: optimize.js
// পাথ: js/optimize.js   (GitHub রিপোর রুট থেকে: js ফোল্ডারের ভেতরে)
/* RTX Chart — অটো-সেটআপ (নতুন POWER ইঞ্জিনের জন্য)
   প্রতিটি মার্কেট ও টাইমফ্রেমে মোড, ন্যূনতম স্কোর, TP পর্যন্ত ন্যূনতম জায়গা, TP3 দূরত্ব ও ব্রেক-ইভেন — এই ১৬২টি সংমিশ্রণ পরীক্ষা করে।
   নিয়ম: আগের ৬৫% ক্যান্ডেলে (ট্রেনিং) সেরা সেটিং বাছে, তারপর শেষ ৩৫% ক্যান্ডেলে (অদেখা টেস্ট) যাচাই করে।
   টেস্টে যা কাজ করেনি সেটা "নির্ভরযোগ্য নয়" বলে দেখায়। ফলাফল R-এ: SL = −১R, ব্রেক-ইভেন = ০, TP3 = +tp3R।
   সতর্কতা: অনেক সেটিং থেকে সেরাটা বাছলে ভাগ্যের প্রভাব থাকে, তাই টেস্টের সংখ্যাই আসল। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var MODES = ['safe', 'smart', 'aggressive'], SCORES = [65, 75, 85], ROOMS = [1, 1.5, 2], TP3S = [2, 3, 4], BES = [true, false];
  var MODE_BN = { safe: 'SAFE', smart: 'SMART', aggressive: 'AGGRESSIVE' };

  function stats(trades, from, to) {
    var cl = trades.filter(function (t) { return t.bar >= from && t.bar < to && (t.status === 4 || t.status === 5 || t.status === 6); });
    var n = cl.length, tp3 = 0, sl = 0, be = 0, tp1 = 0, rSum = 0;
    cl.forEach(function (t) {
      var r = R.analytics.rOf(t); rSum += r;
      if (t.tp1Hit) tp1++;
      if (t.status === 4) tp3++; else if (t.status === 5) sl++; else be++;
    });
    return { n: n, tp3: tp3, sl: sl, be: be, tp1: tp1, hit3: n ? tp3 / n * 100 : 0, hit1: n ? tp1 / n * 100 : 0, exp: n ? rSum / n : 0 };
  }

  function mkCfg(base, c) {
    return Object.assign({}, base, {
      power: true, engine: 'decision', noBoard: true, mode: c.mode, ov: { minScore: c.s, minRoomR: c.room },
      tp3R: c.tp3, tp2R: +(c.tp3 * 2 / 3).toFixed(2), tp1R: +(c.tp3 / 3).toFixed(2), beOn: c.be
    });
  }

  /* cs: বন্ধ ক্যান্ডেল (ফর্মিং বাদে)। রিটার্ন: Promise → { top: [...], bars, split, tested, passedTrain } */
  function search(cs, htf, baseCfg, info, tfSec, mode, onProgress) {
    var U = R.ultra, P = R.power, n = cs.length, split = Math.floor(n * 0.65);
    var base = U.engine(cs, htf, Object.assign({}, baseCfg), info, tfSec, mode);
    var combos = [];
    MODES.forEach(function (m) { SCORES.forEach(function (s) { ROOMS.forEach(function (rm) { TP3S.forEach(function (t3) { BES.forEach(function (be) { combos.push({ mode: m, s: s, room: rm, tp3: t3, be: be }); }); }); }); }); });
    var results = [], idx = 0;
    return new Promise(function (resolve, reject) {
      function chunk() {
        try {
          var end = Math.min(combos.length, idx + 8);
          for (; idx < end; idx++) {
            var c = combos[idx], cfg = mkCfg(baseCfg, c), res = P.run(cs, base, cfg, info, tfSec, mode);
            results.push({ c: c, train: stats(res.trades, 0, split), test: stats(res.trades, split, n) });
          }
          if (onProgress) onProgress(idx / combos.length);
          if (idx < combos.length) setTimeout(chunk, 0); else resolve(finish());
        } catch (e) { reject(e); }
      }
      function finish() {
        // ট্রেনিংয়ে ন্যূনতম ১০ ট্রেড ও ধনাত্মক প্রত্যাশা; সেরা প্রত্যাশা আগে, সমান হলে TP3 হিট বেশি
        var ok = results.filter(function (r) { return r.train.n >= 10 && r.train.exp > 0; });
        ok.sort(function (a, b) { return (b.train.exp - a.train.exp) || (b.train.hit3 - a.train.hit3); });
        var top = ok.slice(0, 3).map(function (r) {
          var c = r.c;
          r.reliable = r.test.n >= 6 && r.test.exp > 0;
          r.label = MODE_BN[c.mode] + ' · ন্যূনতম স্কোর ' + c.s + ' · TP পর্যন্ত জায়গা ' + c.room + 'R · TP3 ' + c.tp3 + 'R · BE ' + (c.be ? 'চালু' : 'বন্ধ');
          r.cfg = { power: true, engine: 'decision', mode: c.mode, ov: { minScore: c.s, minRoomR: c.room }, tp3R: c.tp3, tp2R: +(c.tp3 * 2 / 3).toFixed(2), tp1R: +(c.tp3 / 3).toFixed(2), beOn: c.be };
          return r;
        });
        return { top: top, bars: n, split: split, tested: results.length, passedTrain: ok.length };
      }
      chunk();
    });
  }

  R.opt = { search: search, stats: stats, mkCfg: mkCfg, COMBOS: MODES.length * SCORES.length * ROOMS.length * TP3S.length * BES.length };
})(window.RTX);
