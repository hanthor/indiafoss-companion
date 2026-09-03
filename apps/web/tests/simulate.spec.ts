import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

/**
 * Day simulator gate (#93): the app is run through a slice of the conference
 * day at 600× (ten simulated minutes a second) with reminders on and one
 * session marked must attend, and the log the simulator keeps must show the
 * prompts an attendee would have seen: the leave-by banner counting down and
 * every tier of reminder firing at its simulated time.
 *
 * The second test is the reminder-quality gate: it records the notifications
 * the browser actually constructs and checks that each one is worth the
 * interruption — it names the session, says which room and how far, and opens
 * that session when tapped — and that near-duplicate alerts are merged away.
 */
const DAY_START = '2025-09-20T09:40:00+05:30';
const SPEED = 600;
/** "First Step into Open Source", 10:15–10:30 on day one. */
const SESSION = 'act-c8ak0iov2l';

test.use({ permissions: ['notifications'] });

test('the simulator fires every reminder tier and logs the banner', async ({ page }) => {
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  // Mark the session must attend and switch reminders on, as an attendee would.
  await page.goto(appUrl(`/activity/${SESSION}`));
  await page.getByRole('button', { name: /Must attend/ }).click();
  await page.goto(appUrl('/settings'));
  await page.getByRole('switch', { name: /Enable reminders/ }).check();

  // Start the run from the URL, the way an automated walk-through would.
  await page.goto(appUrl(`/now?now=${encodeURIComponent(DAY_START)}&speed=${SPEED}`));
  await expect(page.getByTestId('sim-strip')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('Sat 20 · 09:4');

  // The banner shows the must-attend session coming up.
  await expect(
    page.getByRole('link', { name: /Must attend.*First Step into Open Source/ }),
  ).toBeVisible();

  // Let the day run past the session start (36 simulated minutes ≈ 4 real seconds).
  await page.waitForFunction(
    () => (window.__indiafossSim?.state().now ?? '') >= '2025-09-20T10:16:00+05:30',
    null,
    { timeout: 20_000 },
  );
  const log = await page.evaluate(() => window.__indiafossSim!.log());
  const fired = log
    .filter((e) => e.kind === 'notification')
    .map((e) => `${e.simAt.slice(11, 16)} ${e.title}`);
  // 30-min heads-up at 09:45, the leave-now alert on the way, the start at 10:15.
  expect(fired).toContain('09:45 In 30 min: First Step into Open Source with AOSP');
  expect(fired.some((f) => f.includes('Leave now: First Step'))).toBe(true);
  expect(fired).toContain('10:15 Starting now: First Step into Open Source with AOSP');
  // The banner counted down and was logged as it changed.
  expect(log.some((e) => e.kind === 'banner' && /STARTS IN \d+ MIN/.test(e.title))).toBe(true);
  // The strip shows the latest thing that happened: a reminder or the banner moving on.
  await expect(page.getByTestId('sim-latest')).toContainText(
    /STARTS IN|STARTING NOW|Starting now|Leave now|In \d+ min/,
  );

  // Pause holds the clock; stop ends the run and the log records both.
  await page.evaluate(() => window.__indiafossSim!.pause());
  const held = await page.evaluate(() => window.__indiafossSim!.state().now);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__indiafossSim!.state().now)).toBe(held);
  await page.evaluate(() => window.__indiafossSim!.stop());
  await expect(page.getByTestId('sim-strip')).toBeHidden();
});

test('a run survives navigation and a reload, and Settings can start one', async ({ page }) => {
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  await page.goto(appUrl('/settings'));
  await page.getByRole('button', { name: 'Start simulation' }).click();
  await expect(page).toHaveURL(/\/now/);
  await expect(page.getByTestId('sim-strip')).toBeVisible();
  await page.getByRole('link', { name: 'Schedule' }).click();
  await expect(page.getByTestId('sim-strip')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('sim-strip')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('sim-strip')).toBeHidden();
});

test('every reminder names the session, the room and the walk, and opens it when tapped', async ({
  page,
}) => {
  // Record what the browser is actually asked to show, options and all.
  await page.addInitScript(() => {
    interface Shown {
      title: string;
      body: string;
      tag: string;
      icon: string;
      hasClick: boolean;
    }
    const fired: Shown[] = [];
    (window as unknown as { __fired: Shown[] }).__fired = fired;
    class Recording {
      static permission = 'granted';
      static async requestPermission() {
        return 'granted';
      }
      onclick: (() => void) | null = null;
      close() {}
      constructor(title: string, options?: NotificationOptions) {
        const shown: Shown = {
          title,
          body: options?.body ?? '',
          tag: options?.tag ?? '',
          icon: options?.icon ?? '',
          hasClick: false,
        };
        fired.push(shown);
        queueMicrotask(() => {
          shown.hasClick = typeof this.onclick === 'function';
        });
      }
    }
    Object.defineProperty(window, 'Notification', { value: Recording, writable: true });
  });

  await page.goto(appUrl('/?setup=done'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  // Standing somewhere known, so the alerts can work out the walk.
  await page.goto(appUrl('/map'));
  await page.getByRole('button', { name: /^Audi 2/ }).click();
  await page.getByRole('button', { name: "I'm here" }).click();

  await page.goto(appUrl(`/activity/${SESSION}`));
  await page.getByRole('button', { name: /Must attend/ }).click();
  await page.goto(appUrl('/settings'));
  await page.getByRole('switch', { name: /Enable reminders/ }).check();

  await page.goto(appUrl(`/now?now=${encodeURIComponent(DAY_START)}&speed=${SPEED}`));
  await expect(page.getByTestId('sim-strip')).toBeVisible();
  await page.waitForFunction(
    () => (window.__indiafossSim?.state().now ?? '') >= '2025-09-20T10:16:00+05:30',
    null,
    { timeout: 30_000 },
  );

  const fired = await page.evaluate(
    () =>
      (
        window as unknown as {
          __fired: { title: string; body: string; tag: string; icon: string; hasClick: boolean }[];
        }
      ).__fired,
  );
  expect(fired.length).toBeGreaterThanOrEqual(3);

  for (const shown of fired) {
    // The session is in the title, so a shade full of reminders is readable.
    expect(shown.title).toContain('First Step into Open Source');
    // The room is in the body, so the attendee knows where to go.
    expect(shown.body).toContain('Devroom 1 (AOSP)');
    // Tapping opens that session, and a re-armed alert replaces rather than stacks.
    expect(shown.hasClick).toBe(true);
    expect(shown.tag).toMatch(/^(must|soon|leave|start)-/);
    expect(shown.icon).toContain('icon-192.png');
  }

  const leave = fired.find((n) => n.title.startsWith('Leave now'))!;
  expect(leave.body).toMatch(/\d+ min walk to Devroom 1 \(AOSP\) · starts 10:15/);
  // Starting-soon lands within minutes of leave-now for a near room, so it is
  // merged away rather than firing twice about the same talk.
  expect(fired.filter((n) => n.title.startsWith('In 15 min'))).toHaveLength(0);
});
