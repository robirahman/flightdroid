import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { limits } from '../src/gmail/api';
import { syncGmail, type SyncProgress } from '../src/gmail/sync';
import { clearAll, loadFlights, loadSyncState } from '../src/lib/store';

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// The error Gmail actually returned to a user when the per-minute quota ran out.
const QUOTA_ERROR = {
  error: {
    code: 403,
    message: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user' of service 'gmail.googleapis.com' for consumer 'project_number:1'.",
    status: 'PERMISSION_DENIED',
    errors: [{ reason: 'rateLimitExceeded', domain: 'usageLimits' }],
  },
};

function message(i: number) {
  const json = {
    '@type': 'FlightReservation',
    reservationFor: {
      '@type': 'Flight',
      flightNumber: `UA${100 + i}`,
      departureAirport: { iataCode: 'SFO' },
      arrivalAirport: { iataCode: 'JFK' },
      departureTime: `2026-03-${String(i + 1).padStart(2, '0')}T08:00:00-08:00`,
    },
  };
  return {
    id: `m${i}`,
    internalDate: String(Date.UTC(2026, 0, i + 1)),
    payload: {
      mimeType: 'text/html',
      headers: [{ name: 'Subject', value: `Trip ${i}` }],
      body: { data: b64url(`<script type="application/ld+json">${JSON.stringify(json)}</script>`) },
    },
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Fake Gmail with `count` messages that rejects `get` calls while `blocked()` says so. */
function fakeGmail(count: number, blocked: (getCall: number) => boolean) {
  let getCalls = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/messages?')) return json({ messages: Array.from({ length: count }, (_, i) => ({ id: `m${i}` })) });
    if (blocked(++getCalls)) return json(QUOTA_ERROR, 403);
    const id = Number(url.match(/messages\/m(\d+)/)![1]);
    return json(message(id));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const original = { ...limits };
beforeEach(async () => {
  Object.assign(limits, { minIntervalMs: 0, maxIntervalMs: 5, baseBackoffMs: 5, maxBackoffMs: 20, maxAttempts: 4 });
  await clearAll();
});
afterEach(() => {
  Object.assign(limits, original);
  vi.unstubAllGlobals();
});

describe('syncGmail rate limits', () => {
  it('waits out a temporary quota error and finishes the sync', async () => {
    // Calls 5-7 hit the quota, like a burst that exhausts the per-minute allowance.
    fakeGmail(12, (n) => n >= 5 && n <= 7);
    const phases: SyncProgress['phase'][] = [];
    const flights = await syncGmail({ token: 't', query: 'q', onProgress: (p) => phases.push(p.phase) });

    expect(flights).toHaveLength(12);
    expect(phases).toContain('waiting');
    expect(phases.at(-1)).toBe('done');
    const state = await loadSyncState();
    expect(state.lastAttempt).toMatchObject({ complete: true, read: 12, total: 12 });
    expect(state.lastSync).toBeDefined();
  });

  it('stops with a clear message when the quota stays exhausted, then resumes', async () => {
    fakeGmail(12, (n) => n > 4);
    await expect(syncGmail({ token: 't', query: 'q' })).rejects.toThrow(/progress is saved/i);

    const saved = await loadFlights();
    expect(saved.length).toBeGreaterThan(0);
    expect(saved.length).toBeLessThan(12);
    const stopped = await loadSyncState();
    expect(stopped.lastSync).toBeUndefined();
    expect(stopped.lastAttempt).toMatchObject({ complete: false, total: 12, read: saved.length });

    // Quota recovered: the next sync reads only the emails it hasn't seen yet.
    const fetchMock = fakeGmail(12, () => false);
    const flights = await syncGmail({ token: 't', query: 'q' });
    expect(flights).toHaveLength(12);
    const gets = fetchMock.mock.calls.filter(([url]) => !String(url).includes('/messages?'));
    expect(gets).toHaveLength(12 - saved.length);
    expect((await loadSyncState()).lastAttempt?.complete).toBe(true);
  });

  it('still treats a real permission error as fatal', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('/messages?') ? json({ messages: [{ id: 'm0' }] }) : json({ error: { code: 403, message: 'Insufficient Permission', errors: [{ reason: 'insufficientPermissions' }] } }, 403),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncGmail({ token: 't', query: 'q' })).rejects.toThrow('Insufficient Permission');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
