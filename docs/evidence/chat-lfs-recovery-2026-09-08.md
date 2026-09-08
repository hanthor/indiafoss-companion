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
or coverage thresholds pass. Chat #44 stays open until that evidence is recorded.

This restores assets referenced by the current main tree. It does not assert
that every historical commit or pending PR has all of its distinct LFS objects.
It is not attachment-delivery, mesh reachability or physical-device evidence.
