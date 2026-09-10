# The mesh ↔ Matrix identity binding, v1

_Issue [#188](https://github.com/hanthor/indiafoss-companion/issues/188).
Related: [#31](https://github.com/hanthor/indiafoss-companion/issues/31)
(contact exchange), [#160](https://github.com/hanthor/indiafoss-companion/issues/160)
(identity envelope), [#181](https://github.com/hanthor/indiafoss-companion/issues/181)
(maintainer decisions), ADR 0006 (one person, two transports), ADR 0008 (mesh
identity), ADR 0009 (versioned contracts), task C-12,
[hanthor/indiafoss-chat-android#48](https://github.com/hanthor/indiafoss-chat-android/issues/48)
(delivery and routing)._

This document is normative for the statement, its bytes, its verification and
the trust each outcome may earn. The implementations are
`packages/model/src/binding.ts` (TypeScript) and
`apps/android/native/core/src/main/kotlin/org/indiafoss/companion/core/IdentityBinding.kt`
(Kotlin); the shared vectors are
`packages/test-fixtures/fixtures/identity-binding/vectors.json`. Where the
prose and the vectors disagree, the vectors are wrong and this document wins —
fix the vectors.

**Status of the pieces.** Signing, verification and the trust derivation are
implemented and wired into the contact screens (`binding-valid`). Nothing
_produces_ a binding for a real person yet: no surface publishes one, no card
carries one, no `/keys/query` is made, and the only Matrix-key source the app
ships returns no keys. Automatic routing and person merging remain gated on
#188's review of this document and on Chat #48. See
[What this does not do](#what-this-does-not-do).

## 1. The problem, in one sentence

A signed contact card proves control of the **card key**. A public-profile
match proves the **homeserver** says two strings agree. Neither proves the
person holding the phone controls the Matrix account named on the card, and
the sharpest attack on the product — somebody printing `@speaker:matrix.org`
on a card they signed themselves, so that messages meant for the speaker
arrive on a stranger's phone with every indication of success — is exactly
the case both leave open (C-10, C-12, review of 7 September 2026, finding 1).

The binding closes it by requiring **both** parties to the claim to sign the
**same** statement: the holder of the card key and the holder of a Matrix key
for the account. A signature the attacker cannot produce is the one from the
speaker's Matrix key.

## 2. The statement

The signed statement is a flat JSON object with these fields, all required.
v1 has no optional fields: a field the reader does not know is a reason to
refuse the statement, because a signature over bytes the reader ignores
protects nothing.

| Field           | Type   | Value                                                                                                                                                                                                        |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `v`             | int    | `1`. Equal to the version in the domain string.                                                                                                                                                              |
| `id`            | string | Opaque, stable, 1–64 of `[A-Za-z0-9_.:-]`. The handle the signer revokes by.                                                                                                                                 |
| `meshNodeId`    | string | The mesh identity: the node's ed25519 public key as 64 **lowercase** hex (ADR 0008; `isCanonicalNodeId`). Never a short code.                                                                                |
| `matrixUserId`  | string | The classic account, `@localpart:server`, as the person types it. Never a mesh `@n:` id (binding a mesh identity to itself says nothing). Not case-folded: Matrix localparts are case-sensitive on the wire. |
| `cardKeyId`     | string | The card key as printed on the card: `ed25519:<base64url>` or `p256:<base64url>` (`formatPublicKey`). The key _is_ the id.                                                                                   |
| `matrixKeyId`   | string | The Matrix key id as `/keys/query` names it: `ed25519:<unpadded base64 key>` for a cross-signing key, `ed25519:<DEVICEID>` for a device key. The key bytes are deliberately **not** in the statement.        |
| `matrixKeyKind` | string | `master`, `self-signing` or `device`. See §4.                                                                                                                                                                |
| `issuedAt`      | string | ISO-8601 UTC instant with milliseconds, exactly as `Date#toISOString` writes it (`2026-09-10T09:00:00.000Z`).                                                                                                |
| `expiresAt`     | string | Same form. **Required.** At most 180 days after `issuedAt`.                                                                                                                                                  |
| `nonce`         | string | 16 random bytes, base64url without padding (22 characters). Makes every statement's bytes unique even for the same person re-issuing the same binding.                                                       |

There is no `scope` field. What a verifier may _do_ with a valid binding is
the verifier's policy (§8), not the signer's grant; a signer who wants less
than the full ladder issues nothing.

### The wire form

```json
{
  "domain": "in.indiafoss.binding/v1",
  "statement": { "...the ten fields above..." },
  "signatures": {
    "card": "<base64url raw signature by the card key>",
    "matrix": "<base64url raw signature by the Matrix key>"
  }
}
```

Both signatures are raw (64 bytes for Ed25519; `r‖s` for P-256, the same
form the card signature already uses), base64url, unpadded. The wire form is
what a card, a profile field or a file carries; it is stored as received
(`ContactRecord.binding.signed`) and never trusted by itself.

## 3. Canonical encoding and domain separation

The bytes both keys sign are

```
UTF-8(domain) ‖ 0x0A ‖ UTF-8(canonicalJson(statement))
```

with `domain` = `in.indiafoss.binding/v1` and `canonicalJson` the Matrix
flavour of canonical JSON: object keys sorted by Unicode code point, no
whitespace, integers only, strings escaped exactly as `JSON.stringify`
escapes them (`"`, `\`, and control characters as `\n \r \t \b \f` or
`\u00xx` lowercase; everything else, including non-ASCII, raw UTF-8).
`undefined` members are omitted. The statement holds only strings and one
small integer, so no float or nesting rule is exercised in v1.

Worked example (the `valid-master-key` vector; the vector carries the exact
hex):

```
in.indiafoss.binding/v1
{"cardKeyId":"ed25519:eAzoi_J4GlXU-Imr534qePgMHgt0_XKCE74MkJmccVo","expiresAt":"2026-10-10T09:00:00.000Z","id":"b-2026-09-10-asha","issuedAt":"2026-09-10T09:00:00.000Z","matrixKeyId":"ed25519:80oru7/um4vAMFly8LhK7QTwUWENK6C6dEbTUo2bkmI","matrixKeyKind":"master","matrixUserId":"@asha:indiafoss.org","meshNodeId":"845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e","nonce":"AAECAwQFBgcICQoLDA0ODw","v":1}
```

Rules:

- **Neither signature is inside the signed bytes.** Both cover the same
  bytes. Consequences, chosen deliberately: the two halves can be checked
  independently (the card half offline, the Matrix half once a key is held),
  the signers can sign in either order or on different devices, and neither
  signature vouches for the other — which is fine, because a binding is only
  `valid` with both.
- **The domain comes first** and is separated from the JSON by a single line
  feed, which cannot occur in either part. A signature over these bytes can
  never be replayed as a signature over the card body (`canonicalVCardBody`,
  which begins `BEGIN:VCARD`), over Matrix Signing JSON (which begins `{`), or
  over anything else this project signs, and vice versa.
- **The version rides in the domain.** A verifier meeting
  `in.indiafoss.binding/v<N>` with `N > 1` returns `unknown-version`: the
  binding is kept for a newer build and shown neutrally ("Binding format this
  app can't read yet"), never as invalid. Any other domain string, including a
  well-formed signature under it, is `wrong-domain`: not a binding.
- `IDENTITY_BINDING_DOMAIN` in `contracts/identity-binding.ts` is this same
  value. Its earlier spelling `in.indiafoss.identity-binding.v1` was never
  signed with by anything and is retired.

Two implementations must produce byte-identical output for the same
statement; the vectors pin `signingBytesHex` on every parseable case and the
Kotlin test reproduces the PWA's Ed25519 signatures from the same seeds.

## 4. Which keys sign, and what each proves

### The card key (`signatures.card`)

The phone's handshake key from `handshake.ts` — Ed25519 where WebCrypto has
it, ECDSA P-256 otherwise — the same key that signs the card. The verifier
checks this half against the key **it already holds from the card's own
signature**, never against `cardKeyId` in the statement; then it checks that
`cardKeyId` names that same key. A valid card half proves: the holder of the
card key put this statement on this card on purpose.

### The Matrix key (`signatures.matrix`)

Always Ed25519, per the Matrix key hierarchy. In order of preference:

| `matrixKeyKind` | What it is                                                                                                           | Why                                                                                                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `master`        | The account's cross-signing master key, `master_keys[user].keys` in `/keys/query`. **Preferred.**                    | It is the key a person's Chat compares during emoji/QR verification ("when verifying another user, clients should compare the master key"), so a binding by it is the one that can later become `verified` by Chat's existing flow. It survives device replacement and logout. |
| `self-signing`  | The self-signing key, signed by the master key.                                                                      | Equivalent in practice; accepted so a signer whose SDK only exposes it is not turned away. Rotated together with the master key.                                                                                                                                               |
| `device`        | One device's ed25519 identity key, `device_keys[user][device].keys["ed25519:DEVICEID"]`. **Allowed at lower trust.** | It disappears when the device is deleted or logs out, is not compared during user verification, and a homeserver can mint a plausible one. A verifier records the kind so a policy can require `master` for anything beyond display.                                           |

The matrix-sdk-crypto `OlmMachine::sign` signs a message with the device key
and, when available, the master key, which is why `master` is the default the
Chat side is expected to produce.

A valid Matrix half proves: whoever controls the named key agreed. **Whether
that key belongs to `matrixUserId` is a separate fact** the verifier gets from
the key's provenance (§6), not from the signature.

## 5. Verification

`verifyBinding` (TS) / `IdentityBinding.verify` (Kotlin) takes the wire value,
the identities the card claims, the card key the verifier holds, the Matrix
key it holds (or none), the revocations it knows, and the clock. It performs
no network access and never throws. Checks run in this order so the most
important fact about a bad binding is the one reported:

| #   | Check                                                                                                                   | Failure state                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | JSON object with a string `domain`                                                                                      | `malformed`                                     |
| 2   | `domain` is `in.indiafoss.binding/v1`; a higher `v<N>` domain                                                           | `wrong-domain`, `unknown-version`               |
| 3   | Envelope and statement shape (§2), including expiry present, ≤ 180 days, no unknown fields                              | `malformed`                                     |
| 4   | `signatures.card` verifies with the **held** card key                                                                   | `invalid-signature` (reason `card signature`)   |
| 5   | `cardKeyId` names the held card key; `meshNodeId` equals the card's mesh id; `matrixUserId` equals the card's Matrix id | `mismatch` (reason names the field)             |
| 6   | `id` not in the revocation list                                                                                         | `revoked`                                       |
| 7   | `issuedAt` ≤ now + 5 minutes skew                                                                                       | `not-yet-valid`                                 |
| 8   | `expiresAt` > now                                                                                                       | `expired`                                       |
| 9   | A Matrix key is held and its id and kind match the statement                                                            | `unverifiable`                                  |
| 10  | `signatures.matrix` verifies with the held Matrix key                                                                   | `invalid-signature` (reason `matrix signature`) |
|     | All pass                                                                                                                | **`valid`**, carrying the key's provenance      |

Notes on the order: a tampered statement reads as `invalid-signature` even
when it is also expired; a genuine binding for somebody else's identities
replayed on this card reads as `mismatch` even when the verifier is offline;
offline is `unverifiable` only after everything the card alone can settle has
been settled. There is no "card half only" success state — `valid` needs both.

`unverifiable` also covers a platform that cannot verify the key (no Ed25519
on an old Android). It is never a guess.

Normalisation before comparison: the card's mesh id is trimmed and
lower-cased (the statement's must already be lowercase or it is malformed);
the Matrix id is trimmed only.

## 6. Where the Matrix key comes from, and what that is worth

The statement names the key by id and never carries its bytes. **A verifier
must obtain the key from somewhere other than the binding or the card it
arrived on.** The sources, and the provenance recorded with a `valid` result:

| Provenance      | Source                                                                                                            | Worth                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`        | `POST /_matrix/client/v3/keys/query` for `matrixUserId`, made by an account the attendee holds (it requires auth) | The homeserver's word about its own user. A malicious or compromised homeserver can answer with a key it controls, so this earns **`binding-valid`** and nothing more.     |
| `cached`        | A key this device fetched earlier                                                                                 | Same as `server`, older.                                                                                                                                                   |
| `cross-signed`  | A device key signed by a self-signing key that is signed by a master key the attendee has user-verified           | Reserved. No producer here.                                                                                                                                                |
| `user-verified` | Chat's own verification of the master key with the person (emoji/QR)                                              | The only provenance that could justify `verified`. Chat owns it; this app records it if handed over, and **still shows `binding-valid`** until Chat #48's contract exists. |

**A self-signed key fetched from an untrusted server is not sufficient trust by
itself.** That sentence is the reason `binding-valid` exists as a state
distinct from `verified`: the signature is real, the key's owner is asserted by
a server. What `/keys/query` reveals to whom: the attendee's homeserver learns
that the attendee asked about `matrixUserId`; the peer's homeserver learns the
same from federation. The mesh conversation itself is not disclosed.

In this repository the only implemented key source is `noMatrixKeys`
(`apps/web/src/lib/binding.ts`), which returns nothing. Consequence: every
binding a real card could carry today is checked on its card half and reads
"Binding not checked yet". A `/keys/query` client, a key cache, and a
Chat-to-Companion handover of a verified master key are each a separate,
reviewable unit of work; none is authorised by this document alone.

## 7. Trust states

`deriveContactTrust` (`apps/web/src/lib/contact-trust.ts`) shows five separate
facts. The binding adds one line and feeds the account line; it touches
nothing else.

| Binding check (`ContactRecord.binding.check.state`)          | Binding line | Account line (`AccountClaimTrust`)                                                                       |
| ------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------- |
| none on the card                                             | `none`       | from the profile observation, as before (C-10)                                                           |
| `valid`                                                      | `valid`      | **`binding-valid`**, whatever the profile said; a profile `mismatch` is still flagged as a contradiction |
| `revoked`                                                    | `revoked`    | **`revoked`**, above every profile observation                                                           |
| `expired`, `not-yet-valid`                                   | `expired`    | from the profile observation                                                                             |
| `invalid-signature`, `mismatch`, `wrong-domain`, `malformed` | `invalid`    | from the profile observation                                                                             |
| `unknown-version`                                            | `unreadable` | from the profile observation                                                                             |
| `unverifiable`, or not checked yet                           | `unchecked`  | from the profile observation                                                                             |

`verified` — on the account line, and "Verified in Chat" on the chat line —
has **no producer**. It requires `valid` **and** `user-verified` provenance
**and** Chat's delivery contract (#48); until then a record whose check
carries `user-verified` still derives `binding-valid`, and the fixture
`binding-valid-user-verified-key-still-not-verified` pins that. No label on
the binding line contains the word "verified".

The stored `check` is this device's conclusion, like `meshLink`: it is
dropped by `asReceivedRecord` on every import, so a file or a card cannot
carry its own verdict. The signed statement is kept, because it is data.

## 8. The scope ladder

`mayActOn` in `contracts/identity-binding.ts` is unchanged and is the single
gate. In terms a test can assert:

| Scope          | Precondition                                                                                                                                                                                                                                                    | Today                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `display`      | Nothing. The two identities may be shown side by side with their separate trust lines. The contact screens already do this.                                                                                                                                     | reachable                                    |
| `continuation` | `binding.check.state === 'valid'` **and** the attendee explicitly picks the other account, with the sender account and destination previewed (system.md, "Delivery and seamless continuation"). Requires `presentAsVerified`, which needs §6's `user-verified`. | unreachable by construction                  |
| `routing`      | `continuation`'s preconditions, **and** `matrixKeyKind === 'master'`, **and** a recipient-specific delivery policy under Chat #48 (durable outbox, explicit uncertain outcomes after a lost ACK). Never on `device`-kind bindings.                              | unreachable; gated on #188 review + Chat #48 |

Nothing in this change sets `presentAsVerified`, merges people, or chooses a
route. The interaction with Chat #48 is one-directional: #48 may consume a
`valid` + `user-verified` binding as its "accepted identity proof"; this
document does not define delivery.

## 9. Replay, expiry and presentation

- **Replay by a third party.** A captured binding is bound to `cardKeyId`;
  presenting it on another card fails at check 4 or 5 (`invalid-signature` or
  `mismatch`). Presenting it on a card the attacker signed with the _same_
  card key is only possible with the victim's card private key, which never
  leaves its phone (non-extractable, `identity.svelte.ts`).
- **Replay of a genuine binding for other identities** (the attacker copies
  Alice's real binding onto a card naming Alice's Matrix id but the attacker's
  mesh id, or vice versa) fails at check 5 with the field named.
- **Clock skew.** 5 minutes of tolerance on `issuedAt`. None on `expiresAt`.
- **No expiry** is malformed. Validity over 180 days is malformed. There is no
  scope at which an unexpiring binding is acceptable.
- **Issued in the future** beyond skew is `not-yet-valid`, shown as expired.
- **Offline.** The card half and the identity checks run with no network.
  The Matrix half needs a held key; with none the state is `unverifiable` and
  the line says "not checked yet". A previously recorded `valid` is retained
  until it is stale (24 h) or its inputs change; an uncheckable **new** claim
  stays `unchecked` and inherits nothing from an earlier binding
  (`pendingVerification` semantics). When connectivity returns and the check
  now fails, the new state replaces the old one and the account line drops
  accordingly; the contact is never deleted.
- **Stale cached proof.** `bindingCheckStale` re-asks after 24 h and whenever
  the last result was `unverifiable` or `unknown-version`. A `valid` result
  older than 24 h still displays as valid until re-checked; it may not be used
  for `continuation` or `routing` decisions (those require a fresh check by
  policy in #48).

## 10. Rotation, replacement, logout, reset, revocation

| Event                                               | Effect on the binding                                                                                                               | What the verifier does                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mesh node key changes                               | It is a **different mesh identity**, not a rotation (ADR 0006: the identity _is_ the node's key). The binding is about the old one. | Check 5 fails (`mismatch` on `meshNodeId`) against the new card; the old contact keeps its old binding and its old state. The person issues a new binding.                                            |
| Card key changes                                    | The binding names the old `cardKeyId`.                                                                                              | `mismatch` on `cardKeyId`; `keyChanged` is already flagged on the card line. The in-person confirmation does not carry over either (#31).                                                             |
| Signing device deleted / logged out (`device` kind) | The key is gone from `/keys/query`.                                                                                                 | A fresh fetch yields no key: `unverifiable`, shown as unchecked. A previously recorded `valid` is retained until stale, then re-asked and drops. This is why `device` is lower trust.                 |
| Signing device deleted (`master` kind)              | Nothing: the master key is not a device.                                                                                            | Unaffected.                                                                                                                                                                                           |
| Cross-signing reset (new master key)                | The old master key is gone; every old device signature is unvouched.                                                                | A fresh fetch returns a different key id: `unverifiable` (held key is not the signing key). Any `user-verified` provenance is void because it was about the old key. The person issues a new binding. |
| Account logout of the classic account               | No effect on cross-signing keys.                                                                                                    | Unaffected for `master`; as "device deleted" for `device`.                                                                                                                                            |
| Revocation                                          | The signer withdraws `id`.                                                                                                          | `revoked`, above every other state; the account line reads `revoked`. Revocation cannot retract what was already delivered.                                                                           |

**How revocation reaches a verifier — proposal, not shipped.** The cleanest
carrier is the same profile field or room state the binding itself would be
published on (§11): publishing a newer binding with the same `id` and an
`expiresAt` in the past, or an explicit `in.indiafoss.binding.revoked` list.
Until a carrier exists the revocation source is `noRevocations`, and the
`revoked` state is reachable only from a list the attendee's own app holds.
A verifier that cannot fetch revocations does not downgrade a `valid`
binding on that account; it re-asks on the normal stale schedule.

## 11. Publication — proposal, not shipped

Where a binding would live so a peer can find it after the card exchange, in
order of preference; the choice is for the #188 review:

1. **A second MSC4133 profile field, `in.indiafoss.binding`**, beside
   `in.indiafoss.mesh`, holding the wire form. Public, unauthenticated read;
   the same discovery path `verifyMeshLink` already uses. Discoverable, not
   more trusted: a fetched binding is verified exactly as one from a card,
   against a card key from the card and a Matrix key from `/keys/query`.
2. **Room state `in.indiafoss.binding` in the DM** between the two classic
   accounts, so it is end-to-end visible to the peer only. Needs a DM to exist.
3. **On the card itself** (`X-INDIAFOSS-BINDING`) — the offline path, and the
   one the contact screens are already wired to read from
   `ContactRecord.binding.signed` once a card writer exists. Roughly 600 bytes,
   which is a third of the QR budget; a `.vcf` or friend link carries it more
   comfortably than a QR.

Minting a binding requires being signed into both identities on one device,
which only ADR 0006 Stage 0 makes possible in Chat. Companion holds the card
key; Chat holds the Matrix key; the statement is signed once on each side
over identical bytes (§3 makes ordering irrelevant).

## 12. Adversarial review

| Attack                                                                                      | Defeated by                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-signed card naming somebody else's MXID                                                | §4: no Matrix signature by a key for that account; the binding is absent or `invalid-signature`/`unverifiable`; the account line stays `claimed`. Fixtures `adversarial-someone-elses-mxid-on-a-self-signed-card`, vector `someone-elses-mxid`. |
| Captured binding replayed by a third party on their own card                                | §5 checks 4–5 (`invalid-signature` or `mismatch` on `cardKeyId`). Vectors `signed-by-another-card-key`, `names-another-card-key`.                                                                                                               |
| Genuine binding for other identities, replayed                                              | §5 check 5. Vectors `someone-elses-mesh-id`, `someone-elses-mxid`.                                                                                                                                                                              |
| Binding signed by a device since deleted                                                    | §10: the key is unfetchable, `unverifiable`, retained `valid` expires on the stale schedule; `device` kind never reaches `routing` (§8).                                                                                                        |
| Homeserver lies in `/keys/query` (serves a key it controls)                                 | §6: `server` provenance caps at `binding-valid`; `verified` requires Chat's user verification of the master key, which a server cannot fake. **This is a cap, not a defeat: `binding-valid` is shown as such and never routes.**                |
| Homeserver profile substitution                                                             | Irrelevant to the binding (profile is a separate observation, C-10); a `mismatch` profile beside a `valid` binding is shown as a contradiction (§7).                                                                                            |
| Downgrade: a `display`-level verdict treated as `routing`                                   | §8: `mayActOn` unchanged; nothing sets `presentAsVerified`; `routing` additionally requires `master` kind and #48.                                                                                                                              |
| Offline verifier induced to reuse stale positive evidence for a new claim                   | §9: a new binding (different bytes) has no check until checked; a check is bound to the stored `signed` and dropped on import; `bindingCheckStale` re-asks.                                                                                     |
| Wrong conference / app domain, or a signature borrowed from Matrix Signing JSON or the card | §3: domain prefix; `wrong-domain`. Vector `wrong-domain`.                                                                                                                                                                                       |
| Replay after revocation                                                                     | §10: `revoked` above `valid`. Vector `revoked`. **Open:** no revocation carrier ships; see below.                                                                                                                                               |
| Key rotation (mesh, card, cross-signing)                                                    | §10 table; each is a `mismatch` or `unverifiable`, never a silent carry-over.                                                                                                                                                                   |
| Lost network during verification                                                            | §9: `unverifiable` is a state, not an exception; nothing is promoted.                                                                                                                                                                           |
| Verdict smuggled in an imported file                                                        | §7: `asReceivedRecord` drops `binding.check`. Fixture `adversarial-binding-check-smuggled-in-a-file`, test "asReceivedRecord keeps the signed statement and drops the check".                                                                   |
| A `v2` binding read by a v1 verifier                                                        | §3: `unknown-version`, neutral wording, kept. Vector `unknown-version`.                                                                                                                                                                         |

**Open problems**, listed rather than hidden:

- No revocation carrier. Until one is chosen (§10), revocation is a local list.
- No key source. `noMatrixKeys` is the only one; `binding-valid` is reachable
  in tests and from a hand-edited store, not from a real card yet.
- `user-verified` provenance has no producer; the Chat → Companion handover
  of a verified master key is undefined and is #188 review material.
- The maintainer decisions in #181 (routing in September; temporary-account
  lifetime; canonical homeservers; opt-in merging) are **assumed**, not cited:
  this document takes "no automatic routing this release", "180-day maximum
  validity regardless of account lifetime", "any homeserver reachable by
  `.well-known` discovery", and "display-only by default". Each is one
  constant or one table row to change.

## 13. Vectors and conformance

`packages/test-fixtures/fixtures/identity-binding/vectors.json` — test-only
keys (with private scalars, so both platforms can sign) and 22 cases, each
with the wire value, the held keys and identities, the clock, the expected
state and reason, the expected account trust, and `signingBytesHex` wherever
the statement parses. Every verifier state appears at least once. Consumers:

- `packages/model/src/binding.test.ts` — regenerates the table under
  `REGENERATE_BINDING_VECTORS=1` and otherwise asserts the stored table is
  exactly what this build would produce (Ed25519 being deterministic);
- `apps/android/native/core/src/test/.../IdentityBindingTest.kt` — same
  verdicts, same bytes, and reproduces the PWA's signatures from the seeds;
- `apps/web/src/lib/binding.test.ts` — every vector driven through a saved
  contact record to the account line;
- `packages/test-fixtures/fixtures/contact-trust/states.json` — the binding
  rows of the trust table.

The structural fixtures under `identity-binding/{valid,invalid}/` are the
storage envelope's and are unchanged.

## What this does not do

- Publish or transport a binding. No card writes one; no profile field or
  room state carries one; `publishMeshLink` still publishes a bare string.
- Fetch keys. No `/keys/query`; the shipped key source returns nothing.
- Produce `verified`, "Verified in Chat", `presentAsVerified`, or any change
  to `mayActOn`.
- Route automatically or merge people. ADR 0006 Stages 1–3 stay gated on the
  #188 review of this document and on Chat #48.
- Change the identity envelope (#160), the storage envelope's field set, or
  the mesh identity format (ADR 0008).
