# Ranking: two rounds, only the questions that matter

Ranking a programme of 130 talks by comparing pairs is only bearable if the
app never asks a question whose answer changes nothing. Issue #90 ("ranking
takes too long") was fixed by making that the rule, in the Elo package and on
the Rank screen.

## Round 1: the quick pass

`/plan/rank` opens on a list of the day's sessions with **Yes** and **No** on
every row. "No" marks the session `not-interested` (it leaves ranking and
planning); "Yes" keeps it in. Answers are stored on the activity preference
(`triage: 'yes' | 'no'`), survive a reload, and can be changed under
"Change answered". A row says how many other sessions it overlaps, which is
what the second round is about.

The list is the fast way through a long day: a tap per talk, and only the
Yeses that clash with each other need a decision afterwards.

## Round 2: head to head

Only pairs whose answer changes the plan are offered, in this order:

1. Two sessions must **overlap in time**. Non-overlapping pairs are never
   asked: you can attend both. (Before, every pair with fewer than three
   comparisons on either side was offered, which is why a day felt endless.)
2. The pair must not be **already settled**: answered directly, or with a
   rating gap of at least `SETTLED_GAP` (64, two definitive wins). A strong
   pick therefore settles its other clashes transitively.
3. Closest calls first; a pair the attendee has said nothing about is worth a
   little more than one where a side is already placed.

`conflictProgress()` counts the open overlaps, and the readout says
"N CHOICES · M TO GO" so the end is visible. The `ALL SETTLED` state means
every overlap among the kept sessions has a winner. "Neither, skip both"
drops both sessions from the day (before it only recorded a tie).

Answered pairs are hydrated from storage (`hydrateComparisons()`), so a
reload never re-asks a question. That was a bug: the compared-pairs set used
to start empty on every visit.

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
  conflict, progress counting, affinity learning and fading, purity of
  `applyPriors`.
- `apps/web/tests/app.spec.ts`: the quick pass narrows the overlaps and
  survives a reload; answered pairs are not asked again after a reload;
  keyboard choices and undo in head to head (`/plan/rank?mode=pairs`).
