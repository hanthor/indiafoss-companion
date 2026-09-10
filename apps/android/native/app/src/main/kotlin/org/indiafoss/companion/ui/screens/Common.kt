package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.ui.DevroomBanner
import org.indiafoss.companion.ui.theme.meta
import androidx.compose.foundation.layout.width

/** One session as an M3 card: time, room, speakers and a bookmark toggle. */
@Composable
fun SessionCard(
    activity: Activity,
    bundle: EventBundle?,
    bookmarked: Boolean = false,
    progress: Float? = null,
    onOpen: () -> Unit,
    onBookmark: (() -> Unit)? = null,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = timeAndRoom(activity, bundle),
                        style = MaterialTheme.typography.meta,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val track = bundle?.tracks?.firstOrNull { it.id == activity.devroomId }
                        ?: bundle?.tracks?.firstOrNull { it.id == activity.trackId }
                    track?.let {
                        Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            // A sliver of the devroom's pattern; the chip carries the name.
                            DevroomBanner(bundle, it.id, modifier = Modifier.width(56.dp), ratio = 2f)
                            Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.small) {
                                Text(it.name, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                    Text(
                        text = activity.title,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val speakers = bundle?.speakersOf(activity).orEmpty()
                    if (speakers.isNotEmpty()) {
                        Text(
                            text = speakers.joinToString { it.name },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                if (onBookmark != null) {
                    IconButton(onClick = onBookmark) {
                        Icon(
                            imageVector = if (bookmarked) Icons.Filled.Star else Icons.Outlined.StarBorder,
                            contentDescription = if (bookmarked) "Remove bookmark" else "Bookmark",
                            tint = if (bookmarked) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (activity.cancelled) {
                SuggestionChip(onClick = {}, label = { Text("Cancelled") }, enabled = false)
            }
            if (progress != null) {
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp),
                )
            }
        }
    }
}

fun timeAndRoom(activity: Activity, bundle: EventBundle?): String {
    val time = activity.start?.let { start ->
        val end = activity.end?.let { " – " + Schedule.formatTime(it) } ?: ""
        Schedule.formatTime(start) + end
    } ?: "Unscheduled"
    val room = bundle?.location(activity.locationId)?.name
    return if (room != null) "$time  ·  $room" else time
}
