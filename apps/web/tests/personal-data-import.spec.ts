import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appUrl } from './app-url.js';
import { settingSaved } from './preference-saved.js';

test.use({ serviceWorkers: 'block' });

const FIXTURE = new URL(
  '../../../packages/test-fixtures/fixtures/personal-data/valid/pwa-export.json',
  import.meta.url,
);

interface Identity {
  id: string;
  proposalId: string;
  title: string;
  start: string;
}
interface Programme {
  eventId: string;
  tracks: string[];
  /** Two CFP-linked talks on the same day, the first one at least 40 minutes into it. */
  talks: [Identity, Identity];
}

type Request = <R>(req: IDBRequest<R>) => Promise<R>;

/**
 * Run a callback against the app's IndexedDB from the page. The body is
 * serialised, so everything it needs arrives through `args`; `request` awaits one IDB request.
 */
async function withDb<T, A = undefined>(
  page: Page,
  stores: string[],
  mode: IDBTransactionMode,
  body: (transaction: IDBTransaction, request: Request, args: A) => T | Promise<T>,
  args?: A,
): Promise<T> {
  return page.evaluate(
    async ({ stores, mode, body, args }) => {
      const request = <R>(req: IDBRequest<R>) =>
        new Promise<R>((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      const open = indexedDB.open('indiafoss-companion');
      const db = await request(open);
      try {
        const transaction = db.transaction(stores, mode);
        const run = new Function(
          'transaction',
          'request',
          'args',
          `return (${body})(transaction, request, args)`,
        ) as (transaction: IDBTransaction, request: unknown, args: unknown) => Promise<T>;
        const result = await run(transaction, request, args);
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        return result;
      } finally {
        db.close();
      }
    },
    { stores, mode, body: body.toString(), args },
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openSettings(page: Page): Promise<Programme> {
  await page.goto(appUrl('/settings?setup=done'));
  await expect(page.getByRole('button', { name: 'Choose personal data file' })).toBeVisible();
  await expect
    .poll(() =>
      withDb(page, ['events'], 'readonly', async (transaction, request) => {
        const rows = await request(transaction.objectStore('events').getAll());
        return rows.length;
      }),
    )
    .toBeGreaterThan(0);
  return withDb(page, ['events'], 'readonly', async (transaction, request) => {
    const rows = await request(transaction.objectStore('events').getAll());
    const bundle = rows[0].bundle;
    const talks = bundle.activities.filter(
      (a: { proposalId?: string; start?: string; cancelled?: boolean; type: string }) =>
        a.proposalId && a.start && !a.cancelled && a.type === 'talk',
    );
    const first = talks.find((a: { start: string }) => a.start.slice(11, 16) >= '10:40');
    const second = talks.find(
      (a: { start: string; id: string }) =>
        a.start.slice(0, 10) === first.start.slice(0, 10) && a.id !== first.id,
    );
    const identity = (a: { id: string; proposalId: string; title: string; start: string }) => ({
      id: a.id,
      proposalId: a.proposalId,
      title: a.title,
      start: a.start,
    });
    return {
      eventId: bundle.id,
      tracks: bundle.tracks.map((t: { id: string }) => t.id),
      talks: [identity(first), identity(second)],
    };
  });
}

/** The shared fixture with its placeholder talks bound to this programme's CFP identities. */
async function fixtureFor(programme: Programme, day = programme.talks[0].start.slice(0, 10)) {
  const file = JSON.parse(await readFile(FIXTURE, 'utf8'));
  const [a, b] = programme.talks;
  const event = file.events[0];
  event.eventId = programme.eventId;
  event.activities = [
    { eventId: programme.eventId, activityId: a.id, proposalId: a.proposalId },
    { eventId: programme.eventId, activityId: b.id, proposalId: b.proposalId },
  ];
  const rebind = (value: unknown): unknown =>
    JSON.parse(
      JSON.stringify(value)
        .replaceAll('"talk-a"', JSON.stringify(a.id))
        .replaceAll('"talk-b"', JSON.stringify(b.id))
        .replaceAll('"devroom"', JSON.stringify(programme.tracks[0]))
        .replaceAll('"other"', JSON.stringify(programme.tracks[1]))
        .replaceAll('2026-09-19', day),
    );
  event.sections = rebind(event.sections);
  return file;
}

async function chooseFile(page: Page, name: string, content: unknown): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content)),
  });
  await expect(page.getByTestId('import-preview')).toBeVisible();
}

test('previews the shared export offline, keeps differing local choices and refreshes the open app', async ({
  page,
  context,
}) => {
  const programme = await openSettings(page);
  const [a, b] = programme.talks;
  await withDb(
    page,
    ['preferences', 'settings'],
    'readwrite',
    async (transaction, _request, activityId) => {
      transaction.objectStore('preferences').put({
        activityId,
        rating: 1200,
        comparisons: 0,
        disposition: 'not-interested',
        bookmarked: false,
        triage: 'no',
      });
      transaction.objectStore('settings').put({ key: 'matrix-session', value: 'SECRET_SESSION' });
      transaction.objectStore('settings').put({
        key: 'attendee-share-selection',
        value: JSON.stringify({ name: true, email: true, socials: {} }),
      });
    },
    a.id,
  );
  const file = await fixtureFor(programme);
  file.events[0].sections.settings = { 'matrix-session': 'REMOTE_SECRET' };
  await context.setOffline(true);
  await chooseFile(page, 'phone-export.json', file);

  const additions = page.getByTestId('import-new');
  await expect(additions.getByRole('checkbox', { name: `Note: ${b.title}` })).toBeChecked();
  await expect(
    additions.getByRole('checkbox', { name: /Plan edits: plan edits for/ }),
  ).toBeChecked();
  await expect(
    additions.getByRole('checkbox', { name: 'Contact card: contact card' }),
  ).toBeChecked();
  const conflicts = page.getByTestId('import-conflicts');
  await expect(
    conflicts.getByRole('checkbox', { name: `Talk choice: ${a.title}` }),
  ).not.toBeChecked();
  await expect(conflicts).toContainText('Here: not-interested, quick pass no, rating 1200');
  await expect(
    conflicts.getByRole('checkbox', { name: /Sharing selection: contact sharing selection/ }),
  ).not.toBeChecked();
  await expect(conflicts).toContainText('Here: shares name, email');
  await expect(page.getByTestId('import-unsupported')).toContainText('events[0].sections.settings');
  await expect(page.getByTestId('import-skipped')).toHaveCount(0);

  await page.getByTestId('import-apply').click();
  await expect(page.getByRole('status').filter({ hasText: /Imported \d+ records/ })).toBeVisible();

  const stored = await withDb(
    page,
    ['preferences', 'notes', 'settings'],
    'readonly',
    async (transaction, request, ids) => ({
      preference: await request(transaction.objectStore('preferences').get(ids.a)),
      note: await request(transaction.objectStore('notes').get(ids.b)),
      settings: Object.fromEntries(
        (await request(transaction.objectStore('settings').getAll())).map(
          (row: { key: string; value: string }) => [row.key, row.value],
        ),
      ),
    }),
    { a: a.id, b: b.id },
  );
  // The local "no" survived; the file's must-attend for the same talk was not applied.
  expect(stored.preference).toMatchObject({ disposition: 'not-interested', triage: 'no' });
  expect(stored.note.body).toBe('ಕನ್ನಡ\nFollow up after the talk');
  expect(stored.settings['matrix-session']).toBe('SECRET_SESSION');
  expect(JSON.stringify(stored.settings)).not.toContain('REMOTE_SECRET');
  expect(JSON.parse(stored.settings['attendee-share-selection']!)).toEqual({
    name: true,
    email: true,
    socials: {},
  });
  expect(JSON.parse(stored.settings['attendee-profile']!)).toMatchObject({ fullName: 'Asha' });
  const day = a.start.slice(0, 10);
  expect(JSON.parse(stored.settings[`plan-edits-${programme.eventId}-${day}`]!)).toMatchObject({
    locked: [a.id, 'custom-lunch'],
    replacements: { [b.id]: a.id },
  });

  // Open screens use the imported data without a reload: the card shows the imported name
  // and the plan editor shows the imported custom block for that day. (Route chunks are not
  // precached with service workers blocked, so client navigation needs the network again.)
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Open contact card →' }).click();
  await expect(page.locator('strong', { hasText: 'Asha' }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Plan' }).click();
  await expect(page.getByText('Lunch with friends', { exact: true })).toBeVisible();

  // The same file previews as already imported.
  await page.goto(appUrl('/settings?setup=done'));
  await chooseFile(page, 'phone-export.json', file);
  await expect(page.getByTestId('import-new')).toHaveCount(0);
  await expect(page.getByTestId('import-apply')).toBeDisabled();
});

test('shows unresolved records for a changed programme and refuses a stale preview', async ({
  page,
}) => {
  const programme = await openSettings(page);
  const file = JSON.parse(await readFile(FIXTURE, 'utf8'));
  // The fixture's placeholder talks do not exist in the real programme; a re-used CFP id must
  // resolve, an unknown one must be shown rather than dropped or matched by title.
  file.events[0].eventId = programme.eventId;
  for (const reference of file.events[0].activities) reference.eventId = programme.eventId;
  file.events[0].activities[0].proposalId = programme.talks[0].proposalId;
  await chooseFile(page, 'old-export.json', file);
  const skipped = page.getByTestId('import-skipped');
  await expect(skipped).toContainText('Note: talk-b');
  await expect(skipped).toContainText('talk-b (not in this programme)');
  await expect(skipped).toContainText('Plan edits: plan for 2026-09-19');
  await expect(page.getByTestId('import-new')).toContainText(
    `Talk choice: ${programme.talks[0].title}`,
  );
  await expect(page.getByTestId('import-new')).toContainText('Contact card');

  // Someone edits the card on this device after the preview was shown.
  await withDb(page, ['settings'], 'readwrite', async (transaction) => {
    transaction.objectStore('settings').put({
      key: 'attendee-profile',
      value: JSON.stringify({ fullName: 'Edited later', socials: {} }),
    });
  });
  await page.getByTestId('import-apply').click();
  await expect(page.getByRole('alert')).toContainText('changed after the preview');
  const stored = await withDb(
    page,
    ['preferences', 'settings'],
    'readonly',
    async (transaction, request) => ({
      preferences: await request(transaction.objectStore('preferences').count()),
      profile: await request(transaction.objectStore('settings').get('attendee-profile')),
    }),
  );
  expect(stored.preferences).toBe(0);
  expect(JSON.parse(stored.profile.value).fullName).toBe('Edited later');
  await expect(page.getByTestId('import-preview')).toHaveCount(0);

  // A fresh preview shows the newer card as a conflict and imports the rest.
  await chooseFile(page, 'old-export.json', file);
  await expect(page.getByTestId('import-conflicts')).toContainText('Here: 1 field, 0 social links');
  await page.getByTestId('import-apply').click();
  await expect(page.getByRole('status').filter({ hasText: /Imported \d+ records/ })).toBeVisible();
});

test('rejects a corrupt section without changing anything', async ({ page }) => {
  const programme = await openSettings(page);
  const file = await fixtureFor(programme);
  file.events[0].sections.preferences[0].disposition = 'favourite';
  await page.locator('input[type="file"]').setInputFiles({
    name: 'corrupt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.getByRole('alert')).toContainText('preferences[0].disposition');
  await expect(page.getByRole('alert')).toContainText('Nothing was changed');
  await expect(page.getByTestId('import-preview')).toHaveCount(0);
  const count = await withDb(page, ['preferences'], 'readonly', (transaction, request) =>
    request(transaction.objectStore('preferences').count()),
  );
  expect(count).toBe(0);
});

test('an imported must-attend plan drives the Now banner and reminders without a reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    class GrantedNotification {
      static permission = 'granted';
      close() {}
    }
    Object.defineProperty(window, 'Notification', { value: GrantedNotification });
  });
  const programme = await openSettings(page);
  const [a] = programme.talks;
  await page.getByRole('switch', { name: 'Enable reminders' }).click();
  await settingSaved(page, 'notifications-enabled', 'true');

  const file = await fixtureFor(programme);
  // Only the choice and the lock: no custom block competing for the slot.
  file.events[0].sections = {
    preferences: file.events[0].sections.preferences,
    plans: [
      {
        day: a.start.slice(0, 10),
        locked: [a.id],
        removed: [],
        replacements: {},
        customBlocks: [],
      },
    ],
  };
  delete file.contact;
  await chooseFile(page, 'phone-export.json', file);
  await page.getByTestId('import-apply').click();
  await expect(page.getByRole('status').filter({ hasText: /Imported 2 records/ })).toBeVisible();

  // Start the day simulator from Settings, 35 simulated minutes before the imported talk.
  const startMs = Date.parse(a.start) - 35 * 60_000;
  const local = new Date(startMs + 5.5 * 3_600_000).toISOString();
  await page.getByRole('combobox', { name: /^Day/ }).selectOption(a.start.slice(0, 10));
  await page.locator('input[type="time"]').fill(local.slice(11, 16));
  await page.getByRole('combobox', { name: /^Speed/ }).selectOption('600');
  await page.getByRole('button', { name: 'Start simulation' }).click();
  await expect(page).toHaveURL(/\/now/);
  await expect(
    page.getByRole('link', {
      name: new RegExp(`Must attend.*${escapeRegExp(a.title.slice(0, 20))}`),
    }),
  ).toBeVisible();
  const startIso = new Date(Date.parse(a.start) + 60_000).toISOString();
  await page.waitForFunction(
    (until) => Date.parse(window.__indiafossSim?.state().now ?? '0') >= Date.parse(until),
    startIso,
    { timeout: 30_000 },
  );
  const fired = await page.evaluate(() =>
    window
      .__indiafossSim!.log()
      .filter((e) => e.kind === 'notification')
      .map((e) => e.title),
  );
  // Long titles are shortened in notifications; the session must still be the imported one.
  const short = a.title.slice(0, 30);
  expect(fired.some((title) => title.startsWith(`In 30 min: ${short}`))).toBe(true);
  expect(fired.some((title) => title.startsWith(`Starting now: ${short}`))).toBe(true);
});
