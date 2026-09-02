import { isMatrixUserId } from './messaging.js';
import type { AttendeeSocial } from './contact.js';
import { messengerHandle, normalizePhone } from './contact.js';
import { parsePublicKey, signCard, verifyCard } from './handshake.js';
import type { HandshakeKeyPair, HandshakePublicKey } from './handshake.js';

/**
 * App-aware friend exchange payload (`indiafoss://friend?v=1&…`).
 *
 * This is the second tier of contact exchange: the universal vCard QR stays
 * the default, and this payload only adds the explicitly selected messaging
 * identities. Every field is optional except the version. A friend payload
 * is an identifier exchange, not proof of identity — the receiving client
 * must show it as unverified until Matrix verification succeeds.
 */
export interface FriendPayload {
  version: 1;
  eventId?: string;
  /** `ticket::<id>` — event-scoped correlation key, never an identity. */
  ticketRef?: string;
  fossUnitedProfileUrl?: string;
  /** Explicitly selected Matrix user id. */
  matrixId?: string;
  /** Neutrino P2P node identity (64 hex chars). Kept separately from `matrixId`. */
  neutrinoServerName?: string;
  fullName?: string;
  organization?: string;
  website?: string;
  socials: Partial<Record<AttendeeSocial, string>>;
  /** Handshake public key (`alg:base64url`) when the card is signed. */
  publicKey?: string;
  /** Signature over the other fields (base64url); see handshake.ts. */
  signature?: string;
}

/** Maximum accepted scanned payload; larger inputs cannot be a valid QR anyway. */
export const MAX_SCAN_PAYLOAD_BYTES = 4096;

const NEUTRINO_SERVER_NAME_RE = /^[0-9a-f]{64}$/i;
const TICKET_REF_RE = /^ticket::[A-Za-z0-9_-]{1,64}$/;
const SAFE_URL_SCHEMES = new Set(['https:', 'http:', 'mailto:']);
/** Networks whose value is a handle or phone number rather than a profile URL. */
const MESSENGERS = new Set<AttendeeSocial>(['telegram', 'whatsapp', 'signal']);
const SOCIALS: AttendeeSocial[] = [
  'github',
  'gitlab',
  'linkedin',
  'mastodon',
  'bluesky',
  'x',
  'instagram',
  'youtube',
  'medium',
  'devto',
  'telegram',
  'whatsapp',
  'signal',
  'xmpp',
  'deltachat',
];

export function isNeutrinoServerName(value: string): boolean {
  return NEUTRINO_SERVER_NAME_RE.test(value);
}

export function isTicketRef(value: string): boolean {
  return TICKET_REF_RE.test(value);
}

/** Matrix user id a Neutrino node exposes (`@n:<server_name>` by default). */
export function neutrinoMatrixId(serverName: string, localpart = 'n'): string {
  return `@${localpart}:${serverName.toLowerCase()}`;
}

/** True when a URL uses a scheme we are willing to render as a link. */
export function isSafeUrl(value: string): boolean {
  try {
    return SAFE_URL_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function put(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value?.trim()) params.set(key, value.trim());
}

export function encodeFriendPayload(payload: FriendPayload): string {
  const params = new URLSearchParams();
  params.set('v', '1');
  put(params, 'event_id', payload.eventId);
  put(params, 'ticket_ref', payload.ticketRef);
  put(params, 'fossunited_profile_url', payload.fossUnitedProfileUrl);
  put(params, 'matrix_id', payload.matrixId);
  put(params, 'neutrino_server_name', payload.neutrinoServerName?.toLowerCase());
  put(params, 'fn', payload.fullName);
  put(params, 'org', payload.organization);
  put(params, 'url', payload.website);
  for (const network of SOCIALS) put(params, `social_${network}`, payload.socials[network]);
  put(params, 'pk', payload.publicKey);
  put(params, 'sig', payload.signature);
  return `indiafoss://friend?${params.toString()}`;
}

/** Encode and sign a friend card with the device's handshake key. */
export async function encodeSignedFriendPayload(
  payload: FriendPayload,
  pair: HandshakeKeyPair,
): Promise<string> {
  const unsigned = encodeFriendPayload({
    ...payload,
    publicKey: `${pair.exported.alg}:${pair.exported.key}`,
    signature: undefined,
  });
  const params = new URLSearchParams(unsigned.slice(unsigned.indexOf('?') + 1));
  params.set('sig', await signCard(params, pair));
  return `indiafoss://friend?${params.toString()}`;
}

export type FriendSignatureState = 'valid' | 'invalid' | 'unsigned';

/**
 * Verify a friend card's signature. `unsigned` cards are still usable — the
 * result only tells the UI which badge to show.
 */
export async function verifyFriendPayload(text: string): Promise<{
  payload: FriendPayload;
  signature: FriendSignatureState;
  publicKey: HandshakePublicKey | null;
}> {
  const payload = decodeFriendPayload(text);
  if (!payload) throw new Error('Not a friend card');
  const publicKey = parsePublicKey(payload.publicKey);
  if (!publicKey || !payload.signature) return { payload, signature: 'unsigned', publicKey };
  const params = new URLSearchParams(text.slice(text.indexOf('?') + 1));
  const ok = await verifyCard(params, publicKey, payload.signature);
  return { payload, signature: ok ? 'valid' : 'invalid', publicKey };
}

/**
 * Decode a friend payload. Returns `null` for anything that is not a v1
 * payload; individual malformed fields are dropped rather than failing the
 * whole scan, except identities, which must be well-formed to be accepted.
 */
export function decodeFriendPayload(text: string): FriendPayload | null {
  const match = text.trim().match(/^indiafoss:\/\/friend\/?\?(.*)$/i);
  if (!match?.[1]) return null;
  const params = new URLSearchParams(match[1]);
  if (params.get('v') !== '1') return null;

  const payload: FriendPayload = { version: 1, socials: {} };
  const eventId = params.get('event_id');
  if (eventId && /^[a-z0-9-]{1,64}$/i.test(eventId)) payload.eventId = eventId;
  const ticketRef = params.get('ticket_ref');
  if (ticketRef && isTicketRef(ticketRef)) payload.ticketRef = ticketRef;
  const profileUrl = params.get('fossunited_profile_url');
  if (profileUrl && isSafeUrl(profileUrl)) payload.fossUnitedProfileUrl = profileUrl;
  const matrixId = params.get('matrix_id');
  if (matrixId && isMatrixUserId(matrixId)) payload.matrixId = matrixId;
  const neutrino = params.get('neutrino_server_name');
  if (neutrino && isNeutrinoServerName(neutrino))
    payload.neutrinoServerName = neutrino.toLowerCase();
  const fn = params.get('fn');
  if (fn) payload.fullName = fn.slice(0, 200);
  const org = params.get('org');
  if (org) payload.organization = org.slice(0, 200);
  const url = params.get('url');
  if (url && isSafeUrl(url)) payload.website = url;
  for (const network of SOCIALS) {
    const value = params.get(`social_${network}`);
    if (!value) continue;
    if (MESSENGERS.has(network)) {
      if (messengerHandle(value) || normalizePhone(value))
        payload.socials[network] = value.slice(0, 80);
    } else if (isSafeUrl(value)) {
      payload.socials[network] = value;
    }
  }
  const pk = params.get('pk');
  if (pk && parsePublicKey(pk)) payload.publicKey = pk;
  const sig = params.get('sig');
  if (sig && /^[A-Za-z0-9_-]{40,200}$/.test(sig)) payload.signature = sig;
  return payload;
}
