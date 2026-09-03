import { MatrixClient, MatrixError, type FetchLike } from './http.js';

/**
 * Bring your own Matrix ID (issue #111).
 *
 * A mesh identity is the phone's Neutrino node (its 64-hex server name); the
 * mesh can check that offline, and nothing else. An attendee who wants peers
 * to know which *internet* Matrix account is theirs publishes the mesh
 * identity on that account's profile (MSC4133 extended profile field). A peer
 * who has the attendee's card, which carries both the claimed Matrix id and
 * the mesh identity, verifies the claim the next time they are online by
 * reading the profile from the account's own homeserver: no account of the
 * peer's own is needed, and nothing about the mesh conversation leaves the
 * mesh. Offline, the claim shows as just that: claimed.
 */
export const MESH_IDENTITY_FIELD = 'in.indiafoss.mesh';

export type MeshLinkState =
  /** The account's profile names this mesh identity. */
  | 'verified'
  /** The account's profile names a different mesh identity: not this phone. */
  | 'mismatch'
  /** The account's profile carries no mesh identity: a claim, nothing more. */
  | 'unlinked'
  /** The homeserver could not be reached or would not answer without a login. */
  | 'unverifiable';

export interface MeshLinkCheck {
  state: MeshLinkState;
  checkedAt: number;
}

const CS = '/_matrix/client/v3';

function serverNameOf(matrixId: string): string | null {
  const match = matrixId.match(/^@[^:]+:(.+)$/);
  return match?.[1] ?? null;
}

/**
 * Publish this phone's mesh identity on the signed-in account's profile so
 * peers can verify the link, or clear it with `null`. Throws the homeserver's
 * error when it refuses (a server without MSC4133 answers 404 or 405).
 */
export async function publishMeshLink(
  client: MatrixClient,
  userId: string,
  meshServerName: string | null,
): Promise<void> {
  const path = `${CS}/profile/${encodeURIComponent(userId)}/${encodeURIComponent(MESH_IDENTITY_FIELD)}`;
  if (meshServerName?.trim()) {
    await client.rawRequest('PUT', path, {
      [MESH_IDENTITY_FIELD]: meshServerName.trim().toLowerCase(),
    });
    return;
  }
  try {
    await client.rawRequest('DELETE', path);
  } catch (error) {
    if (!(error instanceof MatrixError && error.status === 404)) throw error;
  }
}

/**
 * Check a peer's claim that `matrixId` is theirs by reading that account's
 * public profile from its own homeserver (discovered via `.well-known`).
 * Never throws: every failure is a state the UI can show.
 */
export async function verifyMeshLink(
  claim: { matrixId: string; meshServerName: string },
  fetchFn: FetchLike = (input, init) => globalThis.fetch(input, init),
  now: () => number = () => Date.now(),
): Promise<MeshLinkCheck> {
  const server = serverNameOf(claim.matrixId.trim());
  if (!server) return { state: 'unverifiable', checkedAt: now() };
  try {
    const base = await MatrixClient.discover(server, fetchFn);
    const res = await fetchFn(`${base}${CS}/profile/${encodeURIComponent(claim.matrixId.trim())}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { state: 'unverifiable', checkedAt: now() };
    const profile = (await res.json()) as Record<string, unknown>;
    const published = profile[MESH_IDENTITY_FIELD];
    if (typeof published !== 'string' || !published.trim()) {
      return { state: 'unlinked', checkedAt: now() };
    }
    const same = published.trim().toLowerCase() === claim.meshServerName.trim().toLowerCase();
    return { state: same ? 'verified' : 'mismatch', checkedAt: now() };
  } catch {
    return { state: 'unverifiable', checkedAt: now() };
  }
}

/** Short label for a check, for badges and lists. */
export function meshLinkLabel(check: MeshLinkCheck | undefined): string {
  switch (check?.state) {
    case 'verified':
      return 'Verified';
    case 'mismatch':
      return 'Does not match';
    case 'unlinked':
      return 'Claimed';
    case 'unverifiable':
      return 'Not checked yet';
    default:
      return 'Claimed';
  }
}
