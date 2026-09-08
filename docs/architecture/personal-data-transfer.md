# Personal data transfer

Tracks #240. The attendee must be able to start in the PWA and continue in native without redoing their choices. A contact vCard alone is not a personal-data backup.

## Current implementation

Both TypeScript and Kotlin resolve an event-scoped activity reference containing the local activity ID and, when available, the CFP proposal ID. Ten shared JSON scenarios exercise both implementations. Native event decoding now retains proposalId.

Resolution uses CFP identity first. A unique CFP match survives a recreated row. Repeated CFP entries require an exact occurrence ID; otherwise the result is ambiguous. Legacy references without CFP use the exact activity ID. References for another event are rejected. Missing/ambiguous references stay available for review and later retry.

This is a prerequisite, not a shipped export/import flow. The file codec, storage adapters and attendee UI remain to implement.

## Versioned file design

Use one JSON document with format `indiafoss-personal-data`, integer `schemaVersion: 1`, export time, and separately scoped event records. Each event record carries its activity-reference table and personal sections:

- Preferences: dispositions, bookmarks, ratings, comparison counts and triage answers.
- Comparison history and devroom preferences, including whole-devroom reservations.
- Notes and plan edits: locks, removals, replacements and custom blocks. Resolve every referenced activity, including both sides of comparisons/replacements.
- Contact profile and explicit sharing selection, separate from event preferences.

The exporter reads an explicit allowlist of personal stores. Never dump all settings or databases: Matrix tokens, sessions, message caches, outbound messages and device signing/encryption keys are outside the format. Public identity strings must not be treated as proof that the destination possesses their keys.

A newer major version must be rejected before any write. Unknown optional sections must survive round-trip export even if a client cannot display them. Fields supported only on one platform, particularly notes, must not disappear when passing through another.

## Import transaction and preview

1. Read and validate the entire bounded file before mutation.
2. Resolve event and activity identities against the destination programme. Report unresolved references separately; never guess from titles or times.
3. Preview counts of new, existing/conflicting and unresolved records. Default to keeping existing destination records, including explicit negative choices. Never automatically enable contact sharing.
4. Commit only after the attendee confirms. Keep unresolved records for a later schedule refresh and re-export.
5. Reload reactive state from the committed result before reporting success.

PWA writes can use one IndexedDB transaction. Native currently splits personal state across DataStores; implementing a file picker alone would leave partial-import risk. Its adapter needs a durable import journal and a recovery gate, or a unified personal-state repository, before the UI can claim completion. Test interruption between writes and restart recovery. A failed or cancelled import must leave the prior personal state usable.

## Delivery checks

- Codec rejects malformed/new-major files and oversized input; valid files round-trip.
- Export omits credentials and device keys even when they exist in source storage.
- PWA to native and native to PWA preserve all supported fields and unknown optional sections.
- Changed schedule IDs, repeated CFP occurrences and event-year mismatch use the shared resolution cases.
- Existing destination choices win by default; negative choices and sharing-off states remain explicit.
- Real file-picker/export flows cover preview, cancel, confirm, reload and retry.
- CI and relevant mobile screenshots must pass before merging each implementation slice. Keep #240 open until both app entry points and cross-platform round-trip tests are complete.
