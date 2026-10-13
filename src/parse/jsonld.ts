import type { ParsedFlight } from '../lib/types';
import { flightsFromNodes } from './schema';

export function parseJsonLd(doc: Document): ParsedFlight[] {
  const out: ParsedFlight[] = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      out.push(...flightsFromNodes(JSON.parse(script.textContent ?? '')));
    } catch {
      // Malformed JSON-LD is common in marketing templates; ignore it.
    }
  }
  return out;
}
