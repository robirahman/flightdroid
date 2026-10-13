import { kmToMi } from '../lib/geo';
import type { Settings } from '../lib/types';

export function formatDistance(km: number, units: Settings['units']): string {
  const value = units === 'mi' ? kmToMi(km) : km;
  return `${Math.round(value).toLocaleString()} ${units}`;
}

export function compactNumber(n: number): string {
  return n >= 10000 ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n) : Math.round(n).toLocaleString();
}
