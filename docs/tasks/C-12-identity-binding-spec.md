# C-12 — Specify the mesh↔Matrix identity binding before anything routes on it

> Status, 10 September 2026: the specification is
> [`docs/identity-binding.md`](../identity-binding.md), with a verifier on
> both platforms and shared vectors; the maintainer decisions in #181 are
> taken as stated assumptions in its §12 rather than cited. It awaits the
> #188 review. The historical excerpts below describe the envelope as it was
> before that document and are kept for the record; the domain string was
> retired in favour of `in.indiafoss.binding/v1`.
>
> Status, 9 September 2026: ADR 0006 now distinguishes the shipped public-profile string comparison from the proposed cryptographic binding. #188 still owns the protocol review and implementation gate. Do not treat the legacy `verified` result from #111 as account-key verification; historical excerpts below are not evidence that this protocol exists.

- Status: In review — spec and verifier landed, #188 review pending; #181
  decisions assumed, not cited
- Repository: indiafoss-companion
- Tracks: [#188](https://github.com/hanthor/indiafoss-companion/issues/188),
  [#181](https://github.com/hanthor/indiafoss-companion/issues/181)
- Size: L

> **This is a specification task, not an implementation task.** The deliverable
> is a written specification plus an adversarial review of it. **Do not write
> cryptographic code for this task.** If you find yourself editing
> `identity-binding.ts` to add signing or verification, you have left the task.
> Implementation is a separate, later unit of work that this specification
> authorizes — and it cannot be authorized until the maintainer has answered the
> questions in the _What the maintainer must decide first_ section below.

## Why this matters

The sharpest attack on this product is somebody putting another person's Matrix
ID on a card they signed themselves. If the app ever believes that card, a
message an attendee meant for a speaker is delivered to a stranger's phone
instead — and the sender sees a normal, apparently-successful send. Nothing
about the failure looks like a failure.

Everything that makes the two-transports experience good — showing two
identities as one person, offering "continue in your other account", choosing a
route without asking — depends on being able to tell a real binding from a
forged one. Right now nothing can, so nothing may. This specification is what
turns that "nothing may" into a bounded, reviewable "this much may, on this
evidence".

## Context you need

### The envelope already ships; the cryptography deliberately does not

[`packages/model/src/contracts/identity-binding.ts`](../../packages/model/src/contracts/identity-binding.ts)
defines the versioned envelope — identifiers, scope, validity and revocation —
and stops there on purpose. Its module header states the boundary this task
exists to move:

```ts
/**
 * IdentityBinding — a statement that one person controls both a mesh identity
 * and a classic Matrix account.
 *
 * ## This module deliberately stops short of verification
 *
 * The envelope, identifiers, scope, validity and revocation shape are defined
 * here because forward-compatible storage does not need a settled signature
 * format (same argument as #160). The parts that make a binding *mean*
 * something — the canonical signing encoding, the domain separation string,
 * replay and expiry rules, device-deletion and cross-signing-reset handling,
 * and how Matrix device trust is fetched and weighed — are specified in **#188
 * and are not implemented here**.
 *
 * Until #188 lands: {@link collectIdentityBindingIssues} validates *structure
 * only*. A binding that passes is **not** verified, must not upgrade a contact
 * to `verified`, and must not enable automatic routing between transports. The
 * adversarial case it does not defend against is exactly the one #188 exists
 * to close: someone putting another person's MXID in `matrixUserId` and
 * self-signing.
 *
 * ADR 0006 describes a stronger mechanism than the code implements; that
 * correction is tracked in #188 and restated in
 * `docs/architecture/system.md` ("Identity and trust").
 */
```

That header is the task statement. Each clause of the second paragraph is a
section this specification must produce.

### What the envelope already fixes, and must not change

These are decided. The specification builds on them; it does not revisit them.

```ts
export const IDENTITY_BINDING_SCHEMA_VERSION = 1;

/**
 * Domain separation prefix for the eventual signing encoding.
 *
 * Declared here so every platform agrees on it from the start. **Nothing signs
 * or verifies with it yet** — the encoding it prefixes is #188's to specify.
 */
export const IDENTITY_BINDING_DOMAIN = 'in.indiafoss.identity-binding.v1';
```

The signed statement's fields are already named, and their meanings are already
committed to:

```ts
export interface IdentityBinding {
  schemaVersion: number;
  /** Stable id for this binding, so a card can reference it and it can be revoked. */
  id: string;
  /** The mesh node id being bound: 64 lowercase hex (ADR 0008). */
  meshNodeId: string;
  /** The classic Matrix account being bound. */
  matrixUserId: string;
  /** The Matrix device that signed the statement, e.g. `ABCDEFGH`. */
  matrixDeviceId: string;
  /** Contact card key this binding was presented with, when applicable. */
  cardKey?: string;
  scope: BindingScope;
  /** When the statement was made, ISO-8601. */
  issuedAt: string;
  /** When it stops being acceptable, ISO-8601. Absent means no stated expiry. */
  expiresAt?: string;
  /**
   * Signature by the mesh key over the canonical encoding, base64url.
   * Format specified in #188.
   */
  meshSignature?: string;
  /**
   * Signature by the Matrix device key over the canonical encoding,
   * base64url. Format specified in #188.
   */
  deviceSignature?: string;
}
```

Both signatures are optional in the _type_ because a binding may be stored
before it can be checked. Neither is optional in the _protocol_ this task
specifies: a binding with a missing signature is a binding that fails
verification, not a binding that verifies weakly.

Three scopes exist, ordered, narrow first:

```ts
export type BindingScope =
  /** Display the two identities as one person. No routing consequences. */
  | 'display'
  /** Additionally allow offering "continue in the other account" explicitly. */
  | 'continuation'
  /**
   * Additionally allow choosing a route without asking. Requires verified
   * device trust; gated on #188 and on the delivery contract in Chat #48.
   */
  | 'routing';
```

Device trust is recorded separately from signature validity, because a valid
signature by an untrusted device is not a verified identity:

```ts
export type DeviceTrustSource =
  /** Keys could not be fetched — offline, or the server did not answer. */
  | 'unknown'
  /** Keys fetched, device is not cross-signed by its owner. */
  | 'unverified'
  /** Cross-signed by the owner's self-signing key. */
  | 'cross-signed'
  /** Verified by this user, in person or by emoji/QR comparison. */
  | 'user-verified';
```

And the verifier's conclusion is stored beside the binding, never inside it:

```ts
export interface BindingVerification {
  bindingId: string;
  /** Both signatures present, well-formed and checked. Gated on #188. */
  signaturesValid: boolean;
  deviceTrust: DeviceTrustSource;
  /** When this conclusion was reached, ISO-8601. */
  checkedAt: string;
  /**
   * True only when a verifier may present this as a verified identity:
   * signatures valid **and** device trust is `user-verified`. Everything else
   * is pending, however plausible it looks.
   */
  presentAsVerified: boolean;
}
```

### The gate that must keep holding while this task is open

`mayActOn()` in the same module is the single choke point. Until this
specification lands and is implemented, it must keep refusing everything above
`display`:

```ts
export function mayActOn(
  binding: IdentityBinding,
  verification: BindingVerification | undefined,
  scope: BindingScope,
  now: Date,
): boolean {
  if (binding.expiresAt && Date.parse(binding.expiresAt) <= now.getTime()) return false;
  if (SCOPES.indexOf(scope) > SCOPES.indexOf(binding.scope)) return false;
  if (scope === 'display') return true;
  return verification?.presentAsVerified === true;
}
```

Since nothing can currently set `presentAsVerified: true` honestly — no code
checks signatures — every `continuation` and `routing` question answers `false`
today. That is correct behaviour, not a bug to work around. **No automatic
routing may ship while this is true.** Anyone who "fixes" this by hard-coding
`presentAsVerified` or by deriving it from
[`packages/matrix/src/mesh-link.ts`](../../packages/matrix/src/mesh-link.ts)'s
profile comparison has reintroduced the exact defect #188 exists to close.

`pendingVerification()` is the correct thing to record when a binding cannot be
checked:

```ts
export function pendingVerification(bindingId: string, checkedAt: string): BindingVerification {
  return {
    bindingId,
    signaturesValid: false,
    deviceTrust: 'unknown',
    checkedAt,
    presentAsVerified: false,
  };
}
```

Note its doc comment's rule, which the specification must preserve and expand:
"An uncheckable new claim stays pending; it does not inherit trust from a
previous binding."

### What the architecture asks for

`docs/architecture/system.md`, "Identity and trust":

> Model `Person`, `ContactCardKey`, `MeshIdentity`, `MatrixAccount`, and
> `MatrixDevice` separately. A person can have several accounts/devices. An
> in-person meeting is evidence of a meeting; a signed card is evidence of
> control of that card key; a homeserver profile match is an account claim.
> None by itself is Matrix device verification.
>
> Proposed binding flow: Chat proves possession of its mesh key and an
> authenticated classic device signs a domain-separated, versioned binding. The
> verifier checks both statements, fetches the relevant Matrix keys when
> possible, and records the source and strength of device trust. Specify the
> canonical encoding, replay/expiry rules, device deletion, cross-signing reset,
> key rotation and offline presentation in #188. A valid signature by an
> untrusted Matrix device must not become a human-verified badge. Offline
> verification can retain previously verified evidence; an uncheckable new claim
> stays pending.
>
> The current profile comparison is inadequate for automatic routing.
> Explicitly correct ADR 0006's stronger claim rather than building on it. Let
> users inspect and unlink identities. Do not upload the attendee contact graph
> or broadcast human-readable profile data merely to enable discovery. Discovery
> should be opt-in and independently controllable from existing conversations.

And the contract table in the same document:

> | IdentityBinding | Versioned canonical payload binding card/mesh/classic
> identifiers, issuer/device, intended scope, validity and revocation. Exact
> signature and Matrix trust verification specified in #188 before automatic
> routing. |

### The claim in ADR 0006 that is wrong, and must be corrected

[ADR 0006](../adr/0006-one-person-two-transports.md), "Context", fact 3, states
the mechanism as if it were already built:

> **The binding between a person's two identities already exists.** #111
> shipped it: the app, signed into the real account, signs a statement over
> (mesh user id, mesh node key, real MXID, issued at) with that account's
> device key; a peer verifies it against the real homeserver's
> `/keys/query`.

It did not ship that. `#111` shipped a public-profile string comparison
(`packages/matrix/src/mesh-link.ts`, corrected in **C-10**). The review of
7 September 2026 (`docs/architecture/review-2026-09-07.md`, finding 1) records
the discrepancy:

> ADR 0006 says #111 already signs an identity-binding statement with the Matrix
> account's device key and verifies it through `/keys/query`. Its routing and
> merging design relies on that claim.
>
> The implementation in mesh-link.ts instead fetches a public profile, reads
> `in.indiafoss.mesh`, and compares two strings. It returns `verified` when they
> match. It does not verify the claimed device signature.

ADR 0006's own security section is nonetheless the right requirement, and this
specification must satisfy it rather than weaken it:

> **Mis-binding is the sharpest threat.** An attacker publishing "my mesh id is
> bound to `@someone-important:matrix.org`" would receive messages meant for
> them. Mitigation is absolute: merge and auto-route **only** on a `verified`
> link […] `claimed` never routes.
>
> **Verification does not transfer.** Two accounts are two crypto identities;
> cross-signing one does not vouch for the other.

## What the maintainer must decide first

This spec is **Blocked**, and these are the blockers. They are product and
operations choices, not engineering ones, and the specification's shape changes
depending on the answers. `docs/architecture/system.md` records them as still
open:

> The recommended defaults are: staged opt-in person merging; existing MXID or
> transparent temporary account; no compulsory cloud archive; PWA as 2026 iOS
> baseline; native Companion admitted independently; iOS mesh participant before
> relay; protocol extensions reviewed before coding. Record acceptance or
> alternatives in #181. The most consequential unresolved choices are
> temporary-account lifetime/operator, canonical service domains and room
> policy, the iOS distribution owner and supported OS floor, and the maintenance
> capacity for another Chat fork.

The decisions this task specifically waits on, all to be recorded in
[#181](https://github.com/hanthor/indiafoss-companion/issues/181) by the
maintainer (James):

1. **Is `routing` scope wanted at all for the September release?** ADR 0006's
   own recommendation, echoed by the review's finding 6, is to ship explicit
   "Continue using this account" first and defer automatic per-message
   fallback. If the answer is "not in September", the specification still gets
   written but the implementation it authorizes stops at `continuation`, and
   that is a materially smaller and safer piece of work.
2. **Temporary-account lifetime and operator.** A binding to an account that
   expires in a week means something different from a binding to a durable
   account. Expiry rules, and whether a binding survives an account's
   retirement, cannot be specified before this is answered.
3. **Canonical service domains and room policy.** The verifier fetches device
   keys from _some_ homeserver; which servers are expected, and what happens
   when the named server is unreachable or unknown, depends on this.
4. **Is staged opt-in person merging accepted as the default?** This sets
   whether `display` scope is applied automatically on import or only after the
   attendee asks for it.

**Do not begin drafting the normative specification until items 1 and 2 are
answered in #181.** Items 3 and 4 affect sections rather than the whole shape,
and may be drafted with the recommended defaults clearly marked as assumptions.

**Step 1 below — correcting ADR 0006's false claim — is not blocked by any of
this and should be done immediately.** The ADR misdescribes shipped code today,
and every reader of it between now and whenever #181 is answered is being
misled. Land that correction on its own, without waiting.

## What to do

The deliverable is a written specification. Put it at
`docs/identity-binding-spec.md`, and link it from
`packages/model/src/contracts/identity-binding.ts`'s module header (replacing
"are specified in #188 and are not implemented here" with a pointer to the
document, once it exists) and from
[`docs/adr/0006-one-person-two-transports.md`](../adr/0006-one-person-two-transports.md).

1. **Correct ADR 0006 first, in its own change.** Amend the "Context" fact 3
   quoted above to describe what `#111` actually shipped — a public-profile
   comparison — and to say that the signed-binding mechanism the rest of the ADR
   relies on is specified in #188 and not yet built. Do this before anything
   else; every reader of the ADR between now and then is being misled. This is
   the one edit in this task that is not a new document.

2. **Specify the canonical signing encoding.** A byte-exact serialization that
   three independent implementations (TypeScript, Kotlin, and possibly Swift —
   ADR 0009) can produce identically from the same `IdentityBinding` value.
   State: field order, how optional fields are represented when absent, string
   normalization (case folding for `meshNodeId` and `matrixUserId`, Unicode
   normalization where it can matter), integer and instant representation, and
   the precise placement of `IDENTITY_BINDING_DOMAIN` as a prefix. State
   explicitly that `meshSignature` and `deviceSignature` are excluded from the
   bytes each covers, and say whether the two signatures cover the same bytes or
   whether the device signature also covers the mesh signature. That choice has
   consequences — say which you chose and why.

3. **Specify domain separation.** `IDENTITY_BINDING_DOMAIN` is
   `'in.indiafoss.identity-binding.v1'` and nothing currently signs with it.
   Specify how it is bound into the signed bytes such that a signature over a
   binding can never be replayed as a signature over anything else this project
   signs — in particular the contact card's own canonical encoding
   (`canonicalVCardBody()`, referenced from
   `packages/model/src/contracts/contact-card.ts`). State the versioning rule:
   what a verifier does with a `.v2` domain it does not recognise.

4. **Specify replay and expiry.** `issuedAt` and `expiresAt` exist; give them
   normative meaning. Cover: acceptable clock skew, whether a binding with no
   `expiresAt` is acceptable and at what scope, what a verifier does with a
   binding issued in the future, and how a captured binding is prevented from
   being presented by somebody who is not its subject. State whether the
   `cardKey` field is required for a binding presented on a card, and what binds
   the presentation to the presenter.

5. **Specify device deletion, cross-signing reset and key rotation.** Three
   distinct events with three distinct correct answers:
   - the signing device is deleted from the account;
   - the account resets cross-signing (new self-signing key, all old device
     signatures now unvouched);
   - the mesh node key changes (which, per ADR 0006, means a different mesh
     identity, not a rotated one — say so explicitly, or say why not).
     For each: what happens to a stored `BindingVerification`, whether previously
     established `user-verified` trust survives, and what the attendee is told.
     The architecture's rule is the floor: "Offline verification can retain
     previously verified evidence; an uncheckable new claim stays pending."

6. **Specify revocation.** The envelope has a stable `id` "so a card can
   reference it and it can be revoked" but no revocation mechanism. Specify how
   a person withdraws a binding they made, how a verifier learns of it, and what
   happens when revocation cannot be fetched. Relate this to the
   `AccountClaimTrust` value `'revoked'` in `contact-card.ts`. State plainly
   what revocation cannot do — it cannot retract what was already delivered.

7. **Specify how Matrix device trust is fetched and weighed.** Which endpoint
   (`/keys/query` and its authentication requirements), whose account performs
   the query and what that reveals to which server, how the four
   `DeviceTrustSource` values are each concluded, what caching and re-checking
   policy applies, and the mapping to `presentAsVerified`. The existing rule is
   normative and must not be loosened: `presentAsVerified` is true only when
   signatures are valid **and** device trust is `user-verified`.

8. **Specify offline presentation.** What the verifier does and shows when it
   cannot reach any homeserver — which is the common case at the venue, and the
   case the whole mesh exists for. Cover what is retained from a previous
   successful check, what a fresh unverifiable binding looks like in the UI, and
   what happens when connectivity returns and the check now fails.

9. **Specify the scope ladder's preconditions.** For each of `display`,
   `continuation` and `routing`, state exactly what must be true before
   `mayActOn()` may return true, in terms a test can assert. `routing`
   additionally requires the delivery contract in Chat #48; say so, and say what
   the interaction is.

10. **Write the adversarial review.** A section of the specification, not a
    separate document, enumerating attacks and stating which mechanism defeats
    each. It must at minimum cover: the self-signed card naming somebody else's
    MXID; a captured binding replayed by a third party; a binding signed by a
    device that was legitimate and has since been deleted; a homeserver that
    lies in `/keys/query`; a downgrade to `display` scope being silently treated
    as `routing`; and an offline verifier being induced to reuse stale positive
    evidence for a new claim. For each, name the section of the specification
    that defeats it. An attack with no defeating section is an open problem and
    must be listed as one.

11. **List what implementation will need**, without doing it: the fixture cases
    (`packages/test-fixtures/fixtures/identity-binding/{valid,invalid}/`, per
    ADR 0009) that a conformance test would assert, and the platforms that must
    produce byte-identical canonical encodings. This is the handoff to the
    implementation task, and it is the last section.

## Acceptance

There is nothing to run. Acceptance is a review, and it is deliberately
demanding — this document becomes the trust root for the entire two-transports
feature.

- [ ] The blocking decisions (items 1 and 2 under _What the maintainer must
      decide first_) are answered in #181, and the specification cites those
      answers rather than assuming them.
- [ ] `docs/identity-binding-spec.md` exists and has a section for every one of
      steps 2–11. A step with no section is not done; a step answered "to be
      determined" is an open problem and appears in the open-problems list.
- [ ] ADR 0006's "Context" fact 3 no longer claims the signed binding shipped.
- [ ] The canonical encoding is specified precisely enough that two people can
      independently implement it and produce identical bytes for the same
      binding. Test this: have a second person write out the bytes for one
      worked example from the spec text alone, and compare. If they differ, the
      spec is not finished.
- [ ] The adversarial review names a defeating mechanism for every listed
      attack, or lists it as open.
- [ ] The maintainer has reviewed and accepted it, recorded on #188.

The negative case, which must still hold when this task is finished and before
the implementation task starts:

```bash
pnpm --filter @indiafoss/model test
just typecheck
just lint
```

pass, and `mayActOn()` still returns `false` for `continuation` and `routing`
on every binding, because nothing sets `presentAsVerified` yet. **A change to
this task that makes automatic routing possible is out of scope and is a
regression.**

## Out of scope

- **Implementing any of it.** No signing, no verification, no `/keys/query`
  call. The implementation is a separate task that this specification
  authorizes, and it does not exist yet.
- **The trust-state UI and `mesh-link.ts`'s misnamed `verified` state.** That is
  **C-10**, which is _Ready_ and does not wait on this. C-10 makes the app stop
  lying about what it knows; this task specifies how it could one day know more.
- **The encrypted seam between the mesh and the internet.** Different problem,
  different workstream: **C-13** and
  [#176](https://github.com/hanthor/indiafoss-companion/issues/176). A binding
  says who someone is; the seam is about whether their ciphertext can travel.
- **The durable outbox and delivery states.** Chat #48, spec **X-02**. `routing`
  scope depends on it; specifying it is not this task.
- **Account coexistence and multi-account session handling.** Chat #46/#47, spec
  **X-03**.
- **Changing `IDENTITY_BINDING_SCHEMA_VERSION`, the field set, or the scope
  union.** The envelope is decided (ADR 0009 §4). If the specification genuinely
  cannot be written within it, stop and say so on #188 rather than widening the
  envelope quietly — that is rule 4 of `docs/tasks/README.md`.
- **Mesh discovery, short codes and the hide toggle.**
  [ADR 0008](../adr/0008-mesh-identity-and-discovery.md) owns those.
