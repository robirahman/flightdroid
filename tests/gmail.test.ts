import { describe, expect, it } from 'vitest';
import { decodeBase64Url, decodeMessage, type GmailMessage } from '../src/gmail/api';
import { parseEmail } from '../src/parse';

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('decodeMessage', () => {
  const html = '<script type="application/ld+json">{"@type":"FlightReservation","reservationFor":{"@type":"Flight","flightNumber":"LH455","departureAirport":{"iataCode":"SFO"},"arrivalAirport":{"iataCode":"FRA"},"departureTime":"2026-04-18T15:50:00-07:00"}}</script><p>Grüße</p>';
  const msg: GmailMessage = {
    id: 'abc',
    internalDate: '1767225600000',
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'Subject', value: 'Ihre Buchungsbestätigung' },
        { name: 'From', value: 'Lufthansa <noreply@lufthansa.com>' },
      ],
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }], body: { data: b64url('Grüße – LH 455') } },
            { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: { data: b64url(html) } },
          ],
        },
        { mimeType: 'application/pdf', body: { attachmentId: 'att1', size: 1000 } },
      ],
    },
  };

  it('walks nested MIME parts and decodes UTF-8 bodies', () => {
    const email = decodeMessage(msg);
    expect(email).toMatchObject({ id: 'abc', subject: 'Ihre Buchungsbestätigung', from: 'Lufthansa <noreply@lufthansa.com>', date: 1767225600000, text: 'Grüße – LH 455' });
    expect(email.html).toContain('Grüße');
    expect(email.attachments).toEqual(['application/pdf']);
  });

  it('feeds the parser', () => {
    expect(parseEmail(decodeMessage(msg))).toEqual([expect.objectContaining({ airline: 'LH', flightNumber: '455', from: 'SFO', to: 'FRA', departure: '2026-04-18T15:50' })]);
  });

  it('decodes base64url without padding', () => {
    expect(decodeBase64Url(b64url('a?b>c'))).toBe('a?b>c');
  });
});
