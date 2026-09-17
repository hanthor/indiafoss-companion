import { describe, expect, it } from 'vitest';
import type { Activity } from '@indiafoss/model';
import { activityDevroomColor, devroomArt, devroomColor } from './devroom-art';

describe('devroom colours follow the 2026 artwork', () => {
  it('names a token for every devroom that has artwork, and nothing else', () => {
    for (const [trackId, art] of Object.entries(devroomArt)) {
      expect(devroomColor(trackId, 'indiafoss-2026')).toBe(`var(--devroom-${art})`);
    }
    expect(devroomColor('hall-1', 'indiafoss-2026')).toBeUndefined();
    expect(devroomColor(undefined, 'indiafoss-2026')).toBeUndefined();
  });

  it('gives another event no colour, so archives never wear 2026 art', () => {
    expect(devroomColor('devroom-security', 'indiafoss-2025')).toBeUndefined();
  });

  it('prefers the session devroom over its track', () => {
    const activity = { trackId: 'room-1', devroomId: 'devroom-security' } as Activity;
    expect(activityDevroomColor(activity, 'indiafoss-2026')).toBe('var(--devroom-security)');
    expect(
      activityDevroomColor({ trackId: 'devroom-open-design' } as Activity, 'indiafoss-2026'),
    ).toBe('var(--devroom-design)');
  });
});
