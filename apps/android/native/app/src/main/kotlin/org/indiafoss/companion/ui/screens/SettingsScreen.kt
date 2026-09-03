package org.indiafoss.companion.ui.screens

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(state: UiState, onReminders: (Boolean) -> Unit, onRoutingProfile: (String) -> Unit) {
    val context = LocalContext.current
    // Android 13+ asks for the notification permission; below that it is granted by install.
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        onReminders(granted)
    }
    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Reminders", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Local \"starting soon\" and \"leave now\" alerts for your bookmarked sessions. " +
                            "Sessions marked must attend also get a heads-up 30 minutes before and an alert as they start. " +
                            "Alarms on this phone, no push service, nothing leaves the device.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Enable reminders", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        Switch(
                            checked = state.remindersEnabled,
                            onCheckedChange = { on ->
                                if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    askPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else onReminders(on)
                            },
                        )
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        TextButton(onClick = {
                            context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
                        }) { Text("Allow exact alarms for on-the-minute timing") }
                    }
                }
            }
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Getting around", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "How walk times between rooms are worked out.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    val options = listOf("fastest" to "Fastest", "avoid-stairs" to "Avoid stairs", "accessible" to "Step-free")
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        options.forEachIndexed { index, (value, label) ->
                            SegmentedButton(
                                selected = state.routingProfile == value,
                                onClick = { onRoutingProfile(value) },
                                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                                label = { Text(label) },
                            )
                        }
                    }
                }
            }
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Privacy", style = MaterialTheme.typography.titleMedium)
                    listOf(
                        "No account is required.",
                        "Schedule, ranking, plan and reminders stay on this device.",
                        "The only network call is a check for a newer programme, from the public site.",
                    ).forEach {
                        Text("•  $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("About", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "IndiaFOSS Companion, native. An unofficial community app built with AI assistance; " +
                            "not produced or endorsed by FOSS United. AGPL-3.0-or-later.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
