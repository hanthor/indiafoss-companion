package org.indiafoss.companion.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import org.indiafoss.companion.core.EventManifest
import org.indiafoss.companion.core.bundleJson
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.net.InetSocketAddress
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.assertEquals
import kotlin.test.assertIs

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EventRepositoryTest {
    private lateinit var context: Context
    private lateinit var server: HttpServer
    private lateinit var baseUrl: String
    @Volatile private var manifestText = ""
    @Volatile private var downloadedBody = ""
    private val assetRequests = AtomicInteger()

    private fun body(name: String) = """{"schemaVersion":1,"id":"indiafoss-2026","name":"$name","timezone":"Asia/Kolkata","start":"2026-09-19T09:00:00+05:30","end":"2026-09-20T18:00:00+05:30","activities":[]}"""

    private fun publish(body: String, revision: Int) {
        downloadedBody = body
        val hash = MessageDigest.getInstance("SHA-256").digest(body.toByteArray()).joinToString("") { "%02x".format(it) }
        manifestText = bundleJson.encodeToString(EventManifest(eventId = "indiafoss-2026", revision = revision,
            generatedAt = "2026-09-09T01:00:00.000Z", assets = mapOf("event" to "event.${hash.take(8)}.json")))
    }

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/events/indiafoss-2026/") { exchange ->
            val manifest = exchange.requestURI.path.endsWith("manifest.json")
            if (!manifest) assetRequests.incrementAndGet()
            val bytes = (if (manifest) manifestText else downloadedBody).toByteArray(Charsets.UTF_8)
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
            exchange.close()
        }
        server.start()
        baseUrl = "http://127.0.0.1:${server.address.port}"
    }

    @After
    fun tearDown() { server.stop(0) }

    @Test
    fun corruptLegacyCacheAndHighStampDoNotPreventRepairThenRestartSkipsRedownload() = runBlocking {
        File(context.filesDir, "indiafoss-2026-bundle.json").writeText("{broken")
        File(context.filesDir, "indiafoss-2026-revision").writeText("999")
        val repository = EventRepository(context, baseUrl)
        assertEquals(BundleSource.SEED, repository.cachedWithSource()!!.source)
        publish(body("Refreshed"), 8)
        assertEquals(8, assertIs<RefreshResult.Updated>(repository.refresh()).revision)
        val restarted = EventRepository(context, baseUrl)
        assertEquals("Refreshed", restarted.cached()!!.name)
        assertEquals(BundleSource.REFRESHED, restarted.cachedWithSource()!!.source)
        assertIs<RefreshResult.UpToDate>(restarted.refresh())
        assertEquals(1, assetRequests.get())
    }

    @Test
    fun mismatchedDownloadedBytesLeaveCacheIntactAndTheSameRevisionCanBeRetried() = runBlocking {
        val repository = EventRepository(context, baseUrl)
        publish(body("First"), 1)
        assertIs<RefreshResult.Updated>(repository.refresh())
        publish(body("Second"), 2)
        downloadedBody = body("Unexpected content")
        assertIs<RefreshResult.Failed>(repository.refresh())
        assertEquals("First", EventRepository(context, baseUrl).cached()!!.name)
        downloadedBody = body("Second")
        assertEquals(2, assertIs<RefreshResult.Updated>(repository.refresh()).revision)
        assertEquals("Second", EventRepository(context, baseUrl).cached()!!.name)
        assertEquals(3, assetRequests.get())
    }
}
