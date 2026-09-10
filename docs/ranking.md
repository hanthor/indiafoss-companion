# Ranking: three steps, only the questions that matter

Ranking a programme of 130 talks by comparing pairs is only bearable if the
app never asks a question whose answer changes nothing. Issue #90 ("ranking
takes too long") made that the rule in the Elo package; #108 reshaped the
Rank screen around it into three steps: the devrooms, every talk once, then
only the overlaps, one time slot at a time. The same three steps run in the
native app (`RankScreen.kt`).

## Step 1: devrooms

Once per event, the screen asks about the devrooms and nothing else: the
main halls (where the keynotes are) are always in, so they are never listed.
Each devroom shows what it is about (the track's description when the
programme has one, otherwise a summary built from its talks: count, when it
runs, who speaks, the tags its talks carry) and unfolds its programme on
request. The answer is one of three:

- **Not interested** answers "no" for every talk in the room the attendee
  has not answered themselves, and remembers which, so choosing Interested
  later restores exactly those. Stored as the room preference `skip`.
- **Interested** is neutral: the room's talks come up like any other.
- **Must go** gives the room a head of votes in the taste prior
  (`LOVED_ROOM_VOTES`), lifting its unranked talks by roughly 40 points, well
  under a settled gap, so the room wins close calls but never silences a
  direct answer. Stored as `love`.

Stored under `room-prefs-<eventId>` (`apps/web/src/lib/roomPrefs.svelte.ts`;
`devrooms()` is the list, `roomSummary()` the blurb).

## Step 2: the talks, one card at a time

Every talk of the day is dealt once as a card: type, time and room, title,
the speakers with their avatar and affiliation, the abstract (folded, "Read
more" unfolds it), tags, and how many other talks it overlaps. Swipe right
or tap **Interested** to keep it, swipe left or tap **Not for me** to rule it
out, **Must go** keeps it and marks it must-attend. Keyboard: →/Y, ←/N, M.

"Not for me" marks the session `not-interested` (it leaves ranking and
planning); the others keep it in. Answers are stored on the activity
preference (`triage: 'yes' | 'no'`), survive a reload, and can be changed
under "Change answered". The stack is the fast way through a long day: one
gesture per talk, and only the kept talks that clash need a decision
afterwards.

## Step 3: overlaps, slot by slot

This step never ranks the day as a whole. `conflictSlots()` builds a slot
per session that still has an open pair, in time order: the session and
everything running against it that is still undecided. Anchoring on one
session keeps a slot the size of one time band even when a long workshop
overlaps half the morning; the chain is never followed further. Slots are
shown one at a time ("SLOT 3 OF 9 · 11:00–11:30", the anchor's window), with
the sessions as cards.

Tapping a session settles the whole slot in one action (#271). The pick is
planned (kept as Want to go unless it is already must-go), and every member
it overlaps **stands aside** for it: the preference records `yieldedTo:
<winner>`, a scheduling loss kept apart from `disposition`. A stood-aside
talk stays an interest, is left out of the plan only while its winner is
live on the day (`activeAfterYields`), comes back on its own if the winner
is ruled out or cancelled, and is never learnt as a dislike (its comparison
is recorded with `clash: true`, which votes for the winner's facets only). A
four-way clash is therefore one tap, never three further "and if that falls
through?" questions — that chain was the bug in #271: a pick answered only
the winner's pairs, so the losers' pairs kept the same window open.

Members the winner does not overlap (a long workshop's slot also holds the
talk at its far end) are untouched and still live, so a later compatible
talk is never suppressed. A must-go loser never stands aside: it keeps its
mark and the plan keeps reporting the must-go conflict until the attendee
changes that answer. The prompt names the reserved devroom on its talks
("STAYING FOR THIS DEVROOM") and explains that picking another talk leaves
the devroom for that slot only — the solver exempts that one winner from the
block's reservation and keeps the rest of the block. Undo restores every
session of the last answer exactly, stood-aside marks included; the Plan
screen also lists the day's stood-aside talks with **Reconsider**.

**Any of these** ties every open pair; **None of these** drops the slot's
sessions from the day (an explicit answer, unlike standing aside); "Decide
this slot later" moves on. Keyboard: 1–9 pick the nth card, ↑/↓ the first
or second, E ties, 0 drops, U or Backspace undoes the whole pick.

Under the hood a pair is open when the two sessions overlap, have not been
answered, and their ratings are within `SETTLED_GAP` (64, two definitive
wins), so a strong pick settles its other clashes transitively and is never
re-asked. **Provisional K** still applies: a session nobody has answered
about yet moves twice as far on its first result and one and a half times on
its second (`pairKScale`), so one clear pick between two fresh sessions opens
a settled gap at once.

`conflictProgress()` counts the open pairs, and the readout says
"N CHOICES · M OVERLAPS OPEN" so the end is visible. The badge on the
overlaps tab only appears once the talks are sorted or a slot has been
answered: the number means little until the Nos are out.

**What to expect.** Simulated on the 2025 day one (56 sessions, 130
overlapping pairs) with a consistent underlying preference and 90%
consistent answers: settling every overlap pairwise from scratch takes about
100 taps. After a talks step that keeps 60% of the day (32 sessions, 46
overlaps) it takes about 34 pairwise answers; a slot pick answers several
pairs at once, so the tap count is lower again. The cards, not the overlap
round, are where the time goes down, which is why they come first.
`ALL SETTLED` means every overlap among the kept sessions has a winner.

Answered pairs are hydrated from storage (`hydrateComparisons()`), so a
reload never re-asks a question.

## Learning a taste: affinity priors

Every answer is also a vote about _kinds_ of sessions. `learnAffinity()`
turns the comparison history and the "No" answers into a score per track,
session type and tag (`track:aosp`, `type:keynote`, `tag:beginner`): a pick
for A over B is a vote for everything A is and against everything B is, a
tie votes for neither, "not interested" votes against. Votes are shrunk
towards zero (three comparisons before full strength) so one pick cannot
demote a whole track.

`ratingWithPrior()` blends the learnt taste into a session's rating as an
offset of at most `MAX_PRIOR_OFFSET` (60, below one settled gap on purpose),
fading as the session collects comparisons of its own and gone after three.
The prior is a view: selection, the progress readout, the leaderboard and
the itinerary solver (`solveForDay`) use it; the stored ratings never change.
The Rank screen shows what it learnt ("Learning your taste: AOSP ↑, Open
Data ↓") once a track has two or more votes.

## Tests

- `packages/elo/src/index.test.ts`: non-overlapping pairs never offered,
  settled gaps skipped, a four-way clash settled in at most one question per
  conflict, progress counting, slot anchoring (no chaining through a long
  session, not-interested left out, settled members dropped), affinity
  learning and fading, purity of `applyPriors`.
- `packages/elo/src/index.test.ts` (clash resolution, #271): a four-way
  simultaneous clash settled by one pick, staggered overlaps standing aside
  only the talks the winner clashes with, a stood-aside talk returning when
  its winner leaves, must-go losers kept, clash losses not learnt as dislike.
- `packages/solver/src/yields.test.ts`: stood-aside talks left out while the
  winner is live and back when it is not, must-go conflicts retained, later
  compatible talks kept, leaving a reserved devroom for one talk.
- `apps/web/tests/app.spec.ts`: the devrooms step lists no main hall and
  "Not interested" thins the talks; the card step keeps and drops by button
  and by swipe and survives a reload; a slot pick answers several pairs,
  keyboard picks and undo (`/plan/rank?mode=pairs`); answered slots are not
  re-asked after a reload.
- `apps/android/native/core`: `RankingTest` covers the same slot grouping and
  the clash cases above (`resolveClash`, `livePool`); `YieldsTest` the
  itinerary's stood-aside rules; `AffinityTest` the clash vote.
  `RankClashTest` (Robolectric) renders the settlement card, the devroom pill
  and the note, and drives one pick and Undo.
