# Fork this app

Make it yours: your conference, your venue, your colours, your name on it.

This app was built for IndiaFOSS, but almost nothing about it is
IndiaFOSS-shaped. The programme, the floor plan, the branding and the messaging
config are all **data**, and the seams between them and the code are the seams
you will work along. This page is the map of those seams.

If instead you want to write a _different client_ that talks to the same mesh,
you do not need this repository at all — see
[mesh-protocol.md](./mesh-protocol.md).

## Before anything else: two obligations

**1. The licence is AGPL-3.0-or-later.** You may fork, change and ship this
freely, but the AGPL's network clause means that **if you deploy your fork
where people use it over a network, you must offer those users its source**.
For a conference PWA, that is the normal case. Keep a link to your fork's
source in the app. This is not optional and it is not a formality.

**2. The IndiaFOSS branding is not yours (or ours) to hand over.** The logo
assets under `apps/web/static/branding` come from
[`fossunited/Branding`](https://github.com/fossunited/Branding) under CC BY-SA
4.0, and "IndiaFOSS" and "FOSS United" are their names, not free-floating
labels. A fork for a different event **must** replace them. The typeface
`FFF Forward` is likewise not redistributable — it is referenced first and used
only if a visitor already has it, with [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)
(OFL) shipped as the fallback.

Re-branding is step 3 below and takes about ten minutes. Do it before you show
anyone.

## The short path

```bash
pnpm install
pnpm --filter @indiafoss/web dev     # http://localhost:5173
```

Node ≥ 20.19 and pnpm 11 (`corepack enable`). No accounts, no API keys, no
services — the whole app runs off local fixtures by design.

You now have a working conference companion showing IndiaFOSS 2025. The next
four sections turn it into yours.

## 1. Your programme

The app only ever reads a canonical **`EventBundle`** JSON. Every upstream
source is normalised into it, so adding a conference means producing one
bundle — not touching the UI.

The full pipeline (capture → normalize → verify → publish) is documented in
[event-onboarding.md](./event-onboarding.md). Two shortcuts worth knowing:

- **`events/synthetic/`** is a hand-authored bundle built to exercise the edge
  cases: overlapping talks, missing rooms, odd times. Start by copying it. If
  your event renders correctly from a bundle shaped like this one, it will
  render correctly.
- **`packages/sources`** holds the source adapters. FOSS United has one. If
  your CFP tool is Pretalx, an OSEM instance or a spreadsheet, this is the one
  package you will genuinely write code in — and its contract is small: produce
  an `EventBundle`.

Point the app at your event by changing `DEFAULT_EVENT_ID` in
`apps/web/src/lib/event.svelte.ts`.

> **Keep ids stable across revisions.** The app keys bookmarks, Elo ratings and
> itinerary edits by activity/person/booth id. Re-publishing a bundle with
> changed ids silently wipes every attendee's plan. The validator enforces
> this; do not work around it.

## 2. Your venue

Three files per venue under `apps/web/static/venues/<key>/`:

| File                  | What it is                                      |
| --------------------- | ----------------------------------------------- |
| `venue.svg`           | the floor plan, as vectors                      |
| `venue.graph.json`    | the routing graph — nodes, edges, accessibility |
| `venue.metadata.json` | room ↔ location mapping, floors                 |

`venueKeyForEvent()` in `apps/web/src/lib/venue.svelte.ts` maps an event id to
a venue key; it is a two-line function and you will want to change it.

Drawing the graph is the real work. [venue-map.md](./venue-map.md) explains the
format and [venue-route-review-checklist.md](./venue-route-review-checklist.md)
is what to walk through before trusting the routes. `just verify-assets`
validates them — add your venue key to that recipe.

If you have no floor plan, the map degrades: keep the synthetic venue, or drop
the map tab. Nothing else depends on it.

## 3. Your look

Every colour, radius and font lives as a **token** in `apps/web/src/app.css`.
Change them there and the whole app follows, in both themes.

A guard test enforces this: `apps/web/src/lib/design-tokens.test.ts` fails the
build if a component's `<style>` block contains a raw hex colour. It exists
because the dark-surface text colour had once been written as `#fff`,
`#fafafa` and `#f4f4f4` in a dozen places. There is an `ALLOWED` list for
deliberate exceptions, each carrying a reason — add to it honestly rather than
loosening the regex.

> Watch out for `#` in CSS comments. An issue reference like `#117` parses as a
> three-digit hex colour and fails this test. Write `issue 117`.

Then replace, in order:

- `apps/web/static/branding/` — the logo assets (see the obligations above).
- `apps/web/static/icons/`, `favicon.svg`, `apple-touch-icon.png` — the PWA
  icons.
- `apps/web/static/fonts/` — fonts are bundled locally so the PWA looks the
  same offline. Keep that property; ship what you are licensed to ship.
- The app name and description in the web manifest and `package.json`.
- `README.md` — including the "not endorsed by FOSS United" note, which is
  about _this_ fork and will be wrong in yours.

The Android app deliberately drops the branding in favour of the device's own
Material You palette, so it needs less of this.

## 4. Your messaging (optional)

Chat is **off by default** and gated behind `features.chat`
(`apps/web/src/lib/features.svelte.ts`). The schedule, map, ranking, itinerary
and contact sharing never depend on it, so "delete the chat" is a supported
configuration — remove the tab and stop.

If you keep it, the organiser's config is `events/<event-id>/messaging.json`,
merged into the bundle as `messaging`. It names the alias server, the rooms to
suggest, and optionally an announcements room. Without it the default is
`matrix.org` with an empty room list. See [messaging.md](./messaging.md) for
the model and [mesh-protocol.md](./mesh-protocol.md) for the wire format.

`tools/matrix-rooms` provisions public rooms idempotently on a homeserver you
control, FOSDEM-style. The P2P mesh needs no provisioning at all — aliases are
derived.

## Where everything lives

```
apps/web/            the SvelteKit PWA — every screen
apps/android/        Capacitor shell, plus a native Compose client
packages/
  model/             canonical types, scan grammar, friend/vCard payloads
  schedule/          the programme, days, conflicts
  elo/               pairwise ranking
  solver/            itinerary construction
  venue/             routing graph, A*/Dijkstra
  search/            offline search
  storage/           IndexedDB persistence
  matrix/            Matrix client layer — no framework deps
  sources/           event source adapters  ← your CFP tool goes here
tools/               event-sync, matrix-rooms, validators, probes
events/              bundles: indiafoss-2025, indiafoss-2026, synthetic
docs/                including the ADRs, which explain the whys
```

`packages/matrix` and `packages/model` have no framework dependencies. If you
are building something else entirely and want only the Matrix layer or the
payload grammars, they vendor cleanly.

## The guardrails, and why they will fail you

```bash
just check    # format, lint, typecheck, unit tests, asset verification, build
just ci       # the above + browser E2E + accessibility + the offline gate
```

Four of these are opinionated enough to surprise a forker:

- **The design-token guard** (§3) rejects raw colours in components.
- **The accessibility sweep** (`just a11y`) runs axe-core at WCAG A/AA over the
  built app. A new screen with unlabelled controls fails.
- **The offline gate** (`just offline-e2e`) is release-blocking: it loads the
  app, cuts the network and asserts the core screens still work. If your change
  introduces a runtime fetch on a critical path, this is what catches it.
- **The day simulator** (`just simulate-e2e`) walks a whole conference day in
  minutes and checks the reminders and the next-up banner fire correctly. See
  [simulator.md](./simulator.md) — it is also the nicest way to see your own
  event's data behave.

These are worth keeping. Offline-first and accessible are the two properties
that are easy to lose in a fork and hard to win back.

## Shipping it

```bash
pnpm --filter @indiafoss/web build      # → apps/web/build (PWA + service worker)
```

Static output — any host will do; this one uses GitHub Pages. Set the base path
if you deploy under a subdirectory.

Android (Android SDK + JDK 21):

```bash
pnpm --filter @indiafoss/android exec cap add android   # once
pnpm --filter @indiafoss/android build                  # patch + sync web assets
cd apps/android/capacitor/android && ./gradlew assembleDebug
```

The P2P variant additionally needs the Neutrino bindings `.aar`; with no
`.aar` the build falls back to the plain companion automatically. The build,
release and store channels are in [release.md](./release.md) and
[accrescent.md](./accrescent.md).

## Things you can delete outright

Each of these is genuinely optional — nothing else breaks:

| Feature               | Remove by                                            |
| --------------------- | ---------------------------------------------------- |
| Chat / mesh           | leaving `features.chat` off; drop the `/chat` routes |
| Ranking + solver      | drop the `/rank` route; the schedule stands alone    |
| Venue map             | drop `/map`; keep room names as text                 |
| Contact sharing       | drop `/connect` and `/scan`                          |
| Native Compose client | delete `apps/android/native` — it builds separately  |

The four questions the app is built around — what's on now, what next, how do
I get there, who did I just meet — are in the README, and each maps to one of
these. Keep the ones your conference actually has.

## Getting help, and sending things back

Open an issue. If you build something for your own event, a note in the issue
tracker about what you had to change is the most useful contribution there is —
the seams that were awkward for you are the ones worth moving.

The [ADRs](./adr/README.md) record why the awkward decisions were made the way
they were. Read `0001` before proposing a different Android strategy and `0003`
before proposing a bridge; both questions have been argued out already.
