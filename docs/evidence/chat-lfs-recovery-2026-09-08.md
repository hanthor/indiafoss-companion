# Chat Git LFS recovery — 8 September 2026

Repository: hanthor/indiafoss-chat-android, main
`02c6a2410374b67a43807383c9d0d60dc3a103ca`.
Tracking: [Chat #44](https://github.com/hanthor/indiafoss-chat-android/issues/44).

The Test workflow failed at LFS checkout before Gradle ran. Its log reports
HTTP 404 for referenced objects in the fork's LFS storage. The current tree
references 4,083 LFS paths, including screenshot baselines and media-upload test
fixtures. These assets were retained, not replaced with newly generated baselines.

## Recovery

A separate clean checkout fetched the exact referenced objects from
`element-hq/element-x-android`. The existing local Chat checkout was untouched.

Local object verification:

```text
git lfs fsck --objects
Git LFS fsck OK
```

A normal `git lfs push origin HEAD` skipped already-known Git refs and did not
repair all missing objects. A subsequent fresh-cache fetch exposed 1,015 missing
objects; the premature second test attempt still failed at checkout. The explicit
upload was:

```text
git lfs push --all origin HEAD
Uploading LFS objects: 100% (3732/3732), 190 MB | 277 KB/s, done.
```

A separate LFS cache then fetched from **the fork**, followed by object integrity
verification:

```text
git -c lfs.storage=../chat-lfs-origin-verification lfs fetch origin HEAD
Fetching reference refs/heads/main
git -c lfs.storage=../chat-lfs-origin-verification lfs fsck --objects
Git LFS fsck OK
```

Git LFS checks the objects against the SHA-256 IDs in the existing pointers.
No tracked application files, workflow gates, screenshot references or Neutrino
pins changed. Only the fork's missing LFS objects were restored.

## CI and limits

[Test run, attempt 3](https://github.com/hanthor/indiafoss-chat-android/actions/runs/34195657764/attempts/3)
was restarted after verification. Its result must be assessed separately: repaired
asset availability does not establish that Gradle, unit tests, screenshot tests
or coverage thresholds pass. The subsequent completed gate is recorded below.

Follow-up execution evidence:

- Attempt 3 passed LFS checkout and failed Kotlin test compilation in
  `DiffCacheTest`: the interface has `indices()`, while the test used `indices`.
- [PR #55](https://github.com/hanthor/indiafoss-chat-android/pull/55) repairs those
  two assertions. Its [first run](https://github.com/hanthor/indiafoss-chat-android/actions/runs/34240824973)
  passed compilation and reached `:appnav:testDebugUnitTest`: 66 of 67 tests passed.
- The remaining assertion expected `%21abc%3Ahs` rather than Android's valid
  `!abc%3Ahs` permalink encoding. PR #55 corrects the expected string without
  altering room-join behaviour. Later failures and their repairs are recorded below.

## Completed execution gate — 9 September

[PR #55](https://github.com/hanthor/indiafoss-chat-android/pull/55) merged at
`952b87a9b06d3d16a6a1d70e3e89ab328c997a34` after all 14 checks passed. Beyond the
first two repairs above, it updates an enterprise localhost expectation,
waits for settled asynchronous capture states and adds/updates 66 reviewed
screenshot baselines. The Chat repository's
`docs/indiafoss/snapshot-recovery-2026-09-08.md` records the source run and hashes.
These were baseline repairs after exact LFS restoration, not substitute LFS objects.

[Main run 34291085872](https://github.com/hanthor/indiafoss-chat-android/actions/runs/34291085872)
completed successfully: the full unit/screenshot/coverage command reported
`BUILD SUCCESSFUL in 34m 52s`, with 7359 actionable tasks, 5225 executed and
2134 from cache. Chat #44 is closed. Chat #20 is also closed after checking the
merged DiffCache invariants and confirming the androidutils test task executed.
The successful run predates report-retention changes and has no uploaded test
report archive; its execution evidence is the workflow log, not an invented artifact.

This restores assets referenced by the current main tree. It does not assert
that every historical commit or pending PR has all of its distinct LFS objects.
It is not attachment-delivery, mesh reachability or physical-device evidence.
