package org.indiafoss.companion

import android.app.AlarmManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.Location
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.reminders.ReminderScheduler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * The alarms follow the resolved plan (#221): an entry that leaves the plan
 * loses its alarms, and arming again — a refresh, a restart — never doubles
 * them. Robolectric's shadow AlarmManager records what was set; this says
 * nothing about delivery on a device.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReminderSchedulerTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val alarms = shadowOf(context.getSystemService(Context.ALARM_SERVICE) as AlarmManager)
    private val scheduler = ReminderScheduler(context)

    // The scheduler reads the real clock, so the sessions sit two hours ahead of it.
    private val nowMs = System.currentTimeMillis()
    private val talkStart = Schedule.formatInstant(nowMs + 2 * 3_600_000L, 330)
    private val talk = Activity(id = "t", title = "Talk", start = talkStart, end = Schedule.formatInstant(nowMs + 3 * 3_600_000L, 330), locationId = "hall")
    private val other = Activity(id = "o", title = "Other", start = Schedule.formatInstant(nowMs + 4 * 3_600_000L, 330), end = Schedule.formatInstant(nowMs + 5 * 3_600_000L, 330), locationId = "hall")
    private val bundle = EventBundle(
        id = "e", name = "E", timezone = "Asia/Kolkata",
        start = Schedule.formatInstant(nowMs - 3_600_000L, 330), end = Schedule.formatInstant(nowMs + 9 * 3_600_000L, 330),
        activities = listOf(talk, other), locations = listOf(Location("hall", "Hall")),
    )

    private fun state(mustAttend: Set<String> = setOf("t"), removed: Set<String> = emptySet(), enabled: Boolean = true) = UiState(
        loading = false, bundle = bundle, now = IsoClock.now(nowMs),
        mustAttend = mustAttend, removedFromPlan = removed, remindersEnabled = enabled,
    )

    private fun armedIds() = alarms.scheduledAlarms.map { it.operation?.let { op -> shadowOf(op).savedIntent.data?.host } }

    @Test
    fun anEntryLeavingThePlanLosesItsAlarmsAndRearmingNeverDuplicates() {
        scheduler.arm(state())
        // Must attend with no walk known: heads-up, start, and leave-now (starting-soon merged into it) — plus the other planned talk's leave-now.
        val first = armedIds()
        assertTrue(first.toString(), "must-t" in first && "start-t" in first && "leave-t" in first)
        assertTrue(first.toString(), "leave-o" in first)
        assertEquals(first.toSet().size, first.size)

        scheduler.arm(state())
        assertEquals(first.sorted(), armedIds().sorted())

        scheduler.arm(state(removed = setOf("t")))
        val afterRemoval = armedIds()
        assertTrue(afterRemoval.toString(), afterRemoval.none { it!!.endsWith("-t") })
        assertTrue(afterRemoval.toString(), "leave-o" in afterRemoval)

        scheduler.arm(state(removed = setOf("t"), mustAttend = emptySet()))
        assertTrue(armedIds().toString(), "leave-o" in armedIds())

        scheduler.arm(state(enabled = false))
        assertEquals(emptyList<String?>(), armedIds())
    }

    @Test
    fun aConflictedDayArmsNothingUntilResolved() {
        val clash = talk.copy(id = "c", title = "Clash")
        val conflicted = state(mustAttend = setOf("t", "c")).copy(bundle = bundle.copy(activities = listOf(talk, other, clash)))
        scheduler.arm(conflicted)
        assertEquals(emptyList<String?>(), armedIds())
        scheduler.arm(conflicted.copy(removedFromPlan = setOf("c")))
        assertTrue(armedIds().toString(), "must-t" in armedIds())
    }
}
