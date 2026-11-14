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
  if (u.pathname.includes('/football_ncaaf/')) {
    // College football slate to try the Best Lines filters: big games, a ranked G5 game,
    // a MAC game, an FCS game, a P5-vs-FCS game and a Division II game.
    const CFB = [['Georgia Bulldogs', 'Auburn Tigers'], ['UNLV Rebels', 'New Mexico Lobos'], ['Toledo Rockets', 'Kent State Golden Flashes'],
      ['Montana Grizzlies', 'Montana State Bobcats'], ['Mercer Bears', 'Alabama Crimson Tide'], ['Ferris State Bulldogs', 'Grand Valley State Lakers'],
      ['USC Trojans', 'Indiana Hoosiers'], ['Wake Forest Demon Deacons', 'SMU Mustangs']];
    if (u.pathname.endsWith('/events')) {
      body = CFB.map(([a, h], i) => ({ id: 201 + i, away_team: a, home_team: h, commence_time: new Date(Date.now() + 3600e3 * (i + 1)).toISOString() }));
    } else {
      const i = +u.pathname.split('/events/')[1].split('/')[0] - 201, [A, H] = CFB[i];
      const bk = (key, ml) => ({ key, title: key[0].toUpperCase() + key.slice(1), markets: [
        { key: 'h2h', outcomes: [{ name: A, price: ml[0] }, { name: H, price: ml[1] }] },
        { key: 'spreads', line_type: 'main', outcomes: [{ name: A, point: 6.5, price: -110 }, { name: H, point: -6.5, price: -110 }] },
        { key: 'totals', line_type: 'main', outcomes: [{ name: 'Over', point: 51.5, price: -110 }, { name: 'Under', point: 51.5, price: -110 }] },
        { key: 'totals', team: H, outcomes: [{ name: 'Over', point: 30.5, price: key === 'fanduel' ? 120 : -110 }, { name: 'Under', point: 30.5, price: key === 'fanduel' ? -150 : -110 }] },
        { key: 'spreads', period: 'h1', outcomes: [{ name: A, point: 3.5, price: key === 'fanduel' ? 110 : -110 }, { name: H, point: -3.5, price: key === 'fanduel' ? -135 : -110 }] },
        { key: 'h2h', period: 'q1', outcomes: [{ name: A, price: key === 'fanduel' ? 190 : 160 }, { name: H, price: -200 }] }] });
      body = { id: 201 + i, home_team: H, away_team: A, bookmakers: [bk('draftkings', [200, -250]), bk('fanduel', [235 + 10 * i, -290]), bk('pinnacle', [205, -245])] };
    }
  } else if (process.env.RICH && u.pathname.endsWith('/events')) {
    body = [101, 102, 103, 104].map(id => ({ id, home_team: 'Home ' + id, away_team: 'Away ' + id, commence_time: new Date(Date.now() + 3600e3 * (id - 100)).toISOString() }));
  } else if (process.env.RICH && u.pathname.includes('/odds')) {
    // 6 players per game; books lean over by a seeded amount so some clear 54%
    const id = +u.pathname.split('/events/')[1].split('/')[0];
    const sp = u.pathname.split('/sports/')[1].split('/')[0].split('_')[1];
    const MK = sp === 'nhl' ? 'player_shots_on_goal' : 'player_points';
    const players = Array.from({ length: 6 }, (_, i) => `${sp} Player ${id}-${i}`);
    const lean = (i) => [-185, -160, -140, -125, -110, -105][i];
    const ou = (pl, i, price) => [{ name: 'Over', description: pl, point: 20.5, price }, { name: 'Under', description: pl, point: 20.5, price: Math.round(-price * 0.8) }];
    const H = 'Home ' + id, A = 'Away ' + id;
    // game lines: FanDuel hangs a generous away price that grows by game
    const gl = key => {
      const ml = { draftkings: [120, -140], fanduel: [140 + 15 * (id - 101), -165], pinnacle: [125, -145] }[key];
      return [
        { key: 'h2h', outcomes: [{ name: A, price: ml[0] }, { name: H, price: ml[1] }] },
        { key: 'spreads', line_type: 'main', outcomes: [{ name: A, point: 3.5, price: key === 'fanduel' ? 100 : -110 }, { name: H, point: -3.5, price: key === 'fanduel' ? -120 : -110 }] },
        { key: 'totals', line_type: 'main', outcomes: [{ name: 'Over', point: 220.5, price: -110 }, { name: 'Under', point: 220.5, price: -110 }] },
      ];
    };
    const book = key => ({ key, title: key[0].toUpperCase() + key.slice(1), markets: [{ key: MK, outcomes: players.flatMap((pl, i) => ou(pl, i, lean((i + id) % 6))) }, ...gl(key)] });
    const dfs = (key, extra) => ({ key, markets: [{ key: MK, outcomes: players.flatMap(pl => [
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
