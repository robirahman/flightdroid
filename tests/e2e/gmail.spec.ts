import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const pdf = readFileSync(join(fixtures, 'eticket.pdf'));
const avianca = readFileSync(join(fixtures, 'avianca-es.html'), 'utf8');

const messages: Record<string, unknown> = {
  g1: {
    id: 'g1',
    internalDate: String(Date.UTC(2023, 8, 29)),
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'Subject', value: 'Itinerary 642804' },
        { name: 'From', value: 'Globehunters <cs@globehunters.com>' },
      ],
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('Please find your e-ticket attached.') } },
        { mimeType: 'application/pdf', filename: 'E-ticket.pdf', body: { attachmentId: 'att1', size: pdf.length } },
      ],
    },
  },
  g2: {
    id: 'g2',
    internalDate: String(Date.UTC(2025, 0, 10)),
    payload: { mimeType: 'text/html', headers: [{ name: 'Subject', value: 'Confirmación de tu compra' }, { name: 'From', value: 'Avianca <noreply@avianca.com>' }], body: { data: b64url(avianca) } },
  },
};

test('syncs Gmail in the browser, reading a PDF e-ticket and a Spanish confirmation', async ({ page }) => {
  // Stand-ins for Google sign-in and the Gmail API.
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: 'fake', expires_in: 3600 })) }),
        revoke: () => {} } } };`,
    }),
  );
  await page.route('https://gmail.googleapis.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/attachments/att1')) return route.fulfill({ json: { data: pdf.toString('base64url'), size: pdf.length } });
    if (url.includes('/messages?')) return route.fulfill({ json: { messages: [{ id: 'g1' }, { id: 'g2' }] } });
    const id = url.match(/messages\/(g\d)/)![1];
    return route.fulfill({ json: messages[id] });
  });

  await page.goto('./#settings');
  await page.getByLabel('Client ID').fill('test-client.apps.googleusercontent.com');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Sync Gmail' }).click();
  await expect(page.getByText(/Found 4 new flights/)).toBeVisible({ timeout: 20000 });

  await page.getByRole('button', { name: 'Flights', exact: true }).click();
  const rows = page.locator('.flight-row');
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.list-view')).toContainText('BA 2662');
  await expect(page.locator('.list-view')).toContainText('AV 9532');
  await page.locator('.flight-row', { hasText: 'BA 2662' }).click();
  await expect(page.getByRole('dialog')).toContainText('PDF attachment E-ticket.pdf');

  // Reporting a misread flight: copy what the app read from its source email.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: /Copy the email text/ }).click();
  await expect(page.getByRole('button', { name: 'Copied ✓' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Itinerary 642804');
  expect(copied).toContain('--- E-ticket.pdf ---');
  expect(copied).toMatch(/BA 2662[^\n]*LGW[^\n]*RAK/);
});
