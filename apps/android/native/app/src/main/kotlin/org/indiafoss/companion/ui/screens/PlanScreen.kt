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
    onOpen: (String) -> Unit,
) {
    val days = state.days
    var selected by remember(days) { mutableIntStateOf(0) }
    val context = LocalContext.current

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
                items(plan, key = { it.activity.id }) { item ->
                    SessionCard(
                        activity = item.activity,
                        bundle = state.bundle,
                        bookmarked = item.activity.id in state.bookmarks || item.reason == Itinerary.Reason.MUST_ATTEND,
                        onOpen = { onOpen(item.activity.id) },
                    )
                    val why = when (item.reason) {
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
    }
}
