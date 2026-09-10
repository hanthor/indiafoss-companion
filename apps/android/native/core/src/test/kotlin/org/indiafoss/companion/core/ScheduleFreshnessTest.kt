package org.indiafoss.companion.core

import java.io.File
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Refresh state must not let a recent check read as recent data (#191). */
class ScheduleFreshnessTest {
    private val now = instant("2026-09-11T06:00:00Z")
    private val hour = 3_600_000L
    private val day = 24 * hour

    private fun instant(iso: String) = OffsetDateTime.parse(iso).toInstant().toEpochMilli()

    /** An ISO instant in the event's own offset, the shape upstream would send. */
    private fun iso(millis: Long) =
        OffsetDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneOffset.ofHoursMinutes(5, 30)).toString()

    private fun bundle(status: String? = null, updatedAt: String? = null) = EventBundle(
        id = "indiafoss-2026",
        name = "IndiaFOSS 2026",
        timezone = "Asia/Kolkata",
        start = "2026-09-26T09:00:00+05:30",
        end = "2026-09-27T17:00:00+05:30",
        sourceMetadata = SourceMetadata(scheduleStatus = status, sourceUpdatedAt = updatedAt),
    )

    @Test
    fun `anchors an unzoned upstream timestamp to the event offset`() {
        assertEquals(
            instant("2026-09-10T06:35:56.522Z"),
            ScheduleFreshness.parseSourceTimestamp("2026-09-10 12:05:56.522624", "+05:30"),
        )
        assertEquals("+05:30", ScheduleFreshness.offsetOf("2026-09-26T09:00:00+05:30"))
        assertEquals("+00:00", ScheduleFreshness.offsetOf("2026-09-26T03:30:00Z"))
        assertNull(ScheduleFreshness.offsetOf("2026-09-26T09:00:00"))
        assertNull(ScheduleFreshness.parseSourceTimestamp("2026-09-10 12:05:56", null))
        assertNull(ScheduleFreshness.parseSourceTimestamp(null, "+05:30"))
        assertNull(ScheduleFreshness.parseSourceTimestamp("not a date", "+05:30"))
    }

    @Test
    fun `describes elapsed time coarsely`() {
        assertEquals("less than an hour ago", ScheduleFreshness.describeElapsed(5 * 60_000L))
        assertEquals("1 hour ago", ScheduleFreshness.describeElapsed(hour))
        assertEquals("5 hours ago", ScheduleFreshness.describeElapsed(5 * hour))
        assertEquals("1 day ago", ScheduleFreshness.describeElapsed(day))
        assertEquals("9 days ago", ScheduleFreshness.describeElapsed(9 * day))
    }

    @Test
    fun `calls a draft programme provisional`() {
        val state = ScheduleFreshness.describe(
            bundle("draft", "2026-09-10 12:05:56.522624"),
            lastCheckedAt = now - hour,
            source = ScheduleFreshness.SeedSource.REFRESHED,
            now = now,
        )
        assertTrue(state.provisional)
        assertTrue(state.statusLine!!.startsWith("Provisional"))
        assertEquals(ScheduleFreshness.Age.CURRENT, state.age)
    }

    @Test
    fun `says nothing about status when the bundle does not`() {
        val state = ScheduleFreshness.describe(
            bundle(null, "2026-09-11 11:00:00"),
            lastCheckedAt = now - hour,
            source = ScheduleFreshness.SeedSource.REFRESHED,
            now = now,
        )
        assertFalse(state.provisional)
        assertNull(state.statusLine)
    }

    @Test
    fun `buckets the import age from the bundle, not from the last check`() {
        fun age(daysAgo: Int) = ScheduleFreshness.describe(
            bundle("confirmed", iso(now - daysAgo * day)),
            lastCheckedAt = now - 60_000L,
            source = ScheduleFreshness.SeedSource.REFRESHED,
            now = now,
        ).age
        assertEquals(ScheduleFreshness.Age.CURRENT, age(0))
        assertEquals(ScheduleFreshness.Age.CURRENT, age(1))
        assertEquals(ScheduleFreshness.Age.AGEING, age(3))
        assertEquals(ScheduleFreshness.Age.STALE, age(8))
    }

    @Test
    fun `a check a minute ago does not make month-old data look current`() {
        val state = ScheduleFreshness.describe(
            bundle("confirmed", iso(now - 30 * day)),
            lastCheckedAt = now - 60_000L,
            source = ScheduleFreshness.SeedSource.REFRESHED,
            now = now,
        )
        assertFalse(state.checkOverdue)
        assertEquals(ScheduleFreshness.Age.STALE, state.age)
        assertTrue(state.importedLine.contains("treat these times as out of date"))
        assertTrue(state.checkedLine.contains("That is when it looked, not how old the programme is."))
    }

    @Test
    fun `an undated import is not presented as fresh`() {
        val state = ScheduleFreshness.describe(
            bundle("confirmed", null),
            lastCheckedAt = now,
            source = ScheduleFreshness.SeedSource.REFRESHED,
            now = now,
        )
        assertEquals(ScheduleFreshness.Age.UNKNOWN, state.age)
        assertEquals("This schedule does not record when it was imported.", state.importedLine)
    }

    @Test
    fun `a bundle still coming from the APK assets says so`() {
        val seeded = ScheduleFreshness.describe(
            bundle("confirmed", iso(now - hour)),
            lastCheckedAt = now,
            source = ScheduleFreshness.SeedSource.SEED,
            now = now,
        )
        assertTrue(seeded.sourceLine!!.contains("built into this app release"))

        val refreshed = ScheduleFreshness.describe(
            bundle("confirmed", iso(now - hour)),
            lastCheckedAt = now,
            source = ScheduleFreshness.SeedSource.REFRESHED,
            now = now,
        )
        assertNull(refreshed.sourceLine)
    }

    @Test
    fun `says plainly when this device has never checked`() {
        val state = ScheduleFreshness.describe(
            bundle("confirmed", iso(now - hour)),
            lastCheckedAt = null,
            source = ScheduleFreshness.SeedSource.REFRESHED,
            now = now,
        )
        assertTrue(state.checkOverdue)
        assertTrue(state.checkedLine.contains("has not checked for a newer programme yet"))
    }

    @Test
    fun `is honest with no bundle at all`() {
        val state = ScheduleFreshness.describe(
            null,
            lastCheckedAt = null,
            source = ScheduleFreshness.SeedSource.NONE,
            now = now,
        )
        assertEquals(ScheduleFreshness.Age.UNKNOWN, state.age)
        assertNull(state.statusLine)
        assertEquals("No schedule is stored on this device.", state.sourceLine)
    }

    /** The packaged 2026 bundle is the one the app actually opens on. */
    @Test
    fun `the packaged bundle's own metadata drives the wording`() {
        val packaged = EventRevisionCache.decodeBundle(
            File(repoRoot(), "events/indiafoss-2026/normalized/event-bundle.json").readText(),
            "indiafoss-2026",
        )
        val state = ScheduleFreshness.describe(
            packaged,
            lastCheckedAt = null,
            source = ScheduleFreshness.SeedSource.SEED,
            now = now,
        )
        // Whatever the current import says, the UI must never be silent about it.
        assertTrue(state.importedLine.isNotBlank())
        assertEquals(packaged.sourceMetadata.scheduleStatus == "draft", state.provisional)
    }

    private fun repoRoot(): File =
        generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
            .first { File(it, "pnpm-workspace.yaml").isFile }
}
