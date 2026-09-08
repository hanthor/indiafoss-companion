import { CompanionStorage } from '@indiafoss/storage';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/** The attendee's manually selected / QR-scanned location (§28). */
export const currentLocation = $state<{ value: string | null }>({ value: null });

let hydrated = false;

let hydration: Promise<void> | null = null;
export async function hydrateLocation(): Promise<void> {
  if (hydrated) return;
  hydration ??= (async () => {
    const saved = (await getStorage().getSetting('current-location')) || null;
    if (!hydrated) currentLocation.value = saved;
    hydrated = true;
  })().finally(() => {
    hydration = null;
  });
  await hydration;
}

export async function setCurrentLocation(locationId: string | null): Promise<void> {
  hydrated = true;
  currentLocation.value = locationId;
  await getStorage().setSetting('current-location', locationId ?? '');
}

/** Parse a location deep link (`indiafoss://location/<id>` or `?at=<id>`). */
export function locationIdFromDeepLink(input: string): string | null {
  const match = input.match(/location\/([a-z0-9-]+)/i);
  if (match) return match[1]!;
  return null;
}
