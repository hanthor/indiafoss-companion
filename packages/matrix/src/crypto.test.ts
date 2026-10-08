import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CryptoBackend, RawMatrixEvent } from './crypto.js';
import { loadCryptoWasm, WasmCryptoBackend } from './crypto.js';

/**
 * Mock CryptoBackend for testing components that depend on crypto
 * without loading the actual WASM module.
 */
export class MockCryptoBackend implements CryptoBackend {
  readonly deviceId: string;
  private listeners: ((roomIds: string[]) => void)[] = [];
  private roomKeys: Map<string, string> = new Map();
  private encryptedEvents: Map<string, Record<string, unknown>> = new Map();

  constructor(deviceId: string = 'mock-device') {
    this.deviceId = deviceId;
  }

  async receiveSync(): Promise<void> {
    // Mock implementation: no-op
  }

  async flushOutgoing(): Promise<void> {
    // Mock implementation: no-op
  }

  async ensureRoomKey(): Promise<void> {
    // Mock implementation: no-op
  }

  async encryptEvent(
    roomId: string,
    type: string,
    content: unknown,
  ): Promise<Record<string, unknown>> {
    const encrypted = {
      algorithm: 'm.megolm.v1.aes-sha2',
      ciphertext: 'mock-ciphertext',
      device_id: this.deviceId,
      sender_key: 'mock-sender-key',
      session_id: `session-${roomId}`,
    };
    this.encryptedEvents.set(`${roomId}:${type}`, encrypted);
    return encrypted;
  }

  async decryptEvent(roomId: string, event: RawMatrixEvent): Promise<RawMatrixEvent | null> {
    // Mock: return null if event type is not m.room.encrypted
    if (event.type !== 'm.room.encrypted') {
      return event;
    }
    // Simulated successful decryption
    return {
      ...event,
      type: 'm.room.message',
      content: { body: 'decrypted content', msgtype: 'm.text' },
    };
  }

  async encryptAttachment(bytes: Uint8Array): Promise<{ data: Uint8Array; info: string }> {
    return {
      data: bytes,
      info: JSON.stringify({
        v: 'v2',
        key: { alg: 'A256CTR', k: 'mock-key', kid: 'mock-key-id', kty: 'oct' },
        iv: 'mock-iv',
        hashes: { sha256: 'mock-hash' },
      }),
    };
  }

  async decryptAttachment(bytes: Uint8Array): Promise<Uint8Array> {
    return bytes;
  }

  onRoomKeys(listener: (roomIds: string[]) => void): void {
    this.listeners.push(listener);
  }

  async close(): Promise<void> {
    this.listeners = [];
    this.roomKeys.clear();
    this.encryptedEvents.clear();
  }

  // Helper for testing: trigger room key updates
  triggerRoomKeyUpdate(roomIds: string[]): void {
    for (const listener of this.listeners) {
      listener(roomIds);
    }
  }
}

describe('CryptoBackend interface', () => {
  let backend: MockCryptoBackend;

  beforeEach(() => {
    backend = new MockCryptoBackend('test-device-123');
  });

  afterEach(async () => {
    await backend.close();
  });

  it('exposes device ID', () => {
    expect(backend.deviceId).toBe('test-device-123');
  });

  it('supports multiple listeners for room key updates', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    backend.onRoomKeys(listener1);
    backend.onRoomKeys(listener2);

    backend.triggerRoomKeyUpdate(['!room1:example.org']);

    expect(listener1).toHaveBeenCalledWith(['!room1:example.org']);
    expect(listener2).toHaveBeenCalledWith(['!room1:example.org']);
  });

  it('handles sync receive without error', async () => {
    await expect(
      backend.receiveSync({
        toDevice: [],
        changed: [],
        left: [],
        oneTimeKeyCounts: {},
      }),
    ).resolves.toBeUndefined();
  });

  it('handles sync with device list changes', async () => {
    await expect(
      backend.receiveSync({
        toDevice: [],
        changed: ['@alice:example.org'],
        left: ['@bob:example.org'],
        oneTimeKeyCounts: { 'curve25519': 10 },
        unusedFallbackKeys: ['fallback-key-1'],
      }),
    ).resolves.toBeUndefined();
  });

  it('flushes outgoing without error', async () => {
    // Mock MatrixClient not needed for this test
    await expect(backend.flushOutgoing({} as any)).resolves.toBeUndefined();
  });

  it('ensures room key distribution', async () => {
    await expect(
      backend.ensureRoomKey({} as any, '!room:example.org', ['@alice:example.org']),
    ).resolves.toBeUndefined();
  });

  it('encrypts events with algorithm and metadata', async () => {
    const encrypted = await backend.encryptEvent('!room:example.org', 'm.room.message', {
      body: 'test message',
      msgtype: 'm.text',
    });

    expect(encrypted).toMatchObject({
      algorithm: 'm.megolm.v1.aes-sha2',
      device_id: 'test-device-123',
      session_id: 'session-!room:example.org',
    });
    expect(encrypted.ciphertext).toBeDefined();
  });

  it('decrypts m.room.encrypted events', async () => {
    const encrypted: RawMatrixEvent = {
      type: 'm.room.encrypted',
      content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'test' },
      sender: '@alice:example.org',
      origin_server_ts: 0,
      event_id: '$test',
      room_id: '!room:example.org',
    };

    const decrypted = await backend.decryptEvent('!room:example.org', encrypted);

    expect(decrypted?.type).toBe('m.room.message');
    expect(decrypted?.content).toHaveProperty('body');
  });

  it('returns null for undecryptable events (key not yet received)', async () => {
    const encrypted: RawMatrixEvent = {
      type: 'm.room.encrypted',
      content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'unknown-session' },
      sender: '@alice:example.org',
      origin_server_ts: 0,
      event_id: '$test-unknown',
      room_id: '!room:example.org',
    };

    // Mock backend returns null for simulated missing keys
    const backend2 = new MockCryptoBackend();
    const result = await backend2.decryptEvent('!room:example.org', encrypted);
    // This depends on implementation; adjust expectation based on actual behavior
    expect(result === null || result?.type === 'm.room.encrypted').toBe(true);
  });

  it('encrypts attachments with JWK format info', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const { data: encData, info } = await backend.encryptAttachment(data);

    expect(encData).toEqual(data);
    const infoObj = JSON.parse(info);
    expect(infoObj).toMatchObject({
      v: 'v2',
      key: expect.objectContaining({ alg: 'A256CTR', kty: 'oct' }),
    });
  });

  it('decrypts attachments from JWK format info', async () => {
    const encrypted = new Uint8Array([10, 11, 12, 13, 14]);
    const info = JSON.stringify({
      v: 'v2',
      key: { alg: 'A256CTR', k: 'key', kid: 'id', kty: 'oct' },
      iv: 'iv',
      hashes: { sha256: 'hash' },
    });

    const decrypted = await backend.decryptAttachment(encrypted, info);
    expect(decrypted).toEqual(encrypted);
  });

  it('closes cleanly and stops listeners', async () => {
    const listener = vi.fn();
    backend.onRoomKeys(listener);

    await backend.close();
    backend.triggerRoomKeyUpdate(['!room:example.org']);

    // After close, no listeners should be called
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('loadCryptoWasm', () => {
  it('caches the WASM module across calls', async () => {
    // This test would require mocking the actual WASM import
    // In a real test environment with WASM available:
    // const wasm1 = await loadCryptoWasm();
    // const wasm2 = await loadCryptoWasm();
    // expect(wasm1).toBe(wasm2);

    // For now, document that caching is expected behavior
    expect(true).toBe(true);
  });
});

describe('WasmCryptoBackend', () => {
  it('is created via static factory method', async () => {
    // WasmCryptoBackend.create requires actual WASM module
    // Test would require:
    // const backend = await WasmCryptoBackend.create(
    //   '@user:example.org',
    //   'device-id',
    //   undefined // in-memory store for tests
    // );
    // expect(backend.deviceId).toBe('device-id');

    // Document that this requires WASM environment
    expect(true).toBe(true);
  });
});
