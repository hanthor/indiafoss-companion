package org.indiafoss.companion.ui.screens

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import kotlin.math.abs
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.core.ScheduleGrid
import org.indiafoss.companion.ui.DevroomColors
import org.indiafoss.companion.ui.mixSrgb
import org.indiafoss.companion.ui.theme.brand

/** Minutes of programme across the view: a 25-minute talk spans it by default. */
private const val DEFAULT_WINDOW = 25f
/** Zoomed in, a five-minute lightning talk fills the view; out, three hours. */
private const val MIN_WINDOW = 5f
private const val MAX_WINDOW = 180f
/** One press of a zoom button. */
private const val ZOOM_STEP = 1.6f
/** Re-anchor on now once it drifts this far across an idle view. */
private const val FOLLOW = 0.8f
private val ROW_HEIGHT = 112.dp
private val ROW_GAP = 6.dp
private val LABEL_WIDTH = 20.dp
/** Space between back-to-back talks, so two cards never touch. */
private val CARD_GAP = 4.dp
/**
 * The text fits whatever of its card is visible, down to this sliver: a talk
 * about to end shows its time and what of its title fits, rather than a wider
 * block pushed off the left edge.
 */
private val MIN_TEXT = 24.dp
/** Below this a card shows time and title only, the PWA's container query. */
private val NARROW = 120.dp
private val EDGE = 4.dp
private val RULER_HEIGHT = 20.dp
private val RULER_GAP = 4.dp
/** Ruler ticks: the finest spacing that leaves room for a time label. */
private val TICK_STEPS = listOf(5, 10, 15, 30, 60, 120)
private val MIN_TICK = 56.dp
/** Ticks that would sit under the now label step aside for it. */
private val NOW_LABEL = 48.dp
private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

/**
 * Happening now as a time grid, the PWA's NowGrid: one row per room, all
 * rows sharing one horizontal scroll so a column is a moment across the
 * venue. By default a 25-minute talk fills the visible width; a two-finger
 * pinch or the zoom buttons change that from 5 minutes to three hours,
 * holding the moment under the fingers. The grid opens with its left edge at
 * now: the first screen is what is on, everything later is a scroll to the
 * right. Room order comes from [ScheduleGrid], so it matches the Schedule
 * screen.
 *
 * A card's text starts at the visible left edge while the card runs off it,
 * so a talk that started twenty minutes ago still shows its title. The room
 * name is rotated into the left margin, frozen outside the scroll.
 *
 * [goId] is the one card to go to, drawn in gold and labelled [goLabel].
 */
@Composable
fun NowGrid(
    bundle: EventBundle,
    day: String,
    activities: List<Activity>,
    now: String,
    goId: String?,
    goLabel: String?,
    header: @Composable () -> Unit = {},
    onOpen: (String) -> Unit,
) {
    val layout = remember(bundle, activities, day) { ScheduleGrid.layout(bundle, activities, day) }
    if (layout.columns.isEmpty()) return
    // Fixed per day, so cards do not jump as earlier talks end and drop out.
    val span = remember(bundle, day) {
        val all = Schedule.activitiesForDay(bundle, day).filter { it.start != null && it.end != null }
        if (all.isEmpty()) {
            layout.startMs to layout.startMs + 3_600_000L
        } else {
            all.minOf { Schedule.parseInstant(it.start!!) } to all.maxOf { Schedule.parseInstant(it.end!!) }
        }
    }
    val (originMs, endMs) = span
    val hScroll = rememberScrollState()
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    var windowMinutes by rememberSaveable { mutableFloatStateOf(DEFAULT_WINDOW) }
    // Where this grid last put the scroll; anything else was the attendee.
    val memo = remember { ScrollMemo() }
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val laneWidth = maxWidth - LABEL_WIDTH
        val dpPerMinute = laneWidth / windowMinutes
        fun xOf(iso: String): Dp = dpPerMinute * ((Schedule.parseInstant(iso) - originMs) / 60_000f)
        val canvasWidth = dpPerMinute * ((endMs - originMs) / 60_000f)
        val lanePx = with(density) { laneWidth.toPx() }
        val nowPx = with(density) { xOf(now).toPx() }.coerceAtLeast(0f)

        // A scroll past the end is silently clamped to the old width, so wait
        // until the scroll range has grown to what the scale asks for.
        suspend fun place(target: Float, canvasPx: Float) {
            val needed = minOf(target, (canvasPx - lanePx).coerceAtLeast(0f)).roundToInt()
            withTimeoutOrNull(1_000) { snapshotFlow { hScroll.maxValue }.first { it >= needed - 1 } }
            hScroll.scrollTo(target.roundToInt())
            memo.placedAt = hScroll.value.toFloat()
        }

        LaunchedEffect(day, laneWidth) { place(nowPx, with(density) { canvasWidth.toPx() }) }
        // Follows now across a view nobody has touched; never after the
        // attendee has scrolled or zoomed, which would pull the grid out from
        // under their finger.
        LaunchedEffect(nowPx) {
            val untouched = memo.placedAt >= 0f && abs(hScroll.value - memo.placedAt) <= 2f
            if (untouched && nowPx > memo.placedAt + lanePx * FOLLOW) {
                place(nowPx, with(density) { canvasWidth.toPx() })
            }
        }

        /** Zoom so [focalPx] from the view's left keeps showing the same moment. */
        fun zoomTo(next: Float, focalPx: Float) {
            val clamped = snapToLimits(next)
            if (abs(clamped - windowMinutes) < 0.01f) return
            val focalMinute = (hScroll.value + focalPx) / (lanePx / windowMinutes)
            windowMinutes = clamped
            memo.placedAt = -1f
            val pxPerMinute = lanePx / clamped
            val target = (focalMinute * pxPerMinute - focalPx).coerceAtLeast(0f)
            scope.launch {
                place(target, pxPerMinute * ((endMs - originMs) / 60_000f))
                memo.placedAt = -1f
            }
        }

        Column {
        Row(
            Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f)) { header() }
        }
        // Pinch is the only zoom on screen. TalkBack hears the span and gets
        // zoom actions of its own, since a pinch is not something it can do.
        Row(
            Modifier.semantics {
                contentDescription = "Now by room and time"
                stateDescription = spanLabel(windowMinutes)
                customActions = listOf(
                    CustomAccessibilityAction("Zoom in") { zoomTo(windowMinutes / ZOOM_STEP, 0f); true },
                    CustomAccessibilityAction("Zoom out") { zoomTo(windowMinutes * ZOOM_STEP, 0f); true },
                )
            },
        ) {
            Column(Modifier.width(LABEL_WIDTH)) {
                Box(Modifier.height(RULER_HEIGHT + RULER_GAP))
                for (column in layout.columns) {
                    Box(Modifier.width(LABEL_WIDTH).height(ROW_HEIGHT), contentAlignment = Alignment.Center) {
                        Text(
                            column.name,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.rotateVertically(),
                        )
                    }
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    // Two fingers pinch the time axis, horizontally only; one
                    // finger still scrolls both ways. Seen first (Initial
                    // pass) so the scroll never starts panning a pinch.
                    .pointerInput(lanePx) {
                        awaitEachGesture {
                            awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                            var startSpan = 0f
                            var startWindow = 0f
                            var focal = 0f
                            do {
                                val event = awaitPointerEvent(PointerEventPass.Initial)
                                val down = event.changes.filter { it.pressed }
                                if (down.size >= 2) {
                                    val a = down[0].position.x
                                    val b = down[1].position.x
                                    val span = maxOf(abs(a - b), 40.dp.toPx())
                                    if (startSpan == 0f) {
                                        startSpan = span
                                        startWindow = windowMinutes
                                        focal = (a + b) / 2
                                    } else {
                                        zoomTo(startWindow / (span / startSpan), focal)
                                    }
                                    event.changes.forEach { it.consume() }
                                } else {
                                    startSpan = 0f
                                }
                            } while (event.changes.any { it.pressed })
                        }
                    }
                    .horizontalScroll(hScroll),
            ) {
                val nowX = xOf(now).takeIf { Schedule.parseInstant(now) in originMs..endMs }
                val lineColor = MaterialTheme.brand.mint
                Column(
                    Modifier
                        .width(canvasWidth)
                        // Now, down every row: drawn over the cards, under nothing.
                        .drawWithContent {
                            drawContent()
                            if (nowX != null) {
                                val x = nowX.toPx()
                                drawLine(lineColor, Offset(x, RULER_HEIGHT.toPx()), Offset(x, size.height), 2.dp.toPx())
                            }
                        },
                ) {
                    Ruler(bundle, originMs, endMs, dpPerMinute, nowX, now)
                    for (column in layout.columns) {
                        Box(Modifier.fillMaxWidth().height(ROW_HEIGHT)) {
                            // A room with nothing on now would be a blank strip that
                            // reads as broken; the stretch to its next talk says so.
                            val nowMs = Schedule.parseInstant(now)
                            val runningHere = column.slots.any {
                                Schedule.parseInstant(it.activity.start!!) <= nowMs &&
                                    Schedule.parseInstant(it.activity.end!!) > nowMs
                            }
                            val nextHere = column.slots
                                .map { it.activity }
                                .firstOrNull { Schedule.parseInstant(it.start!!) > nowMs }
                            if (!runningHere && nextHere != null) {
                                val gapLeft = xOf(now)
                                val gapWidth = xOf(nextHere.start!!) - gapLeft - CARD_GAP
                                if (gapWidth > 24.dp) {
                                    FreeGap(
                                        until = nextHere.start!!,
                                        leftPx = with(density) { gapLeft.toPx() },
                                        widthPx = with(density) { gapWidth.toPx() },
                                        lanePx = lanePx,
                                        scroll = hScroll,
                                        modifier = Modifier
                                            .offset(x = gapLeft)
                                            .width(gapWidth)
                                            .height(ROW_HEIGHT - ROW_GAP),
                                    )
                                }
                            }
                            for (slot in column.slots) {
                                val activity = slot.activity
                                val left = xOf(activity.start!!)
                                val width = maxOf(2.dp, xOf(activity.end!!) - left - CARD_GAP)
                                val laneHeight = ROW_HEIGHT / slot.lanes
                                NowGridCard(
                                    activity = activity,
                                    bundle = bundle,
                                    room = column.name,
                                    now = now,
                                    goLabel = goLabel.takeIf { activity.id == goId },
                                    leftPx = with(density) { left.toPx() },
                                    widthPx = with(density) { width.toPx() },
                                    lanePx = lanePx,
                                    scroll = hScroll,
                                    modifier = Modifier
                                        .offset(x = left, y = laneHeight * slot.lane)
                                        .width(width)
                                        .height(laneHeight - ROW_GAP),
                                    onOpen = { onOpen(activity.id) },
                                )
                            }
                        }
                    }
                }
            }
        }
        }
    }
}

/** Where the grid last put the scroll, so an attendee's own scroll is left alone. */
private class ScrollMemo {
    var placedAt = -1f
}

/**
 * Clamp to the zoom limits, snapping to one when a step lands close to it, so
 * the label never reads "5 min" while zoom-in is still enabled at 5.2.
 */
private fun snapToLimits(minutes: Float): Float = when {
    minutes < MIN_WINDOW * 1.15f -> MIN_WINDOW
    minutes > MAX_WINDOW / 1.15f -> MAX_WINDOW
    else -> minutes
}

/** "25 min", "1.5 h", "3 h". */
private fun spanLabel(minutes: Float): String {
    if (minutes < 60f) return "${minutes.roundToInt()} min"
    val hours = (minutes / 60f * 10f).roundToInt() / 10f
    return if (hours % 1f == 0f) "${hours.toInt()} h" else "$hours h"
}

/**
 * One talk. Devroom talks wear their devroom's colour and the rest the
 * event's, tinted as the PWA's schedule grid tints them; the card to go to is
 * gold, keeping its devroom edge so the branding holds.
 */
@Composable
private fun NowGridCard(
    activity: Activity,
    bundle: EventBundle,
    room: String,
    now: String,
    goLabel: String?,
    leftPx: Float,
    widthPx: Float,
    lanePx: Float,
    scroll: ScrollState,
    modifier: Modifier,
    onOpen: () -> Unit,
) {
    val brand = MaterialTheme.brand
    val density = LocalDensity.current
    // Narrow by what is visible, not by the card: a long talk mostly scrolled
    // off the left is as cramped as a lightning talk. Recomposes only when
    // the answer flips, not on every scrolled pixel.
    val narrow by remember(leftPx, widthPx, lanePx) {
        derivedStateOf {
            val minText = with(density) { MIN_TEXT.toPx() }
            visibleTextWidth(scroll.value, leftPx, widthPx, lanePx, minText) < with(density) { NARROW.toPx() }
        }
    }
    val nowMs = Schedule.parseInstant(now)
    val running = Schedule.parseInstant(activity.start!!) <= nowMs && Schedule.parseInstant(activity.end!!) > nowMs
    val times = Schedule.formatTime(activity.start!!) + "–" + Schedule.formatTime(activity.end!!)
    val devroom = DevroomColors.forActivity(bundle, activity)
    val hue = devroom ?: brand.mint
    val go = goLabel != null
    val background = if (go) {
        mixSrgb(brand.surfaceRaised, brand.amberSoft, 0.85f)
    } else {
        mixSrgb(brand.surfaceRaised, hue, if (brand.isDark) 0.28f else 0.12f)
    }
    // A main-hall talk's track is just its room's name, already on the row.
    val pill = remember(activity) {
        val track = bundle.tracks.firstOrNull { it.id == activity.devroomId }
            ?: bundle.tracks.firstOrNull { it.id == activity.trackId }
        track?.name?.takeIf { it != room }
    }
    val speakers = remember(activity) { bundle.speakersOf(activity).joinToString { it.name } }
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier
            .clip(shape)
            .background(background)
            .border(if (go) 2.dp else 1.dp, if (go) brand.amber else brand.line, shape)
            .clickable(onClick = onOpen)
            .semantics {
                contentDescription = listOfNotNull(goLabel, activity.title, times, room).joinToString(", ")
            },
    ) {
        Box(Modifier.width(EDGE).fillMaxHeight().background(hue))
        // The text block moves right to start at the visible edge, read in the
        // layout phase so scrolling never recomposes; never wider than the view.
        Box(Modifier.fillMaxHeight().visibleText(scroll, leftPx, widthPx, lanePx)) {
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(start = EDGE + if (narrow) 5.dp else 8.dp, end = if (narrow) 5.dp else 8.dp, top = 5.dp, bottom = 8.dp),
            ) {
                if (goLabel != null) {
                    Text(
                        goLabel.uppercase(),
                        fontSize = 10.sp,
                        lineHeight = 13.sp,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.8.sp,
                        color = brand.amberInk,
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    (if (running) "Now · " else "") + times,
                    fontSize = 11.sp,
                    lineHeight = 14.sp,
                    fontWeight = if (running) FontWeight.Bold else FontWeight.Normal,
                    color = if (running) brand.mintInk else brand.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    activity.title,
                    fontSize = 13.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = brand.text,
                    maxLines = if (narrow) 4 else 2,
                    overflow = TextOverflow.Ellipsis,
                    textDecoration = if (activity.cancelled) TextDecoration.LineThrough else null,
                    modifier = Modifier.padding(vertical = 1.dp),
                )
                if (!narrow && pill != null) {
                    // The schedule grid's band colour: the devroom lifted 30%
                    // towards white with ink on it, 5.9:1 or better for all
                    // eight devrooms in both themes.
                    Text(
                        pill.uppercase(),
                        fontSize = 10.sp,
                        lineHeight = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (devroom != null) brand.ink else brand.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .padding(vertical = 1.dp)
                            .clip(RoundedCornerShape(50))
                            .background(if (devroom != null) mixSrgb(devroom, brand.onInk, 0.30f) else brand.surface)
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
                if (!narrow && speakers.isNotEmpty()) {
                    Text(
                        speakers,
                        fontSize = 11.sp,
                        lineHeight = 14.sp,
                        color = brand.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/**
 * The time scale along the top: minimal labels that follow the zoom, each
 * starting on its tick so one at the scroll edge is never cut in half, and
 * now's time on the line.
 */
@Composable
private fun Ruler(bundle: EventBundle, originMs: Long, endMs: Long, dpPerMinute: Dp, nowX: Dp?, now: String) {
    val brand = MaterialTheme.brand
    val step = TICK_STEPS.firstOrNull { dpPerMinute * it >= MIN_TICK } ?: TICK_STEPS.last()
    val zone = remember(bundle) { ZoneId.of(bundle.timezone) }
    val ticks = remember(originMs, endMs, step, zone) {
        val five = 5 * 60_000L
        generateSequence(((originMs + five - 1) / five) * five) { it + five }
            .takeWhile { it <= endMs }
            .mapNotNull { t ->
                val local = Instant.ofEpochMilli(t).atZone(zone)
                if ((local.hour * 60 + local.minute) % step == 0) t to CLOCK.format(local) else null
            }
            .toList()
    }
    Box(Modifier.fillMaxWidth().height(RULER_HEIGHT)) {
        for ((t, label) in ticks) {
            val x = dpPerMinute * ((t - originMs) / 60_000f)
            if (nowX != null && x + NOW_LABEL > nowX && x < nowX + NOW_LABEL) continue
            Row(Modifier.offset(x = x).align(Alignment.BottomStart).height(14.dp)) {
                Box(Modifier.width(1.dp).fillMaxHeight().background(brand.line))
                Text(
                    label,
                    fontSize = 10.sp,
                    lineHeight = 12.sp,
                    color = brand.textMuted,
                    softWrap = false,
                    modifier = Modifier.padding(start = 3.dp),
                )
            }
        }
        if (nowX != null) {
            Text(
                Schedule.formatTime(now),
                fontSize = 10.sp,
                lineHeight = 12.sp,
                fontWeight = FontWeight.Bold,
                color = brand.ink,
                softWrap = false,
                modifier = Modifier
                    .offset(x = nowX - 1.dp)
                    .align(Alignment.BottomStart)
                    .clip(RoundedCornerShape(topEnd = 50.dp, bottomEnd = 50.dp))
                    .background(brand.mint)
                    .padding(horizontal = 5.dp, vertical = 1.dp)
                    .semantics { contentDescription = "Now, ${Schedule.formatTime(now)}" },
            )
        }
    }
    Box(Modifier.height(RULER_GAP))
}

/** A stretch with nothing on in its room, up to the room's next talk. */
@Composable
private fun FreeGap(
    until: String,
    leftPx: Float,
    widthPx: Float,
    lanePx: Float,
    scroll: ScrollState,
    modifier: Modifier,
) {
    val brand = MaterialTheme.brand
    val shape = RoundedCornerShape(6.dp)
    Box(modifier.clip(shape).border(1.dp, brand.line, shape)) {
        Box(Modifier.fillMaxHeight().visibleText(scroll, leftPx, widthPx, lanePx), contentAlignment = Alignment.CenterStart) {
            Text(
                "Free until ${Schedule.formatTime(until)}",
                fontSize = 12.sp,
                color = brand.textMuted,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Start,
                modifier = Modifier.padding(horizontal = 10.dp),
            )
        }
    }
}

/**
 * How much of a card's width its text gets: from the visible left edge to the
 * card's end, never wider than the view, and never under [MIN_TEXT].
 */
private fun textCut(scroll: Int, leftPx: Float, widthPx: Float, minTextPx: Float): Float =
    (scroll - leftPx).coerceIn(0f, (widthPx - minTextPx).coerceAtLeast(0f))

private fun visibleTextWidth(scroll: Int, leftPx: Float, widthPx: Float, lanePx: Float, minTextPx: Float): Float =
    minOf(widthPx - textCut(scroll, leftPx, widthPx, minTextPx), lanePx)

/**
 * Moves a card's text right to start at the visible edge, read in the layout
 * phase so scrolling never recomposes. CSS sticky cannot do this on the web
 * and Compose has no sticky at all: both platforms compute it.
 */
private fun Modifier.visibleText(scroll: ScrollState, leftPx: Float, widthPx: Float, lanePx: Float): Modifier =
    layout { measurable, constraints ->
        val minText = MIN_TEXT.toPx()
        val cut = textCut(scroll.value, leftPx, widthPx, minText).roundToInt()
        val width = visibleTextWidth(scroll.value, leftPx, widthPx, lanePx, minText).roundToInt().coerceAtLeast(0)
        val placeable = measurable.measure(Constraints.fixed(width, constraints.maxHeight))
        layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(cut, 0) }
    }

/**
 * Turn a composable on its side, reading bottom to top. Width and height swap,
 * so the caller sizes it as if it were still horizontal.
 */
private fun Modifier.rotateVertically(): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(
        Constraints(
            minWidth = constraints.minHeight,
            maxWidth = constraints.maxHeight,
            minHeight = constraints.minWidth,
            maxHeight = constraints.maxWidth,
        ),
    )
    layout(placeable.height, placeable.width) {
        placeable.placeRelativeWithLayer(
            x = -(placeable.width / 2 - placeable.height / 2),
            y = -(placeable.height / 2 - placeable.width / 2),
        ) { rotationZ = -90f }
    }
}
