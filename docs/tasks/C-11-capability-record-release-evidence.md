# C-11 — A release says exactly what was tested, on exactly what

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [#34](https://github.com/hanthor/indiafoss-companion/issues/34)
- Size: M

## Why this matters

An attendee taps the camera button in a mesh chat and the photo fails. Somebody
tells them it was fixed. It _was_ fixed — in Rust, in a merged pull request,
weeks ago. It was never in the build on their phone.

"Fixed in Rust" and "available on a phone" are different states, and the project
has repeatedly confused them. A release that cannot say which state a capability
is in cannot tell an attendee what the app does, cannot tell a maintainer
whether an issue may be closed, and cannot tell the next person which pin to
move. This task makes every release produce one file that answers those
questions, and makes the app read it instead of guessing.

## Context you need

### The motivating example, verbatim

`docs/architecture/review-2026-09-07.md`, finding 4 — "Fixed in Rust" and
"available on a phone" are different states:

> The [media passthrough fix](https://github.com/hanthor/neutrino/pull/11)
> merged on 7 September. Chat main still pins `0.8.2-e2ee.4a9972d`, an earlier
> revision. The durability fix has reached that pin; the later media fix has
> not. The handoff's blanket "not pushed yet" statement is now stale, and the
> readable mesh identity has also reached Chat main.
>
> **Proposal:** make a release manifest identify the exact Neutrino commit, iroh
> commit, AAR checksum, Chat commit, APK version/signing identity, and device
> evidence. A fix is complete for attendees when an installable APK contains it
> and its acceptance scenario passes. After updating media bindings, separately
> test the upload cap and thumbnail behavior; passthrough alone does not
> establish support for normal camera photos.

That last sentence is the second half of the lesson: even once the fix is on the
phone, "the transcoder no longer breaks the body" is not the same claim as
"an attendee can send a photo from their camera". They are different
capabilities with different evidence, and the record must be able to hold both.

The pin in this repository lives at `patches/neutrino/version.json` and is
consumed by CI (`.github/workflows/neutrino-e2e.yml`,
`.github/workflows/neutrino-complement.yml`) as
`node -p "require('$pin').neutrino.rev"`:

```json
{
  "ref": "v0.8.2",
  "version": "0.8.2-e2ee.2d85348",
  "commit": "65e4985181e7bce3af06a0cd7cebcabc13b3ff0b",
  "source": "https://github.com/element-hq/neutrino-iroh",
  "license": "AGPL-3.0-only",
  "neutrino": {
    "repo": "hanthor/neutrino",
    "branch": "e2ee-key-transport",
    "rev": "2d85348ee5a0086c3f30725a31b68439f4fe89b4",
    …
  }
}
```

The Chat-side bindings pin is a _different_ file in a _different_ repository —
`gradle/libs.versions.toml` in
[`indiafoss-chat-android`](https://github.com/hanthor/indiafoss-chat-android),
noted at `docs/forks.md:118` as `neutrino = "0.8.2-e2ee.<rev>"`. Two pins, two
repositories, moved by different changes, and nothing today asserts they agree
or records which one an APK was built from. That is the gap.

### The contract already exists

[`packages/model/src/contracts/capability-record.ts`](../../packages/model/src/contracts/capability-record.ts).
Its module header states the rule this task must wire into the release process:

```ts
/**
 * CapabilityRecord — exactly what was built, exactly what was tested, and on
 * exactly what.
 *
 * This contract exists because of a specific recurring failure: a fix merged
 * in Rust, a passing host test, or an upstream release being mistaken for a
 * capability an attendee actually has. A patch is not an installed APK; a
 * green unit test is not a two-phone result; a pinned tag is not a rehearsed
 * migration.
 *
 * ## The default is "unavailable"
 *
 * A capability that is not listed with evidence is **unavailable**. Never
 * invert that — absence of a `false` is not a `true`. {@link supportsCapability}
 * is the only correct way to ask.
 */
```

The evidence ladder, weakest to strongest:

```ts
export type EvidenceLevel =
  /** Code exists and compiles. Says nothing about behaviour. */
  | 'implemented'
  /** Automated tests pass on a build host. */
  | 'host-tested'
  /** Verified on one physical device running an installed build. */
  | 'device-tested'
  /** Verified across the real topology: two or more devices, real network. */
  | 'topology-tested';
```

Component pins carry checksums and must be exact commits, not branches:

```ts
export interface ComponentPin {
  /** Component name, e.g. `neutrino`, `matrix-rust-sdk`, `chat-android`. */
  name: string;
  /** Exact revision — a commit sha, not a branch or tag. */
  revision: string;
  /** Artifact checksum where one exists, e.g. the AAR or APK digest. */
  checksum?: string;
  /** Where the revision came from, for someone reproducing this. */
  source?: string;
}
```

— enforced by the validator, because a branch name makes a record unreproducible
the moment the branch moves:

```ts
if (typeof value.revision === 'string' && !/^[0-9a-f]{7,64}$/.test(value.revision)) {
  issues.push(`${at}revision must be a commit sha, got ${JSON.stringify(value.revision)}`);
}
```

A claim carries its own evidence, and `supported: false` is a _record_, not an
absence:

```ts
export interface CapabilityClaim {
  /** Capability name, e.g. `mesh.media.photo`, `room.federation.v12`. */
  name: string;
  /**
   * Whether it works. `false` is a valuable record — it stops the claim being
   * re-litigated — and is not the same as absence.
   */
  supported: boolean;
  level: EvidenceLevel;
  /** Devices, OS versions and network topology the result came from. */
  topology?: string;
  /** Link to the run, log or evidence file. */
  evidence?: string;
  /** What was explicitly *not* covered. The most useful field here. */
  limitations?: string;
}
```

And the only correct way to ask a record a question:

```ts
/**
 * Whether a capability may be offered, at or above `minimum` evidence.
 *
 * Unknown is unavailable. An unlisted capability, a capability recorded as
 * `supported: false`, and one whose evidence is weaker than required all
 * return `false`.
 */
export function supportsCapability(
  record: CapabilityRecord,
  name: string,
  minimum: EvidenceLevel = 'device-tested',
): boolean {
  const claim = record.claims.find((c) => c.name === name);
  if (!claim || !claim.supported) return false;
  return LEVELS.indexOf(claim.level) >= LEVELS.indexOf(minimum);
}
```

**Inline these two rules wherever this record is consumed or documented:**

- **Unknown capability is UNAVAILABLE.** Not "probably fine", not "assume the
  default". An unlisted name is a `false`.
- **`supported: false` is a valuable record, distinct from absence.** It records
  that somebody looked, on what, and what they found. It stops the same claim
  being re-litigated every fortnight, and it is the field the `limitations`
  string hangs off.

A golden fixture already shows the shape, at
`packages/test-fixtures/fixtures/capability-record/valid/release-evidence.json`:

```json
{
  "schemaVersion": 1,
  "id": "release-2026.09.20",
  "recordedAt": "2026-09-20T18:00:00.000Z",
  "eventId": "indiafoss-2026",
  "components": [
    {
      "name": "neutrino",
      "revision": "2a93cf0f1b6d4e5a",
      "checksum": "sha256:abcd",
      "source": "https://github.com/hanthor/neutrino"
    },
    { "name": "chat-android", "revision": "dba27084" }
  ],
  "claims": [
    {
      "name": "mesh.text",
      "supported": true,
      "level": "topology-tested",
      "topology": "Pixel 6a + Pixel 7, BLE only, airplane mode",
      "evidence": "docs/evidence/2026-09-20-two-phone.md"
    },
    {
      "name": "mesh.media.photo",
      "supported": false,
      "level": "device-tested",
      "limitations": "sender-side 256 KiB upload cap rejects camera photos with 413"
    },
    {
      "name": "seam.encrypted.async",
      "supported": false,
      "level": "implemented",
      "limitations": "protocol review pending in #176; no disconnected-endpoint proof"
    }
  ]
}
```

Note that `docs/evidence/2026-09-20-two-phone.md` does not exist. The fixture is
test data; nothing yet produces a real record. That is this task.

Invalid fixtures already exist too and pin the validator's behaviour:
`capability-record/invalid/branch-as-revision.json`,
`topology-claim-without-topology.json`, `missing-supported.json`,
`no-claims.json`, `duplicate-claim.json`. They run through
`packages/model/src/contracts/conformance.test.ts`.

### The required scenarios, quoted

`docs/architecture/system.md`, "Delivery sequence and release evidence". This
is the list a release must exercise, and it is not negotiable down:

> Each release records client/SDK/core/transport/server hashes, build
> provenance, database versions, test device/OS, topology, timestamps and
> limitations. Exercise fresh install, upgrade, airplane mode, WAN loss with LAN
> retained, permission denial, background/lock, restart, lost acknowledgement,
> low storage, key rotation, account expiry and gateway restore. Measure
> successful decryptions and recovery rather than optimistic queue counts. Keep
> diagnostics opt-in and scrub tokens, keys, message content and contact
> identifiers.

Enumerated, so the record can carry one outcome per scenario:

1. fresh install
2. upgrade
3. airplane mode
4. WAN loss with LAN retained
5. permission denial
6. background / lock
7. restart
8. lost acknowledgement
9. low storage
10. key rotation
11. account expiry
12. gateway restore

Two more lines from the same section are normative for this task:

> Release operations | Exact component pins, device/topology evidence, recovery
> runbooks | **A merged patch is not an installed-device acceptance result**

> Do not close issues for an architecture document, passing host tests, or
> upstream merges alone.

### The real release process this must wire into

`docs/release.md` is the process today. Its quality gate is CI
(`.github/workflows/ci.yml`, jobs **checks**, **e2e**, **native**,
**android-emulator**), with a warning worth repeating: an end-to-end spec that is
not named in `ci.yml` **never runs at all**. Its local commands are:

```bash
just ci        # check + browser E2E + a11y + offline gate
just sbom      # generate sbom.cdx.json locally (pnpm-aware, via cdxgen)
just audit     # production dependency audit
just pages-build indiafoss-companion
```

`just check` is `format-check`, `lint`, `typecheck`, tests, `verify-assets`,
`build`. The checklist in `docs/release.md` includes "Android artifact checksums
recorded" — recorded in prose, in a checklist, nowhere machine-readable. That is
the hook this task replaces.

`docs/release.md` does **not** currently reference `docs/evidence/`. It should,
and connecting them is part of this task.

`docs/evidence/README.md` states the convention a capability record must point
at:

> One file per rung per run day, named `rung<k>-<what>-<yyyy-mm-dd>.md`. A file
> records **the exact revisions, the exact command, the raw output, and what the
> runner concluded** — including a run that failed, which is evidence too.
> Numbers in a table with no command above them are what this directory exists
> to prevent: a claim nobody can re-run.

Existing records: `rung1-interop-2026-09-06.md`, `rung2-shaped-2026-09-06.md`,
`e2ee-medium-2026-09-06.md`, `playbook-errata-2026-09-06.md`. Their shape is a
title stating the finding, a preamble naming the host and the fork revision, a
`## Command` fenced block, result tables, and a `## Resolution` section.

The `Justfile` (capital J) recipes relevant here: `check`, `ci`, `test`,
`typecheck`, `lint`, `format-check`, `verify-assets`, `fixture-normalize`,
`fixture-verify`, `sbom`, `audit`, `android-apk`, `android-test`, `pages-build`.
**There is no `evidence`, `release-record` or `capability` recipe.** Adding one
is part of this task.

## What to do

1. **Decide where a released record lives, and write that down.** ADR 0009 left
   this open ("Should `CapabilityRecord` be checked into this repository at all,
   or does it belong with release operations where the evidence is produced?").
   The recommended answer, which this task adopts unless the maintainer says
   otherwise on #34: records are checked in under `docs/evidence/records/` as
   `<id>.json`, one per release or evidence run, beside the human-readable
   evidence file they point at. They are small, they are the thing a client must
   read, and a record whose file lives only in a CI artifact cannot be consulted
   later.

2. **Add a `just release-record` recipe** to the `Justfile` that assembles a
   draft record and validates it. It must:
   - read `patches/neutrino/version.json` and emit `neutrino` and
     `neutrino-iroh` component pins from `.neutrino.rev` and `.commit`
     (the file already carries exact shas, which is why the validator's
     commit-sha rule passes);
   - accept the Chat-side pin and APK identity as inputs, since they come from
     another repository — `chat-android` revision, the bindings version string
     from that repo's `gradle/libs.versions.toml`, the AAR checksum and the APK
     sha256 that CI already computes;
   - record `recordedAt` and `eventId`;
   - run `collectCapabilityRecordIssues()` over the result and fail loudly on
     any issue, rather than writing an invalid file.

   Reuse the contract; do not write a second validator (`docs/tasks/README.md`
   rule 6).

3. **Do not let the recipe invent claims.** It emits _pins_ automatically and
   leaves `claims` for a human to fill from evidence. A tool that guesses claims
   reproduces exactly the failure this task exists to fix. The recipe may
   pre-populate claim _names_ from a checked-in list of capabilities the project
   cares about, each with `supported: false, level: 'implemented'` — the honest
   default — so that the person filling it in must actively upgrade a claim
   rather than actively remember to downgrade one.

4. **Define the capability namespace.** A short checked-in list of names with
   one-line meanings, so `mesh.media.photo` means the same thing in every record
   and in every issue. Start from the names already in the fixtures —
   `mesh.text`, `mesh.media.photo`, `seam.encrypted.async` — and add what the
   September release needs. Distinguish the transcoder-passthrough claim from the
   camera-photo claim, per finding 4's last sentence; they are two names.

5. **Wire the twelve required scenarios in.** Add a scenario checklist to
   `docs/release.md` covering fresh install, upgrade, airplane mode, WAN loss
   with LAN retained, permission denial, background/lock, restart, lost
   acknowledgement, low storage, key rotation, account expiry and gateway
   restore. Each exercised scenario produces an evidence file under
   `docs/evidence/` in the existing `<what>-<yyyy-mm-dd>.md` convention, and the
   record's claims point at it through `CapabilityClaim.evidence`. A scenario
   that was not run is recorded as not run — in `limitations` — never omitted.

6. **Connect `docs/release.md` to `docs/evidence/`.** Replace the checklist line
   "Android artifact checksums recorded" with the record step: produce the
   capability record, validate it, commit it beside its evidence files, and link
   it from the release notes. State in `docs/release.md` that a release without
   a valid capability record is not a release, and restate both rules from the
   contract — unknown is unavailable, and `supported: false` is a record.

7. **Make a client actually read it.** The point of a machine-readable record is
   that the app stops guessing. Add one consumer: a readiness/compatibility view
   built from `supportsCapability()` — the review's sixth milestone step asks
   for exactly this table ("schedule available offline, installed mesh version,
   supported media, public-room availability, and unsupported cross-seam
   encryption"). Every row must be derived from the record, defaulting to
   unavailable when the record does not mention the capability. Do not add an
   `if (!record) return true` anywhere; that is the inversion the module header
   forbids.

8. **Record the current, honest state as the first real record.** Produce
   `docs/evidence/records/` entry number one from the actual pins in the
   repository today, with claims at whatever level the existing evidence
   supports and no higher. `seam.encrypted.async` is `supported: false` (see
   **C-13**). The media-photo claim reflects whether the pinned Chat build
   actually contains the passthrough fix — which, per finding 4, is the question
   nobody could previously answer.

9. **Add fixtures for anything new.** If step 4's namespace list or step 2's
   assembly introduces a format, it gets golden fixtures under
   `packages/test-fixtures/fixtures/` per ADR 0009, valid and invalid, listed in
   `fixtures/index.json` with the `expectIssue` substring for each invalid case.

## Acceptance

```bash
just release-record            # writes and validates a draft record
just test
just typecheck
just lint
just fixture-verify
```

All pass, and:

- `just release-record` **fails** when given a branch name instead of a commit
  sha for any component. Verify this deliberately: the invalid fixture
  `packages/test-fixtures/fixtures/capability-record/invalid/branch-as-revision.json`
  documents the expected rejection.
- `just release-record` **fails** on a `topology-tested` claim with no
  `topology` string (`invalid/topology-claim-without-topology.json`).
- The conformance test in `packages/model/src/contracts/conformance.test.ts`
  still passes over every indexed capability-record fixture.

The consumer behaviour, as automated tests:

- `supportsCapability(record, 'mesh.media.video')` — a name not in the record —
  returns `false`. Assert it, because "unknown is unavailable" is the rule most
  likely to be broken by a later convenience change.
- A capability recorded `supported: false` returns `false`, and its
  `limitations` string is what the readiness view shows the user. Absence and
  `false` must be distinguishable in the UI even though both are unavailable:
  one says "we tested and it does not work, here is why", the other says
  "nobody has said".
- A claim at `host-tested` returns `false` when asked at the default minimum of
  `device-tested`.

The observable outcome, which is the actual point:

Open the readiness view against the first real record produced in step 8. For
each capability, it must be possible to answer, from the screen alone: _what was
tested, at what evidence level, on what devices, and what was explicitly not
covered._ If any row can only be explained by asking a person, the record is not
finished.

## Out of scope

- **Building the Chat APK and proving the media fix on hardware.** That is
  **X-01** (Chat #44/#45/#49, Companion #182), which is _Needs hardware_. This
  task builds the record that X-01's result gets written into; it does not
  produce that result, and it must not claim `device-tested` or
  `topology-tested` for anything on X-01's behalf.
- **The venue gateway rehearsal** that produces the `gateway restore` scenario's
  evidence — **C-14** (#163/#165/#115).
- **The encrypted seam.** `seam.encrypted.async` stays `supported: false` and
  changing it is gated on **C-13** (#176).
- **Publishing the 2026 bundle and the room directory.** **C-04** (#191) and
  **C-06** (#166). A capability record pins components; it does not publish event
  data.
- **Kotlin conformance over the fixtures.** **C-08**.
- **Changing `CAPABILITY_RECORD_SCHEMA_VERSION` or the contract's fields.** The
  envelope is decided (ADR 0009). If a real release genuinely cannot be described
  within it, stop and say so on #34 rather than widening it quietly.
- **A dashboard, a service, or a new repository for release evidence.** The
  architecture explicitly says to "avoid a new service or repository merely to
  share small documents". Checked-in JSON beside checked-in Markdown is the whole
  mechanism.
