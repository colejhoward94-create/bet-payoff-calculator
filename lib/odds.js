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
          const grp = g(m.key, player);
          const pk = pointKey(o.point);
          if (!grp.dfs.has(pk)) grp.dfs.set(pk, new Set());
          grp.dfs.get(pk).add(DFS[bk.key]);
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
        apps: [...(grp.dfs.get(pk) || [])].sort(),
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

/**
 * From one game's rows, keep the DFS lines worth looking at: on a DFS app,
 * priced by at least `minBooks` sportsbooks at that exact line, with the
 * better side at or above `minProb`. Returns one entry per prop with its best side.
 */
export function pickBest(rows, game, { minProb = 0.54, minBooks = 2 } = {}) {
  const out = [];
  for (const r of rows) {
    if (!r.apps.length || r.over == null || r.bookLine != null || r.books < minBooks) continue;
    const side = r.over >= r.under ? 'over' : 'under';
    const prob = r[side];
    if (prob < minProb) continue;
    out.push({ ...r, side, prob, game: game.label, start: game.start });
  }
  return out;
}

// Scan window per sport: NFL plays weekly, the rest play most nights.
export const SCAN = {
  football_nfl: { hours: 7 * 24, maxGames: 16, label: 'Next 7 days' },
  basketball_nba: { hours: 36, maxGames: 15, label: 'Next 36 hours' },
  hockey_nhl: { hours: 36, maxGames: 16, label: 'Next 36 hours' },
  football_ncaaf: { hours: 4 * 24, maxGames: 20, label: 'Next 4 days (top 20 games)' },
  basketball_ncaab: { hours: 36, maxGames: 20, label: 'Next 36 hours (top 20 games)' },
  baseball_mlb: { hours: 36, maxGames: 15, label: 'Next 36 hours' },
};

export function trimEvents(events, now = Date.now()) {
  const lo = now - 5 * 3600e3, hi = now + 4 * 86400e3; // include games in progress, next 4 days
  return (Array.isArray(events) ? events : [])
    .filter(e => { const t = Date.parse(e.commence_time); return t >= lo && t <= hi; })
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time))
    .map(e => ({ id: e.id, home: e.home_team, away: e.away_team, start: e.commence_time }));
}
