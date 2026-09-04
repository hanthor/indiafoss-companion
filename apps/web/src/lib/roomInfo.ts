import type { Activity, EventBundle, Person } from '@indiafoss/model';
import { formatDayLabel, formatTime } from '@indiafoss/schedule';

/**
 * What a devroom is about, for the attendee deciding whether it is for them:
 * the count, when it runs and who speaks. Used when the programme has no
 * description of its own for the track.
 */
export interface RoomSummary {
  /** "10 talks · Sat 11:00–17:30". */
  line: string;
  speakers: Person[];
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
  const n = sessions.length;
  return {
    line: `${n} ${n === 1 ? 'talk' : 'talks'}${when ? ` · ${when}` : ''}`,
    speakers,
  };
}
