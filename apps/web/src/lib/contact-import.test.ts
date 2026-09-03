import { describe, expect, it } from 'vitest';
import type { AttendeeProfile } from '@indiafoss/model';
import { profileFromContactFile } from './contact-import';
import { applyImportedProfile } from './fossunited';

const OWN_CARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:Menon;Asha;;;',
  'FN:Asha Menon',
  'ORG:FOSS United',
  'TEL;TYPE=CELL:+91 98765 43210',
  'EMAIL;TYPE=INTERNET:asha@example.org',
  'URL:https://asha.example',
  'X-SOCIALPROFILE;TYPE=github:https://github.com/ashamenon',
  'END:VCARD',
].join('\r\n');

describe('profileFromContactFile', () => {
  it('reads the phone contact card into the fields the companion card has', () => {
    expect(profileFromContactFile(OWN_CARD)).toEqual({
      fullName: 'Asha Menon',
      organization: 'FOSS United',
      email: 'asha@example.org',
      phone: '+91 98765 43210',
      website: 'https://asha.example',
      socials: { github: 'https://github.com/ashamenon' },
    });
    expect(profileFromContactFile('not a card')).toBeNull();
  });

  it('fills only empty fields and reports every one it filled', () => {
    const target: AttendeeProfile = { fullName: 'Asha', socials: {} };
    const changes = applyImportedProfile(target, profileFromContactFile(OWN_CARD)!);
    expect(target.fullName).toBe('Asha');
    expect(target.email).toBe('asha@example.org');
    expect(target.phone).toBe('+91 98765 43210');
    expect(changes.map((c) => c.field)).toEqual([
      'Organisation',
      'Email',
      'Phone',
      'Website',
      'github',
    ]);
  });
});
