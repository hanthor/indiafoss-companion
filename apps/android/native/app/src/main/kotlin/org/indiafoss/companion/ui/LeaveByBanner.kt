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
import org.indiafoss.companion.core.ResolvedPlan
import org.indiafoss.companion.core.Schedule

/**
 * The strip under the app bar on every tab: the next item in the attendee's
 * resolved plan (#221) counting down, within three hours — the same item Now
 * and the map call next, never a bookmark or must-go that has left the plan,
 * and never a pick from the whole programme. While the plan has a blocking
 * conflict the strip says so and opens the plan instead. Amber-ish
 * (tertiary) once it is five minutes away; the venue is small, so there is
 * no leave-by time, only the countdown to the start.
 */
@Composable
fun LeaveByBanner(state: UiState, onOpenPlan: () -> Unit = {}, onOpen: (String) -> Unit) {
    val bundle = state.bundle ?: return
    val plan = state.todayPlan ?: return
    if (!plan.feasible) {
        Surface(
            color = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
            modifier = Modifier.fillMaxWidth().clickable { onOpenPlan() },
        ) {
            Column(Modifier.padding(16.dp, 8.dp)) {
                Text("PLAN CONFLICT", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Text(plan.blockingConflicts.first().message, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
            }
        }
        return
    }
    val next = plan.upcoming(state.now) ?: return
    val start = next.start
    val must = next.source == ResolvedPlan.Source.MUST_ATTEND
    val minutes = Schedule.minutesUntil(start, state.now)
    val urgent = minutes <= 5
    val kicker = buildString {
        if (must) append("MUST ATTEND · ")
        append(if (minutes <= 0) "STARTING NOW" else "STARTS IN $minutes MIN")
        append(" · ").append(Schedule.formatTime(start))
    }
    val room = bundle.location(next.locationId)?.name
    Surface(
        color = if (urgent) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.primaryContainer,
        contentColor = if (urgent) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onPrimaryContainer,
        modifier = Modifier.fillMaxWidth().clickable { if (next.isSession) onOpen(next.id) else onOpenPlan() },
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
