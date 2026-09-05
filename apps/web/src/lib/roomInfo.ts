import type { Activity, EventBundle, Person } from '@indiafoss/model';
import { formatDayLabel, formatTime } from '@indiafoss/schedule';

/**
 * What a devroom is about, for the attendee deciding whether it is for them:
 * the count, when it runs and who speaks. Used when the programme has no
 * description of its own for the track.
 */
export interface RoomSummary {
  /** "10 talks · Sat 11:00–17:30", or "3 BoFs · Sat 14:00–16:00". */
  line: string;
  speakers: Person[];
  /**
   * The session kinds an attendee chooses a room *for*, with their counts —
   * BoFs, workshops, panels. Talks are not among them: they are the default,
   * and a badge on every row says nothing.
   *
   * This is what lets someone opt into or out of the participatory sessions
   * (#132). They are easy to miss: at IndiaFOSS 2025 the six BoFs are split
   * across a bare "Devroom 2" and the "Food Area", neither of which reads as
   * somewhere a talk happens.
   */
  kinds: { label: string; count: number }[];
}

/** Plural label for the kinds worth calling out; talks are deliberately absent. */
const SPECIAL_KINDS: { type: Activity['type']; one: string; many: string }[] = [
  { type: 'bof', one: 'BoF', many: 'BoFs' },
  { type: 'workshop', one: 'workshop', many: 'workshops' },
  { type: 'panel', one: 'panel', many: 'panels' },
];

/**
 * How to count a room's sessions.
 *
 * Calling six BoFs "6 talks" is not a rounding error — it is the word an
 * attendee uses to decide whether they have to participate. A room that is
 * entirely one special kind is counted in that kind; a mixed room is counted
 * in the neutral "sessions"; only an all-talks room says "talks".
 */
function countLine(sessions: Activity[]): string {
  const n = sessions.length;
  const types = new Set(sessions.map((a) => a.type));
  const only = types.size === 1 ? [...types][0] : undefined;
  const special = SPECIAL_KINDS.find((k) => k.type === only);
  if (special) return `${n} ${n === 1 ? special.one : special.many}`;
  const talkish = new Set(['talk', 'lightning-talk', 'keynote']);
  const allTalks = [...types].every((t) => talkish.has(t));
  if (allTalks) return `${n} ${n === 1 ? 'talk' : 'talks'}`;
  return `${n} ${n === 1 ? 'session' : 'sessions'}`;
}

export function roomSummary(bundle: EventBundle, sessions: Activity[]): RoomSummary {
  const timed = sessions
    .filter((a) => a.start && a.end)
    .sort((x, y) => x.start!.localeCompare(y.start!));
  const days = [...new Set(timed.map((a) => a.start!.slice(0, 10)))];
  const when = days
    .map((day) => {
      const on = timed.filter((a) => a.start!.startsWith(day));
      const lo = on[0]!.start!;
      const hi = on.reduce((h, a) => (a.end! > h ? a.end! : h), on[0]!.end!);
      return `${formatDayLabel(day).slice(0, 3)} ${formatTime(lo)}–${formatTime(hi)}`;
    })
    .join(', ');
  const speakerIds = new Set(sessions.flatMap((a) => a.speakerIds));
  const speakers = bundle.people.filter((p) => speakerIds.has(p.id));
  const counted = countLine(sessions);
  const kinds = SPECIAL_KINDS.map((k) => ({
    label: sessions.filter((a) => a.type === k.type).length === 1 ? k.one : k.many,
    count: sessions.filter((a) => a.type === k.type).length,
  }))
    .filter((k) => k.count > 0)
    // A room that is nothing but BoFs already reads "3 BoFs"; badging it
    // "3 BoFs" again says it twice and makes the exception look like emphasis.
    .filter((k) => !counted.startsWith(`${k.count} ${k.label}`));
  return {
    line: `${counted}${when ? ` · ${when}` : ''}`,
    speakers,
    kinds,
  };
}
