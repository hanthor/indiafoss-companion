import { describe, expect, it } from 'vitest';
import fixture from '../../test-fixtures/fixtures/personal-data/valid/pwa-export.json';
import { validatePersonalData } from './personal-data-validation.js';

type RecordValue = Record<string, unknown>;
function file(): typeof fixture {
  return structuredClone(fixture);
}
function check(value: unknown) {
  return validatePersonalData(JSON.stringify(value));
}
function sections(value: typeof fixture): RecordValue {
  return value.events[0]!.sections;
}
function record(value: typeof fixture, section: string): RecordValue {
  return (sections(value)[section] as RecordValue[])[0]!;
}

describe('personal data section validation', () => {
  it('accepts the shared export fixture without changing its fields or explicit negative choices', () => {
    const input = file();
    expect(check(input)).toEqual({ file: input, unsupported: [] });
  });
  it('preserves unknown optional transport data and reports it as unsupported', () => {
    const input = {
      ...file(),
      future: { opaque: ['value'] },
      contact: { ...fixture.contact, future: false },
    };
    sections(input).future = { nested: { enabled: false } };
    expect(check(input)).toEqual({
      file: input,
      unsupported: ['events[0].sections.future', 'contact.future', 'future'],
    });
  });
  it.each([
    ['preferences', 'disposition', 'favourite'],
    ['preferences', 'bookmarked', 'false'],
    ['preferences', 'rating', null],
    ['preferences', 'comparisons', -1],
    ['preferences', 'comparisons', 0.5],
    ['preferences', 'comparisons', Number.MAX_SAFE_INTEGER + 1],
    ['preferences', 'triage', 'maybe'],
    ['notes', 'body', false],
    ['notes', 'updatedAt', '2026-02-30T01:00:00Z'],
    ['notes', 'updatedAt', '2026-09-09T01:00:00'],
    ['comparisons', 'scoreA', 0.25],
    ['comparisons', 'createdAt', 'yesterday'],
  ])('rejects invalid %s.%s before an adapter can apply it', (section, field, value) => {
    const input = file();
    record(input, section)[field] = value;
    expect(() => check(input)).toThrow(`.${field}`);
  });
  it.each(['preferences', 'notes', 'comparisons', 'plans', 'resolvedPlans'])(
    'rejects duplicate %s records',
    (section) => {
      const input = file();
      const rows = sections(input)[section] as unknown[];
      rows.push(structuredClone(rows[0]));
      expect(() => check(input)).toThrow(section);
    },
  );
  it('validates every comparison side and rejects a self-comparison', () => {
    const input = file();
    record(input, 'comparisons').activityB = 'undeclared';
    expect(() => check(input)).toThrow('undeclared activity');
    record(input, 'comparisons').activityB = record(input, 'comparisons').activityA;
    expect(() => check(input)).toThrow('comparisons[0]');
  });
  it('rejects undeclared activities even when their event cannot be resolved locally', () => {
    const input = file();
    input.events[0]!.eventId = 'missing-programme';
    for (const reference of input.events[0]!.activities) reference.eventId = 'missing-programme';
    record(input, 'notes').activityId = 'not-in-reference-table';
    expect(() => check(input)).toThrow('undeclared activity');
  });
  it.each(['locked', 'removed', 'replacements'])(
    'validates %s references while accepting declared custom blocks',
    (field) => {
      const input = file();
      record(input, 'plans')[field] =
        field === 'replacements' ? { 'talk-a': 'undeclared' } : ['undeclared'];
      expect(() => check(input)).toThrow('undeclared activity');
    },
  );
  it('validates replacement source references as well as destinations', () => {
    const input = file();
    record(input, 'plans').replacements = { undeclared: 'talk-a' };
    expect(() => check(input)).toThrow('undeclared activity');
  });
  it.each(['2026-02-30', 'not-a-date', '2026-9-9'])('rejects invalid plan day %s', (value) => {
    const input = file();
    record(input, 'plans').day = value;
    expect(() => check(input)).toThrow('.day');
  });
  it('rejects custom block collisions, zero/negative durations and repeated identifiers', () => {
    for (const kind of ['collision', 'equal', 'before', 'duplicate']) {
      const input = file();
      const blocks = record(input, 'plans').customBlocks as RecordValue[];
      if (kind === 'collision') blocks[0]!.id = 'talk-a';
      if (kind === 'equal') blocks[0]!.end = blocks[0]!.start;
      if (kind === 'before') blocks[0]!.end = '2026-09-18T12:00:00+05:30';
      if (kind === 'duplicate') blocks.push(structuredClone(blocks[0]!));
      expect(() => check(input)).toThrow('customBlocks');
    }
  });
  it('validates whole-devroom preferences and skipped talk identities', () => {
    const input = file();
    sections(input).rooms = { prefs: { devroom: 'ok' }, skipped: {} };
    expect(() => check(input)).toThrow('.prefs');
    sections(input).rooms = { prefs: { devroom: 'stay' }, skipped: { devroom: ['missing'] } };
    expect(() => check(input)).toThrow('undeclared activity');
  });
  it.each([0, -5, 1.5, 1441, '30'])('rejects invalid booth duration %s', (minutes) => {
    const input = file();
    sections(input).boothVisits = { booth: minutes };
    expect(() => check(input)).toThrow('boothVisits');
  });
  it('accepts booth duration and preserves notes for explicitly unassigned records', () => {
    const input = {
      ...file(),
      unassigned: { notes: [{ activityId: 'removed', body: '', updatedAt: fixture.exportedAt }] },
    };
    sections(input).boothVisits = { booth: 30 };
    expect(check(input).file).toEqual(input);
    input.unassigned.notes[0]!.updatedAt = 'bad';
    expect(() => check(input)).toThrow('unassigned.notes[0].updatedAt');
  });
  it('rejects invalid contact and sharing field types without enabling defaults', () => {
    const input = file();
    (input.contact.selection as RecordValue).email = 'false';
    expect(() => check(input)).toThrow('contact.selection.email');
    (input.contact.selection as RecordValue).email = false;
    (input.contact.profile.socials as RecordValue).github = true;
    expect(() => check(input)).toThrow('contact.profile.socials.github');
  });
  it('rejects malformed envelopes and newer major versions before section validation', () => {
    expect(() => validatePersonalData('{')).toThrow();
    expect(() => check({ ...file(), schemaVersion: 2 })).toThrow();
  });
});

it('preserves explicit booth cancellations and validates unassigned visit records', () => {
  const input = {
    ...file(),
    unassigned: { boothVisits: [{ boothId: 'removed', minutes: null as number | null }] },
  };
  sections(input).boothVisits = { booth: null };
  expect(check(input)).toEqual({ file: input, unsupported: [] });
  input.unassigned.boothVisits[0]!.minutes = -1;
  expect(() => check(input)).toThrow('unassigned.boothVisits[0].minutes');
});
