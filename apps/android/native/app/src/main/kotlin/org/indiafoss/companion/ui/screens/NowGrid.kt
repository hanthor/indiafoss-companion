package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.PlanMarker
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.core.ScheduleGrid

/** A talk card gets room to breathe: 3px a minute, never narrower than this. */
private val PX_PER_MINUTE = 3.dp
private val MIN_CARD_WIDTH = 150.dp
private val CARD_HEIGHT = 148.dp
private val ROW_GAP = 8.dp
private val RULER_HEIGHT = 28.dp
private val MAX_GRID_HEIGHT = 460.dp

/**
 * Happening now as a horizontal time-grid: one row per room, time running
 * left to right, one rich card per talk. Scan up and down for what is on;
 * scroll right for what is next. The room grid transposed: the same
 * [ScheduleGrid] numbers, so the rules (lanes, ticks, natural room order)
 * match the Schedule screen.
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
    val hScroll = rememberScrollState()
    val vScroll = rememberScrollState()
    val density = LocalDensity.current
    val nowMin = remember(layout, now) {
        ((Schedule.parseInstant(now) - layout.startMs) / 60_000L).toInt()
    }
    // Open on now, with a little of the past peeking in from the left.
    LaunchedEffect(layout.startMs) {
        val pxPerMin = with(density) { PX_PER_MINUTE.toPx() }
        val lead = with(density) { 60.dp.toPx() }
        hScroll.scrollTo(((nowMin * pxPerMin - lead).toInt()).coerceAtLeast(0))
    }
    val totalWidth = PX_PER_MINUTE * layout.totalMinutes
    val rowHeights = remember(layout) {
        layout.columns.map { column ->
            val lanes = column.slots.maxOfOrNull { it.lanes } ?: 1
            (CARD_HEIGHT + ROW_GAP) * lanes
        }
    }
    val contentHeight = RULER_HEIGHT + rowHeights.fold(0.dp) { acc, h -> acc + h + ROW_GAP }
    val scheme = MaterialTheme.colorScheme
    Column(
        Modifier
            .fillMaxHeight()
            .height(contentHeight.coerceAtMost(MAX_GRID_HEIGHT + RULER_HEIGHT))
            .verticalScroll(vScroll)
            .semantics { contentDescription = "Now by room and time" },
    ) {
        Row(Modifier.horizontalScroll(hScroll)) {
            Box(Modifier.width(totalWidth).height(RULER_HEIGHT)) {
                for (tick in layout.ticks) {
                    Text(
                        tick.label,
                        style = MaterialTheme.typography.labelSmall,
                        color = scheme.onSurfaceVariant,
                        modifier = Modifier.offset(x = PX_PER_MINUTE * tick.minutesFromStart, y = 6.dp),
                    )
                }
            }
        }
        for ((index, column) in layout.columns.withIndex()) {
            Text(
                column.name,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = scheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 16.dp, top = ROW_GAP, bottom = 4.dp),
            )
            Row(Modifier.horizontalScroll(hScroll)) {
                Box(Modifier.width(totalWidth).height(rowHeights[index])) {
                    for (slot in column.slots) {
                        NowGridCard(
                            activity = slot.activity,
                            bundle = bundle,
                            room = column.name,
                            marker = markers[slot.activity.id] ?: PlanMarker.NONE,
                            now = now,
                            modifier = Modifier
                                .offset(
                                    x = PX_PER_MINUTE * slot.topMinutes,
                                    y = (CARD_HEIGHT + ROW_GAP) * slot.lane,
                                )
                                .width(
                                    maxOf(
                                        MIN_CARD_WIDTH,
                                        PX_PER_MINUTE * slot.heightMinutes,
                                    ),
                                )
                                .height(CARD_HEIGHT),
                            onOpen = { onOpen(slot.activity.id) },
                        )
                    }
                    if (nowMin in 0..layout.totalMinutes) {
                        Box(
                            Modifier
                                .offset(x = PX_PER_MINUTE * nowMin)
                                .width(2.dp)
                                .height(rowHeights[index])
                                .background(scheme.primary),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(ROW_GAP))
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
            .padding(end = 8.dp)
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
                maxLines = 2,
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
