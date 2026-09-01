import { describe, expect, it } from 'vitest';
import { isValidEventBundle } from '@indiafoss/model';
import { frappeDateTimeToIso, normalizeFossUnited, slugify, toIsoInKolkata } from './normalize.js';
import type { FosuEventDoc, FosuProposal, FosuSchedule } from './types.js';

const event: FosuEventDoc = {
  name: 'EVTEST',
  event_name: 'Test Conf',
  event_start_date: '2026-01-10 09:00:00',
  event_end_date: '2026-01-11 18:00:00',
  hall_options: 'Audi 1\nDevroom 1 (AOSP)\nFood Area',
  modified: '2026-01-01 00:00:00',
};

const schedule: FosuSchedule = {
  '2026-01-10': {
    'Audi 1': [
      {
        name: 'row-1',
        title: 'Opening Keynote',
        scheduled_date: '2026-01-10',
        start_time: '9:00:00',
        end_time: '10:00:00',
        hall: 'Audi 1',
        category: 'Opening Note',
        cfp_speakers: [
          {
            full_name: 'Ada Lovelace',
            bio: '<p>Analytical engine.</p>',
            social_link: 'https://example.com/ada',
          },
        ],
      },
      {
        name: 'row-2',
        title: 'Panel: Rust in prod',
        scheduled_date: '2026-01-10',
        start_time: '10:00:00',
        end_time: '11:00:00',
        hall: 'Audi 1',
        category: 'Other',
        linked_cfp: 'prop-panel',
        cfp_speakers: [
          { full_name: 'Ada Lovelace' },
          { full_name: 'Grace Hopper', photo: '/files/grace.png' },
        ],
      },
    ],
    'Devroom 1 (AOSP)': [
      {
        name: 'row-3',
        title: 'AOSP BoF',
        scheduled_date: '2026-01-10',
        start_time: '9:30:00',
        end_time: '11:00:00',
        hall: 'Devroom 1 (AOSP)',
        category: 'Other',
        linked_cfp: 'prop-bof',
      },
    ],
    'Food Area': [
      {
        name: 'row-4',
        title: 'Lunch',
        scheduled_date: '2026-01-10',
        start_time: '13:00:00',
        end_time: '14:00:00',
        hall: 'Food Area',
        category: 'Break',
      },
    ],
  },
};

const proposals: FosuProposal[] = [
  {
    name: 'prop-panel',
    talk_title: 'Panel: Rust in prod',
    session_type: 'Panel Discussion',
    status: 'Approved',
  },
  {
    name: 'prop-bof',
    talk_title: 'AOSP BoF',
    session_type: 'Birds of Feather(BoF)',
    status: 'Approved',
  },
];

describe('slugify', () => {
  it('slugifies hall names', () => {
    expect(slugify('Devroom 1 (AOSP)')).toBe('devroom-1-aosp');
    expect(slugify('Audi 1')).toBe('audi-1');
  });
});

describe('time helpers', () => {
  it('combines date + time into a +05:30 instant', () => {
    expect(toIsoInKolkata('2026-01-10', '9:05:00')).toBe('2026-01-10T09:05:00+05:30');
    expect(toIsoInKolkata('2026-01-10', '9:5:7')).toBe('2026-01-10T09:05:07+05:30');
  });

  it('converts frappe datetime strings', () => {
    expect(frappeDateTimeToIso('2026-01-10 09:00:00')).toBe('2026-01-10T09:00:00+05:30');
    expect(frappeDateTimeToIso(undefined)).toBeUndefined();
  });
});

describe('normalizeFossUnited', () => {
  const bundle = normalizeFossUnited({ eventId: 'test-conf', event, schedule, proposals });

  it('produces a valid canonical bundle', () => {
    expect(isValidEventBundle(bundle)).toBe(true);
    expect(bundle.id).toBe('test-conf');
    expect(bundle.name).toBe('Test Conf');
    expect(bundle.timezone).toBe('Asia/Kolkata');
    expect(bundle.start).toBe('2026-01-10T09:00:00+05:30');
    expect(bundle.end).toBe('2026-01-11T18:00:00+05:30');
    expect(bundle.sourceMetadata.source).toBe('fossunited');
  });

  it('maps schedule categories to canonical activity types', () => {
    const byTitle = new Map(bundle.activities.map((a) => [a.title, a]));
    expect(byTitle.get('Opening Keynote')?.type).toBe('keynote');
    expect(byTitle.get('Lunch')?.type).toBe('meal');
    expect(byTitle.get('Panel: Rust in prod')?.type).toBe('panel');
    expect(byTitle.get('AOSP BoF')?.type).toBe('bof');
  });

  it('builds rooms, food area and devroom locations', () => {
    const ids = bundle.locations.map((l) => l.id).sort();
    expect(ids).toContain('audi-1');
    expect(ids).toContain('food-area');
    expect(ids).toContain('devroom-1-aosp');
    expect(bundle.locations.find((l) => l.id === 'food-area')?.kind).toBe('food');
    expect(bundle.locations.find((l) => l.id === 'audi-1')?.kind).toBe('room');
  });

  it('assigns devroomId only to devroom sessions', () => {
    const bof = bundle.activities.find((a) => a.title === 'AOSP BoF');
    expect(bof?.devroomId).toBe('devroom-1-aosp');
    expect(bundle.activities.find((a) => a.title === 'Lunch')?.devroomId).toBeUndefined();
  });

  it('dedupes speakers and strips HTML from bios', () => {
    expect(bundle.people.length).toBe(2);
    const ada = bundle.people.find((p) => p.name === 'Ada Lovelace');
    expect(ada?.bio).toBe('Analytical engine.');
    expect(ada?.links[0]?.url).toBe('https://example.com/ada');
    const grace = bundle.people.find((p) => p.name === 'Grace Hopper');
    expect(grace?.avatarUrl).toBe('https://fossunited.org/files/grace.png');
  });

  it('links speaker ids from multiple sessions', () => {
    const panel = bundle.activities.find((a) => a.title.startsWith('Panel'));
    expect(panel?.speakerIds.length).toBe(2);
    const keynote = bundle.activities.find((a) => a.title === 'Opening Keynote');
    expect(keynote?.speakerIds.length).toBe(1);
  });

  it('derives stable ids from upstream row names', () => {
    expect(bundle.activities.find((a) => a.sourceId === 'row-1')?.id).toBe('act-row-1');
  });
});
