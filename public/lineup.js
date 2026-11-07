// Lineup builder: picks the highest-EV lineup from a pool of picks with fair
// hit chances, using each app's standard payout table. Pure functions, shared
// by the page (window.Lineup) and the tests (import).

// Standard payouts (total return per $1, stake included), keyed size -> {hits: multiple}.
// PrizePicks: prizepicks.com payout update of Sept 18, 2026.
// Underdog: help.underdogfantasy.com "Winnings and payouts".
// Apps change these and promos or states can differ, so the UI says to check the app.
export const PAYOUTS = {
  PrizePicks: {
    power: { 2: { 2: 3 }, 3: { 3: 6 }, 4: { 4: 10 }, 5: { 5: 20 }, 6: { 6: 37.5 } },
    flex: {
      2: { 2: 2, 1: 0.5 }, 3: { 3: 3, 2: 1 }, 4: { 4: 6, 3: 1.5 },
      5: { 5: 10, 4: 2, 3: 0.4 }, 6: { 6: 25, 5: 2, 4: 0.4 },
    },
  },
  Underdog: {
    power: { 2: { 2: 3.5 }, 3: { 3: 6.5 }, 4: { 4: 10 }, 5: { 5: 20 }, 6: { 6: 35 } },
    flex: {
      3: { 3: 3.25, 2: 1.09 }, 4: { 4: 6, 3: 1.5 },
      5: { 5: 10, 4: 2.5 }, 6: { 6: 25, 5: 2.6, 4: 0.25 },
    },
  },
};
export const ENTRY_NAME = {
  PrizePicks: { power: 'Power', flex: 'Flex' },
  Underdog: { power: 'Standard', flex: 'Flex' },
};

export const pickKey = p => p.market + '|' + p.player + '|' + (p.line ?? '');

// Probability of exactly k hits, legs treated as independent.
export function hitDist(ps) {
  let d = [1];
  for (const p of ps) {
    const n = new Array(d.length + 1).fill(0);
    d.forEach((v, k) => { n[k] += v * (1 - p); n[k + 1] += v * p; });
    d = n;
  }
  return d;
}

export function lineupStats(ps, table) {
  const d = hitDist(ps);
  let ret = 0, cash = 0, profit = 0;
  d.forEach((v, k) => {
    const m = table[k] || 0;
    ret += v * m;
    if (m > 0) cash += v;
    if (m > 1) profit += v;
  });
  return { ev: ret - 1, cash, profit, hitAll: d[ps.length] };
}

// Best k picks by hit chance: one pick per player, at most maxPerGame from one game.
// Every payout table pays more for more hits, so EV only rises with each leg's
// hit chance, and taking the strongest legs that fit the limits is the optimum.
export function bestLineup(pool, k, maxPerGame = 2) {
  const out = [], players = new Set(), perGame = {};
  for (const p of [...pool].sort((a, b) => b.prob - a.prob)) {
    if (players.has(p.player)) continue;
    if ((perGame[p.game] || 0) >= maxPerGame) continue;
    out.push(p); players.add(p.player); perGame[p.game] = (perGame[p.game] || 0) + 1;
    if (out.length === k) break;
  }
  return out.length === k ? out : null;
}

/**
 * Every lineup type and size the app offers, best lineup for each, sorted by EV.
 * @param picks  Best Lines picks ({player, market, line, label, side, prob, apps, game, ...})
 * @param app    'PrizePicks' | 'Underdog'
 */
// haircut: the calculator's "estimate haircut" (relative %), applied to every leg's
// hit chance so the builder and the calculator verdict always agree.
export function buildOptions(picks, app, { maxPerGame = 2, exclude = new Set(), haircut = 0 } = {}) {
  const cut = 1 - (Number(haircut) || 0) / 100;
  const pool = picks.filter(p => p.apps.includes(app) && !exclude.has(pickKey(p)));
  const opts = [];
  for (const type of ['power', 'flex']) {
    for (const [size, table] of Object.entries(PAYOUTS[app][type])) {
      const legs = bestLineup(pool, +size, maxPerGame);
      if (!legs) continue;
      opts.push({ app, type, size: +size, name: `${size}-pick ${ENTRY_NAME[app][type]}`, table, legs, ...lineupStats(legs.map(l => l.prob * cut), table) });
    }
  }
  opts.sort((a, b) => b.ev - a.ev);
  return { pool: pool.length, options: opts };
}

if (typeof window !== 'undefined') window.Lineup = { PAYOUTS, ENTRY_NAME, pickKey, hitDist, lineupStats, bestLineup, buildOptions };
