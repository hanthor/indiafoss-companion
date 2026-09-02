import { parseFossUnitedProfile, usernameFromProfileUrl } from '@indiafoss/sources';
import type { FossUnitedProfile } from '@indiafoss/sources';
import type { AttendeeProfile, AttendeeSocial } from '@indiafoss/model';

export type ImportFailure = 'invalid-url' | 'not-found' | 'blocked' | 'network';

export interface ImportResult {
  ok: boolean;
  profile?: FossUnitedProfile;
  failure?: ImportFailure;
}

/**
 * Fetch a public FOSS United profile page.
 *
 * fossunited.org sends `Access-Control-Allow-Origin: https://fossunited.org`, so
 * a browser cannot read it from our origin. The Android app goes through
 * `CapacitorHttp`, which performs the request natively and is not subject to
 * CORS; on the web the attempt is made anyway (in case the header changes) and
 * a `blocked` failure is reported so the UI can explain it.
 */
async function fetchProfileHtml(url: string): Promise<{ html?: string; failure?: ImportFailure }> {
  try {
    const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url, headers: { Accept: 'text/html' } });
      if (res.status === 404) return { failure: 'not-found' };
      if (res.status < 200 || res.status >= 300) return { failure: 'network' };
      return { html: typeof res.data === 'string' ? res.data : String(res.data ?? '') };
    }
  } catch {
    // Not running under Capacitor; fall through to fetch.
  }
  try {
    const res = await fetch(url, { headers: { Accept: 'text/html' } });
    if (res.status === 404) return { failure: 'not-found' };
    if (!res.ok) return { failure: 'network' };
    return { html: await res.text() };
  } catch {
    // A cross-origin block and an offline device are indistinguishable here;
    // the browser reports both as a TypeError.
    return { failure: navigator.onLine === false ? 'network' : 'blocked' };
  }
}

export async function importFossUnitedProfile(url: string): Promise<ImportResult> {
  const username = usernameFromProfileUrl(url);
  if (!username) return { ok: false, failure: 'invalid-url' };
  const { html, failure } = await fetchProfileHtml(`https://fossunited.org/u/${username}`);
  if (!html) return { ok: false, failure: failure ?? 'network' };
  const profile = parseFossUnitedProfile(html);
  if (!profile.fullName && Object.keys(profile.socials).length === 0) {
    return { ok: false, failure: 'not-found' };
  }
  return { ok: true, profile };
}

export const IMPORT_MESSAGES: Record<ImportFailure, string> = {
  'invalid-url': 'Enter a profile URL like https://fossunited.org/u/your_username.',
  'not-found': 'No public profile at that URL. Check the username on fossunited.org.',
  blocked:
    'Your browser blocks reading fossunited.org from this app. The Android app imports it directly; on the web, fill the fields in below.',
  network: 'Could not reach fossunited.org. Check your connection and try again.',
};

export interface ImportedChange {
  field: string;
  value: string;
}

/**
 * Merge an imported profile into the attendee's card without clobbering
 * anything they typed: only empty fields are filled. Returns what changed so
 * the UI can show it.
 */
export function applyImportedProfile(
  target: AttendeeProfile,
  imported: FossUnitedProfile,
): ImportedChange[] {
  const changes: ImportedChange[] = [];
  if (imported.fullName && !target.fullName.trim()) {
    target.fullName = imported.fullName;
    changes.push({ field: 'Name', value: imported.fullName });
  }
  if (imported.website && !target.website?.trim()) {
    target.website = imported.website;
    changes.push({ field: 'Website', value: imported.website });
  }
  for (const [network, value] of Object.entries(imported.socials)) {
    const key = network as AttendeeSocial;
    if (!value || target.socials[key]?.trim()) continue;
    target.socials[key] = value;
    changes.push({ field: network, value });
  }
  return changes;
}
