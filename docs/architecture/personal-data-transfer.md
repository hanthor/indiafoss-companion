# Personal data transfer

Tracks #240. The attendee must be able to start in the PWA and continue in native without redoing their choices. A contact vCard alone is not a personal-data backup.

## Current implementation

Both TypeScript and Kotlin resolve an event-scoped activity reference containing the local activity ID and, when available, the CFP proposal ID. Ten shared JSON scenarios exercise both implementations. Native event decoding now retains proposalId.

Resolution uses CFP identity first. A unique CFP match survives a recreated row. Repeated CFP entries require an exact occurrence ID; otherwise the result is ambiguous. Legacy references without CFP use the exact activity ID. References for another event are rejected. Missing/ambiguous references stay available for review and later retry.

The version-1 transport codec is implemented in both languages. It validates the envelope, unique event/activity references, canonical UTC export timestamp, a 5 MiB UTF-8 limit and maximum nesting of 64. Shared fixtures cover valid files, unknown fields and rejection cases. Unknown optional JSON sections survive decoding and encoding.

The PWA Settings page can export personal data from one consistent IndexedDB read transaction. It projects an explicit allowlist of personal record fields, including private contact fields regardless of the contact card's sharing selection, and booth-visit preferences keyed by stable booth ID. Credentials, device keys, chat caches, scanned contacts, passport stamps and general device settings are excluded.

The PWA Settings page can also import such a file, offline, from a file picker. `@indiafoss/storage` validates every supported section after envelope decoding (finite numbers, enumerations, calendar days and timestamps, declared activity references, unique records) and reports unsupported sections without applying them. The planner resolves each activity reference through the shared CFP/occurrence contract and lists additions, conflicts with existing device data and unresolved, unassigned or unknown-event records; conflicts are unticked by default so current choices, including explicit negative ones, are kept. Apply runs in one IndexedDB write transaction that re-reads every previewed value first; any record changed since the preview aborts the whole import and Dexie rolls back. After a commit the preference, comparison, plan-edit, room, saved-plan and contact caches reload from storage and the plan projection is invalidated, which re-arms reminders from the imported plan.

This is not yet a complete migration flow. Native export, the native import adapter (which still needs a durable journal or unified personal-state repository) and its attendee UI remain to implement. Unresolved and unassigned records are shown in the preview but are not stored on the destination; the attendee keeps the file and retries after a programme update.

## Versioned file design

The transport uses one JSON document with format `indiafoss-personal-data`, integer `schemaVersion: 1`, export time (for example `2026-09-09T00:00:00.000Z`), and separately scoped event records. Each event record has `eventId`, an `activities` reference table, and a `sections` object. Device-independent contact data is carried in an optional top-level `contact` object.

Section record schemas must be validated by their owning import adapters; envelope decoding deliberately preserves unsupported optional sections. The PWA exporter currently writes:

| Location                                   | Contents                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `events[].sections.preferences`            | Activity ID, rating, comparison count, disposition, bookmark and optional triage answer              |
| `events[].sections.comparisons`            | Comparison ID, both activity IDs, score and creation time                                            |
| `events[].sections.notes`                  | Activity ID, note body and update time                                                               |
| `events[].sections.plans`                  | Day, locked/removed IDs, both sides of replacements and custom blocks                                |
| `events[].sections.resolvedPlans`          | Last saved activity IDs per day; recompute against the destination schedule before using             |
| `events[].sections.itinerary`              | Legacy saved itinerary activity IDs and generation time                                              |
| `events[].sections.rooms` / `roomsDecided` | Devroom preferences (including `stay`), IDs skipped by the room choice and onboarding decision state |
| `events[].sections.boothVisits`            | Planned visit minutes per stable booth ID; `null` records an explicit cancellation                   |
| `contact.profile` / `contact.selection`    | Allowlisted contact fields/socials and the explicit sharing selection                                |
| `unassigned`                               | Legacy preferences, notes, comparisons and booth visits whose event cannot be uniquely determined    |

Every event-scoped activity reference used by these sections is included in the event's reference table, with CFP proposal identity when present in the cached programme. Custom-block IDs remain local plan IDs. Plan keys explicitly retain their event even if the programme has been removed.

Legacy preferences, notes and comparisons have no event ID in IndexedDB. They are scoped only when all referenced activities belong uniquely to the same cached event. Removed IDs, IDs shared by cached events and cross-event comparisons go into `unassigned`; never discard them or infer the year from the ID/title. Importers must preserve this optional section for re-export and require an explicit event-resolution flow before applying it. Native's codec already preserves it, but native storage does not apply it yet.

The required personal sections are:

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

The PWA importer implements steps 1 to 5 (`previewPersonalDataImport` / `applyPersonalDataImport` in `@indiafoss/storage`, wired to Settings by `apps/web/src/lib/personal-data-import.svelte.ts`). Native currently splits personal state across DataStores; implementing a file picker alone would leave partial-import risk. Its adapter needs a durable import journal and a recovery gate, or a unified personal-state repository, before the UI can claim completion. Test interruption between writes and restart recovery. A failed or cancelled import must leave the prior personal state usable.

## Delivery checks

- Codec rejects malformed/new-major files and oversized input; valid files round-trip.
- Export omits credentials and device keys even when they exist in source storage.
- PWA to native and native to PWA preserve all supported fields and unknown optional sections.
- Changed schedule IDs, repeated CFP occurrences and event-year mismatch use the shared resolution cases.
- Existing destination choices win by default; negative choices and sharing-off states remain explicit.
- Real file-picker/export flows cover preview, cancel, confirm, reload and retry.
- CI and relevant mobile screenshots must pass before merging each implementation slice. Keep #240 open until both app entry points and cross-platform round-trip tests are complete.
