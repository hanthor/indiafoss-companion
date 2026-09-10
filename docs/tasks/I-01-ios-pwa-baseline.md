# I-01 — An iPhone attendee has a rehearsed, honest conference day

- Status: Needs hardware
- Repository: indiafoss-companion
- Tracks: [#199](https://github.com/hanthor/indiafoss-companion/issues/199)
  (stage I0)
- Size: M

## Why this matters

An iPhone attendee arrives at IndiaFOSS 2026 and needs the same three things
everyone else needs: their next session offline, a way to keep someone they
met, and a way to message. There is no native iOS Companion and no iOS mesh
Chat. What exists is the Companion PWA and any ordinary App Store Matrix
client signed into a reachable server. That combination is the honest 2026
iPhone promise — and right now nobody has actually walked it end to end on a
physical iPhone.

This task is the rehearsal. It produces the instructions we hand an iPhone
attendee and the evidence that those instructions work. It is worth doing
even if every later iOS stage is deferred forever.

## Context you need

`docs/architecture/ios.md` names this stage I0 and describes it as:

> | I0: conference baseline | PWA installed or browser, cached event/plan, QR
> and room handoff | Tested App Store Matrix client using existing or
> provisioned account | Physical iPhone: fresh onboarding, encrypted DM, room
> join, verification/recovery, cold/warm links and loss of connectivity |

and states plainly:

> Standard-client I0 is useful even if all later stages are deferred.

and:

> Until those pass, the honest 2026 promise is PWA Companion plus tested
> reachable-server Matrix chat.

ADR 0005 records the same thing as its Stage 0 ("now, no new code"): the
Companion PWA hands off with `matrix:` URIs, matrix.to as web fallback, and
any App Store Matrix client signs into the venue homeserver over Wi-Fi or
cellular. What an iPhone does **not** get is the offline-in-the-hall path.

Four iOS-specific caveats change what you must test, and all four are
inlined here because they are the whole reason this is a hardware task and
not a documentation task.

**1. Web Push on iOS is an online notification, not an offline alarm.**
From `docs/architecture/ios.md`:

> Home Screen web apps can request Web Push from user interaction on
> iOS/iPadOS 16.4+, using APNs; this requires connectivity and is not an
> offline alarm mechanism.
> ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))

Two consequences. The permission prompt only appears from a genuine user
interaction inside an **installed Home Screen** web app, so a browser tab
will not get it. And a push that depends on APNs will not arrive when the
venue Wi-Fi is unusable — which is exactly when a session-reminder matters
most. Anything the app says about reminders must be true offline or must not
be said.

**2. PWA storage is not durable native storage.**

> On iOS, the PWA remains a valuable broad-access baseline, but caching is
> not the same as guaranteed durable native storage. Rehearse storage loss
> and export recovery.

Safari can evict site data. An attendee who loses their starred plan the
night before the conference has lost real work. The recovery path is the
existing export/import journey, and it has to be rehearsed on a real device,
including the case where the data is already gone.

**3. A `matrix:` URL is not a reliable app-selector on iPhone.**

> Offer a standards-compatible Matrix link for third-party clients, with
> copyable room/MXID and browser fallback. Do not assume a `matrix:` URL
> selects the intended installed client or account on every iPhone.

So every place the Companion offers a room or a person, it must also offer
the plain room alias / MXID as copyable text and an `https://matrix.to/…`
fallback that works in Safari. This is a product requirement, not a
troubleshooting tip.

**4. Offline QR import must not need the network.**

> Offline QR contact import should carry sufficient public data without
> requiring a URL fetch.

If the scanned payload is only a pointer, the import fails in the hall,
which is the only place it is ever used.

Finally, `docs/architecture/system.md` sets the update behaviour the PWA is
supposed to have and which you are verifying on device:

> Check on launch, foreground return, reconnect and manual refresh, with
> bounded fetch timeouts, freshness limits and retry backoff. Background
> refresh is opportunistic. Display the actual locally stored revision/time
> and make offline operation useful.

## What unblocks this, and who decides

This is **Needs hardware**, not Blocked: no decision is outstanding. It
needs, physically:

- at least one iPhone the tester can install a Home Screen web app on and
  can put into Airplane Mode at will;
- a second device (any platform) to be the other end of a DM and the other
  end of a QR exchange;
- a reachable homeserver — the venue Spindle or the conference homeserver —
  and either an existing MXID or a provisioned temporary account per the
  maintainer decision recorded in
  [#181](https://github.com/hanthor/indiafoss-companion/issues/181);
- a published Companion build the iPhone can reach over HTTPS.

The maintainer (James) decides only one thing here: which homeserver and
which account provisioning path the rehearsal uses. Everything else is
execution.

## What to do

1. Walk the attendee journey on a **physical iPhone** — not the simulator,
   not a Mac Safari window with a mobile user-agent — and write down what
   actually happens at each step, with timestamps.

2. **Companion PWA, installed.** Load the published Companion in Safari, add
   it to the Home Screen, and confirm: the event bundle is cached; the app
   opens and shows the schedule with Wi-Fi and cellular both off; the
   displayed revision and last-check time match what is actually stored;
   starring a session and building a plan works offline; reconnecting
   triggers a check without a manual reload.

3. **Companion PWA, in the browser.** Repeat the core reads in a plain
   Safari tab, since some attendees will never install. Record every place
   the two differ — notification permission is the known one; find the rest.

4. **Web Push, honestly.** From the installed Home Screen app, request Web
   Push from a real button tap. Record whether the prompt appears, on which
   iOS version, and what arrives. Then repeat with the device offline and
   record that nothing arrives. If any Companion copy implies reminders work
   without connectivity on iOS, fix the copy in this change.

5. **Storage loss and export recovery.** Export the personal plan through
   the existing export path. Then destroy the site data (Settings → Safari →
   Advanced → Website Data, or Clear History) and reopen the app. Record
   exactly what the attendee sees. Import the export and confirm the plan
   returns, including the conflict/duplicate preview.

6. **Chat with an ordinary App Store Matrix client.** Install a stock client
   (Element X iOS first, and at least one other so the instructions are not
   single-client). Do a fresh onboarding with an existing MXID or a
   provisioned temporary account. Then: an encrypted DM to the second
   device, both directions, with decryption confirmed on both ends; joining
   a conference room by its canonical alias; device verification; and
   recovery-key backup and restore. Record failures as findings — do not
   work around them silently.

7. **Links, cold and warm.** From the Companion, follow a room handoff and a
   contact handoff both when the Matrix client is already running (warm) and
   after force-quitting it (cold), and once with **no** Matrix client
   installed at all. Confirm the copyable room alias / MXID and the
   `matrix.to` browser fallback are present and usable in every case. If
   `matrix:` selects the wrong client, the wrong account, or nothing, that
   is the expected result to document, not a bug to chase.

8. **Offline QR contact import.** With both devices in Airplane Mode,
   exchange contact cards by QR. Confirm the import completes with no
   network fetch and that the resulting trust state is displayed honestly —
   "met in person" and "card signature valid" are not "Matrix identity
   verified".

9. **Loss of connectivity, mid-flow.** Drop connectivity while a message is
   sending, while an update check is in flight, and while a room join is in
   flight. Record what the attendee is told in each case and whether state
   survives a force-quit and relaunch.

10. Write the results as an evidence file under `docs/evidence/`, following
    the shape of the existing files there (see
    `docs/evidence/rung1-interop-2026-09-06.md`), and write or update the
    attendee-facing iPhone instructions that fall out of it. Both land in
    this change.

## Acceptance

There is no command that passes this task. The deliverable is device
evidence, and it is only accepted if it carries all of:

- **Devices**: each iPhone by model and exact iOS version (Settings →
  General → About), plus the second device's model and OS.
- **Software**: the Companion build URL and revision, each Matrix client by
  name and App Store version, and the homeserver's name and version.
- **Topology**: which network each step ran on — venue Wi-Fi, cellular,
  Airplane Mode, or Wi-Fi with WAN removed — stated per step, not once at
  the top.
- **Timestamps**: for each scenario, so a reader can tell a five-second
  reconnect from a five-minute one.
- **Limitations**: what was not covered. At minimum state the iOS versions
  _not_ tested, the clients not tried, and that no result here says anything
  about mesh, offline delivery, or cross-seam encryption.

Each of the nine scenarios above gets an explicit pass/fail/partial, and a
partial says which half worked. The negative results are the point: "Web
Push did not arrive with the device offline" and "`matrix:` opened the
wrong client" are successful outcomes of this task.

Then check the evidence in and confirm the attendee-facing instructions
match it exactly, including the honest limits. Instructions that promise
more than the evidence shows are the specific failure this task exists to
prevent.

## Out of scope

- **Do not create `apps/ios/`, any Swift file, or any Xcode project.** A
  native Companion is gated behind **I-02** and its admission dossier.
  Nothing in this task authorizes starting it.
- Do not build or fork an iOS Chat client. That is stage I2 in
  `docs/architecture/ios.md` and is behind the same gate.
- Do not test or promise iOS mesh participation. Stages I3/I4 do not exist
  and an iPhone has no mesh node.
- Do not fix the PWA update-check latch here. That defect is real and is
  owned by **C-01**; if you hit it during the rehearsal, record it against
  C-01 and continue.
- Do not fix contact trust-state labelling here. **C-10** owns it; record
  what you saw.
- Do not rehearse the venue gateway or room seeding. That is **C-14** and
  needs the venue network, not an iPhone.
