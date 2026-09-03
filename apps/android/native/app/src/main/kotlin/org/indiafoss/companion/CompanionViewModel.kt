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
import org.indiafoss.companion.core.Calendar
import org.indiafoss.companion.core.RoutingProfile
import org.indiafoss.companion.core.ContactCard
import org.indiafoss.companion.core.Handshake
import org.indiafoss.companion.core.VCard
import org.indiafoss.companion.data.DeviceKey
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
import org.indiafoss.companion.data.VenueRepository
import org.indiafoss.companion.ui.screens.Floor
import org.indiafoss.companion.ui.screens.FloorPlans
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
    /** This device's handshake key (`p256:…`) and its fingerprint; null where the keystore is unavailable. */
    val deviceKey: String? = null,
    val deviceFingerprint: String? = null,
    /** The card as shared: signed by this device. */
    val signedCard: String = "",
    /** Where the attendee is, as a bundle location id: set on the map or by a room's code. */
    val currentLocation: String? = null,
    /** Seconds of walking from where the attendee is to a location, when both are on the plan. */
    val walkSecondsTo: (String) -> Int? = { null },
    /** A route asked for by a deep link, consumed by the navigation host. */
    val pendingRoute: String? = null,
    val routingProfile: String = "fastest",
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
    private val venue = VenueRepository(app)
    private val floors: List<Floor> = FloorPlans.load(app)
    private val _state = MutableStateFlow(UiState(now = nowIso(), walkSecondsTo = { null }))
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
        viewModelScope.launch {
            val key = DeviceKey.publicKey()
            _state.update { it.copy(deviceKey = key, deviceFingerprint = key?.let(Handshake::fingerprint)) }
            profiles.profile.collect { card ->
                val signed = DeviceKey.sign(VCard.encode(card))
                _state.update { it.copy(profile = card, signedCard = signed) }
            }
        }
        viewModelScope.launch { profiles.contacts.collect { met -> _state.update { it.copy(contacts = met) } } }
        viewModelScope.launch {
            preferences.location.collect { at -> _state.update { it.copy(currentLocation = at, walkSecondsTo = walker(at)) } }
        }
        viewModelScope.launch {
            preferences.routingProfile.collect { p -> _state.update { it.copy(routingProfile = p, walkSecondsTo = walker(it.currentLocation, p)) } }
        }
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
        // A room's code: indiafoss://location/<id>, or a bare location id.
        Regex("^indiafoss://location/([A-Za-z0-9-]+)").find(text.trim())?.groupValues?.get(1)?.let { id ->
            if (state.value.bundle?.locations?.any { it.id == id } == true) {
                setLocation(id)
                _state.update { it.copy(message = "You are at ${it.bundle?.location(id)?.name ?: id}") }
                return
            }
        }
        val card = VCard.parse(text)
        if (card == null || card.fullName.isBlank()) {
            _state.update { it.copy(message = "That code is not a contact card.") }
            return
        }
        val running = state.value.nowState?.current?.firstOrNull()?.id
        val identity = Handshake.verify(text)
        viewModelScope.launch {
            profiles.addContact(
                MetContact(
                    id = "contact-${System.currentTimeMillis()}", card = card, vcard = text,
                    savedAt = System.currentTimeMillis(), metActivityId = running,
                    signature = identity.verdict.name.lowercase(), fingerprint = identity.fingerprint,
                ),
            )
            val note = when (identity.verdict) {
                Handshake.Verdict.VALID -> " · signed by their phone"
                Handshake.Verdict.INVALID -> " · signature does not match!"
                Handshake.Verdict.UNCHECKED -> " · signed, not checked"
                Handshake.Verdict.UNSIGNED -> ""
            }
            _state.update { it.copy(message = "Saved ${card.fullName}$note") }
        }
    }

    fun setLocation(locationId: String?) {
        _state.update { it.copy(currentLocation = locationId, walkSecondsTo = walker(locationId)) }
        viewModelScope.launch { preferences.setLocation(locationId) }
    }

    private fun walker(from: String?, profile: String = state.value.routingProfile): (String) -> Int? {
        val routing = when (profile) {
            "accessible" -> RoutingProfile.ACCESSIBLE
            "avoid-stairs" -> RoutingProfile.AVOID_STAIRS
            else -> RoutingProfile.FASTEST
        }
        return if (from == null) { _ -> null } else { to -> venue.walkSeconds(floors, from, to, routing) }
    }

    fun setRoutingProfile(profile: String) {
        _state.update { it.copy(routingProfile = profile, walkSecondsTo = walker(it.currentLocation, profile)) }
        viewModelScope.launch { preferences.setRoutingProfile(profile) }
    }

    /** The planned day as an .ics for the system share sheet (calendar apps import it). */
    fun calendarFor(day: String): String? {
        val bundle = state.value.bundle ?: return null
        return Calendar.ics(bundle, state.value.itineraryFor(day).map { it.activity })
    }

    /** "Not this one" on a planned row: the session leaves the plan and the ranking. */
    fun skipSession(id: String) {
        viewModelScope.launch { ratings.setDisposition(id, Disposition.NOT_INTERESTED) }
    }

    /** indiafoss://activity/<id>, indiafoss://location/<id>: the same links the PWA answers to. */
    fun openDeepLink(url: String) {
        val match = Regex("^indiafoss://([a-z]+)/([A-Za-z0-9._:@#!-]{1,128})", RegexOption.IGNORE_CASE).find(url.trim()) ?: return
        val (kind, id) = match.destructured
        when (kind.lowercase()) {
            "activity" -> _state.update { it.copy(pendingRoute = "activity/$id") }
            "location" -> { setLocation(id); _state.update { it.copy(pendingRoute = "map") } }
            "speaker" -> _state.update { it.copy(pendingRoute = "speaker/$id") }
        }
    }

    fun consumeRoute() = _state.update { it.copy(pendingRoute = null) }

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

    /** A card answer (#108): "no" rules the talk out, "yes" keeps it, "must" keeps it and marks it must-attend. */
    fun answerCard(id: String, answer: String) {
        viewModelScope.launch {
            ratings.setTriage(id, if (answer == "no") "no" else "yes")
            if (answer == "must") preferences.setMustAttend(id, true)
        }
    }

    /** What an answer needs to be taken back: the ratings before it, and the records to forget. */
    data class Undo(val before: Map<String, org.indiafoss.companion.data.SessionRating>, val comparisonIds: List<String>)

    /**
     * One tap for a slot: the winner beats every loser in one go, one recorded
     * comparison per pair. The Elo update works on the stored ratings, never
     * the prior view; sessions answered about for the first time move further.
     */
    fun pickInSlot(winner: Activity, losers: List<Activity>): Undo {
        val s = state.value
        val ids = listOf(winner.id) + losers.map { it.id }
        val before = ids.associateWith { s.ranking.rating(it) }
        val live = HashMap(before.mapValues { it.value.rating to it.value.comparisons })
        val records = ArrayList<StoredComparison>()
        for (loser in losers) {
            val (rw, cw) = live.getValue(winner.id)
            val (rl, cl) = live.getValue(loser.id)
            val result = Ranking.applyComparison(rw, rl, Choice.A, Ranking.pairKScale(cw, cl))
            live[winner.id] = result.ratingA to cw + 1
            live[loser.id] = result.ratingB to cl + 1
            records += StoredComparison("cmp-${System.currentTimeMillis()}-${records.size}", winner.id, loser.id, 1.0, System.currentTimeMillis())
        }
        viewModelScope.launch {
            for ((id, r) in live) ratings.setRating(id, r.first, r.second)
            for (record in records) ratings.record(record)
        }
        return Undo(before, records.map { it.id })
    }

    /** "Any of these": every open pair among the members is a tie. */
    fun tieSlot(members: List<Activity>): Undo {
        val s = state.value
        val before = members.associate { it.id to s.ranking.rating(it.id) }
        val live = HashMap(before.mapValues { it.value.rating to it.value.comparisons })
        val answered = s.ranking.answeredPairs
        val records = ArrayList<StoredComparison>()
        for (i in members.indices) for (j in i + 1 until members.size) {
            val a = members[i]
            val b = members[j]
            if (!Ranking.overlaps(a, b) || Ranking.pairKey(a.id, b.id) in answered) continue
            val (ra, ca) = live.getValue(a.id)
            val (rb, cb) = live.getValue(b.id)
            val result = Ranking.applyComparison(ra, rb, Choice.TIE, Ranking.pairKScale(ca, cb))
            live[a.id] = result.ratingA to ca + 1
            live[b.id] = result.ratingB to cb + 1
            records += StoredComparison("cmp-${System.currentTimeMillis()}-${records.size}", a.id, b.id, 0.5, System.currentTimeMillis())
        }
        viewModelScope.launch {
            for ((id, r) in live) ratings.setRating(id, r.first, r.second)
            for (record in records) ratings.record(record)
        }
        return Undo(before, records.map { it.id })
    }

    /** "None of these": the slot's sessions leave the day. */
    fun dropSlot(members: List<Activity>): Undo {
        val s = state.value
        val before = members.associate { it.id to s.ranking.rating(it.id) }
        viewModelScope.launch { for (m in members) ratings.setDisposition(m.id, Disposition.NOT_INTERESTED) }
        return Undo(before, emptyList())
    }

    /** Take back the last answer: ratings, dispositions and the records. */
    fun undoLast(undo: Undo) {
        viewModelScope.launch {
            for ((id, r) in undo.before) {
                ratings.setRating(id, r.rating, r.comparisons)
                ratings.setDisposition(id, when (r.disposition) {
                    "must-attend" -> Disposition.MUST_ATTEND
                    "not-interested" -> Disposition.NOT_INTERESTED
                    "watch-later" -> Disposition.WATCH_LATER
                    else -> Disposition.NORMAL
                })
            }
            for (id in undo.comparisonIds) ratings.forget(id)
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
