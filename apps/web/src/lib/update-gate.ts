/**
 * Decides *whether* an update check runs. The check itself lives in
 * `updates.svelte.ts`; this is the part with the interesting behaviour, kept
 * in a plain module so it can be tested without the Svelte compiler.
 *
 * The defect this replaces (#189) conflated two different things into one
 * `let checked = false`, set before the fetch and never reset:
 *
 * - an initial offline failure disabled checking for the rest of the session;
 * - so did a successful check.
 *
 * They are separate concerns. A request being *in flight* should stop a second
 * one starting. A check having *succeeded* should stop a burst of triggers
 * becoming a burst of fetches, for a while. Neither should ever mean "never
 * check again", which is what an attendee experienced when the venue Wi-Fi was
 * not up yet at 9am.
 */

/** Four triggers in quick succession should be one fetch, not four. */
export const FRESHNESS_MS = 60_000;

/**
 * Serialises update checks and applies the freshness limit.
 *
 * `run` should resolve `true` when the check actually reached the manifest,
 * and `false` when it did not (offline, timeout, non-OK response). Only `true`
 * starts the freshness window — a failed check must leave the app willing to
 * retry on the very next trigger.
 */
export class UpdateGate {
  private inFlight: Promise<void> | null = null;
  private lastSuccessAt = 0;

  constructor(
    private readonly freshnessMs: number = FRESHNESS_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Run `check` unless one is already running or the last success is still
   * fresh. `force` skips the freshness limit; manual refresh uses it, and
   * automatic triggers do not.
   */
  async run(check: () => Promise<boolean>, options: { force?: boolean } = {}): Promise<void> {
    // A caller arriving mid-flight awaits the running check rather than
    // starting a competing one. Both resolve together.
    if (this.inFlight) return this.inFlight;
    if (!options.force && this.isFresh()) return;

    this.inFlight = (async () => {
      const reached = await check();
      if (reached) this.lastSuccessAt = this.now();
    })();

    try {
      await this.inFlight;
    } finally {
      // Cleared even when `check` throws, so one rejection cannot wedge the
      // gate shut for the rest of the session.
      this.inFlight = null;
    }
  }

  /** Whether a successful check is recent enough to skip another. */
  isFresh(): boolean {
    return this.lastSuccessAt > 0 && this.now() - this.lastSuccessAt < this.freshnessMs;
  }

  /** Forget all state. Used by tests and by a deliberate reset. */
  reset(): void {
    this.inFlight = null;
    this.lastSuccessAt = 0;
  }
}
