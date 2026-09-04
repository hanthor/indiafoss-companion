package org.indiafoss.companion.reminders

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import org.indiafoss.companion.MainActivity
import org.indiafoss.companion.R
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Reminders

/**
 * Local reminders through AlarmManager: they fire with the app closed, and
 * there is no push service. `arm()` recomputes the next day's alerts from
 * the current plan and replaces what was set before, so a change of plan
 * (or a schedule update) cancels alarms that no longer apply. Nothing is
 * scheduled until reminders are switched on in Settings.
 */
class ReminderScheduler(private val context: Context) {
    private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val armed = context.getSharedPreferences("reminders", Context.MODE_PRIVATE)

    fun arm(state: UiState) {
        val bundle = state.bundle ?: return
        // While the day simulator runs, the view model fires reminders on the simulated clock instead.
        val wanted = if (!state.remindersEnabled || state.simulation != null) emptyList() else Reminders.compute(
            bundle, System.currentTimeMillis(),
            tierFor = { id ->
                when {
                    id in state.mustAttend -> Reminders.Tier.MUST_ATTEND
                    id in state.bookmarks -> Reminders.Tier.PLANNED
                    else -> Reminders.Tier.NONE
                }
            },
            walkSecondsTo = { locationId -> locationId?.let(state.walkSecondsTo) },
        )
        val previous = armed.getStringSet("ids", emptySet()).orEmpty()
        val next = wanted.map { it.id }.toSet()
        for (id in previous - next) alarms.cancel(pendingIntent(id, null, null, null))
        val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
        for (reminder in wanted) {
            val intent = pendingIntent(reminder.id, reminder.title, reminder.body, reminder.activityId)
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.atMs, intent)
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.atMs, intent)
        }
        armed.edit().putStringSet("ids", next).apply()
    }

    private fun pendingIntent(id: String, title: String?, body: String?, activityId: String?): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            action = "org.indiafoss.companion.REMINDER"
            data = android.net.Uri.parse("reminder://$id")
            putExtra("title", title)
            putExtra("body", body)
            putExtra("activity", activityId)
        }
        return PendingIntent.getBroadcast(
            context, Reminders.numericId(id), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val CHANNEL = "reminders"

        fun ensureChannel(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL, "Session reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                        description = "Starting soon, leave now and must-attend alerts for your plan."
                    },
                )
            }
        }
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: return
        val body = intent.getStringExtra("body") ?: ""
        val id = intent.data?.host ?: intent.data?.toString() ?: title
        ReminderNotifier.post(context, id, title, body, intent.getStringExtra("activity"))
    }
}
