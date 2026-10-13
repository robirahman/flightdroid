import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { limits } from '../src/gmail/api';
import { diagnoseSearch } from '../src/gmail/diagnose';
import { builtinQueries } from '../src/gmail/query';
import { scanKeyFor, syncGmail, type SyncProgress } from '../src/gmail/sync';
import { clearAll, loadFlights, loadSettings, loadSyncState, saveSettings, saveSyncState } from '../src/lib/store';

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

describe('re-reading after improvements', () => {
  it('re-reads already processed emails when the parser or search changed', async () => {
    fakeGmail(3, () => false);
    await syncGmail({ token: 't', query: 'q' });
    // Simulate a sync made by an older version of the app.
    await saveSyncState({ ...(await loadSyncState()), scanKey: '1|q' });

    const fetchMock = fakeGmail(3, () => false);
    await syncGmail({ token: 't', query: 'q' });
    const gets = fetchMock.mock.calls.filter(([url]) => !String(url).includes('/messages?'));
    const lists = fetchMock.mock.calls.filter(([url]) => String(url).includes('/messages?'));
    expect(gets).toHaveLength(3);
    // A full re-read searches all mail, not just mail since the last sync.
    expect(decodeURIComponent(String(lists[0][0]))).not.toContain('after:');
    expect((await loadSyncState()).scanKey).toBe(scanKeyFor('q'));

    // With nothing changed, the next sync only looks at new mail.
    const again = fakeGmail(3, () => false);
    await syncGmail({ token: 't', query: 'q' });
    expect(again.mock.calls.filter(([url]) => !String(url).includes('/messages?'))).toHaveLength(0);
  });

  it('runs every built-in search and reads each email once', async () => {
    const fetchMock = fakeGmail(4, () => false);
    const flights = await syncGmail({ token: 't', query: '' });
    expect(flights).toHaveLength(4);
    const lists = fetchMock.mock.calls.filter(([url]) => String(url).includes('/messages?'));
    expect(lists.length).toBe(builtinQueries().length);
    expect(fetchMock.mock.calls.length - lists.length).toBe(4);
  });
});

describe('settings', () => {
  it('replaces the old default search with the built-in one but keeps custom searches', async () => {
    const legacy =
      '{subject:flight subject:itinerary subject:"boarding pass" subject:"e-ticket" subject:eticket subject:"trip confirmation" subject:"booking confirmation" subject:"reservation" subject:"your trip" subject:"check in" subject:"check-in"} -category:promotions -category:social';
    await saveSettings({ clientId: 'id', query: legacy, units: 'mi' });
    expect(await loadSettings()).toMatchObject({ clientId: 'id', query: '', units: 'mi' });
    await saveSettings({ clientId: 'id', query: 'from:airline.example', units: 'km' });
    expect((await loadSettings()).query).toBe('from:airline.example');
  });
});

describe('diagnoseSearch', () => {
  it('reports whether the sync searches include an email and why it produced no flight', async () => {
    const html = (i: number) => (i === 0 ? message(0) : { ...message(1), payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'Your receipt' }], body: { data: b64url('Thanks for your purchase') } } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const q = new URL(url).searchParams.get('q') ?? '';
        if (url.includes('/messages?')) return json({ messages: q.startsWith('(') ? [{ id: 'm0' }] : [{ id: 'm0' }, { id: 'm1' }] });
        return json(html(Number(url.match(/messages\/m(\d+)/)![1])));
      }),
    );
    const [first, second] = await diagnoseSearch('t', 'from:custom', 'trip');
    expect(first).toMatchObject({ id: 'm0', searchedBySync: true });
    expect(first.explanation.flights).toHaveLength(1);
    expect(second).toMatchObject({ id: 'm1', subject: 'Your receipt', searchedBySync: false });
    expect(second.explanation.reason).toMatch(/No flight numbers or dates or airport codes/);
  });
});

describe('PDF attachments', () => {
  it('reads flights from an attached e-ticket when the email body has none', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { usePdfJs } = await import('../src/parse/pdf');
    usePdfJs(pdfjs as never);
    const pdf = readFileSync(join(__dirname, 'fixtures', 'eticket.pdf'));
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/messages?')) return json({ messages: [{ id: 'g1' }] });
      if (url.includes('/attachments/att-ticket')) return json({ data: pdf.toString('base64url'), size: pdf.length });
      return json({
        id: 'g1',
        internalDate: String(Date.UTC(2023, 8, 29)),
        payload: {
          mimeType: 'multipart/mixed',
          headers: [{ name: 'Subject', value: 'Itinerary 642804' }, { name: 'From', value: 'Globehunters <cs@globehunters.com>' }],
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('Dear customer, please find your e-ticket and invoice attached.') } },
            { mimeType: 'application/pdf', filename: 'invoice.pdf', body: { attachmentId: 'att-invoice', size: 9000 } },
            { mimeType: 'application/pdf', filename: 'E-ticket.pdf', body: { attachmentId: 'att-ticket', size: pdf.length } },
          ],
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const flights = await syncGmail({ token: 't', query: 'q' });
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'BA', flightNumber: '2662', from: 'LGW', to: 'RAK', departure: '2023-10-12T08:15', foundIn: 'PDF attachment E-ticket.pdf' }),
      expect.objectContaining({ airline: 'BA', flightNumber: '2663', from: 'RAK', to: 'LGW', departure: '2023-10-19T12:45' }),
    ]);
    // The ticket-looking PDF is read first, so the invoice is never downloaded.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('att-invoice'))).toBe(false);
  });
});

describe('stale flights', () => {
  it('drops flights an older parser wrongly took from a re-read email, but keeps edited ones', async () => {
    const { saveFlights } = await import('../src/lib/store');
    await saveFlights([
      { id: 'bad', airline: 'AA', flightNumber: '1433', from: 'TUL', to: 'CLT', departure: '2023-01-13', source: 'gmail', confidence: 'low', messageId: 'm0', emailDate: 1 },
      { id: 'mine', airline: 'AA', flightNumber: '9', from: 'JFK', to: 'LAX', departure: '2023-01-14', source: 'gmail', confidence: 'low', messageId: 'm0', edited: true },
      { id: 'manual', airline: '', flightNumber: '', from: 'SFO', to: 'SEA', departure: '2023-02-01', source: 'manual', confidence: 'high' },
    ]);
    await saveSyncState({ processedIds: ['m0'], deletedKeys: [], scanKey: '1|q', lastSync: Date.now() });
    fakeGmail(1, () => false);
    const flights = await syncGmail({ token: 't', query: 'q' });
    expect(flights.map((f) => f.id).sort()).toEqual([expect.any(String), 'manual', 'mine'].sort());
    expect(flights.find((f) => f.from === 'TUL')).toBeUndefined();
    expect(flights.find((f) => f.flightNumber === '100')).toMatchObject({ from: 'SFO', to: 'JFK' });
  });
});
