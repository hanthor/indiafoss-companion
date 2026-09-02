import { diffBundles, summarizeChanges } from '@indiafoss/schedule';
import type { ScheduleChange } from '@indiafoss/schedule';
import type { EventBundle } from '@indiafoss/model';
import { CompanionStorage } from '@indiafoss/storage';
import {
  eventState,
  EVENT_BUNDLE_URL,
  EVENT_MANIFEST_URL,
  recordRevision,
  storedRevision,
} from '$lib/event.svelte';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

export const updateState = $state<{
  checking: boolean;
  available: boolean;
  revision: number | null;
  changes: ScheduleChange[];
  summary: Record<string, number>;
  error: string | null;
}>({
  checking: false,
  available: false,
  revision: null,
  changes: [],
  summary: {},
  error: null,
});

/** The newer bundle, already downloaded in full; applied only when the attendee says so. */
let pendingBundle: EventBundle | null = null;

/** Immutable, hash-addressed asset named by the manifest; the hash-less copy is the fallback. */
function assetUrl(asset: string | undefined): string {
  return asset && /^event\.[0-9a-f]+\.json$/.test(asset)
    ? `${EVENT_BUNDLE_URL.replace(/event-bundle\.json$/, '')}${asset}`
    : EVENT_BUNDLE_URL;
}

let checked = false;

/**
 * Network-first manifest check with a short timeout (§34). On failure the
 * existing offline schedule stays untouched (§60).
 */
export async function checkForUpdates(eventId: string): Promise<void> {
  if (checked || eventState.status !== 'ready' || !eventState.bundle) return;
  checked = true;
  updateState.checking = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(EVENT_MANIFEST_URL, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const manifest = (await res.json()) as { revision?: number; assets?: Record<string, string> };
    const local = await storedRevision(eventId);
    if (!manifest.revision || (local !== null && manifest.revision <= local)) return;

    // Download the changed asset in full before anything is replaced (§34).
    let bundleRes = await fetch(assetUrl(manifest.assets?.event), { cache: 'no-store' });
    if (!bundleRes.ok && bundleRes.status === 404) {
      bundleRes = await fetch(EVENT_BUNDLE_URL, { cache: 'no-store' });
    }
    if (!bundleRes.ok) return;
    const next = (await bundleRes.json()) as EventBundle;
    const changes = diffBundles(eventState.bundle, next);
    if (changes.length === 0) {
      // A no-op revision (metadata only) must not nag: remember it as applied.
      await recordRevision(eventId, manifest.revision);
      return;
    }
    pendingBundle = next;

    updateState.available = true;
    updateState.revision = manifest.revision;
    updateState.changes = changes;
    updateState.summary = summarizeChanges(changes);
  } catch (error) {
    updateState.error = error instanceof Error ? error.message : String(error);
  } finally {
    updateState.checking = false;
  }
}

/**
 * Apply the newer bundle, preserving user state via stable activity ids (§35).
 */
export async function applyUpdate(eventId: string): Promise<void> {
  if (!updateState.available) return;
  let next = pendingBundle;
  if (!next) {
    const res = await fetch(EVENT_BUNDLE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`update fetch failed (HTTP ${res.status})`);
    next = (await res.json()) as EventBundle;
  }
  pendingBundle = null;
  await getStorage().saveEventBundle(next);
  await recordRevision(eventId, updateState.revision ?? undefined);
  eventState.bundle = next;
  updateState.available = false;
  updateState.changes = [];
  updateState.summary = {};
}
