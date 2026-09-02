# Optional Matrix messaging

## The model (decided 2026-09-02)

- **In-app chat is peer-to-peer only.** The Android app embeds a Neutrino
  node (`apps/android/capacitor/neutrino`) and the `/chat` screens talk plain
  Matrix to it on loopback. There is no public-homeserver sign-in inside the
  app.
- **Public Matrix lives in a real Matrix client.** Contact cards, speaker
  profiles and scanned codes carry Matrix ids and open them in Element via
  `matrix.to`; the companion never joins a public room itself.
- **Why not both:** a Neutrino node is its own homeserver whose identity is
  its Ed25519 key (`@n:<64-hex>`); it federates only with other mesh nodes and
  has no bridge to the public network. A room on the mesh does not exist on
  matrix.org and a public account cannot reach a mesh peer, so running both in
  one app would mean two disconnected conversations under one name. The only
  identity association available is self-asserted: the signed handshake card
  carries both the public Matrix id and the mesh node id, and MSC4133 profile
  fields can point at the same FOSS United profile; neither is verified.
- **Off by default.** `features.chat` (Settings › Peer-to-peer chat) gates
  the Chat tab, the session/booth chat buttons, the Matrix session and the
  node process. Web and iOS have no node and show that plainly.

> Status: implemented in the PWA as an **optional, opt-in** layer (issue #11,
> #5, #8). The schedule, map, ranking, itinerary and contact sharing never
> depend on it. Neutrino (P2P Matrix over Bluetooth) is handled by **handoff**,
> not by embedding — see [ADR 0001](./adr/0001-native-android-client-standalone-vs-neutrino-fork.md).

## What the companion does

The `packages/matrix` client layer speaks standard Matrix and is exercised
against a fake public-style homeserver in tests; the app itself only ever
points it at the embedded node. The right-hand column is the parked Element X
fork, kept as the reference implementation of the node integration.

| Capability            | Client layer (`packages/matrix`)                               | Native Neutrino client (Element X fork, parked)           |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| Sign in               | Password/SSO supported; the app uses only the on-device node   | Its own embedded homeserver; each node is its own account |
| Conference rooms      | Listed from the event bundle, joined on request                | Joined by alias / `matrix:` link from the QR handoff      |
| Direct messages       | Standard Matrix DMs (`m.direct`)                               | P2P DMs by Neutrino peer identity                         |
| Room discovery        | Bundle list, public-room directory search, join by alias       | BLE peer discovery + bundle list                          |
| Offline               | Cached rooms/timelines, outbox with idempotent retries         | Mesh delivery over BLE/Iroh                               |
| E2EE                  | Not supported (encrypted rooms are read-only placeholders)     | Not yet supported by Neutrino either                      |
| Identity verification | Not in the companion; "unverified" until done in a full client | Matrix cross-signing (future)                             |

The implementation lives in `packages/matrix` (protocol layer, no framework
dependencies) and `apps/web/src/lib/matrix.svelte.ts` (reactive state +
IndexedDB persistence). UI: `/chat`, `/chat/[roomId]`, contact sharing and
scanning on `/connect` and `/scan`.

### Neutrino's missing features, covered on the companion side

The Neutrino README lists what the embedded homeserver does not do yet:
end-to-end encryption, file transfer, typing indicators and read receipts.
The companion's client layer implements all four against standard Matrix
(proven in tests against a fake homeserver), so the same UI lights up on the
mesh node as Neutrino grows into them:

- **E2EE (Megolm).** `packages/matrix/src/crypto.ts` wraps
  `@matrix-org/matrix-sdk-crypto-wasm` (the crypto crate behind Element X).
  On sign-in the session manager creates an `OlmMachine` for the device
  (store: IndexedDB, deleted on sign-out), feeds every `/sync` with
  `to_device`, `device_lists` and one-time-key counts, and pumps the
  machine's outgoing requests (`/keys/upload`, `/keys/query`, `/keys/claim`,
  `/sendToDevice`). Sending in an encrypted room tracks the room's joined
  members, claims missing Olm sessions, shares the Megolm session and sends
  `m.room.encrypted`; incoming events are decrypted before the reducer runs.
  Ciphertext whose key has not arrived is kept (`raw`) and retried when the
  room-key callback fires. New DMs are created encrypted. Devices that join
  later cannot read earlier history — that is Megolm's forward-secrecy
  contract, and the UI says "waiting for the key" rather than pretending.
  Senders stay _unverified_ (no cross-signing UI in the companion).
- **Typing.** Throttled `PUT /typing` from the composer; `m.typing` ephemeral
  events are folded into the snapshot per room (sender excluded).
- **Files and photos.** `sendFile()` uploads to the content repository and
  sends `m.image`/`m.file`; in encrypted rooms bytes are AES-CTR encrypted
  with `Attachment.encrypt` first and the `EncryptedFile` descriptor rides in
  the encrypted event. Downloads use the authenticated media endpoint and
  are decrypted into object URLs (`MediaAttachment.svelte`). Attachments are
  not queued offline.
- **Read receipts.** Sent for the room you have open (existing behaviour).

All of this is exercised by `packages/matrix/src/e2ee.test.ts` with a fake
homeserver that implements the key endpoints: two devices establish Olm
sessions, exchange encrypted text both ways, see typing, round-trip an
encrypted attachment, recover a message whose key arrived late, and confirm
that a third device only reads messages sent after it joined.

### Session, booth and venue-room chats

Every talk, booth and venue room has a chat without organizers creating
anything. `conferenceChatAlias()` derives a deterministic alias —
`#<eventId>-session-<activityId>:<server>`, `…-booth-<boothId>…`,
`…-room-<locationId>…` (prefix and server overridable via
`messaging.aliasPrefix` / `aliasServer`) — and `joinOrCreateRoom()` joins it
or, on `M_NOT_FOUND`, creates a public room with that alias (racing creators
fall back to join on `M_ROOM_IN_USE`). Buttons live on the activity page,
the booth page and next to each live session on Now; the `/chat` list groups
them under "Session, booth and venue chats". Because the alias is derived
from stable ids, every node on the mesh converges on the same room name
without any provisioning.

### Connectivity at the venue (NIMHANS)

Venue Wi-Fi and cellular are unreliable, so the design assumes no network:

1. **Everything you need is already on the device** — schedule, map, ranking,
   itinerary, contacts, and every chat you opened (rooms and timelines are
   cached in IndexedDB).
2. **Messages never fail** — they queue in the outbox with a local echo and
   drain in order when a connection appears, even after a reload.
3. **QR exchange needs no network at all** — contact and friend cards, session
   handoff links and location markers are self-contained payloads.
4. **P2P mesh when the native shell runs Neutrino** — the chat screen probes
   `http://127.0.0.1:3000/_matrix/client/versions`; if an embedded Neutrino
   node answers, it offers "Use the on-device P2P homeserver". The same
   client code then talks to the mesh over loopback, with the deterministic
   session aliases so people in the same hall land in the same rooms over
   Bluetooth/Wi-Fi. Until Neutrino signs events and bridges to public Matrix,
   this is explicitly experimental and shown as such.

### Room discovery and event-room membership

- Organizers publish rooms in the event bundle:

  ```jsonc
  "messaging": {
    "homeserver": "https://matrix.org",
    "space": "#indiafoss-2026:fossunited.org",        // optional
    "rooms": [
      { "alias": "#indiafoss-2026:fossunited.org", "name": "IndiaFOSS 2026", "purpose": "Announcements", "recommended": true },
      { "alias": "#indiafoss-hallway:fossunited.org", "name": "Hallway track", "purpose": "Meet people between talks" },
      { "alias": "#indiafoss-devroom-aosp:fossunited.org", "name": "AOSP devroom", "trackId": "aosp" }
    ]
  }
  ```

  `collectBundleIssues` validates aliases, duplicate rooms and the homeserver
  URL. The `homeserver` value only names the alias server for conference rooms;
  the app never signs in to it. Without a `messaging` block the default is
  `matrix.org` with an empty room list (`apps/web/src/lib/messaging-config.ts`).

- Membership is always explicit: rooms are **suggested**, never auto-joined.
  Invitations appear in `/chat` and are accepted with one tap.
- Directory search uses `POST /_matrix/client/v3/publicRooms` with a search term
  on the signed-in homeserver.

### Public rooms on the organiser's homeserver (FOSDEM-style)

Rooms for everyone with a Matrix account; the mesh for offline. The organiser
runs `matrix.reilly.asia` (server name `reilly.asia`) and does not hand out
accounts. Like FOSDEM, there is a Space and public, world-readable rooms that
attendees join from whatever account they already have, over federation. The
companion never signs in to that server: it links to the rooms and Element
(or any Matrix client) does the rest.

- `events/<event-id>/messaging.json` is the organiser's config; `event-sync`
  merges it into the bundle as `messaging` (2025: `#indiafoss:reilly.asia`
  space, announcements, hallway, one room per hall).
- `tools/matrix-rooms` provisions the rooms idempotently from a bundle:

  ```sh
  pnpm --filter @indiafoss/matrix-rooms start events/indiafoss-2025/normalized/event-bundle.json --dry-run
  MATRIX_ACCESS_TOKEN=... pnpm --filter @indiafoss/matrix-rooms start events/indiafoss-2025/normalized/event-bundle.json
  ```

  It creates the Space, the listed rooms and one room per venue location
  (`--booths` / `--sessions` add per-booth / per-session rooms; the default
  follows FOSDEM's one-room-per-hall) with `public` join rule, `world_readable`
  history and the organiser account as admin, and links each into the Space
  (`m.space.child` / `m.space.parent`). Existing rooms are left alone. The
  token belongs to an organiser account on that server and is never bundled.

- In the app (`apps/web/src/lib/element-links.ts`): "Open room in Element ↗"
  on every session (its hall's room, or a room the organisers tied to the
  session), on booths (their location's room, else the Space) and next to
  live sessions on Now, regardless of the P2P switch; `/chat` lists the Space
  and rooms whenever the mesh is off or not available on this device.
- `collectBundleIssues` rejects a listed room whose `activityId`,
  `locationId`, `boothId` or `trackId` is not in the bundle.

### Offline behaviour and reconnection

- `/sync` long-polls (30 s) with a filter that lazy-loads members and limits
  timelines to 30 events. The `next_batch` token, room summaries and message
  timelines are persisted to IndexedDB (`matrix-rooms`, `matrix-events`), so a
  reload while offline still shows every cached conversation.
- Outgoing messages go to `matrix-outbox` first, are shown immediately as a
  local echo ("Sending…"), and are delivered in order once the homeserver is
  reachable. The client transaction id makes retries idempotent; the local echo
  is replaced when the real event arrives in `/sync` (`unsigned.transaction_id`).
- Network failures set the status to _offline_ and retry with exponential
  backoff (1 s → 60 s, honouring `retry_after_ms` on 429). `online` and
  `visibilitychange` events trigger an immediate reconnect. A 401 /
  `M_UNKNOWN_TOKEN` signs the device out locally and explains why.
- Permanent rejections (e.g. `M_FORBIDDEN` because you are no longer in the
  room) drop the message from the outbox and surface the server's message.

### QR and deep-link handoff

The scanner (`packages/model/src/scan.ts`) accepts, in this order:

| Payload                                                                | Result                                  |
| ---------------------------------------------------------------------- | --------------------------------------- |
| `BEGIN:VCARD…` (incl. `X-MATRIX-ID`, `IMPP`, `X-NEUTRINO-SERVER-NAME`) | contact preview → save / message        |
| `indiafoss://friend?v=1&…`                                             | friend card preview (see below)         |
| `@user:server`, `https://matrix.to/#/@…`, `matrix:u/…`                 | DM confirmation                         |
| `#alias:server`, `!id:server`, matrix.to / `matrix:r/…` room links     | join confirmation                       |
| `indiafoss://chat?dm=…` / `?join=…`                                    | same as above, app-native form          |
| `indiafoss://location/<id>`                                            | set current location                    |
| bare ticket id / `ticket::<id>`                                        | shown as an event-scoped reference only |

Every result is previewed and confirmed before anything is saved, joined or
sent. Nothing auto-messages. PWA users who prefer a full client get an
"Open in Element" link (`https://matrix.to/#/…`); native clients receive the
same payload through `matrix:` URIs (MSC2312).

### Friend payload (app-aware exchange, tier 2)

The universal vCard remains the default share card. The companion friend
card is a versioned query string:

```text
indiafoss://friend?v=1
  &event_id=indiafoss-2026
  &fossunited_profile_url=https://fossunited.org/u/<name>   (human identity anchor)
  &matrix_id=@you:matrix.org                                 (optional, selected)
  &neutrino_server_name=<64 hex>                             (optional, selected)
  &ticket_ref=ticket::<id>                                   (optional, off by default)
  &fn=…&org=…&url=…&social_github=…
```

Decoding drops malformed identities and non-`https`/`mailto` URLs rather than
trusting them; payloads over 4 KiB are rejected. Both `matrix_id` and
`neutrino_server_name` are retained separately — they are **not
interchangeable**.

See [neutrino-e2ee.md](./neutrino-e2ee.md) for what Neutrino itself needs before Megolm works on the mesh.

### Neutrino identity model

Neutrino is Element's embedded Rust homeserver that federates over Iroh
(QUIC) and Bluetooth Low Energy. Facts that shape the design:

- A node's identity is the Ed25519 public key of its node secret, shown as a
  64-character hex `server_name`; BLE advertisements carry that identity plus a
  display name. The default localpart is `n`, so the derived messaging address
  is `@n:<server_name>` (`neutrinoMatrixId()` in the model).
- "Each P2P node is its own user account": there is no account portability and
  no bridge to the public Matrix network yet, so a PWA user on `matrix.org` and
  a Neutrino user cannot message each other today. The companion therefore
  stores the peer identity, derives the address, shows it, and hands off to a
  Neutrino-capable client; it does not pretend to deliver.
- Neutrino is explicitly **not secure for untrusted networks** (events are not
  signed or verified, no E2EE, only the newest room versions). Treat it as a
  demo transport until upstream says otherwise.

A ticket id is never a Matrix id, a Neutrino identity, a credential, or proof
of ownership. The canonical association chain is
`ticket_ref → fossunited_profile_url → neutrino_server_name → derived MXID`,
and every link is user-confirmed.

### Profile association (MSC4133)

When the homeserver advertises `m.profile_fields`, the attendee can publish
`org.fossunited.profile_url` and `org.fossunited.username` on their Matrix
profile from `/connect` (and remove them again). The check falls back silently
to the standard `displayname`/`avatar_url` profile on servers without the
capability. Association is a claim, not authentication.

## Consuming Neutrino from Android (evaluation for issue #11)

| Question                           | Answer                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Feature module, fork base, or app? | **Separate companion app + handoff** (ADR 0001). The fork stays a messenger; we exchange identities and deep links.                                                            |
| Artifacts                          | `io.element.neutrino:bindings:<version>` on GitHub Packages (published by `element-hq/neutrino-iroh`); GitHub Packages Maven needs a token even for public reads.              |
| Licensing                          | Element X Android and the Neutrino fork: AGPL-3.0-only **or** Element commercial; vendored BLE deps AGPL-3.0-or-later. Compatible with this AGPL-3.0-or-later project.         |
| Branding                           | Element trademarks/branding are not ours to reuse; the handoff UI says "Open in Element" / "a Matrix client" and ships no Element assets.                                      |
| F-Droid                            | Pre-built binary bindings from GitHub Packages are not reproducible from source, so a Neutrino build cannot go to F-Droid as-is; the PWA/Capacitor core remains F-Droid clean. |
| Prototype                          | Not built yet: it requires an Android device pair with BLE. The PWA side (QR payload, identity fields, handoff links) is done so the prototype can consume it.                 |

## Threat and privacy model

| Asset / risk               | Mitigation                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Access token on device     | Stored in IndexedDB (same origin as all other local state); cleared on sign-out with `POST /logout`; never logged or exported.                |
| Identity exposure via QR   | Matrix id, Neutrino identity, ticket ref, email and phone are **off by default**; a badge can be photographed, copied data cannot be revoked. |
| Impersonation              | A scanned identifier is shown as **unverified**; the UI never claims authenticity. Verification happens in a full Matrix client.              |
| Unwanted contact           | Nothing auto-messages or auto-invites; DMs and joins require a confirmation step.                                                             |
| Room membership disclosure | Joining a public conference room reveals your Matrix id to members; rooms are suggested, never auto-joined.                                   |
| Local peer discovery (BLE) | Native only. Advertising a display name over BLE reveals presence to nearby devices; the PWA never does this.                                 |
| Malicious QR payloads      | 4–8 KiB cap, scheme allow-list (`https`, `mailto`, Matrix links), no HTML rendering of scanned text, strict id grammar.                       |
| Homeserver trust           | The homeserver sees all unencrypted room content. The companion reads E2EE rooms as placeholders and tells the user to use a full client.     |
| Message metadata           | `/sync` reveals online times to the homeserver; presence is disabled in the sync filter. Read receipts are sent only for rooms you open.      |
| Data retention             | Sign-out wipes rooms, timelines, outbox and session. Uninstalling the PWA removes everything.                                                 |

## Testing

- `packages/matrix`: link parsing, sync reducer (state, unread, invites, leaves,
  local-echo replacement), and an end-to-end fake-homeserver test covering
  sign-in, sync, offline queueing, ordered delivery on reconnect, permanent
  rejection, restore after reload, token expiry and sign-out.
- `packages/model`: friend payload round-trip and hardening, scan classifier,
  messaging config validation.
- `packages/storage`: Matrix cache tables, outbox and contact persistence.
