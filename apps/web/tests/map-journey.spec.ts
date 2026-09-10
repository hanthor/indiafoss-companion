import { expect, test, type Page } from '@playwright/test';
import { appUrl } from './app-url.js';

/**
 * The From/To panel on the 2026 map (#223): an explicit starting point and a
 * highlighted destination, with the selects as the keyboard and large-text
 * equivalent of tapping the plan.
 */
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

const EVENT = 'event=indiafoss-2026&setup=done';
/** Before the first talk: nothing in the plan is near enough to be "next". */
const NO_PLAN = `/map?${EVENT}&now=2026-09-26T05:30:00%2B05:30`;
/** Just before the Welcome Note in Hall 1, which the default plan includes. */
const WITH_PLAN = `${EVENT}&now=2026-09-26T09:29:00%2B05:30`;

const from = (page: Page) => page.getByLabel('From', { exact: true });
const to = (page: Page) => page.getByLabel('To', { exact: true });

test('an attendee without a plan sets From and To directly, by keyboard', async ({ page }) => {
  await page.goto(appUrl(NO_PLAN));
  await expect(page.getByRole('region', { name: 'Journey' })).toBeVisible();
  await expect(to(page)).toHaveValue('');
  await expect(page.getByText('No upcoming talk in your plan')).toBeVisible();

  // Keyboard: open Hall 1 from its label, then press "I'm here".
  await page.getByRole('button', { name: /^Hall 1/ }).focus();
  await page.keyboard.press('Enter');
  const here = page.getByRole('button', { name: "I'm here", exact: true });
  await here.focus();
  await page.keyboard.press('Space');
  await expect(from(page)).toHaveValue('hall-1');
  await expect(page.getByText('MANUALLY SET')).toBeVisible();

  // The To select is the equivalent of tapping a room; it switches floors too.
  await to(page).selectOption('room-2');
  await expect(page.getByRole('button', { name: /^First/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // No walking estimate or route steps are offered on the map any more.
  const journey = page.getByRole('region', { name: 'Journey' });
  await expect(journey).not.toContainText('min walk');
  await expect(page.getByRole('button', { name: /route steps/ })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Route steps' })).toHaveCount(0);

  // "Go here" in a room sheet is the tap equivalent of the To select.
  await page.getByRole('button', { name: /^Room 3/ }).click();
  const sheet = page.getByRole('region', { name: 'Room details' });
  await expect(sheet).toContainText('Room 3');
  await sheet.getByRole('button', { name: 'Go here', exact: true }).click();
  await expect(to(page)).toHaveValue('room-3');
  await expect(sheet).toContainText('DESTINATION');
  await expect(sheet.getByRole('button', { name: 'Clear destination' })).toBeVisible();

  // Clear the manually set location: no estimate is invented without one.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(from(page)).toHaveValue('');
  await expect(page.getByText('MANUALLY SET')).toHaveCount(0);
});

test('To follows the next planned talk, then a map link, and the sheet keeps room and devroom together', async ({
  page,
}) => {
  await page.goto(appUrl(`/map?${WITH_PLAN}&at=hall-2`));
  await expect(to(page)).toHaveValue('plan');
  await expect(page.getByText('NEXT IN YOUR PLAN', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Journey' })).toContainText('Welcome Note');
  await expect(page.getByRole('region', { name: 'Journey' })).toContainText('leave by');
  await expect(page.locator('.roomlabel[data-planned-destination=true]')).toHaveCount(1);
  await expect(from(page)).toHaveValue('hall-2');

  // A /map/to/ link is an explicit destination and opens that room's sheet.
  await page.goto(appUrl(`/map/to/room-2?${WITH_PLAN}`));
  await expect(to(page)).toHaveValue('room-2');
  await expect(page.getByText('FROM LINK')).toBeVisible();
  const sheet = page.getByRole('region', { name: 'Room details' });
  await expect(sheet).toContainText('DESTINATION');
  await expect(sheet).not.toContainText('estimated walk');

  // A devroom in session: the physical room and the devroom name are both shown.
  await page.goto(appUrl(`/map?${EVENT}&now=2026-09-26T14:30:00%2B05:30`));
  await page.getByRole('button', { name: /^Ground/ }).click();
  await page.getByRole('button', { name: /^Hall 3/ }).click();
  await expect(sheet.getByRole('heading', { name: 'Hall 3' })).toBeVisible();
  await expect(sheet).toContainText('Devroom now: Compilers, Programming Languages and Systems');
  // The label wraps the long devroom name instead of cutting it short.
  await expect(page.locator('.roomlabel .talk.devroom')).toContainText(
    'Compilers, Programming Languages and Systems',
  );
});

test('large text keeps the journey controls reachable without horizontal overflow', async ({
  page,
}) => {
  await page.goto(appUrl(NO_PLAN));
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await from(page).selectOption('hall-1');
  await to(page).selectOption('room-2');
  await expect(page.getByRole('button', { name: /^First/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Every journey control stays inside the viewport: rows wrap, nothing is
  // clipped or pushed off the right edge. (The layout's app bar is outside
  // this component and is not asserted here.)
  const journey = page.getByRole('region', { name: 'Journey' });
  const width = page.viewportSize()!.width;
  for (const control of await journey.locator('select, button').all()) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  const overflow = await journey.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
});
