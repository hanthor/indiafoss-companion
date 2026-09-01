import { describe, expect, it } from 'vitest';
import { searchVersion } from './index.js';

describe('search', () => {
  it('exports a version', () => {
    expect(searchVersion).toBe('0.1.0');
  });
});
