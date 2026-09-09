package org.indiafoss.companion.core

private val DEVROOM_INTRODUCTION = Regex("^devroom intro(?:duction)?\\s*:", RegexOption.IGNORE_CASE)

/** Programme introductions stay on the schedule, but are not taste choices. */
fun Activity.isDiscoveryActivity(): Boolean =
    !cancelled && type != "meal" && !DEVROOM_INTRODUCTION.containsMatchIn(title.trim())
