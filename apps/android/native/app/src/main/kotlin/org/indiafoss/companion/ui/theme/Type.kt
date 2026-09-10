package org.indiafoss.companion.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.indiafoss.companion.R

/**
 * Inter for everything readable — headings at 600, body at 400 — and Space
 * Mono for compact metadata (time · room, eyebrows), the same choice the PWA
 * documents in docs/reviews/branding-2026-09-08.md. Both ship in
 * `res/font` (SIL OFL 1.1; provenance in apps/android/native/branding/README.md)
 * so the app renders identically offline. No pixel face: that belongs to the
 * official wordmark, and dense schedules are never set in it.
 *
 * Inter is one variable file; the weight axis is instanced per [Font], which
 * Android supports from API 26, the app's minimum.
 */
val Inter = FontFamily(
    Font(R.font.inter_variable, FontWeight.Normal),
    Font(R.font.inter_variable, FontWeight.Medium),
    Font(R.font.inter_variable, FontWeight.SemiBold),
    Font(R.font.inter_variable, FontWeight.Bold),
)

val SpaceMono = FontFamily(
    Font(R.font.space_mono_regular, FontWeight.Normal),
    Font(R.font.space_mono_bold, FontWeight.Bold),
)

private val stock = Typography()

private fun TextStyle.heading(): TextStyle = copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp)
private fun TextStyle.body(): TextStyle = copy(fontFamily = Inter)

/** The M3 scale in Inter, with tight-tracked 600 headings as on the 2026 site. */
val CompanionTypography = Typography(
    displayLarge = stock.displayLarge.heading(),
    displayMedium = stock.displayMedium.heading(),
    displaySmall = stock.displaySmall.heading(),
    headlineLarge = stock.headlineLarge.heading(),
    headlineMedium = stock.headlineMedium.heading(),
    headlineSmall = stock.headlineSmall.heading(),
    titleLarge = stock.titleLarge.heading(),
    titleMedium = stock.titleMedium.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold),
    titleSmall = stock.titleSmall.copy(fontFamily = Inter, fontWeight = FontWeight.SemiBold),
    bodyLarge = stock.bodyLarge.body(),
    bodyMedium = stock.bodyMedium.body(),
    bodySmall = stock.bodySmall.body(),
    labelLarge = stock.labelLarge.copy(fontFamily = Inter, fontWeight = FontWeight.Medium),
    labelMedium = stock.labelMedium.copy(fontFamily = Inter, fontWeight = FontWeight.Medium),
    labelSmall = stock.labelSmall.copy(fontFamily = Inter, fontWeight = FontWeight.Medium),
)

/**
 * The mono accent: short metadata such as "10:15 – 11:00 · Hall 1" or an
 * eyebrow in capitals. Never navigation, buttons, titles or running text.
 */
val Typography.meta: TextStyle
    get() = labelMedium.copy(fontFamily = SpaceMono, fontWeight = FontWeight.Normal, letterSpacing = 0.sp)

/** The smaller eyebrow: capitals, tracked, in mono. */
val Typography.eyebrow: TextStyle
    get() = labelSmall.copy(fontFamily = SpaceMono, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
