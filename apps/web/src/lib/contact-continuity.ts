import type { ContactRecord } from '@indiafoss/storage';

export type ContinuityOutcome = 'new' | 'updated' | 'key-changed';

export interface ContinuityResult {
  contact: ContactRecord;
  outcome: ContinuityOutcome;
  /** The contact that already carried this identity (for 'updated' and 'key-changed'). */
  previous?: ContactRecord;
}

const norm = (value: string | undefined): string => value?.trim().toLowerCase() ?? '';

/** Same person by a stable identifier other than the handshake key. */
function sameIdentity(a: ContactRecord, b: ContactRecord): boolean {
  if (a.neutrinoServerName && norm(a.neutrinoServerName) === norm(b.neutrinoServerName))
    return true;
  if (a.matrixId && norm(a.matrixId) === norm(b.matrixId)) return true;
  if (a.fossUnitedProfileUrl && norm(a.fossUnitedProfileUrl) === norm(b.fossUnitedProfileUrl)) {
    return true;
  }
  return false;
}

/**
 * Decide what saving a freshly scanned card means against the existing contact
 * list (issue #31, key continuity):
 *
 * - same handshake fingerprint as a saved contact: the saved contact is updated
 *   in place (new fields win, meeting context of the first scan is kept) and the
 *   meeting count goes up;
 * - a saved contact with the same name or identifiers but a *different*
 *   fingerprint: the old record is kept untouched and the new one is saved
 *   flagged `keyChanged`, so a swapped key is visible rather than silently
 *   replacing the trusted one;
 * - otherwise it is a new contact.
 */
export function reconcileContact(
  draft: ContactRecord,
  existing: ContactRecord[],
): ContinuityResult {
  const now = draft.savedAt;
  const byKey = draft.fingerprint
    ? existing.find((c) => c.fingerprint && c.fingerprint === draft.fingerprint)
    : undefined;
  if (byKey) {
    return {
      outcome: 'updated',
      previous: byKey,
      contact: {
        ...byKey,
        ...draft,
        id: byKey.id,
        savedAt: byKey.savedAt,
        verified: byKey.verified,
        metActivityId: byKey.metActivityId ?? draft.metActivityId,
        metLocationId: byKey.metLocationId ?? draft.metLocationId,
        metCount: (byKey.metCount ?? 1) + 1,
        lastMetAt: now,
        keyChanged: false,
        previousFingerprint: undefined,
      },
    };
  }

  const byIdentity = existing.find((c) => sameIdentity(c, draft));
  const byName =
    !byIdentity && norm(draft.fullName) && draft.fullName !== 'Unnamed contact'
      ? existing.find((c) => norm(c.fullName) === norm(draft.fullName))
      : undefined;
  const match = byIdentity ?? byName;
  if (!match) return { outcome: 'new', contact: { ...draft, metCount: 1, lastMetAt: now } };

  if (match.fingerprint && draft.fingerprint && match.fingerprint !== draft.fingerprint) {
    return {
      outcome: 'key-changed',
      previous: match,
      contact: {
        ...draft,
        metCount: 1,
        lastMetAt: now,
        keyChanged: true,
        previousFingerprint: match.fingerprint,
      },
    };
  }

  // Same person, no conflicting key (one side unsigned): update in place.
  return {
    outcome: 'updated',
    previous: match,
    contact: {
      ...match,
      ...draft,
      id: match.id,
      savedAt: match.savedAt,
      verified: match.verified,
      fingerprint: draft.fingerprint ?? match.fingerprint,
      publicKey: draft.publicKey ?? match.publicKey,
      signature: draft.signature ?? match.signature,
      metActivityId: match.metActivityId ?? draft.metActivityId,
      metLocationId: match.metLocationId ?? draft.metLocationId,
      metCount: (match.metCount ?? 1) + 1,
      lastMetAt: now,
    },
  };
}
