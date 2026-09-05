import { expect, type Page } from '@playwright/test';

/**
 * Wait until an activity preference has actually reached IndexedDB.
 *
 * The preference buttons — bookmark, must-attend — mark themselves pressed
 * immediately and write in the background. `page.goto` tears the page down, so
 * navigating on the next line can lose the write, and the rest of the test then
 * runs against state the app never stored.
 *
 * It fails in a way that looks like anything but a lost write: the day
 * simulator armed no reminders and fired nothing (#159), and the revision test
 * found a must-attend mark missing after an update and read it as data loss
 * across the revision. Both were the click, not the feature.
 *
 * A real attendee does not navigate five milliseconds after tapping, so this is
 * a test-harness problem rather than a bug — but it is worth one wait to stop
 * it being rediscovered as three different bugs.
 */
export async function preferenceSaved(page: Page, activityId: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const open = indexedDB.open('indiafoss-companion');
          const db: IDBDatabase = await new Promise((res, rej) => {
            open.onsuccess = () => res(open.result);
            open.onerror = () => rej(new Error('open failed'));
          });
          if (!db.objectStoreNames.contains('preferences')) return false;
          const rows: { activityId: string }[] = await new Promise((res) => {
            const req = db
              .transaction('preferences', 'readonly')
              .objectStore('preferences')
              .getAll();
            req.onsuccess = () => res(req.result as { activityId: string }[]);
            req.onerror = () => res([]);
          });
          return rows.some((r) => r.activityId === id);
        }, activityId),
      { timeout: 10_000 },
    )
    .toBe(true);
}
