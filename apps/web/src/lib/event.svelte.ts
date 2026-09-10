import { base } from '$app/paths';
import { CompanionStorage } from '@indiafoss/storage';
import { collectBundleIssues, type EventBundle } from '@indiafoss/model';
import { DEFAULT_EVENT_ID, isKnownEventId } from '$lib/event-id';

export { DEFAULT_EVENT_ID } from '$lib/event-id';
/** Static, hash-less asset; precached by the service worker (§34). */
export const EVENT_BUNDLE_URL = `${base}/events/${DEFAULT_EVENT_ID}/event-bundle.json`;
export const EVENT_MANIFEST_URL = `${base}/events/${DEFAULT_EVENT_ID}/manifest.json`;

let storage: CompanionStorage | null = null;

/** Revision of the stored bundle, if known. */
export async function storedRevision(eventId: string): Promise<number | null> {
  return getStorage().loadEventRevision(eventId);
}
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

export type EventLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export const eventState = $state<{
  bundle: EventBundle | null;
  status: EventLoadStatus;
  error: string | null;
}>({
  bundle: null,
  status: 'idle',
  error: null,
});

let inflight: Promise<EventBundle | null> | null = null;

async function doLoad(eventId: string): Promise<EventBundle | null> {
  eventState.status = 'loading';
  eventState.error = null;
  try {
    // 1. IndexedDB is the offline source of truth.
    const stored = await getStorage().loadEventBundle(eventId);
    if (stored) {
      eventState.bundle = stored;
      eventState.status = 'ready';
      return stored;
    }
    // 2. Static asset, precached by the service worker (§34). A failed fetch
    //    must never wipe previously cached data (§60).
    const res = await fetch(`${base}/events/${eventId}/event-bundle.json`);
    if (!res.ok) {
      throw new Error(`Event bundle request failed (HTTP ${res.status})`);
    }
    const bundle = (await res.json()) as EventBundle;
    if (bundle.id !== eventId || collectBundleIssues(bundle).length > 0) {
      throw new Error(
        'The downloaded schedule is invalid or belongs to another event. Please try again.',
      );
    }
    await getStorage().saveEventBundle(bundle);
    eventState.bundle = bundle;
    eventState.status = 'ready';
    return bundle;
  } catch (error) {
    eventState.status = 'error';
    eventState.error = error instanceof Error ? error.message : String(error);
    return null;
  }
}

/**
 * Load the event bundle: IndexedDB first (offline source of truth), then the
 * precached static asset. Concurrent callers share one in-flight request.
 */
function selectedEventId(): string {
  if (typeof window === 'undefined') return DEFAULT_EVENT_ID;
  try {
    const requested = new URL(window.location.href).searchParams.get('event');
    if (isKnownEventId(requested)) sessionStorage.setItem('selected-event', requested);
    const selected = sessionStorage.getItem('selected-event');
    return isKnownEventId(selected) ? selected : DEFAULT_EVENT_ID;
  } catch {
    return DEFAULT_EVENT_ID;
  }
}

export async function loadEvent(eventId: string = selectedEventId()): Promise<EventBundle | null> {
  if (eventState.status === 'ready' && eventState.bundle?.id === eventId) {
    return eventState.bundle;
  }
  inflight ??= doLoad(eventId).finally(() => {
    inflight = null;
  });
  return inflight;
}
