import { describe, expect, it } from 'vitest';
import { DEFAULT_ATTENDEE_SHARE_SELECTION } from '@indiafoss/model';
import { CARD_FIELDS, byteLength, selectionKeyFor, sharedFieldCount } from './card-fields';

describe('card fields', () => {
  it('maps every profile row to a share switch', () => {
    for (const spec of CARD_FIELDS) {
      expect(selectionKeyFor(spec.key as never)).not.toBeNull();
    }
  });

  it('counts only non-empty fields whose switch is on', () => {
    const profile = {
      fullName: 'Asha Rao',
      organization: '',
      email: 'a@example.org',
      socials: { github: 'https://github.com/asha', linkedin: '' },
    };
    const selection = {
      ...DEFAULT_ATTENDEE_SHARE_SELECTION,
      email: false,
      socials: { github: true, linkedin: true },
    };
    // name (on, set) + github (on, set); org empty, email off, linkedin empty.
    expect(sharedFieldCount(profile, selection)).toBe(2);
    expect(sharedFieldCount(profile, { ...selection, email: true })).toBe(3);
  });

  it('measures the QR payload in bytes, not characters', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('नमस्ते')).toBeGreaterThan(6);
  });
});
