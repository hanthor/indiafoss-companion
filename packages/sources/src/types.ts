import type { Booth, EventBundle, EventReference } from '@indiafoss/model';
import type {
  FosuEventDoc,
  FosuProposal,
  FosuProposalDetail,
  FosuSchedule,
} from './fossunited/types.js';

/**
 * Adapter-normalized payload, ready for conversion into the canonical
 * {@link EventBundle}. The shape is specific to each source adapter; only the
 * normalizer for that adapter understands it.
 */
export type SourceEvent = FossUnitedSourceEvent;

export interface FossUnitedSourceEvent {
  kind: 'fossunited';
  eventId: string;
  event: FosuEventDoc;
  schedule: FosuSchedule;
  proposals: FosuProposal[];
  proposalDetails: Record<string, FosuProposalDetail>;
  /** Canonical booth records from a public booth directory, when available. */
  booths?: Booth[];
}

/** Core source abstraction (§6). */
export interface EventSource {
  /** Fetch the raw event payload for a reference. */
  fetchEvent(ref: EventReference): Promise<SourceEvent>;
  /** Convert a fetched payload into the canonical bundle. */
  normalize(source: SourceEvent): Promise<EventBundle>;
}
