# The identity envelope

_Issue [#160](https://github.com/hanthor/indiafoss-companion/issues/160). Related:
[#188](https://github.com/hanthor/indiafoss-companion/issues/188) (binding
verification), [#31](https://github.com/hanthor/indiafoss-companion/issues/31)
(contact exchange), ADR 0008 (mesh identity), ADR 0009 (versioned contracts)._

## Why

A person's messaging identity is written into things that leave the app: the
vCard QR another attendee scans, the `indiafoss://friend` link, the JSON
contact-book backup, the `matrix:` handoff link. Element's Matrix P2P roadmap
names **converging IDs** — folding today's 64-hex node key into ordinary Matrix
ids — as upcoming work. Nothing here guesses what that form will be. What this
module does is make sure that when it arrives, a card written today still reads,
a card written by a newer build is kept rather than mangled, and neither is ever
mistaken for evidence of tampering.

## The envelope

Every reader and writer of identity fields goes through one module,
`packages/model/src/identity.ts` (Kotlin twin: `core/.../Identity.kt`). It owns
the single decision _"is this an identity shape this build understands"_ and
gives every surface the same three outcomes:

| Outcome            | What happens                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **understood**     | the value is promoted to a routable field (`matrixId`, `neutrinoServerName`); chat routes may be offered                                                              |
| **not understood** | the value is kept verbatim under `identity.retained` (`mesh`, `matrix`, and `version` when that was the reason); never an address; never merged over a known identity |
| **absent**         | nothing                                                                                                                                                               |

### Version 1

`identity.version = 1` is what every card written before versioning carried
implicitly, so **an unversioned card reads as v1**. Its fields are separate and
none is derived from another:

| Field                      | Meaning                                                         | Owner module      |
| -------------------------- | --------------------------------------------------------------- | ----------------- |
| `neutrinoServerName`       | mesh node id: the node's ed25519 public key as 64 lowercase hex | `identity.ts`     |
| `matrixId`                 | classic Matrix account, `@user:server`                          | `identity.ts`     |
| `publicKey`                | card key, `alg:base64url`                                       | `handshake.ts`    |
| `signature`, `fingerprint` | proof metadata for the card key                                 | `signed-vcard.ts` |
| `identity.version`         | the envelope version the two identity fields were read under    | `identity.ts`     |
| `identity.retained`        | identity fields this build set aside unread                     | `identity.ts`     |

Rules, as implemented by `readIdentity()`:

- **Unversioned or `1`:** a 64-hex mesh id is promoted (lowercased); a Matrix
  id of shape `@localpart:server` is promoted; a mesh or Matrix value of any
  other shape is retained.
- **A newer integer version, or a version that is not a positive integer:**
  nothing is promoted; every identity field is retained together with the
  version that caused it.
- Anything already in `retained` is carried forward, so a record round-trips
  through as many readers as it meets.
- `mergeIdentity()` (used by contact continuity) replaces a saved routable
  field only with a value this build understands. A re-scanned card whose
  identity was set aside keeps the saved address and carries the unread fields
  alongside it. A readable card that simply omits a field still clears it, as
  before — the owner switched sharing off.

Two well-formed but different node ids remain a **mismatch** on the profile
check (`packages/matrix/src/mesh-link.ts`); only an _unrecognised_ shape lands
in the neutral `outdated` state, worded "Identity format this app can't read
yet". That wording is deliberately the same whether it is the card or the
homeserver profile that is newer than the app.

## Wire spellings

| Surface                   | Version field                      | Mesh field                                           | Matrix field                                                |
| ------------------------- | ---------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| vCard QR / `.vcf` export  | `X-INDIAFOSS-IDENTITY-VERSION:1`   | `X-INDIAFOSS-MESH` (legacy `X-NEUTRINO-SERVER-NAME`) | `X-INDIAFOSS-MATRIX` (legacy `X-MATRIX-ID`, `IMPP:matrix:`) |
| `indiafoss://friend?v=1`  | `identity_v=1`                     | `neutrino_server_name`                               | `matrix_id`                                                 |
| JSON contact book         | `contacts[].identity.version`      | `contacts[].neutrinoServerName`                      | `contacts[].matrixId`                                       |
| IndexedDB `ContactRecord` | `identity.version` (added on read) | `neutrinoServerName`                                 | `matrixId`                                                  |

The version line is written beside the identity fields whenever one of them is
present, and omitted otherwise. A vCard and a friend link have one slot per
field, so a retained value is written back **as it arrived** — under v1 when
only its shape was the problem, under the version it declared when that was —
but a readable v1 value wins the slot, and a foreign-version copy is then left
to the JSON export, which keeps both.

## Inventory: everywhere identity syntax is persisted or judged

| #   | Place                                                                   | What it persists or decides                                                            | Goes through the envelope?                                                                                       |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/model/src/contact.ts` `attendeeProfileToVCard`                | writes `X-INDIAFOSS-MESH`, `X-INDIAFOSS-MATRIX`, `IMPP:matrix:`, version line          | yes (writer)                                                                                                     |
| 2   | `packages/model/src/scan.ts` `parseVCard`                               | reads both spellings of both fields plus the version line                              | yes (`readIdentity`)                                                                                             |
| 3   | `packages/model/src/friend.ts` encode/decode                            | `matrix_id`, `neutrino_server_name`, `identity_v` on `indiafoss://friend`              | yes                                                                                                              |
| 4   | `packages/model/src/contact-book.ts` `parseContactBook`                 | JSON backup entries; `.vcf` export is the stored card byte-for-byte                    | yes (`withIdentityEnvelope`)                                                                                     |
| 5   | `packages/storage/src/index.ts` `ContactRecord`, `migrateContactRecord` | the saved contact; unversioned records read as v1 on every `listContacts()`            | yes                                                                                                              |
| 6   | `packages/storage/src/personal-data.ts`                                 | the personal-data export copies `matrixId` / `neutrinoServerName` of the _own_ profile | no — own profile, string copy; reads back through 5                                                              |
| 7   | `apps/web/src/lib/contact-continuity.ts` `reconcileContact`             | merges a re-scan over a saved contact                                                  | yes (`mergeIdentity`)                                                                                            |
| 8   | `apps/web/src/lib/contact-trust.ts` `chatRoutesFor`, `profileTrustOf`   | mints `matrix:` handoff links; the retained state reads as `outdated`                  | yes (`classifyMeshIdentity`, `hasRetainedIdentity`)                                                              |
| 9   | `packages/model/src/contact.ts` `contactDeepLinks`                      | "Message on mesh" link from `neutrinoServerName`                                       | indirectly — only a promoted value ever reaches it                                                               |
| 10  | `packages/matrix/src/mesh-link.ts` `verifyMeshLink`                     | compares the card's mesh id with the profile's `in.indiafoss.mesh`                     | yes (`classifyMeshIdentity`)                                                                                     |
| 11  | `packages/matrix/src/mesh-link.ts` `publishMeshLink`                    | writes the _own_ node id to the account profile, lowercased                            | string copy of own id                                                                                            |
| 12  | `packages/model/src/messaging.ts` `isMeshServerName`, `isServerName`    | validates `messaging.aliasServer` in `events/*/messaging.json` (#167)                  | yes (`isCanonicalNodeId`)                                                                                        |
| 13  | `packages/model/src/contracts/common.ts` `isHex64`                      | `identity-binding.meshNodeId`, contract fixtures                                       | yes (`isCanonicalNodeId`)                                                                                        |
| 14  | `packages/model/src/contracts/contact-card.ts`                          | the `@n:<64-hex>` account-claim shape guard                                            | shape guard only; `kind: 'mesh'` still means `@n:`                                                               |
| 15  | `apps/web/src/routes/connect/+page.svelte` `neutrinoValid`              | validates the attendee's _own_ typed node id                                           | yes (`isNeutrinoServerName`)                                                                                     |
| 16  | `apps/android/native/core/.../VCard.kt`                                 | native card parse/encode                                                               | yes (`Identity.read`)                                                                                            |
| 17  | `apps/android/native/core/.../Identity.kt`                              | the Kotlin twin of the decision                                                        | is the envelope                                                                                                  |
| 18  | IndiaFOSS Chat (`indiafoss-chat-android`, `IndiafossLinks.kt`)          | parses `neutrino_server_name` and builds `@n:<server>` — Chat's shape-based guard      | **no** — separate repository; tracked in [chat #47](https://github.com/hanthor/indiafoss-chat-android/issues/47) |

Rows 6, 11 and 14 copy the attendee's own already-validated identity and need no
decision. Row 18 is the one reader outside this repository; a v2 card will
reach it before it reaches us, and it is the reason the friend link keeps
`v=1` and adds `identity_v` rather than bumping `v`.

## Fixtures and tests

`packages/test-fixtures/fixtures/identity-envelope/cases.json` is the
cross-platform table: ten cards (legacy unversioned, legacy spellings, explicit
v1, mesh-only, unknown mesh shape under v1, short node id, malformed Matrix id,
future version 2, malformed version, no identity), each with the promoted
fields, the retained fields and the chat routes every platform must produce.
It is consumed by:

- `packages/model/src/identity.test.ts` — vCard and friend-link parse, friend
  re-encode round-trip, `.vcf` export byte-stability, JSON export byte-stability
  including a future-version entry, `mergeIdentity`, and the delegation of every
  other 64-hex predicate to the one owner;
- `apps/web/src/lib/contact-trust.test.ts` — chat routes and the `outdated`
  state per case;
- `apps/android/native/core/src/test/.../IdentityEnvelopeTest.kt` — the same
  cases through `VCard.parse`, plus an encode/parse round-trip;
- `apps/web/src/lib/contact-continuity.test.ts` — re-scan of a known key
  updates rather than duplicates; an unread identity never overwrites a known one;
- `packages/storage/src/index.test.ts` — an unversioned record reads as v1; an
  unrecognised stored mesh id is retained, not routed;
- `packages/matrix/src/mesh-link.test.ts` — unknown shapes are `outdated`,
  differing node ids are still `mismatch`.

## What this does not do

- It does not define version 2. When upstream specifies the converged
  identifier, v2 gets its own reviewed migration covering key continuity,
  revocation and canonical-room effects (#160, last checklist item).
- It does not verify a mesh↔Matrix binding (#188); the envelope only keeps the
  fields apart so a binding has something to bind.
- It does not change IndiaFOSS Chat.
