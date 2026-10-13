import {
  AIRLINE_NAME_ALTERNATION,
  AIRLINE_NAME_PATTERNS,
  AIRLINES,
  airlineCodeFromAnyName,
  airlineFromSender,
  airlineName,
  usesMonthFirstDates,
} from '../data/airlines';
import { airportForName, airportNameIndex, getAirport, namesAirport } from '../lib/airports';
import type { EmailMessage, ParsedFlight } from '../lib/types';

/** Month names and abbreviations in English, Spanish, Portuguese, Italian, French and German (accents folded). */
const MONTH_NAMES: string[][] = [
  ['january', 'jan', 'enero', 'ene', 'janeiro', 'gennaio', 'gen', 'janvier', 'janv', 'januar'],
  ['february', 'feb', 'febrero', 'fevereiro', 'fev', 'febbraio', 'fevrier', 'fevr', 'februar'],
  ['march', 'mar', 'marzo', 'marco', 'mars', 'marz', 'maerz', 'mrz'],
  ['april', 'apr', 'abril', 'abr', 'aprile', 'avril', 'avr'],
  ['may', 'mayo', 'maio', 'maggio', 'mag', 'mai'],
  ['june', 'jun', 'junio', 'junho', 'giugno', 'giu', 'juin', 'juni'],
  ['july', 'jul', 'julio', 'julho', 'luglio', 'lug', 'juillet', 'juil', 'juli'],
  ['august', 'aug', 'agosto', 'ago', 'aout'],
  ['september', 'sep', 'sept', 'septiembre', 'setiembre', 'setembro', 'set', 'settembre', 'sett', 'septembre'],
  ['october', 'oct', 'octubre', 'outubro', 'out', 'ottobre', 'ott', 'octobre', 'oktober', 'okt'],
  ['november', 'nov', 'noviembre', 'novembro', 'novembre'],
  ['december', 'dec', 'diciembre', 'dic', 'dezembro', 'dez', 'dicembre', 'decembre', 'dezember'],
];
const MONTH_BY_NAME = new Map(MONTH_NAMES.flatMap((names, i) => names.map((n) => [n, i + 1] as const)));
const alternation = (names: string[]) => [...names].sort((a, b) => b.length - a.length).join('|');
const MONTH = `(${alternation([...MONTH_BY_NAME.keys()])})\\.?`;
/** Abbreviations that are also everyday words are only trusted after the day ("15 set"), never before it ("set 15"). */
const AMBIGUOUS = new Set(['set', 'out', 'gen', 'mag', 'ago', 'mai', 'dez']);
const MONTH_LEADING = `(${alternation([...MONTH_BY_NAME.keys()].filter((n) => !AMBIGUOUS.has(n)))})\\.?`;

const FLIGHT_WORD = '(?:flight|vuelo|voo|volo|vol|flug)';

/** Uppercase words that are also airport codes but rarely mean the airport when they stand alone. */
const STOPWORDS = new Set(
  ('THE AND FOR ALL ARE YOU NOT ONE TWO NEW PDF USD EUR GBP CAD AUD JPY CHF GMT UTC PST PDT EST EDT CST CDT MST MDT ' +
    'BST CET CEST AET JST TSA FAQ VIP APP SMS OUT DAY WAY NOW SEE GET OUR HAS ITS VIA PER MAP TAX FEE ANY MON TUE WED ' +
    'THU FRI SAT SUN JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC ADT CHD INF ROW REF ETA ETD ARR DEP NON BAG MIN ' +
    'MAX TOP END OFF LOG USA UAE CEO RSS WEB FLY AIR CAR BUS BOX HTM WWW COM NET ORG SUM FIT BIG FUN RED TOO ' +
    'GOT CAN HOW WHO WHY YES OKAY ADD PAY BUY USE SET TRY OWN OLD FEW AGO AGE ART BAR BED BIT CUT EYE GAS HOT JOB ' +
    'KEY LAW LOW MEN MRS MSG OPT PRO QTY RES SKY SPA TEL TIP TOT TRX UPS VAT ZIP ECO GRP CAB COP ARS BRL MXN CLP PEN')
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

/** What the text scan found, for explaining emails that produced no flights. */
export interface HeuristicStats {
  flightNumbers: number;
  dates: number;
  routes: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Strips accents so "Aerolíneas", "março" and "Bogotá" match plain patterns. */
export const foldAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

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
  // "UA 110", "UA110", "Flight: DL 1234", "Vuelo AV 9532"
  for (const m of matches(text, /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\b(?![:/.,]\d)/g)) {
    const [, code, number] = m;
    if (!AIRLINES[code]) continue;
    const before = text.slice(Math.max(0, m.index - 8), m.index).split('\n').pop()!;
    // "8:30 AM 10 Mar" is a time, not Aeroméxico flight 10 (same line only: a row ending
    // in a time can be followed by a row starting with a flight number).
    if (/\d[:.]\d\d\s*$/.test(before)) continue;
    // "US 2027" etc. after a month name is a date.
    if (/^(19|20)\d\d$/.test(number) && !new RegExp(FLIGHT_WORD, 'i').test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    hits.push({ index: m.index, end: m.index + m[0].length, airline: code, number: String(Number(number)) });
  }
  // "Delta flight 1234", "United 110", "Aerolineas Argentinas Flight 1672"
  const named = new RegExp(
    `\\b(${AIRLINE_NAME_ALTERNATION})\\s+(?:${FLIGHT_WORD}\\s*)?(?:#|no\\.?\\s*)?(\\d{1,4})\\b(?!\\s*(?:of\\b|de\\b|di\\b|:|[ap]\\.?m\\b|\\d))`,
    'gi',
  );
  for (const m of matches(text, named)) {
    const code = airlineCodeFromAnyName(m[1]);
    if (code) hits.push({ index: m.index, end: m.index + m[0].length, airline: code, number: String(Number(m[2])) });
  }
  // "Flight 1234", "Vuelo nº 1234" (carrier comes from the email)
  const generic = new RegExp(`\\b${FLIGHT_WORD}\\s*(?:number|numero|no\\.?|n[º°o]\\.?|nr\\.?|#)?\\s*:?\\s*(\\d{1,4})\\b(?!\\s*(?:of\\b|de\\b|di\\b|:|\\/))`, 'gi');
  for (const m of matches(text, generic)) {
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

function findDates(text: string, monthFirst: boolean): DateHit[] {
  const hits: DateHit[] = [];
  const add = (m: RegExpExecArray, year: string | undefined, month: number, day: string | number) => {
    const d = Number(day);
    if (!(month >= 1 && month <= 12) || d < 1 || d > 31) return;
    let y = year ? Number(year) : undefined;
    if (y !== undefined && y < 100) y += 2000;
    hits.push({ index: m.index, end: m.index + m[0].length, year: y, month, day: d });
  };
  const month = (name: string) => MONTH_BY_NAME.get(name.toLowerCase()) ?? 0;
  for (const m of matches(text, /\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(m, m[1], Number(m[2]), m[3]);
  // "Mar 14, 2024", "marzo 15 2025"
  for (const m of matches(text, new RegExp(`\\b${MONTH_LEADING}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!:)(?:,?\\s+(\\d{4}))?`, 'gi'))) {
    add(m, m[3], month(m[1]), m[2]);
  }
  // "15 de marzo de 2025", "12 maggio 2025", "14FEB", "12-Apr-25"
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|º|°)?\\s*(?:de\\s+|-|\\.\\s*)?${MONTH}\\b(?:\\s*(?:de\\s+|,\\s*|-|\\s)\\s*(\\d{4}|\\d{2}(?![\\d:])))?`, 'gi');
  for (const m of matches(text, dayFirst)) add(m, m[3], month(m[2]), m[1]);
  // "12OCT23", "29NOV" on tickets and in airline subjects.
  for (const m of matches(text, /\b(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})?\b/g)) add(m, m[3], month(m[2]), m[1]);
  // "03/04/2025": month-first for US senders, day-first everywhere else, unless a part > 12 decides.
  for (const m of matches(text, /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const aIsMonth = a > 12 ? false : b > 12 ? true : monthFirst;
    if (aIsMonth) add(m, m[3], a, b);
    else add(m, m[3], b, a);
  }
  // "15.03.2025" is always day-first.
  for (const m of matches(text, /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g)) add(m, m[3], Number(m[2]), m[1]);
  return hits.sort((a, b) => a.index - b.index).filter((h, i, all) => i === 0 || h.index >= all[i - 1].end);
}

function findTimes(text: string): TimeHit[] {
  const found = matches(text, /\b([01]?\d|2[0-3])[:.h]([0-5]\d)(?:\s*([ap])\.?\s?m\b\.?)?(?![\d:]|\s*m(?:in)?\b)/gi).map((m) => ({
    index: m.index,
    end: m.index + m[0].length,
    hour: Number(m[1]),
    minute: Number(m[2]),
    ampm: m[3]?.toLowerCase(),
  }));
  // PDF tables can wrap "p. m." onto the line below its time ("12:45 | 2:17" / "p. m. | p. m.").
  for (const line of new Set(found.filter((t) => !t.ampm && t.hour <= 12).map((t) => text.lastIndexOf('\n', t.index - 1) + 1))) {
    const bare = found.filter((t) => !t.ampm && t.hour <= 12 && text.lastIndexOf('\n', t.index - 1) + 1 === line);
    const [from, to] = lineWindow(text, line, line, 0, 3);
    const below = text.slice(text.indexOf('\n', line) + 1, to);
    if (from !== line) continue;
    for (const next of below.split('\n')) {
      const marks = [...next.matchAll(/(?:^|[\s|])([ap])\.?\s?m\.?(?=$|[\s|])/gi)].map((m) => m[1].toLowerCase());
      if (marks.length >= bare.length && marks.length) {
        bare.forEach((t, i) => (t.ampm = marks[i]));
        break;
      }
    }
  }
  return found.map(({ index, end, hour, minute, ampm }) => {
    let h = hour;
    if (ampm === 'p' && h < 12) h += 12;
    if (ampm === 'a' && h === 12) h = 0;
    return { index, end, minutes: h * 60 + minute };
  });
}

interface Mention extends Hit {
  code: string;
  /** "(SJO)" is unambiguous; a bare "SJO" or a name ("Gatwick") is weaker evidence. */
  kind: 'paren' | 'bare';
}

const CAPS_WORD = /^[A-Z][A-Z'.-]+$/;

/**
 * Whether a bare uppercase code really names an airport here. "MIA" alone in a table cell, next
 * to a time, or next to its city ("LONDON GATWICK LGW MARRAKECH") does; "SAN" in "SAN JOSE" or "DEL" in
 * "DEL VUELO" doesn't: those sit inside a run of capitalised words unrelated to the airport.
 */
/** Labels after which a three-letter code is a fare, class or ticket code, not an airport. */
const CODE_LABEL = /(fare|basis|class|designator|cabin|brand|product|tarifa|clase|classe|tariff|booking code)\b[^\n|]{0,3}$/i;

/** Span of the lines from `before` lines above to `after` lines below text[index, end). */
function lineWindow(text: string, index: number, end: number, before: number, after: number): [number, number] {
  let start = text.lastIndexOf('\n', index - 1);
  for (let i = 0; i < before && start > 0; i++) start = text.lastIndexOf('\n', start - 1);
  let stop = text.indexOf('\n', end);
  for (let i = 0; i < after && stop !== -1; i++) stop = text.indexOf('\n', stop + 1);
  return [start + 1, stop === -1 ? text.length : stop];
}

const linesAround = (text: string, index: number, end: number, before: number, after: number) => text.slice(...lineWindow(text, index, end, before, after));

/** Whether a fare/class label sits right before the code, on its line or the line above. */
function afterCodeLabel(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const sameLine = text.slice(lineStart, index);
  if (sameLine.trim()) return CODE_LABEL.test(sameLine.trimEnd());
  return CODE_LABEL.test(linesAround(text, lineStart, lineStart, 1, 0).split('\n')[0].trimEnd());
}

/**
 * Whether a bare uppercase code really names an airport here. Itineraries print an airport code
 * with its city or a departure time close by ("MIA / Miami / 8:35 PM", "LONDON GATWICK LGW
 * 08:15"); fare and class codes ("Fare basis: YCM") and capitalised words ("SAN JOSE", "DEL
 * VUELO") don't look like that.
 */
function bareCodeIsAirport(text: string, index: number, end: number, code: string): boolean {
  const airport = getAirport(code);
  if (!airport || airport.size < 2 || STOPWORDS.has(code)) return false;
  if (text[index - 1] === '(' || /^[-/.]/.test(text.slice(end, end + 1))) return false;
  if (afterCodeLabel(text, index)) return false;
  const before = text.slice(Math.max(0, index - 40), index).split(/[\n|]/).pop()!.trim().split(/\s+/).pop() ?? '';
  const after = text.slice(end, end + 40).split(/[\n|]/)[0].trim().split(/\s+/)[0] ?? '';
  const neighbours = [before, after].map((w) => w.replace(/[,:;]+$/, '')).filter((w) => CAPS_WORD.test(w) && !/^(AM|PM|A\.M\.|P\.M\.)$/.test(w));
  // Next to its own city or name ("GATWICK LGW") it is certainly the airport.
  if (neighbours.some((w) => namesAirport(w, airport))) return true;
  // Inside a run of unrelated capitalised words ("SAN JOSE") it is just a word.
  if (!neighbours.every((w) => w.length === 3 && getAirport(w))) return false;
  // Standing alone: its city nearby ("MIA … Miami"), or a time nearby.
  const nearby = linesAround(text, index, end, 2, 2).split(/[^A-Za-z]+/);
  return nearby.some((w) => w !== code && namesAirport(w, airport)) || nearTime(text, index, end);
}

let timesCache: { text: string; times: TimeHit[] } | undefined;
/** Whether a time appears within three lines of text[index, end). */
function nearTime(text: string, index: number, end: number): boolean {
  if (timesCache?.text !== text) timesCache = { text, times: findTimes(text) };
  const [start, stop] = lineWindow(text, index, end, 3, 3);
  return timesCache.times.some((t) => t.index >= start && t.end <= stop);
}

function findMentions(text: string): Mention[] {
  const out: Mention[] = [];
  for (const m of matches(text, /\(([A-Z]{3})\)/g)) if (isAirportToken(m[1])) out.push({ index: m.index, end: m.index + m[0].length, code: m[1], kind: 'paren' });
  for (const m of matches(text, /\b[A-Z]{3}\b/g)) {
    if (bareCodeIsAirport(text, m.index, m.index + 3, m[0])) out.push({ index: m.index, end: m.index + 3, code: m[0], kind: 'bare' });
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Airports named rather than coded, only as an explicit route ("London Gatwick to Marrakech",
 * "Madrid → Naples"). Names alone are too ambiguous: "Fare" is a town with an airport, and
 * "Wellington" or "China" show up in plenty of emails that have nothing to do with flights.
 */
function findNameRoutes(text: string): PairHit[] {
  const index = airportNameIndex();
  const PHRASE = "[A-Z][A-Za-z'.-]+(?: [A-Z][A-Za-z'.-]+){0,3}";
  // The airport inside a phrase: "London Gatwick" → "gatwick", "Marrakech Menara" → "marrakech".
  const resolve = (phrase: string, fromEnd: boolean): string | undefined => {
    const words = phrase.split(' ');
    const subphrases: string[] = [];
    for (let len = words.length; len >= 1; len--) {
      for (let i = 0; i + len <= words.length; i++) subphrases.push(words.slice(i, i + len).join(' '));
    }
    if (fromEnd) subphrases.sort((a, b) => b.split(' ').length - a.split(' ').length || phrase.lastIndexOf(b) - phrase.lastIndexOf(a));
    for (const sub of subphrases) {
      const code = index.get(sub.toLowerCase());
      if (code) return code;
    }
    return undefined;
  };
  const out: PairHit[] = [];
  for (const m of matches(text, new RegExp(`(${PHRASE})[ \\t]*(?:\\bto\\b|→|->|–|—|-|>|✈)[ \\t]*(${PHRASE})`, 'g'))) {
    const from = resolve(m[1], true);
    const to = resolve(m[2], false);
    if (from && to && from !== to) out.push({ index: m.index, end: m.index + m[0].length, from, to, strength: 1 });
  }
  return out;
}

/**
 * For emails with no airport codes at all: airport names near each flight number, including
 * names that a PDF table wrapped down a column ("Bogota" / "(El" / "Dorado" in one column,
 * "Santa" / "Marta" in the next). Reading each column top to bottom gives "Bogota (El Dorado)"
 * then "Santa Marta (Simon Bolivar)": the first two distinct airports are the route.
 */
function findNameRoutesNearFlights(text: string, flights: FlightHit[]): PairHit[] {
  const index = airportNameIndex();
  const resolve = (phrase: string): string | undefined => {
    // From the start of the cell: "Bogota (El Dorado Intl.)" is Bogota, not El Dorado, Arkansas.
    const words = phrase.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      for (let len = Math.min(3, words.length - i); len >= 1; len--) {
        const code = index.get(words.slice(i, i + len).join(' ')) ?? (len > 1 ? airportForName(words.slice(i, i + len).join(' '), words) : undefined);
        if (code) return code;
      }
    }
    return undefined;
  };
  const out: PairHit[] = [];
  for (const f of flights) {
    const [start, stop] = lineWindow(text, f.index, f.end, 3, 3);
    const rows = text.slice(start, stop).split('\n').map((line) => line.split('|').map((c) => c.trim()));
    const isName = (cell: string) => /[A-Za-z]{2}/.test(cell) && !/\d/.test(cell);
    const columns: string[] = [];
    for (const row of rows) row.forEach((cell, c) => isName(cell) && (columns[c] = `${columns[c] ?? ''} ${cell}`));
    let codes = columns.filter(Boolean).map(resolve);
    if (codes.filter(Boolean).length < 2) codes = rows.flat().filter(isName).map(resolve);
    const route = [...new Set(codes.filter((c): c is string => !!c))];
    if (route.length >= 2) out.push({ index: f.index, end: f.end, from: route[0], to: route[1], strength: 1 });
  }
  return out;
}

/** Routes from consecutive airport mentions: departure then arrival, close together. */
function pairsFromMentions(mentions: Mention[]): PairHit[] {
  const out: PairHit[] = [];
  for (let i = 0; i + 1 < mentions.length; i++) {
    const [a, b] = [mentions[i], mentions[i + 1]];
    if (a.code === b.code || b.index - a.end > 250) continue;
    out.push({ index: a.index, end: b.end, from: a.code, to: b.code, strength: a.kind === 'paren' && b.kind === 'paren' ? 2 : 1 });
  }
  return out;
}

function findPairs(text: string): PairHit[] {
  const hits: PairHit[] = [];
  const arrow = /\b([A-Z]{3})\)?\s*(?:→|->|➝|➔|⟶|✈|✈️|–|—|-|>|\bto\b|\ba\b|\bhacia\b|\bpara\b|\bper\b|\bvers\b|\bnach\b)\s*(?:[^\n()]{0,40}?\()?\b([A-Z]{3})\b/g;
  for (const m of matches(text, arrow)) {
    if (m[1] === m[2] || !isAirportToken(m[1]) || !isAirportToken(m[2])) continue;
    // "YTZ-YHM" could be a fare or ticket code; small airports need parentheses or a time nearby.
    const small = getAirport(m[1])!.size < 3 || getAirport(m[2])!.size < 3;
    if (small && !m[0].includes('(') && !m[0].includes(')') && !nearTime(text, m.index, m.index + m[0].length)) continue;
    if (afterCodeLabel(text, m.index)) continue;
    hits.push({ index: m.index, end: m.index + m[0].length, from: m[1], to: m[2], strength: 3 });
  }
  hits.push(...pairsFromMentions(findMentions(text)));
  // Only when no codes appear at all, fall back to airport and city names.
  if (!hits.length) hits.push(...findNameRoutes(text));
  // The same route is often found by several patterns; keep the strongest of overlapping hits.
  hits.sort((a, b) => a.index - b.index || b.strength - a.strength);
  const kept: PairHit[] = [];
  for (const h of hits) {
    const clash = kept.findIndex((k) => h.index < k.end && k.index < h.end && k.from === h.from && k.to === h.to);
    if (clash === -1) kept.push(h);
    else if (h.strength > kept[clash].strength) kept[clash] = h;
  }
  return kept.sort((a, b) => a.index - b.index);
}

/**
 * Cost of leaving a flight without a date or route, in characters of distance. Long HTML emails
 * can put a summary table thousands of characters away from the flight list, so this is generous.
 */
const UNASSIGNED = 8000;

/**
 * Matches each anchor (flight number) to at most one candidate (date or route), keeping document
 * order: the k-th flight gets a candidate no earlier than the (k-1)-th flight's. This copes with
 * emails that put the date before, after or beside the flight number. Candidates are shared
 * between flights only when there are fewer candidates than flights (connections listed under
 * one date). Returns the chosen candidate index per anchor, or -1.
 */
function alignInOrder(anchors: Hit[], candidates: Hit[], text: string, penalty: (c: number) => number = () => 0): number[] {
  const n = anchors.length;
  const m = candidates.length;
  const share = m < n;
  const lineOf = (i: number) => text.lastIndexOf('\n', i - 1);
  const cost = (a: number, c: number) => {
    const [x, y] = [anchors[a], candidates[c]];
    const sameLine = lineOf(x.index) === lineOf(y.index);
    const distance = sameLine ? 0 : y.index >= x.end ? y.index - x.end : x.index - y.end;
    return distance > UNASSIGNED ? Infinity : distance + penalty(c);
  };
  // dp[i][j]: lowest cost for anchors[0..i) using candidates[0..j).
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const how = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] + UNASSIGNED;
    how[i][0] = 2;
    for (let j = 1; j <= m; j++) {
      const options = [
        dp[i][j - 1], // candidate j-1 unused by anchor i-1
        (share ? dp[i - 1][j] : dp[i - 1][j - 1]) + cost(i - 1, j - 1), // anchor i-1 takes candidate j-1
        dp[i - 1][j] + UNASSIGNED, // anchor i-1 gets nothing
      ];
      const best = options.indexOf(Math.min(...options));
      dp[i][j] = options[best];
      how[i][j] = best;
    }
  }
  const result = new Array<number>(n).fill(-1);
  for (let i = n, j = m; i > 0; ) {
    const step = how[i][j];
    if (step === 0) j--;
    else {
      if (step === 1) result[i - 1] = j - 1;
      if (step === 1 && !share) j--;
      i--;
    }
  }
  return result;
}

const NOT_A_FLIGHT_DATE =
  /(booked|booking date|issued|issue date|date of issue|purchased?|ordered|transaction|invoice|payment|paid|emision|emission|fecha de (?:compra|reserva)|emitid[oa]|data (?:de )?(?:emissao|compra)|emesso|emissione|ausgestellt)[^\n\d]{0,25}$/i;

const ARRIVAL_LABEL = /(arriv\w*|llegada|llega|chegada|arrivo|ankunft|\barr\.?)[^\n\d]{0,20}$/i;

/**
 * Extra cost for dates that are probably not a departure: booking/issue dates, dates before the
 * email was sent (itineraries describe future flights), arrival dates, and dates with no time next to them.
 */
function datePenalty(d: DateHit, text: string, times: TimeHit[], emailDate: number): number {
  let penalty = 0;
  const before = text.slice(Math.max(0, d.index - 40), d.index);
  if (NOT_A_FLIGHT_DATE.test(before)) penalty += 5000;
  // An arrival date belongs to the flight before it, not the next flight number below it.
  if (ARRIVAL_LABEL.test(before)) penalty += 1500;
  if (Date.UTC(resolveYear(d, emailDate), d.month - 1, d.day) < emailDate - 3 * 86400000) penalty += 3000;
  if (!times.some((t) => t.index >= d.end && t.index - d.end < 120)) penalty += 200;
  return penalty;
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
  const header = foldAccents(`${email.from}\n${email.subject}`);
  for (const [re, code] of AIRLINE_NAME_PATTERNS) if (re.test(header)) return code;
  let best: { index: number; code: string } | undefined;
  for (const [re, code] of AIRLINE_NAME_PATTERNS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = { index: m.index, code };
  }
  return best?.code;
}

const CONFIRMATION_LABEL =
  'confirmation|booking|record locator|reservation|pnr|codigo de reserva(?:cion)?|codigo de confirmacion|localizador|' +
  'codice (?:di )?prenotazione|code de reservation|buchungscode|buchungsnummer|reserva|prenotazione';

export function confirmationCode(text: string): string | undefined {
  // "Confirmation code: ABC123", "Tu código de confirmación de JetBlue es ABC123".
  const re = new RegExp(
    `\\b(?:${CONFIRMATION_LABEL})\\s*(?:code|number|no\\.?|#|reference)?(?:\\s+(?:de|of|for|with)\\s+[A-Za-z]+)?\\s*(?:is|es|e|ist|est)?\\s*[:#]?\\s*\\|?\\s*([A-Z0-9]{6})\\b`,
    'gi',
  );
  // Labels are matched case-insensitively, but the code itself must look like one: "ZPLMQA", not "status".
  for (const m of text.matchAll(re)) if (/^[A-Z0-9]+$/.test(m[1]) && /[A-Z]/.test(m[1])) return m[1];
  return undefined;
}

export interface HeuristicResult {
  flights: ParsedFlight[];
  stats: HeuristicStats;
}

/** Best-effort extraction from the text of an email without structured markup. */
export function parseHeuristic(rawText: string, email: EmailMessage): ParsedFlight[] {
  return scanText(rawText, email).flights;
}

export function scanText(rawText: string, email: EmailMessage): HeuristicResult {
  // The subject often names the route or date ("Your trip confirmation (JFK - EZE)", "29NOV").
  const text = foldAccents(`${email.subject}\n${rawText}`);
  const subject = foldAccents(email.subject);
  const carrier = defaultAirline(text, email);
  const flights = findFlightNumbers(text);
  const dates = findDates(text, usesMonthFirstDates(email.from, carrier ?? flights.find((f) => f.airline)?.airline));
  const times = findTimes(text);
  const pairs = findPairs(text);
  if (!pairs.length && flights.length) pairs.push(...findNameRoutesNearFlights(text, flights));
  const stats = { flightNumbers: flights.length, dates: dates.length, routes: pairs.length };
  if (!dates.length || !pairs.length) return { flights: [], stats };

  const confirmation = confirmationCode(`${subject}\n${text}`);
  const cancelled =
    /\b(cancel(l)?(ed|ation)|cancelad[oa]|cancelamento|annullat[oa]|annulation|storniert)\b/i.test(subject) &&
    !/\b(re-?book|new itinerary|change|alternate|reprogramad|cambio)/i.test(subject);

  let anchors: (Hit & { airline?: string; number?: string })[] = flights;
  if (!anchors.length) {
    // No flight numbers: fall back to explicit "SFO → JFK" routes, but only in emails that look
    // transactional (sale emails list routes and dates too).
    const transactional =
      /confirm|itinerar|booked|e-?ticket|receipt|boarding pass|check[- ]?in|record locator|reserva|prenotazione|billet|biglietto|pase de abordar|embarque|localizador/i;
    if (!transactional.test(`${subject}\n${text}`)) return { flights: [], stats };
    anchors = pairs.filter((p) => p.strength >= 2);
  }

  const dateOf = alignInOrder(anchors, dates, text, (c) => datePenalty(dates[c], text, times, email.date));
  // Routes that span another flight's number ("…SJO | flight 2 | LIR…") join two different flights.
  const straddles = (p: PairHit) => anchors.some((a) => a.index > p.index && a.end < p.end);
  const pairOf = flights.length
    ? alignInOrder(anchors, pairs, text, (c) => (3 - pairs[c].strength) * 40 + (straddles(pairs[c]) ? 800 : 0))
    : anchors.map((_, i) => i);
  const routeOf = (i: number) => (flights.length ? pairs[pairOf[i]] : (anchors[i] as PairHit));
  const firstUse = (i: number) => dateOf.indexOf(dateOf[i]) === i;

  const out: ParsedFlight[] = [];
  anchors.forEach((anchor, i) => {
    const date = dates[dateOf[i]];
    const pair = routeOf(i);
    if (!date || !pair) return;
    // A flight's times follow its date, or its own route/number when it shares a date with the
    // previous leg; they stop where the next flight's details begin.
    const start = firstUse(i) ? date.end : Math.min(anchor.index, pair.index);
    // The next *different* flight bounds this one's times; a repeat mention of the same flight
    // number further down ("Vuelo # 1532" in a details box) does not.
    const next = anchors.slice(i + 1).find((a) => !(a.number && a.number === anchor.number && a.airline === anchor.airline));
    const nextIndex = next ? anchors.indexOf(next) : -1;
    const nextStart = next
      ? Math.min(next.index, routeOf(nextIndex)?.index ?? Infinity, firstUse(nextIndex) ? (dates[dateOf[nextIndex]]?.index ?? Infinity) : Infinity)
      : Infinity;
    const end = nextStart > start ? nextStart : Infinity;
    let ts = times.filter((t) => t.index >= start && t.end <= end).slice(0, 2);
    // Tables can print the times on a row above the flight number and date.
    if (!ts.length) {
      const [near, far] = lineWindow(text, anchor.index, anchor.end, 2, 2);
      ts = times.filter((t) => t.index >= near && t.end <= Math.min(far, end)).slice(0, 2);
    }

    const year = resolveYear(date, email.date);
    const departure = wall(year, date.month, date.day, ts[0]?.minutes);
    let arrival: string | undefined;
    if (ts[1]) {
      // A later date between the two times means an overnight arrival.
      const arrDate = dates.find((d) => d.index > ts[0].end && d.end <= ts[1].index);
      let day = arrDate ? wall(resolveYear(arrDate, email.date), arrDate.month, arrDate.day) : departure.slice(0, 10);
      if (!arrDate && ts[1].minutes < ts[0].minutes) day = addDays(day, 1);
      arrival = wall(...(day.split('-').map(Number) as [number, number, number]), ts[1].minutes);
    }
    const code = anchor.airline ?? carrier ?? '';
    out.push({
      airline: code,
      airlineName: airlineName(code),
      flightNumber: anchor.number ?? '',
      from: pair.from,
      to: pair.to,
      departure,
      arrival,
      confirmation,
      confidence: 'low',
      cancelled: cancelled || undefined,
    });
  });

  // The same flight is often listed twice (summary + details); keep the most complete mention.
  const byKey = new Map<string, ParsedFlight>();
  for (const f of out) {
    const key = `${f.flightNumber || `${f.from}${f.to}`}@${f.departure.slice(0, 10)}`;
    const prev = byKey.get(key);
    if (!prev || score(f) > score(prev)) byKey.set(key, f);
  }
  return { flights: [...byKey.values()], stats };
}

const score = (f: ParsedFlight) => (f.departure.length > 10 ? 2 : 0) + (f.arrival ? 1 : 0) + (f.airline ? 1 : 0);
