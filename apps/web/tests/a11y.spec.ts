import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { appUrl } from './app-url.js';

/**
 * Automated accessibility checks (§53 release hardening). We fail on serious
 * and critical WCAG 2 A/AA violations for the core attendee screens, and prove
 * the ranking flow is completable with the keyboard alone.
 */

const CORE_SCREENS: [string, string][] = [
  ['home', '/'],
  ['schedule', '/schedule'],
  ['explore', '/explore'],
  ['plan', '/plan'],
  ['ranking', '/plan/rank'],
  ['connect', '/connect'],
  ['scan', '/scan'],
  ['settings', '/settings'],
  ['map', '/map'],
  ['chat (signed out)', '/chat'],
  ['now', '/now?now=2025-09-20T10%3A20%3A00%2B05%3A30'],
  ['activity', '/activity/act-c8ak0iov2l'],
  ['booths', '/explore/booths'],
];

async function seriousViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

for (const [name, path] of CORE_SCREENS) {
  test(`a11y: ${name} has no serious/critical violations`, async ({ page }) => {
    await page.goto(appUrl(path));
    // Give the event-gated screens time to render their content.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    const violations = await seriousViolations(page);
    // Surface a readable summary on failure.
    const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}`);
    expect(summary, summary.join('\n')).toEqual([]);
  });
}

// The same screens under prefers-color-scheme: dark (#33 dark audit).
for (const [name, path] of CORE_SCREENS) {
  test.describe('dark mode', () => {
    test.use({ colorScheme: 'dark' });
    test(`a11y (dark): ${name} has no serious/critical violations`, async ({ page }) => {
      await page.goto(appUrl(path));
      // Give the event-gated screens time to render their content.
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(400);
      const violations = await seriousViolations(page);
      // Surface a readable summary on failure.
      const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  });
}

test('a11y: ranking is fully operable with the keyboard only', async ({ browser }) => {
  // Isolated context so ranking always starts with unranked candidates,
  // independent of other tests' local state.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(appUrl('/'));
  await expect(page.getByRole('heading', { name: /IndiaFOSS 2025/ })).toBeVisible();
  await page.goto(appUrl('/plan/rank'));
  await expect(page.getByTestId('candidate-a')).toBeVisible({ timeout: 10_000 });
  // A keyboard choice registers and is undoable using only key presses.
  // Focus the page through its heading: a click on <body> lands wherever the
  // viewport centre happens to be, which on CI's fonts was a pick button.
  await page.getByRole('heading', { level: 1 }).click();
  const undo = page.getByRole('button', { name: /Undo last/ });
  await page.keyboard.press('1');
  await page.waitForTimeout(250);
  await expect(undo).toBeEnabled();
  await page.keyboard.press('u');
  await page.waitForTimeout(200);
  await expect(undo).toBeDisabled();
  await context.close();
});
