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
  | 'devto';

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
