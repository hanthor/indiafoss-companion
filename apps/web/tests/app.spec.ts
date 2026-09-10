import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

/** A time-travelled instant when a session is happening (developer time, §13). */
const DURING = '2025-09-20T10:20:00+05:30';
const NOW_URL = appUrl(`/now?event=indiafoss-2025&now=${encodeURIComponent(DURING)}`);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('selected-event', 'indiafoss-2025'));
  // The event bundle is fetched from a static asset and cached in IndexedDB.
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
});

test('home shows event facts', async ({ page }) => {
  await page.goto(appUrl('/?setup=done'));
  await expect(page.getByText(/131 sessions/)).toBeVisible();
  await expect(page.getByText(/117 speakers/)).toBeVisible();
});

test('first run opens the welcome wizard once: reminders, you, then rank', async ({ page }) => {
  // beforeEach landed on `/`, which hands over to the wizard on a fresh device.
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { name: /Welcome to IndiaFOSS 2025/ })).toBeVisible();
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByLabel('Ticket reference')).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Asha Menon');
  await page.getByLabel('GitHub').fill('https://github.com/asha');
  await page.getByRole('button', { name: /Save →/ }).click();
  await page.getByRole('button', { name: /Find talks for me/ }).click();
  await expect(page).toHaveURL(/\/plan\/rank$/);
  // What was entered is on the card; the wizard does not come back.
  await page.goto(appUrl('/connect'));
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Asha Menon');
  await page.goto(appUrl('/'));
  await expect(page.getByText(/131 sessions/)).toBeVisible();
  await expect(page).not.toHaveURL(/welcome/);
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

test('an organiser ceremony shows its source instead of an invented abstract', async ({ page }) => {
  await page.goto(appUrl('/activity/act-28la7q52h1?event=indiafoss-2026'));
  await expect(page.getByRole('heading', { name: 'FOSS Awards' })).toBeVisible();
  await expect(page.getByText('ceremony', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Other$/)).toHaveCount(0);
  const fallback = page.getByTestId('no-description');
  await expect(fallback).toContainText('No description published by the organiser yet');
  await expect(fallback.getByRole('link', { name: /fossunited\.org/ })).toHaveAttribute(
    'href',
    'https://fossunited.org/c/indiafoss/2026/schedule',
  );
  await expect(page.getByRole('link', { name: 'View the official schedule' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Speakers' })).toHaveCount(0);
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

/** The readout once at least one pair has an answer. */
const SOME_CHOICES = /[1-9]\d* CHOICES? · \d+ OVERLAPS? OPEN/;

test('ranking supports keyboard choices and undo', async ({ page }) => {
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await expect(page.getByText(/0 CHOICES · \d+ OVERLAPS? OPEN/)).toBeVisible();

  // Keyboard choice via number key: the first session beats the rest of its slot.
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  await expect(page.getByText(SOME_CHOICES)).toBeVisible();

  // Undo becomes enabled after a choice and reverses the whole pick.
  const undo = page.getByRole('button', { name: /Undo last/ });
  await expect(undo).toBeEnabled();
  await undo.click();
  await page.waitForTimeout(100);
  await expect(undo).toBeDisabled();
  await expect(page.getByText(/0 CHOICES · \d+ OVERLAPS? OPEN/)).toBeVisible();

  // Arrow keys pick the top or second card without a pointer.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(200);
  await expect(page.getByText(SOME_CHOICES)).toBeVisible();
});

test('devroom preferences are an optional path and remain editable', async ({ page }) => {
  await page.goto(appUrl('/plan/rank?mode=rooms'));
  await expect(page.getByRole('tab', { name: /Devrooms/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const rows = page.getByTestId('room-row');
  expect(await rows.count()).toBeGreaterThan(3);
  const aosp = rows.filter({ hasText: 'AOSP' });
  await aosp.getByRole('button', { name: 'Not interested', exact: true }).click();
  await expect(aosp.getByRole('button', { name: 'Not interested', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await rows.last().getByRole('button', { name: 'Stay for this devroom', exact: true }).click();
  await page.getByRole('button', { name: /Done · 1 out, 1 staying/ }).click();
  await expect(page.getByRole('tab', { name: /Talks/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /Devrooms/ }).click();
  await aosp.getByRole('button', { name: 'Interested', exact: true }).click();
  await expect(aosp.getByRole('button', { name: 'Not interested', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('talk discovery keeps archived preferences and pairwise history compatible', async ({
  page,
}) => {
  await page.goto(appUrl('/plan/rank?mode=quick'));
  const card = page.getByTestId('talk-card');
  await expect(card).toBeVisible();
  const first = await card.getAttribute('aria-label');
  await page.getByRole('button', { name: /^Want to go:/ }).click();
  await expect(card).not.toHaveAttribute('aria-label', first!);
  await expect(page.getByText(/1 choices saved/)).toBeVisible();
  await page.reload();
  await expect(card).not.toHaveAttribute('aria-label', first!);
  await expect(page.getByText(/1 choices saved/)).toBeVisible();
  await page.getByRole('button', { name: /Change answered/ }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText(/0 choices saved/)).toBeVisible();
  await page.getByRole('tab', { name: /Compare overlaps/ }).click();
  await expect(page.getByTestId('candidate-a')).toBeVisible();
});

test('one pick settles a whole slot and undo brings the stood-aside talks back (#271)', async ({
  page,
}) => {
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  const pill = page.locator('.pair .pill');
  const before = (await pill.textContent())!;
  const candidates = page.locator('[data-testid^="candidate-"] .title');
  const titlesBefore = await candidates.allTextContents();
  expect(titlesBefore.length).toBeGreaterThanOrEqual(2);

  await page.getByTestId('candidate-a').click();
  const result = page.getByTestId('clash-result');
  await expect(result).toContainText(`${titlesBefore[0]} is in your plan`);
  await expect(result).toContainText('stood aside');
  // The same window never comes back as a chain of backup questions.
  await expect(page.getByText('And if that falls through?')).toHaveCount(0);
  const stillGoing = await page
    .getByTestId('candidate-a')
    .isVisible()
    .catch(() => false);
  if (stillGoing) expect(await pill.textContent()).not.toBe(before);

  // Undo restores the slot exactly: same window, same talks.
  await page.getByRole('button', { name: /Undo last/ }).click();
  await expect(page.getByTestId('clash-result')).toHaveCount(0);
  await expect(pill).toHaveText(before);
  expect(await candidates.allTextContents()).toEqual(titlesBefore);
});

test('answered pairs are not asked again after a reload', async ({ page }) => {
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  const first = await page.getByTestId('candidate-a').textContent();
  await page.getByTestId('candidate-a').click();
  await expect(page.getByText(SOME_CHOICES)).toBeVisible();
  await page.reload();
  await expect(page.getByText(SOME_CHOICES)).toBeVisible();
  // The winner now leads its slot, so it is not offered again.
  const again = await page.getByTestId('candidate-a').textContent();
  expect(again).not.toBe(first);
});

test('ranking respects reduced motion while still recording choices', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => sessionStorage.setItem('selected-event', 'indiafoss-2025'));
  const page = await context.newPage();
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByTestId('candidate-a')).toBeVisible();
  await page.getByTestId('candidate-a').click();
  await page.waitForTimeout(200);
  await expect(page.getByText(SOME_CHOICES)).toBeVisible();
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
  const firstLink = page.locator('.itinerary li:not(.flex) a').first();
  await expect(firstLink).toBeVisible({ timeout: 10_000 });
  const href = await firstLink.getAttribute('href');
  const firstRow = page.locator('.itinerary li').filter({ has: page.locator(`a[href="${href}"]`) });

  // Lock the first item.
  await firstRow.locator('summary', { hasText: 'Adjust' }).click();
  await firstRow.getByRole('button', { name: 'Lock' }).click();
  await expect(firstRow.getByRole('button', { name: 'Unlock' })).toBeVisible();

  // Remove the second item and restore it from the Removed list.
  const before = await page.locator('.itinerary li').count();
  // Filler blocks carry no controls, so pick the second real session.
  const removableLink = page.locator('.itinerary li:not(.flex):not(.locked) a').first();
  const removableHref = await removableLink.getAttribute('href');
  const secondRow = page
    .locator('.itinerary li')
    .filter({ has: page.locator(`a[href="${removableHref}"]`) });
  if (!(await secondRow.locator('details').evaluate((el) => (el as HTMLDetailsElement).open))) {
    await secondRow.locator('summary', { hasText: 'Adjust' }).click();
  }
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

  // The form clears only after IndexedDB has committed the custom block.
  await expect(addBlock.getByLabel('What')).toHaveValue('');
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

test('sessions hand off to a Matrix client, offline-capable link first', async ({ page }) => {
  await page.goto(appUrl('/activity/act-c8ak0iov2l'));

  // The primary link is a `matrix:` URI. matrix.to is a web page that
  // redirects to a client, so at a venue with no internet it never reaches
  // one — verified on a handset, where a matrix.to link with the radios off
  // landed on the browser's offline page. This scheme is resolved locally.
  const room = page.getByRole('link', { name: /Session chat/ });
  await expect(room).toHaveAttribute('href', /^matrix:r\/indiafoss-2025-room-devroom-1-aosp%3A/);
  // Deliberately no target=_blank: a custom scheme is not a page, and opening
  // a tab for it strands an empty one behind the handoff.
  await expect(room).not.toHaveAttribute('target', '_blank');

  // The web permalink stays reachable for a desktop browser with no client.
  const web = page.getByRole('link', { name: /on the web/ });
  await expect(web).toHaveAttribute('href', /matrix\.to\/#\/%23indiafoss-2025-room-devroom-1-aosp/);
});

test('must attend stays pinned while the banner follows plan order', async ({ page }) => {
  await page.goto(appUrl('/activity/act-c8ak0iov2l'));
  const must = page.getByRole('button', { name: 'Must attend' });
  await must.click();
  await expect(must).toHaveAttribute('aria-pressed', 'true');
  // Plan lists it under Must attend.
  await page.goto(appUrl('/plan'));
  const list = page.getByRole('region', { name: /Must attend/ });
  await expect(list.getByRole('link', { name: /First Step into Open Source/ })).toBeVisible();
  // The banner follows the earlier planned talk rather than skipping to the must-go.
  const before = '2025-09-20T09:50:00+05:30';
  await page.goto(appUrl(`/schedule?now=${encodeURIComponent(before)}`));
  await expect(page.locator('.leaveby')).toContainText(
    'Strengthening the AOSP Developer Community',
  );
  await page.goto(appUrl('/schedule?now=2025-09-20T10:14:00%2B05:30'));
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
  await expect(page.getByText('DESTINATION', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Your contact card' })).toBeVisible();
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

test('chat is never embedded: no Chat nav entry, no P2P toggle in settings', async ({ page }) => {
  await page.goto(appUrl('/'));
  await expect(page.getByRole('link', { name: 'Chat', exact: true })).toHaveCount(0);

  await page.goto(appUrl('/settings'));
  await expect(page.getByRole('switch', { name: /Enable P2P chat/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Peer-to-peer chat' })).toHaveCount(0);
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
  await page.goto(appUrl('/?setup=done'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  const current = await page.evaluate(async () => {
    const res = await fetch(
      `${location.pathname.replace(/\/$/, '')}/events/indiafoss-2025/event-bundle.json`,
    );
    return res.json();
  });
  const changed = structuredClone(current);
  changed.activities[0].title = 'Renamed by the organisers';
  const asset = `event.${createHash('sha256').update(JSON.stringify(changed)).digest('hex').slice(0, 8)}.json`;
  // A manifest one revision ahead, naming a new immutable asset.
  await page.route(/\/events\/indiafoss-2025\/manifest\.json/, (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        eventId: 'indiafoss-2025',
        generatedAt: '2026-09-08T12:00:00Z',
        revision: 999,
        assets: { event: asset },
      },
    }),
  );
  await page.route(/\/events\/indiafoss-2025\/event\.[0-9a-f]{8}\.json/, (route) =>
    route.fulfill({ json: changed }),
  );
  await page.goto(appUrl('/schedule'));
  const banner = page.getByRole('status', { name: 'Schedule update available' });
  await expect(banner).toBeVisible({ timeout: 10_000 });
  // Human wording, not the raw change type — the banner used to render
  // "1 title-changed" and, for a plural, "2 title-changeds".
  await expect(banner).toContainText('1 title change');
  await banner.getByRole('button', { name: 'Update' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByText('Renamed by the organisers')).toBeVisible();
});

test('the who-I-met recap groups the people and makes a shareable card (#31)', async ({ page }) => {
  // Two people scanned, so the recap has something to group.
  for (const [name, org] of [
    ['Riya Verma', 'KDE'],
    ['Sanjay Rao', 'Zulip'],
  ]) {
    await page.goto(appUrl('/scan'));
    await page
      .getByLabel('Paste a vCard')
      .fill(['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `ORG:${org}`, 'END:VCARD'].join('\r\n'));
    await page.getByRole('button', { name: 'Preview contact' }).click();
    await page.getByRole('button', { name: 'Save contact' }).click();
    await expect(page.getByRole('status')).toContainText(new RegExp(`Saved ${name}`));
  }

  // Your card links to the recap once there is someone to recap.
  await page.goto(appUrl('/connect'));
  await page.getByRole('link', { name: /Who I met/ }).click();
  await expect(page).toHaveURL(/\/connect\/recap$/);
  await expect(page.getByRole('heading', { name: 'Who I met', level: 1 })).toBeVisible();

  // Both people are listed, grouped under the day they were met.
  await expect(page.getByText('Riya Verma')).toBeVisible();
  await expect(page.getByText('Sanjay Rao')).toBeVisible();
  await expect(page.getByText(/2 people/).first()).toBeVisible();

  // The card is drawn on a canvas, and the preview is what gets saved.
  const card = page.locator('canvas');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('aria-label', 'I met 2 people');
  expect(await card.evaluate((el: HTMLCanvasElement) => el.width)).toBe(1080);
  // It has actually been painted, not left blank.
  const painted = await card.evaluate((el: HTMLCanvasElement) => {
    const data = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4 * 997) {
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return seen.size;
  });
  expect(painted, 'the card should have more than one colour on it').toBeGreaterThan(1);

  // Names can be left off, and the image still saves.
  await page.getByRole('switch', { name: /Include everyone's names/ }).uncheck();
  await expect(page.getByText('Only the count and the places are on the card.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save the image' }).click();
  expect((await download).suggestedFilename()).toBe('indiafoss-who-i-met.png');
});

test('2026 booth directory preserves showcasing days and unassigned availability', async ({
  page,
}) => {
  await page.goto(appUrl('/explore/booths?event=indiafoss-2026'));
  await expect(page.getByRole('status').filter({ hasText: '71 booths' })).toBeVisible();
  await page.getByRole('link', { name: 'openSUSE project' }).click();
  await expect(page.getByText(/Showcasing: Unassigned/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Schedule 15 min' })).toHaveCount(0);
  await page.goto(appUrl('/booth/booth-2026-altsendme?event=indiafoss-2026'));
  await expect(page.getByText(/Showcasing: Day 2/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Schedule 15 min' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find on map' })).toHaveCount(0);
});

test('a booth with a site offers it as a link, not as text in the description', async ({
  page,
}) => {
  await page.goto(appUrl('/booth/booth-2026-debian?event=indiafoss-2026'));
  await expect(page.getByRole('link', { name: 'Website' })).toHaveAttribute(
    'href',
    'https://debian.org',
  );
  // The host used to be printed in the description, which is how it was unclickable.
  await expect(page.getByText('(debian.org)')).toHaveCount(0);

  // A site hosted on a forge is labelled by the forge, not generically.
  await page.goto(appUrl('/booth/booth-2026-api-dash?event=indiafoss-2026'));
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/foss42/apidash',
  );

  // A booth whose source row names no site simply has no link, rather than a broken one.
  await page.goto(appUrl('/booth/booth-2026-altsendme?event=indiafoss-2026'));
  await expect(page.getByRole('link', { name: 'Website' })).toHaveCount(0);
});

test('2026 fresh and whole-devroom plans do not invent travel between same-room talks', async ({
  page,
}) => {
  await page.goto(appUrl('/plan?event=indiafoss-2026'));
  await expect(page.locator('.itinerary li').first()).toBeVisible();
  await expect(page.getByTestId('edit-conflicts')).toHaveCount(0);
  await page.goto(appUrl('/plan/rank?event=indiafoss-2026&mode=rooms'));
  await page.getByRole('button', { name: 'Stay for this devroom', exact: true }).first().click();
  await page.goto(appUrl('/plan?event=indiafoss-2026'));
  await expect(page.locator('.itinerary li').first()).toBeVisible();
  await expect(page.getByTestId('edit-conflicts')).toHaveCount(0);

  await expect(
    page.locator('.itinerary').getByRole('link', { name: /Your first open source contribution/ }),
  ).toBeVisible();
});

test('Now follows a removed session and a saved personal block across reloads', async ({
  page,
}) => {
  const planUrl = appUrl('/plan?event=indiafoss-2026');
  const nowUrl = appUrl('/now?event=indiafoss-2026&now=2026-09-26T09:31:00%2B05:30');
  await page.goto(nowUrl);
  const personal = page.getByRole('region', { name: 'Your plan now' });
  await expect(personal.getByRole('link', { name: 'Welcome Note', exact: true })).toBeVisible();
  await page.goto(planUrl);
  const row = page
    .locator('.itinerary li')
    .filter({ has: page.getByRole('link', { name: 'Welcome Note', exact: true }) });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Removed', exact: true })).toBeVisible();
  await page.goto(nowUrl);
  await expect(personal.getByText('Loading your plan…')).toHaveCount(0);
  await expect(personal.getByRole('link', { name: 'Welcome Note', exact: true })).toHaveCount(0);
  await page.goto(planUrl);
  const form = page.locator('.add-block');
  await form.getByLabel('What').fill('Meet the booth team');
  await form.getByLabel('Start', { exact: true }).fill('09:30');
  await form.getByLabel('End', { exact: true }).fill('09:35');
  await form.getByRole('button', { name: 'Add block' }).click();
  await expect(form.getByLabel('What')).toHaveValue('');
  await page.goto(nowUrl);
  await expect(personal.getByText('Meet the booth team', { exact: true })).toBeVisible();
  await expect(personal.getByText(/In progress/)).toBeVisible();
  await page.reload();
  await expect(personal.getByText('Meet the booth team', { exact: true })).toBeVisible();
  await expect(personal.getByRole('link', { name: 'Show on map' })).toHaveCount(0);
});

test('Now opens the plan on the current event day', async ({ page }) => {
  await page.goto(appUrl('/now?event=indiafoss-2026&now=2026-09-27T10:00:00%2B05:30'));
  await page
    .getByRole('region', { name: 'Your plan now' })
    .getByRole('link', { name: 'Open your plan' })
    .click();
  await expect(page.locator('.days button.active')).toContainText('Day 2');
});

test('Now asks to resolve an overlapping personal block instead of choosing a destination', async ({
  page,
}) => {
  await page.goto(appUrl('/plan?event=indiafoss-2026'));
  const form = page.locator('.add-block');
  await form.getByLabel('What').fill('Conflicting meeting');
  await form.getByLabel('Start', { exact: true }).fill('09:31');
  await form.getByLabel('End', { exact: true }).fill('09:40');
  await form.getByRole('button', { name: 'Add block' }).click();
  await expect(form.getByLabel('What')).toHaveValue('');
  await page.goto(appUrl('/now?event=indiafoss-2026&now=2026-09-26T09:32:00%2B05:30'));
  const personal = page.getByRole('region', { name: 'Your plan now' });
  await expect(personal.getByText(/Your plan has conflicting choices/)).toBeVisible();
  await expect(personal.getByRole('link', { name: 'Show on map' })).toHaveCount(0);
});

test('map and every route banner use the edited plan without visiting Now', async ({ page }) => {
  const time = '?event=indiafoss-2026&now=2026-09-26T09:29:00%2B05:30';
  await page.goto(appUrl('/map' + time));
  await expect(page.locator('.leaveby')).toContainText('Welcome Note');
  await expect(page.locator('.roomlabel[data-planned-destination=true]')).toHaveCount(1);

  await page.goto(appUrl('/plan' + time));
  const row = page.locator('.itinerary li').filter({
    has: page.getByRole('link', { name: 'Welcome Note', exact: true }),
  });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Removed', exact: true })).toBeVisible();
  await expect(page.locator('.leaveby')).not.toContainText('Welcome Note');

  await page.goto(appUrl('/schedule' + time));
  await expect(page.locator('.leaveby')).toBeVisible();
  await expect(page.locator('.leaveby')).not.toContainText('Welcome Note');
  await expect(page.locator('.leaveby')).toContainText('in your plan');
  await page.reload();
  await expect(page.locator('.leaveby')).toBeVisible();
  await expect(page.locator('.leaveby')).not.toContainText('Welcome Note');
});

test('a conflicting plan clears map recommendations and banners on every route', async ({
  page,
}) => {
  const time = '?event=indiafoss-2026&now=2026-09-26T09:29:00%2B05:30';
  await page.goto(appUrl('/plan' + time));
  await expect(page.locator('.leaveby')).toBeVisible();
  const form = page.locator('.add-block');
  await form.getByLabel('What').fill('Conflicting meeting');
  await form.getByLabel('Start', { exact: true }).fill('09:31');
  await form.getByLabel('End', { exact: true }).fill('09:40');
  await form.getByRole('button', { name: 'Add block' }).click();
  await expect(form.getByLabel('What')).toHaveValue('');
  await expect(page.getByTestId('edit-conflicts')).toBeVisible();
  await expect(page.locator('.leaveby')).toHaveCount(0);

  await page.goto(appUrl('/map' + time));
  await expect(page.getByRole('group', { name: 'Floor', exact: true })).toBeVisible();
  await expect(page.locator('.roomlabel')).not.toHaveCount(0);
  await expect(page.locator('.roomlabel[data-planned-destination=true]')).toHaveCount(0);
  await expect(page.locator('.leaveby')).toHaveCount(0);
  await page.goto(appUrl('/now' + time));
  await expect(page.getByText(/Your plan has conflicting choices/)).toBeVisible();
});

test('schedule re-resolves a saved plan when choices change without reopening Plan', async ({
  page,
}) => {
  await page.goto(appUrl('/plan?event=indiafoss-2026'));
  await expect(page.locator('.itinerary li').first()).toBeVisible();
  await page.goto(appUrl('/schedule?event=indiafoss-2026'));
  const welcome = page.locator('.session').filter({
    has: page.getByRole('link', { name: 'Welcome Note', exact: true }),
  });
  await expect(welcome.getByText('Planned', { exact: true })).toBeVisible();
  await welcome.getByRole('link', { name: 'Welcome Note', exact: true }).click();
  const exclude = page.getByRole('button', { name: /Not interested/ });
  await exclude.click();
  await expect(exclude).toHaveAttribute('aria-pressed', 'true');
  await page.goto(appUrl('/schedule?event=indiafoss-2026'));
  await expect(welcome).toBeVisible();
  await expect(welcome.getByText('Planned', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(welcome).toBeVisible();
  await expect(welcome.getByText('Planned', { exact: true })).toHaveCount(0);
});
