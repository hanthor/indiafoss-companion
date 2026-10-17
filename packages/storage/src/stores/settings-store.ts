import type { CompanionDatabase } from '../database.js';

/** Persistence boundary for namespaced application settings. */
export class SettingsStore {
  constructor(private readonly db: CompanionDatabase) {}

  async set(key: string, value: string): Promise<void> {
    await this.db.settings.put({ key, value });
  }

  async get(key: string): Promise<string | undefined> {
    return (await this.db.settings.get(key))?.value;
  }
}
