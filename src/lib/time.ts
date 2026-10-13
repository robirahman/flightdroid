/** Helpers for "wall time" strings: local times at an airport, "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */

const pad = (n: number) => String(n).padStart(2, '0');

/** Offset of `tz` from UTC in minutes at the given instant. */
function tzOffsetMinutes(tz: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((asUtc - Math.floor(instant / 60000) * 60000) / 60000);
}

/** Converts a wall time at `tz` to epoch ms. Without a tz (or a valid one) the time is treated as UTC. */
export function wallTimeToEpoch(wall: string, tz?: string): number {
  const [date, time = '12:00'] = wall.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  if (!tz) return naive;
  try {
    const offset = tzOffsetMinutes(tz, naive);
    const guess = naive - offset * 60000;
    // Re-check at the guessed instant in case a DST transition sits between the two.
    return naive - tzOffsetMinutes(tz, guess) * 60000;
  } catch {
    return naive;
  }
}

/** Formats an instant as wall time in `tz`. */
export function epochToWallTime(epoch: number, tz?: string): string {
  let ms = epoch;
  if (tz) {
    try {
      ms = epoch + tzOffsetMinutes(tz, epoch) * 60000;
    } catch {
      /* fall back to UTC */
    }
  }
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * Normalizes an ISO-ish datetime from email markup to local wall time at the airport.
 * Strings with an explicit offset are assumed to already be local (airlines put the
 * airport's offset there); strings in UTC ("Z") are converted with the airport's tz.
 */
export function isoToWallTime(iso: string, tz?: string): string | undefined {
  const s = iso.trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : epochToWallTime(t, tz);
  }
  const [, date, time, zone] = m;
  if (!time) return date;
  if (zone === 'Z' && tz) return epochToWallTime(Date.parse(`${date}T${time}:00Z`), tz);
  return `${date}T${time}`;
}

export const wallDate = (wall: string) => wall.slice(0, 10);
export const wallClock = (wall: string) => (wall.length > 10 ? wall.slice(11, 16) : '');
export const wallYear = (wall: string) => Number(wall.slice(0, 4));

export function formatDate(wall: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }): string {
  const [y, m, d] = wallDate(wall).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

export function formatClock(wall: string): string {
  const clock = wallClock(wall);
  if (!clock) return '';
  const [h, m] = clock.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${pad(m)}m` : `${m}m`;
}
