# Onboarding a new event

How to bring a new IndiaFOSS (or other FOSS United) event into the app. The
canonical contract is the `EventBundle` JSON — every source is normalised into
it, and the app only ever reads the bundle, never raw upstream data.

## Pipeline overview

```
capture (fixtures) → normalize → verify → publish → serve
```

- **capture** — record upstream FOSS United responses (event, schedule,
  proposals, proposal details) and the public booth directory as deterministic
  fixtures under `events/<event>/raw/`, with `provenance.json` recording the
  source URLs and content hashes.
- **normalize** — the `@indiafoss/sources` FOSS United adapter turns the raw
  fixtures into a canonical `EventBundle` at
  `events/<event>/normalized/event-bundle.json`.
- **verify** — `just fixture-verify event=<event>` confirms the bundle parses and
  reports counts (activities, people, locations, tracks).
- **publish** — `just event-publish event=<event>` writes immutable, hash-addressed
  assets and a manifest under `events/<event>/published/`, and syncs the served
  copy into `apps/web/static/`.

## Commands

```bash
just fixture-normalize event=indiafoss-2026   # raw fixtures -> canonical bundle
just fixture-verify    event=indiafoss-2026   # validate the bundle
just event-sync        event=indiafoss-2026   # fetch/normalize/diff (fixture or live)
just event-publish     event=indiafoss-2026   # publish immutable revision + manifest
```

## Stable identifiers

Activity, person, and booth ids must stay **stable across revisions**. The app
keys local state — bookmarks, Elo ratings, dispositions, notes, itinerary edits
(`plan-edits-<eventId>-<day>`) — by these ids, so a re-published revision must
preserve them or attendees silently lose their plan. The bundle validator and
the production revision-handling pipeline exist to guard this.

## Data completeness checklist (per the import issue)

- [ ] Official public booth directory captured with provenance + content hash.
- [ ] Booth names, categories, websites, and map-zone locations normalised into
      canonical `Booth` records.
- [ ] Public proposal detail captured for scheduled CFPs where available.
- [ ] Descriptions, key takeaways, references, slides, source links, proposal
      status, audience, speaker photos, bios, organisations, designations, and
      social links surfaced through the canonical models.
- [ ] Fixture-backed parser/normalisation tests pass; no live site needed in CI.
- [ ] Existing user preferences still match stable activity ids.

## Venue

The venue asset (SVG + routing graph + metadata) is onboarded separately — see
[`venue-route-review-checklist.md`](./venue-route-review-checklist.md). Real
distances/floors require venue-team confirmation before the `_draft` flag is
removed.

### Getting there (outdoor arrival)

`events/<event>/venue-arrival.json` is a reviewed fixture, merged into the
bundle by `event-sync sync` as `bundle.venue` (`EventVenue`, versioned by
`version`, validated by `collectVenueIssues`). It carries only what an
organiser page publishes: venue `name`, `address`, `city`, the
organiser-selected `mapUrl` (an OpenStreetMap feature link), optional
`coordinates`, the `sourceUrl` it was read from and the `checkedAt` date. The
file's `provenance` block records which page supplied which field.

Rules:

- Copy the organiser's wording; never geocode, pick an entrance, or add
  parking or transport advice. The map link marks the building the organiser
  chose, nothing more. An organiser travel page may be linked (`travelGuideUrl`)
  but its content is not imported.
- Re-check the source pages and bump `checkedAt` whenever the organiser page
  changes. The sync warns when the FOSS United event document's `map_link`
  disagrees with the reviewed file.
- Without the file the bundle has no `venue` and the app shows no
  "Getting there" card. Indoor rooms and routes stay in the venue asset (#223).

## The 2025 fixture

`events/indiafoss-2025` is the golden historical fixture used as test data
until 2026 data is published. Keep it: the E2E suite and many unit tests read
it. The `synthetic` venue fixture is likewise kept for deterministic routing
tests and must not be replaced by real data.
