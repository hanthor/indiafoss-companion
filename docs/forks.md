# What is different in our forks

Every repository this project builds on diverges from its upstream on purpose,
and each divergence is something an attendee's phone depends on. This file is
the map: what each fork carries, why, and what is upstream's to take back.
**Shipping a feature that touches a fork means updating this file in the same
change** — a fork whose differences live only in git log is a fork nobody can
reason about.

Revision pins live in `patches/neutrino/version.json`; this file explains
them. The chain from these forks to a handset is:
`hanthor/neutrino` (`neutrino.rev`) → compiled into `hanthor/neutrino-iroh`
(`source`/`ref`/`commit`) → `.aar` built by
[`neutrino-bindings.yml`](../.github/workflows/neutrino-bindings.yml) and
published as the release `neutrino-bindings-<version>` → pinned by version and
SHA-256 in the Chat app. `version` names both commits
(`0.8.2-e2ee.<neutrino rev>-ble.<neutrino-iroh commit>`), and the workflow
refuses one that does not, so no earlier release asset is ever overwritten
(`patches/neutrino/README.md`, "How the bindings are pinned").

## hanthor/neutrino — the embedded homeserver

Forked from `element-hq/neutrino` at v0.7.1 (`90bc1b1`). Branch:
`e2ee-key-transport`, 18 commits ahead. Four groups:

**End-to-end encryption transport** (the branch's namesake, also carried as
`patches/neutrino/0001…0005`). Upstream v0.7.1 stores no real device keys and
carries no to-device messages, so no client could run Olm/Megolm against it.
The fork adds: real device-key storage and one-time-key handout; device keys
and to-device messages across federation; delivery through the durable outbox
(a key share survives the node restarting); to-device and real key counts
through sliding sync; persistence for all of it. This is what makes an
encrypted DM between two phones possible at all.

**Client-server surface a real client needs** (patches 0006…0011, plus #4):
redaction, typing/read receipts over federation, `/event`, device-list update
EDUs, whoami/account-data, media with a size cap, CORS, a configurable
join-ingest deadline — and `initial_state` honoured on `createRoom` (#4),
which is the seam a stock client turns encryption on through: Element X sends
`m.room.encryption` there, and before #4 the server dropped it and answered
200 with a plaintext room the client believed was encrypted. Each addition
exists because Element X or our own client hit its absence.

**Media across the low-bandwidth proxy** (#11): on the mesh, federation runs
through the `neutrino-lb` sidecar, which JSON⇄CBOR-transcodes every body to fit
the CoAP-over-BLE wire. A federation media download answers `multipart/mixed`
with a _binary_ body, which is not JSON — so the transcode failed, the 2xx
ingress returned 502, and the recipient turned that into a 404. Text and the
`m.image`/`m.audio` event itself (JSON) arrived, but the blob never did, so
photo and voice-message attachments were silently broken phone-to-phone. The
fix keys off the response `Content-Type`: JSON still transcodes, anything else
(multipart, octet-stream, `image/*`) passes through byte-for-byte with its real
type carried on a sentinel header over the existing `x-matrix` forwardable
prefix — no transport change. The seam was untested because `e2e_media.rs` hits
the router in-process, never through the sidecars; a new `e2e_lb_federation`
media test now covers it. Separate, still open: the 256 KiB upload cap blocks
multi-MB photos at the sender, and no thumbnail endpoints exist.

**Join-storm survival** (#6): a local event referenced _every_ forward
extremity, and past the PDU schema's 20-head cap the builder failed its own
validator — so the join storm a talk's start produces left the room
permanently unwritable by its own members (400 on every send; nothing else
merges heads). Now capped at 20 the way Synapse does it, with the rest left
as extremities for later events to absorb. Found at 22+ shaped-swarm members,
deterministically; invisible on loopback, where joins serialise.

**The room directory** (#1–#3 on the fork): `room_aliases` storage
(first-write-wins claims), `createRoom` honouring `room_alias_name` and
returning `room_alias`/`room_alias_error`, local and federated resolution
(`GET /_matrix/federation/v1/query/directory`), aliases as join targets with
the resolving server added as a join hint. Upstream has no directory at all;
without one the deterministic conference aliases cannot resolve on the mesh.
Includes the fix for server names that carry a port, which every mesh test
missed because 64-hex node ids contain no colon.

**Not yet on the branch:** the gateway-federation patch
(`tuna-os/spindle/contrib/neutrino/0001-gateway-federation.patch`) — dial
named peers, sign outbound requests, fetch a named peer's keys over HTTP. A
venue gateway is built from the branch _plus_ this patch; a phone is built
without it.

Upstream's to take back: all of it, ideally. The e2ee transport and the
directory are not conference-specific.

## hanthor/neutrino-iroh — the federation medium

Forked from `element-hq/neutrino-iroh` at v0.8.2 (`65e4985`). Branch: `main`,
15 commits ahead at `15117e9` (tag `neutrino-kit-15117e9`), which is what the
bindings are now built from — `version.json`'s `source` names the fork; before
`0.8.2-e2ee.2d85348-ble.15117e9` the `.aar` was upstream v0.8.2 with only the
homeserver crates swapped for our fork, so nothing below reached a phone.

- **mDNS LAN discovery** (#1). Upstream discovers peers over BLE only. The
  fork adds iroh's `address-lookup-mdns` (link-local, no internet service —
  deliberately not the `N0` preset, which phones home to `dns.iroh.link`),
  drained into the peer registry so a discovered peer is dialable, not just
  logged. On by default; `--no-default-features` builds a no-multicast node.
- **`neutrino-lan`** (#1): a desktop binary running the same medium
  composition as the Android `start_ble`, minus JNI. Before it existed the
  medium could only be exercised with two handsets in hand. It is also what a
  venue gateway runs.
- **`--peer <64hex>@<ip:port>` seeding** (#1): how a node crosses a routed
  network or a client-isolating AP, and the shape a gateway is configured
  with.
- **Probe on discovery** (#2). Discovering a peer is not the same as reaching
  it; the fork dials a freshly discovered peer immediately, so unreachability
  is a log line at discovery time rather than a 60-second timeout inside
  somebody's invite.

- **`set_discoverable(bool)` on the FFI** (#15). A real BLE hide toggle: the
  node stops (or never starts) advertising while staying able to browse and
  dial, and a value sent before `start_ble` is retained, so a user who chose
  "hidden" is not advertised for the moment between restart and the toggle.
  This is what [Chat #47](https://github.com/hanthor/indiafoss-chat-android/issues/47)
  needs to make "switching off keeps you hidden" true rather than a preference
  that only the UI remembered; uniffi emits it as the static
  `io.element.neutrino.ble.Neutrino_bleKt.setDiscoverable(boolean)`.
  BLE-only — mDNS browse/announce is untouched.
- **Apple build and a media/opus probe** (#7, #8, #11, #12, #14): an
  XCFramework build of the same medium and loopback proofs that the iroh link
  carries full-duplex opus. Not consumed by anything here yet.

Pinned to the _fork's_ neutrino branch — `neutrino-ffi-ble/Cargo.toml` depends
on `hanthor/neutrino` at `e2ee-key-transport` — so the medium's `.aar` carries
the directory and the e2ee transport. The bindings workflow rewrites that
branch dependency to `version.json`'s `neutrino.rev` at build time (the fork's
own lockfile may lag the rev the companion pins: at `15117e9` it resolved
`4a9972d`, one commit behind `2d85348`), so what a handset runs is always the
rev this file and `version.json` name.

## hanthor/indiafoss-chat-android — the phone client

**LFS availability, 8 September 2026:** the fork's missing current-main screenshot
and media-test assets were restored from the exact upstream objects. A separate
cache fetched them back from the fork and passed object integrity verification.
No test baselines or application code changed. See
[the recovery evidence](evidence/chat-lfs-recovery-2026-09-08.md) and
[Chat #44](https://github.com/hanthor/indiafoss-chat-android/issues/44);
test execution remains a separate gate.

**Executed CI restored, 9 September 2026:**
[Chat PR #55](https://github.com/hanthor/indiafoss-chat-android/pull/55) merged as
`952b87a9` after all 14 checks passed. It repairs the `indices()` calls,
permalink and enterprise test expectations, and asynchronous capture tests.
It also supplies 66 reviewed screenshot baselines with provenance in
`docs/indiafoss/snapshot-recovery-2026-09-08.md` in the Chat repository; the initial
LFS restoration itself did not change baselines.

The [main test run](https://github.com/hanthor/indiafoss-chat-android/actions/runs/34291085872)
passed the complete unit/screenshot/coverage command in 34m52s, with 7359 Gradle
tasks (5225 executed, 2134 from cache). Chat #44 and #20 are closed with that
execution evidence. This is not evidence for venue reachability, attachment
delivery, account coexistence or real-device recovery: Chat #45/#46/#48/#49
remain independently scoped.
Forked from Element X Android. Beyond branding and the embedded-Neutrino
wiring it inherits, ours adds:

- **A `MulticastLock`** (#29). Android's Wi-Fi driver drops multicast unless
  one is held, which silently disables the fork's mDNS discovery — the node
  announces itself, hears nothing, and falls back to BLE with no error.
  Without this the Wi-Fi mesh does not exist on a handset.
- **`matrix:` URI handling** for the companion's offline handoff links.
- **A cross-seam DM guard** (#40, for companion #176). On a mesh session the
  app refuses to _create_ an encrypted DM with a user whose homeserver only
  the internet can reach: the Megolm key share is a to-device EDU with no
  relay through a gateway, so the invitee would sit on "waiting for the key"
  forever. Clear refusal instead of a hung padlock; existing DMs still open;
  internet sessions never blocked.
- **Bindings pinned to the fork's rev** (`gradle/libs.versions.toml`,
  `neutrino = "0.8.2-e2ee.<rev>"`), fetched from this repository's
  `neutrino-bindings-*` releases with a checksum. Bumping the fork means
  bumping this pin too, or handsets keep the old server — which is how the
  chat app spent three revisions creating silently-plaintext DMs after the
  fix existed.

## tuna-os/spindle — not our fork

The conference Spindle is developed in its own repository; we consume the
`venue-gateway` branch (MSC4242 state-DAG rooms, `[federation] peers`, the
gateway patch under `contrib/`). Differences from stock Matrix servers are its
own docs' subject (`docs/venue-gateway.md` there).

## What E2EE covers today, and the seam it stops at

Proven, with the evidence in `docs/evidence/`:

- **Phone ↔ phone over the real medium** — encrypt on one node, decrypt on
  another, the Megolm key crossing the iroh link (`two-nodes.e2e.test.ts`
  against `neutrino-lan` nodes).
- **Groups across three mesh homeservers** — one sender's key share fanned to
  two distinct servers, ciphertext-only on the wire, replies proving every
  pairwise link (`mesh-e2ee.e2e.test.ts`, in CI on every push). The group room
  is created the way Element X creates one — `m.room.encryption` in
  `initial_state` — so the whole stock-client path is what is under test.
- **Gateway ↔ Spindle** — keys queried and claimed both ways, device-list
  changes announced, to-device delivered both ways (rung 1, 15/15).
- **E2EE through a flaky link and a recipient crash** — a room key survives
  the recipient's node being SIGKILLed mid-delivery over a BLE-grade impaired
  link, then decrypts after restart (`flaky-link.e2e.test.ts`, opt-in). The
  simulator (`udp-flaky.ts` + the fork's `NEUTRINO_SIM_LINK` transport) is
  what found and now guards three fixes together: a to-device key is made
  durable before its transaction is acked (neutrino#7), hearing from a peer
  resets the outbound backoff so a healed link resumes in seconds
  (neutrino#10), and `m.room_key_request` carries both ways for UTD
  self-healing (neutrino#7). This is an end-to-end heal gate — the fixes are
  belt-and-suspenders, so it does not isolate any one (a node missing only the
  durability half still heals here via re-request). The isolated, deterministic
  durability red/green is the fork's own `cargo nextest`
  (`room_key_is_durable_by_the_time_the_transaction_is_acked`, which reads the
  store right after the ack and cannot be masked by re-request); this job
  catches what the unit tests cannot — the medium dropping to-device, or the
  sender's backoff not resuming after the crash.

Structurally open, and worth being honest about: **a phone cannot run E2EE
with a Spindle user.** Room events cross the seam by store-and-forward — the
gateway holds the room, and both sides converge on it — but a Megolm key share
is a to-device EDU, delivered origin→destination only, and phones never peer
with the Spindle. There is no relay for it, and `/keys/query` against the
Spindle is equally unreachable from a phone. Encrypted rooms therefore work
mesh-wide and internet-wide separately, not across. This is Element's
"dead drops" problem, named in their own P2P roadmap; fixing it means a
store-and-forward for to-device EDUs at the gateway, which does not exist in
any of these repositories yet.
