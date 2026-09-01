import type { EventBundle } from '@indiafoss/model';
import Dexie, { type Table } from 'dexie';

/** Initial Elo rating (§14). */
export const INITIAL_RATING = 1200;

export type Disposition = 'normal' | 'must-attend' | 'not-interested' | 'watch-later';

export interface ActivityPreference {
  activityId: string;
  /** Elo rating, starts at 1200. */
  rating: number;
  /** Number of comparisons this activity has participated in. */
  comparisons: number;
  disposition: Disposition;
  bookmarked: boolean;
}

export interface ComparisonRecord {
  id: string;
  activityA: string;
  activityB: string;
  /** Result score for A: 1.0 / 0.5 / 0.0 (+ effective K, see elo package). */
  scoreA: number;
  createdAt: string;
}

export interface EventBundleRecord {
  eventId: string;
  bundle: EventBundle;
  savedAt: string;
}

export interface ItineraryRecord {
  eventId: string;
  generatedAt: string;
  activityIds: string[];
}

export interface NoteRecord {
  activityId: string;
  body: string;
  updatedAt: string;
}

export interface SyncStateRecord {
  eventId: string;
  revision?: string;
  lastCheckedAt?: string;
}

/**
 * IndexedDB schema (§49). Every store is declared up front so migrations are
 * stable; only the stores Phase 2 needs are exercised by CRUD today.
 */
export class CompanionDatabase extends Dexie {
  events!: Table<EventBundleRecord, string>;
  'event-assets'!: Table<{ key: string; blob: ArrayBuffer }, string>;
  preferences!: Table<ActivityPreference, string>;
  comparisons!: Table<ComparisonRecord, string>;
  itineraries!: Table<ItineraryRecord, string>;
  settings!: Table<{ key: string; value: string }, string>;
  notes!: Table<NoteRecord, string>;
  contacts!: Table<{ id: string; vcard: string }, string>;
  passport!: Table<{ activityId: string; scannedAt: string }, string>;
  'sync-state'!: Table<SyncStateRecord, string>;

  constructor(name = 'indiafoss-companion') {
    super(name);
    this.version(1).stores({
      events: 'eventId',
      'event-assets': 'key',
      preferences: 'activityId',
      comparisons: 'id, createdAt',
      itineraries: 'eventId',
      settings: 'key',
      notes: 'activityId',
      contacts: 'id',
      passport: 'activityId',
      'sync-state': 'eventId',
    });
  }
}

export function defaultPreference(activityId: string): ActivityPreference {
  return {
    activityId,
    rating: INITIAL_RATING,
    comparisons: 0,
    disposition: 'normal',
    bookmarked: false,
  };
}

/** Storage facade over IndexedDB. All attendee state stays on device (§45). */
export class CompanionStorage {
  constructor(private readonly db: CompanionDatabase = new CompanionDatabase()) {}

  async saveEventBundle(bundle: EventBundle): Promise<void> {
    await this.db.events.put({ eventId: bundle.id, bundle, savedAt: new Date().toISOString() });
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

  async getPreference(activityId: string): Promise<ActivityPreference | undefined> {
    return this.db.preferences.get(activityId);
  }

  /** All preferences (used to hydrate the reactive client store). */
  async listPreferences(): Promise<ActivityPreference[]> {
    return this.db.preferences.toArray();
  }

  async setPreference(pref: ActivityPreference): Promise<void> {
    await this.db.preferences.put(pref);
  }

  async setBookmark(activityId: string, bookmarked: boolean): Promise<ActivityPreference> {
    const current = (await this.getPreference(activityId)) ?? defaultPreference(activityId);
    const next = { ...current, bookmarked };
    await this.setPreference(next);
    return next;
  }

  async setDisposition(activityId: string, disposition: Disposition): Promise<ActivityPreference> {
    const current = (await this.getPreference(activityId)) ?? defaultPreference(activityId);
    const next = { ...current, disposition };
    await this.setPreference(next);
    return next;
  }

  async saveComparison(record: ComparisonRecord): Promise<void> {
    await this.db.comparisons.put(record);
  }

  async deleteComparison(id: string): Promise<void> {
    await this.db.comparisons.delete(id);
  }

  async listComparisons(): Promise<ComparisonRecord[]> {
    return this.db.comparisons.orderBy('createdAt').toArray();
  }

  async saveItinerary(record: ItineraryRecord): Promise<void> {
    await this.db.itineraries.put(record);
  }

  async loadItinerary(eventId: string): Promise<ItineraryRecord | undefined> {
    return this.db.itineraries.get(eventId);
  }

  async saveNote(activityId: string, body: string): Promise<void> {
    await this.db.notes.put({ activityId, body, updatedAt: new Date().toISOString() });
  }

  async getNote(activityId: string): Promise<string | undefined> {
    return (await this.db.notes.get(activityId))?.body;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.settings.put({ key, value });
  }

  async getSetting(key: string): Promise<string | undefined> {
    return (await this.db.settings.get(key))?.value;
  }
}
