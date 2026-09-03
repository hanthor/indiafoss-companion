import type { ContactRecord } from '@indiafoss/storage';

/** Re-check a link after this long; a peer may have published since. */
export const MESH_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** The mesh identity a mesh user id belongs to (`@n:<node>` → `<node>`). */
export function meshServerOf(userId: string): string | null {
  const match = userId.match(/^@[^:]+:(.+)$/);
  return match?.[1]?.toLowerCase() ?? null;
}

/** The saved contact whose card carries the mesh identity behind a mesh user id. */
export function contactForMeshUser(
  contacts: readonly ContactRecord[],
  userId: string,
): ContactRecord | undefined {
  const server = meshServerOf(userId);
  if (!server) return undefined;
  return contacts.find((c) => c.neutrinoServerName?.toLowerCase() === server);
}

/** A card claims a Matrix id for a mesh identity: the pair the check needs. */
export function claimsMeshLink(
  contact: ContactRecord,
): contact is ContactRecord & { matrixId: string; neutrinoServerName: string } {
  return !!contact.matrixId?.trim() && !!contact.neutrinoServerName?.trim();
}

/** Never checked, or checked long enough ago, or last time the server was unreachable. */
export function meshLinkStale(contact: ContactRecord, now: number): boolean {
  const check = contact.meshLink;
  if (!check) return true;
  if (check.state === 'unverifiable') return true;
  return now - check.checkedAt > MESH_LINK_TTL_MS;
}
