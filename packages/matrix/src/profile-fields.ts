import { MatrixClient, MatrixError } from './http.js';

/**
 * MSC4133 extended profile fields. The association between a FOSS United
 * profile and a Matrix account is published only when the attendee asks for
 * it and the homeserver advertises the capability; otherwise the client falls
 * back silently to the standard `displayname` / `avatar_url` profile.
 */
export const FOSSUNITED_PROFILE_URL_FIELD = 'org.fossunited.profile_url';
export const FOSSUNITED_USERNAME_FIELD = 'org.fossunited.username';

export interface ExtendedProfileFields {
  profileUrl?: string;
  username?: string;
}

const CS = '/_matrix/client/v3';

export async function supportsExtendedProfiles(client: MatrixClient): Promise<boolean> {
  try {
    const res = await fetchJson<{ capabilities?: Record<string, { enabled?: boolean }> }>(
      client,
      `${CS}/capabilities`,
    );
    const capability =
      res.capabilities?.['m.profile_fields'] ??
      res.capabilities?.['uk.tcpip.msc4133.profile_fields'];
    // Absent capability means "supported" per MSC4133 unless the server says enabled:false.
    return capability ? capability.enabled !== false : false;
  } catch {
    return false;
  }
}

export async function readExtendedProfile(
  client: MatrixClient,
  userId: string,
): Promise<ExtendedProfileFields> {
  try {
    const res = await fetchJson<Record<string, unknown>>(
      client,
      `${CS}/profile/${encodeURIComponent(userId)}`,
    );
    return {
      profileUrl:
        typeof res[FOSSUNITED_PROFILE_URL_FIELD] === 'string'
          ? res[FOSSUNITED_PROFILE_URL_FIELD]
          : undefined,
      username:
        typeof res[FOSSUNITED_USERNAME_FIELD] === 'string'
          ? res[FOSSUNITED_USERNAME_FIELD]
          : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Publish (or clear, with `undefined`) the FOSS United association. Throws a
 * {@link MatrixError} when the homeserver refuses; callers show it as-is.
 */
export async function writeExtendedProfile(
  client: MatrixClient,
  userId: string,
  fields: ExtendedProfileFields,
): Promise<void> {
  const entries: [string, string | undefined][] = [
    [FOSSUNITED_PROFILE_URL_FIELD, fields.profileUrl],
    [FOSSUNITED_USERNAME_FIELD, fields.username],
  ];
  for (const [key, value] of entries) {
    const path = `${CS}/profile/${encodeURIComponent(userId)}/${encodeURIComponent(key)}`;
    if (value?.trim()) {
      await client.rawRequest('PUT', path, { [key]: value.trim() });
    } else {
      try {
        await client.rawRequest('DELETE', path);
      } catch (error) {
        if (!(error instanceof MatrixError && error.status === 404)) throw error;
      }
    }
  }
}

async function fetchJson<T>(client: MatrixClient, path: string): Promise<T> {
  return client.rawRequest<T>('GET', path);
}
