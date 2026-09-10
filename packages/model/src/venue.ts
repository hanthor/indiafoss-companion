/**
 * Organiser-published arrival information: where the venue is and the map
 * destination the organiser chose for it. This is the *outdoor* half of
 * "how do I get there" (issue #278); indoor rooms, floors and routes live in
 * the venue asset (`events/<id>/venue/`) and are unrelated to this block.
 *
 * Everything here is copied from an organiser page and carries the page it
 * came from and the date it was checked. The map destination is a building
 * feature: it is not evidence of an entrance, an accessible route, parking or
 * transport, and the app must not present it as one.
 */

/** Version of the {@link EventVenue} block, independent of the bundle schema. */
export const EVENT_VENUE_VERSION = 1;

/** Decimal degrees, as published by the organiser (WGS 84). */
export interface VenueCoordinates {
  latitude: number;
  longitude: number;
}

export interface EventVenue {
  version: typeof EVENT_VENUE_VERSION;
  /** Venue name exactly as the organiser publishes it. */
  name: string;
  /** Postal-style address line(s) as the organiser publishes them. */
  address: string;
  city: string;
  region?: string;
  country?: string;
  /** Organiser-selected map destination, e.g. an OpenStreetMap feature link. */
  mapUrl: string;
  /** Organiser-published destination point. Marks the building, not an entrance. */
  coordinates?: VenueCoordinates;
  /** Organiser page the name, address and map link were read from. */
  sourceUrl: string;
  /** Organiser travel page, linked as-is; the app carries none of its advice. */
  travelGuideUrl?: string;
  /** Date (YYYY-MM-DD) the source page was last checked against this block. */
  checkedAt: string;
  /** Short caveat shown next to the details. */
  note?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Structural problems with a venue block. An empty list means the block is
 * safe to publish; it says nothing about whether the organiser's details are
 * still current — that is what `checkedAt` and `sourceUrl` are for.
 */
export function collectVenueIssues(venue: EventVenue): string[] {
  const issues: string[] = [];
  if (venue.version !== EVENT_VENUE_VERSION) {
    issues.push(`venue.version ${String(venue.version)} != ${EVENT_VENUE_VERSION}`);
  }
  for (const field of ['name', 'address', 'city'] as const) {
    if (!nonEmpty(venue[field])) issues.push(`venue.${field} must be a non-empty string`);
  }
  if (!isHttpsUrl(venue.mapUrl)) issues.push('venue.mapUrl must be an https URL');
  if (!isHttpsUrl(venue.sourceUrl)) issues.push('venue.sourceUrl must be an https URL');
  if (venue.travelGuideUrl !== undefined && !isHttpsUrl(venue.travelGuideUrl)) {
    issues.push('venue.travelGuideUrl must be an https URL when present');
  }
  if (typeof venue.checkedAt !== 'string' || !DATE_RE.test(venue.checkedAt)) {
    issues.push('venue.checkedAt must be a YYYY-MM-DD date');
  } else if (Number.isNaN(Date.parse(venue.checkedAt))) {
    issues.push(`venue.checkedAt is not a real date: ${venue.checkedAt}`);
  }
  if (venue.coordinates !== undefined) {
    const { latitude, longitude } = venue.coordinates;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      issues.push('venue.coordinates.latitude must be between -90 and 90');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      issues.push('venue.coordinates.longitude must be between -180 and 180');
    }
  }
  return issues;
}

/**
 * RFC 5870 `geo:` URI for the organiser's destination point, so a phone can
 * hand the venue to whichever maps app it has. `null` when the organiser
 * published no coordinates: the app must not derive them from anything else.
 */
export function venueGeoUri(venue: EventVenue): string | null {
  const point = venue.coordinates;
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  const at = `${point.latitude},${point.longitude}`;
  const label = encodeURIComponent(venue.name.trim()).replace(/[()]/g, (c) =>
    c === '(' ? '%28' : '%29',
  );
  return `geo:${at}?q=${at}(${label})`;
}

/** One line for a card: "NIMHANS Convention Centre, Hosur Road, Bengaluru". */
export function venueAddressLine(venue: EventVenue): string {
  const parts = [venue.address, venue.region, venue.country]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean);
  const address = parts[0] ?? '';
  const cityShown = address.toLowerCase().includes(venue.city.trim().toLowerCase());
  return [address, ...(cityShown ? [] : [venue.city.trim()]), ...parts.slice(1)]
    .filter(Boolean)
    .join(', ');
}
