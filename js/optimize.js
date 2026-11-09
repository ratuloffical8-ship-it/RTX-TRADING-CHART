/* RTX Chart — অটো-সেটআপ: প্রতিটি মার্কেট ও টাইমফ্রেমের জন্য POWER সেটিং খোঁজে।
   নিয়ম: আগের ৬৫% ক্যান্ডেলে (ট্রেনিং) সেরা সেটিং বাছে, তারপর শেষ ৩৫% ক্যান্ডেলে (টেস্ট) যাচাই করে।
   টেস্টে যা কাজ করেনি সেটা "নির্ভরযোগ্য নয়" বলে দেখায়। ফলাফল: SL = −১R, ব্রেক-ইভেন = ০, TP3 = +tp3R। */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  var MASKS = [];
  (function () { for (var m = 1; m < 16; m++) { var c = 0; for (var b = 0; b < 4; b++) if (m & (1 << b)) c++; for (var v = 1; v <= c; v++) MASKS.push([m, v]); } })();
  var NAMES = ['ULTRA', 'XL', 'UT', 'JDT'];
  var SLS = [[0.6, 0.25], [1.0, 0.4], [1.5, 0.5]], TP3S = [1.5, 2, 3], SCORES = [60, 70, 80];

  function maskName(m) { var o = []; for (var b = 0; b < 4; b++) if (m & (1 << b)) o.push(NAMES[b]); return o.join('+'); }

  function stats(trades, from, to) {
    var n = 0, tp3 = 0, sl = 0, be = 0, tp1 = 0, rSum = 0;
    trades.forEach(function (t) {
      if (t.bar < from || t.bar >= to) return;
      if (t.status !== 4 && t.status !== 5 && t.status !== 6) return;
      n++; if (t.tp1Hit) tp1++;
      if (t.status === 4) { tp3++; rSum += t.rr3; } else if (t.status === 5) { sl++; rSum -= 1; } else be++;
    });
    return { n: n, tp3: tp3, sl: sl, be: be, tp1: tp1, hit3: n ? tp3 / n * 100 : 0, hit1: n ? tp1 / n * 100 : 0, exp: n ? rSum / n : 0 };
  }

  function mkCfg(base, c) {
    return Object.assign({}, base, {
      power: true, noBoard: true, pwHtf: true, pwWin: 3, oneTrade: true,
      gUltra: !!(c.m & 1), gXl: !!(c.m & 2), gUt: !!(c.m & 4), gJdt: !!(c.m & 8), pwVotes: c.v, pwMinScore: c.s,
      slMinAtr: c.sl[0], slBuf: c.sl[1], tp3R: c.tp3, tp2R: +(c.tp3 * 2 / 3).toFixed(2), tp1R: +(c.tp3 / 3).toFixed(2), beOn: c.be
    });
  }

  /* cs: বন্ধ ক্যান্ডেল (ফর্মিং বাদে)। রিটার্ন: Promise → { top: [...], bars, split } */
  function search(cs, htf, baseCfg, info, tfSec, mode, onProgress) {
    var U = R.ultra, P = R.power, n = cs.length;
    var split = Math.floor(n * 0.65);
    var ucfg = Object.assign({}, baseCfg);
    var base = U.engine(cs, htf, ucfg, info, tfSec, mode);
    var combos = [];
    MASKS.forEach(function (mv) { SCORES.forEach(function (s) { SLS.forEach(function (sl) { TP3S.forEach(function (tp3) { [true, false].forEach(function (be) { combos.push({ m: mv[0], v: mv[1], s: s, sl: sl, tp3: tp3, be: be }); }); }); }); }); });
    var results = [], idx = 0;
    return new Promise(function (resolve, reject) {
      function chunk() {
        try {
          var end = Math.min(combos.length, idx + 40);
          for (; idx < end; idx++) {
            var c = combos[idx], cfg = mkCfg(baseCfg, c), res = P.run(cs, base, cfg, info, tfSec, mode);
            res.trades.forEach(function (t) { t.rr3 = c.tp3; });
            var tr = stats(res.trades, 0, split), te = stats(res.trades, split, n);
            results.push({ c: c, train: tr, test: te });
          }
          if (onProgress) onProgress(idx / combos.length);
          if (idx < combos.length) setTimeout(chunk, 0);
          else resolve(finish());
        } catch (e) { reject(e); }
      }
      function finish() {
        // বাছাই: ট্রেনিংয়ে ন্যূনতম ১০ ট্রেড, প্রত্যাশা (R) সবচেয়ে বেশি; সমান হলে TP3 হিট বেশি
        var ok = results.filter(function (r) { return r.train.n >= 10 && r.train.exp > 0; });
        ok.sort(function (a, b) { return (b.train.exp - a.train.exp) || (b.train.hit3 - a.train.hit3); });
        var top = ok.slice(0, 3).map(function (r) {
          r.reliable = r.test.n >= 6 && r.test.exp > 0 && r.test.hit3 >= 40;
          r.label = maskName(r.c.m) + ' · ভোট ' + r.c.v + ' · স্কোর ' + r.c.s + ' · SL ' + r.c.sl[0] + '×ATR · TP3 ' + r.c.tp3 + 'R · BE ' + (r.c.be ? 'on' : 'off');
          r.cfg = { power: true, gUltra: !!(r.c.m & 1), gXl: !!(r.c.m & 2), gUt: !!(r.c.m & 4), gJdt: !!(r.c.m & 8), pwVotes: r.c.v, pwMinScore: r.c.s, pwWin: 3, pwHtf: true, slMinAtr: r.c.sl[0], slBuf: r.c.sl[1], tp3R: r.c.tp3, tp2R: +(r.c.tp3 * 2 / 3).toFixed(2), tp1R: +(r.c.tp3 / 3).toFixed(2), beOn: r.c.be };
          return r;
        });
        return { top: top, bars: n, split: split, tested: results.length, passedTrain: ok.length };
      }
      chunk();
    });
  }

  R.opt = { search: search, stats: stats, mkCfg: mkCfg, maskName: maskName, COMBOS: MASKS.length * SCORES.length * SLS.length * TP3S.length * 2 };
})(window.RTX);
