import { describe, expect, it } from 'vitest';
import { boothAvailableOn } from './booth-availability';
import type { Booth } from '@indiafoss/model';

const booth: Booth = { id: 'test', name: 'Test', category: 'project', tags: [] };
describe('booth visit availability', () => {
  it('keeps a single-day booth out of the other day’s plan', () => {
    const dayOne = { ...booth, availableDates: ['2026-09-26'] };
    expect(boothAvailableOn(dayOne, '2026-09-26')).toBe(true);
    expect(boothAvailableOn(dayOne, '2026-09-27')).toBe(false);
  });
  it('does not automatically schedule an unassigned booth', () => {
    expect(boothAvailableOn({ ...booth, availableDates: [] }, '2026-09-26')).toBe(false);
  });
  it('preserves availability for older directories without day data', () => {
    expect(boothAvailableOn(booth, '2025-09-20')).toBe(true);
  });
});
