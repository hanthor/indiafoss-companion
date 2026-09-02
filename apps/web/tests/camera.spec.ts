import { expect, test } from '@playwright/test';
import { appUrl } from './app-url';

// A fake capture device stands in for the phone camera (top-level: launch args need their own worker).

// Chromium's fake capture device stands in for the phone camera.
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera'],
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
