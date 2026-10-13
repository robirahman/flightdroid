import { mergeParsed } from '../lib/flights';
import { loadFlights, loadSyncState, saveFlights, saveSyncState } from '../lib/store';
import type { EmailMessage, Flight, ParsedFlight } from '../lib/types';
import { parseEmail } from '../parse';
import { GmailError, getMessage, listMessageIds } from './api';

export interface SyncProgress {
  phase: 'searching' | 'reading' | 'done';
  total: number;
  done: number;
  found: number;
}

export interface SyncOptions {
  token: string;
  query: string;
  /** Re-read emails that were already processed. */
  full?: boolean;
  onProgress?: (p: SyncProgress) => void;
  onFlights?: (flights: Flight[]) => void;
}

const CONCURRENCY = 5;

/** Searches Gmail, parses new messages and merges their flights into storage. */
export async function syncGmail({ token, query, full, onProgress, onFlights }: SyncOptions): Promise<Flight[]> {
  const state = await loadSyncState();
  const processed = new Set(full ? [] : state.processedIds);
  const deleted = new Set(state.deletedKeys);
  let flights = await loadFlights();
  const startedAt = Date.now();

  onProgress?.({ phase: 'searching', total: 0, done: 0, found: 0 });
  // Overlap the previous sync by two days in case of delayed delivery; processed ids dedupe.
  const after = !full && state.lastSync ? ` after:${Math.floor((state.lastSync - 2 * 86400000) / 1000)}` : '';
  const ids = (await listMessageIds(token, query + after, (n) => onProgress?.({ phase: 'searching', total: n, done: 0, found: 0 }))).filter(
    (id) => !processed.has(id),
  );

  // Fetch concurrently, but merge oldest-first so newer emails (changes, cancellations) win.
  const emails: { email: EmailMessage; parsed: ParsedFlight[] }[] = [];
  let done = 0;
  let found = 0;
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (next < ids.length && !failure) {
      const id = ids[next++];
      try {
        const email = await getMessage(token, id);
        const parsed = parseEmail(email);
        emails.push({ email, parsed });
        found += parsed.length;
      } catch (e) {
        // Auth problems stop the sync; a single unreadable message is skipped and retried next time.
        if (e instanceof GmailError && (e.status === 401 || e.status === 403)) failure = e;
      }
      done++;
      onProgress?.({ phase: 'reading', total: ids.length, done, found });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

  // Keep whatever was read even if the sync stopped early.
  emails.sort((a, b) => a.email.date - b.email.date);
  for (const { email, parsed } of emails) {
    if (parsed.length) flights = mergeParsed(flights, parsed, { messageId: email.id, subject: email.subject, date: email.date }, deleted);
    processed.add(email.id);
  }
  await saveFlights(flights);
  await saveSyncState({ ...state, processedIds: [...processed], lastSync: failure ? state.lastSync : startedAt });
  if (failure) {
    onFlights?.(flights);
    throw failure;
  }
  onFlights?.(flights);
  onProgress?.({ phase: 'done', total: ids.length, done, found });
  return flights;
}
