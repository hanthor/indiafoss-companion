import { describe, expect, it } from 'vitest';
import {
  contactBookToJson,
  contactBookToVCards,
  groupByDayMet,
  parseContactBook,
  searchContacts,
  splitVCards,
} from './contact-book.js';
import type { ContactBookEntry } from './contact-book.js';
import { attendeeProfileToVCard, DEFAULT_ATTENDEE_SHARE_SELECTION } from './contact.js';

const vcardFor = (name: string, extra: Record<string, string> = {}) =>
  attendeeProfileToVCard(
    { fullName: name, socials: {}, ...extra },
    { ...DEFAULT_ATTENDEE_SHARE_SELECTION, name: true, organization: true, website: true },
  );

const entry = (over: Partial<ContactBookEntry> & { fullName: string }): ContactBookEntry => ({
  id: over.id ?? `id-${over.fullName}`,
  vcard:
    over.vcard ??
    vcardFor(over.fullName, over.organization ? { organization: over.organization } : {}),
  socials: {},
  verified: false,
  savedAt: '2026-09-19T10:00:00.000Z',
  ...over,
});

describe('contact book export', () => {
  it('writes a versioned JSON document that keeps app-only fields', () => {
    const json = contactBookToJson(
      [entry({ fullName: 'Asha Rao', fingerprint: 'aaa', metCount: 2, metActivityId: 'act-1' })],
      '2026-09-20T18:00:00.000Z',
      'indiafoss-2025',
    );
    const doc = JSON.parse(json);
    expect(doc.kind).toBe('indiafoss-contact-book');
    expect(doc.version).toBe(1);
    expect(doc.eventId).toBe('indiafoss-2025');
    expect(doc.contacts[0]!.fingerprint).toBe('aaa');
    expect(doc.contacts[0]!.metActivityId).toBe('act-1');
  });

  it('concatenates stored vCards into one .vcf and skips empty ones', () => {
    const vcf = contactBookToVCards([
      entry({ fullName: 'Asha Rao' }),
      entry({ fullName: 'Nobody', vcard: '' }),
      entry({ fullName: 'Bo Li' }),
    ]);
    expect(splitVCards(vcf)).toHaveLength(2);
    expect(vcf).toContain('FN:Asha Rao');
    expect(vcf).toContain('FN:Bo Li');
  });
});

describe('contact book import', () => {
  const ids = () => {
    let n = 0;
    return () => `new-${++n}`;
  };

  it('round-trips its own JSON export', () => {
    const original = [
      entry({ fullName: 'Asha Rao', organization: 'FOSS United', fingerprint: 'aaa', metCount: 3 }),
    ];
    const parsed = parseContactBook(
      contactBookToJson(original, '2026-09-20T18:00:00.000Z'),
      '2026-09-21T00:00:00.000Z',
      ids(),
    );
    expect(parsed?.format).toBe('json');
    expect(parsed?.skipped).toBe(0);
    expect(parsed).not.toBeNull();
    expect(parsed!.entries[0]!).toMatchObject({
      fullName: 'Asha Rao',
      organization: 'FOSS United',
      fingerprint: 'aaa',
      metCount: 3,
      savedAt: '2026-09-19T10:00:00.000Z',
    });
  });

  it('never trusts a verified flag from a file', () => {
    const doc = JSON.stringify({
      kind: 'indiafoss-contact-book',
      version: 1,
      exportedAt: '2026-09-20T18:00:00.000Z',
      contacts: [{ id: 'x', fullName: 'Mallory', socials: {}, verified: true, vcard: '' }],
    });
    const parsed = parseContactBook(doc, '2026-09-21T00:00:00.000Z', ids());
    expect(parsed!.entries[0]!.verified).toBe(false);
  });

  it('reads a multi-entry .vcf from another address book', () => {
    const vcf = contactBookToVCards([
      entry({ fullName: 'Asha Rao' }),
      entry({ fullName: 'Bo Li' }),
    ]);
    const parsed = parseContactBook(vcf, '2026-09-21T00:00:00.000Z', ids());
    expect(parsed?.format).toBe('vcard');
    expect(parsed!.entries.map((e) => e.fullName)).toEqual(['Asha Rao', 'Bo Li']);
    expect(parsed!.entries[0]!.id).toBe('new-1');
    expect(parsed!.entries[0]!.savedAt).toBe('2026-09-21T00:00:00.000Z');
  });

  it('counts unreadable entries instead of failing the whole import', () => {
    const vcf = `${contactBookToVCards([entry({ fullName: 'Asha Rao' })])}BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n`;
    const parsed = parseContactBook(vcf, '2026-09-21T00:00:00.000Z', ids());
    expect(parsed?.entries).toHaveLength(1);
    expect(parsed?.skipped).toBe(1);
  });

  it('rejects junk and foreign JSON', () => {
    expect(parseContactBook('hello', '2026-09-21T00:00:00.000Z', ids())).toBeNull();
    expect(parseContactBook('{"kind":"other"}', '2026-09-21T00:00:00.000Z', ids())).toBeNull();
    expect(parseContactBook('   ', '2026-09-21T00:00:00.000Z', ids())).toBeNull();
  });
});

describe('who I met', () => {
  it('groups by the day of the meeting in the event timezone, newest first', () => {
    const groups = groupByDayMet(
      [
        // 19 Sep 23:00 UTC is already 20 Sep in Kolkata.
        entry({ fullName: 'Late', savedAt: '2026-09-19T23:00:00.000Z' }),
        entry({ fullName: 'Morning', savedAt: '2026-09-19T04:30:00.000Z' }),
        entry({ fullName: 'Afternoon', savedAt: '2026-09-19T09:00:00.000Z' }),
      ],
      'Asia/Kolkata',
    );
    expect(groups.map((g) => g.day)).toEqual(['2026-09-20', '2026-09-19']);
    expect(groups[1]!.contacts.map((c) => c.fullName)).toEqual(['Afternoon', 'Morning']);
  });

  it('puts undated contacts last', () => {
    const groups = groupByDayMet(
      [entry({ fullName: 'No date', savedAt: '' }), entry({ fullName: 'Dated' })],
      'Asia/Kolkata',
    );
    expect(groups[groups.length - 1]!.day).toBe('unknown');
  });
});

describe('contact search', () => {
  const list = [
    entry({ fullName: 'Asha Rao', organization: 'FOSS United', socials: { github: 'asha' } }),
    entry({ fullName: 'Bo Li', matrixId: '@bo:example.org' }),
  ];

  it('returns everything for an empty query', () => {
    expect(searchContacts(list, '  ')).toHaveLength(2);
  });

  it('matches across name, organization, identifiers and socials', () => {
    expect(searchContacts(list, 'foss').map((c) => c.fullName)).toEqual(['Asha Rao']);
    expect(searchContacts(list, 'example.org').map((c) => c.fullName)).toEqual(['Bo Li']);
    expect(searchContacts(list, 'asha github').map((c) => c.fullName)).toEqual(['Asha Rao']);
    expect(searchContacts(list, 'asha bo')).toHaveLength(0);
  });
});
