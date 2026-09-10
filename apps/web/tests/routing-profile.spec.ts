import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';
import { settingSaved } from './preference-saved.js';

/**
 * The routing profile lives in Settings, next to the reminders it affects. It is
 * the only control for a preference the leave-by banner, the itinerary solver
 * and reminders all read (§26/§29), so the saved choice has to survive a reload,
 * and the accessible options have to stay reachable.
 */
test.use({ serviceWorkers: 'block' });

test('the routing profile is saved and reapplied after a reload', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('selected-event', 'indiafoss-2025'));
  await page.goto(appUrl('/settings?setup=done'));

  const profile = page.getByLabel('Routing profile', { exact: true });
  await expect(profile).toBeEnabled();
  await expect(profile).toHaveValue('fastest');
  // Removing these would quietly pin every walking estimate to 'fastest'.
  await expect(profile.getByRole('option')).toHaveText(['Fastest', 'Accessible', 'Avoid stairs']);
  await profile.selectOption('accessible');
  await settingSaved(page, 'routing-profile', 'accessible');

  await page.reload();
  const reloaded = page.getByLabel('Routing profile', { exact: true });
  await expect(reloaded).toBeEnabled();
  await expect(reloaded).toHaveValue('accessible');
});

test('the map carries no routing profile control', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('selected-event', 'indiafoss-2025'));
  await page.goto(appUrl('/map?setup=done'));
  await expect(page.getByLabel('Routing profile', { exact: true })).toHaveCount(0);
});
