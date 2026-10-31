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

export async function propline(path, params = {}) {
  const key = process.env.PROPLINE_API_KEY;
  if (!key) throw new HttpError(500, 'PROPLINE_API_KEY is not set in Vercel.');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
  const resp = await fetch(url, { headers: { 'X-API-Key': key, Accept: 'application/json' } });
  if (resp.status === 401 || resp.status === 403) throw new HttpError(502, 'The PropLine key was rejected. Check PROPLINE_API_KEY in Vercel.');
  if (resp.status === 429) throw new HttpError(429, 'Daily odds limit reached. It resets tomorrow.');
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
