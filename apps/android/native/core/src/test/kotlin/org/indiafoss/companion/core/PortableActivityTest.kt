package org.indiafoss.companion.core

import java.io.File
import kotlinx.serialization.Serializable
import kotlin.test.Test
import kotlin.test.assertEquals

class PortableActivityTest {
    @Serializable
    private data class Target(val id: String, val proposalId: String? = null)
    @Serializable
    private data class Case(
        val name: String,
        val reference: PortableActivityReference,
        val eventId: String,
        val activities: List<Target>,
        val expected: ActivityResolution,
    )

    @Test
    fun `same identity outcomes as the PWA for every shared scenario`() {
        val fixture = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
            .map { File(it, "packages/test-fixtures/fixtures/portable-activity-resolution.json") }
            .first { it.isFile }
        val scenarios = bundleJson.decodeFromString<List<Case>>(fixture.readText())
        assertEquals(10, scenarios.size)
        for (scenario in scenarios) {
            val activities = scenario.activities.map { Activity(id = it.id, title = it.id, proposalId = it.proposalId) }
            assertEquals(scenario.expected, PortableActivities.resolve(scenario.reference, scenario.eventId, activities), scenario.name)
        }
    }

    @Test
    fun `CFP identity is retained when decoding a published activity`() {
        val activity = bundleJson.decodeFromString<Activity>("""{"id":"new","title":"Moved session","proposalId":"cfp"}""")
        assertEquals("cfp", activity.proposalId)
    }
}
