import { githubUsername } from '@indiafoss/model';
import type { ImportFailure, ImportedProfile } from '$lib/fossunited';

/**
 * Read a public GitHub profile through the REST API (#96). `api.github.com`
 * answers browsers from any origin, so unlike fossunited.org this works on
 * the web too; unauthenticated calls are limited to 60 an hour per address,
 * which a one-off "fill my card" never approaches.
 */
export interface GithubImportResult {
  ok: boolean;
  profile?: ImportedProfile;
  failure?: ImportFailure | 'rate-limited';
}

interface GithubUser {
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  avatar_url?: string | null;
  twitter_username?: string | null;
  html_url?: string | null;
}

export function profileFromGithubUser(user: GithubUser): ImportedProfile {
  const profile: ImportedProfile = { socials: {} };
  if (user.name?.trim()) profile.fullName = user.name.trim();
  // "@fossunited" is how people write their org on GitHub.
  if (user.company?.trim()) profile.organization = user.company.trim().replace(/^@/, '');
  const blog = user.blog?.trim();
  if (blog) profile.website = /^https?:\/\//i.test(blog) ? blog : `https://${blog}`;
  if (user.avatar_url?.startsWith('https://')) profile.avatarUrl = user.avatar_url;
  if (user.html_url?.startsWith('https://')) profile.socials.github = user.html_url;
  if (user.twitter_username?.trim()) {
    profile.socials.x = `https://x.com/${user.twitter_username.trim().replace(/^@/, '')}`;
  }
  return profile;
}

export async function importGithubProfile(github: string): Promise<GithubImportResult> {
  const username = githubUsername(github);
  if (!username) return { ok: false, failure: 'invalid-url' };
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
  } catch {
    return { ok: false, failure: 'network' };
  }
  if (res.status === 404) return { ok: false, failure: 'not-found' };
  if (res.status === 403 || res.status === 429) return { ok: false, failure: 'rate-limited' };
  if (!res.ok) return { ok: false, failure: 'network' };
  return { ok: true, profile: profileFromGithubUser((await res.json()) as GithubUser) };
}
