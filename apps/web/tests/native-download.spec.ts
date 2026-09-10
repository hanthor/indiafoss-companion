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
    await expect(section.getByRole('link', { name: 'Obtainium', exact: true })).toHaveAttribute(
      'href',
      'obtainium://add/https://github.com/hanthor/indiafoss-companion',
    );
    await expect(section).not.toContainText(/accrescent/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('the top bar carries no Android download link', async ({ page }) => {
  await page.goto(appUrl('/?setup=done'));
  const bar = page.getByRole('navigation', { name: 'App actions' });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('link', { name: /android/i })).toHaveCount(0);
  // The download still has a home; it is just not in the chrome on every page.
  await expect(page.getByRole('region', { name: 'Get the Android Companion' })).toBeVisible();
});
