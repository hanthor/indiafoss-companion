import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { appUrl } from './app-url.js';
import { preferenceSaved, settingSaved } from './preference-saved.js';

// These regression scenarios use stable IDs and times from the archived fixture.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('selected-event', 'indiafoss-2025'));
});

/**
 * Production revision handling (#7). `app.spec.ts` covers the happy path — a
 * newer revision is offered, downloaded in full, then applied. These are the
 * cases that decide whether it is safe to publish a change mid-conference:
 * what happens to an attendee's own data across an update, what happens when
 * the network is not there, and what happens when a revision changes nothing.
 */

/** "First Step into Open Source with AOSP", the session the attendee keeps. */
const KEPT = 'act-c8ak0iov2l';
/** A different session, renamed by the organisers in the new revision. */
const RENAMED = 'act-akru0m7eqk';

/**
 * The service worker must not be running for these tests.
 *
 * They work by intercepting the manifest and the revision asset with
 * `page.route`, and Playwright's routing does not see requests a service
 * worker makes on the page's behalf. With the worker active the app fetches
 * the *real* manifest, finds no new revision, and the banner never appears —
 * so every assertion here silently tests nothing, or fails for a reason that
 * has nothing to do with revision handling.
 *
 * The offline gate covers the worker itself; this file covers what the app
 * does with a revision, and needs the network under its own control.
 */
test.use({ serviceWorkers: 'block' });

const MANIFEST = /\/events\/indiafoss-2025\/manifest\.json/;
const NEW_ASSET = /\/events\/indiafoss-2025\/event\.deadbeef\.json/;

/**
 * The published bundle, read from Node rather than the page: the page may be
 * on a nested route, where a relative fetch resolves somewhere else entirely.
 */
async function publishedBundle(request: APIRequestContext): Promise<Record<string, unknown>> {
  const res = await request.get(appUrl('/events/indiafoss-2025/event-bundle.json'));
  expect(res.ok(), 'the published bundle must be served').toBe(true);
  return res.json();
}

/** Serve `bundle` as revision `revision`, the way the sync pipeline would. */
async function publish(page: Page, revision: number, bundle: unknown): Promise<void> {
  await page.route(MANIFEST, (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        eventId: 'indiafoss-2025',
        generatedAt: '2026-09-08T12:00:00Z',
        revision,
        assets: { event: 'event.deadbeef.json' },
      },
    }),
  );
  await page.route(NEW_ASSET, (route) => route.fulfill({ json: bundle }));
}

test('an applied revision keeps the bookmarks and ratings attached to stable ids', async ({
  page,
  request,
}) => {
  await page.goto(appUrl('/?setup=done'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  // The attendee's own data: a bookmark, a must-attend mark, and a rating from
  // one head-to-head answer.
  await page.goto(appUrl(`/activity/${KEPT}`));
  await page.getByRole('button', { name: /Bookmark/ }).click();
  await expect(page.getByRole('button', { name: /Bookmark/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /Must attend/ }).click();
  await preferenceSaved(page, KEPT);
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await page.getByTestId('candidate-a').click();
  await expect(page.getByText(/[1-9]\d* CHOICES? · \d+ OVERLAPS? OPEN/)).toBeVisible();

  // A revision that renames a different session entirely.
  const current = await publishedBundle(request);
  const next = structuredClone(current) as {
    activities: { id: string; title: string }[];
  };
  const renamed = next.activities.find((a) => a.id === RENAMED)!;
  renamed.title = 'Renamed by the organisers';
  await publish(page, 999, next);

  await page.goto(appUrl('/schedule'));
  const banner = page.getByRole('status', { name: 'Schedule update available' });
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await banner.getByRole('button', { name: 'Update' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByText('Renamed by the organisers')).toBeVisible();

  // The ids did not move, so everything the attendee did is still attached.
  await page.goto(appUrl(`/activity/${KEPT}`));
  await expect(page.getByRole('button', { name: /Bookmark/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /Must attend/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // The rating survived too: the ranking still counts the answer.
  await page.goto(appUrl('/plan/rank?mode=pairs'));
  await expect(page.getByText(/[1-9]\d* CHOICES? · \d+ OVERLAPS? OPEN/)).toBeVisible();
  // And the plan still pins the must-attend session by its id.
  await page.goto(appUrl('/plan'));
  await expect(page.getByRole('link', { name: /First Step into Open Source/ }).first()).toBeVisible(
    {
      timeout: 10_000,
    },
  );
});

test('a revision that changes nothing is never offered, and is not re-offered later', async ({
  page,
  request,
}) => {
  await page.goto(appUrl('/?setup=done'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  // A higher revision number carrying an identical programme: a re-publish
  // with only metadata touched must not interrupt anyone.
  await publish(page, 999, await publishedBundle(request));

  // Wait for the app to have actually fetched and inspected the new asset:
  // `toBeHidden` on a banner that has not rendered yet passes instantly, which
  // would make the assertions below prove nothing.
  const inspected = page.waitForRequest(NEW_ASSET);
  await page.goto(appUrl('/schedule'));
  await inspected;
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 10_000 });
  const banner = page.getByRole('status', { name: 'Schedule update available' });
  await expect(banner).toBeHidden();

  await settingSaved(page, 'event-revision-indiafoss-2025', '999');
  // It was recorded as seen, so a later visit does not even fetch it again.
  let refetched = false;
  page.on('request', (r) => {
    if (NEW_ASSET.test(r.url())) refetched = true;
  });
  await page.goto(appUrl('/schedule'));
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 10_000 });
  await expect(banner).toBeHidden();
  expect(refetched, 'a revision already seen must not be downloaded again').toBe(false);

  // Control: the same setup with a real change does raise it, so the two
  // assertions above are about the no-op and not about a banner that never
  // works.
  const changed = structuredClone(await publishedBundle(request)) as {
    activities: { id: string; title: string }[];
  };
  changed.activities.find((a) => a.id === RENAMED)!.title = 'Renamed by the organisers';
  await publish(page, 1000, changed);
  // Wait for the app to fetch and inspect the new asset, for the same reason
  // the no-op case above does: the banner appears only after the comparison,
  // and asserting on it before the fetch has even been made is a race the
  // control loses often enough to fail this file on unrelated pull requests.
  const inspectedAgain = page.waitForRequest(NEW_ASSET);
  await page.goto(appUrl('/schedule'));
  await inspectedAgain;
  await expect(banner).toBeVisible({ timeout: 10_000 });
});

test('an unreachable manifest leaves the cached schedule usable', async ({ page, request }) => {
  await page.goto(appUrl('/?setup=done'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  // Network-first, but the network is gone: the check must fail quietly and
  // fall back to the revision already downloaded.
  await page.route(MANIFEST, (route) => route.abort('connectionfailed'));

  // Wait for the check to have been attempted and failed before concluding
  // anything from the absence of a banner.
  const attempted = page.waitForRequest(MANIFEST);
  await page.goto(appUrl('/schedule'));
  await attempted;
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status', { name: 'Schedule update available' })).toBeHidden();

  // The whole cached programme still works: search, a session, the plan.
  await page.getByPlaceholder('Search sessions…').fill('AOSP');
  await expect(page.getByRole('article').first()).toBeVisible();
  await page.goto(appUrl(`/activity/${KEPT}`));
  await expect(page.getByRole('heading', { name: /First Step into Open Source/ })).toBeVisible();

  // Control: once the manifest is reachable again the update is picked up, so
  // the silence above was the failed request and not a dead code path.
  await page.unroute(MANIFEST);
  const changed = structuredClone(await publishedBundle(request)) as {
    activities: { id: string; title: string }[];
  };
  changed.activities.find((a) => a.id === RENAMED)!.title = 'Renamed by the organisers';
  await publish(page, 1000, changed);
  await page.goto(appUrl('/schedule'));
  await expect(page.getByRole('status', { name: 'Schedule update available' })).toBeVisible({
    timeout: 10_000,
  });
});

test('an open foreground schedule polls again and pauses while hidden', async ({ page }) => {
  await page.clock.install({ time: new Date('2025-09-20T10:00:00+05:30') });
  let checks = 0;
  await page.route(MANIFEST, (route) => {
    checks += 1;
    return route.fulfill({
      json: {
        schemaVersion: 1,
        eventId: 'indiafoss-2025',
        generatedAt: '2026-09-08T12:00:00Z',
        revision: 1,
        assets: { event: 'event.deadbeef.json' },
      },
    });
  });
  await page.goto(appUrl('/settings?setup=done'));
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect.poll(() => checks).toBeGreaterThan(0);
  // Let the initial request finish before advancing its timeout clock.
  await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeEnabled();
  const initial = checks;
  await page.clock.runFor(61_000);
  await expect.poll(() => checks).toBeGreaterThan(initial);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = checks;
  await page.clock.runFor(120_000);
  expect(checks).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => checks).toBeGreaterThan(hidden);
});

async function savedEvent(
  page: Page,
): Promise<{ revision?: number; bundle: Record<string, unknown> }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('indiafoss-companion');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const get = db.transaction('events').objectStore('events').get('indiafoss-2025');
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      });
    } finally {
      db.close();
    }
  });
}

test('a failed atomic save keeps the old schedule and offers the same downloaded update for retry', async ({
  page,
  request,
}) => {
  await page.goto(appUrl('/settings?setup=done'));
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const changed = (await publishedBundle(request)) as { activities: { title: string }[] };
  changed.activities[0]!.title = 'Atomic update succeeds on retry';
  await publish(page, 999, changed);
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  const banner = page.getByRole('status', { name: 'Schedule update available' });
  await expect(banner).toBeVisible();
  const before = await savedEvent(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (fail && this.name === 'settings' && value.key === 'event-revision-indiafoss-2025') {
        fail = false;
        throw new DOMException('Simulated storage full', 'QuotaExceededError');
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await banner.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(banner.getByRole('alert')).toContainText('The update could not be saved');
  const failed = await savedEvent(page);
  expect(failed.bundle).toEqual(before.bundle);
  expect(failed.revision).toBe(before.revision);
  await banner.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(banner).toBeHidden();
  expect((await savedEvent(page)).revision).toBe(999);
  await page.goto(appUrl('/schedule'));
  await expect(page.getByText('Atomic update succeeds on retry')).toBeVisible();
});

test('metadata-only updates persist without a banner, including across reload', async ({
  page,
  request,
}) => {
  await page.goto(appUrl('/settings?setup=done'));
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const updated = { ...(await publishedBundle(request)), name: 'IndiaFOSS corrected metadata' };
  await publish(page, 999, updated);
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await settingSaved(page, 'event-revision-indiafoss-2025', '999');
  await expect(page.getByRole('status', { name: 'Schedule update available' })).toBeHidden();
  await page.reload();
  expect((await savedEvent(page)).bundle.name).toBe(updated.name);
  expect((await savedEvent(page)).revision).toBe(999);
});

test('a manifest for a different event cannot advance the saved revision', async ({ page }) => {
  await page.goto(appUrl('/settings?setup=done'));
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.route(MANIFEST, (route) =>
    route.fulfill({
      json: {
        schemaVersion: 1,
        eventId: 'indiafoss-2026',
        generatedAt: '2026-09-08T12:00:00Z',
        revision: 999,
        assets: { event: 'event.deadbeef.json' },
      },
    }),
  );
  await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
  await expect(page.getByText(/manifest is invalid or belongs to another event/)).toBeVisible();
  expect((await savedEvent(page)).revision).not.toBe(999);
});

test('a reinstated session is saved as active while keeping its bookmark', async ({
  page,
  request,
}) => {
  const active = (await publishedBundle(request)) as {
    activities: { id: string; cancelled?: boolean }[];
  };
  const cancelled = structuredClone(active);
  cancelled.activities.find((activity) => activity.id === KEPT)!.cancelled = true;
  await page.route('**/events/indiafoss-2025/event-bundle.json', (route) =>
    route.fulfill({ json: cancelled }),
  );
  await publish(page, 1, cancelled);
  await page.goto(appUrl(`/activity/${KEPT}?setup=done`));
  await page.getByRole('button', { name: /Bookmark/ }).click();
  await preferenceSaved(page, KEPT);
  await publish(page, 2, active);
  await page.goto(appUrl('/settings'));
  const banner = page.getByRole('status', { name: 'Schedule update available' });
  await expect(banner).toContainText('1 session back on');
  await banner.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(banner).toBeHidden();
  const stored = await savedEvent(page);
  expect(
    (stored.bundle.activities as { id: string; cancelled?: boolean }[]).find(
      (activity) => activity.id === KEPT,
    )?.cancelled,
  ).not.toBe(true);
  expect(stored.revision).toBe(2);
  await page.goto(appUrl(`/activity/${KEPT}`));
  await expect(page.getByRole('button', { name: /Bookmark/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

for (const failure of ['manifest', 'asset'] as const) {
  test(`a failed ${failure} download retries on reconnect without reloading`, async ({
    page,
    request,
  }) => {
    const bundle = await publishedBundle(request);
    await publish(page, 9999, bundle);
    let failing = true;
    await page.route(failure === 'manifest' ? MANIFEST : NEW_ASSET, async (route) => {
      if (failing) await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
      else await route.fallback();
    });
    await page.goto(appUrl('/settings?setup=done'));
    await expect(page.getByText(/Last check failed:/)).toBeVisible();
    failing = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText(/Last check failed:/)).toHaveCount(0);
    await settingSaved(page, 'event-revision-indiafoss-2025', '9999');
  });
}
