import type { CompanionDatabase } from '../database.js';
import type {
  ActivityPreference,
  ComparisonRecord,
  Disposition,
  ItineraryRecord,
} from '../index.js';

/** Initial Elo rating (§14). */
export const INITIAL_RATING = 1200;

export function defaultPreference(activityId: string): ActivityPreference {
  return {
    activityId,
    rating: INITIAL_RATING,
    comparisons: 0,
    disposition: 'normal',
    bookmarked: false,
  };
}

/** Persistence boundary for the attendee's schedule choices and notes. */
export class PersonalScheduleStore {
  constructor(private readonly db: CompanionDatabase) {}

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
}
