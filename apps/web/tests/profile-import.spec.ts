import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

test.use({ serviceWorkers: 'block' });

test('profile preview fills blanks without replacing edits or enabling email sharing', async ({
  page,
}) => {
  await page.route('https://api.github.com/users/asha', (route) =>
    route.fulfill({
      json: {
        name: 'Asha Menon',
        company: '@Community',
        email: 'asha@example.org',
        html_url: 'https://github.com/asha',
        blog: 'https://asha.example',
      },
    }),
  );
  await page.route('https://api.github.com/users/asha/social_accounts', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto(appUrl('/connect?setup=done'));
  await page.getByLabel('Name', { exact: true }).fill('My chosen name');
  const importer = page.getByRole('region', { name: 'Import your profile' });
  await importer.getByLabel('Username or profile URL').fill('asha');
  await importer.getByRole('button', { name: 'Find profile' }).click();
  await expect(importer.getByLabel('Profile preview')).toContainText('asha@example.org');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My chosen name');
  await importer.getByRole('button', { name: 'Use this profile' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My chosen name');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('asha@example.org');
  await expect(page.getByRole('switch', { name: /Share Email/i })).not.toBeChecked();
});

test('a failed lookup can be retried and preview cancelled without changing the card', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('https://api.github.com/users/asha', (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 429 })
      : route.fulfill({ json: { name: 'Asha Menon', html_url: 'https://github.com/asha' } });
  });
  await page.route('https://api.github.com/users/asha/social_accounts', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto(appUrl('/connect?setup=done'));
  const importer = page.getByRole('region', { name: 'Import your profile' });
  await importer.getByLabel('Username or profile URL').fill('asha');
  await importer.getByRole('button', { name: 'Find profile' }).click();
  await expect(importer.getByRole('status')).toContainText('limiting requests');
  await importer.getByRole('button', { name: 'Find profile' }).click();
  await expect(importer.getByLabel('Profile preview')).toContainText('Asha Menon');
  await importer.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
});

test('onboarding can create a card from a profile without a phone contact', async ({ page }) => {
  await page.route('https://api.github.com/users/asha', (route) =>
    route.fulfill({
      json: { name: 'Asha Menon', company: 'Community', html_url: 'https://github.com/asha' },
    }),
  );
  await page.route('https://api.github.com/users/asha/social_accounts', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto(appUrl('/welcome'));
  await page.getByRole('button', { name: 'Not now', exact: true }).click();
  await page.getByRole('button', { name: 'No ticket yet →', exact: true }).click();
  await page.getByLabel('Username or profile URL').fill('asha');
  await page.getByRole('button', { name: 'Find profile', exact: true }).click();
  await page.getByRole('button', { name: 'Use this profile', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Asha Menon');
  await page.getByRole('button', { name: 'Save →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rank the sessions', exact: true })).toBeVisible();
  await page.goto(appUrl('/connect'));
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Asha Menon');
});

test('changing the username discards an older lookup result', async ({ page }) => {
  let releaseOld: () => void = () => {};
  const oldResponse = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let oldStarted = false;
  await page.route('https://api.github.com/users/old', async (route) => {
    oldStarted = true;
    await oldResponse;
    await route.fulfill({ json: { name: 'Old profile', html_url: 'https://github.com/old' } });
  });
  await page.route('https://api.github.com/users/new', (route) =>
    route.fulfill({
      json: { name: 'New profile', html_url: 'https://github.com/new' },
    }),
  );
  await page.route('https://api.github.com/users/*/social_accounts', (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto(appUrl('/connect?setup=done'));
  const input = page.getByLabel('Username or profile URL');
  await input.fill('old');
  await page.getByRole('button', { name: 'Find profile', exact: true }).click();
  await expect.poll(() => oldStarted).toBe(true);
  await input.fill('new');
  await page.getByRole('button', { name: 'Find profile', exact: true }).click();
  await expect(page.getByLabel('Profile preview')).toContainText('New profile');
  const finished = page.waitForResponse('https://api.github.com/users/old/social_accounts');
  releaseOld();
  await finished;
  await page.getByRole('button', { name: 'Use this profile', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('New profile');
});
