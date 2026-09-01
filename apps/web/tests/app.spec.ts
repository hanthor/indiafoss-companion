import { expect, test } from '@playwright/test';

/** A time-travelled instant when a session is happening (developer time, §13). */
const DURING = '2025-09-20T10:20:00+05:30';
const NOW_URL = `/now?event=indiafoss-2025&now=${encodeURIComponent(DURING)}`;

test.beforeEach(async ({ page }) => {
  // The event bundle is fetched from a static asset and cached in IndexedDB.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
});

test('home shows event facts', async ({ page }) => {
  await expect(page.getByText(/131 sessions/)).toBeVisible();
  await expect(page.getByText(/117 speakers/)).toBeVisible();
});

test('schedule lists sessions grouped by time', async ({ page }) => {
  await page.goto('/schedule');
  await expect(page.getByRole('tab', { name: /Day 1/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Day 2/ })).toBeVisible();
  // Day 1 has breakfast/registrations sessions.
  await expect(page.getByText(/Registrations and Breakfast/).first()).toBeVisible();
});

test('schedule search narrows results', async ({ page }) => {
  await page.goto('/schedule');
  await page.getByPlaceholder('Search talks, speakers, tags…').fill('AOSP');
  await expect(page.getByText(/1 session|sessions/).first()).toBeVisible();
  // Searching for AOSP should surface the AOSP devroom sessions.
  const results = page.getByRole('article');
  await expect(results.first()).toBeVisible();
});

test('activity detail shows speakers and toggles bookmark', async ({ page }) => {
  await page.goto('/activity/act-c8ak0iov2l');

  await expect(page.getByRole('heading', { name: /First Step into Open Source/ })).toBeVisible();
  const bookmark = page.getByRole('button', { name: /Bookmark/ });
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'false');
});

test('now screen uses developer time to show current session and next', async ({ page }) => {
  await page.goto(NOW_URL);
  await expect(page.getByText('Developer time:')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Happening now' })).toBeVisible();
  // The session running at 10:15–10:30 must appear in the NOW card.
  await expect(page.getByRole('link', { name: /First Step into Open Source/ })).toBeVisible();
  // A progress bar is rendered for each live session.
  await expect(page.getByRole('progressbar').first()).toBeVisible();
});

test('explore search responds and renders results', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByText('Type at least two characters to search.')).toBeVisible();
  await page.getByLabel('Search').fill('kernel');
  await expect(page.getByRole('status').first()).toContainText('result');
  // At least one result row appears.
  await expect(page.locator('.results li').first()).toBeVisible();
});

test('elo ranking compares two sessions and advances', async ({ page }) => {
  await page.goto('/plan/rank');
  // Two candidate cards appear.
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await expect(page.getByTestId('candidate-b')).toBeVisible();
  // Stability readout is shown.
  await expect(page.getByText(/% resolved/)).toBeVisible();

  // Answer a few comparisons; the arena should change or finish.
  for (let i = 0; i < 5; i++) {
    const done = await page
      .getByText('All caught up')
      .isVisible()
      .catch(() => false);
    if (done) break;
    await page.getByRole('button', { name: 'Definitely A' }).first().click();
    await page.waitForTimeout(150);
  }
  // Either more candidates or the done state must appear.
  const stillGoing = await page
    .getByTestId('candidate-a')
    .isVisible()
    .catch(() => false);
  const done = await page
    .getByText('All caught up')
    .isVisible()
    .catch(() => false);
  expect(stillGoing || done).toBe(true);
});

test('plan generates a feasible itinerary with backups', async ({ page }) => {
  await page.goto('/plan');
  // The solver runs for Day 1 and renders an ordered itinerary.
  await expect(page.locator('.itinerary li').first()).toBeVisible({ timeout: 10_000 });
  const count = await page.locator('.itinerary li').count();
  expect(count).toBeGreaterThan(3);
  // Some slots may show a backup suggestion.
  const hasBackups = await page.locator('.backups').count();
  expect(hasBackups).toBeGreaterThan(0);
});

test('map routes between two rooms offline-style', async ({ page }) => {
  await page.goto('/map');
  await expect(page.getByRole('status').or(page.getByText('Loading venue')).first())
    .toBeVisible({ timeout: 5000 })
    .catch(() => {});
  // Pick a source and destination.
  await page.getByLabel('You are at').selectOption('audi-1');
  await page.getByLabel('Destination').selectOption('devroom-2');
  // The route info appears with a walk duration and steps.
  await expect(page.getByText(/min walk/)).toBeVisible();
  await expect(page.locator('.steps li').first()).toBeVisible();
  // The highlighted route polyline is rendered.
  await expect(page.locator('.route')).toBeVisible();
});

test('now screen shows leave-by with a known location', async ({ page }) => {
  const DURING = '2025-09-20T10:20:00+05:30';
  await page.goto(`/now?now=${encodeURIComponent(DURING)}&at=audi-1`);
  // With a known location the NEXT card computes walking time + leave-by.
  await expect(page.getByText(/Estimated walk:/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Leave by/)).toBeVisible();
  // Show route links into the map with the destination preset.
  await page.getByRole('link', { name: 'Show route' }).click();
  await expect(page.getByLabel('Destination')).toHaveValue(/devroom|audi|room|workshops|bof/);
});
