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

Tapping a session is the answer for the whole slot: it beats every other
session it overlaps in one go, one recorded comparison per pair. If the
losers still overlap each other the slot stays up with "And if that falls
through?", so a backup order comes out in at most n − 1 taps. **Any of
these** ties every open pair; **None of these** drops the slot's sessions
from the day; "Decide this slot later" moves on. Keyboard: 1–9 pick the nth
card, ↑/↓ the first or second, E ties, 0 drops, U or Backspace undoes the
whole pick.

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
- `apps/web/tests/app.spec.ts`: the devrooms step lists no main hall and
  "Not interested" thins the talks; the card step keeps and drops by button
  and by swipe and survives a reload; a slot pick answers several pairs,
  keyboard picks and undo (`/plan/rank?mode=pairs`); answered slots are not
  re-asked after a reload.
- `apps/android/native/core`: `RankingTest` covers the same slot grouping.
