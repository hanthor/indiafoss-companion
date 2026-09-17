import type { Activity, EventBundle, Track } from '@indiafoss/model';

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

/**
 * The FOSS United CFP tool names a devroom track "<room> (<topic>)" — e.g.
 * "Devroom 1 (FOSS in Science)" — because one physical room hosts several
 * named tracks across the day. That is a room booking, not the track's
 * identity: an attendee deciding whether a devroom is for them wants the
 * topic first and the room as a footnote, not the other way round.
 *
 * Splits on the trailing "(...)"; a track with no parenthesised topic (a
 * main hall, or a devroom track that has none, like a bare "Devroom 2")
 * returns just its name with no subtitle.
 */
export function splitTrackName(name: string): { title: string; subtitle?: string } {
  const match = name.match(/^(.+?)\s*\(([^()]+)\)$/);
  return match ? { title: match[2]!, subtitle: match[1] } : { title: name };
}

/** A contiguous run of one devroom's sessions in one room, for the grid's label band. */
export interface DevroomBlock {
  trackId: string;
  name: string;
  /** ISO timestamps: the first session's start and the last session's end. */
  start: string;
  end: string;
}

/**
 * The devroom blocks in one room's timed sessions. A devroom books a room for
 * a run of sessions, so each run gets one label rather than a badge on every
 * cell. Only a session's `devroomId` counts: a main hall's own track is not a
 * devroom booking. A session with no devroom (a meal, a keynote, a hall talk)
 * ends the run; the next devroom session starts another. Sessions without a
 * start or end are ignored.
 */
export function devroomBlocks(
  activities: readonly Pick<Activity, 'devroomId' | 'start' | 'end'>[],
  names: Map<string, string>,
): DevroomBlock[] {
  const sorted = activities
    .filter((a) => a.start && a.end)
    .sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
  const blocks: DevroomBlock[] = [];
  let open: DevroomBlock | null = null;
  for (const activity of sorted) {
    const trackId = activity.devroomId;
    const name = trackId ? names.get(trackId) : undefined;
    if (!trackId || !name) {
      open = null;
      continue;
    }
    if (open && open.trackId === trackId) {
      if (Date.parse(activity.end!) > Date.parse(open.end)) open.end = activity.end!;
    } else {
      open = { trackId, name, start: activity.start!, end: activity.end! };
      blocks.push(open);
    }
  }
  return blocks;
}
