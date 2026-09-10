import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { eventAssetMatches } from './event-asset';

it('checks the exact published bytes, including UTF-8 and whitespace', async () => {
  const body = '{"name":"ಕನ್ನಡ"}\n';
  const asset = `event.${createHash('sha256').update(body).digest('hex').slice(0, 8)}.json`;
  expect(await eventAssetMatches(asset, body)).toBe(true);
  expect(await eventAssetMatches(asset, body.trim())).toBe(false);
  expect(await eventAssetMatches(asset, '{"name":"Another event"}\n')).toBe(false);
});

it('rejects missing, mutable and non-local asset names', async () => {
  for (const asset of [
    undefined,
    'event-bundle.json',
    '../event.12345678.json',
    'https://example.org/event.12345678.json',
  ]) {
    expect(await eventAssetMatches(asset, '{}')).toBe(false);
  }
});

it('agrees with the real publisher asset and digest', async () => {
  const published = new URL('../../../../events/indiafoss-2026/published/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', published), 'utf8'));
  const body = readFileSync(new URL(manifest.assets.event, published), 'utf8');
  expect(await eventAssetMatches(manifest.assets.event, body)).toBe(true);
});
