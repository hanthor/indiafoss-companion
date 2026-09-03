package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import android.content.Intent
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Itinerary
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.data.StoredBlock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.mutableStateOf

/**
 * The day, planned: must-attend first, then bookmarks, then the best-rated
 * session in every free slot (`Itinerary`, docs/ranking.md). Ranking is one
 * tap away, and a day with nothing ranked yet says so.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(
    state: UiState,
    actions: @Composable () -> Unit,
    onRank: () -> Unit,
    onCalendar: (String) -> String?,
    onSkip: (String) -> Unit,
    onAddBlock: (StoredBlock) -> Unit = {},
    onRemoveBlock: (String) -> Unit = {},
    onOpen: (String) -> Unit,
) {
    val days = state.days
    var selected by remember(days) { mutableIntStateOf(0) }
    val context = LocalContext.current
    var adding by remember { mutableStateOf(false) }

    Scaffold(topBar = { TopAppBar(title = { Text("My plan") }, actions = { actions() }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (days.isEmpty()) {
                EmptyState("No programme yet", "The plan appears once the schedule has been downloaded.")
                return@Column
            }
            TabRow(selectedTabIndex = selected.coerceIn(0, days.lastIndex)) {
                days.forEachIndexed { index, _ ->
                    Tab(selected = index == selected, onClick = { selected = index }, text = { Text("Day ${index + 1}") })
                }
            }
            val day = days[selected.coerceIn(0, days.lastIndex)]
            val plan = state.itineraryFor(day)
            val ranked = state.ranking.comparisons.isNotEmpty() ||
                state.ranking.ratings.values.any { it.triage != null }
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    Row(Modifier.fillMaxWidth().padding(16.dp, 12.dp, 16.dp, 4.dp)) {
                        Button(onClick = onRank) {
                            Icon(Icons.Filled.SwapVert, contentDescription = null)
                            Text(if (ranked) "  Keep ranking" else "  Rank this day first")
                        }
                        OutlinedButton(
                            onClick = {
                                val ics = onCalendar(day) ?: return@OutlinedButton
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/calendar"
                                    putExtra(Intent.EXTRA_TEXT, ics)
                                    putExtra(Intent.EXTRA_SUBJECT, "IndiaFOSS plan · day ${selected + 1}")
                                }
                                context.startActivity(Intent.createChooser(send, "Add to calendar"))
                            },
                            enabled = plan.isNotEmpty(),
                            modifier = Modifier.padding(start = 8.dp),
                        ) {
                            Icon(Icons.Filled.Event, contentDescription = null)
                            Text("  Calendar")
                        }
                    }
                    if (!ranked) Text(
                        "Until you rank, the plan is your bookmarks plus the programme's first pick in each slot.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(20.dp, 0.dp, 20.dp, 8.dp),
                    )
                }
                if (plan.isEmpty()) {
                    item { EmptyState("Nothing to plan", "Every session on this day is ruled out or unscheduled.") }
                }
                items(plan.filter { it.reason == Itinerary.Reason.BLOCK }, key = { "b-" + it.activity.id }) { item ->
                    // The attendee's own block: a fixed time, or a booth visit the plan placed in a gap.
                    Card(Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
                        Row(Modifier.padding(16.dp, 10.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(timeAndRoom(item.activity, state.bundle), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(item.activity.title, style = MaterialTheme.typography.titleMedium)
                                Text(if (item.block?.flexible == true) "Your visit, placed in the largest gap" else "Your block", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            }
                            TextButton(onClick = { onRemoveBlock(item.activity.id) }) { Text("Remove") }
                        }
                    }
                }
                val blocksToday = state.blocks.filter { it.day == day }
                val unplaced = blocksToday.filter { b -> plan.none { it.activity.id == b.id } }
                items(unplaced, key = { "u-" + it.id }) { block ->
                    Row(Modifier.fillMaxWidth().padding(20.dp, 2.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text("${block.label}: no gap of ${block.durationMinutes} min left today", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.weight(1f))
                        TextButton(onClick = { onRemoveBlock(block.id) }) { Text("Remove") }
                    }
                }
                item {
                    TextButton(onClick = { adding = true }, modifier = Modifier.padding(16.dp, 0.dp)) { Text("+ Add a block of your own") }
                }
                items(plan.filter { it.reason != Itinerary.Reason.BLOCK }, key = { it.activity.id }) { item ->
                    SessionCard(
                        activity = item.activity,
                        bundle = state.bundle,
                        bookmarked = item.activity.id in state.bookmarks || item.reason == Itinerary.Reason.MUST_ATTEND,
                        onOpen = { onOpen(item.activity.id) },
                    )
                    val why = when (item.reason) {
                        Itinerary.Reason.BLOCK -> "Your block"
                        Itinerary.Reason.MUST_ATTEND -> "Must attend"
                        Itinerary.Reason.BOOKMARKED -> "Bookmarked"
                        Itinerary.Reason.RANKED ->
                            if (state.ranking.rating(item.activity.id).comparisons > 0 || ranked) "Best rated in this slot"
                            else "The programme's pick for this slot"
                    }
                    Row(Modifier.fillMaxWidth().padding(start = 32.dp, end = 16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text(why, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                        if (item.reason == Itinerary.Reason.RANKED) {
                            TextButton(onClick = { onSkip(item.activity.id) }) { Text("Not this one") }
                        }
                    }
                }
            }
        }
        if (adding) {
            val day = days[selected.coerceIn(0, days.lastIndex)]
            AddBlockDialog(day = day, onDismiss = { adding = false }) { block -> onAddBlock(block); adding = false }
        }
    }
}

/** Label, start time and length for a block of the attendee's own; a blank start makes it flexible. */
@Composable
private fun AddBlockDialog(day: String, onDismiss: () -> Unit, onAdd: (StoredBlock) -> Unit) {
    var label by remember { mutableStateOf("") }
    var start by remember { mutableStateOf("") }
    var minutes by remember { mutableStateOf("30") }
    val time = Regex("^([01]?\\d|2[0-3]):([0-5]\\d)$").find(start.trim())
    val startOk = start.isBlank() || time != null
    val length = minutes.trim().toIntOrNull()?.takeIf { it in 5..480 }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add a block") },
        text = {
            Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(label, { label = it }, label = { Text("What") }, placeholder = { Text("Coffee with Priya") }, singleLine = true)
                OutlinedTextField(start, { start = it }, label = { Text("Start (HH:MM), or blank for any gap") }, placeholder = { Text("11:30") }, isError = !startOk, singleLine = true)
                OutlinedTextField(minutes, { minutes = it }, label = { Text("Minutes") }, isError = length == null, singleLine = true)
            }
        },
        confirmButton = {
            TextButton(
                enabled = label.isNotBlank() && startOk && length != null,
                onClick = {
                    val id = "blk-${System.currentTimeMillis()}"
                    val block = if (time == null) StoredBlock(id, label.trim(), day, durationMinutes = length!!)
                    else {
                        val (h, m) = time.destructured
                        val startIso = "%sT%02d:%02d:00+05:30".format(day, h.toInt(), m.toInt())
                        val endIso = Schedule.formatInstant(Schedule.parseInstant(startIso) + length!! * 60_000L, 330)
                        StoredBlock(id, label.trim(), day, startIso, endIso, length)
                    }
                    onAdd(block)
                },
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
