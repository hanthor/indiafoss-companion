import { describe, expect, it } from 'vitest';
import { isDiscoveryActivity } from './discovery.js';

describe('discovery eligibility', () => {
  it.each(['Devroom Intro: Open Hardware', ' Devroom Introduction : Security '])(
    'excludes programme introduction %s',
    (title) => {
      expect(isDiscoveryActivity({ title, type: 'talk' })).toBe(false);
    },
  );
  it.each([
    'Introduction to Rust',
    'A five minute demo',
    'Writing a devroom introduction',
    'FOSS Awards',
  ])('keeps ordinary programme item %s', (title) => {
    expect(isDiscoveryActivity({ title, type: 'talk' })).toBe(true);
  });
  it('still excludes meals and cancelled activities', () => {
    expect(isDiscoveryActivity({ title: 'Lunch', type: 'meal' })).toBe(false);
    expect(isDiscoveryActivity({ title: 'Talk', type: 'talk', cancelled: true })).toBe(false);
  });
});
