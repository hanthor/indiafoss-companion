# Messaging handoff: threat and privacy model

Design and threat/privacy model for **optional** Matrix/Neutrino conference
messaging (issue #11). This document does not add messaging code; it specifies
how messaging would attach, what it exposes, and the mitigations required
before any prototype ships.

It builds on [ADR 0001](./adr/0001-native-android-client-standalone-vs-neutrino-fork.md):
messaging attaches by **handoff**, not by embedding. The IndiaFOSS Companion
event client never becomes a Matrix client; it hands off to a separate Matrix
app (the Neutrino/Element X fork, or any Matrix client) via links.

## Scope and non-goals

- **In scope:** the boundary between the event app and a Matrix client — what a
  QR/deep-link handoff carries, what joining an event room discloses, and the
  privacy properties of local peer discovery.
- **Non-goals:** implementing a Matrix client, running IndiaFOSS's own
  homeserver, or making messaging part of the MVP. Messaging is optional:
  schedule, map, ranking, itinerary, and contact sharing all work with no
  messaging installed (issue #11 requirement, and the privacy guarantee in
  [privacy.md](./privacy.md)).

## Handoff architecture (decided)

Three actors:

1. **Event client** (PWA / standalone native shell) — owns schedule, plan, map,
   contact card. Holds no Matrix credentials.
2. **Matrix client** (Neutrino/Element X fork, or the attendee's existing
   Matrix app) — owns identity, keys, rooms, messages.
3. **Handoff link** — the only thing that crosses between them.

The event client produces/consumes handoff links; the OS routes them to a
Matrix client. Two link forms:

- **Standard Matrix URIs** (`matrix:`) and `https://matrix.to/#/…` — portable,
  understood by any Matrix client. Preferred for room joins and user contact so
  attendees are never forced onto a specific app.
- **App-scoped** `indiafoss://chat/<opaque>` — only for indirection the event
  app must resolve locally (e.g. mapping a booth/session id to a room alias
  from the event bundle) before emitting a standard Matrix URI. It never
  encodes secrets.

This reuses existing plumbing: the contact vCard already carries a Matrix id
(`X-MATRIX-ID` + `IMPP:matrix:<id>`, opt-in, off by default), and the
`indiafoss://` scheme classifier already exists for `location/`; a `chat/` verb
would slot in beside it with the same reject-malformed-payload guards.

### Room discovery, membership, offline, reconnection (to document per #11)

- **Room discovery:** event/session/booth rooms are published as room
  **aliases** in the event bundle (e.g. `#indiafoss2026-devroom-aosp:server`),
  resolved to a `matrix:`/`matrix.to` join link at handoff time. No room list is
  fetched by the event client.
- **Event-room membership:** joining is an explicit action taken **in the Matrix
  client**, not the event app. The event app only offers the link.
- **Peer discovery:** an attendee shares their own contact QR (which may include
  their MXID, opt-in); scanning hands off to a 1:1 Matrix conversation. There is
  no automatic/ambient discovery of nearby attendees by the event app.
- **Offline / reconnection:** the event app is offline-first and unaffected.
  Message delivery, sync, and reconnection are entirely the Matrix client's
  responsibility (Neutrino's embedded P2P homeserver or a federated server).
  The event app must degrade to "open in your Matrix app" and never block on
  network.

## Assets to protect

- **A1 — Real-world identity linkage.** Connecting an attendee's name/face/badge
  to a Matrix ID.
- **A2 — Matrix ID (MXID).** A stable, often long-lived pseudonymous identifier.
- **A3 — Room membership.** Which event/session/booth rooms a person is in.
- **A4 — Presence & activity.** Online status, read receipts, typing, last-seen.
- **A5 — Message content.** Conversation contents and metadata.
- **A6 — Physical presence.** That a person is at the venue / near others.
- **A7 — Device/keys.** Encryption keys and device identity in the Matrix
  client.

## Trust boundaries

```
[ event app ] --handoff link--> [ OS ] --> [ Matrix client ] <--federation/P2P--> [ homeserver(s) / peers ]
   no creds                                    holds A2,A5,A7
```

The event app's only exposure surface is **the handoff link** and **the contact
QR**. Everything after handoff is the Matrix client's and Matrix's threat model,
which we inherit but do not control.

## Threats and mitigations

### T1 — Identity exposure via the contact QR (A1, A2)

A shared/scanned contact card can bind a real name to an MXID; a QR can be
photographed and re-shared by anyone who sees it.

- **Mitigation (already in place):** Matrix ID sharing is **opt-in and off by
  default** in the vCard selection; the Connect screen warns that a QR is
  copyable and scanning is not verification. Keep MXID off unless the attendee
  chooses it.
- **Mitigation:** recommend attendees use a conference-scoped or throwaway MXID
  rather than a primary personal one; document this in the messaging opt-in UI.

### T2 — Room membership disclosure (A3, A6)

Joining an event/session room can reveal who is at (or interested in) the
conference and which sessions they attend. In Matrix, room membership is
visible to other members and the homeserver.

- **Mitigation:** joining is always an explicit action in the Matrix client, never
  automatic from opening the event app. The event app must never auto-join.
- **Mitigation:** prefer **invite-free public event rooms with history
  visibility scoped** so late joiners don't read prior messages unless intended;
  document the chosen `join_rules`/`history_visibility` for event rooms.
- **Residual risk (accepted):** anyone in a public event room can see the member
  list. This is inherent to public Matrix rooms; surface it in the opt-in copy.

### T3 — Malicious / spoofed handoff links (A1–A5)

A forged QR or deep link could send an attendee into an attacker-controlled
room or 1:1, or to a look-alike MXID/room alias (homoglyph).

- **Mitigation:** the event app resolves only **event-bundle-listed** aliases for
  `indiafoss://chat/*`; unknown targets are rejected (reuse the existing
  reject-malformed-payload path with a confirmation preview before handoff).
- **Mitigation:** always show the resolved target (room alias / MXID) in a
  confirmation preview before opening the Matrix client, mirroring the existing
  scan preview.
- **Mitigation:** size/format guards on the payload (already enforced by the
  scan classifier).

### T4 — Presence and metadata leakage (A4, A6)

Presence, read receipts, and typing indicators can reveal that someone is
active and, combined with room membership, that they are at the venue.

- **Mitigation:** document that these are Matrix-client settings; recommend the
  opt-in flow suggest disabling presence/read-receipts for conference use. The
  event app cannot enforce this — state it as guidance and a known residual
  risk.

### T5 — Local peer discovery (A2, A6) — Neutrino P2P specifics

The Neutrino fork embeds a homeserver and supports peer-to-peer/local
transports. Local/BLE/mDNS-style discovery can leak physical proximity and a
stable identifier to nearby devices even without a message being sent.

- **Mitigation:** if any local/P2P discovery is enabled, it must be **explicitly
  opt-in per session**, off by default, and clearly labelled as broadcasting a
  presence beacon.
- **Mitigation:** the prototype (issue #11) must measure exactly what identifiers
  the P2P transport broadcasts at rest and document them before this is offered
  to attendees. Treat "advertises a stable id passively" as a blocker until
  understood.
- **Residual risk:** P2P transports are harder to reason about than federated
  rooms; default to the federated/room path unless P2P is specifically justified
  and measured.

### T6 — Homeserver trust (A2–A5)

Whichever homeserver backs event rooms sees membership, metadata, and (for
unencrypted rooms) content.

- **Mitigation:** prefer **end-to-end encrypted** event rooms where practical;
  document which rooms are encrypted.
- **Mitigation:** if IndiaFOSS/FOSS United does not run the homeserver, document
  who does and their data-handling; if Neutrino's embedded/P2P server is used,
  document its data locality.
- **Residual risk (accepted):** message metadata visibility to the homeserver is
  inherent to Matrix; disclose it.

### T7 — Compelled or accidental linkage in a small crowd (A1, A6)

At a bounded event, a small room membership set can de-anonymise a pseudonymous
MXID by correlation (who's in the AOSP devroom room and physically in that
room).

- **Mitigation:** guidance only — recommend conference-scoped identities and
  caution against reusing a primary MXID. Accepted residual risk.

## Privacy defaults (required)

- Messaging is **not installed/enabled by default**; the event app ships and
  works without it.
- Matrix ID sharing stays **opt-in, off by default** (already true).
- No auto-join, no ambient/automatic peer discovery, no presence broadcast
  without explicit per-use opt-in.
- Every handoff shows a **confirmation preview** of the resolved target before
  leaving the event app.
- The event app holds **no Matrix credentials or keys**.

## Licensing / distribution obligations (verify in the prototype)

- **License:** Element X Neutrino is AGPL-3.0; IndiaFOSS Companion is
  AGPL-3.0-or-later — compatible. A handoff (separate app, standard URIs) avoids
  linking concerns entirely.
- **Element branding:** using the Element/Neutrino app as the target imposes
  Element's branding/attribution terms on _that_ app, not on the event client —
  a benefit of the handoff approach.
- **Neutrino GitHub Packages:** building the Neutrino fork may require GitHub
  Packages access/credentials; document and confirm before any build.
- **F-Droid:** the event client's core must remain FCM-free (local notifications
  only). The Matrix client's push (UnifiedPush/FCM) is its own concern under the
  handoff model and does not affect the event app's F-Droid eligibility.

## Prototype acceptance (issue #11)

Before committing to integration, a tested Android prototype must demonstrate:

- [ ] Handoff from the event app to a room join and to a 1:1, using standard
      `matrix:`/`matrix.to` links, with a confirmation preview.
- [ ] The event app works fully with the Matrix client **absent** (link falls
      back to "install a Matrix app").
- [ ] Measured inventory of what any enabled P2P/local discovery broadcasts at
      rest (T5).
- [ ] Documented room `join_rules`/`history_visibility`/encryption for event
      rooms (T2, T6).
- [ ] Confirmed Neutrino build requirements (GitHub Packages) and F-Droid
      posture (licensing/branding) (issue #11 licensing criterion).

## Decision gate

Proceed to a prototype only if the above defaults are honoured. Ship to
attendees only if T5 (local peer discovery) is measured and either disabled or
made explicit opt-in, and T2/T6 disclosures are written into the opt-in UI.
Otherwise keep messaging as documented-but-unshipped.
