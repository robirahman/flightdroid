import { createStore, get, set, del } from 'idb-keyval';
import type { Flight, Settings } from './types';

const db = createStore('flightdroid', 'kv');

export const DEFAULT_QUERY =
  '{subject:flight subject:itinerary subject:"boarding pass" subject:"e-ticket" subject:eticket subject:"trip confirmation" subject:"booking confirmation" subject:"reservation" subject:"your trip" subject:"check in" subject:"check-in"} -category:promotions -category:social';

export const DEFAULT_SETTINGS: Settings = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  query: DEFAULT_QUERY,
  units: 'km',
};

export interface SyncState {
  processedIds: string[];
  deletedKeys: string[];
  lastSync?: number;
}

export const loadFlights = async () => (await get<Flight[]>('flights', db)) ?? [];
export const saveFlights = (flights: Flight[]) => set('flights', flights, db);

export async function loadSettings(): Promise<Settings> {
  const saved = (await get<Partial<Settings>>('settings', db)) ?? {};
  return { ...DEFAULT_SETTINGS, ...saved, clientId: saved.clientId || DEFAULT_SETTINGS.clientId };
}
export const saveSettings = (settings: Settings) => set('settings', settings, db);

export const loadSyncState = async (): Promise<SyncState> =>
  (await get<SyncState>('sync', db)) ?? { processedIds: [], deletedKeys: [] };
export const saveSyncState = (state: SyncState) => set('sync', state, db);

export async function clearAll() {
  await Promise.all([del('flights', db), del('sync', db)]);
}
