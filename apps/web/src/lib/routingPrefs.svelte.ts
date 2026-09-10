import type { RoutingProfile } from '@indiafoss/venue';
import { CompanionStorage } from '@indiafoss/storage';

const KEY = 'routing-profile';
const VALID: RoutingProfile[] = ['fastest', 'accessible', 'avoid-stairs'];

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/**
 * The attendee's preferred routing profile (§26/§29). Persisted so it affects
 * both route output and itinerary feasibility everywhere consistently.
 */
export const routingPrefs = $state<{ profile: RoutingProfile; loaded: boolean }>({
  profile: 'fastest',
  loaded: false,
});

let hydration: Promise<void> | null = null;
export async function hydrateRoutingProfile(): Promise<void> {
  if (routingPrefs.loaded) return;
  hydration ??= (async () => {
    const saved = (await getStorage().getSetting(KEY)) as RoutingProfile | undefined;
    if (!routingPrefs.loaded && saved && VALID.includes(saved)) routingPrefs.profile = saved;
    routingPrefs.loaded = true;
  })().finally(() => {
    hydration = null;
  });
  await hydration;
}

export async function setRoutingProfile(profile: RoutingProfile): Promise<void> {
  routingPrefs.loaded = true;
  routingPrefs.profile = profile;
  await getStorage().setSetting(KEY, profile);
}
