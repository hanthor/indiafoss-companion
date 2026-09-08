/**
 * AppHandoff — what one app hands the other when the attendee crosses the
 * Companion/Chat boundary.
 *
 * Companion owns the conference day; Chat owns conversations and cryptographic
 * accounts. Neither reimplements the other, so every crossing is a handoff,
 * and every handoff is this contract.
 *
 * ## The rule that matters
 *
 * **A handoff carries public references and public proof material only.**
 * Never an access token, never a private key, never a recovery passphrase.
 * Handoffs travel through URLs, which end up in logs, in browser history, in
 * the clipboard, and — for a QR poster — on a wall.
 *
 * ## Two encodings, one meaning
 *
 * - `https://` Universal/App Links for owned native apps, with a real web page
 *   at the same URL as the fallback. This is what `docs/architecture/ios.md`
 *   recommends and what works when the app is not installed.
 * - `indiafoss://` custom scheme, already implemented in `scan.ts`, for the
 *   offline and QR paths where no origin is reachable.
 *
 * Both parse to the same {@link AppHandoff}. Which is *emitted* is an open
 * question for the maintainer (ADR 0009); both must be *accepted*.
 *
 * See `docs/architecture/system.md` ("Share contracts"), `scan.ts` for the
 * currently shipped parser, and #28 in Chat for unhandled link dispatch.
 */
import {
  collectSchemaVersionIssues,
  isMatrixRoomAlias,
  isMatrixRoomId,
  isMatrixUserId,
  isRecord,
  optionalString,
  requireLiteral,
  requireString,
} from './common.js';

export const APP_HANDOFF_SCHEMA_VERSION = 1;

/**
 * Maximum encoded handoff size, bytes. A handoff arrives from a scanned code
 * or an inbound link — untrusted input, bounded before parsing. Matches
 * {@link import('../scan.js').MAX_SCAN_PAYLOAD_BYTES}.
 */
export const MAX_HANDOFF_BYTES = 8192;

/** The custom scheme already understood by `scan.ts`. */
export const HANDOFF_SCHEME = 'indiafoss:';

/**
 * Hosts whose `https://` links may be treated as first-party handoffs. An
 * inbound link on any other host is an ordinary web link, never a handoff —
 * this is what stops a page from fabricating one.
 *
 * Today this is the actual deployment: the PWA ships from GitHub Pages at
 * `https://hanthor.github.io/indiafoss-companion/`. Note that the Matrix
 * alias server is a *different* domain (`reilly.asia`, see
 * `events/<eventId>/messaging.json`) — the web origin and the homeserver are
 * not the same thing and must not be conflated.
 *
 * **A canonical custom domain has not been chosen.** That decision is open in
 * ADR 0009 and #181; when it is made, add it here rather than replacing the
 * Pages host, so links already printed on posters keep working.
 */
export const HANDOFF_HOSTS: readonly string[] = ['hanthor.github.io'];

/**
 * Path prefix the handoff routes live under, including the GitHub Pages
 * project base path. Kept beside the host because a project site is served
 * from a subdirectory — a builder that ignores this emits links that 404.
 */
export const HANDOFF_BASE_PATH = '/indiafoss-companion/h/';

export type HandoffAction =
  /** Open a session in Companion. `ref` is an activity id. */
  | 'view-session'
  /** Open a venue location in Companion. `ref` is a location id. */
  | 'view-location'
  /** Start or open a DM in Chat. `ref` is a Matrix user id. */
  | 'open-dm'
  /** Join or open a room in Chat. `ref` is a room alias or room id. */
  | 'join-room'
  /** Import a contact card in Companion. `ref` is the card key. */
  | 'import-contact';

export interface AppHandoff {
  schemaVersion: number;
  action: HandoffAction;
  /** The referenced id. Interpretation depends on {@link AppHandoff.action}. */
  ref: string;
  /** Event this handoff belongs to, so a stale poster cannot cross events. */
  eventId?: string;
  /**
   * Which account the target app should use, when the attendee has more than
   * one and the handoff came from a context that knows. Absent means **ask**;
   * a handoff must never silently pick an identity for someone.
   */
  accountHint?: string;
  /**
   * Public proof material accompanying the reference — a contact card key, a
   * binding id. Public values only; see the module header.
   */
  proof?: string;
}

const ACTIONS: readonly HandoffAction[] = [
  'view-session',
  'view-location',
  'open-dm',
  'join-room',
  'import-contact',
];

/** Fields that must never appear in a handoff, whatever the caller intended. */
const FORBIDDEN_FIELDS = [
  'accessToken',
  'access_token',
  'token',
  'password',
  'privateKey',
  'private_key',
  'recoveryKey',
  'recovery_key',
  'secret',
];

function collectRefIssues(action: unknown, ref: unknown): string[] {
  if (typeof ref !== 'string' || !ref.trim()) return ['ref must be a non-empty string'];

  switch (action) {
    case 'open-dm':
      return isMatrixUserId(ref) ? [] : [`ref must be a Matrix user id for open-dm, got ${ref}`];
    case 'join-room':
      return isMatrixRoomAlias(ref) || isMatrixRoomId(ref)
        ? []
        : [`ref must be a room alias or room id for join-room, got ${ref}`];
    default:
      return [];
  }
}

/**
 * Structural validation for an untrusted handoff.
 *
 * Rejects any payload carrying a credential-shaped field, even one that is
 * otherwise well-formed: a handoff that arrives with a token is a bug at the
 * sender, and forwarding it would spread the leak.
 */
export function collectAppHandoffIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['handoff must be an object'];

  const issues: string[] = [
    ...collectSchemaVersionIssues(value, APP_HANDOFF_SCHEMA_VERSION, 'handoff'),
    ...requireLiteral(value, 'action', ACTIONS),
    ...requireString(value, 'ref'),
    ...optionalString(value, 'eventId'),
    ...optionalString(value, 'accountHint'),
    ...optionalString(value, 'proof'),
    ...collectRefIssues(value.action, value.ref),
  ];

  for (const field of FORBIDDEN_FIELDS) {
    if (value[field] !== undefined) {
      issues.push(`handoff must not carry credential material: ${field}`);
    }
  }

  if (value.accountHint !== undefined && !isMatrixUserId(value.accountHint)) {
    issues.push('accountHint must be a Matrix user id');
  }

  return issues;
}

/** True when the handoff passes structural checks. */
export function isValidAppHandoff(value: unknown): value is AppHandoff {
  return collectAppHandoffIssues(value).length === 0;
}

/**
 * Whether an inbound URL may be treated as a first-party handoff.
 *
 * `https://` is accepted only on {@link HANDOFF_HOSTS}; the custom scheme is
 * accepted on its own. Anything else is an ordinary link.
 */
export function isHandoffUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol === HANDOFF_SCHEME) return true;
  return url.protocol === 'https:' && HANDOFF_HOSTS.includes(url.hostname);
}

/**
 * Render a handoff as an `https://` link.
 *
 * The returned URL must also serve a useful page for someone without the app
 * installed — that fallback is the point of preferring HTTPS over the custom
 * scheme, and shipping the link without the page defeats it.
 */
export function toHandoffUrl(
  handoff: AppHandoff,
  host = HANDOFF_HOSTS[0],
  basePath = HANDOFF_BASE_PATH,
): string {
  const url = new URL(`https://${host}${basePath}${handoff.action}`);
  url.searchParams.set('v', String(handoff.schemaVersion));
  url.searchParams.set('ref', handoff.ref);
  if (handoff.eventId) url.searchParams.set('e', handoff.eventId);
  if (handoff.accountHint) url.searchParams.set('as', handoff.accountHint);
  if (handoff.proof) url.searchParams.set('p', handoff.proof);
  return url.toString();
}

/**
 * Parse a handoff URL in either encoding.
 *
 * Returns `undefined` for anything that is not a first-party handoff, and for
 * a handoff whose fields do not validate. Callers get "not a handoff" and
 * "malformed handoff" as the same answer on purpose: neither should be acted
 * on, and distinguishing them in a UI invites a confusing error for what is
 * usually just an ordinary link.
 *
 * Note the deliberate asymmetry with {@link collectAppHandoffIssues}: an
 * *object* carrying a credential-shaped field is rejected outright, because
 * that is a sender bug worth surfacing, while a *URL* carrying one simply has
 * it ignored — only the recognised query parameters are read, so the token
 * never reaches the result. Dropping it silently is right here: an attacker
 * can append any parameter to a link, and refusing the whole handoff would
 * hand them a denial-of-service on every poster QR code.
 */
export function parseHandoffUrl(input: string): AppHandoff | undefined {
  if (input.length > MAX_HANDOFF_BYTES) return undefined;
  if (!isHandoffUrl(input)) return undefined;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  // The action is the segment after `/h/`, wherever that sits in the path —
  // a GitHub Pages project site serves the app from a subdirectory, so the
  // prefix is not fixed.
  const action =
    url.protocol === HANDOFF_SCHEME
      ? url.hostname || url.pathname.replace(/^\/+/, '').split('/')[0]
      : /(?:^|\/)h\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  if (!action) return undefined;

  const ref = url.searchParams.get('ref');
  if (!ref) return undefined;

  const candidate: Record<string, unknown> = {
    schemaVersion: Number(url.searchParams.get('v') ?? APP_HANDOFF_SCHEMA_VERSION),
    action,
    ref,
  };
  const eventId = url.searchParams.get('e');
  if (eventId) candidate.eventId = eventId;
  const accountHint = url.searchParams.get('as');
  if (accountHint) candidate.accountHint = accountHint;
  const proof = url.searchParams.get('p');
  if (proof) candidate.proof = proof;

  return isValidAppHandoff(candidate) ? candidate : undefined;
}
