import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test.use({ serviceWorkers: 'block' });
for (const accessibleRoute of [true, false]) {
  test(`saved accessible preference applies on map reload, route available: ${accessibleRoute}`, async ({
    page,
  }) => {
    await page.addInitScript(() => sessionStorage.setItem('selected-event', 'indiafoss-2025'));
    await page.route('**/venues/synthetic/venue.graph.json', async (route) => {
      const base = { from: 'gf-audi1', to: 'ff-devroom2', distanceMeters: 10, oneWay: false };
      await route.fulfill({
        json: {
          nodes: [
            { id: 'gf-audi1', floor: 'ground', x: 0, y: 0 },
            { id: 'ff-devroom2', floor: 'first', x: 0, y: 0 },
          ],
          edges: [
            { ...base, timeSeconds: 60, stairs: true, accessible: false, lift: false },
            ...(accessibleRoute
              ? [{ ...base, timeSeconds: 600, stairs: false, accessible: true, lift: true }]
              : []),
          ],
        },
      });
    });
    await page.goto(appUrl('/map?setup=done'));
    await page.getByRole('button', { name: /^Audi 1/ }).click();
    await page.getByRole('button', { name: "I'm here" }).click();
    await page.getByRole('button', { name: /^First/ }).click();
    await page.getByRole('button', { name: /^Devroom 2/ }).click();
    const journey = page.getByLabel('Walking route');
    await expect(journey).toContainText('1 min estimated walk · Fastest');
    await page.getByRole('button', { name: 'Show more', exact: true }).click();
    await page.getByLabel('Routing profile', { exact: true }).selectOption('accessible');
    await expect(journey).toContainText(
      accessibleRoute ? '10 min estimated walk · Accessible' : 'No accessible route is available',
    );
    await page.reload();
    await page.getByRole('button', { name: /^First/ }).click();
    await page.getByRole('button', { name: /^Devroom 2/ }).click();
    await expect(page.getByLabel('Routing profile', { exact: true })).toHaveValue('accessible');
    await expect(journey).toContainText(
      accessibleRoute ? '10 min estimated walk · Accessible' : 'No accessible route is available',
    );
  });
}
