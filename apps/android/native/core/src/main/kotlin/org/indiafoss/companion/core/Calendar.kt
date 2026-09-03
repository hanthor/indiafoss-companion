package org.indiafoss.companion.core

/**
 * iCalendar export of a planned day — the same shape as the web's
 * `itineraryToIcs` (docs/calendar-export.md): one VEVENT per session with a
 * ten-minute alarm, UTC timestamps, CRLF line ends, text escaped per RFC 5545.
 */
object Calendar {
    private fun esc(v: String) = v.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace(Regex("\r\n|\r|\n"), "\\\\n")

    /** `20250920T044500Z` for an ISO instant with any offset. */
    fun utcStamp(iso: String): String {
        val ms = Schedule.parseInstant(iso)
        val total = Math.floorDiv(ms, 1000L)
        val days = Math.floorDiv(total, 86_400L)
        val sod = Math.floorMod(total, 86_400L)
        val z = days + 719_468
        val era = Math.floorDiv(z, 146_097L)
        val doe = z - era * 146_097
        val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
        val y = yoe + era * 400
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = doy - (153 * mp + 2) / 5 + 1
        val m = mp + if (mp < 10) 3 else -9
        val year = if (m <= 2) y + 1 else y
        return "%04d%02d%02dT%02d%02d%02dZ".format(year, m, d, sod / 3600, (sod % 3600) / 60, sod % 60)
    }

    fun ics(bundle: EventBundle, activities: List<Activity>, alarmMinutesBefore: Int = 10): String {
        val lines = arrayListOf(
            "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IndiaFOSS Companion//Native//EN",
            "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:${esc(bundle.name)}",
        )
        for (a in activities) {
            val start = a.start ?: continue
            val end = a.end ?: continue
            val room = bundle.location(a.locationId)?.name
            val speakers = bundle.speakersOf(a).joinToString(", ") { it.name }
            lines += "BEGIN:VEVENT"
            lines += "UID:${a.id}@indiafoss-companion"
            lines += "DTSTAMP:${utcStamp(start)}"
            lines += "DTSTART:${utcStamp(start)}"
            lines += "DTEND:${utcStamp(end)}"
            lines += "SUMMARY:${esc(a.title)}"
            if (room != null) lines += "LOCATION:${esc(room)}"
            val description = listOfNotNull(speakers.takeIf { it.isNotBlank() }, a.sourceUrl).joinToString("\n")
            if (description.isNotBlank()) lines += "DESCRIPTION:${esc(description)}"
            lines += "BEGIN:VALARM"
            lines += "ACTION:DISPLAY"
            lines += "DESCRIPTION:${esc(a.title)}"
            lines += "TRIGGER:-PT${alarmMinutesBefore}M"
            lines += "END:VALARM"
            lines += "END:VEVENT"
        }
        lines += "END:VCALENDAR"
        return lines.joinToString("\r\n") + "\r\n"
    }
}
