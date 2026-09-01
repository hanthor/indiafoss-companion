import { describe, expect, it } from 'vitest';
import { storageVersion } from './index.js';

describe('storage', () => {
  it('exports a version', () => {
    expect(storageVersion).toBe('0.1.0');
  });
});
