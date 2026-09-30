package org.indiafoss.companion

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.core.content.IntentCompat
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.indiafoss.companion.ui.CompanionApp
import org.indiafoss.companion.ui.theme.CompanionTheme

class MainActivity : ComponentActivity() {
    private val viewModel: CompanionViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        org.indiafoss.companion.reminders.ReminderScheduler.ensureChannel(this)
        intent?.let(::handle)
        setContent {
            val state by viewModel.state.collectAsStateWithLifecycle()
            CompanionTheme(dynamicColor = state.dynamicColor) {
                CompanionApp(viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    /** A deep link, or a personal-data export shared or opened from another app. */
    private fun handle(intent: Intent) {
        when (intent.action) {
            Intent.ACTION_SEND -> viewModel.receiveSharedPersonalData(
                IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java),
                intent.getStringExtra(Intent.EXTRA_TEXT),
            )
            Intent.ACTION_VIEW ->
                if (intent.data?.scheme == "content" || intent.data?.scheme == "file") {
                    viewModel.receiveSharedPersonalData(intent.data, null)
                } else {
                    intent.dataString?.let(viewModel::openDeepLink)
                }
        }
    }

    override fun onStart() {
        super.onStart()
        viewModel.startSchedulePolling()
    }

    override fun onStop() {
        viewModel.stopSchedulePolling()
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        // "Now" is time-sensitive: recompute the clock whenever we come forward.
        viewModel.tick()
    }
}
