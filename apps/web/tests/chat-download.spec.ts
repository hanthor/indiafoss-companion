import { expect, test } from '@playwright/test';
import { appUrl } from './app-url';

for (const route of ['/connect', '/settings']) {
  test(`Chat download is discoverable at ${route} on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(appUrl(`${route}?setup=done`));
    const card = page.getByRole('region', { name: 'Get IndiaFOSS Chat' });
    await card.scrollIntoViewIfNeeded();
    await expect(card.getByRole('link', { name: 'Download Chat APK' })).toHaveAttribute(
      'href',
      'https://github.com/hanthor/indiafoss-chat-android/releases/download/nightly/indiafoss-chat-android.apk',
    );
    await expect(card.getByRole('link', { name: 'Release notes and checksums' })).toHaveAttribute(
      'href',
      'https://github.com/hanthor/indiafoss-chat-android/releases/tag/nightly',
    );
    await expect(card).toContainText('Android 7.0 or later');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
