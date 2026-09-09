# Consecutive devroom transitions — 9 September 2026

Fixes #258. Plan generation already allowed consecutive talks in the same devroom and physical room without travel or settling time. Edit validation applied the default buffer again, producing many false warnings even before any edits.

Both paths now use `transitionSeconds`. The exemption requires a known, matching devroom and room; different rooms, different/missing devrooms, real overlaps and custom-block conflicts retain their checks. The heading is now “Some plan items conflict”, because a source or generated-plan conflict is not necessarily a user edit.

Two generation-to-validation regression cases (ordinary and reserved devrooms) failed before the fix and pass afterwards. Four safety cases retain overlap, room-change, different-devroom and missing-devroom conflicts. All 37 solver tests, solver typecheck/lint and the web build passed locally. Three browser cases cover the fresh 2026 plan, reserved devroom, persistent edits and a genuinely infeasible custom block. Reviewed the [fresh mobile plan](devroom-transitions-2026-09-09/fresh-plan.png): the warning flood no longer precedes the itinerary.

The browser walkthrough also exposed a second defect: candidates in gaps around fixed commitments were checked against clock boundaries but not travel to/from those commitments. The solver now checks both neighbouring commitments with `canFollow`. A regression with higher-rated but unreachable suggestions on either side fails before the change and chooses reachable alternatives afterwards. The current reserved Documentation plan is consequently conflict-free too. Real conflicts between explicit must-go choices remain visible; this does not resolve the wider shared-plan-consumer work in #221.
