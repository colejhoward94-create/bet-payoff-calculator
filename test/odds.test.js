import { test } from 'node:test';
import assert from 'node:assert/strict';
import { americanToProb, buildProps, trimEvents, pickBest, SPORTS } from '../lib/odds.js';
import { SAMPLE_ODDS } from './sample.js';

const L = SPORTS.football_nfl.markets;

test('american odds to implied probability', () => {
  assert.equal(americanToProb(100), 0.5);
  assert.ok(Math.abs(americanToProb(-110) - 0.5238) < 1e-4);
  assert.ok(Math.abs(americanToProb(150) - 0.4) < 1e-9);
  assert.equal(americanToProb('x'), null);
});

test('de-vigs and averages books at the DFS line, Pinnacle weighted 2x', () => {
  const rows = buildProps(SAMPLE_ODDS, L);
  const r = rows.find(x => x.player === 'Jalen Hurts' && x.market === 'player_pass_yds');
  // DK -115/-105 -> fair .5349 ; FD -120/+100 -> .5455 ; Pinnacle -110/-110 -> .5 (x2)
  const dk = americanToProb(-115) / (americanToProb(-115) + americanToProb(-105));
  const fd = americanToProb(-120) / (americanToProb(-120) + americanToProb(100));
  const want = (dk + fd + 0.5 * 2) / 4;
  assert.equal(r.line, 224.5);
  assert.equal(r.over, Math.round(want * 1000) / 1000);
  assert.equal(r.books, 3);
  assert.deepEqual(r.apps, ['PrizePicks', 'Underdog']);
  assert.equal(r.bookLine, null);
  assert.ok(Math.abs(r.over + r.under - 1) < 0.002);
});

test('ignores goblin/demon and boosted Underdog lines', () => {
  const rows = buildProps(SAMPLE_ODDS, L).filter(x => x.player === 'Jalen Hurts' && x.market === 'player_pass_yds');
  assert.deepEqual(rows.map(r => r.line), [224.5]);
});

test('DFS line with no exact book line uses nearest and flags it', () => {
  const r = buildProps(SAMPLE_ODDS, L).find(x => x.player === 'A.J. Brown');
  assert.equal(r.line, 70.5);
  assert.equal(r.bookLine, 68.5);
  assert.ok(r.over > 0 && r.over < 1);
});

test('yes/no props (anytime TD) work with no line', () => {
  const r = buildProps(SAMPLE_ODDS, L).find(x => x.market === 'player_anytime_td');
  assert.equal(r.line, null);
  // +150/-180 -> .4 / .6429
  const want = 0.4 / (0.4 + americanToProb(-180));
  assert.equal(r.over, Math.round(want * 1000) / 1000);
});

test('book-only prop (no DFS) shows its most-quoted line with no apps', () => {
  const r = buildProps(SAMPLE_ODDS, L).find(x => x.player === 'Saquon Barkley' && x.market === 'player_rush_yds');
  assert.equal(r.line, 89.5);
  assert.deepEqual(r.apps, []);
});

test('skips period markets, unknown markets, suspended markets', () => {
  const rows = buildProps(SAMPLE_ODDS, L);
  assert.ok(!rows.some(r => r.market === 'player_kicking_points'));
  assert.ok(!rows.some(r => r.player === 'Q1 Guy'));
  assert.ok(!rows.some(r => r.player === 'Pulled Guy'));
});

test('handles empty or malformed input', () => {
  assert.deepEqual(buildProps(null, L), []);
  assert.deepEqual(buildProps({ bookmakers: [{ key: 'x' }] }, L), []);
});

test('pickBest keeps DFS lines with exact multi-book odds above the threshold', () => {
  const rows = buildProps(SAMPLE_ODDS, L);
  const game = { label: 'DAL @ PHI', start: '2026-11-01T21:25:00Z' };
  // Hurts: 3 books at the exact PrizePicks line, fair over ~.508 -> passes at 0.5
  const picks = pickBest(rows, game, { minProb: 0.5 });
  assert.deepEqual(picks.map(p => p.player), ['Jalen Hurts']);
  assert.equal(picks[0].side, 'over');
  assert.equal(picks[0].game, 'DAL @ PHI');
  // A.J. Brown excluded (books at a different line), book-only props excluded (no DFS app)
  assert.equal(pickBest(rows, game, { minProb: 0.6 }).length, 0);
  // minBooks filter
  assert.equal(pickBest(rows, game, { minProb: 0.5, minBooks: 4 }).length, 0);
});

const row = (o = {}) => ({ player: 'X', market: 'player_points', label: 'Pts', line: 10.5, apps: ['Underdog'],
  offers: { over: ['Underdog'], under: ['Underdog'] }, over: 0.41, under: 0.59, books: 3, bookLine: null, ...o });
const G = { label: 'g', start: 's' };

test('pickBest chooses the under when it is the stronger side', () => {
  const [p] = pickBest([row()], G);
  assert.equal(p.side, 'under');
  assert.equal(p.prob, 0.59);
});

test('pickBest never suggests a side the app does not offer', () => {
  // App only offers More: the strong under is unusable, the weak over is below threshold
  assert.equal(pickBest([row({ offers: { over: ['PrizePicks'], under: [] } })], G).length, 0);
  // Offered side strong enough: kept, and apps lists only who offers that side
  const [p] = pickBest([row({ over: 0.6, under: 0.4, apps: ['Pick6', 'Underdog'], offers: { over: ['Pick6'], under: ['Underdog'] } })], G);
  assert.equal(p.side, 'over');
  assert.deepEqual(p.apps, ['Pick6']);
});

test('pickBest drops TD-type props and lopsided 75%+ lines', () => {
  assert.equal(pickBest([row({ market: 'player_anytime_td', line: 0.5, over: 0.05, under: 0.95 })], G).length, 0);
  assert.equal(pickBest([row({ over: 0.2, under: 0.8 })], G).length, 0);
});

test('buildProps records which sides each DFS app lists', () => {
  const r = buildProps(SAMPLE_ODDS, L).find(x => x.player === 'Jalen Hurts' && x.market === 'player_pass_yds');
  assert.deepEqual(r.offers, { over: ['PrizePicks', 'Underdog'], under: ['PrizePicks', 'Underdog'] });
});

test('trimEvents keeps live and next-4-day games, sorted', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const ev = [
    { id: 3, home_team: 'C', away_team: 'D', commence_time: '2026-11-03T00:00:00Z' },
    { id: 1, home_team: 'A', away_team: 'B', commence_time: '2026-11-01T10:00:00Z' },
    { id: 9, home_team: 'Old', away_team: 'X', commence_time: '2026-10-30T00:00:00Z' },
    { id: 8, home_team: 'Far', away_team: 'X', commence_time: '2026-11-20T00:00:00Z' },
  ];
  assert.deepEqual(trimEvents(ev, now).map(e => e.id), [1, 3]);
});

import { buildGameLines, decimalOf } from '../lib/odds.js';

test('decimal odds', () => {
  assert.equal(decimalOf(150), 2.5);
  assert.ok(Math.abs(decimalOf(-110) - 1.9091) < 1e-4);
});

test('game lines: moneyline fair is de-vigged, Pinnacle double, all book prices listed', () => {
  const rows = buildGameLines(SAMPLE_ODDS);
  const dal = rows.find(r => r.kind === 'ml' && r.side === 'Dallas Cowboys');
  const phi = rows.find(r => r.kind === 'ml' && r.side === 'Philadelphia Eagles');
  const f = (a, b) => americanToProb(a) / (americanToProb(a) + americanToProb(b));
  const want = (f(150, -175) + f(165, -190) + 2 * f(155, -170)) / 4;
  assert.equal(dal.fair, Math.round(want * 1000) / 1000);
  assert.ok(Math.abs(dal.fair + phi.fair - 1) < 0.002);
  assert.equal(dal.books, 3);
  assert.deepEqual(dal.prices.map(p => p.price).sort((a, b) => a - b), [150, 155, 165]);
  assert.ok(!dal.prices.some(p => ['prizepicks', 'underdog'].includes(p.book)));
});

test('game lines: spread uses the main point, ignores alternates; total ignores team totals', () => {
  const rows = buildGameLines(SAMPLE_ODDS);
  const sp = rows.filter(r => r.kind === 'spread');
  assert.deepEqual(sp.map(r => r.label), ['Dallas Cowboys +3.5', 'Philadelphia Eagles -3.5']);
  assert.equal(sp[0].books, 2);
  const tot = rows.filter(r => r.kind === 'total');
  assert.deepEqual(tot.map(r => r.label), ['Over 47.5', 'Under 47.5']);
  assert.equal(tot[0].books, 2);
});

test('game lines: empty input', () => {
  assert.deepEqual(buildGameLines(null), []);
  assert.deepEqual(buildGameLines({ home_team: 'A', away_team: 'B', bookmakers: [] }), []);
});
