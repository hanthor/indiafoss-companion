import type { AttendeeProfile, AttendeeShareSelection, AttendeeSocial } from '@indiafoss/model';

/** The four groups on the Connect screen, in display order. */
export type CardGroup = 'identity' | 'links' | 'private' | 'extras';

export interface CardFieldSpec {
  /** Profile key, or the social network for `links` rows. */
  key: keyof AttendeeProfile | AttendeeSocial;
  group: CardGroup;
  label: string;
  placeholder: string;
  hint?: string;
  inputType: 'text' | 'url' | 'email' | 'tel';
  /** Monospace value (identifiers). */
  mono?: boolean;
}

export const CARD_GROUPS: Record<CardGroup, { title: string; note: string; tone?: 'amber' }> = {
  identity: { title: 'Identity', note: 'On by default' },
  links: { title: 'Links', note: 'On by default — already public' },
  private: { title: 'Private', note: 'Off by default', tone: 'amber' },
  extras: { title: 'Companion extras', note: 'Other camera apps ignore these' },
};

/** Networks shown as rows before the attendee taps "+ Add". */
export const DEFAULT_LINK_NETWORKS: AttendeeSocial[] = ['github', 'linkedin', 'mastodon'];

export const CARD_FIELDS: CardFieldSpec[] = [
  {
    key: 'fullName',
    group: 'identity',
    label: 'Name',
    placeholder: 'Your name',
    inputType: 'text',
  },
  {
    key: 'organization',
    group: 'identity',
    label: 'Organisation',
    placeholder: 'Company, project or college',
    inputType: 'text',
  },
  {
    key: 'website',
    group: 'identity',
    label: 'Website',
    placeholder: 'https://',
    inputType: 'url',
  },
  {
    key: 'fossUnitedProfileUrl',
    group: 'identity',
    label: 'FOSS United username',
    placeholder: 'your_username',
    hint: 'Just the username from fossunited.org/u/…; the card carries the profile link.',
    inputType: 'text',
  },
  {
    key: 'email',
    group: 'private',
    label: 'Email',
    placeholder: 'you@example.org',
    inputType: 'email',
  },
  {
    key: 'phone',
    group: 'private',
    label: 'Phone',
    placeholder: '+91 98765 43210',
    inputType: 'tel',
  },
  {
    key: 'neutrinoServerName',
    group: 'extras',
    label: 'Mesh id',
    placeholder: 'Set when P2P chat is on',
    hint: 'Lets someone who scans this message you over the venue mesh.',
    inputType: 'text',
    mono: true,
  },
  {
    key: 'matrixId',
    group: 'extras',
    label: 'Matrix ID',
    placeholder: '@you:matrix.org',
    hint: 'Opens in Element for a normal Matrix chat.',
    inputType: 'text',
    mono: true,
  },
  {
    key: 'ticketRef',
    group: 'extras',
    label: 'Ticket reference',
    placeholder: 'ticket::…',
    hint: 'A correlation key for organisers, never an identity.',
    inputType: 'text',
    mono: true,
  },
];

export const LINK_LABELS: Record<AttendeeSocial, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  linkedin: 'LinkedIn',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  x: 'X',
  instagram: 'Instagram',
  youtube: 'YouTube',
  medium: 'Medium',
  devto: 'dev.to',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  xmpp: 'XMPP / Prav',
  deltachat: 'Delta Chat',
};

export const LINK_PLACEHOLDERS: Record<AttendeeSocial, string> = {
  github: 'https://github.com/you',
  gitlab: 'https://gitlab.com/you',
  linkedin: 'https://linkedin.com/in/you',
  mastodon: 'https://fosstodon.org/@you',
  bluesky: 'https://bsky.app/profile/you',
  x: 'https://x.com/you',
  instagram: 'https://instagram.com/you',
  youtube: 'https://youtube.com/@you',
  medium: 'https://medium.com/@you',
  devto: 'https://dev.to/you',
  telegram: '@username',
  whatsapp: '+91 98765 43210',
  signal: '+91 98765 43210 or username.42',
  xmpp: 'you@prav.app',
  deltachat: 'Invite link from Delta Chat, or your address',
};

const SELECTION_KEY: Partial<Record<keyof AttendeeProfile, keyof AttendeeShareSelection>> = {
  fullName: 'name',
  organization: 'organization',
  email: 'email',
  phone: 'phone',
  website: 'website',
  fossUnitedProfileUrl: 'fossUnitedProfileUrl',
  matrixId: 'matrixId',
  neutrinoServerName: 'neutrinoServerName',
  ticketRef: 'ticketRef',
};

export function selectionKeyFor(key: keyof AttendeeProfile): keyof AttendeeShareSelection | null {
  return SELECTION_KEY[key] ?? null;
}

/**
 * How many non-empty fields the card currently encodes. Empty values are
 * never shared regardless of their switch, so they do not count.
 */
export function sharedFieldCount(
  profile: AttendeeProfile,
  selection: AttendeeShareSelection,
): number {
  let n = 0;
  for (const [profileKey, selKey] of Object.entries(SELECTION_KEY) as [
    keyof AttendeeProfile,
    keyof AttendeeShareSelection,
  ][]) {
    const value = profile[profileKey];
    if (typeof value === 'string' && value.trim() && selection[selKey]) n++;
  }
  for (const [network, url] of Object.entries(profile.socials)) {
    if (url?.trim() && selection.socials[network as AttendeeSocial]) n++;
  }
  return n;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
