import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';
import { settingSaved } from './preference-saved.js';

/**
 * The map no longer shows a walking route, but its routing-profile select is
 * still the only control for a preference the leave-by banner, the itinerary
 * solver and reminders all read (§26/§29), so the saved choice has to survive
 * a reload.
 */
test.use({ serviceWorkers: 'block' });

test('the routing profile chosen on the map is saved and reapplied after a reload', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('selected-event', 'indiafoss-2025'));
  await page.goto(appUrl('/map?setup=done'));

  const profile = page.getByLabel('Routing profile', { exact: true });
  await expect(profile).toBeEnabled();
  await expect(profile).toHaveValue('fastest');
  await profile.selectOption('accessible');
  await settingSaved(page, 'routing-profile', 'accessible');

  await page.reload();
  const reloaded = page.getByLabel('Routing profile', { exact: true });
  await expect(reloaded).toBeEnabled();
  await expect(reloaded).toHaveValue('accessible');
});
