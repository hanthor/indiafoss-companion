# X-01 — A photo and a voice message actually arrive on the other phone

> Status, 9 September 2026: The build/test checkout prerequisite is complete: Chat PR #55 and main run 34291085872 passed; Chat #44 is closed. This does not satisfy the two-phone media/offline/recovery checks in this spec. Continue under Chat #45/#49 and Companion #182 without redoing LFS recovery.

- Status: Needs hardware
- Repository: **indiafoss-chat-android** (with a dependency on
  **hanthor/neutrino**)
- Tracks: Chat
  [#44](https://github.com/hanthor/indiafoss-chat-android/issues/44) /
  [#45](https://github.com/hanthor/indiafoss-chat-android/issues/45) /
  [#49](https://github.com/hanthor/indiafoss-chat-android/issues/49),
  Companion
  [#182](https://github.com/hanthor/indiafoss-companion/issues/182)
- Size: L

## The work happens in another repository

The Chat client is
[`hanthor/indiafoss-chat-android`](https://github.com/hanthor/indiafoss-chat-android)
and the server fix is in
[`hanthor/neutrino`](https://github.com/hanthor/neutrino). **Do not create
Kotlin, Java, Gradle or Rust source files in indiafoss-companion for this
task.** The only files this task touches in _this_ repository are
`patches/neutrino/version.json` (the pin), `docs/forks.md` (mandatory, see
below) and a capability record under `docs/evidence/`.

## Why this matters

Two attendees stand in a hall with no internet. One takes a photo of a
slide, or records a ten-second voice message, and sends it. The text of the
conversation arrives. The attachment does not — the recipient sees a broken
placeholder and a 404. This has been true for every phone-to-phone
attachment since mesh media shipped.

The Rust fix for the underlying cause is merged. It is not on a phone. From
`docs/architecture/review-2026-09-07.md`, finding 4, "'Fixed in Rust' and
'available on a phone' are different states":

> A fix is complete for attendees when an installable APK contains it and
> its acceptance scenario passes.

This task closes that distance, and then proves it with two handsets.

## Context you need

### The root cause, so you know what you are verifying

From `docs/forks.md`:

> On the mesh, federation runs through the `neutrino-lb` sidecar, which
> JSON⇄CBOR-transcodes every body to fit the CoAP-over-BLE wire. A
> federation media download answers `multipart/mixed` with a _binary_ body,
> which is not JSON — so the transcode failed, the 2xx ingress returned 502,
> and the recipient turned that into a 404. Text and the `m.image`/`m.audio`
> event itself (JSON) arrived, but the blob never did, so photo and
> voice-message attachments were silently broken phone-to-phone.

That single sentence explains the shape of the bug precisely, and you should
be able to predict the symptoms from it before you touch a device:

- **Text works.** It is JSON; the transcode succeeds.
- **The `m.image` / `m.audio` timeline event itself arrives.** Also JSON.
- **Only the blob fails**, so the message appears in the timeline with a
  broken attachment rather than not appearing at all.
- **Both photo and voice fail, for the same reason.** They are not two bugs.
  A fix that repairs one and not the other has not repaired this.
- The recipient's error is a **404**, produced from a **502** at the
  sender's ingress, produced from a failed transcode of a **2xx** response.
  Do not chase the 404 as if the media were missing from the store.

The fix, also from `docs/forks.md`:

> The fix keys off the response `Content-Type`: JSON still transcodes,
> anything else (multipart, octet-stream, `image/*`) passes through
> byte-for-byte with its real type carried on a sentinel header over the
> existing `x-matrix` forwardable prefix — no transport change. The seam was
> untested because `e2e_media.rs` hits the router in-process, never through
> the sidecars; a new `e2e_lb_federation` media test now covers it.

### Two independent follow-ups the passthrough fix does NOT solve

This is the part most likely to produce a false "fixed" claim. Also from
`docs/forks.md`:

> Separate, still open: the 256 KiB upload cap blocks multi-MB photos at the
> sender, and no thumbnail endpoints exist.

Expanded, because both will bite during your device testing:

1. **The 256 KiB upload cap.** `patches/neutrino/README.md` records the
   content repository as advertising `m.upload.size` — **256 KiB** by
   default, configurable via `NEUTRINO_MEDIA_MAX_BYTES`, with
   `DEFAULT_MEDIA_MAX_BYTES` as the constant behind it. An ordinary modern
   camera photo is several megabytes. It is rejected **at the sender** with
   a 413 before any federation happens, so the passthrough fix is never
   reached. If you test with a full-resolution camera photo and see a
   failure, you have most likely reproduced the cap, not a passthrough
   regression. Test both: a small image that fits under the cap (which the
   fix should carry end to end) and a real camera photo (which should fail
   at the sender with a clear 413, and whose failure message the client
   should state honestly).
2. **No thumbnail endpoints exist.** A Matrix timeline renders images
   through the thumbnail API. With no thumbnail endpoint, a photo may remain
   visually broken in the timeline even when the full download now works. So
   "the blob downloads" and "the attendee sees the photo" are two separate
   results, and you must record them separately.

Neither follow-up is in scope here. Both must appear in the capability
record as explicitly unsupported, with `supported: false`, so nobody
re-litigates them.

### Why this is a build problem, not a patch problem

Companion's finding 4 again:

> The media passthrough fix merged on 7 September. Chat main still pins
> `0.8.2-e2ee.4a9972d`, an earlier revision. The durability fix has reached
> that pin; the later media fix has not.

The build path has three hops, and skipping one makes a pin bump
meaningless:

1. **The Android Rust toolchain is not installed locally.** You cannot build
   the bindings on a workstation without setting up a full Android NDK Rust
   cross-compilation environment for four ABIs. Do not try to sidestep this
   by hand-building a partial artifact.
2. **chat-android consumes a pre-built, SHA-pinned `neutrino-bindings-*.aar`
   from a GitHub release.** `docs/forks.md` records the Chat-side pin as
   `gradle/libs.versions.toml`, `neutrino = "0.8.2-e2ee.<rev>"`, "fetched
   from this repository's `neutrino-bindings-*` releases with a checksum",
   consumed by that repo's
   `services/neutrino/impl/build.gradle.kts`. **Verify both of those paths
   in the chat-android repository before editing — this spec was written
   from Companion's documentation of that repo, not from the repo itself,
   and the paths may have moved.**
3. **The AAR is built from the branch `patches/neutrino/version.json`
   names.** In this repository that file currently reads:

   ```json
   {
     "ref": "v0.8.2",
     "version": "0.8.2-e2ee.2d85348",
     "neutrino": {
       "repo": "hanthor/neutrino",
       "branch": "e2ee-key-transport",
       "rev": "2d85348ee5a0086c3f30725a31b68439f4fe89b4"
     }
   }
   ```

   `.github/workflows/neutrino-bindings.yml` builds the `.aar` from exactly
   that `ref` and `rev` and attaches it to a release. It triggers on changes
   to `patches/neutrino/version.json`.

So the media fix **must be on the `e2ee-key-transport` branch** — the branch
the AAR is built from — before bumping any pin is meaningful. If the fix
merged to a different branch of `hanthor/neutrino`, land it on
`e2ee-key-transport` first. A pin bumped to a rev whose branch lacks the fix
produces a green build and a broken phone, which is exactly the failure
`docs/forks.md` already records happening once:

> Bumping the fork means bumping this pin too, or handsets keep the old
> server — which is how the chat app spent three revisions creating
> silently-plaintext DMs after the fix existed.

## What unblocks this, and who decides

**Needs hardware.** No decision is outstanding; the maintainer (James)
decides only whether the resulting evidence is sufficient to close
[#182](https://github.com/hanthor/indiafoss-companion/issues/182). What is
required:

- **Two physical Android phones**, not emulators. The bug lives in the
  sidecar transcode on the real medium; an in-process test already passes
  and did not catch it.
- Both phones able to run the mesh with **no internet at all** — Airplane
  Mode with Wi-Fi/Bluetooth re-enabled as the mesh needs, and no route to
  any homeserver.
- Ability to install a locally built or CI-published APK on both.
- Write access to `hanthor/neutrino` (for the branch), to this repository
  (for the pin) and to `indiafoss-chat-android` (for the version bump).

## What to do

1. **In `hanthor/neutrino`**: confirm the media passthrough fix is on the
   `e2ee-key-transport` branch. If it is not, land it there. Confirm the
   `e2e_lb_federation` media test runs on that branch and fails without the
   fix — revert the fix locally and watch it go red. A test that passes
   against the broken code is testing nothing.

2. **In this repository**: bump `patches/neutrino/version.json` to the exact
   `rev` on `e2ee-key-transport` that carries the fix, and update `version`
   to match (`0.8.2-e2ee.<short-rev>`). Let
   `.github/workflows/neutrino-bindings.yml` build and publish the
   `neutrino-bindings-*.aar`. Record the release tag and the AAR's SHA-256.

3. **Update `docs/forks.md` in the same change.** This is fork-touching
   work, and the repository rule in
   [`docs/tasks/README.md`](README.md) is unambiguous: "Fork-touching work
   updates `docs/forks.md` in the same change. This is a repository rule,
   not a preference." The file's own header says the same. Move the media
   passthrough fix from a described change to a shipped one, and **leave the
   upload cap and missing thumbnails recorded as still open** — do not tidy
   them away because the passthrough works.

4. **In `indiafoss-chat-android`**: bump the neutrino pin to the new version
   and its checksum. Verify the file path first (documented as
   `gradle/libs.versions.toml`, consumed by
   `services/neutrino/impl/build.gradle.kts`) — read it in that repo before
   editing. Build a **signed, installable APK**. Record its version name,
   version code, signing identity and SHA-256.

5. **Install on two physical phones** and take the mesh fully offline.

6. **Prove text still works.** This is the control. If text is broken, stop
   — you have a different problem and the media result would be
   uninterpretable.

7. **Prove the photo path.** Send an image that is comfortably under 256 KiB
   from phone A to phone B. Record three separate outcomes: the event
   arrives in the timeline; the blob downloads (no 404); and the image is
   actually _visible_ to the attendee. The third can fail while the first
   two pass — that is the missing-thumbnail follow-up, and it is a finding,
   not a reason to keep debugging the passthrough.

8. **Prove the voice-message path.** Record and send a voice message,
   again under the cap. Confirm it plays on phone B. Both directions.

9. **Reproduce the cap deliberately.** Send a full-resolution camera photo.
   Confirm the failure is a 413 at the sender, confirm what the attendee is
   told, and record it. Do not raise `NEUTRINO_MEDIA_MAX_BYTES` to make this
   pass — the cap's resolution is a separate piece of work.

10. **Exercise the durability scenarios** from
    `docs/architecture/system.md`: send an attachment, then force-stop and
    restart the recipient app; send with the link impaired; send while the
    recipient is briefly out of range. Record decryption outcomes and
    recovery times, not optimistic queue counts.

11. **Write a `CapabilityRecord`** as the output — see
    [`packages/model/src/contracts/capability-record.ts`](../../packages/model/src/contracts/capability-record.ts)
    and the golden examples in
    [`packages/test-fixtures/fixtures/capability-record/`](../../packages/test-fixtures/fixtures/capability-record).
    That contract exists for exactly this failure mode; its own header says
    so: "a fix merged in Rust, a passing host test, or an upstream release
    being mistaken for a capability an attendee actually has."

    `components` must pin, each with an exact commit sha (the validator
    rejects branch names) and a checksum where one exists: `neutrino`,
    `neutrino-iroh`, the `neutrino-bindings` AAR, `chat-android`, and the
    APK. `claims` must include at least:

    | claim                                | expected                       | level             |
    | ------------------------------------ | ------------------------------ | ----------------- |
    | `mesh.media.photo.download`          | true if it downloads           | `topology-tested` |
    | `mesh.media.photo.timeline`          | separate — may be false        | `topology-tested` |
    | `mesh.media.voice`                   | true if it plays               | `topology-tested` |
    | `mesh.media.photo.camera-resolution` | **false** — the 256 KiB cap    | `topology-tested` |
    | `mesh.media.thumbnail`               | **false** — no endpoints exist | `implemented`     |

    Every `topology-tested` claim needs a `topology` string; the validator
    enforces that. Fill `limitations` on every claim — the contract calls it
    "The most useful field here."

## Acceptance

In `hanthor/neutrino`, on `e2ee-key-transport`:

```bash
cargo nextest run                 # includes e2e_lb_federation media
```

The `e2e_lb_federation` media test passes, and fails when the passthrough
fix is reverted. Paste both outputs.

In this repository, after the pin bump:

```bash
just typecheck
just lint
pnpm --filter @indiafoss/model test    # capability-record validation
```

and the `Neutrino bindings` workflow completes and publishes an AAR whose
SHA-256 you record.

In `indiafoss-chat-android`, the project's own build and test commands (read
that repository's CI configuration for the current ones — do not assume) and
a signed APK you can install.

Then the device result, which is the actual acceptance. It is only accepted
with all of:

- **Devices**: both phones by model, Android version, and whether each has a
  SIM.
- **Topology**: how the mesh was carried (BLE, LAN, both), the exact network
  state, and proof that no homeserver was reachable — a demonstrated failed
  request, not "we turned Wi-Fi off".
- **Software**: neutrino rev, neutrino-iroh rev, AAR release tag and SHA-256,
  chat-android commit, APK version and SHA-256, signing identity.
- **Timestamps** per scenario.
- **Limitations**: at minimum, that this says nothing about iOS, nothing
  about a Spindle user (see `docs/forks.md`: "a phone cannot run E2EE with a
  Spindle user"), and nothing about photos above the cap.

The negative cases must be recorded as passing _negatives_: a
full-resolution camera photo still fails with 413 at the sender, and
thumbnails still do not exist. If those two silently start working, stop —
something changed that you did not intend, and the record would be wrong.

## Out of scope

- **Raising or removing the 256 KiB cap** (`DEFAULT_MEDIA_MAX_BYTES` /
  `NEUTRINO_MEDIA_MAX_BYTES` / advertised `m.upload.size`). It is a real,
  separate defect with its own sizing, chunking, memory and battery
  questions. Record it as unsupported and leave it to Chat #45/#49 and
  Companion #182's follow-ups.
- **Implementing thumbnail endpoints.** Same reasoning. Record it as
  unsupported.
- Client-side downscaling of camera photos to fit the cap. That is a product
  decision about photo quality, not this fix.
- The durable outbox and delivery-state modelling. That is **X-02** (Chat
  #48). If a send here reports an ambiguous outcome, note it there.
- Account coexistence and crypto-store separation. That is **X-03** (Chat
  #46/#47).
- Cross-seam encrypted delivery to a Spindle user. Structurally open, owned
  by [#176](https://github.com/hanthor/indiafoss-companion/issues/176). Do
  not extend the media work toward it.
- Voice or video _calls_. `docs/architecture/system.md` gates those
  separately and puts them outside the conference commitment; Chat #26 owns
  the ordering.
- Repairing Chat's failing test pipeline (it fails at Checkout with LFS
  before Gradle runs — review finding 5). It is a genuine blocker for
  running that repo's tests and it is not this task; raise it on its own
  issue.
