// Walk the built PWA through a conference day at speed and report what an
// attendee would have been shown: every reminder, every change of the
// leave-by banner, and the screens visited (#93). The report is what an
// agent or a person reads to judge whether the day's UX is right.
//
//   pnpm --filter @indiafoss/web build
//   pnpm --filter @indiafoss/web simulate            # day one, 09:00, 600x
//   pnpm --filter @indiafoss/web simulate -- --day 2025-09-21 --from 08:30 --speed 300 --until 13:00
//
// Output: simulation-report.json and a timeline on stdout.
import { chromium, devices } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, '..', 'build');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? 'true'] : null))
    .filter(Boolean),
);
const DAY = args.day ?? '2025-09-20';
const FROM = args.from ?? '09:00';
const UNTIL = args.until ?? '18:30';
const SPEED = Number(args.speed ?? 600);
const OFFSET = '+05:30';
/** Sessions to mark before the run: must-attend and bookmarked, by id. */
const MUST = (args.must ?? 'act-c8ak0iov2l').split(',').filter(Boolean);
const BOOKMARK = (args.bookmark ?? '').split(',').filter(Boolean);
/** Screens the walk-through cycles through while the day runs. */
const SCREENS = ['/now', '/plan', '/map', '/schedule'];

const startIso = `${DAY}T${FROM}:00${OFFSET}`;
const untilIso = `${DAY}T${UNTIL}:00${OFFSET}`;

const server = spawn('pnpm', ['exec', 'sirv', build, '--single', '--port', '4181'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));
const origin = 'http://127.0.0.1:4181';

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  permissions: ['notifications'],
});
const page = await context.newPage();

try {
  // Not 'networkidle': blocked third-party requests can keep a page from ever settling.
  await page.goto(`${origin}/`);
  await page.getByRole('heading', { name: /IndiaFOSS/ }).waitFor();

  for (const id of MUST) {
    await page.goto(`${origin}/activity/${id}`);
    await page.getByRole('button', { name: /Must attend/ }).click();
  }
  for (const id of BOOKMARK) {
    await page.goto(`${origin}/activity/${id}`);
    await page.getByRole('button', { name: /Bookmark/ }).click();
  }
  await page.goto(`${origin}/settings`);
  await page.getByRole('switch', { name: /Enable reminders/ }).check();

  await page.goto(`${origin}/now?now=${encodeURIComponent(startIso)}&speed=${SPEED}`);
  await page.getByTestId('sim-strip').waitFor();

  // Cycle the screens every couple of real seconds until the day is over.
  let screen = 0;
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const now = await page.evaluate(() => window.__indiafossSim?.state().now ?? '');
    if (!now || now >= untilIso || Date.now() > deadline) break;
    await page.waitForTimeout(2000);
    screen = (screen + 1) % SCREENS.length;
    await page.goto(`${origin}${SCREENS[screen]}`);
  }

  const state = await page.evaluate(() => window.__indiafossSim?.state());
  const log = await page.evaluate(() => window.__indiafossSim?.log() ?? []);
  const report = { day: DAY, from: FROM, until: UNTIL, speed: SPEED, endedAt: state?.now, log };
  writeFileSync(join(here, '..', 'simulation-report.json'), JSON.stringify(report, null, 2));

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`Simulated ${DAY} ${FROM}–${UNTIL} at ${SPEED}× (ended ${state?.now ?? '?'})\n`);
  for (const e of log) {
    if (e.kind === 'screen') continue;
    console.log(
      `${e.simAt.slice(11, 16)}  ${pad(e.kind, 12)} ${e.title}${e.body ? ` — ${e.body}` : ''}`,
    );
  }
  const fired = log.filter((e) => e.kind === 'notification').length;
  const banners = log.filter((e) => e.kind === 'banner').length;
  console.log(
    `\n${fired} reminders fired, ${banners} banner changes, ${log.filter((e) => e.kind === 'screen').length} screen visits.`,
  );
  console.log('Full log: apps/web/simulation-report.json');
} finally {
  await browser.close();
  server.kill();
}
