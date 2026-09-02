# What Neutrino can actually do

For where the wider P2P Matrix effort is heading — Hydra's phases, the ERA
paper, and what the official tracker says is still missing — see
[p2p-matrix-state-of-the-art.md](p2p-matrix-state-of-the-art.md).

Measured, not read off a README. `tools/neutrino-probe` starts from the list of
client-server endpoints `packages/matrix` really calls and asks a running
Neutrino what happens, distinguishing three outcomes that matter to us:

- **works** — the call succeeds _and_ the response shows the server did it;
- **stub** — 200 with nothing behind it, which is worse than a 404 because the
  client believes the feature is on;
- **missing** — 404/405.

Re-run it against every version bump:

```sh
cargo run --bin neutrino                       # in an element-hq/neutrino checkout
pnpm --filter @indiafoss/neutrino-probe start  # defaults to http://localhost:8008
```

Alongside the probe there is an **e2e suite** — `pnpm --filter
@indiafoss/neutrino-probe test` — holding two kinds of test:

- **contracts**: the behaviour mesh chat depends on (send, history, replies,
  reactions, membership, sync). If one breaks upstream, chat is broken and we
  find out from CI rather than from a phone at the venue.
- **tripwires**: each missing feature is asserted _still missing_. When
  upstream implements redaction or receipts, the tripwire fails, and that
  failure is the reminder to go and turn the feature on. A gap that closes
  silently is a feature we never ship.

Both skip cleanly when no server is running, so `pnpm -r test` stays green
without a Rust toolchain. The `Neutrino e2e` workflow builds a server weekly
and runs them.

## Results — neutrino @ `90bc1b1`, 2026-09-02

`9 working, 1 caveated, 9 missing` — the raw probe reports the caveated row as
a stub, because it is a partial implementation rather than a complete one.

| Companion feature         | Endpoint                               | Result                                                                                 |
| ------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| Create a room             | `POST /createRoom`                     | works                                                                                  |
| Sync                      | `GET /sync`                            | works                                                                                  |
| Send a message            | `PUT /rooms/{}/send/m.room.message/{}` | works                                                                                  |
| History / backfill        | `GET /rooms/{}/messages`               | works                                                                                  |
| **React to a message**    | `PUT /rooms/{}/send/m.reaction/{}`     | **works** — the annotation is stored and comes back in `/messages`                     |
| Invite someone            | `POST /rooms/{}/invite`                | works                                                                                  |
| Display name              | `GET /profile/{}/displayname`          | works                                                                                  |
| **Un-react / delete**     | `PUT /rooms/{}/redact/{}/{}`           | missing (404)                                                                          |
| **Typing indicator**      | `PUT /rooms/{}/typing/{}`              | missing (404)                                                                          |
| **Read receipt**          | `POST /rooms/{}/receipt/m.read/{}`     | missing (404)                                                                          |
| **Member list**           | `GET /rooms/{}/joined_members`         | missing (404) — but `GET /rooms/{}/members` works, and the client now falls back to it |
| **Files and photos**      | `POST /_matrix/media/v3/upload`        | missing (404)                                                                          |
| E2EE: upload device keys  | `POST /keys/upload`                    | works — first device only, filed under a hardcoded id                                  |
| E2EE: query device keys   | `POST /keys/query`                     | works — the uploaded device comes back intact                                          |
| E2EE: claim one-time keys | `POST /keys/claim`                     | missing (404)                                                                          |
| E2EE: to-device           | `PUT /sendToDevice/{}/{}`              | missing (404)                                                                          |
| Public room directory     | `GET /publicRooms`                     | missing (404)                                                                          |
| Whoami                    | `GET /account/whoami`                  | missing (404)                                                                          |
| Account data (DM list)    | `PUT /user/{}/account_data/{}`         | missing (405)                                                                          |

Two things the probe found that the README does not say:

**Identity is a stub.** Register and login return the same canned answer
whatever you send: `@alice:localhost`, `syt_1234567890abcdef`, device
`DEVICEID`. Two phones on a mesh would both believe they are Alice. In the
embedded FFI build identity comes from the node's ed25519 key, so this may be
the dev binary only — but it means the dev binary cannot be used for
multi-user testing as-is, which is the first thing anyone adding features will
want.

**E2EE is closer than "no E2EE" suggests, and the gap is precise.** The device
key directory is real: upload a device and `/keys/query` returns it intact,
signatures and all. What is missing is session establishment — `keys/claim` and
`sendToDevice` both 404 — so no client can start an Olm session however good
its crypto is. One-time keys are accepted and answered with a canned count of
100 that nothing can ever hand out.

Two flaws in the directory itself: every device is filed under the literal id
`DEVICEID` whatever `device_id` was sent, and only the _first_ upload is kept —
later devices get a 200 and are discarded.

(An earlier version of this document said the key endpoints stored nothing at
all. That was wrong, and the mistake is worth recording: the probe had sent an
empty `device_keys` object first, and the first-upload-only rule locked that in
for the life of the process. Measured again on a fresh server, the keys
round-trip. Tests that depend on server state prove whatever the state says.)

**It misreports its own room version.** `/capabilities` claims plain room
version 12:

```json
{ "capabilities": { "m.room_versions": { "available": { "12": "stable" }, "default": "12" } } }
```

…while the engine logs `supported=["org.matrix.msc4242.12"]` and every room it
creates carries `{"room_version": "org.matrix.msc4242.12"}` — the experimental
MSC4242 state-DAG version from Hydra phase 2, not room version 12. A client or
server trusting `/capabilities` would conclude it was talking to an ordinary
v12 homeserver. Worth reporting upstream.

The server also reports `room versions supported=["org.matrix.msc4242.12"]` and
`federation security: authenticate_connections: false, sign_messages: false` at
startup — matching the README's "does not yet put signatures on events, nor
does it check them".

## What this means for the companion

On the mesh path, of the chat features we ship:

| Feature                 | Mesh | Why                                                                  |
| ----------------------- | ---- | -------------------------------------------------------------------- |
| Send / receive, history | ✅   | plain sends and `/messages`                                          |
| Replies                 | ✅   | a relation in the content plus a fallback body; entirely client-side |
| Reactions (adding)      | ✅   | `m.reaction` is an ordinary event send                               |
| Search                  | ✅   | runs over our own cached timeline                                    |
| Offline outbox          | ✅   | ours, not the server's                                               |
| Un-reacting             | ❌   | needs redaction                                                      |
| Member list             | ✅   | `joined_members` is missing, but the client falls back to `/members` |
| Read receipts           | ❌   | endpoint missing                                                     |
| Typing indicators       | ❌   | endpoint missing                                                     |
| Files and photos        | ❌   | no media repository                                                  |
| E2EE                    | ❌   | directory works; no key claim or to-device, so no session can start  |

Our own docs previously implied typing, files and photos worked over the mesh.
They do not, and now say so.

## A ladder, cheapest first

Ordered by what actually improves a conference conversation per unit of work,
not by spec completeness.

1. **Real identity in the dev binary.** Nothing else can be tested with two
   users until register/login stop returning Alice. Prerequisite for all of
   the below.
2. **Redaction.** One core primitive that unblocks un-reacting and deleting a
   message you regret. Small, and the event type already exists.
3. ~~**`joined_members`.**~~ Done client-side: `/members` exists and the
   client now falls back to it, so no upstream work is needed.
4. **Read receipts, then typing.** Both are EDUs; receipts are the more useful
   of the two in a room where people drift in and out.
5. **A media repository.** The biggest surface, and the one most constrained by
   BLE bandwidth — worth prototyping a size cap before building it.
6. **E2EE.** Smaller than "no E2EE" implies, because Matrix keeps the crypto in
   the client and we already have Megolm in `packages/matrix`. The server's
   remaining job is a key directory and a relay:
   - fix the directory to key on the real `device_id` and accept more than one
     device;
   - store one-time keys per device and implement `POST /keys/claim`;
   - implement `PUT /sendToDevice/{type}/{txn}` and deliver the messages in
     `/sync` under `to_device`;
   - federate both across the mesh — the hard part, since every phone is its
     own node, so a key query and a to-device message have to cross the iroh
     link. The federation routes registered today are backfill, join/leave and
     `send`; device keys and to-device EDUs are not among them.

   The first three are ordinary storage-and-routing work. The fourth is the
   real design question, and the one to put to upstream before writing code.

Everything above 3 needs upstream work in `element-hq/neutrino`. Two notes on
how:

- **Upstream, do not fork.** Neutrino is moving fast and is pre-alpha; a
  long-lived fork of it would be a maintenance trap for a conference app.
- **`neutrino-testkit` is the test rig.** It is a multi-federation harness and
  its loopback tests drive iroh over UDP, so features can be developed and
  tested in CI without a pair of phones. BLE hardware is only needed for the
  transport itself, which we are not changing.

## The security caveat

Neutrino is explicitly "**NOT SECURE** for use on the public internet" and does
not sign or verify events. Adding chat features to it is reasonable for a venue
mesh among people who have scanned each other's QR codes in person. It is not a
route to a general chat product, and nothing here should be exposed to the open
internet before the signature work lands upstream.
