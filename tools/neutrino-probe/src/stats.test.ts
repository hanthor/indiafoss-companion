import { describe, expect, it } from 'vitest';
import { pct, sleep } from './stats.js';

describe('pct', () => {
  const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('is NaN for an empty sample, so a missing measurement is never reported as 0', () => {
    expect(pct([], 0.5)).toBeNaN();
    expect(pct([], 0)).toBeNaN();
    expect(pct([], 1)).toBeNaN();
  });

  it('returns the only value for a single-element sample, at any percentile', () => {
    expect(pct([42], 0)).toBe(42);
    expect(pct([42], 0.5)).toBe(42);
    expect(pct([42], 0.9)).toBe(42);
    expect(pct([42], 1)).toBe(42);
  });

  it('reads the p50 and p90 the swarm runners publish', () => {
    expect(pct(sample, 0.5)).toBe(6);
    expect(pct(sample, 0.9)).toBe(10);
  });

  it('clamps p = 1 to the last element instead of running off the end', () => {
    expect(pct(sample, 1)).toBe(10);
    expect(pct([1, 2, 3], 1)).toBe(3);
  });

  it('is the minimum at p = 0', () => {
    expect(pct(sample, 0)).toBe(1);
    expect(pct([7, 8, 9], 0)).toBe(7);
  });

  it('reads positionally, so unsorted input gives a wrong answer — callers sort', () => {
    // Documents the precondition rather than defending against it: the two
    // runners sort before calling, and sorting here would hide a caller bug.
    expect(pct([10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 0.5)).toBe(5);
  });
});

describe('sleep', () => {
  it('resolves after the requested delay', async () => {
    const started = Date.now();
    await sleep(15);
    expect(Date.now() - started).toBeGreaterThanOrEqual(10);
  });

  it('resolves for a zero delay', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});
