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
  ) {
    super(message);
  }
}

async function request<T>(token: string, path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
    return request(token, path, attempt + 1);
  }
  if (!res.ok) {
    let message = `Gmail API error ${res.status}`;
    try {
      message = (await res.json()).error?.message ?? message;
    } catch {
      /* keep the generic message */
    }
    throw new GmailError(message, res.status);
  }
  return res.json();
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
