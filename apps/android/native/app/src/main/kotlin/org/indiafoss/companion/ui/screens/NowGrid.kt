package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.PlanMarker
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.core.ScheduleGrid

/**
 * A card is a fixed, readable width rather than one scaled to the talk's
 * length: a ten-minute lightning talk needs the same room for its title as an
 * hour-long one, and a grid scaled to time gave it a sliver.
 */
private val MAX_CARD_WIDTH = 320.dp
private val CARD_HEIGHT = 140.dp
private val LABEL_WIDTH = 20.dp
/** How much of the next talk stays in view, so the lane reads as scrollable. */
private val PEEK = 28.dp
private val ROW_GAP = 8.dp
private val MAX_GRID_HEIGHT = 470.dp

/**
 * Happening now, one lane per room. Each lane scrolls sideways on its own and
 * opens on the talk running in that room, so the first screen is the whole
 * venue right now and everything later is a scroll to the right. Room order
 * comes from [ScheduleGrid], so it matches the Schedule screen. The room name
 * is rotated into the left margin: it stays put while the lane scrolls and
 * costs almost no width.
 */
@Composable
fun NowGrid(
    bundle: EventBundle,
    day: String,
    activities: List<Activity>,
    markers: Map<String, PlanMarker>,
    now: String,
    onOpen: (String) -> Unit,
) {
    val layout = remember(bundle, activities, day) { ScheduleGrid.layout(bundle, activities, day) }
    if (layout.columns.isEmpty()) return
    val vScroll = rememberScrollState()
    val contentHeight = (CARD_HEIGHT + ROW_GAP) * layout.columns.size
    BoxWithConstraints {
        val cardWidth = minOf(MAX_CARD_WIDTH, maxWidth - LABEL_WIDTH - PEEK)
        Column(
            Modifier
                .fillMaxHeight()
                .height(contentHeight.coerceAtMost(MAX_GRID_HEIGHT))
                .verticalScroll(vScroll)
                .semantics { contentDescription = "Now by room and time" },
        ) {
            for (column in layout.columns) {
                key(column.locationId) {
                    val talks = remember(column) { column.slots.sortedBy { it.topMinutes }.map { it.activity } }
                    RoomLane(
                        room = column.name,
                        talks = talks,
                        bundle = bundle,
                        markers = markers,
                        now = now,
                        day = day,
                        cardWidth = cardWidth,
                        onOpen = onOpen,
                    )
                }
            }
            Spacer(Modifier.height(ROW_GAP))
        }
    }
}

/** One room: its name frozen on the left, its talks scrolling past it. */
@Composable
private fun RoomLane(
    room: String,
    talks: List<Activity>,
    bundle: EventBundle,
    markers: Map<String, PlanMarker>,
    now: String,
    day: String,
    cardWidth: androidx.compose.ui.unit.Dp,
    onOpen: (String) -> Unit,
) {
    val state = rememberLazyListState()
    // The talk the lane opens on: what is running here, else the next one,
    // else the last, so a finished room shows its own end rather than its morning.
    val anchor = remember(talks, now) {
        val nowMs = Schedule.parseInstant(now)
        val running = talks.indexOfFirst { a ->
            val start = a.start?.let { Schedule.parseInstant(it) }
            val end = a.end?.let { Schedule.parseInstant(it) }
            start != null && end != null && start <= nowMs && end > nowMs
        }
        val next = talks.indexOfFirst { a -> a.start?.let { Schedule.parseInstant(it) > nowMs } == true }
        when {
            running >= 0 -> running
            next >= 0 -> next
            else -> (talks.size - 1).coerceAtLeast(0)
        }
    }
    LaunchedEffect(day, anchor) { state.scrollToItem(anchor) }
    Row(
        Modifier.height(CARD_HEIGHT + ROW_GAP).padding(top = ROW_GAP),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            room,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(LABEL_WIDTH).rotateVertically(),
        )
        LazyRow(state = state, contentPadding = PaddingValues(end = PEEK)) {
            items(talks, key = { it.id }) { activity ->
                NowGridCard(
                    activity = activity,
                    bundle = bundle,
                    room = room,
                    marker = markers[activity.id] ?: PlanMarker.NONE,
                    now = now,
                    modifier = Modifier.width(cardWidth).height(CARD_HEIGHT),
                    onOpen = { onOpen(activity.id) },
                )
            }
        }
    }
}

/**
 * Turn a composable on its side, reading bottom to top. Width and height swap,
 * so the caller sizes it as if it were still horizontal.
 */
private fun Modifier.rotateVertically(): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(
        Constraints(
            minWidth = constraints.minHeight,
            maxWidth = constraints.maxHeight,
            minHeight = constraints.minWidth,
            maxHeight = constraints.maxWidth,
        ),
    )
    layout(placeable.height, placeable.width) {
        placeable.placeRelativeWithLayer(
            x = -(placeable.width / 2 - placeable.height / 2),
            y = -(placeable.height / 2 - placeable.width / 2),
        ) { rotationZ = -90f }
    }
}

/** One talk on the Now grid: time, title, speakers, plan mark and progress. */
@Composable
private fun NowGridCard(
    activity: Activity,
    bundle: EventBundle,
    room: String,
    marker: PlanMarker,
    now: String,
    modifier: Modifier,
    onOpen: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val progress = activity.start?.let { Schedule.progress(activity, now) }
    val running = progress != null && progress > 0f && progress < 1f
    val times = activity.start?.let { s ->
        Schedule.formatTime(s) + (activity.end?.let { "–" + Schedule.formatTime(it) } ?: "")
    }.orEmpty()
    Card(
        modifier = modifier
            .padding(end = ROW_GAP)
            .clickable(onClick = onOpen)
            .semantics { contentDescription = listOf(activity.title, times, room).joinToString(", ") },
        colors = CardDefaults.cardColors(
            containerColor = if (running) scheme.primaryContainer else scheme.surfaceContainer,
        ),
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
            Text(
                (if (running) "Now · " else "") + times,
                style = MaterialTheme.typography.labelSmall,
                color = if (running) scheme.onPrimaryContainer else scheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                activity.title,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
            val speakers = bundle.speakersOf(activity)
            if (speakers.isNotEmpty()) {
                Text(
                    speakers.joinToString { it.name },
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.weight(1f))
            if (activity.cancelled) {
                SuggestionChip(onClick = {}, label = { Text("Cancelled") }, enabled = false)
            }
            if (marker != PlanMarker.NONE) MarkerChip(marker)
            if (running && progress != null) {
                LinearProgressIndicator(progress = { progress }, modifier = Modifier.padding(top = 6.dp))
            }
        }
    }
}
