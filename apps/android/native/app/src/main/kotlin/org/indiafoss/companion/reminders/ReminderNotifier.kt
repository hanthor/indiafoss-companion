package org.indiafoss.companion.reminders

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import org.indiafoss.companion.MainActivity
import org.indiafoss.companion.R
import org.indiafoss.companion.core.Reminders

/** Posts one reminder notification; shared by the alarm receiver and the day simulator. */
object ReminderNotifier {
    fun post(context: Context, id: String, title: String, body: String, activityId: String? = null) {
        ReminderScheduler.ensureChannel(context)
        // Tapping the reminder opens the session it is about, not just the app.
        val open = PendingIntent.getActivity(
            context, Reminders.numericId(id),
            Intent(context, MainActivity::class.java).apply {
                if (activityId != null) data = android.net.Uri.parse("indiafoss://activity/$activityId")
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, ReminderScheduler.CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(Reminders.numericId(id), notification)
    }
}
