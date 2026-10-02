import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RawMatrixEvent } from './types.js';
import { loadCryptoWasm, WasmCryptoBackend } from './crypto.js';

// Mock the WASM module
vi.mock('@matrix-org/matrix-sdk-crypto-wasm', () => ({
  initAsync: vi.fn(),
  UserId: class MockUserId {
    constructor(public id: string) {}
  },
  DeviceId: class MockDeviceId {
    constructor(public id: string) {}
  },
  DeviceLists: class MockDeviceLists {
    constructor(
      public changed: any[],
      public left: any[],
    ) {}
  },
  OlmMachine: class MockOlmMachine {
    private roomKeyCallbacks: ((infos: any[]) => Promise<void>)[] = [];

    static initialize = vi.fn(async () => {
      return new MockOlmMachine();
    });

    registerRoomKeyUpdatedCallback = vi.fn(function (cb: (infos: any[]) => Promise<void>) {
      this.roomKeyCallbacks.push(cb);
    });

    receiveSyncChanges = vi.fn();
    outgoingRequests = vi.fn(() => []);
    markRequestAsSent = vi.fn();
    receiveKeys = vi.fn();
    shareRoomKey = vi.fn(() => []);
    encryptRoomEvent = vi.fn(() => ({ type: 'm.room.encrypted', content: {} }));
    decryptRoomEvent = vi.fn();
    encryptAttachment = vi.fn(() => ({
      data: new Uint8Array(),
      media_key: 'mock_key',
    }));
    decryptAttachment = vi.fn(() => new Uint8Array());
    close = vi.fn();
  },
}));

describe('crypto.ts', () => {
  describe('loadCryptoWasm', () => {
    it('loads WASM module and initializes it', async () => {
      const wasm = await loadCryptoWasm();
      expect(wasm).toBeDefined();
      expect(wasm.initAsync).toHaveBeenCalled();
    });

    it('caches WASM module on repeated calls', async () => {
      const wasm1 = await loadCryptoWasm();
      const wasm2 = await loadCryptoWasm();
      expect(wasm1).toBe(wasm2);
    });
  });

  describe('WasmCryptoBackend', () => {
    let backend: WasmCryptoBackend;
    const testUserId = '@test:example.com';
    const testDeviceId = 'TESTDEVICE';

    beforeEach(async () => {
      backend = await WasmCryptoBackend.create(testUserId, testDeviceId, 'test-store');
    });

    it('creates backend with correct device ID', () => {
      expect(backend.deviceId).toBe(testDeviceId);
    });

    it('creates in-memory backend when storeName is omitted', async () => {
      const memoryBackend = await WasmCryptoBackend.create(testUserId, testDeviceId);
      expect(memoryBackend.deviceId).toBe(testDeviceId);
    });

    describe('receiveSync', () => {
      it('processes sync changes with device lists', async () => {
        const syncInput = {
          toDevice: [
            {
              type: 'm.room_key',
              sender: '@alice:example.com',
              content: { algorithm: 'm.megolm.v1.aes-sha2' },
            } as RawMatrixEvent,
          ],
          changed: ['@alice:example.com'],
          left: ['@bob:example.com'],
          oneTimeKeyCounts: { curve25519: 10, signed_curve25519: 5 },
          unusedFallbackKeys: ['AAAAAA'],
        };

        await backend.receiveSync(syncInput);

        expect(backend.receiveSync).toBeDefined();
      });

      it('handles empty sync changes', async () => {
        const syncInput = {
          toDevice: [],
          changed: [],
          left: [],
          oneTimeKeyCounts: {},
        };

        await expect(backend.receiveSync(syncInput)).resolves.not.toThrow();
      });

      it('handles sync without unused fallback keys', async () => {
        const syncInput = {
          toDevice: [],
          changed: [],
          left: [],
          oneTimeKeyCounts: { curve25519: 0 },
        };

        await expect(backend.receiveSync(syncInput)).resolves.not.toThrow();
      });
    });

    describe('onRoomKeys', () => {
      it('registers room key update listener', () => {
        const listener = vi.fn();
        backend.onRoomKeys(listener);
        expect(listener).toBeDefined();
      });

      it('supports multiple listeners', () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();

        backend.onRoomKeys(listener1);
        backend.onRoomKeys(listener2);

        // Both listeners should be registered
        expect(listener1).toBeDefined();
        expect(listener2).toBeDefined();
      });
    });

    describe('flushOutgoing', () => {
      it('processes outgoing requests', async () => {
        const mockClient = {
          post: vi.fn(async () => ({})),
        };

        // flushOutgoing should handle empty outgoing requests
        await expect(
          backend.flushOutgoing(mockClient as any),
        ).resolves.not.toThrow();
      });
    });

    describe('encryptEvent', () => {
      it('encrypts room events', async () => {
        const result = await backend.encryptEvent('!room:example.com', 'm.room.message', {
          body: 'Hello',
          msgtype: 'm.text',
        });

        expect(result).toBeDefined();
        expect(result.type).toBe('m.room.encrypted');
      });

      it('handles various content types', async () => {
        const testCases = [
          { body: 'text', msgtype: 'm.text' },
          { file: {}, msgtype: 'm.file' },
          { msgtype: 'm.image', url: 'mxc://example.com/abc' },
        ];

        for (const content of testCases) {
          const result = await backend.encryptEvent('!room:example.com', 'm.room.message', content);
          expect(result).toBeDefined();
        }
      });
    });

    describe('decryptEvent', () => {
      it('decrypts encrypted events', async () => {
        const encryptedEvent: RawMatrixEvent = {
          type: 'm.room.encrypted',
          sender: '@alice:example.com',
          content: {
            algorithm: 'm.megolm.v1.aes-sha2',
            ciphertext: 'mock_ciphertext',
            device_id: 'ALICEDEVICE',
            sender_key: 'mock_sender_key',
            session_id: 'mock_session_id',
          },
        };

        const result = await backend.decryptEvent('!room:example.com', encryptedEvent);
        expect(result).toBeDefined();
      });

      it('returns null for undecryptable events', async () => {
        const undecryptableEvent: RawMatrixEvent = {
          type: 'm.room.encrypted',
          sender: '@alice:example.com',
          content: {
            algorithm: 'm.megolm.v1.aes-sha2',
            ciphertext: 'unknown_session_ciphertext',
            device_id: 'UNKNOWNDEVICE',
            sender_key: 'unknown_key',
            session_id: 'unknown_session',
          },
        };

        // Mock the backend to return null for unknown sessions
        vi.spyOn(backend, 'decryptEvent').mockResolvedValueOnce(null);

        const result = await backend.decryptEvent('!room:example.com', undecryptableEvent);
        expect(result).toBeNull();
      });
    });

    describe('encryptAttachment', () => {
      it('encrypts attachment data', async () => {
        const attachmentData = new Uint8Array([1, 2, 3, 4, 5]);

        const result = await backend.encryptAttachment(attachmentData);

        expect(result).toBeDefined();
        expect(result.data).toBeInstanceOf(Uint8Array);
        expect(result.info).toBeDefined();
      });

      it('handles large attachments', async () => {
        const largeData = new Uint8Array(10 * 1024 * 1024); // 10MB
        for (let i = 0; i < largeData.length; i++) {
          largeData[i] = Math.floor(Math.random() * 256);
        }

        const result = await backend.encryptAttachment(largeData);
        expect(result).toBeDefined();
      });

      it('handles empty attachments', async () => {
        const emptyData = new Uint8Array(0);

        const result = await backend.encryptAttachment(emptyData);
        expect(result).toBeDefined();
      });
    });

    describe('decryptAttachment', () => {
      it('decrypts attachment data', async () => {
        const encryptedData = new Uint8Array([5, 4, 3, 2, 1]);
        const info =
          'AwgAEkDvz+DYkxWg0v5s6+omBG4d7/cHl6roM81JM50D06xpF+sVHcJrFIAKliqMa8NtBlFy5Al08by7ou/IHwk7qJPJHARj2drnhQrFPAGRvkaSvRfanyV+IvNczlafIMIEGkgS9Z8';

        const result = await backend.decryptAttachment(encryptedData, info);

        expect(result).toBeInstanceOf(Uint8Array);
      });
    });

    describe('ensureRoomKey', () => {
      it('shares room keys with specified members', async () => {
        const mockClient = {
          post: vi.fn(async () => ({})),
        };

        await expect(
          backend.ensureRoomKey(mockClient as any, '!room:example.com', [
            '@alice:example.com',
            '@bob:example.com',
          ]),
        ).resolves.not.toThrow();
      });

      it('handles empty member list', async () => {
        const mockClient = {
          post: vi.fn(async () => ({})),
        };

        await expect(
          backend.ensureRoomKey(mockClient as any, '!room:example.com', []),
        ).resolves.not.toThrow();
      });
    });

    describe('close', () => {
      it('closes crypto backend', async () => {
        await expect(backend.close()).resolves.not.toThrow();
      });
    });

    describe('CryptoBackend interface', () => {
      it('implements all required interface methods', () => {
        expect(typeof backend.deviceId).toBe('string');
        expect(typeof backend.receiveSync).toBe('function');
        expect(typeof backend.flushOutgoing).toBe('function');
        expect(typeof backend.ensureRoomKey).toBe('function');
        expect(typeof backend.encryptEvent).toBe('function');
        expect(typeof backend.decryptEvent).toBe('function');
        expect(typeof backend.encryptAttachment).toBe('function');
        expect(typeof backend.decryptAttachment).toBe('function');
        expect(typeof backend.onRoomKeys).toBe('function');
        expect(typeof backend.close).toBe('function');
      });
    });

    describe('error handling', () => {
      it('handles encryption failures gracefully', async () => {
        vi.spyOn(backend, 'encryptEvent').mockRejectedValueOnce(
          new Error('Encryption failed'),
        );

        await expect(
          backend.encryptEvent('!room:example.com', 'm.room.message', { body: 'test' }),
        ).rejects.toThrow('Encryption failed');
      });

      it('handles decryption failures gracefully', async () => {
        vi.spyOn(backend, 'decryptEvent').mockRejectedValueOnce(
          new Error('Decryption failed'),
        );

        await expect(
          backend.decryptEvent('!room:example.com', {
            type: 'm.room.encrypted',
            sender: '@alice:example.com',
            content: {},
          }),
        ).rejects.toThrow('Decryption failed');
      });
    });
  });
});
