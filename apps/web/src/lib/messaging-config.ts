import type { EventBundle, MessagingConfig } from '@indiafoss/model';

/**
 * Fallback messaging configuration used when an event bundle publishes no
 * `messaging` block. Organizers put the real conference rooms into the
 * bundle (see docs/messaging.md); until then attendees can still sign in,
 * search the homeserver directory, and join rooms by alias.
 */
export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  homeserver: 'https://matrix.org',
  rooms: [],
};

export function messagingConfigFor(bundle: EventBundle | null): MessagingConfig {
  return bundle?.messaging ?? DEFAULT_MESSAGING_CONFIG;
}

/** Server name shown in the sign-in form (`matrix.org` for `https://matrix.org`). */
export function homeserverLabel(homeserver: string): string {
  try {
    return new URL(homeserver).host;
  } catch {
    return homeserver;
  }
}
