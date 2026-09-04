import { describe, expect, it, vi } from 'vitest';
import {
  FOSSUNITED_PROFILE_URL_FIELD,
  FOSSUNITED_USERNAME_FIELD,
  readExtendedProfile,
  supportsExtendedProfiles,
  writeExtendedProfile,
} from './profile-fields.js';
import type { MatrixClient } from './http.js';
import { MatrixError } from './http.js';

describe('profile-fields', () => {
  describe('supportsExtendedProfiles', () => {
    it('returns true when m.profile_fields capability is enabled', async () => {
      const mockClient: MatrixClient = {
        rawRequest: vi.fn().mockResolvedValue({
          capabilities: {
            'm.profile_fields': { enabled: true },
          },
        }),
      } as unknown as MatrixClient;

      const result = await supportsExtendedProfiles(mockClient);
      expect(result).toBe(true);
      expect(mockClient.rawRequest).toHaveBeenCalledWith('GET', '/_matrix/client/v3/capabilities');
    });

    it('returns true when uk.tcpip.msc4133.profile_fields capability is enabled', async () => {
      const mockClient: MatrixClient = {
        rawRequest: vi.fn().mockResolvedValue({
          capabilities: {
            'uk.tcpip.msc4133.profile_fields': { enabled: true },
          },
        }),
      } as unknown as MatrixClient;

      const result = await supportsExtendedProfiles(mockClient);
      expect(result).toBe(true);
    });

    it('returns false when capability is explicitly disabled', async () => {
      const mockClient: MatrixClient = {
        rawRequest: vi.fn().mockResolvedValue({
          capabilities: {
            'm.profile_fields': { enabled: false },
          },
        }),
      } as unknown as MatrixClient;

      const result = await supportsExtendedProfiles(mockClient);
      expect(result).toBe(false);
    });

    it('returns false when request throws an error', async () => {
      const mockClient: MatrixClient = {
        rawRequest: vi.fn().mockRejectedValue(new Error('Network error')),
      } as unknown as MatrixClient;

      const result = await supportsExtendedProfiles(mockClient);
      expect(result).toBe(false);
    });
  });

  describe('readExtendedProfile', () => {
    it('reads extended profile fields when present', async () => {
      const mockClient: MatrixClient = {
        rawRequest: vi.fn().mockResolvedValue({
          [FOSSUNITED_PROFILE_URL_FIELD]: 'https://fossunited.org/u/alice',
          [FOSSUNITED_USERNAME_FIELD]: 'alice',
        }),
      } as unknown as MatrixClient;

      const profile = await readExtendedProfile(mockClient, '@alice:example.org');
      expect(profile).toEqual({
        profileUrl: 'https://fossunited.org/u/alice',
        username: 'alice',
      });
      expect(mockClient.rawRequest).toHaveBeenCalledWith(
        'GET',
        '/_matrix/client/v3/profile/%40alice%3Aexample.org',
      );
    });

    it('returns empty object when fields are absent or request fails', async () => {
      const mockClient: MatrixClient = {
        rawRequest: vi.fn().mockRejectedValue(new Error('Not found')),
      } as unknown as MatrixClient;

      const profile = await readExtendedProfile(mockClient, '@alice:example.org');
      expect(profile).toEqual({});
    });
  });

  describe('writeExtendedProfile', () => {
    it('writes profile fields via PUT when values are non-empty', async () => {
      const rawRequest = vi.fn().mockResolvedValue({});
      const mockClient: MatrixClient = { rawRequest } as unknown as MatrixClient;

      await writeExtendedProfile(mockClient, '@alice:example.org', {
        profileUrl: 'https://fossunited.org/u/alice',
        username: 'alice',
      });

      expect(rawRequest).toHaveBeenCalledWith(
        'PUT',
        '/_matrix/client/v3/profile/%40alice%3Aexample.org/org.fossunited.profile_url',
        { [FOSSUNITED_PROFILE_URL_FIELD]: 'https://fossunited.org/u/alice' },
      );
      expect(rawRequest).toHaveBeenCalledWith(
        'PUT',
        '/_matrix/client/v3/profile/%40alice%3Aexample.org/org.fossunited.username',
        { [FOSSUNITED_USERNAME_FIELD]: 'alice' },
      );
    });

    it('deletes profile fields via DELETE when values are undefined or empty', async () => {
      const rawRequest = vi.fn().mockResolvedValue({});
      const mockClient: MatrixClient = { rawRequest } as unknown as MatrixClient;

      await writeExtendedProfile(mockClient, '@alice:example.org', {
        profileUrl: '',
        username: undefined,
      });

      expect(rawRequest).toHaveBeenCalledWith(
        'DELETE',
        '/_matrix/client/v3/profile/%40alice%3Aexample.org/org.fossunited.profile_url',
      );
      expect(rawRequest).toHaveBeenCalledWith(
        'DELETE',
        '/_matrix/client/v3/profile/%40alice%3Aexample.org/org.fossunited.username',
      );
    });

    it('ignores 404 MatrixError on DELETE', async () => {
      const rawRequest = vi.fn().mockRejectedValue(new MatrixError('Not found', 404, 'M_NOT_FOUND'));
      const mockClient: MatrixClient = { rawRequest } as unknown as MatrixClient;

      await expect(
        writeExtendedProfile(mockClient, '@alice:example.org', { username: undefined }),
      ).resolves.not.toThrow();
    });

    it('rethrows non-404 MatrixError on DELETE', async () => {
      const rawRequest = vi.fn().mockRejectedValue(new MatrixError('Server error', 500, 'M_UNKNOWN'));
      const mockClient: MatrixClient = { rawRequest } as unknown as MatrixClient;

      await expect(
        writeExtendedProfile(mockClient, '@alice:example.org', { username: undefined }),
      ).rejects.toThrow('Server error');
    });
  });
});
