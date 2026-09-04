import type { EventBundle, Track } from '@indiafoss/model';

/**
 * A main hall is where a keynote runs; everything else with a programme of
 * its own is a devroom. Ranking asks about devrooms (#108) and the map leads
 * their labels with the devroom's name (#117), so the rule lives in one
 * place and the two screens cannot disagree.
 */
export function isMainRoom(bundle: EventBundle, track: Track): boolean {
  return bundle.activities.some((a) => a.trackId === track.id && a.type === 'keynote');
}

/** Devroom track id → the devroom's name, for labelling what is on in a room. */
export function devroomTrackNames(bundle: EventBundle | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!bundle) return map;
  for (const track of bundle.tracks) {
    if (!isMainRoom(bundle, track)) map.set(track.id, track.name);
  }
  return map;
}

/**
 * What heads a room's label on the map: the devroom's own name when a devroom
 * session is on, otherwise the room's name. In a devroom the programme is the
 * identity — "Rust" tells an attendee more than "HALL 3" does.
 */
export function labelHeadingFor(
  roomName: string,
  liveTrackId: string | undefined,
  devroomNames: Map<string, string>,
): { text: string; devroom: boolean } {
  const name = liveTrackId ? devroomNames.get(liveTrackId) : undefined;
  return name ? { text: name, devroom: true } : { text: roomName, devroom: false };
}
