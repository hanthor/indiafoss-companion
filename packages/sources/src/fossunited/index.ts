import type { EventBundle, EventReference } from '@indiafoss/model';
import type { EventSource, FossUnitedSourceEvent, SourceEvent } from '../types.js';
import { normalizeFossUnited } from './normalize.js';
import type { FosuEnvelope, FosuEventDoc, FosuProposalList, FosuSchedule } from './types.js';

export const FOSSU_BASE_URL = 'https://fossunited.org';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function postJson<T>(
  fetchImpl: FetchLike,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const body = new URLSearchParams(params).toString();
  const res = await fetchImpl(`${FOSSU_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`FOSS United request failed: ${path} (HTTP ${res.status})`);
  }
  const envelope = (await res.json()) as FosuEnvelope<T>;
  return envelope.message;
}

/**
 * Source adapter for the public FOSS United platform.
 *
 * Uses only guest-accessible endpoints:
 * - `fossunited.api.dashboard.get_event` (by route)
 * - `fossunited.api.schedule.get_event_schedule`
 * - `fossunited.api.proposal.get_event_proposals`
 *
 * The authenticated dashboard is intentionally never used.
 */
export class FossUnitedSource implements EventSource {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl: string = FOSSU_BASE_URL,
  ) {}

  async fetchEvent(ref: EventReference): Promise<SourceEvent> {
    const route = ref.locator;

    const event = await postJson<FosuEventDoc>(
      this.fetchImpl,
      '/api/method/fossunited.api.dashboard.get_event',
      { name: route, by_route: 'true' },
    );

    const schedule = await postJson<FosuSchedule>(
      this.fetchImpl,
      '/api/method/fossunited.api.schedule.get_event_schedule',
      { event_id: event.name },
    );

    const proposals = await postJson<FosuProposalList>(
      this.fetchImpl,
      '/api/method/fossunited.api.proposal.get_event_proposals',
      { event: event.name },
    );

    return {
      kind: 'fossunited',
      eventId: ref.id,
      event,
      schedule,
      proposals: proposals.proposals ?? [],
    };
  }

  async normalize(source: SourceEvent): Promise<EventBundle> {
    if (source.kind !== 'fossunited') {
      throw new Error(`FossUnitedSource cannot normalize source kind '${source.kind}'`);
    }
    const typed = source as FossUnitedSourceEvent;
    return normalizeFossUnited({
      eventId: typed.eventId,
      event: typed.event,
      schedule: typed.schedule,
      proposals: typed.proposals,
    });
  }
}
