package org.indiafoss.companion.core

import kotlinx.serialization.Serializable

@Serializable
data class PortableActivityReference(val eventId: String, val activityId: String, val proposalId: String? = null)

@Serializable
data class ActivityResolution(val status: String, val activityId: String? = null)

/** Same resolution policy as the PWA; both implementations consume the same test cases. */
object PortableActivities {
    fun resolve(reference: PortableActivityReference, eventId: String, activities: List<Activity>): ActivityResolution {
        if (reference.eventId != eventId) return ActivityResolution("wrong-event")
        if (reference.activityId.isBlank() || reference.proposalId == "") return ActivityResolution("missing")
        val matches = if (reference.proposalId != null) {
            activities.filter { it.proposalId == reference.proposalId }
        } else {
            activities.filter { it.id == reference.activityId }
        }
        val exact = matches.filter { it.id == reference.activityId }
        val candidates = exact.ifEmpty { matches }
        if (candidates.size > 1) return ActivityResolution("ambiguous")
        return candidates.firstOrNull()?.let { ActivityResolution("matched", it.id) } ?: ActivityResolution("missing")
    }
}
