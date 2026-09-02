package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Schedule

/** Session detail: the one screen where a talk becomes a bookmark or a must-attend. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ActivityScreen(
    state: UiState,
    activityId: String,
    onBookmark: (String) -> Unit,
    onMustAttend: (String) -> Unit,
    onBack: () -> Unit,
) {
    val activity = state.activity(activityId)
    val bundle = state.bundle
    val uriHandler = LocalUriHandler.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(activity?.title ?: "Session") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (activity == null) {
            EmptyState(
                title = "Session not found",
                body = "It may have been removed from the schedule.",
                modifier = Modifier.padding(padding),
            )
            return@Scaffold
        }

        val bookmarked = activityId in state.bookmarks
        val mustAttend = activityId in state.mustAttend

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item {
                Text(
                    text = timeAndRoom(activity, bundle),
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                )
            }
            activity.subtitle?.let { subtitle ->
                item {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp),
                    )
                }
            }
            item {
                FlowRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilledTonalButton(onClick = { onBookmark(activityId) }) {
                        Icon(
                            imageVector = if (bookmarked) Icons.Filled.Star else Icons.Outlined.StarBorder,
                            contentDescription = null,
                        )
                        Text(
                            text = if (bookmarked) "Bookmarked" else "Bookmark",
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    OutlinedButton(onClick = { onMustAttend(activityId) }) {
                        Icon(
                            imageVector = if (mustAttend) Icons.Filled.Notifications
                            else Icons.Outlined.NotificationsNone,
                            contentDescription = null,
                        )
                        Text(
                            text = if (mustAttend) "Must attend" else "Mark must attend",
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
            if (mustAttend) {
                item {
                    Text(
                        text = "You will be reminded ${Schedule.MUST_ATTEND_HEADS_UP_MINUTES} minutes " +
                            "before this one starts.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp),
                    )
                }
            }
            activity.description?.takeIf { it.isNotBlank() }?.let { description ->
                item {
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                    )
                }
            }
            if (activity.keyTakeaways.isNotEmpty()) {
                item { SectionHeader("Key takeaways") }
                items(activity.keyTakeaways) { takeaway ->
                    Text(
                        text = "•  $takeaway",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 2.dp),
                    )
                }
            }
            val speakers = bundle?.speakersOf(activity).orEmpty()
            if (speakers.isNotEmpty()) {
                item { SectionHeader(if (speakers.size == 1) "Speaker" else "Speakers") }
                items(speakers) { person ->
                    ListItem(
                        headlineContent = { Text(person.name) },
                        supportingContent = {
                            val affiliation = listOfNotNull(person.designation, person.organization)
                                .joinToString(" · ")
                            if (affiliation.isNotBlank()) Text(affiliation)
                        },
                    )
                    HorizontalDivider()
                }
            }
            if (activity.tags.isNotEmpty()) {
                item { SectionHeader("Tags") }
                item {
                    FlowRow(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        activity.tags.forEach { tag ->
                            AssistChip(onClick = {}, label = { Text(tag) })
                        }
                    }
                }
            }
            val links = activity.links + activity.references
            if (links.isNotEmpty()) {
                item { SectionHeader("Links") }
                items(links) { link ->
                    ListItem(
                        headlineContent = { Text(link.label ?: link.url) },
                        supportingContent = { Text(link.url) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { uriHandler.openUri(link.url) },
                    )
                    HorizontalDivider()
                }
            }
            activity.sourceUrl?.let { url ->
                item {
                    OutlinedButton(
                        onClick = { uriHandler.openUri(url) },
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    ) { Text("Open on the website") }
                }
            }
            item { Column(Modifier.padding(bottom = 24.dp)) {} }
        }
    }
}
