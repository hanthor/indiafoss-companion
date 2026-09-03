package org.indiafoss.companion.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RoutingTest {
    private val graph = VenueGraph(
        nodes = listOf(
            VenueNode("a", "ground", 0.0, 0.0), VenueNode("b", "ground", 1.0, 0.0),
            VenueNode("stairs-top", "first", 1.0, 1.0), VenueNode("lift-top", "first", 2.0, 1.0),
        ),
        edges = listOf(
            VenueEdge("a", "b", timeSeconds = 30.0),
            VenueEdge("b", "stairs-top", timeSeconds = 20.0, stairs = true, accessible = false),
            VenueEdge("b", "lift-top", timeSeconds = 90.0, lift = true),
            VenueEdge("lift-top", "stairs-top", timeSeconds = 10.0),
        ),
    )

    @Test
    fun `fastest takes the stairs, accessible takes the lift, and a floor change is reported`() {
        val fast = Routing.findRoute(graph, "a", "stairs-top")!!
        assertEquals(listOf("a", "b", "stairs-top"), fast.nodeIds)
        assertEquals(50, fast.durationSeconds)
        assertTrue(fast.floorChange)
        val accessible = Routing.findRoute(graph, "a", "stairs-top", RoutingProfile.ACCESSIBLE)!!
        assertEquals(listOf("a", "b", "lift-top", "stairs-top"), accessible.nodeIds)
        assertEquals(130, accessible.durationSeconds)
    }

    @Test
    fun `edges run both ways unless one way, and unknown nodes route nowhere`() {
        assertEquals(30, Routing.findRoute(graph, "b", "a")!!.durationSeconds)
        assertNull(Routing.findRoute(graph, "a", "nowhere"))
        assertEquals(0, Routing.findRoute(graph, "a", "a")!!.durationSeconds)
        val oneWay = VenueGraph(graph.nodes, listOf(VenueEdge("a", "b", timeSeconds = 5.0, oneWay = true)))
        assertNull(Routing.findRoute(oneWay, "b", "a"))
    }

    @Test
    fun `walks between locations go through their entrances`() {
        val metadata = VenueMetadata(
            mapOf("hall-1" to VenueLocationRef("hall-1", entrances = listOf("a")), "room-1" to VenueLocationRef("room-1", entrances = listOf("stairs-top"))),
        )
        assertEquals(50, Routing.walkSeconds(graph, metadata, "hall-1", "room-1"))
        assertNull(Routing.walkSeconds(graph, metadata, "hall-1", "unknown"))
    }
}
