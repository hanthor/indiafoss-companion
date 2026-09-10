import { expect, test } from '@playwright/test';
import QRCode from 'qrcode';
import { appUrl } from './app-url.js';

const ticketUrl = 'https://fossunited.org/get_tickets?id=6k1ha138pb';
test.beforeEach(async ({ page }) => {
  await page.goto(appUrl('/connect?setup=done'));
});

test('PDF QR is decoded locally, reviewed, and explicitly saved', async ({ page, context }) => {
  const documentPage = await context.newPage();
  await documentPage.setContent(
    `<img src="${await QRCode.toDataURL(ticketUrl, { width: 320 })}" />`,
  );
  const pdf = await documentPage.pdf();
  await documentPage.close();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  let openedTicket = false;
  page.on('request', (request) => {
    if (request.url().startsWith('https://fossunited.org/get_tickets')) openedTicket = true;
  });
  await page
    .getByLabel('Upload ticket PDF or image')
    .setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: pdf });
  const use = page.getByRole('button', { name: 'Save ticket::6k1ha138pb' });
  await expect(use).toBeVisible();
  await expect(page.getByLabel('Ticket reference', { exact: true })).toHaveValue('');
  await use.click();
  await expect(page.getByRole('heading', { name: 'Your contact card', exact: true })).toBeVisible();
  await expect(page.getByLabel('Ticket reference', { exact: true })).toHaveValue(
    'ticket::6k1ha138pb',
  );
  await expect(
    page.getByRole('switch', { name: 'Share Ticket reference', exact: true }),
  ).toHaveAttribute('aria-checked', 'false');
  expect(openedTicket).toBe(false);
});

test('image upload can retry after an unrelated QR without replacing the reference', async ({
  page,
}) => {
  await page.getByLabel('Ticket reference', { exact: true }).fill('ticket::existing');
  const upload = page.getByLabel('Upload ticket PDF or image');
  await upload.setInputFiles({
    name: 'other.png',
    mimeType: 'image/png',
    buffer: await QRCode.toBuffer('https://example.com'),
  });
  await expect(page.getByRole('status').filter({ hasText: 'No readable IndiaFOSS' })).toBeVisible();
  await expect(page.getByLabel('Ticket reference', { exact: true })).toHaveValue(
    'ticket::existing',
  );
  await upload.setInputFiles({
    name: 'ticket.png',
    mimeType: 'image/png',
    buffer: await QRCode.toBuffer(ticketUrl),
  });
  await page.getByRole('button', { name: 'Save ticket::6k1ha138pb' }).click();
  await expect(page.getByLabel('Ticket reference', { exact: true })).toHaveValue(
    'ticket::6k1ha138pb',
  );
});

test('contact file fills blanks, preserves typed name, and keeps private fields unshared', async ({
  page,
}) => {
  await page.goto(appUrl('/welcome'));
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Your contact card', exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Chosen name');
  await page.getByLabel('Import my contact (.vcf)').setInputFiles({
    name: 'me.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Imported name\r\nORG:My project\r\nEMAIL:me@example.com\r\nTEL:+919876543210\r\nEND:VCARD',
    ),
  });
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Chosen name');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('me@example.com');
  for (const [label, token] of [
    ['Name', 'name'],
    ['Organisation', 'organization'],
    ['Email', 'email'],
    ['Phone', 'tel'],
  ]) {
    await expect(page.getByLabel(label!, { exact: true })).toHaveAttribute('autocomplete', token!);
  }
  await page.getByRole('button', { name: 'Save →', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rank the sessions' })).toBeVisible();
  await page.goto(appUrl('/connect'));
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('me@example.com');
  await expect(page.getByRole('switch', { name: 'Share Email', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('switch', { name: 'Share Phone', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('native contact picker imports just the selected entry', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'contacts', {
      configurable: true,
      value: {
        select: async (properties: string[], options: { multiple: boolean }) => {
          if (properties.join(',') !== 'name,email,tel' || options.multiple)
            throw new Error('Unexpected contact access');
          return [{ name: ['My name'], email: ['me@example.com'], tel: ['+919876543210'] }];
        },
      },
    }),
  );
  await page.goto(appUrl('/welcome'));
  await page.getByRole('button', { name: 'Not now' }).click();
  await page.getByRole('button', { name: 'From my contacts' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My name');
  await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('+919876543210');
});

test('pasted official ticket URL saves the normalized reference', async ({ page }) => {
  await page.getByLabel('Ticket reference', { exact: true }).fill(ticketUrl);
  await expect(page.getByRole('heading', { name: 'Your contact card', exact: true })).toBeVisible();
  await expect(page.getByLabel('Ticket reference', { exact: true })).toHaveValue(
    'ticket::6k1ha138pb',
  );
});

test('camera/manual scan preview can save an official ticket link', async ({ page }) => {
  await page.goto(appUrl('/scan'));
  await page.getByLabel('Paste a vCard').fill(ticketUrl);
  await page.getByRole('button', { name: 'Preview contact', exact: true }).click();
  await page.getByRole('button', { name: 'Save my ticket reference' }).click();
  await expect(
    page.getByText('Ticket reference saved. This does not verify admission.'),
  ).toBeVisible();
  await page.goto(appUrl('/welcome'));
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByLabel('Ticket reference', { exact: true })).toHaveCount(0);
  await page.getByLabel('Name', { exact: true }).fill('Attendee');
  await page.getByRole('button', { name: 'Save →', exact: true }).click();
  await page.getByRole('button', { name: 'Later, show me around' }).click();
  await page.goto(appUrl('/connect'));
  await expect(page.getByLabel('Ticket reference', { exact: true })).toHaveValue(
    'ticket::6k1ha138pb',
  );
});
