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
    const result = explainEmail(email({ text: 'Your e-ticket is attached. Have a nice trip!', attachments: ['ETKT_0471234567890.pdf'] }));
    expect(result.flights).toEqual([]);
    expect(result.reason).toMatch(/No flight numbers or dates or airport codes/);
    expect(result.reason).toMatch(/PDF attachment \(ETKT_0471234567890\.pdf\)/);
    expect(explainEmail(email({ html: fixture('united-jsonld.html') })).method).toBe('markup');
  });
});
