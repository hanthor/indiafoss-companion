# C-08 — The Android app rejects exactly what the web app rejects

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [ADR 0009](../adr/0009-versioned-contracts-and-golden-fixtures.md)
- Size: M

## Why this matters

The same manifest and the same contact card are parsed twice — once in
TypeScript, once in Kotlin — by two hand-written implementations that nothing
compares. The failure mode is quiet: the web app accepts a published manifest
and the Android app silently ignores it, or Android accepts a malformed
contact card the web app refused. Nobody finds out from a test; somebody finds
out from an attendee whose phone never updated.

This task turns that class of divergence into a failing build, and the failure
names the exact case.

## Context you need

ADR 0009 decided that the golden fixtures are the cross-language contract:

> Laid out as `fixtures/<contract>/{valid,invalid}/<case>.json`, with a
> machine-readable `fixtures/index.json` listing every case and, for invalid
> cases, the substring each expected issue message must contain. The index is
> the contract between platforms: a Kotlin or Swift conformance test reads the
> same JSON files and asserts the same accept/reject outcomes, without needing
> to parse TypeScript or agree on exact message wording.

and named this as follow-up work rather than part of the decision:

> The Kotlin core should gain a conformance test over the same fixtures. That
> is task work, not part of this decision.

### The fixture index

`packages/test-fixtures/fixtures/index.json` is a JSON object keyed by contract
name (`event-manifest`, `conference-directory`, `contact-card`,
`identity-binding`, `app-handoff`, `capability-record`), each with `valid` and
`invalid` arrays. An entry looks like:

```json
{
  "file": "zero-revision.json",
  "describes": "revision must be a positive integer",
  "expectIssue": "revision must be a positive integer"
}
```

`expectIssue` is present on invalid cases only. **It is a substring**, not an
equality check — this is the whole point. The TypeScript runner
(`packages/model/src/contracts/conformance.test.ts`) asserts:

```ts
expect(
  issues.some((issue) => issue.includes(fixture.expectIssue ?? '')),
  `expected an issue containing ${JSON.stringify(fixture.expectIssue)}, got ${JSON.stringify(issues)}`,
).toBe(true);
```

So the Kotlin validator's messages may be worded differently, translated
differently, or carry a different path prefix — they only have to _contain_ the
substring. That is a real constraint on the Kotlin messages you will write:
`event-manifest/zero-revision.json` requires a Kotlin issue containing
`revision must be a positive integer`, and `contact-card/insecure-link.json`
requires one containing `must be https: or mailto:`. Read the substrings out
of `index.json` and write the Kotlin messages to satisfy them, rather than
inventing messages and then editing the shared index — editing the index
changes what every platform is held to.

### What Kotlin has today

The module is `apps/android/native/core`, Gradle project `:core`, package
`org.indiafoss.companion.core`. Main sources live in
`apps/android/native/core/src/main/kotlin/org/indiafoss/companion/core/` and
are: `Affinity.kt`, `Calendar.kt`, `Handshake.kt`, `Itinerary.kt`, `Model.kt`,
`ProfileImport.kt`, `Ranking.kt`, `Reminders.kt`, `Routing.kt`, `Schedule.kt`,
`ScheduleDiff.kt`, `Search.kt`, `VCard.kt`.

`Model.kt` has **no validator functions at all**. It declares `@Serializable`
data classes and one lenient reader:

```kotlin
/** Lenient reader: the bundle carries fields this client does not model yet. */
val bundleJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}
```

It already declares an `EventManifest(schemaVersion, eventId, revision,
generatedAt, assets)` data class — a third structural copy of the format, with
no validation and no `supersedes`. `VCard.kt` declares a _different_
`ContactCard` data class (`fullName`, `organization`, `email`, `phone`,
`website`, `fossUnitedUsername`, `matrixId`, `avatarUrl`, `ticketRef`,
`socials`, `share`) with `VCard.parse(text: String): ContactCard?` — that is
the vCard wire format, **not** the `ContactCard` contract envelope in
`packages/model/src/contracts/contact-card.ts`. Do not conflate them; the
contract type is a new type, and the name collision needs resolving (see step
2).

So: **the Kotlin validators for these contracts do not exist yet, and writing
them is part of this task.** Be honest about that in the PR description.

### Tests, build and how a test finds the repository root

Tests live in
`apps/android/native/core/src/test/kotlin/org/indiafoss/companion/core/` —
`AffinityTest.kt`, `CalendarTest.kt`, `HandshakeTest.kt`, `ItineraryTest.kt`,
`ProfileImportTest.kt`, `RankingTest.kt`, `RemindersTest.kt`, `RoutingTest.kt`,
`ScheduleDiffTest.kt`, `ScheduleTest.kt`, `SearchAndVCardTest.kt`.

The framework is `kotlin.test` (`import kotlin.test.Test`,
`assertEquals`/`assertTrue`/`assertNull`) running on the JUnit 5 platform. The
house style is backtick-quoted test names, e.g.

```kotlin
fun `a signed card verifies, a tampered one does not, a plain one is unsigned`()
```

`apps/android/native/core/build.gradle.kts` in full:

```kotlin
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}
java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
kotlin { compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) } }
dependencies {
    implementation(libs.kotlinx.serialization.json)
    testImplementation(libs.kotlin.test)
}
tasks.test { useJUnitPlatform() }
```

JSON is **kotlinx-serialization** (`kotlinx-serialization-json`), not
`org.json`. For fixture loading you want `Json.parseToJsonElement(text)` and
the `JsonObject` / `JsonPrimitive` tree API, because the validators take
untrusted input and must not require a deserializable shape — the same reason
the TypeScript validators take `unknown` rather than the interface type.

Two things about paths:

- **No `src/test/resources` directory exists anywhere under
  `apps/android/native`**, and no existing `:core` test reads a file from
  disk. Every current test builds its data in code. You are adding the first
  disk-reading test in this module.
- The Gradle root project is `apps/android/native` (its `settings.gradle.kts`
  sets `rootProject.name = "indiafoss-native"` and includes `:core` and
  `:app`), which is **not** the repository root. From
  `apps/android/native/core` the repository root is four levels up.

Resolve the root explicitly rather than relying on the working directory. The
robust form, mirroring what `packages/test-fixtures/src/index.ts` does in
TypeScript (walk up to the `pnpm-workspace.yaml` marker):

```kotlin
private fun repoRoot(): File {
    var dir = File(".").absoluteFile
    repeat(10) {
        if (File(dir, "pnpm-workspace.yaml").exists()) return dir
        dir = dir.parentFile ?: return@repeat
    }
    error("could not find the repository root from ${File(".").absolutePath}")
}
```

Optionally back it with an explicit build-side property so an IDE runner with a
different working directory still works:

```kotlin
// apps/android/native/core/build.gradle.kts
tasks.test {
    useJUnitPlatform()
    systemProperty("repoRoot", rootProject.projectDir.parentFile.parentFile.parentFile.absolutePath)
}
```

(`native` → `android` → `apps` → repository root.) Prefer the system property
when set and fall back to the marker walk.

### Scope: two contracts, not six

Kotlin does not read a `CapabilityRecord`, an `IdentityBinding` or an
`AppHandoff` today, and writing validators for formats the app never parses is
speculative work with no caller. Scope this task to the two the Android app
actually needs:

- **EventManifest** — `Model.kt` already declares it and the app fetches
  manifests to decide whether its cached bundle is stale.
- **ContactCard** — the contract envelope, which is the format the QR/contact
  path is moving to.

The fixture directories for the other four stay in place and stay covered by
the TypeScript runner. The Kotlin runner must skip them **explicitly and
loudly** — a hard-coded map of the contracts it implements, so an unimplemented
contract is a visible gap rather than a silent zero-case pass.

## What to do

1. Add `apps/android/native/core/src/main/kotlin/org/indiafoss/companion/core/Contracts.kt`
   (package `org.indiafoss.companion.core`) with the Kotlin ports:

   ```kotlin
   const val EVENT_MANIFEST_SCHEMA_VERSION = 1
   const val CONTACT_CARD_SCHEMA_VERSION = 1

   fun collectEventManifestIssues(value: JsonElement?): List<String>
   fun collectContactCardIssues(value: JsonElement?): List<String>
   ```

   Mirror the TypeScript structure so the two stay comparable: a
   `schemaCompatibility(value, supported)` helper with the same
   `supported` / `forward` / `unsupported` outcomes, plus `requireString`,
   `optionalString`, `requireInstant`, `requireLiteral`, `requireArray` and
   `collectDuplicates` equivalents. The reference is
   `packages/model/src/contracts/common.ts`,
   `packages/model/src/contracts/event-manifest.ts` and
   `packages/model/src/contracts/contact-card.ts`. Port the rules, not the
   prose.

   Rules that are easy to miss and are covered by fixtures:

   - a **newer** major `schemaVersion` is rejected with a message containing
     `newer than the supported version`, and rejection must never discard the
     last good value;
   - `revision` must be a positive integer;
   - `assets` must be non-empty and every filename must match
     `^[A-Za-z0-9._-]+$` — a path separator would let a manifest point outside
     the published directory (`must be a plain filename`);
   - `generatedAt` must parse as a timestamp (`must be an ISO-8601 timestamp`);
   - on a card: `profile` is required even when empty
     (`profile must be an object`), duplicate account ids are rejected
     (`duplicate account id`), `expiresAt` must be after `issuedAt`, a claim
     marked `mesh` must be an `@n:` identity
     (`marked mesh but is not an @n: identity`), `trust` must be one of the
     five literals (`trust must be one of`), and a profile link must be
     `https:` or `mailto:`.

   Also port `supersedes(candidate, current)` — forward-only, same `eventId`
   — so the Android update path has the same comparison rule the publisher and
   the PWA use.

2. Resolve the `ContactCard` name collision. `VCard.kt` already owns that name
   for the vCard shape. Either name the contract type `ContactCardEnvelope`,
   or keep validation purely on the `JsonElement` tree and declare no data
   class at all. Validating the tree is sufficient for this task and avoids
   the collision entirely — prefer it unless you have a caller that needs the
   typed value.

3. Add
   `apps/android/native/core/src/test/kotlin/org/indiafoss/companion/core/ContractConformanceTest.kt`.
   It must:

   - resolve the repository root as described above;
   - read `packages/test-fixtures/fixtures/index.json` with
     `Json.parseToJsonElement`;
   - for each implemented contract, read every `valid/<file>.json` and assert
     the validator returns an empty list; read every `invalid/<file>.json` and
     assert the list is non-empty **and** that at least one issue _contains_
     the case's `expectIssue` substring;
   - fail with a message naming the contract, the file and the `describes`
     text, so a failure reads like the TypeScript one;
   - assert that the index actually contains the contracts it claims to cover
     and that each has at least one valid and one invalid case — a runner that
     silently finds zero cases passes and proves nothing;
   - assert explicitly which contracts are unimplemented, from a named
     constant, so adding Kotlin support for a third contract is a one-line
     change and forgetting one is visible.

4. Add the `systemProperty("repoRoot", …)` line to
   `apps/android/native/core/build.gradle.kts` if you use it. No new
   dependency is needed — `kotlinx-serialization-json` is already on the
   module's classpath, and `kotlin-test` is already the test dependency.

5. Do **not** change any fixture file or `index.json`. If a Kotlin validator
   cannot satisfy an `expectIssue` substring, that is either a porting bug or a
   genuine contract question — fix the Kotlin, or raise it on ADR 0009. Editing
   the shared index to make Kotlin pass defeats the entire mechanism.

## Acceptance

```bash
just android-test
```

Passes, and its output lists one test per fixture case for the implemented
contracts. Note that `just check` does **not** run the Android tests — the
Justfile's `check` recipe is `format-check lint typecheck test verify-assets
build` — so `just android-test` has to be run explicitly, and the PR must
paste its real output.

The TypeScript side must be unchanged and still green:

```bash
just test
just check
```

The negative case — what must still fail. Flip one verdict and confirm both
runners break the same way:

```bash
cp packages/test-fixtures/fixtures/event-manifest/invalid/zero-revision.json /tmp/case.bak
# edit the copy in place: change "revision": 0 to "revision": 1
just android-test        # must FAIL: no issue contains "revision must be a positive integer"
just test                # must FAIL for the same case, in conformance.test.ts
cp /tmp/case.bak packages/test-fixtures/fixtures/event-manifest/invalid/zero-revision.json
```

Both failing on the same case is the evidence that the two implementations are
now held to one contract. If only one fails, the Kotlin runner is not reading
the case you think it is.

Do the same in the other direction: hand-break one rule inside `Contracts.kt`
(drop the positive-integer check) and confirm `just android-test` fails. A
conformance test that passes against a validator with a rule removed is
testing nothing.

## Out of scope

- Do not port `ConferenceDirectory`, `IdentityBinding`, `AppHandoff` or
  `CapabilityRecord` to Kotlin. Nothing in the Android app reads them yet.
  `ConferenceDirectory` publishing and consumption is **C-06**;
  `IdentityBinding`'s cryptography is **C-12** and #188; handoff parsing is
  **C-09**; capability records are **C-11**.
- Do not add or edit fixture files. Contract changes come with their fixtures
  in the task that changes the contract.
- Do not wire the new validators into `EventRepository` or any Android runtime
  path in this change. The atomic bundle write and the update path are
  **C-03**; adding validation there on top of a new port would make both
  unreviewable.
- Do not touch `tools/event-sync`. Its adoption of the owned type is **C-07**.
- No Swift. `docs/architecture/ios.md` gates that, and ADR 0009 explicitly
  does not authorize it.
