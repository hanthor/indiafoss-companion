import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test('2026 draft offers three local choices, persists them, and supports undo', async ({
  page,
}) => {
  await page.goto(appUrl('/plan/rank?setup=done'));
  await expect(page.getByRole('heading', { name: 'Find your talks' })).toBeVisible();
  await expect(page.getByText('Draft schedule · Times and sessions may change.')).toBeVisible();
  const card = page.getByTestId('talk-card');
  await expect(page.getByRole('button', { name: /^Must go:/ })).toHaveCSS(
    'background-color',
    'rgb(239, 196, 75)',
  );
  const title = await card.getAttribute('aria-label');
  await page.getByRole('button', { name: `Must go: ${title}`, exact: true }).click();
  await expect(card).not.toHaveAttribute('aria-label', title!);
  await page.reload();
  await expect(card).not.toHaveAttribute('aria-label', title!);
  await page.getByRole('button', { name: /Change answered/ }).click();
  const answered = page.locator('.quicklist li').filter({ hasText: title! });
  await expect(answered).toBeVisible();
  await answered.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /Change answered|Hide answered/ })).toHaveCount(0);
  const wantTitle = await card.getAttribute('aria-label');
  await page.getByRole('button', { name: `Want to go: ${wantTitle}`, exact: true }).click();
  await expect(card).not.toHaveAttribute('aria-label', wantTitle!);
  await expect(page.getByText(/More like your choices/)).toBeVisible();
  await page.getByRole('button', { name: /^Not interested:/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'choices saved' })).toBeVisible();
});

test('a named devroom can be reserved independently of its physical room', async ({ page }) => {
  await page.goto(appUrl('/plan/rank?mode=rooms&setup=done'));
  const room = page
    .getByTestId('room-row')
    .filter({ hasText: 'Documentation & Technical Writing' });
  await room.getByRole('button', { name: 'Stay for this devroom', exact: true }).click();
  await expect(
    room.getByRole('button', { name: 'Stay for this devroom', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    room.getByRole('button', { name: 'Stay for this devroom', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.goto(appUrl('/plan'));
  await expect(page.locator('.itinerary')).toContainText('Documentation');
});

test('the old programme is explicitly archived and the fresh default is 2026', async ({ page }) => {
  await page.goto(appUrl('/schedule?event=indiafoss-2025&setup=done'));
  await expect(
    page.getByText('Archived programme · This is not the current IndiaFOSS schedule.'),
  ).toBeVisible();
  await page.goto(appUrl('/schedule?event=indiafoss-2026&setup=done'));
  await expect(page.getByText('Draft schedule · Times and sessions may change.')).toBeVisible();
  await expect(
    page.getByText('Archived programme · This is not the current IndiaFOSS schedule.'),
  ).toHaveCount(0);
});

test('horizontal swipes save choices; vertical and cancelled gestures do not', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl('/plan/rank?setup=done'));
  const card = page.getByTestId('talk-card');
  await expect(card).toBeVisible();
  const title = await card.getAttribute('aria-label');
  async function gesture(dx: number, dy: number, cancel = false) {
    await card.dispatchEvent('pointerdown', {
      pointerId: 7,
      isPrimary: true,
      button: 0,
      clientX: 160,
      clientY: 460,
    });
    await card.dispatchEvent('pointermove', {
      pointerId: 7,
      isPrimary: true,
      clientX: 160 + dx,
      clientY: 460 + dy,
    });
    await card.dispatchEvent(cancel ? 'pointercancel' : 'pointerup', {
      pointerId: 7,
      isPrimary: true,
      clientX: 160 + dx,
      clientY: 460 + dy,
    });
  }
  // Synthetic events have no native capture; keep this case focused on cancellation/axis policy.
  await card.evaluate((el) => {
    el.setPointerCapture = () => {};
    el.hasPointerCapture = () => false;
  });
  await gesture(120, 200);
  await expect(card).toHaveAttribute('aria-label', title!);
  await gesture(120, 0, true);
  await expect(card).toHaveAttribute('aria-label', title!);
  await expect(page.getByText('0 choices saved', { exact: false })).toBeVisible();

  await card.evaluate((el) => {
    Reflect.deleteProperty(el, 'setPointerCapture');
    Reflect.deleteProperty(el, 'hasPointerCapture');
  });
  // Real pointer input exercises capture and the saving path.
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 120, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 255, box.y + 80, { steps: 12 });
  await page.mouse.up();
  await expect(card).not.toHaveAttribute('aria-label', title!);
  await page.getByRole('button', { name: 'Undo last choice', exact: true }).click();
  await expect(page.getByText('0 choices saved', { exact: false })).toBeVisible();
  const leftTitle = await card.getAttribute('aria-label');
  const leftBox = (await card.boundingBox())!;
  await page.mouse.move(leftBox.x + 250, leftBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + 100, leftBox.y + 80, { steps: 12 });
  await page.mouse.up();
  await expect(card).not.toHaveAttribute('aria-label', leftTitle!);
  await page.getByRole('button', { name: /Change answered/ }).click();
  await expect(page.locator('.quicklist li').filter({ hasText: leftTitle! })).toContainText('OUT');
});
