import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test('2026 draft offers three local choices, persists them, and supports undo', async ({
  page,
}) => {
  await page.goto(appUrl('/plan/rank?setup=done'));
  await expect(page.getByRole('heading', { name: 'Find your talks' })).toBeVisible();
  await expect(page.getByText('Draft schedule · Times and sessions may change.')).toHaveCount(0);
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
  await expect(page.getByText(/More like your choices|Swipe right to want/)).toHaveCount(0);
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
  await expect(page.getByText('Draft schedule · Times and sessions may change.')).toHaveCount(0);
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

test('desktop discovery supports immediate keyboard choices and undo without hijacking controls', async ({
  page,
}) => {
  await page.goto(appUrl('/plan/rank?setup=done'));
  const card = page.getByTestId('talk-card');
  await expect(card).toBeVisible();
  await expect(page.locator('#discovery-keys')).toHaveClass('sr-only');
  const initialTitle = await card.getAttribute('aria-label');
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(card).not.toHaveAttribute('aria-label', initialTitle!);
  await expect(card).toBeFocused();
  await page.keyboard.press('z');
  await expect(page.getByText('0 choices saved', { exact: false })).toBeVisible();
  const firstTitle = await card.getAttribute('aria-label');
  await page.getByRole('button', { name: /^Must go:/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(card).toHaveAttribute('aria-label', firstTitle!);
  await card.focus();
  await page.keyboard.press('Control+ArrowRight');
  await card.dispatchEvent('keydown', { key: 'ArrowRight', repeat: true });
  await expect(card).toHaveAttribute('aria-label', firstTitle!);
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp']) {
    const title = await card.getAttribute('aria-label');
    await page.keyboard.press(key);
    await expect(card).not.toHaveAttribute('aria-label', title!);
    await expect(card).toBeFocused();
    await page.keyboard.press('z');
    await expect(page.getByText('0 choices saved', { exact: false })).toBeVisible();
    await expect(card).toBeFocused();
  }
});

for (const direction of ['right', 'left'] as const) {
  test(`touch swipes ${direction} on an expanded abstract save a choice`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto(appUrl('/plan/rank?setup=done'));
      const card = page.getByTestId('talk-card');
      await card.getByRole('button', { name: /Read more/ }).tap();
      const abstract = card.locator('.abstract.open p');
      await abstract.scrollIntoViewIfNeeded();
      const title = await card.getAttribute('aria-label');
      const box = (await abstract.boundingBox())!;
      const y = Math.max(180, Math.min(550, box.y + 30));
      const startX = direction === 'right' ? 90 : 280;
      const delta = direction === 'right' ? 15 : -15;
      // Browser-generated touch input exercises implicit capture on the text
      // and its transfer to the card; synthetic pointer events do not.
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: startX, y }],
      });
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: startX + step * delta, y }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(card).not.toHaveAttribute('aria-label', title!);
      await expect(page.getByText('1 choices saved', { exact: false })).toBeVisible();
      await page.getByRole('button', { name: /Change answered/ }).click();
      await expect(page.locator('.quicklist li').filter({ hasText: title! })).toContainText(
        direction === 'right' ? 'IN' : 'OUT',
      );
      await page.getByRole('button', { name: 'Undo last choice', exact: true }).click();
      await expect(page.getByText('0 choices saved', { exact: false })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('expanded touch reading and cancelled swipes stay neutral', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto(appUrl('/plan/rank?setup=done'));
    const card = page.getByTestId('talk-card');
    await card.getByRole('button', { name: /Read more/ }).tap();
    const abstract = card.locator('.abstract.open p');
    await abstract.scrollIntoViewIfNeeded();
    const title = await card.getAttribute('aria-label');
    const cdp = await context.newCDPSession(page);
    const scrollBefore = await page.evaluate(() => scrollY);
    const box = (await abstract.boundingBox())!;
    const y = Math.max(250, Math.min(550, box.y + 80));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 160, y }],
    });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 160, y: y - step * 15 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore);
    await expect(card).toHaveAttribute('aria-label', title!);
    await abstract.scrollIntoViewIfNeeded();
    const cancelBox = (await abstract.boundingBox())!;
    const cancelY = Math.max(180, Math.min(550, cancelBox.y + 30));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 90, y: cancelY }],
    });
    for (let x = 105; x <= 240; x += 15) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: cancelY }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(card).toHaveAttribute('aria-label', title!);
    await expect(page.getByText('0 choices saved', { exact: false })).toBeVisible();
  } finally {
    await context.close();
  }
});
