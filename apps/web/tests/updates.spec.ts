import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { appUrl } from './app-url.js';
import { preferenceSaved } from './preference-saved.js';

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
