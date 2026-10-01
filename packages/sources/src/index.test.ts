import { describe, expect, it } from 'vitest';
import { mergeBooths } from './index.js';

describe('sources/index', () => {
  describe('mergeBooths', () => {
    it('adds new booths to the bundle without duplicates', () => {
      const bundle = { booths: [{ id: 'a', name: 'Booth A' }] };
      const newBooths = [{ id: 'b', name: 'Booth B' }];

      mergeBooths(bundle, newBooths);

      expect(bundle.booths).toHaveLength(2);
      expect(bundle.booths).toContainEqual({ id: 'a', name: 'Booth A' });
      expect(bundle.booths).toContainEqual({ id: 'b', name: 'Booth B' });
    });

    it('skips booths that already exist in the bundle', () => {
      const bundle = { booths: [{ id: 'a', name: 'Existing' }] };
      const newBooths = [
        { id: 'a', name: 'Ignored' },
        { id: 'b', name: 'New' },
      ];

      mergeBooths(bundle, newBooths);

      expect(bundle.booths).toHaveLength(2);
      expect(bundle.booths[0]).toEqual({
        id: 'a',
        name: 'Existing',
      }); // kept original
      expect(bundle.booths[1]).toEqual({ id: 'b', name: 'New' });
    })

    it('handles empty initial booths', () => {
      const bundle = { booths: [] };
      const newBooths = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];

      mergeBooths(bundle, newBooths);

      expect(bundle.booths).toHaveLength(2);
    });

    it('handles empty new booths', () => {
      const bundle = { booths: [{ id: 'a', name: 'A' }] };
      const newBooths: Array<{ id: string; name: string }> = [];

      mergeBooths(bundle, newBooths);

      expect(bundle.booths).toHaveLength(1);
    })

    it('handles multiple duplicates correctly', () => {
      const bundle = {
        booths: [
          { id: '1', vendor: 'A' },
          { id: '2', vendor: 'B' },
          { id: '3', vendor: 'C' },
        ],
      };
      const newBooths = [
        { id: '2', vendor: 'B-updated' },
        { id: '4', vendor: 'D' },
        { id: '1', vendor: 'A-updated' },
        { id: '5', vendor: 'E' },
      ];

      mergeBooths(bundle, newBooths);

      expect(bundle.booths).toHaveLength(5);
      // Original entries preserved (no updates)
      expect(bundle.booths.find((b) => b.id === '1')).toEqual({
        id: '1',
        vendor: 'A',
      });
      expect(bundle.booths.find((b) => b.id === '2')).toEqual({
        id: '2',
        vendor: 'B',
      });
      // New entries added
      expect(bundle.booths.find((b) => b.id === '4')).toEqual({
        id: '4',
        vendor: 'D',
      });
      expect(bundle.booths.find((b) => b.id === '5')).toEqual({
        id: '5',
        vendor: 'E',
      });
    });

    it('mutates the bundle in place', () => {
      const bundle = { booths: [{ id: 'a' }] };
      const originalRef = bundle.booths;
      const newBooths = [{ id: 'b' }];

      mergeBooths(bundle, newBooths);

      // Same reference, not replaced
      expect(bundle.booths).toBe(originalRef);
    })
  })
})
