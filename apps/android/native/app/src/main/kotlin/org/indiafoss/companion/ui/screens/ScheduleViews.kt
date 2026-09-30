package org.indiafoss.companion.ui.screens

import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics

/**
 * One Schedule tab, three ways to read it, as on the PWA: the horizontal
 * timeline that opens at now, the rooms side by side, and the agenda list.
 */
enum class ScheduleView(val label: String) { Timeline("Timeline"), Rooms("Rooms"), Agenda("Agenda") }

/** The switch in the top app bar; it is the screen's title. */
@Composable
fun ScheduleViewSwitch(current: ScheduleView, onView: (ScheduleView) -> Unit) {
    val views = ScheduleView.entries
    SingleChoiceSegmentedButtonRow(Modifier.semantics { heading(); paneTitle = "Schedule" }) {
        views.forEachIndexed { index, view ->
            SegmentedButton(
                selected = view == current,
                onClick = { if (view != current) onView(view) },
                shape = SegmentedButtonDefaults.itemShape(index, views.size),
                icon = {},
            ) { Text(view.label, maxLines = 1) }
        }
    }
}
