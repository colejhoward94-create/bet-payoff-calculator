import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamInfo, norm, parseCfb, rankMap, cfbGame, cfbLabel, AP_FALLBACK, apTop25 } from '../lib/ncaaf.js';

test('normalizes feed names', () => {
  assert.equal(norm('Texas A&M Aggies'), 'texas a and m aggies');
  assert.equal(norm('Iowa St. Cyclones'), 'iowa state cyclones');
  assert.equal(norm("Hawai'i Rainbow Warriors"), 'hawaii rainbow warriors');
  assert.equal(norm('San José State Spartans'), 'san jose state spartans');
  assert.equal(norm('The Citadel Bulldogs'), 'citadel bulldogs');
});

test('longest school name wins and never matches mid-name', () => {
  const t = n => { const i = teamInfo(n); return i && `${i.school}/${i.div}/${i.power}`; };
  assert.equal(t('Ohio State Buckeyes'), 'Ohio State/FBS/true');
  assert.equal(t('Ohio Bobcats'), 'Ohio/FBS/false');
  assert.equal(t('Central Michigan Chippewas'), 'Central Michigan/FBS/false');
  assert.equal(t('Michigan Wolverines'), 'Michigan/FBS/true');
  assert.equal(t('Miami Hurricanes'), 'Miami/FBS/true');
  assert.equal(t('Miami (OH) RedHawks'), 'Miami (OH)/FBS/false');
  assert.equal(t('North Carolina A&T Aggies'), 'North Carolina A&T/FCS/false');
  assert.equal(t('North Carolina Tar Heels'), 'North Carolina/FBS/true');
  assert.equal(t('NC State Wolfpack'), 'NC State/FBS/true');
  assert.equal(t('Penn State Nittany Lions'), 'Penn State/FBS/true');
  assert.equal(t('Pennsylvania Quakers'), 'Penn/FCS/false');
  assert.equal(t('Texas A&M Aggies'), 'Texas A&M/FBS/true');
  assert.equal(t('Texas A&M-Commerce Lions'), 'East Texas A&M/FCS/false');
  assert.equal(t('Delaware State Hornets'), 'Delaware State/FCS/false');
  assert.equal(t('Delaware Blue Hens'), 'Delaware/FBS/false');
  assert.equal(t('Southern Jaguars'), 'Southern/FCS/false');
  assert.equal(t('Southern Miss Golden Eagles'), 'Southern Miss/FBS/false');
  assert.equal(t('USC Trojans'), 'USC/FBS/true');
  assert.equal(t('Ole Miss Rebels'), 'Ole Miss/FBS/true');
  assert.equal(t('Mississippi Rebels'), 'Ole Miss/FBS/true');
  assert.equal(t('Mississippi Valley State Delta Devils'), 'Mississippi Valley State/FCS/false');
  assert.equal(t('Abilene Christian Wildcats'), 'Abilene Christian/FCS/false');
  assert.equal(t('Boise State Broncos'), 'Boise State/FBS/true');
  assert.equal(t('Notre Dame Fighting Irish'), 'Notre Dame/FBS/true');
  assert.equal(t('Sam Houston Bearkats'), 'Sam Houston/FBS/false');
  assert.equal(t('Houston Cougars'), 'Houston/FBS/true');
  assert.equal(t('Houston Christian Huskies'), 'Houston Christian/FCS/false');
  assert.equal(t('Ferris State Bulldogs'), null); // Division II
});

test('every fallback poll team resolves', () => {
  assert.equal(rankMap(AP_FALLBACK.teams).size, 25);
});

test('parses query filters with defaults', () => {
  assert.deepEqual(parseCfb({}), { focus: ['p5', 'top25'], div: ['fbs', 'fcs'] });
  assert.deepEqual(parseCfb({ focus: '', div: 'fcs' }), { focus: [], div: ['fcs'] });
  assert.deepEqual(parseCfb({ focus: 'top25,junk', div: '' }), { focus: ['top25'], div: ['fbs', 'fcs'] });
});

test('game filter logic', () => {
  const ranks = rankMap(['New Mexico', 'Georgia']);
  const g = (a, h, f) => cfbGame({ away_team: a, home_team: h }, parseCfb(f), ranks).ok;
  const all = { focus: 'p5,top25', div: 'fbs,fcs' };
  assert.equal(g('Georgia Bulldogs', 'Auburn Tigers', all), true);
  assert.equal(g('Toledo Rockets', 'Kent State Golden Flashes', all), false);    // MAC, unranked
  assert.equal(g('UNLV Rebels', 'New Mexico Lobos', all), true);                 // ranked G5 team
  assert.equal(g('UNLV Rebels', 'New Mexico Lobos', { focus: 'p5', div: 'fbs' }), false);
  assert.equal(g('Mercer Bears', 'Alabama Crimson Tide', all), true);            // P5 vs FCS with both divisions
  assert.equal(g('Mercer Bears', 'Alabama Crimson Tide', { ...all, div: 'fbs' }), false);
  assert.equal(g('Montana Grizzlies', 'Montana State Bobcats', { focus: '', div: 'fcs' }), true);
  assert.equal(g('Montana Grizzlies', 'Montana State Bobcats', all), false);
  assert.equal(g('Ferris State Bulldogs', 'Alabama Crimson Tide', all), false);  // non-D1 never passes
  assert.equal(g('Toledo Rockets', 'Kent State Golden Flashes', { focus: '', div: 'fbs' }), true);
});

test('labels use school names and ranks', () => {
  const r = cfbGame({ away_team: 'Georgia Bulldogs', home_team: 'Auburn Tigers' }, parseCfb({}), rankMap(['Georgia']));
  assert.equal(`${cfbLabel(r.away)} @ ${cfbLabel(r.home)}`, '#1 Georgia @ Auburn');
});

test('AP poll from ESPN, with fallback on failure', async () => {
  const ranks = AP_FALLBACK.teams.map((t, i) => ({ current: 25 - i, team: { location: t, name: 'X' } })).reverse();
  ranks[0].team = { location: 'Miami', name: 'Hurricanes' }; // rank 1
  const ok = await apTop25(async () => ({ ok: true, json: async () => ({ rankings: [{ name: 'AP Top 25', type: 'ap', headline: 'AP Top 25 Week 12', ranks }] }) }));
  assert.equal(ok.live, true);
  assert.equal(ok.teams[0], 'Miami');
  assert.equal(ok.teams.length, 25);
});
