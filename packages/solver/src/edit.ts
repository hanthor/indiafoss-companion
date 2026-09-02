import type { Activity } from '@indiafoss/model';
import {
  DefaultTravelTime,
  SOLVER_CONFIG,
  type ItineraryItem,
  type TravelTimeProvider,
} from './index.js';

/**
 * Manual, user-authored edits layered on top of a solver-generated itinerary
 * (§18–§21). This structure is serialised verbatim into local storage so a
 * plan survives reloads and event-bundle metadata changes; it references
 * activities by stable id only, never by resolved time/location.
 */
export interface PlanEdits {
  /** Activities the user pinned; the solver must keep these. */
  locked: string[];
  /** Activities the user removed from the plan. */
  removed: string[];
  /** originalActivityId -> replacement activityId (from ranked backups). */
  replacements: Record<string, string>;
  /** User-authored custom / flexible blocks. */
  customBlocks: CustomBlock[];
}

export interface CustomBlock {
  /** Stable client id, e.g. `custom-<timestamp>`. */
  id: string;
  label: string;
  start: string;
  end: string;
  /** Optional venue location for travel-time checks. */
  locationId?: string;
  /** A flexible block has no fixed activity; purely a time reservation. */
  flexible?: boolean;
}

export const EMPTY_PLAN_EDITS: PlanEdits = {
  locked: [],
  removed: [],
  replacements: {},
  customBlocks: [],
};

/** A single row in the edited plan, ready to render. */
export interface EditedItem {
  /** Activity id, custom-block id, or solver flexible id. */
  id: string;
  start: string;
  end: string;
  locationId?: string;
  label?: string;
  locked: boolean;
  flexible: boolean;
  /** True when this item came from a manual edit (custom block or replacement). */
  manual: boolean;
  /** The activity id this item replaced, when it is a replacement. */
  replacedActivityId?: string;
}

export type ConflictKind = 'overlap' | 'travel-buffer' | 'unknown-activity' | 'invalid-time';

export interface PlanConflict {
  kind: ConflictKind;
  /** Ids of the two involved items (or a single id for standalone problems). */
  a: string;
  b?: string;
  /** Human-readable explanation shown instead of silently mutating the plan. */
  message: string;
}

export interface EditedPlan {
  items: EditedItem[];
  conflicts: PlanConflict[];
  /** True when the plan has no feasibility conflicts. */
  feasible: boolean;
}

export interface ApplyEditsInput {
  /** The solver's generated items for the day (the base plan). */
  base: ItineraryItem[];
  edits: PlanEdits;
  /** Activity lookup for the whole bundle. */
  activities: Map<string, Activity>;
  travel?: TravelTimeProvider;
  bufferSeconds?: number;
}

function parse(iso: string): number {
  return Date.parse(iso);
}

function titleFor(id: string, activities: Map<string, Activity>): string {
  return activities.get(id)?.title ?? id;
}

/**
 * Apply manual edits to a base itinerary and return the resulting rows plus a
 * list of feasibility conflicts. This never drops a user's manual item: an
 * infeasible edit is surfaced as a conflict so the UI can explain it.
 */
export function applyItineraryEdits(input: ApplyEditsInput): EditedPlan {
  const { base, edits, activities } = input;
  const travel = input.travel ?? DefaultTravelTime;
  const bufferSeconds = input.bufferSeconds ?? SOLVER_CONFIG.defaultBufferSeconds;

  const removed = new Set(edits.removed);
  const locked = new Set(edits.locked);
  const conflicts: PlanConflict[] = [];
  const items: EditedItem[] = [];

  // 1. Base solver items, minus removals, with replacements applied.
  for (const item of base) {
    if (item.flexible) {
      // Flexible solver slots are dropped if the user removed them by id.
      if (removed.has(item.activityId)) continue;
      items.push({
        id: item.activityId,
        start: item.start,
        end: item.end,
        label: item.label,
        locked: false,
        flexible: true,
        manual: false,
      });
      continue;
    }

    if (removed.has(item.activityId)) continue;

    const replacementId = edits.replacements[item.activityId];
    if (replacementId) {
      const replacement = activities.get(replacementId);
      if (!replacement || !replacement.start || !replacement.end) {
        conflicts.push({
          kind: 'unknown-activity',
          a: replacementId,
          message: `The chosen replacement is no longer in the schedule.`,
        });
        continue;
      }
      items.push({
        id: replacement.id,
        start: replacement.start,
        end: replacement.end,
        locationId: replacement.locationId,
        label: replacement.title,
        locked: locked.has(replacement.id),
        flexible: false,
        manual: true,
        replacedActivityId: item.activityId,
      });
      continue;
    }

    const activity = activities.get(item.activityId);
    items.push({
      id: item.activityId,
      start: item.start,
      end: item.end,
      locationId: activity?.locationId,
      label: activity?.title ?? item.activityId,
      locked: locked.has(item.activityId),
      flexible: false,
      manual: false,
    });
  }

  // 2. Custom / flexible blocks authored by the user.
  for (const block of edits.customBlocks) {
    if (removed.has(block.id)) continue;
    if (parse(block.end) <= parse(block.start)) {
      conflicts.push({
        kind: 'invalid-time',
        a: block.id,
        message: `"${block.label}" ends before it starts.`,
      });
    }
    items.push({
      id: block.id,
      start: block.start,
      end: block.end,
      locationId: block.locationId,
      label: block.label,
      locked: locked.has(block.id),
      flexible: block.flexible ?? false,
      manual: true,
    });
  }

  // 3. Sort chronologically for display and adjacency checks.
  items.sort((a, b) => parse(a.start) - parse(b.start) || parse(a.end) - parse(b.end));

  // 4. Feasibility: overlaps and travel+buffer violations between neighbours.
  for (let i = 0; i < items.length - 1; i++) {
    const cur = items[i]!;
    const next = items[i + 1]!;
    const curEnd = parse(cur.end);
    const nextStart = parse(next.start);

    if (curEnd > nextStart) {
      conflicts.push({
        kind: 'overlap',
        a: cur.id,
        b: next.id,
        message: `"${cur.label ?? titleFor(cur.id, activities)}" overlaps "${
          next.label ?? titleFor(next.id, activities)
        }".`,
      });
      continue;
    }

    // Travel + buffer only apply between real, located activities.
    if (cur.flexible || next.flexible) continue;
    const travelSeconds = travel.seconds(cur.locationId, next.locationId);
    const requiredGapMs = (travelSeconds + bufferSeconds) * 1000;
    if (curEnd + requiredGapMs > nextStart) {
      const minutes = Math.ceil((travelSeconds + bufferSeconds) / 60);
      conflicts.push({
        kind: 'travel-buffer',
        a: cur.id,
        b: next.id,
        message: `Not enough time to reach "${
          next.label ?? titleFor(next.id, activities)
        }" (needs ~${minutes} min to travel and settle).`,
      });
    }
  }

  return { items, conflicts, feasible: conflicts.length === 0 };
}

/** Toggle an id in a string-array edit field, returning a new array. */
export function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
