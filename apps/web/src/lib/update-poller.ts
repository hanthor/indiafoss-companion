/** Poll on wall-clock time, independent of the attendee's day simulator. */
export const EVENT_POLL_MS = 60_000;
export const QUIET_POLL_MS = 15 * 60_000;
const EVENT_MARGIN_MS = 2 * 60 * 60_000;

export function updatePollInterval(
  event: { start: string; end: string } | null,
  now = Date.now(),
): number {
  if (!event) return EVENT_POLL_MS;
  const start = Date.parse(event.start) - EVENT_MARGIN_MS;
  const end = Date.parse(event.end) + EVENT_MARGIN_MS;
  return now >= start && now <= end ? EVENT_POLL_MS : QUIET_POLL_MS;
}

/** One check at a time; stopping also prevents an in-flight check scheduling another timer. */
export class UpdatePoller {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor(
    private readonly check: (periodic: boolean) => Promise<void>,
    private readonly interval: () => number,
  ) {}

  start(): void {
    this.stop();
    const generation = this.generation;
    const tick = async (periodic: boolean) => {
      try {
        await this.check(periodic);
      } catch {
        // A failed check must not stop future retries. The updater owns error reporting.
      } finally {
        if (generation === this.generation) {
          this.timer = setTimeout(() => void tick(true), this.interval());
        }
      }
    };
    void tick(false);
  }

  stop(): void {
    this.generation += 1;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
