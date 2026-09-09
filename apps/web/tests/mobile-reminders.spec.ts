import { expect, test } from '@playwright/test';
import { appUrl } from './app-url';

test('a mobile-style browser displays the test through its active service worker', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['notifications']);
  await page.addInitScript(() => {
    const Original = window.Notification;
    class MobileNotification {
      static get permission() {
        return Original.permission;
      }
      static requestPermission() {
        return Original.requestPermission();
      }
      constructor() {
        throw new TypeError('Use ServiceWorkerRegistration.showNotification on mobile');
      }
    }
    Object.defineProperty(window, 'Notification', {
      value: MobileNotification,
      configurable: true,
    });
  });
  await page.goto(appUrl('/settings?setup=done'));
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.getByRole('switch', { name: 'Enable reminders' }).click();
  await expect(page.getByRole('switch', { name: 'Enable reminders' })).toBeChecked();
  await page.getByRole('button', { name: 'Send a test reminder' }).click();
  await expect(page.getByText('Test sent to your browser.', { exact: false })).toBeVisible();
  const notification = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag: 'indiafoss-reminder-test' });
    const shown = notifications[0];
    const result = shown ? { title: shown.title, url: shown.data.url } : null;
    for (const item of notifications) item.close();
    return result;
  });
  expect(notification?.title).toBe('IndiaFOSS reminder test');
  expect(notification?.url).toBe(new URL(appUrl('/plan'), page.url()).href);
});
