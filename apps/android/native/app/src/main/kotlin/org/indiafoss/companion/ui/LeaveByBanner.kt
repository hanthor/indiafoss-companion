package org.indiafoss.companion.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.Schedule

/**
 * The strip under the app bar on every tab: the next session that matters,
 * counting down. Must attend first, then the earliest bookmark, then the
 * programme's next talk (never a break or a meal), within three hours —
 * the same rule as the PWA's leave-by banner. Amber-ish (tertiary) once it
 * is five minutes away.
 */
@Composable
fun LeaveByBanner(state: UiState, onOpen: (String) -> Unit) {
    val bundle = state.bundle ?: return
    val nowMs = Schedule.parseInstant(state.now)
    val horizon = nowMs + 180 * 60_000L
    val upcoming = bundle.activities
        .filter { !it.cancelled && it.start != null && it.end != null }
        .filter { val s = Schedule.parseInstant(it.start!!); s >= nowMs && s <= horizon }
        .sortedBy { it.start }
    val must = upcoming.firstOrNull { it.id in state.mustAttend }
    val planned = must ?: upcoming.firstOrNull { it.id in state.bookmarks }
    val next: Activity = planned ?: upcoming.firstOrNull { !isPause(it) } ?: return
    val start = next.start ?: return
    val minutes = Schedule.minutesUntil(start, state.now)
    val urgent = minutes <= 5 || (next.locationId?.let(state.walkSecondsTo)?.let { minutes - (it + 300 + 59) / 60 <= 0 } ?: false)
    val walk = next.locationId?.let(state.walkSecondsTo)
    // Leave-by: the start minus the walk minus a five-minute buffer, as on the web.
    val leaveIn = walk?.let { minutes - (it + 300 + 59) / 60 }
    val kicker = buildString {
        if (must != null) append("MUST ATTEND · ")
        append(
            when {
                minutes <= 0 -> "STARTING NOW"
                leaveIn != null && leaveIn <= 0 -> "LEAVE NOW"
                leaveIn != null -> "LEAVE IN $leaveIn MIN · WALK ${(walk + 59) / 60} MIN"
                else -> "STARTS IN $minutes MIN"
            },
        )
        append(" · ").append(Schedule.formatTime(start))
    }
    val room = bundle.location(next.locationId)?.name
    Surface(
        color = if (urgent) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.primaryContainer,
        contentColor = if (urgent) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onPrimaryContainer,
        modifier = Modifier.fillMaxWidth().clickable { onOpen(next.id) },
    ) {
        Column(Modifier.padding(16.dp, 8.dp)) {
            Text(kicker, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
            Text(
                if (room != null) "${next.title} · $room" else next.title,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
            )
        }
    }
}

private fun isPause(a: Activity): Boolean =
    a.type == "meal" || Regex("\\b(break|lunch|tea|breakfast|registration)\\b", RegexOption.IGNORE_CASE).containsMatchIn(a.title)
