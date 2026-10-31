// GET /api/events?sport=football_nfl  ->  upcoming games for a sport
import { SPORTS, trimEvents } from '../lib/odds.js';
import { propline, checkPasscode, send, fail, HttpError } from '../lib/upstream.js';

export default async function handler(req, res) {
  try {
    checkPasscode(req);
    const sport = String(req.query.sport || '');
    if (!SPORTS[sport]) throw new HttpError(400, 'Unknown sport.');
    const events = await propline(`/sports/${sport}/events`);
    send(res, 200, { sport, events: trimEvents(events) }, 600);
  } catch (err) {
    fail(res, err);
  }
}
