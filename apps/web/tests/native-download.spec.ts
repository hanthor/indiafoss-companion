import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test.use({ viewport: { width: 390, height: 844 } });
for (const route of ['/?setup=done', '/settings']) {
  test(`Android download is available on ${route}`, async ({ page }) => {
    await page.goto(appUrl(route));
    const section = page.getByRole('region', { name: 'Get the Android Companion' });
    await expect(section.getByRole('link', { name: 'Download Android APK' })).toHaveAttribute(
      'href',
      'https://github.com/hanthor/indiafoss-companion/releases/download/nightly/indiafoss-companion-nightly.apk',
    );
    await expect(
      section.getByRole('link', { name: 'Release notes and checksums' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/hanthor/indiafoss-companion/releases/tag/nightly',
    );
    await expect(section).toContainText('Browser and Android data are currently separate.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
