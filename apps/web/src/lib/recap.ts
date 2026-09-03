import type { ContactRecord } from '@indiafoss/storage';
import type { EventBundle } from '@indiafoss/model';
import { formatDayLabel, formatTime } from '@indiafoss/schedule';

/**
 * "Who I met" (#31): the conference read back as the people you met, grouped
 * by day and by where you were standing when you scanned them.
 *
 * Pure and local. It reads the contacts already on the device and the event
 * bundle for names; nothing is fetched and nothing is sent. The screen and the
 * shareable image are both drawn from what this returns, so what you see is
 * exactly what you would share.
 */

export interface RecapPlace {
  /** Session or room the scans happened at; null for the ones with no place. */
  key: string;
  label: string;
  /** "10:15–10:30" when a session is known. */
  when?: string;
  contacts: ContactRecord[];
}

export interface RecapDay {
  /** `YYYY-MM-DD`. */
  day: string;
  label: string;
  places: RecapPlace[];
  count: number;
}

export interface Recap {
  days: RecapDay[];
  /** Everyone met, newest first. */
  total: number;
  /** People whose card was signed and whose signature checked out. */
  signed: number;
  /** People met more than once. */
  metAgain: number;
  /** The busiest place, when there is one. */
  busiest?: { label: string; count: number };
}

/** The day a contact belongs to, from when they were saved. */
function dayOf(contact: ContactRecord): string {
  return contact.savedAt.slice(0, 10);
}

export function buildRecap(contacts: ContactRecord[], bundle: EventBundle | null): Recap {
  const activity = (id: string | undefined) =>
    id ? bundle?.activities.find((a) => a.id === id) : undefined;
  const location = (id: string | undefined) =>
    id ? bundle?.locations.find((l) => l.id === id) : undefined;

  const byDay = new Map<string, Map<string, RecapPlace>>();
  for (const contact of [...contacts].sort((a, b) => b.savedAt.localeCompare(a.savedAt))) {
    const day = dayOf(contact);
    const places = byDay.get(day) ?? new Map<string, RecapPlace>();
    byDay.set(day, places);

    const session = activity(contact.metActivityId);
    const room = location(contact.metLocationId);
    const key = session?.id ?? room?.id ?? 'elsewhere';
    const place = places.get(key) ?? {
      key,
      label: session?.title ?? room?.name ?? 'Around the venue',
      ...(session?.start && session.end
        ? { when: `${formatTime(session.start)}–${formatTime(session.end)}` }
        : {}),
      contacts: [],
    };
    place.contacts.push(contact);
    places.set(key, place);
  }

  const days: RecapDay[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, places]) => {
      const ordered = [...places.values()].sort(
        (a, b) => b.contacts.length - a.contacts.length || a.label.localeCompare(b.label),
      );
      return {
        day,
        label: formatDayLabel(day),
        places: ordered,
        count: ordered.reduce((n, p) => n + p.contacts.length, 0),
      };
    });

  const everyPlace = days.flatMap((d) => d.places);
  const busiest = everyPlace
    .filter((p) => p.key !== 'elsewhere')
    .sort((a, b) => b.contacts.length - a.contacts.length)[0];

  return {
    days,
    total: contacts.length,
    signed: contacts.filter((c) => c.signature === 'valid').length,
    metAgain: contacts.filter((c) => (c.metCount ?? 1) > 1).length,
    ...(busiest ? { busiest: { label: busiest.label, count: busiest.contacts.length } } : {}),
  };
}

/** The lines the shareable image carries, in order. Kept here so they are testable. */
export interface RecapCardLines {
  title: string;
  headline: string;
  stats: string[];
  /** Names, when the attendee chose to include them. */
  names: string[];
}

export function recapCardLines(
  recap: Recap,
  eventName: string,
  options: { withNames?: boolean; maxNames?: number } = {},
): RecapCardLines {
  const { withNames = true, maxNames = 12 } = options;
  const people = recap.total === 1 ? '1 person' : `${recap.total} people`;
  const stats: string[] = [];
  if (recap.days.length > 0) {
    stats.push(recap.days.length === 1 ? 'over one day' : `over ${recap.days.length} days`);
  }
  if (recap.busiest) {
    stats.push(`most at ${recap.busiest.label}`);
  }
  if (recap.metAgain > 0) {
    stats.push(`${recap.metAgain} more than once`);
  }
  if (recap.signed > 0) {
    stats.push(`${recap.signed} signed`);
  }

  const everyone = recap.days.flatMap((d) => d.places.flatMap((p) => p.contacts));
  const named = everyone.map((c) => c.fullName.trim()).filter(Boolean);
  const names = withNames ? named.slice(0, maxNames) : [];
  if (withNames && named.length > maxNames) {
    names.push(`and ${named.length - maxNames} more`);
  }

  return {
    title: eventName,
    headline: recap.total === 0 ? 'No one yet' : `I met ${people}`,
    stats,
    names,
  };
}
