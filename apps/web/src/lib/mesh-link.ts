import type { ContactRecord } from '@indiafoss/storage';
import type { AccountClaimTrust } from '@indiafoss/model/contracts';

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

/** Never checked, or checked long enough ago, or last time it could not be decided. */
export function meshLinkStale(contact: ContactRecord, now: number): boolean {
  const check = contact.meshLink;
  if (!check) return true;
  if (check.state === 'unverifiable') return true;
  // `outdated` means one of the identities was a shape this build did not
  // recognise (#160). A later build may well recognise it, so this is a
  // question to ask again rather than a verdict to keep.
  if (check.state === 'outdated') return true;
  return now - check.checkedAt > MESH_LINK_TTL_MS;
}

/** The conclusion a profile observation supports, and whether it contradicts the card. */
export interface AccountClaimConclusion {
  trust: AccountClaimTrust;
  /**
   * The homeserver names a *different* mesh identity than the card. The
   * strongest negative statement the app makes about another person, so it
   * is carried separately rather than flattened into `claimed`.
   */
  contradiction: boolean;
}

/**
 * Map what the app holds about an account claim to the trust it may carry
 * (C-10, #188). Two independent observations feed it: the public-profile
 * read (the homeserver's word, worth at most `profile-matched`) and this
 * device's verification of a signed binding (`docs/identity-binding.md`).
 *
 * | Binding check          | Profile observation             | trust             | contradiction |
 * | ---------------------- | ------------------------------- | ----------------- | ------------- |
 * | `revoked`              | any                             | `revoked`         | as profile    |
 * | `valid`                | any                             | `binding-valid`   | as profile    |
 * | anything else, or none | none, `unverifiable`, `outdated`, `unlinked` | `claimed` | false |
 * | anything else, or none | `profile-matched`               | `profile-matched` | false         |
 * | anything else, or none | `mismatch`                      | `claimed`         | true          |
 *
 * `binding-valid` is where a valid binding stops here: both signatures
 * check, but the Matrix key was fetched, not verified by a person. The
 * `verified` row needs Chat's user verification of that key and has no
 * producer in this repository. A profile `mismatch` is still reported beside
 * a valid binding — the two disagree, and the attendee should see that.
 */
export function accountTrustOf(
  check: ContactRecord['meshLink'] | undefined,
  binding?: ContactRecord['binding'],
): AccountClaimConclusion {
  const contradiction = check?.state === 'mismatch';
  if (binding?.check?.state === 'revoked') return { trust: 'revoked', contradiction };
  if (binding?.check?.state === 'valid') return { trust: 'binding-valid', contradiction };
  switch (check?.state) {
    case 'profile-matched':
      return { trust: 'profile-matched', contradiction: false };
    case 'mismatch':
      return { trust: 'claimed', contradiction: true };
    case 'unlinked':
    case 'outdated':
    case 'unverifiable':
    default:
      return { trust: 'claimed', contradiction: false };
  }
}
