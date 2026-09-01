import { describe, expect, it } from 'vitest';
import { sourcesVersion } from './index.js';

describe('sources', () => {
  it('exports a version', () => {
    expect(sourcesVersion).toBe('0.1.0');
  });
});
