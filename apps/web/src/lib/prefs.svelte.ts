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

/** The session this one stood aside for in a clash (#271), if any. */
export function yieldedTo(activityId: string): string | undefined {
  return preferences.get(activityId)?.yieldedTo;
}

/**
 * Record or clear a clash loss (#271). Standing aside is a scheduling
 * outcome, not an answer: the disposition, interest and rating are untouched,
 * so the talk stays an interest and nothing is learnt against it.
 */
export async function setYieldedTo(
  activityId: string,
  winnerId: string | undefined,
): Promise<void> {
  const next: ActivityPreference = { ...preferenceFor(activityId) };
  if (winnerId) next.yieldedTo = winnerId;
  else delete next.yieldedTo;
  await getStorage().setPreference(next);
  preferences.set(activityId, next);
}

/** Everything a clash pick or undo may change about one session, in one write. */
export interface ChoiceSnapshot {
  id: string;
  rating: number;
  comparisons: number;
  disposition: Disposition;
  triage?: ActivityPreference['triage'];
  yieldedTo?: string;
}

export function snapshotChoice(activityId: string): ChoiceSnapshot {
  const current = preferenceFor(activityId);
  const snapshot: ChoiceSnapshot = {
    id: activityId,
    rating: current.rating,
    comparisons: current.comparisons,
    disposition: current.disposition,
  };
  if (current.triage) snapshot.triage = current.triage;
  if (current.yieldedTo) snapshot.yieldedTo = current.yieldedTo;
  return snapshot;
}

/** Restore a snapshot verbatim (undo). Bookmarks are not part of a choice and are kept. */
export async function restoreChoice(snapshot: ChoiceSnapshot): Promise<void> {
  const next: ActivityPreference = {
    ...preferenceFor(snapshot.id),
    rating: snapshot.rating,
    comparisons: snapshot.comparisons,
    disposition: snapshot.disposition,
  };
  if (snapshot.triage) next.triage = snapshot.triage;
  else delete next.triage;
  if (snapshot.yieldedTo) next.yieldedTo = snapshot.yieldedTo;
  else delete next.yieldedTo;
  await getStorage().setPreference(next);
  preferences.set(snapshot.id, next);
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
  // A must-go mark is an explicit answer: it overrides an earlier clash loss.
  if (disposition === 'must-attend') delete next.yieldedTo;
  await getStorage().setPreference(next);
  preferences.set(activityId, next);
}

/**
 * One explicit card answer, persisted in one write. Clearing also clears its
 * must mark. Any direct answer supersedes an earlier clash loss (#271).
 */
export async function setTalkChoice(
  activityId: string,
  answer: 'yes' | 'no' | 'must' | undefined,
): Promise<void> {
  const next = {
    ...preferenceFor(activityId),
    disposition: answer === 'must' ? 'must-attend' : answer === 'no' ? 'not-interested' : 'normal',
  } satisfies ActivityPreference;
  if (answer) next.triage = answer === 'no' ? 'no' : 'yes';
  else delete next.triage;
  delete next.yieldedTo;
  await getStorage().setPreference(next);
  preferences.set(activityId, next);
}

/**
 * Re-read every preference and comparison after storage changed underneath
 * the caches (personal-data import). Consumers observe the maps, so they update in place.
 */
export async function reloadPreferences(): Promise<void> {
  const [stored, comparisons] = await Promise.all([
    getStorage().listPreferences(),
    getStorage().listComparisons(),
  ]);
  preferences.clear();
  for (const p of stored) preferences.set(p.activityId, p);
  hydrated = true;
  history.clear();
  answeredPairs.clear();
  for (const c of comparisons) {
    history.set(c.id, c);
    answeredPairs.add(pairKey(c.activityA, c.activityB));
  }
  historyHydrated = true;
}
