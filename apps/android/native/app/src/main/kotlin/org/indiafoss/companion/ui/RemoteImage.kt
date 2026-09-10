package org.indiafoss.companion.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.indiafoss.companion.core.BoundedFileCache
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Speaker photos (#110): memory first, then a bounded disk cache under the
 * app's cache directory, then HTTPS. The disk copy is what makes a photo
 * show on a cold start with no signal at the venue; it is capped at
 * [DISK_CAP_BYTES] and evicts least-recently-shown entries, so the app's
 * footprint never grows past that however many programmes it has seen.
 *
 * Nothing here touches the network or the disk on the caller's thread: every
 * read and fetch runs on [Dispatchers.IO]. A fetch that fails is remembered
 * for [FAILURE_TTL_MS] so an offline day does not retry on every scroll.
 * Decoding downsamples to [MAX_EDGE_PX] so a large upload costs a small
 * bitmap. Anything that still fails to load shows initials.
 */
object RemoteImages {
    const val DISK_CAP_BYTES = 16L shl 20
    const val MAX_ENTRY_BYTES = 2L shl 20
    const val MAX_EDGE_PX = 512
    const val FAILURE_TTL_MS = 10 * 60_000L
    private const val MEMORY_CAP_BYTES = 8 shl 20

    private val memory = object : LruCache<String, Bitmap>(MEMORY_CAP_BYTES) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
    private val failed = HashMap<String, Long>()

    @Volatile
    private var disk: BoundedFileCache? = null

    /** The disk cache, created once under `cacheDir/speaker-photos`. */
    fun disk(context: Context): BoundedFileCache {
        val directory = File(context.applicationContext.cacheDir, "speaker-photos")
        disk?.takeIf { it.directory == directory }?.let { return it }
        return synchronized(this) {
            disk?.takeIf { it.directory == directory }
                ?: BoundedFileCache(directory, DISK_CAP_BYTES, MAX_ENTRY_BYTES).also { disk = it }
        }
    }

    /** What is already decoded, for a synchronous first frame. */
    fun cached(url: String): Bitmap? = memory.get(url)

    suspend fun load(context: Context, url: String): Bitmap? {
        memory.get(url)?.let { return it }
        if (!url.startsWith("https://")) return null
        val store = disk(context)
        return withContext(Dispatchers.IO) {
            val fromDisk = store.get(url)?.let(::decode)
            if (fromDisk != null) {
                memory.put(url, fromDisk)
                return@withContext fromDisk
            }
            if (recentlyFailed(url)) return@withContext null
            val bytes = fetch(url)
            val bitmap = bytes?.let(::decode)
            if (bytes == null || bitmap == null) {
                synchronized(failed) { failed[url] = System.currentTimeMillis() }
                return@withContext null
            }
            store.put(url, bytes)
            memory.put(url, bitmap)
            bitmap
        }
    }

    /** Decode with sampling so no photo takes more than a few hundred pixels a side in memory. */
    fun decode(bytes: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE_PX) sample *= 2
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }.getOrNull()
    }

    private fun recentlyFailed(url: String): Boolean = synchronized(failed) {
        val at = failed[url] ?: return false
        if (System.currentTimeMillis() - at < FAILURE_TTL_MS) true else { failed.remove(url); false }
    }

    private fun fetch(url: String): ByteArray? = runCatching {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 6_000
            readTimeout = 6_000
        }
        try {
            if (connection.responseCode !in 200..299) return@runCatching null
            if (connection.contentLengthLong > MAX_ENTRY_BYTES) return@runCatching null
            connection.inputStream.use { input ->
                val out = ByteArrayOutputStream()
                val buffer = ByteArray(16 * 1024)
                var total = 0L
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    total += read
                    if (total > MAX_ENTRY_BYTES) return@runCatching null
                    out.write(buffer, 0, read)
                }
                out.toByteArray()
            }
        } finally {
            connection.disconnect()
        }
    }.getOrNull()

    /** Test hook: forget everything in memory and on disk. */
    fun clear(context: Context) {
        memory.evictAll()
        synchronized(failed) { failed.clear() }
        disk(context).clear()
    }
}

/** A round avatar: the picture when it loads, the person's initials until then or instead. */
@Composable
fun Avatar(name: String, url: String?, size: Dp = 40.dp, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val bitmap by produceState(initialValue = url?.let(RemoteImages::cached), key1 = url) {
        if (value == null) value = url?.let { RemoteImages.load(context, it) }
    }
    val initials = name.trim().split(Regex("\\s+")).take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("")
    Box(
        modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        val image = bitmap
        if (image != null) {
            Image(image.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size))
        } else {
            Text(initials, style = if (size >= 56.dp) MaterialTheme.typography.titleLarge else MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}
