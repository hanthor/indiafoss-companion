import type { Activity } from './index.js';

/** Programme introductions stay on the schedule, but are not taste choices. */
export function isDiscoveryActivity(
  activity: Pick<Activity, 'title' | 'type' | 'cancelled'>,
): boolean {
  return (
    !activity.cancelled &&
    activity.type !== 'meal' &&
    !/^devroom intro(?:duction)?\s*:/i.test(activity.title.trim())
  );
}
