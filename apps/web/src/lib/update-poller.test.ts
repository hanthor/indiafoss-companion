import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_POLL_MS, QUIET_POLL_MS, UpdatePoller, updatePollInterval } from './update-poller';

const event = { start: '2026-09-26T09:00:00+05:30', end: '2026-09-27T17:00:00+05:30' };
afterEach(() => vi.useRealTimers());

describe('schedule polling', () => {
  it('uses event offsets and includes the arrival/departure margins', () => {
    expect(updatePollInterval(event, Date.parse('2026-09-26T01:30:00Z'))).toBe(EVENT_POLL_MS);
    expect(updatePollInterval(event, Date.parse('2026-09-27T13:30:00Z'))).toBe(EVENT_POLL_MS);
    expect(updatePollInterval(event, Date.parse('2026-09-27T13:30:01Z'))).toBe(QUIET_POLL_MS);
    expect(updatePollInterval(event, Date.parse('2026-09-08T12:00:00Z'))).toBe(QUIET_POLL_MS);
    expect(updatePollInterval(null)).toBe(EVENT_POLL_MS);
  });

  it('rechecks without navigation and retries a failure', async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const poller = new UpdatePoller(check, () => EVENT_POLL_MS);
    poller.start();
    await vi.advanceTimersByTimeAsync(EVENT_POLL_MS * 2);
    expect(check).toHaveBeenCalledTimes(3);
    expect(check.mock.calls.map(([periodic]) => periodic)).toEqual([false, true, true]);
    poller.stop();
    await vi.advanceTimersByTimeAsync(EVENT_POLL_MS * 2);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('does not re-arm an in-flight check after stop', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const check = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const poller = new UpdatePoller(check, () => EVENT_POLL_MS);
    poller.start();
    await vi.advanceTimersByTimeAsync(EVENT_POLL_MS * 3);
    expect(check).toHaveBeenCalledTimes(1);
    poller.stop();
    finish();
    await vi.advanceTimersByTimeAsync(EVENT_POLL_MS * 2);
    expect(check).toHaveBeenCalledTimes(1);
  });
});
