import type { EventBundle } from '@indiafoss/model';
import type { CompanionDatabase } from '../database.js';

/** Persistence boundary for canonical event bundles and their revisions. */
export class EventStore {
  constructor(private readonly db: CompanionDatabase) {}

  async saveEventBundle(bundle: EventBundle): Promise<void> {
    await this.db.events.put({ eventId: bundle.id, bundle, savedAt: new Date().toISOString() });
  }

  /** Commit the bundle and its revision together, without rolling back a newer tab's update. */
  async saveEventRevision(bundle: EventBundle, revision: number): Promise<boolean> {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid event revision');
    return this.db.transaction('rw', this.db.events, this.db.settings, async () => {
      const key = `event-revision-${bundle.id}`;
      const stored = (await this.db.events.get(bundle.id))?.revision;
      if (stored !== undefined && Number.isSafeInteger(stored) && stored >= revision) return false;
      await this.db.events.put({
        eventId: bundle.id,
        bundle,
        revision,
        savedAt: new Date().toISOString(),
      });
      await this.db.settings.put({ key, value: String(revision) });
      return true;
    });
  }

  /** Ignore legacy standalone revision stamps, which may not match the stored bundle. */
  async loadEventRevision(eventId: string): Promise<number | null> {
    const revision = (await this.db.events.get(eventId))?.revision;
    return revision !== undefined && Number.isSafeInteger(revision) && revision > 0
      ? revision
      : null;
  }

  async loadEventBundle(eventId: string): Promise<EventBundle | undefined> {
    const record = await this.db.events.get(eventId);
    return record?.bundle;
  }

  async deleteEventBundle(eventId: string): Promise<void> {
    await this.db.events.delete(eventId);
  }

  async listEvents(): Promise<string[]> {
    return this.db.events.orderBy('eventId').primaryKeys();
  }
}
