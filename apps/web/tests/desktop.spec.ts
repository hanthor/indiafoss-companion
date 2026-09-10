import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { appUrl } from './app-url.js';

/**
 * Desktop layout (#205). From 1024px the bottom tab bar gives way to a side
 * rail, the schedule opens on the room grid with the rooms side by side, Now
 * and Plan use two columns, and the map's room sheet stands beside the floor
 * plan. Phones keep the tab bar and the list. Nothing scrolls sideways at
 * either size.
 */

const DESKTOP = { width: 1900, height: 1160 };
const LAPTOP = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };

/** A moment on day one with talks running, and the wizard already done. */
const Q = 'now=2026-09-26T10%3A20%3A00%2B05%3A30&at=audi-1&setup=done';

async function settle(page: Page, path: string): Promise<void> {
  await page.goto(appUrl(`${path}?${Q}`));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.document, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);
  expect(widths.body, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);
}

async function box(locator: import('@playwright/test').Locator) {
  const b = await locator.boundingBox();
  expect(b, 'element has a box').not.toBeNull();
  return b!;
}

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP });

  test('the side rail replaces the tab bar and the schedule shows rooms side by side', async ({
    page,
  }) => {
    await settle(page, '/schedule');
    const rail = page.getByTestId('nav-rail');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('nav-tabbar')).toBeHidden();
    // Only one primary navigation is in the accessibility tree.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(1);
    await expect(rail.getByRole('link')).toHaveCount(5);
    await expect(rail.getByRole('link', { name: 'Schedule' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    const railBox = await box(rail);
    expect(railBox.x).toBeLessThan(40);
    expect(railBox.width).toBeLessThan(320);
    expect(railBox.height).toBeGreaterThan(railBox.width);

    // The list stays the default (its cards are what search narrows); the
    // room grid, once chosen, shows at least two room columns side by side.
    await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Room grid' }).click();
    const grid = page.getByRole('region', { name: 'Schedule by room and time' });
    await expect(grid).toBeVisible();
    const headings = grid.getByRole('heading', { level: 3 });
    expect(await headings.count()).toBeGreaterThanOrEqual(2);
    const first = await box(headings.nth(0));
    const second = await box(headings.nth(1));
    expect(second.x).toBeGreaterThan(first.x + first.width - 1);
    expect(Math.abs(second.y - first.y)).toBeLessThan(2);
    await expectNoHorizontalScroll(page);
  });

  test('keyboard focus reaches the rail before the page content', async ({ page }) => {
    await settle(page, '/schedule');
    const order: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return 'none';
          if (el.closest('[data-testid="nav-rail"]')) return 'rail';
          if (el.closest('main')) return 'main';
          return 'header';
        }),
      );
    }
    const firstRail = order.indexOf('rail');
    const firstMain = order.indexOf('main');
    expect(firstRail, order.join(' → ')).toBeGreaterThanOrEqual(0);
    expect(firstMain === -1 || firstRail < firstMain, order.join(' → ')).toBe(true);
  });

  test('Now and Plan use two columns', async ({ page }) => {
    await settle(page, '/now');
    const plan = page.getByRole('region', { name: 'Your plan now' });
    const live = page.getByRole('region', { name: 'Happening now' });
    const planBox = await box(plan);
    const liveBox = await box(live);
    expect(liveBox.x).toBeGreaterThan(planBox.x + planBox.width - 1);
    await expectNoHorizontalScroll(page);

    await settle(page, '/plan');
    const must = page.getByRole('region', { name: /Must attend/ });
    const tools = page.getByRole('complementary', { name: 'Plan tools' });
    await expect(tools).toBeVisible();
    const mustBox = await box(must);
    const toolsBox = await box(tools);
    expect(toolsBox.x).toBeGreaterThan(mustBox.x + mustBox.width - 1);
    await expectNoHorizontalScroll(page);
  });

  test('the map keeps the room sheet beside the floor plan', async ({ page }) => {
    await settle(page, '/map');
    await page
      .getByRole('button', { name: /^Room 1/ })
      .first()
      .click();
    const sheet = page.getByRole('region', { name: 'Room details' });
    await expect(sheet).toBeVisible();
    const sheetBox = await box(sheet);
    const zoom = await box(page.getByRole('button', { name: 'Zoom in' }));
    // The sheet stands to the right of the plan's own controls, not over them,
    // and fits the viewport without pushing the map down.
    expect(sheetBox.x).toBeGreaterThan(zoom.x + zoom.width);
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(DESKTOP.height + 1);
    await expect(page.getByRole('button', { name: /Show (more|less)/ })).toBeHidden();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('laptop', () => {
  test.use({ viewport: LAPTOP });

  test('the rail and room grid appear from 1024px', async ({ page }) => {
    await settle(page, '/schedule');
    await expect(page.getByTestId('nav-rail')).toBeVisible();
    await expect(page.getByTestId('nav-tabbar')).toBeHidden();
    await page.getByRole('button', { name: 'Room grid' }).click();
    await expect(page.getByRole('region', { name: 'Schedule by room and time' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe('phone', () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test('the tab bar stays at the bottom and the schedule stays a list', async ({ page }) => {
    await settle(page, '/schedule');
    const tabbar = page.getByTestId('nav-tabbar');
    await expect(tabbar).toBeVisible();
    await expect(page.getByTestId('nav-rail')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(1);
    const tabBox = await box(tabbar);
    expect(tabBox.y + tabBox.height).toBeGreaterThan(PHONE.height - 2);
    expect(tabBox.width).toBeGreaterThan(PHONE.width - 2);
    await expect(page.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('region', { name: 'Schedule by room and time' })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    // The grid is still a tap away.
    await page.getByRole('button', { name: 'Room grid' }).click();
    await expect(page.getByRole('region', { name: 'Schedule by room and time' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test('search narrows the schedule list at a desktop width too', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await settle(page, '/schedule');
    await page.getByPlaceholder('Search sessions…').fill('AOSP');
    await expect(page.getByRole('article').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  for (const path of ['/now', '/plan', '/map']) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await settle(page, path);
      await expect(page.getByTestId('nav-tabbar')).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }
});
