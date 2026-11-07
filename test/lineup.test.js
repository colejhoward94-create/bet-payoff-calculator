import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAYOUTS, hitDist, lineupStats, bestLineup, buildOptions, pickKey } from '../public/lineup.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const pick = (player, prob, game = 'G1', apps = ['PrizePicks', 'Underdog']) =>
  ({ player, market: 'player_points', label: 'Points', line: 20.5, side: 'over', prob, apps, game });

test('hit distribution sums to 1 and matches a hand calc', () => {
  const d = hitDist([0.6, 0.5]);
  near(d[0], 0.2); near(d[1], 0.5); near(d[2], 0.3);
  near(hitDist([0.55, 0.6, 0.7, 0.52]).reduce((a, b) => a + b, 0), 1);
});

test('power EV: three 60% legs at 6x', () => {
  const s = lineupStats([0.6, 0.6, 0.6], PAYOUTS.PrizePicks.power[3]);
  near(s.ev, 0.216 * 6 - 1);
  near(s.cash, 0.216);
});

test('flex EV counts partial payouts; sub-1x tier is cash but not profit', () => {
  const t = PAYOUTS.PrizePicks.flex[5]; // 10x / 2x / 0.4x
  const ps = [0.6, 0.6, 0.6, 0.6, 0.6];
  const d = hitDist(ps);
  const s = lineupStats(ps, t);
  near(s.ev, d[5] * 10 + d[4] * 2 + d[3] * 0.4 - 1);
  near(s.cash, d[5] + d[4] + d[3]);
  near(s.profit, d[5] + d[4]);
});

test('break-even sanity: 5-pick Power at ~54.9% per leg is about 0 EV', () => {
  const p = Math.pow(1 / 20, 1 / 5);
  near(lineupStats(Array(5).fill(p), PAYOUTS.PrizePicks.power[5]).ev, 0, 1e-9);
});

test('bestLineup takes the strongest legs within the limits', () => {
  const pool = [pick('A', 0.7, 'G1'), pick('B', 0.68, 'G1'), pick('C', 0.66, 'G1'), pick('D', 0.6, 'G2'), pick('E', 0.58, 'G3')];
  // max 2 per game: skips C
  assert.deepEqual(bestLineup(pool, 3, 2).map(p => p.player), ['A', 'B', 'D']);
  assert.deepEqual(bestLineup(pool, 3, 1).map(p => p.player), ['A', 'D', 'E']);
  // one pick per player
  const dup = [pick('A', 0.7, 'G1'), { ...pick('A', 0.69, 'G1'), market: 'player_rebounds' }, pick('B', 0.6, 'G2')];
  assert.deepEqual(bestLineup(dup, 2, 3).map(p => p.player), ['A', 'B']);
  // not enough picks
  assert.equal(bestLineup(pool, 5, 1), null);
});

test('buildOptions filters by app, honors excludes, sorts by EV', () => {
  const picks = [
    pick('A', 0.66, 'G1'), pick('B', 0.64, 'G2'), pick('C', 0.62, 'G3'),
    pick('D', 0.6, 'G4'), pick('E', 0.58, 'G5'), pick('F', 0.57, 'G6'),
    pick('Z', 0.74, 'G7', ['Pick6']),
  ];
  const { pool, options } = buildOptions(picks, 'PrizePicks');
  assert.equal(pool, 6);
  assert.ok(options.every(o => !o.legs.some(l => l.player === 'Z')));
  for (let i = 1; i < options.length; i++) assert.ok(options[i - 1].ev >= options[i].ev);
  assert.equal(options.length, 10); // 5 power + 5 flex sizes
  const ex = buildOptions(picks, 'PrizePicks', { exclude: new Set([pickKey(picks[0])]) });
  assert.ok(ex.options.every(o => !o.legs.some(l => l.player === 'A')));
  // Underdog has no 2-pick flex
  assert.ok(!buildOptions(picks, 'Underdog').options.some(o => o.type === 'flex' && o.size === 2));
});

test('haircut lowers EV the same way the calculator does', () => {
  const picks = ['A', 'B', 'C', 'D', 'E'].map((n, i) => pick(n, 0.57, 'G' + i));
  const raw = buildOptions(picks, 'PrizePicks').options.find(o => o.name === '5-pick Power');
  const cut = buildOptions(picks, 'PrizePicks', { haircut: 5 }).options.find(o => o.name === '5-pick Power');
  near(raw.ev, Math.pow(0.57, 5) * 20 - 1);
  near(cut.ev, Math.pow(0.57 * 0.95, 5) * 20 - 1);
  assert.ok(raw.ev > 0 && cut.ev < 0);
});

import { buildParlays } from '../public/lineup.js';

test('parlays: +EV legs only, one per game, EV multiplies, size order', () => {
  const c = (key, game, prob, dec) => ({ key, game, prob, dec });
  const cands = [
    c('a', 'G1', 0.55, 2.0),   // EV +10%
    c('b', 'G1', 0.53, 2.0),   // +6%, same game as a -> skipped
    c('d', 'G2', 0.52, 2.0),   // +4%
    c('e', 'G3', 0.40, 2.6),   // +4%
    c('f', 'G4', 0.45, 2.0),   // -10% -> out
  ];
  const { pool, options } = buildParlays(cands);
  assert.equal(pool, 4);
  assert.deepEqual(options.map(o => o.name), ['Single', '2-leg parlay', '3-leg parlay']);
  assert.deepEqual(options[2].legs.map(l => l.key), ['a', 'd', 'e']);
  near(options[0].ev, 0.1);
  near(options[1].ev, 1.1 * 1.04 - 1);
  near(options[1].table[2], 4);
  near(options[1].hitAll, 0.55 * 0.52);
});

test('parlays: haircut and exclude', () => {
  const cands = [{ key: 'a', game: 'G1', prob: 0.52, dec: 2.0 }, { key: 'b', game: 'G2', prob: 0.56, dec: 2.0 }];
  assert.equal(buildParlays(cands, { haircut: 5 }).pool, 1);           // .52*.95*2 < 1
  assert.equal(buildParlays(cands, { exclude: new Set(['b']) }).options.length, 1);
});
