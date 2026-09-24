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
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.font.FontWeight
import org.indiafoss.companion.UiState
import androidx.compose.ui.draw.drawBehind
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.geometry.Size
import org.indiafoss.companion.ScheduleUpdate
import org.indiafoss.companion.core.ScheduleDiff
import org.indiafoss.companion.ui.EventMasthead
import org.indiafoss.companion.core.EventPhase
import org.indiafoss.companion.core.NowGo
import org.indiafoss.companion.core.ResolvedPlan
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.ui.mixSrgb
import org.indiafoss.companion.ui.theme.brand
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.sp

/**
 * Now: what is running in every room as one time grid, the PWA's Now page.
 * The attendee's resolved plan (#221) speaks through the grid: its talk is
 * the gold card. Only what the grid cannot show gets a line above it: a
 * conflict notice, when no destination can be picked, or a personal block,
 * which has no card. With nothing left in the plan, the programme's next
 * session is gold instead, labelled as that ([NowGo]).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowScreen(
    state: UiState,
    actions: @Composable () -> Unit,
    onRefresh: () -> Unit,
    onDismissUpdate: () -> Unit = {},
    onOpenPlan: () -> Unit = {},
    onOpen: (String) -> Unit,
) {
    // "Your plan" sits beside the title, as on the PWA: the grid below is the page.
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Now") },
                actions = {
                    TextButton(onClick = onOpenPlan) { Text("Your plan") }
                    actions()
                },
            )
        },
    ) { padding ->
        val now = state.nowState
        // Today's sessions still running or yet to start: the Now grid's rows.
        val remaining = remember(state.bundle, now?.day, state.now) {
            val nowMs = state.nowState?.let { Schedule.parseInstant(state.now) } ?: 0L
            val dayActivities = now?.day?.let(state::activitiesFor).orEmpty()
            dayActivities.filter { activity ->
                activity.end?.let { Schedule.parseInstant(it) > nowMs } == true
            }
        }
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
                    item { ScheduleUpdateCard(update, state.todayPlan, onDismissUpdate, onOpen) }
                }
                // The event's own strip (name, dates, day or recap) in the fixed brand palette.
                item { EventMasthead(state) }
                val plan = state.todayPlan
                val planItem = plan?.nextPlanned(state.now)
                val gridIds = remaining.map { it.id }.toSet()
                val go = NowGo.target(
                    planConflicted = plan != null && !plan.feasible,
                    planItemId = planItem?.id,
                    planItemIsSession = planItem?.isSession == true,
                    gridIds = gridIds,
                    programmeNextId = now.next?.id,
                )
                if (now.phase == EventPhase.DURING) {
                    when {
                        plan != null && !plan.feasible -> item { PlanConflictNotice(plan, onOpenPlan) }
                        planItem != null && planItem.id !in gridIds -> item { PlanBlockLine(planItem, state) }
                    }
                }
                if (remaining.isNotEmpty()) {
                    item {
                        NowGrid(
                            bundle = state.bundle!!,
                            day = now.day!!,
                            activities = remaining,
                            now = state.now,
                            goId = go?.id,
                            goLabel = go?.label,
                            header = {
                                Text(
                                    "Happening now",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            },
                            onOpen = onOpen,
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

/** Why no card is gold: the plan has conflicting choices, so nothing can be picked (#221). */
@Composable
private fun PlanConflictNotice(plan: ResolvedPlan.Plan, onOpenPlan: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 10.dp)) {
            Text(
                "Your plan has conflicting choices",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
            plan.blockingConflicts.firstOrNull()?.let {
                Text(it.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
            }
            TextButton(onClick = onOpenPlan, modifier = Modifier.align(Alignment.End)) { Text("Resolve them in your plan") }
        }
    }
}

/** A personal block from the plan, in the gold the grid would give a talk: it has no card to light. */
@Composable
private fun PlanBlockLine(item: ResolvedPlan.Item, state: UiState) {
    val brand = MaterialTheme.brand
    val shape = RoundedCornerShape(8.dp)
    val room = state.bundle?.location(item.locationId)?.name
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(shape)
            .background(mixSrgb(brand.surfaceRaised, brand.amberSoft, 0.85f))
            .border(2.dp, brand.amber, shape)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Text(
            NowGo.GOING.uppercase(),
            fontSize = 10.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 0.8.sp,
            color = brand.amberInk,
        )
        Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = brand.text)
        Text(
            (if (item.inProgress(state.now)) "Now · " else "") +
                Schedule.formatTime(item.start) + "–" + Schedule.formatTime(item.end) +
                (room?.let { " · $it" } ?: ""),
            style = MaterialTheme.typography.bodySmall,
            color = brand.textMuted,
        )
    }
}

/**
 * The schedule-change notice, openable onto what actually changed (#312).
 *
 * The counts alone ("1 room changed") told an attendee that something moved
 * but not what, leaving them to re-read the programme and hope to spot it.
 * **See what changed** discloses the whole list, one plain sentence each,
 * ordered by what costs most if acted on late; a row opens its session.
 *
 * Changes to sessions in the attendee's own plan for today come first, under
 * a heading and a rule down the side. "Their plan" is the resolved plan
 * (#221) that Now, the map and the reminders already read, not a second
 * notion of what is planned. When that plan cannot speak for the attendee -
 * no plan for today, or one made infeasible by a conflict - the list stays
 * flat and claims nothing about what affects them, rather than saying
 * "nothing in your plan changed" on a guess.
 *
 * When the revision being replaced could not be diffed there is no list and
 * no counts at all: part of a change list shown as the whole one is worse
 * than none.
 */
@Composable
fun ScheduleUpdateCard(
    update: ScheduleUpdate,
    plan: ResolvedPlan.Plan?,
    onDismissUpdate: () -> Unit,
    onOpen: (String) -> Unit,
) {
    var expanded by rememberSaveable(update.revision) { mutableStateOf(false) }
    val changes = update.changes
    val ruleColour = MaterialTheme.colorScheme.primary
    Card(
        Modifier.fillMaxWidth().padding(16.dp, 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Schedule updated · revision ${update.revision}", style = MaterialTheme.typography.titleSmall)
            if (changes == null) {
                Text(
                    "The programme changed. What changed cannot be listed for this update.",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 2.dp),
                )
            } else {
                update.summary?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp)) }
                // Only the resolved plan may say what is in the attendee's day.
                val plannedIds = plan?.takeIf { it.feasible && it.items.isNotEmpty() }?.plannedIds
                val mine = plannedIds?.let { ids -> changes.filter { it.activityId in ids } }.orEmpty()
                val rest = if (plannedIds == null) changes else changes.filterNot { it.activityId in plannedIds }
                TextButton(onClick = { expanded = !expanded }, modifier = Modifier.padding(top = 4.dp)) {
                    Text(if (expanded) "Hide what changed" else "See what changed")
                }
                if (expanded) {
                    if (mine.isNotEmpty()) {
                        ChangeGroupHeader("In your plan today")
                        Column(
                            Modifier
                                .drawBehind { drawRect(ruleColour, size = Size(2.dp.toPx(), size.height)) }
                                .padding(start = 10.dp),
                        ) { mine.forEach { ChangeRow(it, onOpen) } }
                        if (rest.isNotEmpty()) ChangeGroupHeader("Elsewhere in the programme")
                    }
                    rest.forEach { ChangeRow(it, onOpen) }
                }
            }
            TextButton(onClick = onDismissUpdate, modifier = Modifier.align(Alignment.End)) { Text("Got it") }
        }
    }
}

@Composable
private fun ChangeGroupHeader(text: String) = Text(
    text,
    style = MaterialTheme.typography.labelLarge,
    fontWeight = FontWeight.SemiBold,
    modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
)

/** One change: the session it happened to, then the change said in a sentence. */
@Composable
private fun ChangeRow(detail: ScheduleDiff.Detail, onOpen: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().clickable { onOpen(detail.activityId) }.padding(vertical = 4.dp)) {
        Text(detail.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
        Text(
            detail.description,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
