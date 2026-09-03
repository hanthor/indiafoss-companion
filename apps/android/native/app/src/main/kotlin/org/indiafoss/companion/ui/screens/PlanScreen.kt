package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.SwapVert
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
fun PlanScreen(state: UiState, onRank: () -> Unit, onOpen: (String) -> Unit) {
    val days = state.days
    var selected by remember(days) { mutableIntStateOf(0) }

    Scaffold(topBar = { TopAppBar(title = { Text("My plan") }) }) { padding ->
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
                        Itinerary.Reason.RANKED -> "Best rated in this slot"
                    }
                    Text(
                        why,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(start = 32.dp, bottom = 6.dp),
                    )
                }
            }
        }
    }
}
