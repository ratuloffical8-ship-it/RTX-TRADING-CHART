/* RTX Chart — সার্ভিস ওয়ার্কার: অফলাইনেও অ্যাপের ফাইল খোলে, ডিপ্লয়ের পর অনলাইনে নতুন ভার্সন আসে */
var CACHE = 'rtx-chart-v3';
var SHELL = [
  './', 'index.html', 'manifest.json', 'icon-512.png',
  'css/style.css', 'css/extra.css',
  'js/data.js', 'js/chart.js', 'js/panels.js', 'js/tools.js', 'js/paper.js', 'js/app.js'
];
var LIB = 'https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.concat([LIB]).map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* চার্ট লাইব্রেরি: ক্যাশ আগে */
  if (req.url === LIB) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); return res;
      });
    }));
    return;
  }

  /* নিজের সাইটের ফাইল: নেটওয়ার্ক আগে (সবসময় নতুন), না পেলে ক্যাশ */
  if (url.origin === self.location.origin) {
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)]).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
      })
    );
  }
  /* Binance, Twelve Data ইত্যাদির ডেটা রিকোয়েস্ট ক্যাশ হয় না */
});
