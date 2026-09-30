/**
 * The day before IndiaFOSS 2026: events FOSS United runs separately from the
 * conference, copied from their public pages on fossunited.org (checked
 * 24 Sep 2026). The conference programme feed does not carry them.
 */
export interface PreConferenceSession {
  time: string;
  title: string;
  speakers: string;
}

export interface PreConferenceEvent {
  id: string;
  title: string;
  when: string;
  where: string;
  mapUrl: string;
  access: string;
  notes: string[];
  url: string;
  linkLabel: string;
  sessions?: PreConferenceSession[];
}

/** Both are over by 17:00 IST on the 25th; the card goes with them. */
export const PRE_CONFERENCE_ENDS = '2026-09-25T17:00:00+05:30';

export const PRE_CONFERENCE_EVENTS: readonly PreConferenceEvent[] = [
  {
    id: 'workshops',
    title: 'Workshops',
    when: 'Thu 25 Sep · 10:00–17:00',
    where: 'NIMHANS Convention Centre',
    mapUrl: 'https://www.openstreetmap.org/search?query=NIMHANS%20Convention%20Centre%20Bengaluru',
    access: 'Separate ticket, ₹127. A conference ticket does not get you in.',
    notes: ['Morning and afternoon workshops overlap, so pick one per slot.'],
    url: 'https://fossunited.org/c/indiafoss/2026/workshops',
    linkLabel: 'Workshop tickets',
    sessions: [
      { time: '10:00', title: 'Getting Started with Qt', speakers: 'Mahesh Gaur, Prashanth Udupa' },
      {
        time: '10:00',
        title: 'Art - meet Math - meet Code',
        speakers: 'Mathura Govindarajan, Aditi Bhat',
      },
      {
        time: '10:00',
        title: 'Building AI agents end-to-end: A hands-on workshop',
        speakers: 'Ashita Prasad',
      },
      { time: '13:00', title: 'Lunch break', speakers: '' },
      {
        time: '14:00',
        title: 'Self-Hosting 101: A real-time self-hosting workshop',
        speakers: 'Venkatesh Chaturvedi',
      },
      {
        time: '14:00',
        title:
          'Digital Security for Journalists, Activists, and Everyday Internet Users: A Hands-On FOSS Workshop',
        speakers: 'Anuvind Praveen',
      },
      { time: '14:00', title: 'Fun and Profit with OCaml', speakers: 'Alina Banerjee' },
      {
        time: '15:00',
        title: 'Adding places to OpenStreetMap (outdoor workshop)',
        speakers: 'contrapunctus',
      },
    ],
  },
  {
    id: 'maintainer-summit',
    title: 'Maintainer Summit',
    when: 'Thu 25 Sep · 09:00–17:00',
    where: 'Samagata Foundation, Church Street',
    mapUrl:
      'https://www.openstreetmap.org/search?query=Samagata%20Foundation%20Church%20Street%20Bengaluru',
    access: 'For core maintainers of open-source and open-commons projects, by application.',
    notes: [
      'An unconference: attendees set the sessions at the venue, so arrive on time.',
      'Internet and lunch are provided.',
      'Registered but can’t come? Email maintainers@fossunited.org.',
    ],
    url: 'https://fossunited.org/c/indiafoss/maintainer-summit',
    linkLabel: 'Summit details',
  },
];
