import Dexie, { type Table } from 'dexie';
import type {
  ActivityPreference,
  ComparisonRecord,
  ContactRecord,
  DeviceKeyRecord,
  EventBundleRecord,
  ItineraryRecord,
  MatrixEventRecord,
  MatrixOutboxRecord,
  MatrixRoomRecord,
  NoteRecord,
  SyncStateRecord,
} from './index.js';

/**
 * IndexedDB schema (§49). The schema is kept separate from domain stores so
 * migrations remain one stable, auditable boundary.
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
