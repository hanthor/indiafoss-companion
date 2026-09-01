import type { EventBundle, EventReference } from '@indiafoss/model';
import type { EventSource, FossUnitedSourceEvent, SourceEvent } from '../types.js';
import { normalizeFossUnited } from './normalize.js';
import { parseProposalDetail } from './parse-proposal.js';
import type {
  FosuEnvelope,
  FosuEventDoc,
  FosuProposal,
  FosuProposalDetail,
  FosuProposalList,
  FosuSchedule,
} from './types.js';

export const FOSSU_BASE_URL = 'https://fossunited.org';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function postJson<T>(
  fetchImpl: FetchLike,
  baseUrl: string,
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const body = new URLSearchParams(params).toString();
  const res = await fetchImpl(`${baseUrl}${path}`, {
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

async function fetchProposalDetails(
  fetchImpl: FetchLike,
  baseUrl: string,
  schedule: FosuSchedule,
  proposals: FosuProposal[],
): Promise<Record<string, FosuProposalDetail>> {
  const proposalById = new Map(proposals.map((proposal) => [proposal.name, proposal]));
  const linkedIds = new Set<string>();
  for (const halls of Object.values(schedule)) {
    for (const sessions of Object.values(halls)) {
      for (const session of sessions) {
        if (session.linked_cfp && proposalById.has(session.linked_cfp))
          linkedIds.add(session.linked_cfp);
      }
    }
  }

  const details: Record<string, FosuProposalDetail> = {};
  const ids = [...linkedIds];
  // Keep event-sync polite: public pages are fetched in small batches.
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8);
    const results = await Promise.all(
      batch.map(async (id) => {
        const proposal = proposalById.get(id);
        if (!proposal?.route) return null;
        const sourceUrl = new URL(proposal.route.replace(/^\//, ''), `${baseUrl}/`).toString();
        try {
          const response = await fetchImpl(sourceUrl);
          if (!response.ok) return null;
          return parseProposalDetail(await response.text(), id, sourceUrl);
        } catch {
          // Detail enrichment is optional; the schedule remains usable if one
          // public proposal page is unavailable or changes shape.
          return null;
        }
      }),
    );
    for (const detail of results) {
      if (detail) details[detail.proposalId] = detail;
    }
  }
  return details;
}

/**
 * Source adapter for the public FOSS United platform.
 *
 * Uses guest-accessible endpoints only:
 * - `fossunited.api.dashboard.get_event` (by route)
 * - `fossunited.api.schedule.get_event_schedule`
 * - `fossunited.api.proposal.get_event_proposals`
 * - public proposal detail pages for optional enrichment
 */
export class FossUnitedSource implements EventSource {
  private readonly baseUrl: string;

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    baseUrl: string = FOSSU_BASE_URL,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async fetchEvent(ref: EventReference): Promise<SourceEvent> {
    const event = await postJson<FosuEventDoc>(
      this.fetchImpl,
      this.baseUrl,
      '/api/method/fossunited.api.dashboard.get_event',
      { name: ref.locator, by_route: 'true' },
    );

    const schedule = await postJson<FosuSchedule>(
      this.fetchImpl,
      this.baseUrl,
      '/api/method/fossunited.api.schedule.get_event_schedule',
      { event_id: event.name },
    );

    const proposalList = await postJson<FosuProposalList>(
      this.fetchImpl,
      this.baseUrl,
      '/api/method/fossunited.api.proposal.get_event_proposals',
      { event: event.name },
    );
    const proposals = proposalList.proposals ?? [];
    const proposalDetails = await fetchProposalDetails(
      this.fetchImpl,
      this.baseUrl,
      schedule,
      proposals,
    );

    return {
      kind: 'fossunited',
      eventId: ref.id,
      event,
      schedule,
      proposals,
      proposalDetails,
      booths: [],
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
      proposalDetails: typed.proposalDetails,
      booths: typed.booths,
    });
  }
}
