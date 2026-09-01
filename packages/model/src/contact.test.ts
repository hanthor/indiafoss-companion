import { describe, expect, it } from 'vitest';
import {
  attendeeProfileToVCard,
  DEFAULT_ATTENDEE_SHARE_SELECTION,
  type AttendeeProfile,
  type AttendeeShareSelection,
} from './contact.js';

const profile: AttendeeProfile = {
  fullName: 'Aarav Sharma',
  organization: 'FOSS United',
  email: 'aarav@example.org',
  phone: '+91 90000 00000',
  website: 'https://aarav.example',
  matrixId: '@aarav:matrix.org',
  fossUnitedProfileUrl: 'https://fossunited.org/u/aarav',
  socials: {
    github: 'https://github.com/aarav',
    mastodon: 'https://fosstodon.org/@aarav',
  },
};

describe('attendeeProfileToVCard', () => {
  it('emits a valid vCard with defaults and omits opt-in-only fields', () => {
    const vcard = attendeeProfileToVCard(profile);
    expect(vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true);
    expect(vcard).toContain('FN:Aarav Sharma');
    expect(vcard).toContain('N:Sharma;Aarav;;;');
    expect(vcard).toContain('ORG:FOSS United');
    expect(vcard).toContain('URL;TYPE=website:https://aarav.example');
    expect(vcard).toContain('X-FOSSUNITED-PROFILE:https://fossunited.org/u/aarav');
    // opt-in only fields off by default
    expect(vcard).not.toContain('EMAIL');
    expect(vcard).not.toContain('TEL');
    expect(vcard).not.toContain('X-MATRIX-ID');
    // socials off by default
    expect(vcard).not.toContain('X-SOCIALPROFILE');
    expect(vcard.trimEnd().endsWith('END:VCARD')).toBe(true);
  });

  it('includes explicitly selected email, phone, matrix, and socials', () => {
    const selection: AttendeeShareSelection = {
      ...DEFAULT_ATTENDEE_SHARE_SELECTION,
      email: true,
      phone: true,
      matrixId: true,
      socials: { github: true, mastodon: false },
    };
    const vcard = attendeeProfileToVCard(profile, selection);
    expect(vcard).toContain('EMAIL;TYPE=INTERNET:aarav@example.org');
    expect(vcard).toContain('TEL;TYPE=CELL:+91 90000 00000');
    expect(vcard).toContain('X-MATRIX-ID:@aarav:matrix.org');
    expect(vcard).toContain('IMPP:matrix:@aarav:matrix.org');
    expect(vcard).toContain('X-SOCIALPROFILE;TYPE=github:https://github.com/aarav');
    expect(vcard).not.toContain('TYPE=mastodon');
  });

  it('escapes special characters and honours a minimal selection', () => {
    const vcard = attendeeProfileToVCard(
      { fullName: 'Comma, Person; Name', socials: {} },
      { ...DEFAULT_ATTENDEE_SHARE_SELECTION, website: false, fossUnitedProfileUrl: false },
    );
    expect(vcard).toContain('FN:Comma\\, Person\\; Name');
    expect(vcard).not.toContain('URL');
    expect(vcard).not.toContain('X-FOSSUNITED-PROFILE');
  });

  it('preserves Unicode names and social values', () => {
    const vcard = attendeeProfileToVCard(
      {
        fullName: 'आरव शर्मा 🚀',
        organization: 'Føss Unión',
        socials: { mastodon: 'https://ümlaut.social/@आरव' },
      },
      {
        ...DEFAULT_ATTENDEE_SHARE_SELECTION,
        organization: true,
        website: false,
        fossUnitedProfileUrl: false,
        socials: { mastodon: true },
      },
    );
    expect(vcard).toContain('FN:आरव शर्मा 🚀');
    expect(vcard).toContain('N:🚀;आरव शर्मा;;;');
    expect(vcard).toContain('ORG:Føss Unión');
    expect(vcard).toContain('X-SOCIALPROFILE;TYPE=mastodon:https://ümlaut.social/@आरव');
  });

  it('produces an empty-but-valid card when nothing is selected', () => {
    const empty: AttendeeShareSelection = {
      name: false,
      organization: false,
      email: false,
      phone: false,
      website: false,
      matrixId: false,
      fossUnitedProfileUrl: false,
      socials: {},
    };
    const vcard = attendeeProfileToVCard(profile, empty);
    expect(vcard).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n');
  });

  it('omits fields with empty or whitespace-only values even when selected', () => {
    const vcard = attendeeProfileToVCard(
      { fullName: 'Solo Attendee', organization: '   ', socials: {} },
      { ...DEFAULT_ATTENDEE_SHARE_SELECTION, organization: true },
    );
    expect(vcard).toContain('FN:Solo Attendee');
    expect(vcard).not.toContain('ORG');
  });
});
