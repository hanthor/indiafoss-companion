import {
  EMPTY_PLAN_EDITS,
  toggleInList,
  type CustomBlock,
  type PlanEdits,
} from '@indiafoss/solver';
import { CompanionStorage } from '@indiafoss/storage';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

function key(eventId: string, day: string): string {
  return `plan-edits-${eventId}-${day}`;
}

/**
 * Reactive manual edits for the current (eventId, day). Persisted verbatim so
 * a plan survives reloads and event-bundle metadata changes (§18). Only stable
 * activity ids are stored, never resolved times, so a re-solved base plan still
 * lines up with the user's locks, removals, replacements, and custom blocks.
 */
export const planEdits = $state<{ eventId: string | null; day: string | null; edits: PlanEdits }>({
  eventId: null,
  day: null,
  edits: structuredClone(EMPTY_PLAN_EDITS),
});

export async function hydratePlanEdits(eventId: string, day: string): Promise<void> {
  if (planEdits.eventId === eventId && planEdits.day === day) return;
  planEdits.eventId = eventId;
  planEdits.day = day;
  planEdits.edits = structuredClone(EMPTY_PLAN_EDITS);
  const saved = await getStorage().getSetting(key(eventId, day));
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Partial<PlanEdits>;
      planEdits.edits = {
        locked: parsed.locked ?? [],
        removed: parsed.removed ?? [],
        replacements: parsed.replacements ?? {},
        customBlocks: parsed.customBlocks ?? [],
      };
    } catch {
      // Ignore malformed local data and keep an empty edit set.
    }
  }
}

async function persist(): Promise<void> {
  if (!planEdits.eventId || !planEdits.day) return;
  await getStorage().setSetting(
    key(planEdits.eventId, planEdits.day),
    JSON.stringify(planEdits.edits),
  );
}

export async function toggleLock(id: string): Promise<void> {
  planEdits.edits.locked = toggleInList(planEdits.edits.locked, id);
  await persist();
}

export async function removeItem(id: string): Promise<void> {
  if (!planEdits.edits.removed.includes(id)) {
    planEdits.edits.removed = [...planEdits.edits.removed, id];
  }
  // Removing an item also clears any lock/replacement on it.
  planEdits.edits.locked = planEdits.edits.locked.filter((x) => x !== id);
  if (planEdits.edits.replacements[id]) {
    const rest = { ...planEdits.edits.replacements };
    delete rest[id];
    planEdits.edits.replacements = rest;
  }
  await persist();
}

export async function restoreItem(id: string): Promise<void> {
  planEdits.edits.removed = planEdits.edits.removed.filter((x) => x !== id);
  await persist();
}

export async function replaceItem(activityId: string, replacementId: string): Promise<void> {
  planEdits.edits.replacements = { ...planEdits.edits.replacements, [activityId]: replacementId };
  await persist();
}

export async function clearReplacement(activityId: string): Promise<void> {
  const rest = { ...planEdits.edits.replacements };
  delete rest[activityId];
  planEdits.edits.replacements = rest;
  await persist();
}

export async function addCustomBlock(block: CustomBlock): Promise<void> {
  planEdits.edits.customBlocks = [...planEdits.edits.customBlocks, block];
  await persist();
}

export async function removeCustomBlock(id: string): Promise<void> {
  planEdits.edits.customBlocks = planEdits.edits.customBlocks.filter((b) => b.id !== id);
  planEdits.edits.locked = planEdits.edits.locked.filter((x) => x !== id);
  await persist();
}

export function isRemoved(id: string): boolean {
  return planEdits.edits.removed.includes(id);
}
