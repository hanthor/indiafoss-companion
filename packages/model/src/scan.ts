import type { AttendeeProfile, AttendeeSocial } from './contact.js';
import { decodeFriendPayload, isTicketRef } from './friend.js';
import type { FriendPayload } from './friend.js';
import { isMatrixUserId } from './messaging.js';

/** Hard ceiling for a scanned payload, guarding against oversized QR abuse (§28, §42). */
export const MAX_SCAN_PAYLOAD_BYTES = 8192;

/** A location marker resolved from an `indiafoss://location/<id>` deep link. */
export interface ScannedLocation {
  kind: 'location';
  locationId: string;
}

/** A contact card decoded from a scanned vCard payload. */
export interface ScannedContact {
  kind: 'contact';
  /** Fields actually present in the scanned card, ready for a confirmation preview. */
  profile: AttendeeProfile;
  /** The raw vCard, preserved for re-export/download without re-serialising. */
  vcard: string;
}

export type ScanErrorReason = 'empty' | 'oversized' | 'unsupported' | 'malformed';

export interface ScanError {
  kind: 'error';
  reason: ScanErrorReason;
  message: string;
}

/** App-aware friend card (`indiafoss://friend?v=1…`), see friend.ts. */
export interface ScannedFriend {
  kind: 'friend';
  friend: FriendPayload;
}

/** A Matrix user id from a raw id, matrix.to link, `matrix:` URI or `indiafoss://chat?dm=`. */
export interface ScannedMatrixUser {
  kind: 'matrix-user';
  userId: string;
}

/** A Matrix room alias/id from a raw id, matrix.to link, `matrix:` URI or `indiafoss://chat?join=`. */
export interface ScannedMatrixRoom {
  kind: 'matrix-room';
  idOrAlias: string;
}

/** A FOSS United ticket QR (bare ticket id) or explicit `ticket::<id>` reference. */
export interface ScannedTicket {
  kind: 'ticket';
  ticketRef: string;
}

export type ScannedPayload =
  | ScannedLocation
  | ScannedContact
  | ScannedFriend
  | ScannedMatrixUser
  | ScannedMatrixRoom
  | ScannedTicket
  | ScanError;

const ROOM_TARGET = /^[#!][^:\s]+:[^\s]+$/;

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Split a structured vCard value on unescaped `;` and unescape each part. */
function splitStructured(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    if (ch === '\\' && i + 1 < value.length) {
      current += ch + value[i + 1];
      i += 1;
    } else if (ch === ';') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => unescapeVCard(p).trim());
}

const LOCATION_ID = /^[a-z0-9][a-z0-9-]*$/i;

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function unescapeVCard(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    if (ch === '\\' && i + 1 < value.length) {
      const next = value[i + 1]!;
      if (next === 'n' || next === 'N') out += '\n';
      else out += next;
      i += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

/** Unfold RFC 6350 folded lines (a CRLF/LF followed by a space or tab). */
function unfoldLines(text: string): string[] {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalised.split('\n');
  const lines: string[] = [];
  for (const raw of rawLines) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

interface VCardLine {
  name: string;
  params: Map<string, string>;
  value: string;
}

function parseVCardLine(line: string): VCardLine | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const rawName = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segments = rawName.split(';');
  const name = segments[0]!.toUpperCase();
  const params = new Map<string, string>();
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf('=');
    if (eq === -1) {
      // Bare type parameter, e.g. `TYPE` shorthand — record under TYPE.
      params.set('TYPE', segment.toLowerCase());
    } else {
      params.set(segment.slice(0, eq).toUpperCase(), segment.slice(eq + 1).toLowerCase());
    }
  }
  return { name, params, value };
}

const KNOWN_SOCIALS: readonly AttendeeSocial[] = [
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
];

/**
 * Parse a scanned vCard string into a canonical {@link AttendeeProfile}.
 * Returns null when the payload is not a recognisable vCard.
 */
export function parseVCard(vcard: string): AttendeeProfile | null {
  const lines = unfoldLines(vcard.trim());
  if (lines[0]?.toUpperCase().trim() !== 'BEGIN:VCARD') return null;
  if (!lines.some((l) => l.toUpperCase().trim() === 'END:VCARD')) return null;

  const profile: AttendeeProfile = { fullName: '', socials: {} };
  let structuredName: { family: string; given: string } | null = null;

  for (const raw of lines) {
    const parsed = parseVCardLine(raw);
    if (!parsed) continue;
    const { name, params, value } = parsed;
    const decoded = unescapeVCard(value).trim();
    const type = params.get('TYPE') ?? '';

    switch (name) {
      case 'FN':
        profile.fullName = decoded;
        break;
      case 'N': {
        const parts = splitStructured(value);
        structuredName = { family: parts[0] ?? '', given: parts[1] ?? '' };
        break;
      }
      case 'ORG':
        if (decoded) profile.organization = decoded;
        break;
      case 'EMAIL':
        if (decoded) profile.email = decoded;
        break;
      case 'TEL':
        if (decoded) profile.phone = decoded;
        break;
      case 'URL':
        if (type === 'profile' && decoded) profile.fossUnitedProfileUrl = decoded;
        else if (decoded && !profile.website) profile.website = decoded;
        break;
      case 'X-FOSSUNITED-PROFILE':
        if (decoded) profile.fossUnitedProfileUrl = decoded;
        break;
      // Both spellings: cards written before the single-QR redesign used the
      // longer names, and they still scan.
      case 'X-INDIAFOSS-MATRIX':
      case 'X-MATRIX-ID':
        if (decoded) profile.matrixId = decoded;
        break;
      case 'X-INDIAFOSS-MESH':
      case 'X-NEUTRINO-SERVER-NAME':
        if (/^[0-9a-f]{64}$/i.test(decoded)) profile.neutrinoServerName = decoded.toLowerCase();
        break;
      case 'X-INDIAFOSS-TICKET':
      case 'X-INDIAFOSS-TICKET-REF':
        if (isTicketRef(decoded)) profile.ticketRef = decoded;
        break;
      case 'IMPP':
        if (!profile.matrixId && decoded.toLowerCase().startsWith('matrix:')) {
          profile.matrixId = decoded.slice('matrix:'.length);
        }
        break;
      case 'X-SOCIALPROFILE': {
        const network = KNOWN_SOCIALS.find((s) => s === type);
        if (network && decoded) profile.socials[network] = decoded;
        break;
      }
      default:
        break;
    }
  }

  if (!profile.fullName && structuredName) {
    profile.fullName = [structuredName.given, structuredName.family].filter(Boolean).join(' ');
  }

  // A vCard with no usable identity is treated as malformed by the caller.
  const hasAnyField =
    profile.fullName ||
    profile.organization ||
    profile.email ||
    profile.phone ||
    profile.website ||
    profile.matrixId ||
    profile.neutrinoServerName ||
    profile.fossUnitedProfileUrl ||
    Object.keys(profile.socials).length > 0;
  return hasAnyField ? profile : null;
}

/**
 * Parse the location id from an `indiafoss://location/<id>` payload.
 * Returns null when the payload is not a location deep link.
 */
export function parseLocationPayload(payload: string): string | null {
  const trimmed = payload.trim();
  const match = trimmed.match(/^indiafoss:\/\/location\/([^/?#\s]+)\/?$/i);
  if (!match) return null;
  const id = safeDecode(match[1]!);
  return id && LOCATION_ID.test(id) ? id : null;
}

/**
 * Classify and parse an arbitrary scanned payload for local, opt-in import (§28, §42).
 *
 * The scanner never mutates state directly; it returns a discriminated result
 * so the UI can render a confirmation preview and reject unsafe input.
 */
export function parseScannedPayload(input: string): ScannedPayload {
  const payload = input?.trim() ?? '';
  if (!payload) {
    return { kind: 'error', reason: 'empty', message: 'The scanned code was empty.' };
  }
  if (utf8ByteLength(payload) > MAX_SCAN_PAYLOAD_BYTES) {
    return {
      kind: 'error',
      reason: 'oversized',
      message: 'This code is too large to import safely.',
    };
  }

  // Reserved indiafoss:// payloads: location markers, chat handoff, friend cards.
  if (/^indiafoss:\/\//i.test(payload)) {
    if (/^indiafoss:\/\/location\//i.test(payload)) {
      const locationId = parseLocationPayload(payload);
      if (!locationId) {
        return { kind: 'error', reason: 'malformed', message: 'The location link is malformed.' };
      }
      return { kind: 'location', locationId };
    }
    if (/^indiafoss:\/\/friend/i.test(payload)) {
      const friend = decodeFriendPayload(payload);
      if (!friend) {
        return {
          kind: 'error',
          reason: 'malformed',
          message: 'The friend card could not be read.',
        };
      }
      return { kind: 'friend', friend };
    }
    const chat = payload.match(/^indiafoss:\/\/chat\/?\?(.*)$/i);
    if (chat?.[1]) {
      const params = new URLSearchParams(chat[1]);
      const dm = params.get('dm');
      if (dm && isMatrixUserId(dm)) return { kind: 'matrix-user', userId: dm };
      const join = params.get('join');
      if (join && ROOM_TARGET.test(join)) return { kind: 'matrix-room', idOrAlias: join };
      return { kind: 'error', reason: 'malformed', message: 'The chat link has no valid target.' };
    }
    return {
      kind: 'error',
      reason: 'unsupported',
      message: 'This indiafoss:// link type is not supported.',
    };
  }

  // Matrix identifiers and links (raw ids, matrix.to permalinks, matrix: URIs).
  if (isMatrixUserId(payload)) return { kind: 'matrix-user', userId: payload };
  if (ROOM_TARGET.test(payload)) return { kind: 'matrix-room', idOrAlias: payload };
  const matrixTo = payload.match(/^https?:\/\/matrix\.to\/#\/([^?]+)/i);
  if (matrixTo?.[1]) {
    const id = safeDecode(matrixTo[1]) ?? matrixTo[1];
    if (isMatrixUserId(id)) return { kind: 'matrix-user', userId: id };
    if (ROOM_TARGET.test(id)) return { kind: 'matrix-room', idOrAlias: id };
    return { kind: 'error', reason: 'malformed', message: 'The matrix.to link is malformed.' };
  }
  const matrixUri = payload.match(/^matrix:(u|r|roomid)\/([^?#]+)/i);
  if (matrixUri?.[1] && matrixUri[2]) {
    const rest = safeDecode(matrixUri[2]) ?? matrixUri[2];
    const kind = matrixUri[1].toLowerCase();
    if (kind === 'u' && isMatrixUserId(`@${rest}`))
      return { kind: 'matrix-user', userId: `@${rest}` };
    if (kind === 'r' && ROOM_TARGET.test(`#${rest}`))
      return { kind: 'matrix-room', idOrAlias: `#${rest}` };
    if (kind === 'roomid' && ROOM_TARGET.test(`!${rest}`)) {
      return { kind: 'matrix-room', idOrAlias: `!${rest}` };
    }
    return { kind: 'error', reason: 'malformed', message: 'The matrix: link is malformed.' };
  }

  if (/^BEGIN:VCARD/i.test(payload)) {
    const profile = parseVCard(payload);
    if (!profile) {
      return {
        kind: 'error',
        reason: 'malformed',
        message: 'The contact card could not be read.',
      };
    }
    // Preserve the original (untrimmed) payload for faithful re-export.
    return { kind: 'contact', profile, vcard: input };
  }

  // FOSS United ticket QR codes carry the bare ticket id; explicit refs use ticket::<id>.
  if (isTicketRef(payload)) return { kind: 'ticket', ticketRef: payload };
  if (/^[A-Za-z0-9_-]{6,64}$/.test(payload))
    return { kind: 'ticket', ticketRef: `ticket::${payload}` };

  return {
    kind: 'error',
    reason: 'unsupported',
    message: 'This code is not an IndiaFOSS location, contact card, chat link or ticket.',
  };
}
