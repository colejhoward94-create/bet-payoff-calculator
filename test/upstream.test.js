import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propline, quota } from '../lib/upstream.js';

process.env.PROPLINE_API_KEY = 'k';
const mk = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

test('burst 429 waits and retries, then succeeds', async () => {
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? mk(429, { detail: { code: 'burst_limit_exceeded', retry_after_seconds: 0.01 } }) : mk(200, { ok: 1 }, { 'X-Daily-Remaining': '412', 'X-Daily-Limit': '1000' }));
  assert.deepEqual(await propline('/x'), { ok: 1 });
  assert.equal(n, 2);
  assert.equal(quota.remaining, 412);
});

test('daily 429 fails right away with a clear message', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return mk(429, { detail: { code: 'daily_limit_exceeded', message: 'Daily limit exceeded' } }, { 'X-Daily-Remaining': '0', 'X-Daily-Limit': '1000', 'X-Daily-Reset': String(Math.floor(Date.now() / 1000) + 5 * 3600) }); };
  await assert.rejects(propline('/x'), e => e.status === 429 && /Daily odds limit reached \(1000/.test(e.message) && /about 5 hours/.test(e.message));
  assert.equal(n, 1);
});

test('repeated burst 429s give up with a try-again message', async () => {
  globalThis.fetch = async () => mk(429, { detail: { code: 'burst_limit_exceeded', retry_after_seconds: 0.01 } }, { 'X-Daily-Remaining': '300' });
  await assert.rejects(propline('/x'), e => /busy/.test(e.message));
});
