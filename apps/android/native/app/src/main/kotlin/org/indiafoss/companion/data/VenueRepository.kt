package org.indiafoss.companion.data

import android.content.Context
import kotlinx.serialization.json.Json
import org.indiafoss.companion.core.RoutingProfile
import org.indiafoss.companion.core.Routing
import org.indiafoss.companion.core.VenueGraph
import org.indiafoss.companion.core.VenueMetadata
import org.indiafoss.companion.ui.screens.Floor

/**
 * The venue's routing graph and room entrances, shipped in assets with the
 * floor plans. Walks are between bundle locations; the 2025 programme's
 * rooms map onto the 2026 plan through the floor rooms' `key`.
 */
class VenueRepository(context: Context) {
    private val json = Json { ignoreUnknownKeys = true }
    val graph: VenueGraph = runCatching {
        context.assets.open("venue.graph.json").bufferedReader().use { json.decodeFromString<VenueGraph>(it.readText()) }
    }.getOrDefault(VenueGraph())
    val metadata: VenueMetadata = runCatching {
        context.assets.open("venue.metadata.json").bufferedReader().use { json.decodeFromString<VenueMetadata>(it.readText()) }
    }.getOrDefault(VenueMetadata())

    /** A bundle location as the plan knows it: itself, or the plan room it stands in for. */
    fun planLocation(floors: List<Floor>, locationId: String): String =
        floors.firstNotNullOfOrNull { floor -> floor.roomFor(locationId)?.id } ?: locationId

    fun walkSeconds(floors: List<Floor>, from: String, to: String, profile: RoutingProfile = RoutingProfile.FASTEST): Int? =
        Routing.walkSeconds(graph, metadata, planLocation(floors, from), planLocation(floors, to), profile)
}
