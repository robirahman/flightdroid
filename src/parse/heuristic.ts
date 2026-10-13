import { AIRLINE_NAME_ALTERNATION, AIRLINE_NAME_PATTERNS, AIRLINES, airlineCodeFromAnyName, airlineFromSender, airlineName } from '../data/airlines';
import { getAirport } from '../lib/airports';
import type { EmailMessage, ParsedFlight } from '../lib/types';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

/** Uppercase words that are also airport codes but rarely mean the airport when they stand alone. */
const STOPWORDS = new Set(
  ('THE AND FOR ALL ARE YOU NOT ONE TWO NEW PDF USD EUR GBP CAD AUD JPY CHF GMT UTC PST PDT EST EDT CST CDT MST MDT ' +
    'BST CET CEST AET JST TSA FAQ VIP APP SMS OUT DAY WAY NOW SEE GET OUR HAS ITS VIA PER MAP TAX FEE ANY MON TUE WED ' +
    'THU FRI SAT SUN JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC ADT CHD INF ROW REF ETA ETD ARR DEP NON BAG MIN ' +
    'MAX TOP END OFF LOG USA UAE CEO RSS WEB FLY AIR CAR BUS BOX HTM WWW COM NET ORG SUM FIT BIG FUN RED TOO ' +
    'GOT CAN HOW WHO WHY YES OKAY ADD PAY BUY USE SET TRY OWN OLD FEW AGO AGE ART BAR BED BIT CUT EYE GAS HOT JOB ' +
    'KEY LAW LOW MEN MRS MSG OPT PRO QTY RES SKY SPA TEL TIP TOT TRX UPS VAT ZIP ECO GRP CAB')
    .split(' '),
);

interface Hit {
  index: number;
  end: number;
}
interface FlightHit extends Hit {
  airline?: string;
  number: string;
}
interface DateHit extends Hit {
  year?: number;
  month: number;
  day: number;
}
interface TimeHit extends Hit {
  minutes: number;
}
interface PairHit extends Hit {
  from: string;
  to: string;
  /** 3 = explicit arrow/"to", 2 = parenthesised codes, 1 = bare codes. */
  strength: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

function matches(text: string, re: RegExp): RegExpExecArray[] {
  return [...text.matchAll(re)];
}

function isAirportToken(code: string, bare = false): boolean {
  const a = getAirport(code);
  // Bare uppercase words need a bigger airport and must not be a common word or abbreviation.
  return !!a && (!bare || (a.size >= 2 && !STOPWORDS.has(code)));
}

function findFlightNumbers(text: string): FlightHit[] {
  const hits: FlightHit[] = [];
  // "UA 110", "UA110", "Flight: DL 1234"
  for (const m of matches(text, /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\b(?![:/.,]\d)/g)) {
    const [, code, number] = m;
    if (!AIRLINES[code]) continue;
    const before = text.slice(Math.max(0, m.index - 8), m.index);
    // "8:30 AM 10 Mar" is a time, not Aeroméxico flight 10.
    if (/\d[:.]\d\d\s*$/.test(before)) continue;
    // "US 2027" etc. after a month name is a date.
    if (/\d{4}/.test(number) && /^(19|20)\d\d$/.test(number) && !/flight/i.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    hits.push({ index: m.index, end: m.index + m[0].length, airline: code, number: String(Number(number)) });
  }
  // "Delta flight 1234", "United 110"
  const named = new RegExp(`\\b(${AIRLINE_NAME_ALTERNATION})\\s+(?:flight\\s*)?(?:#|no\\.?\\s*)?(\\d{1,4})\\b(?!\\s*(?:of\\b|:|[ap]\\.?m\\b|\\d))`, 'gi');
  for (const m of matches(text, named)) {
    const code = airlineCodeFromAnyName(m[1]);
    if (code) hits.push({ index: m.index, end: m.index + m[0].length, airline: code, number: String(Number(m[2])) });
  }
  // "Flight 1234", "Flight number: 1234" (carrier comes from the email)
  for (const m of matches(text, /\bflight\s*(?:number|no\.?|#)?\s*:?\s*(\d{1,4})\b(?!\s*(?:of\b|:|\/))/gi)) {
    hits.push({ index: m.index, end: m.index + m[0].length, number: String(Number(m[1])) });
  }
  hits.sort((a, b) => a.index - b.index || Number(!!b.airline) - Number(!!a.airline));
  // Overlapping hits are the same mention ("Delta flight 1234"); keep the earliest.
  const kept: FlightHit[] = [];
  for (const h of hits) {
    const last = kept[kept.length - 1];
    if (last && h.index < last.end) continue;
    kept.push(h);
  }
  return kept;
}

function findDates(text: string): DateHit[] {
  const hits: DateHit[] = [];
  const add = (m: RegExpExecArray, year: string | undefined, month: number, day: string) => {
    const d = Number(day);
    if (month < 1 || month > 12 || d < 1 || d > 31) return;
    let y = year ? Number(year) : undefined;
    if (y !== undefined && y < 100) y += 2000;
    hits.push({ index: m.index, end: m.index + m[0].length, year: y, month, day: d });
  };
  for (const m of matches(text, /\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m, m[1], Number(m[2]), m[3]);
  for (const m of matches(text, new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, 'gi'))) {
    add(m, m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, m[2]);
  }
  for (const m of matches(text, new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*-?\\s*${MONTH}(?:,?\\s*-?\\s*(\\d{4}|\\d{2}(?!\\d|:)))?`, 'gi'))) {
    add(m, m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, m[1]);
  }
  for (const m of matches(text, /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    // US order unless the first number can't be a month.
    if (a > 12) add(m, m[3], b, m[1]);
    else add(m, m[3], a, m[2]);
  }
  return hits.sort((a, b) => a.index - b.index).filter((h, i, all) => i === 0 || h.index >= all[i - 1].end);
}

function findTimes(text: string): TimeHit[] {
  return matches(text, /\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*([ap])\.?\s?m\b\.?)?(?![\d:])/gi).map((m) => {
    let h = Number(m[1]);
    const ampm = m[3]?.toLowerCase();
    if (ampm === 'p' && h < 12) h += 12;
    if (ampm === 'a' && h === 12) h = 0;
    return { index: m.index, end: m.index + m[0].length, minutes: h * 60 + Number(m[2]) };
  });
}

function findPairs(text: string): PairHit[] {
  const hits: PairHit[] = [];
  const arrow = /\b([A-Z]{3})\)?\s*(?:→|->|➝|➔|⟶|✈|✈️|–|—|-|>|to)\s*(?:[^\n()]{0,40}?\()?\b([A-Z]{3})\b/g;
  for (const m of matches(text, arrow)) {
    if (m[1] !== m[2] && isAirportToken(m[1]) && isAirportToken(m[2])) hits.push({ index: m.index, end: m.index + m[0].length, from: m[1], to: m[2], strength: 3 });
  }
  // Codes in parentheses: "San Francisco (SFO) ... New York (JFK)"
  const parens = matches(text, /\(([A-Z]{3})\)/g).filter((m) => isAirportToken(m[1]));
  for (let i = 0; i + 1 < parens.length; i++) {
    const [a, b] = [parens[i], parens[i + 1]];
    if (a[1] !== b[1] && b.index - a.index < 250) hits.push({ index: a.index, end: b.index + b[0].length, from: a[1], to: b[1], strength: 2 });
  }
  // Bare codes on the same line, e.g. table rows "UA110 | SFO | JFK".
  for (const line of lineSpans(text)) {
    const codes = matches(line.text, /\b([A-Z]{3})\b/g).filter((m) => isAirportToken(m[1], true));
    if (codes.length >= 2 && codes[0][1] !== codes[1][1]) {
      hits.push({ index: line.start + codes[0].index, end: line.start + codes[1].index + 3, from: codes[0][1], to: codes[1][1], strength: 1 });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function lineSpans(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let start = 0;
  for (const line of text.split('\n')) {
    out.push({ start, end: start + line.length, text: line });
    start += line.length + 1;
  }
  return out;
}

/** Picks the hit for a flight: same line first, then the first one after it, then the nearest before. */
function pick<T extends Hit>(hits: T[], at: Hit, windowStart: number, windowEnd: number, text: string, rank: (h: T) => number = () => 0): T | undefined {
  const lineStart = text.lastIndexOf('\n', at.index) + 1;
  const nl = text.indexOf('\n', at.end);
  const lineEnd = nl === -1 ? text.length : nl;
  const inWindow = hits.filter((h) => h.index >= windowStart && h.end <= windowEnd);
  const best = (list: T[], dist: (h: T) => number) => list.sort((a, b) => rank(b) - rank(a) || dist(a) - dist(b))[0];
  const sameLine = inWindow.filter((h) => h.index >= lineStart && h.end <= lineEnd);
  if (sameLine.length) return best(sameLine, (h) => Math.abs(h.index - at.index));
  const after = inWindow.filter((h) => h.index >= at.end);
  if (after.length) return best(after, (h) => h.index - at.end);
  return best(
    inWindow.filter((h) => h.end <= at.index),
    (h) => at.index - h.end,
  );
}

function resolveYear(d: DateHit, emailDate: number): number {
  if (d.year) return d.year;
  const sent = new Date(emailDate);
  // Itineraries are sent before the trip (or shortly after, for receipts).
  const cutoff = emailDate - 30 * 86400000;
  for (let y = sent.getUTCFullYear() - 1; y <= sent.getUTCFullYear() + 1; y++) {
    if (Date.UTC(y, d.month - 1, d.day) >= cutoff) return y;
  }
  return sent.getUTCFullYear();
}

function wall(year: number, month: number, day: number, minutes?: number): string {
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return minutes === undefined ? date : `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function addDays(wallDate: string, days: number): string {
  const [y, m, d] = wallDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

function defaultAirline(text: string, email: EmailMessage): string | undefined {
  const fromSender = airlineFromSender(email.from);
  if (fromSender) return fromSender;
  for (const [re, code] of AIRLINE_NAME_PATTERNS) if (re.test(email.from) || re.test(email.subject)) return code;
  let best: { index: number; code: string } | undefined;
  for (const [re, code] of AIRLINE_NAME_PATTERNS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { index: m.index, code };
  }
  return best?.code;
}

function confirmationCode(text: string): string | undefined {
  const m = text.match(/\b(?:confirmation|booking|record locator|reservation|pnr)\s*(?:code|number|no\.?|#|reference)?\s*(?:is)?\s*[:#]?\s*\|?\s*([A-Z0-9]{6})\b/i);
  return m && /[A-Z]/.test(m[1]) && /^[A-Z0-9]+$/.test(m[1]) ? m[1] : undefined;
}

/** Best-effort extraction from the text of an email without structured markup. */
export function parseHeuristic(text: string, email: EmailMessage): ParsedFlight[] {
  const flights = findFlightNumbers(text);
  const dates = findDates(text);
  const times = findTimes(text);
  const pairs = findPairs(text);
  if (!dates.length || !pairs.length) return [];

  const carrier = defaultAirline(text, email);
  const confirmation = confirmationCode(`${email.subject}\n${text}`);
  const cancelled = /\bcancel(l)?(ed|ation)\b/i.test(email.subject) && !/\b(re-?book|new itinerary|change|alternate)/i.test(email.subject);
  const out: ParsedFlight[] = [];

  const build = (anchor: Hit, windowStart: number, windowEnd: number, airline?: string, number = ''): ParsedFlight | undefined => {
    const pair = pick(pairs, anchor, windowStart, windowEnd, text, (p) => p.strength);
    const date = pick(dates, anchor, windowStart, windowEnd, text);
    if (!pair || !date) return undefined;
    const year = resolveYear(date, email.date);
    // Times after the date (and before the next flight), else on the date's line.
    let ts = times.filter((t) => t.index >= date.end && t.end <= windowEnd).slice(0, 2);
    if (!ts.length) {
      const lineStart = text.lastIndexOf('\n', date.index) + 1;
      const nl = text.indexOf('\n', date.end);
      ts = times.filter((t) => t.index >= lineStart && t.end <= (nl === -1 ? text.length : nl)).slice(0, 2);
    }
    const departure = wall(year, date.month, date.day, ts[0]?.minutes);
    let arrival: string | undefined;
    if (ts[1]) {
      // A later date between the two times means an overnight arrival.
      const arrDate = dates.find((d) => d.index > ts[0].end && d.end <= ts[1].index);
      let day = arrDate ? wall(resolveYear(arrDate, email.date), arrDate.month, arrDate.day) : departure.slice(0, 10);
      if (!arrDate && ts[1].minutes < ts[0].minutes) day = addDays(day, 1);
      arrival = wall(...(day.split('-').map(Number) as [number, number, number]), ts[1].minutes);
    }
    const code = airline ?? carrier ?? '';
    return {
      airline: code,
      airlineName: airlineName(code),
      flightNumber: number,
      from: pair.from,
      to: pair.to,
      departure,
      arrival,
      confirmation,
      confidence: 'low',
      cancelled: cancelled || undefined,
    };
  };

  if (flights.length) {
    flights.forEach((f, i) => {
      const start = i > 0 ? flights[i - 1].end : Math.max(0, f.index - 400);
      const end = i + 1 < flights.length ? flights[i + 1].index : Math.min(text.length, f.end + 600);
      const parsed = build(f, start, end, f.airline, f.number);
      if (parsed) out.push(parsed);
    });
  } else if (/confirm|itinerary|booked|e-?ticket|receipt|boarding pass|check[- ]?in|record locator/i.test(`${email.subject}\n${text}`)) {
    // No flight numbers: fall back to explicit "SFO → JFK" routes with a date nearby,
    // but only in emails that look transactional (sale emails list routes and dates too).
    const strong = pairs.filter((p) => p.strength >= 2);
    strong.forEach((p, i) => {
      const start = i > 0 ? strong[i - 1].end : Math.max(0, p.index - 300);
      const end = i + 1 < strong.length ? strong[i + 1].index : Math.min(text.length, p.end + 400);
      const parsed = build(p, start, end);
      if (parsed) out.push(parsed);
    });
  }

  // The same flight is often listed twice (summary + details); keep the most complete mention.
  const byKey = new Map<string, ParsedFlight>();
  for (const f of out) {
    const key = `${f.flightNumber || `${f.from}${f.to}`}@${f.departure.slice(0, 10)}`;
    const prev = byKey.get(key);
    if (!prev || score(f) > score(prev)) byKey.set(key, f);
  }
  return [...byKey.values()];
}

const score = (f: ParsedFlight) => (f.departure.length > 10 ? 2 : 0) + (f.arrival ? 1 : 0) + (f.airline ? 1 : 0);
