# Profile-first contact setup — 9 September 2026

Onboarding and the contact-card page now start with a GitHub username/profile URL lookup. A preview appears before any fields are applied. Applying fills empty fields, keeps existing edits and leaves sharing switches unchanged. Phone contacts, contact files and manual entry remain available.

The public-profile lookup needs no OAuth application or self-contact on the phone. It imports public fields only. FOSS United browser access and LinkedIn OIDC are follow-up work in #173; no sign-in integration is claimed here.

Implementation and tests were developed together:

- Preview does not modify the card; applying preserves an existing name and keeps email sharing off.
- Rate limiting permits retry; cancelling a preview leaves the card unchanged.
- Onboarding saves the imported card before advancing, and it survives navigation.
- A delayed earlier lookup cannot replace the preview after the username changes.
- All 36 profile/accessibility browser checks pass in the final run. The preceding 70-test flow/accessibility run covered the existing contact and planner flows. Web checks, lint and build pass.
- Android long-title fix from PR #242 was separately verified in the CI-generated session-long-title screenshot (run 34259807583).

[Mobile preview, using mocked public profile data](profile-import-2026-09-09/mobile-preview.png).
