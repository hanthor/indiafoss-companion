import type { AttendeeProfile, AttendeeSocial } from './contact.js';

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

export type ScannedPayload = ScannedLocation | ScannedContact | ScanError;

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
        const parts = value.split(';');
        structuredName = {
          family: unescapeVCard(parts[0] ?? '').trim(),
          given: unescapeVCard(parts[1] ?? '').trim(),
        };
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
      case 'X-MATRIX-ID':
        if (decoded) profile.matrixId = decoded;
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
  const id = decodeURIComponent(match[1]!);
  return LOCATION_ID.test(id) ? id : null;
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

  // A payload is classified by its opening token; the two forms cannot overlap.
  if (/^indiafoss:\/\//i.test(payload)) {
    if (!/^indiafoss:\/\/location\//i.test(payload)) {
      return {
        kind: 'error',
        reason: 'unsupported',
        message: 'This indiafoss:// link type is not supported.',
      };
    }
    const locationId = parseLocationPayload(payload);
    if (!locationId) {
      return {
        kind: 'error',
        reason: 'malformed',
        message: 'The location link is malformed.',
      };
    }
    return { kind: 'location', locationId };
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

  return {
    kind: 'error',
    reason: 'unsupported',
    message: 'This code is not an IndiaFOSS location or contact card.',
  };
}
