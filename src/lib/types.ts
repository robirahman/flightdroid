export interface Flight {
  id: string;
  /** IATA airline code ("UA") when known, otherwise empty. */
  airline: string;
  airlineName?: string;
  /** Numeric part of the flight number ("110"); may be empty for heuristic hits. */
  flightNumber: string;
  /** IATA airport codes. */
  from: string;
  to: string;
  /** Local wall time at the origin, "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */
  departure: string;
  /** Local wall time at the destination, same formats as `departure`. */
  arrival?: string;
  confirmation?: string;
  passenger?: string;
  source: 'gmail' | 'manual' | 'demo';
  /** How the flight was found: structured markup is trusted, regex hits should be checked. */
  confidence: 'high' | 'low';
  messageId?: string;
  emailSubject?: string;
  /** Epoch ms of the email the flight came from; newer emails win when merging. */
  emailDate?: number;
  /** True once the user edits the flight, so later syncs leave it alone. */
  edited?: boolean;
}

/** A flight as extracted from an email, before ids and provenance are attached. */
export type ParsedFlight = Pick<
  Flight,
  'airline' | 'airlineName' | 'flightNumber' | 'from' | 'to' | 'departure' | 'arrival' | 'confirmation' | 'passenger' | 'confidence'
> & { cancelled?: boolean };

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  /** Epoch ms. */
  date: number;
  html?: string;
  text?: string;
  /** Attachment file names (or MIME types when unnamed). */
  attachments?: string[];
}

export interface Settings {
  clientId: string;
  query: string;
  units: 'km' | 'mi';
}
