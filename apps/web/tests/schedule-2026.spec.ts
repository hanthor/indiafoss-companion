import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test('room selection applies to list and grid, with venue-local hour labels', async ({ page }) => {
  await page.goto(appUrl('/schedule?event=indiafoss-2026&setup=done'));
  const rooms = page.getByRole('group', { name: 'Filter by room' });
  await rooms.getByRole('button', { name: 'Room 2', exact: true }).click();
  await expect(rooms.getByRole('button', { name: 'Room 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const cards = page.getByRole('article');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) await expect(card).toContainText('Room 2');
  // The room filter carries across the switch to the Rooms view.
  await page
    .getByRole('navigation', { name: 'Schedule view' })
    .getByRole('link', { name: 'Rooms' })
    .click();
  await expect(page.locator('.colhead')).toHaveCount(1);
  await expect(page.locator('.colhead')).toHaveText('Room 2');
  await expect(page.locator('.tick').filter({ hasText: '11:00' })).toBeVisible();
  await rooms.getByRole('button', { name: 'All rooms' }).click();
  await expect(page.locator('.colhead')).toHaveCount(6);
});

test('generated plan is marked in the schedule after navigation and reload', async ({ page }) => {
  await page.goto(appUrl('/plan?event=indiafoss-2026&setup=done'));
  const link = page.locator('.itinerary li:not(.flex) a').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  // The Schedule tab opens on the timeline; the agenda is one view along.
  await page.getByRole('link', { name: 'Schedule', exact: true }).click();
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  const card = page.getByRole('article').filter({ has: page.locator(`a[href="${href}"]`) });
  await expect(card).toHaveClass(/planned/);
  await page.reload();
  await expect(card).toHaveClass(/planned/);
});

test('mobile room sheet reports the selected floor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl('/map?event=indiafoss-2026&setup=done'));
  await page.getByRole('button', { name: /^Hall 1/ }).click();
  await expect(page.getByRole('region', { name: 'Room details' })).toContainText('Ground floor');
  await page.getByRole('button', { name: /^First/ }).click();
  await page.getByRole('button', { name: /^Room 2/ }).click();
  await page.getByRole('button', { name: /^Ground/ }).click();
  await expect(page.getByRole('region', { name: 'Room details' })).toContainText('First floor');
});
