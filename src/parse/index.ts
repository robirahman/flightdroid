import type { Attachment, EmailMessage, ParsedFlight } from '../lib/types';
import { scanText, type HeuristicStats } from './heuristic';
import { htmlToText, normalizeText } from './html';
import { parseJsonLd } from './jsonld';
import { parseMicrodata } from './microdata';

/** Bump when parsing improves, so the next sync re-reads emails that previously gave nothing. */
export const PARSER_VERSION = 8;

export interface EmailExplanation {
  flights: ParsedFlight[];
  /** Which parser produced the flights, or 'none'. */
  method: 'markup' | 'text' | 'pdf' | 'none';
  /** The attachment the flights came from, for method 'pdf'. */
  source?: string;
  /** What the text scan found (absent when airline markup was used). */
  stats?: HeuristicStats;
  /** A one-line reason when no flights were found. */
  reason?: string;
  /** The plain text that was scanned, so a user can share exactly what the app saw. */
  text?: string;
}

const isPdf = (a: Attachment) => /pdf/i.test(a.mimeType) || /\.pdf$/i.test(a.name);

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
    if (structured.length) {
      // Keep the raw airline markup alongside the text, so a misread flight can be traced to it.
      const markup = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent?.trim()).filter(Boolean);
      const text = `${htmlToText(doc)}${markup.length ? `\n\n--- airline markup ---\n${markup.join('\n')}` : ''}`;
      return { flights: dedupe(structured), method: 'markup', text };
    }
    const htmlText = htmlToText(doc);
    // Prefer the HTML rendering: plain-text alternatives are often truncated summaries.
    if (htmlText.length > text.length / 2) text = htmlText;
  }
  const pdfs = (email.attachments ?? []).filter(isPdf).map((a) => a.name);
  const result = text ? explainText(text, email) : { flights: [], method: 'none' as const, reason: 'The email has no readable text.' };
  if (!result.flights.length && pdfs.length) result.reason += ` It has a PDF attachment (${pdfs.join(', ')}), which may hold the itinerary.`;
  return result;
}

/** Scans plain text (an email body or a PDF's text) for flights, explaining an empty result. */
export function explainText(text: string, email: EmailMessage, source?: string): EmailExplanation {
  const { flights, stats } = scanText(text, email);
  const method = source ? 'pdf' : 'text';
  if (flights.length) return { flights, method, source, stats, text };
  const missing = [!stats.flightNumbers && 'flight numbers', !stats.dates && 'dates', !stats.routes && 'airport codes'].filter(Boolean);
  const where = source ? `in ${source}` : 'in the email text';
  const reason = missing.length ? `No ${missing.join(' or ')} found ${where}.` : `Found flight numbers, dates and airport codes ${where}, but could not match them into flights.`;
  return { flights: [], method: 'none', stats, reason, text };
}

/** PDFs worth opening, itinerary-looking names first; tiny and huge files are skipped. */
export function pdfCandidates(email: EmailMessage, max = 3): Attachment[] {
  const looksLikeTicket = (a: Attachment) => /ticket|itinerar|boarding|confirm|receipt|booking|reserv|billete|biglietto|billet|voucher|travel|trip|flight|vuelo/i.test(a.name);
  return (email.attachments ?? [])
    .filter((a) => isPdf(a) && a.id && (a.size ?? 0) < 5_000_000)
    .sort((a, b) => Number(looksLikeTicket(b)) - Number(looksLikeTicket(a)))
    .slice(0, max);
}

function dedupe(flights: ParsedFlight[]): ParsedFlight[] {
  const seen = new Map<string, ParsedFlight>();
  for (const f of flights) {
    const key = `${f.airline}${f.flightNumber}${f.from}${f.to}${f.departure}`;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}
