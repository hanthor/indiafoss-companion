import { describe, expect, it } from 'vitest';
import { test_fixturesVersion } from './index.js';

describe('test-fixtures', () => {
  it('exports a version', () => {
    expect(test_fixturesVersion).toBe('0.1.0');
  });
});
