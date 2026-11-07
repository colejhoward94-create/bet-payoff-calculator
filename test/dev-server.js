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
  let body = u.pathname.endsWith('/events') ? SAMPLE_EVENTS.map(e => ({ ...e, commence_time: new Date(Date.now() + 3600e3 * (e.id - 100)).toISOString() })) : SAMPLE_ODDS;
  if (process.env.RICH && u.pathname.endsWith('/events')) {
    body = [101, 102, 103, 104].map(id => ({ id, home_team: 'Home ' + id, away_team: 'Away ' + id, commence_time: new Date(Date.now() + 3600e3 * (id - 100)).toISOString() }));
  } else if (process.env.RICH && u.pathname.includes('/odds')) {
    // 6 players per game; books lean over by a seeded amount so some clear 54%
    const id = +u.pathname.split('/events/')[1].split('/')[0];
    const players = Array.from({ length: 6 }, (_, i) => `Player ${id}-${i}`);
    const lean = (i) => [-185, -160, -140, -125, -110, -105][i];
    const ou = (pl, i, price) => [{ name: 'Over', description: pl, point: 20.5, price }, { name: 'Under', description: pl, point: 20.5, price: Math.round(-price * 0.8) }];
    const book = key => ({ key, markets: [{ key: 'player_points', outcomes: players.flatMap((pl, i) => ou(pl, i, lean((i + id) % 6))) }] });
    const dfs = (key, extra) => ({ key, markets: [{ key: 'player_points', outcomes: players.flatMap(pl => [
      { name: 'Over', description: pl, point: 20.5, price: 100, ...extra }, { name: 'Under', description: pl, point: 20.5, price: 100, ...extra }]) }] });
    body = { id, home_team: 'Home ' + id, away_team: 'Away ' + id, commence_time: new Date().toISOString(),
      bookmakers: [book('draftkings'), book('fanduel'), book('pinnacle'), dfs('prizepicks', { dfs_odds_type: 'standard' }), dfs('underdog', { payout_multiplier: 1 })] };
  }
  if (!process.env.RICH && u.pathname.includes('/events/102/')) {
    // second game: make Hurts a strong over so Best Lines has something to show
    body = JSON.parse(JSON.stringify(SAMPLE_ODDS));
    body.home_team = 'Kansas City Chiefs'; body.away_team = 'Buffalo Bills';
    for (const bk of body.bookmakers) for (const m of bk.markets) for (const o of m.outcomes)
      if (o.description === 'Jalen Hurts' && !(bk.key in { prizepicks: 1, underdog: 1 })) o.price = o.name === 'Over' ? -165 : 135;
  }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

const routes = {
  '/api/events': (await import('../api/events.js')).default,
  '/api/props': (await import('../api/props.js')).default,
  '/api/ping': (await import('../api/ping.js')).default,
  '/api/best': (await import('../api/best.js')).default,
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
