import { describe, expect, it } from 'vitest';
import { cryptoStoreName, deleteCryptoStore } from './crypto.js';

describe('cryptoStoreName', () => {
  it('formats store name with userId and deviceId', () => {
    const store = cryptoStoreName('@user:example.com', 'DEVICE1');
    expect(store).toBe('indiafoss-crypto-@user:example.com-DEVICE1');
  });

  it('replaces unsupported characters with underscores', () => {
    const store = cryptoStoreName('@user#special/name:example.com', 'DEV!CE$1');
    expect(store).toBe('indiafoss-crypto-@user_special_name:example.com-DEV_CE_1');
  });
});

describe('deleteCryptoStore', () => {
  it('handles environment without indexedDB gracefully', async () => {
    const originalIDB = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    try {
      (globalThis as unknown as { indexedDB?: unknown }).indexedDB = undefined;
      await expect(deleteCryptoStore('test-store')).resolves.toBeUndefined();
    } finally {
      (globalThis as unknown as { indexedDB?: unknown }).indexedDB = originalIDB;
    }
  });

  it('deletes both crypto and crypto-meta databases when indexedDB is available', async () => {
    const deletedNames: string[] = [];
    const fakeIDB = {
      deleteDatabase: (name: string) => {
        deletedNames.push(name);
        const req: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
        setTimeout(() => req.onsuccess?.(), 5);
        return req as unknown as IDBOpenDBRequest;
      },
    };

    const originalIDB = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    try {
      (globalThis as unknown as { indexedDB?: unknown }).indexedDB = fakeIDB;
      await deleteCryptoStore('my-store');
      expect(deletedNames).toEqual([
        'my-store::matrix-sdk-crypto',
        'my-store::matrix-sdk-crypto-meta',
      ]);
    } finally {
      (globalThis as unknown as { indexedDB?: unknown }).indexedDB = originalIDB;
    }
  });
});
