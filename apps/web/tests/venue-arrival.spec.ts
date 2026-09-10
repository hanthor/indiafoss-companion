import { expect, test } from '@playwright/test';
import { appUrl } from './app-url.js';

const OSM_LINK = 'https://osmapp.org/way/1219285692#18.89/12.9431/77.5961';

test('Getting there hands off to the organiser map and copies the address', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(appUrl('/now?event=indiafoss-2026&setup=done'));
  const card = page.getByRole('region', { name: 'Getting there' }).first();
  await expect(card).toContainText('NIMHANS Convention Centre');
  await expect(card).toContainText('Hosur Road, Bengaluru');

  const osm = card.getByRole('link', { name: 'Open in OpenStreetMap' });
  await expect(osm).toHaveAttribute('href', OSM_LINK);
  await expect(osm).toHaveAttribute('target', '_blank');
  await expect(osm).toHaveAttribute('rel', /\bnoopener\b/);
  await expect(card.getByRole('link', { name: 'Open in your maps app' })).toHaveAttribute(
    'href',
    /^geo:12\.9431,77\.5961\?q=/,
  );

  await card.getByRole('button', { name: 'Copy address' }).click();
  await expect(card.getByRole('status')).toHaveText('Address copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'NIMHANS Convention Centre, Hosur Road, Bengaluru, Karnataka, India',
  );
});

test('arrival details come from the cached bundle and survive going offline', async ({
  page,
  context,
}) => {
  await page.goto(appUrl('/?event=indiafoss-2026&setup=done'));
  const home = page.getByRole('region', { name: 'Getting there' });
  await expect(home).toContainText('NIMHANS Convention Centre');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 10_000,
  });

  await context.setOffline(true);
  await page.goto(appUrl('/now'));
  const card = page.getByRole('region', { name: 'Getting there' }).first();
  await expect(card).toContainText('NIMHANS Convention Centre');
  await expect(card.getByRole('link', { name: 'Open in OpenStreetMap' })).toHaveAttribute(
    'href',
    OSM_LINK,
  );
});
