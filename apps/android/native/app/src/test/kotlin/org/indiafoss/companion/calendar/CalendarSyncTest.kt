package org.indiafoss.companion.calendar

import android.Manifest
import android.content.ContentProvider
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.CalendarContract
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Reminders
import androidx.test.core.app.ApplicationProvider
import org.indiafoss.companion.core.PlannedEntry
import org.indiafoss.companion.core.PlannedIdentity
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * `CalendarSync` against an in-memory stand-in for the calendar provider:
 * the same `CalendarContract` URIs, selections and batches, minus the real
 * provider's SQLite. What this proves is the adapter's contract with the
 * provider (which calendar it creates, what it writes on a row, what it
 * deletes); how the real provider behaves on a phone is not covered here.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CalendarSyncTest {
    private lateinit var context: Context
    private lateinit var provider: FakeCalendarProvider
    private lateinit var sync: CalendarSync

    private val t0 = 1_790_000_000_000L
    private val hour = 3_600_000L

    private fun entry(id: String, proposal: String? = null, title: String = "Talk $id", start: Long = t0, room: String? = "Audi 1") =
        PlannedEntry(PlannedIdentity("indiafoss-2026", id, proposal), title, start, start + hour, room, "Asha Menon", "indiafoss://activity/$id")

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        provider = Robolectric.setupContentProvider(FakeCalendarProvider::class.java, CalendarContract.AUTHORITY)
        shadowOf(context.applicationContext as android.app.Application).grantPermissions(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        sync = CalendarSync(context)
    }

    private fun ownedEvents(): List<ContentValues> {
        val id = sync.findCalendar() ?: return emptyList()
        return provider.events.values.filter { it.getAsLong(Events.CALENDAR_ID) == id }
    }

    @Test
    fun `first sync creates one local app-owned calendar and fills it, a second sync changes nothing`() {
        val first = sync.sync(listOf(entry("a"), entry("b", start = t0 + hour)))
        assertEquals(CalendarSync.Result.Synced(entries = 2, inserted = 2, updated = 0, deleted = 0), first)
        assertEquals(1, provider.calendars.size)
        val calendar = provider.calendars.values.single()
        assertEquals(CalendarContract.ACCOUNT_TYPE_LOCAL, calendar.getAsString(Calendars.ACCOUNT_TYPE))
        assertEquals(CalendarSync.ACCOUNT_NAME, calendar.getAsString(Calendars.ACCOUNT_NAME))
        assertEquals("IndiaFOSS", calendar.getAsString(Calendars.CALENDAR_DISPLAY_NAME))
        assertTrue(provider.syncAdapterWrites.all { it }, "every write goes through the sync-adapter URI")
        val rows = ownedEvents()
        assertEquals(2, rows.size)
        val a = rows.first { it.getAsString(Events.SYNC_DATA1) == "indiafoss/indiafoss-2026/a" }
        assertEquals("Talk a", a.getAsString(Events.TITLE))
        assertEquals(t0, a.getAsLong(Events.DTSTART))
        assertEquals("Audi 1", a.getAsString(Events.EVENT_LOCATION))
        assertEquals("indiafoss://activity/a", a.getAsString(Events.CUSTOM_APP_URI))
        assertEquals(context.packageName, a.getAsString(Events.CUSTOM_APP_PACKAGE))
        assertNull(a.getAsString(Events.SYNC_DATA2))
        assertEquals(2, provider.reminders.size)
        assertEquals(10, provider.reminders.values.first().getAsInteger(Reminders.MINUTES))
        assertTrue(provider.reminders.values.map { it.getAsLong(Reminders.EVENT_ID) }.toSet() == rows.map { it.getAsLong(Events._ID) }.toSet(), "reminders point at the inserted rows")

        val second = sync.sync(listOf(entry("a"), entry("b", start = t0 + hour)))
        assertEquals(CalendarSync.Result.Synced(2, 0, 0, 0), second)
        assertEquals(1, provider.calendars.size)
        assertEquals(2, ownedEvents().size)
        assertEquals(2, provider.reminders.size)
    }

    @Test
    fun `a changed plan updates in place, removes what left and adds what came`() {
        sync.sync(listOf(entry("a"), entry("b", start = t0 + hour)))
        val idOfA = ownedEvents().first { it.getAsString(Events.SYNC_DATA1).endsWith("/a") }.getAsLong(Events._ID)
        val result = sync.sync(listOf(entry("a", start = t0 + 3 * hour, room = "Hall 2"), entry("c", proposal = "cfp-9")))
        assertEquals(CalendarSync.Result.Synced(2, 1, 1, 1), result)
        val rows = ownedEvents()
        assertEquals(2, rows.size)
        val a = rows.first { it.getAsString(Events.SYNC_DATA1).endsWith("/a") }
        assertEquals(idOfA, a.getAsLong(Events._ID))
        assertEquals(t0 + 3 * hour, a.getAsLong(Events.DTSTART))
        assertEquals("Hall 2", a.getAsString(Events.EVENT_LOCATION))
        assertEquals("indiafoss/indiafoss-2026/cfp/cfp-9", rows.first { it.getAsString(Events.SYNC_DATA1).endsWith("/c") }.getAsString(Events.SYNC_DATA2))
        assertTrue(rows.none { it.getAsString(Events.SYNC_DATA1).endsWith("/b") })
    }

    @Test
    fun `another calendar with look-alike rows is never read or written`() {
        val foreign = provider.seedCalendar("someone@example.org", "com.example")
        val lookAlike = provider.seedEvent(foreign, "indiafoss/indiafoss-2026/a", "Talk a", t0)
        sync.sync(listOf(entry("a", title = "Talk a (renamed)")))
        val before = ContentValues(provider.events.getValue(lookAlike))
        sync.sync(emptyList())
        assertEquals(before, provider.events.getValue(lookAlike))
        assertEquals("Talk a", provider.events.getValue(lookAlike).getAsString(Events.TITLE))
        assertEquals(0, ownedEvents().size)
        assertTrue(provider.queriedCalendarIds.all { it == sync.findCalendar() }, "event queries name only the app's calendar: ${provider.queriedCalendarIds}")
        assertIs<CalendarSync.Result.Removed>(sync.disconnect())
        assertTrue(lookAlike in provider.events)
        assertTrue(foreign in provider.calendars)
    }

    @Test
    fun `disconnect removes the calendar and every entry in it`() {
        sync.sync(listOf(entry("a"), entry("b")))
        val owned = assertNotNull(sync.findCalendar())
        assertEquals(CalendarSync.Result.Removed(2), sync.disconnect())
        assertNull(sync.findCalendar())
        assertTrue(owned !in provider.calendars)
        assertTrue(provider.events.values.none { it.getAsLong(Events.CALENDAR_ID) == owned })
        assertEquals(CalendarSync.Result.Removed(0), sync.disconnect())
    }

    @Test
    fun `without the permission nothing is touched`() {
        shadowOf(context.applicationContext as android.app.Application).denyPermissions(Manifest.permission.WRITE_CALENDAR)
        assertEquals(CalendarSync.Result.PermissionDenied, sync.sync(listOf(entry("a"))))
        assertEquals(CalendarSync.Result.PermissionDenied, sync.disconnect())
        assertTrue(provider.calendars.isEmpty() && provider.events.isEmpty())
    }
}

/**
 * Enough of the calendar provider for the adapter: three tables keyed by row
 * id, selections of the form `col = ?` / `col = 0` joined by AND, ids in the
 * path, and the default `applyBatch`, which resolves back references.
 */
class FakeCalendarProvider : ContentProvider() {
    val calendars = LinkedHashMap<Long, ContentValues>()
    val events = LinkedHashMap<Long, ContentValues>()
    val reminders = LinkedHashMap<Long, ContentValues>()
    val syncAdapterWrites = ArrayList<Boolean>()
    val queriedCalendarIds = ArrayList<Long>()
    private var nextId = 100L

    override fun onCreate() = true

    fun seedCalendar(account: String, type: String): Long {
        val id = nextId++
        calendars[id] = ContentValues().apply { put("_id", id); put(Calendars.ACCOUNT_NAME, account); put(Calendars.ACCOUNT_TYPE, type) }
        return id
    }

    fun seedEvent(calendarId: Long, key: String, title: String, start: Long): Long {
        val id = nextId++
        events[id] = ContentValues().apply {
            put("_id", id); put(Events.CALENDAR_ID, calendarId); put(Events.SYNC_DATA1, key); put(Events.TITLE, title)
            put(Events.DTSTART, start); put(Events.DTEND, start + 1)
        }
        return id
    }

    private fun table(uri: Uri) = when (uri.pathSegments.first()) {
        "calendars" -> calendars
        "events" -> events
        "reminders" -> reminders
        else -> error("unexpected table ${uri.path}")
    }

    private fun pathId(uri: Uri) = uri.pathSegments.getOrNull(1)?.toLongOrNull()

    private fun matching(uri: Uri, selection: String?, args: Array<out String>?): List<Long> {
        val id = pathId(uri)
        val clauses = selection?.split(" AND ")?.map { it.trim() }.orEmpty()
        var argIndex = 0
        val wanted = clauses.map { clause ->
            val (column, value) = clause.split(" = ", limit = 2)
            column to if (value == "?") args!![argIndex++] else value
        }
        if (uri.pathSegments.first() == "events") wanted.firstOrNull { it.first == Events.CALENDAR_ID }?.let { queriedCalendarIds += it.second.toLong() }
        return table(uri).filter { (rowId, values) ->
            (id == null || id == rowId) && wanted.all { (column, expected) ->
                val actual = if (column == "_id") rowId.toString() else values.getAsString(column) ?: if (column == Events.DELETED) "0" else null
                actual == expected
            }
        }.keys.toList()
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor {
        val t = table(uri)
        val columns = projection?.toList() ?: (listOf("_id") + t.values.flatMap { it.keySet() }.distinct())
        val cursor = MatrixCursor(columns.toTypedArray())
        for (rowId in matching(uri, selection, args)) {
            val values = t.getValue(rowId)
            cursor.addRow(columns.map { if (it == "_id") rowId else values.get(it) }.toTypedArray())
        }
        return cursor
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri {
        syncAdapterWrites += uri.getQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER) == "true"
        val id = nextId++
        table(uri)[id] = ContentValues(values).apply { put("_id", id) }
        return ContentUris.withAppendedId(uri, id)
    }

    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?): Int {
        syncAdapterWrites += uri.getQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER) == "true"
        val rows = matching(uri, selection, args)
        for (id in rows) table(uri).getValue(id).putAll(values)
        return rows.size
    }

    override fun delete(uri: Uri, selection: String?, args: Array<out String>?): Int {
        syncAdapterWrites += uri.getQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER) == "true"
        val rows = matching(uri, selection, args)
        for (id in rows) table(uri).remove(id)
        return rows.size
    }

    override fun getType(uri: Uri): String? = null
}
