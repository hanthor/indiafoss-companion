import { MAX_SCAN_PAYLOAD_BYTES } from '../payload-limits.js';
/**
 * ContactCard — the versioned envelope for "we met, here is how to reach me".
 *
 * This is the structured form of what `/connect` already encodes as a signed
 * vCard (`signed-vcard.ts`, `X-INDIAFOSS-KEY` / `X-INDIAFOSS-SIG`). The vCard
 * remains the interoperable wire format for other address books; this envelope
 * is what our own apps exchange and store, because a vCard cannot express the
 * distinction this contract exists to preserve:
 *
 * **A signed card proves control of the card key. It proves nothing about the
 * Matrix accounts named on it.** Anyone can put anyone's MXID on a card they
 * sign. Account claims therefore carry their own independent trust state and
 * start at `claimed`, never at `verified`.
 *
 * The four states a UI must keep apart:
 *
 * | State | What it means |
 * | --- | --- |
 * | met in person | the scan happened face to face — a fact about the meeting |
 * | card signature valid | the presenter controls {@link ContactCard.cardKey} |
 * | profile matches | the homeserver asserts a link; the homeserver could lie |
 * | Matrix verified | device cross-signing verified — the only proof of account control |
 *
 * See `docs/architecture/system.md` ("Identity and trust"),
 * `docs/contact-sharing.md`, #31, and #188 for the binding that upgrades a
 * claim to a proof.
 */
import {
  collectDuplicates,
  collectSchemaVersionIssues,
  isMatrixUserId,
  isRecord,
  optionalInstant,
  optionalString,
  requireArray,
  requireInstant,
  requireLiteral,
  requireString,
} from './common.js';

export const CONTACT_CARD_SCHEMA_VERSION = 1;

/**
 * Maximum encoded card size. A card arrives from a QR code or a file chosen
 * by the user; both are untrusted input and must be bounded before parsing.
 * Matches {@link import('../payload-limits.js').MAX_SCAN_PAYLOAD_BYTES}.
 */
export const MAX_CONTACT_CARD_BYTES = MAX_SCAN_PAYLOAD_BYTES;

/**
 * Trust in an account *claim* on a card. Only `verified` may render as a
 * verified badge, and only device cross-signing may set it.
 *
 * - `claimed` — the card says so. Default. Not evidence.
 * - `profile-matched` — the homeserver's public profile agrees. Better than
 *   nothing, still the homeserver's assertion. This is what `mesh-link.ts`
 *   currently produces; it is **not** verification, and ADR 0006's stronger
 *   description of it is corrected in #188.
 * - `binding-valid` — a structurally and cryptographically valid
 *   {@link import('./identity-binding.js').IdentityBinding} signed by a Matrix
 *   device — but by a device whose own trust is unknown or unverified.
 * - `verified` — Matrix device verification succeeded.
 * - `revoked` — previously accepted, since withdrawn.
 */
export type AccountClaimTrust =
  'claimed' | 'profile-matched' | 'binding-valid' | 'verified' | 'revoked';

/** Transport an account claim belongs to. */
export type AccountKind = 'classic' | 'mesh';

export interface AccountClaim {
  /** Matrix user id: `@user:server` or a mesh `@n:<64-hex>`. */
  userId: string;
  kind: AccountKind;
  /**
   * Trust in this claim. A card as *presented* should carry `claimed`; a
   * higher value is something the receiving device establishes and records
   * locally. Never accept a `verified` value from the wire.
   */
  trust: AccountClaimTrust;
  /** Optional binding backing this claim; see identity-binding.ts. */
  bindingId?: string;
}

/** Minimal, consented profile fields. Everything here is optional by design. */
export interface CardProfile {
  displayName?: string;
  pronouns?: string;
  tagline?: string;
  organisation?: string;
  /** Public links the person chose to share, as absolute URLs. */
  links?: string[];
}

export interface ContactCard {
  schemaVersion: number;
  /**
   * The card's own public key, base64url. Identifies the card across
   * re-issues and is what {@link ContactCard.signature} is checked against.
   */
  cardKey: string;
  /** Fields the person consented to share. May be entirely empty. */
  profile: CardProfile;
  /** Account claims. Empty is valid — a card need not name any account. */
  accounts: AccountClaim[];
  /** When the card was issued, ISO-8601. */
  issuedAt: string;
  /**
   * When the card stops being presentable, ISO-8601. Expiry means "do not
   * present or re-share this"; it does **not** mean an already-saved contact
   * should be deleted. Someone you met is still someone you met.
   */
  expiresAt?: string;
  /**
   * Signature over the canonical card encoding by {@link ContactCard.cardKey},
   * base64url. Absent on an unsigned card, which is valid but carries no proof
   * of card-key control.
   *
   * The canonical encoding is shared with the vCard path via
   * `canonicalVCardBody()` and is specified alongside it; this contract does
   * not redefine it.
   */
  signature?: string;
  /** Event this card was exchanged at, for the attendee's own recall. */
  eventId?: string;
}

const TRUSTS: readonly AccountClaimTrust[] = [
  'claimed',
  'profile-matched',
  'binding-valid',
  'verified',
  'revoked',
];
const KINDS: readonly AccountKind[] = ['classic', 'mesh'];

function collectClaimIssues(value: unknown, index: number): string[] {
  const at = `accounts[${index}].`;
  if (!isRecord(value)) return [`accounts[${index}] must be an object`];

  const issues: string[] = [
    ...requireLiteral(value, 'kind', KINDS, at),
    ...requireLiteral(value, 'trust', TRUSTS, at),
    ...optionalString(value, 'bindingId', at),
  ];

  if (!isMatrixUserId(value.userId)) {
    issues.push(`${at}userId must be a Matrix user id, got ${JSON.stringify(value.userId)}`);
  } else if (value.kind === 'mesh' && !String(value.userId).startsWith('@n:')) {
    issues.push(`${at}userId is marked mesh but is not an @n: identity`);
  }

  return issues;
}

function collectProfileIssues(value: unknown): string[] {
  if (value === undefined) return ['profile must be an object (use {} for an empty profile)'];
  if (!isRecord(value)) return ['profile must be an object'];

  const issues: string[] = [
    ...optionalString(value, 'displayName', 'profile.'),
    ...optionalString(value, 'pronouns', 'profile.'),
    ...optionalString(value, 'tagline', 'profile.'),
    ...optionalString(value, 'organisation', 'profile.'),
  ];

  if (value.links !== undefined) {
    issues.push(...requireArray(value, 'links', {}, 'profile.'));
    if (Array.isArray(value.links)) {
      for (const [i, link] of value.links.entries()) {
        if (typeof link !== 'string') {
          issues.push(`profile.links[${i}] must be a string`);
          continue;
        }
        try {
          const url = new URL(link);
          if (url.protocol !== 'https:' && url.protocol !== 'mailto:') {
            issues.push(`profile.links[${i}] must be https: or mailto:, got ${url.protocol}`);
          }
        } catch {
          issues.push(`profile.links[${i}] must be an absolute URL`);
        }
      }
    }
  }

  return issues;
}

/**
 * Structural validation for an untrusted card.
 *
 * Structural validity says nothing about the signature. Verify that
 * separately, and never let a structurally valid card with a `verified` claim
 * render as verified — see {@link AccountClaimTrust}.
 */
export function collectContactCardIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['card must be an object'];

  const issues: string[] = [
    ...collectSchemaVersionIssues(value, CONTACT_CARD_SCHEMA_VERSION, 'card'),
    ...requireString(value, 'cardKey'),
    ...requireInstant(value, 'issuedAt'),
    ...optionalInstant(value, 'expiresAt'),
    ...optionalString(value, 'signature'),
    ...optionalString(value, 'eventId'),
    ...collectProfileIssues(value.profile),
    ...requireArray(value, 'accounts'),
  ];

  if (Array.isArray(value.accounts)) {
    const userIds: string[] = [];
    for (const [index, claim] of value.accounts.entries()) {
      issues.push(...collectClaimIssues(claim, index));
      if (isRecord(claim) && typeof claim.userId === 'string') userIds.push(claim.userId);
    }
    issues.push(...collectDuplicates(userIds, 'account'));
  }

  if (typeof value.issuedAt === 'string' && typeof value.expiresAt === 'string') {
    if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
      issues.push('expiresAt must be after issuedAt');
    }
  }

  return issues;
}

/** True when the card passes structural checks. */
export function isValidContactCard(value: unknown): value is ContactCard {
  return collectContactCardIssues(value).length === 0;
}

/**
 * Whether the card should still be presented or re-shared, at `now`.
 *
 * An expired card is not invalid and its saved contact is not stale — see the
 * note on {@link ContactCard.expiresAt}.
 */
export function isPresentable(card: ContactCard, now: Date): boolean {
  if (!card.expiresAt) return true;
  return Date.parse(card.expiresAt) > now.getTime();
}

/**
 * The trust a freshly received card's claims must be reduced to, whatever the
 * wire said. Apply this on import, before storing.
 */
export function asReceived(card: ContactCard): ContactCard {
  return {
    ...card,
    accounts: card.accounts.map((claim) => ({ ...claim, trust: 'claimed' as const })),
  };
}
