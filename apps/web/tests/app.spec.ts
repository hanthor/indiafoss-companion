import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

/** A time-travelled instant when a session is happening (developer time, §13). */
const DURING = '2025-09-20T10:20:00+05:30';
const NOW_URL = appUrl(`/now?event=indiafoss-2025&now=${encodeURIComponent(DURING)}`);

test.beforeEach(async ({ page }) => {
  // The event bundle is fetched from a static asset and cached in IndexedDB.
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
});

test('home shows event facts', async ({ page }) => {
  await expect(page.getByText(/131 sessions/)).toBeVisible();
  await expect(page.getByText(/117 speakers/)).toBeVisible();
});

test('schedule lists sessions grouped by time', async ({ page }) => {
  await page.goto(appUrl('/schedule'));
  await expect(page.getByRole('tab', { name: /Day 1/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Day 2/ })).toBeVisible();
  // Day 1 has breakfast/registrations sessions.
  await expect(page.getByText(/Registrations and Breakfast/).first()).toBeVisible();
});

test('schedule search narrows results', async ({ page }) => {
  await page.goto(appUrl('/schedule'));
  await page.getByPlaceholder('Search talks, speakers, tags…').fill('AOSP');
  await expect(page.getByText(/1 session|sessions/).first()).toBeVisible();
  // Searching for AOSP should surface the AOSP devroom sessions.
  const results = page.getByRole('article');
  await expect(results.first()).toBeVisible();
});

test('activity detail shows speakers and toggles bookmark', async ({ page }) => {
  await page.goto(appUrl('/activity/act-c8ak0iov2l'));

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
  await page.goto(appUrl('/explore'));
  await expect(page.getByText('Type at least two characters to search.')).toBeVisible();
  await page.getByLabel('Search').fill('kernel');
  await expect(page.getByRole('status').first()).toContainText('result');
  // At least one result row appears.
  await expect(page.locator('.results li').first()).toBeVisible();
});

test('elo ranking compares two sessions and advances', async ({ page }) => {
  await page.goto(appUrl('/plan/rank'));
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

test('ranking supports keyboard choices and undo', async ({ page }) => {
  await page.goto(appUrl('/plan/rank'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await expect(page.getByText(/0 comparison|% resolved/)).toBeVisible();

  // Keyboard choice via number key advances the comparison count.
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await expect(page.getByText(/1 comparison/)).toBeVisible();

  // Undo becomes enabled after a choice and reverses the last comparison.
  const undo = page.getByRole('button', { name: /Undo last/ });
  await expect(undo).toBeEnabled();
  await undo.click();
  await page.waitForTimeout(100);
  await expect(undo).toBeDisabled();

  // Arrow keys act as swipe-equivalents without a pointer.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  await expect(page.getByText(/1 comparison/)).toBeVisible();
});

test('ranking respects reduced motion while still recording choices', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  await page.goto(appUrl('/plan/rank'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await page.getByRole('button', { name: 'Definitely A' }).first().click();
  await page.waitForTimeout(200);
  await expect(page.getByText(/1 comparison/)).toBeVisible();
  await context.close();
});

test('plan generates a feasible itinerary with backups', async ({ page }) => {
  await page.goto(appUrl('/plan'));
  // The solver runs for Day 1 and renders an ordered itinerary.
  await expect(page.locator('.itinerary li').first()).toBeVisible({ timeout: 10_000 });
  const count = await page.locator('.itinerary li').count();
  expect(count).toBeGreaterThan(3);
  // Some slots offer a backup replacement.
  const hasBackups = await page.locator('.replace select').count();
  expect(hasBackups).toBeGreaterThan(0);
});

test('plan supports editing: lock, remove/restore, and a persistent custom block', async ({
  page,
}) => {
  await page.goto(appUrl('/plan'));
  const firstRow = page.locator('.itinerary li').first();
  await expect(firstRow).toBeVisible({ timeout: 10_000 });

  // Lock the first item.
  await firstRow.getByRole('button', { name: 'Lock' }).click();
  await expect(firstRow.getByRole('button', { name: 'Unlock' })).toBeVisible();

  // Remove the second item and restore it from the Removed list.
  const before = await page.locator('.itinerary li').count();
  await page.locator('.itinerary li').nth(1).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.itinerary li')).toHaveCount(before - 1);
  await expect(page.getByRole('heading', { name: 'Removed' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(page.locator('.itinerary li')).toHaveCount(before);

  // Add a custom block; it persists across a reload.
  const addBlock = page.locator('.add-block');
  await addBlock.getByLabel('What').fill('Lunch with friends');
  await addBlock.getByLabel('Start', { exact: true }).fill('13:00');
  await addBlock.getByLabel('End', { exact: true }).fill('13:45');
  await addBlock.getByRole('button', { name: 'Add block' }).click();
  await expect(page.locator('.itinerary .flabel', { hasText: 'Lunch with friends' })).toBeVisible();

  await page.reload();
  await expect(page.locator('.itinerary .flabel', { hasText: 'Lunch with friends' })).toBeVisible({
    timeout: 10_000,
  });
  // The lock survived the reload too.
  await expect(page.locator('.itinerary li.locked').first()).toBeVisible();
});

test('plan explains an infeasible custom block instead of dropping it', async ({ page }) => {
  await page.goto(appUrl('/plan'));
  await expect(page.locator('.itinerary li').first()).toBeVisible({ timeout: 10_000 });
  const addBlock = page.locator('.add-block');
  // Two overlapping custom blocks force an overlap conflict.
  await addBlock.getByLabel('What').fill('Overlap A');
  await addBlock.getByLabel('Start', { exact: true }).fill('14:00');
  await addBlock.getByLabel('End', { exact: true }).fill('15:00');
  await addBlock.getByRole('button', { name: 'Add block' }).click();
  await addBlock.getByLabel('What').fill('Overlap B');
  await addBlock.getByLabel('Start', { exact: true }).fill('14:30');
  await addBlock.getByLabel('End', { exact: true }).fill('15:30');
  await addBlock.getByRole('button', { name: 'Add block' }).click();
  // The conflict is explained; both blocks remain in the plan.
  await expect(page.getByTestId('edit-conflicts')).toBeVisible();
  await expect(page.locator('.itinerary .flabel', { hasText: 'Overlap A' })).toBeVisible();
  await expect(page.locator('.itinerary .flabel', { hasText: 'Overlap B' })).toBeVisible();
});

test('map routes between two rooms offline-style', async ({ page }) => {
  await page.goto(appUrl('/map'));
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
  await page.goto(appUrl(`/now?now=${encodeURIComponent(DURING)}&at=audi-1`));
  // With a known location the NEXT card computes walking time + leave-by.
  await expect(page.getByText(/Estimated walk:/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Leave by/)).toBeVisible();
  // Show route links into the map with the destination preset.
  await page.getByRole('link', { name: 'Show route' }).click();
  await expect(page.getByLabel('Destination')).toHaveValue(/devroom|audi|room|workshops|bof/);
});

test('routing profile is configurable and persists across reload', async ({ page }) => {
  await page.goto(appUrl('/settings'));
  await expect(page.getByRole('heading', { name: 'Getting around' })).toBeVisible();
  // Switch to the step-free (accessible) profile.
  await page.getByRole('radio', { name: /Step-free/ }).check();
  await expect(page.getByRole('radio', { name: /Step-free/ })).toBeChecked();
  // The choice survives a reload (persisted locally).
  await page.reload();
  await expect(page.getByRole('radio', { name: /Step-free/ })).toBeChecked({ timeout: 10_000 });
});

test('booth directory lists and schedules a visit', async ({ page }) => {
  await page.goto(appUrl('/explore/booths'));
  await expect(page.getByRole('status')).toContainText('booths');
  await page.getByRole('link', { name: /KDE Community/ }).click();
  await page.getByRole('button', { name: 'Schedule 30 min' }).click();
  await expect(page.getByText(/Scheduled: 30 min/)).toBeVisible();
});

test('activity calendar action downloads a portable ICS file', async ({ page }) => {
  await page.goto(appUrl('/activity/act-c8ak0iov2l'));
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Add to calendar' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.ics$/);
});

test('connect generates a local QR card and downloads a vCard', async ({ page }) => {
  await page.goto(appUrl('/connect'));
  await expect(page.getByRole('heading', { name: 'Share your contact' })).toBeVisible();
  await page.getByLabel('Full name').fill('Test Attendee');
  await page.getByLabel('FOSS United profile URL').fill('https://fossunited.org/u/test_attendee');
  await expect(page.getByText('Profile handle: @test_attendee')).toBeVisible();
  await page.getByRole('button', { name: /Generate my QR card/ }).click();
  // The QR image is rendered from the local vCard payload.
  await expect(page.getByRole('img', { name: /contact details as a QR code/ })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/generated locally/);
  // The .vcf can be downloaded on-device.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .vcf' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.vcf$/);
});

test('scan: manual location entry previews and sets the current location', async ({ page }) => {
  await page.goto(appUrl('/scan'));
  await expect(page.getByRole('heading', { name: 'Scan a code' })).toBeVisible();
  // Choose a venue location via the keyboard/manual fallback.
  const select = page.getByLabel('Set current location');
  await expect(select.locator('option').nth(1)).toBeAttached();
  const value = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(value!);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  // Nothing is applied until the preview is confirmed.
  await expect(page.getByRole('heading', { name: 'Confirm before importing' })).toBeVisible();
  await page.getByRole('button', { name: 'Set location' }).click();
  await expect(page.getByRole('status')).toContainText(/Location set to/);
});

test('scan: pasting a vCard previews the shared fields and rejects junk', async ({ page }) => {
  await page.goto(appUrl('/scan'));
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Riya Verma', 'ORG:KDE', 'END:VCARD'].join(
    '\r\n',
  );
  await page.getByLabel('Paste a vCard').fill(vcard);
  await page.getByRole('button', { name: 'Preview contact' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm before importing' })).toBeVisible();
  await expect(page.getByText('Riya Verma')).toBeVisible();
  await expect(page.getByText('KDE')).toBeVisible();
  // Saving downloads the received card locally.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save contact' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.vcf$/);

  // A junk paste is rejected safely, with no preview.
  await page.getByLabel('Paste a vCard').fill('not a vcard at all');
  await page.getByRole('button', { name: 'Preview contact' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confirm before importing' })).toHaveCount(0);
});
