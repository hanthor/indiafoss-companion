import { describe, expect, it } from 'vitest';
import {
  EVENT_VENUE_VERSION,
  collectVenueIssues,
  venueAddressLine,
  venueGeoUri,
  type EventVenue,
} from './venue.js';
import { collectBundleIssues } from './validation.js';
import type { EventBundle } from './index.js';

const nimhans: EventVenue = {
  version: 1,
  name: 'NIMHANS Convention Centre',
  address: 'NIMHANS Convention Centre, Hosur Road, Bengaluru',
  city: 'Bengaluru',
  region: 'Karnataka',
  country: 'India',
  mapUrl: 'https://osmapp.org/way/1219285692#18.89/12.9431/77.5961',
  coordinates: { latitude: 12.9431, longitude: 77.5961 },
  sourceUrl: 'https://fossunited.org/indiafoss/2026',
  travelGuideUrl: 'https://fossunited.org/indiafoss/guide/travel',
  checkedAt: '2026-09-10',
};

describe('collectVenueIssues', () => {
  it('accepts an organiser-sourced block', () => {
    expect(EVENT_VENUE_VERSION).toBe(1);
    expect(collectVenueIssues(nimhans)).toEqual([]);
    const { coordinates, travelGuideUrl, region, country, ...minimal } = nimhans;
    void coordinates;
    void travelGuideUrl;
    void region;
    void country;
    expect(collectVenueIssues(minimal)).toEqual([]);
  });

  it('refuses a block without a source, a checked date or an https map link', () => {
    const issues = collectVenueIssues({
      ...nimhans,
      version: 2 as unknown as 1,
      name: ' ',
      mapUrl: 'geo:12.9,77.5',
      sourceUrl: 'http://fossunited.org/indiafoss/2026',
      travelGuideUrl: 'not a url',
      checkedAt: '10 September 2026',
      coordinates: { latitude: 120, longitude: -200 },
    });
    expect(issues).toEqual([
      'venue.version 2 != 1',
      'venue.name must be a non-empty string',
      'venue.mapUrl must be an https URL',
      'venue.sourceUrl must be an https URL',
      'venue.travelGuideUrl must be an https URL when present',
      'venue.checkedAt must be a YYYY-MM-DD date',
      'venue.coordinates.latitude must be between -90 and 90',
      'venue.coordinates.longitude must be between -180 and 180',
    ]);
    expect(collectVenueIssues({ ...nimhans, checkedAt: '2026-13-45' })).toEqual([
      'venue.checkedAt is not a real date: 2026-13-45',
    ]);
  });

  it('is part of bundle validation only when a venue block is present', () => {
    const base = {
      schemaVersion: 1,
      id: 'e',
      name: 'E',
      timezone: 'Asia/Kolkata',
      start: '2026-09-26T09:00:00+05:30',
      end: '2026-09-27T17:00:00+05:30',
      activities: [],
      people: [],
      locations: [],
      booths: [],
      tracks: [],
      sourceMetadata: { source: 'test', normalizerVersion: '0' },
    } as EventBundle;
    expect(collectBundleIssues(base)).toEqual([]);
    expect(collectBundleIssues({ ...base, venue: nimhans })).toEqual([]);
    expect(collectBundleIssues({ ...base, venue: { ...nimhans, checkedAt: '' } })).toEqual([
      'venue.checkedAt must be a YYYY-MM-DD date',
    ]);
  });
});

describe('venueGeoUri', () => {
  it('hands the organiser point to a maps app with the venue name as label', () => {
    expect(venueGeoUri(nimhans)).toBe(
      'geo:12.9431,77.5961?q=12.9431,77.5961(NIMHANS%20Convention%20Centre)',
    );
  });
  it('escapes parentheses in the label and never invents a point', () => {
    expect(venueGeoUri({ ...nimhans, name: 'Hall (North)' })).toBe(
      'geo:12.9431,77.5961?q=12.9431,77.5961(Hall%20%28North%29)',
    );
    const { coordinates, ...noPoint } = nimhans;
    void coordinates;
    expect(venueGeoUri(noPoint)).toBeNull();
  });
});

describe('venueAddressLine', () => {
  it('does not repeat the city when the address already names it', () => {
    expect(venueAddressLine(nimhans)).toBe(
      'NIMHANS Convention Centre, Hosur Road, Bengaluru, Karnataka, India',
    );
    expect(
      venueAddressLine({
        ...nimhans,
        address: 'Hosur Road',
        region: undefined,
        country: undefined,
      }),
    ).toBe('Hosur Road, Bengaluru');
  });
});
