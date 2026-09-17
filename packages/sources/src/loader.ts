import type { EventBundle, EventReference } from '@indiafoss/model';

/** Direct bundle loader interface (§6). */
export interface BundleLoader {
  /** Load a normalized event bundle directly from disk or cache. */
  loadBundle(ref: EventReference): Promise<EventBundle>;
}
