import type { Activity, EventBundle } from '@indiafoss/model';

function sameTalk(a: Activity, b: Activity): boolean {
  if (a.proposalId || b.proposalId) {
    if (a.proposalId && b.proposalId) return a.proposalId === b.proposalId;
    // Compatibility with revisions published before proposalId was explicit.
    return !!a.sourceUrl && !!b.sourceUrl && a.sourceUrl === b.sourceUrl;
  }
  // Organiser rows (breaks, intros, ceremonies) all cite the same schedule
  // page, so a shared URL identifies nothing; only a differing one rules out.
  if (a.sourceUrl && b.sourceUrl && a.sourceUrl !== b.sourceUrl) return false;
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
  keepMovedOrganiserRows(previous, next, assigned);
}

/**
 * An organiser row (a ceremony, a keynote slot) that moved to another day or
 * room matches nothing above, and the organiser often recreates the row, so
 * it arrives with a new id and every bookmark on it is lost. When its title
 * and type name exactly one row in both revisions, and that old id is free,
 * it keeps the old id. Repeated rows such as "Lunch" never qualify.
 */
function keepMovedOrganiserRows(
  previous: EventBundle,
  next: EventBundle,
  assigned: Set<string>,
): void {
  const key = (a: Activity) => `${a.type}\u0000${a.title}`;
  const count = (list: Activity[]) => {
    const n = new Map<string, number>();
    for (const a of list) if (!a.proposalId) n.set(key(a), (n.get(key(a)) ?? 0) + 1);
    return n;
  };
  const before = count(previous.activities);
  const after = count(next.activities);
  const previousIds = new Set(previous.activities.map((a) => a.id));
  for (const activity of next.activities) {
    if (activity.proposalId || previousIds.has(activity.id)) continue;
    if (before.get(key(activity)) !== 1 || after.get(key(activity)) !== 1) continue;
    const old = previous.activities.find((a) => !a.proposalId && key(a) === key(activity))!;
    if (assigned.has(old.id)) continue;
    assigned.delete(activity.id);
    activity.id = old.id;
    assigned.add(old.id);
  }
}
