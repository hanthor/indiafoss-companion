/**
 * IdentityBinding — the stored envelope for a statement that one person
 * controls both a mesh identity and a classic Matrix account.
 *
 * ## Envelope here, cryptography in `../binding.ts`
 *
 * This module is the *storage* shape (ADR 0009 §4): identifiers, scope,
 * validity and the slots a verifier's conclusion goes in. The signed
 * statement itself — canonical encoding, domain separation, both
 * signatures, and `verifyBinding()` against keys the verifier holds — is
 * `packages/model/src/binding.ts`, specified normatively in
 * `docs/identity-binding.md` (#188). `matrixDeviceId` here names the device
 * that presented the binding; the signing key is named inside the signed
 * statement (`matrixKeyId`, `matrixKeyKind`), and may be the account's
 * master key rather than a device key.
 *
 * {@link collectIdentityBindingIssues} still validates *structure only*. A
 * binding that passes is **not** verified, must not upgrade a contact to
 * `verified`, and must not enable automatic routing between transports. A
 * verified signature earns `binding-valid` (`contact-card.ts`); `verified`
 * additionally needs Chat's user verification of the Matrix key, and
 * {@link mayActOn} keeps refusing `continuation` and `routing` until a
 * verifier records `presentAsVerified` — which nothing in this repository
 * does. Automatic routing stays gated on #188's review and Chat #48.
 */
import { BINDING_DOMAIN } from '../binding.js';
import {
  collectSchemaVersionIssues,
  isHex64,
  isMatrixUserId,
  isRecord,
  optionalInstant,
  optionalString,
  requireInstant,
  requireLiteral,
  requireString,
} from './common.js';

export const IDENTITY_BINDING_SCHEMA_VERSION = 1;

/**
 * Domain separation string of the signed statement — the same value as
 * `BINDING_DOMAIN` in `../binding.ts`, re-exported here so the envelope and
 * the signature agree by construction. The version rides in the string; a
 * `v2` domain reads as `unknown-version`, not as tampering.
 */
export const IDENTITY_BINDING_DOMAIN = BINDING_DOMAIN;

/** What the binding is claimed to authorize. Narrow by default. */
export type BindingScope =
  /** Display the two identities as one person. No routing consequences. */
  | 'display'
  /** Additionally allow offering "continue in the other account" explicitly. */
  | 'continuation'
  /**
   * Additionally allow choosing a route without asking. Requires verified
   * device trust; gated on #188 and on the delivery contract in Chat #48.
   */
  | 'routing';

/**
 * How much the *verifier* trusts the signing Matrix device. Recorded
 * separately from the signature's validity, because a valid signature by an
 * untrusted device is not a verified identity.
 */
export type DeviceTrustSource =
  /** Keys could not be fetched — offline, or the server did not answer. */
  | 'unknown'
  /** Keys fetched, device is not cross-signed by its owner. */
  | 'unverified'
  /** Cross-signed by the owner's self-signing key. */
  | 'cross-signed'
  /** Verified by this user, in person or by emoji/QR comparison. */
  | 'user-verified';

export interface IdentityBinding {
  schemaVersion: number;
  /** Stable id for this binding, so a card can reference it and it can be revoked. */
  id: string;
  /** The mesh node id being bound: 64 lowercase hex (ADR 0008). */
  meshNodeId: string;
  /** The classic Matrix account being bound. */
  matrixUserId: string;
  /** The Matrix device that signed the statement, e.g. `ABCDEFGH`. */
  matrixDeviceId: string;
  /** Contact card key this binding was presented with, when applicable. */
  cardKey?: string;
  scope: BindingScope;
  /** When the statement was made, ISO-8601. */
  issuedAt: string;
  /** When it stops being acceptable, ISO-8601. Absent means no stated expiry. */
  expiresAt?: string;
  /**
   * Signature by the mesh key over the canonical encoding, base64url.
   * Format specified in #188.
   */
  meshSignature?: string;
  /**
   * Signature by the Matrix device key over the canonical encoding,
   * base64url. Format specified in #188.
   */
  deviceSignature?: string;
}

/**
 * What a verifier concluded. Stored alongside the binding, never inside it —
 * a device records its own conclusion; it does not accept one from the wire.
 */
export interface BindingVerification {
  bindingId: string;
  /** Both signatures present, well-formed and checked. Gated on #188. */
  signaturesValid: boolean;
  deviceTrust: DeviceTrustSource;
  /** When this conclusion was reached, ISO-8601. */
  checkedAt: string;
  /**
   * True only when a verifier may present this as a verified identity:
   * signatures valid **and** device trust is `user-verified`. Everything else
   * is pending, however plausible it looks.
   */
  presentAsVerified: boolean;
}

const SCOPES: readonly BindingScope[] = ['display', 'continuation', 'routing'];

/**
 * Structural validation for an untrusted binding.
 *
 * Structure only — see the module header. An empty issue list means the
 * envelope is well-formed, not that the binding is true.
 */
export function collectIdentityBindingIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['binding must be an object'];

  const issues: string[] = [
    ...collectSchemaVersionIssues(value, IDENTITY_BINDING_SCHEMA_VERSION, 'binding'),
    ...requireString(value, 'id'),
    ...requireString(value, 'matrixDeviceId'),
    ...requireLiteral(value, 'scope', SCOPES),
    ...requireInstant(value, 'issuedAt'),
    ...optionalInstant(value, 'expiresAt'),
    ...optionalString(value, 'cardKey'),
    ...optionalString(value, 'meshSignature'),
    ...optionalString(value, 'deviceSignature'),
  ];

  if (!isHex64(value.meshNodeId)) {
    issues.push(
      `meshNodeId must be 64 lowercase hex characters, got ${JSON.stringify(value.meshNodeId)}`,
    );
  }

  if (!isMatrixUserId(value.matrixUserId)) {
    issues.push(`matrixUserId must be a Matrix user id, got ${JSON.stringify(value.matrixUserId)}`);
  } else if (String(value.matrixUserId).startsWith('@n:')) {
    // Binding a mesh identity to itself carries no information and would let a
    // caller believe a classic account was involved.
    issues.push('matrixUserId must be a classic account, not a mesh @n: identity');
  }

  if (typeof value.issuedAt === 'string' && typeof value.expiresAt === 'string') {
    if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
      issues.push('expiresAt must be after issuedAt');
    }
  }

  return issues;
}

/** True when the binding envelope passes structural checks. Not verification. */
export function isStructurallyValidBinding(value: unknown): value is IdentityBinding {
  return collectIdentityBindingIssues(value).length === 0;
}

/**
 * The verification a device must record for a binding it cannot check.
 *
 * Use this when offline or when `/keys/query` fails. An uncheckable new claim
 * stays pending; it does not inherit trust from a previous binding.
 */
export function pendingVerification(bindingId: string, checkedAt: string): BindingVerification {
  return {
    bindingId,
    signaturesValid: false,
    deviceTrust: 'unknown',
    checkedAt,
    presentAsVerified: false,
  };
}

/**
 * Whether a binding may be acted on at `scope`.
 *
 * Returns false for everything above `display` until a verification says both
 * that signatures are valid and that the signing device is user-verified. This
 * is the single gate that keeps a self-signed card from earning automatic
 * routing.
 */
export function mayActOn(
  binding: IdentityBinding,
  verification: BindingVerification | undefined,
  scope: BindingScope,
  now: Date,
): boolean {
  if (binding.expiresAt && Date.parse(binding.expiresAt) <= now.getTime()) return false;
  if (SCOPES.indexOf(scope) > SCOPES.indexOf(binding.scope)) return false;
  if (scope === 'display') return true;
  return verification?.presentAsVerified === true;
}
