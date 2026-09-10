package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.PlanMarker
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.core.ScheduleGrid

/**
 * The programme by day, as the PWA's Schedule shows it (#110): day tabs, a
 * row of room chips to narrow the list to one room, a list/grid switch, and
 * on every session a mark saying where it stands in the attendee's own day
 * (planned, interested, must go, stood aside — [PlanMarker]). The grid is
 * the PWA's TimelineGrid: a column per room, minutes as height, overlapping
 * sessions in a room side by side.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(state: UiState, actions: @Composable () -> Unit, onBookmark: (String) -> Unit, onOpen: (String) -> Unit) {
    val days = state.days
    var selected by remember(days) { mutableIntStateOf(0) }
    var selectedRoom by remember(days) { mutableStateOf<String?>(null) }
    var grid by remember { mutableStateOf(false) }

    Scaffold(topBar = { TopAppBar(title = { Text("Schedule") }, actions = { actions() }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (days.isEmpty()) {
                EmptyState("No programme yet", "The schedule appears once it has been downloaded.")
                return@Column
            }
            val dayIndex = selected.coerceIn(0, days.lastIndex)
            val day = days[dayIndex]
            TabRow(selectedTabIndex = dayIndex) {
                days.forEachIndexed { index, key ->
                    Tab(
                        selected = index == dayIndex,
                        onClick = { selected = index; selectedRoom = null },
                        text = {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("Day ${index + 1}")
                                Text(Schedule.formatDayLabel(key), style = MaterialTheme.typography.labelSmall)
                            }
                        },
                    )
                }
            }
            val dayActivities = state.activitiesFor(day)
            val rooms = remember(state.bundle, day) { state.bundle?.let { ScheduleGrid.rooms(it, dayActivities) }.orEmpty() }
            val markers = remember(state.bundle, state.bookmarks, state.mustAttend, state.ranking, state.blocks, state.removedFromPlan, state.planReplacements, day) { state.markersFor(day) }
            val filtered = if (selectedRoom == null) dayActivities else dayActivities.filter { it.locationId == selectedRoom }

            LazyRow(
                modifier = Modifier.testTag("room-chips"),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    FilterChip(selected = selectedRoom == null, onClick = { selectedRoom = null }, label = { Text("All rooms") })
                }
                items(rooms, key = { it.id }) { room ->
                    FilterChip(selected = selectedRoom == room.id, onClick = { selectedRoom = room.id }, label = { Text(room.name) })
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    "${filtered.size} session${if (filtered.size == 1) "" else "s"}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SingleChoiceSegmentedButtonRow {
                    SegmentedButton(selected = !grid, onClick = { grid = false }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("List") }
                    SegmentedButton(selected = grid, onClick = { grid = true }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Room grid") }
                }
            }
            if (filtered.isEmpty()) {
                EmptyState("No sessions in this room", "Pick another room or all rooms.")
                return@Column
            }
            if (grid) {
                val layout = remember(state.bundle, filtered, day) { state.bundle?.let { ScheduleGrid.layout(it, filtered, day) } }
                if (layout != null) RoomGrid(layout, markers, onOpen)
            } else {
                LazyColumn(Modifier.fillMaxSize().testTag("schedule-list")) {
                    items(filtered, key = { it.id }) { activity ->
                        SessionCard(
                            activity = activity,
                            bundle = state.bundle,
                            bookmarked = activity.id in state.bookmarks,
                            marker = markers[activity.id] ?: PlanMarker.NONE,
                            onOpen = { onOpen(activity.id) },
                            onBookmark = { onBookmark(activity.id) },
                        )
                    }
                }
            }
        }
    }
}

/** The PWA draws 2px a minute in 240px columns; a phone gets the same scale in narrower columns. */
private val DP_PER_MINUTE = 2.dp
private val COLUMN_WIDTH = 168.dp
private val RULER_WIDTH = 56.dp
private val HEADER_HEIGHT = 36.dp
private val MIN_CELL_HEIGHT = 12.dp

/** Time down, rooms across; both axes scroll together. */
@Composable
fun RoomGrid(layout: ScheduleGrid.Layout, markers: Map<String, PlanMarker>, onOpen: (String) -> Unit) {
    val bodyHeight = DP_PER_MINUTE * layout.totalMinutes
    val line = MaterialTheme.colorScheme.outlineVariant
    Box(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .semantics { contentDescription = "Schedule by room and time" },
    ) {
        Row(Modifier.horizontalScroll(rememberScrollState())) {
            // The hour ruler.
            Box(Modifier.width(RULER_WIDTH).height(HEADER_HEIGHT + bodyHeight)) {
                for (tick in layout.ticks) {
                    Text(
                        tick.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .offset(y = HEADER_HEIGHT + DP_PER_MINUTE * tick.minutesFromStart - 8.dp)
                            .padding(start = 8.dp),
                    )
                }
            }
            for (column in layout.columns) {
                Column(Modifier.width(COLUMN_WIDTH).padding(end = 8.dp)) {
                    Text(
                        column.name,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.height(HEADER_HEIGHT).padding(horizontal = 8.dp, vertical = 8.dp),
                    )
                    Box(Modifier.fillMaxWidth().height(bodyHeight).border(1.dp, line)) {
                        for (tick in layout.ticks) {
                            Box(Modifier.offset(y = DP_PER_MINUTE * tick.minutesFromStart).fillMaxWidth().height(1.dp).background(line))
                        }
                        val laneWidth = (COLUMN_WIDTH - 8.dp) / (column.slots.firstOrNull()?.lanes ?: 1)
                        for (slot in column.slots) {
                            GridCell(
                                slot = slot,
                                room = column.name,
                                marker = markers[slot.activity.id] ?: PlanMarker.NONE,
                                modifier = Modifier
                                    .offset(x = laneWidth * slot.lane, y = DP_PER_MINUTE * slot.topMinutes)
                                    .size(width = laneWidth, height = maxOf(MIN_CELL_HEIGHT, DP_PER_MINUTE * slot.heightMinutes)),
                                onOpen = { onOpen(slot.activity.id) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GridCell(slot: ScheduleGrid.Slot, room: String, marker: PlanMarker, modifier: Modifier, onOpen: () -> Unit) {
    val activity = slot.activity
    val scheme = MaterialTheme.colorScheme
    val meal = activity.type == "meal"
    val fill = when {
        meal -> scheme.surfaceVariant
        marker == PlanMarker.MUST_GO -> scheme.tertiaryContainer
        marker == PlanMarker.PLANNED || marker == PlanMarker.INTERESTED -> scheme.primaryContainer
        else -> scheme.primaryContainer.copy(alpha = 0.35f)
    }
    val stripe = when (marker) {
        PlanMarker.MUST_GO -> scheme.tertiary
        PlanMarker.PLANNED, PlanMarker.INTERESTED -> scheme.primary
        PlanMarker.STOOD_ASIDE -> scheme.outline
        PlanMarker.NONE -> null
    }
    val times = activity.start?.let { s -> Schedule.formatTime(s) + (activity.end?.let { "–" + Schedule.formatTime(it) } ?: "") }.orEmpty()
    val description = listOfNotNull(marker.label.ifEmpty { null }, activity.title, times, room).joinToString(", ")
    Row(
        modifier
            .padding(1.dp)
            .background(fill, MaterialTheme.shapes.extraSmall)
            .border(1.dp, if (meal) scheme.outlineVariant else scheme.primary.copy(alpha = 0.45f), MaterialTheme.shapes.extraSmall)
            .clickable(onClick = onOpen)
            .semantics { contentDescription = description },
    ) {
        if (stripe != null) Box(Modifier.width(3.dp).fillMaxHeight().background(stripe))
        Text(
            buildString {
                if (marker != PlanMarker.NONE) append(marker.label).append(" · ")
                append(activity.title)
            },
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = if (marker == PlanMarker.NONE) FontWeight.Normal else FontWeight.SemiBold,
                textDecoration = if (activity.cancelled) TextDecoration.LineThrough else null,
            ),
            color = if (meal || activity.cancelled) scheme.onSurfaceVariant else scheme.onSurface,
            maxLines = maxOf(1, slot.heightMinutes / 10),
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
        )
    }
}
