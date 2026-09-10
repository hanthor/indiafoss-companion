import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appUrl } from './app-url.js';

test.use({ serviceWorkers: 'block' });

async function seed(
  page: Page,
): Promise<{ eventId: string; activityId: string; proposalId?: string }> {
  await page.goto(appUrl('/settings?setup=done'));
  await expect(page.getByRole('button', { name: 'Download personal data' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        return new Promise<number>((resolve) => {
          const open = indexedDB.open('indiafoss-companion');
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('events')) {
              db.close();
              resolve(0);
              return;
            }
            const request = db.transaction('events').objectStore('events').count();
            request.onsuccess = () => {
              db.close();
              resolve(request.result);
            };
          };
        });
      }),
    )
    .toBeGreaterThan(0);
  return page.evaluate(
    async () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('indiafoss-companion');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction(
            ['events', 'preferences', 'notes', 'settings'],
            'readwrite',
          );
          let identity: { eventId: string; activityId: string; proposalId?: string };
          const events = transaction.objectStore('events').getAll();
          events.onsuccess = () => {
            const bundle = events.result[0].bundle;
            const activity = bundle.activities.find(
              (item: { proposalId?: string }) => item.proposalId,
            );
            identity = {
              eventId: bundle.id,
              activityId: activity.id,
              proposalId: activity.proposalId,
            };
            transaction.objectStore('preferences').put({
              activityId: activity.id,
              rating: 1337,
              comparisons: 3,
              disposition: 'must-attend',
              bookmarked: true,
              triage: 'yes',
            });
            transaction.objectStore('notes').put({
              activityId: activity.id,
              body: 'Ask about local AI\nಕನ್ನಡ',
              updatedAt: '2026-09-09T01:00:00.000Z',
            });
            transaction.objectStore('settings').put({
              key: 'attendee-profile',
              value: JSON.stringify({ fullName: 'Asha', email: 'asha@example.org', socials: {} }),
            });
            transaction.objectStore('settings').put({
              key: 'attendee-share-selection',
              value: JSON.stringify({ name: true, email: false, socials: {} }),
            });
            transaction
              .objectStore('settings')
              .put({ key: 'matrix-session', value: 'SECRET_SESSION' });
          };
          transaction.oncomplete = () => {
            db.close();
            resolve(identity);
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

test('downloads persisted personal choices and contact sharing selection offline after reload', async ({
  page,
  context,
}) => {
  const identity = await seed(page);
  await page.reload();
  await context.setOffline(true);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download personal data' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^indiafoss-personal-data-\d{4}-\d{2}-\d{2}\.json$/);
  const raw = await readFile((await download.path())!, 'utf8');
  const file = JSON.parse(raw);
  expect(file.format).toBe('indiafoss-personal-data');
  expect(file.events[0].activities).toContainEqual(identity);
  expect(file.events[0].sections.preferences[0]).toMatchObject({
    activityId: identity.activityId,
    disposition: 'must-attend',
    rating: 1337,
  });
  expect(file.events[0].sections.notes[0].body).toBe('Ask about local AI\nಕನ್ನಡ');
  expect(file.contact.selection.email).toBe(false);
  expect(raw).not.toContain('SECRET_SESSION');
  await expect(page.getByRole('status').filter({ hasText: 'Export prepared' })).toBeVisible();
  await expect(
    page.getByText('The native Android app cannot import it yet', { exact: false }),
  ).toBeVisible();
});

test('failed export leaves stored choices intact and allows retry', async ({ page }) => {
  const identity = await seed(page);
  async function profile(value: string): Promise<void> {
    await page.evaluate(
      (value) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('indiafoss-companion');
          open.onsuccess = () => {
            const db = open.result;
            const transaction = db.transaction('settings', 'readwrite');
            transaction.objectStore('settings').put({ key: 'attendee-profile', value });
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          };
        }),
      value,
    );
  }
  await profile('{');
  await page.getByRole('button', { name: 'Download personal data' }).click();
  await expect(page.getByRole('alert')).toContainText('Nothing was changed');
  await profile(JSON.stringify({ fullName: 'Asha', socials: {} }));
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download personal data' }).click();
  const file = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(file.events[0].sections.preferences[0].activityId).toBe(identity.activityId);
  await expect(page.getByRole('button', { name: 'Download personal data' })).toBeEnabled();
});
