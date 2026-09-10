package org.indiafoss.companion.core

import java.io.File
import java.io.FileOutputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Flush complete bytes before atomically replacing a sibling file. Never delete the old target as
 * a fallback: if atomic replacement is unavailable, fail with the previous file still readable.
 * Unique temporary names also keep simultaneous writers from truncating each other's data.
 *
 * A process interruption before replacement leaves the old target; afterwards the new target is
 * complete. This does not promise that the directory rename survives sudden device power loss.
 */
fun writeFileAtomically(target: File, text: String) = writeFileAtomically(target, text) { source, destination ->
    Files.move(source.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    Unit
}

/** Replacement boundary is injectable for failure/restart tests. */
internal fun writeFileAtomically(target: File, text: String, replace: (File, File) -> Unit) {
    val directory = target.parentFile ?: error("cannot write ${target.name} with no parent directory")
    directory.mkdirs()
    val temp = File.createTempFile("${target.name}.", ".tmp", directory)
    try {
        FileOutputStream(temp).use { stream ->
            stream.write(text.toByteArray(Charsets.UTF_8))
            stream.fd.sync()
        }
        replace(temp, target)
    } finally {
        temp.delete()
    }
}
