import type {
  BindingState,
  EventBundle,
  IdentityMeta,
  MatrixKeyKind,
  MatrixKeyProvenance,
} from '@indiafoss/model';
import type { AccountClaimTrust, PersonalDataFile } from '@indiafoss/model/contracts';
import { personalDataFromSnapshot, type PersonalDataSnapshot } from './personal-data.js';
import { validatePersonalData } from './personal-data-validation.js';
import {
  PersonalDataImportStaleError,
  planPersonalDataImport,
  storedValue,
  type ImportChange,
  type PersonalDataImportPreview,
} from './personal-data-import.js';
import { CompanionDatabase } from './database.js';
import { ContactStore } from './stores/contact-store.js';
import { EventStore } from './stores/event-store.js';
import { IdentityStore } from './stores/identity-store.js';
import { MatrixStore } from './stores/matrix-store.js';
import { PersonalScheduleStore } from './stores/personal-schedule-store.js';
import { SettingsStore } from './stores/settings-store.js';

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
  /**
   * The session this one stood aside for in a clash (#271). A scheduling
   * loss kept apart from `disposition`: the talk stays an interest, is left
   * out of the plan only while the winner is live, and is never learnt as a
   * dislike. Cleared by any later direct answer.
   */
  yieldedTo?: string;
}

export interface ComparisonRecord {
  id: string;
  activityA: string;
  activityB: string;
  /** Result score for A: 1.0 / 0.5 / 0.0 (+ effective K, see elo package). */
  scoreA: number;
  createdAt: string;
  /** Answered as a scheduling clash (#271): the loser is not learnt as a dislike. */
  clash?: boolean;
}

export interface EventBundleRecord {
  /** Present only when the revision was committed with this exact bundle. */
  revision?: number;
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
  /**
   * The parts of `m.room.power_levels` that decide who may post (issue #113):
   * absent until the room has sent its power levels.
   */
  powerLevels?: {
    usersDefault: number;
    eventsDefault: number;
    /** Level required for `m.room.message`, when the room sets one. */
    message?: number;
    users: Record<string, number>;
  };
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
  /** Asked as a question in a session room (`in.indiafoss.question`, issue #114). */
  question?: boolean;
}

export interface MatrixOutboxRecord {
  txnId: string;
  roomId: string;
  body: string;
  /** Event this queued message replies to. */
  replyTo?: string;
  /** Send as a session question (issue #114). */
  question?: boolean;
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
  /**
   * Identity envelope version `matrixId` / `neutrinoServerName` were read
   * under, and any identity fields the reading build set aside because it did
   * not understand them (#160). Records from before versioning gain
   * `{ version: 1 }` on read.
   */
  identity?: IdentityMeta;
  ticketRef?: string;
  socials: Record<string, string>;
  /**
   * Matrix device verification happened. QR exchange, a card signature, a
   * badge comparison and a profile match are none of that, so this stays
   * `false` until the app holds cross-signing evidence — which nothing in
   * this repository produces yet (#188). Never read off the wire.
   */
  verified: boolean;
  savedAt: string;
  eventId?: string;
  /** Handshake public key (`alg:base64url`) from a signed friend card. */
  publicKey?: string;
  /** SHA-256 fingerprint of `publicKey` (hex) — drives the identicon. */
  fingerprint?: string;
  /** Result of verifying the card signature at scan time. */
  signature?: 'valid' | 'invalid' | 'unsigned';
  /**
   * When the scanned rendering of the card was issued, read off the signed
   * body. With `lastMetAt` it says how old the code was when scanned: a
   * card hours old was a photograph, not a phone. Wire data, kept as read.
   */
  cardIssuedAt?: string;
  /** Per-rendering nonce of the last scan; the same nonce twice is the same code twice. */
  cardNonce?: string;
  /**
   * The attendee's own statement that the other person scanned their card
   * back (#exchange). A QR cannot report being scanned, so this is set by a
   * tap, never by the wire, and is dropped on import like every conclusion.
   */
  mutual?: { at: string };
  /** Where and when you met: the session running at scan time. */
  metActivityId?: string;
  metLocationId?: string;
  /** What the attendee's plan said they were doing: "Lunch, day 1". */
  metLabel?: string;
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
    // `profile-matched` is the homeserver's word, compared as a string — an
    // account *claim* the profile agrees with, never verification. Records
    // written by builds that spelled it `verified` are rewritten on read.
    // `outdated` means one of the two identities was a shape the checking
    // build did not recognise, so no comparison was possible — kept distinct
    // from `mismatch`, which is shown as evidence a card is not genuine (#160).
    state: MeshLinkObservation;
    checkedAt: number;
  };
  /**
   * The conclusion drawn from `meshLink` (the profile observation) and
   * `binding.check` (the binding verification): `profile-matched` from the
   * former, `binding-valid` or `revoked` from the latter. `verified` has no
   * producer: it needs Chat's user verification of the Matrix key (#188).
   * Reset to `claimed` on every import; never trusted from a file or a card.
   */
  accountTrust?: AccountClaimTrust;
  /**
   * The attendee said, explicitly, that they compared this card's key badge
   * with the one on the other person's phone and it matched (#31). Bound to
   * the fingerprint it was made for: a later card with a different key does
   * not inherit it. This is a statement about the *card key*, not about any
   * account on the card, and nothing sets it but the attendee's own tap.
   */
  inPersonConfirmed?: { fingerprint: string; at: string };
  previousFingerprint?: string;
  /**
   * A signed mesh↔Matrix binding presented with the card (#188,
   * `docs/identity-binding.md`). `signed` is wire data, kept as it arrived
   * and never trusted by itself; `check` is this device's own verification
   * of it against keys it holds independently, and is dropped on import
   * like every other local conclusion. No surface writes `signed` yet: the
   * transport of bindings is a proposal, not a feature.
   */
  binding?: {
    signed: unknown;
    check?: BindingCheck;
  };
}

/** This device's verification of a stored binding: the conclusion, when, and against which key. */
export interface BindingCheck {
  state: BindingState;
  reason?: string;
  checkedAt: number;
  matrixKeyId?: string;
  matrixKeyKind?: MatrixKeyKind;
  /**
   * Where the Matrix key came from. Recorded so a later Chat-side user
   * verification can be matched against it; nothing here reads it as trust.
   */
  matrixKeyProvenance?: MatrixKeyProvenance;
}

/** What a public-profile read observed; see `@indiafoss/matrix` `MeshLinkState`. */
export type MeshLinkObservation =
  'profile-matched' | 'mismatch' | 'unlinked' | 'unverifiable' | 'outdated';

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

/** Store composition facade over IndexedDB. All attendee state stays on device (§45). */
export class CompanionStorage {
  readonly events: EventStore;
  readonly schedule: PersonalScheduleStore;
  readonly settings: SettingsStore;
  readonly contacts: ContactStore;
  readonly identity: IdentityStore;
  readonly matrix: MatrixStore;

  constructor(private readonly db: CompanionDatabase = new CompanionDatabase()) {
    this.events = new EventStore(db);
    this.schedule = new PersonalScheduleStore(db);
    this.settings = new SettingsStore(db);
    this.contacts = new ContactStore(db);
    this.identity = new IdentityStore(db);
    this.matrix = new MatrixStore(db);
  }

  private personalStores() {
    return [
      this.db.events,
      this.db.preferences,
      this.db.comparisons,
      this.db.notes,
      this.db.itineraries,
      this.db.settings,
    ];
  }

  /** Only the explicit personal-data allowlist; credentials, keys and caches never enter it. */
  private async personalSnapshot(): Promise<PersonalDataSnapshot> {
    const [
      events,
      preferences,
      comparisons,
      notes,
      itineraries,
      contact,
      plans,
      resolved,
      rooms,
      booths,
    ] = await Promise.all([
      this.db.events.toArray(),
      this.db.preferences.toArray(),
      this.db.comparisons.toArray(),
      this.db.notes.toArray(),
      this.db.itineraries.toArray(),
      this.db.settings.where('key').anyOf('attendee-profile', 'attendee-share-selection').toArray(),
      this.db.settings.where('key').startsWith('plan-edits-').toArray(),
      this.db.settings.where('key').startsWith('resolved-plan-').toArray(),
      this.db.settings.where('key').startsWith('room-prefs-').toArray(),
      this.db.settings.where('key').startsWith('booth-visit-').toArray(),
    ]);
    return {
      bundles: events.map((record) => record.bundle),
      preferences,
      comparisons,
      notes,
      itineraries,
      settings: [...contact, ...plans, ...resolved, ...rooms, ...booths],
    };
  }

  /** One consistent read transaction across the explicit personal-data allowlist. */
  async exportPersonalData(exportedAt = new Date().toISOString()): Promise<PersonalDataFile> {
    return this.db.transaction('r', this.personalStores(), async () =>
      personalDataFromSnapshot(await this.personalSnapshot(), exportedAt),
    );
  }

  /**
   * Validate a file and compare it with this device in one read transaction.
   * Nothing is written; unresolved and unsupported data is reported, not dropped.
   */
  async previewPersonalDataImport(raw: string): Promise<PersonalDataImportPreview> {
    const validated = validatePersonalData(raw);
    return this.db.transaction('r', this.personalStores(), async () =>
      planPersonalDataImport(validated, await this.personalSnapshot()),
    );
  }

  /**
   * Apply selected preview changes in one write transaction. Every value is
   * re-read first: a record edited since the preview aborts the whole import
   * (Dexie rolls back), so a stale preview cannot overwrite a newer choice.
   */
  async applyPersonalDataImport(changes: ImportChange[]): Promise<{ applied: number }> {
    return this.db.transaction('rw', this.personalStores(), async () => {
      const stale: string[] = [];
      for (const change of changes) {
        const stored = await this.db.table(change.write.store).get(change.write.key);
        if (storedValue(change.write, stored) !== change.current) stale.push(change.label);
      }
      if (stale.length) throw new PersonalDataImportStaleError(stale);
      for (const { write } of changes) {
        if (write.store === 'settings') {
          await this.db.settings.put({ key: write.key, value: write.value as string });
        } else {
          await this.db.table(write.store).put(write.value);
        }
      }
      return { applied: changes.length };
    });
  }

  async saveEventBundle(bundle: EventBundle): Promise<void> {
    await this.events.saveEventBundle(bundle);
  }

  /** Commit the bundle and its revision together, without rolling back a newer tab's update. */
  async saveEventRevision(bundle: EventBundle, revision: number): Promise<boolean> {
    return this.events.saveEventRevision(bundle, revision);
  }

  /** Ignore legacy standalone revision stamps, which may not match the stored bundle. */
  async loadEventRevision(eventId: string): Promise<number | null> {
    return this.events.loadEventRevision(eventId);
  }

  async loadEventBundle(eventId: string): Promise<EventBundle | undefined> {
    return this.events.loadEventBundle(eventId);
  }

  async deleteEventBundle(eventId: string): Promise<void> {
    await this.events.deleteEventBundle(eventId);
  }

  async listEvents(): Promise<string[]> {
    return this.events.listEvents();
  }

  async getPreference(activityId: string): Promise<ActivityPreference | undefined> {
    return this.schedule.getPreference(activityId);
  }

  /** All preferences (used to hydrate the reactive client store). */
  async listPreferences(): Promise<ActivityPreference[]> {
    return this.schedule.listPreferences();
  }

  async setPreference(pref: ActivityPreference): Promise<void> {
    await this.schedule.setPreference(pref);
  }

  async setBookmark(activityId: string, bookmarked: boolean): Promise<ActivityPreference> {
    return this.schedule.setBookmark(activityId, bookmarked);
  }

  async setDisposition(activityId: string, disposition: Disposition): Promise<ActivityPreference> {
    return this.schedule.setDisposition(activityId, disposition);
  }

  async saveComparison(record: ComparisonRecord): Promise<void> {
    await this.schedule.saveComparison(record);
  }

  async deleteComparison(id: string): Promise<void> {
    await this.schedule.deleteComparison(id);
  }

  async listComparisons(): Promise<ComparisonRecord[]> {
    return this.schedule.listComparisons();
  }

  async saveItinerary(record: ItineraryRecord): Promise<void> {
    await this.schedule.saveItinerary(record);
  }

  async loadItinerary(eventId: string): Promise<ItineraryRecord | undefined> {
    return this.schedule.loadItinerary(eventId);
  }

  async saveNote(activityId: string, body: string): Promise<void> {
    await this.schedule.saveNote(activityId, body);
  }

  async getNote(activityId: string): Promise<string | undefined> {
    return this.schedule.getNote(activityId);
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.settings.set(key, value);
  }

  async getSetting(key: string): Promise<string | undefined> {
    return this.settings.get(key);
  }

  // ---- Contacts ------------------------------------------------------------

  async saveContact(contact: ContactRecord): Promise<void> {
    await this.contacts.save(contact);
  }

  async listContacts(): Promise<ContactRecord[]> {
    return this.contacts.list();
  }

  async deleteContact(id: string): Promise<void> {
    await this.contacts.delete(id);
  }

  async getDeviceKey(id = 'handshake'): Promise<DeviceKeyRecord | undefined> {
    return this.identity.getDeviceKey(id);
  }

  async putDeviceKey(record: DeviceKeyRecord): Promise<void> {
    await this.identity.putDeviceKey(record);
  }

  // ---- Matrix messaging cache -------------------------------------------

  async putMatrixRooms(rooms: MatrixRoomRecord[]): Promise<void> {
    await this.matrix.putRooms(rooms);
  }

  async listMatrixRooms(): Promise<MatrixRoomRecord[]> {
    return this.matrix.listRooms();
  }

  async deleteMatrixRoom(roomId: string): Promise<void> {
    await this.matrix.deleteRoom(roomId);
  }

  async putMatrixEvents(events: MatrixEventRecord[]): Promise<void> {
    await this.matrix.putEvents(events);
  }

  /** Newest `limit` events of a room, returned oldest-first. */
  async listMatrixEvents(roomId: string, limit = 200): Promise<MatrixEventRecord[]> {
    return this.matrix.listEvents(roomId, limit);
  }

  async putMatrixOutbox(item: MatrixOutboxRecord): Promise<void> {
    await this.matrix.putOutbox(item);
  }

  async listMatrixOutbox(): Promise<MatrixOutboxRecord[]> {
    return this.matrix.listOutbox();
  }

  async deleteMatrixOutbox(txnId: string): Promise<void> {
    await this.matrix.deleteOutbox(txnId);
  }

  /** Sign-out: drop every cached room, event and queued message. */
  async clearMatrix(): Promise<void> {
    await this.matrix.clear();
  }
}

export { CompanionDatabase } from './database.js';
export { ContactStore, migrateContactRecord } from './stores/contact-store.js';
export { EventStore } from './stores/event-store.js';
export { IdentityStore } from './stores/identity-store.js';
export { MatrixStore } from './stores/matrix-store.js';
export {
  defaultPreference,
  INITIAL_RATING,
  PersonalScheduleStore,
} from './stores/personal-schedule-store.js';
export { SettingsStore } from './stores/settings-store.js';

export {
  PersonalDataImportStaleError,
  canonical,
  planPersonalDataImport,
} from './personal-data-import.js';
export type {
  ImportChange,
  ImportSkip,
  ImportSkipReason,
  ImportStore,
  ImportWrite,
  PersonalDataImportPreview,
} from './personal-data-import.js';
export { validatePersonalData } from './personal-data-validation.js';
export type { ValidatedPersonalData } from './personal-data-validation.js';
export type { PersonalDataSnapshot } from './personal-data.js';
