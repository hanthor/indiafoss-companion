# What Neutrino can actually do

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

## Results — neutrino @ `90bc1b1`, 2026-09-02

`8 working, 1 stubbed, 10 missing`

| Companion feature           | Endpoint                               | Result                                                             |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| Create a room               | `POST /createRoom`                     | works                                                              |
| Sync                        | `GET /sync`                            | works                                                              |
| Send a message              | `PUT /rooms/{}/send/m.room.message/{}` | works                                                              |
| History / backfill          | `GET /rooms/{}/messages`               | works                                                              |
| **React to a message**      | `PUT /rooms/{}/send/m.reaction/{}`     | **works** — the annotation is stored and comes back in `/messages` |
| Invite someone              | `POST /rooms/{}/invite`                | works                                                              |
| Display name                | `GET /profile/{}/displayname`          | works                                                              |
| **Un-react / delete**       | `PUT /rooms/{}/redact/{}/{}`           | missing (404)                                                      |
| **Typing indicator**        | `PUT /rooms/{}/typing/{}`              | missing (404)                                                      |
| **Read receipt**            | `POST /rooms/{}/receipt/m.read/{}`     | missing (404)                                                      |
| **Member list**             | `GET /rooms/{}/joined_members`         | missing (404)                                                      |
| **Files and photos**        | `POST /_matrix/media/v3/upload`        | missing (404)                                                      |
| E2EE: upload device keys    | `POST /keys/upload`                    | answers `{"one_time_key_counts":{"signed_curve25519":100}}`        |
| **E2EE: query device keys** | `POST /keys/query`                     | **stub** — 200 with an empty device object; nothing was stored     |
| E2EE: claim one-time keys   | `POST /keys/claim`                     | missing (404)                                                      |
| E2EE: to-device             | `PUT /sendToDevice/{}/{}`              | missing (404)                                                      |
| Public room directory       | `GET /publicRooms`                     | missing (404)                                                      |
| Whoami                      | `GET /account/whoami`                  | missing (404)                                                      |
| Account data (DM list)      | `PUT /user/{}/account_data/{}`         | missing (405)                                                      |

Two things the probe found that the README does not say:

**Identity is a stub.** Register and login return the same canned answer
whatever you send: `@alice:localhost`, `syt_1234567890abcdef`, device
`DEVICEID`. Two phones on a mesh would both believe they are Alice. In the
embedded FFI build identity comes from the node's ed25519 key, so this may be
the dev binary only — but it means the dev binary cannot be used for
multi-user testing as-is, which is the first thing anyone adding features will
want.

**E2EE fails silently rather than loudly.** `keys/upload` returns a key count
and `keys/query` returns 200, so a client concludes encryption is set up; then
`keys/claim` and `sendToDevice` 404 and nothing can be encrypted. A 404 on
`keys/upload` would be friendlier than a lie.

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
| Member list             | ⚠️   | `joined_members` is missing; derivable from `m.room.member` in sync  |
| Read receipts           | ❌   | endpoint missing                                                     |
| Typing indicators       | ❌   | endpoint missing                                                     |
| Files and photos        | ❌   | no media repository                                                  |
| E2EE                    | ❌   | stubbed; mesh rooms are unencrypted                                  |

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
3. **`joined_members`.** Or we stop calling it and derive membership from sync
   — a client-side change we can make without touching Neutrino.
4. **Read receipts, then typing.** Both are EDUs; receipts are the more useful
   of the two in a room where people drift in and out.
5. **A media repository.** The biggest surface, and the one most constrained by
   BLE bandwidth — worth prototyping a size cap before building it.
6. **E2EE.** The largest piece by far. Until then, the honest interim fix is to
   make `keys/upload` and `keys/query` 404 so clients stop believing in it.

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
