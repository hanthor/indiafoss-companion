package org.indiafoss.companion.calendar

import android.Manifest
import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Reminders
import org.indiafoss.companion.core.CalendarOp
import org.indiafoss.companion.core.CalendarReconciler
import org.indiafoss.companion.core.CalendarRow
import org.indiafoss.companion.core.PlannedEntry

/**
 * The plan in the phone's own calendar (#272): an app-owned local calendar
 * called "IndiaFOSS", written through `CalendarContract` as a sync adapter
 * (`ACCOUNT_TYPE_LOCAL`), so the rows are really removed rather than marked
 * deleted and the identity columns can be written. `sync()` reads the rows
 * of that one calendar, hands them with the wanted entries to the pure
 * `CalendarReconciler`, and applies the resulting inserts, in-place updates
 * and deletes in one batch. Nothing here ever queries or writes another
 * calendar; `disconnect()` removes the app's calendar and everything in it.
 *
 * The provider is the only Android dependency; the decisions live in `:core`.
 */
class CalendarSync(private val context: Context) {
    sealed class Result {
        data class Synced(val entries: Int, val inserted: Int, val updated: Int, val deleted: Int) : Result()
        data class Removed(val entries: Int) : Result()
        object PermissionDenied : Result()
        data class Failed(val reason: String) : Result()
    }

    private val resolver get() = context.contentResolver

    fun hasPermission(): Boolean = PERMISSIONS.all {
        context.checkPermission(it, android.os.Process.myPid(), android.os.Process.myUid()) == PackageManager.PERMISSION_GRANTED
    }

    /** Make the calendar hold exactly `desired`; creates the calendar on first use. */
    fun sync(desired: List<PlannedEntry>): Result {
        if (!hasPermission()) return Result.PermissionDenied
        return try {
            val calendarId = findCalendar() ?: createCalendar()
            // Rows another app soft-deleted in our calendar have no sync adapter to purge them.
            resolver.delete(Events.CONTENT_URI.asSyncAdapter(), "${Events.CALENDAR_ID} = ? AND ${Events.DELETED} = 1", arrayOf(calendarId.toString()))
            val ops = CalendarReconciler.reconcile(desired, rows(calendarId), calendarId)
            apply(calendarId, ops)
            Result.Synced(
                entries = desired.distinctBy { it.identity.occurrenceKey }.size,
                inserted = ops.count { it is CalendarOp.Insert },
                updated = ops.count { it is CalendarOp.Update },
                deleted = ops.count { it is CalendarOp.Delete },
            )
        } catch (e: Exception) {
            Result.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    /** Remove the app's calendar and every entry in it; other calendars are not consulted. */
    fun disconnect(): Result {
        if (!hasPermission()) return Result.PermissionDenied
        return try {
            val calendarId = findCalendar() ?: return Result.Removed(0)
            val args = arrayOf(calendarId.toString())
            val entries = resolver.delete(Events.CONTENT_URI.asSyncAdapter(), "${Events.CALENDAR_ID} = ?", args)
            resolver.delete(ContentUris.withAppendedId(Calendars.CONTENT_URI, calendarId).asSyncAdapter(), null, null)
            Result.Removed(entries)
        } catch (e: Exception) {
            Result.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    /** The app's calendar, if it has been created. */
    fun findCalendar(): Long? {
        resolver.query(
            Calendars.CONTENT_URI, arrayOf(Calendars._ID),
            "${Calendars.ACCOUNT_NAME} = ? AND ${Calendars.ACCOUNT_TYPE} = ?", arrayOf(ACCOUNT_NAME, CalendarContract.ACCOUNT_TYPE_LOCAL), null,
        )?.use { c -> if (c.moveToFirst()) return c.getLong(0) }
        return null
    }

    private fun createCalendar(): Long {
        val values = android.content.ContentValues().apply {
            put(Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
            put(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
            put(Calendars.NAME, CALENDAR_NAME)
            put(Calendars.CALENDAR_DISPLAY_NAME, CALENDAR_NAME)
            put(Calendars.CALENDAR_COLOR, CALENDAR_COLOR)
            put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER)
            put(Calendars.OWNER_ACCOUNT, ACCOUNT_NAME)
            put(Calendars.VISIBLE, 1)
            put(Calendars.SYNC_EVENTS, 1)
            put(Calendars.CALENDAR_TIME_ZONE, TIME_ZONE)
            put(Calendars.ALLOWED_REMINDERS, "${Reminders.METHOD_DEFAULT},${Reminders.METHOD_ALERT}")
        }
        val uri = resolver.insert(Calendars.CONTENT_URI.asSyncAdapter(), values) ?: error("The calendar provider refused to create the calendar")
        return ContentUris.parseId(uri)
    }

    /** Every row of the app's calendar, as the reconciler sees it. */
    fun rows(calendarId: Long): List<CalendarRow> {
        val rows = ArrayList<CalendarRow>()
        resolver.query(
            Events.CONTENT_URI, ROW_PROJECTION, "${Events.CALENDAR_ID} = ?", arrayOf(calendarId.toString()), null,
        )?.use { c ->
            while (c.moveToNext()) {
                rows += CalendarRow(
                    rowId = c.getLong(0), calendarId = c.getLong(1),
                    occurrenceKey = c.getString(2), proposalKey = c.getString(3),
                    title = c.getString(4).orEmpty(), startMs = c.getLong(5), endMs = c.getLong(6),
                    location = c.getString(7), description = c.getString(8),
                )
            }
        }
        return rows
    }

    private fun apply(calendarId: Long, ops: List<CalendarOp>) {
        // An insert and its reminder must share a batch: the reminder refers back to the insert's index.
        val groups = ops.map { op ->
            when (op) {
                is CalendarOp.Insert -> listOf(
                    ContentProviderOperation.newInsert(Events.CONTENT_URI.asSyncAdapter())
                        .withValue(Events.CALENDAR_ID, calendarId)
                        .withValues(op.entry.values())
                        .withValue(Events.HAS_ALARM, 1)
                        .build(),
                    null, // placeholder, replaced below with the back-referencing reminder
                )
                is CalendarOp.Update -> listOf(
                    ContentProviderOperation.newUpdate(ContentUris.withAppendedId(Events.CONTENT_URI, op.rowId).asSyncAdapter())
                        .withValues(op.entry.values()).build(),
                )
                is CalendarOp.Delete -> listOf(
                    ContentProviderOperation.newDelete(ContentUris.withAppendedId(Events.CONTENT_URI, op.rowId).asSyncAdapter()).build(),
                )
            }
        }
        var batch = ArrayList<ContentProviderOperation>()
        fun flush() {
            if (batch.isNotEmpty()) resolver.applyBatch(CalendarContract.AUTHORITY, batch)
            batch = ArrayList()
        }
        for (group in groups) {
            if (batch.size + group.size > BATCH_LIMIT) flush()
            for (op in group) {
                if (op != null) { batch += op; continue }
                batch += ContentProviderOperation.newInsert(Reminders.CONTENT_URI.asSyncAdapter())
                    .withValueBackReference(Reminders.EVENT_ID, batch.size - 1)
                    .withValue(Reminders.MINUTES, ALARM_MINUTES_BEFORE)
                    .withValue(Reminders.METHOD, Reminders.METHOD_ALERT)
                    .build()
            }
        }
        flush()
    }

    private fun PlannedEntry.values() = android.content.ContentValues().apply {
        put(Events.TITLE, title)
        put(Events.DTSTART, startMs)
        put(Events.DTEND, endMs)
        put(Events.EVENT_TIMEZONE, TIME_ZONE)
        put(Events.EVENT_LOCATION, location)
        put(Events.DESCRIPTION, description)
        put(Events.SYNC_DATA1, identity.occurrenceKey)
        put(Events.SYNC_DATA2, identity.proposalKey)
        put(Events._SYNC_ID, identity.occurrenceKey)
        put(Events.CUSTOM_APP_PACKAGE, context.packageName)
        put(Events.CUSTOM_APP_URI, appUri)
    }

    private fun Uri.asSyncAdapter(): Uri = buildUpon()
        .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(Calendars.ACCOUNT_NAME, ACCOUNT_NAME)
        .appendQueryParameter(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
        .build()

    companion object {
        const val ACCOUNT_NAME = "IndiaFOSS Companion"
        const val CALENDAR_NAME = "IndiaFOSS"
        const val TIME_ZONE = "Asia/Kolkata"
        const val ALARM_MINUTES_BEFORE = 10
        /** The mint the theme falls back to below Android 12. */
        const val CALENDAR_COLOR = 0xFF0FB556.toInt()
        private const val BATCH_LIMIT = 200
        val PERMISSIONS = arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        val ROW_PROJECTION = arrayOf(
            Events._ID, Events.CALENDAR_ID, Events.SYNC_DATA1, Events.SYNC_DATA2,
            Events.TITLE, Events.DTSTART, Events.DTEND, Events.EVENT_LOCATION, Events.DESCRIPTION,
        )
    }
}
