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
  /**
   * Quick-pass answer (#90): a first yes/no sweep down the day's list. `no`
   * goes with `disposition: 'not-interested'`; `yes` keeps the session in the
   * running and is what the head-to-head round is then limited to.
   */
  triage?: 'yes' | 'no';
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

/** Cached Matrix room summary (§ messaging). Mirrors the homeserver, never authoritative. */
export interface MatrixRoomRecord {
  roomId: string;
  name: string;
  alias?: string;
  topic?: string;
  isDirect: boolean;
  /** Other members' user ids (display names live in `memberNames`). */
  memberIds: string[];
  memberNames: Record<string, string>;
  encrypted: boolean;
  /** Membership state of the signed-in user. */
  membership: 'join' | 'invite' | 'leave';
  /** origin_server_ts of the latest known event, for ordering. */
  lastActivityTs: number;
  unread: number;
  /** Pagination token for backfilling older history. */
  prevBatch?: string;
}

export interface MatrixEventRecord {
  eventId: string;
  roomId: string;
  sender: string;
  ts: number;
  type: string;
  body: string;
  /** m.text, m.notice, m.emote... or a placeholder for unsupported content. */
  msgtype?: string;
  /** Client transaction id when the event was sent from this device. */
  txnId?: string;
  /** True when the event arrived as m.room.encrypted and was decrypted locally. */
  encrypted?: boolean;
  /** True when the event is encrypted and no key is available yet. */
  undecryptable?: boolean;
  /** Original encrypted event (JSON) kept so decryption can be retried when keys arrive. */
  raw?: string;
  /** mxc:// URL for m.image / m.file / m.audio / m.video content. */
  mediaUrl?: string;
  /** JSON-encoded EncryptedFile (key, iv, hashes) for attachments in E2EE rooms. */
  mediaFile?: string;
  mediaMime?: string;
  mediaSize?: number;
  /** Event this one replies to (m.in_reply_to). */
  replyTo?: string;
  /** Event this one annotates, with the annotation key, for m.reaction. */
  reactsTo?: string;
  reactionKey?: string;
  /** Redacted by its author or a moderator: the body is a placeholder and any relation is gone. */
  redacted?: boolean;
}

export interface MatrixOutboxRecord {
  txnId: string;
  roomId: string;
  body: string;
  /** Event this queued message replies to. */
  replyTo?: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

/** A contact saved from a scanned QR code. Stays on device; never uploaded. */
export interface ContactRecord {
  id: string;
  /** vCard payload for export; regenerated from the parsed fields when absent. */
  vcard: string;
  fullName: string;
  organization?: string;
  email?: string;
  phone?: string;
  website?: string;
  fossUnitedProfileUrl?: string;
  /** Public picture link from the card's `PHOTO` (#95). */
  avatarUrl?: string;
  matrixId?: string;
  /** Neutrino P2P node identity, kept separately from the Matrix id. */
  neutrinoServerName?: string;
  ticketRef?: string;
  socials: Record<string, string>;
  /** QR exchange is not identity verification; stays false until Matrix verification. */
  verified: boolean;
  savedAt: string;
  eventId?: string;
  /** Handshake public key (`alg:base64url`) from a signed friend card. */
  publicKey?: string;
  /** SHA-256 fingerprint of `publicKey` (hex) — drives the identicon. */
  fingerprint?: string;
  /** Result of verifying the card signature at scan time. */
  signature?: 'valid' | 'invalid' | 'unsigned';
  /** Where and when you met: the session running at scan time. */
  metActivityId?: string;
  metLocationId?: string;
  /** How many times this card was scanned (key continuity, issue #31). */
  metCount?: number;
  lastMetAt?: string;
  /** A card with the same name/ids but a different handshake key was saved earlier. */
  keyChanged?: boolean;
  /**
   * Whether the card's Matrix id really belongs to its mesh identity: the
   * account's own profile is checked when online (issue #111). Absent until
   * checked; only meaningful when both ids are on the card.
   */
  meshLink?: {
    state: 'verified' | 'mismatch' | 'unlinked' | 'unverifiable';
    checkedAt: number;
  };
  previousFingerprint?: string;
}

/** The device's own handshake key pair (non-extractable CryptoKeys, structured-cloned by IndexedDB). */
export interface DeviceKeyRecord {
  id: string;
  alg: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** base64url raw public key, for cards. */
  exported: string;
  createdAt: string;
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
  contacts!: Table<ContactRecord, string>;
  passport!: Table<{ activityId: string; scannedAt: string }, string>;
  'sync-state'!: Table<SyncStateRecord, string>;
  'matrix-rooms'!: Table<MatrixRoomRecord, string>;
  'matrix-events'!: Table<MatrixEventRecord, string>;
  'matrix-outbox'!: Table<MatrixOutboxRecord, string>;
  'device-keys'!: Table<DeviceKeyRecord, string>;

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
    // v2: optional Matrix messaging cache. Existing stores are untouched.
    this.version(2).stores({
      'matrix-rooms': 'roomId, lastActivityTs',
      'matrix-events': 'eventId, roomId, [roomId+ts], txnId',
      'matrix-outbox': 'txnId, roomId, createdAt',
    });
    // v3: handshake signing keys for signed contact cards.
    this.version(3).stores({ 'device-keys': 'id' });
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

  // ---- Contacts ------------------------------------------------------------

  async saveContact(contact: ContactRecord): Promise<void> {
    await this.db.contacts.put(contact);
  }

  async listContacts(): Promise<ContactRecord[]> {
    const rows = await this.db.contacts.toArray();
    return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async deleteContact(id: string): Promise<void> {
    await this.db.contacts.delete(id);
  }

  async getDeviceKey(id = 'handshake'): Promise<DeviceKeyRecord | undefined> {
    return this.db['device-keys'].get(id);
  }

  async putDeviceKey(record: DeviceKeyRecord): Promise<void> {
    await this.db['device-keys'].put(record);
  }

  // ---- Matrix messaging cache -------------------------------------------

  async putMatrixRooms(rooms: MatrixRoomRecord[]): Promise<void> {
    await this.db['matrix-rooms'].bulkPut(rooms);
  }

  async listMatrixRooms(): Promise<MatrixRoomRecord[]> {
    return this.db['matrix-rooms'].orderBy('lastActivityTs').reverse().toArray();
  }

  async deleteMatrixRoom(roomId: string): Promise<void> {
    await this.db.transaction('rw', this.db['matrix-rooms'], this.db['matrix-events'], async () => {
      await this.db['matrix-rooms'].delete(roomId);
      await this.db['matrix-events'].where('roomId').equals(roomId).delete();
    });
  }

  async putMatrixEvents(events: MatrixEventRecord[]): Promise<void> {
    await this.db['matrix-events'].bulkPut(events);
  }

  /** Newest `limit` events of a room, returned oldest-first. */
  async listMatrixEvents(roomId: string, limit = 200): Promise<MatrixEventRecord[]> {
    const rows = await this.db['matrix-events']
      .where('[roomId+ts]')
      .between([roomId, Dexie.minKey], [roomId, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
    return rows.reverse();
  }

  async putMatrixOutbox(item: MatrixOutboxRecord): Promise<void> {
    await this.db['matrix-outbox'].put(item);
  }

  async listMatrixOutbox(): Promise<MatrixOutboxRecord[]> {
    return this.db['matrix-outbox'].orderBy('createdAt').toArray();
  }

  async deleteMatrixOutbox(txnId: string): Promise<void> {
    await this.db['matrix-outbox'].delete(txnId);
  }

  /** Sign-out: drop every cached room, event and queued message. */
  async clearMatrix(): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db['matrix-rooms'],
        this.db['matrix-events'],
        this.db['matrix-outbox'],
        this.db.settings,
      ],
      async () => {
        await this.db['matrix-rooms'].clear();
        await this.db['matrix-events'].clear();
        await this.db['matrix-outbox'].clear();
        await this.db.settings.where('key').startsWith('matrix-').delete();
      },
    );
  }
}
