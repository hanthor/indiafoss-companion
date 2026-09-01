/**
 * Raw response shapes from the public FOSS United platform API.
 *
 * These types are the adapter boundary. Nothing outside `sources/fossunited`
 * may read them; application code only sees the canonical model.
 */

/** Response envelope for guest-whitelisted frappe methods. */
export interface FosuEnvelope<T> {
  message: T;
}

export interface FosuEventDoc {
  name: string;
  doctype?: string;
  event_name: string;
  event_type?: string;
  /** Frappe datetime string, e.g. "2025-09-20 09:00:00". */
  event_start_date?: string;
  event_end_date?: string;
  event_location?: string;
  route?: string;
  event_permalink?: string;
  /** Newline-separated list of hall names. */
  hall_options?: string;
  map_link?: string;
  livestream_link?: string;
  event_description?: string;
  event_bio?: string;
  banner_image?: string;
  event_logo?: string;
  modified?: string;
  is_published?: boolean;
}

export interface FosuSpeaker {
  parent?: string;
  full_name?: string;
  designation?: string;
  organization?: string;
  bio?: string;
  photo?: string;
  social_link?: string;
}

export interface FosuScheduleSession {
  /** Frappe child-table row name; stable upstream id. */
  name: string;
  title?: string;
  talk_title?: string;
  proposal_title?: string;
  /** "YYYY-MM-DD" */
  scheduled_date: string;
  /** "H:MM:SS" */
  start_time: string;
  end_time: string;
  hall?: string;
  category?: string;
  other_category?: string;
  /** Proposal (CFP submission) docname, when linked. */
  linked_cfp?: string;
  schedule_description?: string;
  speaker?: string;
  talk_video?: string;
  cfp_route?: string;
  cfp_speakers?: FosuSpeaker[];
  day?: number;
}

/** date ("YYYY-MM-DD") -> hall name -> sessions. */
export type FosuSchedule = Record<string, Record<string, FosuScheduleSession[]>>;

export interface FosuProposal {
  name: string;
  route?: string;
  talk_title?: string;
  session_type?: string;
  status?: string;
  session_categories?: string;
  intended_audience?: string;
  is_first_talk?: string;
  _likes?: number;
  _speaker?: FosuSpeaker[];
  custom_question_1?: string;
}

/** Response of `fossunited.api.proposal.get_event_proposals`. */
export interface FosuProposalList {
  proposals: FosuProposal[];
  custom_questions?: unknown[];
  event_name?: string;
  event_route?: string;
}
