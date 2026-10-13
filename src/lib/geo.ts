const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export type LatLon = [number, number];

export function distanceKm([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const kmToMi = (km: number) => km * 0.621371;

/** Points along the great circle from a to b (inclusive), interpolated with slerp. */
export function greatCircle(a: LatLon, b: LatLon, segments = 64): LatLon[] {
  const [φ1, λ1, φ2, λ2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
  const d = distanceKm(a, b) / R_KM;
  if (d < 1e-9) return [a, b];
  const points: LatLon[] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    points.push([deg(Math.atan2(z, Math.hypot(x, y))), deg(Math.atan2(y, x))]);
  }
  return points;
}

/** Shifts a longitude by whole turns so it lies within 180° of `center`. */
export function wrapLon(lon: number, center: number): number {
  return lon - 360 * Math.round((lon - center) / 360);
}

/**
 * Makes a path's longitudes continuous (no ±180° jumps), so a trans-Pacific arc can be drawn
 * as one line on a map that repeats the world horizontally.
 */
export function unwrapPath(points: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  for (const [lat, lon] of points) out.push([lat, out.length ? wrapLon(lon, out[out.length - 1][1]) : lon]);
  return out;
}

/** Rough block time for a flight of this length: cruise at ~800 km/h plus 30 minutes of taxi/climb. */
export function estimateMinutes(km: number): number {
  return Math.round((km / 800) * 60 + 30);
}
