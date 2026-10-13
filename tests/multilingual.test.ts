import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EmailMessage } from '../src/lib/types';
import { parseEmail } from '../src/parse';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const email = (partial: Partial<EmailMessage>): EmailMessage => ({ id: 'm', subject: '', from: 'x@example.com', date: Date.UTC(2025, 0, 10), ...partial });

describe('non-English and agency emails', () => {
  it('reads a Spanish Avianca confirmation with the flight number below the route', () => {
    const flights = parseEmail(email({ html: fixture('avianca-es.html'), subject: 'Confirmación de tu compra', from: 'Avianca <noreply@avianca.com>' }));
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'AV', flightNumber: '9532', from: 'BOG', to: 'SMR', departure: '2025-03-15T06:10', arrival: '2025-03-15T07:40', confirmation: 'KQ7ZTR' }),
      expect.objectContaining({ airline: 'AV', flightNumber: '9539', from: 'SMR', to: 'BOG', departure: '2025-03-23T18:25', arrival: '2025-03-23T19:55' }),
    ]);
  });

  it('reads an agency booking with accented airline names and US dates', () => {
    const flights = parseEmail(
      email({ html: fixture('cheapoair-aerolineas.html'), subject: 'CheapOair.com Booking Confirmation', from: 'CheapOair <reservations@cheapoair.com>', date: Date.UTC(2024, 1, 2) }),
    );
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'AR', flightNumber: '1672', from: 'AEP', to: 'BRC', departure: '2024-03-14T10:05', arrival: '2024-03-14T12:25', confirmation: 'ZPLMQA' }),
      expect.objectContaining({ airline: 'AR', flightNumber: '1675', from: 'BRC', to: 'AEP', departure: '2024-03-21T13:10', arrival: '2024-03-21T15:20' }),
    ]);
  });

  it('reads Italian month names and "Volo"', () => {
    const flights = parseEmail(email({ text: fixture('ita-it.txt'), subject: 'Conferma di prenotazione', from: 'ITA Airways <noreply@ita-airways.com>' }));
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'AZ', flightNumber: '2041', from: 'FCO', to: 'LIN', departure: '2025-05-12T07:00', arrival: '2025-05-12T08:10', confirmation: 'J8Q2WE' }),
    ]);
  });

  it('reads numeric dates day-first outside the US', () => {
    const [f] = parseEmail(email({ text: fixture('latam-ddmm.txt'), subject: 'Confirmación de reserva', from: 'LATAM <info@latam.com>' }));
    expect(f).toMatchObject({ airline: 'LA', flightNumber: '2213', from: 'LIM', to: 'CUZ', departure: '2025-04-03T05:30', confirmation: 'PQ4R7T' });
  });

  it('keeps numeric dates month-first for US senders', () => {
    const [f] = parseEmail(email({ text: 'Booking confirmation\nFlight UA 1001 Newark (EWR) - Denver (DEN)\nDate: 03/04/2025 Depart 9:00 AM', from: 'United <unitedairlines@united.com>' }));
    expect(f).toMatchObject({ departure: '2025-03-04T09:00' });
  });

  it('does not turn a train ticket into a flight', () => {
    expect(parseEmail(email({ text: fixture('italo-train.txt'), subject: 'Italo - Conferma di acquisto', from: 'Italo <noreply@italotreno.it>' }))).toEqual([]);
  });
});

describe('explainEmail', () => {
  it('says what was missing and points at PDF attachments', async () => {
    const { explainEmail } = await import('../src/parse');
    const result = explainEmail(email({ text: 'Your e-ticket is attached. Have a nice trip!', attachments: [{ name: 'ETKT_0471234567890.pdf', mimeType: 'application/pdf', id: 'a1' }] }));
    expect(result.flights).toEqual([]);
    expect(result.reason).toMatch(/No flight numbers or dates or airport codes/);
    expect(result.reason).toMatch(/PDF attachment \(ETKT_0471234567890\.pdf\)/);
    expect(explainEmail(email({ html: fixture('united-jsonld.html') })).method).toBe('markup');
  });
});

describe('airports given without parentheses or arrows', () => {
  it('reads codes that sit on their own lines (American Airlines style)', () => {
    const text = [
      'Your trip confirmation', 'Confirmation code: AOVBET', 'Fri, Jan 19, 2024', 'AA 997', 'MIA', '8:35 PM', 'Miami', 'EZE', '7:30 AM', 'Buenos Aires',
      'Sat, Jan 27, 2024', 'AA 900', 'EZE', '9:05 PM', 'Buenos Aires', 'MIA', '5:20 AM', 'Miami',
    ].join('\n');
    const flights = parseEmail(email({ text, subject: 'Your flight to Buenos Aires - AOVBET', from: 'American Airlines <no-reply@info.email.aa.com>', date: Date.UTC(2024, 0, 7) }));
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'AA', flightNumber: '997', from: 'MIA', to: 'EZE', departure: '2024-01-19T20:35', arrival: '2024-01-20T07:30', confirmation: 'AOVBET' }),
      expect.objectContaining({ airline: 'AA', flightNumber: '900', from: 'EZE', to: 'MIA', departure: '2024-01-27T21:05', arrival: '2024-01-28T05:20' }),
    ]);
  });

  it('keeps both legs of an open-jaw trip apart', () => {
    const text = [
      'Travel Reservation Center Trip ID # G34JKSHMX', 'Departing flight', 'JetBlue Flight 1559', 'Sat, Jan 20, 2024', 'New York (JFK) 7:15 AM', 'San Jose (SJO) 11:59 AM',
      'Return flight', 'JetBlue Flight 1860', 'Sun, Jan 28, 2024', 'Liberia (LIR) 1:20 PM', 'New York (JFK) 8:45 PM',
    ].join('\n');
    const flights = parseEmail(email({ text, subject: 'Travel Reservation Center Trip ID # G34JKSHMX', from: 'Chase travel <travel@chase.com>', date: Date.UTC(2024, 0, 14) }));
    expect(flights).toEqual([
      expect.objectContaining({ airline: 'B6', flightNumber: '1559', from: 'JFK', to: 'SJO', departure: '2024-01-20T07:15' }),
      expect.objectContaining({ airline: 'B6', flightNumber: '1860', from: 'LIR', to: 'JFK', departure: '2024-01-28T13:20' }),
    ]);
  });

  it('ignores capitalised words that happen to be airport codes', () => {
    const text = 'CONFIRMACION DE RESERVA\nVUELO DEL DIA\nSAN JOSE\nVuelo AV 631\n12 de mayo de 2025\nSan José (SJO) 10:00 → Bogotá (BOG) 13:10';
    const [f] = parseEmail(email({ text, from: 'Avianca <noreply@avianca.com>' }));
    expect(f).toMatchObject({ from: 'SJO', to: 'BOG', flightNumber: '631' });
  });

  it('falls back to airport names when an email gives no codes (British Airways style)', () => {
    const text = 'Your booking confirmation ZKGERR\nBA2662\nLondon Gatwick to Marrakech\nSat 12 Apr 2025\nDepart 08:15 Arrive 11:45';
    const [f] = parseEmail(email({ text, subject: 'Your booking confirmation ZKGERR', from: 'British Airways <BA@contact.ba.com>', date: Date.UTC(2025, 2, 1) }));
    expect(f).toMatchObject({ airline: 'BA', flightNumber: '2662', from: 'LGW', to: 'RAK', departure: '2025-04-12T08:15', arrival: '2025-04-12T11:45' });
  });

  it('reads compact ticket dates like 12OCT23', () => {
    const [f] = parseEmail(email({ text: 'E-TICKET\nBA 2662 12OCT23 LONDON GATWICK LGW MARRAKECH RAK 08:15 11:45', date: Date.UTC(2023, 8, 29) }));
    expect(f).toMatchObject({ flightNumber: '2662', from: 'LGW', to: 'RAK', departure: '2023-10-12T08:15', arrival: '2023-10-12T11:45' });
  });
});

it('reads a flight number at the start of a line after a line ending in a time', () => {
  const text = 'E-TICKET\nBA 2662 12OCT23 LGW RAK 08:15 11:45\nBA 2663 19OCT23 RAK LGW 12:45 16:20';
  expect(parseEmail(email({ text, date: Date.UTC(2023, 8, 29) })).map((f) => f.flightNumber)).toEqual(['2662', '2663']);
});

it('matches flights whose date and route are far from the flight number in a long email', () => {
  const filler = 'Información importante sobre equipaje y documentos de viaje. '.repeat(60);
  const text = `Reserva confirmada BWXA7Z\nBogotá (BOG) → Santa Marta (SMR)\nSábado, 7 de marzo de 2026 16:55\n${filler}\nDetalle de vuelos\nVuelo AV 9534`;
  const [f] = parseEmail(email({ text, subject: 'Booking confirmed BWXA7Z', from: 'avianca <noreply@avianca.com>', date: Date.UTC(2026, 0, 21) }));
  expect(text.length).toBeGreaterThan(3000);
  expect(f).toMatchObject({ airline: 'AV', flightNumber: '9534', from: 'BOG', to: 'SMR', departure: '2026-03-07T16:55' });
});
