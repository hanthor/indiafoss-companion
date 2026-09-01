import { CompanionStorage } from '@indiafoss/storage';
import type { EventBundle } from '@indiafoss/model';

export const DEFAULT_EVENT_ID = 'indiafoss-2025';
/** Static, hash-less asset; precached by the service worker (§34). */
export const EVENT_BUNDLE_URL = `/events/${DEFAULT_EVENT_ID}/event-bundle.json`;

let storage: CompanionStorage | null = null;
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
    const res = await fetch(EVENT_BUNDLE_URL);
    if (!res.ok) {
      throw new Error(`Event bundle request failed (HTTP ${res.status})`);
    }
    const bundle = (await res.json()) as EventBundle;
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
export async function loadEvent(eventId: string = DEFAULT_EVENT_ID): Promise<EventBundle | null> {
  if (eventState.status === 'ready' && eventState.bundle?.id === eventId) {
    return eventState.bundle;
  }
  inflight ??= doLoad(eventId).finally(() => {
    inflight = null;
  });
  return inflight;
}
