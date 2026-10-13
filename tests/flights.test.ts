import { describe, expect, it } from 'vitest';
import { describe as info, mergeParsed } from '../src/lib/flights';
import type { ParsedFlight } from '../src/lib/types';

const base: ParsedFlight = { airline: 'UA', flightNumber: '110', from: 'SFO', to: 'JFK', departure: '2027-03-04T20:15', confidence: 'high' };
const src = (id: string, date: number) => ({ messageId: id, subject: id, date });

describe('mergeParsed', () => {
  it('adds, updates from newer emails, and cancels', () => {
    let flights = mergeParsed([], [base], src('a', 1), new Set());
    expect(flights).toHaveLength(1);
    const id = flights[0].id;

    flights = mergeParsed(flights, [{ ...base, departure: '2027-03-04T21:00', arrival: '2027-03-05T05:20' }], src('b', 2), new Set());
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ id, departure: '2027-03-04T21:00', messageId: 'b' });

    // An older email processed later does not roll the change back.
    flights = mergeParsed(flights, [base], src('c', 0), new Set());
    expect(flights[0].departure).toBe('2027-03-04T21:00');

    flights = mergeParsed(flights, [{ ...base, cancelled: true }], src('d', 3), new Set());
    expect(flights).toHaveLength(0);
  });

  it('upgrades heuristic hits with structured data and keeps user edits', () => {
    let flights = mergeParsed([], [{ ...base, flightNumber: '', confidence: 'low' }], src('a', 1), new Set());
    flights = mergeParsed(flights, [base], src('b', 0), new Set());
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ flightNumber: '110', confidence: 'high' });

    flights = [{ ...flights[0], edited: true, to: 'EWR' }];
    flights = mergeParsed(flights, [{ ...base, to: 'EWR', arrival: '2027-03-05T05:00' }], src('c', 5), new Set());
    expect(flights[0].arrival).toBeUndefined();
  });

  it('skips flights the user deleted', () => {
    expect(mergeParsed([], [base], src('a', 1), new Set(['UA110@2027-03-04']))).toEqual([]);
  });
});

describe('describe', () => {
  it('uses scheduled times across time zones', () => {
    const d = info({ ...base, arrival: '2027-03-05T04:30', id: 'x', source: 'manual' });
    expect(d.scheduled).toBe(true);
    expect(d.minutes).toBe(315);
  });
});

describe('same booking, different dates', () => {
  it('keeps one flight per booking, flight number and route', () => {
    const ac33 = { ...base, airline: 'AC', flightNumber: '33', from: 'YVR', to: 'SYD', confirmation: 'ABC123' };
    let flights = mergeParsed([], [{ ...ac33, departure: '2026-12-15T23:50' }], src('a', 1), new Set());
    // A later email for the same booking reports another date (schedule change).
    flights = mergeParsed(flights, [{ ...ac33, departure: '2026-12-16T00:30' }], src('b', 2), new Set());
    expect(flights).toHaveLength(1);
    expect(flights[0].departure).toBe('2026-12-16T00:30');
    // A text-parsed email can't overrule what airline markup said.
    flights = mergeParsed(flights, [{ ...ac33, departure: '2026-03-02', confidence: 'low' }], src('c', 3), new Set());
    expect(flights).toHaveLength(1);
    expect(flights[0].departure).toBe('2026-12-16T00:30');
    // Different bookings of the same flight stay separate trips.
    flights = mergeParsed(flights, [{ ...ac33, confirmation: 'XYZ789', departure: '2027-12-15T23:50' }], src('d', 4), new Set());
    expect(flights).toHaveLength(2);
  });
});
