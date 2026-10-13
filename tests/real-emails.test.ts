import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EmailMessage } from '../src/lib/types';
import { explainEmail, parseEmail } from '../src/parse';

/**
 * Emails users reported as misread, as the app's "Copy the text Flightdroid read" button gave
 * them, with names, account numbers and booking codes replaced.
 */
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('reported emails', () => {
  it('JetBlue, Spanish: codes on their own lines, flight number below them', () => {
    const email: EmailMessage = {
      id: 'r1',
      subject: 'Confirmación de reservación para ALEX TRAVELER - QWZXPL',
      from: 'JetBlue <jetblueairways@needtoknow.jetblue.com>',
      date: Date.UTC(2025, 11, 22),
      text: fixture('real-jetblue-es.txt'),
    };
    expect(explainEmail(email).reason).toBeUndefined();
    expect(parseEmail(email)).toEqual([
      expect.objectContaining({ airline: 'B6', flightNumber: '1532', from: 'CTG', to: 'JFK', departure: '2026-03-14T15:15', arrival: '2026-03-14T21:15', confirmation: 'QWZXPL' }),
    ]);
  });
});

describe('reported PDFs', () => {
  it('LATAM receipt PDF: airport names wrapped down table columns, "p. m." on the line below', async () => {
    const { explainText } = await import('../src/parse');
    const email: EmailMessage = { id: 'r2', subject: 'Ya compraste tu viaje a Santa Marta', from: 'LATAM Airlines <info@info.latam.com>', date: Date.UTC(2026, 0, 21) };
    const result = explainText(fixture('real-latam-es-pdf.txt'), email, 'Comprobante-LATAM.pdf');
    expect(result.reason).toBeUndefined();
    expect(result.flights).toEqual([
      expect.objectContaining({ airline: 'LA', flightNumber: '4154', from: 'BOG', to: 'SMR', departure: '2026-03-01T12:45', arrival: '2026-03-01T14:17' }),
    ]);
  });
});
