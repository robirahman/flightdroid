import { describe, expect, it } from 'vitest';
import { getAirport } from '../src/lib/airports';
import { distanceKm, greatCircle, unwrapPath, wrapLon, type LatLon } from '../src/lib/geo';
import { isoToWallTime, wallTimeToEpoch } from '../src/lib/time';

const ll = (code: string): LatLon => {
  const a = getAirport(code)!;
  return [a.lat, a.lon];
};

describe('geo', () => {
  it('computes great-circle distances', () => {
    expect(distanceKm(ll('SFO'), ll('JFK'))).toBeGreaterThan(4100);
    expect(distanceKm(ll('SFO'), ll('JFK'))).toBeLessThan(4200);
    expect(distanceKm(ll('LHR'), ll('SIN'))).toBeCloseTo(10880, -2);
  });

  it('interpolates arcs that end at both airports', () => {
    const pts = greatCircle(ll('SFO'), ll('NRT'), 32);
    expect(pts).toHaveLength(33);
    expect(pts[0][0]).toBeCloseTo(ll('SFO')[0], 4);
    expect(pts[32][1]).toBeCloseTo(ll('NRT')[1], 4);
    // The great circle bows north towards Alaska.
    expect(Math.max(...pts.map((p) => p[0]))).toBeGreaterThan(47);
  });

  it('unwraps arcs across the antimeridian', () => {
    const pts = unwrapPath(greatCircle(ll('SFO'), ll('NRT')));
    for (let i = 1; i < pts.length; i++) expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThan(10);
    expect(pts.at(-1)![1]).toBeCloseTo(ll('NRT')[1] - 360, 4);
    expect(wrapLon(140, -122)).toBe(-220);
    expect(wrapLon(-73, -122)).toBe(-73);
  });
});

describe('time', () => {
  it('converts wall time to an instant using the airport time zone', () => {
    expect(new Date(wallTimeToEpoch('2027-03-04T20:15', 'America/Los_Angeles')).toISOString()).toBe('2027-03-05T04:15:00.000Z');
    expect(new Date(wallTimeToEpoch('2027-07-04T20:15', 'America/Los_Angeles')).toISOString()).toBe('2027-07-05T03:15:00.000Z');
  });

  it('normalizes ISO strings', () => {
    expect(isoToWallTime('2027-03-04T20:15:00-08:00')).toBe('2027-03-04T20:15');
    expect(isoToWallTime('2027-03-05T04:15:00Z', 'America/Los_Angeles')).toBe('2027-03-04T20:15');
    expect(isoToWallTime('2027-03-04')).toBe('2027-03-04');
  });
});
