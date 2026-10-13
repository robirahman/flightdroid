import type { EmailMessage } from '../lib/types';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface Header {
  name: string;
  value: string;
}
export interface MessagePart {
  mimeType?: string;
  headers?: Header[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: MessagePart[];
}
export interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: MessagePart;
}

export class GmailError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when Gmail refused because of a quota or rate limit rather than a real error. */
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

/** Tunables, exported so tests can shrink the waits. */
export const limits = {
  /** Gap between requests at full speed: 20 requests/s, well under Gmail's 250 units/s per user. */
  minIntervalMs: 50,
  /** Slowest pace after repeated rate limiting. */
  maxIntervalMs: 2000,
  /** First wait after a rate limit; doubles per retry up to `maxBackoffMs`. */
  baseBackoffMs: 5000,
  /** Gmail's per-user quotas are per minute, so waiting a minute always gets a fresh allowance. */
  maxBackoffMs: 60000,
  maxAttempts: 8,
};

export type RateLimitListener = (waitMs: number) => void;
let onRateLimit: RateLimitListener | undefined;
export function setRateLimitListener(listener: RateLimitListener | undefined) {
  onRateLimit = listener;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Spaces requests out across all concurrent callers. Each rate-limit response pauses everyone
 * and halves the pace; successes slowly speed it back up.
 */
const pacer = {
  interval: 0,
  nextSlot: 0,
  async slot() {
    this.interval ||= limits.minIntervalMs;
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + this.interval;
    if (at > now) await sleep(at - now);
  },
  slowDown(pauseMs: number) {
    this.interval = Math.min(limits.maxIntervalMs, (this.interval || limits.minIntervalMs) * 2);
    this.nextSlot = Math.max(this.nextSlot, Date.now() + pauseMs);
  },
  speedUp() {
    this.interval = Math.max(limits.minIntervalMs, this.interval * 0.95);
  },
  reset() {
    this.interval = 0;
    this.nextSlot = 0;
  },
};
export const resetPacer = () => pacer.reset();

interface ErrorBody {
  error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
}

function isRateLimit(status: number, body: ErrorBody): boolean {
  if (status === 429) return true;
  const e = body.error;
  const reasons = [e?.status, ...(e?.errors ?? []).map((x) => x.reason), ...(e?.details ?? []).map((x) => x.reason)];
  return status === 403 && reasons.some((r) => r && /rateLimitExceeded|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED|quotaExceeded/i.test(r));
}

async function request<T>(token: string, path: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    await pacer.slot();
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      pacer.speedUp();
      return res.json();
    }
    let body: ErrorBody = {};
    try {
      body = await res.json();
    } catch {
      /* not JSON; keep the generic message */
    }
    const message = body.error?.message ?? `Gmail API error ${res.status}`;
    const rateLimited = isRateLimit(res.status, body);
    if (attempt < limits.maxAttempts && (rateLimited || res.status >= 500)) {
      const retryAfter = Number(res.headers.get('Retry-After')) * 1000;
      const backoff = rateLimited ? limits.baseBackoffMs * 2 ** (attempt - 1) : 500 * 2 ** attempt;
      const wait = Math.min(limits.maxBackoffMs, retryAfter > 0 ? retryAfter : backoff) + Math.random() * 250;
      if (rateLimited) {
        pacer.slowDown(wait);
        onRateLimit?.(wait);
      }
      await sleep(wait);
      continue;
    }
    throw new GmailError(message, res.status, rateLimited);
  }
}

/** All message ids matching a Gmail search query. */
export async function listMessageIds(token: string, query: string, onPage?: (count: number) => void): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: query, maxResults: '500' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await request<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `/messages?${params}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    onPage?.(ids.length);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

export async function getMessage(token: string, id: string): Promise<EmailMessage> {
  return decodeMessage(await request<GmailMessage>(token, `/messages/${id}?format=full`));
}

export function decodeBase64Url(data: string, charset = 'utf-8'): string {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function header(part: MessagePart | undefined, name: string): string {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** Flattens a Gmail message's MIME tree into subject, sender, date and the first html/plain bodies. */
export function decodeMessage(msg: GmailMessage): EmailMessage {
  const out: EmailMessage = {
    id: msg.id,
    subject: header(msg.payload, 'Subject'),
    from: header(msg.payload, 'From'),
    date: Number(msg.internalDate) || Date.parse(header(msg.payload, 'Date')) || Date.now(),
  };
  const walk = (part: MessagePart) => {
    const type = part.mimeType?.toLowerCase() ?? '';
    if (part.body?.data && (type === 'text/html' || type === 'text/plain')) {
      const charset = header(part, 'Content-Type').match(/charset="?([\w-]+)"?/i)?.[1] ?? 'utf-8';
      const key = type === 'text/html' ? 'html' : 'text';
      out[key] ??= decodeBase64Url(part.body.data, charset);
    }
    part.parts?.forEach(walk);
  };
  if (msg.payload) walk(msg.payload);
  return out;
}
