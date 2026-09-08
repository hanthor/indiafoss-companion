# Ticket and contact-card setup

Issue #231 records the attendee request and acceptance criteria.

The welcome ticket step and Connect now read PDFs or images on the device. PDF.js renders up to ten pages, bounded to 2400 pixels per longest edge; ZXing reads a code from each page. Files are limited to 20 MB. A PDF containing several codes on a single page may need a screenshot cropped to the attendee's code. Password-protected PDFs need an unlocked copy or screenshot. The original document is not retained or uploaded.

The shared model recognizes HTTPS `fossunited.org/get_tickets?id=<id>` URLs with exactly one valid ID, as well as existing bare IDs and `ticket::` references. It does not fetch these URLs or verify admission. Welcome requires selecting the detected reference and saving; Connect's explicit Save reference button uses the existing card autosave. The camera/manual preview now offers Save my ticket reference. Existing sharing settings are preserved.

The contact-card step supports selecting one contact where available, importing an exported `.vcf`, and standard name/organisation/email/telephone autocomplete. Imports fill blanks without overwriting attendee edits or enabling private sharing. Password-manager identity suggestions depend on the installed manager; no credential access or password fields are involved.

The draft schedule banner was removed at the attendee's request. Source schedule-status metadata and archived-programme identification are retained.

Validation: 198 model tests pass, including official-URL normalization and lookalike/ambiguous URL rejection. Six new browser tests pass, including actual PDF QR decoding after an offline reload, image retry, selected-contact import, vCard field precedence/private sharing, pasted URL persistence and scanner confirmation. The existing app, discovery and design flows pass (41 checks). Web lint, type checking and production build pass, with three pre-existing unused-CSS warnings. The PDF worker is bundled and precached locally. No physical iOS/Android or third-party password-manager validation was performed.
