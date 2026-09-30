import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test('choosing Kannada in Settings translates the menus and survives a reload', async ({
  page,
}) => {
  await page.goto(appUrl('/settings?event=indiafoss-2026&setup=done'));
  await page.getByRole('radio', { name: 'ಕನ್ನಡ' }).click();
  await expect(page.getByRole('radio', { name: 'ಕನ್ನಡ' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'ವೇಳಾಪಟ್ಟಿ' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
  await page.goto(appUrl('/schedule?event=indiafoss-2026&setup=done'));
  await expect(page.getByRole('link', { name: 'ಕಾರ್ಯಸೂಚಿ' })).toBeVisible();
  // Back to English, and the programme itself was never translated.
  await page.goto(appUrl('/settings?event=indiafoss-2026&setup=done'));
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(nav.getByRole('link', { name: 'Schedule' })).toBeVisible();
});
