# Personal data transfer

Tracks #240. The attendee must be able to start in the PWA and continue in native without redoing their choices. A contact vCard alone is not a personal-data backup.

## Current implementation

Both TypeScript and Kotlin resolve an event-scoped activity reference containing the local activity ID and, when available, the CFP proposal ID. Ten shared JSON scenarios exercise both implementations. Native event decoding now retains proposalId.

Resolution uses CFP identity first. A unique CFP match survives a recreated row. Repeated CFP entries require an exact occurrence ID; otherwise the result is ambiguous. Legacy references without CFP use the exact activity ID. References for another event are rejected. Missing/ambiguous references stay available for review and later retry.

The version-1 transport codec is implemented in both languages. It validates the envelope, unique event/activity references, canonical UTC export timestamp, a 5 MiB UTF-8 limit and maximum nesting of 64. Shared fixtures cover valid files, unknown fields and rejection cases. Unknown optional JSON sections survive decoding and encoding.

The PWA Settings page can export personal data from one consistent IndexedDB read transaction. It projects an explicit allowlist of personal record fields, including private contact fields regardless of the contact card's sharing selection, and booth-visit preferences keyed by stable booth ID. Credentials, device keys, chat caches, scanned contacts, passport stamps and general device settings are excluded.

The PWA Settings page can also import such a file, offline, from a file picker. `@indiafoss/storage` validates every supported section after envelope decoding (finite numbers, enumerations, calendar days and timestamps, declared activity references, unique records) and reports unsupported sections without applying them. The planner resolves each activity reference through the shared CFP/occurrence contract and lists additions, conflicts with existing device data and unresolved, unassigned or unknown-event records; conflicts are unticked by default so current choices, including explicit negative ones, are kept. Apply runs in one IndexedDB write transaction that re-reads every previewed value first; any record changed since the preview aborts the whole import and Dexie rolls back. After a commit the preference, comparison, plan-edit, room, saved-plan and contact caches reload from storage and the plan projection is invalidated, which re-arms reminders from the imported plan.

The native Compose client has the same two entry points on its Settings page, both through the system file picker and both offline. Export projects the same allowlist from the native stores (bookmarks and must-attend, ranking, plan edits, the attendee's own card and carried notes) into the versioned file; the handshake key in the Android Keystore, met contacts, the identity-envelope bookkeeping and the device switches are never read. Import decodes with the shared codec, validates every section with the same rules as the PWA (`PersonalDataValidation` in `:core`), resolves each activity reference through the shared CFP/occurrence contract and previews additions, conflicts (kept unless ticked) and unresolved, unassigned or unsupported records by name (`NativePersonalData`). Apply is all or nothing across the five DataStores: the state before the import is written to a journal first, every store is written with a compare-and-set against what the preview read, any failure restores every store from the journal in-process, and a journal found at the next launch is restored before anything reads the stores (`PersonalDataRepository`). The stores' flows feed the UI state, so the resolved plan, the alarm reconciliation and the phone-calendar sync re-derive from the imported choices without a restart.

Two native-only details ride in the same file. Blocks without a fixed time (a flexible block or a planned booth visit) cannot be PWA custom blocks, so they travel under `events[].sections.flexibleBlocks`; the PWA reports that section as unsupported and imports the rest, and native reads it back with the block's day. Booth visits are also written under `boothVisits` by stable booth ID, which is what the PWA imports; a visit arriving from the PWA has no day and is placed on the booth's first available day or the programme's first day, named as such in the preview. Native has no notes UI; notes are carried in a `NotesStore` so a PWA note survives a pass through native. Saved itineraries and resolved plans are not stored natively (the plan is resolved from the programme every time) and are reported in the preview rather than written. Unresolved and unassigned records are shown in the preview but are not stored on the destination on either platform; the attendee keeps the file and retries after a programme update. None of this has been exercised on Android hardware: the evidence is the JVM and Robolectric suites and CI.

## Versioned file design

The transport uses one JSON document with format `indiafoss-personal-data`, integer `schemaVersion: 1`, export time (for example `2026-09-09T00:00:00.000Z`), and separately scoped event records. Each event record has `eventId`, an `activities` reference table, and a `sections` object. Device-independent contact data is carried in an optional top-level `contact` object.

Section record schemas must be validated by their owning import adapters; envelope decoding deliberately preserves unsupported optional sections. The PWA exporter currently writes:

| Location                                   | Contents                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `events[].sections.preferences`            | Activity ID, rating, comparison count, disposition, bookmark and optional triage answer               |
| `events[].sections.comparisons`            | Comparison ID, both activity IDs, score and creation time                                             |
| `events[].sections.notes`                  | Activity ID, note body and update time                                                                |
| `events[].sections.plans`                  | Day, locked/removed IDs, both sides of replacements and custom blocks                                 |
| `events[].sections.resolvedPlans`          | Last saved activity IDs per day; recompute against the destination schedule before using              |
| `events[].sections.itinerary`              | Legacy saved itinerary activity IDs and generation time                                               |
| `events[].sections.rooms` / `roomsDecided` | Devroom preferences (including `stay`), IDs skipped by the room choice and onboarding decision state  |
| `events[].sections.boothVisits`            | Planned visit minutes per stable booth ID; `null` records an explicit cancellation                    |
| `events[].sections.flexibleBlocks`         | Native only: blocks without a fixed time (including booth visits), with their day; the PWA reports it |
| `contact.profile` / `contact.selection`    | Allowlisted contact fields/socials and the explicit sharing selection                                 |
| `unassigned`                               | Legacy preferences, notes, comparisons and booth visits whose event cannot be uniquely determined     |
| `unassigned.planEdits`                     | Native only: locks, removals and replacements whose session is not in the cached programme            |

Every event-scoped activity reference used by these sections is included in the event's reference table, with CFP proposal identity when present in the cached programme. Custom-block IDs remain local plan IDs. Plan keys explicitly retain their event even if the programme has been removed.

Legacy preferences, notes and comparisons have no event ID in IndexedDB. They are scoped only when all referenced activities belong uniquely to the same cached event. Removed IDs, IDs shared by cached events and cross-event comparisons go into `unassigned`; never discard them or infer the year from the ID/title. Importers must preserve this optional section for re-export and require an explicit event-resolution flow before applying it. Neither platform applies it yet; both list its records in the preview.

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

The PWA importer implements steps 1 to 5 (`previewPersonalDataImport` / `applyPersonalDataImport` in `@indiafoss/storage`, wired to Settings by `apps/web/src/lib/personal-data-import.svelte.ts`). The native importer implements them with `PersonalDataValidation` and `NativePersonalData` in `:core` and `PersonalDataRepository` in `:app`, wired to the Settings card by `CompanionViewModel`. Native splits personal state across five DataStores, so its atomicity comes from the import journal and the recovery gate at launch rather than one transaction; `PersonalDataRepositoryTest` rehearses a failure between writes, a store edited after the preview and a restart with the journal on disk. A failed or cancelled import leaves the prior personal state usable on both platforms.

## Delivery checks

- Codec rejects malformed/new-major files and oversized input; valid files round-trip.
- Export omits credentials and device keys even when they exist in source storage.
- PWA to native and native to PWA preserve all supported fields and unknown optional sections: `pwa-export.json` imports on native (`NativePersonalDataTest`) and `native-export.json` imports in the PWA (`personal-data-import.test.ts`).
- Changed schedule IDs, repeated CFP occurrences and event-year mismatch use the shared resolution cases.
- Existing destination choices win by default; negative choices and sharing-off states remain explicit.
- Real file-picker/export flows cover preview, cancel, confirm, reload and retry.
- CI and relevant mobile screenshots must pass before merging each implementation slice. Both app entry points and the cross-platform fixture tests exist; what remains for #240 is a transfer on real devices and storing unresolved records on the destination.
