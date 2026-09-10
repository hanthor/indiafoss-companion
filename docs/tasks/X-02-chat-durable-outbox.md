# X-02 — The app tells the truth about whether a message got there

- Status: Ready
- Repository: **indiafoss-chat-android**
- Tracks: Chat
  [#48](https://github.com/hanthor/indiafoss-chat-android/issues/48)
- Size: L

## The work happens in another repository

The Chat client is
[`hanthor/indiafoss-chat-android`](https://github.com/hanthor/indiafoss-chat-android).
**Do not create Kotlin or Swift files in indiafoss-companion for this
task.** This spec lives here because the architecture does.

## Why this matters

An attendee sends a message in a hall with no internet. The app shows a
tick. They walk away believing it arrived. It did not — the mesh route
accepted it and the recipient never decrypted it, or the acknowledgement was
lost and nobody knows which. Later the app "helpfully" resends through a
different account, and the recipient gets it twice from a stranger's MXID.

Every one of those is worse than an honest "we don't know yet". This task
builds the record that makes honesty possible.

## Context you need

### The contract, verbatim

`docs/architecture/system.md`, "Delivery and seamless continuation":

> Chat owns a durable logical outbox. Every send records a local logical ID,
> account and destination, payload/media references, per-route transaction
> IDs, attempts and observations. Suggested states: queued locally →
> submitting → accepted by route → recipient acknowledgement where
> available; failed, cancelled and outcome unknown remain explicit. Server
> acceptance is not recipient decryption; a read receipt is optional and
> distinct.
>
> On a timeout, retry the same route with that route's idempotency mechanism
> where supported. A lost acknowledgement can leave delivery uncertain. Do
> not automatically resend through a different identity/room merely because
> a peer was not discovered. First ship explicit continuation with a preview
> of sender account, destination and possible duplicate. Later auto-selection
> requires a valid identity binding, usable encryption keys, reachable
> destination and a policy for ambiguous sends. Cancellation cannot retract a
> request already accepted elsewhere.

Read that as a set of hard rules, because that is what it is:

1. **Server acceptance is not recipient decryption.** A 200 from a route
   means the route took custody. It says nothing about whether the recipient
   has the key, is reachable, or ever opened the app.
2. **A read receipt is optional and distinct.** Its absence is not evidence
   of non-delivery; its presence is a _fourth_ fact, not an upgrade of the
   third.
3. **On timeout, retry the SAME route**, using that route's idempotency
   mechanism (the Matrix transaction ID where the route supports one). A
   retry that changes route changes identity, and that is a different
   message.
4. **A lost acknowledgement leaves delivery genuinely uncertain, and the UI
   must say so.** "Outcome unknown" is a first-class terminal state, not a
   spinner that never resolves and not a failure.
5. **Do not automatically resend through a different identity or room merely
   because a peer was not discovered.** Non-discovery is weak evidence.
   `docs/architecture/review-2026-09-07.md`, finding 6: "ADR 0006 defines
   mesh reachability using a live peer/gateway and classic reachability using
   a responding homeserver. Neither establishes that a particular recipient
   can receive and decrypt a message. A discovered peer is weaker evidence
   still."
6. **Cancellation cannot retract a request already accepted elsewhere.**
   Cancel means "stop trying", not "unsend".

### Explicit continuation first

The architecture is specific about sequencing, and this task ships only the
first half:

> First ship explicit continuation with a preview of sender account,
> destination and possible duplicate.

So when a send cannot proceed on its current route, the app shows the
attendee a preview naming **which account** would send, **which destination**
it would go to, and **that a duplicate is possible** — and waits for them.
No automatic selection. Automatic selection is deferred until all four of
these hold: a valid identity binding, usable encryption keys, a reachable
destination, and a stated policy for ambiguous sends. None of the four
exists yet — the identity binding is
[#188](https://github.com/hanthor/indiafoss-companion/issues/188), and
`docs/architecture/system.md` says of the current mechanism: "The current
profile comparison is inadequate for automatic routing."

### The existing StartDM guard is a stopgap with a wrong message

`docs/forks.md` records the fork carrying:

> **A cross-seam DM guard** (#40, for companion #176). On a mesh session the
> app refuses to _create_ an encrypted DM with a user whose homeserver only
> the internet can reach.

The refusal is correct. Its wording is not. From
`docs/architecture/review-2026-09-07.md`, finding 6:

> The current DM guard is a useful stopgap, but its exception advises trying
> again when online. Its predicate depends on identity shapes, not
> connectivity; going online alone cannot make it pass. Give the user an
> actionable account-switch explanation, and verify the actual rendered
> error surface.

The file is documented as
`libraries/matrix/api/src/main/kotlin/io/element/android/libraries/matrix/api/room/StartDM.kt`
in the chat-android repository. **Verify that path in that repository before
editing it — this spec was written from Companion's documentation of that
repo, not from the repo itself.** The message should tell the attendee which
account can reach this person, not tell them to go online.

## What to do

1. **Model the outbox entry.** One durable record per logical send, written
   before any network call:

   - a **local logical ID**, generated client-side and stable across
     restarts, retries and route changes;
   - the **sending account** and the **destination** (room and, where
     relevant, the person);
   - the **payload**, and **references** to media rather than copies of it
     (media has its own lifecycle — see X-01 and
     `docs/architecture/system.md`: "Media uploads need bounded size,
     durable references, retry and orphan cleanup");
   - **per-route transaction IDs**, one per route attempted, so an
     idempotent retry on that route reuses its own ID;
   - **attempts** and **observations** — what was tried, when, and what came
     back, appended not overwritten, so a support conversation can
     reconstruct what happened.

2. **Implement the states as an explicit enum**, with no state meaning "we
   inferred it":

   `queuedLocally` → `submitting` → `acceptedByRoute` → `acknowledgedByRecipient`
   (only where the route actually supports an acknowledgement)

   plus three terminal states that are never collapsed into each other:
   `failed`, `cancelled`, `outcomeUnknown`.

   `acceptedByRoute` must not render as a delivery tick. Whatever the
   existing tick iconography is, `acceptedByRoute` and
   `acknowledgedByRecipient` must be visually distinguishable, and
   `outcomeUnknown` must be distinguishable from both.

3. **Make it durable.** Write the entry to persistent storage before the
   send, and update it transactionally. Force-stop the app mid-send and the
   entry must survive with its true state. Restart must not silently
   re-submit anything that was already `acceptedByRoute`.

4. **Retry on the same route only**, with backoff, reusing that route's
   transaction ID so the route can deduplicate. Bound the retries; when they
   run out, land on `outcomeUnknown` if the route accepted anything, or
   `failed` if it never did.

5. **Ship the explicit continuation preview.** When a send stalls or the
   attendee wants to try another way, show a sheet naming the sender
   account, the destination, and — in plain language — that the earlier
   attempt may already have been delivered, so this could arrive twice. It
   proceeds only on an explicit tap. There is no automatic path in this
   task.

6. **Implement cancellation honestly.** Cancel stops further attempts and
   moves the entry to `cancelled`. If the entry ever reached
   `acceptedByRoute`, the UI must say the message may still be delivered —
   cancelling did not unsend it.

7. **Fix the StartDM message** (see above), and verify the _rendered_ error
   the attendee sees, not just the exception's text. The review calls that
   out specifically.

8. **Tests**, following the chat-android repository's existing test
   conventions:
   - an entry survives process death between `submitting` and any terminal
     state, and does not double-send on restart;
   - a timeout retries the same route with the same transaction ID, and the
     route sees one logical message;
   - route acceptance alone never produces `acknowledgedByRecipient`;
   - a read receipt arriving does not change the delivery state, and its
     absence does not either;
   - non-discovery of a peer produces no automatic route change;
   - cancelling after `acceptedByRoute` yields `cancelled` **and** the
     may-still-be-delivered disclosure;
   - the continuation preview names account, destination and duplicate risk,
     and does nothing until confirmed.

## Acceptance

Run the chat-android repository's own build, lint and test commands — read
its CI configuration for the current ones rather than assuming, and note
that its test pipeline currently fails at Checkout with LFS before Gradle
runs (`docs/architecture/review-2026-09-07.md`, finding 5). If that is still
true, say so and run the tests locally; do not report a red pipeline as a
passing task.

Then, on two devices with the mesh available:

- Send a message, kill the app between submit and acknowledgement, relaunch.
  The state shown is the true one and no duplicate arrives.
- Send with the recipient out of range. The state stops at `queuedLocally`
  or `submitting` and never claims delivery.
- Send, have the route accept, and drop the acknowledgement. The message
  ends `outcomeUnknown` and the UI says the outcome is unknown in words an
  attendee understands.
- Attempt a cross-seam DM and read the rendered error. It names an account
  that can reach the person; it does not tell the attendee to go online.

The negative case: verify that **nothing** in this change ever selects a
route automatically. Grep your own diff for it. If an automatic fallback
exists anywhere, this task has shipped the deferred half.

## Out of scope

- **Automatic per-message fallback between transports or accounts.** It is
  deferred by the architecture until identity binding, keys, reachability
  and an ambiguity policy all exist. **C-12** (#188) owns the binding
  specification.
- **The person inbox / merged timeline.** `docs/architecture/system.md`
  calls it "an optional person inbox … a projection over account-scoped
  conversations" and warns that "matching message text is not a reliable
  dedup key". Not this task.
- **Account coexistence, per-account crypto stores and logout.** That is
  **X-03** (Chat #46/#47), and it is a prerequisite: the outbox records a
  sending account, which presupposes accounts that coexist.
- **Media transport and the 404 attachment bug.** That is **X-01**. The
  outbox stores media _references_; it does not fix the pipe.
- **Cross-seam encrypted delivery** to a Spindle user, which is
  structurally open and owned by
  [#176](https://github.com/hanthor/indiafoss-companion/issues/176). The
  outbox must represent that it cannot deliver; it must not try to solve it.
- **Read receipts as a delivery signal.** Model them, keep them distinct,
  and do not let them promote a state.
