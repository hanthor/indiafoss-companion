package org.indiafoss.companion.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The published event bundle, the same contract the PWA reads
 * (`apps/web/static/events/<id>/event-bundle.json`). Unknown fields are
 * ignored so a newer bundle never breaks an older build.
 */
@Serializable
data class EventBundle(
    val id: String,
    val name: String,
    val timezone: String,
    val start: String,
    val end: String,
    val activities: List<Activity> = emptyList(),
    val people: List<Person> = emptyList(),
    val locations: List<Location> = emptyList(),
    val booths: List<Booth> = emptyList(),
    val tracks: List<Track> = emptyList(),
    val sourceMetadata: SourceMetadata = SourceMetadata(),
    /** Organiser-published arrival details (#278); null until an organiser page confirms them. */
    val venue: EventVenue? = null,
) {
    private val peopleById by lazy { people.associateBy { it.id } }
    private val locationsById by lazy { locations.associateBy { it.id } }

    fun person(id: String): Person? = peopleById[id]

    fun location(id: String?): Location? = id?.let { locationsById[it] }

    fun speakersOf(activity: Activity): List<Person> = activity.speakerIds.mapNotNull(::person)
}

@Serializable
data class SourceMetadata(val scheduleStatus: String? = null)

/**
 * Outdoor arrival block: venue name, address and the organiser-selected map
 * destination, with the page it was read from and when. The map link marks
 * the building, not an entrance; indoor routing is the venue asset's job.
 */
@Serializable
data class EventVenue(
    val version: Int = 1,
    val name: String,
    val address: String,
    val city: String,
    val region: String? = null,
    val country: String? = null,
    val mapUrl: String,
    val coordinates: VenueCoordinates? = null,
    val sourceUrl: String,
    val travelGuideUrl: String? = null,
    val checkedAt: String,
    val note: String? = null,
)

@Serializable
data class VenueCoordinates(val latitude: Double, val longitude: Double)

@Serializable
data class Activity(
    val id: String,
    val title: String,
    val type: String = "talk",
    val subtitle: String? = null,
    val description: String? = null,
    val start: String? = null,
    val end: String? = null,
    val locationId: String? = null,
    val speakerIds: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val trackId: String? = null,
    val devroomId: String? = null,
    val cancelled: Boolean = false,
    val flexible: Boolean = false,
    val audience: String? = null,
    val sourceUrl: String? = null,
    val proposalId: String? = null,
    val scheduleNote: String? = null,
    val keyTakeaways: List<String> = emptyList(),
    val links: List<ExternalLink> = emptyList(),
    val references: List<ExternalLink> = emptyList(),
)

@Serializable
data class Person(
    val id: String,
    val name: String,
    val bio: String? = null,
    val designation: String? = null,
    val organization: String? = null,
    val avatarUrl: String? = null,
    val links: List<ExternalLink> = emptyList(),
)

@Serializable
data class Location(
    val id: String,
    val name: String,
    val floor: String? = null,
    val kind: String = "room",
    val routingNodeIds: List<String> = emptyList(),
)

@Serializable
data class Booth(
    val id: String,
    val name: String,
    val category: String? = null,
    val description: String? = null,
    val website: String? = null,
    val locationId: String? = null,
    val availableDates: List<String>? = null,
    val tags: List<String> = emptyList(),
)

@Serializable
data class Track(val id: String, val name: String, val description: String? = null)

@Serializable
data class ExternalLink(val url: String, val label: String? = null)

@Serializable
data class EventManifest(
    val schemaVersion: Int = 1,
    val eventId: String,
    val revision: Int,
    val generatedAt: String? = null,
    val assets: Map<String, String> = emptyMap(),
)

/** Lenient reader: the bundle carries fields this client does not model yet. */
val bundleJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}
