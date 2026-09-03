package org.indiafoss.companion.core

import kotlinx.serialization.Serializable
import java.util.PriorityQueue

/**
 * The venue routing graph the web map uses (`venue.graph.json`,
 * `venue.metadata.json`) and shortest walks over it, ported from
 * `@indiafoss/venue`. Profiles: `fastest` takes every edge; `avoid-stairs`
 * rejects stairs; `accessible` rejects stairs and anything not marked
 * accessible. A rejected edge is a hard rejection, never a penalty.
 */
@Serializable
data class VenueNode(val id: String, val floor: String, val x: Double, val y: Double)

@Serializable
data class VenueEdge(
    val from: String,
    val to: String,
    val distanceMeters: Double = 0.0,
    val timeSeconds: Double,
    val accessible: Boolean = true,
    val stairs: Boolean = false,
    val lift: Boolean = false,
    val oneWay: Boolean = false,
)

@Serializable
data class VenueGraph(val nodes: List<VenueNode> = emptyList(), val edges: List<VenueEdge> = emptyList())

@Serializable
data class VenueLocationRef(val locationId: String, val svgTarget: String? = null, val entrances: List<String> = emptyList(), val floor: String? = null)

@Serializable
data class VenueMetadata(val locations: Map<String, VenueLocationRef> = emptyMap())

enum class RoutingProfile { FASTEST, AVOID_STAIRS, ACCESSIBLE }

data class Route(val nodeIds: List<String>, val durationSeconds: Int, val floorChange: Boolean)

object Routing {
    private fun cost(edge: VenueEdge, profile: RoutingProfile, reverse: Boolean): Double? {
        if (reverse && edge.oneWay) return null
        if (profile == RoutingProfile.ACCESSIBLE && (!edge.accessible || edge.stairs)) return null
        if (profile == RoutingProfile.AVOID_STAIRS && edge.stairs) return null
        return edge.timeSeconds
    }

    /** Shortest walk by time, or null when the profile leaves no way through. */
    fun findRoute(graph: VenueGraph, from: String, to: String, profile: RoutingProfile = RoutingProfile.FASTEST): Route? {
        val floors = graph.nodes.associate { it.id to it.floor }
        if (from !in floors || to !in floors) return null
        if (from == to) return Route(listOf(from), 0, false)
        val adjacency = HashMap<String, MutableList<Pair<String, Double>>>()
        for (edge in graph.edges) {
            cost(edge, profile, false)?.let { adjacency.getOrPut(edge.from) { ArrayList() }.add(edge.to to it) }
            cost(edge, profile, true)?.let { adjacency.getOrPut(edge.to) { ArrayList() }.add(edge.from to it) }
        }
        val dist = HashMap<String, Double>().apply { put(from, 0.0) }
        val prev = HashMap<String, String>()
        val queue = PriorityQueue<Pair<String, Double>>(compareBy { it.second }).apply { add(from to 0.0) }
        val done = HashSet<String>()
        while (queue.isNotEmpty()) {
            val (node, d) = queue.poll()
            if (!done.add(node)) continue
            if (node == to) break
            for ((next, c) in adjacency[node].orEmpty()) {
                val nd = d + c
                if (nd < (dist[next] ?: Double.MAX_VALUE)) {
                    dist[next] = nd
                    prev[next] = node
                    queue.add(next to nd)
                }
            }
        }
        val total = dist[to] ?: return null
        val path = ArrayList<String>()
        var cursor: String? = to
        while (cursor != null) { path.add(cursor); cursor = prev[cursor] }
        path.reverse()
        val floorChange = path.map { floors[it] }.distinct().size > 1
        return Route(path, kotlin.math.round(total).toInt(), floorChange)
    }

    /** Walk in seconds between two bundle locations, through their first entrances. */
    fun walkSeconds(graph: VenueGraph, metadata: VenueMetadata, fromLocation: String, toLocation: String, profile: RoutingProfile = RoutingProfile.FASTEST): Int? {
        val from = metadata.locations[fromLocation]?.entrances?.firstOrNull() ?: return null
        val to = metadata.locations[toLocation]?.entrances?.firstOrNull() ?: return null
        return findRoute(graph, from, to, profile)?.durationSeconds
    }
}
