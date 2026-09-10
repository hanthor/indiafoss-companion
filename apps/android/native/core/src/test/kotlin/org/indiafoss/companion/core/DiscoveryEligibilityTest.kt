package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class DiscoveryEligibilityTest {
    @Test
    fun `programme intros are not taste choices`() {
        listOf("Devroom Intro: Open Hardware", " Devroom Introduction : Security ").forEach {
            assertFalse(Activity(id = "intro", title = it).isDiscoveryActivity())
        }
    }

    @Test
    fun `ordinary introductions and short talks remain eligible`() {
        listOf("Introduction to Rust", "A five minute demo", "Writing a devroom introduction", "FOSS Awards").forEach {
            assertTrue(Activity(id = "talk", title = it).isDiscoveryActivity())
        }
        assertFalse(Activity(id = "lunch", title = "Lunch", type = "meal").isDiscoveryActivity())
        assertFalse(Activity(id = "awards", title = "FOSS Awards", type = "ceremony").isDiscoveryActivity())
        assertFalse(Activity(id = "intro", title = "Devroom Intro: Security", type = "intro").isDiscoveryActivity())
        assertFalse(Activity(id = "cancelled", title = "Talk", cancelled = true).isDiscoveryActivity())
    }
}
