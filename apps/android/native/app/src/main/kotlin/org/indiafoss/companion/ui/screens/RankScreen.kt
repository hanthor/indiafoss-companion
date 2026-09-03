package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.Choice
import org.indiafoss.companion.core.Itinerary
import org.indiafoss.companion.core.Ranking
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.core.Track
import org.indiafoss.companion.data.SessionRating

/** The three rounds of ranking (docs/ranking.md): rooms, quick pass, head to head. */
private enum class Round(val label: String) { ROOMS("Rooms"), QUICK("Quick pass"), PAIRS("Head to head") }

/** One answer that can be taken back: the ratings before it, and the record to forget. */
private data class Undo(val before: Map<String, SessionRating>, val comparisonId: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RankScreen(
    state: UiState,
    onAnswerQuick: (String, String?) -> Unit,
    onRoom: (String, String?) -> Unit,
    onRoomsDecided: () -> Unit,
    onChoose: (Activity, Activity, Choice) -> Unit,
    onUndo: (Map<String, SessionRating>, String) -> Unit,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
) {
    val bundle = state.bundle
    val days = state.days
    var day by remember(days) { mutableIntStateOf(0) }
    val rooms = remember(bundle) { rankableRooms(state) }
    var chosen by remember { mutableStateOf<Round?>(null) }
    var undo by remember { mutableStateOf<Undo?>(null) }

    val sessions = if (days.isEmpty()) emptyList() else
        state.activitiesFor(days[day.coerceIn(0, days.lastIndex)]).filter { !it.cancelled && it.type != "meal" }
    val untriaged = sessions.filter { state.ranking.rating(it.id).triage == null }
    val answered = state.ranking.answeredPairs
    val model = state.affinity
    val pool = model.apply(sessions.map(state::ranked))
    val progress = Ranking.progress(pool, answered)
    val candidate = Ranking.selectNext(pool, answered)
    val choices = answered.count { key -> key.split("|").all { id -> sessions.any { it.id == id } } }
    val round = chosen ?: when {
        !state.ranking.roomsDecided && rooms.size > 1 -> Round.ROOMS
        untriaged.isNotEmpty() && choices == 0 -> Round.QUICK
        else -> Round.PAIRS
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Rank your day") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (days.isEmpty()) {
                EmptyState("No programme yet", "Ranking needs the schedule first.")
                return@Column
            }
            TabRow(selectedTabIndex = day.coerceIn(0, days.lastIndex)) {
                days.forEachIndexed { index, _ ->
                    Tab(selected = index == day, onClick = { day = index }, text = { Text("Day ${index + 1}") })
                }
            }
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(16.dp, 12.dp, 16.dp, 4.dp)) {
                Round.entries.forEachIndexed { index, r ->
                    SegmentedButton(
                        selected = round == r,
                        onClick = { chosen = r },
                        shape = SegmentedButtonDefaults.itemShape(index, Round.entries.size),
                        label = { Text("${index + 1} · ${r.label}") },
                    )
                }
            }
            when (round) {
                Round.ROOMS -> RoomsRound(rooms, state, onRoom) { onRoomsDecided(); chosen = Round.QUICK }
                Round.QUICK -> QuickRound(state, sessions, untriaged, progress.open, onAnswerQuick, onOpen) {
                    chosen = Round.PAIRS
                }
                Round.PAIRS -> PairsRound(
                    state = state,
                    candidate = candidate,
                    progress = progress,
                    choices = choices,
                    taste = model.tasteLine(bundle?.tracks.orEmpty()),
                    canUndo = undo != null,
                    onChoose = { a, b, choice ->
                        undo = Undo(
                            before = mapOf(a.id to state.ranking.rating(a.id), b.id to state.ranking.rating(b.id)),
                            comparisonId = "", // filled from the store's latest record on undo
                        )
                        onChoose(a, b, choice)
                    },
                    onUndo = {
                        val last = state.ranking.comparisons.lastOrNull()
                        undo?.let { u -> if (last != null) onUndo(u.before, last.id) }
                        undo = null
                    },
                    onOpen = onOpen,
                    leaderboard = pool.filter { it.disposition != org.indiafoss.companion.core.Disposition.NOT_INTERESTED }
                        .sortedByDescending { it.rating }.take(4),
                )
            }
        }
    }
}

private data class Room(val track: Track, val sessions: List<Activity>, val main: Boolean)

/** Rooms with sessions to rank; a room is a main hall when a keynote happens there. */
private fun rankableRooms(state: UiState): List<Room> {
    val bundle = state.bundle ?: return emptyList()
    return bundle.tracks.map { track ->
        val sessions = bundle.activities.filter { it.trackId == track.id && !it.cancelled && it.type != "meal" }
        Room(track, sessions, sessions.any { it.type == "keynote" })
    }.filter { it.sessions.isNotEmpty() }
        .sortedWith(compareByDescending<Room> { it.main }.thenByDescending { it.sessions.size })
}

@Composable
private fun RoomsRound(rooms: List<Room>, state: UiState, onRoom: (String, String?) -> Unit, onDone: () -> Unit) {
    val skipped = rooms.count { state.ranking.rooms[it.track.id] == "skip" }
    val loved = rooms.count { state.ranking.rooms[it.track.id] == "love" }
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Text(
                "Which rooms are for you? Skip a room and none of its talks are shown again; " +
                    "Love one and its talks start a little higher. The main halls are always in.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp, 8.dp),
            )
        }
        items(rooms, key = { it.track.id }) { room ->
            val pref = state.ranking.rooms[room.track.id]
            Card(Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(room.track.name, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "${room.sessions.size} session${if (room.sessions.size == 1) "" else "s"}" +
                            if (room.main) " · main hall" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    val options = if (room.main) listOf("OK", "Love") else listOf("Skip", "OK", "Love")
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        options.forEachIndexed { index, label ->
                            val value = when (label) { "Skip" -> "skip"; "Love" -> "love"; else -> null }
                            SegmentedButton(
                                selected = pref == value,
                                onClick = { onRoom(room.track.id, value) },
                                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                                label = { Text(label) },
                            )
                        }
                    }
                }
            }
        }
        item {
            Button(onClick = onDone, modifier = Modifier.padding(16.dp)) {
                Text(if (skipped + loved > 0) "Done · $skipped skipped, $loved loved" else "All rooms are fine")
            }
        }
    }
}

@Composable
private fun QuickRound(
    state: UiState,
    sessions: List<Activity>,
    untriaged: List<Activity>,
    open: Int,
    onAnswer: (String, String?) -> Unit,
    onOpen: (String) -> Unit,
    onSettle: () -> Unit,
) {
    val kept = sessions.count { state.ranking.rating(it.id).triage == "yes" }
    val dropped = sessions.count { state.ranking.rating(it.id).triage == "no" }
    var showAnswered by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Text(
                "Tap Yes for anything you might go to and No for what you would not. " +
                    "Only the Yeses that overlap need settling afterwards.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp, 8.dp),
            )
            Row(Modifier.fillMaxWidth().padding(20.dp, 0.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("$kept in · $dropped out", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text("${untriaged.size} to go", style = MaterialTheme.typography.labelLarge)
            }
            LinearProgressIndicator(
                progress = { if (sessions.isEmpty()) 0f else (sessions.size - untriaged.size).toFloat() / sessions.size },
                modifier = Modifier.fillMaxWidth().padding(20.dp, 6.dp),
            )
        }
        if (untriaged.isEmpty()) {
            item {
                Card(Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Quick pass done", style = MaterialTheme.typography.titleMedium)
                        Text(
                            if (open > 0) "$kept in, $dropped out. $open overlap${if (open == 1) "" else "s"} among your Yeses still need a winner."
                            else "$kept in, $dropped out. Nothing you kept overlaps — your plan is ready.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                        )
                        if (open > 0) Button(onClick = onSettle) { Text("Settle $open overlap${if (open == 1) "" else "s"}") }
                    }
                }
            }
        }
        items(untriaged, key = { it.id }) { activity ->
            val clashes = sessions.count {
                it.id != activity.id && state.dispositionOf(it.id) != org.indiafoss.companion.core.Disposition.NOT_INTERESTED &&
                    Itinerary.overlaps(it, activity)
            }
            Card(Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(timeAndRoom(activity, state.bundle), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = { onOpen(activity.id) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                            Text(activity.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                        }
                        val speakers = state.bundle?.speakersOf(activity).orEmpty()
                        if (speakers.isNotEmpty()) Text(speakers.joinToString { it.name }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (clashes > 0) Text("Overlaps $clashes other${if (clashes == 1) "" else "s"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        FilledTonalButton(onClick = { onAnswer(activity.id, "yes") }) { Text("Yes") }
                        OutlinedButton(onClick = { onAnswer(activity.id, "no") }) { Text("No") }
                    }
                }
            }
        }
        val answered = sessions.filter { state.ranking.rating(it.id).triage != null }
        if (answered.isNotEmpty()) {
            item {
                TextButton(onClick = { showAnswered = !showAnswered }, modifier = Modifier.padding(16.dp, 8.dp)) {
                    Text(if (showAnswered) "Hide answered (${answered.size})" else "Change answered (${answered.size})")
                }
            }
            if (showAnswered) items(answered, key = { "a-" + it.id }) { activity ->
                Row(Modifier.fillMaxWidth().padding(20.dp, 2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(activity.title, style = MaterialTheme.typography.bodyMedium)
                        Text(Schedule.formatTime(activity.start ?: ""), style = MaterialTheme.typography.labelSmall)
                    }
                    Text(if (state.ranking.rating(activity.id).triage == "no") "OUT" else "IN", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    TextButton(onClick = { onAnswer(activity.id, null) }) { Text("Undo") }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun PairsRound(
    state: UiState,
    candidate: org.indiafoss.companion.core.ComparisonCandidate?,
    progress: Ranking.Progress,
    choices: Int,
    taste: String,
    canUndo: Boolean,
    onChoose: (Activity, Activity, Choice) -> Unit,
    onUndo: () -> Unit,
    onOpen: (String) -> Unit,
    leaderboard: List<org.indiafoss.companion.core.RankedActivity>,
) {
    val stability = if (progress.conflicts == 0) 1f else progress.settled.toFloat() / progress.conflicts
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Row(Modifier.fillMaxWidth().padding(20.dp, 8.dp, 20.dp, 0.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${(stability * 100).toInt()}% resolved", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text("$choices choice${if (choices == 1) "" else "s"} · ${progress.open} open", style = MaterialTheme.typography.labelLarge)
            }
            LinearProgressIndicator(progress = { stability }, modifier = Modifier.fillMaxWidth().padding(20.dp, 6.dp))
        }
        if (candidate == null) {
            item {
                Card(Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("All settled", style = MaterialTheme.typography.titleMedium)
                        Text("Every overlap for this day has a winner. Your plan is built around them.", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        } else {
            val a = candidate.activityA.activity
            val b = candidate.activityB.activity
            item {
                val reason = when (candidate.reason) {
                    org.indiafoss.companion.core.Reason.CONFLICT -> "Overlap · you can only be in one"
                    org.indiafoss.companion.core.Reason.CLOSE_RATINGS -> "Close call · rated almost the same"
                    else -> "New to you · neither ranked yet"
                }
                AssistChip(onClick = {}, label = { Text(reason) }, modifier = Modifier.padding(20.dp, 4.dp))
            }
            item { PickCard(a, state, onOpen) { onChoose(a, b, Choice.A) } }
            item { Text("vs", style = MaterialTheme.typography.labelMedium, modifier = Modifier.fillMaxWidth().padding(4.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
            item { PickCard(b, state, onOpen) { onChoose(a, b, Choice.B) } }
            item {
                Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onChoose(a, b, Choice.TIE) }, modifier = Modifier.weight(1f)) { Text("Either is fine") }
                    OutlinedButton(onClick = { onChoose(a, b, Choice.NEITHER) }, modifier = Modifier.weight(1f)) { Text("Neither, skip both") }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().padding(16.dp, 4.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onUndo, enabled = canUndo) {
                    Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = null)
                    Text("Undo last", Modifier.padding(start = 6.dp))
                }
                Spacer(Modifier.weight(1f))
                Text(
                    if (taste.isNotEmpty()) "Learning your taste: $taste" else "Your picks update a local rating. Nothing is sent anywhere.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(2f),
                )
            }
        }
        if (leaderboard.isNotEmpty()) {
            item { SectionHeader("Top of your list") }
            items(leaderboard, key = { "top-" + it.activity.id }) { ranked ->
                Row(Modifier.fillMaxWidth().padding(20.dp, 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(ranked.activity.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                        Text(timeAndRoom(ranked.activity, state.bundle), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(ranked.rating.toInt().toString(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun PickCard(activity: Activity, state: UiState, onOpen: (String) -> Unit, onPick: () -> Unit) {
    Card(
        onClick = onPick,
        modifier = Modifier.fillMaxWidth().padding(16.dp, 4.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(timeAndRoom(activity, state.bundle), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(activity.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            val speakers = state.bundle?.speakersOf(activity).orEmpty()
            if (speakers.isNotEmpty()) Text(speakers.joinToString { it.name }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { onOpen(activity.id) }) { Text("More info") }
                FilledTonalButton(onClick = onPick) { Text("Pick this") }
            }
        }
    }
}
