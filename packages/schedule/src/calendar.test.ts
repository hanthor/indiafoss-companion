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
      speakerIds: ['p-aarav', 'p-riya'],
      tags: ['Talk', 'FOSS'],
      sourceUrl: 'https://fossunited.org/cfp/act-a',
      recordingUrl: 'https://videos.example/act-a',
      slidesUrl: 'https://slides.example/act-a',
      source: 'test',
    },
  ],
  people: [
    { id: 'p-aarav', name: 'Aarav Sharma', links: [] },
    { id: 'p-riya', name: 'Riya Verma', links: [] },
  ],
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

  it('includes speakers and recording/slides links in the description', () => {
    const ics = activityToIcs(bundle, bundle.activities[0]!);
    // Folding can split long DESCRIPTION lines, so match on unfolded text.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('Speakers: Aarav Sharma\\, Riya Verma');
    expect(unfolded).toContain('Recording: https://videos.example/act-a');
    expect(unfolded).toContain('Slides: https://slides.example/act-a');
  });

  it('adds a distinct leave-by alarm alongside the starting-soon alarm', () => {
    const ics = activityToIcs(bundle, bundle.activities[0]!, {
      includeAlarm: true,
      alarmMinutesBefore: 10,
      leaveByMinutesBefore: 25,
    });
    expect((ics.match(/BEGIN:VALARM/g) ?? []).length).toBe(2);
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics).toContain('TRIGGER:-PT25M');
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('Leave now for:');
  });

  it('produces a stable UID from eventId + activityId across repeated exports', () => {
    const first = activityToIcs(bundle, bundle.activities[0]!);
    const second = activityToIcs(bundle, bundle.activities[0]!);
    const uidLine = (ics: string) => ics.split('\r\n').find((l) => l.startsWith('UID:'));
    expect(uidLine(first)).toBe('UID:act-a@indiafoss-2025.indiafoss');
    // Repeating the export must not change the UID (no ambiguous duplicates).
    expect(uidLine(first)).toBe(uidLine(second));
    // The same activity keeps its UID inside an itinerary export too.
    const itin = itineraryToIcs(bundle, [
      { activityId: 'act-a', start: bundle.activities[0]!.start!, end: bundle.activities[0]!.end! },
    ]);
    expect(itin).toContain('UID:act-a@indiafoss-2025.indiafoss');
  });
});
