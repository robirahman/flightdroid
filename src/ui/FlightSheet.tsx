import { useState } from 'preact/hooks';
import { airlineName } from '../data/airlines';
import { getAirport } from '../lib/airports';
import { describe, flightCode, newId } from '../lib/flights';
import { formatClock, formatDate, formatDuration } from '../lib/time';
import type { Flight, Settings } from '../lib/types';
import { splitFlightNumber } from '../parse/schema';
import { formatDistance } from './format';
import { Icon } from './icons';

interface Props {
  flight?: Flight;
  units: Settings['units'];
  onClose: () => void;
  onSave: (f: Flight) => void;
  onDelete: (f: Flight) => void;
}

export function FlightSheet({ flight, units, onClose, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState(!flight);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div class="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-handle" />
        {editing ? (
          <FlightForm
            flight={flight}
            onCancel={() => (flight ? setEditing(false) : onClose())}
            onSave={(f) => {
              onSave(f);
              if (flight) setEditing(false);
              else onClose();
            }}
          />
        ) : (
          <FlightDetails flight={flight!} units={units} onEdit={() => setEditing(true)} onDelete={() => onDelete(flight!)} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function FlightDetails({ flight: f, units, onEdit, onDelete, onClose }: { flight: Flight; units: Settings['units']; onEdit: () => void; onDelete: () => void; onClose: () => void }) {
  const info = describe(f);
  const name = f.airlineName || airlineName(f.airline);
  const rows: [string, string | undefined][] = [
    ['Airline', name ? `${name}${f.airline ? ` (${f.airline})` : ''}` : f.airline],
    ['Flight', flightCode(f)],
    ['Distance', info.km ? formatDistance(info.km, units) : undefined],
    ['Duration', info.km || info.scheduled ? `${info.scheduled ? '' : '~'}${formatDuration(info.minutes)}` : undefined],
    ['Confirmation', f.confirmation],
    ['Passenger', f.passenger],
    ['Found in', f.source === 'gmail' ? f.foundIn : undefined],
  ];
  return (
    <div class="details">
      <header class="sheet-header">
        <div>
          <p class="muted">{formatDate(f.departure)}</p>
          <h2 class="big-route">
            {f.from} <Icon name="plane" size={20} /> {f.to}
          </h2>
        </div>
        <button class="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </header>
      <div class="legs">
        <div>
          <span class="muted">Departs</span>
          <strong>{formatClock(f.departure) || '—'}</strong>
          <span>{info.from?.name ?? f.from}</span>
          <span class="muted">{info.from ? [info.from.city, info.from.country].filter(Boolean).join(', ') : ''}</span>
        </div>
        <div>
          <span class="muted">Arrives</span>
          <strong>{f.arrival ? formatClock(f.arrival) || '—' : '—'}</strong>
          <span>{info.to?.name ?? f.to}</span>
          <span class="muted">
            {info.to ? [info.to.city, info.to.country].filter(Boolean).join(', ') : ''}
            {f.arrival && f.arrival.slice(0, 10) !== f.departure.slice(0, 10) ? ` · ${formatDate(f.arrival, { month: 'short', day: 'numeric' })}` : ''}
          </span>
        </div>
      </div>
      <dl class="facts">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {f.confidence === 'low' && !f.edited && <p class="notice">Found by text matching rather than airline markup — please check the details.</p>}
      {f.source === 'gmail' && f.messageId && (
        <a class="source" href={`https://mail.google.com/mail/u/0/#all/${f.messageId}`} target="_blank" rel="noopener noreferrer">
          <Icon name="mail" size={16} />
          <span>{f.emailSubject || 'Open email'}</span>
          <Icon name="external" size={14} />
        </a>
      )}
      <div class="row actions">
        <button class="btn" onClick={onEdit}>
          <Icon name="edit" size={18} /> Edit
        </button>
        <button
          class="btn danger"
          onClick={() => {
            if (confirm('Delete this flight?')) onDelete();
          }}
        >
          <Icon name="trash" size={18} /> Delete
        </button>
      </div>
    </div>
  );
}

function AirportInput({ label, value, onInput }: { label: string; value: string; onInput: (v: string) => void }) {
  const airport = getAirport(value);
  return (
    <label class="field">
      <span>{label}</span>
      <input
        value={value}
        maxLength={3}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="SFO"
        required
        pattern="[A-Za-z]{3}"
        onInput={(e) => onInput(e.currentTarget.value.toUpperCase())}
      />
      <small class={airport || !value ? 'muted' : 'error'}>{airport ? `${airport.city || airport.name}` : value.length === 3 ? 'Unknown airport' : ' '}</small>
    </label>
  );
}

function FlightForm({ flight, onCancel, onSave }: { flight?: Flight; onCancel: () => void; onSave: (f: Flight) => void }) {
  const [form, setForm] = useState({
    code: flight ? flightCode(flight).replace(' ', '') : '',
    from: flight?.from ?? '',
    to: flight?.to ?? '',
    depDate: flight?.departure.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    depTime: flight?.departure.slice(11, 16) ?? '',
    arrDate: flight?.arrival?.slice(0, 10) ?? '',
    arrTime: flight?.arrival?.slice(11, 16) ?? '',
    confirmation: flight?.confirmation ?? '',
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = getAirport(form.from) && getAirport(form.to) && form.from !== form.to && form.depDate;

  const submit = (e: Event) => {
    e.preventDefault();
    if (!valid) return;
    const split = splitFlightNumber(form.code);
    const airline = split?.airline ?? (form.code.match(/^[A-Z0-9]{2}$/i) ? form.code.toUpperCase() : flight?.airline ?? '');
    const arrivalDate = form.arrDate || (form.arrTime ? form.depDate : '');
    onSave({
      ...(flight ?? { id: newId(), source: 'manual' as const }),
      airline,
      airlineName: airline === flight?.airline ? flight?.airlineName : airlineName(airline),
      flightNumber: split?.number ?? '',
      from: form.from,
      to: form.to,
      departure: form.depTime ? `${form.depDate}T${form.depTime}` : form.depDate,
      arrival: arrivalDate ? (form.arrTime ? `${arrivalDate}T${form.arrTime}` : arrivalDate) : undefined,
      confirmation: form.confirmation || undefined,
      confidence: 'high',
      edited: flight ? true : undefined,
    });
  };

  return (
    <form class="flight-form" onSubmit={submit}>
      <header class="sheet-header">
        <h2>{flight ? 'Edit flight' : 'Add flight'}</h2>
      </header>
      <div class="grid2">
        <AirportInput label="From" value={form.from} onInput={set('from')} />
        <AirportInput label="To" value={form.to} onInput={set('to')} />
      </div>
      <label class="field">
        <span>Flight number</span>
        <input value={form.code} placeholder="UA 110" autoCapitalize="characters" onInput={(e) => set('code')(e.currentTarget.value.toUpperCase())} />
      </label>
      <div class="grid2">
        <label class="field">
          <span>Departure date</span>
          <input type="date" required value={form.depDate} onInput={(e) => set('depDate')(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Local time</span>
          <input type="time" value={form.depTime} onInput={(e) => set('depTime')(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Arrival date</span>
          <input type="date" value={form.arrDate} onInput={(e) => set('arrDate')(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Local time</span>
          <input type="time" value={form.arrTime} onInput={(e) => set('arrTime')(e.currentTarget.value)} />
        </label>
      </div>
      <label class="field">
        <span>Confirmation code</span>
        <input value={form.confirmation} autoCapitalize="characters" onInput={(e) => set('confirmation')(e.currentTarget.value.toUpperCase())} />
      </label>
      <div class="row actions">
        <button type="button" class="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" class="btn primary" disabled={!valid}>
          Save
        </button>
      </div>
    </form>
  );
}
