import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

for (const result of ['denied', 'default', 'granted', 'unsupported', 'error'] as const) {
  test(`reminder setup reports ${result} honestly and survives reload`, async ({ page }) => {
    await page.addInitScript((result) => {
      if (result === 'unsupported') {
        Object.defineProperty(window, 'Notification', { value: undefined, configurable: true });
        return;
      }
      class TestNotification {
        static permission = 'default';
        static async requestPermission() {
          if (result === 'error') throw new Error('Permission request failed');
          TestNotification.permission = result;
          return result;
        }
        close() {}
      }
      Object.defineProperty(window, 'Notification', {
        value: TestNotification,
        configurable: true,
      });
    }, result);
    await page.goto(appUrl('/welcome?setup=done'));
    await expect(page.getByRole('heading', { name: 'Choose how to get reminders' })).toBeVisible();
    const enable = page.getByRole('button', { name: 'Turn on reminders', exact: true });
    if (result === 'unsupported') {
      await expect(enable).toBeDisabled();
      await expect(
        page.getByText('This browser does not support these reminders.', { exact: false }),
      ).toBeVisible();
    } else {
      await enable.click();
      const message = {
        denied: 'Notifications are blocked.',
        default: 'Permission was not granted.',
        granted: 'Permission granted.',
        error: 'Reminders could not be enabled or saved.',
      }[result];
      await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
    }
    await expect(
      page.getByText('Browser reminders need this app open and active.', { exact: false }),
    ).toBeVisible();
    if (result === 'granted') {
      await page.getByRole('button', { name: 'Send a test reminder' }).click();
      await expect(page.getByText('Test sent to your browser.', { exact: false })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Send a test reminder' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Not now', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Your ticket reference' })).toBeVisible();
    }
    // The fake browser resets permission on reload: even a stored opt-in must not
    // claim enabled when permission is no longer granted.
    await page.goto(appUrl('/settings?setup=done'));
    await expect(page.getByRole('switch', { name: 'Enable reminders' })).not.toBeChecked();
  });
}

test('granted reminders persist; turning them off persists too', async ({ page }) => {
  // Headless Chromium can report Notification.permission=denied even when
  // its Permissions API override says granted. Model the actual API we use.
  await page.addInitScript(() => {
    class GrantedNotification {
      static permission = 'granted';
      close() {}
    }
    Object.defineProperty(window, 'Notification', { value: GrantedNotification });
  });
  await page.goto(appUrl('/settings?setup=done'));
  const toggle = page.getByRole('switch', { name: 'Enable reminders' });
  await toggle.click();
  await expect(page.getByRole('status').filter({ hasText: 'Permission granted.' })).toBeVisible();
  await page.reload();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(page.getByRole('status').filter({ hasText: 'Reminders are off.' })).toBeVisible();
  await page.reload();
  await expect(toggle).not.toBeChecked();
});
