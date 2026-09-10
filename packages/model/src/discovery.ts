import type { Activity } from './index.js';

/** Programme context rather than a taste choice: meals, organiser ceremonies and introductions. */
const CONTEXT_TYPES: ReadonlySet<Activity['type']> = new Set(['meal', 'ceremony', 'intro']);

/** Programme introductions stay on the schedule, but are not taste choices. */
export function isDiscoveryActivity(
  activity: Pick<Activity, 'title' | 'type' | 'cancelled'>,
): boolean {
  return (
    !activity.cancelled &&
    !CONTEXT_TYPES.has(activity.type) &&
    // Older bundles classify introductions as talks; the title rule keeps them out too.
    !/^devroom intro(?:duction)?\s*:/i.test(activity.title.trim())
  );
}
