import { mergeParsed } from '../lib/flights';
import { loadFlights, loadSyncState, saveFlights, saveSyncState } from '../lib/store';
import type { EmailMessage, Flight, ParsedFlight } from '../lib/types';
import { parseEmail } from '../parse';
import { GmailError, getMessage, listMessageIds, resetPacer, setRateLimitListener } from './api';

export interface SyncProgress {
  phase: 'searching' | 'reading' | 'waiting' | 'done';
  total: number;
  done: number;
  found: number;
  /** While waiting out a Gmail rate limit: when reading resumes (epoch ms). */
  resumeAt?: number;
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

  let done = 0;
  let found = 0;
  let total = 0;
  let phase: SyncProgress['phase'] = 'searching';
  resetPacer();
  setRateLimitListener((waitMs) => onProgress?.({ phase: 'waiting', total, done, found, resumeAt: Date.now() + waitMs }));

  const emails: { email: EmailMessage; parsed: ParsedFlight[] }[] = [];
  let failure: unknown;
  try {
    onProgress?.({ phase, total: 0, done: 0, found: 0 });
    // Overlap the previous sync by two days in case of delayed delivery; processed ids dedupe.
    const after = !full && state.lastSync ? ` after:${Math.floor((state.lastSync - 2 * 86400000) / 1000)}` : '';
    const ids = (await listMessageIds(token, query + after, (n) => onProgress?.({ phase, total: n, done: 0, found: 0 }))).filter((id) => !processed.has(id));
    total = ids.length;
    phase = 'reading';

    // Fetch concurrently (the API client paces requests), but merge oldest-first below so newer
    // emails (schedule changes, cancellations) win.
    let next = 0;
    const worker = async () => {
      while (next < ids.length && !failure) {
        const id = ids[next++];
        try {
          const email = await getMessage(token, id);
          const parsed = parseEmail(email);
          emails.push({ email, parsed });
          found += parsed.length;
        } catch (e) {
          // Auth problems and rate limits that outlast the retries stop the sync; a single
          // unreadable message is skipped and retried next time.
          if (e instanceof GmailError && (e.rateLimited || e.status === 401 || e.status === 403)) failure ??= e;
        }
        done++;
        onProgress?.({ phase, total, done, found });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  } catch (e) {
    failure = e;
  } finally {
    setRateLimitListener(undefined);
  }

  // Keep whatever was read even if the sync stopped early; the next sync picks up the rest.
  emails.sort((a, b) => a.email.date - b.email.date);
  for (const { email, parsed } of emails) {
    if (parsed.length) flights = mergeParsed(flights, parsed, { messageId: email.id, subject: email.subject, date: email.date }, deleted);
    processed.add(email.id);
  }
  const error = failure ? describeFailure(failure) : undefined;
  await saveFlights(flights);
  await saveSyncState({
    ...state,
    processedIds: [...processed],
    lastSync: failure ? state.lastSync : startedAt,
    lastAttempt: { at: Date.now(), complete: !failure, read: emails.length, total, error },
  });
  onFlights?.(flights);
  if (failure) throw new Error(error);
  onProgress?.({ phase: 'done', total, done, found });
  return flights;
}

function describeFailure(e: unknown): string {
  if (e instanceof GmailError && e.rateLimited) {
    return 'Gmail kept rate-limiting requests. Your progress is saved — tap Sync Gmail in a few minutes to continue where it left off.';
  }
  if (e instanceof GmailError && e.status === 401) return 'Your Gmail sign-in expired. Tap Sync Gmail to sign in again; progress is saved.';
  return e instanceof Error ? e.message : String(e);
}
