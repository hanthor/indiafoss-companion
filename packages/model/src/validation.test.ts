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
});
