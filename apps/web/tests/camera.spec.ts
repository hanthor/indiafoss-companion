import { expect, test } from '@playwright/test';
import { appUrl } from './app-url';

// A fake capture device stands in for the phone camera (top-level: launch args need their own worker).

// Chromium's fake capture device stands in for the phone camera.
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera'],
  viewport: { width: 390, height: 844 },
});

test('the preview and viewfinder show as soon as the camera starts', async ({ page }) => {
  await page.goto(appUrl('/scan'));
  await expect(page.getByRole('button', { name: 'Stop camera' })).toBeVisible({
    timeout: 10_000,
  });
  const video = page.locator('.viewfinder video');
  await expect(video).toBeVisible();
  const box = await video.boundingBox();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(200);
  await expect(page.getByText('Point at a QR code')).toBeVisible();
  // The manual entry stays folded while the camera works.
  await expect(page.locator('details.manualentry')).not.toHaveAttribute('open', '');
});

test('saved and updated scans open the exact contact, including after reload', async ({ page }) => {
  const payload =
    'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Scan followup\r\nEMAIL:followup@example.com\r\nEND:VCARD';
  let contactUrl = '';
  for (const outcome of ['Saved Scan followup', 'Updated Scan followup']) {
    await page.goto(appUrl(`/scan?payload=${encodeURIComponent(payload)}`));
    await expect(page.getByRole('link', { name: 'View contact', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save contact', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: outcome })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan another', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'View contact', exact: true }).click();
    await expect(page).toHaveURL(/\/connect\?contact=/);
    if (contactUrl) expect(page.url()).toBe(contactUrl);
    contactUrl = page.url();
    const row = page.getByRole('button', { name: /Scan followup/ });
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(row).toBeFocused();
    await expect(row).toBeInViewport();
    await page.reload();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(row).toBeInViewport();
  }
});

test('scan another restarts the camera without retaining the previous contact link', async ({
  page,
}) => {
  await page.goto(appUrl('/scan?payload=' + encodeURIComponent('@another:example.com')));
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('button', { name: 'Scan another', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop camera' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View contact', exact: true })).toHaveCount(0);
});
