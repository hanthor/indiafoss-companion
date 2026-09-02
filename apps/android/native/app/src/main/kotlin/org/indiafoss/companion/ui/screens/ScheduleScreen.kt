package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
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
import org.indiafoss.companion.UiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(state: UiState, onBookmark: (String) -> Unit, onOpen: (String) -> Unit) {
    val days = state.days
    var selected by remember(days) { mutableIntStateOf(0) }

    Scaffold(topBar = { TopAppBar(title = { Text("Schedule") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (days.isEmpty()) {
                EmptyState("No programme yet", "The schedule appears once it has been downloaded.")
                return@Column
            }
            TabRow(selectedTabIndex = selected.coerceIn(0, days.lastIndex)) {
                days.forEachIndexed { index, day ->
                    Tab(
                        selected = index == selected,
                        onClick = { selected = index },
                        text = { Text("Day ${index + 1}") },
                    )
                }
            }
            val activities = state.activitiesFor(days[selected.coerceIn(0, days.lastIndex)])
            LazyColumn(Modifier.fillMaxSize()) {
                items(activities, key = { it.id }) { activity ->
                    SessionCard(
                        activity = activity,
                        bundle = state.bundle,
                        bookmarked = activity.id in state.bookmarks,
                        onOpen = { onOpen(activity.id) },
                        onBookmark = { onBookmark(activity.id) },
                    )
                }
            }
        }
    }
}
