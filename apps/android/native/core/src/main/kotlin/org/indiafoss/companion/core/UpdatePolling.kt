package org.indiafoss.companion.core

import java.time.OffsetDateTime

/** Real-time polling policy, not the simulated conference clock. */
object UpdatePolling {
    const val EVENT_MS = 60_000L
    const val QUIET_MS = 15 * 60_000L
    private const val MARGIN_MS = 2 * 60 * 60_000L

    fun interval(bundle: EventBundle?, now: Long = System.currentTimeMillis()): Long {
        if (bundle == null) return EVENT_MS
        return runCatching {
            val start = OffsetDateTime.parse(bundle.start).toInstant().toEpochMilli() - MARGIN_MS
            val end = OffsetDateTime.parse(bundle.end).toInstant().toEpochMilli() + MARGIN_MS
            if (now in start..end) EVENT_MS else QUIET_MS
        }.getOrDefault(QUIET_MS)
    }
}
