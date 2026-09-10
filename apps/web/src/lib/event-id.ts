/**
 * Which event the web client opens on (#191).
 *
 * Kept in a plain module, separate from the loader's runes and SvelteKit
 * imports, so the default can be asserted directly against the bundles on disk
 * (`event-default.test.ts`) rather than only through the browser.
 */

/** The current conference. Both clients must agree; the native twin is `EventRepository.DEFAULT_EVENT_ID`. */
export const DEFAULT_EVENT_ID = 'indiafoss-2026';

/**
 * Every event whose bundle this build publishes. Anything else in `?event=` is
 * ignored rather than sending the app looking for a bundle that is not there.
 * The archive stays reachable; it is never the default.
 */
export const KNOWN_EVENT_IDS = ['indiafoss-2025', DEFAULT_EVENT_ID] as const;

export function isKnownEventId(id: string | null): id is (typeof KNOWN_EVENT_IDS)[number] {
  return id !== null && (KNOWN_EVENT_IDS as readonly string[]).includes(id);
}
