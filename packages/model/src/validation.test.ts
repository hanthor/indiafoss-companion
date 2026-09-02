import { describe, expect, it } from 'vitest';
import { collectBundleWarnings } from './validation.js';
import type { EventBundle } from './index.js';

describe('collectBundleWarnings', () => {
  it('flags links that are not http(s) or mailto URLs without failing the bundle', () => {
    const bundle = {
      activities: [{ id: 'a', title: 'A', links: [{ label: 'x', url: 'not a url' }] }],
      people: [{ id: 'p', name: 'P', links: [{ url: 'https://github.com/p' }, { url: '@p' }] }],
    } as unknown as EventBundle;
    expect(collectBundleWarnings(bundle)).toEqual([
      'person p has a malformed link: @p',
      'activity a has a malformed link: not a url',
    ]);
  });

  it('flags a venue-wide item listed once per hall', () => {
    const bundle = {
      activities: [
        { id: 'a1', title: 'Registrations', start: '2025-09-20T08:00:00+05:30' },
        { id: 'a2', title: 'Registrations', start: '2025-09-20T08:00:00+05:30' },
        { id: 'a3', title: 'A talk', start: '2025-09-20T09:00:00+05:30' },
      ],
      people: [],
    } as unknown as EventBundle;
    expect(collectBundleWarnings(bundle)).toEqual([
      '2 activities share a title and start time (Registrations@2025-09-20T08:00:00+05:30): a1, a2',
    ]);
  });

  it('flags a title naming a different room than the one it is scheduled in', () => {
    const bundle = {
      activities: [
        { id: 'a1', title: 'Opening Note (Audi 1)', locationId: 'audi-2' },
        { id: 'a2', title: 'Opening Note (Audi 2)', locationId: 'audi-2' },
        { id: 'a3', title: 'A talk (with a parenthetical)', locationId: 'audi-2' },
      ],
      locations: [
        { id: 'audi-1', name: 'Audi 1' },
        { id: 'audi-2', name: 'Audi 2' },
      ],
      people: [],
    } as unknown as EventBundle;
    expect(collectBundleWarnings(bundle)).toEqual([
      'activity a1 is titled "Opening Note (Audi 1)" but is located in audi 2',
    ]);
  });
});
