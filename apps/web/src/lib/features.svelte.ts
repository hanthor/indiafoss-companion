import { browser } from '$app/environment';
import { CompanionStorage } from '@indiafoss/storage';

const CHAT_KEY = 'feature-chat';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/**
 * Optional features the attendee switches on explicitly. The companion is the
 * product; peer-to-peer chat is an add-on that stays completely inert (no tab,
 * no session, no mesh node, no network calls) until `chat` is true.
 */
export const features = $state<{ chat: boolean; loaded: boolean }>({
  chat: false,
  loaded: false,
});

let hydrating: Promise<void> | null = null;

export function hydrateFeatures(): Promise<void> {
  if (!browser) return Promise.resolve();
  hydrating ??= (async () => {
    features.chat = (await getStorage().getSetting(CHAT_KEY)) === 'on';
    features.loaded = true;
  })();
  return hydrating;
}

export async function setChatEnabled(on: boolean): Promise<void> {
  features.chat = on;
  await getStorage().setSetting(CHAT_KEY, on ? 'on' : 'off');
}
