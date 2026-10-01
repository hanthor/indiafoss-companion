import { describe, expect, it } from 'vitest';
import {
  collectDuplicates,
  collectSchemaVersionIssues,
  isHex64,
  isMatrixRoomAlias,
  isMatrixRoomId,
  isMatrixUserId,
  isRecord,
  optionalInstant,
  optionalString,
  requireArray,
  requireInstant,
  requireLiteral,
  requireString,
  schemaCompatibility,
} from './common.js';

describe('contracts/common', () => {
  describe('schemaCompatibility', () => {
    it('returns "supported" for the exact matching version', () => {
      expect(schemaCompatibility(1, 1)).toBe('supported');
      expect(schemaCompatibility(5, 5)).toBe('supported');
    });

    it('returns "forward" for a newer version', () => {
      expect(schemaCompatibility(2, 1)).toBe('forward');
      expect(schemaCompatibility(10, 5)).toBe('forward');
    });

    it('returns "unsupported" for an older version', () => {
      expect(schemaCompatibility(1, 2)).toBe('unsupported');
      expect(schemaCompatibility(1, 5)).toBe('unsupported');
    });

    it('returns "unsupported" for non-integer values', () => {
      expect(schemaCompatibility(1.5, 1)).toBe('unsupported');
      expect(schemaCompatibility('1', 1)).toBe('unsupported');
      expect(schemaCompatibility(null, 1)).toBe('unsupported');
      expect(schemaCompatibility(undefined, 1)).toBe('unsupported');
    });

    it('returns "unsupported" for values less than 1', () => {
      expect(schemaCompatibility(0, 1)).toBe('unsupported');
      expect(schemaCompatibility(-1, 1)).toBe('unsupported');
    });
  });

  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
      expect(isRecord({ a: 1, b: 'two', c: null })).toBe(true);
    });

    it('returns false for null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2, 3])).toBe(false);
      expect(isRecord([{}])).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isRecord('string')).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord(true)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
    });

    it('returns true for class instances (they are objects)', () => {
      class MyClass {}
      expect(isRecord(new MyClass())).toBe(true);
    });
  });

  describe('requireString', () => {
    it('returns an empty array for a non-empty string', () => {
      expect(requireString({ field: 'value' }, 'field')).toEqual([]);
      expect(requireString({ field: 'a' }, 'field')).toEqual([]);
      expect(requireString({ field: '  text  ' }, 'field')).toEqual([]);
    });

    it('returns an error for a missing field', () => {
      expect(requireString({}, 'field')).toContain('field must be a string');
    });

    it('returns an error for a non-string field', () => {
      expect(requireString({ field: 123 }, 'field')).toContain('field must be a string');
      expect(requireString({ field: null }, 'field')).toContain('field must be a string');
      expect(requireString({ field: [] }, 'field')).toContain('field must be a string');
    });

    it('returns an error for an empty or whitespace-only string', () => {
      expect(requireString({ field: '' }, 'field')).toContain('field must be a non-empty string');
      expect(requireString({ field: '   ' }, 'field')).toContain('field must be a non-empty string');
      expect(requireString({ field: '\t\n' }, 'field')).toContain('field must be a non-empty string');
    });

    it('includes the path prefix in error messages', () => {
      const errors = requireString({ field: 123 }, 'field', 'prefix.');
      expect(errors[0]).toBe('prefix.field must be a string');
    });
  });

  describe('optionalString', () => {
    it('returns an empty array for undefined', () => {
      expect(optionalString({ field: undefined }, 'field')).toEqual([]);
      expect(optionalString({}, 'field')).toEqual([]);
    });

    it('applies requireString validation when the field is present', () => {
      expect(optionalString({ field: 'value' }, 'field')).toEqual([]);
      expect(optionalString({ field: '' }, 'field')).toEqual(['field must be a non-empty string']);
      expect(optionalString({ field: 123 }, 'field')).toEqual(['field must be a string']);
    });

    it('includes the path prefix', () => {
      const errors = optionalString({ field: 123 }, 'field', 'root.');
      expect(errors[0]).toBe('root.field must be a string');
    });
  });

  describe('requireInstant', () => {
    it('returns an empty array for a valid ISO-8601 timestamp', () => {
      expect(requireInstant({ ts: '2025-09-20T10:30:00Z' }, 'ts')).toEqual([]);
      expect(requireInstant({ ts: '2025-09-20T10:30:00+05:30' }, 'ts')).toEqual([]);
      expect(requireInstant({ ts: '2025-09-20' }, 'ts')).toEqual([]);
    });

    it('returns an error for an invalid ISO-8601 timestamp', () => {
      const errors = requireInstant({ ts: 'not a date' }, 'ts');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must be an ISO-8601 timestamp');
    });

    it('delegates to requireString for type checking', () => {
      expect(requireInstant({ ts: 123 }, 'ts')).toContain('ts must be a string');
      expect(requireInstant({}, 'ts')).toContain('ts must be a string');
    });
  });

  describe('optionalInstant', () => {
    it('returns an empty array for undefined', () => {
      expect(optionalInstant({ ts: undefined }, 'ts')).toEqual([]);
      expect(optionalInstant({}, 'ts')).toEqual([]);
    });

    it('applies requireInstant validation when present', () => {
      expect(optionalInstant({ ts: '2025-09-20T10:30:00Z' }, 'ts')).toEqual([]);
      expect(optionalInstant({ ts: 'invalid' }, 'ts')).toHaveLength(1);
    });
  });

  describe('requireLiteral', () => {
    it('returns an empty array for a value in the allowed set', () => {
      expect(requireLiteral({ status: 'active' }, 'status', ['active', 'inactive'])).toEqual([]);
      expect(requireLiteral({ color: 'red' }, 'color', ['red', 'green', 'blue'])).toEqual([]);
    });

    it('returns an error for a value not in the allowed set', () => {
      const errors = requireLiteral({ status: 'unknown' }, 'status', ['active', 'inactive']);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must be one of');
    });

    it('returns an error for a non-string value', () => {
      const errors = requireLiteral({ status: 123 }, 'status', ['active', 'inactive']);
      expect(errors).toContain('status must be a string');
    });

    it('returns an error for a missing field', () => {
      const errors = requireLiteral({}, 'status', ['active', 'inactive']);
      expect(errors).toContain('status must be a string');
    });

    it('includes the path prefix', () => {
      const errors = requireLiteral(
        { status: 'unknown' },
        'status',
        ['active', 'inactive'],
        'obj.',
      );
      expect(errors[0]).toContain('obj.status');
    });
  });

  describe('requireArray', () => {
    it('returns an empty array for an array', () => {
      expect(requireArray({ items: [] }, 'items')).toEqual([]);
      expect(requireArray({ items: [1, 2, 3] }, 'items')).toEqual([]);
    });

    it('returns an error for a non-array value', () => {
      expect(requireArray({ items: 'not an array' }, 'items')).toContain(
        'items must be an array',
      );
      expect(requireArray({ items: {} }, 'items')).toContain('items must be an array');
    });

    it('returns an error for a missing field', () => {
      expect(requireArray({}, 'items')).toContain('items must be an array');
    });

    it('enforces non-empty when specified', () => {
      expect(requireArray({ items: [] }, 'items', { nonEmpty: true })).toContain(
        'items must not be empty',
      );
      expect(requireArray({ items: [1] }, 'items', { nonEmpty: true })).toEqual([]);
    });

    it('allows empty arrays by default', () => {
      expect(requireArray({ items: [] }, 'items', {})).toEqual([]);
      expect(requireArray({ items: [] }, 'items')).toEqual([]);
    });
  });

  describe('collectDuplicates', () => {
    it('returns an empty array when there are no duplicates', () => {
      expect(collectDuplicates(['a', 'b', 'c'], 'id')).toEqual([]);
      expect(collectDuplicates([], 'id')).toEqual([]);
      expect(collectDuplicates(['single'], 'id')).toEqual([]);
    });

    it('detects duplicate ids', () => {
      const errors = collectDuplicates(['a', 'b', 'a'], 'room');
      expect(errors).toContain('duplicate room id: a');
    });

    it('detects multiple duplicates', () => {
      const errors = collectDuplicates(['a', 'b', 'a', 'b', 'c'], 'session');
      expect(errors).toContain('duplicate session id: a');
      expect(errors).toContain('duplicate session id: b');
    });

    it('reports each duplicate occurrence (not just first)', () => {
      const errors = collectDuplicates(['a', 'a', 'a'], 'id');
      expect(errors).toEqual(['duplicate id id: a', 'duplicate id id: a']);
    });

    it('uses the label in error messages', () => {
      const errors = collectDuplicates(['x', 'x'], 'custom-label');
      expect(errors[0]).toContain('duplicate custom-label id');
    });
  });

  describe('collectSchemaVersionIssues', () => {
    it('returns an empty array when schemaVersion matches', () => {
      expect(collectSchemaVersionIssues({ schemaVersion: 1 }, 1, 'TestContract')).toEqual([]);
    });

    it('returns an error for a forward version', () => {
      const errors = collectSchemaVersionIssues({ schemaVersion: 2 }, 1, 'TestContract');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('is newer than the supported version');
      expect(errors[0]).toContain('keep the previous value');
    });

    it('returns an error for an unsupported version', () => {
      const errors = collectSchemaVersionIssues({ schemaVersion: 0 }, 1, 'TestContract');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must be the integer 1');
    });

    it('includes the contract name in error messages', () => {
      const errors = collectSchemaVersionIssues({ schemaVersion: 2 }, 1, 'EventManifest');
      expect(errors[0]).toContain('EventManifest');
    });
  });

  describe('isHex64', () => {
    it('returns true for valid 64-character hex strings', () => {
      const hex64 = 'a'.repeat(64);
      expect(isHex64(hex64)).toBe(true);
      expect(isHex64('0123456789abcdef'.repeat(4))).toBe(true);
    });

    it('returns false for strings that are not 64 hex characters', () => {
      expect(isHex64('a'.repeat(63))).toBe(false); // too short
      expect(isHex64('a'.repeat(65))).toBe(false); // too long
      expect(isHex64('g'.repeat(64))).toBe(false); // invalid hex char
    });

    it('returns false for non-string values', () => {
      expect(isHex64(123)).toBe(false);
      expect(isHex64(null)).toBe(false);
      expect(isHex64(undefined)).toBe(false);
    });
  });

  describe('isMatrixUserId', () => {
    it('returns true for classic matrix user ids (@localpart:server)', () => {
      expect(isMatrixUserId('@alice:example.com')).toBe(true);
      expect(isMatrixUserId('@bob:matrix.org')).toBe(true);
      expect(isMatrixUserId('@a:b')).toBe(true); // minimal valid
    });

    it('returns true for mesh matrix user ids (@n:<64-hex>:...)', () => {
      const hex64 = 'a'.repeat(64);
      expect(isMatrixUserId(`@${hex64}:server`)).toBe(true);
    });

    it('returns false for ids missing the @ prefix', () => {
      expect(isMatrixUserId('alice:example.com')).toBe(false);
    });

    it('returns false for ids missing the colon separator', () => {
      expect(isMatrixUserId('@alice')).toBe(false);
      expect(isMatrixUserId('@:server')).toBe(false);
    });

    it('returns false for ids missing the server part', () => {
      expect(isMatrixUserId('@alice:')).toBe(false);
    });

    it('accepts ids with multiple colons (first colon is the separator)', () => {
      expect(isMatrixUserId('@a:b:c:d')).toBe(true); // multiple colons accepted
    });

    it('returns false for non-string values', () => {
      expect(isMatrixUserId(123)).toBe(false);
      expect(isMatrixUserId(null)).toBe(false);
    });
  });

  describe('isMatrixRoomAlias', () => {
    it('returns true for valid room aliases (#localpart:server)', () => {
      expect(isMatrixRoomAlias('#lobby:example.com')).toBe(true);
      expect(isMatrixRoomAlias('#a:b')).toBe(true); // minimal valid
    });

    it('returns false for ids missing the # prefix', () => {
      expect(isMatrixRoomAlias('lobby:example.com')).toBe(false);
    });

    it('returns false for ids missing or invalid colon structure', () => {
      expect(isMatrixRoomAlias('#lobby')).toBe(false);
      expect(isMatrixRoomAlias('#:server')).toBe(false);
      expect(isMatrixRoomAlias('#lobby:')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isMatrixRoomAlias(123)).toBe(false);
      expect(isMatrixRoomAlias(null)).toBe(false);
    });
  });

  describe('isMatrixRoomId', () => {
    it('returns true for valid room ids (!opaque:server)', () => {
      expect(isMatrixRoomId('!abc123:example.com')).toBe(true);
      expect(isMatrixRoomId('!a:b')).toBe(true); // minimal valid
    });

    it('returns false for ids missing the ! prefix', () => {
      expect(isMatrixRoomId('abc123:example.com')).toBe(false);
    });

    it('returns false for ids missing or invalid colon structure', () => {
      expect(isMatrixRoomId('!abc123')).toBe(false);
      expect(isMatrixRoomId('!:server')).toBe(false);
      expect(isMatrixRoomId('!abc123:')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isMatrixRoomId(123)).toBe(false);
      expect(isMatrixRoomId(null)).toBe(false);
    });
  });
});
