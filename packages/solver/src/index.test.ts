import { describe, expect, it } from 'vitest';
import { solverVersion } from './index.js';

describe('solver', () => {
  it('exports a version', () => {
    expect(solverVersion).toBe('0.1.0');
  });
});
