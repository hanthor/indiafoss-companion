package org.indiafoss.companion.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.indiafoss.companion.CompanionViewModel
import org.indiafoss.companion.UiState
import org.indiafoss.companion.ui.Avatar
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.Disposition
import org.indiafoss.companion.core.Person
import org.indiafoss.companion.core.RankedActivity
import org.indiafoss.companion.core.Ranking
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.core.Track
import kotlin.math.abs
import kotlin.math.min

/** The three steps of ranking (docs/ranking.md, #108): devrooms, one talk at a time, then each slot. */
private enum class Step(val label: String) { DEVROOMS("Devrooms"), TALKS("Talks"), SLOTS("Overlaps") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RankScreen(
    state: UiState,
    onAnswerCard: (String, String) -> Unit,
    onClearAnswer: (String) -> Unit,
    onRoom: (String, String?) -> Unit,
    onRoomsDecided: () -> Unit,
    onPick: (Activity, List<Activity>) -> CompanionViewModel.Undo,
    onTie: (List<Activity>) -> CompanionViewModel.Undo,
    onDrop: (List<Activity>) -> CompanionViewModel.Undo,
    onUndo: (CompanionViewModel.Undo) -> Unit,
    onOpen: (String) -> Unit,
    onOpenSpeaker: (String) -> Unit,
    onBack: () -> Unit,
) {
    val bundle = state.bundle
    val days = state.days
    var day by remember(days) { mutableIntStateOf(0) }
    val rooms = remember(bundle) { devrooms(state) }
    var chosen by remember { mutableStateOf<Step?>(null) }
    var undo by remember { mutableStateOf<CompanionViewModel.Undo?>(null) }

    val sessions = if (days.isEmpty()) emptyList() else
        state.activitiesFor(days[day.coerceIn(0, days.lastIndex)]).filter { !it.cancelled && it.type != "meal" }
    val untriaged = sessions.filter { state.ranking.rating(it.id).triage == null }
    val answered = state.ranking.answeredPairs
    val model = state.affinity
    val pool = model.apply(sessions.map(state::ranked))
    val progress = Ranking.progress(pool, answered)
    val slots = Ranking.slots(pool, answered)
    val ids = sessions.map { it.id }.toSet()
    val choices = answered.count { key -> key.split("|").let { it.size == 2 && it[0] in ids && it[1] in ids } }
    val step = chosen ?: when {
        !state.ranking.roomsDecided && rooms.isNotEmpty() -> Step.DEVROOMS
        untriaged.isNotEmpty() && choices == 0 -> Step.TALKS
        else -> Step.SLOTS
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
                Step.entries.forEachIndexed { index, s ->
                    SegmentedButton(
                        selected = step == s,
                        onClick = { chosen = s },
                        shape = SegmentedButtonDefaults.itemShape(index, Step.entries.size),
                        label = { Text(s.label, maxLines = 1) },
                    )
                }
            }
            when (step) {
                Step.DEVROOMS -> DevroomsStep(rooms, state, onRoom, onOpen) { onRoomsDecided(); chosen = Step.TALKS }
                Step.TALKS -> TalksStep(
                    state = state,
                    sessions = sessions,
                    untriaged = untriaged,
                    openSlots = slots.size,
                    onAnswer = { id, answer -> chosen = Step.TALKS; onAnswerCard(id, answer) },
                    onClear = onClearAnswer,
                    onOpen = onOpen,
                    onOpenSpeaker = onOpenSpeaker,
                    onSettle = { chosen = Step.SLOTS },
                )
                Step.SLOTS -> SlotsStep(
                    state = state,
                    slots = slots,
                    answered = answered,
                    progress = progress,
                    choices = choices,
                    untriaged = untriaged.size,
                    taste = model.tasteLine(bundle?.tracks.orEmpty()),
                    canUndo = undo != null,
                    onPick = { winner, losers -> undo = onPick(winner, losers) },
                    onTie = { members -> undo = onTie(members) },
                    onDrop = { members -> undo = onDrop(members) },
                    onUndo = { undo?.let(onUndo); undo = null },
                    onOpen = onOpen,
                    onSort = { chosen = Step.TALKS },
                    leaderboard = pool.filter { it.disposition != Disposition.NOT_INTERESTED }
                        .sortedByDescending { it.rating }.take(4),
                )
            }
        }
    }
}

private data class Room(val track: Track, val sessions: List<Activity>)

/** The devrooms alone: rooms with sessions where no keynote happens. The main halls are always in. */
private fun devrooms(state: UiState): List<Room> {
    val bundle = state.bundle ?: return emptyList()
    return bundle.tracks.map { track ->
        Room(track, bundle.activities.filter { it.trackId == track.id && !it.cancelled && it.type != "meal" })
    }.filter { it.sessions.isNotEmpty() && it.sessions.none { s -> s.type == "keynote" } }
        .sortedByDescending { it.sessions.size }
}

/** "10 talks · Sat 11:00–17:30", from the room's programme. */
private fun roomLine(room: Room): String {
    val timed = room.sessions.filter { it.start != null && it.end != null }.sortedBy { it.start }
    val days = timed.map { it.start!!.substring(0, 10) }.distinct()
    val when_ = days.joinToString(", ") { d ->
        val on = timed.filter { it.start!!.startsWith(d) }
        val lo = on.first().start!!
        val hi = on.maxOf { it.end!! }
        "${Schedule.formatDayLabel(d).take(3)} ${Schedule.formatTime(lo)}–${Schedule.formatTime(hi)}"
    }
    val n = room.sessions.size
    return "$n ${if (n == 1) "talk" else "talks"}" + if (when_.isNotEmpty()) " · $when_" else ""
}

/** Tags worth a chip: not the session type again, not a CFP category pasted whole. */
private fun topicTags(tags: Iterable<String>): List<String> =
    tags.filter { it.length <= 20 && it.lowercase() !in setOf("talk", "lightning talk", "keynote", "workshop", "panel", "bof", "devroom") }

@Composable
private fun DevroomsStep(rooms: List<Room>, state: UiState, onRoom: (String, String?) -> Unit, onOpen: (String) -> Unit, onDone: () -> Unit) {
    val out = rooms.count { state.ranking.rooms[it.track.id] == "skip" }
    val must = rooms.count { state.ranking.rooms[it.track.id] == "love" }
    var openRoom by remember { mutableStateOf<String?>(null) }
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Text(
                "Which devrooms are for you? Not interested takes a room's talks out of the day; " +
                    "Must go puts them ahead of the rest. The main halls are always in.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp, 8.dp),
            )
        }
        if (rooms.isEmpty()) item {
            Card(Modifier.fillMaxWidth().padding(16.dp)) {
                Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No devrooms", style = MaterialTheme.typography.titleMedium)
                    Text("This programme runs in the main halls only.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 12.dp))
                    Button(onClick = onDone) { Text("On to the talks") }
                }
            }
        }
        items(rooms, key = { it.track.id }) { room ->
            val pref = state.ranking.rooms[room.track.id]
            val tags = topicTags(room.sessions.flatMap { it.tags }.groupingBy { it }.eachCount().entries.sortedByDescending { it.value }.map { it.key }).take(3)
            val speakers = state.bundle?.let { b -> room.sessions.flatMap(b::speakersOf).distinctBy { it.id } }.orEmpty()
            Card(Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text(room.track.name, style = MaterialTheme.typography.titleMedium)
                    room.track.description?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp)) }
                    Text(roomLine(room), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (tags.isNotEmpty()) Row(Modifier.padding(top = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        tags.forEach { SuggestionChip(onClick = {}, label = { Text(it, maxLines = 1, overflow = TextOverflow.Ellipsis) }) }
                    }
                    if (speakers.isNotEmpty()) Text(
                        speakers.take(3).joinToString { it.name } + if (speakers.size > 3) " and ${speakers.size - 3} more" else "",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                    TextButton(onClick = { openRoom = if (openRoom == room.track.id) null else room.track.id }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                        Text(if (openRoom == room.track.id) "Hide the talks" else "What's on")
                    }
                    if (openRoom == room.track.id) room.sessions.forEach { s ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                            Text(s.start?.let(Schedule::formatTime) ?: "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(48.dp))
                            Column(Modifier.weight(1f)) {
                                TextButton(onClick = { onOpen(s.id) }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                                    Text(s.title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                                }
                                val names = state.bundle?.speakersOf(s).orEmpty().joinToString { it.name }
                                if (names.isNotEmpty()) Text(names, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    val options = listOf("Not interested" to "skip", "Interested" to null, "Must go" to "love")
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        options.forEachIndexed { index, (label, value) ->
                            SegmentedButton(
                                selected = pref == value,
                                onClick = { onRoom(room.track.id, value) },
                                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                                label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelMedium) },
                            )
                        }
                    }
                }
            }
        }
        if (rooms.isNotEmpty()) item {
            Button(onClick = onDone, modifier = Modifier.padding(16.dp)) {
                Text(if (out + must > 0) "Done · $out out, $must must go" else "All devrooms are fine")
            }
        }
    }
}

@Composable
private fun TalksStep(
    state: UiState,
    sessions: List<Activity>,
    untriaged: List<Activity>,
    openSlots: Int,
    onAnswer: (String, String) -> Unit,
    onClear: (String) -> Unit,
    onOpen: (String) -> Unit,
    onOpenSpeaker: (String) -> Unit,
    onSettle: () -> Unit,
) {
    val kept = sessions.count { state.ranking.rating(it.id).triage == "yes" }
    val dropped = sessions.count { state.ranking.rating(it.id).triage == "no" }
    var showAnswered by remember { mutableStateOf(false) }
    val card = untriaged.firstOrNull()
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Row(Modifier.fillMaxWidth().padding(20.dp, 4.dp, 20.dp, 0.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("$kept in · $dropped out", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text("${untriaged.size} to go", style = MaterialTheme.typography.labelLarge)
            }
            LinearProgressIndicator(
                progress = { if (sessions.isEmpty()) 0f else (sessions.size - untriaged.size).toFloat() / sessions.size },
                modifier = Modifier.fillMaxWidth().padding(20.dp, 6.dp),
            )
        }
        if (card == null) {
            item {
                Card(Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Talks sorted", style = MaterialTheme.typography.titleMedium)
                        Text(
                            if (openSlots > 0) "$kept in, $dropped out. $openSlots time slot${if (openSlots == 1) "" else "s"} still ${if (openSlots == 1) "has" else "have"} talks you kept that overlap."
                            else "$kept in, $dropped out. Nothing you kept overlaps — your plan is ready.",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                            textAlign = TextAlign.Center,
                        )
                        if (openSlots > 0) Button(onClick = onSettle) { Text("Settle $openSlots slot${if (openSlots == 1) "" else "s"}") }
                    }
                }
            }
        } else {
            item {
                Text(
                    "Swipe right if you might go, left if not. Only the Yeses that overlap need settling afterwards.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(20.dp, 4.dp),
                )
            }
            item {
                val clashes = sessions.count {
                    it.id != card.id && state.dispositionOf(it.id) != Disposition.NOT_INTERESTED && Ranking.overlaps(it, card)
                }
                SwipeCard(card, state, clashes, onOpen, onOpenSpeaker, onAnswer)
            }
            item {
                Row(Modifier.fillMaxWidth().padding(16.dp, 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onAnswer(card.id, "no") }, modifier = Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(8.dp, 10.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text("Not for me", Modifier.padding(start = 4.dp), maxLines = 1, style = MaterialTheme.typography.labelLarge)
                    }
                    FilledTonalButton(onClick = { onAnswer(card.id, "yes") }, modifier = Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(8.dp, 10.dp)) {
                        Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text("Interested", Modifier.padding(start = 4.dp), maxLines = 1, style = MaterialTheme.typography.labelLarge)
                    }
                    Button(onClick = { onAnswer(card.id, "must") }, modifier = Modifier.weight(1f), contentPadding = androidx.compose.foundation.layout.PaddingValues(8.dp, 10.dp)) {
                        Icon(Icons.Filled.Star, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text("Must go", Modifier.padding(start = 4.dp), maxLines = 1, style = MaterialTheme.typography.labelLarge)
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
                    val label = when {
                        state.ranking.rating(activity.id).triage == "no" -> "OUT"
                        activity.id in state.mustAttend -> "MUST"
                        else -> "IN"
                    }
                    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    TextButton(onClick = { onClear(activity.id) }) { Text("Undo") }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

/** A talk as a card to swipe: right keeps it, left rules it out. The buttons under it do the same. */
@Composable
private fun SwipeCard(
    card: Activity,
    state: UiState,
    clashes: Int,
    onOpen: (String) -> Unit,
    onOpenSpeaker: (String) -> Unit,
    onAnswer: (String, String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val offset = remember(card.id) { Animatable(0f) }
    var readMore by remember(card.id) { mutableStateOf(false) }
    val commit = 260f
    LaunchedEffect(card.id) { offset.snapTo(0f) }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp, 4.dp)
            .graphicsLayer {
                translationX = offset.value
                rotationZ = offset.value / 40f
                alpha = 1f - min(0.6f, abs(offset.value) / 1200f)
            }
            .pointerInput(card.id) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        val x = offset.value
                        when {
                            x > commit -> scope.launch { offset.animateTo(1600f, tween(180)); onAnswer(card.id, "yes") }
                            x < -commit -> scope.launch { offset.animateTo(-1600f, tween(180)); onAnswer(card.id, "no") }
                            else -> scope.launch { offset.animateTo(0f) }
                        }
                    },
                    onDragCancel = { scope.launch { offset.animateTo(0f) } },
                    onHorizontalDrag = { change, delta -> change.consume(); scope.launch { offset.snapTo(offset.value + delta) } },
                )
            },
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(card.type.replace('-', ' ').uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Text(timeAndRoom(card, state.bundle), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (offset.value > 40f) Text("INTERESTED", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            if (offset.value < -40f) Text("NOT FOR ME", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.tertiary)
            Text(card.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
            val speakers = state.bundle?.speakersOf(card).orEmpty()
            speakers.forEach { p -> SpeakerRow(p) { onOpenSpeaker(p.id) } }
            val abstract = card.description
            if (abstract.isNullOrBlank()) {
                Text("No abstract for this one yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            } else {
                Text(
                    abstract,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = if (readMore) Int.MAX_VALUE else 4,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp),
                )
                TextButton(onClick = { readMore = !readMore }, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text(if (readMore) "Less" else "Read more")
                }
            }
            val tags = topicTags(card.tags).take(3)
            if (tags.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                tags.forEach { SuggestionChip(onClick = {}, label = { Text(it, maxLines = 1) }) }
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                if (clashes > 0) Text("Overlaps $clashes other${if (clashes == 1) "" else "s"}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                else Spacer(Modifier.width(1.dp))
                TextButton(onClick = { onOpen(card.id) }) { Text("Full details") }
            }
        }
    }
}

@Composable
private fun SpeakerRow(person: Person, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Avatar(person.name, person.avatarUrl, size = 36.dp)
        Column(Modifier.padding(start = 10.dp).weight(1f)) {
            TextButton(onClick = onClick, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                Text(person.name, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
            }
            val line = listOfNotNull(person.designation, person.organization).filter { it.isNotBlank() }.joinToString(" · ")
            if (line.isNotEmpty()) Text(line, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SlotsStep(
    state: UiState,
    slots: List<Ranking.Slot>,
    answered: Set<String>,
    progress: Ranking.Progress,
    choices: Int,
    untriaged: Int,
    taste: String,
    canUndo: Boolean,
    onPick: (Activity, List<Activity>) -> Unit,
    onTie: (List<Activity>) -> Unit,
    onDrop: (List<Activity>) -> Unit,
    onUndo: () -> Unit,
    onOpen: (String) -> Unit,
    onSort: () -> Unit,
    leaderboard: List<RankedActivity>,
) {
    val stability = if (progress.conflicts == 0) 1f else progress.settled.toFloat() / progress.conflicts
    val skipped = remember { mutableStateOf(setOf<String>()) }
    val slot = slots.firstOrNull { it.key !in skipped.value } ?: slots.firstOrNull()
    val isBackup = slot != null && slot.members.any { m ->
        slot.members.any { o -> o !== m && Ranking.pairKey(m.activity.id, o.activity.id) in answered }
    }
    LazyColumn(Modifier.fillMaxSize()) {
        item {
            Row(Modifier.fillMaxWidth().padding(20.dp, 8.dp, 20.dp, 0.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${(stability * 100).toInt()}% resolved", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                Text("$choices choice${if (choices == 1) "" else "s"} · ${progress.open} open", style = MaterialTheme.typography.labelLarge)
            }
            LinearProgressIndicator(progress = { stability }, modifier = Modifier.fillMaxWidth().padding(20.dp, 6.dp))
        }
        if (slot == null) {
            item {
                Card(Modifier.fillMaxWidth().padding(16.dp)) {
                    Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("All settled", style = MaterialTheme.typography.titleMedium)
                        Text(
                            if (progress.conflicts == 0 && untriaged > 0) "Nothing overlaps yet. Sorting the talks first tells the app what you would skip."
                            else "Every overlap for this day has a winner. Your plan is built around them.",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                        )
                        if (progress.conflicts == 0 && untriaged > 0) Button(onClick = onSort) { Text("Sort the talks") }
                    }
                }
            }
        } else {
            val members = slot.members.map { it.activity }
            item {
                Row(Modifier.fillMaxWidth().padding(20.dp, 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AssistChip(onClick = {}, label = { Text("Slot ${slots.indexOf(slot) + 1} of ${slots.size} · ${Schedule.formatTime(slot.start)}–${Schedule.formatTime(slot.end)}") })
                }
                Text(
                    if (isBackup) "And if that falls through?" else "Which one would you go to?",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(20.dp, 0.dp, 20.dp, 4.dp),
                )
            }
            items(slot.members, key = { "m-" + it.activity.id }) { r ->
                val losers = slot.members.filter { o -> o !== r && Ranking.pairOpen(r, o, answered) }.map { it.activity }
                PickCard(r, state, onOpen) { onPick(r.activity, losers) }
            }
            item {
                Row(Modifier.fillMaxWidth().padding(16.dp, 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { onTie(members) }, modifier = Modifier.weight(1f)) { Text("Any of these") }
                    OutlinedButton(onClick = { onDrop(members) }, modifier = Modifier.weight(1f)) { Text("None of these") }
                }
                if (slots.size > 1) TextButton(
                    onClick = {
                        val rest = slots.filter { it.key != slot.key && it.key !in skipped.value }
                        skipped.value = if (rest.isEmpty()) setOf(slot.key) else skipped.value + slot.key
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Decide this slot later") }
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
                        Text(ranked.activity.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
private fun PickCard(ranked: RankedActivity, state: UiState, onOpen: (String) -> Unit, onPick: () -> Unit) {
    val activity = ranked.activity
    Card(onClick = onPick, modifier = Modifier.fillMaxWidth().padding(16.dp, 4.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(activity.type.replace('-', ' ').uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Text(timeAndRoom(activity, state.bundle), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(activity.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            val speakers = state.bundle?.speakersOf(activity).orEmpty()
            if (speakers.isNotEmpty()) Text(speakers.joinToString { it.name }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (ranked.disposition == Disposition.MUST_ATTEND) Text("★ MUST GO", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { onOpen(activity.id) }) { Text("About this talk") }
                FilledTonalButton(onClick = onPick) { Text("This one") }
            }
        }
    }
}
