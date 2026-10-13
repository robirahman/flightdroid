import { flightCode, type FlightInfo } from '../lib/flights';
import { formatClock, formatDuration, wallYear } from '../lib/time';
import type { Flight, Settings } from '../lib/types';
import { formatDistance } from './format';
import { Icon } from './icons';

interface Props {
  infos: FlightInfo[];
  units: Settings['units'];
  onSelect: (f: Flight) => void;
  onAdd: () => void;
}

function monthDay(wall: string) {
  const [y, m, d] = wall.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    month: date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }),
    day: d,
    weekday: date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
  };
}

function FlightRow({ info, units, onSelect }: { info: FlightInfo; units: Settings['units']; onSelect: (f: Flight) => void }) {
  const { flight: f, from, to } = info;
  const md = monthDay(f.departure);
  const clock = formatClock(f.departure);
  return (
    <li>
      <button class={`flight-row${info.past ? '' : ' upcoming'}`} onClick={() => onSelect(f)}>
        <div class="date-badge">
          <span>{md.month}</span>
          <strong>{md.day}</strong>
          <span>{md.weekday}</span>
        </div>
        <div class="flight-main">
          <div class="route">
            <span>{f.from}</span>
            <Icon name="arrow" size={16} />
            <span>{f.to}</span>
            {f.confidence === 'low' && !f.edited && <span class="badge" title="Found by text matching — tap to check">check</span>}
          </div>
          <div class="muted cities">
            {from?.city || f.from} → {to?.city || f.to}
          </div>
        </div>
        <div class="flight-meta">
          <span class="code">{flightCode(f) || '—'}</span>
          <span class="muted">{clock || formatDistance(info.km, units)}</span>
          <span class="muted">{info.km ? `${info.scheduled ? '' : '~'}${formatDuration(info.minutes)}` : ''}</span>
        </div>
      </button>
    </li>
  );
}

export function ListView({ infos, units, onSelect, onAdd }: Props) {
  const upcoming = infos.filter((i) => !i.past);
  const past = infos.filter((i) => i.past).reverse();
  const years = new Map<number, FlightInfo[]>();
  for (const i of past) {
    const y = wallYear(i.flight.departure);
    years.set(y, [...(years.get(y) ?? []), i]);
  }

  return (
    <div class="list-view scroll">
      {!infos.length && <p class="empty muted">No flights to show. Sync Gmail from Settings or add one with +.</p>}
      {upcoming.length > 0 && (
        <section>
          <h2 class="section-title">Upcoming</h2>
          <ul class="flight-list">
            {upcoming.map((i) => (
              <FlightRow key={i.flight.id} info={i} units={units} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      )}
      {[...years].map(([year, list]) => (
        <section key={year}>
          <h2 class="section-title">
            {year} <span class="muted">· {list.length} flights</span>
          </h2>
          <ul class="flight-list">
            {list.map((i) => (
              <FlightRow key={i.flight.id} info={i} units={units} onSelect={onSelect} />
            ))}
          </ul>
        </section>
      ))}
      <button class="fab" aria-label="Add flight" onClick={onAdd}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}
