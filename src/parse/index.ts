import type { EmailMessage, ParsedFlight } from '../lib/types';
import { parseHeuristic } from './heuristic';
import { htmlToText, normalizeText } from './html';
import { parseJsonLd } from './jsonld';
import { parseMicrodata } from './microdata';

/** Extracts flights from an email: structured schema.org markup first, text heuristics as a fallback. */
export function parseEmail(email: EmailMessage): ParsedFlight[] {
  let text = email.text ? normalizeText(email.text) : '';
  if (email.html) {
    const doc = new DOMParser().parseFromString(email.html, 'text/html');
    const structured = [...parseJsonLd(doc), ...parseMicrodata(doc)];
    if (structured.length) return dedupe(structured);
    const htmlText = htmlToText(doc);
    // Prefer the HTML rendering: plain-text alternatives are often truncated summaries.
    if (htmlText.length > text.length / 2) text = htmlText;
  }
  return text ? parseHeuristic(text, email) : [];
}

function dedupe(flights: ParsedFlight[]): ParsedFlight[] {
  const seen = new Map<string, ParsedFlight>();
  for (const f of flights) {
    const key = `${f.airline}${f.flightNumber}${f.from}${f.to}${f.departure}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}
