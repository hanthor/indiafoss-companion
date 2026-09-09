import { base } from '$app/paths';
import { diffBundles, summarizeChanges } from '@indiafoss/schedule';
import type { ScheduleChange } from '@indiafoss/schedule';
import type { EventBundle } from '@indiafoss/model';
import { collectBundleIssues } from '@indiafoss/model';
import { CompanionStorage } from '@indiafoss/storage';
import { isValidEventManifest } from '@indiafoss/model/contracts';
import { UpdateGate } from '$lib/update-gate';
import { eventAssetMatches } from '$lib/event-asset';
import { eventState, storedRevision } from '$lib/event.svelte';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

export const updateState = $state<{
  eventId: string | null;
  checking: boolean;
  available: boolean;
  revision: number | null;
  changes: ScheduleChange[];
  summary: Record<string, number>;
  error: string | null;
}>({
  eventId: null,
  checking: false,
  available: false,
  revision: null,
  changes: [],
  summary: {},
  error: null,
});

/** Check status belongs to an event, independently of its pending update. */
export const refreshStatus = $state<
  Record<
    string,
    {
      checking: boolean;
      lastSuccessAt: number | null;
      failures: number;
      error: string | null;
    }
  >
>({});

function statusFor(eventId: string) {
  refreshStatus[eventId] ??= { checking: false, lastSuccessAt: null, failures: 0, error: null };
  return refreshStatus[eventId]!;
}

export async function hydrateRefreshStatus(eventId: string): Promise<void> {
  const status = statusFor(eventId);
  try {
    const saved = Number(await getStorage().getSetting(`event-last-check-${eventId}`));
    if (Number.isFinite(saved) && saved > 0 && saved > (status.lastSuccessAt ?? 0)) {
      status.lastSuccessAt = saved;
    }
  } catch {
    // A storage read failure must not prevent a fresh network check.
  }
}

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
 * Manual refresh and scheduled ticks pass `force`, skipping the freshness limit; a
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
  await gate.run(
    async () => {
      if (eventState.bundle?.id !== eventId) return false;
      const status = statusFor(eventId);
      status.checking = true;
      try {
        const success = await runCheck(eventId, eventState.bundle);
        status.error = success ? null : updateState.error;
        status.failures = success ? 0 : status.failures + 1;
        if (success) {
          status.lastSuccessAt = Date.now();
          // Status persistence is best effort; the schedule has its own atomic save.
          await getStorage()
            .setSetting(`event-last-check-${eventId}`, String(status.lastSuccessAt))
            .catch(() => {});
        }
        return success;
      } finally {
        status.checking = false;
      }
    },
    { ...options, eventId },
  );
}

/** Resolves true only after all required data is downloaded and validated. */
async function runCheck(eventId: string, current: EventBundle): Promise<boolean> {
  updateState.checking = true;
  const controller = new AbortController();
  // Bound the whole download so a stalled asset cannot disable later polls.
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      updateState.error =
        'You are offline. Your saved schedule is available; reconnect to check for changes.';
      return false;
    }
    const res = await fetch(`${base}/events/${eventId}/manifest.json`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      updateState.error =
        'The schedule could not be checked. Try again when your connection is working.';
      return false;
    }
    const manifest: unknown = await res.json();
    if (!isValidEventManifest(manifest) || manifest.eventId !== eventId) {
      updateState.error = 'The schedule manifest is invalid or belongs to another event.';
      return false;
    }
    // Clear the previous failure while validating the remaining data.
    updateState.error = null;
    const local = await storedRevision(eventId);
    if (!manifest.revision || (local !== null && manifest.revision <= local)) return true;

    if (pendingBundle?.id === eventId && updateState.revision === manifest.revision) return true;

    // Download the changed asset in full before anything is replaced (§34).
    let bundleRes = await fetch(assetUrl(eventId, manifest.assets?.event), {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!bundleRes.ok && bundleRes.status === 404) {
      bundleRes = await fetch(assetUrl(eventId, undefined), {
        cache: 'no-store',
        signal: controller.signal,
      });
    }
    if (!bundleRes.ok) {
      updateState.error =
        'The updated schedule could not be downloaded. Your saved schedule is unchanged. Try again.';
      return false;
    }
    const body = await bundleRes.text();
    if (!(await eventAssetMatches(manifest.assets.event, body))) {
      updateState.error =
        'The downloaded schedule does not match the published revision. Your saved schedule is unchanged. Try again.';
      return false;
    }
    const next = JSON.parse(body) as EventBundle;

    // A download that is not a usable bundle for this event must never evict
    // the good one already stored. Leave both bundle and revision untouched
    // so the next check retries.
    const issues = collectBundleIssues(next);
    if (next.id !== eventId || issues.length > 0) {
      updateState.error =
        next.id !== eventId
          ? `downloaded bundle is for ${next.id}, expected ${eventId}`
          : `downloaded bundle is invalid: ${issues[0]}`;
      return false;
    }

    // A background response must not replace another event selected in the meantime.
    if (eventState.bundle?.id !== eventId) return false;
    const changes = diffBundles(eventState.bundle ?? current, next);
    if (changes.length === 0) {
      // A revision with no attendee-visible change still carries real data —
      // corrected metadata, a fixed venue name. Applying it silently is right;
      // discarding it was not, and it is what previously left a reinstated
      // talk showing as cancelled while the revision was recorded as handled
      // (#190).
      //
      // The bundle and revision commit in one storage transaction. Failed
      // writes leave both unchanged and the next check can retry.
      const saved = await getStorage().saveEventRevision(next, manifest.revision);
      if (saved && eventState.bundle?.id === eventId) eventState.bundle = next;
      if (updateState.revision !== null && updateState.revision <= manifest.revision) {
        pendingBundle = null;
        updateState.available = false;
        updateState.changes = [];
        updateState.summary = {};
      }
      return true;
    }
    pendingBundle = next;

    updateState.eventId = eventId;
    updateState.available = true;
    updateState.revision = manifest.revision;
    updateState.changes = changes;
    updateState.summary = summarizeChanges(changes);
    return true;
  } catch (error) {
    updateState.error = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    clearTimeout(timer);
    updateState.checking = false;
  }
}

/**
 * Apply the newer bundle, preserving user state via stable activity ids (§35).
 */
export async function applyUpdate(eventId: string): Promise<void> {
  const next = pendingBundle;
  const revision = updateState.revision;
  if (!updateState.available || !next || next.id !== eventId || revision === null) return;
  try {
    const saved = await getStorage().saveEventRevision(next, revision);
    // A concurrent tab may already have saved this revision or a newer one.
    const adopted = saved ? next : await getStorage().loadEventBundle(eventId);
    if (adopted && eventState.bundle?.id === eventId) eventState.bundle = adopted;
    // A poll may have downloaded another revision while storage was committing.
    if (pendingBundle === next && updateState.revision === revision) {
      pendingBundle = null;
      updateState.available = false;
      updateState.changes = [];
      updateState.summary = {};
    }
    updateState.error = null;
  } catch {
    // Keep both the cached schedule and the downloaded proposal for a retry.
    updateState.error =
      'The update could not be saved. Your current schedule is unchanged. Try Update again.';
  }
}
