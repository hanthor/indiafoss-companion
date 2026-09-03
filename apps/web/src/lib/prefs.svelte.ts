import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { CompanionStorage, defaultPreference, INITIAL_RATING } from '@indiafoss/storage';
import type { ActivityPreference, ComparisonRecord, Disposition } from '@indiafoss/storage';
import { pairKey } from '@indiafoss/elo';

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

export function ratingOf(activityId: string): number {
  return preferences.get(activityId)?.rating ?? INITIAL_RATING;
}

export function comparisonsOf(activityId: string): number {
  return preferences.get(activityId)?.comparisons ?? 0;
}

export function triageOf(activityId: string): ActivityPreference['triage'] | undefined {
  return preferences.get(activityId)?.triage;
}

/**
 * Quick-pass answer (#90). "No" rules the session out of ranking and planning;
 * "yes" keeps it in. Clearing restores a plain session; a must-attend mark is
 * never downgraded by a quick-pass answer.
 */
export async function setTriage(
  activityId: string,
  answer: ActivityPreference['triage'] | undefined,
): Promise<void> {
  const current = preferenceFor(activityId);
  let disposition: Disposition = current.disposition;
  if (answer === 'no') disposition = 'not-interested';
  else if (current.disposition === 'not-interested') disposition = 'normal';
  const next: ActivityPreference = { ...current, disposition };
  if (answer) next.triage = answer;
  else delete next.triage;
  await getStorage().setPreference(next);
  preferences.set(activityId, next);
}

// ---------- Comparison history ----------
// Every answered pair, kept so a reload never re-asks a question (it used to)
// and so the affinity prior can learn from what was picked.

const history = new SvelteMap<string, ComparisonRecord>();
const answeredPairs = new SvelteSet<string>();
let historyHydrated = false;

export async function hydrateComparisons(): Promise<void> {
  if (historyHydrated) return;
  for (const c of await getStorage().listComparisons()) {
    history.set(c.id, c);
    answeredPairs.add(pairKey(c.activityA, c.activityB));
  }
  historyHydrated = true;
}

/** Reactive set of `pairKey()` strings already answered. */
export function comparedPairs(): SvelteSet<string> {
  return answeredPairs;
}

/** Reactive list of answered comparisons, oldest first. */
export function comparisonHistory(): ComparisonRecord[] {
  return [...history.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function recordComparison(record: ComparisonRecord): Promise<void> {
  await getStorage().saveComparison(record);
  history.set(record.id, record);
  answeredPairs.add(pairKey(record.activityA, record.activityB));
}

export async function forgetComparison(id: string): Promise<void> {
  const record = history.get(id);
  await getStorage().deleteComparison(id);
  history.delete(id);
  if (!record) return;
  const key = pairKey(record.activityA, record.activityB);
  // Another answer for the same pair may still exist (re-asked pairs).
  if (![...history.values()].some((c) => pairKey(c.activityA, c.activityB) === key)) {
    answeredPairs.delete(key);
  }
}

/** Persist a rating update after a comparison (§15). */
export async function setRating(
  activityId: string,
  rating: number,
  comparisons: number,
): Promise<void> {
  const current = preferenceFor(activityId);
  const next = { ...current, rating, comparisons };
  await getStorage().setPreference(next);
  preferences.set(activityId, next);
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
