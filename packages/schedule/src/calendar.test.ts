import { describe, expect, it } from 'vitest';
import type { EventBundle } from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import { activityToIcs, calendarEntryToIcs, eventToIcs, itineraryToIcs } from './calendar.js';

const bundle: EventBundle = {
  schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
  id: 'indiafoss-2025',
  name: 'IndiaFOSS 2025',
  timezone: 'Asia/Kolkata',
  start: '2025-09-20T09:00:00+05:30',
  end: '2025-09-21T17:00:00+05:30',
  activities: [
    {
      id: 'act-a',
      type: 'talk',
      title: 'Open source, commas; and backslashes \\',
      description: 'Line one\nLine two',
      start: '2025-09-20T10:00:00+05:30',
      end: '2025-09-20T11:00:00+05:30',
      flexible: false,
      locationId: 'audi-1',
      speakerIds: [],
      tags: ['Talk', 'FOSS'],
      sourceUrl: 'https://fossunited.org/cfp/act-a',
      source: 'test',
    },
  ],
  people: [],
  locations: [{ id: 'audi-1', name: 'Audi 1', kind: 'room', routingNodeIds: [] }],
  booths: [],
  tracks: [],
  sourceMetadata: { source: 'test', normalizerVersion: '1' },
};

describe('calendar export', () => {
  it('emits a valid VCALENDAR with explicit Asia/Kolkata timezone', () => {
    const ics = activityToIcs(bundle, bundle.activities[0]!);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('TZID:Asia/Kolkata');
    expect(ics).toContain('DTSTART;TZID=Asia/Kolkata:20250920T100000');
    expect(ics).toContain('DTEND;TZID=Asia/Kolkata:20250920T110000');
    expect(ics).toContain('UID:act-a@indiafoss-2025.indiafoss');
    expect(ics).toContain('LOCATION:Audi 1');
    expect(ics).toContain('URL:https://fossunited.org/cfp/act-a');
    expect(ics).toContain('END:VCALENDAR\r\n');
  });

  it('escapes RFC text and folds long UTF-8 lines', () => {
    const ics = calendarEntryToIcs(bundle, {
      id: 'long',
      title: 'A'.repeat(120),
      start: '2025-09-20T10:00:00+05:30',
      end: '2025-09-20T11:00:00+05:30',
      description: 'comma, semicolon; slash\\ and newline\nnext',
    });
    expect(ics).toContain(`SUMMARY:${'A'.repeat(20)}`);
    expect(ics).toContain('DESCRIPTION:comma\\, semicolon\\; slash\\\\ and newline\\nnext');
    expect(ics.split('\r\n').some((line) => line.startsWith(' '))).toBe(true);
  });

  it('adds optional alarms', () => {
    const ics = activityToIcs(bundle, bundle.activities[0]!, {
      includeAlarm: true,
      alarmMinutesBefore: 10,
    });
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics).toContain('END:VALARM');
  });

  it('exports the full event and itinerary, including flexible items', () => {
    const full = eventToIcs(bundle);
    expect((full.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    const itinerary = itineraryToIcs(bundle, [
      { activityId: 'act-a', start: bundle.activities[0]!.start!, end: bundle.activities[0]!.end! },
      {
        activityId: 'flex-hallway-1',
        start: '2025-09-20T11:15:00+05:30',
        end: '2025-09-20T11:45:00+05:30',
        flexible: true,
        label: 'Hallway conversations',
      },
    ]);
    expect((itinerary.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
    expect(itinerary).toContain('SUMMARY:Hallway conversations');
    expect(itinerary).toContain('CATEGORIES:flexible');
  });
});
