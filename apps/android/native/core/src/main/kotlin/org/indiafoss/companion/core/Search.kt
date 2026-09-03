package org.indiafoss.companion.core

/**
 * Offline search across sessions, people and booths — the ranking model of
 * `@indiafoss/search` (§31), ported so both clients order results the same
 * way. A query token matches a field exactly (100% of the field weight), as
 * a prefix (60%) or anywhere (30%); each token contributes its best field.
 */
object Search {
    enum class Kind { ACTIVITY, PERSON, BOOTH }

    data class Hit(val kind: Kind, val id: String, val title: String, val subtitle: String?, val score: Double)

    private const val TITLE = 100.0
    private const val SPEAKER = 30.0
    private const val TAG = 20.0
    private const val LOCATION = 15.0
    private const val DESCRIPTION = 8.0

    fun tokenize(query: String): List<String> =
        query.lowercase().trim().split(Regex("\\s+")).filter { it.isNotEmpty() }

    private fun fieldScore(tokens: List<String>, field: String?, weight: Double): Double {
        if (field.isNullOrEmpty()) return 0.0
        val norm = field.lowercase().trim()
        val words = norm.split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }
        var best = 0.0
        for (token in tokens) {
            var level = 0
            for (word in words) {
                val candidate = when {
                    word == token -> 3
                    word.startsWith(token) -> 2
                    word.contains(token) -> 1
                    else -> 0
                }
                if (candidate > level) level = candidate
                if (level == 3) break
            }
            if (level == 0 && norm.contains(token)) level = 1
            val w = when (level) { 3 -> weight; 2 -> weight * 0.6; 1 -> weight * 0.3; else -> 0.0 }
            if (w > best) best = w
        }
        return best
    }

    fun search(bundle: EventBundle, query: String, limit: Int = 25): List<Hit> {
        val tokens = tokenize(query)
        if (tokens.isEmpty()) return emptyList()
        val locations = bundle.locations.associate { it.id to it.name }
        val tracks = bundle.tracks.associate { it.id to it.name }
        val hits = ArrayList<Hit>()
        for (a in bundle.activities) {
            val speakers = bundle.speakersOf(a).map { it.name }
            val location = a.locationId?.let { locations[it] }
            val track = a.trackId?.let { tracks[it] }
            var score = fieldScore(tokens, a.title, TITLE)
            speakers.forEach { score += fieldScore(tokens, it, SPEAKER) }
            a.tags.forEach { score += fieldScore(tokens, it, TAG) }
            if (location != null) score += fieldScore(tokens, location, LOCATION)
            if (track != null && track != location) score += fieldScore(tokens, track, LOCATION)
            score += fieldScore(tokens, a.description, DESCRIPTION)
            if (score > 0) hits += Hit(Kind.ACTIVITY, a.id, a.title, a.subtitle ?: speakers.firstOrNull() ?: location, score)
        }
        for (p in bundle.people) {
            var score = fieldScore(tokens, p.name, TITLE) + fieldScore(tokens, p.bio, DESCRIPTION)
            p.links.forEach { score += fieldScore(tokens, it.url, LOCATION) }
            if (score > 0) hits += Hit(Kind.PERSON, p.id, p.name, p.bio?.take(80), score)
        }
        for (b in bundle.booths) {
            var score = fieldScore(tokens, b.name, TITLE) + fieldScore(tokens, b.category, TAG) +
                fieldScore(tokens, b.description, DESCRIPTION)
            b.tags.forEach { score += fieldScore(tokens, it, TAG) }
            if (score > 0) hits += Hit(Kind.BOOTH, b.id, b.name, b.category, score)
        }
        return hits.sortedWith(compareByDescending<Hit> { it.score }.thenBy { it.title }).take(limit)
    }
}
