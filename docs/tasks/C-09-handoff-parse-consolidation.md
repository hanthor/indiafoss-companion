# C-09 — One parser decides what a scanned code means

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [#31](https://github.com/hanthor/indiafoss-companion/issues/31)
  (and Chat #28 on the other side)
- Size: M

## Why this matters

An attendee scans a code on a poster, or taps a link a friend sent. What
happens next is currently decided by whichever of two parsers the calling
screen happened to import. They disagree about size limits, about which
encodings exist, and about what a link is allowed to carry. Two parsers means
two answers, and eventually one of them accepts something the other would have
refused — which for inbound links is a security question, not a tidiness one.

There must be one parser and one meaning: an inbound reference either resolves
to a known intent or it does not, identically everywhere.

## Context you need

The architecture record's contract table:

> **AppHandoff** — Version, action, event/contact/room reference and public
> proof material only. Bound size, allowed schemes/hosts, canonical parsing,
> explicit account choice where ambiguous. Never access tokens or private keys
> in URLs.

### Parser one — shipped, and the only one with a real caller

[`packages/model/src/scan.ts`](../../packages/model/src/scan.ts).
`parseScannedPayload(input: string): ScannedPayload` returns a discriminated
union — `ScannedLocation`, `ScannedContact`, `ScannedFriend`,
`ScannedMatrixUser`, `ScannedMatrixRoom`, `ScannedTicket`, or `ScanError` with
`reason: 'empty' | 'oversized' | 'unsupported' | 'malformed'`. It bounds input
first:

```ts
export const MAX_SCAN_PAYLOAD_BYTES = 8192;   // scan.ts:7
…
if (utf8ByteLength(payload) > MAX_SCAN_PAYLOAD_BYTES) {
  return { kind: 'error', reason: 'oversized', message: 'This code is too large to import safely.' };
}
```

Everything it currently accepts, and all of it must keep working:

- `indiafoss://location/<id>` (case-insensitive, optional trailing slash, id
  matching `^[a-z0-9][a-z0-9-]*$` after `decodeURIComponent`);
- `indiafoss://friend?v=1&…`, decoded by `decodeFriendPayload` in `friend.ts`;
- `indiafoss://chat?dm=<mxid>` and `indiafoss://chat?join=<alias-or-id>`;
- any other `indiafoss://` → `reason: 'unsupported'`;
- a bare Matrix user id, a bare `#alias:server` / `!id:server`;
- `https://matrix.to/#/<target>` permalinks;
- `matrix:u/…`, `matrix:r/…`, `matrix:roomid/…` URIs;
- a `BEGIN:VCARD` payload, parsed by `parseVCard`;
- a FOSS United ticket: `ticket::<id>`, or a bare `^[A-Za-z0-9_-]{6,64}$`
  string promoted to `ticket::<id>`;
- anything else → `reason: 'unsupported'` with a human message.

Note the last two rules interact: the bare-token ticket rule is a catch-all,
so any new accepted shape must be classified _before_ it.

### Parser two — new, correct about hosts, and called by nothing

[`packages/model/src/contracts/app-handoff.ts`](../../packages/model/src/contracts/app-handoff.ts).
It defines the `AppHandoff` envelope, `collectAppHandoffIssues`,
`isValidAppHandoff`, `toHandoffUrl`, and:

```ts
export const MAX_HANDOFF_BYTES = 8192;
export const HANDOFF_SCHEME = 'indiafoss:';
export const HANDOFF_HOSTS: readonly string[] = ['hanthor.github.io'];
export const HANDOFF_BASE_PATH = '/indiafoss-companion/h/';

export function isHandoffUrl(input: string): boolean {
  let url: URL;
  try { url = new URL(input); } catch { return false; }
  if (url.protocol === HANDOFF_SCHEME) return true;
  return url.protocol === 'https:' && HANDOFF_HOSTS.includes(url.hostname);
}

export function parseHandoffUrl(input: string): AppHandoff | undefined {
  if (input.length > MAX_HANDOFF_BYTES) return undefined;
  if (!isHandoffUrl(input)) return undefined;
  …
  const action = url.protocol === HANDOFF_SCHEME
    ? url.hostname || url.pathname.replace(/^\/+/, '').split('/')[0]
    : url.pathname.replace(/^\/h\//, '');
  const ref = url.searchParams.get('ref');
  if (!ref) return undefined;
  …
  return isValidAppHandoff(candidate) ? candidate : undefined;
}
```

Its actions are `view-session`, `view-location`, `open-dm`, `join-room`,
`import-contact`. `collectAppHandoffIssues` rejects any payload carrying a
credential-shaped field:

```ts
const FORBIDDEN_FIELDS = [
  'accessToken',
  'access_token',
  'token',
  'password',
  'privateKey',
  'private_key',
  'recoveryKey',
  'recovery_key',
  'secret',
];
```

`parseHandoffUrl` and `isHandoffUrl` have **no callers outside
`app-handoff.test.ts`**. Verified by grep across `.ts`, `.svelte` and `.kt`.

### The three concrete disagreements

1. **Two size constants with the same name and different values.**
   `scan.ts:7` exports `MAX_SCAN_PAYLOAD_BYTES = 8192`;
   `packages/model/src/friend.ts:37` exports `MAX_SCAN_PAYLOAD_BYTES = 4096`
   ("Maximum accepted scanned payload; larger inputs cannot be a valid QR
   anyway"). `packages/model/src/index.ts:208` re-exports one of them. Two
   limits under one name is the whole defect in miniature.

2. **Two custom-scheme grammars.** `scan.ts` understands
   `indiafoss://chat?dm=…` / `?join=…` and `indiafoss://location/<id>` and
   `indiafoss://friend?…`. `app-handoff.ts` understands
   `indiafoss://<action>?ref=…`. Neither understands the other. Both are
   `indiafoss://`, and codes in both grammars may already be printed.

3. **Only one of them knows about hosts.** `scan.ts` accepts
   `https://matrix.to/#/…` from any origin (correctly — matrix.to is a public
   permalink service, not a first-party handoff) and rejects every other
   https URL as `unsupported`. `app-handoff.ts` accepts https only on
   `HANDOFF_HOSTS`. The consolidated parser must keep both behaviours
   distinct: matrix.to stays a Matrix permalink, never a handoff.

### The security rules, inline

These are not optional and must survive consolidation:

- **Bound the payload before parsing.** One constant, checked on UTF-8 byte
  length, before any URL construction, decoding or regex work.
- **HTTPS handoffs only on allow-listed hosts.** `https://hanthor.github.io/indiafoss-companion/h/…`
  is a handoff; `https://hanthor.github.io.evil.example/indiafoss-companion/h/…` and
  `https://evil.example/h/…` are not — the existing tests at
  `app-handoff.test.ts:17` and `:21` pin exactly that, and a substring or
  `endsWith` host check would break it. Compare `url.hostname` by equality
  against the allow list.
- **Never trust a credential-shaped field.** A payload carrying any of
  `FORBIDDEN_FIELDS` is rejected outright, even when otherwise well-formed —
  forwarding it would spread the leak.
- **`accountHint` never silently picks an identity.** Absent means ask.

### The open question this task must not answer

ADR 0009 records it as a maintainer question:

> 2. Is `indiafoss://` still the intended handoff scheme, given
>    `docs/architecture/ios.md` recommends HTTPS Universal Links for owned
>    native apps? `AppHandoff` currently models both and treats the custom
>    scheme as the offline/no-network form.

and `app-handoff.ts` says the same in its header: _"Which is emitted is an open
question for the maintainer (ADR 0009); both must be accepted."_

**Both encodings must be accepted regardless of how that resolves.** Do not
change what any code _emits_ in this task, and do not remove the custom scheme.
Deciding the emitted encoding is the maintainer's call on ADR 0009.

### The real call sites

- `apps/web/src/routes/scan/+page.svelte:121`, inside `handlePayload(raw)`:

  ```ts
  function handlePayload(raw: string): void {
    error = '';
    const result = parseScannedPayload(raw);
    if (result.kind === 'error') { error = result.message; pending = null; return; }
    // Never apply automatically — always preview first.
    stopCamera();
    pending = result;
    …
  ```

  This is the only production caller of either parser. Note the
  never-apply-automatically rule and the follow-on signature verification for
  `friend` and `contact` results — preserve both.

- `apps/web/src/routes/connect/+page.svelte` is the _outbound_ side: it builds
  and shares the attendee's own card and profile. It imports no parser and
  calls neither `parseScannedPayload` nor `parseHandoffUrl`. Do not invent a
  parse call site there; if a handoff needs handling on `/connect`, that is a
  separate change with its own justification.

## What to do

1. **Pick one home and one shape.** Make `parseScannedPayload` in `scan.ts`
   the single entry point for every inbound reference, and make
   `app-handoff.ts` the owner of the handoff _envelope_ and its URL encodings.
   `scan.ts` imports from `contracts/app-handoff.js`, never the reverse.

2. **Collapse the size constants.** Keep one `MAX_SCAN_PAYLOAD_BYTES`. Have
   `friend.ts` import it from `scan.ts` (or move it to a shared module both
   import) instead of declaring 4096. Make `MAX_HANDOFF_BYTES` an alias of the
   same number so the two files cannot drift; `app-handoff.ts` already
   documents that it "Matches `MAX_SCAN_PAYLOAD_BYTES`". Check whether raising
   the friend limit from 4096 to 8192 changes any existing behaviour and say so
   in the PR — if a smaller bound is deliberate for friend payloads, keep it
   but give it a distinct name.

   Also make the handoff bound a **byte** check, matching `scan.ts`'s
   `utf8ByteLength`. `parseHandoffUrl` currently checks `input.length`, which
   is UTF-16 code units.

3. **Route `indiafoss://` through both grammars, legacy first.** In
   `parseScannedPayload`'s `indiafoss://` branch, keep the existing
   `location/`, `friend`, and `chat?dm=/join=` cases exactly as they are, and
   replace the final `unsupported` fallthrough with an attempt at
   `parseHandoffUrl`. A parsed handoff is then mapped onto the existing
   `ScannedPayload` union:

   - `view-location` → `{ kind: 'location', locationId: ref }`
     (validate `ref` against the same `LOCATION_ID` pattern);
   - `open-dm` → `{ kind: 'matrix-user', userId: ref }`;
   - `join-room` → `{ kind: 'matrix-room', idOrAlias: ref }`;
   - `view-session` and `import-contact` → a new union member, or an explicit
     `unsupported` error naming the action. Adding a member is cleaner; adding
     it silently is not — whichever you choose, the scan page must render
     something honest for it.

   Only if `parseHandoffUrl` returns `undefined` does the branch produce
   `unsupported`.

4. **Accept HTTPS handoffs.** Add a branch, placed _before_ the bare-token
   ticket catch-all and _after_ the matrix.to branch, that calls
   `isHandoffUrl` / `parseHandoffUrl` for https input and maps the result the
   same way. `https://matrix.to/#/…` must continue to be handled by the
   existing matrix.to branch and must never be treated as a handoff —
   `HANDOFF_HOSTS` already excludes it, and a test must pin that.

5. **Keep the mapping in one function.** Write a single
   `handoffToScanned(handoff: AppHandoff): ScannedPayload` used by both the
   custom-scheme and the https branch, so the two encodings cannot diverge in
   meaning. That function is the "one meaning" this task is named for.

6. **Do not weaken the error taxonomy.** A malformed handoff on an allow-listed
   host is `malformed`; a well-formed link on an unknown host stays
   `unsupported`. `parseHandoffUrl` deliberately collapses those two into
   `undefined` — its own comment explains why — so the mapping layer decides
   which `ScanErrorReason` the UI sees.

7. **Leave the scan page's flow alone** apart from rendering any new union
   member. `handlePayload` must still preview before applying and must still
   run the signature verification for `friend` and `contact`.

8. **Tests**, in `packages/model/src/scan.test.ts` (which already covers the
   existing paths) and `packages/model/src/contracts/app-handoff.test.ts`:

   - every currently-passing case in `scan.test.ts` still passes, unchanged —
     this is the no-regression requirement and it is the point of the task;
   - `indiafoss://view-session?ref=keynote&v=1` and
     `https://hanthor.github.io/indiafoss-companion/h/view-session?ref=keynote&v=1` produce the
     _identical_ `ScannedPayload`;
   - `indiafoss://chat?dm=@a:b` and
     `https://hanthor.github.io/indiafoss-companion/h/open-dm?ref=@a:b&v=1` both produce
     `{ kind: 'matrix-user', userId: '@a:b' }`;
   - `https://matrix.to/#/@a:b` is still a matrix-user and is **not** parsed
     as a handoff;
   - `https://evil.example/h/open-dm?ref=@a:b&v=1` and
     `https://hanthor.github.io.evil.example/indiafoss-companion/h/view-session?ref=k` are
     `unsupported`;
   - a handoff URL carrying `access_token` is rejected and the token never
     appears in the returned value;
   - a payload one byte over the limit is `oversized`, in both encodings, and
     the check happens before any parsing;
   - `indiafoss://something-unknown` is still `unsupported`.

## Acceptance

```bash
pnpm --filter @indiafoss/model test
just typecheck
just lint
just test
just check
```

All pass. `packages/model/src/scan.test.ts` must pass **without any test being
edited to accommodate the change** — if an existing assertion had to move, you
regressed a shipped scan path, which this task forbids.

Then the observable outcome, in a browser on `/scan`, using the manual entry
field so no camera is needed:

- `indiafoss://location/audi-1` still previews the location;
- `https://hanthor.github.io/indiafoss-companion/h/view-location?ref=audi-1&v=1` previews the _same_
  location;
- a scanned vCard still previews the contact with its signature verdict;
- a bare ticket id is still recognised as a ticket.

The negative cases — what must still fail, and must be demonstrated:

- `https://evil.example/h/open-dm?ref=@a:b&v=1` → the "not an IndiaFOSS
  location, contact card, chat link or ticket" error, not a DM preview;
- `https://hanthor.github.io.evil.example/indiafoss-companion/h/view-session?ref=keynote&v=1` →
  the same rejection (the allow list is exact-host, not suffix);
- a 9 KB payload → the oversized error;
- `https://hanthor.github.io/indiafoss-companion/h/open-dm?ref=keynote&v=1` (a session id where a
  user id belongs) → rejected, not a DM with nobody;
- `https://hanthor.github.io/indiafoss-companion/h/join-room?ref=%23a:b&v=1&access_token=secret` →
  the token must not survive into the returned value.

  Be precise about what "must not survive" means today. `parseHandoffUrl`
  copies only the known parameters (`v`, `ref`, `e`, `as`, `p`) into the
  candidate object, so a stray `access_token` query parameter never reaches
  `FORBIDDEN_FIELDS`: the handoff **parses successfully with the token
  silently dropped**. That is the currently pinned behaviour —
  `app-handoff.test.ts:68` asserts `expect(parseHandoffUrl(url)).not
.toHaveProperty('access_token')`, a drop, not a rejection.

  Strengthen it in this task: have `parseHandoffUrl` scan
  `url.searchParams` keys for the forbidden names and return `undefined` when
  one is present, so a credential-carrying link is refused rather than
  quietly cleaned up. A sender that puts a token in a handoff has a bug, and
  accepting the rest of the link hides it. Updating the existing
  drop-the-token case in `app-handoff.test.ts` into a rejection case is
  expected and allowed — the no-edit-the-tests rule above applies to
  `scan.test.ts`, which pins shipped scan behaviour. If you decide instead to
  keep the drop semantics, say so explicitly in the PR and leave that test
  alone; do not leave the two in disagreement.

Finally, confirm nothing new emits a handoff:

```bash
git diff --stat   # no change to toHandoffUrl callers or QR generation
```

## Out of scope

- **Do not decide the emitted encoding.** ADR 0009 open question 2 is the
  maintainer's; both encodings are accepted whatever the answer. Do not change
  `toHandoffUrl`, `encodeFriendPayload`, or any QR/poster generation.
- Do not add trust states or verification UI for imported contacts. Keeping a
  profile match from rendering as verified is **C-10** (#31, #188).
- Do not implement `IdentityBinding` verification or act on a `proof` field
  beyond carrying it. That is **C-12** and #188.
- Do not add room-resolution or room-joining behaviour for a `join-room`
  handoff. What a canonical room is, and what happens when it cannot be
  resolved, is **C-06** (#166).
- Do not port any of this to Kotlin. `AppHandoff` is explicitly excluded from
  the Kotlin conformance scope in **C-08**; the Chat side of link dispatch is
  Chat #28 and lives in `indiafoss-chat-android`.
- Do not touch `apps/web/src/routes/connect/+page.svelte`. It is the outbound
  side and calls no parser.
