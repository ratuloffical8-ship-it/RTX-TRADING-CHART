/* RTX Chart — Yahoo Finance প্রক্সি (Render Web Service)। কোনো লাইব্রেরি লাগে না (Node 18+) */
const http = require('http');
const PORT = process.env.PORT || 3000;
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const cache = new Map();

function send(res, code, body) {
  res.writeHead(code, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (u.pathname === '/') return send(res, 200, { ok: true, name: 'rtx-yahoo-proxy' });
  if (u.pathname !== '/y') return send(res, 404, { error: 'not found' });
  const symbol = u.searchParams.get('symbol') || '', interval = u.searchParams.get('interval') || '15m';
  const p1 = parseInt(u.searchParams.get('p1'), 10), p2 = parseInt(u.searchParams.get('p2'), 10);
  if (!/^[A-Za-z0-9=\.\-\^]{1,20}$/.test(symbol) || !/^(1m|2m|5m|15m|30m|60m|90m|1h|1d|5d|1wk|1mo)$/.test(interval) || !(p1 > 0) || !(p2 > p1))
    return send(res, 400, { error: 'bad params' });
  const key = [symbol, interval, p1, p2].join('|'), hit = cache.get(key);
  if (hit && Date.now() - hit.t < 4000) return send(res, 200, hit.b);
  let last = 'unknown';
  for (const h of HOSTS) {
    try {
      const url = h + '/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=' + interval + '&period1=' + p1 + '&period2=' + p2 + '&includePrePost=false';
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      const txt = await r.text();
      if (!r.ok) { last = 'Yahoo HTTP ' + r.status; continue; }
      if (cache.size > 300) cache.clear();
      cache.set(key, { t: Date.now(), b: txt });
      return send(res, 200, txt);
    } catch (e) { last = e.message; }
  }
  send(res, 502, { error: last });
}).listen(PORT, () => console.log('proxy on ' + PORT));
