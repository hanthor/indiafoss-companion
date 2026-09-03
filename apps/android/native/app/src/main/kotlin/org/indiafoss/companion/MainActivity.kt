package org.indiafoss.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import org.indiafoss.companion.ui.CompanionApp
import org.indiafoss.companion.ui.theme.CompanionTheme

class MainActivity : ComponentActivity() {
    private val viewModel: CompanionViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        org.indiafoss.companion.reminders.ReminderScheduler.ensureChannel(this)
        setContent {
            CompanionTheme {
                CompanionApp(viewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // "Now" is time-sensitive: recompute the clock whenever we come forward.
        viewModel.tick()
    }
}
