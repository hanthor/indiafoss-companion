package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NowGoTest {
    private val grid = setOf("talk", "next")

    private fun go(
        conflicted: Boolean = false,
        item: String? = null,
        session: Boolean = true,
        next: String? = "next",
    ) = NowGo.target(conflicted, item, session, grid, next)

    @Test fun `your plan talk is the one you are going to`() {
        assertEquals(NowGo.Target("talk", NowGo.GOING), go(item = "talk"))
    }

    @Test fun `the programme stands in, labelled as such, only when the plan has nothing left`() {
        assertEquals(NowGo.Target("next", NowGo.UP_NEXT), go())
    }

    @Test fun `nothing is lit while the plan conflicts or for a personal block`() {
        assertNull(go(conflicted = true, item = "talk"))
        // A block has no card, and the programme must not stand in for it.
        assertNull(go(item = "block-1", session = false))
    }

    @Test fun `nothing is lit that the grid is not showing`() {
        assertNull(go(next = "elsewhere"))
        assertNull(go(item = "gone"))
    }
}
