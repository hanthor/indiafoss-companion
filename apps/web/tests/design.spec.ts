import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

/**
 * Design guard (#33), the runtime half. `design-tokens.test.ts` checks that no
 * component writes a raw colour; this checks that the tokens those components
 * point at actually resolve, differ between the themes, and keep the loading
 * skeleton and the dark surfaces readable.
 *
 * Pixel snapshots were considered and left out on purpose: baselines captured
 * in a sandbox do not match CI's browser build, so they fail on font
 * rendering rather than on design drift. The axe sweep in `a11y.spec.ts`
 * already covers contrast on every route in both themes; what was missing was
 * proof that the token layer itself is intact, which is what this adds.
 */

/** The roles a screen is allowed to rely on, and whether the theme must change them. */
const TOKENS = [
  { name: '--paper', themed: true },
  { name: '--surface', themed: true },
  { name: '--surface-raised', themed: true },
  { name: '--text', themed: true },
  { name: '--text-muted', themed: true },
  { name: '--line', themed: true },
  // Dark text on the dark palette's brighter mint fill reads better than
  // white, so this one flips with the theme.
  { name: '--on-strong', themed: true },
  // Fixed by role: a surface that is dark in both themes, and the QR plate
  // that has to stay white or it will not scan.
  { name: '--on-ink', themed: false },
  { name: '--qr-plate', themed: false },
  { name: '--radius', themed: false },
  { name: '--radius-lg', themed: false },
];

async function tokens(page: import('@playwright/test').Page): Promise<Record<string, string>> {
  return page.evaluate(
    (names: string[]) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n).trim()]));
    },
    TOKENS.map((t) => t.name),
  );
}

test('every design token resolves, and the themed ones actually change', async ({ browser }) => {
  const light = await browser.newContext({ colorScheme: 'light' });
  const dark = await browser.newContext({ colorScheme: 'dark' });
  const lightPage = await light.newPage();
  const darkPage = await dark.newPage();
  await lightPage.goto(appUrl('/?setup=done'));
  await darkPage.goto(appUrl('/?setup=done'));
  await expect(lightPage.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  await expect(darkPage.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();

  const inLight = await tokens(lightPage);
  const inDark = await tokens(darkPage);

  for (const { name, themed } of TOKENS) {
    // A token a component points at must never resolve to nothing.
    expect(inLight[name], `${name} is undefined in light`).not.toBe('');
    expect(inDark[name], `${name} is undefined in dark`).not.toBe('');
    if (themed) {
      expect(inDark[name], `${name} must differ in dark mode`).not.toBe(inLight[name]);
    } else {
      expect(inDark[name], `${name} is a fixed role and must not change`).toBe(inLight[name]);
    }
  }
  await light.close();
  await dark.close();
});

test('the first load shows a skeleton of what is coming, not a bare line of text', async ({
  page,
}) => {
  // Hold the bundle back so the loading state is the state under test.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/event-bundle\.json|event\.[0-9a-f]+\.json/, async (route) => {
    await held;
    await route.continue();
  });

  await page.goto(appUrl('/?setup=done'));
  const loading = page.locator('section[aria-busy="true"]');
  await expect(loading).toBeVisible();
  // The placeholder bars are decoration; the announcement is the content.
  await expect(page.getByRole('status')).toContainText('Downloading the IndiaFOSS schedule');
  expect(await loading.locator('[aria-hidden="true"]').count()).toBeGreaterThan(3);

  release();
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  await expect(loading).toBeHidden();
});
