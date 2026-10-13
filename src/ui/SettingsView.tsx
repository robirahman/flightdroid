import { useEffect, useState } from 'preact/hooks';
import type { DiagnosedEmail } from '../gmail/diagnose';
import type { SyncProgress } from '../gmail/sync';
import { flightCode } from '../lib/flights';
import type { SyncState } from '../lib/store';
import { formatDate } from '../lib/time';
import type { Settings } from '../lib/types';
import { Icon } from './icons';

interface Props {
  settings: Settings;
  flightCount: number;
  syncState: Pick<SyncState, 'lastSync' | 'lastAttempt'>;
  /** True when the search or parser improved since the last sync, so the next one re-reads everything. */
  rescanPending: boolean;
  progress?: SyncProgress;
  syncing: boolean;
  onDiagnose: (query: string) => Promise<DiagnosedEmail[]>;
  onSettings: (s: Settings) => void;
  onSync: (full: boolean) => void;
  onSignOut: () => void;
  onDemo: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}

const SETUP_URL = 'https://github.com/robirahman/flightdroid#connect-gmail';

export function SettingsView(p: Props) {
  const [clientId, setClientId] = useState(p.settings.clientId);
  const [query, setQuery] = useState(p.settings.query);
  const dirty = clientId.trim() !== p.settings.clientId || query.trim() !== p.settings.query;
  const pct = p.progress && p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : 0;
  const waitSeconds = useCountdown(p.progress?.phase === 'waiting' ? p.progress.resumeAt : undefined);
  const { lastSync, lastAttempt } = p.syncState;
  const stoppedEarly = !p.syncing && lastAttempt && !lastAttempt.complete;

  return (
    <div class="settings-view scroll">
      <section class="card">
        <h3>
          <Icon name="mail" size={18} /> Gmail
        </h3>
        <p class="muted">
          Flightdroid searches your mailbox for flight confirmations right in this browser. Your email never leaves your device — there is no server.
        </p>
        <button class="btn primary wide" disabled={p.syncing || !p.settings.clientId} onClick={() => p.onSync(false)}>
          <Icon name="sync" size={18} /> {p.syncing ? 'Syncing…' : 'Sync Gmail'}
        </button>
        {p.progress && (
          <div class="progress">
            <div class="progress-bar">
              <span style={{ width: `${p.progress.phase === 'searching' ? 5 : p.progress.phase === 'done' ? 100 : pct}%` }} />
            </div>
            <p class="muted">
              {p.progress.phase === 'searching' && `Searching… ${p.progress.total ? `${p.progress.total} matching emails` : ''}`}
              {p.progress.phase === 'reading' && `Reading ${p.progress.done} of ${p.progress.total} emails · ${p.progress.found} flights found`}
              {p.progress.phase === 'waiting' &&
                `Gmail asked us to slow down — resuming in ${waitSeconds}s · ${p.progress.done} of ${p.progress.total} emails read`}
              {p.progress.phase === 'done' && `Done · read ${p.progress.total} new emails · ${p.progress.found} flight mentions`}
            </p>
          </div>
        )}
        {p.rescanPending && !p.syncing && (
          <p class="notice">Flight detection has improved since your last sync. The next sync re-reads all matching emails once.</p>
        )}
        {stoppedEarly && (
          <p class="notice">
            The last sync stopped after reading {lastAttempt.read} of {lastAttempt.total} emails.{' '}
            {lastAttempt.error ?? 'Tap Sync Gmail to continue where it left off.'}
          </p>
        )}
        <p class="muted small">
          {lastSync ? `Last full sync ${new Date(lastSync).toLocaleString()}` : 'No full sync yet'} · {p.flightCount} flights saved
        </p>
        <div class="row">
          <button class="btn small" disabled={p.syncing || !p.settings.clientId} onClick={() => p.onSync(true)}>
            Rescan all emails
          </button>
          <button class="btn small" onClick={p.onSignOut}>
            Sign out
          </button>
        </div>
      </section>

      <section class="card">
        <h3>Google OAuth client</h3>
        <p class="muted">
          Gmail access needs your own free Google Cloud OAuth client ID.{' '}
          <a href={SETUP_URL} target="_blank" rel="noopener noreferrer">
            Setup guide
          </a>
          . Authorized JavaScript origin: <code>{location.origin}</code>
        </p>
        <label class="field">
          <span>Client ID</span>
          <input value={clientId} placeholder="1234-abc.apps.googleusercontent.com" autoComplete="off" spellcheck={false} onInput={(e) => setClientId(e.currentTarget.value)} />
        </label>
        <details>
          <summary>Advanced: Gmail search query</summary>
          <label class="field">
            <span class="hint">Leave empty for the built-in search (booking subjects in six languages, mail from airlines and travel agencies, and Gmail's Reservations category). A query here replaces it.</span>
            <textarea rows={3} value={query} placeholder="Built-in search" spellcheck={false} onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>
          {query && (
            <button class="btn small" onClick={() => setQuery('')}>
              Use built-in search
            </button>
          )}
        </details>
        {dirty && (
          <button class="btn primary wide" onClick={() => p.onSettings({ ...p.settings, clientId: clientId.trim(), query: query.trim() })}>
            Save
          </button>
        )}
      </section>

      <MissingFlight disabled={!p.settings.clientId || p.syncing} onDiagnose={p.onDiagnose} />

      <section class="card">
        <h3>Units</h3>
        <div class="segmented">
          {(['km', 'mi'] as const).map((u) => (
            <button key={u} class={p.settings.units === u ? 'active' : ''} onClick={() => p.onSettings({ ...p.settings, units: u })}>
              {u === 'km' ? 'Kilometres' : 'Miles'}
            </button>
          ))}
        </div>
      </section>

      <section class="card">
        <h3>Data</h3>
        <div class="row wrap">
          <button class="btn small" onClick={p.onExport}>
            Export JSON
          </button>
          <label class="btn small">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) p.onImport(file);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <button class="btn small" onClick={p.onDemo}>
            Load demo flights
          </button>
          <button
            class="btn small danger"
            onClick={() => {
              if (confirm('Delete all flights and sync history from this device?')) p.onClear();
            }}
          >
            Delete all data
          </button>
        </div>
      </section>
      <p class="muted small center">Flightdroid · map tiles © Esri, HERE, Garmin, © OpenStreetMap contributors</p>
    </div>
  );
}

/** Whole seconds until `until`, ticking every second; 0 when there is nothing to count down to. */
function useCountdown(until: number | undefined): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

/** "Missing a flight?": shows whether the sync reads the emails for a trip and what it finds in them. */
function MissingFlight({ disabled, onDiagnose }: { disabled: boolean; onDiagnose: (query: string) => Promise<DiagnosedEmail[]> }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DiagnosedEmail[]>();
  const [error, setError] = useState<string>();

  const check = async (e: Event) => {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      setResults(await onDiagnose(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card">
      <h3>Missing a flight?</h3>
      <p class="muted">
        Search your Gmail for the trip (e.g. <code>avianca santa marta</code>) to see whether Flightdroid reads those emails and what it finds in them.
      </p>
      <form class="row" onSubmit={check}>
        <input class="grow" value={query} placeholder="Gmail search" spellcheck={false} onInput={(e) => setQuery(e.currentTarget.value)} />
        <button class="btn small" type="submit" disabled={disabled || busy || !query.trim()}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>
      {error && <p class="notice">{error}</p>}
      {results && !results.length && <p class="muted">No emails match that search.</p>}
      {results && results.length > 0 && (
        <ul class="diagnosis">
          {results.map((r) => (
            <li key={r.id}>
              <a href={`https://mail.google.com/mail/u/0/#all/${r.id}`} target="_blank" rel="noopener noreferrer">
                <strong>{r.subject || '(no subject)'}</strong>
              </a>
              <span class="muted small">
                {r.from.replace(/<.*>/, '').trim() || r.from} · {new Date(r.date).toLocaleDateString()}
              </span>
              {!r.searchedBySync && <span class="tag warn">Not included in the sync search</span>}
              {r.explanation.flights.length ? (
                <span class="tag ok">
                  {r.explanation.flights
                    .map((f) => `${flightCode(f) || 'Flight'} ${f.from}→${f.to} ${formatDate(f.departure, { day: 'numeric', month: 'short', year: 'numeric' })}`)
                    .join(' · ')}
                </span>
              ) : (
                <span class="tag warn">{r.explanation.reason}</span>
              )}
              {r.explanation.text && <CopyText text={`${r.subject}\n${r.from}\n\n${r.explanation.text}`} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Copies what the app read from an email, so the user can share it when reporting a parsing problem. */
function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text.slice(0, 30000));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy the email text:', text.slice(0, 30000));
    }
  };
  return (
    <button type="button" class="link-btn" onClick={copy}>
      {copied ? 'Copied ✓' : 'Copy the text Flightdroid read'}
    </button>
  );
}
