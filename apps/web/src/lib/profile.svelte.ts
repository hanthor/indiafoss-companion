import type { AttendeeProfile, AttendeeShareSelection, AttendeeSocial } from '@indiafoss/model';
import { CompanionStorage } from '@indiafoss/storage';

const PROFILE_KEY = 'attendee-profile';
const SELECTION_KEY = 'attendee-share-selection';

export const SOCIALS: AttendeeSocial[] = [
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

/** Networks entered as a handle or phone number instead of a URL. */
export const MESSENGERS: AttendeeSocial[] = ['telegram', 'whatsapp', 'signal'];
export const SOCIAL_PLACEHOLDER: Partial<Record<AttendeeSocial, string>> = {
  telegram: '@username',
  whatsapp: '+91 98765 43210',
  signal: '+91 98765 43210 or username.42',
};

export const profileState = $state<{
  profile: AttendeeProfile;
  selection: AttendeeShareSelection;
  loaded: boolean;
}>({
  profile: { fullName: '', socials: {} },
  selection: {
    name: true,
    organization: true,
    email: false,
    phone: false,
    website: true,
    matrixId: true,
    neutrinoServerName: true,
    ticketRef: false,
    fossUnitedProfileUrl: true,
    socials: {},
  },
  loaded: false,
});

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

export async function hydrateProfile(): Promise<void> {
  if (profileState.loaded) return;
  const savedProfile = await getStorage().getSetting(PROFILE_KEY);
  const savedSelection = await getStorage().getSetting(SELECTION_KEY);
  if (savedProfile) {
    try {
      const parsed = JSON.parse(savedProfile) as Partial<AttendeeProfile>;
      profileState.profile = { fullName: '', ...parsed, socials: { ...(parsed.socials ?? {}) } };
    } catch {
      // Ignore malformed local data and keep a clean empty profile.
    }
  }
  if (savedSelection) {
    try {
      const parsed = JSON.parse(savedSelection) as Partial<AttendeeShareSelection>;
      profileState.selection = {
        ...profileState.selection,
        ...parsed,
        socials: { ...(parsed.socials ?? {}) },
      };
    } catch {
      // Ignore malformed local data and keep safe defaults.
    }
  }
  profileState.loaded = true;
}

export async function saveProfile(): Promise<void> {
  await getStorage().setSetting(PROFILE_KEY, JSON.stringify(profileState.profile));
}

export async function saveSelection(): Promise<void> {
  await getStorage().setSetting(SELECTION_KEY, JSON.stringify(profileState.selection));
}

export function usernameFromProfileUrl(url: string): string | null {
  try {
    // One-off parse of a plain string; not reactive state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const parsed = new URL(url);
    if (parsed.hostname !== 'fossunited.org' || !parsed.pathname.startsWith('/u/')) return null;
    const username = parsed.pathname.slice(3).replace(/\/$/, '');
    return username || null;
  } catch {
    return null;
  }
}

export function setSocial(network: AttendeeSocial, value: string): void {
  profileState.profile.socials[network] = value.trim();
}

export function setSocialSelection(network: AttendeeSocial, enabled: boolean): void {
  profileState.selection.socials[network] = enabled;
}
