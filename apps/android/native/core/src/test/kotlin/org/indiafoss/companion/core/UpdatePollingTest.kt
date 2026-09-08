package org.indiafoss.companion.core

import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class UpdatePollingTest {
    private val bundle = EventBundle("event", "Event", "Asia/Kolkata", "2026-09-26T09:00:00+05:30", "2026-09-27T17:00:00+05:30")

    @Test fun eventWindowUsesOffsetsAndArrivalDepartureMargins() {
        assertEquals(UpdatePolling.EVENT_MS, UpdatePolling.interval(bundle, Instant.parse("2026-09-26T01:30:00Z").toEpochMilli()))
        assertEquals(UpdatePolling.EVENT_MS, UpdatePolling.interval(bundle, Instant.parse("2026-09-27T13:30:00Z").toEpochMilli()))
        assertEquals(UpdatePolling.QUIET_MS, UpdatePolling.interval(bundle, Instant.parse("2026-09-27T13:30:01Z").toEpochMilli()))
        assertEquals(UpdatePolling.QUIET_MS, UpdatePolling.interval(bundle, Instant.parse("2026-09-08T12:00:00Z").toEpochMilli()))
    }

    @Test fun startupRetriesSoonAndInvalidDatesUseQuietCadence() {
        assertEquals(UpdatePolling.EVENT_MS, UpdatePolling.interval(null))
        assertEquals(UpdatePolling.QUIET_MS, UpdatePolling.interval(bundle.copy(start = "invalid")))
    }
}
