import { CompanionStorage } from '@indiafoss/storage';

const storage = new CompanionStorage();
export const planExists = $state<Record<string, boolean>>({});
export const plannedState = $state<Record<string, string[]>>({});
export const plannedKey = (eventId: string, day: string) => `resolved-plan-${eventId}-${day}`;

export async function loadPlanned(eventId: string, day: string): Promise<void> {
  const key = plannedKey(eventId, day);
  if (plannedState[key]) return;
  try {
    const saved = await storage.getSetting(key);
    const stored: unknown = JSON.parse(saved ?? '[]');
    if (
      Array.isArray(stored) &&
      stored.every((id) => typeof id === 'string') &&
      !plannedState[key]
    ) {
      if (planExists[key] === undefined) planExists[key] = saved !== undefined && saved !== null;
      plannedState[key] = stored;
    }
  } catch {
    /* A missing/corrupt snapshot does not affect the editable plan. */
  }
}

export async function savePlanned(eventId: string, day: string, ids: string[]): Promise<void> {
  const key = plannedKey(eventId, day);
  planExists[key] = true;
  if (JSON.stringify(plannedState[key]) === JSON.stringify(ids)) return;
  plannedState[key] = ids;
  await storage.setSetting(key, JSON.stringify(ids));
}
