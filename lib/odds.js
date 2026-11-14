// Pure logic: turn a PropLine odds response into a list of player props with
// no-vig ("fair") hit probabilities. No network calls here, so it is easy to test.

export const SPORTS = {
  football_nfl: {
    label: 'NFL',
    markets: {
      player_pass_yds: 'Pass Yds',
      player_pass_tds: 'Pass TDs',
      player_rush_yds: 'Rush Yds',
      player_reception_yds: 'Rec Yds',
      player_receptions: 'Receptions',
      player_anytime_td: 'Anytime TD',
    },
  },
  basketball_nba: {
    label: 'NBA',
    markets: {
      player_points: 'Points',
      player_rebounds: 'Rebounds',
      player_assists: 'Assists',
      player_threes: '3-Pointers',
      player_points_rebounds_assists: 'Pts+Reb+Ast',
      player_points_rebounds: 'Pts+Reb',
      player_points_assists: 'Pts+Ast',
      player_steals: 'Steals',
      player_blocks: 'Blocks',
    },
  },
  hockey_nhl: {
    label: 'NHL',
    markets: {
      player_shots_on_goal: 'Shots on Goal',
      player_goals: 'Goals',
      player_points_1plus: 'Points (1+)',
      goalie_saves: 'Goalie Saves',
      player_blocked_shots: 'Blocked Shots',
    },
  },
  baseball_mlb: {
    label: 'MLB',
    markets: {
      pitcher_strikeouts: 'Strikeouts',
      pitcher_outs: 'Pitcher Outs',
      pitcher_hits_allowed: 'Hits Allowed',
      batter_hits: 'Hits',
      batter_total_bases: 'Total Bases',
      batter_home_runs: 'Home Runs',
      batter_rbis: 'RBIs',
      batter_runs: 'Runs',
    },
  },
  football_ncaaf: {
    label: 'College Football',
    markets: {
      player_pass_yds: 'Pass Yds',
      player_pass_tds: 'Pass TDs',
      player_rush_yds: 'Rush Yds',
      player_reception_yds: 'Rec Yds',
      player_receptions: 'Receptions',
      player_anytime_td: 'Anytime TD',
    },
  },
  basketball_ncaab: {
    label: 'College Basketball',
    markets: {
      player_points: 'Points',
      player_rebounds: 'Rebounds',
      player_assists: 'Assists',
      player_threes: '3-Pointers',
      player_points_rebounds_assists: 'Pts+Reb+Ast',
    },
  },
};

// DFS apps are what you bet on; sportsbooks are what we use to estimate the
// true probability. DFS prices are synthetic (+100/+100), so they never feed the fair line.
export const DFS = { prizepicks: 'PrizePicks', underdog: 'Underdog', pick6: 'Pick6' };
// Sharper books get more weight in the average.
const WEIGHT = { pinnacle: 2 };

export function americanToProb(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p === 0) return null;
  return p > 0 ? 100 / (p + 100) : -p / (-p + 100);
}

// Over/Under props use name Over/Under; yes/no props (anytime TD, 1+ points) use Yes/No.
function sideOf(name) {
  const n = String(name || '').toLowerCase();
  if (n === 'over' || n === 'yes') return 'over';
  if (n === 'under' || n === 'no') return 'under';
  return null;
}

const pointKey = p => (p == null ? 'yes' : String(Number(p)));

/**
 * @param {object} odds   PropLine event odds response ({bookmakers:[{key,markets:[{key,outcomes}]}]})
 * @param {object} labels market key -> display label (also the allow-list of markets)
 * @returns {Array} rows: {player, market, label, line, apps, over, under, books, bookLine}
 */
export function buildProps(odds, labels) {
  // groups[market|player] = { books: { point: [{over, under, w}] }, dfs: { point: Set(apps) } }
  const groups = new Map();
  const g = (market, player) => {
    const k = market + '|' + player;
    if (!groups.has(k)) groups.set(k, { market, player, books: new Map(), dfs: new Map() });
    return groups.get(k);
  };

  for (const bk of odds?.bookmakers || []) {
    const isDfs = bk.key in DFS;
    // Per book, pair Over and Under at the same player/market/point.
    const pairs = new Map();
    for (const m of bk.markets || []) {
      if (!(m.key in labels)) continue;
      if (m.period) continue; // full-game props only
      if (m.suspended_at) continue;
      for (const o of m.outcomes || []) {
        const side = sideOf(o.name);
        const player = (o.description || '').trim();
        if (!side || !player) continue;
        if (isDfs) {
          // Standard lines only: no goblins/demons, no boosted or discounted picks.
          if (o.dfs_odds_type && o.dfs_odds_type !== 'standard') continue;
          if (bk.key === 'underdog' && o.payout_multiplier != null && Number(o.payout_multiplier) !== 1) continue;
          // Remember which sides each app actually lists: apps often only
          // offer "More" on low or lopsided lines.
          const grp = g(m.key, player);
          const pk = pointKey(o.point);
          if (!grp.dfs.has(pk)) grp.dfs.set(pk, new Map());
          const app = DFS[bk.key];
          if (!grp.dfs.get(pk).has(app)) grp.dfs.get(pk).set(app, new Set());
          grp.dfs.get(pk).get(app).add(side);
          continue;
        }
        const pk = m.key + '|' + player + '|' + pointKey(o.point);
        if (!pairs.has(pk)) pairs.set(pk, { market: m.key, player, point: o.point });
        pairs.get(pk)[side] = americanToProb(o.price);
      }
    }
    for (const pr of pairs.values()) {
      if (pr.over == null || pr.under == null) continue;
      const sum = pr.over + pr.under;
      if (!(sum > 0.9 && sum < 1.4)) continue; // junk or one-sided quote
      const grp = g(pr.market, pr.player);
      const pk = pointKey(pr.point);
      if (!grp.books.has(pk)) grp.books.set(pk, []);
      grp.books.get(pk).push({ fair: pr.over / sum, w: WEIGHT[bk.key] || 1 });
    }
  }

  const rows = [];
  for (const grp of groups.values()) {
    const fairAt = new Map();
    for (const [pk, list] of grp.books) {
      const wsum = list.reduce((a, x) => a + x.w, 0);
      fairAt.set(pk, { p: list.reduce((a, x) => a + x.fair * x.w, 0) / wsum, n: list.length });
    }
    // Lines to show: every DFS line; if no DFS app has it, the most widely quoted book line.
    let lines = [...grp.dfs.keys()];
    if (!lines.length && fairAt.size) {
      lines = [[...fairAt.entries()].sort((a, b) => b[1].n - a[1].n)[0][0]];
    }
    for (const pk of lines) {
      let f = fairAt.get(pk), bookLine = null;
      if (!f && fairAt.size && pk !== 'yes') {
        // No book at this exact line: use the nearest book line and flag it.
        const near = [...fairAt.keys()].filter(k => k !== 'yes')
          .sort((a, b) => Math.abs(a - pk) - Math.abs(b - pk))[0];
        if (near != null) { f = fairAt.get(near); bookLine = Number(near); }
      }
      rows.push({
        player: grp.player,
        market: grp.market,
        label: labels[grp.market],
        line: pk === 'yes' ? null : Number(pk),
        apps: [...(grp.dfs.get(pk)?.keys() || [])].sort(),
        // which apps offer each side, e.g. { over: ['Pick6'], under: [] }
        offers: offersOf(grp.dfs.get(pk)),
        over: f ? round3(f.p) : null,
        under: f ? round3(1 - f.p) : null,
        books: f ? f.n : 0,
        bookLine,
      });
    }
  }
  rows.sort((a, b) => a.player.localeCompare(b.player) || a.label.localeCompare(b.label) || (a.line ?? 0) - (b.line ?? 0));
  return rows;
}

const round3 = x => Math.round(x * 1000) / 1000;

function offersOf(apps) {
  const o = { over: [], under: [] };
  for (const [app, sides] of apps || []) for (const sd of sides) o[sd].push(app);
  o.over.sort(); o.under.sort();
  return o;
}

// Yes/no scoring props: DFS apps only let you take "More" (it scores), and the
// "No" side is a heavy favorite that would flood the list without being a real edge.
const NO_BEST = new Set(['player_anytime_td', 'player_1st_td', 'player_2plus_td', 'player_points_1plus', 'player_goals']);

/**
 * From one game's rows, keep the DFS lines worth looking at: on a DFS app,
 * priced by at least `minBooks` sportsbooks at that exact line, with the
 * better side at or above `minProb`. Returns one entry per prop with its best side.
 */
export function pickBest(rows, game, { minProb = 0.54, maxProb = 0.75, minBooks = 2 } = {}) {
  const out = [];
  for (const r of rows) {
    if (!r.apps.length || r.over == null || r.bookLine != null || r.books < minBooks) continue;
    if (r.line == null || NO_BEST.has(r.market)) continue;
    // Only sides an app actually lets you pick.
    const sides = ['over', 'under'].filter(sd => (r.offers?.[sd] || []).length);
    if (!sides.length) continue;
    const side = sides.reduce((a, b) => (r[b] > r[a] ? b : a));
    const prob = r[side];
    // Very lopsided lines (75%+) are almost always restricted or paid down on
    // the apps, so they aren't a usable edge even when the feed lists them.
    if (prob < minProb || prob > maxProb) continue;
    out.push({ ...r, side, prob, apps: r.offers[side], game: game.label, start: game.start });
  }
  return out;
}

// Scan window per sport: NFL plays weekly, the rest play most nights.
export const SCAN = {
  football_nfl: { hours: 7 * 24, maxGames: 16, label: 'Next 7 days' },
  basketball_nba: { hours: 36, maxGames: 15, label: 'Next 36 hours' },
  hockey_nhl: { hours: 36, maxGames: 16, label: 'Next 36 hours' },
  football_ncaaf: { hours: 4 * 24, maxGames: 20, label: 'Next 4 days (up to 20 games)' },
  basketball_ncaab: { hours: 36, maxGames: 20, label: 'Next 36 hours (top 20 games)' },
  baseball_mlb: { hours: 36, maxGames: 15, label: 'Next 36 hours' },
};

// Per DFS app: how many prop outcomes the feed sent, and how many are standard
// lines we use (the rest are goblins/demons, boosts or alt rungs).
export function feedCounts(odds, labels, into = {}) {
  for (const bk of odds?.bookmakers || []) {
    if (!(bk.key in DFS)) continue;
    const c = (into[DFS[bk.key]] ||= { lines: 0, standard: 0 });
    for (const m of bk.markets || []) {
      if (!(m.key in labels)) continue;
      for (const o of m.outcomes || []) {
        c.lines++;
        const std = (!o.dfs_odds_type || o.dfs_odds_type === 'standard') &&
          !(bk.key === 'underdog' && o.payout_multiplier != null && Number(o.payout_multiplier) !== 1);
        if (std) c.standard++;
      }
    }
  }
  return into;
}

// ---------- Game lines (moneyline, spread, total) ----------

export const GAME_MARKETS = ['h2h', 'spreads', 'totals'];

export const decimalOf = price => { const p = Number(price); return p > 0 ? 1 + p / 100 : 1 + 100 / -p; };

/**
 * Main-line moneyline, spread and total for one game, two rows per market.
 * Each row: { kind, side, label, point, fair, books, prices:[{book,title,price}] }
 * fair = no-vig chance from every non-DFS book quoting both sides at that point
 * (Pinnacle counts double). prices lists every book's price for that side so the
 * page can pick the best one among the books the user can actually bet at.
 */
export function buildGameLines(odds) {
  const home = odds?.home_team, away = odds?.away_team;
  if (!home || !away) return [];
  // quotes[kind][pointKey] = [{ book, title, w, a: {side: price}, main }]
  const quotes = { ml: new Map(), spread: new Map(), total: new Map() };
  const add = (kind, pk, entry) => {
    if (!quotes[kind].has(pk)) quotes[kind].set(pk, []);
    quotes[kind].get(pk).push(entry);
  };
  for (const bk of odds.bookmakers || []) {
    if (bk.key in DFS) continue;
    const base = { book: bk.key, title: bk.title || bk.key, w: WEIGHT[bk.key] || 1 };
    for (const m of bk.markets || []) {
      if (m.period || m.suspended_at) continue;
      const main = m.line_type == null || m.line_type === 'main';
      if (m.key === 'h2h') {
        const a = {};
        for (const o of m.outcomes || []) if (o.name === home || o.name === away) a[o.name] = o.price;
        if (a[home] != null || a[away] != null) add('ml', 'ml', { ...base, a, main });
      } else if (m.key === 'spreads') {
        // group by the home team's spread; one book can list several alt points in one market
        const byPt = new Map();
        for (const o of m.outcomes || []) {
          if ((o.name !== home && o.name !== away) || o.point == null) continue;
          const hp = o.name === home ? Number(o.point) : -Number(o.point);
          if (!byPt.has(hp)) byPt.set(hp, {});
          byPt.get(hp)[o.name] = o.price;
        }
        for (const [hp, a] of byPt) add('spread', String(hp), { ...base, a, main: main && byPt.size === 1 });
      } else if (m.key === 'totals') {
        if (m.team) continue; // team totals ride the same key
        const byPt = new Map();
        for (const o of m.outcomes || []) {
          const sd = sideOf(o.name);
          if (!sd || o.point == null) continue;
          const pt = Number(o.point);
          if (!byPt.has(pt)) byPt.set(pt, {});
          byPt.get(pt)[sd === 'over' ? 'Over' : 'Under'] = o.price;
        }
        for (const [pt, a] of byPt) add('total', String(pt), { ...base, a, main: main && byPt.size === 1 });
      }
    }
  }

  // The main point: the one most books call main, else the most quoted.
  const mainPoint = map => {
    let best = null, score = -1;
    for (const [pk, list] of map) {
      const books = new Set(list.map(x => x.book)).size;
      const sc = list.filter(x => x.main).length * 1000 + books;
      if (sc > score) { score = sc; best = pk; }
    }
    return best;
  };

  const rows = [];
  const emit = (kind, pk, sides, labelOf, pointOf) => {
    const list = quotes[kind].get(pk) || [];
    let wsum = 0, acc = 0, n = 0;
    for (const q of list) {
      const pa = americanToProb(q.a[sides[0]]), pb = americanToProb(q.a[sides[1]]);
      if (pa == null || pb == null) continue;
      const sum = pa + pb;
      if (!(sum > 0.9 && sum < 1.3)) continue;
      acc += (pa / sum) * q.w; wsum += q.w; n++;
    }
    const f0 = wsum ? acc / wsum : null;
    sides.forEach((sd, i) => {
      const prices = [];
      const seen = new Set();
      for (const q of list) {
        if (q.a[sd] == null || seen.has(q.book)) continue;
        seen.add(q.book);
        prices.push({ book: q.book, title: q.title, price: Number(q.a[sd]) });
      }
      rows.push({
        kind, side: sd, label: labelOf(sd), point: pointOf(sd),
        fair: f0 == null ? null : round3(i === 0 ? f0 : 1 - f0), books: n, prices,
      });
    });
  };

  if (quotes.ml.size) emit('ml', 'ml', [away, home], t => t, () => null);
  const sp = mainPoint(quotes.spread);
  if (sp != null) {
    const hp = Number(sp);
    const ptOf = t => (t === home ? hp : -hp);
    emit('spread', sp, [away, home], t => `${t} ${ptOf(t) > 0 ? '+' : ''}${ptOf(t)}`, ptOf);
  }
  const tp = mainPoint(quotes.total);
  if (tp != null) emit('total', tp, ['Over', 'Under'], s => `${s} ${Number(tp)}`, () => Number(tp));
  return rows;
}

export function trimEvents(events, now = Date.now()) {
  const lo = now - 5 * 3600e3, hi = now + 4 * 86400e3; // include games in progress, next 4 days
  return (Array.isArray(events) ? events : [])
    .filter(e => { const t = Date.parse(e.commence_time); return t >= lo && t <= hi; })
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
    .map(e => ({ id: e.id, home: e.home_team, away: e.away_team, start: e.commence_time }));
}
