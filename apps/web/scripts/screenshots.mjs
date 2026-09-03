// Capture the README screenshots from the built PWA.
//
// The app is time-travelled to a moment when a session is actually running
// (`?now=`) and told where the attendee is standing (`?at=`), so the shots show
// live rooms and a real itinerary instead of empty states. Run against a build:
//
//   pnpm --filter @indiafoss/web build
//   pnpm --filter @indiafoss/web screenshots
//
// Output: docs/screenshots/<name>.png, committed so the README renders them.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, '..', 'build');
const out = join(here, '..', '..', '..', 'docs', 'screenshots');

/** A moment on day one when talks are running in every hall. */
const NOW = '2025-09-20T10:20:00+05:30';
/** Where the attendee is standing, as a room QR would set it. */
const AT = 'audi-1';

const q = `now=${encodeURIComponent(NOW)}&at=${AT}&event=indiafoss-2025`;

/** name, path, colour scheme, and an optional bit of setup before the shot. */
const SHOTS = [
  ['now', `/now?${q}`, 'light'],
  ['home', `/?${q}`, 'light'],
  ['schedule', `/schedule?${q}`, 'light'],
  ['rank', `/plan/rank?mode=pairs&${q}`, 'light'],
  ['plan', `/plan?${q}`, 'dark'],
  ['map', `/map?${q}`, 'dark'],
  ['connect', `/connect?${q}`, 'dark', fillCard],
  ['explore', `/explore?${q}`, 'light', search],
  ['session', `/activity/act-c8ak0iov2l?${q}`, 'light'],
];

async function fillCard(page) {
  await page.getByLabel('Name', { exact: true }).fill('Asha Menon');
  await page.getByLabel('Organisation', { exact: true }).fill('FOSS United');
  await page.getByLabel('GitHub', { exact: true }).fill('ashamenon');
  // Filling the fields scrolls them into view; the QR is the point of the shot.
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function search(page) {
  const box = page.getByRole('searchbox').first();
  await box.fill('kernel');
  await page.waitForTimeout(400);
}

mkdirSync(out, { recursive: true });

// Serve the build the same way `pnpm preview` does, on a port of its own so a
// running dev server or Playwright's own server is left alone.
const server = spawn('pnpm', ['exec', 'sirv', build, '--single', '--port', '4179'], {
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 2500));

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

for (const [name, path, scheme, setup] of SHOTS) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    permissions: ['camera'],
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4179${path}`, { waitUntil: 'networkidle' });
  // The bundle lands in IndexedDB on first paint; give the stores a beat.
  await page.waitForTimeout(900);
  if (setup) await setup(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`screenshots: ${name}.png (${scheme})`);
  await context.close();
}

await browser.close();
server.kill();
// sirv keeps the event loop alive after kill(); the captures are done.
process.exit(0);
