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
  | 'signal'
  | 'xmpp'
  | 'deltachat';

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
  /**
   * Public picture, as an https URL: imported from a FOSS United or GitHub
   * profile, or derived (`avatarUrlFor`). Never uploaded by the app.
   */
  avatarUrl?: string;
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
  /** On by default: the card carries a `PHOTO` link when a public picture is known. */
  photo?: boolean;
  socials: Partial<Record<AttendeeSocial, boolean>>;
}

export const DEFAULT_ATTENDEE_SHARE_SELECTION: AttendeeShareSelection = {
  name: true,
  organization: true,
  email: false,
  phone: false,
  website: true,
  // Companion extras: the mesh id is what lets a scanned contact message you at
  // the venue, and a Matrix id is only ever entered in order to be reached on it.
  matrixId: true,
  neutrinoServerName: true,
  ticketRef: false,
  fossUnitedProfileUrl: true,
  photo: true,
  // Public developer profiles are what people actually swap at a FOSS conference.
  socials: { github: true, linkedin: true },
};

/** GitHub username from a profile URL or a bare handle; null for organisations' sub-pages etc. */
export function githubUsername(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const fromUrl = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i,
  );
  const raw = fromUrl?.[1] ?? trimmed.match(/^@?([A-Za-z0-9-]{1,39})$/)?.[1] ?? null;
  return raw && !/^(orgs|sponsors|features|topics|about)$/i.test(raw) ? raw : null;
}

/** GitHub serves every user's avatar at a stable public address. */
export function githubAvatarUrl(github: string | undefined, size = 160): string | null {
  const user = githubUsername(github);
  return user ? `https://github.com/${user}.png?size=${size}` : null;
}

/**
 * The picture for a card or a saved contact (#95), in order of preference:
 * one the profile states (imported from FOSS United or GitHub, or scanned
 * from a card's `PHOTO`), the GitHub avatar when a GitHub link is present and
 * shared, then a Gravatar the caller has already hashed (only ever when the
 * email is shared, since the hash identifies it). Null when nothing is known:
 * the UI falls back to the key badge.
 */
export function avatarUrlFor(
  profile: { avatarUrl?: string; socials?: Partial<Record<AttendeeSocial, string>> },
  options: { shareGithub?: boolean; gravatarUrl?: string | null } = {},
): string | null {
  if (profile.avatarUrl && /^https:\/\//i.test(profile.avatarUrl)) return profile.avatarUrl.trim();
  if (options.shareGithub !== false) {
    const github = githubAvatarUrl(profile.socials?.github);
    if (github) return github;
  }
  return options.gravatarUrl ?? null;
}

/** Gravatar address for an email (SHA-256, the current Gravatar scheme); `d=404` so a missing one stays blank. */
export async function gravatarUrl(email: string | undefined, size = 160): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes('@') || !globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(normalized),
  );
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `https://gravatar.com/avatar/${hex}?s=${size}&d=404`;
}

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
  options?: { gravatarUrl?: string | null },
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
    pushField(lines, 'X-INDIAFOSS-MATRIX', profile.matrixId);
    if (profile.matrixId?.trim()) pushField(lines, 'IMPP', `matrix:${profile.matrixId}`);
  }
  if (selection.neutrinoServerName) {
    pushField(lines, 'X-INDIAFOSS-MESH', profile.neutrinoServerName);
  }
  if (selection.ticketRef) pushField(lines, 'X-INDIAFOSS-TICKET', profile.ticketRef);
  if (selection.photo !== false) {
    // A link, never the bytes: a QR cannot carry an image, and the address is
    // one the network already serves publicly.
    const photo = avatarUrlFor(profile, {
      shareGithub: Boolean(selection.socials.github),
      gravatarUrl: selection.email ? (options?.gravatarUrl ?? null) : null,
    });
    if (photo) lines.push(`PHOTO;VALUE=URI:${escapeVCard(photo)}`);
  }

  for (const [network, enabled] of Object.entries(selection.socials)) {
    if (!enabled) continue;
    const url = profile.socials[network as AttendeeSocial];
    if (!url) continue;
    lines.push(`X-SOCIALPROFILE;TYPE=${network}:${escapeVCard(url)}`);
    // XMPP is also an IM address other address books understand.
    if (network === 'xmpp') pushField(lines, 'IMPP', `xmpp:${url.replace(/^xmpp:/i, '')}`);
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
    | 'fossunited'
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
  fossUnitedProfileUrl?: string;
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
  // XMPP (Prav and any other server): a JID, with or without the xmpp: scheme.
  const jid = socials.xmpp?.trim().replace(/^xmpp:/i, '');
  if (jid && /^[^@\s/]+@[^@\s/]+$/.test(jid)) {
    links.push({ kind: 'xmpp', label: 'XMPP', href: `xmpp:${jid}` });
  }
  // Delta Chat: an invite link from the app, or the address it is reached at.
  const delta = socials.deltachat?.trim();
  if (delta && /^https:\/\/i\.delta\.chat\//i.test(delta)) {
    links.push({ kind: 'deltachat', label: 'Delta Chat', href: delta });
  } else if (delta && /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(delta)) {
    links.push({ kind: 'deltachat', label: 'Delta Chat', href: `mailto:${delta}` });
  }
  if (profile.website && /^https?:\/\//i.test(profile.website)) {
    links.push({ kind: 'website', label: 'Website', href: profile.website.trim() });
  }
  // The FOSS United profile is one more public profile, shown like the others (#96).
  if (profile.fossUnitedProfileUrl && /^https?:\/\//i.test(profile.fossUnitedProfileUrl)) {
    links.push({
      kind: 'fossunited',
      label: 'FOSS United',
      href: profile.fossUnitedProfileUrl.trim(),
    });
  }
  for (const [network, url] of Object.entries(socials) as [AttendeeSocial, string][]) {
    if (['telegram', 'whatsapp', 'signal', 'xmpp', 'deltachat'].includes(network)) continue;
    // Fediverse handles (@user@instance) are how people actually say their Mastodon.
    const handle =
      network === 'mastodon' ? url?.trim().match(/^@?([^@\s/]+)@([^@\s/]+\.[^@\s/]+)$/) : null;
    if (handle) {
      links.push({
        kind: 'mastodon',
        label: 'Mastodon',
        href: `https://${handle[2]}/@${handle[1]}`,
      });
      continue;
    }
    if (url && /^https?:\/\//i.test(url))
      links.push({ kind: network, label: LINK_LABELS[network], href: url.trim() });
  }
  return sortLinks(links);
}

export type LinkKind = ContactLink['kind'];

/** Display order: what people look for first at a FOSS conference. */
const LINK_ORDER: LinkKind[] = [
  'website',
  'fossunited',
  'github',
  'gitlab',
  'linkedin',
  'mastodon',
  'bluesky',
  'x',
  'matrix',
  'xmpp',
  'deltachat',
  'telegram',
  'whatsapp',
  'signal',
  'email',
  'phone',
  'sms',
  'youtube',
  'medium',
  'devto',
  'instagram',
];

export const LINK_LABELS: Record<LinkKind, string> = {
  website: 'Website',
  fossunited: 'FOSS United',
  github: 'GitHub',
  gitlab: 'GitLab',
  linkedin: 'LinkedIn',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  x: 'X',
  matrix: 'Matrix',
  xmpp: 'XMPP',
  deltachat: 'Delta Chat',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  email: 'Email',
  phone: 'Call',
  sms: 'SMS',
  youtube: 'YouTube',
  medium: 'Medium',
  devto: 'dev.to',
  instagram: 'Instagram',
};

/**
 * Classify a public URL by host. Speaker links from FOSS United arrive with
 * the generic label "social", so the host is the only signal. Anything that is
 * not a known network is a personal website.
 */
export function classifyLink(url: string): LinkKind | null {
  let host: string;
  let path: string;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      if (parsed.protocol === 'mailto:') return 'email';
      if (parsed.protocol === 'tel:') return 'phone';
      if (parsed.protocol === 'xmpp:') return 'xmpp';
      return null;
    }
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    path = parsed.pathname;
  } catch {
    return null;
  }
  const is = (...domains: string[]) => domains.some((d) => host === d || host.endsWith(`.${d}`));
  if (is('fossunited.org') && /^\/u\/[^/]+\/?$/.test(path)) return 'fossunited';
  if (is('github.com')) return 'github';
  if (is('gitlab.com')) return 'gitlab';
  if (is('linkedin.com')) return 'linkedin';
  if (is('x.com', 'twitter.com')) return 'x';
  if (is('bsky.app')) return 'bluesky';
  if (is('youtube.com', 'youtu.be')) return 'youtube';
  if (is('medium.com')) return 'medium';
  if (is('dev.to')) return 'devto';
  if (is('instagram.com')) return 'instagram';
  if (is('t.me', 'telegram.me')) return 'telegram';
  if (is('wa.me')) return 'whatsapp';
  if (is('signal.me')) return 'signal';
  if (is('matrix.to')) return 'matrix';
  if (is('i.delta.chat')) return 'deltachat';
  // Fediverse: profile paths look like /@user on any instance.
  if (
    /^\/@[^/]+\/?$/.test(path) ||
    is('fosstodon.org', 'mastodon.social', 'mastodon.online', 'hachyderm.io', 'infosec.exchange')
  ) {
    return 'mastodon';
  }
  return 'website';
}

/** Speaker / booth links from the bundle as labelled, ordered, tappable links. */
export function linksFromUrls(links: { label?: string; url: string }[]): ContactLink[] {
  const out: ContactLink[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const kind = classifyLink(link.url);
    if (!kind || seen.has(link.url)) continue;
    seen.add(link.url);
    const generic = !link.label || /^(social|link|url|website|profile)$/i.test(link.label);
    out.push({ kind, label: generic ? LINK_LABELS[kind] : link.label!, href: link.url.trim() });
  }
  return sortLinks(out);
}

export function sortLinks(links: ContactLink[]): ContactLink[] {
  const rank = (k: LinkKind) => {
    const i = LINK_ORDER.indexOf(k);
    return i === -1 ? LINK_ORDER.length : i;
  };
  return [...links].sort((a, b) => rank(a.kind) - rank(b.kind));
}
