import type { Activity, EventBundle } from '@indiafoss/model';

export const EVENT_TIMEZONE = 'Asia/Kolkata';

export interface CalendarEntry {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  url?: string;
  categories?: string[];
  cancelled?: boolean;
}

export interface CalendarOptions {
  includeAlarm?: boolean;
  alarmMinutesBefore?: number;
  productId?: string;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([;,])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line: string): string[] {
  // RFC 5545 limits content lines to 75 octets; fold at safe UTF-8 boundaries.
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const charBytes = new TextEncoder().encode(char).length;
    if (bytes + charBytes > 75 && current) {
      chunks.push(current);
      current = ` ${char}`;
      bytes = 1 + charBytes;
    } else {
      current += char;
      bytes += charBytes;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function localDateTime(iso: string): string {
  // Normalized event timestamps carry the event's +05:30 offset. Preserve the
  // wall-clock component and declare TZID explicitly in the ICS property.
  return `${iso.slice(0, 10).replace(/-/g, '')}T${iso.slice(11, 19).replace(/:/g, '')}`;
}

function utcStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid calendar timestamp: ${iso}`);
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function entryFromActivity(bundle: EventBundle, activity: Activity): CalendarEntry {
  return {
    id: activity.id,
    title: activity.title,
    start: activity.start ?? bundle.start,
    end: activity.end ?? activity.start ?? bundle.end,
    location: activity.locationId
      ? bundle.locations.find((location) => location.id === activity.locationId)?.name
      : undefined,
    description: activity.description,
    url: activity.sourceUrl ?? activity.recordingUrl ?? activity.slidesUrl,
    categories: [activity.type, ...activity.tags],
    cancelled: activity.cancelled,
  };
}

function contentLine(lines: string[], line: string): void {
  for (const folded of foldLine(line)) lines.push(folded);
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${EVENT_TIMEZONE}`,
  'X-LIC-LOCATION:Asia/Kolkata',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0530',
  'TZOFFSETTO:+0530',
  'TZNAME:IST',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Generate a single RFC 5545 event. */
export function calendarEntryToIcs(
  bundle: EventBundle,
  entry: CalendarEntry,
  options: CalendarOptions = {},
): string {
  const alarmMinutes = options.alarmMinutesBefore ?? 15;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//IndiaFOSS Companion//${options.productId ?? 'PWA'}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE,
    'BEGIN:VEVENT',
  ];
  contentLine(lines, `UID:${entry.id}@${bundle.id}.indiafoss`);
  contentLine(lines, `DTSTAMP:${utcStamp(bundle.start)}`);
  contentLine(lines, `DTSTART;TZID=${EVENT_TIMEZONE}:${localDateTime(entry.start)}`);
  contentLine(lines, `DTEND;TZID=${EVENT_TIMEZONE}:${localDateTime(entry.end)}`);
  contentLine(lines, `SUMMARY:${escapeText(entry.title)}`);
  if (entry.location) contentLine(lines, `LOCATION:${escapeText(entry.location)}`);
  if (entry.description) contentLine(lines, `DESCRIPTION:${escapeText(entry.description)}`);
  if (entry.url) contentLine(lines, `URL:${escapeText(entry.url)}`);
  if (entry.categories?.length) {
    contentLine(lines, `CATEGORIES:${entry.categories.map(escapeText).join(',')}`);
  }
  if (entry.cancelled) contentLine(lines, 'STATUS:CANCELLED');
  if (options.includeAlarm) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY');
    contentLine(lines, `DESCRIPTION:${escapeText(`Starting soon: ${entry.title}`)}`);
    contentLine(lines, `TRIGGER:-PT${alarmMinutes}M`);
    lines.push('END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/** Generate a calendar containing multiple entries. */
export function calendarEntriesToIcs(
  bundle: EventBundle,
  entries: CalendarEntry[],
  options: CalendarOptions = {},
): string {
  const alarmMinutes = options.alarmMinutesBefore ?? 15;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//IndiaFOSS Companion//${options.productId ?? 'PWA'}//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE,
  ];
  for (const entry of entries) {
    lines.push('BEGIN:VEVENT');
    contentLine(lines, `UID:${entry.id}@${bundle.id}.indiafoss`);
    contentLine(lines, `DTSTAMP:${utcStamp(bundle.start)}`);
    contentLine(lines, `DTSTART;TZID=${EVENT_TIMEZONE}:${localDateTime(entry.start)}`);
    contentLine(lines, `DTEND;TZID=${EVENT_TIMEZONE}:${localDateTime(entry.end)}`);
    contentLine(lines, `SUMMARY:${escapeText(entry.title)}`);
    if (entry.location) contentLine(lines, `LOCATION:${escapeText(entry.location)}`);
    if (entry.description) contentLine(lines, `DESCRIPTION:${escapeText(entry.description)}`);
    if (entry.url) contentLine(lines, `URL:${escapeText(entry.url)}`);
    if (entry.categories?.length)
      contentLine(lines, `CATEGORIES:${entry.categories.map(escapeText).join(',')}`);
    if (entry.cancelled) contentLine(lines, 'STATUS:CANCELLED');
    if (options.includeAlarm) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY');
      contentLine(lines, `DESCRIPTION:${escapeText(`Starting soon: ${entry.title}`)}`);
      contentLine(lines, `TRIGGER:-PT${alarmMinutes}M`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function activityToIcs(
  bundle: EventBundle,
  activity: Activity,
  options?: CalendarOptions,
): string {
  return calendarEntryToIcs(bundle, entryFromActivity(bundle, activity), options);
}

export function eventToIcs(bundle: EventBundle, options?: CalendarOptions): string {
  return calendarEntriesToIcs(
    bundle,
    bundle.activities
      .filter((activity) => activity.start && activity.end)
      .map((activity) => entryFromActivity(bundle, activity)),
    options,
  );
}

export interface ItineraryCalendarItem {
  activityId: string;
  start: string;
  end: string;
  flexible?: boolean;
  label?: string;
}

export function itineraryToIcs(
  bundle: EventBundle,
  items: ItineraryCalendarItem[],
  options?: CalendarOptions,
): string {
  const entries = items.map((item, index) => {
    const activity = bundle.activities.find((candidate) => candidate.id === item.activityId);
    return {
      id: item.flexible ? item.activityId : (activity?.id ?? item.activityId),
      title: item.flexible ? (item.label ?? 'Flexible time') : (activity?.title ?? item.activityId),
      start: item.start,
      end: item.end,
      location: activity?.locationId
        ? bundle.locations.find((location) => location.id === activity.locationId)?.name
        : undefined,
      description: activity?.description,
      url: activity?.sourceUrl ?? activity?.recordingUrl ?? activity?.slidesUrl,
      categories: item.flexible
        ? ['flexible']
        : [activity?.type ?? 'custom', ...(activity?.tags ?? [])],
      // Guard against malformed duplicate custom ids while retaining stable
      // activity UIDs for ordinary entries.
      ...(item.flexible ? { id: `${item.activityId}-${index}` } : {}),
    };
  });
  return calendarEntriesToIcs(bundle, entries, options);
}
