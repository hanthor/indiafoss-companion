import { describe, expect, it, vi } from 'vitest';
import { UpdateGate } from './update-gate';

/** A controllable clock, so the freshness window can be crossed deliberately. */
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('UpdateGate', () => {
  it('retries after a failed check — the #189 regression', async () => {
    // The whole point. An offline morning must not disable the rest of the day.
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);
    const check = vi.fn().mockResolvedValue(false);

    await gate.run(check);
    await gate.run(check);

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('retries after a check that throws', async () => {
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);
    const check = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(gate.run(check)).rejects.toThrow('offline');
    await expect(gate.run(check)).rejects.toThrow('offline');

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('skips a second check inside the freshness window', async () => {
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);
    const check = vi.fn().mockResolvedValue(true);

    await gate.run(check);
    time.advance(30_000);
    await gate.run(check);

    expect(check).toHaveBeenCalledTimes(1);
  });

  it('checks again once the freshness window has passed', async () => {
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);
    const check = vi.fn().mockResolvedValue(true);

    await gate.run(check);
    time.advance(60_001);
    await gate.run(check);

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('honours force inside the freshness window', async () => {
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);
    const check = vi.fn().mockResolvedValue(true);

    await gate.run(check);
    time.advance(1_000);
    await gate.run(check, { force: true });

    expect(check).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent triggers into one fetch', async () => {
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);
    let release: (value: boolean) => void = () => {};
    const check = vi.fn().mockReturnValue(
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
    );

    const first = gate.run(check);
    const second = gate.run(check);
    release(true);
    await Promise.all([first, second]);

    expect(check).toHaveBeenCalledTimes(1);
  });

  it('does not start the freshness window on an unsuccessful check', async () => {
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);

    await gate.run(vi.fn().mockResolvedValue(false));
    expect(gate.isFresh()).toBe(false);

    await gate.run(vi.fn().mockResolvedValue(true));
    expect(gate.isFresh()).toBe(true);
  });

  it('reset makes the gate willing to check again immediately', async () => {
    const time = clock();
    const gate = new UpdateGate(60_000, time.now);
    const check = vi.fn().mockResolvedValue(true);

    await gate.run(check);
    gate.reset();
    await gate.run(check);

    expect(check).toHaveBeenCalledTimes(2);
  });
});
