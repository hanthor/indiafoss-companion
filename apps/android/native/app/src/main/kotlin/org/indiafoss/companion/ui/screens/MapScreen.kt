package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Schedule

/**
 * The venue's floor plan, drawn natively from the same vectors as the web
 * map: rooms lit while sessions run, the minutes left in each, a dot where
 * you are (set by tapping a room or scanning a room's code), and the room
 * list underneath. Pinch, drag and double-tap as on any map.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(state: UiState, actions: @Composable () -> Unit, onSetLocation: (String?) -> Unit) {
    val context = LocalContext.current
    val floors = remember { FloorPlans.load(context) }
    var floorIndex by remember { mutableStateOf(0) }
    val bundle = state.bundle
    val live = state.nowState?.current.orEmpty().groupBy { it.locationId }
    val next = state.nowState?.next
    var sheet by remember { mutableStateOf<String?>(null) }

    val roomStates = bundle?.locations.orEmpty().associate { room ->
        val running = live[room.id].orEmpty().firstOrNull()
        room.id to RoomState(
            live = running?.end?.let { "${Schedule.minutesUntil(it, state.now)} min left" },
            here = state.currentLocation == room.id,
            next = next?.locationId == room.id,
        )
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Map") }, actions = { actions() }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (floors.isNotEmpty()) {
                Row(Modifier.padding(16.dp, 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    floors.forEachIndexed { index, floor ->
                        FilterChip(selected = index == floorIndex, onClick = { floorIndex = index }, label = { Text(floor.label) })
                    }
                    if (state.currentLocation != null) {
                        TextButton(onClick = { onSetLocation(null) }) { Text("Clear my spot") }
                    }
                }
                val floor = floors[floorIndex.coerceIn(0, floors.lastIndex)]
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    FloorPlanView(floor, roomStates, onRoomTap = { room -> sheet = room.key ?: room.id })
                }
                sheet?.let { id ->
                    val room = bundle?.location(id) ?: bundle?.locations?.firstOrNull { it.id == id }
                    Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                        Column(Modifier.padding(16.dp)) {
                            Text(room?.name ?: floor.roomFor(id)?.name ?: id, style = MaterialTheme.typography.titleMedium)
                            state.walkSecondsTo(id)?.takeIf { state.currentLocation != id }?.let { seconds ->
                                Text("Walk ${(seconds + 59) / 60} min from where you are", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            }
                            val running = live[id].orEmpty()
                            if (running.isEmpty()) Text("Nothing on right now", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            running.forEach { a ->
                                Text(a.title, style = MaterialTheme.typography.bodyMedium)
                                a.end?.let { Text("until ${Schedule.formatTime(it)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            Row {
                                TextButton(onClick = { onSetLocation(id); sheet = null }) { Text("I'm here") }
                                TextButton(onClick = { sheet = null }) { Text("Close") }
                            }
                        }
                    }
                }
            } else {
                val rooms = bundle?.locations.orEmpty()
                if (rooms.isEmpty()) {
                    EmptyState("No venue yet", "Room information arrives with the schedule.")
                } else LazyColumn(Modifier.fillMaxSize()) {
                    items(rooms, key = { it.id }) { room ->
                        Card(Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
                            Column(Modifier.padding(16.dp)) {
                                Text(room.name, style = MaterialTheme.typography.titleMedium)
                                val running = live[room.id].orEmpty()
                                if (running.isEmpty()) Text("Nothing on right now", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                running.forEach { Text(it.title, style = MaterialTheme.typography.bodyLarge) }
                            }
                        }
                    }
                }
            }
        }
    }
}
