package org.indiafoss.companion.core

import java.io.File
import java.security.MessageDigest

/**
 * A least-recently-used cache of byte blobs on disk, bounded by total size:
 * speaker photos (#110) survive a restart and an offline day without ever
 * growing past [maxBytes]. Pure JVM so the eviction rules are unit-tested;
 * the Android side decides what goes in and decodes what comes out.
 *
 * Keys are hashed to file names, so any string (a URL) is a valid key. A
 * read touches the file's modification time, which is the recency the
 * eviction walks. Every write lands atomically and then trims the oldest
 * entries until the cache fits, so a crash mid-write leaves either the old
 * entry or the new one. Any entry larger than [maxEntryBytes] is refused
 * rather than allowed to evict everything else.
 *
 * Not thread-safe by itself: callers serialise through one instance
 * (`synchronized` on [put]/[get] here is enough for the app's use).
 */
class BoundedFileCache(
    val directory: File,
    val maxBytes: Long,
    val maxEntryBytes: Long = maxBytes / 4,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    init {
        require(maxBytes > 0) { "cache size must be positive" }
    }

    /** The cached bytes, marking the entry as just used; null when absent or unreadable. */
    @Synchronized
    fun get(key: String): ByteArray? {
        val file = fileFor(key)
        if (!file.isFile) return null
        return runCatching { file.readBytes() }.getOrNull()?.also { file.setLastModified(clock()) }
    }

    @Synchronized
    fun contains(key: String): Boolean = fileFor(key).isFile

    /**
     * Stores [bytes] under [key] and evicts least-recently-used entries until
     * the cache fits. Returns false, storing nothing, when the entry alone
     * exceeds [maxEntryBytes].
     */
    @Synchronized
    fun put(key: String, bytes: ByteArray): Boolean {
        if (bytes.size > maxEntryBytes) return false
        directory.mkdirs()
        val target = fileFor(key)
        val temp = File.createTempFile("${target.name}.", ".tmp", directory)
        try {
            temp.writeBytes(bytes)
            java.nio.file.Files.move(
                temp.toPath(), target.toPath(),
                java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING,
            )
        } catch (error: Exception) {
            temp.delete()
            return false
        }
        target.setLastModified(clock())
        trim()
        return true
    }

    @Synchronized
    fun remove(key: String) {
        fileFor(key).delete()
    }

    @Synchronized
    fun clear() {
        entries().forEach { it.delete() }
    }

    /** Bytes on disk across every entry. */
    @Synchronized
    fun size(): Long = entries().sumOf { it.length() }

    @Synchronized
    fun count(): Int = entries().size

    private fun trim() {
        var total = size()
        if (total <= maxBytes) return
        for (file in entries().sortedWith(compareBy({ it.lastModified() }, { it.name }))) {
            if (total <= maxBytes) break
            val length = file.length()
            if (file.delete()) total -= length
        }
    }

    private fun entries(): List<File> =
        directory.listFiles { file -> file.isFile && file.name.endsWith(SUFFIX) }?.toList().orEmpty()

    private fun fileFor(key: String): File = File(directory, keyName(key) + SUFFIX)

    companion object {
        private const val SUFFIX = ".blob"

        /** SHA-256 of the key as lowercase hex: a safe file name for any URL. */
        fun keyName(key: String): String =
            MessageDigest.getInstance("SHA-256").digest(key.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}
