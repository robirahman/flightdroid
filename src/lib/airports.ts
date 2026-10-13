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

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Words in airport names that say nothing about which airport it is. */
const GENERIC_NAME_WORDS = new Set(
  ('airport airfield aerodrome aeroport aeropuerto aeroporto flughafen lufthavn international intl regional municipal ' +
    'county national domestic field station base heliport airstrip memorial general executive metropolitan city ' +
    'island islands lake river valley north south east west central saint santa santo grand great new port mount ' +
    // Everyday words that happen to identify one airport (Dallas Love Field, Chicago Midway, …).
    'love hobby midway liberty harbor harbour gateway freedom victory independence union nice split mobile orange')
    .split(' '),
);

/** Common alternative spellings of cities whose airport the data names differently. */
const NAME_ALIASES: Record<string, string> = { marrakech: 'RAK', bombay: 'BOM', calcutta: 'CCU', madras: 'MAA', saigon: 'SGN', peking: 'PEK' };

let nameIndex: Map<string, string> | undefined;
let nameOwners: Map<string, Set<string>> | undefined;

/**
 * Lower-case, accent-free names that point to exactly one airport with scheduled service:
 * distinctive words of airport names ("gatwick", "ezeiza") and cities with a single airport
 * ("marrakesh"). For emails that name airports instead of giving their codes.
 */
export function airportNameIndex(): Map<string, string> {
  if (nameIndex) return nameIndex;
  const owners = new Map<string, Set<string>>();
  const claim = (key: string, code: string, size: number) => {
    if (key.length < 4 || GENERIC_NAME_WORDS.has(key)) return;
    // Single words only for major airports: smaller ones are too often named after ordinary
    // words ("Fare"). Multi-word names ("santa marta") are distinctive at any size.
    if (size < 3 && !key.includes(' ')) return;
    (owners.get(key) ?? owners.set(key, new Set()).get(key)!).add(code);
  };
  for (const code of Object.keys(rows)) {
    const a = getAirport(code)!;
    if (a.size < 2) continue;
    const city = fold(a.city).replace(/\s*\(.*\)/, '').trim();
    if (city) claim(city, code, a.size);
    const cityWords = new Set(city.split(/[^a-z]+/));
    for (const word of fold(a.name).split(/[^a-z]+/)) if (word.length >= 5 && !cityWords.has(word)) claim(word, code, a.size);
  }
  nameIndex = new Map(Object.entries(NAME_ALIASES));
  for (const [key, codes] of owners) if (codes.size === 1 && !nameIndex.has(key)) nameIndex.set(key, [...codes][0]);
  nameOwners = owners;
  return nameIndex;
}

/**
 * The airport a name refers to, using the surrounding words to tell apart places that share a
 * name: "Santa Marta (Simon Bolivar)" is SMR in Colombia, not Kawama, also listed as Santa Marta.
 */
export function airportForName(key: string, context: string[]): string | undefined {
  const unique = airportNameIndex().get(key);
  if (unique) return unique;
  const candidates = [...(nameOwners!.get(key) ?? [])];
  if (candidates.length < 2) return undefined;
  const words = context.filter((w) => w.length >= 4 && !key.split(' ').includes(w));
  const scored = candidates.map((code) => {
    const a = getAirport(code)!;
    const own = new Set(fold(`${a.name} ${a.city}`).split(/[^a-z]+/));
    return { code, score: words.filter((w) => own.has(w)).length };
  });
  const best = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === best);
  return best > 0 && winners.length === 1 ? winners[0].code : undefined;
}

/** True when `word` is part of the airport's name or city ("GATWICK" for LGW, "MARRAKECH" for RAK). */
export function namesAirport(word: string, airport: Airport): boolean {
  const w = fold(word);
  if (w.length < 3) return false;
  const words = fold(`${airport.city} ${airport.name}`).split(/[^a-z]+/);
  return words.some((n) => n.length >= 3 && (n === w || (w.length >= 5 && n.length >= 5 && n.slice(0, 5) === w.slice(0, 5))));
}
