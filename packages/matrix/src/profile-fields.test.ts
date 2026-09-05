/**
 * MSC4133 extended profile fields.
 *
 * The association between a FOSS United profile and a Matrix account is
 * published only when the attendee asks and the homeserver supports it. Every
 * branch here decides whether someone's identity is written to a server, so
 * "it silently did nothing" and "it silently wrote it anyway" are both
 * failures worth a test.
 */
import { describe, expect, it } from 'vitest';
import { MatrixClient, MatrixError } from './http.js';
import {
  FOSSUNITED_PROFILE_URL_FIELD,
  FOSSUNITED_USERNAME_FIELD,
  readExtendedProfile,
  supportsExtendedProfiles,
  writeExtendedProfile,
} from './profile-fields.js';

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** A client whose every request is answered by `reply`, recording what it saw. */
function client(reply: (method: string, path: string) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchFn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const path = url.replace('https://hs.test', '');
    calls.push({
      method,
      path,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    const { status, body } = reply(method, path);
    return Promise.resolve(
      new Response(body === undefined ? '' : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { c: new MatrixClient('https://hs.test', 'tok', fetchFn), calls };
}

describe('supportsExtendedProfiles', () => {
  it('is true when the server advertises the capability, under either name', async () => {
    for (const key of ['m.profile_fields', 'uk.tcpip.msc4133.profile_fields']) {
      const { c } = client(() => ({ status: 200, body: { capabilities: { [key]: {} } } }));
      await expect(supportsExtendedProfiles(c), key).resolves.toBe(true);
    }
  });

  it('is false when the server says the capability is disabled', async () => {
    const { c } = client(() => ({
      status: 200,
      body: { capabilities: { 'm.profile_fields': { enabled: false } } },
    }));
    await expect(supportsExtendedProfiles(c)).resolves.toBe(false);
  });

  it('is false when the capability is absent entirely', async () => {
    // MSC4133 reads an absent capability as "supported", but this client will
    // not write someone's identity to a server on that assumption: a server
    // that never mentions the capability gets nothing published to it.
    const { c } = client(() => ({ status: 200, body: { capabilities: {} } }));
    await expect(supportsExtendedProfiles(c)).resolves.toBe(false);
  });

  it('is false, not a throw, when the server errors', async () => {
    // Capability discovery runs on the settings screen; a 500 here must not
    // become an unhandled rejection in front of the user.
    const { c } = client(() => ({ status: 500, body: { errcode: 'M_UNKNOWN' } }));
    await expect(supportsExtendedProfiles(c)).resolves.toBe(false);
  });
});

describe('readExtendedProfile', () => {
  it('reads both fields when present', async () => {
    const { c } = client(() => ({
      status: 200,
      body: {
        displayname: 'Ada',
        [FOSSUNITED_PROFILE_URL_FIELD]: 'https://fossunited.org/u/ada',
        [FOSSUNITED_USERNAME_FIELD]: 'ada',
      },
    }));
    await expect(readExtendedProfile(c, '@ada:hs.test')).resolves.toEqual({
      profileUrl: 'https://fossunited.org/u/ada',
      username: 'ada',
    });
  });

  it('ignores fields that are present but not strings', async () => {
    // The profile is attacker-controlled data from another homeserver, so a
    // number or an object where a URL belongs must not reach the UI as one.
    const { c } = client(() => ({
      status: 200,
      body: { [FOSSUNITED_PROFILE_URL_FIELD]: 42, [FOSSUNITED_USERNAME_FIELD]: { a: 1 } },
    }));
    await expect(readExtendedProfile(c, '@ada:hs.test')).resolves.toEqual({
      profileUrl: undefined,
      username: undefined,
    });
  });

  it('is empty, not a throw, for a profile that cannot be read', async () => {
    const { c } = client(() => ({ status: 404, body: { errcode: 'M_NOT_FOUND' } }));
    await expect(readExtendedProfile(c, '@nobody:hs.test')).resolves.toEqual({});
  });

  it('escapes the user id into the path', async () => {
    const { c, calls } = client(() => ({ status: 200, body: {} }));
    await readExtendedProfile(c, '@ada:hs.test');
    expect(calls[0]?.path).toBe('/_matrix/client/v3/profile/%40ada%3Ahs.test');
  });
});

describe('writeExtendedProfile', () => {
  it('PUTs each field that has a value, trimmed', async () => {
    const { c, calls } = client(() => ({ status: 200, body: {} }));
    await writeExtendedProfile(c, '@ada:hs.test', {
      profileUrl: '  https://fossunited.org/u/ada  ',
      username: 'ada',
    });
    expect(calls.map((call) => call.method)).toEqual(['PUT', 'PUT']);
    expect(calls[0]?.body).toEqual({
      [FOSSUNITED_PROFILE_URL_FIELD]: 'https://fossunited.org/u/ada',
    });
    expect(calls[1]?.body).toEqual({ [FOSSUNITED_USERNAME_FIELD]: 'ada' });
  });

  it('DELETEs a field that is cleared, including one that is only whitespace', async () => {
    // Clearing has to be a delete rather than a write of "", or the association
    // stays published as an empty string and the attendee believes it is gone.
    const { c, calls } = client(() => ({ status: 200, body: {} }));
    await writeExtendedProfile(c, '@ada:hs.test', { profileUrl: undefined, username: '   ' });
    expect(calls.map((call) => call.method)).toEqual(['DELETE', 'DELETE']);
  });

  it('treats a 404 on delete as already gone', async () => {
    // Deleting a field the server never had is the normal case for a first
    // clear, and must not be reported to the attendee as a failure.
    const { c } = client((method) =>
      method === 'DELETE'
        ? { status: 404, body: { errcode: 'M_NOT_FOUND' } }
        : { status: 200, body: {} },
    );
    await expect(writeExtendedProfile(c, '@ada:hs.test', {})).resolves.toBeUndefined();
  });

  it('surfaces any other refusal, so the attendee is told', async () => {
    const { c } = client(() => ({ status: 403, body: { errcode: 'M_FORBIDDEN', error: 'nope' } }));
    await expect(
      writeExtendedProfile(c, '@ada:hs.test', { username: 'ada' }),
    ).rejects.toBeInstanceOf(MatrixError);
  });
});
