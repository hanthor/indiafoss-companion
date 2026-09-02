import { describe, expect, it } from 'vitest';
import { attendeeProfileToVCard, type AttendeeShareSelection } from './contact.js';
import {
  MAX_SCAN_PAYLOAD_BYTES,
  parseLocationPayload,
  parseScannedPayload,
  parseVCard,
} from './scan.js';

const FULL_SELECTION: AttendeeShareSelection = {
  name: true,
  organization: true,
  email: true,
  phone: true,
  website: true,
  matrixId: true,
  fossUnitedProfileUrl: true,
  socials: { github: true, mastodon: true },
};

describe('parseLocationPayload', () => {
  it('extracts a valid location id', () => {
    expect(parseLocationPayload('indiafoss://location/audi-1')).toBe('audi-1');
    expect(parseLocationPayload('INDIAFOSS://LOCATION/Audi-1/')).toBe('Audi-1');
  });

  it('rejects non-location or malformed links', () => {
    expect(parseLocationPayload('indiafoss://booth/kde')).toBeNull();
    expect(parseLocationPayload('indiafoss://location/')).toBeNull();
    expect(parseLocationPayload('indiafoss://location/has space')).toBeNull();
    expect(parseLocationPayload('https://example.com/location/x')).toBeNull();
  });
});

describe('parseScannedPayload location handling', () => {
  it('accepts a valid location deep link', () => {
    expect(parseScannedPayload('indiafoss://location/room-3')).toEqual({
      kind: 'location',
      locationId: 'room-3',
    });
  });

  it('rejects unsupported indiafoss:// link types', () => {
    const result = parseScannedPayload('indiafoss://booth/kde');
    expect(result).toMatchObject({ kind: 'error', reason: 'unsupported' });
  });

  it('rejects malformed location links', () => {
    const result = parseScannedPayload('indiafoss://location/');
    expect(result).toMatchObject({ kind: 'error', reason: 'malformed' });
  });
});

describe('parseScannedPayload guards', () => {
  it('rejects empty input', () => {
    expect(parseScannedPayload('   ')).toMatchObject({ kind: 'error', reason: 'empty' });
  });

  it('rejects oversized payloads', () => {
    const huge = `indiafoss://location/${'a'.repeat(MAX_SCAN_PAYLOAD_BYTES)}`;
    expect(parseScannedPayload(huge)).toMatchObject({ kind: 'error', reason: 'oversized' });
  });

  it('rejects unsupported non-IndiaFOSS payloads', () => {
    expect(parseScannedPayload('https://example.com')).toMatchObject({
      kind: 'error',
      reason: 'unsupported',
    });
  });
});

describe('parseVCard', () => {
  it('round-trips a generated vCard back into a profile', () => {
    const vcard = attendeeProfileToVCard(
      {
        fullName: 'Aarav Sharma',
        organization: 'FOSS United',
        email: 'aarav@example.org',
        phone: '+91 90000 00000',
        website: 'https://aarav.example',
        matrixId: '@aarav:matrix.org',
        fossUnitedProfileUrl: 'https://fossunited.org/u/aarav',
        socials: { github: 'https://github.com/aarav', mastodon: 'https://fosstodon.org/@aarav' },
      },
      FULL_SELECTION,
    );
    const profile = parseVCard(vcard);
    expect(profile).not.toBeNull();
    expect(profile).toMatchObject({
      fullName: 'Aarav Sharma',
      organization: 'FOSS United',
      email: 'aarav@example.org',
      phone: '+91 90000 00000',
      matrixId: '@aarav:matrix.org',
      fossUnitedProfileUrl: 'https://fossunited.org/u/aarav',
    });
    expect(profile?.socials.github).toBe('https://github.com/aarav');
    expect(profile?.socials.mastodon).toBe('https://fosstodon.org/@aarav');
  });

  it('unescapes special characters and derives a name from N when FN is absent', () => {
    const vcard =
      'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Person\\, Name;Comma;;;\r\nORG:Acme\\; Inc\r\nEND:VCARD\r\n';
    const profile = parseVCard(vcard);
    expect(profile?.fullName).toBe('Comma Person, Name');
    expect(profile?.organization).toBe('Acme; Inc');
  });

  it('preserves Unicode values', () => {
    const vcard = attendeeProfileToVCard(
      { fullName: 'आरव शर्मा 🚀', organization: 'Føss Unión', socials: {} },
      { ...FULL_SELECTION, socials: {} },
    );
    const profile = parseVCard(vcard);
    expect(profile?.fullName).toBe('आरव शर्मा 🚀');
    expect(profile?.organization).toBe('Føss Unión');
  });

  it('reads a Matrix id from IMPP when X-MATRIX-ID is missing', () => {
    const vcard =
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Riya\r\nIMPP:matrix:@riya:matrix.org\r\nEND:VCARD\r\n';
    expect(parseVCard(vcard)?.matrixId).toBe('@riya:matrix.org');
  });

  it('returns null for non-vCard or empty cards', () => {
    expect(parseVCard('not a vcard')).toBeNull();
    expect(parseVCard('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n')).toBeNull();
  });

  it('is exposed through parseScannedPayload for contact cards', () => {
    const vcard = attendeeProfileToVCard({ fullName: 'Solo', socials: {} });
    const result = parseScannedPayload(vcard);
    expect(result).toMatchObject({ kind: 'contact' });
    if (result.kind === 'contact') {
      expect(result.profile.fullName).toBe('Solo');
      expect(result.vcard).toBe(vcard);
    }
  });
});
