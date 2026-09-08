# C-03 — An interrupted write cannot leave the Android app with no schedule

- Status: Ready
- Repository: indiafoss-companion
- Tracks: [#190](https://github.com/hanthor/indiafoss-companion/issues/190)
- Size: S

## Why this matters

The native Android Companion caches the event bundle to a single file and
overwrites it in place. If the process is killed, the device loses power, or
the disk fills while that write is in flight, the file is left truncated. The
next launch cannot parse it and falls back to the copy shipped in assets.

That fallback does exist, so the attendee is not left with nothing — but the
seed bundle is whatever the web client had published when the APK was built.
At the venue, offline, that can be a schedule months out of date, silently
replacing one the attendee had successfully refreshed. Nothing tells them the
app has fallen back, and nothing tries to recover the newer data.

## Context you need

The whole cache path is
[`apps/android/native/app/src/main/kotlin/org/indiafoss/companion/data/EventRepository.kt`](../../apps/android/native/app/src/main/kotlin/org/indiafoss/companion/data/EventRepository.kt),
87 lines. The two files it manages are declared at lines 23-24:

```kotlin
class EventRepository(
    private val context: Context,
    private val baseUrl: String = DEFAULT_BASE_URL,
    private val eventId: String = DEFAULT_EVENT_ID,
) {
    private val cacheFile: File get() = File(context.filesDir, "$eventId-bundle.json")
    private val revisionFile: File get() = File(context.filesDir, "$eventId-revision")
```

The read path, lines 27-34, falls back to the seeded asset:

```kotlin
    /** Cached bundle, or the copy shipped in assets on a first run. */
    suspend fun cached(): EventBundle? = withContext(Dispatchers.IO) {
        runCatching { bundleJson.decodeFromString<EventBundle>(cacheFile.readText()) }.getOrNull()
            ?: runCatching {
                context.assets.open("event-bundle.json").bufferedReader().use { reader ->
                    bundleJson.decodeFromString<EventBundle>(reader.readText())
                }
            }.getOrNull()
    }
```

There is no committed `apps/android/native/app/src/main/assets/` directory,
which is why a `find` for one comes back empty — but the asset is **generated
at build time** rather than checked in. `app/build.gradle.kts` copies the web
client's published bundle into the APK:

```kotlin
val copySeedBundle by tasks.registering(Copy::class) {
    from(rootProject.file("../../web/static/events/indiafoss-2025/event-bundle.json"))
    into(seedAssets)
}
// ...
sourceSets["main"].assets.srcDir(seedAssets)   // line 64
```

So the second `runCatching` succeeds and `cached()` returns the seed bundle.
The failure is a silent, possibly large regression in schedule freshness, not
an empty screen. Note the seed is pinned to `indiafoss-2025`; C-04 moves it.

The write path, lines 41-61:

```kotlin
    suspend fun refresh(): RefreshResult = withContext(Dispatchers.IO) {
        try {
            val manifest = bundleJson.decodeFromString<EventManifest>(
                get("$baseUrl/events/$eventId/manifest.json"),
            )
            val known = runCatching { revisionFile.readText().trim().toInt() }.getOrNull()
            if (known != null && manifest.revision <= known) return@withContext RefreshResult.UpToDate
            val asset = manifest.assets["event"]
            val url = if (asset != null) "$baseUrl/events/$eventId/$asset"
            else "$baseUrl/events/$eventId/event-bundle.json"
            val body = get(url)
            // Parse before writing: a malformed download must not evict a good cache.
            val bundle = bundleJson.decodeFromString<EventBundle>(body)
            val previous = cached()
            cacheFile.writeText(body)
            revisionFile.writeText(manifest.revision.toString())
            RefreshResult.Updated(bundle, manifest.revision, previous)
        } catch (error: Exception) {
            RefreshResult.Failed(error.message ?: "network error")
        }
    }
```

Two things to notice. The parse-before-write at lines 52-53 is already correct
and must be kept: a malformed download is rejected before anything is touched.
The problem is only the two `writeText` calls. `File.writeText` truncates the
target and then streams the new content, so between those two moments the file
on disk is neither the old bundle nor the new one. `revisionFile.writeText`
runs after it, so an interruption between the two also leaves a cache and a
revision marker that disagree.

The architecture is explicit
(`docs/architecture/system.md`, "Offline conference data and personal state"):

> Maintain one atomically accepted bundle/revision per event, a pending
> candidate, and last-check/error metadata. Validate and persist a candidate
> before advertising success. Keep the last good version after storage/network
> failures.

**Be honest about the evidence.** The review
(`docs/architecture/review-2026-09-07.md`, finding 3) says of exactly this:

> That last risk is code-inspected, not crash-reproduced here.

Nobody has produced a truncated cache on a real device. This is a correctness
fix for a failure mode that follows from the API being used, not a fix for a
reported field failure. Do not write a commit message or an issue comment
claiming a crash was reproduced. The test you add simulates the interruption;
say so.

## What to do

1. Extract the cache write into a function that takes the target directory,
   so it can be exercised on the JVM without an Android `Context`. The current
   shape derives `cacheFile` from `context.filesDir` inline, which is not
   reachable from a plain unit test. An injectable directory on the constructor
   (defaulting to `context.filesDir`) or a small file-writer collaborator both
   work. Pick the smaller change; do not restructure the repository class.

2. Replace the direct `cacheFile.writeText(body)` with a temp-file-and-rename:

   - write `body` to a sibling temp file in the **same directory** (rename is
     only atomic within one filesystem);
   - flush and sync it to disk before renaming, so a power loss cannot leave a
     renamed-but-empty file;
   - rename over `cacheFile`;
   - delete the temp file in a `finally` if any step failed, so a crashed
     refresh does not leave debris that accumulates.

3. Keep the parse-before-write. Validation happens on the downloaded body
   before the temp file is written, exactly as today.

4. Write `revisionFile` **only after** the bundle rename has succeeded. If the
   rename fails, the old bundle and the old revision must both survive, so the
   next refresh retries the same revision instead of believing it is applied.

5. Make the read path tolerate a bad file rather than returning nothing. If
   `cacheFile` fails to parse, and there is a `.bak` or previous-good copy,
   read that. The simplest durable shape: before the rename, move the current
   `cacheFile` aside to `$eventId-bundle.json.bak`, then rename the temp file
   into place, and have `cached()` try `cacheFile`, then the backup, then
   assets. Delete the backup only after a successful parse of the new file.

6. Make the fallback visible rather than silent. The seeded asset exists
   (`copySeedBundle` in `app/build.gradle.kts`), so falling back is survivable
   — but the attendee is shown a build-time schedule with nothing saying so.
   Have `cached()` report _which_ source it used, and surface a plain note when
   it is the seed rather than a refreshed cache. Keeping the seed in step with
   the published bundle is **C-04's** problem, not yours.

7. Tests under `apps/android/native/app/src/test/kotlin/`, alongside the
   existing `ScreenshotTest.kt`:
   - a successful refresh leaves a parseable cache and a matching revision;
   - a write interrupted after the temp file exists but before the rename
     leaves the previous cache byte-identical and the previous revision
     unchanged (simulate by making the rename fail, not by killing a process);
   - a cache file corrupted on disk still yields a bundle through the backup or
     asset fallback;
   - a malformed download leaves the existing cache untouched, which guards
     the behaviour already present at lines 52-53.

8. Run `just android-test`, which covers both `:core:test` and
   `:app:testDebugUnitTest`. See [Android testing](../android-testing.md) for
   JDK 21 and SDK setup; do not substitute the core-only gate for app validation.

## Acceptance

```bash
just android-test
```

Passes, and the run output visibly includes the new test class. Paste the real
output; a green run that never executed the tests is the exact failure mode
step 8 exists to prevent.

**Where the tests live, and why it matters.** Keep file-replacement logic in
`:core` (`AtomicFile.kt`) so `just android-core-test` can exercise it without
an SDK. App wiring still requires `just android-test` and the Android SDK.
Report local limitations plainly and require native CI before merge.

Negative case: make `writeFileAtomically` truncate the target before writing
the temp file, and confirm `a failed write leaves the previous contents
byte-identical` fails. Restore it.

```bash
just check
```

Must still pass. This task touches Kotlin and the Justfile only; if a web test
changes behaviour you have widened the task.

Observable outcome, on a device or emulator if one is available: install, let
it cache a bundle, force-stop during a refresh, relaunch, and confirm a
schedule is shown. Record this as a manual observation. If you cannot run it,
say so plainly rather than implying it passed.

## Out of scope

- The web client's equivalent defect, where valid data is dropped when the
  diff is empty, is **C-02**. Do not port that fix into Kotlin here.
- The web update latch and its triggers are **C-01**.
- Changing `DEFAULT_EVENT_ID` at line 78 away from `indiafoss-2025` belongs to
  **C-04**, which moves both clients to the real 2026 bundle together. Flipping
  it here would make C-04's diff unreviewable.
- Validating the manifest against the owned `EventManifest` contract is
  **C-07**. `EventRepository` already decodes `EventManifest` from
  `org.indiafoss.companion.core`; leave that binding as it is.
- Kotlin conformance against the shared golden fixtures is **C-08**. Your tests
  can use small hand-written JSON; do not introduce the fixture harness here.
- Do not add a database, WorkManager scheduling, or a background refresh
  service. Background refresh is explicitly opportunistic in the architecture
  and is not part of this task.
