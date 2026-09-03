import { SvelteMap } from 'svelte/reactivity';
import { CompanionStorage } from '@indiafoss/storage';
import type { Activity, EventBundle, Track } from '@indiafoss/model';
import type { RoomPreference } from '@indiafoss/elo';
import { setTriage, triageOf } from '$lib/prefs.svelte';

/**
 * Room (track) preferences asked before ranking (#90): "skip" takes every
 * talk in that room out of the day, "love" lifts them through the taste
 * prior. Stored per event; the main halls can be loved but never skipped,
 * since that is where the programme everyone shares happens.
 */

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

interface StoredRoomPrefs {
  prefs: Record<string, RoomPreference>;
  /** Sessions a "skip" marked, so un-skipping restores only those. */
  skipped: Record<string, string[]>;
}

const prefs = new SvelteMap<string, RoomPreference>();
const skippedBy = new SvelteMap<string, string[]>();
let hydratedFor: string | null = null;
export const roomPrefsState = $state<{ loaded: boolean; decided: boolean }>({
  loaded: false,
  decided: false,
});

const key = (eventId: string) => `room-prefs-${eventId}`;
const decidedKey = (eventId: string) => `room-prefs-decided-${eventId}`;

export async function hydrateRoomPrefs(eventId: string): Promise<void> {
  if (hydratedFor === eventId) return;
  hydratedFor = eventId;
  prefs.clear();
  skippedBy.clear();
  const raw = await getStorage().getSetting(key(eventId));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredRoomPrefs>;
      for (const [id, pref] of Object.entries(parsed.prefs ?? {})) prefs.set(id, pref);
      for (const [id, ids] of Object.entries(parsed.skipped ?? {})) skippedBy.set(id, ids);
    } catch {
      /* malformed local data: start neutral */
    }
  }
  roomPrefsState.decided = (await getStorage().getSetting(decidedKey(eventId))) === 'true';
  roomPrefsState.loaded = true;
}

async function persist(eventId: string): Promise<void> {
  const doc: StoredRoomPrefs = {
    prefs: Object.fromEntries(prefs),
    skipped: Object.fromEntries(skippedBy),
  };
  await getStorage().setSetting(key(eventId), JSON.stringify(doc));
}

export function roomPreference(trackId: string): RoomPreference | undefined {
  return prefs.get(trackId);
}

/** All preferences, for the taste prior. */
export function roomPreferences(): Record<string, RoomPreference | undefined> {
  return Object.fromEntries(prefs);
}

/** A room counts as a main hall when a keynote happens there. */
export function isMainRoom(bundle: EventBundle, track: Track): boolean {
  return bundle.activities.some((a) => a.trackId === track.id && a.type === 'keynote');
}

/** Rooms worth asking about: those with sessions to rank, main halls first. */
export function rankableRooms(
  bundle: EventBundle,
): { track: Track; sessions: Activity[]; main: boolean }[] {
  return bundle.tracks
    .map((track) => ({
      track,
      sessions: bundle.activities.filter(
        (a) => a.trackId === track.id && !a.cancelled && a.type !== 'meal',
      ),
      main: isMainRoom(bundle, track),
    }))
    .filter((r) => r.sessions.length > 0)
    .sort((x, y) => Number(y.main) - Number(x.main) || y.sessions.length - x.sessions.length);
}

/** The devrooms alone: what step one of ranking asks about (#108). The main halls are always in. */
export function devrooms(
  bundle: EventBundle,
): { track: Track; sessions: Activity[]; main: boolean }[] {
  return rankableRooms(bundle).filter((r) => !r.main);
}

/**
 * Set a room's preference. Skipping answers "no" for every talk in the room
 * the attendee has not answered themselves; leaving "skip" restores exactly
 * those and nothing else.
 */
export async function setRoomPreference(
  bundle: EventBundle,
  trackId: string,
  pref: RoomPreference | undefined,
): Promise<void> {
  const was = prefs.get(trackId);
  if (was === 'skip' && pref !== 'skip') {
    for (const id of skippedBy.get(trackId) ?? []) {
      if (triageOf(id) === 'no') await setTriage(id, undefined);
    }
    skippedBy.delete(trackId);
  }
  if (pref === 'skip' && was !== 'skip') {
    const ids: string[] = [];
    for (const a of bundle.activities) {
      if (a.trackId !== trackId || a.cancelled || a.type === 'meal') continue;
      if (triageOf(a.id)) continue; // their own answer stands
      await setTriage(a.id, 'no');
      ids.push(a.id);
    }
    skippedBy.set(trackId, ids);
  }
  if (pref) prefs.set(trackId, pref);
  else prefs.delete(trackId);
  await persist(bundle.id);
}

/** The rooms step has been seen; the rank screen moves on to the quick pass. */
export async function markRoomsDecided(eventId: string): Promise<void> {
  roomPrefsState.decided = true;
  await getStorage().setSetting(decidedKey(eventId), 'true');
}
