# Booth directory import — 9 September 2026

Tracks #191 and #221. The organiser's spreadsheet and pinned gist contain identical public booth records. Source links, field mapping, availability semantics and maintenance commands are documented in the [event README](../../events/indiafoss-2026/README.md).

The shared bundle now contains 71 booths. No schedule rows, people, room IDs or personal choices need to change. The existing event-sync fixture merge keeps these records across subsequent schedule imports. This is a reviewed snapshot, not an automatic Google Sheets connection.

Availability is an additive `Booth.availableDates` field retained by TypeScript and Kotlin models. PWA flexible booth goals only enter the matching day's solve; unassigned booths cannot be scheduled from their detail page. Older event bundles without availability retain their previous behaviour. The native detail screen shows the day in the shared description; native visit planning is not implemented by this change.

Validation includes event-sync idempotence, availability unit tests and browser coverage for the imported directory, single-day descriptions, unassigned visit controls and absent map links. Existing source lunch-overlap warnings are unrelated to this booth-only data change. Native validation runs in CI because this workspace has no Android SDK/JDK.

Remaining work: automatic spreadsheet refresh with header validation and stable rename reconciliation; day filters and clearer availability labels in the directory; organiser-approved booth map locations; native visit planning; and visit preferences in portable personal-data exports. Keep these attached to #191/#221/#240 rather than claiming complete booth parity.

Local results: 88 web unit tests and six event-sync tests passed; Svelte check passed with four existing warnings, lint/build passed, and the focused browser regression passed. Compared the complete bundles: only `booths` changed. Reviewed [mobile directory](booth-directory-2026-09-09/mobile-directory.png) and [unassigned booth](booth-directory-2026-09-09/mobile-unassigned.png) screenshots at 390px.

At the maintainer's request, a contribution notice on the PWA home and Settings pages and native Settings invites attendees to fork, improve code/design/docs and report issues. Links go to the Companion fork and issue pages. It is an inline section, with no persistent banner or prompt over discovery/planning.
