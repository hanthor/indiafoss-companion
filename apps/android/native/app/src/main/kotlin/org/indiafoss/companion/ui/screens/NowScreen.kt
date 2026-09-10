package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight
import org.indiafoss.companion.UiState
import org.indiafoss.companion.ui.EventMasthead
import org.indiafoss.companion.core.EventPhase
import org.indiafoss.companion.core.ResolvedPlan
import org.indiafoss.companion.core.Schedule

/**
 * Now: "Your plan now" first — the item in progress or the next one from the
 * attendee's resolved plan (#221), a conflict notice when the plan has one,
 * never a pick from the whole programme — then what is running in every
 * room, then the programme's next session, labelled as such.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowScreen(
    state: UiState,
    actions: @Composable () -> Unit,
    onRefresh: () -> Unit,
    onDismissUpdate: () -> Unit = {},
    onOpenPlan: () -> Unit = {},
    onOpen: (String) -> Unit,
) {
    Scaffold(topBar = { TopAppBar(title = { Text("Now") }, actions = { actions() }) }) { padding ->
        val now = state.nowState
        when {
            state.loading -> Column(
                Modifier.fillMaxSize().padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { CircularProgressIndicator(Modifier.padding(32.dp)) }

            now == null -> EmptyState(
                title = "No schedule yet",
                body = "Connect once and the programme is cached for the whole conference.",
                modifier = Modifier.padding(padding),
                action = "Retry" to onRefresh,
            )

            else -> PullToRefreshBox(isRefreshing = false, onRefresh = onRefresh, modifier = Modifier.fillMaxSize().padding(padding)) {
                LazyColumn(Modifier.fillMaxSize()) {
                state.update?.let { update ->
                    item {
                        Card(
                            Modifier.fillMaxWidth().padding(16.dp, 8.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text("Schedule updated · revision ${update.revision}", style = MaterialTheme.typography.titleSmall)
                                Text(update.summary, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp))
                                update.changes.take(6).forEach { change ->
                                    Text(
                                        "• ${change.title}: ${change.kind.label}${change.detail?.let { " ($it)" } ?: ""}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(top = 4.dp).clickable { onOpen(change.activityId) },
                                    )
                                }
                                if (update.changes.size > 6) Text("and ${update.changes.size - 6} more", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
                                TextButton(onClick = onDismissUpdate, modifier = Modifier.align(Alignment.End)) { Text("Got it") }
                            }
                        }
                    }
                }
                // The event's own strip (name, dates, day or recap) in the fixed brand palette.
                item { EventMasthead(state) }
                if (now.phase == EventPhase.DURING) {
                    item { SectionHeader("Your plan now") }
                    item { PersonalPlanCard(state, onOpenPlan, onOpen) }
                }
                if (now.current.isNotEmpty()) {
                    item { SectionHeader("Happening now") }
                    items(now.current, key = { it.id }) { activity ->
                        SessionCard(
                            activity = activity,
                            bundle = state.bundle,
                            bookmarked = activity.id in state.bookmarks,
                            progress = Schedule.progress(activity, state.now),
                            onOpen = { onOpen(activity.id) },
                        )
                    }
                }
                now.next?.let { next ->
                    item { SectionHeader("Next in the programme") }
                    item {
                        SessionCard(
                            activity = next,
                            bundle = state.bundle,
                            bookmarked = next.id in state.bookmarks,
                            onOpen = { onOpen(next.id) },
                        )
                    }
                    item {
                        Text(
                            text = "Starts in ${Schedule.minutesUntil(next.start ?: state.now, state.now)} min",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                        )
                    }
                }
                if (now.current.isEmpty() && now.next == null) {
                    item {
                        EmptyState(
                            title = "Nothing scheduled",
                            body = "There is no session running right now.",
                        )
                    }
                }
                }
            }
        }
    }
}

/** The one card the attendee acts on: in progress or up next in their resolved plan, or why there is none. */
@Composable
private fun PersonalPlanCard(state: UiState, onOpenPlan: () -> Unit, onOpen: (String) -> Unit) {
    val plan = state.todayPlan
    val next = plan?.nextPlanned(state.now)
    Card(Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
        Column(Modifier.padding(16.dp)) {
            when {
                plan == null -> Text("No plan for today.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                !plan.feasible -> {
                    Text("Your plan has conflicting choices", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.error)
                    plan.blockingConflicts.take(3).forEach { Text(it.message, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp)) }
                    Text("Resolve them before choosing where to go.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp))
                }
                next == null -> Text("No more items in your plan today. Browse what's on or make time for a break.", style = MaterialTheme.typography.bodyMedium)
                else -> {
                    val room = state.bundle?.location(next.locationId)?.name
                    Text(
                        "${if (next.inProgress(state.now)) "In progress" else "Up next"} · ${Schedule.formatTime(next.start)}–${Schedule.formatTime(next.end)}" +
                            (if (next.source == ResolvedPlan.Source.MUST_ATTEND) " · must attend" else ""),
                        style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        next.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                        modifier = if (next.isSession) Modifier.clickable { onOpen(next.id) } else Modifier,
                    )
                    if (room != null) Text(room, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else if (!next.isSession) Text("Your own time", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!next.inProgress(state.now)) Text(
                        "Starts in ${Schedule.minutesUntil(next.start, state.now)} min",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            plan?.warnings?.firstOrNull()?.let {
                Text(it.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary, modifier = Modifier.padding(top = 4.dp))
            }
            TextButton(onClick = onOpenPlan, modifier = Modifier.align(Alignment.End)) { Text("Open your plan") }
        }
    }
}
