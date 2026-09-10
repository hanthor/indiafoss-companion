package org.indiafoss.companion

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.indiafoss.companion.ui.RemoteImages
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream

/**
 * The speaker-photo cache with no network (#110): a photo on disk from an
 * earlier session shows without a fetch, a failed fetch leaves nothing
 * behind, and nothing but https is ever tried.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class RemoteImagesTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before fun fresh() = RemoteImages.clear(context)
    @After fun tidy() = RemoteImages.clear(context)

    private fun png(width: Int, height: Int): ByteArray {
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.MAGENTA) }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
    }

    @Test fun `a photo cached on disk loads offline and lands in memory`() = runBlocking {
        val url = "https://photos.invalid/asha.png"
        assertTrue(RemoteImages.disk(context).put(url, png(64, 48)))
        val bitmap = RemoteImages.load(context, url)
        assertNotNull(bitmap)
        assertEquals(64, bitmap!!.width)
        assertEquals(48, bitmap.height)
        assertNotNull(RemoteImages.cached(url))
    }

    @Test fun `the disk cache lives under the app cache directory with the documented cap`() {
        val disk = RemoteImages.disk(context)
        assertEquals(RemoteImages.DISK_CAP_BYTES, disk.maxBytes)
        assertEquals(RemoteImages.MAX_ENTRY_BYTES, disk.maxEntryBytes)
        disk.put("https://photos.invalid/x.png", png(4, 4))
        assertTrue(java.io.File(context.cacheDir, "speaker-photos").listFiles().orEmpty().isNotEmpty())
    }

    @Test fun `an unreachable photo is null, stores nothing and is not retried at once`() = runBlocking {
        // A closed local port refuses immediately: no DNS, no wait.
        val url = "https://127.0.0.1:9/nobody.png"
        assertNull(RemoteImages.load(context, url))
        assertFalse(RemoteImages.disk(context).contains(url))
        assertNull(RemoteImages.cached(url))
        assertNull(RemoteImages.load(context, url))
    }

    @Test fun `only https is fetched`() = runBlocking {
        assertNull(RemoteImages.load(context, "http://photos.invalid/plain.png"))
        assertNull(RemoteImages.load(context, "file:///etc/passwd"))
    }

    @Test fun `large photos decode downsampled`() {
        val bitmap = RemoteImages.decode(png(2048, 1024))
        assertNotNull(bitmap)
        assertTrue(bitmap!!.width <= RemoteImages.MAX_EDGE_PX * 2)
        assertTrue(bitmap.width < 2048)
        assertNull(RemoteImages.decode(byteArrayOf(1, 2, 3)))
    }
}
