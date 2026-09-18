package org.indiafoss.companion.core

import kotlinx.serialization.Serializable

/** Someone whose card this phone scanned; on device only. */
@Serializable
data class MetContact(
    val id: String,
    val card: ContactCard,
    val vcard: String,
    val savedAt: Long,
    val metActivityId: String? = null,
    val metLocationId: String? = null,
    /** What the attendee's plan had them at when they scanned ("Lunch, day 1", a talk title); see `CompanionViewModel.addScanned`. */
    val metLabel: String? = null,
    /** valid | invalid | unsigned | unchecked, from the card's signature at scan time. */
    val signature: String = "unsigned",
    val fingerprint: String? = null,
    /** How many times this person's card was scanned; the latest scan's time. */
    val metCount: Int = 1,
    val lastMetAt: Long = savedAt,
    /** A card with the same person but a different key was saved earlier; that entry was kept. */
    val keyChanged: Boolean = false,
    /** Issue time off the signed card, so the row can say how old the code was when scanned. */
    val cardIssuedAt: String = "",
)

/**
 * Key continuity for a scanned card, the PWA's rules (`contact-continuity.ts`):
 * the same key updates the entry in place; the same person with a different
 * key is saved as a new entry and flagged, never silently replaced.
 */
object ContactContinuity {
    enum class Outcome { NEW, UPDATED, KEY_CHANGED }

    data class Result(val outcome: Outcome, val contacts: List<MetContact>)

    fun reconcile(existing: List<MetContact>, draft: MetContact): Result {
        val now = draft.savedAt
        val byKey = draft.fingerprint?.let { fp -> existing.firstOrNull { it.fingerprint == fp } }
        if (byKey != null) {
            val updated = draft.copy(
                id = byKey.id,
                savedAt = byKey.savedAt,
                metActivityId = byKey.metActivityId ?: draft.metActivityId,
                metLocationId = byKey.metLocationId ?: draft.metLocationId,
                metLabel = byKey.metLabel ?: draft.metLabel,
                metCount = byKey.metCount + 1,
                lastMetAt = now,
                keyChanged = false,
            )
            return Result(Outcome.UPDATED, existing.map { if (it.id == byKey.id) updated else it })
        }
        val match = existing.firstOrNull { sameIdentity(it.card, draft.card) }
            ?: draft.card.fullName.trim().takeIf { it.isNotEmpty() }?.let { name ->
                existing.firstOrNull { it.card.fullName.trim().equals(name, ignoreCase = true) }
            }
        if (match == null) return Result(Outcome.NEW, listOf(draft.copy(metCount = 1, lastMetAt = now)) + existing)
        if (match.fingerprint != null && draft.fingerprint != null && match.fingerprint != draft.fingerprint) {
            return Result(Outcome.KEY_CHANGED, listOf(draft.copy(metCount = 1, lastMetAt = now, keyChanged = true)) + existing)
        }
        // Same person, no conflicting key (one side unsigned): update in place.
        val updated = draft.copy(
            id = match.id,
            savedAt = match.savedAt,
            fingerprint = draft.fingerprint ?: match.fingerprint,
            signature = if (draft.fingerprint != null) draft.signature else match.signature,
            metActivityId = match.metActivityId ?: draft.metActivityId,
            metLocationId = match.metLocationId ?: draft.metLocationId,
            metLabel = match.metLabel ?: draft.metLabel,
            metCount = match.metCount + 1,
            lastMetAt = now,
        )
        return Result(Outcome.UPDATED, existing.map { if (it.id == match.id) updated else it })
    }

    private fun sameIdentity(a: ContactCard, b: ContactCard): Boolean {
        if (a.meshNodeId.isNotBlank() && a.meshNodeId.equals(b.meshNodeId, ignoreCase = true)) return true
        if (a.matrixId.isNotBlank() && a.matrixId == b.matrixId) return true
        return false
    }
}
