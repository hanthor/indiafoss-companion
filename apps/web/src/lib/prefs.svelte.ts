import { SvelteMap } from 'svelte/reactivity';
import { CompanionStorage, defaultPreference } from '@indiafoss/storage';
import type { ActivityPreference, Disposition } from '@indiafoss/storage';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/** Reactive map of activityId -> preference (§14). */
const preferences = new SvelteMap<string, ActivityPreference>();

let hydrated = false;

export async function hydratePreferences(): Promise<void> {
  if (hydrated) return;
  for (const p of await getStorage().listPreferences()) {
    preferences.set(p.activityId, p);
  }
  hydrated = true;
}

export function preferenceFor(activityId: string): ActivityPreference {
  return preferences.get(activityId) ?? defaultPreference(activityId);
}

export function bookmarked(activityId: string): boolean {
  return preferences.get(activityId)?.bookmarked ?? false;
}

export function dispositionOf(activityId: string): Disposition {
  return preferences.get(activityId)?.disposition ?? 'normal';
}

export async function toggleBookmark(activityId: string): Promise<void> {
  const current = preferenceFor(activityId);
  const next = { ...current, bookmarked: !current.bookmarked };
  await getStorage().setPreference(next);
  preferences.set(activityId, next);
}

export async function setDisposition(activityId: string, disposition: Disposition): Promise<void> {
  const current = preferenceFor(activityId);
  const next = { ...current, disposition };
  await getStorage().setPreference(next);
  preferences.set(activityId, next);
}
