import type { ContactRecord } from '@indiafoss/storage';
import type { AccountClaimTrust } from '@indiafoss/model/contracts';
import {
  classifyMeshIdentity,
  hasRetainedIdentity,
  matrixUriFor,
  neutrinoMatrixId,
  shortFingerprint,
} from '@indiafoss/model';
import { accountTrustOf } from './mesh-link';

/**
 * The separate things the app knows about a saved contact, kept separate
 * (#31, #188, C-10). None of them is proof of the others:
 *
 * - **card signature** — the presenter controlled the card key. Says nothing
 *   about who they are or which accounts are theirs.
 * - **account claim** — the Matrix id on the card names the mesh identity on
 *   the card, according to a public profile read: the homeserver's word.
 * - **in person** — the attendee explicitly said they compared key badges
 *   with the other person's phone. A statement about the card key, made by
 *   the attendee, bound to the fingerprint it was made for.
 * - **Chat** — Matrix device verification, the only proof of account control.
 *   Nothing here can produce it; the honest state is "not verified in Chat".
 * - **routes** — what tapping a chat button would open, and what this app
 *   can and cannot tell about whether it will work.
 */

export type SignatureTrust = 'valid' | 'invalid' | 'unsigned' | 'key-changed';

export type ProfileTrust =
  /** The card carries no Matrix id + mesh id pair; there is nothing to check. */
  | 'no-claim'
  | 'unchecked'
  | 'profile-matched'
  | 'mismatch'
  | 'unlinked'
  /**
   * An identity on the card, or on the profile, is in a format this build does
   * not read (#160): kept as it arrived, never routed, never called a mismatch.
   */
  | 'outdated';

export type InPersonTrust =
  /** The attendee compared this card's badge and said it matched. */
  | 'confirmed'
  /** The attendee compared a badge, but the card has since shown a different key. */
  | 'confirmed-earlier-key'
  | 'unconfirmed'
  /** An unsigned card has no badge, so there is nothing to compare. */
  | 'no-badge';

/** `verified` is reserved for cross-signing evidence; nothing produces it yet (#188). */
export type ChatTrust = 'verified' | 'not-verified';

export type ChatRouteKind = 'mesh' | 'matrix';

export interface ChatRoute {
  kind: ChatRouteKind;
  /** Button label. */
  label: string;
  /** `matrix:` URI handed to whatever client is installed. */
  href: string;
  /** What the app honestly cannot know about this route. */
  caveat: string;
}

export interface ContactTrust {
  signature: SignatureTrust;
  /** Conclusion from the profile observation: at most `profile-matched`. */
  account: AccountClaimTrust;
  /** The homeserver names a different mesh identity than the card. */
  contradiction: boolean;
  profile: ProfileTrust;
  inPerson: InPersonTrust;
  chat: ChatTrust;
  routes: ChatRoute[];
}

/** No client can be detected from a web page; say so rather than promise delivery. */
export const NO_ROUTE_LABEL = 'No known chat route';
export const MESH_ROUTE_CAVEAT =
  'Opens IndiaFOSS Chat if it is installed and the mesh is up. This app cannot tell whether it is.';
export const MATRIX_ROUTE_CAVEAT =
  'Opens whatever Matrix app is installed. This app cannot tell whether one is, or whether this account answers.';

export function chatRoutesFor(
  contact: Pick<ContactRecord, 'matrixId' | 'neutrinoServerName'>,
): ChatRoute[] {
  const routes: ChatRoute[] = [];
  // Only a mesh identity this build recognises becomes an address (#160); the
  // envelope never promotes another shape, and this guard keeps a hand-edited
  // record from slipping past it.
  const mesh = classifyMeshIdentity(contact.neutrinoServerName);
  if (mesh?.kind === 'node-id') {
    const href = matrixUriFor(neutrinoMatrixId(mesh.nodeId));
    if (href)
      routes.push({ kind: 'mesh', label: 'Message on mesh', href, caveat: MESH_ROUTE_CAVEAT });
  }
  const matrixId = contact.matrixId?.trim();
  if (matrixId) {
    const href = matrixUriFor(matrixId);
    if (href) {
      routes.push({
        kind: 'matrix',
        label: 'Open in a Matrix app',
        href,
        caveat: MATRIX_ROUTE_CAVEAT,
      });
    }
  }
  return routes;
}

export function signatureTrustOf(
  contact: Pick<ContactRecord, 'signature' | 'keyChanged'>,
): SignatureTrust {
  if (contact.keyChanged) return 'key-changed';
  if (contact.signature === 'valid') return 'valid';
  if (contact.signature === 'invalid') return 'invalid';
  return 'unsigned';
}

export function profileTrustOf(
  contact: Pick<ContactRecord, 'matrixId' | 'neutrinoServerName' | 'meshLink' | 'identity'>,
): ProfileTrust {
  if (!contact.matrixId?.trim() || !contact.neutrinoServerName?.trim()) {
    // A card whose identity this build set aside unread has a claim on it —
    // one that cannot be checked, and must not be called absent.
    return hasRetainedIdentity(contact.identity) ? 'outdated' : 'no-claim';
  }
  switch (contact.meshLink?.state) {
    case 'profile-matched':
      return 'profile-matched';
    case 'mismatch':
      return 'mismatch';
    case 'unlinked':
      return 'unlinked';
    case 'outdated':
      return 'outdated';
    default:
      return 'unchecked';
  }
}

export function inPersonTrustOf(
  contact: Pick<ContactRecord, 'fingerprint' | 'inPersonConfirmed'>,
): InPersonTrust {
  if (!contact.fingerprint) return 'no-badge';
  if (!contact.inPersonConfirmed) return 'unconfirmed';
  return contact.inPersonConfirmed.fingerprint === contact.fingerprint
    ? 'confirmed'
    : 'confirmed-earlier-key';
}

/**
 * `verified` only when the record says Matrix device verification happened.
 * Nothing sets `ContactRecord.verified` today; the branch exists so the day
 * #188 lands the UI has a place for it, and so that until then the screen
 * says "not verified" rather than nothing.
 */
export function chatTrustOf(contact: Pick<ContactRecord, 'verified'>): ChatTrust {
  return contact.verified === true ? 'verified' : 'not-verified';
}

/** Pure: everything the contact screens show about trust, derived from the record alone. */
export function deriveContactTrust(contact: ContactRecord): ContactTrust {
  const { trust, contradiction } = accountTrustOf(contact.meshLink);
  return {
    signature: signatureTrustOf(contact),
    account: trust,
    contradiction,
    profile: profileTrustOf(contact),
    inPerson: inPersonTrustOf(contact),
    chat: chatTrustOf(contact),
    routes: chatRoutesFor(contact),
  };
}

/** Visible wording, one line per fact. Kept here so unit tests and the pages agree. */
export function signatureLabel(state: SignatureTrust, fingerprint?: string): string {
  switch (state) {
    case 'valid':
      return `Card signed · badge ${shortFingerprint(fingerprint ?? '')}`;
    case 'invalid':
      return 'Card signature invalid';
    case 'key-changed':
      return 'Key changed since an earlier card';
    case 'unsigned':
      return 'Unsigned card';
  }
}

export function profileLabel(state: ProfileTrust): string {
  switch (state) {
    case 'no-claim':
      return 'No account link to check';
    case 'unchecked':
      return 'Account link claimed, not checked yet';
    case 'profile-matched':
      return 'Profile matches';
    case 'mismatch':
      return 'Does not match';
    case 'unlinked':
      return 'Account link claimed, profile names no mesh id';
    case 'outdated':
      return "Identity format this app can't read yet";
  }
}

export function inPersonLabel(state: InPersonTrust): string {
  switch (state) {
    case 'confirmed':
      return 'Badge compared in person';
    case 'confirmed-earlier-key':
      return 'Badge compared in person for an earlier key';
    case 'unconfirmed':
      return 'Badge not compared in person';
    case 'no-badge':
      return 'No badge to compare';
  }
}

export function chatLabel(state: ChatTrust): string {
  // The `verified` branch is reachable only through cross-signing evidence
  // the app does not hold (#188). Keep it, keep it unreachable.
  return state === 'verified' ? 'Verified in Chat' : 'Not verified in Chat';
}

/**
 * The trust a record must be reduced to when it arrives from somebody else —
 * a scan, a shared link, an imported file. Whatever the wire said, an account
 * claim starts at `claimed`, nothing is Matrix-verified, and an in-person
 * confirmation is the receiving attendee's to make, not the file's. The
 * `ContactRecord` twin of `asReceived()` in `@indiafoss/model/contracts`.
 */
export function asReceivedRecord(record: ContactRecord): ContactRecord {
  const received: ContactRecord = { ...record, verified: false, accountTrust: 'claimed' };
  delete received.inPersonConfirmed;
  delete received.meshLink;
  return received;
}

/** The attendee's own statement that the badges matched, bound to this card's key. */
export function confirmedInPerson(record: ContactRecord, at: string): ContactRecord {
  if (!record.fingerprint) return record;
  return { ...record, inPersonConfirmed: { fingerprint: record.fingerprint, at } };
}

export function withoutInPersonConfirmation(record: ContactRecord): ContactRecord {
  const withdrawn: ContactRecord = { ...record };
  delete withdrawn.inPersonConfirmed;
  return withdrawn;
}
