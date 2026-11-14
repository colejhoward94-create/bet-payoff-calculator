// GET /api/props?sport=football_nfl&event=123  ->  player props with fair probabilities
import { SPORTS, buildProps, buildGameLines, GAME_MARKETS } from '../lib/odds.js';
import { eventOdds, checkPasscode, send, fail, HttpError, quota } from '../lib/upstream.js';

export default async function handler(req, res) {
  try {
    checkPasscode(req);
    const sport = String(req.query.sport || '');
    const event = String(req.query.event || '');
    if (!SPORTS[sport]) throw new HttpError(400, 'Unknown sport.');
    if (!/^[\w-]+$/.test(event)) throw new HttpError(400, 'Missing game.');
    const labels = SPORTS[sport].markets;
    const odds = await eventOdds(sport, event, [...Object.keys(labels), ...GAME_MARKETS].join(','));
    send(res, 200, {
      game: `${odds.away_team} @ ${odds.home_team}`,
      start: odds.commence_time,
      props: buildProps(odds, labels),
      gameLines: buildGameLines(odds),
      fetched: new Date().toISOString(),
      quota: { ...quota },
    }, 180);
  } catch (err) {
    fail(res, err);
  }
}
