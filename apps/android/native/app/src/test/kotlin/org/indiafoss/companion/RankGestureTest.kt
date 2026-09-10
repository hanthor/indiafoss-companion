package org.indiafoss.companion

import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.ui.screens.RankScreen
import org.indiafoss.companion.ui.theme.CompanionTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class RankGestureTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val answers = mutableListOf<String>()

    private fun show() {
        val talk = Activity("talk", "A sample talk", start = "2026-09-26T10:00:00+05:30", end = "2026-09-26T10:30:00+05:30")
        val bundle = EventBundle("event", "Event", "Asia/Kolkata", "2026-09-26T09:00:00+05:30", "2026-09-26T18:00:00+05:30", activities = listOf(talk))
        val noUndo = CompanionViewModel.Undo(emptyMap(), emptyList())
        compose.setContent {
            CompanionTheme(dynamicColor = false) {
                RankScreen(UiState(loading = false, bundle = bundle), { _, choice -> answers += choice }, {}, { _, _ -> }, {}, { _, _ -> noUndo }, { noUndo }, { noUndo }, {}, {}, {}) {}
            }
        }
    }

    @Test fun rightSwipeLikesTheTalk() {
        show()
        compose.onNodeWithTag("talk-card").performTouchInput { swipeRight() }
        compose.waitForIdle()
        assertEquals(listOf("yes"), answers)
    }

    @Test fun leftSwipeRejectsTheTalk() {
        show()
        compose.onNodeWithTag("talk-card").performTouchInput { swipeLeft() }
        compose.waitForIdle()
        assertEquals(listOf("no"), answers)
    }

    @Test fun cancelledDragDoesNotAnswer() {
        show()
        compose.onNodeWithTag("talk-card").performTouchInput {
            down(center)
            moveBy(Offset(350f, 0f))
            cancel()
        }
        compose.waitForIdle()
        assertEquals(emptyList(), answers)
    }
}
