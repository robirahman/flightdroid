import { describe, expect, it } from 'vitest';
import { builtinQueries, syncQueries } from '../src/gmail/query';

describe('sync searches', () => {
  it('keeps each built-in Gmail query comfortably short', () => {
    const queries = builtinQueries();
    expect(queries.length).toBeGreaterThan(2);
    for (const q of queries) expect(encodeURIComponent(q).length).toBeLessThan(1500);
  });

  it('covers non-English subjects, agencies and airline senders', () => {
    const all = builtinQueries().join(' ');
    for (const term of ['vuelo', 'confirmación', 'prenotazione', 'cheapoair.com', 'avianca.com', 'aerolineas.com.ar', 'ba.com', 'category:reservations']) {
      expect(all).toContain(term);
    }
    expect(all).not.toContain('-category:promotions');
  });

  it('uses a custom query on its own', () => {
    expect(syncQueries('  from:me  ')).toEqual(['from:me']);
    expect(syncQueries('')).toEqual(builtinQueries());
  });
});
