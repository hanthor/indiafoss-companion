package org.indiafoss.companion.core

import java.time.OffsetDateTime

/**
 * Honest refresh state for the programme (#191), the Kotlin twin of
 * `apps/web/src/lib/schedule-freshness.ts`. Three clocks are kept apart
 * because conflating them is what makes an old schedule look current:
 *
 *  - `sourceMetadata.sourceUpdatedAt` — when the programme was last imported
 *    from the organisers.
 *  - `lastCheckedAt` — when this device last reached the manifest. It says
 *    nothing about how old the data is.
 *  - `sourceMetadata.scheduleStatus` — whether the organisers still call the
 *    programme a draft. Absent in older bundles, and absence is never reported
 *    as confirmation.
 *
 * A bundle read out of the APK's assets rather than downloaded is as old as
 * the release, so [SeedSource.SEED] is reported too.
 *
 * Every value comes from the published bundle. Nothing here invents a
 * timestamp or a sync mechanism.
 */
object ScheduleFreshness {
    const val CURRENT_MAX_MS = 2 * 24 * 60 * 60_000L
    const val STALE_MIN_MS = 7 * 24 * 60 * 60_000L
    const val CHECK_OVERDUE_MS = 24 * 60 * 60_000L

    /** How old the imported programme data is. */
    enum class Age { UNKNOWN, CURRENT, AGEING, STALE }

    /** Where the rendered bundle came from; mirrors the repository's own distinction. */
    enum class SeedSource { REFRESHED, SEED, NONE }

    data class State(
        val provisional: Boolean,
        val statusLine: String?,
        val importedAtMs: Long?,
        val importedLine: String,
        val age: Age,
        val checkOverdue: Boolean,
        val checkedLine: String,
        val sourceLine: String?,
    )

    /** The bundle's own UTC offset, taken from its start instant (e.g. `+05:30`). */
    fun offsetOf(start: String?): String? {
        val match = Regex("(Z|[+-]\\d{2}:\\d{2})$").find(start.orEmpty()) ?: return null
        return if (match.value == "Z") "+00:00" else match.value
    }

    /**
     * Upstream sends a naive `YYYY-MM-DD HH:MM:SS[.ffffff]` timestamp with no
     * zone. It is anchored to the event's own offset rather than to the phone's
     * zone, which would be wrong by hours for anyone travelling.
     */
    fun parseSourceTimestamp(raw: String?, offset: String?): Long? {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) return null
        val zoned = when {
            Regex("(Z|[+-]\\d{2}:\\d{2})$").containsMatchIn(trimmed) -> trimmed.replace(' ', 'T')
            offset != null -> trimmed.replace(' ', 'T') + offset
            else -> return null
        }
        return runCatching { OffsetDateTime.parse(zoned).toInstant().toEpochMilli() }.getOrNull()
    }

    /** Coarse on purpose, so it never looks more precise than it is. */
    fun describeElapsed(elapsedMs: Long): String {
        if (elapsedMs < 60 * 60_000L) return "less than an hour ago"
        val hours = elapsedMs / (60 * 60_000L)
        if (hours < 24) return "$hours hour${if (hours == 1L) "" else "s"} ago"
        val days = hours / 24
        return "$days day${if (days == 1L) "" else "s"} ago"
    }

    fun describe(
        bundle: EventBundle?,
        lastCheckedAt: Long?,
        source: SeedSource,
        now: Long = System.currentTimeMillis(),
    ): State {
        val metadata = bundle?.sourceMetadata
        val importedAtMs = parseSourceTimestamp(metadata?.sourceUpdatedAt, offsetOf(bundle?.start))
        val age = when {
            importedAtMs == null -> Age.UNKNOWN
            now - importedAtMs < CURRENT_MAX_MS -> Age.CURRENT
            now - importedAtMs < STALE_MIN_MS -> Age.AGEING
            else -> Age.STALE
        }

        val provisional = metadata?.scheduleStatus == "draft"
        val statusLine = when (metadata?.scheduleStatus) {
            null, "" -> null
            "draft" -> "Provisional: the organisers have not marked this programme final. Times and rooms may still change."
            else -> "The organisers have marked this programme final."
        }

        val importedLine = if (importedAtMs == null) {
            "This schedule does not record when it was imported."
        } else {
            "Programme data imported from the organisers ${describeElapsed(now - importedAtMs)}." +
                if (age == Age.STALE) " No newer import has been published, so treat these times as out of date." else ""
        }

        val overdue = lastCheckedAt == null || now - lastCheckedAt >= CHECK_OVERDUE_MS
        val checkedLine = if (lastCheckedAt == null) {
            "This device has not checked for a newer programme yet, so a newer one may exist."
        } else {
            "This device last reached the organisers ${describeElapsed(now - lastCheckedAt)}. " +
                "That is when it looked, not how old the programme is."
        }

        val sourceLine = when (source) {
            SeedSource.SEED -> "Showing the copy built into this app release; no update has been downloaded yet."
            SeedSource.NONE -> "No schedule is stored on this device."
            SeedSource.REFRESHED -> null
        }

        return State(
            provisional = provisional,
            statusLine = statusLine,
            importedAtMs = importedAtMs,
            importedLine = importedLine,
            age = age,
            checkOverdue = overdue,
            checkedLine = checkedLine,
            sourceLine = sourceLine,
        )
    }
}
