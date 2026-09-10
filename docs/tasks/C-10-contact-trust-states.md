# C-10 — Never show a homeserver's word as "Verified"

- Status: Implemented (PWA), PR #300; Kotlin fixture conformance deliberately not wired (step 8)
- Repository: indiafoss-companion
- Tracks: [#31](https://github.com/hanthor/indiafoss-companion/issues/31),
  [#188](https://github.com/hanthor/indiafoss-companion/issues/188)
- Size: M

## Why this matters

Two attendees meet, scan each other's QR codes, and one of the cards says
`MATRIX @alice:matrix.org · VERIFIED` in the contacts list. The attendee reads
that the way anyone would: _the app checked, this really is Alice's account._

The app checked nothing of the sort. It asked a homeserver for a public profile
field and compared two strings. Anybody can put anybody's MXID on a card they
signed themselves, and a homeserver can say whatever it likes about its own
users. The word on screen is stronger than the evidence behind it, and this is
the screen where an attendee decides who they are talking to for the rest of
the year.

Nothing here is an exploit of the shipped manual handoff flow — the review was
careful to say so. It is a design/implementation mismatch, and the fix is to
make the app say only what it actually knows.

## Context you need

### The defect, in the code

[`packages/matrix/src/mesh-link.ts`](../../packages/matrix/src/mesh-link.ts)
defines a state literally named `verified`, documented as a profile lookup:

```ts
export type MeshLinkState =
  /** The account's profile names this mesh identity. */
  | 'verified'
  /** The account's profile names a different mesh identity: not this phone. */
  | 'mismatch'
  /** The account's profile carries no mesh identity: a claim, nothing more. */
  | 'unlinked'
  /**
   * One of the two identities is not a shape this build understands, so the
   * comparison cannot be made. Distinct from `mismatch` on purpose — see
   * {@link verifyMeshLink}.
   */
  | 'outdated'
  /** The homeserver could not be reached or would not answer without a login. */
  | 'unverifiable';
```

And produces it by fetching a public profile and comparing two strings
(`verifyMeshLink()`, same file):

```ts
    const profile = (await res.json()) as Record<string, unknown>;
    const published = profile[MESH_IDENTITY_FIELD];
    if (typeof published !== 'string' || !published.trim()) {
      return { state: 'unlinked', checkedAt: now() };
    }
    const a = published.trim().toLowerCase();
    const b = claim.meshServerName.trim().toLowerCase();
    …
    return { state: a === b ? 'verified' : 'mismatch', checkedAt: now() };
```

`MESH_IDENTITY_FIELD` is `'in.indiafoss.mesh'`, an MSC4133 extended profile
field. No signature is checked. No device key is fetched. There is no
`/keys/query` call anywhere in this path.

That value then becomes the user-facing word, in `meshLinkLabel()`:

```ts
export function meshLinkLabel(check: MeshLinkCheck | undefined): string {
  switch (check?.state) {
    case 'verified':
      return 'Verified';
```

which is rendered in
[`apps/web/src/routes/connect/+page.svelte`](../../apps/web/src/routes/connect/+page.svelte)
around line 893, in the success colour:

```svelte
<span
  class="line3"
  class:sig-ok={c.meshLink?.state === 'verified'}
  class:sig-bad={c.meshLink?.state === 'mismatch'}
  title="Whether this Matrix account's own profile names this mesh identity"
>
  MATRIX {c.matrixId} · {meshLinkLabel(c.meshLink).toUpperCase()}
</span>
```

The `title` attribute is honest. The visible text is not, and the visible text
is what an attendee reads.

### What the review found

`docs/architecture/review-2026-09-07.md`, finding 1 — the highest-priority
identity finding:

> The implementation in mesh-link.ts instead fetches a public profile, reads
> `in.indiafoss.mesh`, and compares two strings. It returns `verified` when they
> match. It does not verify the claimed device signature. The contact-sharing
> documentation accurately describes this weaker profile check.
>
> A profile match can be useful, but it trusts the homeserver's assertion. A
> signed contact card separately proves possession of the card key; it does not
> by itself prove control of every Matrix account named on the card. The
> proposal currently collapses these distinctions.
>
> **Proposal:** distinguish "profile matches," "card signature valid,"
> "confirmed in person," and "Matrix identity verified." […] Add an adversarial
> acceptance case: a person must not gain automatic routing to their mesh
> identity merely by putting somebody else's MXID on a self-signed card.

`docs/architecture/system.md`, "Identity and trust":

> Model `Person`, `ContactCardKey`, `MeshIdentity`, `MatrixAccount`, and
> `MatrixDevice` separately. A person can have several accounts/devices. An
> in-person meeting is evidence of a meeting; a signed card is evidence of
> control of that card key; a homeserver profile match is an account claim. None
> by itself is Matrix device verification.
>
> The current profile comparison is inadequate for automatic routing. Explicitly
> correct ADR 0006's stronger claim rather than building on it. Let users inspect
> and unlink identities.

And the component table in the same document, on the contact and route
coordinator: "Never substitutes a public profile field for cryptographic account
proof."

### The union that already encodes the right answer

[`packages/model/src/contracts/contact-card.ts`](../../packages/model/src/contracts/contact-card.ts)
already defines the states, with the mapping to `mesh-link.ts` spelled out. This
task is largely the work of _using what is already there_:

```ts
/**
 * Trust in an account *claim* on a card. Only `verified` may render as a
 * verified badge, and only device cross-signing may set it.
 *
 * - `claimed` — the card says so. Default. Not evidence.
 * - `profile-matched` — the homeserver's public profile agrees. Better than
 *   nothing, still the homeserver's assertion. This is what `mesh-link.ts`
 *   currently produces; it is **not** verification, and ADR 0006's stronger
 *   description of it is corrected in #188.
 * - `binding-valid` — a structurally and cryptographically valid
 *   {@link import('./identity-binding.js').IdentityBinding} signed by a Matrix
 *   device — but by a device whose own trust is unknown or unverified.
 * - `verified` — Matrix device verification succeeded.
 * - `revoked` — previously accepted, since withdrawn.
 */
export type AccountClaimTrust =
  'claimed' | 'profile-matched' | 'binding-valid' | 'verified' | 'revoked';
```

The module header states the four human-readable states the UI must keep apart:

```
 * | State | What it means |
 * | --- | --- |
 * | met in person | the scan happened face to face — a fact about the meeting |
 * | card signature valid | the presenter controls ContactCard.cardKey |
 * | profile matches | the homeserver asserts a link; the homeserver could lie |
 * | Matrix verified | device cross-signing verified — the only proof of account control |
```

Note that "met in person" is **not** an `AccountClaimTrust` value and must not
be made into one. It is a fact about a meeting, already recorded on the stored
contact as `metActivityId` / `metLocationId` / `metCount` / `lastMetAt`. Keep it
there; display it alongside the trust state, never merged into it.

And the import-time downgrade, which exists and has no callers outside its own
test:

```ts
/**
 * The trust a freshly received card's claims must be reduced to, whatever the
 * wire said. Apply this on import, before storing.
 */
export function asReceived(card: ContactCard): ContactCard {
  return {
    ...card,
    accounts: card.accounts.map((claim) => ({ ...claim, trust: 'claimed' as const })),
  };
}
```

### What the web app actually does today

Verified by reading the files; do not assume anything beyond this.

- **`apps/web/src/lib/contacts.svelte.ts`** — the whole contact store. It does
  **not** import `@indiafoss/model/contracts` at all; it works on
  `ContactRecord` from `@indiafoss/storage`. State is Svelte 5 runes:
  `contactsState = $state<{ contacts: ContactRecord[]; hydrated: boolean }>`.
  Relevant exports: `hydrateContacts()`, `contactFromVCard()`,
  `contactFromFriend()`, `contactFromMatrixId()`, `saveScannedContact()`,
  `saveContact()`, `deleteContact()`, `importContactBook()`,
  `verifyContactMeshLink()`, `verifyMeshLinks()`.
  `verifyContactMeshLink()` is the only caller of `verifyMeshLink()` in the
  repository:

  ```ts
  export async function verifyContactMeshLink(contact: ContactRecord): Promise<ContactRecord> {
    if (!claimsMeshLink(contact)) return contact;
    const meshLink = await verifyMeshLink({
      matrixId: contact.matrixId,
      meshServerName: contact.neutrinoServerName,
    });
    const updated = { ...contact, meshLink };
    // Written in place: a check must not reorder the list under the reader.
    await getStorage().saveContact(updated);
    contactsState.contacts = contactsState.contacts.map((c) => (c.id === updated.id ? updated : c));
    return updated;
  }
  ```

- **`packages/storage/src/index.ts`**, `interface ContactRecord`, already carries
  three separate things and already says the right thing in a comment:

  ```ts
  /** QR exchange is not identity verification; stays false until Matrix verification. */
  verified: boolean;
  …
  /** Result of verifying the card signature at scan time. */
  signature?: 'valid' | 'invalid' | 'unsigned';
  …
  meshLink?: {
    state: 'verified' | 'mismatch' | 'unlinked' | 'unverifiable' | 'outdated';
    checkedAt: number;
  };
  ```

  `contactFromVCard()` sets `verified: false` unconditionally. Nothing in the
  repository ever sets it to `true` — correctly, since nothing performs Matrix
  device verification.

- **`apps/web/src/lib/mesh-link.ts`** — helpers only: `MESH_LINK_TTL_MS` (24h),
  `meshServerOf()`, `contactForMeshUser()`, `claimsMeshLink()`,
  `meshLinkStale()`. It treats `unverifiable` and `outdated` as always stale so
  they are re-asked.

- **`apps/web/src/lib/contact-import.ts`** — despite the name, this is _phone
  contact-book import into your own card_, not peer-card import:
  `hasContactPicker()`, `pickContact()` (Contact Picker API), and
  `profileFromContactFile(text)` (`parseVCard` from `@indiafoss/model`). It
  performs no signature check and touches no account claims. Peer cards arrive
  through `contacts.svelte.ts` + `contact-continuity.ts` and the signature check
  in `packages/model/src/signed-vcard.ts`.

- **`apps/web/src/lib/identity.svelte.ts`** — this device's own handshake key:
  `identityState` and `hydrateIdentity()`, using `getDeviceKey()` /
  `generateHandshakeKeyPair()` / `putDeviceKey()`, `keyFingerprint()` and
  `identiconSvg()`. It has no bearing on _other people's_ trust states; it is
  listed here so you do not go looking for one.

- **`apps/web/src/lib/card-fields.ts`** — the share-sheet field catalogue:
  `CARD_GROUPS`, `CARD_FIELDS`, `LINK_LABELS`, `LINK_PLACEHOLDERS`,
  `selectionKeyFor()`, `sharedFieldCount()`, `byteLength()`. This is where the
  _outgoing_ card's fields are defined, and it is the place to check that we do
  not offer to publish a trust value at all.

- **Rendering.** Exactly one component renders the mesh-link label:
  `apps/web/src/routes/connect/+page.svelte` (quoted above), which also renders
  the card-signature badge just above it:

  ```svelte
  {c.keyChanged
    ? 'KEY CHANGED SINCE AN EARLIER CARD'
    : c.signature === 'valid'
      ? `SIGNED · BADGE ${shortFingerprint(c.fingerprint ?? '')}`
      : c.signature === 'invalid'
        ? 'BAD SIGNATURE'
        : 'UNSIGNED CARD'}
  ```

  `apps/web/src/routes/scan/+page.svelte` (around lines 356–369) carries the
  "Unverified — a QR code exchanges identifiers…" copy and a `✔ Signed card`
  marker. There is no shared badge component; that is part of what makes this
  drift.

- **Android.** `apps/android/native/` has **no** mesh-link check, no trust
  state and no verified badge. Its `ContactCard` is an unrelated vCard DTO in
  `core/src/main/kotlin/org/indiafoss/companion/core/VCard.kt` (`data class
ContactCard`, `encode()`, `parse()`), stored by
  `app/src/main/kotlin/org/indiafoss/companion/data/ProfileStore.kt` and shown by
  `ui/screens/ConnectScreen.kt`. **This means the Android work in this task is a
  prohibition, not a port:** do not introduce a `verified` label there, and do
  not add a profile check that would produce one. If Android later shows peer
  trust at all, it shows the same vocabulary this task establishes.

## What to do

1. **Add the trust vocabulary to the stored record, without breaking the stored
   data.** In `packages/storage/src/index.ts`, add an optional
   `accountTrust?: AccountClaimTrust` (imported as a type from
   `@indiafoss/model/contracts`) to `ContactRecord`, alongside — not replacing —
   the existing `meshLink` field. `meshLink` stays as the _raw observation_ (what
   the profile check saw and when); `accountTrust` is the _conclusion_. Keep
   `verified: boolean` and keep it false; it is the "Matrix device verification
   happened" flag and nothing may set it yet.

2. **Derive, do not rename.** Add a single pure function — put it in
   `apps/web/src/lib/mesh-link.ts` next to the other helpers, exported and
   unit-tested — that maps an observation to an `AccountClaimTrust`:

   | Observation                                             | `AccountClaimTrust`                               |
   | ------------------------------------------------------- | ------------------------------------------------- |
   | no check performed, or `unverifiable`, or `outdated`    | `claimed`                                         |
   | `unlinked` (profile carries no mesh identity)           | `claimed`                                         |
   | `verified` (the profile strings matched)                | `profile-matched`                                 |
   | `mismatch`                                              | `claimed`, **plus** a separate contradiction flag |
   | a valid `IdentityBinding` signed by an untrusted device | `binding-valid`                                   |
   | Matrix device cross-signing succeeded                   | `verified`                                        |

   The last two rows have no producer and must not gain one here — they belong
   to #188 and **C-12**. Write the mapping so those rows are unreachable today
   and obvious to fill in later.

   `mismatch` deserves its own treatment: it is the strongest negative statement
   the app makes about another person and it must not be flattened into
   `claimed`. Keep it a distinct displayed state.

3. **Rename the state that lies.** In
   `packages/matrix/src/mesh-link.ts`, rename `MeshLinkState`'s `'verified'`
   member to `'profile-matched'` and update `meshLinkLabel()` so that no code
   path in the repository returns the word "Verified" for a profile comparison.
   Suggested labels, all of which say who is asserting what:

   - `profile-matched` → `"Profile matches"`
   - `mismatch` → `"Does not match"` (unchanged)
   - `unlinked` → `"Claimed"` (unchanged)
   - `outdated` → `"Card predates a format change"` (unchanged)
   - `unverifiable` → `"Not checked yet"` (unchanged)

   Update the doc comment on the union so it no longer describes a profile read
   under a name that implies cryptography. Migrate stored records: a
   `ContactRecord.meshLink.state === 'verified'` written by an older build must
   read back as `profile-matched`, not be dropped and not be trusted. Do this in
   the storage read path, and test it — an attendee who saved a card last week
   must not lose it.

4. **Apply `asReceived()` on import.** Every path where a card arrives from
   somebody else's device must pass it through `asReceived()` from
   `@indiafoss/model/contracts` before anything is stored, so a card can never
   assert its own verification. That is `saveScannedContact()` and
   `importContactBook()` in `apps/web/src/lib/contacts.svelte.ts`, and the friend
   payload path via `contactFromFriend()`. Where the incoming shape is a
   `ContactRecord` rather than a `ContactCard`, the equivalent is unconditional:
   set `accountTrust = 'claimed'` and `verified = false` on import, whatever
   arrived. **Never read a trust value off the wire**, not even to compare it.

5. **Make the outgoing card not carry a trust value.** Check
   `apps/web/src/lib/card-fields.ts` and the vCard encoder in
   `packages/model/src/signed-vcard.ts`: our own exported card must not include
   an account-trust field at all. A field that is always ignored on import is
   better absent than present-and-ignored.

6. **Fix the display in `apps/web/src/routes/connect/+page.svelte`.** Use the
   derived `accountTrust`, and show the three independent facts as three
   distinct things rather than one badge:

   - _met in person_ — from `metCount` / `lastMetAt` / `metActivityId`, which the
     row already shows; label it as a fact about the meeting;
   - _card signature_ — the existing `SIGNED · BADGE …` / `BAD SIGNATURE` /
     `UNSIGNED CARD` line, whose wording should make clear it is about the
     **card key**, not the Matrix account;
   - _account claim_ — the mesh-link line, now reading `PROFILE MATCHES` /
     `DOES NOT MATCH` / `CLAIMED` / …, with the `sig-ok` success colour reserved
     for genuine verification and therefore **not applied to
     `profile-matched`**. A neutral or informational treatment is correct.

   Reserve the verified badge for `accountTrust === 'verified'`, which nothing
   can currently produce. Leave that branch in place, unreachable, with a comment
   naming #188.

7. **Say what a profile match is worth, in the UI, once.** The `title` attribute
   already says it ("Whether this Matrix account's own profile names this mesh
   identity"). Promote that to something a person actually sees when they open
   the contact — one sentence, in the contact detail, that a profile match is
   the homeserver's word and not proof of account control.

8. **Do not touch Android except to keep it honest.** See the note above. If
   `ui/screens/ConnectScreen.kt` displays anything implying account
   verification, remove the implication; otherwise Android needs no change and
   should get none in this task.

9. **Tests.** Co-located `*.test.ts`, vitest, matching the existing convention:
   - `apps/web/src/lib/mesh-link.test.ts` — the observation→`AccountClaimTrust`
     mapping, every row of the table in step 2, including that a profile match
     maps to `profile-matched` and **never** to `verified`.
   - `packages/matrix/src/mesh-link.test.ts` — `meshLinkLabel()` returns the
     string `"Verified"` for no input at all. Assert that as a property over
     every member of the union, so a future state cannot reintroduce it.
   - A storage-migration test: a record persisted with
     `meshLink.state === 'verified'` reads back as `profile-matched`, and the
     contact is not lost.
   - The adversarial case, below, as a test.

## Acceptance

```bash
just test
just typecheck
just lint
```

All pass. Then confirm the tests are worth having by reverting the
`meshLinkLabel` change locally and re-running: the new assertions must fail. A
test that passes against the old behaviour is testing nothing
(`docs/tasks/README.md` rule 3).

**The adversarial acceptance case**, which is the point of this task. Write it as
an automated test, and also walk it by hand once:

1. Construct a card for a mesh identity you control, naming somebody else's
   MXID — for example `@alice:matrix.org` when you are not Alice — and sign it
   with your own card key so the card signature is genuinely **valid**.
2. Import it.
3. Observe: the card-signature line says the card is signed (true — you do
   control the card key). The account line says **`CLAIMED`**.
4. Now arrange for the profile check to succeed (a homeserver that publishes the
   matching `in.indiafoss.mesh` value). Observe the account line becomes
   **`PROFILE MATCHES`**, in neutral styling.
5. **Required outcome: at no point does a verified badge appear, and at no point
   does the contact become eligible for automatic routing.** `verified` stays
   `false`; `mayActOn()` (`packages/model/src/contracts/identity-binding.ts`)
   still refuses everything above `display` scope.

Manual UI check, in a browser: open `/connect` with a contact carrying both a
`matrixId` and a `neutrinoServerName`, and read the row aloud. If a reasonable
person would come away believing the app checked the Matrix account
cryptographically, the wording is not finished.

Grep check. The only legitimate remaining hits are: tests, the deliberately
unreachable `verified` branch in the display code, and the unreachable
`verified` / `binding-valid` rows of the mapping function from step 2. Anything
else — in particular anything on the profile-check path — is the defect:

```bash
rg -n "'verified'" packages/matrix/src apps/web/src
```

## Out of scope

- **The identity binding's cryptography.** The canonical signing encoding,
  domain separation, `/keys/query` and everything that could actually produce
  `binding-valid` or `verified` is **C-12** and
  [#188](https://github.com/hanthor/indiafoss-companion/issues/188). This task
  makes room for those values; it must not invent them. Leaving those branches
  unreachable is the correct outcome.
- **Automatic routing and fallback.** ADR 0006 Stage 1, gated on #188 and on
  Chat #48. Do not enable it, and do not weaken `mayActOn()` to make anything
  render more confidently.
- **Correcting ADR 0006's text.** The ADR's "Context" fact 3 claims the signed
  binding shipped; correcting it is step 1 of **C-12**, kept there so the
  correction lands with the specification that replaces it.
- **One handoff parser for both encodings.** That is **C-09** (#31), which this
  task depends on but does not contain. If the two collide, land C-09 first.
- **Kotlin fixture conformance.** **C-08**. Do not add
  `packages/test-fixtures` reading to the Kotlin core here.
- **Discovery, short codes and the hide toggle.**
  [ADR 0008](../adr/0008-mesh-identity-and-discovery.md) owns those; a trust
  state is not a discovery control.
- **Removing the profile check.** It is useful, correctly implemented for what
  it is, and its `outdated` handling (#160) is deliberate. The defect is the word
  on the screen, not the check.
