import { base } from '$app/paths';
import { CompanionStorage } from '@indiafoss/storage';
import type { ConferenceDirectory, EventManifest } from '@indiafoss/model/contracts';
import { acceptDirectory } from '$lib/directory-accept';
export { acceptDirectory } from '$lib/directory-accept';

/**
 * The published room directory (C-06): read from the asset the manifest
 * names, validated against the contract, and kept beside the bundle.
 *
 * Last good value wins. A directory that fails validation, or an asset that
 * cannot be fetched, leaves whatever was stored before in place; an event
 * that publishes no directory simply has none. Nothing here ever creates a
 * room, and nothing here treats an unlisted room as existing.
 */
export const directoryState = $state<{
  eventId: string | null;
  directory: ConferenceDirectory | null;
}>({
  eventId: null,
  directory: null,
});

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

const settingKey = (eventId: string) => `conference-directory-${eventId}`;

/** The stored directory for an event, if any. */
export async function loadDirectory(eventId: string): Promise<ConferenceDirectory | null> {
  const raw = await getStorage().getSetting(settingKey(eventId));
  let stored: ConferenceDirectory | null = null;
  if (raw) {
    try {
      stored = acceptDirectory(null, JSON.parse(raw), eventId);
    } catch {
      stored = null;
    }
  }
  directoryState.eventId = eventId;
  directoryState.directory = stored;
  return stored;
}

/**
 * Fetch the directory a manifest names and store it if it validates. Called
 * after a manifest check; a manifest with no `directory` asset is normal.
 */
export async function refreshDirectory(
  eventId: string,
  manifest: EventManifest,
  signal?: AbortSignal,
): Promise<ConferenceDirectory | null> {
  const previous =
    directoryState.eventId === eventId ? directoryState.directory : await loadDirectory(eventId);
  const asset = manifest.assets['directory'];
  if (!asset || !/^directory\.[0-9a-f]+\.json$/.test(asset)) return previous;
  try {
    const res = await fetch(`${base}/events/${eventId}/${asset}`, { cache: 'no-store', signal });
    if (!res.ok) return previous;
    const next = acceptDirectory(previous, await res.json(), eventId);
    if (next !== previous) {
      await getStorage().setSetting(settingKey(eventId), JSON.stringify(next));
      directoryState.eventId = eventId;
      directoryState.directory = next;
    }
    return next;
  } catch {
    return previous;
  }
}
