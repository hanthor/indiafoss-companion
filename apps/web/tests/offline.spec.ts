import { expect, test } from '@playwright/test';

/**
 * Offline E2E gate (§52) — a release is not eligible if this fails:
 *   1. start with network → install/download event
 *   2. wait for offline-ready state
 *   3. disable all network
 *   4. hard reload
 *   5. browse schedule
 *   6. search
 *   7. open speaker/session
 *   8. modify Elo ranking
 *   9. regenerate itinerary
 *   10. open map + route between two rooms
 */
test('offline gate: full attendee flow with network disabled', async ({ page, context }) => {
  // 1. Online: download the event.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  // 2–3. Offline-ready: wait for the service worker to activate and control
  // the page, then confirm the bundle is in IndexedDB.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 10_000,
  });

  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('indiafoss-companion');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('events', 'readonly');
    const r = tx.objectStore('events').getAll();
    return new Promise<number>((resolve) => {
      r.onsuccess = () => resolve(r.result.length);
      r.onerror = () => resolve(0);
    });
  });
  expect(stored).toBeGreaterThan(0);

  // 4. Disable all network. The service worker serves the cached shell and
  // static assets while navigation requests remain offline (§52).
  await context.setOffline(true);

  // 5. Hard reload — served from the service worker cache.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  // 6. Browse schedule.
  await page.goto('/schedule');
  await expect(page.getByRole('tab', { name: /Day 1/ })).toBeVisible();
  await expect(page.getByText(/Registrations and Breakfast/).first()).toBeVisible();

  // 7. Search.
  await page.getByPlaceholder('Search talks, speakers, tags…').fill('AOSP');
  await expect(page.getByRole('article').first()).toBeVisible();

  // 8. Open a session detail.
  await page.goto('/activity/act-c8ak0iov2l');
  await expect(page.getByRole('heading', { name: /First Step into Open Source/ })).toBeVisible();

  // 9. Modify Elo ranking.
  await page.goto('/plan/rank');
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await page.getByRole('button', { name: 'Definitely A' }).first().click();
  await page.waitForTimeout(200);

  // 10. Regenerate the itinerary.
  await page.goto('/plan');
  await expect(page.locator('.itinerary li').first()).toBeVisible({ timeout: 10_000 });

  // 11. Map + route between two rooms.
  await page.goto('/map');
  await page.getByLabel('You are at').selectOption('audi-1');
  await page.getByLabel('Destination').selectOption('devroom-2');
  await expect(page.getByText(/min walk/)).toBeVisible();
  await expect(page.locator('.route')).toBeVisible();
});
