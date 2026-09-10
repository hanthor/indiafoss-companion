package org.indiafoss.companion

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.Ranking
import org.indiafoss.companion.core.Track
import org.indiafoss.companion.core.RankingState
import org.indiafoss.companion.core.SessionRating
import org.indiafoss.companion.ui.screens.LastPick
import org.indiafoss.companion.ui.screens.RankScreen
import org.indiafoss.companion.ui.screens.devroomTitle
import org.indiafoss.companion.ui.theme.CompanionTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

/** The settlement card (#271): one tap settles a slot, the note says what happened, Undo takes it back. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class RankClashTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private fun talk(id: String, start: String, end: String, track: String? = null) =
        Activity(id, "Talk $id", start = "2026-09-26T$start:00+05:30", end = "2026-09-26T$end:00+05:30", trackId = track)

    private val picks = mutableListOf<Pair<String, List<String>>>()
    private val undone = mutableListOf<CompanionViewModel.Undo>()

    private fun show(activities: List<Activity>, ranking: RankingState, mustAttend: Set<String> = emptySet(), tracks: List<Track> = emptyList()) {
        val bundle = EventBundle("event", "Event", "Asia/Kolkata", "2026-09-26T09:00:00+05:30", "2026-09-26T18:00:00+05:30", activities = activities, tracks = tracks)
        val state = UiState(loading = false, bundle = bundle, ranking = ranking, mustAttend = mustAttend)
        val noUndo = CompanionViewModel.Undo(emptyMap(), emptyList())
        compose.setContent {
            CompanionTheme(dynamicColor = false) {
                RankScreen(
                    state, { _, _ -> }, {}, { _, _ -> }, {},
                    onPick = { winner, members ->
                        picks += winner.id to members.map { it.id }
                        CompanionViewModel.Undo(members.associate { it.id to SessionRating() }, emptyList(), Ranking.resolveClash(members.map(state::ranked), winner.id))
                    },
                    onTie = { noUndo }, onDrop = { noUndo }, onUndo = { undone += it }, onOpen = {}, onOpenSpeaker = {},
                ) {}
            }
        }
        compose.onNodeWithText("Overlaps").performClick()
        compose.waitForIdle()
    }

    /** The note sits under the cards: bring it into the lazy list before reading it. */
    private fun result() = compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag("clash-result")).let { compose.onNodeWithTag("clash-result") }

    /** Bring a card into the lazy list, then tap it. */
    private fun pick(id: String) {
        compose.onNode(hasScrollAction()).performScrollToNode(hasTestTag("pick-$id"))
        compose.onNodeWithTag("pick-$id").assertIsDisplayed().performClick()
        compose.waitForIdle()
    }

    @Test fun fourWayClashIsOneStep() {
        val four = listOf("a", "b", "c", "d").map { talk(it, "11:00", "11:30") }
        show(four, RankingState(roomsDecided = true))
        compose.onNodeWithText("Which one would you go to?").assertIsDisplayed()
        compose.onNodeWithText("Slot 1 of 4 · 11:00–11:30").assertIsDisplayed()
        // Four cards push the Undo row below the fold: bring it into the lazy list before reading it.
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Undo last"))
        compose.onNodeWithText("Undo last").assertIsNotEnabled()
        pick("b")
        // One tap, one pick, with every member of the slot: the view model settles the whole window.
        assertEquals(listOf("b" to listOf("a", "b", "c", "d")), picks)
        result().assertIsDisplayed().assert(hasText("Talk b is in your plan. 3 talks stood aside — still an interest, not a dislike."))
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Undo last"))
        compose.onNodeWithText("Undo last").assertIsEnabled().performClick()
        compose.waitForIdle()
        assertEquals(1, undone.size)
        assertEquals(listOf("a", "c", "d"), undone.single().resolution?.steppedAside)
        compose.onNodeWithText("Undo last").assertIsNotEnabled()
    }

    @Test fun settledSlotIsNotAskedAgain() {
        val four = listOf("a", "b", "c", "d").map { talk(it, "11:00", "11:30") }
        // Every talk sorted, three of them stood aside for b: nothing is left to ask.
        val settled = listOf("a", "b", "c", "d").associateWith { SessionRating(triage = "yes", yieldedTo = if (it == "b") null else "b") }
        show(four, RankingState(roomsDecided = true, ratings = settled))
        compose.onNodeWithText("All settled").assertIsDisplayed()
        compose.onNodeWithText("Every overlap for this day has a winner. Your plan is built around them.").assertIsDisplayed()
    }

    @Test fun staggeredMembersSayWhatStillFits() {
        val members = listOf(talk("w", "11:00", "13:00"), talk("x", "11:00", "11:30"), talk("y", "12:30", "13:00"))
        show(members, RankingState(roomsDecided = true))
        // x and y each overlap only the workshop; a pick of either leaves the other live.
        compose.onAllNodesWithText("Overlaps 1 of the other 2; the rest can still fit.").onFirst().assertIsDisplayed()
    }

    @Test fun mustGoConflictIsKeptExplicit() {
        val three = listOf("a", "b", "c").map { talk(it, "11:00", "11:30") }
        show(three, RankingState(roomsDecided = true), mustAttend = setOf("a", "b"))
        compose.onNodeWithTag("slot-mustgo-note").assertIsDisplayed()
        pick("c")
        result().assert(hasText("Talk a, Talk b keep their must-go mark, so the plan still shows that clash.", substring = true))
    }

    @Test fun reservedDevroomIsNamedAndExplained() {
        val rust = Track("devroom-rust", "Devroom 2 (Rust)")
        val members = listOf(talk("r", "11:00", "11:30", "devroom-rust"), talk("o", "11:00", "11:30", "other"))
        show(members, RankingState(roomsDecided = true, rooms = mapOf("devroom-rust" to "stay")), tracks = listOf(rust))
        compose.onNodeWithText("STAYING FOR THIS DEVROOM · Rust").assertIsDisplayed()
        compose.onNodeWithTag("slot-devroom-note").assertIsDisplayed()
        pick("o")
        result().assert(hasText("Talk r stood aside", substring = true)).assert(hasText("You leave Rust for this slot only.", substring = true))
    }

    @Test fun noteWordingAndDevroomTitles() {
        assertEquals("Rust", devroomTitle("Devroom 2 (Rust)"))
        assertEquals("Devroom 2", devroomTitle("Devroom 2"))
        assertEquals("Talk a is in your plan. Talk b stood aside — still an interest, not a dislike.", LastPick("Talk a", listOf("Talk b"), emptyList(), emptyList()).summary())
        assertEquals(
            "x is in your plan. You leave Rust for this slot only. m keeps its must-go mark, so the plan still shows that clash.",
            LastPick("x", emptyList(), listOf("m"), listOf("Rust")).summary(),
        )
    }
}
