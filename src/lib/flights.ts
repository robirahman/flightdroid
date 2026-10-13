import { getAirport, type Airport } from './airports';
import { distanceKm, estimateMinutes } from './geo';
import { wallDate, wallTimeToEpoch } from './time';
import type { Flight, ParsedFlight } from './types';

export interface FlightInfo {
  flight: Flight;
  from?: Airport;
  to?: Airport;
  km: number;
  minutes: number;
  /** True when the minutes come from real departure/arrival times rather than an estimate. */
  scheduled: boolean;
  departs: number;
  past: boolean;
}

export function describe(flight: Flight, now = Date.now()): FlightInfo {
  const from = getAirport(flight.from);
  const to = getAirport(flight.to);
  const km = from && to ? distanceKm([from.lat, from.lon], [to.lat, to.lon]) : 0;
  const departs = wallTimeToEpoch(flight.departure, from?.tz);
  let minutes = estimateMinutes(km);
  let scheduled = false;
  if (flight.arrival && flight.arrival.length > 10 && flight.departure.length > 10) {
    const arrives = wallTimeToEpoch(flight.arrival, to?.tz);
    const actual = (arrives - departs) / 60000;
    if (actual > 0 && actual < 24 * 60) {
      minutes = actual;
      scheduled = true;
    }
  }
  return { flight, from, to, km, minutes, scheduled, departs, past: departs < now };
}

export function flightCode(f: Pick<Flight, 'airline' | 'flightNumber'>): string {
  return [f.airline, f.flightNumber].filter(Boolean).join(' ');
}

/** Identity used to merge the same flight seen in several emails (booking, change, check-in). */
export function flightKey(f: Pick<Flight, 'airline' | 'flightNumber' | 'from' | 'to' | 'departure'>): string {
  const date = wallDate(f.departure);
  return f.flightNumber ? `${f.airline}${f.flightNumber.replace(/^0+/, '')}@${date}` : `${f.from}-${f.to}@${date}`;
}

export function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface MergeSource {
  messageId: string;
  subject: string;
  date: number;
}

/**
 * Merges flights parsed from one email into the collection. Newer emails replace older
 * details for the same flight, cancellations remove it, and user-edited flights are kept.
 * Flights in `deletedKeys` (removed by the user) are not re-added.
 */
export function mergeParsed(existing: Flight[], parsed: ParsedFlight[], source: MergeSource, deletedKeys: Set<string>): Flight[] {
  const byKey = new Map(existing.map((f) => [flightKey(f), f]));
  // Also match flights without a number against numbered ones on the same route and day.
  const byRoute = new Map(existing.map((f) => [`${f.from}-${f.to}@${wallDate(f.departure)}`, f]));
  // And the same booking's flight on another date: a schedule change, or an email that misread it.
  const bookingKey = (f: Pick<Flight, 'confirmation' | 'airline' | 'flightNumber' | 'from' | 'to'>) =>
    f.confirmation && f.flightNumber ? `${f.confirmation}|${f.airline}${f.flightNumber}|${f.from}-${f.to}` : undefined;
  const byBooking = new Map(existing.flatMap((f) => (bookingKey(f) ? [[bookingKey(f)!, f] as const] : [])));
  for (const p of parsed) {
    const key = flightKey(p);
    if (deletedKeys.has(key)) continue;
    const routeKey = `${p.from}-${p.to}@${wallDate(p.departure)}`;
    const current = byKey.get(key) ?? byRoute.get(routeKey) ?? (bookingKey(p) ? byBooking.get(bookingKey(p)!) : undefined);
    if (p.cancelled) {
      if (current && !current.edited && (current.emailDate ?? 0) <= source.date) {
        byKey.delete(flightKey(current));
        byRoute.delete(routeKey);
      }
      continue;
    }
    if (current) {
      if (current.edited || current.source !== 'gmail') continue;
      const newer = (current.emailDate ?? 0) <= source.date;
      // Prefer structured data and newer emails, but never lose fields we already had.
      const preferNew = (p.confidence === 'high' && current.confidence === 'low') || (newer && p.confidence === current.confidence);
      if (!preferNew) continue;
      const merged: Flight = {
        ...current,
        ...stripEmpty(p),
        id: current.id,
        source: 'gmail',
        messageId: source.messageId,
        emailSubject: source.subject,
        emailDate: source.date,
      };
      delete (merged as Partial<ParsedFlight>).cancelled;
      byKey.delete(flightKey(current));
      byKey.set(flightKey(merged), merged);
      byRoute.set(routeKey, merged);
      if (bookingKey(merged)) byBooking.set(bookingKey(merged)!, merged);
    } else {
      const { cancelled: _cancelled, ...rest } = p;
      const flight: Flight = {
        ...rest,
        id: newId(),
        source: 'gmail',
        messageId: source.messageId,
        emailSubject: source.subject,
        emailDate: source.date,
      };
      byKey.set(key, flight);
      byRoute.set(routeKey, flight);
      if (bookingKey(flight)) byBooking.set(bookingKey(flight)!, flight);
    }
  }
  return sortFlights([...byKey.values()]);
}

function stripEmpty<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}

export function sortFlights(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) => a.departure.localeCompare(b.departure));
}
