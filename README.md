# Bet Payoff Calculator

Pick a game, tap a player prop, and the app fills in the **fair hit chance** from sportsbook odds (with the books' margin removed). Then the calculator runs the EV, break-even, and stake-size math on your slip.

- Lines come from the [PropLine](https://prop-line.com) API (free tier: 1,000 requests/day).
- Fair odds average every sportsbook quoting the exact line and count Pinnacle double. PrizePicks, Underdog and Pick6 lines are matched to those books, using standard lines only (no goblins, demons or boosted picks).
- Responses are cached for a few minutes on Vercel's CDN, so a group shares one request per game instead of one per person.
- **Best Lines tab:** scans upcoming games (NFL: next 7 days, most others: next 36 hours) and ranks PrizePicks/Underdog lines where 2+ books price the exact line and one side is 54%+. Cached for an hour, so a full scan costs ~15–20 requests per sport per hour at most.
- Settings, presets and colors save on each phone.

## Deploy (one time)

1. **Import the repo in Vercel:** go to vercel.com → Add New → Project, then pick this repo. Leave the framework as "Other" and keep the defaults.
2. **Add environment variables** (Project → Settings → Environment Variables):
   - `PROPLINE_API_KEY`: your free key from prop-line.com (**required**)
   - `APP_PASSCODE`: any word you choose (**optional**). If set, the app asks for it once per phone, so only your group can pull lines on your quota.
3. **Redeploy** (Deployments → ⋯ → Redeploy) so the variables take effect.

After that, every push to `main` deploys automatically.

## Install on a phone

Open the link in Safari, tap Share, then **Add to Home Screen**. On Android/Chrome, use the menu, then **Install app**.

## Project layout

```
public/index.html          the app (calculator + prop finder)
public/sw.js               offline shell for the installed app
public/manifest.webmanifest, icons/
api/events.js              GET /api/events?sport=football_nfl
api/props.js               GET /api/props?sport=football_nfl&event=<id>
api/best.js                GET /api/best?sport=football_nfl (Best Lines scan)
api/ping.js                passcode / setup check
lib/odds.js                de-vig + line matching (pure, tested)
lib/upstream.js            PropLine requests, caching, errors
test/                      npm test
```

Sports: NFL, NBA, NHL, college football, college basketball, MLB. Add markets in `lib/odds.js` under `SPORTS`.

## Caveats

- The fair odds show the market's view. Beating them takes real information, and correlated legs (same game) make the displayed odds less reliable.
- If no book quotes the exact DFS line, the app uses the nearest book line and labels it.
- Gut-check math only. Not betting advice.
