/**
 * Parse a public FOSS United profile page (`https://fossunited.org/u/<username>`)
 * into the fields the companion's contact card needs.
 *
 * The page is server-rendered Frappe HTML with no JSON payload, so this reads
 * the stable landmarks: the `<meta name="title">` pair (`Name | username`), the
 * profile header (`h4` name, location, personal site) and the
 * `header-section--socials` block whose links carry `rel="me"`. Pure and
 * fixture-tested; no network here.
 */

export type ProfileSocialNetwork =
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

export interface FossUnitedProfile {
  username?: string;
  fullName?: string;
  /** Free-text location line ("Lucknow"). */
  location?: string;
  /** Personal site linked in the header, when it is not one of the socials. */
  website?: string;
  /** Plain-text "About" paragraph. */
  bio?: string;
  avatarUrl?: string;
  socials: Partial<Record<ProfileSocialNetwork, string>>;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  const value = match?.[1];
  return value === undefined ? undefined : decodeEntities(value).trim() || undefined;
}

/** Classify a link on a profile page into a known network. */
export function socialNetworkFor(url: string): ProfileSocialNetwork | null {
  let host: string;
  let path: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    path = parsed.pathname;
  } catch {
    return null;
  }
  if (host === 'github.com') return 'github';
  if (host === 'gitlab.com') return 'gitlab';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  if (host === 'bsky.app' || host === 'bsky.social') return 'bluesky';
  if (host === 'x.com' || host === 'twitter.com') return 'x';
  if (host === 'instagram.com') return 'instagram';
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
  if (host === 'medium.com') return 'medium';
  if (host === 'dev.to') return 'devto';
  // Mastodon is federated: any host serving an @handle path counts.
  if (/^\/@[^/]+\/?$/.test(path)) return 'mastodon';
  return null;
}

/** The `<meta name="title">` value is `Full Name | username`. */
function splitMetaTitle(value: string): { fullName?: string; username?: string } {
  const [name, username] = value.split('|').map((part) => part.trim());
  return { fullName: name || undefined, username: username || undefined };
}

export function parseFossUnitedProfile(html: string): FossUnitedProfile {
  const socials: Partial<Record<ProfileSocialNetwork, string>> = {};
  const profile: FossUnitedProfile = { socials };

  const metaTitle = /<meta[^>]*name="title"[^>]*>/i.exec(html)?.[0];
  if (metaTitle) {
    const content = attr(metaTitle, 'content');
    if (content) Object.assign(profile, splitMetaTitle(decodeEntities(content)));
  }

  // The header <h4> is the display name; prefer it over the meta title.
  const heading = /<h4[^>]*>([\s\S]*?)<\/h4>/i.exec(html)?.[1];
  if (heading) {
    const name = text(heading);
    if (name) profile.fullName = name;
  }

  const avatar = /<img[^>]*class="[^"]*header-profile-image[^"]*"[^>]*>/i.exec(html)?.[0];
  if (avatar) profile.avatarUrl = attr(avatar, 'src');

  const headerBlock = /class="header--username-location"[\s\S]*?<\/div>\s*<\/div>/i.exec(html)?.[0];
  if (headerBlock) {
    const location = /ti-map-pin[^>]*>[\s\S]*?<\/i>([^<]*)/i.exec(headerBlock)?.[1];
    if (location && text(location)) profile.location = text(location);
    const site = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i.exec(headerBlock)?.[1];
    if (site) profile.website = decodeEntities(site).trim();
  }

  const socialBlock = /class="header-section--socials"[\s\S]*?<\/div>/i.exec(html)?.[0];
  if (socialBlock) {
    for (const anchor of socialBlock.match(/<a\b[^>]*>/gi) ?? []) {
      const href = attr(anchor, 'href');
      if (!href) continue;
      const network = socialNetworkFor(href);
      if (network && !socials[network]) socials[network] = href;
    }
  }

  const about = /<div[^>]*class="[^"]*\babout\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  if (about) {
    const bio = text(about);
    if (bio) profile.bio = bio;
  }

  // A personal site that is really a social link belongs in socials, not website.
  if (profile.website) {
    const network = socialNetworkFor(profile.website);
    if (network) {
      socials[network] ??= profile.website;
      delete profile.website;
    }
  }

  return profile;
}

/** `https://fossunited.org/u/<username>` → `<username>`; null for anything else. */
export function usernameFromProfileUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.hostname.replace(/^www\./, '') !== 'fossunited.org') return null;
    if (!parsed.pathname.startsWith('/u/')) return null;
    const username = parsed.pathname.slice(3).replace(/\/+$/, '');
    return /^[A-Za-z0-9._-]+$/.test(username) ? username : null;
  } catch {
    return null;
  }
}

export function profileUrlForUsername(username: string): string {
  return `https://fossunited.org/u/${encodeURIComponent(username)}`;
}
