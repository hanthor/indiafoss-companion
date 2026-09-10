package org.indiafoss.companion.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import org.indiafoss.companion.UiState
import org.indiafoss.companion.core.EventPhase
import org.indiafoss.companion.ui.theme.brand
import org.indiafoss.companion.ui.theme.eyebrow
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The event's own strip at the top of Now — name, dates, where the
 * conference is in its run — on the ink surface with the mint accent, from
 * [org.indiafoss.companion.ui.theme.LocalBrand] rather than the Material
 * scheme, so a wallpaper palette never recolours the event identity (#33).
 * It replaces the "Before the conference" / "That's a wrap" headers.
 */
@Composable
fun EventMasthead(state: UiState, modifier: Modifier = Modifier) {
    val bundle = state.bundle ?: return
    val brand = MaterialTheme.brand
    val phase = state.nowState?.phase
    val dayIndex = state.days.indexOf(state.nowState?.day)
    val status = when {
        phase == EventPhase.BEFORE -> "Before the conference"
        phase == EventPhase.AFTER -> "That's a wrap"
        dayIndex >= 0 && state.days.size > 1 -> "Day ${dayIndex + 1} of ${state.days.size}"
        else -> "Today"
    }
    Column(
        modifier
            .fillMaxWidth()
            .padding(16.dp, 8.dp)
            .clip(MaterialTheme.shapes.large)
            .background(brand.inkSurface),
    ) {
        // The restrained pixel accent: one mint rule, not a striped app bar.
        Box(Modifier.fillMaxWidth().height(4.dp).background(brand.mint))
        Column(Modifier.padding(20.dp, 16.dp)) {
            Text(
                "${eventDates(bundle.start, bundle.end)} · ${status.uppercase()}",
                style = MaterialTheme.typography.eyebrow,
                color = brand.mintOnInk,
            )
            Text(
                bundle.name,
                style = MaterialTheme.typography.headlineSmall,
                color = brand.onInk,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
    }
}

/** "26–27 September 2026", or "26 September – 2 October 2026" across months. */
fun eventDates(start: String, end: String): String {
    val from = runCatching { LocalDate.parse(start.take(10)) }.getOrNull() ?: return ""
    val to = runCatching { LocalDate.parse(end.take(10)) }.getOrNull() ?: from
    val month = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)
    return when {
        from == to -> "${from.dayOfMonth} ${from.format(month)}"
        from.month == to.month && from.year == to.year -> "${from.dayOfMonth}–${to.dayOfMonth} ${from.format(month)}"
        else -> "${from.dayOfMonth} ${from.format(DateTimeFormatter.ofPattern("MMMM", Locale.ENGLISH))} – ${to.dayOfMonth} ${to.format(month)}"
    }
}
