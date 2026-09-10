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

for (const width of [320, 390]) {
  test(`Android download stays reachable during onboarding and on Now at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(appUrl('/'));
    await expect(page).toHaveURL(/\/welcome$/);
    const download = page.getByRole('link', { name: 'Download Android app', exact: true });
    await expect(download).toBeInViewport();
    await expect(download).toHaveAttribute(
      'href',
      'https://github.com/hanthor/indiafoss-companion/releases/download/nightly/indiafoss-companion-nightly.apk',
    );
    await page.goto(appUrl('/now'));
    await expect(download).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
