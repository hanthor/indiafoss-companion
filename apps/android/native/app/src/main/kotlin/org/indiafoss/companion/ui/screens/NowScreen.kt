package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
fun NowScreen(state: UiState, onRefresh: () -> Unit, onOpen: (String) -> Unit) {
    Scaffold(topBar = { TopAppBar(title = { Text("Now") }) }) { padding ->
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

            else -> LazyColumn(Modifier.fillMaxSize().padding(padding)) {
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
