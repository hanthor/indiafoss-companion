# Discovery cleanup and routing consistency

## Attendee UX feedback

The swipe page no longer shows repeated gesture, keyboard or recommendation-explanation paragraphs. Choice buttons, progress, undo and screen-reader keyboard instructions remain. Opening Talks on a desktop pointer focuses the card without scrolling; arrow choices also work with page focus. Typing, interactive controls, modifiers, composition and repeated keydown events are guarded. Single-character aliases remain scoped to card focus. Existing expanded-card touch regressions continue to pass.

Devrooms now offer Interested, Not interested and Stay for this devroom. The ambiguous More like this control is removed. The footer counts whole-devroom reservations instead of calling interest boosts must-go choices. Existing saved interest boosts remain readable as Interested; choosing Interested clears the old boost. The recommendation engine still learns from individual talk choices.

## Issue #222

Map route estimates, next-up departure advice and notifications use the same journey helper and saved routing profile. The preference is hydrated before route advice and can be changed in the room sheet. Shared hydration prevents late storage reads from overwriting a newly chosen profile or manually set location. Changing profile or location re-arms reminders.

The banner now uses the real venue/current location, and shares the reminder engine's ten-minute arrival buffer. When a route is unavailable, the map and banner say so and no departure alarm is fabricated; the ordinary starting-soon reminder still works. Restricted-profile itinerary transfers with missing graph routes are infeasible rather than assigned a made-up five-minute walk. Estimates are based on the bundled graph, not a venue accessibility certification.

Validation includes different-duration accessible/fastest routes and no accessible route, consistent departure times, saved map preferences after reload, ordinary app/discovery flows, light/dark accessibility checks, and simulated notification delivery. Physical venue path/accessibility validation remains #191. Choosing a shared resolved plan is #221; explicit From/To controls and route steps remain #223. This change does not select a different Matrix/P2P transport or relax the identity-binding gates in #188.

## Issue #234: project-site offline registration

A deployed-site test found a separate production-path bug: generated registration requested `/indiafoss-companionsw.js` (404). The PWA plugin needs a directory-ending slash in its base. The corrected base, manifest start URL and scope now use `/indiafoss-companion/`. A post-build check inspects the generated registration and manifest, including in the Pages build. Fourteen discovery/contact browser checks pass with a real `/indiafoss-companion/` mount, including PDF QR decoding after an offline reload. Root-path tests alone did not expose this deployment bug.
