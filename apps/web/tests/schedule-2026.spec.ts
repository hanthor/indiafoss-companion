import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test('room chips narrow the agenda; the Rooms view shows every room with venue-local hours', async ({
  page,
}) => {
  await page.goto(appUrl('/schedule?event=indiafoss-2026&setup=done'));
  // Room chips live under Filters, keeping the agenda's header short.
  await page.getByText('Filters', { exact: true }).click();
  const rooms = page.getByRole('group', { name: 'Filter by room' });
  await rooms.getByRole('button', { name: 'Room 2', exact: true }).click();
  await expect(rooms.getByRole('button', { name: 'Room 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const cards = page.getByRole('article');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) await expect(card).toContainText('Room 2');
  // The Rooms view draws every room as a column, so it keeps its header
  // short: no room chips or search, and a room picked in the agenda does not
  // hide the others there.
  await page
    .getByRole('navigation', { name: 'Schedule view' })
    .getByRole('link', { name: 'Rooms' })
    .click();
  await expect(page.getByRole('group', { name: 'Filter by room' })).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.locator('.colhead')).toHaveCount(6);
  await expect(page.locator('.tick').filter({ hasText: '11:00' })).toBeVisible();
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
  // With a plan, the agenda opens on it; Everything brings back the rest.
  const show = page.getByRole('group', { name: 'Show' });
  await expect(show.getByRole('button', { name: 'Your plan' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const cards = page.getByRole('article');
  for (const c of await cards.all()) await expect(c).toHaveClass(/planned/);
  const planned = await cards.count();
  await show.getByRole('button', { name: 'Everything' }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(planned);
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

test('the Schedule tab reopens the view used last, across a reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl('/now?event=indiafoss-2026&setup=done'));
  const tab = page.getByTestId('nav-tabbar').getByRole('link', { name: 'Schedule' });
  const views = page.getByRole('navigation', { name: 'Schedule view' });
  await views.getByRole('link', { name: 'Rooms' }).click();
  await expect(page.getByRole('region', { name: 'Schedule by room and time' })).toBeVisible();
  await page.getByTestId('nav-tabbar').getByRole('link', { name: 'Map' }).click();
  await tab.click();
  await expect(views.getByRole('link', { name: 'Rooms' })).toHaveAttribute('aria-current', 'page');
  await views.getByRole('link', { name: 'Agenda' }).click();
  // The view is remembered once the navigation lands, not on the click.
  await expect(views.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await page.getByTestId('nav-tabbar').getByRole('link', { name: 'Plan' }).click();
  await tab.click();
  await expect(views.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
});
