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
import org.indiafoss.companion.core.AffinityModel
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.VCard
import org.indiafoss.companion.data.MetContact
import org.indiafoss.companion.data.ProfileStore
import org.indiafoss.companion.core.Choice
import org.indiafoss.companion.core.Disposition
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.Itinerary
import org.indiafoss.companion.core.NowState
import org.indiafoss.companion.core.RankedActivity
import org.indiafoss.companion.core.Ranking
import org.indiafoss.companion.core.Schedule
import org.indiafoss.companion.data.EventRepository
import org.indiafoss.companion.data.PreferencesStore
import org.indiafoss.companion.data.RankingState
import org.indiafoss.companion.data.RatingsStore
import org.indiafoss.companion.data.RefreshResult
import org.indiafoss.companion.data.StoredComparison
import org.indiafoss.companion.reminders.ReminderScheduler

data class UiState(
    val loading: Boolean = true,
    val bundle: EventBundle? = null,
    val now: String = "",
    val bookmarks: Set<String> = emptySet(),
    val mustAttend: Set<String> = emptySet(),
    val ranking: RankingState = RankingState(),
    val remindersEnabled: Boolean = false,
    val profile: ContactCard = ContactCard(),
    val contacts: List<MetContact> = emptyList(),
    val message: String? = null,
) {
    /** Disposition as the ranking store knows it, with the must-attend set folded in. */
    fun dispositionOf(id: String): Disposition =
        if (id in mustAttend) Disposition.MUST_ATTEND else ranking.dispositionOf(id)

    fun ranked(activity: Activity): RankedActivity {
        val r = ranking.rating(activity.id)
        return RankedActivity(activity, r.rating, r.comparisons, dispositionOf(activity.id))
    }

    /** The taste learnt from every answer so far (docs/ranking.md). */
    val affinity: AffinityModel
        get() = AffinityModel.learn(
            bundle?.activities.orEmpty().filter { !it.cancelled && it.type != "meal" }.map(::ranked),
            ranking.history,
            ranking.roomPreferences,
        )

    /** The stored rating with the taste prior blended in; what selection and planning use. */
    fun effectiveRating(activity: Activity): Double = affinity.ratingWithPrior(ranked(activity))

    fun itineraryFor(day: String): List<Itinerary.Item> {
        val b = bundle ?: return emptyList()
        val model = affinity
        val byId = b.activities.associateBy { it.id }
        return Itinerary.forDay(
            b, day,
            ratingOf = { id -> byId[id]?.let { model.ratingWithPrior(ranked(it)) } ?: Ranking.INITIAL_RATING },
            dispositionOf = ::dispositionOf,
            bookmarked = { it in bookmarks },
        )
    }

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
    private val ratings = RatingsStore(app)
    private val reminders = ReminderScheduler(app)
    private val profiles = ProfileStore(app)
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
        viewModelScope.launch {
            ratings.state.collect { saved -> _state.update { it.copy(ranking = saved) } }
        }
        viewModelScope.launch {
            preferences.remindersEnabled.collect { on -> _state.update { it.copy(remindersEnabled = on) } }
        }
        viewModelScope.launch { profiles.profile.collect { card -> _state.update { it.copy(profile = card) } } }
        viewModelScope.launch { profiles.contacts.collect { met -> _state.update { it.copy(contacts = met) } } }
        // Whatever changes the plan re-arms the alarms: bookmarks, must-attend, the bundle.
        viewModelScope.launch {
            state.collect { s -> if (s.bundle != null) reminders.arm(s) }
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

    // ---------- Contact card (docs/contact-sharing.md) ----------

    fun saveProfile(card: ContactCard) {
        viewModelScope.launch { profiles.saveProfile(card) }
    }

    /** A scanned QR: a vCard becomes a saved contact, tagged with the session running now. */
    fun addScanned(text: String) {
        val card = VCard.parse(text)
        if (card == null || card.fullName.isBlank()) {
            _state.update { it.copy(message = "That code is not a contact card.") }
            return
        }
        val running = state.value.nowState?.current?.firstOrNull()?.id
        viewModelScope.launch {
            profiles.addContact(
                MetContact(
                    id = "contact-${System.currentTimeMillis()}", card = card, vcard = text,
                    savedAt = System.currentTimeMillis(), metActivityId = running,
                ),
            )
            _state.update { it.copy(message = "Saved ${card.fullName}") }
        }
    }

    fun removeContact(id: String) {
        viewModelScope.launch { profiles.removeContact(id) }
    }

    fun setRemindersEnabled(on: Boolean) {
        viewModelScope.launch { preferences.setRemindersEnabled(on) }
    }

    // ---------- Ranking (docs/ranking.md) ----------

    fun answerQuick(id: String, answer: String?) {
        viewModelScope.launch { ratings.setTriage(id, answer) }
    }

    fun setRoom(trackId: String, pref: String?) {
        val sessions = state.value.bundle?.activities.orEmpty()
            .filter { it.trackId == trackId && !it.cancelled && it.type != "meal" }
            .map { it.id }
        viewModelScope.launch { ratings.setRoom(trackId, pref, sessions) }
    }

    fun roomsDecided() {
        viewModelScope.launch { ratings.markRoomsDecided() }
    }

    /** One head-to-head answer: the Elo update on the stored ratings, recorded for undo and the prior. */
    fun choose(a: Activity, b: Activity, choice: Choice) {
        val s = state.value
        val ra = s.ranking.rating(a.id)
        val rb = s.ranking.rating(b.id)
        val result = Ranking.applyComparison(ra.rating, rb.rating, choice, Ranking.pairKScale(ra.comparisons, rb.comparisons))
        viewModelScope.launch {
            ratings.setRating(a.id, result.ratingA, ra.comparisons + 1)
            ratings.setRating(b.id, result.ratingB, rb.comparisons + 1)
            if (choice == Choice.NEITHER) {
                ratings.setDisposition(a.id, Disposition.NOT_INTERESTED)
                ratings.setDisposition(b.id, Disposition.NOT_INTERESTED)
            }
            ratings.record(StoredComparison("cmp-${System.currentTimeMillis()}", a.id, b.id, choice.scoreA, System.currentTimeMillis()))
        }
    }

    /** Take back the last answer: ratings, dispositions and the record. */
    fun undoLast(before: Map<String, org.indiafoss.companion.data.SessionRating>, comparisonId: String) {
        viewModelScope.launch {
            for ((id, r) in before) {
                ratings.setRating(id, r.rating, r.comparisons)
                ratings.setDisposition(id, when (r.disposition) {
                    "must-attend" -> Disposition.MUST_ATTEND
                    "not-interested" -> Disposition.NOT_INTERESTED
                    "watch-later" -> Disposition.WATCH_LATER
                    else -> Disposition.NORMAL
                })
            }
            ratings.forget(comparisonId)
        }
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
