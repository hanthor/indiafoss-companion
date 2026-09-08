package org.indiafoss.companion.core

import java.io.File

/**
 * Replace a file's contents, or leave the previous contents completely intact.
 *
 * The cached event bundle used to be written with a plain `writeText`, which
 * truncates the target and then streams into it. A process kill, a flat
 * battery or a full disk part-way through leaves a valid file containing
 * invalid JSON — the schedule an attendee had successfully refreshed is gone,
 * and the app quietly drops back to the build-time seed bundle (#190).
 *
 * Writing to a sibling temp file and renaming over the target closes that
 * window. `File.renameTo` within one directory is a single filesystem
 * operation, so a reader sees either the old file or the new one, never a
 * half-written one.
 *
 * This does **not** promise the bytes have reached the platter — that needs an
 * fsync of the file and its directory, which the JVM's File API does not
 * expose. It does promise the failure mode is "stale but readable" rather than
 * "corrupt", which is the one that matters here: the bundle is a cache, and a
 * stale cache is recoverable by refreshing while a corrupt one is not.
 */
fun writeFileAtomically(target: File, text: String) {
    val directory = target.parentFile ?: error("cannot write ${target.name} with no parent directory")
    directory.mkdirs()

    val temp = File(directory, "${target.name}.tmp")
    try {
        temp.writeText(text)
        if (!temp.renameTo(target)) {
            // Some filesystems refuse a rename onto an existing file. Deleting
            // first opens a window where neither file is in place, so this is
            // the fallback rather than the default path.
            if (!target.delete() || !temp.renameTo(target)) {
                error("could not replace ${target.name}")
            }
        }
    } finally {
        // A failed attempt must not leave a temp file behind to be mistaken
        // for real data, or to fill the disk that may have caused the failure.
        if (temp.exists()) temp.delete()
    }
}
