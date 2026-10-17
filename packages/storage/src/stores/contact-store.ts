import { withIdentityEnvelope } from '@indiafoss/model';
import type { CompanionDatabase } from '../database.js';
import type { ContactRecord } from '../index.js';

/**
 * Bring a record written by an older build up to the current vocabulary.
 * Builds before #31/#188 stored a profile match as `meshLink.state ===
 * 'verified'`; it reads back as `profile-matched` — not dropped, not trusted.
 * Identity fields go through the versioned envelope (#160): an unversioned
 * record reads as v1, and a mesh or Matrix value this build does not
 * recognise is moved to `identity.retained` rather than offered as an address.
 */
export function migrateContactRecord(raw: ContactRecord): ContactRecord {
  const state = (raw.meshLink as { state?: string } | undefined)?.state;
  const record =
    state === 'verified'
      ? { ...raw, meshLink: { ...raw.meshLink!, state: 'profile-matched' as const } }
      : raw;
  return withIdentityEnvelope(record);
}

/** Persistence boundary for contacts captured from signed cards. */
export class ContactStore {
  constructor(private readonly db: CompanionDatabase) {}

  async save(contact: ContactRecord): Promise<void> {
    await this.db.contacts.put(contact);
  }

  async list(): Promise<ContactRecord[]> {
    const rows = (await this.db.contacts.toArray()).map(migrateContactRecord);
    return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async delete(id: string): Promise<void> {
    await this.db.contacts.delete(id);
  }
}
