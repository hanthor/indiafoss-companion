import { expect, test } from '@playwright/test';
import { generateHandshakeKeyPair, signedAttendeeVCard } from '@indiafoss/model';
import { appUrl } from './app-url.js';

/**
 * The two halves of an exchange borrowed from SimpleX: a dated card, so a
 * photographed code is told apart from a live one, and "now show yours", so
 * a contact is not left one-sided.
 */

const profile = { fullName: 'Asha Rao', organization: 'FOSS United', socials: {} };
const selection = {
  name: true,
  organization: true,
  email: false,
  phone: false,
  website: false,
  matrixId: false,
  neutrinoServerName: false,
  ticketRef: false,
  fossUnitedProfileUrl: false,
  socials: {},
};

test('a signed card issued hours ago is flagged as a photograph, a live one is not', async ({
  page,
}) => {
  const pair = await generateHandshakeKeyPair();
  const stale = await signedAttendeeVCard(profile, selection, pair, {
    issuedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
  });
  await page.goto(appUrl(`/scan?payload=${encodeURIComponent(stale)}`));
  await expect(page.getByTestId('card-stale')).toContainText('photograph or a screenshot');
  await expect(page.getByTestId('card-fresh')).toHaveCount(0);
  // Still saveable: the person may well be real. The row keeps the verdict.
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('link', { name: 'View contact', exact: true }).click();
  await expect(page.getByRole('button', { name: /Asha Rao/ })).toContainText(
    'CODE OLDER THAN 60 MIN WHEN SCANNED',
  );

  const live = await signedAttendeeVCard(profile, selection, pair);
  await page.goto(appUrl(`/scan?payload=${encodeURIComponent(live)}`));
  await expect(page.getByTestId('card-fresh')).toContainText('Live code');
  await expect(page.getByTestId('card-stale')).toHaveCount(0);
});

test('a re-dated card fails its signature instead of passing as fresh', async ({ page }) => {
  const pair = await generateHandshakeKeyPair();
  const issuedAt = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
  const stale = await signedAttendeeVCard(profile, selection, pair, { issuedAt });
  const redated = stale.replace(issuedAt, new Date().toISOString());
  await page.goto(appUrl(`/scan?payload=${encodeURIComponent(redated)}`));
  await expect(page.getByTestId('card-fresh')).toHaveCount(0);
  await expect(page.getByTestId('card-stale')).toHaveCount(0);
  await expect(page.locator('.preview')).toContainText('Card signature does not match');
});

test('after saving, the scanner shows your own card and records a mutual exchange', async ({
  page,
}) => {
  const plain = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Riya Verma', 'END:VCARD'].join('\r\n');
  await page.goto(appUrl(`/scan?payload=${encodeURIComponent(plain)}`));
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  const panel = page.getByTestId('show-yours');
  await expect(panel).toContainText('Let Riya Verma scan this code');
  await expect(panel.getByTestId('my-card-qr')).toBeVisible();
  await panel.getByTestId('they-scanned-mine').click();
  await expect(panel).toContainText('Marked as a mutual exchange');

  await page.getByRole('link', { name: 'View contact', exact: true }).click();
  const row = page.getByRole('button', { name: /Riya Verma/ });
  await expect(row).toContainText('MUTUAL EXCHANGE');
  // The link opens the saved contact's detail panel already.
  await page.getByRole('button', { name: 'Undo mutual exchange' }).click();
  await expect(page.getByTestId('mutual-chip')).toHaveCount(0);
  await page.getByRole('button', { name: 'They scanned mine' }).click();
  await expect(page.getByTestId('mutual-chip')).toBeVisible();
});
