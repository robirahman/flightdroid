import type { EmailMessage, ParsedFlight } from '../lib/types';
import { scanText, type HeuristicStats } from './heuristic';
import { htmlToText, normalizeText } from './html';
import { parseJsonLd } from './jsonld';
import { parseMicrodata } from './microdata';

/** Bump when parsing improves, so the next sync re-reads emails that previously gave nothing. */
export const PARSER_VERSION = 2;

export interface EmailExplanation {
  flights: ParsedFlight[];
  /** Which parser produced the flights, or 'none'. */
  method: 'markup' | 'text' | 'none';
  /** What the text scan found (absent when airline markup was used). */
  stats?: HeuristicStats;
  /** A one-line reason when no flights were found. */
  reason?: string;
}

/** Extracts flights from an email: structured schema.org markup first, text heuristics as a fallback. */
export function parseEmail(email: EmailMessage): ParsedFlight[] {
  return explainEmail(email).flights;
}

/** Like parseEmail, but also says how the email was read and, when nothing was found, why. */
export function explainEmail(email: EmailMessage): EmailExplanation {
  let text = email.text ? normalizeText(email.text) : '';
  if (email.html) {
    const doc = new DOMParser().parseFromString(email.html, 'text/html');
    const structured = [...parseJsonLd(doc), ...parseMicrodata(doc)];
    if (structured.length) return { flights: dedupe(structured), method: 'markup' };
    const htmlText = htmlToText(doc);
    // Prefer the HTML rendering: plain-text alternatives are often truncated summaries.
    if (htmlText.length > text.length / 2) text = htmlText;
  }
  const pdfs = (email.attachments ?? []).filter((a) => /pdf/i.test(a));
  if (!text) return { flights: [], method: 'none', reason: pdfs.length ? 'The email has no text; the details are probably only in the attached PDF.' : 'The email has no readable text.' };

  const { flights, stats } = scanText(text, email);
  if (flights.length) return { flights, method: 'text', stats };
  const missing = [!stats.flightNumbers && 'flight numbers', !stats.dates && 'dates', !stats.routes && 'airport codes'].filter(Boolean);
  let reason = missing.length
    ? `No ${missing.join(' or ')} found in the email text.`
    : 'Found flight numbers, dates and airport codes, but could not match them into flights.';
  if (pdfs.length) reason += ` It has a PDF attachment (${pdfs.join(', ')}), which may hold the itinerary.`;
  return { flights: [], method: 'none', stats, reason };
}

function dedupe(flights: ParsedFlight[]): ParsedFlight[] {
  const seen = new Map<string, ParsedFlight>();
  for (const f of flights) {
    const key = `${f.airline}${f.flightNumber}${f.from}${f.to}${f.departure}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}
