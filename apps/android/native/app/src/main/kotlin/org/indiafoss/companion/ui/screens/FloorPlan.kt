package org.indiafoss.companion.ui.screens

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The floor plans the web map draws (`venue-floors.ts`), exported to `floors.json`. */
@Serializable
data class FloorRoom(val id: String, val name: String, val key: String? = null, val cap: Int? = null, val cx: Double, val cy: Double, val d: String)

@Serializable
data class FloorWall(val d: String, val s: String, val w: Double)

@Serializable
data class FloorStairs(val d: String)

@Serializable
data class Floor(
    val id: String,
    val label: String,
    val viewBox: String,
    val outline: String,
    val fill: String,
    val rooms: List<FloorRoom> = emptyList(),
    val podiums: List<String> = emptyList(),
    val stairs: List<FloorStairs> = emptyList(),
    val walls: List<FloorWall> = emptyList(),
) {
    /** A floor room for a bundle location: by id, or by the 2025 location standing in for it. */
    fun roomFor(locationId: String): FloorRoom? = rooms.firstOrNull { it.id == locationId || it.key == locationId }
}

@Serializable
data class Floors(val floors: List<Floor> = emptyList())

object FloorPlans {
    private val json = Json { ignoreUnknownKeys = true }

    fun load(context: Context): List<Floor> = runCatching {
        context.assets.open("floors.json").bufferedReader().use { json.decodeFromString<Floors>(it.readText()).floors }
    }.getOrDefault(emptyList())
}

/** What a room is drawn with: lit while a session runs, marked where the attendee is. */
data class RoomState(val live: String? = null, val here: Boolean = false, val next: Boolean = false)

/**
 * One floor as vectors, pinch-to-zoom and drag, rooms lit while sessions
 * run in them and labelled with the minutes left, a dot for where you are.
 * Tapping a room reports it.
 */
@Composable
fun FloorPlanView(floor: Floor, states: Map<String, RoomState>, modifier: Modifier = Modifier, onRoomTap: (FloorRoom) -> Unit = {}) {
    val paths = remember(floor) {
        FloorPaths(
            outline = parse(floor.outline),
            fill = parse(floor.fill),
            rooms = floor.rooms.map { it to parse(it.d) },
            podiums = floor.podiums.map(::parse),
            stairs = floor.stairs.map { parse(it.d) },
            walls = floor.walls.map { it to parse(it.d) },
        )
    }
    val (vx, vy, vw, vh) = remember(floor) { floor.viewBox.split(" ").map { it.toFloat() } }
    var scale by remember(floor) { mutableFloatStateOf(1f) }
    var offset by remember(floor) { mutableStateOf(Offset.Zero) }
    val transform = rememberTransformableState { zoom, pan, _ ->
        scale = (scale * zoom).coerceIn(1f, 8f)
        offset += pan
    }
    val measurer = rememberTextMeasurer()
    val scheme = MaterialTheme.colorScheme
    val labelStyle = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = scheme.onSurface)
    val minutesStyle = TextStyle(fontSize = 10.sp, color = scheme.onPrimaryContainer)

    Canvas(
        modifier
            .fillMaxSize()
            .transformable(transform)
            .pointerInput(floor, states) {
                detectTapGestures { tap ->
                    // Undo the view transform to find which room was tapped.
                    val base = minOf(size.width / vw, size.height / vh)
                    val ox = (size.width - vw * base) / 2f
                    val oy = (size.height - vh * base) / 2f
                    val x = ((tap.x - size.width / 2f - offset.x) / scale + size.width / 2f - ox) / base + vx
                    val y = ((tap.y - size.height / 2f - offset.y) / scale + size.height / 2f - oy) / base + vy
                    paths.rooms.firstOrNull { (_, path) -> contains(path, x, y) }?.let { onRoomTap(it.first) }
                }
            },
    ) {
        val base = minOf(size.width / vw, size.height / vh)
        val ox = (size.width - vw * base) / 2f
        val oy = (size.height - vh * base) / 2f
        withTransform({
            translate(offset.x, offset.y)
            scale(scale, scale, pivot = center)
            translate(ox, oy)
            scale(base, base, pivot = Offset.Zero)
            translate(-vx, -vy)
        }) {
            val hair = 6f
            drawPath(paths.outline, scheme.surfaceContainerHighest)
            drawPath(paths.fill, scheme.surfaceContainerLow)
            drawPath(paths.outline, scheme.outline, style = Stroke(width = hair * 2))
            for ((room, path) in paths.rooms) {
                val state = states[room.id] ?: states[room.key ?: ""]
                val fill = when {
                    state?.here == true -> scheme.tertiaryContainer
                    state?.live != null -> scheme.primaryContainer
                    else -> scheme.surfaceContainer
                }
                drawPath(path, fill)
                drawPath(path, if (state?.next == true) scheme.tertiary else scheme.outlineVariant, style = Stroke(width = if (state?.next == true) hair * 4 else hair))
            }
            for (p in paths.podiums) drawPath(p, scheme.outlineVariant)
            for (p in paths.stairs) drawPath(p, scheme.onSurfaceVariant, style = Stroke(width = hair))
            for ((wall, path) in paths.walls) {
                val colour = when (wall.s.lowercase()) {
                    "#c0392b" -> scheme.error
                    "#7a3c00" -> scheme.tertiary
                    else -> scheme.outline
                }
                drawPath(path, colour, style = Stroke(width = (wall.w.toFloat() * 2).coerceAtLeast(hair), cap = StrokeCap.Round))
            }
        }
        // Labels are drawn in screen space so they stay legible at any zoom.
        for ((room, _) in paths.rooms) {
            val state = states[room.id] ?: states[room.key ?: ""]
            val sx = ((room.cx.toFloat() - vx) * base + ox - size.width / 2f) * scale + size.width / 2f + offset.x
            val sy = ((room.cy.toFloat() - vy) * base + oy - size.height / 2f) * scale + size.height / 2f + offset.y
            val label = measurer.measure(room.name, labelStyle)
            drawText(label, topLeft = Offset(sx - label.size.width / 2f, sy - label.size.height / 2f))
            state?.live?.let { live ->
                val sub = measurer.measure(live, minutesStyle)
                drawText(sub, topLeft = Offset(sx - sub.size.width / 2f, sy + label.size.height / 2f))
            }
            if (state?.here == true) {
                drawCircle(scheme.tertiary, radius = 14f, center = Offset(sx, sy - label.size.height))
                drawCircle(Color.White, radius = 5f, center = Offset(sx, sy - label.size.height))
            }
        }
    }
}

private class FloorPaths(
    val outline: Path,
    val fill: Path,
    val rooms: List<Pair<FloorRoom, Path>>,
    val podiums: List<Path>,
    val stairs: List<Path>,
    val walls: List<Pair<FloorWall, Path>>,
)

private fun parse(d: String): Path = runCatching { PathParser().parsePathString(d).toPath() }.getOrDefault(Path())

/** Point-in-path through the bounding box then an even-odd sample of the path's own area. */
private fun contains(path: Path, x: Float, y: Float): Boolean {
    val bounds = path.getBounds()
    if (!bounds.contains(Offset(x, y))) return false
    val probe = Path().apply { addRect(androidx.compose.ui.geometry.Rect(x - 1f, y - 1f, x + 1f, y + 1f)) }
    val hit = Path().apply { op(path, probe, androidx.compose.ui.graphics.PathOperation.Intersect) }
    return !hit.isEmpty
}
