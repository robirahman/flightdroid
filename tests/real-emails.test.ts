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
