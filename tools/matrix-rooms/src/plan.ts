import { conferenceChatAlias, homeserverName } from '@indiafoss/model';
import type { EventBundle, MessagingConfig } from '@indiafoss/model';

/** One room the organiser server should have. */
export interface RoomPlan {
  alias: string;
  name: string;
  topic: string;
  kind: 'space' | 'listed' | 'location' | 'booth' | 'session';
  /** Suggested in the space (shown first in Element's space view). */
  suggested: boolean;
}

export interface PlanOptions {
  /** One room per venue location (hall / devroom): the FOSDEM model. Default on. */
  locations?: boolean;
  /** One room per booth. Default off. */
  booths?: boolean;
  /** One room per session. Default off: hundreds of rooms nobody joins. */
  sessions?: boolean;
}

/**
 * The rooms an event bundle asks for, in creation order: the space first,
 * then the rooms the organisers listed, then generated per-location (and
 * optionally per-booth / per-session) rooms with the same deterministic
 * aliases the app links to. Pure, so it can be tested and dry-run.
 */
export function planRooms(bundle: EventBundle, options: PlanOptions = {}): RoomPlan[] {
  const config = bundle.messaging;
  if (!config) return [];
  const out: RoomPlan[] = [];
  const seen = new Set<string>();
  const add = (room: RoomPlan) => {
    if (seen.has(room.alias)) return;
    seen.add(room.alias);
    out.push(room);
  };

  if (config.space) {
    add({
      alias: config.space,
      name: bundle.name,
      topic: `${bundle.name} — all conference rooms. Join from any Matrix account.`,
      kind: 'space',
      suggested: false,
    });
  }
  for (const room of config.rooms) {
    add({
      alias: room.alias,
      name: room.name,
      topic: room.purpose ?? `${bundle.name} — ${room.name}`,
      kind: 'listed',
      suggested: room.recommended ?? false,
    });
  }
  if (options.locations !== false) {
    for (const location of bundle.locations) {
      add({
        alias: conferenceChatAlias(config, bundle.id, 'room', location.id),
        name: location.name,
        topic: `${bundle.name} — everything happening in ${location.name}`,
        kind: 'location',
        suggested: false,
      });
    }
  }
  if (options.booths) {
    for (const booth of bundle.booths) {
      add({
        alias: conferenceChatAlias(config, bundle.id, 'booth', booth.id),
        name: `Booth: ${booth.name}`,
        topic: `Talk to the ${booth.name} booth at ${bundle.name}`,
        kind: 'booth',
        suggested: false,
      });
    }
  }
  if (options.sessions) {
    for (const activity of bundle.activities) {
      if (activity.cancelled) continue;
      add({
        alias: conferenceChatAlias(config, bundle.id, 'session', activity.id),
        name: `Chat: ${activity.title}`,
        topic: `${bundle.name} session chat — ${activity.title}`,
        kind: 'session',
        suggested: false,
      });
    }
  }
  return out;
}

/** Server name aliases are created on (`reilly.asia` for `#x:reilly.asia`). */
export function aliasServer(config: MessagingConfig): string {
  return config.aliasServer ?? homeserverName(config.homeserver);
}
