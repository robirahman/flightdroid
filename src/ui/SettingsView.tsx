import { useEffect, useState } from 'preact/hooks';
import type { SyncProgress } from '../gmail/sync';
import { DEFAULT_QUERY, type SyncState } from '../lib/store';
import type { Settings } from '../lib/types';
import { Icon } from './icons';

interface Props {
  settings: Settings;
  flightCount: number;
  syncState: Pick<SyncState, 'lastSync' | 'lastAttempt'>;
  progress?: SyncProgress;
  syncing: boolean;
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
            <span>Only emails matching this query are read</span>
            <textarea rows={4} value={query} spellcheck={false} onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>
          <button class="btn small" onClick={() => setQuery(DEFAULT_QUERY)}>
            Reset query
          </button>
        </details>
        {dirty && (
          <button class="btn primary wide" onClick={() => p.onSettings({ ...p.settings, clientId: clientId.trim(), query: query.trim() || DEFAULT_QUERY })}>
            Save
          </button>
        )}
      </section>

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
