# Attendee journeys and product priorities — 9 September 2026

The Companion should help someone decide **what to do, where to go and who to reconnect with**, with as little phone time as possible. Discovery is one entry point; it should not be a prerequisite for attending the event.

These are hypothetical personas, not interviewed attendees. Findings come from a local Chromium walkthrough of PR #257 at 390×844, the 2026 bundle with 162 programme entries and 71 booths, and source inspection. Browser permission was blocked in this environment. Event-time screens used a simulated 26 September 11:00 clock. Native implementation was inspected where relevant; this is not an installed Android/iPhone, screen-reader or venue accessibility study.

## Personas and jobs

| Hypothetical attendee                                            | What they come for                                                           | A successful experience                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Asha, first-time student                                         | Find approachable talks, meet people, avoid missing the basics               | Browse immediately, make a few reversible choices, see a manageable plan and find the first room  |
| Ravi, devroom regular                                            | Spend the morning in Documentation, then attend AOSP                         | Reserve each block once, see lunch and real conflicts, remain in the same seat between talks      |
| Meera, community/booth visitor, attending Sunday only            | Meet three projects and discover related communities                         | Filter booths to Sunday, search interests, save visits and find their actual positions            |
| Balu, speaker who is also an attendee                            | Confirm where and when to speak, arrive early, share the session             | Find their own sessions quickly, reserve preparation time and get a dependable reminder           |
| Noor, attendee who needs step-free routes and rest breaks        | Move between rooms without an unusable route                                 | Choose access needs early, see verified floor changes and sufficient time, find a quiet space     |
| Dev, late arrival on an unreliable connection                    | Reach the next useful session with little setup                              | Skip onboarding, open cached Now/schedule, choose a room and see data freshness                   |
| Leela, networking-focused attendee switching from PWA to Android | Exchange details now and reconnect later                                     | Preview shared fields, scan a card, understand chat handoff and retain saved data after switching |
| Arun, volunteer helping other attendees                          | Answer “where is this?”, identify outdated information, help improve the app | Fast search, clear room names, an obvious help/report route and no need for privileged access     |

## Walkthroughs

### Asha: first launch to a useful first plan

Observed: a fresh `/` opens the four-step welcome flow: reminders, ticket, contact card and ranking. Every step is optional and Skip setup exists. The reminders explanation now correctly says the app must stay open/active and suggests calendar export. Discovery has three choices and a route to Plan; schedule browsing does not require discovery.

Pain: the first screen asks about notification permissions before Asha has selected anything to attend. “Rank”, “Must attend”, “Must go”, bookmarks and “Lock” introduce different concepts before she knows what is actually in her plan. The 77-talk day-one deck count can suggest a large task; completion-pressure effects are a hypothesis to test, not a measured outcome.

Confirmed blocker: opening Plan in a clean context immediately shows a long “Some edits don't fit” list, despite no edits. It pushes the itinerary below the first screen. See #258 below.

Proposal: make “Browse now” and “Find talks for me” clear arrival choices, offer reminders after there is a plan, and distinguish **interested**, **planned** and **must go** consistently. Keep swipe controls, buttons, keyboard shortcuts and undo; do not reintroduce visible shortcut clutter. Explain a suggested session briefly and let Asha stop after a few choices.

### Ravi: stay for a devroom

Walked `/plan/rank?mode=rooms`, selected “Stay for this devroom” for Documentation & Technical Writing, then opened Plan. The chooser describes reserving the whole block and lists its talks and time. It also displays Saturday and Sunday devrooms together beneath day tabs; the meaning of the selected day is consequently unclear in this mode.

Confirmed blocker: consecutive talks in Room 1 are reported as needing approximately five minutes to travel and settle. Generation already permits adjacent talks sharing the same devroom/location; edit validation does not share that rule. This also affects an untouched generated plan. [#258](https://github.com/hanthor/indiafoss-companion/issues/258) contains reproduction, code pointers and acceptance criteria.

Proposal: fix that mismatch first, group the itinerary into devroom blocks, retain individual session details inside each block, and show only genuine clashes. “Leave this block for one must-go talk” should be an explicit choice. Make day tabs filter the room chooser or label it as a both-day chooser. Test lunch inside/around a reserved block and any downstream reminder/map destination.

### Meera: Sunday booth visits

Walked Explore → Booth directory → Altsendme and openSUSE. All 71 records are present; the detail text shows Day 2 for Altsendme and unassigned for openSUSE. The unassigned record cannot be scheduled. PWA visit goals now respect available dates.

Pain: the directory offers broad category filters, but no day filter or search within the directory. Explore does have search, which requires navigating back. Days are hidden until opening each booth. No supplied source gives actual booth positions, so a “Find on map” link would be misleading. A saved 15-minute visit expresses a wish; it does not guarantee a free slot or a known route.

Proposal: prioritize Today/Day 1/Day 2 and searchable original domains, visible day labels, a visit shortlist and an explicit “not placed yet” state when no gap fits. Add visited/notes later if attendee testing supports it. Organisers must supply approved positions before route guidance. Preserve booth IDs across renames. Native visit planning and exported visit preferences remain unfinished (#191/#221/#240).

### Balu: speaker preparation

Walked `/speaker/person-balu-babu`: the page clearly lists two sessions with dates, times and rooms. Search and a shared speaker/session link are sufficient for finding the right session; there is no need to create a speaker account for that.

Potential gap: the app does not offer an explicit “I'm speaking here” journey. A speaker may need arrival/preparation time before their own talk, rather than only being present at its start. This is a feature hypothesis, not proof that generic custom plan blocks cannot meet the need.

Proposal: first test the existing custom-block/calendar workflow with a speaker. If it is cumbersome, add a local “This is my session” action that reserves configurable preparation time and exposes the room and organiser contact when supplied. Do not infer ownership from matching a name, and do not imply that browser timers are dependable locked-screen reminders.

### Noor: step-free movement and breaks

Walked the map's initial state: the floor plan is prominent, with ground/first-floor controls and Live/Next/You. Now exposes a “Set your current location” list. No horizontal overflow appeared. This is useful infrastructure, but does not prove a usable accessible route through the actual venue.

Pain: an explicit origin → destination journey is still difficult to discover. The initial map emphasizes rooms and live programmes rather than a plain-language answer to “how do I get there?”. A person's previously set location can become stale. Availability of a route in the graph is not evidence that the lift or passage is usable at the event.

Proposal: show From/To, label manually set location, expose the selected route profile, and explain floor changes and unavailable paths. Offer quiet-room/rest goals without medical profiling. Verify graph data with organisers and rehearse physically. Prior routing-profile inconsistency was addressed; do not reopen it from the old review without a new reproduction. Remaining work belongs to #223 and venue validation under #191.

### Dev: late, offline and trying to get to a room

A fresh launch leads to setup, but can be skipped. At simulated 11:00, Now shows sessions in progress and room/time information. After caching the event online, a reload of Schedule with the browser context offline still worked. This proves that tested warm-cache path, not a first-ever offline install or arbitrary browser storage retention.

Pain: Now presents a general “Next” choice; that must agree with Dev's actual edited plan rather than quietly choosing from different preference signals. The detailed update status is in Settings. A stale or cancelled session needs a clear recovery path when connectivity returns.

Proposal: prioritize “My next planned session” with a secondary “Browse what's on”; make offline readiness and last stored revision easy to find. Keep a useful no-plan state. Treat reminder reliability as a platform capability, and test calendar fallback on actual phones. Shared plan consumers remain #221; live device/venue rehearsal remains #191/#199.

### Leela: meet someone, then install native

Walked Connect and Settings. Public GitHub lookup is offered before manual fields; VCF import and field-sharing controls are available. Email/phone stay off by default. Personal-data export clearly warns that private fields are in the file and that import is not yet available.

Confirmed copy concern: Connect says a Companion scan “verifies your key badge and lets them message you”, while Settings describes identities as unverified until checked. A copied QR is not proof of who presented it, and successful contact import does not prove a working chat route. Current protocol/identity gates still apply.

Confirmed migration gap: a user can export but cannot complete a supported PWA → native import. Booth visit settings are not in that export either. Do not promote switching apps as seamless yet.

Proposal: finish transfer preview, conflict resolution and durable import before encouraging mid-event switching (#240). Explain three separate actions: save contact, compare identity, open a chat client. Show unsupported/unavailable chat capabilities honestly, with an ordinary contact fallback. Keep identity/protocol work under #31/#188 and profile improvements under #173.

### Arun: answer a question and contribute a fix

Schedule offers room filters and a room grid; Explore searches the event. The contribution notice now links to GitHub fork and issues from home/Settings without occupying the swipe screen. This supports a technical volunteer who wants to help.

Potential gap: a nontechnical attendee needs a simpler path for “this room label is wrong” or “I can't find the entrance” than a repository issue list. That is distinct from an emergency/help service, which the app must not invent.

Proposal: provide a contextual feedback link with page, app version and event revision, letting the user preview the report. Never attach tickets, contacts or personal plan data automatically. Add organiser help information only when verified. Keep GitHub as the contribution path; do not build a moderation inbox just to support basic feedback.

## Priorities and acceptance

| Priority                          | Change                                             | Acceptance / existing owner                                                                                                             |
| --------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| P1                                | Remove false devroom travel conflicts              | Generated plan → edit validation and reserved-track browser regression; real overlaps/travel remain detectable. New #258, related #221. |
| P1                                | Make one edited plan drive the day                 | A chosen, removed, replaced or cancelled session agrees across Plan, Now, map, schedule markers and reminders. #221.                    |
| P1                                | Make origin, destination and access needs explicit | Test arrival with no plan, a stale origin, a floor change and an unavailable accessible route. #223/#191.                               |
| P1                                | Stop overstating QR/chat verification              | Saving a card, comparing identity and opening an available route have distinct states and honest copy. #31/#188.                        |
| P1 before promoting app switching | Complete portable-data import                      | PWA → native retains CFP choices, plan edits, contact sharing and booth wishes, with a preview and recoverable failure. #240.           |
| P2                                | Finish a day-aware booth journey                   | Sunday visitor can find only relevant booths and distinguish requested, placed and unplaced visits. #191/#221.                          |
| P2                                | Simplify discovery/onboarding language             | First-time attendee reaches a useful plan without completing a deck or setting up a contact card; consistent choice terms. #192.        |
| P2                                | Speaker preparation and contextual feedback        | Validate with a speaker and volunteer before adding new modes; use existing plan blocks and GitHub where sufficient.                    |

No new recommendation model is needed to address these first priorities. Improving ranking cannot repair contradictory plan state or missing route information. Keep whole-devroom preference as a first-class choice, preserve explicit interests, and never train a dislike from a talk excluded by timing.

## Captured evidence

- [Fresh plan warning flood](attendee-personas-2026-09-09/fresh-plan.png): no prior choices or edits.
- [First-run arrival screen](attendee-personas-2026-09-09/arrival.png): optional setup and truthful blocked-reminder state.
- [Booth directory and unassigned state](booth-directory-2026-09-09.md): separate data/UI review.

A scripted map-room click timed out because its text locator did not resolve. This is an automation limitation, not evidence that a user's tap fails. The map findings above are limited to the observed initial state and existing workflow/source review.

## Next real-attendee rehearsal

Recruit at least one first-time attendee, a devroom regular, a booth visitor, a speaker and someone who needs step-free navigation. Include installed iPhone and Android, poor connectivity and an app switch. Ask each to perform their actual job without coaching; record task completion, wrong turns, recovery and wording they misunderstand. Do not infer accessibility needs from behaviour or collect contact/ticket data for analytics.

Suggested tasks: find a room on arrival; choose three talks and resolve a clash; reserve a whole devroom and take lunch; find a Sunday-only booth; prepare for one's own talk; remove a session and check all downstream surfaces; exchange a card; move the plan to another client. The automated observations above identify where to start, not evidence that attendees will experience or prioritize every proposed feature in the same way.
