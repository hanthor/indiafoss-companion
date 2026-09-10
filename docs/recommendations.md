# Talk discovery and whole-devroom planning

The maintainer's 8 September direction supersedes the mandatory room → all-talks → pairwise-ranking funnel: choose a few talks, see more like them, and stop whenever the plan is useful. An attendee can also commit to a whole devroom programme.

## Attendee choices

| Choice                | Saved meaning                                | Recommendation effect                                          | Plan effect                                                        |
| --------------------- | -------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Must go — gold        | Explicit must-attend, positive card answer   | Strong positive topic/track signal                             | A hard preference; incompatible must-go choices require resolution |
| Want to go — green    | Explicit positive card answer                | Positive topic/track signal                                    | Prioritised over unknown suggestions; feasibility still applies    |
| Not interested — grey | Explicit negative card answer                | Modest negative topic/track signal                             | Excluded until the attendee changes their answer                   |
| Stay for this devroom | Event-scoped commitment to a programme track | Positive track preference; no need to answer every member talk | Reserve the published block, including gaps; flag conflicts        |
| Stood aside (clash)   | `yieldedTo: <winner>` on the losing talk     | None: not a dislike, the interest signal stays                 | Left out while the winner is live; returns on its own; Reconsider  |

“No answer” is not a dislike, and neither is losing a clash: picking one talk in the overlaps step stands every talk it overlaps aside in one action (#271, see [ranking](ranking.md)). Undo removes the direct answer and its must mark while retaining historical pairwise ratings and bookmarks. Existing ratings remain readable, and comparisons can remain an optional conflict-resolution tool. No completion quota or exhaustive ranking is required. Explicit individual exclusions remain excluded even inside a selected devroom.

## Current local engine

The existing `learnAffinity` already supported offline content-based recommendations, but quick-pass yes/must responses did not train it. This change adds direct choice evidence and uses `discoveryDeck` to order unanswered cards. It uses the existing bounded track/tag/type affinities; explanatory reasons omit generic format/audience tags. Cold start samples different tracks, and every fourth card explores underrepresented tracks rather than only exploiting positive matches. Ordering is deterministic, and source cancellations and explicit decisions leave the deck.

This is a small local recommender, not a downloaded language model and not a claim of semantic understanding. Neither personal choices nor a contact graph are sent to a server for recommendation. Topic/category quality remains a limitation; broad CFP categories do not distinguish every pair of talks. No accuracy improvement is claimed without evaluation. The current engine does not use speaker identity or title/abstract embeddings; that is a possible later experiment.

A positive card gives one vote, must-go three and dislike minus one; all are shrunk by existing evidence bounds. Those are initial product parameters, not calibrated probabilities. “More like your choices” describes the matching facets, not a guaranteed satisfaction prediction. Direct preferences remain separate from inferred scores and survive later model changes.

## Programmes are not physical rooms

The 2026 public proposal field `custom_question_1` identifies the devroom programme. The adapter assigns stable programme IDs independently of physical `locationId`, and associates named intro rows and subsequent unlinked programme items until the meal break. This mapping is enabled specifically for the 2026 source contract; earlier events retain their published track identity.

For example, Room 1 hosts Documentation & Technical Writing in the morning and AOSP in the afternoon. Selecting one must not select the other. Reserving a programme covers its first through last published timed entry on the selected day. Back-to-back talks in the same devroom do not require a fictional room-transfer buffer. Automatic suggestions and flexible errands cannot occupy the reserved gaps. Conflicting explicit choices and overlapping draft entries are surfaced rather than silently resolved by inferred taste.

Web planning returns a conflict result before producing an apparently valid itinerary. Native currently retains its greedy itinerary and shows a conflict warning with the incompatible talks; these are different presentations, not equivalent solver algorithms. Walking-time parity between native and web remains outside this change. Releasing a native feature requires its build/device gate, not merely matching source code.

## Published draft handling

The default programme is IndiaFOSS 2026, explicitly marked draft. Preserve published anomalies in provenance. An end-before-start entry retains its supplied start and a visible timing note, with no invented end; it cannot enter an automatic itinerary until corrected. A fresh visit defaults to 2026; explicit `?event=indiafoss-2025` links select the archived programme for that browser tab. Neither event's stored preferences are deleted during cutover.

## Optional local AI experiment, after the baseline

1. Evaluate this baseline first: how quickly do people find three desirable talks, skip irrelevant ones and produce a feasible plan? Include no-history users and full-devroom attendees. Measure undo rate, topic coverage and regret without uploading personal histories by default.
2. If broad categories prove insufficient, try public title/abstract text features or precomputed embeddings as a versioned event sidecar. Pair every vector with an activity ID, source-text digest and encoder revision. Recompute changed sessions only. Personal preference scoring stays local and the baseline remains available offline without a download.
3. Admit on-device query embedding only after measuring actual download size, memory, latency, battery and compatibility on target Android/iPhone/browser devices. Show a clear optional download and deletion control. No automatic fallback to a cloud model.
4. Keep a generative assistant outside timetable truth and constraint solving. Any later conversational interface must return existing activity IDs, quote grounded source facts and let the deterministic planner handle timing/conflicts. Treat public abstracts as data, never executable instructions.

The engine needs golden cross-language cases for cold start, positive/negative/undo, sparse tags, periodic exploration, cancelled or retimed sessions and whole-track conflicts. Tests in `packages/elo/src/discovery.test.ts`, `packages/solver/src/stay.test.ts`, source fixture tests and browser discovery/offline tests cover the initial web change. Native gates must be reported separately.

Use vector icons for the crown and check. Emoji are not allowed in the interface.

For the swipe interaction, adaptive exploration, and examples from Pandora,
YouTube Music, Tinder and recommendation research, see
[interactive recommendation patterns](recommendation-patterns.md). The PWA
notification/map/plan integration review is recorded in
[the September UX review](reviews/pwa-ux-2026-09-08.md).

### Desktop discovery shortcuts

Tab to the talk card to use Left for Not interested, Right for Want to go,
Up for Must go, and Z to undo the last choice. Y/N/M are equivalent choice
shortcuts. Focus follows the next card after saving and returns to the deck
after undo. When the deck is exhausted, focus moves to Undo last choice.
Buttons also support ordinary Tab and Enter. Shortcuts are scoped to the card
and ignore modifiers, composition and held-key repeats, so other controls
remain usable.
