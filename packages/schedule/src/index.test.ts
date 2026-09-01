import { describe, expect, it } from 'vitest';
import { scheduleVersion } from './index.js';

describe('schedule', () => {
  it('exports a version', () => {
    expect(scheduleVersion).toBe('0.1.0');
  });
});
