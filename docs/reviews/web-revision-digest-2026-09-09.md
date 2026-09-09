# PWA revision integrity — 9 September 2026

Tracks #190. The updater now checks SHA-256 over the exact downloaded UTF-8 bytes against the event asset named by the manifest. The same check applies to the hashless fallback after a missing immutable asset. A valid-looking but mismatched bundle cannot advance the saved revision or replace the current schedule, and the same revision remains retryable. The initial seed download also rejects another event or an unsupported bundle schema before writing to IndexedDB.

This uses the publisher's existing eight-hex digest naming convention. It detects incorrect or corrupt content; it is not a signed publisher identity. No revision or bundle is written until identity, schema and association checks pass.

Validation:

- 85 web unit tests pass, including exact-byte/UTF-8 matching, rejection of mutable or non-local asset names, and the actual published IndiaFOSS 2026 artifact.
- 46 browser tests pass, including immutable-asset and fallback mismatches with successful retry, invalid initial event/schema with retry, metadata-only adoption, reinstatement, failed atomic storage, and service-worker offline/reconnect preservation of all seeded personal records.
- Existing browser publication fixtures now compute actual content hashes instead of using placeholder filenames.
- Web check, lint and build pass. Four existing unrelated Svelte warnings remain.
- Reviewed the [mobile mismatch state](web-revision-digest-2026-09-09/mobile-mismatch.png): the stored revision and retry action remain visible and readable.

Full CI remains the merge gate. Native cache replacement and reinstatement are covered independently by PR #251 and its core/repository tests.
