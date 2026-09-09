# Personal data export review — 9 September 2026

Tracks #240. Settings now offers a local JSON download of persisted personal records: choices, comparison history, devroom preferences and whole-devroom reservations, plan edits/custom blocks, saved plan snapshots, notes and the attendee's contact card with its sharing selection.

The export reads a single IndexedDB transaction and projects only known personal fields. It includes private contact details even when those fields are excluded from QR sharing; the UI explains this. Matrix credentials, device keys, messaging stores, scanned contacts and unrelated settings never enter the file. It is not yet possible to import the file in either app, and the screen states that clearly.

Unknown-event legacy records are retained under `unassigned`, including removed sessions and ambiguous IDs. No event-year guess is made. All known activity references carry their CFP ID where available. The format and remaining importer requirements are in [the architecture document](../architecture/personal-data-transfer.md).

Validation:

- 23 storage tests pass, including a real persisted-record export matching the shared native fixture, canaries in excluded stores/fields, removed and ambiguous activity IDs, both replacement references, corrupt data, UTF-8 size limits and retry without changing storage.
- 225 model tests pass. The new PWA export fixture also runs through the existing Kotlin codec conformance test in CI; that verifies preservation, not native storage import.
- 34 browser checks pass: actual offline download after reload, intact choices after a failed export and retry, and existing light/dark accessibility checks.
- Storage typecheck/lint and web check/lint/build pass. Web check retains four existing warnings in unrelated components.
- Reviewed [mobile](personal-data-export-2026-09-09/mobile.png), [mobile failure](personal-data-export-2026-09-09/mobile-error.png) and [desktop](personal-data-export-2026-09-09/desktop.png) screenshots. The action and error remain readable above the mobile navigation.

Full migration remains open: section validation before import, conflict preview, durable writes, unresolved-record retention and native file entry points.
