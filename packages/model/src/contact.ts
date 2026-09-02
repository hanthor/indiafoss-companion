export type AttendeeSocial =
  | 'github'
  | 'gitlab'
  | 'linkedin'
  | 'mastodon'
  | 'bluesky'
  | 'x'
  | 'instagram'
  | 'youtube'
  | 'medium'
  | 'devto'
  | 'telegram'
  | 'whatsapp'
  | 'signal';

/** Local projection of the attendee's FOSS United profile (§41). */
export interface AttendeeProfile {
  fullName: string;
  organization?: string;
  email?: string;
  phone?: string;
  website?: string;
  /** Matrix user id, explicitly entered/associated by the attendee (never imported). */
  matrixId?: string;
  /**
   * Neutrino P2P node identity: the 64-hex `server_name` of the embedded
   * homeserver. Distinct from the Matrix id and never interchangeable with it.
   */
  neutrinoServerName?: string;
  /** Event-scoped ticket reference (`ticket::<id>`); a correlation key, never an identity. */
  ticketRef?: string;
  fossUnitedProfileUrl?: string;
  socials: Partial<Record<AttendeeSocial, string>>;
}

/** Explicit field selection for local contact sharing. */
export interface AttendeeShareSelection {
  name: boolean;
  organization: boolean;
  email: boolean;
  phone: boolean;
  website: boolean;
  matrixId: boolean;
  /** Off by default: Neutrino identity and ticket reference are opt-in per share. */
  neutrinoServerName?: boolean;
  ticketRef?: boolean;
  fossUnitedProfileUrl: boolean;
  socials: Partial<Record<AttendeeSocial, boolean>>;
}

export const DEFAULT_ATTENDEE_SHARE_SELECTION: AttendeeShareSelection = {
  name: true,
  organization: true,
  email: false,
  phone: false,
  website: true,
  matrixId: false,
  neutrinoServerName: false,
  ticketRef: false,
  fossUnitedProfileUrl: true,
  socials: {},
};

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([,;])/g, '\\$1')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function pushField(lines: string[], field: string, value: string | undefined): void {
  if (value?.trim()) lines.push(`${field}:${escapeVCard(value.trim())}`);
}

/**
 * Generate a static vCard 3.0 payload for QR/download sharing (§41–§42).
 * The payload contains only fields explicitly selected by the attendee.
 */
export function attendeeProfileToVCard(
  profile: AttendeeProfile,
  selection: AttendeeShareSelection = DEFAULT_ATTENDEE_SHARE_SELECTION,
): string {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (selection.name) {
    pushField(lines, 'FN', profile.fullName);
    const nameParts = profile.fullName.trim().split(/\s+/);
    const family = nameParts.pop() ?? '';
    const given = nameParts.join(' ');
    lines.push(`N:${escapeVCard(family)};${escapeVCard(given)};;;`);
  }
  if (selection.organization) pushField(lines, 'ORG', profile.organization);
  if (selection.email) pushField(lines, 'EMAIL;TYPE=INTERNET', profile.email);
  if (selection.phone) pushField(lines, 'TEL;TYPE=CELL', profile.phone);
  if (selection.website) pushField(lines, 'URL;TYPE=website', profile.website);
  if (selection.fossUnitedProfileUrl) {
    pushField(lines, 'URL;TYPE=profile', profile.fossUnitedProfileUrl);
    pushField(lines, 'X-FOSSUNITED-PROFILE', profile.fossUnitedProfileUrl);
  }
  if (selection.matrixId) {
    pushField(lines, 'X-MATRIX-ID', profile.matrixId);
    if (profile.matrixId?.trim()) pushField(lines, 'IMPP', `matrix:${profile.matrixId}`);
  }
  if (selection.neutrinoServerName) {
    pushField(lines, 'X-NEUTRINO-SERVER-NAME', profile.neutrinoServerName);
  }
  if (selection.ticketRef) pushField(lines, 'X-INDIAFOSS-TICKET-REF', profile.ticketRef);

  for (const [network, enabled] of Object.entries(selection.socials)) {
    if (!enabled) continue;
    const url = profile.socials[network as AttendeeSocial];
    if (url) lines.push(`X-SOCIALPROFILE;TYPE=${network}:${escapeVCard(url)}`);
  }

  lines.push('END:VCARD');
  return `${lines.join('\r\n')}\r\n`;
}

/** A tappable way to reach a person; `href` uses the messenger's public deep-link scheme. */
export interface ContactLink {
  kind:
    | 'phone'
    | 'sms'
    | 'email'
    | 'matrix'
    | 'telegram'
    | 'whatsapp'
    | 'signal'
    | 'website'
    | AttendeeSocial;
  label: string;
  href: string;
}

const HANDLE_RE = /^@?([A-Za-z0-9_.-]{2,64})$/;

/** Digits with a leading `+` when present; `null` when it is not a phone number. */
export function normalizePhone(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\s().-]/g, '');
  return /^\+?[0-9]{6,15}$/.test(cleaned) ? cleaned : null;
}

/** Username from a handle or profile URL (`@alice`, `t.me/alice`, `https://t.me/alice`). */
export function messengerHandle(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const fromUrl = trimmed.match(
    /(?:t\.me|telegram\.me|signal\.me\/#u)\/([A-Za-z0-9_.-]{2,64})/i,
  )?.[1];
  const raw = fromUrl ?? trimmed.match(HANDLE_RE)?.[1] ?? null;
  return raw;
}

/**
 * Deep links for every reachable identity on a profile or saved contact.
 * Only public, well-documented schemes are generated (t.me, wa.me, signal.me,
 * matrix.to, tel:, sms:, mailto:); unparseable values are skipped rather than
 * guessed.
 */
export function contactDeepLinks(profile: {
  phone?: string;
  email?: string;
  website?: string;
  matrixId?: string;
  socials?: Partial<Record<AttendeeSocial, string>>;
}): ContactLink[] {
  const links: ContactLink[] = [];
  const phone = normalizePhone(profile.phone);
  if (phone) {
    links.push({ kind: 'phone', label: 'Call', href: `tel:${phone}` });
    links.push({ kind: 'sms', label: 'SMS', href: `sms:${phone}` });
  }
  if (profile.email?.includes('@')) {
    links.push({ kind: 'email', label: 'Email', href: `mailto:${profile.email.trim()}` });
  }
  if (profile.matrixId && /^@[^:\s]+:[^\s]+$/.test(profile.matrixId)) {
    links.push({
      kind: 'matrix',
      label: 'Matrix',
      href: `https://matrix.to/#/${encodeURIComponent(profile.matrixId)}`,
    });
  }
  const socials = profile.socials ?? {};
  const telegram = messengerHandle(socials.telegram);
  if (telegram)
    links.push({ kind: 'telegram', label: 'Telegram', href: `https://t.me/${telegram}` });
  const whatsapp = normalizePhone(socials.whatsapp) ?? (socials.whatsapp ? null : phone);
  if (whatsapp)
    links.push({
      kind: 'whatsapp',
      label: 'WhatsApp',
      href: `https://wa.me/${whatsapp.replace(/^\+/, '')}`,
    });
  const signal = normalizePhone(socials.signal);
  const signalHandle = signal ? null : messengerHandle(socials.signal);
  if (signal)
    links.push({
      kind: 'signal',
      label: 'Signal',
      href: `https://signal.me/#p/${signal.startsWith('+') ? signal : `+${signal}`}`,
    });
  else if (signalHandle)
    links.push({ kind: 'signal', label: 'Signal', href: `https://signal.me/#u/${signalHandle}` });
  if (profile.website && /^https?:\/\//i.test(profile.website)) {
    links.push({ kind: 'website', label: 'Website', href: profile.website.trim() });
  }
  for (const [network, url] of Object.entries(socials) as [AttendeeSocial, string][]) {
    if (network === 'telegram' || network === 'whatsapp' || network === 'signal') continue;
    if (url && /^https?:\/\//i.test(url))
      links.push({ kind: network, label: network, href: url.trim() });
  }
  return links;
}
