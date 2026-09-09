/** The publisher hashes the exact UTF-8 JSON bytes, including whitespace. */
export async function eventAssetMatches(asset: string | undefined, body: string): Promise<boolean> {
  if (!asset || !/^event\.[0-9a-f]{8}\.json$/.test(asset)) return false;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const digest = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return asset === `event.${digest.slice(0, 8)}.json`;
}
