import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Airport } from '../lib/airports';
import { flightCode, type FlightInfo } from '../lib/flights';
import { greatCircle, unwrapPath, wrapLon, type LatLon } from '../lib/geo';
import { formatDate } from '../lib/time';
import type { Flight, Settings } from '../lib/types';
import { formatDistance } from './format';
import { Icon } from './icons';

interface Props {
  infos: FlightInfo[];
  units: Settings['units'];
  onSelect: (f: Flight) => void;
  emptyAction: (action: 'settings' | 'demo') => void;
}

type Selection = { kind: 'route'; title: string; infos: FlightInfo[] } | { kind: 'airport'; airport: Airport; infos: FlightInfo[] };

const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
// Esri's gray canvas basemaps are free to use with attribution and need no API key.
const tileUrl = (dark: boolean) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? 'Dark' : 'Light'}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;

export function MapView({ infos, units, onSelect, emptyAction }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(undefined);
  const layer = useRef<L.LayerGroup>(undefined);
  const [selection, setSelection] = useState<Selection>();

  const mapped = useMemo(() => infos.filter((i) => i.from && i.to), [infos]);

  useEffect(() => {
    const m = L.map(el.current!, {
      zoomControl: false,
      worldCopyJump: false,
      minZoom: 1,
      maxBoundsViscosity: 1,
      // The world repeats horizontally and everything is drawn on the neighbouring copies too,
      // so trans-Pacific routes stay continuous; limit panning to those copies.
      maxBounds: [
        [-85, -540],
        [85, 540],
      ],
      renderer: L.canvas({ tolerance: 10 }),
    }).setView([25, -30], 2);
    const tiles = L.tileLayer(tileUrl(!!darkQuery?.matches), {
      maxZoom: 16,
      attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
    }).addTo(m);
    const onScheme = (e: MediaQueryListEvent) => tiles.setUrl(tileUrl(e.matches));
    darkQuery?.addEventListener('change', onScheme);
    // Don't zoom out past the point where the world is shorter than a tall phone screen.
    const fitMinZoom = () => m.setMinZoom(Math.max(1, Math.ceil(Math.log2(m.getSize().y / 256))));
    fitMinZoom();
    m.on('resize', fitMinZoom);
    m.on('click', () => setSelection(undefined));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      darkQuery?.removeEventListener('change', onScheme);
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current!;
    const group = layer.current!;
    group.clearLayers();
    setSelection(undefined);
    if (!mapped.length) return;

    const styles = getComputedStyle(document.documentElement);
    const pastColor = styles.getPropertyValue('--arc-past').trim() || '#7aa7ff';
    const futureColor = styles.getPropertyValue('--arc-future').trim() || '#ffb547';

    // One arc per route (either direction), thicker the more it was flown.
    const routes = new Map<string, FlightInfo[]>();
    const airports = new Map<string, { airport: Airport; infos: FlightInfo[] }>();
    for (const info of mapped) {
      const key = [info.from!.iata, info.to!.iata].sort().join('-');
      routes.set(key, [...(routes.get(key) ?? []), info]);
      for (const a of [info.from!, info.to!]) {
        const entry = airports.get(a.iata) ?? { airport: a, infos: [] };
        entry.infos.push(info);
        airports.set(a.iata, entry);
      }
    }

    // Lay everything out around the most-visited airport so the map opens on "home".
    const home = [...airports.values()].sort((a, b) => b.infos.length - a.infos.length)[0].airport;
    const bounds = L.latLngBounds([]);
    const copies = [-360, 0, 360];
    const shift = (pts: LatLon[], by: number): LatLon[] => pts.map(([lat, lon]) => [lat, lon + by]);

    for (const [key, list] of routes) {
      const { from, to } = list[0];
      const upcomingOnly = list.every((i) => !i.past);
      let path = unwrapPath(greatCircle([from!.lat, from!.lon], [to!.lat, to!.lon]));
      const mid = path[path.length >> 1][1];
      path = shift(path, wrapLon(mid, home.lon) - mid);
      path.forEach((p) => bounds.extend(p));
      const weight = Math.min(2 + Math.sqrt(list.length) * 1.1, 6);
      for (const by of copies) {
        const line = L.polyline(shift(path, by), {
          color: upcomingOnly ? futureColor : pastColor,
          weight,
          opacity: 0.85,
          dashArray: upcomingOnly ? '6 8' : undefined,
          lineCap: 'round',
        });
        line.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelection({ kind: 'route', title: key.replace('-', ' ⇄ '), infos: list });
        });
        group.addLayer(line);
      }
    }
    for (const { airport, infos: visits } of airports.values()) {
      const lon = wrapLon(airport.lon, home.lon);
      for (const by of copies) {
        const marker = L.circleMarker([airport.lat, lon + by], {
          radius: Math.min(3 + Math.sqrt(visits.length) * 1.4, 10),
          color: '#fff',
          weight: 1.5,
          fillColor: pastColor,
          fillOpacity: 1,
        });
        marker.bindTooltip(airport.iata, { direction: 'top', offset: [0, -6], className: 'airport-label', permanent: visits.length >= 4 });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelection({ kind: 'airport', airport, infos: visits });
        });
        group.addLayer(marker);
      }
    }
    m.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
    // Too spread out to fit on a phone: centre on home rather than mid-ocean.
    if (m.getZoom() <= m.getMinZoom()) m.setView([home.lat, home.lon], m.getMinZoom());
  }, [mapped]);

  const totals = useMemo(() => {
    const km = infos.reduce((s, i) => s + i.km, 0);
    const codes = new Set(infos.flatMap((i) => [i.flight.from, i.flight.to]));
    const countries = new Set(infos.flatMap((i) => [i.from?.country, i.to?.country]).filter(Boolean));
    return { km, airports: codes.size, countries: countries.size };
  }, [infos]);

  return (
    <div class="map-view">
      <div ref={el} class="map" />
      {!infos.length && (
        <div class="map-empty card">
          <Icon name="plane" size={32} />
          <h2>No flights yet</h2>
          <p>Connect Gmail to find your flight confirmations, or explore with sample trips.</p>
          <div class="row">
            <button class="btn primary" onClick={() => emptyAction('settings')}>
              <Icon name="mail" size={18} /> Connect Gmail
            </button>
            <button class="btn" onClick={() => emptyAction('demo')}>
              Try demo
            </button>
          </div>
        </div>
      )}
      {infos.length > 0 && !selection && (
        <div class="map-summary card">
          <div>
            <strong>{infos.length}</strong>
            <span>flights</span>
          </div>
          <div>
            <strong>{formatDistance(totals.km, units).split(' ')[0]}</strong>
            <span>{units}</span>
          </div>
          <div>
            <strong>{totals.airports}</strong>
            <span>airports</span>
          </div>
          <div>
            <strong>{totals.countries}</strong>
            <span>countries</span>
          </div>
        </div>
      )}
      {selection && (
        <div class="map-selection card">
          <header>
            <div>
              <h3>{selection.kind === 'route' ? selection.title : `${selection.airport.iata} · ${selection.airport.city || selection.airport.name}`}</h3>
              <p class="muted">
                {selection.kind === 'airport' ? `${selection.airport.name} · ` : ''}
                {selection.infos.length} flight{selection.infos.length === 1 ? '' : 's'}
              </p>
            </div>
            <button class="icon-btn" aria-label="Close" onClick={() => setSelection(undefined)}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <ul>
            {[...selection.infos].reverse().map((i) => (
              <li key={i.flight.id}>
                <button onClick={() => onSelect(i.flight)}>
                  <span class="route-code">
                    {i.flight.from} → {i.flight.to}
                  </span>
                  <span class="muted">{flightCode(i.flight)}</span>
                  <span class="muted right">{formatDate(i.flight.departure, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
