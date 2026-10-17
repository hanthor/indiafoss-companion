import Dexie from 'dexie';
import type { CompanionDatabase } from '../database.js';
import type { MatrixEventRecord, MatrixOutboxRecord, MatrixRoomRecord } from '../index.js';

/** Persistence boundary for the local Matrix cache and durable outbox. */
export class MatrixStore {
  constructor(private readonly db: CompanionDatabase) {}

  async putRooms(rooms: MatrixRoomRecord[]): Promise<void> {
    await this.db['matrix-rooms'].bulkPut(rooms);
  }

  async listRooms(): Promise<MatrixRoomRecord[]> {
    return this.db['matrix-rooms'].orderBy('lastActivityTs').reverse().toArray();
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.db.transaction('rw', this.db['matrix-rooms'], this.db['matrix-events'], async () => {
      await this.db['matrix-rooms'].delete(roomId);
      await this.db['matrix-events'].where('roomId').equals(roomId).delete();
    });
  }

  async putEvents(events: MatrixEventRecord[]): Promise<void> {
    await this.db['matrix-events'].bulkPut(events);
  }

  /** Newest `limit` events of a room, returned oldest-first. */
  async listEvents(roomId: string, limit = 200): Promise<MatrixEventRecord[]> {
    const rows = await this.db['matrix-events']
      .where('[roomId+ts]')
      .between([roomId, Dexie.minKey], [roomId, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
    return rows.reverse();
  }

  async putOutbox(item: MatrixOutboxRecord): Promise<void> {
    await this.db['matrix-outbox'].put(item);
  }

  async listOutbox(): Promise<MatrixOutboxRecord[]> {
    return this.db['matrix-outbox'].orderBy('createdAt').toArray();
  }

  async deleteOutbox(txnId: string): Promise<void> {
    await this.db['matrix-outbox'].delete(txnId);
  }

  /** Sign-out: drop every cached room, event and queued message. */
  async clear(): Promise<void> {
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
