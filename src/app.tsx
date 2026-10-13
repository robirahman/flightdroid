import { useEffect, useMemo, useState } from 'preact/hooks';
import { getAccessToken, loadScript, signOut } from './gmail/auth';
import { syncGmail, type SyncProgress } from './gmail/sync';
import { demoFlights } from './lib/demo';
import { describe, flightKey, sortFlights } from './lib/flights';
import { clearAll, DEFAULT_SETTINGS, loadFlights, loadSettings, loadSyncState, saveFlights, saveSettings, saveSyncState, type SyncState } from './lib/store';
import { wallYear } from './lib/time';
import type { Flight, Settings } from './lib/types';
import { FlightSheet } from './ui/FlightSheet';
import { Icon, type IconName } from './ui/icons';
import { ListView } from './ui/ListView';
import { MapView } from './ui/MapView';
import { SettingsView } from './ui/SettingsView';
import { StatsView } from './ui/StatsView';

type Tab = 'map' | 'list' | 'stats' | 'settings';
const TABS: [Tab, IconName, string][] = [
  ['map', 'map', 'Map'],
  ['list', 'list', 'Flights'],
  ['stats', 'stats', 'Stats'],
  ['settings', 'settings', 'Settings'],
];

function initialTab(): Tab {
  const hash = location.hash.slice(1) as Tab;
  return TABS.some(([t]) => t === hash) ? hash : 'map';
}

export function App() {
  const [loaded, setLoaded] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [syncState, setSyncState] = useState<Pick<SyncState, 'lastSync' | 'lastAttempt'>>({});
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [year, setYear] = useState<number | 'all'>('all');
  const [sheet, setSheet] = useState<{ flight?: Flight } | undefined>();
  const [progress, setProgress] = useState<SyncProgress>();
  const [syncing, setSyncing] = useState(false);
  // Errors stay up until dismissed; other notices fade after a few seconds.
  const [toast, setToastState] = useState<{ text: string; error?: boolean }>();
  const setToast = (text: string | undefined, error = false) => setToastState(text ? { text, error } : undefined);

  useEffect(() => {
    Promise.all([loadFlights(), loadSettings(), loadSyncState()]).then(([f, s, sync]) => {
      setFlights(f);
      setSettings(s);
      setSyncState(sync);
      setLoaded(true);
    });
    const onHash = () => setTabState(initialTab());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (settings.clientId) loadScript().catch(() => {});
  }, [settings.clientId]);

  useEffect(() => {
    if (!toast || toast.error) return;
    const t = setTimeout(() => setToast(undefined), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, '', `#${t}`);
  };

  const update = (next: Flight[]) => {
    const sorted = sortFlights(next);
    setFlights(sorted);
    saveFlights(sorted);
  };

  const now = Date.now();
  const allInfos = useMemo(() => flights.map((f) => describe(f, now)), [flights]);
  const years = useMemo(() => [...new Set(flights.map((f) => wallYear(f.departure)))].sort((a, b) => b - a), [flights]);
  const infos = useMemo(() => (year === 'all' ? allInfos : allInfos.filter((i) => wallYear(i.flight.departure) === year)), [allInfos, year]);

  const sync = async (full: boolean) => {
    setSyncing(true);
    setProgress(undefined);
    try {
      // Request the token first so the consent popup opens directly from the tap.
      const token = await getAccessToken(settings.clientId);
      const before = flights.length;
      const result = await syncGmail({ token, query: settings.query, full, onProgress: setProgress, onFlights: setFlights });
      setFlights(result);
      const added = result.length - before;
      setToast(added > 0 ? `Found ${added} new flight${added === 1 ? '' : 's'}` : 'Sync complete — no new flights');
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSyncState(await loadSyncState());
      setSyncing(false);
    }
  };

  const saveFlight = (f: Flight) => {
    update(flights.some((x) => x.id === f.id) ? flights.map((x) => (x.id === f.id ? f : x)) : [...flights, f]);
    setSheet({ flight: f });
  };

  const deleteFlight = async (f: Flight) => {
    update(flights.filter((x) => x.id !== f.id));
    setSheet(undefined);
    if (f.source === 'gmail') {
      // Remember the deletion so the next sync doesn't bring it back.
      const state = await loadSyncState();
      await saveSyncState({ ...state, deletedKeys: [...new Set([...state.deletedKeys, flightKey(f)])] });
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'flightdroid', version: 1, flights }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flightdroid-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const incoming: Flight[] = (Array.isArray(data) ? data : data.flights).filter((f: Flight) => f && f.from && f.to && f.departure);
      const keys = new Set(flights.map(flightKey));
      const fresh = incoming.filter((f) => !keys.has(flightKey(f)));
      update([...flights, ...fresh]);
      setToast(`Imported ${fresh.length} flight${fresh.length === 1 ? '' : 's'}`);
    } catch {
      setToast('That file is not a Flightdroid export.', true);
    }
  };

  const loadDemo = () => {
    const demo = demoFlights();
    const keys = new Set(flights.map(flightKey));
    update([...flights, ...demo.filter((f) => !keys.has(flightKey(f)))]);
    setTab('map');
  };

  const changeSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  if (!loaded) return <div class="splash" />;

  return (
    <div class="app">
      {tab !== 'settings' && (
        <header class="topbar">
          <h1>
            <Icon name="plane" size={18} /> Flightdroid
          </h1>
          {years.length > 0 && (
            <nav class="chips" aria-label="Filter by year">
              {(['all', ...years] as const).map((y) => (
                <button key={y} class={`chip${year === y ? ' active' : ''}`} onClick={() => setYear(y)}>
                  {y === 'all' ? 'All' : y}
                </button>
              ))}
            </nav>
          )}
        </header>
      )}
      <main class={`content tab-${tab}`}>
        {tab === 'map' && (
          <MapView
            infos={infos}
            units={settings.units}
            onSelect={(flight) => setSheet({ flight })}
            emptyAction={(a) => (a === 'demo' ? loadDemo() : setTab('settings'))}
          />
        )}
        {tab === 'list' && <ListView infos={infos} units={settings.units} onSelect={(flight) => setSheet({ flight })} onAdd={() => setSheet({})} />}
        {tab === 'stats' && <StatsView infos={infos} units={settings.units} />}
        {tab === 'settings' && (
          <SettingsView
            settings={settings}
            flightCount={flights.length}
            syncState={syncState}
            progress={progress}
            syncing={syncing}
            onSettings={changeSettings}
            onSync={sync}
            onSignOut={() => {
              signOut();
              setToast('Signed out of Gmail');
            }}
            onDemo={loadDemo}
            onExport={exportJson}
            onImport={importJson}
            onClear={async () => {
              await clearAll();
              setFlights([]);
              setSyncState({});
              setProgress(undefined);
              setToast('All data deleted');
            }}
          />
        )}
      </main>
      <nav class="tabbar">
        {TABS.map(([t, icon, label]) => (
          <button key={t} class={tab === t ? 'active' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {sheet && <FlightSheet key={sheet.flight?.id ?? 'new'} flight={sheet.flight} units={settings.units} onClose={() => setSheet(undefined)} onSave={saveFlight} onDelete={deleteFlight} />}
      {toast && (
        <div class={`toast${toast.error ? ' error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          <button class="toast-close" aria-label="Dismiss" onClick={() => setToast(undefined)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
