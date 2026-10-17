import type { CompanionDatabase } from '../database.js';
import type { DeviceKeyRecord } from '../index.js';

/** Persistence boundary for this device's handshake key material. */
export class IdentityStore {
  constructor(private readonly db: CompanionDatabase) {}

  async getDeviceKey(id = 'handshake'): Promise<DeviceKeyRecord | undefined> {
    return this.db['device-keys'].get(id);
  }

  async putDeviceKey(record: DeviceKeyRecord): Promise<void> {
    await this.db['device-keys'].put(record);
  }
}
