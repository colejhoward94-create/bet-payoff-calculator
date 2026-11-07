// Shared helpers for the API routes: PropLine requests, passcode check, errors.

const BASE = 'https://api.prop-line.com/v1';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Optional: set APP_PASSCODE in Vercel to keep the app to your group.
export function checkPasscode(req) {
  const want = process.env.APP_PASSCODE;
  if (!want) return;
  const got = String(req.query?.code || '');
  if (got !== want) throw new HttpError(401, 'passcode');
}

// Last daily-quota numbers PropLine reported (X-Daily-* headers), shown in the app.
export const quota = { remaining: null, limit: null, reset: null };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function propline(path, params = {}) {
  const key = process.env.PROPLINE_API_KEY;
  if (!key) throw new HttpError(500, 'PROPLINE_API_KEY is not set in Vercel.');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
  let resp;
  // PropLine has two limits: a daily cap and a short burst (per-minute) limit.
  // Burst 429s say how long to wait, so wait and retry a couple of times.
  for (let attempt = 0; ; attempt++) {
    resp = await fetch(url, { headers: { 'X-API-Key': key, Accept: 'application/json' } });
    if (resp.headers.has('X-Daily-Remaining')) {
      quota.remaining = Number(resp.headers.get('X-Daily-Remaining'));
      quota.limit = Number(resp.headers.get('X-Daily-Limit')) || null;
      quota.reset = Number(resp.headers.get('X-Daily-Reset')) || null;
    }
    if (resp.status !== 429) break;
    let text = '', info = {};
    try { text = await resp.text(); const j = JSON.parse(text); info = (j && typeof j.detail === 'object' && j.detail) || j || {}; } catch {}
    const daily = /daily/i.test(text) || quota.remaining === 0;
    if (daily) {
      const hrs = quota.reset ? Math.max(1, Math.round((quota.reset * 1000 - Date.now()) / 3600e3)) : null;
      throw new HttpError(429, `Daily odds limit reached (${quota.limit || 1000} requests on the free plan).${hrs ? ` It resets in about ${hrs} hour${hrs === 1 ? '' : 's'}.` : ' It resets tomorrow.'}`);
    }
    if (attempt >= 2) throw new HttpError(429, 'The odds provider is busy (too many requests at once). Try again in a minute.');
    await sleep(Math.min(Number(info.retry_after_seconds) || 2, 8) * 1000);
  }
  if (resp.status === 404) throw new HttpError(404, 'Not found at PropLine.');
  if (!resp.ok) throw new HttpError(502, `PropLine error ${resp.status}.`);
  return resp.json();
}

export function send(res, status, body, cacheSeconds = 0) {
  // Vercel's CDN caches successful responses, so a group sharing the app
  // uses one PropLine request per game every few minutes, not one per person.
  if (status === 200 && cacheSeconds) {
    res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 3}`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.status(status).json(body);
}

export function fail(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  send(res, status, { error: err instanceof HttpError ? err.message : 'Something went wrong.' });
  if (!(err instanceof HttpError)) console.error(err);
}
