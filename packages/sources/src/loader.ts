import type { EventBundle, EventReference } from '@indiafoss/model';

/**
 * Loads an already-normalized bundle. Kept apart from {@link EventSource},
 * which fetches and normalizes raw upstream data: a loader never talks to a
 * source, and a consumer that only needs bundles depends on this alone.
 */
export interface BundleLoader {
  /** Load a normalized event bundle directly from disk or cache. */
  loadBundle(ref: EventReference): Promise<EventBundle>;
}
