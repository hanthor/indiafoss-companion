package org.indiafoss.companion.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.core.EventManifest
import org.indiafoss.companion.core.bundleJson
import org.indiafoss.companion.core.writeFileAtomically
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Offline-first access to the published event bundle, the same assets the PWA
 * reads. The cached copy is authoritative for rendering; the network is only
 * ever an upgrade path, so the app opens instantly and works with no signal.
 */
class EventRepository(
    private val context: Context,
    private val baseUrl: String = DEFAULT_BASE_URL,
    private val eventId: String = DEFAULT_EVENT_ID,
) {
    private val cacheFile: File get() = File(context.filesDir, "$eventId-bundle.json")
    private val revisionFile: File get() = File(context.filesDir, "$eventId-revision")

    /** Cached bundle, or the copy seeded into assets at build time. */
    suspend fun cached(): EventBundle? = cachedWithSource()?.bundle

    /**
     * The cached bundle together with where it came from.
     *
     * Callers need the distinction: falling back to the seed is survivable but
     * silently shows a schedule frozen at APK build time, which at the venue
     * can be months stale. The UI should say so rather than present it as a
     * refreshed schedule.
     */
    suspend fun cachedWithSource(): CachedBundle? = withContext(Dispatchers.IO) {
        val refreshed = runCatching {
            bundleJson.decodeFromString<EventBundle>(cacheFile.readText())
        }.getOrNull()
        if (refreshed != null) return@withContext CachedBundle(refreshed, BundleSource.REFRESHED)

        val seed = runCatching {
            context.assets.open("event-bundle.json").bufferedReader().use { reader ->
                bundleJson.decodeFromString<EventBundle>(reader.readText())
            }
        }.getOrNull()
        if (seed == null) null else CachedBundle(seed, BundleSource.SEED)
    }

    /**
     * Fetch the manifest and, when it names a newer revision, download that
     * immutable asset **in full** before replacing the cache — the same
     * contract as the web client, so a half-downloaded update never shows.
     */
    suspend fun refresh(): RefreshResult = withContext(Dispatchers.IO) {
        try {
            val manifest = bundleJson.decodeFromString<EventManifest>(
                get("$baseUrl/events/$eventId/manifest.json"),
            )
            val known = runCatching { revisionFile.readText().trim().toInt() }.getOrNull()
            if (known != null && manifest.revision <= known) return@withContext RefreshResult.UpToDate
            val asset = manifest.assets["event"]
            val url = if (asset != null) "$baseUrl/events/$eventId/$asset"
            else "$baseUrl/events/$eventId/event-bundle.json"
            val body = get(url)
            // Parse before writing: a malformed download must not evict a good cache.
            val bundle = bundleJson.decodeFromString<EventBundle>(body)
            val previous = cached()
            // Atomic: an interrupted write leaves the previous cache readable
            // rather than truncated (#190). The revision is written only after
            // the bundle is in place, so a crash between the two re-downloads
            // this revision rather than skipping it.
            writeFileAtomically(cacheFile, body)
            writeFileAtomically(revisionFile, manifest.revision.toString())
            RefreshResult.Updated(bundle, manifest.revision, previous)
        } catch (error: Exception) {
            RefreshResult.Failed(error.message ?: "network error")
        }
    }

    private fun get(url: String): String {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("Accept", "application/json")
        }
        try {
            if (connection.responseCode !in 200..299) error("HTTP ${connection.responseCode}")
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        const val DEFAULT_EVENT_ID = "indiafoss-2026"
        const val DEFAULT_BASE_URL = "https://hanthor.github.io/indiafoss-companion"
    }
}

/** Where a cached bundle came from. */
enum class BundleSource {
    /** Downloaded by this install and cached on disk. */
    REFRESHED,

    /** Seeded into assets when the APK was built; as old as the release. */
    SEED,
}

data class CachedBundle(val bundle: EventBundle, val source: BundleSource)

sealed interface RefreshResult {
    data object UpToDate : RefreshResult
    data class Updated(val bundle: EventBundle, val revision: Int, val previous: EventBundle? = null) : RefreshResult
    data class Failed(val reason: String) : RefreshResult
}
