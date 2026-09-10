# C-06 — Everyone at the conference ends up in the same room

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [#166](https://github.com/hanthor/indiafoss-companion/issues/166)
- Size: M

## Why this matters

Two attendees stand in the same hall, both open the hall's chat, and land in
two different rooms with the same name. Neither of them can tell. The
conversation splits, the organisers answer questions in a room half the room
cannot see, and nobody discovers it until the event is over.

That happens when a client that cannot resolve a room alias does something
helpful instead of something honest — creates a lookalike room, or guesses an
alias from an event id. The fix is a published, validated directory that says
exactly which rooms exist, plus a client rule that failing to resolve one is a
queued join or a plain explanation, never a new room.

## Context you need

The architecture record is explicit
(`docs/architecture/system.md`, "Rooms, federation and the encrypted seam"):

> Use one preseeded conference room namespace and persist gateway
> identity/signing keys. Attendees resolve the same canonical room; offline
> failure queues a join or explains the unavailable route. No local recreation
> under a lookalike alias. Test membership, history visibility, room versions
> and signing on the exact deployed versions before relying on convergence.

and in the contract table:

> **ConferenceDirectory** — Event ID, canonical aliases and room IDs where
> resolved, intended account/server route, visibility and supported
> capabilities. Alias resolution is authoritative; a QR never creates a
> replacement room silently.

### The contract already exists and is tested

[`packages/model/src/contracts/conference-directory.ts`](../../packages/model/src/contracts/conference-directory.ts)
defines the format, the validator `collectConferenceDirectoryIssues(value:
unknown): string[]`, `isValidConferenceDirectory()`, `roomByAlias()` and
`directoryClaims()`. It is exported from `@indiafoss/model/contracts`. Its
module header states the two rules this task must carry into the clients,
because the shape cannot enforce them:

> 1. **Alias resolution is authoritative.** A `roomId` recorded here is a
>    convenience for clients that already resolved it. If the alias resolves
>    to a different room, the alias wins and the directory is stale.
> 2. **A client never creates a room from this directory.** If resolution
>    fails, queue the join or explain the unavailable route. Do not fall back
>    to creation.

The shape, from the same file:

```ts
export interface ConferenceDirectory {
  schemaVersion: number;
  eventId: string; // must match the manifest it ships beside
  generatedAt: string; // ISO-8601
  server: string; // the homeserver whose aliases these are
  rooms: DirectoryRoom[];
  supports?: string[]; // capabilities actually rehearsed
}

export interface DirectoryRoom {
  id: string;
  name: string;
  alias: string; // authoritative, always present
  roomId?: string; // advisory only
  route: RoomRoute; // 'classic' | 'mesh' | 'federated'
  visibility: RoomVisibility; // 'public' | 'invite' | 'knock'
  topic?: string;
  activityIds?: string[];
  locationId?: string;
}
```

The validator rejects duplicate `id` and duplicate `alias`, requires a
non-empty `rooms`, requires `alias` to match `#name:server`, requires `roomId`
(when present) to match `!opaque:server`, and requires `route` and `visibility`
to be one of the listed literals. The duplicate-alias check carries its own
comment: _"Two entries sharing an alias is the split-room failure this contract
exists to prevent, so it is fatal rather than a warning."_

Golden fixtures exist under
`packages/test-fixtures/fixtures/conference-directory/` —
`valid/{minimal,full}.json` and
`invalid/{duplicate-alias,bad-alias,unknown-route,no-rooms,room-id-not-a-room}.json`
— and are run by `packages/model/src/contracts/conformance.test.ts`.
`valid/full.json` is a good template for the real file.

### There is already room configuration. Reconcile, do not duplicate

This is the part to get right. Today the repository has **one** source of room
truth, and it is not the directory:

- `events/indiafoss-2025/messaging.json` is the authored file. It is loaded by
  `tools/event-sync/src/index.ts:70-73` and stored as `bundle.messaging`:

  ```ts
  const messagingPath = join(repoRoot('events', eventId), 'messaging.json');
  if (existsSync(messagingPath)) {
    bundle.messaging = JSON.parse(readFileSync(messagingPath, 'utf8')) as MessagingConfig;
  }
  ```

  Its current content names a homeserver of `https://matrix.reilly.asia`, an
  `aliasServer` of `reilly.asia`, an `aliasPrefix` of `indiafoss-2025`, a
  `space` of `#indiafoss:reilly.asia`, and four rooms (`#indiafoss-2025`,
  `#indiafoss-hallway`, and one per auditorium with a `locationId`).

- The type is `MessagingConfig` in
  [`packages/model/src/messaging.ts:24`](../../packages/model/src/messaging.ts),
  with `MessagingRoom` at line 8. It also owns the _generated_ alias namespace:
  `conferenceChatAlias(config, eventId, kind, id)` builds
  `#<prefix>-<kind>-<id>:<aliasServer>` for sessions, booths and venue rooms,
  and the doc comment on `aliasServer` explains why one designated server
  matters:

  > Matrix aliases are server-scoped and `room_alias_name` is a localpart the
  > server completes with its own name, so no other server can hold or seed
  > `#…:<this>` — on the mesh, where every phone is its own server, that is
  > the difference between a hall converging on one room and every attendee
  > sitting alone in their own copy of it.

- `tools/matrix-rooms/src/plan.ts` turns `bundle.messaging` plus the bundle's
  locations/booths/activities into `planRooms(bundle, options): RoomPlan[]`,
  and `tools/matrix-rooms/src/index.ts` creates those rooms idempotently
  against the organiser's homeserver with an access token.

- `apps/web/src/lib/element-links.ts` exports `spaceLink(bundle)`,
  `listedRooms(bundle)`, `sessionRoomLink(...)` and `boothRoomLink(...)`, all
  reading `bundle.messaging`. `apps/web/src/lib/components/ConferenceRooms.svelte`
  renders `spaceLink` + `listedRooms` — and **has no importer anywhere in
  `apps/web/src`**; it is a component nothing currently mounts.

- `docs/messaging.md` carries a "Superseded 2026-09-04" banner (ADR 0004):
  chat is no longer embedded, and the companion apps "only build `matrix.to`
  links and hand off to whatever Matrix client is installed". Room aliases and
  the mesh protocol in that document are still accurate; the Capacitor
  embedding is not.

So: `messaging.json` is the **authoring input** and the room-provisioning
plan. The directory is the **published output** — the resolved, validated,
attendee-facing answer to "which rooms exist and how do I reach them". Do not
introduce a third truth. Generate the directory _from_ the messaging config and
the bundle, so there is exactly one file a human edits.

### The 2026 data does not exist yet

`events/indiafoss-2026/` currently contains only `raw/` and `venue/`. There is
no `messaging.json`, no `normalized/` and no `published/`. That is why this
task sits behind **C-04** in the dependency graph: the directory ships
_alongside_ the manifest, and there is no 2026 manifest yet. You can build and
test the whole mechanism against `indiafoss-2025` (which does have
`published/manifest.json` at revision 3) and against the fixtures; publishing
the real 2026 directory is the last step and needs the decisions below.

### What needs an organiser decision, and what does not

`docs/architecture/system.md` lists this among the open maintainer choices:

> The most consequential unresolved choices are temporary-account
> lifetime/operator, **canonical service domains and room policy**, the iOS
> distribution owner and supported OS floor, and the maintenance capacity for
> another Chat fork.

Concretely, **needs a decision before the real 2026 file is published**:

1. **The canonical server.** `events/indiafoss-2025/messaging.json` uses
   `reilly.asia`; the contract fixture uses `indiafoss.org`. These are not the
   same namespace and moving between them strands anyone already joined. The
   `server` field and every alias depend on this.
2. **Room policy** — which rooms exist for 2026, their `visibility` (`public`
   / `invite` / `knock`), and whether per-session rooms are created at all
   (`planRooms` defaults `sessions` off: "hundreds of rooms nobody joins").
3. **Which `route` each room claims.** `mesh` and `federated` are _intents_,
   and the contract says so; claiming `federated` before the seam rehearsal
   (#176, **C-13**, **C-14**) would be a promise the deployment cannot keep.
4. **What goes in `supports`.** Only capabilities actually rehearsed on the
   deployed versions. Absence means "not demonstrated".

**Buildable now, without any of those answers:** the generator, the
validation, the manifest wiring, the client read path, the resolution-failure
behaviour, and the whole test suite — all of it against `indiafoss-2025` and
the fixtures. Do that work now; fill in the 2026 values when the maintainer
records them on #166.

## What to do

1. **Add a generator** in `tools/event-sync/src/`, e.g. `directory.ts`,
   exporting a pure function:

   ```ts
   export function buildConferenceDirectory(
     bundle: EventBundle,
     generatedAt: string,
   ): ConferenceDirectory | null;
   ```

   Return `null` when `bundle.messaging` is absent — messaging is optional and
   an event without it publishes no directory. Otherwise derive:

   - `server` from `config.aliasServer ?? homeserverName(config.homeserver)`
     (both already exist in `packages/model/src/messaging.ts`);
   - one `DirectoryRoom` per entry in `config.rooms`, carrying `alias`, `name`,
     `topic` from `purpose`, and `locationId` where the entry has one.
     `MessagingRoom` carries a singular `activityId`; `DirectoryRoom` carries
     an `activityIds` array — that is not a typo, so wrap the single value
     rather than renaming either field;
   - the per-location rooms `conferenceChatAlias(config, bundle.id, 'room',
location.id)` produces, so the directory lists the same aliases
     `element-links.ts` links to and `matrix-rooms` creates. Keep the option
     flags aligned with `planRooms` so the two cannot disagree about which
     rooms exist.
   - a stable `id` per entry — the location id, booth id, or a slug of the
     alias localpart. It must be unique; the validator rejects duplicates.
   - `route` and `visibility` from the authored config. Add optional
     `route`/`visibility` fields to `MessagingRoom` if the organiser needs to
     express them per-room; default to `classic` / `public` and say so in the
     doc comment. Do **not** default anything to `federated`.
   - `roomId` only when the publisher has genuinely resolved it. Omit it
     otherwise; an invented room id is worse than none.

   Take `generatedAt` as a parameter rather than calling `new Date()` inside,
   so the function is testable and a re-sync with unchanged content produces
   identical bytes.

2. **Validate before writing.** In `syncEvent`, after the bundle is validated,
   build the directory and run `collectConferenceDirectoryIssues`. Throw with
   the issue list if it is non-empty — the same refuse-to-publish stance
   **C-07** applies to the manifest.

3. **Publish it as a manifest asset.** Write the directory as a hash-addressed
   asset alongside the others (`directory.<hash>.json`) and add a `directory`
   role to the manifest's `assets` map. Clients already discover assets that
   way, the file is then immutable and cacheable like every other asset, and
   the digest ties the directory to the revision that produced it. Extend the
   `slices` record at `tools/event-sync/src/index.ts:129` rather than adding a
   parallel write path. Copy it into `apps/web/static/events/<id>/` in
   `publishEvent` the way the event bundle already is.

4. **Cross-check the ids.** The contract cannot verify that `activityIds` and
   `locationId` exist in the bundle — its own doc comment says "the caller
   cross-checks". Do that check in the generator and fail the publish on a
   dangling id.

5. **Read it in the web app.** Add `apps/web/src/lib/directory.svelte.ts` (or
   extend `apps/web/src/lib/event.svelte.ts`, which already owns
   `EVENT_MANIFEST_URL` at line 8) to fetch the directory named by the
   manifest's `assets.directory`, validate it with
   `collectConferenceDirectoryIssues`, and store it beside the bundle. A
   directory that fails validation is discarded and the previously stored one
   is kept — the same last-good-value rule ADR 0009 states for every contract.
   An absent `assets.directory` is normal, not an error.

6. **Make resolution honest in the UI.** `ConferenceRooms.svelte` currently
   renders `spaceLink` / `listedRooms` from `bundle.messaging` and is mounted
   nowhere. Point it at the directory, prefer `roomByAlias()` for lookups, and
   mount it somewhere real (the natural home is the settings or explore route
   — check with the maintainer on #166 rather than guessing). Then implement
   the two rules explicitly:

   - the alias is what the UI links and hands off; a stored `roomId` is used
     only as a hint and never overrides the alias;
   - when a room cannot be resolved or reached, show the room as unavailable
     with the reason, or offer to queue the join. There must be no code path
     anywhere in `apps/web` that creates a room. Add a comment saying so at
     the point where a naive implementation would.

7. **Author the real data** once the decisions in the previous section land:
   `events/indiafoss-2026/messaging.json`, then a sync that emits
   `events/indiafoss-2026/published/` with the directory in its manifest. If
   the decisions are not recorded yet, stop here and say so on #166 — do not
   invent a domain.

8. **Tests.**
   - `tools/event-sync/src/directory.test.ts`: a bundle with a messaging block
     produces a directory that validates; a bundle without one produces
     `null`; a dangling `locationId` fails; two rooms resolving to the same
     alias fail; the same input twice produces byte-identical output.
   - A web-side test that a directory failing validation leaves the previously
     stored directory intact.

## Acceptance

```bash
just typecheck
just lint
just test
just check
```

All pass, including `packages/model/src/contracts/conformance.test.ts` (the
five invalid conference-directory fixtures must still be rejected) and
`packages/model/src/contracts/event-manifest.test.ts` (the manifest gained an
asset role and must still validate).

Then a real publish and read-back:

```bash
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync indiafoss-2025
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts publish indiafoss-2025
cat events/indiafoss-2025/published/manifest.json          # has assets.directory
pnpm --filter @indiafoss/event-sync test
```

`tools/event-sync/src/directory.test.ts` must include a case that reads the
published directory asset named by `manifest.assets.directory` off disk and
asserts `collectConferenceDirectoryIssues(...)` returns `[]` — the same
shape as the `published manifests on disk` block in
`packages/model/src/contracts/event-manifest.test.ts`. A published file that
nothing re-validates is a file that drifts.

The manifest names a `directory` asset, the asset file exists in both
`events/indiafoss-2025/published/` and `apps/web/static/events/indiafoss-2025/`,
and `collectConferenceDirectoryIssues` on its contents returns `[]`. Running
the sync twice produces no second revision.

Observable outcome in a browser: the conference-rooms surface lists the rooms
from the published directory, with the canonical alias visible, and each link
opens the attendee's own Matrix client.

The negative cases — what must still fail:

- Hand-edit the generated directory to give two rooms the same `alias` and
  re-run the sync: it must exit non-zero with an issue containing
  `duplicate room alias id`, and must not write a new revision.
- Point a room at a `locationId` that is not in the bundle: the publish fails.
- With the app loaded and the directory served, break alias resolution
  (offline, or an alias the server does not hold). The UI must show the room
  as unavailable or queue the join. Confirm by inspection **and** by grep that
  no room-creation call exists:

  ```bash
  grep -rn "createRoom\|/createRoom" apps/web/src   # must return nothing
  ```

## Out of scope

- Do not publish the 2026 event bundle itself. Shipping the real 2026 data is
  **C-04**, and this task consumes its manifest rather than creating one.
- Do not change `tools/matrix-rooms` to _create_ rooms from the directory.
  Provisioning stays driven by `planRooms` from `bundle.messaging`; rehearsing
  it against real infrastructure is **C-14** (#163/#165/#115).
- Do not claim any `supports` capability that has not been rehearsed. Recording
  evidence for capability claims is **C-11** (#34).
- Do not build anything on the encrypted seam or assert that `federated`
  traffic works. That is gated on #176 and **C-13**.
- Do not rewrite `docs/messaging.md`. Its superseded banner already tells the
  reader what is historical; a rewrite is its own change.
- Do not touch the handoff parsers. Room links arriving from a scan are
  **C-09**.
