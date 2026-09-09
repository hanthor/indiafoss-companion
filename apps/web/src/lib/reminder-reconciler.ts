import type { AppNotification, NotificationTransport } from './notifications';

export type ReminderBatch = { transport: NotificationTransport; notifications: AppNotification[] };

/** Serialises transport writes; a superseded calculation can never re-arm an old batch. */
export class ReminderReconciler {
  private generation = 0;
  private writes: Promise<void> = Promise.resolve();
  private armed = new Map<string, NotificationTransport>();

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writes.then(operation);
    this.writes = next.catch(() => {});
    return next;
  }

  private async cancelAll(): Promise<void> {
    for (const [id, transport] of this.armed) {
      await transport.cancel(id);
      this.armed.delete(id);
    }
  }

  clear(): Promise<void> {
    ++this.generation;
    return this.enqueue(() => this.cancelAll());
  }

  /** Only for the passage of time with unchanged plan/clock inputs.
   * Keep due timers and in-flight browser deliveries; remember IDs already
   * scheduled so moving the lookahead window cannot deliver them twice.
   * Plan, permission, location and clock changes must use replace/clear.
   */
  async refresh(load: () => Promise<ReminderBatch | null>): Promise<void> {
    const generation = this.generation;
    const batch = await load();
    if (generation !== this.generation || !batch) return;
    await this.scheduleBatch(batch, generation, true);
  }

  async replace(load: () => Promise<ReminderBatch | null>): Promise<void> {
    const generation = ++this.generation;
    // Drop the old timers immediately, including while a new plan is loading.
    const clearing = this.enqueue(() => this.cancelAll());
    const loading = load();
    let batch: ReminderBatch | null;
    try {
      [, batch] = await Promise.all([clearing, loading]);
    } catch (error) {
      if (generation === this.generation) await this.clear();
      throw error;
    }
    if (generation !== this.generation || !batch) return;
    await this.scheduleBatch(batch, generation, false);
  }

  private async scheduleBatch(
    wanted: ReminderBatch,
    generation: number,
    preserve: boolean,
  ): Promise<void> {
    await this.enqueue(async () => {
      for (const notification of wanted.notifications) {
        if (generation !== this.generation) return;
        if (preserve && this.armed.has(notification.id)) continue;
        // Record before awaiting so even a delayed/partially failing schedule is cancellable.
        this.armed.set(notification.id, wanted.transport);
        try {
          await wanted.transport.schedule(notification);
        } catch (error) {
          await this.cancelAll();
          throw error;
        }
      }
    });
  }
}
