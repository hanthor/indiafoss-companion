import { describe, expect, it } from 'vitest';
import { eloVersion } from './index.js';

describe('elo', () => {
  it('exports a version', () => {
    expect(eloVersion).toBe('0.1.0');
  });
});
