import { base } from '$app/paths';
import { diffBundles, summarizeChanges } from '@indiafoss/schedule';
import type { ScheduleChange } from '@indiafoss/schedule';
import type { EventBundle } from '@indiafoss/model';
import { collectBundleIssues } from '@indiafoss/model';
import { CompanionStorage } from '@indiafoss/storage';
import { UpdateGate } from '$lib/update-gate';
import { eventState, recordRevision, storedRevision } from '$lib/event.svelte';

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
function assetUrl(eventId: string, asset: string | undefined): string {
  const bundleUrl = `${base}/events/${eventId}/event-bundle.json`;
  return asset && /^event\.[0-9a-f]+\.json$/.test(asset)
    ? `${bundleUrl.replace(/event-bundle\.json$/, '')}${asset}`
    : bundleUrl;
}

/**
 * Serialises checks and applies the freshness limit. The interesting
 * behaviour, and the #189 regression tests, live in `update-gate.ts`.
 */
const gate = new UpdateGate();

/** Forget the check state. Test seam; not part of the app's own flow. */
export function resetUpdateChecks(): void {
  gate.reset();
}

/**
 * Network-first manifest check with a short timeout (§34). On failure the
 * existing offline schedule stays untouched (§60).
 *
 * Called on launch, on reconnect, on foreground return and on manual refresh.
 * Only a manual refresh passes `force`, which skips the freshness limit; a
 * failed check never records success, so the next trigger retries immediately.
 */
export async function checkForUpdates(
  eventId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  // Captured once, so the diff below is against the bundle this check
  // started from rather than whatever the store holds when it finishes.
  const current = eventState.bundle;
  if (eventState.status !== 'ready' || !current || current.id !== eventId) return;
  await gate.run(() => runCheck(eventId, current), options);
}

/** Resolves true when the manifest was actually reached. */
async function runCheck(eventId: string, current: EventBundle): Promise<boolean> {
  updateState.checking = true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${base}/events/${eventId}/manifest.json`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const manifest = (await res.json()) as { revision?: number; assets?: Record<string, string> };
    // The manifest is in hand, so the check succeeded — whether or not it
    // turns out to carry anything new.
    updateState.error = null;
    const local = await storedRevision(eventId);
    if (!manifest.revision || (local !== null && manifest.revision <= local)) return true;

    // Download the changed asset in full before anything is replaced (§34).
    let bundleRes = await fetch(assetUrl(eventId, manifest.assets?.event), { cache: 'no-store' });
    if (!bundleRes.ok && bundleRes.status === 404) {
      bundleRes = await fetch(assetUrl(eventId, undefined), { cache: 'no-store' });
    }
    if (!bundleRes.ok) return true;
    const next = (await bundleRes.json()) as EventBundle;

    // A download that is not a usable bundle for this event must never evict
    // the good one already stored. Leave both bundle and revision untouched
    // so the next check retries.
    const issues = collectBundleIssues(next);
    if (next.id !== eventId || issues.length > 0) {
      updateState.error =
        next.id !== eventId
          ? `downloaded bundle is for ${next.id}, expected ${eventId}`
          : `downloaded bundle is invalid: ${issues[0]}`;
      return true;
    }

    const changes = diffBundles(current, next);
    if (changes.length === 0) {
      // A revision with no attendee-visible change still carries real data —
      // corrected metadata, a fixed venue name. Applying it silently is right;
      // discarding it was not, and it is what previously left a reinstated
      // talk showing as cancelled while the revision was recorded as handled
      // (#190).
      //
      // Order matters: persist, then update memory, then record the revision.
      // If the save throws, the revision stays unrecorded and the next check
      // tries again rather than skipping this revision forever.
      await getStorage().saveEventBundle(next);
      eventState.bundle = next;
      await recordRevision(eventId, manifest.revision);
      return true;
    }
    pendingBundle = next;

    updateState.available = true;
    updateState.revision = manifest.revision;
    updateState.changes = changes;
    updateState.summary = summarizeChanges(changes);
    return true;
  } catch (error) {
    updateState.error = error instanceof Error ? error.message : String(error);
    return false;
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
    const res = await fetch(assetUrl(eventId, undefined), { cache: 'no-store' });
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
