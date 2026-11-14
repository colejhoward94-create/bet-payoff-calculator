// College football team data for the Best Lines filters: which division each
// Division I school plays in, which are Power 5, and the AP Top 25.
// Pure lookups (no network) except apTop25(), which asks ESPN for the current poll.

// Power 5 = SEC, Big Ten, Big 12, ACC, Pac-12 (the rebuilt 2026 version), plus Notre Dame.
const POWER = {
  SEC: ['Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU', 'Mississippi State',
    'Missouri', 'Oklahoma', 'Ole Miss|Mississippi', 'South Carolina', 'Tennessee', 'Texas', 'Texas A&M', 'Vanderbilt'],
  'Big Ten': ['Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan', 'Michigan State', 'Minnesota', 'Nebraska',
    'Northwestern', 'Ohio State', 'Oregon', 'Penn State', 'Purdue', 'Rutgers', 'UCLA', 'USC|Southern California|Southern Cal',
    'Washington', 'Wisconsin'],
  'Big 12': ['Arizona', 'Arizona State', 'Baylor', 'BYU|Brigham Young', 'Cincinnati', 'Colorado', 'Houston',
    'Iowa State', 'Kansas', 'Kansas State', 'Oklahoma State', 'TCU', 'Texas Tech', 'UCF|Central Florida', 'Utah',
    'West Virginia'],
  ACC: ['Boston College', 'California|Cal', 'Clemson', 'Duke', 'Florida State', 'Georgia Tech', 'Louisville',
    'Miami|Miami FL|Miami (FL)', 'NC State|North Carolina State', 'North Carolina', 'Pittsburgh|Pitt', 'SMU',
    'Stanford', 'Syracuse', 'Virginia', 'Virginia Tech', 'Wake Forest'],
  'Pac-12': ['Boise State', 'Colorado State', 'Fresno State', 'Oregon State', 'San Diego State', 'Texas State',
    'Utah State', 'Washington State'],
  Independent: ['Notre Dame'],
};

// The rest of FBS (Group of 5 + UConn)
const FBS_OTHER = [
  // American
  'Army', 'Charlotte', 'East Carolina', 'FAU|Florida Atlantic', 'Memphis', 'Navy', 'North Texas', 'Rice',
  'South Florida|USF', 'Temple', 'Tulane', 'Tulsa', 'UAB', 'UTSA|Texas-San Antonio|UT San Antonio',
  // Mountain West
  'Air Force', 'Hawaii', 'Nevada', 'New Mexico', 'San Jose State', 'UNLV', 'Wyoming', 'Northern Illinois', 'UTEP',
  // Sun Belt
  'Appalachian State|App State', 'Arkansas State', 'Coastal Carolina', 'Georgia Southern', 'Georgia State',
  'James Madison|JMU', 'Louisiana|Louisiana-Lafayette|UL Lafayette', 'UL Monroe|Louisiana-Monroe|Louisiana Monroe|ULM',
  'Marshall', 'Old Dominion', 'South Alabama', 'Southern Miss|Southern Mississippi', 'Troy', 'Louisiana Tech',
  // Conference USA
  'Delaware', 'FIU|Florida International', 'Jacksonville State', 'Kennesaw State', 'Liberty',
  'Middle Tennessee|MTSU|Middle Tennessee State', 'Missouri State', 'New Mexico State', 'Sam Houston|Sam Houston State',
  'Western Kentucky|WKU',
  // MAC
  'Akron', 'Ball State', 'Bowling Green', 'Buffalo', 'Central Michigan', 'Eastern Michigan', 'Kent State',
  'Miami (OH)|Miami OH|Miami Ohio', 'Ohio', 'Toledo', 'Western Michigan', 'UMass|Massachusetts', 'Sacramento State',
  // Independent
  'UConn|Connecticut',
];

const FCS = [
  // Big Sky
  'Cal Poly', 'Eastern Washington', 'Idaho', 'Idaho State', 'Montana', 'Montana State', 'Northern Arizona',
  'Northern Colorado', 'Portland State', 'UC Davis', 'Weber State',
  // CAA
  'Albany|UAlbany', 'Bryant', 'Campbell', 'Elon', 'Hampton', 'Maine', 'Monmouth', 'New Hampshire',
  'North Carolina A&T|NC A&T', 'Rhode Island', 'Richmond', 'Stony Brook', 'Towson', 'Villanova', 'William & Mary',
  // Ivy
  'Brown', 'Columbia', 'Cornell', 'Dartmouth', 'Harvard', 'Penn|Pennsylvania', 'Princeton', 'Yale',
  // MEAC
  'Delaware State', 'Howard', 'Morgan State', 'Norfolk State', 'North Carolina Central|NC Central',
  'South Carolina State|SC State',
  // Missouri Valley
  'Illinois State', 'Indiana State', 'Murray State', 'North Dakota', 'North Dakota State', 'Northern Iowa',
  'South Dakota', 'South Dakota State', 'Southern Illinois', 'Youngstown State',
  // NEC
  'Central Connecticut|Central Connecticut State', 'Duquesne', 'LIU|Long Island|Long Island University', 'Mercyhurst',
  'Robert Morris', 'Saint Francis (PA)|Saint Francis|St. Francis (PA)|Saint Francis PA', 'Stonehill', 'Wagner',
  'New Haven',
  // OVC-Big South
  'Charleston Southern', 'Eastern Illinois', 'Gardner-Webb', 'Lindenwood',
  'Southeast Missouri State|SE Missouri State|Southeast Missouri', 'Tennessee State', 'Tennessee Tech',
  'UT Martin|Tennessee-Martin', 'Western Illinois',
  // Patriot
  'Bucknell', 'Colgate', 'Fordham', 'Georgetown', 'Holy Cross', 'Lafayette', 'Lehigh',
  // Pioneer
  'Butler', 'Davidson', 'Dayton', 'Drake', 'Marist', 'Morehead State', 'Presbyterian', 'San Diego',
  'St. Thomas|St. Thomas (MN)|St Thomas MN', 'Stetson', 'Valparaiso',
  // SoCon
  'Chattanooga|UT Chattanooga', 'East Tennessee State|ETSU', 'Furman', 'Mercer', 'Samford', 'The Citadel|Citadel',
  'VMI', 'Western Carolina', 'Wofford',
  // Southland
  'East Texas A&M|Texas A&M-Commerce', 'Houston Christian', 'Incarnate Word|UIW', 'Lamar',
  'McNeese|McNeese State', 'Nicholls|Nicholls State', 'Northwestern State', 'Southeastern Louisiana',
  'Stephen F. Austin|SFA', 'UTRGV|UT Rio Grande Valley',
  // SWAC
  'Alabama A&M', 'Alabama State', 'Alcorn State', 'Arkansas-Pine Bluff|UAPB', 'Bethune-Cookman', 'Florida A&M',
  'Grambling|Grambling State', 'Jackson State', 'Mississippi Valley State', 'Prairie View|Prairie View A&M',
  'Southern', 'Texas Southern',
  // UAC
  'Abilene Christian', 'Austin Peay', 'Central Arkansas', 'Eastern Kentucky', 'North Alabama', 'Southern Utah',
  'Tarleton|Tarleton State', 'Utah Tech', 'West Georgia',
  // Independents
  'Merrimack', 'Sacred Heart',
];

// "Texas A&M Aggies" -> "texas a and m aggies", "Iowa St. Cyclones" -> "iowa state cyclones",
// "St. Thomas" -> "saint thomas", "Hawai'i" -> "hawaii", "San José" -> "san jose"
export function norm(s) {
  const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  if (t[0] === 'the') t.shift();
  return t.map((w, i) => (w === 'st' ? (i === 0 ? 'saint' : 'state') : w)).join(' ');
}

// key (normalized school name) -> { school, div, conf }
const TEAMS = new Map();
const add = (entry, info) => {
  const [school, ...alts] = entry.split('|');
  for (const n of [school, ...alts]) TEAMS.set(norm(n), { school, ...info });
};
for (const [conf, list] of Object.entries(POWER)) for (const e of list) add(e, { div: 'FBS', conf, power: true });
for (const e of FBS_OTHER) add(e, { div: 'FBS', power: false });
for (const e of FCS) add(e, { div: 'FCS', power: false });
const KEYS = [...TEAMS.keys()].sort((a, b) => b.length - a.length); // longest first

/**
 * Odds feeds name teams "School Mascot" ("Ohio State Buckeyes"). Match the
 * longest known school name at the start, on a word boundary, so "Ohio State"
 * beats "Ohio" and "Central Michigan" never matches "Michigan".
 * Returns { school, div, conf, power } or null (not Division I, or unknown).
 */
export function teamInfo(name) {
  const n = norm(name);
  if (!n) return null;
  for (const k of KEYS) if (n === k || n.startsWith(k + ' ')) return TEAMS.get(k);
  return null;
}

// AP Top 25 from the Nov 8, 2026 poll. Used only if ESPN can't be reached.
export const AP_FALLBACK = {
  week: 'AP poll, Nov 8',
  teams: ['Georgia', 'Utah', 'Notre Dame', 'UCLA', 'Miami', 'Indiana', 'Alabama', 'Texas', 'Tennessee', 'Texas Tech',
    'Wake Forest', 'BYU', 'Kentucky', 'Houston', 'USC', 'Iowa', 'Boise State', 'Oregon', 'Ole Miss',
    'South Carolina', 'Ohio State', 'Arizona', 'New Mexico', 'LSU', 'SMU'],
};

// school -> rank, keyed by our canonical school name
export function rankMap(teams) {
  const m = new Map();
  teams.forEach((t, i) => { const info = teamInfo(t); if (info && !m.has(info.school)) m.set(info.school, i + 1); });
  return m;
}

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings';
let apCache = null; // { at, data } kept for 6 hours per warm function

/** Current AP Top 25 as { week, teams: [school names in rank order], live } */
export async function apTop25(fetchFn = fetch) {
  if (apCache && Date.now() - apCache.at < 6 * 3600e3) return apCache.data;
  let data = { ...AP_FALLBACK, live: false };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const resp = await fetchFn(ESPN, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (resp.ok) {
      const j = await resp.json();
      const ap = (j.rankings || []).find(r => /^ap/i.test(r.type || '') || /^ap/i.test(r.name || '') || /ap/i.test(r.shortName || ''));
      const ranks = (ap?.ranks || []).slice().sort((a, b) => a.current - b.current).slice(0, 25);
      const teams = ranks.map(r => {
        const t = r.team || {};
        // Try "Ohio State Buckeyes", then "Ohio State"
        const cands = [t.displayName, t.location && t.name ? `${t.location} ${t.name}` : null, t.location, t.nickname, t.shortDisplayName];
        for (const c of cands) { const info = c && teamInfo(c); if (info) return info.school; }
        return t.location || t.nickname || '';
      });
      if (teams.length >= 20) data = { week: ap.headline || ap.shortHeadline || ap.name || 'AP poll', teams, live: true };
    }
  } catch { /* use fallback */ }
  apCache = { at: Date.now(), data };
  return data;
}

// ---------- Filters ----------
// focus: which teams you care about ('p5', 'top25'); a game passes if either team qualifies. Empty = any game.
// div: 'fbs', 'fcs'; every team in the game must be in a picked division. Non-D1 teams never pass.
export const DEFAULT_CFB = { focus: ['p5', 'top25'], div: ['fbs', 'fcs'] };

export function parseCfb(q = {}) {
  const pick = (v, ok, dflt) => {
    if (v == null) return dflt;
    const a = String(v).toLowerCase().split(',').filter(x => ok.includes(x));
    return [...new Set(a)].sort();
  };
  const div = pick(q.div, ['fbs', 'fcs'], DEFAULT_CFB.div);
  return { focus: pick(q.focus, ['p5', 'top25'], DEFAULT_CFB.focus), div: div.length ? div : DEFAULT_CFB.div };
}

/** { ok, home, away } with team info and AP rank attached. */
export function cfbGame(event, filter, ranks) {
  const side = name => {
    const info = teamInfo(name);
    return { name, info, rank: info ? ranks.get(info.school) || null : null };
  };
  const home = side(event.home_team), away = side(event.away_team);
  const teams = [home, away];
  const divs = filter.div.map(d => d.toUpperCase());
  let ok = teams.every(t => t.info && divs.includes(t.info.div));
  if (ok && filter.focus.length) {
    ok = teams.some(t => (filter.focus.includes('p5') && t.info.power) || (filter.focus.includes('top25') && t.rank));
  }
  return { ok, home, away };
}

// "#5 Oregon" / "Abilene Christian" / falls back to the feed's own name
export const cfbLabel = t => `${t.rank ? '#' + t.rank + ' ' : ''}${t.info ? t.info.school : t.name}`;
