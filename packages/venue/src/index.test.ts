import { describe, expect, it } from 'vitest';
import { venueVersion } from './index.js';

describe('venue', () => {
  it('exports a version', () => {
    expect(venueVersion).toBe('0.1.0');
  });
});
