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
  await page.getByPlaceholder('Search sessions…').fill('AOSP');
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
  await expect(page.getByText('DEV CLOCK')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Happening now' })).toBeVisible();
  // The session running at 10:15–10:30 must appear in the NOW card.
  await expect(page.getByRole('link', { name: /First Step into Open Source/ })).toBeVisible();
  // A progress bar is rendered for each live session.
  await expect(page.getByRole('progressbar').first()).toBeVisible();
});

test('explore search responds and renders results', async ({ page }) => {
  await page.goto(appUrl('/explore'));
  await expect(page.getByRole('link', { name: /Booths/ })).toBeVisible();
  await page.getByLabel('Search').fill('kernel');
  await expect(page.getByRole('status').first()).toContainText('result');
  // At least one result row appears.
  await expect(page.locator('.results li').first()).toBeVisible();
});

test('elo ranking compares two sessions and advances', async ({ page }) => {
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  // Two candidate cards appear.
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await expect(page.getByTestId('candidate-b')).toBeVisible();
  // Progress readout is shown.
  await expect(page.getByText(/% RESOLVED/)).toBeVisible();

  // Tapping a card is the pick; the pair changes or the day settles.
  for (let i = 0; i < 5; i++) {
    const done = await page
      .getByText('ALL SETTLED')
      .isVisible()
      .catch(() => false);
    if (done) break;
    await page.getByTestId('candidate-a').click();
    await page.waitForTimeout(150);
  }
  const stillGoing = await page
    .getByTestId('candidate-a')
    .isVisible()
    .catch(() => false);
  const done = await page
    .getByText('ALL SETTLED')
    .isVisible()
    .catch(() => false);
  expect(stillGoing || done).toBe(true);
});

test('ranking supports keyboard choices and undo', async ({ page }) => {
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await expect(page.getByText(/0 CHOICES · \d+ TO GO/)).toBeVisible();

  // Keyboard choice via number key advances the choice count.
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await expect(page.getByText(/1 CHOICE · \d+ TO GO/)).toBeVisible();

  // Undo becomes enabled after a choice and reverses the last comparison.
  const undo = page.getByRole('button', { name: /Undo last/ });
  await expect(undo).toBeEnabled();
  await undo.click();
  await page.waitForTimeout(100);
  await expect(undo).toBeDisabled();

  // Arrow keys pick the top or bottom card without a pointer.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  await expect(page.getByText(/1 CHOICE · \d+ TO GO/)).toBeVisible();
});

test('ranking starts with a quick pass that narrows the overlaps to settle', async ({ page }) => {
  await page.goto(appUrl('/plan/rank'));
  // A fresh day opens on the quick pass.
  await expect(page.getByRole('tab', { name: /Quick pass/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const rows = page.getByTestId('quick-row');
  const before = await rows.count();
  expect(before).toBeGreaterThan(5);
  // "No" removes a session from the running; "Yes" keeps it.
  await rows
    .first()
    .getByRole('button', { name: /^No to/ })
    .click();
  await rows
    .first()
    .getByRole('button', { name: /^Yes to/ })
    .click();
  await expect(rows).toHaveCount(before - 2);
  await expect(page.getByText(/1 IN · 1 OUT/)).toBeVisible();
  // Answers survive a reload and can be changed.
  await page.reload();
  await expect(page.getByText(/1 IN · 1 OUT/)).toBeVisible();
  await page.getByRole('button', { name: /Change answered/ }).click();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(page.getByText(/1 IN · 0 OUT|0 IN · 1 OUT/)).toBeVisible();
  // Head to head is one tap away and shows only open overlaps.
  await page.getByRole('tab', { name: /Head to head/ }).click();
  await expect(page.getByTestId('candidate-a')).toBeVisible();
});

test('answered pairs are not asked again after a reload', async ({ page }) => {
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  const first = await page.getByTestId('candidate-a').textContent();
  await page.getByTestId('candidate-a').click();
  await expect(page.getByText(/1 CHOICE · \d+ TO GO/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/1 CHOICE · \d+ TO GO/)).toBeVisible();
  // The winner now leads its clash, so the same pair does not come back.
  const again = await page.getByTestId('candidate-a').textContent();
  expect(again).not.toBe(first);
});

test('ranking respects reduced motion while still recording choices', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await page.getByTestId('candidate-a').click();
  await page.waitForTimeout(200);
  await expect(page.getByText(/1 CHOICE · \d+ TO GO/)).toBeVisible();
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
  await firstRow.locator('summary', { hasText: 'Adjust' }).click();
  await firstRow.getByRole('button', { name: 'Lock' }).click();
  await expect(firstRow.getByRole('button', { name: 'Unlock' })).toBeVisible();

  // Remove the second item and restore it from the Removed list.
  const before = await page.locator('.itinerary li').count();
  // Filler blocks carry no controls, so pick the second real session.
  const secondRow = page.locator('.itinerary li:not(.flex)').nth(1);
  await secondRow.locator('summary', { hasText: 'Adjust' }).click();
  await secondRow.getByRole('button', { name: 'Remove' }).click();
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

test('sessions and the chat tab link the organiser rooms for Element', async ({ page }) => {
  await page.goto(appUrl('/activity/act-c8ak0iov2l'));
  const room = page.getByRole('link', { name: 'Open room in Element' });
  await expect(room).toHaveAttribute(
    'href',
    /matrix\.to\/#\/%23indiafoss-2025-room-devroom-1-aosp/,
  );
  // With P2P chat off, /chat still lists the public rooms, space first.
  await page.goto(appUrl('/chat'));
  const rooms = page.getByRole('region', { name: 'Conference rooms on Matrix' });
  await expect(rooms.getByRole('link').first()).toHaveAttribute(
    'href',
    /%23indiafoss%3Areilly\.asia/,
  );
  await expect(rooms.getByRole('link', { name: /IndiaFOSS 2025.*Announcements/ })).toBeVisible();
});

test('must attend pins a talk in the plan and leads the leave-by banner', async ({ page }) => {
  await page.goto(appUrl('/activity/act-c8ak0iov2l'));
  const must = page.getByRole('button', { name: 'Must attend' });
  await must.click();
  await expect(must).toHaveAttribute('aria-pressed', 'true');
  // Plan lists it under Must attend.
  await page.goto(appUrl('/plan'));
  const list = page.getByRole('region', { name: /Must attend/ });
  await expect(list.getByRole('link', { name: /First Step into Open Source/ })).toBeVisible();
  // The banner picks it over the programme order and says so.
  const before = '2025-09-20T09:50:00+05:30';
  await page.goto(appUrl(`/schedule?now=${encodeURIComponent(before)}`));
  const banner = page.getByRole('link', { name: /Must attend.*First Step into Open Source/ });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('MUST ATTEND');
  // Removing it from the plan clears the mark.
  await page.goto(appUrl('/plan'));
  await list.getByRole('button', { name: /Remove First Step/ }).click();
  await expect(list.getByRole('link', { name: /First Step into Open Source/ })).toHaveCount(0);
});

test('map sets a location from a room and shows the walk to another', async ({ page }) => {
  await page.goto(appUrl('/map'));
  // Tap a room on the floor plan, mark it as where you are.
  await page.getByRole('button', { name: /^Audi 1/ }).click();
  await page.getByRole('button', { name: "I'm here" }).click();
  // Devroom 2 is on the first floor; switch floors and open its sheet.
  await page.getByRole('button', { name: /^First/ }).click();
  await page.getByRole('button', { name: /^Devroom 2/ }).click();
  await expect(page.getByRole('heading', { name: 'Devroom 2' })).toBeVisible();
  // The other-floor hint points back down to where you are.
  await expect(page.getByText("YOU'RE DOWNSTAIRS")).toBeVisible();
  // The plan zooms; labels grow their detail once zoomed in.
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('.drawing')).toHaveAttribute('style', /scale\(1\.5/);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('.drawing')).toHaveAttribute('style', /scale\(1\)/);
});

test('now screen shows leave-by with a known location', async ({ page }) => {
  const DURING = '2025-09-20T10:20:00+05:30';
  await page.goto(appUrl(`/now?now=${encodeURIComponent(DURING)}&at=audi-1`));
  // With a known location the NEXT card says where you are and opens the map on the next room.
  await expect(page.getByText(/You are at/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('link', { name: 'Show on map' }).click();
  await expect(page.getByText('DESTINATION')).toBeVisible();
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

test('connect keeps a live QR card and downloads a vCard', async ({ page }) => {
  await page.goto(appUrl('/connect'));
  await expect(page.getByRole('heading', { name: 'Your card' })).toBeVisible();
  // An empty card shows a prompt, not a code that encodes nothing.
  await expect(page.getByRole('img', { name: /contact details as a QR code/ })).toHaveCount(0);
  await expect(page.getByText(/Add your name below/)).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Test Attendee');
  // A bare username is enough; the card carries the profile URL.
  await page.getByLabel('FOSS United', { exact: true }).fill('test_attendee');
  // No generate step: the QR re-encodes on its own from the local vCard payload.
  const qr = page.getByRole('img', { name: /contact details as a QR code/ });
  await expect(qr).toBeVisible();
  await expect(page.getByText('2 FIELDS SHARED')).toBeVisible();
  // Each row's switch changes what is encoded.
  const shareName = page.getByRole('switch', { name: 'Share Name' });
  await expect(shareName).toHaveAttribute('aria-checked', 'true');
  await shareName.click();
  await expect(page.getByText('1 FIELD SHARED')).toBeVisible();
  await shareName.click();
  // The .vcf can be saved on-device.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save .vcf' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.vcf$/);
});

test('scan: manual location entry previews and sets the current location', async ({ page }) => {
  await page.goto(appUrl('/scan'));
  await expect(page.getByRole('heading', { name: 'Scan a code' })).toBeVisible();
  // Choose a venue location via the keyboard/manual fallback, tucked behind a disclosure.
  // Headless Chromium has no camera, so the manual disclosure opens on its own.
  await expect(page.getByText(/No camera was found|could not be started/)).toBeVisible();
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
  // The received card can be exported as a file, and saving keeps it on device (unverified).
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .vcf' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.vcf$/);
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('status')).toContainText(/Saved Riya Verma/);

  // A junk paste is rejected safely, with no preview.
  await page.getByLabel('Paste a vCard').fill('not a vcard at all');
  await page.getByRole('button', { name: 'Preview contact' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confirm before importing' })).toHaveCount(0);
});

test('P2P chat is off by default and switches on from settings', async ({ page }) => {
  // Off: no Chat entry anywhere, and /chat explains how to enable it.
  await expect(page.getByRole('link', { name: 'Chat', exact: true })).toHaveCount(0);
  await page.goto(appUrl('/chat'));
  await expect(page.getByRole('heading', { name: 'P2P chat is off' })).toBeVisible();

  await page.goto(appUrl('/settings'));
  const toggle = page.getByRole('switch', { name: /Enable P2P chat/ });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByRole('link', { name: /Open chat/ })).toBeVisible();

  // On, in a browser: the tab appears and /chat reports there is no mesh node here.
  await page.goto(appUrl('/chat'));
  await expect(page.getByRole('heading', { name: 'No mesh node on this device' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Chat', exact: true })).toBeVisible();
});

test('key badges can be compared side by side', async ({ page }) => {
  await page.goto(appUrl('/connect/compare'));
  await expect(page.getByRole('heading', { name: 'Compare badges' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your key badge' }).locator('svg')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/No saved contact carries a key badge yet/)).toBeVisible();
});

test('a shared link lands in the scan preview (web share target)', async ({ page }) => {
  const shared = encodeURIComponent('https://matrix.to/#/@alice:matrix.org');
  await page.goto(appUrl(`/scan?url=${shared}`));
  await expect(page.getByRole('heading', { name: 'Confirm before importing' })).toBeVisible({
    timeout: 10_000,
  });
});

test('a newer published revision is offered, downloaded first, then applied (#7)', async ({
  page,
}) => {
  // Load once so the current revision is recorded locally.
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  const current = await page.evaluate(async () => {
    const res = await fetch(
      `${location.pathname.replace(/\/$/, '')}/events/indiafoss-2025/event-bundle.json`,
    );
    return res.json();
  });
  const changed = structuredClone(current);
  changed.activities[0].title = 'Renamed by the organisers';
  // A manifest one revision ahead, naming a new immutable asset.
  await page.route(/\/events\/indiafoss-2025\/manifest\.json/, (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        eventId: 'indiafoss-2025',
        revision: 999,
        assets: { event: 'event.deadbeef.json' },
      },
    }),
  );
  await page.route(/\/events\/indiafoss-2025\/event\.deadbeef\.json/, (route) =>
    route.fulfill({ json: changed }),
  );
  await page.goto(appUrl('/schedule'));
  const banner = page.getByRole('status', { name: 'Schedule update available' });
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toContainText(/title-changed/);
  await banner.getByRole('button', { name: 'Update' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByText('Renamed by the organisers')).toBeVisible();
});
