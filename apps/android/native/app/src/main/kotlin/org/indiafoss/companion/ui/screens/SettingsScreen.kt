package org.indiafoss.companion.ui.screens

import org.indiafoss.companion.BuildConfig
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
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.platform.testTag
import org.indiafoss.companion.core.ImportPreview
import org.indiafoss.companion.core.ImportChange

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    state: UiState,
    onReminders: (Boolean) -> Unit,
    onRoutingProfile: (String) -> Unit,
    onStartSimulation: (day: String, time: String, speed: Int) -> Unit = { _, _, _ -> },
    onStopSimulation: () -> Unit = {},
    onDynamicColor: (Boolean) -> Unit = {},
    onCalendarSync: (Boolean) -> Unit = {},
    onExportPersonalData: (android.net.Uri) -> Unit = {},
    onImportPersonalData: (android.net.Uri) -> Unit = {},
    onApplyImport: (Set<String>) -> Unit = {},
    onCancelImport: () -> Unit = {},
    onSetup: () -> Unit = {},
) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    // Android 13+ asks for the notification permission; below that it is granted by install.
    val askPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        onReminders(granted)
    }
    // The phone's calendar (#272): read and write access to it, asked for only when the switch goes on.
    val askCalendar = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        onCalendarSync(granted.values.all { it } && granted.isNotEmpty())
    }
    // The system file picker, both ways (#240): the file never leaves the attendee's choice of place.
    val createDocument = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) onExportPersonalData(uri)
    }
    val openDocument = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) onImportPersonalData(uri)
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
                    Text("Appearance", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            "Light or dark follows the system setting. The everyday screens can take your wallpaper colours; " +
                                "the welcome, Now and devroom surfaces keep the IndiaFOSS green either way."
                        } else {
                            "Light or dark follows the system setting, in the IndiaFOSS 2026 colours."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Use wallpaper colours", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        Switch(checked = state.dynamicColor, onCheckedChange = onDynamicColor)
                    }
                }
            }
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Phone calendar", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Keep an \"IndiaFOSS\" calendar on this phone in step with your plan: sessions are added, " +
                            "moved or removed as your choices and the programme change, with a ten-minute reminder each. " +
                            "It is a local calendar owned by this app; no other calendar is touched.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Keep my plan in the calendar", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        Switch(
                            checked = state.calendarSyncEnabled,
                            onCheckedChange = { on ->
                                if (on) askCalendar.launch(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR))
                                else onCalendarSync(false)
                            },
                        )
                    }
                    state.calendarSyncStatus?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                    if (state.calendarSyncEnabled) {
                        TextButton(onClick = { onCalendarSync(false) }) { Text("Disconnect and remove the calendar") }
                    }
                    Text(
                        "The Calendar button on My plan still shares a .ics file for any calendar app. " +
                            "A file imported that way is a snapshot: it does not update when your plan or the programme changes.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
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
                    Text("Simulate the day", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Run the app through a conference day in minutes: Now, the leave-by banner and every reminder behave as they would, on a clock that runs faster than real time. Your bookmarks and ratings are the real ones.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    val sim = state.simulation
                    if (sim != null) {
                        Text("Running at ${sim.speed}× · now ${state.now.substring(11, 16)}", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary)
                        Button(onClick = onStopSimulation, modifier = Modifier.padding(top = 8.dp)) { Text("Stop simulation") }
                        if (sim.log.isNotEmpty()) {
                            Text("What happened (${sim.log.size})", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp))
                            sim.log.takeLast(12).reversed().forEach { e ->
                                Text("${e.simAt.substring(11, 16)}  ${e.kind}  ${e.title}${if (e.body.isNotBlank()) " — ${e.body}" else ""}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 2.dp))
                            }
                        }
                    } else {
                        var dayIndex by remember { mutableIntStateOf(0) }
                        var time by remember { mutableStateOf("09:00") }
                        var speed by remember { mutableIntStateOf(60) }
                        val days = state.days
                        if (days.size > 1) SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                            days.forEachIndexed { index, _ ->
                                SegmentedButton(selected = dayIndex == index, onClick = { dayIndex = index }, shape = SegmentedButtonDefaults.itemShape(index, days.size), label = { Text("Day ${index + 1}") })
                            }
                        }
                        OutlinedTextField(time, { time = it }, label = { Text("Start at (HH:MM)") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                        val speeds = listOf(10, 60, 300)
                        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                            speeds.forEachIndexed { index, s ->
                                SegmentedButton(selected = speed == s, onClick = { speed = s }, shape = SegmentedButtonDefaults.itemShape(index, speeds.size), label = { Text("${s}×") })
                            }
                        }
                        val ok = days.isNotEmpty() && Regex("^([01]?\\d|2[0-3]):[0-5]\\d$").matches(time.trim())
                        Button(onClick = { onStartSimulation(days[dayIndex.coerceIn(0, days.lastIndex)], time.trim(), speed) }, enabled = ok, modifier = Modifier.padding(top = 8.dp)) { Text("Start simulation") }
                        if (!state.remindersEnabled) Text("Reminders are off, so the run shows the screens but no alerts. Switch them on above to see them fire too.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Setup", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "The welcome steps from the first run: reminders, your card, ranking. Nothing is reset by running them again.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                    TextButton(onClick = onSetup) { Text("Run setup again") }
                }
            }
            PersonalDataCard(
                state,
                onExport = { createDocument.launch("indiafoss-personal-data-${state.now.take(10)}.json") },
                onImport = { openDocument.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) },
                onApply = onApplyImport,
                onCancel = onCancelImport,
            )
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Privacy", style = MaterialTheme.typography.titleMedium)
                    listOf(
                        "No account is required.",
                        "Schedule, ranking, plan and reminders stay on this device.",
                        "The phone-calendar option writes only to a calendar this app creates, and only while it is switched on.",
                        "The only network call is a check for a newer programme, from the public site.",
                    ).forEach {
                        Text("•  $it", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
            Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Make this Companion yours", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "At IndiaFOSS? Help build the app you’re using. Fork the project, fix a bug, improve the design or docs, and send a pull request. Ideas and issue reports are welcome too.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    TextButton(onClick = { uriHandler.openUri("https://github.com/hanthor/indiafoss-companion/fork") }) {
                        Text("Fork on GitHub")
                    }
                    TextButton(onClick = { uriHandler.openUri("https://github.com/hanthor/indiafoss-companion/issues") }) {
                        Text("Suggest an improvement")
                    }
                    Text("About", style = MaterialTheme.typography.titleMedium)
                    Text("Build ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
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

/**
 * Export and import of the attendee's personal data (#240): the same
 * versioned file the PWA writes and reads. Import shows what would change
 * before anything is written; what this phone already holds differently is
 * kept unless ticked, and records that cannot be matched to this programme
 * are listed by name rather than dropped.
 */
@Composable
fun PersonalDataCard(
    state: UiState,
    onExport: () -> Unit,
    onImport: () -> Unit,
    onApply: (Set<String>) -> Unit,
    onCancel: () -> Unit,
) {
    Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp).testTag("personal-data")) {
        Column(Modifier.padding(16.dp)) {
            Text("Personal data", style = MaterialTheme.typography.titleMedium)
            Text(
                "Save your talk choices, ratings, devroom preferences, plan edits, notes and contact card as a file, " +
                    "or bring them in from the PWA or another phone. The file contains private details, including card fields " +
                    "you do not share. Nothing is uploaded; the handshake key stays on this phone.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
            )
            val preview = state.importPreview
            if (preview == null) {
                Row {
                    TextButton(onClick = onExport, enabled = !state.personalDataBusy) { Text("Save personal data") }
                    TextButton(onClick = onImport, enabled = !state.personalDataBusy) { Text("Import from a file") }
                }
                if (state.personalDataBusy) Text("Working…", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                ImportPreviewSection(preview, busy = state.personalDataBusy, onApply = onApply, onCancel = onCancel)
            }
        }
    }
}

@Composable
private fun ImportPreviewSection(preview: ImportPreview, busy: Boolean, onApply: (Set<String>) -> Unit, onCancel: () -> Unit) {
    // New records are ticked; what this phone holds differently is kept unless the attendee ticks it.
    var selected by remember(preview) { mutableStateOf(preview.additions.map { it.id }.toSet()) }
    Text("From a file exported ${preview.exportedAt.take(10)}", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(bottom = 4.dp))
    val additions = preview.additions
    val conflicts = preview.conflicts
    if (additions.isEmpty() && conflicts.isEmpty()) {
        Text("Nothing new to import from this file.", style = MaterialTheme.typography.bodyMedium)
    }
    if (additions.isNotEmpty()) {
        Text("New on this phone (${additions.size})", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        additions.forEach { change ->
            ChangeRow(change, selected = change.id in selected) { on -> selected = if (on) selected + change.id else selected - change.id }
        }
    }
    if (conflicts.isNotEmpty()) {
        Text("Different on this phone (${conflicts.size}) — kept unless ticked", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        conflicts.forEach { change ->
            ChangeRow(change, selected = change.id in selected) { on -> selected = if (on) selected + change.id else selected - change.id }
        }
    }
    if (preview.unchanged > 0) {
        Text("Already the same here: ${preview.unchanged}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
    }
    if (preview.skipped.isNotEmpty()) {
        Text("Not importable (${preview.skipped.size})", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        preview.skipped.forEach { skip ->
            Text("${skip.label} — ${skip.reason.label}: ${skip.detail}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
        }
    }
    if (preview.unsupported.isNotEmpty()) {
        Text("Not understood by this app (${preview.unsupported.size}), left alone", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        preview.unsupported.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp)) }
    }
    HorizontalDivider(Modifier.padding(top = 8.dp))
    Row(Modifier.padding(top = 4.dp)) {
        Button(onClick = { onApply(selected) }, enabled = selected.isNotEmpty() && !busy, modifier = Modifier.testTag("import-apply")) {
            Text("Import ${selected.size} selected")
        }
        TextButton(onClick = onCancel, enabled = !busy) { Text("Cancel") }
    }
}

@Composable
private fun ChangeRow(change: ImportChange, selected: Boolean, onSelected: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(top = 2.dp)) {
        Checkbox(checked = selected, onCheckedChange = onSelected)
        Column(Modifier.weight(1f)) {
            Text(change.label, style = MaterialTheme.typography.bodyMedium)
            val current = change.currentSummary
            if (current != null) {
                Text("Here: $current", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("File: ${change.incomingSummary}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(change.incomingSummary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
