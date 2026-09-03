import { describe, expect, it } from 'vitest';
import { MatrixClient, type FetchLike } from './http.js';
import {
  MESH_IDENTITY_FIELD,
  meshLinkLabel,
  publishMeshLink,
  verifyMeshLink,
} from './mesh-link.js';

const MESH = 'a'.repeat(64);

function homeserver(profile: Record<string, unknown> | null, status = 200) {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/.well-known/matrix/client')) {
      return new Response(
        JSON.stringify({ 'm.homeserver': { base_url: 'https://cs.example.org' } }),
        {
          status: 200,
        },
      );
    }
    if (url.includes('/_matrix/client/v3/profile/')) {
      if (profile === null) return new Response('{"errcode":"M_NOT_FOUND"}', { status: 404 });
      return new Response(JSON.stringify(profile), { status });
    }
    return new Response('', { status: 404 });
  };
  return { fetchFn, calls };
}

describe('verifyMeshLink', () => {
  it('verifies when the account profile names this mesh identity, via well-known discovery', async () => {
    const hs = homeserver({ displayname: 'Alice', [MESH_IDENTITY_FIELD]: MESH.toUpperCase() });
    const check = await verifyMeshLink(
      { matrixId: '@alice:example.org', meshServerName: MESH },
      hs.fetchFn,
      () => 5,
    );
    expect(check).toEqual({ state: 'verified', checkedAt: 5 });
    expect(hs.calls[0]).toBe('https://example.org/.well-known/matrix/client');
    expect(hs.calls[1]).toBe(
      'https://cs.example.org/_matrix/client/v3/profile/%40alice%3Aexample.org',
    );
  });

  it('flags a profile that names a different mesh identity', async () => {
    const hs = homeserver({ [MESH_IDENTITY_FIELD]: 'b'.repeat(64) });
    const check = await verifyMeshLink(
      { matrixId: '@alice:example.org', meshServerName: MESH },
      hs.fetchFn,
    );
    expect(check.state).toBe('mismatch');
  });

  it('is only a claim when the profile carries no mesh identity', async () => {
    const hs = homeserver({ displayname: 'Alice' });
    expect(
      (await verifyMeshLink({ matrixId: '@alice:example.org', meshServerName: MESH }, hs.fetchFn))
        .state,
    ).toBe('unlinked');
  });

  it('never throws: unreachable, refused, or malformed ids are unverifiable', async () => {
    const down: FetchLike = async () => {
      throw new TypeError('offline');
    };
    expect(
      (await verifyMeshLink({ matrixId: '@alice:example.org', meshServerName: MESH }, down)).state,
    ).toBe('unverifiable');
    const refused = homeserver(null);
    expect(
      (
        await verifyMeshLink(
          { matrixId: '@alice:example.org', meshServerName: MESH },
          refused.fetchFn,
        )
      ).state,
    ).toBe('unverifiable');
    expect((await verifyMeshLink({ matrixId: 'alice', meshServerName: MESH }, down)).state).toBe(
      'unverifiable',
    );
  });

  it('labels every state', () => {
    expect(meshLinkLabel({ state: 'verified', checkedAt: 0 })).toBe('Verified');
    expect(meshLinkLabel({ state: 'mismatch', checkedAt: 0 })).toBe('Does not match');
    expect(meshLinkLabel({ state: 'unlinked', checkedAt: 0 })).toBe('Claimed');
    expect(meshLinkLabel(undefined)).toBe('Claimed');
  });
});

describe('publishMeshLink', () => {
  it('writes the field on the profile and clears it with null', async () => {
    const requests: { method?: string; url: string; body?: string }[] = [];
    const fetchFn: FetchLike = async (input, init) => {
      requests.push({
        method: init?.method,
        url: String(input),
        body: init?.body as string | undefined,
      });
      return new Response('{}', { status: 200 });
    };
    const client = new MatrixClient('https://hs.example.org', null, fetchFn);
    await publishMeshLink(client, '@alice:example.org', MESH.toUpperCase());
    await publishMeshLink(client, '@alice:example.org', null);
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      url: 'https://hs.example.org/_matrix/client/v3/profile/%40alice%3Aexample.org/in.indiafoss.mesh',
      body: JSON.stringify({ [MESH_IDENTITY_FIELD]: MESH }),
    });
    expect(requests[1]).toMatchObject({ method: 'DELETE' });
  });
});
