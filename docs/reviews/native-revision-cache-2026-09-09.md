# Native schedule cache recovery — 9 September 2026

Tracks #190. Native now stores the manifest and exact event body in one atomic cache record. A revision is known only when that record can be read and validated. The old bundle-only cache remains a fallback, but its separate revision stamp is never trusted. Falling back to the APK seed likewise cannot suppress a refresh because of an unrelated high stamp.

Before adoption the client checks manifest event/version/revision/timestamp, requires a hash-addressed event filename, compares its SHA-256 prefix with the downloaded UTF-8 body, and validates the bundle event/schema. The content digest detects wrong or corrupt assets; publisher authenticity still depends on the HTTPS origin. A slower older download cannot overwrite a newer committed revision. Metadata-only revisions are persisted, and reinstated sessions now appear explicitly in the native diff.

The file helper flushes bytes before atomic replacement, uses unique sibling temporary files, and fails safely when atomic replacement is unavailable. It no longer deletes the previous target as a fallback. This protects process-interruption recovery; it does not claim a directory rename survives sudden device power loss or replace the real-device rehearsal.

Tests added:

- Core: restart after metadata-only/reinstated updates, interruption before and after rename, corrupt-cache fallback/retry, ignored stale stamps and incomplete files, out-of-order adoption, wrong event/schema/digest/path rejection, and the actual published asset/digest convention. Attendee data remains unchanged.
- Repository: HTTP boundary tests exercise corrupt legacy cache plus high revision stamp, APK-seed fallback, refresh/restart/no redundant asset fetch, and wrong bytes followed by a successful retry of the same revision.
- Existing atomic-write failure test now forces replacement failure after complete temporary bytes are written, asserting the prior file remains byte-identical and the temporary file is cleaned up.

No local JDK/SDK is available. Kotlin execution and Android validation run in CI; do not infer a pass from source inspection. All four CI gates passed in run 34299563987, including the core/repository tests and Android emulator. PWA asset-digest verification followed in PR #252. Physical-device rehearsal remains part of #191 and the readiness gates.
