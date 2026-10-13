import data from '../data/airports.json';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  /** 3 = large, 2 = medium, 1 = small. */
  size: number;
}

type Row = [string, string, string, number, number, string, number];
const rows = data as unknown as Record<string, Row>;
const cache = new Map<string, Airport>();

export function getAirport(code: string | undefined | null): Airport | undefined {
  if (!code) return undefined;
  const iata = code.trim().toUpperCase();
  let airport = cache.get(iata);
  if (airport) return airport;
  const row = rows[iata];
  if (!row) return undefined;
  const [name, city, country, lat, lon, tz, size] = row;
  airport = { iata, name, city, country, lat, lon, tz, size };
  cache.set(iata, airport);
  return airport;
}

export function isAirport(code: string): boolean {
  return getAirport(code) !== undefined;
}

export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = getAirport(q);
  const out: Airport[] = exact ? [exact] : [];
  for (const code of Object.keys(rows)) {
    if (out.length >= limit) break;
    const a = getAirport(code)!;
    if (a === exact) continue;
    if (a.city.toLowerCase().startsWith(q) || a.name.toLowerCase().includes(q)) out.push(a);
  }
  return out.sort((a, b) => (a === exact ? -1 : b === exact ? 1 : b.size - a.size));
}

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : undefined;

export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}
