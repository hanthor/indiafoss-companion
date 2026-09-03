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
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.EventPhase
import org.indiafoss.companion.core.Schedule

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowScreen(state: UiState, actions: @Composable () -> Unit, onRefresh: () -> Unit, onDismissUpdate: () -> Unit = {}, onOpen: (String) -> Unit) {
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
                if (now.phase != EventPhase.DURING) {
                    item {
                        SectionHeader(
                            if (now.phase == EventPhase.BEFORE) "Before the conference"
                            else "That's a wrap",
                        )
                    }
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
                    item { SectionHeader("Up next") }
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
