package org.indiafoss.companion.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.indiafoss.companion.core.ProfileImport
import org.indiafoss.companion.core.VCard
import java.net.HttpURLConnection
import java.net.URL

/**
 * Fetches a public profile for the card (#110). GitHub through its REST API
 * (unauthenticated, 60 calls an hour, far more than a "fill my card" needs);
 * FOSS United as the profile page, which a native app can read without the
 * CORS wall the web app runs into.
 */
object ProfileImporter {
    sealed interface Result {
        data class Ok(val imported: ProfileImport.Imported) : Result
        data class Failed(val reason: String) : Result
    }

    suspend fun github(handleOrUrl: String): Result {
        val user = VCard.githubAvatar(handleOrUrl)?.substringAfter("github.com/")?.substringBefore(".png")
            ?: return Result.Failed("Enter a GitHub username or profile URL first.")
        return fetch("https://api.github.com/users/$user", "application/vnd.github+json") { body ->
            val imported = ProfileImport.fromGithubJson(body)
            if (imported.isEmpty) Result.Failed("No public profile for $user on GitHub.") else Result.Ok(imported)
        }
    }

    suspend fun fossUnited(username: String): Result {
        val user = username.trim().removePrefix("@").substringAfter("/u/").trimEnd('/')
        if (!Regex("^[A-Za-z0-9._-]+$").matches(user)) return Result.Failed("Enter your FOSS United username first.")
        return fetch("https://fossunited.org/u/$user", "text/html") { body ->
            val imported = ProfileImport.fromFossUnitedHtml(body)
            if (imported.isEmpty) Result.Failed("No public profile at fossunited.org/u/$user.") else Result.Ok(imported)
        }
    }

    private suspend fun fetch(url: String, accept: String, parse: (String) -> Result): Result = withContext(Dispatchers.IO) {
        try {
            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("Accept", accept)
                setRequestProperty("User-Agent", "IndiaFOSS-Companion")
            }
            try {
                when (connection.responseCode) {
                    404 -> Result.Failed("No such profile.")
                    403, 429 -> Result.Failed("Rate limited; try again in a while.")
                    in 200..299 -> parse(connection.inputStream.bufferedReader().use { it.readText() })
                    else -> Result.Failed("HTTP ${connection.responseCode}")
                }
            } finally {
                connection.disconnect()
            }
        } catch (error: Exception) {
            Result.Failed("Could not reach the site: ${error.message ?: "network error"}")
        }
    }
}
