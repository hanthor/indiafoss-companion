import { expect, test, type Locator } from '@playwright/test';
import { appUrl } from './app-url.js';

/**
 * The Now grid: one lane per room, a full-weight card per talk, the room name
 * frozen and rotated in the left margin. Cards used to be scaled to the
 * talk's length, which gave a ten-minute lightning talk a sliver and painted
 * the next card over its title; these assertions are what stops that coming
 * back.
 */
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });

/** Mid-morning on day one, when every room is busy. */
const NOW = '/now?event=indiafoss-2026&setup=done&now=2026-09-26T11%3A30%3A00%2B05%3A30';

const firstLane = (page: import('@playwright/test').Page): Locator =>
  page.locator('[data-testid="now-grid"] .lane').first();

test('every card is readable and none is painted over another', async ({ page }) => {
  await page.goto(appUrl(NOW));
  const cards = page.locator('[data-testid="now-grid"] .card');
  await expect(cards.first()).toBeVisible();

  // Grouped by row from geometry alone, so this holds whatever the markup.
  const rows = await cards.evaluateAll((els) => {
    const byTop = new Map<number, { title: string; left: number; right: number }[]>();
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const top = Math.round(r.top);
      const row = byTop.get(top) ?? [];
      row.push({ title: el.getAttribute('aria-label') ?? '', left: r.left, right: r.right });
      byTop.set(top, row);
    }
    return [...byTop.values()].map((row) => row.sort((a, b) => a.left - b.left));
  });
  expect(rows.length).toBeGreaterThan(1);

  for (const row of rows) {
    for (const card of row) {
      // Wide enough for a title, whatever the talk's length.
      expect(card.right - card.left, card.title).toBeGreaterThanOrEqual(200);
    }
    for (let i = 1; i < row.length; i++) {
      // Never covering the card before it, which is what cut titles mid-word.
      expect(row[i]!.left, row[i]!.title).toBeGreaterThanOrEqual(row[i - 1]!.right - 1);
    }
  }
});

test('a lane opens on what is running in that room and scrolls to what is next', async ({
  page,
}) => {
  await page.goto(appUrl(NOW));
  const lane = firstLane(page);
  await expect(lane.locator('.card').first()).toContainText('Now ·');

  // Everything later is a scroll to the right, not a smaller card.
  const scrolled = await lane.evaluate((el) => {
    const before = el.scrollLeft;
    el.scrollLeft = el.scrollWidth;
    return { before, after: el.scrollLeft, scrollable: el.scrollWidth > el.clientWidth };
  });
  expect(scrolled.scrollable).toBe(true);
  expect(scrolled.after).toBeGreaterThan(scrolled.before);
});

test('the room name is rotated into the margin and stays put while the lane scrolls', async ({
  page,
}) => {
  await page.goto(appUrl(NOW));
  const head = page.locator('[data-testid="now-grid"] .rowhead').first();
  await expect(head).toBeVisible();

  const label = head.locator('span');
  await expect(label).toHaveCSS('writing-mode', 'vertical-rl');
  // Narrow enough that the talk, not the room, owns the width.
  expect((await head.boundingBox())!.width).toBeLessThan(40);

  const before = (await head.boundingBox())!.x;
  await firstLane(page).evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  expect((await head.boundingBox())!.x).toBeCloseTo(before, 0);

  // The lanes scroll inside themselves; the page never grows sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
