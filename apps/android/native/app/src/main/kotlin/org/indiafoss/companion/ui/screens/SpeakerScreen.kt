package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.Alignment
import org.indiafoss.companion.ui.Avatar
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SpeakerScreen(state: UiState, personId: String, onOpenActivity: (String) -> Unit, onBack: () -> Unit) {
    val bundle = state.bundle
    val person = bundle?.person(personId)
    val sessions = bundle?.activities.orEmpty().filter { personId in it.speakerIds }.sortedBy { it.start ?: "" }
    val uriHandler = LocalUriHandler.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(person?.name ?: "Speaker") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { padding ->
        if (person == null) {
            EmptyState("Speaker not found", "They may have left the programme.", Modifier.padding(padding))
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().padding(padding)) {
            val line = listOfNotNull(person.designation, person.organization).joinToString(" · ")
            item {
                Row(Modifier.fillMaxWidth().padding(20.dp, 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Avatar(person.name, person.avatarUrl, size = 64.dp)
                    Column(Modifier.padding(start = 14.dp)) {
                        Text(person.name, style = MaterialTheme.typography.titleLarge)
                        if (line.isNotBlank()) Text(line, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
            person.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                item { Text(bio, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(20.dp, 8.dp)) }
            }
            if (person.links.isNotEmpty()) item {
                FlowRow(Modifier.fillMaxWidth().padding(20.dp, 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    person.links.forEach { link ->
                        AssistChip(onClick = { uriHandler.openUri(link.url) }, label = { Text(linkLabel(link.url, link.label)) })
                    }
                }
            }
            item { SectionHeader("Sessions (${sessions.size})") }
            items(sessions, key = { it.id }) { activity ->
                SessionCard(activity = activity, bundle = bundle, bookmarked = activity.id in state.bookmarks, onOpen = { onOpenActivity(activity.id) })
            }
        }
    }
}

/** A network name for a public profile URL, as the PWA's `classifyLink` does. */
fun linkLabel(url: String, label: String?): String {
    if (!label.isNullOrBlank() && !label.matches(Regex("(?i)social|link|url|website|profile"))) return label
    val host = Regex("^https?://(?:www\\.)?([^/]+)").find(url)?.groupValues?.get(1)?.lowercase() ?: return "Website"
    return when {
        host == "fossunited.org" && url.contains("/u/") -> "FOSS United"
        host.endsWith("github.com") -> "GitHub"
        host.endsWith("gitlab.com") -> "GitLab"
        host.endsWith("linkedin.com") -> "LinkedIn"
        host == "x.com" || host.endsWith("twitter.com") -> "X"
        host == "bsky.app" -> "Bluesky"
        host.endsWith("youtube.com") || host == "youtu.be" -> "YouTube"
        host.endsWith("medium.com") -> "Medium"
        host == "dev.to" -> "dev.to"
        host.endsWith("instagram.com") -> "Instagram"
        Regex("^https?://[^/]+/@[^/]+/?$").matches(url) -> "Mastodon"
        else -> "Website"
    }
}
