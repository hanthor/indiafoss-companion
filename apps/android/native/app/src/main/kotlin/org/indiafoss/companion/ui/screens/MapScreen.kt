package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Schedule

/**
 * Rooms and what is on in each. The floor-plan drawing is web-only for now;
 * this lists the venue by room so the tab is useful on day one.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(state: UiState) {
    val bundle = state.bundle
    val rooms = bundle?.locations.orEmpty()
    val live = state.nowState?.current.orEmpty().groupBy { it.locationId }

    Scaffold(topBar = { TopAppBar(title = { Text("Rooms") }) }) { padding ->
        if (rooms.isEmpty()) {
            EmptyState("No venue yet", "Room information arrives with the schedule.", Modifier.padding(padding))
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            items(rooms, key = { it.id }) { room ->
                Card(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 4.dp)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(room.name, style = MaterialTheme.typography.titleMedium)
                        room.floor?.let {
                            Text(
                                text = it.replaceFirstChar(Char::uppercase) + " floor",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        val running = live[room.id].orEmpty()
                        if (running.isEmpty()) {
                            Text(
                                "Nothing on right now",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else {
                            running.forEach { activity ->
                                Text(activity.title, style = MaterialTheme.typography.bodyLarge)
                                activity.end?.let { end ->
                                    Text(
                                        "until ${Schedule.formatTime(end)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
