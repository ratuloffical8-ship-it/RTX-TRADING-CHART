/* RTX Chart — ডেটা: সিম্বল, টাইমফ্রেম, লাইভ প্রাইস (Binance), ডেমো ডেটা, শেখার পাঠ ও দৈনিক টাস্ক */
window.RTX = window.RTX || {};
(function (R) {
  'use strict';

  R.SYMBOLS = [
    { id: 'BTCUSDT', name: 'BTC/USDT' },
    { id: 'ETHUSDT', name: 'ETH/USDT' },
    { id: 'BNBUSDT', name: 'BNB/USDT' },
    { id: 'SOLUSDT', name: 'SOL/USDT' },
    { id: 'XRPUSDT', name: 'XRP/USDT' },
    { id: 'DOGEUSDT', name: 'DOGE/USDT' },
    { id: 'ADAUSDT', name: 'ADA/USDT' },
    { id: 'LTCUSDT', name: 'LTC/USDT' }
  ];

  R.TFS = [
    { id: '1m', label: '1m', sec: 60 },
    { id: '3m', label: '3m', sec: 180 },
    { id: '5m', label: '5m', sec: 300 },
    { id: '15m', label: '15m', sec: 900 },
    { id: '30m', label: '30m', sec: 1800 },
    { id: '1h', label: '1h', sec: 3600 },
    { id: '4h', label: '4h', sec: 14400 },
    { id: '1d', label: '1D', sec: 86400 },
    { id: '1w', label: '1W', sec: 604800 }
  ];

  var HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];
  var WSS = ['wss://stream.binance.com:9443/ws/', 'wss://data-stream.binance.vision/ws/'];

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  R.data = {
    /* পুরোনো ক্যান্ডেল আনতে endTime (ms) দেওয়া যায় */
    klines: async function (symbol, tf, limit, endTime) {
      var lastErr;
      for (var i = 0; i < HOSTS.length; i++) {
        try {
          var url = HOSTS[i] + '/api/v3/klines?symbol=' + symbol + '&interval=' + tf + '&limit=' + (limit || 1000);
          if (endTime) url += '&endTime=' + endTime;
          var r = await fetch(url);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          var a = await r.json();
          return a.map(function (k) {
            return { time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] };
          });
        } catch (e) { lastErr = e; }
      }
      throw lastErr;
    },

    /* লাইভ ওয়েবসকেট — অটো রিকানেক্ট */
    live: function (symbol, tf, onCandle, onStatus) {
      var ws, closed = false, idx = 0, retry = 0, timer;
      function open() {
        if (closed) return;
        try { ws = new WebSocket(WSS[idx % WSS.length] + symbol.toLowerCase() + '@kline_' + tf); }
        catch (e) { schedule(); return; }
        ws.onopen = function () { retry = 0; onStatus(true); };
        ws.onmessage = function (e) {
          try {
            var k = JSON.parse(e.data).k; if (!k) return;
            onCandle({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v });
          } catch (_) {}
        };
        ws.onclose = function () { onStatus(false); if (!closed) { idx++; schedule(); } };
        ws.onerror = function () { try { ws.close(); } catch (_) {} };
      }
      function schedule() { retry++; timer = setTimeout(open, Math.min(1000 * retry, 5000)); }
      open();
      return { close: function () { closed = true; clearTimeout(timer); try { ws && ws.close(); } catch (_) {} } };
    },

    /* ইন্টারনেট/Binance না পেলে ডেমো ডেটা */
    demo: function (symbol, sec, n, endTimeSec) {
      var base = { BTCUSDT: 65000, ETHUSDT: 3200, BNBUSDT: 600, SOLUSDT: 150, XRPUSDT: 0.55, DOGEUSDT: 0.15, ADAUSDT: 0.45, LTCUSDT: 80 }[symbol] || 100;
      var end = endTimeSec ? endTimeSec - sec : Math.floor(Date.now() / 1000 / sec) * sec;
      var rnd = rng(hash(symbol) + (endTimeSec || 0));
      var p = base * (0.92 + rnd() * 0.16), out = [], t = end - (n - 1) * sec, drift = 0;
      for (var i = 0; i < n; i++) {
        if (i % 40 === 0) drift = (rnd() - 0.5) * 0.0012;
        var vol = p * 0.003, o = p;
        var c = o + (rnd() - 0.5) * 2 * vol + p * drift;
        var h = Math.max(o, c) + rnd() * vol * 0.6, l = Math.min(o, c) - rnd() * vol * 0.6;
        out.push({ time: t, open: o, high: h, low: l, close: c, volume: 50 + rnd() * 400 });
        p = c; t += sec;
      }
      return out;
    },
    demoLive: function (sec, getLast, onCandle, onStatus) {
      var id = setInterval(function () {
        var last = getLast(); if (!last) return;
        var now = Math.floor(Date.now() / 1000), bucket = Math.floor(now / sec) * sec;
        var step = last.close * 0.0008, c;
        if (bucket > last.time) {
          var o = last.close; c = o + (Math.random() - 0.5) * step * 2;
          c = { time: bucket, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 10 };
        } else {
          var cl = last.close + (Math.random() - 0.5) * step * 2;
          c = { time: last.time, open: last.open, high: Math.max(last.high, cl), low: Math.min(last.low, cl), close: cl, volume: last.volume + Math.random() * 5 };
        }
        onCandle(c);
      }, 1000);
      onStatus(true);
      return { close: function () { clearInterval(id); } };
    }
  };

  /* ---------- শেখার পাঠ ---------- */
  R.LESSONS = [
    {
      id: 'l1', icon: '📊', title: 'ক্যান্ডেলস্টিক পড়তে শেখা',
      points: [
        'প্রতিটি ক্যান্ডেলে চারটি দাম থাকে: Open, High, Low, Close।',
        'এই চার্টে নীল ক্যান্ডেল = দাম উঠেছে (Close > Open), সাদা ক্যান্ডেল = দাম নেমেছে।',
        'বডি বড় হলে ক্রেতা বা বিক্রেতার চাপ জোরালো। লম্বা উইক মানে দাম ওই জায়গা থেকে ফিরে এসেছে (রিজেকশন)।',
        'একটা ক্যান্ডেল দেখে সিদ্ধান্ত নেওয়া যায় না। আগের ক্যান্ডেল আর দামের জায়গা (লেভেল) একসাথে দেখতে হয়।'
      ],
      practice: '১৫m চার্টে ১০টি ক্যান্ডেল বেছে প্রতিটির বডি ও উইক দেখে লেখো: ক্রেতা না বিক্রেতা শক্তিশালী ছিল?'
    },
    {
      id: 'l2', icon: '📈', title: 'ট্রেন্ড চেনা',
      points: [
        'আপট্রেন্ড: ক্রমাগত উঁচু হাই ও উঁচু লো (Higher High, Higher Low)।',
        'ডাউনট্রেন্ড: ক্রমাগত নিচু হাই ও নিচু লো (Lower High, Lower Low)।',
        'সাইডওয়েজ: দাম একটা সীমার মধ্যে ঘুরছে, এখানে ট্রেড করা কঠিন।',
        'আগে বড় টাইমফ্রেমে (4h বা 1D) ট্রেন্ড দেখো, তারপর ছোট টাইমফ্রেমে এন্ট্রি খোঁজো।',
        'ট্রেন্ডলাইন আঁকতে অন্তত দুইটা লো (আপট্রেন্ডে) বা হাই (ডাউনট্রেন্ডে) জোড়া লাগাও। তৃতীয়বার ছুঁলে লাইনটা আরও নির্ভরযোগ্য।'
      ],
      practice: 'আজ BTC এর 1D চার্টে একটা ট্রেন্ডলাইন আঁকো এবং লেখো ট্রেন্ড কোন দিকে।'
    },
    {
      id: 'l3', icon: '🧱', title: 'সাপোর্ট ও রেজিস্ট্যান্স',
      points: [
        'সাপোর্ট হলো যে জায়গা থেকে দাম আগে একাধিকবার উপরে ফিরেছে। রেজিস্ট্যান্স হলো যে জায়গা থেকে দাম নিচে নেমেছে।',
        'এগুলো একটা নির্দিষ্ট দাম নয়, একটা জোন। তাই হরাইজন্টাল লাইনের বদলে বক্স আঁকলে বেশি কাজে লাগে।',
        'রেজিস্ট্যান্স ভেঙে দাম উপরে উঠলে সেটা প্রায়ই নতুন সাপোর্ট হয়ে যায়, আবার উল্টোটাও।',
        'যত বেশিবার কোনো লেভেল কাজ করেছে এবং যত বড় টাইমফ্রেমে, লেভেল তত গুরুত্বপূর্ণ।'
      ],
      practice: '4h চার্টে ৩টি সাপোর্ট ও ৩টি রেজিস্ট্যান্স জোন বক্স দিয়ে চিহ্নিত করো।'
    },
    {
      id: 'l4', icon: 'ƒx', title: 'ইন্ডিকেটর ব্যবহার',
      points: [
        'EMA/SMA ট্রেন্ডের দিক বুঝতে সাহায্য করে। দাম EMA 50 এর উপরে থাকলে সাধারণত আপট্রেন্ড।',
        'RSI 70 এর উপরে মানে ওভারবট, 30 এর নিচে মানে ওভারসোল্ড। কিন্তু শক্তিশালী ট্রেন্ডে RSI অনেকক্ষণ ওই জায়গায় থাকতে পারে।',
        'বলিঞ্জার ব্যান্ড দেখায় মার্কেট কতটা অস্থির (ভোলাটিলিটি)। ব্যান্ড সরু হলে বড় মুভের আগের অবস্থা হতে পারে।',
        'ইন্ডিকেটর দেরিতে সিগন্যাল দেয় (lagging)। ২-৩টির বেশি একসাথে লাগালে চার্ট ঘোলাটে হয়।'
      ],
      practice: 'চার্টে EMA 20 ও EMA 50 চালু করো। যখন EMA 20 উপরে ওঠে EMA 50 কে পার করে, তখন দাম কী করেছে গত ১০ বার দেখো।'
    },
    {
      id: 'l5', icon: '🛡️', title: 'রিস্ক ম্যানেজমেন্ট',
      points: [
        'এক ট্রেডে ব্যালেন্সের ১-২% এর বেশি ঝুঁকি নিও না।',
        'স্টপলস ছাড়া কোনো ট্রেডে ঢুকো না। এন্ট্রির আগেই ঠিক করো কোথায় ভুল প্রমাণ হবে।',
        'পজিশন সাইজ = (ব্যালেন্স × রিস্ক%) ÷ (এন্ট্রি − স্টপলস)।',
        'উদাহরণ: ব্যালেন্স ১০০০$, রিস্ক ১% = ১০$। স্টপলস এন্ট্রি থেকে ৫$ দূরে হলে সাইজ = ১০ ÷ ৫ = ২ ইউনিট।',
        'দিনে সর্বোচ্চ লস লিমিট ঠিক করো (যেমন ২-৩%)। সেটা ছুঁলে সেদিনের মতো বন্ধ।'
      ],
      practice: 'তোমার কল্পিত ব্যালেন্স ধরে ১% রিস্কে ৩টি আলাদা স্টপলস দূরত্বের জন্য পজিশন সাইজ হিসাব করো।'
    },
    {
      id: 'l6', icon: '⚖️', title: 'রিস্ক : রিওয়ার্ড',
      points: [
        'ট্রেডে কত ঝুঁকি নিচ্ছ আর কত লাভের সম্ভাবনা, এই অনুপাতই R:R।',
        'অন্তত ১:২ রাখার চেষ্টা করো। মানে ১$ ঝুঁকিতে ২$ লাভের টার্গেট।',
        'উদাহরণ: ১০টা ট্রেডে প্রতিটিতে ১$ ঝুঁকি, ১:২ হলে ৪টা জিতে ৬টা হারলেও লাভ হয়: (৪×২) − ৬ = +২$।',
        'তাই সবসময় জেতা জরুরি নয়। ছোট লস আর বড় লাভ রাখাই আসল কৌশল।'
      ],
      practice: 'চার্টে একটা কল্পিত এন্ট্রি বেছে স্টপলস ও টার্গেটে লাইন আঁকো এবং R:R কত হলো মাপো (📏 টুল ব্যবহার করো)।'
    },
    {
      id: 'l7', icon: '🧠', title: 'ট্রেডিং সাইকোলজি',
      points: [
        'সবচেয়ে বেশি ক্ষতি হয় ভয়, লোভ আর FOMO (মিস হয়ে যাওয়ার ভয়) থেকে।',
        'লস হওয়ার পর সেটা ফেরত আনতে তাড়াহুড়ো করে ট্রেড (রিভেঞ্জ ট্রেড) সবচেয়ে বিপজ্জনক। লস খেলে বিরতি নাও।',
        'প্ল্যান ছাড়া এন্ট্রি নয়: কেন ঢুকছি, কোথায় স্টপ, কোথায় টার্গেট, আগে লিখে নাও।',
        'বেশি ট্রেড মানে বেশি লাভ নয়। ভালো সেটআপের জন্য অপেক্ষা করাও ট্রেডিংয়ের অংশ।'
      ],
      practice: 'আজ কোন মুহূর্তে তাড়াহুড়ো করতে ইচ্ছে হয়েছে লিখে রাখো এবং কেন, সেটাও।'
    },
    {
      id: 'l8', icon: '📝', title: 'জার্নাল ও রিভিউ',
      points: [
        'প্রতিটি ট্রেডের কারণ, এন্ট্রি, স্টপলস, টার্গেট, ফলাফল আর কী ভুল করেছ লিখে রাখো।',
        'সপ্তাহে একবার পুরো জার্নাল পড়ে দেখো কোন ভুলটা বারবার হচ্ছে।',
        'আগে ডেমো বা পেপার ট্রেডে অন্তত ১০০টা ট্রেড করো। তারপর খুব ছোট টাকা দিয়ে শুরু করো।',
        'নিজের টাকায় সহজে পারা যায় না, তাই হারানোর মতো নয় এমন টাকাই ব্যবহার করো।'
      ],
      practice: 'আজকের একটা কল্পিত ট্রেড জার্নালে (খাতায় বা নোটে) লেখো: কারণ, এন্ট্রি, স্টপ, টার্গেট, ফলাফল।'
    }
  ];

  /* ---------- দৈনিক টাস্ক ---------- */
  R.DAILY = [
    { id: 'd1', text: 'আজকের একটি পাঠ পড়ো (শেখা ট্যাব)' },
    { id: 'd2', text: 'চার্টে ৩টি সাপোর্ট বা রেজিস্ট্যান্স জোন আঁকো' },
    { id: 'd3', text: 'বড় টাইমফ্রেমে (4h বা 1D) ট্রেন্ড কোন দিকে, লিখে রাখো' },
    { id: 'd4', text: '১টি পেপার ট্রেড প্ল্যান করো: এন্ট্রি, স্টপলস, টার্গেট (R:R অন্তত ১:২)' },
    { id: 'd5', text: 'প্ল্যানের রিস্ক ব্যালেন্সের ১-২% এর মধ্যে আছে কিনা হিসাব করো' },
    { id: 'd6', text: '২০ মিনিট পুরোনো চার্ট স্ক্রল করে প্যাটার্ন চেনার অনুশীলন করো' },
    { id: 'd7', text: 'দিন শেষে জার্নালে লেখো: কী ঠিক করলাম, কী ভুল করলাম' }
  ];
})(window.RTX);
