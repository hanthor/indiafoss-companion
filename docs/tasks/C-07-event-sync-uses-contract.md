# C-07 — The publisher and the client agree on what a manifest is

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [ADR 0009](../adr/0009-versioned-contracts-and-golden-fixtures.md)
- Size: S

## Why this matters

`tools/event-sync` writes the file every attendee's app fetches to decide
whether its schedule is stale. It currently writes that file against a private
copy of the format, declared inside the tool, and never validates what it
wrote. A publish that emits a malformed manifest — a bad timestamp, an asset
name with a path separator, a revision that went backwards — is discovered by
attendees rather than by the publisher.

The owning definition now exists. Using it is a small change that makes a bad
publish fail at the publisher, on the maintainer's laptop, before the file
reaches a phone on venue Wi-Fi.

## Context you need

ADR 0009 decided that every cross-boundary format has exactly one owning
module in `packages/model/src/contracts/`, and it names this tool as the
follow-up:

> `tools/event-sync` should import `EventManifest` from `@indiafoss/model`
> instead of declaring it structurally.

### The duplicate declaration

[`tools/event-sync/src/index.ts:35`](../../tools/event-sync/src/index.ts)
declares its own type:

```ts
export interface EventManifest {
  schemaVersion: number;
  eventId: string;
  revision: number;
  generatedAt: string;
  sourceUpdatedAt?: string;
  assets: Record<string, string>;
}
```

The owned type is
[`packages/model/src/contracts/event-manifest.ts:28`](../../packages/model/src/contracts/event-manifest.ts).
It is a superset: it adds `timezone?` and `bundleDigest?`, and it documents why
each field exists. The tool's copy is structurally compatible today, which is
exactly why the drift is dangerous — nothing announces the day they diverge.

### Where the tool trusts without checking

Three reads cast straight to the type with no validation:

```ts
const prev = JSON.parse(readFileSync(manifestPath, 'utf8')) as EventManifest; // line 88
const prevManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as EventManifest; // line 102
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as EventManifest; // line 187
```

A `as` cast is not a check. If `events/<id>/published/manifest.json` has been
hand-edited or truncated, line 88 produces `prevRevision = undefined` and the
next revision becomes `NaN`.

And the write hard-codes the version rather than naming it (line 155):

```ts
const manifest: EventManifest = {
  schemaVersion: 1,
  eventId,
  revision,
  generatedAt: new Date().toISOString(),
  …
```

### The comparison rule already exists

Do not write a revision comparison by hand. The contract exports one:

```ts
export function supersedes(candidate: EventManifest, current: EventManifest | undefined): boolean {
  if (!current) return true;
  if (candidate.eventId !== current.eventId) return false;
  return candidate.revision > current.revision;
}
```

It is forward-only and event-scoped on purpose: a stale cache or a replayed
response must never roll a client — or a publisher — backwards.

### The test that already guards this

[`packages/model/src/contracts/event-manifest.test.ts:39`](../../packages/model/src/contracts/event-manifest.test.ts)
walks `events/` and asserts that **every** published manifest on disk
validates:

```ts
it(`validates ${path.replace(eventsDir, 'events')}`, () => {
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
  expect(collectEventManifestIssues(manifest)).toEqual([]);
});
```

So if this change makes the tool emit something the contract rejects, that
test fails. You do not need to invent a regression test for the write path;
you need to not break the one that exists.

## What to do

1. In `tools/event-sync/src/index.ts`, delete the local `interface
EventManifest` (line 35) and import the owned type and helpers instead:

   ```ts
   import {
     EVENT_MANIFEST_SCHEMA_VERSION,
     collectEventManifestIssues,
     supersedes,
   } from '@indiafoss/model/contracts';
   import type { EventManifest } from '@indiafoss/model/contracts';
   ```

   That subpath already exists — `packages/model/package.json` declares
   `"./contracts": "./src/contracts/index.ts"` — so no packaging change is
   needed. `event-sync` currently `export`s its `EventManifest`; keep an
   export of that name so any existing importer of the tool keeps working, but
   make it a re-export of the owned type rather than a redeclaration.

2. Use `EVENT_MANIFEST_SCHEMA_VERSION` instead of the literal `1` at line 155.

3. Validate before writing. Immediately before the `writeFileSync` at line 164:

   ```ts
   const issues = collectEventManifestIssues(manifest);
   if (issues.length > 0) {
     throw new Error(`refusing to publish an invalid manifest:\n  ${issues.join('\n  ')}`);
   }
   ```

   Throwing is right here: `main()` already catches and sets `process.exitCode
= 1`. A publish that cannot produce a valid manifest must not leave a
   half-written `published/` directory that looks successful.

4. Validate on read too. At lines 88, 102 and 187, replace the `as
EventManifest` casts with a small local helper that parses, runs
   `collectEventManifestIssues`, and throws with the file path and the issue
   list when it fails. The read at line 187 is inside `publishEvent`, which
   then indexes `manifest.assets['event']!` — a validated manifest is what
   makes that `!` honest.

5. Use `supersedes()` for the revision decision rather than comparing numbers
   inline. The tool computes `revision = prevRevision + 1` (line 113); after
   building the new manifest, assert it supersedes the previous one and throw
   if it does not. That turns a corrupted or hand-edited previous revision into
   a loud failure instead of a silent `NaN`.

6. Do **not** start emitting `timezone` or `bundleDigest` in this task. The
   bundle does carry a `timezone` (`packages/model/src/index.ts:154`, "IANA
   timezone, e.g. `Asia/Kolkata`"), so emitting it is a reasonable next step —
   but it changes the published bytes for every event and belongs with the
   publish work in **C-04**, not with a type swap. Both fields are optional in
   the contract, so omitting them stays valid.

## Acceptance

```bash
just typecheck
just lint
pnpm --filter @indiafoss/model test
pnpm --filter @indiafoss/event-sync test
```

All pass. `pnpm --filter @indiafoss/model test` must include the
`published manifests on disk` block from `event-manifest.test.ts` and it must
be green — that is the proof the tool's output still matches the contract.

Then a real sync, which must not change the published bytes:

```bash
git status --porcelain events/
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync indiafoss-2025
git diff --stat events/indiafoss-2025/published/
```

The sync prints `no changes for indiafoss-2025 (rev 3 unchanged)` and
`git diff` is empty. A type swap that renumbers a revision is not a type swap.

The negative case — what must still fail:

```bash
cp events/indiafoss-2025/published/manifest.json /tmp/manifest.bak
# now hand-edit events/indiafoss-2025/published/manifest.json — NOT the /tmp
# backup — and set "revision": 0
pnpm --filter @indiafoss/event-sync exec tsx src/index.ts sync indiafoss-2025
```

This must exit non-zero and print an issue naming `revision must be a positive
integer` — not proceed to write a new revision. Restore the file afterwards
(`cp /tmp/manifest.bak events/indiafoss-2025/published/manifest.json`) and
confirm `git status` is clean before you finish.

## Out of scope

- Do not change the manifest's published content — no new fields, no
  `bundleDigest`, no `timezone`. Publishing the real 2026 data and whatever
  fields it needs is **C-04**.
- Do not touch the web app's fetch path in `apps/web/src/lib/event.svelte.ts`
  or `apps/web/src/lib/updates.svelte.ts`. The client-side latch is **C-01**,
  and adopting the validator there would hide C-01's regression test.
- Do not add the directory asset to the manifest. That is **C-06**.
- Do not port anything to Kotlin. Kotlin conformance is **C-08**.
- Do not touch `tools/matrix-rooms`, which reads bundles rather than manifests.
