# Consecutive devroom transitions — 9 September 2026

Fixes #258. Plan generation already allowed consecutive talks in the same devroom and physical room without travel or settling time. Edit validation applied the default buffer again, producing many false warnings even before any edits.

Both paths now use `transitionSeconds`. The exemption requires a known, matching devroom and room; different rooms, different/missing devrooms, real overlaps and custom-block conflicts retain their checks. The heading is now “Some plan items conflict”, because a source or generated-plan conflict is not necessarily a user edit.

Two generation-to-validation regression cases (ordinary and reserved devrooms) failed before the fix and pass afterwards. Four safety cases retain overlap, room-change, different-devroom and missing-devroom conflicts. All 36 solver tests, solver typecheck/lint and the web build passed locally. Three browser cases cover the fresh 2026 plan, reserved devroom, persistent edits and a genuinely infeasible custom block. Reviewed the [fresh mobile plan](devroom-transitions-2026-09-09/fresh-plan.png): the warning flood no longer precedes the itinerary.

On the current revision, reserving Documentation still exposes a real transfer warning for “Telling India's story through data” after the block. This is separate from false same-room conflicts and remains visible; #221 should cover generation around reserved-block boundaries. Do not claim all plans are feasible merely because #258 is fixed.
