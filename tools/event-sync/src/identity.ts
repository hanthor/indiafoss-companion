import type { Activity, EventBundle } from '@indiafoss/model';

function sameTalk(a: Activity, b: Activity): boolean {
  if (a.proposalId && b.proposalId) return a.proposalId === b.proposalId;
  // Compatibility with revisions published before proposalId was explicit.
  if (a.sourceUrl && b.sourceUrl) return a.sourceUrl === b.sourceUrl;
  if (a.proposalId || b.proposalId || a.sourceUrl || b.sourceUrl) return false;
  return (
    a.title === b.title &&
    a.start?.slice(0, 10) === b.start?.slice(0, 10) &&
    a.locationId === b.locationId &&
    a.type === b.type
  );
}

/** Bind talk choice keys to CFP identity, preserving existing keys across migration. */
export function preserveActivityIds(previous: EventBundle, next: EventBundle): void {
  const assigned = new Set<string>();
  for (const activity of next.activities) {
    const sameRow = previous.activities.find(
      (old) =>
        !!activity.sourceId &&
        old.sourceId === activity.sourceId &&
        (!old.proposalId || !activity.proposalId || old.proposalId === activity.proposalId),
    );
    const candidates = sameRow
      ? [sameRow]
      : previous.activities.filter((old) => sameTalk(activity, old));
    const peers = next.activities.filter((a) => sameTalk(activity, a));
    const candidate =
      candidates.length === 1 && (sameRow || peers.length === 1) ? candidates[0] : undefined;
    const id =
      candidate?.id ??
      (activity.proposalId && peers.length === 1 ? `act-cfp-${activity.proposalId}` : activity.id);
    if (assigned.has(id)) throw new Error(`Ambiguous activity identity: ${id}`);
    activity.id = id;
    assigned.add(id);
  }
}
