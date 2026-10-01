import { describe, expect, it } from 'vitest';
import { MAX_SCAN_PAYLOAD_BYTES, utf8ByteLength } from './payload-limits.js';

describe('payload-limits', () => {
  describe('MAX_SCAN_PAYLOAD_BYTES', () => {
    it('exports a positive integer constant', () => {
      expect(MAX_SCAN_PAYLOAD_BYTES).toBe(8192);
      expect(Number.isInteger(MAX_SCAN_PAYLOAD_BYTES)).toBe(true);
      expect(MAX_SCAN_PAYLOAD_BYTES).toBeGreaterThan(0);
    });
  });

  describe('utf8ByteLength', () => {
    it('returns 0 for an empty string', () => {
      expect(utf8ByteLength('')).toBe(0);
    });

    it('returns the byte length for ASCII characters (1 byte each)', () => {
      expect(utf8ByteLength('a')).toBe(1);
      expect(utf8ByteLength('abc')).toBe(3);
      expect(utf8ByteLength('Hello')).toBe(5);
      expect(utf8ByteLength('Hello, World!')).toBe(13);
    });

    it('returns the correct byte length for multi-byte UTF-8 characters', () => {
      // 2-byte characters (e.g., Cyrillic)
      expect(utf8ByteLength('Ы')).toBe(2); // CYRILLIC CAPITAL LETTER YERI

      // 3-byte characters (e.g., CJK)
      expect(utf8ByteLength('中')).toBe(3); // CJK UNIFIED IDEOGRAPH
      expect(utf8ByteLength('文')).toBe(3);

      // 4-byte characters (e.g., emoji)
      expect(utf8ByteLength('😀')).toBe(4); // GRINNING FACE
      expect(utf8ByteLength('🚀')).toBe(4); // ROCKET
    });

    it('returns the correct byte length for mixed ASCII and multi-byte characters', () => {
      expect(utf8ByteLength('Hello中')).toBe(5 + 3); // 5 ASCII + 3 for 中
      expect(utf8ByteLength('a😀b')).toBe(1 + 4 + 1); // ASCII + emoji + ASCII
    });

    it('calculates length correctly for strings that approach the MAX_SCAN_PAYLOAD_BYTES limit', () => {
      const maxBytes = MAX_SCAN_PAYLOAD_BYTES;
      const asciiString = 'a'.repeat(maxBytes);
      expect(utf8ByteLength(asciiString)).toBe(maxBytes);

      // String with emoji (4 bytes each) approaching the limit
      const emojiCount = Math.floor(maxBytes / 4);
      const emojiString = '😀'.repeat(emojiCount);
      expect(utf8ByteLength(emojiString)).toBe(emojiCount * 4);
    });

    it('handles strings with combining characters correctly', () => {
      // é can be represented as a single 2-byte character (U+00E9)
      // or as e (1 byte) + combining acute accent (2 bytes)
      const composed = 'é'; // composed form
      const decomposed = 'e\u0301'; // decomposed form

      // Both represent the same visual character but have different byte lengths
      expect(utf8ByteLength(composed)).toBe(2);
      expect(utf8ByteLength(decomposed)).toBe(3);
    });

    it('handles special characters and whitespace correctly', () => {
      expect(utf8ByteLength(' ')).toBe(1); // space
      expect(utf8ByteLength('\t')).toBe(1); // tab
      expect(utf8ByteLength('\n')).toBe(1); // newline
      expect(utf8ByteLength('  \n\t  ')).toBe(6);
    });
  });
});
