// Local preview with fake PropLine data: node test/dev-server.js  ->  http://localhost:3000
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { SAMPLE_ODDS, SAMPLE_EVENTS } from './sample.js';

process.env.PROPLINE_API_KEY ||= 'dev';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(url);
  if (u.hostname !== 'api.prop-line.com') return realFetch(url, opts);
  const body = u.pathname.endsWith('/events') ? SAMPLE_EVENTS.map(e => ({ ...e, commence_time: new Date(Date.now() + 3600e3 * (e.id - 100)).toISOString() })) : SAMPLE_ODDS;
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

const routes = {
  '/api/events': (await import('../api/events.js')).default,
  '/api/props': (await import('../api/props.js')).default,
  '/api/ping': (await import('../api/ping.js')).default,
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const root = new URL('../public/', import.meta.url).pathname;

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (routes[u.pathname]) {
    req.query = Object.fromEntries(u.searchParams);
    res.status = c => { res.statusCode = c; return res; };
    res.json = b => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)); };
    return routes[u.pathname](req, res);
  }
  const p = normalize(join(root, u.pathname === '/' ? 'index.html' : u.pathname));
  if (!p.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try { res.setHeader('content-type', types[extname(p)] || 'application/octet-stream'); res.end(await readFile(p)); }
  catch { res.statusCode = 404; res.end('not found'); }
}).listen(process.env.PORT || 3000, () => console.log('preview on http://localhost:' + (process.env.PORT || 3000)));
