import type { Activity } from './index.js';

/** Event-scoped reference carried by a personal-data transfer. */
export interface PortableActivityReference {
  eventId: string;
  activityId: string;
  proposalId?: string;
}

export type ActivityResolution =
  { status: 'matched'; activityId: string } | { status: 'wrong-event' | 'missing' | 'ambiguous' };

/** Never guess by title, room or time: those change when the programme changes. */
export function resolvePortableActivity(
  reference: PortableActivityReference,
  eventId: string,
  activities: Pick<Activity, 'id' | 'proposalId'>[],
): ActivityResolution {
  if (reference.eventId !== eventId) return { status: 'wrong-event' };
  if (!reference.activityId.trim() || reference.proposalId === '') return { status: 'missing' };
  const matches = reference.proposalId
    ? activities.filter((activity) => activity.proposalId === reference.proposalId)
    : activities.filter((activity) => activity.id === reference.activityId);
  const exact = matches.filter((activity) => activity.id === reference.activityId);
  const candidates = exact.length ? exact : matches;
  if (candidates.length > 1) return { status: 'ambiguous' };
  const activity = candidates[0];
  return activity ? { status: 'matched', activityId: activity.id } : { status: 'missing' };
}
