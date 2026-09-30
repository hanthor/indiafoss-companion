package org.indiafoss.companion.ui.screens

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Schedule

/**
 * The organiser's map key (which number is which room), bundled as a PNG
 * export of `events/indiafoss-2026/venue/map-legend.svg` (regenerate with
 * `rsvg-convert -w 1200`, flattened on white). Baked artwork, so it is
 * shown as-is in either colour scheme.
 */
@Composable
private fun MapKey(expanded: Boolean, onToggle: () -> Unit) {
    val context = LocalContext.current
    TextButton(onClick = onToggle) { Text(if (expanded) "Hide map key" else "Map key: room numbers") }
    if (!expanded) return
    val bitmap = remember {
        runCatching {
            context.assets.open("map-legend.png").use { BitmapFactory.decodeStream(it) }
        }.getOrNull()
    }
    if (bitmap == null) {
        Text(
            "The map key artwork is missing from this build.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(16.dp, 0.dp),
        )
    } else {
        Image(
            bitmap.asImageBitmap(), contentDescription = "Map key artwork",
            contentScale = ContentScale.FillWidth, modifier = Modifier.fillMaxWidth().padding(16.dp, 0.dp),
        )
    }
}

/**
 * The venue's floor plan, drawn natively from the same vectors as the web
 * map: rooms lit while sessions run, the minutes left in each, the room the
 * attendee's resolved plan sends them to next (#221, the same item Now and
 * the banner name) outlined, and the room list underneath. Pinch, drag and
 * double-tap as on any map. The venue is small, so there is no "you are
 * here" and no walk time: the map only highlights a destination.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(state: UiState, actions: @Composable () -> Unit) {
    val context = LocalContext.current
    val floors = remember { FloorPlans.load(context) }
    var floorIndex by remember { mutableStateOf(0) }
    val bundle = state.bundle
    // Every room's running session stays on the map; the destination is the attendee's own (#221).
    val live = state.nowState?.current.orEmpty().groupBy { it.locationId }
    val plan = state.todayPlan
    val destination = plan?.destination(state.now)
    var sheet by remember { mutableStateOf<String?>(null) }
    var keyExpanded by remember { mutableStateOf(false) }

    val roomStates = bundle?.locations.orEmpty().associate { room ->
        val running = live[room.id].orEmpty().firstOrNull()
        room.id to RoomState(
            title = running?.title,
            name = room.name,
            live = running?.end?.let { "${Schedule.minutesUntil(it, state.now)} min left" },
            next = destination?.locationId == room.id,
        )
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Map") }, actions = { actions() }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            when {
                plan != null && !plan.feasible -> Text(
                    "Your plan has conflicting choices; no destination until you resolve them.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp, 8.dp, 16.dp, 0.dp),
                )
                destination != null -> Text(
                    "${if (destination.inProgress(state.now)) "Now" else "Next"} for you: ${destination.title} · ${bundle?.location(destination.locationId)?.name ?: destination.locationId} · ${Schedule.formatTime(destination.start)}",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(16.dp, 8.dp, 16.dp, 0.dp),
                )
            }
            if (floors.isNotEmpty()) {
                Row(Modifier.padding(16.dp, 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    floors.forEachIndexed { index, floor ->
                        FilterChip(selected = index == floorIndex, onClick = { floorIndex = index }, label = { Text(floor.label) })
                    }
                }
                val floor = floors[floorIndex.coerceIn(0, floors.lastIndex)]
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    FloorPlanView(floor, roomStates, onRoomTap = { room -> sheet = room.programmeLocationId(bundle) })
                }
                MapKey(expanded = keyExpanded, onToggle = { keyExpanded = !keyExpanded })
                sheet?.let { id ->
                    val room = bundle?.location(id) ?: bundle?.locations?.firstOrNull { it.id == id }
                    Card(Modifier.fillMaxWidth().padding(16.dp, 8.dp)) {
                        Column(Modifier.padding(16.dp)) {
                            Text(room?.name ?: floor.roomFor(id)?.name ?: id, style = MaterialTheme.typography.titleMedium)
                            if (destination?.locationId == id) Text("Your next: ${destination.title} at ${Schedule.formatTime(destination.start)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            val running = live[id].orEmpty()
                            if (running.isEmpty()) Text("Nothing on right now", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            running.forEach { a ->
                                Text(a.title, style = MaterialTheme.typography.bodyMedium)
                                a.end?.let { Text("until ${Schedule.formatTime(it)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                            TextButton(onClick = { sheet = null }) { Text("Close") }
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
