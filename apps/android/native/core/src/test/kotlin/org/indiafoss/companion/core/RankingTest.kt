package org.indiafoss.companion.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RankingTest {
    private fun ranked(id: String, start: String, end: String, rating: Double = Ranking.INITIAL_RATING) =
        RankedActivity(Activity(id = id, title = id, start = start, end = end), rating = rating)

    @Test
    fun `equal ratings expect an even split`() {
        assertEquals(0.5, Ranking.expectedScore(1200.0, 1200.0), 1e-9)
        assertTrue(Ranking.expectedScore(1400.0, 1200.0) > 0.7)
    }

    @Test
    fun `a win moves both ratings by the same amount in opposite directions`() {
        val update = Ranking.applyComparison(1200.0, 1200.0, Choice.A)
        assertEquals(1216.0, update.ratingA, 1e-9)
        assertEquals(1184.0, update.ratingB, 1e-9)
        assertTrue(!update.neither)
        assertEquals(2400.0, update.ratingA + update.ratingB, 1e-9)
    }

    @Test
    fun `neither leaves both ratings untouched`() {
        val update = Ranking.applyComparison(1300.0, 1100.0, Choice.NEITHER)
        assertEquals(1300.0, update.ratingA, 1e-9)
        assertEquals(1100.0, update.ratingB, 1e-9)
        assertTrue(update.neither)
    }

    @Test
    fun `pair keys are order independent`() {
        assertEquals(Ranking.pairKey("b", "a"), Ranking.pairKey("a", "b"))
    }

    @Test
    fun `clashing sessions with close ratings are offered first`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
            ranked("c", "2025-09-20T14:00:00+05:30", "2025-09-20T15:00:00+05:30"),
        )
        val candidate = Ranking.selectNext(pool, emptySet())
        assertNotNull(candidate)
        assertEquals(setOf("a", "b"), setOf(candidate.activityA.activity.id, candidate.activityB.activity.id))
        // Neither side ranked yet: a new pair, not a close call.
        assertEquals(Reason.NEW, candidate.reason)
    }

    @Test
    fun `a first answer between fresh sessions opens a settled gap at once`() {
        val r = Ranking.applyComparison(1200.0, 1200.0, Choice.A, Ranking.pairKScale(0, 0))
        assertTrue(r.ratingA - r.ratingB >= Ranking.SETTLED_GAP)
        assertEquals(1.0, Ranking.pairKScale(3, 3), 1e-9)
    }

    @Test
    fun `sessions that do not overlap are never offered`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("c", "2025-09-20T14:00:00+05:30", "2025-09-20T15:00:00+05:30"),
        )
        assertNull(Ranking.selectNext(pool, emptySet()))
    }

    @Test
    fun `a clash settled by a wide gap is not asked again`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30", rating = 1200.0 + Ranking.SETTLED_GAP),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
        )
        assertNull(Ranking.selectNext(pool, emptySet()))
        val progress = Ranking.progress(pool, emptySet())
        assertEquals(1, progress.conflicts)
        assertEquals(0, progress.open)
    }

    @Test
    fun `a pair already answered is never offered again`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
        )
        assertNull(Ranking.selectNext(pool, setOf(Ranking.pairKey("a", "b"))))
    }

    @Test
    fun `not-interested sessions drop out of the pool`() {
        val pool = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30")
                .copy(disposition = Disposition.NOT_INTERESTED),
        )
        assertNull(Ranking.selectNext(pool, emptySet()))
    }

    @Test
    fun `stability is one when nothing clashes and rises as a gap opens`() {
        val noClash = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("c", "2025-09-20T14:00:00+05:30", "2025-09-20T15:00:00+05:30"),
        )
        assertEquals(1.0, Ranking.stability(noClash), 1e-9)

        val undecided = listOf(
            ranked("a", "2025-09-20T10:00:00+05:30", "2025-09-20T11:00:00+05:30"),
            ranked("b", "2025-09-20T10:30:00+05:30", "2025-09-20T11:30:00+05:30"),
        )
        assertEquals(0.0, Ranking.stability(undecided), 1e-9)

        val decided = listOf(
            undecided[0].copy(rating = 1300.0),
            undecided[1].copy(rating = 1100.0),
        )
        assertEquals(1.0, Ranking.stability(decided), 1e-9)
        assertTrue(abs(decided[0].rating - decided[1].rating) >= 2 * Ranking.K_FACTOR)
    }

    @Test
    fun `slots are anchored per session with an open pair and never chain through a long one`() {
        val w = ranked("w", "2025-09-20T11:00:00+05:30", "2025-09-20T13:00:00+05:30")
        val x = ranked("x", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30")
        val y = ranked("y", "2025-09-20T12:30:00+05:30", "2025-09-20T13:00:00+05:30")
        val slots = Ranking.slots(listOf(y, x, w), emptySet())
        assertEquals(listOf("w", "x", "y"), slots.map { it.key })
        assertEquals(listOf("w", "x", "y"), slots[0].members.map { it.activity.id })
        assertEquals(listOf("w", "x"), slots[1].members.map { it.activity.id })
        assertEquals(2, slots[0].open)
    }

    @Test
    fun `a slot closes once its pairs are answered or settled`() {
        val a = ranked("a", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30", rating = 1300.0)
        val b = ranked("b", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30")
        val c = ranked("c", "2025-09-20T11:00:00+05:30", "2025-09-20T11:30:00+05:30")
        val answered = setOf(Ranking.pairKey("a", "b"), Ranking.pairKey("a", "c"))
        val slots = Ranking.slots(listOf(a, b, c), answered)
        assertEquals(listOf("b", "c"), slots.map { it.key })
        assertEquals(listOf("b", "c"), slots[0].members.map { it.activity.id })
        assertTrue(Ranking.slots(listOf(a, b, c), answered + Ranking.pairKey("b", "c")).isEmpty())
    }

    // ---------- Clash settlement (#271), mirroring the elo package's cases ----------

    private fun at(id: String, start: String, end: String, disposition: Disposition = Disposition.NORMAL) =
        RankedActivity(Activity(id = id, title = id, start = "2026-09-26T$start:00+05:30", end = "2026-09-26T$end:00+05:30"), disposition = disposition)

    /** What the Rank screen does on a pick: the winner beats every loser it overlaps, one pair each, and the losers stand aside. */
    private fun pick(members: MutableList<RankedActivity>, winnerId: String, compared: MutableSet<String>): Ranking.ClashResolution {
        val resolution = Ranking.resolveClash(members, winnerId)
        for (loserId in resolution.losers) {
            val w = members.indexOfFirst { it.activity.id == winnerId }
            val l = members.indexOfFirst { it.activity.id == loserId }
            val r = Ranking.applyComparison(members[w].rating, members[l].rating, Choice.A, Ranking.pairKScale(members[w].comparisons, members[l].comparisons))
            members[w] = members[w].copy(rating = r.ratingA, comparisons = members[w].comparisons + 1)
            members[l] = members[l].copy(rating = r.ratingB, comparisons = members[l].comparisons + 1)
            compared += Ranking.pairKey(winnerId, loserId)
        }
        for (id in resolution.steppedAside) {
            val i = members.indexOfFirst { it.activity.id == id }
            members[i] = members[i].copy(yieldedTo = winnerId)
        }
        return resolution
    }

    @Test
    fun `a four-way simultaneous clash is settled by one pick, not three more questions`() {
        val members = mutableListOf(at("a", "11:00", "11:30"), at("b", "11:00", "11:30"), at("c", "11:00", "11:30"), at("d", "11:00", "11:30"))
        val compared = HashSet<String>()
        val slots = Ranking.slots(members, compared)
        assertEquals(4, slots.size)
        assertEquals(listOf("a", "b", "c", "d"), slots[0].members.map { it.activity.id })

        val resolution = pick(members, "b", compared)
        assertEquals(listOf("a", "c", "d"), resolution.steppedAside.sorted())
        // The same 11:00 window must not come back as "and if that falls through?".
        assertTrue(Ranking.slots(members, compared).isEmpty())
        assertEquals(0, Ranking.progress(members, compared).open)
        assertEquals(1.0, Ranking.stability(members, compared), 1e-9)
        assertNull(Ranking.selectNext(members, compared))
    }

    @Test
    fun `a staggered overlap only stands aside the talks the winner actually clashes with`() {
        // A long workshop, a talk at its start and a talk at its end.
        val members = mutableListOf(at("w", "11:00", "13:00"), at("x", "11:00", "11:30"), at("y", "12:30", "13:00"))
        val compared = HashSet<String>()
        val resolution = pick(members, "x", compared)
        assertEquals(listOf("w"), resolution.steppedAside)
        assertEquals(listOf("y"), resolution.unaffected)
        // y is compatible with x and stays live; with w aside there is nothing left to ask.
        assertTrue(Ranking.slots(members, compared).isEmpty())
        assertNull(members.first { it.activity.id == "y" }.yieldedTo)
        assertEquals(listOf("x", "y"), Ranking.livePool(members).map { it.activity.id })
    }

    @Test
    fun `a stood-aside talk returns when its winner leaves the day`() {
        val members = mutableListOf(at("a", "11:00", "11:30"), at("b", "11:00", "11:30"), at("c", "11:00", "11:30"))
        val compared = HashSet<String>()
        pick(members, "a", compared)
        assertTrue(Ranking.slots(members, compared).isEmpty())
        members[0] = members[0].copy(disposition = Disposition.NOT_INTERESTED)
        // b and c are back in the running and still need a decision between them.
        val slots = Ranking.slots(members, compared)
        assertEquals(listOf("b", "c"), slots[0].members.map { it.activity.id })
    }

    @Test
    fun `never stands aside a must-go loser so the explicit conflict is kept for the plan`() {
        val members = listOf(at("a", "11:00", "11:30"), at("b", "11:00", "11:30", Disposition.MUST_ATTEND), at("c", "11:00", "11:30"))
        val resolution = Ranking.resolveClash(members, "a")
        assertEquals(listOf("c"), resolution.steppedAside)
        assertEquals(listOf("b"), resolution.keptMustGo)
        // Even if a yield were recorded, a must-go member is never dropped from the live pool.
        val yielded = members.map { if (it.activity.id == "a") it else it.copy(yieldedTo = "a") }
        assertEquals(listOf("a", "b"), Ranking.livePool(yielded).map { it.activity.id })
    }

    @Test
    fun `undo puts every touched session back exactly and reopens the slot`() {
        val before = listOf(at("a", "11:00", "11:30"), at("b", "11:00", "11:30"), at("c", "11:00", "11:30"))
        val members = before.toMutableList()
        val compared = HashSet<String>()
        pick(members, "a", compared)
        assertTrue(Ranking.slots(members, compared).isEmpty())
        // What the store's undo does: restore each record verbatim and forget the comparisons.
        val restored = members.map { m -> before.first { it.activity.id == m.activity.id } }
        assertEquals(before, restored)
        assertEquals(listOf("a", "b", "c"), Ranking.slots(restored, emptySet())[0].members.map { it.activity.id })
    }

    @Test
    fun `a chain of yields resolves to a fixed point and a cycle is broken in list order`() {
        // c stood aside for b, b stood aside for a: b is out, so c is back.
        val chain = listOf(at("a", "11:00", "11:30"), at("b", "11:00", "11:30").copy(yieldedTo = "a"), at("c", "11:00", "11:30").copy(yieldedTo = "b"))
        assertEquals(listOf("a", "c"), Ranking.livePool(chain).map { it.activity.id })
        // A cycle cannot be made through the UI; as in the elo package, the first member stands aside and the other stays.
        val loop = listOf(at("a", "11:00", "11:30").copy(yieldedTo = "b"), at("b", "11:00", "11:30").copy(yieldedTo = "a"))
        assertEquals(listOf("b"), Ranking.livePool(loop).map { it.activity.id })
    }

    @Test
    fun `day labels carry the weekday`() {
        assertEquals("Sat 20 Sep", Schedule.formatDayLabel("2025-09-20"))
        assertEquals("Thu 1 Jan", Schedule.formatDayLabel("1970-01-01"))
    }
}
