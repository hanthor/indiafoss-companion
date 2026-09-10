import type { BindingCheck, ContactRecord } from '@indiafoss/storage';
import type { BindingResult, MatrixKeyMaterial } from '@indiafoss/model';
import { classifyMeshIdentity, parsePublicKey, verifyBinding } from '@indiafoss/model';

/**
 * The binding line on a contact screen (#188, `docs/identity-binding.md`):
 * this device's verification of a signed mesh↔Matrix binding the card
 * carried, folded to what an attendee needs to tell apart.
 */
export type BindingTrust =
  /** The card carried no binding. The common case, and not a defect. */
  | 'none'
  /** Both signatures check against keys this device holds. Not "verified": see `bindingLabel`. */
  | 'valid'
  | 'expired'
  | 'revoked'
  /** Tampered, signed by another key, or about other identities than the card's. */
  | 'invalid'
  /** A binding from a newer version of the protocol: kept, not judged. */
  | 'unreadable'
  /** Not checked yet, or the card half checks but no Matrix key is held. */
  | 'unchecked';

/** Re-check a binding after this long; keys and revocations move. */
export const BINDING_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

export function bindingTrustOf(binding: ContactRecord['binding'] | undefined): BindingTrust {
  if (!binding) return 'none';
  switch (binding.check?.state) {
    case 'valid':
      return 'valid';
    case 'expired':
    case 'not-yet-valid':
      return 'expired';
    case 'revoked':
      return 'revoked';
    case 'invalid-signature':
    case 'mismatch':
    case 'wrong-domain':
    case 'malformed':
      return 'invalid';
    case 'unknown-version':
      return 'unreadable';
    case 'unverifiable':
    default:
      return 'unchecked';
  }
}

/**
 * Where a verifier gets the Matrix public key named by a binding. The keys
 * must come from somewhere other than the card — a `/keys/query` the app
 * made, a cache of one, or a key Chat handed over after the attendee
 * verified it. **Nothing in this repository implements a source yet**; the
 * only one is {@link noMatrixKeys}, which is why every real binding today
 * reads "not checked yet" rather than something stronger.
 */
export type MatrixKeySource = (
  matrixUserId: string,
  keyId: string,
) => Promise<MatrixKeyMaterial | null>;

/** The source this build ships: no keys. The card half is still checked. */
export const noMatrixKeys: MatrixKeySource = async () => null;

/** Ids the attendee has seen revoked. No source yet; the parameter exists so the check has the right shape. */
export type RevocationSource = () => Promise<readonly string[]>;
export const noRevocations: RevocationSource = async () => [];

/** Never checked, checked long ago, or last checked without a Matrix key: ask again. */
export function bindingCheckStale(contact: ContactRecord, now: number): boolean {
  const check = contact.binding?.check;
  if (!contact.binding) return false;
  if (!check) return true;
  if (check.state === 'unverifiable' || check.state === 'unknown-version') return true;
  return now - check.checkedAt > BINDING_CHECK_TTL_MS;
}

function checkOf(result: BindingResult, key: MatrixKeyMaterial | null, now: number): BindingCheck {
  const check: BindingCheck = { state: result.state, checkedAt: now };
  if (result.reason) check.reason = result.reason;
  if (result.statement) {
    check.matrixKeyId = result.statement.matrixKeyId;
    check.matrixKeyKind = result.statement.matrixKeyKind;
  }
  if (result.state === 'valid' && key) check.matrixKeyProvenance = key.provenance;
  return check;
}

/**
 * Verify the binding a saved contact carries, against the card key the card
 * itself was signed with and whatever Matrix key the source can supply.
 * Pure apart from the sources; the caller saves the returned record. A
 * contact with no binding, no card key, or no promoted identities gets a
 * check that says so rather than an exception.
 */
export async function checkContactBinding(
  contact: ContactRecord,
  keys: MatrixKeySource = noMatrixKeys,
  revocations: RevocationSource = noRevocations,
  now: () => number = () => Date.now(),
): Promise<ContactRecord> {
  if (!contact.binding) return contact;
  const at = now();
  const cardKey = parsePublicKey(contact.publicKey);
  const mesh = classifyMeshIdentity(contact.neutrinoServerName);
  const matrixUserId = contact.matrixId?.trim();
  if (!cardKey || contact.signature !== 'valid' || mesh?.kind !== 'node-id' || !matrixUserId) {
    // A binding is only about a card whose key this device checked and whose
    // identities it read. Without those there is nothing to bind it to.
    const check: BindingCheck = {
      state: 'unverifiable',
      reason: 'card key or identities not established',
      checkedAt: at,
    };
    return { ...contact, binding: { ...contact.binding, check } };
  }
  const signed = contact.binding.signed as { statement?: { matrixKeyId?: unknown } } | null;
  const keyId = signed?.statement?.matrixKeyId;
  const key = typeof keyId === 'string' ? await keys(matrixUserId, keyId) : null;
  const result = await verifyBinding({
    signed: contact.binding.signed,
    expected: { meshNodeId: mesh.nodeId, matrixUserId },
    cardKey,
    matrixKey: key,
    revokedIds: await revocations(),
    now: new Date(at),
  });
  return { ...contact, binding: { ...contact.binding, check: checkOf(result, key, at) } };
}
