// GET /api/best?sport=football_nfl  ->  the strongest DFS lines across upcoming games
//
// One request per game, so results are cached on Vercel's CDN for an hour:
// a whole group checking all day costs ~24 scans per sport, not one per view.
import { SPORTS, SCAN, buildProps, pickBest, feedCounts, buildGameLines, GAME_MARKETS } from '../lib/odds.js';
import { propline, eventOdds, checkPasscode, send, fail, HttpError, quota } from '../lib/upstream.js';
import { parseCfb, apTop25, rankMap, cfbGame, cfbLabel } from '../lib/ncaaf.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    checkPasscode(req);
    const sport = String(req.query.sport || '');
    if (!SPORTS[sport]) throw new HttpError(400, 'Unknown sport.');
    const { hours, maxGames, label } = SCAN[sport];
    const labels = SPORTS[sport].markets;

    const now = Date.now();
    let events = (await propline(`/sports/${sport}/events`))
      .filter(e => { const t = Date.parse(e.commence_time); return t > now - 15 * 60e3 && t < now + hours * 3600e3; })
      .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));

    // College football: filter games BEFORE taking the top 20, so the scan
    // (and the daily request budget) goes to games you actually care about.
    let cfb = null;
    const labelOf = new Map();
    if (sport === 'football_ncaaf') {
      const filter = parseCfb(req.query);
      const ap = await apTop25();
      const ranks = rankMap(ap.teams);
      const all = events.length;
      events = events.filter(e => {
        const g = cfbGame(e, filter, ranks);
        if (g.ok) labelOf.set(e.id, `${cfbLabel(g.away)} @ ${cfbLabel(g.home)}`);
        return g.ok;
      });
      cfb = { ...filter, poll: ap.week, pollLive: ap.live, inWindow: all, matched: events.length };
    }
    events = events.slice(0, maxGames);

    const picks = [], feed = {}, matched = {}, gameLines = [];
    let scanned = 0, failed = 0;
    // A few at a time to stay under PropLine's per-minute burst limit.
    for (let i = 0; i < events.length; i += 3) {
      await Promise.all(events.slice(i, i + 3).map(async e => {
        try {
          const odds = await eventOdds(sport, e.id, [...Object.keys(labels), ...GAME_MARKETS].join(','));
          const game = { label: labelOf.get(e.id) || `${short(e.away_team)} @ ${short(e.home_team)}`, start: e.commence_time };
          const rows = buildProps(odds, labels);
          // How many of each app's lines line up with 2+ sportsbooks at the exact line
          for (const r of rows) if (r.line != null && r.bookLine == null && r.books >= 2)
            for (const a of r.apps) matched[a] = (matched[a] || 0) + 1;
          // Full team names ride along so the Best Lines search can find "Buffalo", not just "Bills".
          const teams = [e.away_team, e.home_team];
          picks.push(...pickBest(rows, game).map(p => ({ ...p, teams })));
          feedCounts(odds, labels, feed);
          for (const r of buildGameLines(odds)) if (r.fair != null && r.books >= 3) gameLines.push({ ...r, game: game.label, start: game.start, teams });
          scanned++;
        } catch (err) {
          if (err.status === 429) throw err; // out of daily requests: stop
          failed++;
        }
      }));
    }
    picks.sort((a, b) => b.prob - a.prob || b.books - a.books);

    send(res, 200, {
      sport, window: label, games: events.length, cfb, scanned, failed, feed, matched,
      picks: picks.slice(0, 150),
      gameLines,
      fetched: new Date().toISOString(),
      quota: { ...quota },
    }, 3600);
  } catch (err) {
    fail(res, err);
  }
}

const short = t => String(t || '').split(' ').slice(-1)[0];
