import { airlineName } from '../data/airlines';
import { countryName } from '../lib/airports';
import type { FlightInfo } from '../lib/flights';
import { formatDuration, wallYear } from '../lib/time';
import type { Settings } from '../lib/types';
import { compactNumber, formatDistance } from './format';

const EARTH_KM = 40075;
const MOON_KM = 384400;

function top<T>(items: T[], key: (t: T) => string | undefined, n = 5): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function Bars({ title, rows, label }: { title: string; rows: [string, number][]; label?: (k: string) => string }) {
  if (!rows.length) return null;
  const max = rows[0][1];
  return (
    <section class="card bars">
      <h3>{title}</h3>
      {rows.map(([k, v]) => (
        <div class="bar-row" key={k}>
          <span class="bar-label">{label ? label(k) : k}</span>
          <span class="bar-track">
            <span class="bar-fill" style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span class="bar-value">{v}</span>
        </div>
      ))}
    </section>
  );
}

export function StatsView({ infos, units }: { infos: FlightInfo[]; units: Settings['units'] }) {
  if (!infos.length) return <div class="scroll"><p class="empty muted">Stats appear once you have flights.</p></div>;
  const km = infos.reduce((s, i) => s + i.km, 0);
  const minutes = infos.reduce((s, i) => s + i.minutes, 0);
  const airports = new Set(infos.flatMap((i) => [i.flight.from, i.flight.to]));
  const countries = new Set(infos.flatMap((i) => [i.from?.country, i.to?.country]).filter(Boolean));
  const airlines = new Set(infos.map((i) => i.flight.airline).filter(Boolean));
  const longest = infos.reduce((a, b) => (b.km > a.km ? b : a));
  const shortest = infos.filter((i) => i.km > 0).reduce((a, b) => (b.km < a.km ? b : a), longest);
  const years = top(infos, (i) => String(wallYear(i.flight.departure)), 50).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div class="stats-view scroll">
      <div class="tiles">
        <div class="tile">
          <strong>{infos.length}</strong>
          <span>flights</span>
        </div>
        <div class="tile">
          <strong>{compactNumber(units === 'mi' ? km * 0.621371 : km)}</strong>
          <span>{units} flown</span>
        </div>
        <div class="tile">
          <strong>{Math.round(minutes / 60).toLocaleString()}</strong>
          <span>hours aloft</span>
        </div>
        <div class="tile">
          <strong>{airports.size}</strong>
          <span>airports</span>
        </div>
        <div class="tile">
          <strong>{countries.size}</strong>
          <span>countries</span>
        </div>
        <div class="tile">
          <strong>{airlines.size}</strong>
          <span>airlines</span>
        </div>
      </div>

      <section class="card fun">
        <p>
          <strong>{(km / EARTH_KM).toFixed(1)}×</strong> around the Earth
        </p>
        <p>
          <strong>{((km / MOON_KM) * 100).toFixed(1)}%</strong> of the way to the Moon
        </p>
        <p>
          <strong>{(minutes / 60 / 24).toFixed(1)} days</strong> in the air
        </p>
      </section>

      <section class="card extremes">
        <div>
          <span class="muted">Longest</span>
          <strong>
            {longest.flight.from} → {longest.flight.to}
          </strong>
          <span class="muted">
            {formatDistance(longest.km, units)} · {formatDuration(longest.minutes)}
          </span>
        </div>
        <div>
          <span class="muted">Shortest</span>
          <strong>
            {shortest.flight.from} → {shortest.flight.to}
          </strong>
          <span class="muted">
            {formatDistance(shortest.km, units)} · {formatDuration(shortest.minutes)}
          </span>
        </div>
      </section>

      {years.length > 1 && <Bars title="Flights per year" rows={years} />}
      <Bars title="Top airports" rows={top(infos.flatMap((i) => [i.flight.from, i.flight.to]), (c) => c)} />
      <Bars title="Top routes" rows={top(infos, (i) => [i.flight.from, i.flight.to].sort().join(' ⇄ '))} />
      <Bars title="Top airlines" rows={top(infos, (i) => i.flight.airline || undefined)} label={(k) => airlineName(k) ?? k} />
      <Bars title="Countries" rows={top(infos.flatMap((i) => [i.from?.country, i.to?.country]), (c) => c, 8)} label={countryName} />
    </div>
  );
}
