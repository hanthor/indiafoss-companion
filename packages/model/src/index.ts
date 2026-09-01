/**
 * Canonical domain model for an event bundle.
 *
 * Every external source (FOSS United, Pretalx, static files, fixtures) is
 * normalized into these types. Application components must never read raw
 * upstream structures directly.
 */

/** Everything an attendee can deliberately spend conference time doing. */
export type ActivityType =
  | 'talk'
  | 'lightning-talk'
  | 'keynote'
  | 'panel'
  | 'workshop'
  | 'bof'
  | 'devroom-session'
  | 'community-booth'
  | 'sponsor-booth'
  | 'project-booth'
  | 'hardware-booth'
  | 'hallway'
  | 'meal'
  | 'social'
  | 'rest'
  | 'custom';

export interface ExternalLink {
  label: string;
  url: string;
}

export interface Activity {
  id: string;
  /** Upstream identifier when one exists and is stable. */
  sourceId?: string;

  type: ActivityType;

  title: string;
  subtitle?: string;
  description?: string;
  keyTakeaways?: string[];
  references?: ExternalLink[];
  links?: ExternalLink[];
  audience?: string;
  proposalStatus?: string;
  sourceUrl?: string;

  /** ISO 8601 timestamps. `undefined` for flexible/unplaced activities. */
  start?: string;
  end?: string;

  flexible: boolean;
  minDurationMinutes?: number;
  preferredDurationMinutes?: number;

  locationId?: string;

  speakerIds: string[];
  tags: string[];

  trackId?: string;
  devroomId?: string;

  livestreamUrl?: string;
  recordingUrl?: string;
  slidesUrl?: string;

  cancelled?: boolean;
  delayedMinutes?: number;

  source: string;
}

export interface Person {
  id: string;
  sourceId?: string;
  name: string;
  bio?: string;
  designation?: string;
  organization?: string;
  avatarUrl?: string;
  links: ExternalLink[];
}

export type LocationKind =
  | 'room'
  | 'booth'
  | 'food'
  | 'toilet'
  | 'quiet-room'
  | 'registration'
  | 'childcare'
  | 'exit'
  | 'other';

export interface Location {
  id: string;
  name: string;
  floor?: string;
  kind: LocationKind;

  /** Stable element id inside the venue SVG. */
  svgTarget?: string;
  /** Graph node ids used to route to/from this location. */
  routingNodeIds: string[];
}

export type BoothCategory =
  'community' | 'project' | 'commercial-project' | 'hardware' | 'sponsor' | 'student' | 'other';

export interface Booth {
  id: string;
  name: string;
  category: BoothCategory;

  description?: string;
  website?: string;

  locationId?: string;
  tags: string[];
}

export interface Track {
  id: string;
  name: string;
}

export interface SourceMetadata {
  /** Identifier of the adapter that produced this bundle (e.g. `fossunited`). */
  source: string;
  /** Upstream revision/timestamp, when available. */
  sourceUpdatedAt?: string;
  /** Version of the normalizer that produced the bundle. */
  normalizerVersion: string;
}

export interface EventBundle {
  schemaVersion: number;
  id: string;

  name: string;
  /** IANA timezone, e.g. `Asia/Kolkata`. Never rely on browser-local time. */
  timezone: string;

  /** ISO 8601 timestamps. */
  start: string;
  end: string;

  activities: Activity[];
  people: Person[];
  locations: Location[];
  booths: Booth[];
  tracks: Track[];

  sourceMetadata: SourceMetadata;
}

/** Current supported bundle schema version. */
export const EVENT_BUNDLE_SCHEMA_VERSION = 1;

/** Minimum information required to address an event from a source. */
export interface EventReference {
  id: string;
  /** Adapter-specific locator (URL, slug, fixture path, ...). */
  locator: string;
}

export { attendeeProfileToVCard, DEFAULT_ATTENDEE_SHARE_SELECTION } from './contact.js';
export type { AttendeeProfile, AttendeeShareSelection, AttendeeSocial } from './contact.js';
export {
  MAX_SCAN_PAYLOAD_BYTES,
  parseLocationPayload,
  parseScannedPayload,
  parseVCard,
} from './scan.js';
export type {
  ScannedContact,
  ScannedLocation,
  ScannedPayload,
  ScanError,
  ScanErrorReason,
} from './scan.js';
export { collectBundleIssues, isValidEventBundle } from './validation.js';
