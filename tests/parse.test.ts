import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EmailMessage } from '../src/lib/types';
import { parseEmail } from '../src/parse';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

function email(partial: Partial<EmailMessage>): EmailMessage {
  return { id: 'm1', subject: '', from: 'noreply@example.com', date: Date.UTC(2026, 0, 12), ...partial };
}

describe('JSON-LD', () => {
  const flights = parseEmail(email({ html: fixture('united-jsonld.html'), date: Date.UTC(2027, 0, 5) }));

  it('extracts every reservation', () => {
    expect(flights).toHaveLength(2);
  });

  it('keeps local wall times from offset timestamps', () => {
    expect(flights[0]).toMatchObject({
      airline: 'UA',
      flightNumber: '110',
      from: 'SFO',
      to: 'JFK',
      departure: '2027-03-04T20:15',
      arrival: '2027-03-05T04:30',
      confirmation: 'RXJ34P',
      passenger: 'Eva Green',
      confidence: 'high',
    });
  });

  it('splits combined flight numbers and converts UTC times to airport time', () => {
    expect(flights[1]).toMatchObject({
      airline: 'UA',
      flightNumber: '2263',
      from: 'JFK',
      to: 'SFO',
      // US daylight saving starts on March 14 in 2027, so New York is UTC-5 here.
      departure: '2027-03-10T10:00',
      arrival: '2027-03-10T13:40',
    });
  });

  it('flags cancellations inside @graph', () => {
    const [f] = parseEmail(email({ html: fixture('cancelled-jsonld.html') }));
    expect(f).toMatchObject({ airline: 'UA', flightNumber: '110', cancelled: true });
  });
});

describe('microdata', () => {
  it('reads nested itemscopes', () => {
    const flights = parseEmail(email({ html: fixture('delta-microdata.html') }));
    expect(flights).toEqual([
      expect.objectContaining({
        airline: 'DL',
        flightNumber: '1234',
        from: 'ATL',
        to: 'SEA',
        departure: '2026-11-20T07:05',
        arrival: '2026-11-20T09:40',
        confirmation: 'GXKZ7Q',
        confidence: 'high',
      }),
    ]);
  });
});

describe('heuristics', () => {
  it('parses table itineraries', () => {
    const flights = parseEmail(email({ html: fixture('table-itinerary.html'), subject: 'Your booking confirmation' }));
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'BA', flightNumber: '283', from: 'LHR', to: 'LAX', departure: '2026-02-14T15:40', arrival: '2026-02-14T18:55', confirmation: 'QZ8PLM', confidence: 'low' }),
      expect.objectContaining({ airline: 'BA', flightNumber: '282', from: 'LAX', to: 'LHR', departure: '2026-02-21T21:30', arrival: '2026-02-22T15:45' }),
    ]);
  });

  it('parses plain-text itineraries and infers the year', () => {
    const flights = parseEmail(
      email({ text: fixture('plain-itinerary.txt'), subject: 'Your Alaska Airlines trip confirmation', from: 'Alaska Airlines <info@ifly.alaskaair.com>', date: Date.UTC(2026, 3, 2) }),
    );
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'AS', flightNumber: '1170', from: 'SEA', to: 'ANC', departure: '2026-06-12T08:15', arrival: '2026-06-12T10:59', confirmation: 'HJ4K2L' }),
      expect.objectContaining({ airline: 'AS', flightNumber: '1171', from: 'ANC', to: 'SEA', departure: '2026-06-21T23:45', arrival: '2026-06-22T04:20' }),
    ]);
  });

  it('rolls dates without a year into the next year when needed', () => {
    const flights = parseEmail(email({ text: 'Confirmation\nFlight UA 15\nNewark (EWR) → Honolulu (HNL)\nJan 3\n9:00 AM - 3:10 PM', date: Date.UTC(2025, 11, 20) }));
    expect(flights[0]).toMatchObject({ departure: '2026-01-03T09:00', from: 'EWR', to: 'HNL' });
  });

  it('ignores marketing emails', () => {
    expect(parseEmail(email({ html: fixture('marketing.html'), subject: 'Fall fare sale' }))).toEqual([]);
  });

  it('does not mistake times for flight numbers', () => {
    const flights = parseEmail(email({ text: 'Booking confirmed\nDeparts 10:30 AM 12 Mar 2026\nUA 901 SFO to FRA', subject: 'Itinerary' }));
    expect(flights.map((f) => `${f.airline}${f.flightNumber}`)).toEqual(['UA901']);
  });
});
