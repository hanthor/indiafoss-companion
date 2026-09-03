import { CompanionStorage } from '@indiafoss/storage';

/**
 * First-run setup (#107): the welcome wizard runs once, on the first visit to
 * the home screen, and then only from Settings. The flag is local like
 * everything else; clearing site data brings the wizard back.
 */
const KEY = 'onboarding-done';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

export const onboardingState = $state<{ loaded: boolean; done: boolean }>({
  loaded: false,
  done: false,
});

export async function hydrateOnboarding(): Promise<void> {
  if (onboardingState.loaded) return;
  onboardingState.done = (await getStorage().getSetting(KEY)) === 'true';
  onboardingState.loaded = true;
}

export async function markOnboardingDone(done = true): Promise<void> {
  onboardingState.done = done;
  onboardingState.loaded = true;
  await getStorage().setSetting(KEY, done ? 'true' : 'false');
}
