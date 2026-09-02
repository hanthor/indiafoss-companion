package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Schedule

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(state: UiState, onOpen: (String) -> Unit) {
    val bundle = state.bundle
    val saved = bundle?.activities
        ?.filter { it.id in state.bookmarks || it.id in state.mustAttend }
        ?.sortedBy { it.start ?: "" }
        .orEmpty()
    val mustAttend = saved.filter { it.id in state.mustAttend }
    val bookmarked = saved.filter { it.id !in state.mustAttend }

    Scaffold(topBar = { TopAppBar(title = { Text("My plan") }) }) { padding ->
        if (saved.isEmpty()) {
            EmptyState(
                title = "Nothing saved yet",
                body = "Star a session on the schedule and it lands here, grouped by day.",
                modifier = Modifier.padding(padding),
            )
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            if (mustAttend.isNotEmpty()) {
                item { SectionHeader("Must attend") }
                items(mustAttend, key = { it.id }) { activity ->
                    SessionCard(
                        activity = activity,
                        bundle = bundle,
                        bookmarked = true,
                        onOpen = { onOpen(activity.id) },
                    )
                }
            }
            var lastDay: String? = null
            items(bookmarked, key = { it.id }) { activity ->
                val day = activity.start?.let(Schedule::dayKey)
                if (day != null && day != lastDay) {
                    lastDay = day
                    SectionHeader(day)
                }
                SessionCard(
                    activity = activity,
                    bundle = bundle,
                    bookmarked = true,
                    onOpen = { onOpen(activity.id) },
                )
            }
        }
    }
}
