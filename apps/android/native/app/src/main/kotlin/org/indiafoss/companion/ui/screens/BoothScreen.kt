package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState

/**
 * A booth's page (#110): what it is, where it is and how far, the website,
 * and "Plan a visit", which adds a flexible 30-minute block the plan places
 * in the day's largest gap.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun BoothScreen(
    state: UiState,
    boothId: String,
    onPlanVisit: (boothId: String, day: String) -> Unit,
    onOpenMap: () -> Unit,
    onBack: () -> Unit,
) {
    val bundle = state.bundle
    val booth = bundle?.booths?.firstOrNull { it.id == boothId }
    val uriHandler = LocalUriHandler.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(booth?.name ?: "Booth") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
            )
        },
    ) { padding ->
        if (booth == null) {
            EmptyState("Booth not found", "It may have left the programme.", Modifier.padding(padding))
            return@Scaffold
        }
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            val where = bundle.location(booth.locationId)
            val walk = booth.locationId?.let { state.walkSecondsTo(it) }
            val line = listOfNotNull(
                booth.category?.replace('-', ' ')?.replaceFirstChar { it.uppercase() },
                where?.name,
                walk?.let { "${(it + 59) / 60} min walk" },
            ).joinToString(" · ")
            if (line.isNotBlank()) Text(line, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(20.dp, 8.dp))
            booth.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(20.dp, 4.dp))
            }
            if (booth.tags.isNotEmpty()) FlowRow(Modifier.fillMaxWidth().padding(20.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                booth.tags.take(8).forEach { SuggestionChip(onClick = {}, label = { Text(it) }) }
            }
            Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val today = state.nowState?.let { Schedule_dayFor(state.now, state.days) } ?: state.days.firstOrNull()
                val planned = state.blocks.any { it.locationId == booth.locationId && it.label.contains(booth.name) }
                Button(onClick = { if (today != null) onPlanVisit(booth.id, today) }, enabled = today != null && !planned) {
                    Text(if (planned) "Visit planned" else "Plan a visit · 30 min")
                }
                if (where != null) OutlinedButton(onClick = onOpenMap) { Text("On the map") }
            }
            val site = booth.website
            if (site != null) AssistChip(
                onClick = { uriHandler.openUri(site) },
                label = { Text(linkLabel(site, null)) },
                modifier = Modifier.padding(20.dp, 4.dp),
            )
        }
    }
}

/** The day the clock is on when it falls inside the event, otherwise the first day. */
@Suppress("FunctionName")
private fun Schedule_dayFor(now: String, days: List<String>): String? =
    days.firstOrNull { now.startsWith(it) } ?: days.firstOrNull()
