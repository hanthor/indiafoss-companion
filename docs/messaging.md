# Optional Matrix messaging

> Status: implemented in the PWA as an **optional, opt-in** layer (issue #11,
> #5, #8). The schedule, map, ranking, itinerary and contact sharing never
> depend on it. Neutrino (P2P Matrix over Bluetooth) is handled by **handoff**,
> not by embedding — see [ADR 0001](./adr/0001-native-android-client-standalone-vs-neutrino-fork.md).

## What the companion does

| Capability            | PWA / Capacitor                                                | Native Neutrino client (Element X fork)                   |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| Sign in               | Password or SSO against any Matrix homeserver                  | Its own embedded homeserver; each node is its own account |
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
  URL. Without a `messaging` block the app falls back to `matrix.org` with an
  empty room list (`apps/web/src/lib/messaging-config.ts`).

- Membership is always explicit: rooms are **suggested**, never auto-joined.
  Invitations appear in `/chat` and are accepted with one tap.
- Directory search uses `POST /_matrix/client/v3/publicRooms` with a search term
  on the signed-in homeserver.

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
