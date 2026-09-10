package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ScheduleGridTest {
    private fun activity(id: String, start: String?, end: String?, room: String? = "hall-1") =
        Activity(id = id, title = id, start = start, end = end, locationId = room)

    private val bundle = EventBundle(
        id = "t", name = "Test", timezone = "Asia/Kolkata",
        start = "2025-09-20T09:00:00+05:30", end = "2025-09-21T18:00:00+05:30",
        locations = listOf(Location("hall-1", "Main hall"), Location("hall-10", "Room ten"), Location("hall-2", "Room two"), Location("quiet", "Quiet room")),
        activities = listOf(
            activity("a", "2025-09-20T10:00:00+05:30", "2025-09-20T10:45:00+05:30"),
            activity("b", "2025-09-20T10:15:00+05:30", "2025-09-20T10:30:00+05:30"),
            activity("c", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30", room = "hall-2"),
            activity("d", "2025-09-20T10:30:00+05:30", "2025-09-20T11:00:00+05:30", room = "hall-10"),
            activity("e", "2025-09-21T10:00:00+05:30", "2025-09-21T10:30:00+05:30", room = "hall-2"),
            activity("no-room", "2025-09-20T10:00:00+05:30", "2025-09-20T10:30:00+05:30", room = null),
            activity("unplaced", null, null),
            activity("backwards", "2025-09-20T12:00:00+05:30", "2025-09-20T11:00:00+05:30"),
        ),
    )

    private fun day(day: String) = Schedule.activitiesForDay(bundle, day)

    @Test
    fun `columns are the rooms with a drawable session that day, in natural id order`() {
        val layout = ScheduleGrid.layout(bundle, day("2025-09-20"), "2025-09-20")
        assertEquals(listOf("hall-1", "hall-2", "hall-10"), layout.columns.map { it.locationId })
        assertEquals(listOf("Main hall", "Room two", "Room ten"), layout.columns.map { it.name })
        // The other day's session, the room-less, unplaced and inverted ones never draw.
        assertEquals(listOf("a", "b", "c", "d"), layout.columns.flatMap { it.slots }.map { it.activity.id }.sorted())
    }

    @Test
    fun `day filtering keeps the grid to one day`() {
        val layout = ScheduleGrid.layout(bundle, day("2025-09-21"), "2025-09-21")
        assertEquals(listOf("hall-2"), layout.columns.map { it.locationId })
        assertEquals(listOf("e"), layout.columns.single().slots.map { it.activity.id })
    }

    @Test
    fun `overlapping sessions in one room share lanes first-fit`() {
        val layout = ScheduleGrid.layout(bundle, day("2025-09-20"), "2025-09-20")
        val hall = layout.columns.first { it.locationId == "hall-1" }
        val a = hall.slots.first { it.activity.id == "a" }
        val b = hall.slots.first { it.activity.id == "b" }
        assertEquals(0, a.lane)
        assertEquals(1, b.lane)
        assertEquals(2, a.lanes)
        assertEquals(2, b.lanes)
        // Rooms without overlaps keep a single full-width lane.
        assertEquals(1, layout.columns.first { it.locationId == "hall-2" }.slots.single().lanes)
    }

    @Test
    fun `a lane is reused once the session in it has ended`() {
        val start = Schedule.parseInstant("2025-09-20T10:00:00+05:30")
        val slots = ScheduleGrid.lanes(
            listOf(
                activity("x", "2025-09-20T10:00:00+05:30", "2025-09-20T10:30:00+05:30"),
                activity("y", "2025-09-20T10:15:00+05:30", "2025-09-20T10:45:00+05:30"),
                activity("z", "2025-09-20T10:30:00+05:30", "2025-09-20T11:00:00+05:30"),
            ),
            start,
        )
        assertEquals(listOf(0, 1, 0), slots.map { it.lane })
        assertEquals(listOf(0, 15, 30), slots.map { it.topMinutes })
        assertEquals(listOf(30, 30, 30), slots.map { it.heightMinutes })
    }

    @Test
    fun `offsets and heights are minutes from the earliest start, never shorter than the minimum`() {
        val layout = ScheduleGrid.layout(bundle, day("2025-09-20"), "2025-09-20")
        assertEquals(Schedule.parseInstant("2025-09-20T10:00:00+05:30"), layout.startMs)
        // Earliest start 10:00, latest end 11:30: the inverted session is not drawn, but its end still counts for the range.
        assertEquals(90, layout.totalMinutes)
        val c = layout.columns.first { it.locationId == "hall-2" }.slots.single()
        assertEquals(60, c.topMinutes)
        assertEquals(30, c.heightMinutes)
        val tiny = ScheduleGrid.lanes(listOf(activity("t", "2025-09-20T10:00:00+05:30", "2025-09-20T10:02:00+05:30")), layout.startMs).single()
        assertEquals(ScheduleGrid.MIN_SLOT_MINUTES, tiny.heightMinutes)
    }

    @Test
    fun `hour ticks fall on whole hours of the event offset`() {
        val layout = ScheduleGrid.layout(bundle, day("2025-09-20"), "2025-09-20")
        assertEquals(listOf("10:00", "11:00"), layout.ticks.map { it.label })
        assertEquals(listOf(0, 60), layout.ticks.map { it.minutesFromStart })
        val shifted = ScheduleGrid.layout(
            bundle,
            listOf(activity("s", "2025-09-20T09:20:00+05:30", "2025-09-20T10:10:00+05:30")),
            "2025-09-20",
        )
        assertEquals(listOf("10:00"), shifted.ticks.map { it.label })
        assertEquals(listOf(40), shifted.ticks.map { it.minutesFromStart })
    }

    @Test
    fun `an empty day still spans an hour from midnight`() {
        val layout = ScheduleGrid.layout(bundle, emptyList(), "2025-09-20")
        assertEquals(Schedule.parseInstant("2025-09-20T00:00:00+05:30"), layout.startMs)
        assertEquals(60, layout.totalMinutes)
        assertTrue(layout.columns.isEmpty())
    }

    @Test
    fun `room chips are the bundle rooms used that day in bundle order`() {
        assertEquals(listOf("hall-1", "hall-10", "hall-2"), ScheduleGrid.rooms(bundle, day("2025-09-20")).map { it.id })
        assertEquals(listOf("hall-2"), ScheduleGrid.rooms(bundle, day("2025-09-21")).map { it.id })
    }

    @Test
    fun `natural order compares digit runs by value`() {
        val sorted = listOf("hall-10", "hall-2", "Hall-1", "audi").sortedWith(ScheduleGrid.naturalOrder)
        assertEquals(listOf("audi", "Hall-1", "hall-2", "hall-10"), sorted)
    }
}
