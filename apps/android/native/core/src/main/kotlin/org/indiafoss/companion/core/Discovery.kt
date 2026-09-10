package org.indiafoss.companion.core

private val DEVROOM_INTRODUCTION = Regex("^devroom intro(?:duction)?\\s*:", RegexOption.IGNORE_CASE)

/** Programme context rather than a taste choice: meals, organiser ceremonies and introductions. */
private val CONTEXT_TYPES = setOf("meal", "ceremony", "intro")

/** Programme introductions stay on the schedule, but are not taste choices. */
fun Activity.isDiscoveryActivity(): Boolean =
    !cancelled && type !in CONTEXT_TYPES && !DEVROOM_INTRODUCTION.containsMatchIn(title.trim())
