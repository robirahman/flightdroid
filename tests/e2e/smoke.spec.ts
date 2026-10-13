import { expect, test } from '@playwright/test';

test('demo flights show on the map, list, stats and detail sheet', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('No flights yet')).toBeVisible();
  await page.getByRole('button', { name: 'Try demo' }).click();

  const summary = page.locator('.map-summary');
  await expect(summary).toContainText('flights');
  await expect(page.locator('.leaflet-overlay-pane canvas')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/map.png' });

  await page.getByRole('button', { name: 'Flights' }).click();
  await expect(page.getByText('Upcoming')).toBeVisible();
  await page.screenshot({ path: 'test-results/list.png' });

  await page.locator('.flight-row').first().click();
  await expect(page.getByRole('dialog')).toContainText('Departs');
  await page.waitForTimeout(400); // let the slide-in finish
  await page.screenshot({ path: 'test-results/sheet.png' });
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: '2024' }).click();
  await expect(page.locator('.section-title')).toHaveCount(1);

  await page.getByRole('button', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Stats' }).click();
  await expect(page.getByText('around the Earth')).toBeVisible();
  await page.screenshot({ path: 'test-results/stats.png', fullPage: true });

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Sync Gmail' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/settings.png' });

  // Flights persist across reloads.
  await page.reload();
  await expect(page.getByText('flights saved')).toContainText('31 flights');
});

test('manual flights can be added', async ({ page }) => {
  await page.goto('./#list');
  await page.getByRole('button', { name: 'Add flight' }).click();
  await page.getByLabel('From').fill('sfo');
  await page.getByLabel('To').fill('lhr');
  await page.getByLabel('Flight number').fill('ba 286');
  await page.getByLabel('Departure date').fill('2025-06-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.flight-row')).toContainText('BA 286');
});
