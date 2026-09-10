package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.ui.Avatar
import org.indiafoss.companion.ui.DevroomArt
import org.indiafoss.companion.ui.DevroomBanner
import org.indiafoss.companion.ui.theme.brand
import org.indiafoss.companion.core.Search

/**
 * Search across sessions, speakers and booths; booths and speakers browsable
 * without a query, under the 2026 devroom gallery (the PWA's home gallery;
 * a devroom opens the Rank step where whole tracks are chosen).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    state: UiState,
    actions: @Composable () -> Unit,
    onOpenActivity: (String) -> Unit,
    onOpenSpeaker: (String) -> Unit,
    onOpenBooth: (String) -> Unit = {},
    onOpenDevrooms: () -> Unit = {},
) {
    var query by rememberSaveable { mutableStateOf("") }
    val bundle = state.bundle
    val hits = if (bundle == null || query.isBlank()) emptyList() else Search.search(bundle, query, 40)
    val uriHandler = LocalUriHandler.current

    Scaffold(topBar = { TopAppBar(title = { Text("Explore") }, actions = { actions() }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth().padding(16.dp, 8.dp),
                placeholder = { Text("Sessions, speakers, booths") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
            )
            LazyColumn(Modifier.fillMaxSize()) {
                if (query.isNotBlank()) {
                    item {
                        Text(
                            "${hits.size} result${if (hits.size == 1) "" else "s"}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(20.dp, 4.dp),
                        )
                    }
                    items(hits, key = { "${it.kind}-${it.id}" }) { hit ->
                        ListItem(
                            leadingContent = if (hit.kind == Search.Kind.PERSON) ({
                                bundle?.person(hit.id)?.let { Avatar(it.name, it.avatarUrl) }
                            }) else null,
                            headlineContent = { Text(hit.title) },
                            supportingContent = { hit.subtitle?.let { Text(it, maxLines = 2) } },
                            overlineContent = {
                                Text(when (hit.kind) { Search.Kind.ACTIVITY -> "Session"; Search.Kind.PERSON -> "Speaker"; Search.Kind.BOOTH -> "Booth" })
                            },
                            modifier = Modifier.clickable {
                                when (hit.kind) {
                                    Search.Kind.ACTIVITY -> onOpenActivity(hit.id)
                                    Search.Kind.PERSON -> onOpenSpeaker(hit.id)
                                    Search.Kind.BOOTH -> onOpenBooth(hit.id)
                                }
                            },
                        )
                        HorizontalDivider()
                    }
                } else {
                    val devrooms = bundle?.tracks.orEmpty().filter { DevroomArt.forTrack(bundle, it.id) != null }
                    if (devrooms.isNotEmpty()) {
                        item { SectionHeader("Find your devroom") }
                        item {
                            Text(
                                "Half-day tracks curated by their communities. Pick a few talks, or stay for a whole devroom.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(20.dp, 0.dp, 20.dp, 8.dp),
                            )
                        }
                        item {
                            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(devrooms, key = { "art-" + it.id }) { track ->
                                    Card(
                                        Modifier.width(200.dp).clickable(onClick = onOpenDevrooms),
                                        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.brand.surfaceRaised, contentColor = MaterialTheme.brand.text),
                                    ) {
                                        DevroomBanner(bundle, track.id, ratio = 2f, shape = androidx.compose.ui.graphics.RectangleShape)
                                        Text(
                                            track.name,
                                            style = MaterialTheme.typography.titleSmall,
                                            maxLines = 3,
                                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                                            modifier = Modifier.padding(12.dp, 10.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                    val booths = bundle?.booths.orEmpty()
                    if (booths.isNotEmpty()) {
                        item { SectionHeader("Booths") }
                        items(booths, key = { "booth-" + it.id }) { booth ->
                            ListItem(
                                headlineContent = { Text(booth.name) },
                                supportingContent = {
                                    Text(listOfNotNull(booth.category, bundle?.location(booth.locationId)?.name).joinToString(" · "))
                                },
                                modifier = Modifier.clickable { onOpenBooth(booth.id) },
                            )
                            HorizontalDivider()
                        }
                    }
                    val speakers = bundle?.people.orEmpty().sortedBy { it.name }
                    if (speakers.isNotEmpty()) {
                        item { SectionHeader("Speakers") }
                        items(speakers, key = { "p-" + it.id }) { person ->
                            ListItem(
                                leadingContent = { Avatar(person.name, person.avatarUrl, size = 36.dp) },
                                headlineContent = { Text(person.name) },
                                supportingContent = {
                                    val line = listOfNotNull(person.designation, person.organization).joinToString(" · ")
                                    if (line.isNotBlank()) Text(line, maxLines = 1)
                                },
                                modifier = Modifier.clickable { onOpenSpeaker(person.id) },
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}
