/**
 * The persistent crypto store: what it is called, and that signing out
 * actually removes it.
 *
 * Both matter for a shared or borrowed phone at a conference. A store name
 * that collides between two accounts would let one attendee's device keys sit
 * under another's session; a sign-out that leaves the store behind means the
 * next person inherits it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cryptoStoreName, deleteCryptoStore } from './crypto.js';

describe('cryptoStoreName', () => {
  it('is distinct per account and per device', () => {
    // Per *device*, not just per account: the same user on two devices holds
    // two different sets of keys, and sharing a store would cross them.
    const a = cryptoStoreName('@ada:hs.test', 'DEV1');
    expect(cryptoStoreName('@ada:hs.test', 'DEV2')).not.toBe(a);
    expect(cryptoStoreName('@bob:hs.test', 'DEV1')).not.toBe(a);
    expect(cryptoStoreName('@ada:hs.test', 'DEV1')).toBe(a);
  });

  it('keeps the characters a Matrix id is made of', () => {
    // `@`, `:`, `.` and `-` all appear in ordinary user ids, so replacing them
    // would fold distinct accounts onto one name.
    expect(cryptoStoreName('@ada:hs.test', 'DEV-1')).toBe('indiafoss-crypto-@ada:hs.test-DEV-1');
  });

  it('replaces anything else, so the name is safe to use as a database name', () => {
    const name = cryptoStoreName('@a b/c:hs.test', 'D#1');
    expect(name).toBe('indiafoss-crypto-@a_b_c:hs.test-D_1');
    expect(name).not.toMatch(/[^A-Za-z0-9_.@:-]/);
  });

  it('does not collide between a mesh node id and an ordinary account', () => {
    // Mesh user ids are `@n:<64 hex>` — every attendee shares the localpart and
    // differs only in the server name, so the server name has to survive.
    const one = cryptoStoreName(`@n:${'a'.repeat(64)}`, 'DEV');
    const two = cryptoStoreName(`@n:${'b'.repeat(64)}`, 'DEV');
    expect(one).not.toBe(two);
  });
});

describe('deleteCryptoStore', () => {
  const original = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  afterEach(() => {
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = original;
  });

  function fakeIdb(behaviour: 'success' | 'error' | 'blocked') {
    const deleted: string[] = [];
    const idb = {
      deleteDatabase(name: string) {
        deleted.push(name);
        const req: Record<string, unknown> = {};
        // The callbacks are assigned after this returns, so fire on a later tick.
        queueMicrotask(() => {
          const handler = req[
            behaviour === 'success' ? 'onsuccess' : behaviour === 'error' ? 'onerror' : 'onblocked'
          ] as (() => void) | undefined;
          handler?.();
        });
        return req;
      },
    } as unknown as IDBFactory;
    return { idb, deleted };
  }

  it('removes both databases the crypto SDK creates', async () => {
    // The SDK splits its state across a store and a meta store; deleting only
    // the first leaves the account behind and sign-out is not a sign-out.
    const { idb, deleted } = fakeIdb('success');
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = idb;
    await deleteCryptoStore('store');
    expect(deleted).toEqual(['store::matrix-sdk-crypto', 'store::matrix-sdk-crypto-meta']);
  });

  it('resolves even when the deletion errors or is blocked', async () => {
    // Best-effort by design: another open tab blocks the delete indefinitely,
    // and sign-out must not hang on it.
    for (const behaviour of ['error', 'blocked'] as const) {
      const { idb } = fakeIdb(behaviour);
      (globalThis as { indexedDB?: IDBFactory }).indexedDB = idb;
      await expect(deleteCryptoStore('store'), behaviour).resolves.toBeUndefined();
    }
  });

  it('does nothing where there is no IndexedDB', async () => {
    // The native client and any server-side use have no IndexedDB at all.
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    await expect(deleteCryptoStore('store')).resolves.toBeUndefined();
  });
});
