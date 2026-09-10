# X-03 — Two accounts on one phone, and neither one can destroy the other

- Status: Ready
- Repository: **indiafoss-chat-android**
- Tracks: Chat
  [#46](https://github.com/hanthor/indiafoss-chat-android/issues/46) /
  [#47](https://github.com/hanthor/indiafoss-chat-android/issues/47)
- Size: L

## The work happens in another repository

The Chat client is
[`hanthor/indiafoss-chat-android`](https://github.com/hanthor/indiafoss-chat-android).
**Do not create Kotlin or Swift files in indiafoss-companion for this
task.** This spec lives here because the architecture does.

## Why this matters

An attendee has their real Matrix account and a temporary conference
account, or a classic account and a mesh identity. Today, one client, one
session. If a second account is added carelessly, the paths that already
exist — "restore the first credential", "reset everything" — can take the
first account's keys with them. The attendee loses their encrypted history
on a phone in a conference hall, permanently.

Worse, the failure mode that matters most is silent and stupid: the mesh
transport is unavailable, session restoration throws, and a cleanup path
deletes credentials or a database that was perfectly good. An unreachable
radio must never be able to destroy a crypto store.

## Context you need

### The requirement, verbatim

`docs/architecture/system.md`, "Account lifecycle and storage":

> Each account has its own SDK session, crypto store, media namespace,
> notification routing and logout operation. A coordinator can select an
> active account and later maintain multiple sessions; failure to start one
> must not erase another. Mesh-node keys must survive ordinary app restarts
> and upgrades. Companion stores neither Chat tokens nor Chat crypto
> databases. Sharing a device or visual profile does not authorize copying
> private keys between apps.

Five things are per-account, and all five: **SDK session, crypto store,
media namespace, notification routing, logout.** A per-account logout means
signing out of one account leaves the other fully working — same for a
per-account reset.

### The upstream finding, which applies to Android too

This comes from `docs/architecture/ios.md`, where it was written about
Element X iOS, but the Android fork descends from the same product family
and the same design, so treat it as a finding about **this** design:

> The current UserSessionStore enumerates stored IDs but restores the first
> credential into one session. It also has an all-account reset path. This
> is not evidence of a complete concurrent-account product. Design an
> explicit coordinator with separate stores, active-account selection and
> account-scoped reset/logout. Audit transient restoration errors so
> unavailable mesh transport cannot cause credential/database deletion. Do
> not transplant Android's foreground-service lifecycle to iOS.

Two things to take from it. First, **enumerating stored account IDs is not
multi-account support** — if the restore path takes the first credential and
builds one session, the rest are inventory, not sessions. Do not read the
existing store's ability to list IDs as evidence that the hard part is done.
Second, **the transient-error audit is the safety-critical piece**: every
place that deletes credentials or a database on a restoration error must be
examined, and anything that can be triggered by a temporary condition —
transport unavailable, node not started, network gone, storage briefly
locked — must be made non-destructive. Failing to start is a state to
report, not a reason to erase.

The corresponding iOS files named in `docs/architecture/ios.md` are
`ElementX/Sources/Services/UserSession/UserSessionStore.swift` and
`NSE/Sources/NotificationServiceExtension.swift`. The Android fork's
equivalents are **not** at those paths. **Locate the Android session-store
and notification-handling equivalents in the chat-android repository
yourself, and verify every path before editing — this spec was written from
Companion's documentation of upstream, not from that repository.**

### The account-provisioning decision, already settled

From `docs/architecture/system.md`, and matching the maintainer's answer
recorded on
[#181](https://github.com/hanthor/indiafoss-companion/issues/181):

> Bring an existing MXID, or provision a temporary Spindle account under the
> recorded maintainer decision. Offline mesh onboarding works before
> provisioning; a persisted provisioning request can resume online without
> creating duplicate accounts. Treat the temporary account as a real
> separate account with disclosed expiry, operator, deletion/export policy
> and recovery limits.

This is settled — do not re-open it, and do not design a third option. What
it obliges you to build:

- **Offline mesh onboarding before provisioning.** An attendee can start
  using the mesh in a hall with no internet and no server account.
- **A persisted provisioning request that resumes online without creating
  duplicates.** The request survives restarts; when connectivity returns it
  completes exactly once. Two launches must not yield two accounts, and
  neither must one launch plus one manual retry.
- **The temporary account is a real, separate account.** Its own session,
  crypto store, media namespace, notification routing and logout — the same
  five as any other. Not a mode of the mesh identity.
- **Disclosure at creation**, not buried in settings: when it expires, who
  operates it, what happens to the data on deletion, how to export, and what
  recovery is and is not possible.

And the honest limit, from the same section:

> A backup hosted only on an expiring service is not a complete recovery
> plan. Changing an MXID does not transparently migrate room membership or
> encrypted history.

So the app must never present key backup on the temporary Spindle account as
durable recovery. If the account expires, the backup expires with it.

## What to do

1. **Introduce an explicit `AccountCoordinator`** that owns the set of
   accounts and the selection of the active one. It does not inherit
   restore-the-first-credential behaviour. Selection is explicit and
   persisted; startup restores the account the attendee last used, and a
   failure to restore it surfaces as an error state with the other accounts
   still intact.

2. **Separate the five per-account resources.** Each account gets its own
   SDK session, its own crypto store on disk under an account-scoped path,
   its own media namespace, its own notification routing, and its own logout
   operation. Nothing shared, nothing keyed by "the current account" at the
   storage layer — an account-scoped path must be derivable from the account
   identifier alone, so a bug in selection cannot point one account at
   another's keys.

3. **Audit every destructive path.** Find every place that deletes
   credentials, a session store or a crypto database. For each one, write
   down what triggers it. Then:
   - remove or gate any all-account reset that a _single_ account's failure
     can reach;
   - make restoration errors non-destructive by default, and classify them
     explicitly as transient (retry, report, keep everything) or permanent
     (and even then, require an explicit attendee confirmation before
     deleting a crypto store);
   - specifically verify that an unavailable mesh transport, a node that
     fails to start, and a missing network cannot reach any deletion path.

   This audit is the highest-value part of the task. Write it down in the
   PR; a reviewer must be able to check it without rediscovering the paths.

4. **Make mesh-node keys survive restarts and upgrades.** Persist the node
   identity outside anything that is cleared on session change, app update
   or cache eviction. Test it across an actual APK upgrade, not just a
   relaunch.

5. **Per-account logout and reset.** Logging out of one account clears
   exactly that account's session, crypto store, media and notification
   registration, and leaves the other accounts signed in and able to decrypt
   their own history.

6. **Route notifications per account.** Every incoming push resolves to the
   account it belongs to before any decryption is attempted, and when
   decryption is unavailable, show a safe generic notification rather than
   guessing or leaking. `docs/architecture/ios.md` states the equivalent
   requirement for the iOS extension: "Route every push to its account,
   coordinate SDK database access, and use a safe generic notification when
   decryption is unavailable."

7. **Build the provisioning flow** as described above: offline mesh
   onboarding first; a persisted provisioning request with an idempotency
   key so a resume cannot duplicate; and a disclosure screen at creation
   naming expiry, operator, deletion/export policy and recovery limits.

8. **State the recovery limits where the attendee will see them** — at the
   point they set up key backup on a temporary account, not only in a help
   page. A backup on an expiring account is not a recovery plan, and the
   screen should say so.

9. **Tests**, following the chat-android repository's conventions:
   - two accounts sign in; both restore after a restart; the active
     selection persists;
   - account A failing to restore leaves account B fully functional and
     leaves A's stored data untouched;
   - a simulated transport-unavailable error during restoration deletes
     nothing — assert on the files, not just on the state;
   - logout of A leaves B able to decrypt its history;
   - a push for B never resolves to A;
   - the mesh node identity is byte-identical across a restart and across an
     upgrade;
   - a persisted provisioning request that resumes twice produces one
     account.

## Acceptance

Run the chat-android repository's own build, lint and test commands (read
its CI configuration for the current ones; note that its pipeline currently
fails at Checkout with LFS before Gradle runs, per
`docs/architecture/review-2026-09-07.md` finding 5 — if that is still true,
run the tests locally and say so rather than reporting a red pipeline as
green).

Then on a device:

- Sign into two accounts. Restart. Both are present, the last-active one is
  selected, and both decrypt their own history.
- Turn off every transport the mesh could use, force-stop, relaunch. Confirm
  by inspecting the app's data directory that no crypto database or
  credential file was removed. This is the specific regression this task
  exists to prevent — assert on the filesystem, not on a green screen.
- Log out of one account. The other still works, including decryption of
  older messages.
- Upgrade the APK over the top. The mesh node identity is unchanged and both
  accounts survive.
- Create a temporary account offline-first: onboard on the mesh with no
  internet, then reconnect and confirm exactly one account is provisioned.
  Repeat the resume twice and confirm still exactly one.
- Read the temporary account's disclosure screen and check every one of
  expiry, operator, deletion/export policy and recovery limits is present.

The negative case: with two accounts present, verify there is no code path
that resets both. If an all-account reset must exist for a support scenario,
it is reachable only from an explicit, clearly labelled attendee action —
never from an error handler.

## Out of scope

- **Automatic routing between a person's accounts, and merged
  conversations.** The identity binding those depend on does not exist:
  `docs/architecture/system.md` says "The current profile comparison is
  inadequate for automatic routing," and **C-12**
  ([#188](https://github.com/hanthor/indiafoss-companion/issues/188)) owns
  the specification. Build coexistence; stop there.
- **The durable outbox and delivery states.** That is **X-02** (Chat #48).
  This task is its prerequisite — the outbox records a sending account — but
  the two must not merge into one unreviewable change.
- **Media transport and the attachment 404.** That is **X-01**.
- **Post-event history archiving and MXID migration.**
  `docs/architecture/system.md` requires the lifecycle to be settled first,
  and the review recommends deferring automatic archiving until it is. Do
  not build an archive on top of a temporary account.
- **Deciding the temporary account's lifetime or operator.** Those remain
  maintainer choices recorded on
  [#181](https://github.com/hanthor/indiafoss-companion/issues/181); this
  task consumes whatever values are recorded and displays them, rather than
  choosing them.
- **Cross-seam E2EE with a Spindle user**, which is structurally open and
  owned by [#176](https://github.com/hanthor/indiafoss-companion/issues/176).
  Having two accounts does not connect them.
