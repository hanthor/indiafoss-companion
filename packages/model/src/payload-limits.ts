/** Shared ceiling for encoded scan, friend-card and handoff input, measured in UTF-8 bytes. */
export const MAX_SCAN_PAYLOAD_BYTES = 8192;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
