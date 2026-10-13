import { airlineCodeFromName, airlineName } from '../data/airlines';
import { getAirport } from '../lib/airports';
import { isoToWallTime } from '../lib/time';
import type { ParsedFlight } from '../lib/types';

/** A schema.org node, as found in JSON-LD or rebuilt from microdata. */
export type Node = Record<string, unknown>;

export function types(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const t = (node as Node)['@type'] ?? (node as Node).type;
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string').map((x) => x.replace(/^https?:\/\/schema\.org\//, ''));
}

function asArray(v: unknown): unknown[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return str(v[0]);
  return undefined;
}

function prop(node: unknown, key: string): unknown {
  return node && typeof node === 'object' ? (node as Node)[key] : undefined;
}

/** Splits "UA110", "UA 110" or "110" into airline code and number. */
export function splitFlightNumber(raw: string | undefined): { airline?: string; number: string } | undefined {
  if (!raw) return undefined;
  const m = raw.replace(/\s+/g, ' ').trim().toUpperCase().match(/^(?:([A-Z][A-Z0-9]|[0-9][A-Z])\s?)?0*(\d{1,4})[A-Z]?$/);
  return m ? { airline: m[1], number: m[2] } : undefined;
}

function airportCode(v: unknown): string | undefined {
  const name = str(prop(v, 'name'));
  const code = str(prop(v, 'iataCode')) ?? str(v) ?? name?.match(/\(([A-Z]{3})\)/)?.[1];
  const upper = code?.toUpperCase();
  return upper && /^[A-Z]{3}$/.test(upper) && getAirport(upper) ? upper : undefined;
}

/** Converts a schema.org Flight (plus optional reservation context) to a ParsedFlight. */
export function flightFromSchema(flight: unknown, reservation?: unknown): ParsedFlight | undefined {
  const from = airportCode(prop(flight, 'departureAirport'));
  const to = airportCode(prop(flight, 'arrivalAirport'));
  const depRaw = str(prop(flight, 'departureTime')) ?? str(prop(flight, 'departureDate'));
  if (!from || !to || from === to || !depRaw) return undefined;
  const departure = isoToWallTime(depRaw, getAirport(from)?.tz);
  if (!departure) return undefined;
  const arrRaw = str(prop(flight, 'arrivalTime'));
  const arrival = arrRaw ? isoToWallTime(arrRaw, getAirport(to)?.tz) : undefined;

  const airlineNode = prop(flight, 'airline') ?? prop(flight, 'provider');
  const split = splitFlightNumber(str(prop(flight, 'flightNumber')));
  const nameFromNode = str(prop(airlineNode, 'name')) ?? (typeof airlineNode === 'string' && airlineNode.length > 3 ? airlineNode : undefined);
  const airline =
    str(prop(airlineNode, 'iataCode'))?.toUpperCase() ??
    split?.airline ??
    airlineCodeFromName(nameFromNode) ??
    (typeof airlineNode === 'string' && /^[A-Z0-9]{2}$/.test(airlineNode) ? airlineNode : '');

  const status = str(prop(reservation, 'reservationStatus')) ?? '';
  return {
    airline,
    airlineName: nameFromNode ?? airlineName(airline),
    flightNumber: split?.number ?? '',
    from,
    to,
    departure,
    arrival,
    confirmation: str(prop(reservation, 'reservationNumber')) ?? str(prop(reservation, 'reservationId')),
    passenger: str(prop(prop(reservation, 'underName'), 'name')),
    confidence: 'high',
    cancelled: /cancel/i.test(status) || undefined,
  };
}

/** Walks any JSON-ish structure and extracts every flight described by FlightReservation or Flight nodes. */
export function flightsFromNodes(root: unknown): ParsedFlight[] {
  const out: ParsedFlight[] = [];
  const seenFlights = new Set<unknown>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const t = types(node);
    if (t.includes('FlightReservation')) {
      for (const f of asArray(prop(node, 'reservationFor'))) {
        seenFlights.add(f);
        const parsed = flightFromSchema(f, node);
        if (parsed) out.push(parsed);
      }
      return;
    }
    if (t.includes('Flight') && !seenFlights.has(node)) {
      const parsed = flightFromSchema(node);
      if (parsed) out.push(parsed);
      return;
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v);
  };
  visit(root);
  return out;
}
