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
];

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
    matrixId: false,
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
      profileState.profile = JSON.parse(savedProfile) as AttendeeProfile;
    } catch {
      // Ignore malformed local data and keep a clean empty profile.
    }
  }
  if (savedSelection) {
    try {
      profileState.selection = JSON.parse(savedSelection) as AttendeeShareSelection;
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
