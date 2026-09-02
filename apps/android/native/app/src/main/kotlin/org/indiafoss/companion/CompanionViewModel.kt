package org.indiafoss.companion

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.NowState
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.data.EventRepository
import org.indiafoss.companion.data.PreferencesStore
import org.indiafoss.companion.data.RefreshResult

data class UiState(
    val loading: Boolean = true,
    val bundle: EventBundle? = null,
    val now: String = "",
    val bookmarks: Set<String> = emptySet(),
    val mustAttend: Set<String> = emptySet(),
    val message: String? = null,
) {
    val nowState: NowState?
        get() = bundle?.let { Schedule.nowState(it, now) }

    val days: List<String> get() = bundle?.let(Schedule::eventDays) ?: emptyList()

    fun activitiesFor(day: String): List<Activity> =
        bundle?.let { Schedule.activitiesForDay(it, day) } ?: emptyList()

    fun activity(id: String): Activity? = bundle?.activities?.firstOrNull { it.id == id }
}

class CompanionViewModel(app: Application) : AndroidViewModel(app) {
    private val repository = EventRepository(app)
    private val preferences = PreferencesStore(app)
    private val _state = MutableStateFlow(UiState(now = nowIso()))
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val cached = repository.cached()
            _state.update { it.copy(loading = false, bundle = cached, now = nowIso()) }
            preferences.bookmarks.collect { saved ->
                _state.update { it.copy(bookmarks = saved) }
            }
        }
        viewModelScope.launch {
            preferences.mustAttend.collect { saved -> _state.update { it.copy(mustAttend = saved) } }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            when (val result = repository.refresh()) {
                is RefreshResult.Updated ->
                    _state.update {
                        it.copy(
                            bundle = result.bundle,
                            now = nowIso(),
                            message = "Schedule updated to revision ${result.revision}",
                        )
                    }
                is RefreshResult.Failed ->
                    _state.update { it.copy(message = null) } // offline is normal; stay quiet
                RefreshResult.UpToDate -> _state.update { it.copy(now = nowIso()) }
            }
        }
    }

    fun tick() = _state.update { it.copy(now = nowIso()) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    fun toggleBookmark(id: String) {
        viewModelScope.launch { preferences.toggleBookmark(id) }
    }

    fun toggleMustAttend(id: String) {
        viewModelScope.launch { preferences.toggleMustAttend(id) }
    }

    private fun nowIso(): String = IsoClock.now()
}

/** Current time as an ISO instant in the event's offset (+05:30). */
object IsoClock {
    private const val OFFSET_MINUTES = 330L

    fun now(millis: Long = System.currentTimeMillis()): String = format(millis)

    fun format(millis: Long, offsetMinutes: Long = OFFSET_MINUTES): String {
        val total = Math.floorDiv(millis, 1000L) + offsetMinutes * 60
        val days = Math.floorDiv(total, 86_400L)
        val secondsOfDay = Math.floorMod(total, 86_400L)
        val (year, month, day) = civilFromDays(days)
        val sign = if (offsetMinutes < 0) '-' else '+'
        val absolute = kotlin.math.abs(offsetMinutes)
        return "%04d-%02d-%02dT%02d:%02d:%02d%c%02d:%02d".format(
            year, month, day,
            secondsOfDay / 3600, (secondsOfDay % 3600) / 60, secondsOfDay % 60,
            sign, absolute / 60, absolute % 60,
        )
    }

    private fun civilFromDays(days: Long): Triple<Int, Int, Int> {
        val z = days + 719_468
        val era = Math.floorDiv(z, 146_097L)
        val doe = z - era * 146_097
        val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
        val y = yoe + era * 400
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = doy - (153 * mp + 2) / 5 + 1
        val m = mp + if (mp < 10) 3 else -9
        return Triple((if (m <= 2) y + 1 else y).toInt(), m.toInt(), d.toInt())
    }
}
