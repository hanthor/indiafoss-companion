package org.indiafoss.companion.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/**
 * The IndiaFOSS 2026 tokens, one role each, mirroring `apps/web/src/app.css`
 * (FOSS United v3 values: mint `hsl(144 92% 37%)`, dark green
 * `hsl(145 63% 18%)`, pale green `hsl(145 92% 86%)`, neutral paper and quiet
 * lines). Warning and error are semantic and never brand green. See
 * docs/reviews/native-branding-2026-09-10.md for the mapping table.
 */
@Immutable
data class BrandColors(
    val isDark: Boolean,
    /** `--mint`: the event green, an accent and the launcher plate, not body text. */
    val mint: Color,
    /** `--mint-ink`: green that reads as text and as a filled button. */
    val mintInk: Color,
    /** `--mint-dark`: the lighter green on a dark surface. */
    val mintDark: Color,
    /** `--mint-soft`: the pale-green container. */
    val mintSoft: Color,
    /** `--ink` / `--ink-2`: text in the light theme, the hero surface in both. */
    val ink: Color,
    val inkSurface: Color,
    /** `--paper`, `--surface`, `--surface-raised`. */
    val paper: Color,
    val surface: Color,
    val surfaceRaised: Color,
    /** `--text`, `--text-muted`, `--text-faint`. */
    val text: Color,
    val textMuted: Color,
    val textFaint: Color,
    /** `--line`, `--line-strong`. */
    val line: Color,
    val lineStrong: Color,
    /** `--amber*`: the must-go / warning family. */
    val amber: Color,
    val amberInk: Color,
    val amberSoft: Color,
    /** `--danger`, `--warning`, `--success`: semantic, distinct from decoration. */
    val danger: Color,
    val warning: Color,
    val success: Color,
    /** `--on-strong`: text on a filled mint or danger surface (themed). */
    val onStrong: Color,
    /** `--on-ink`: text on a surface that is dark in both themes (not themed). */
    val onInk: Color,
    /** Green that reads on the ink surface in both themes. */
    val mintOnInk: Color,
)

private val Ink = Color(0xFF141414)
private val Ink2 = Color(0xFF1A1A1A)
private val OnInk = Color(0xFFFAFAFA)
private val MintOnInk = Color(0xFF47EB89)

val BrandLight = BrandColors(
    isDark = false,
    mint = Color(0xFF08B54D),
    mintInk = Color(0xFF114B29),
    mintDark = Color(0xFF114B29),
    mintSoft = Color(0xFFBAFCD6),
    ink = Ink,
    inkSurface = Ink2,
    paper = Color(0xFFF0F0F0),
    surface = Color(0xFFFAFAFA),
    surfaceRaised = Color(0xFFFFFFFF),
    text = Ink,
    textMuted = Color(0xFF4A4A4A),
    textFaint = Color(0xFF666666),
    line = Color(0xFFE6E6E6),
    lineStrong = Ink,
    amber = Color(0xFFECAC4B),
    amberInk = Color(0xFF7A5306),
    amberSoft = Color(0xFFFFE9BF),
    danger = Color(0xFFD32F2F),
    warning = Color(0xFF8A5410),
    success = Color(0xFF114B29),
    onStrong = Color(0xFFFFFFFF),
    onInk = OnInk,
    mintOnInk = MintOnInk,
)

val BrandDark = BrandColors(
    isDark = true,
    mint = Color(0xFF08B54D),
    mintInk = Color(0xFF47EB89),
    mintDark = Color(0xFFACF6CB),
    mintSoft = Color(0xFF114B29),
    ink = Ink,
    inkSurface = Ink2,
    paper = Color(0xFF141414),
    surface = Color(0xFF1F1F1F),
    surfaceRaised = Color(0xFF262626),
    text = Color(0xFFF5F5F5),
    textMuted = Color(0xFFCCCCCC),
    textFaint = Color(0xFFA6A6A6),
    line = Color(0xFF4A4A4A),
    lineStrong = Color(0xFFF5F5F5),
    amber = Color(0xFFECAC4B),
    amberInk = Color(0xFFF3C46F),
    amberSoft = Color(0xFF4A3600),
    danger = Color(0xFFFF6B6B),
    warning = Color(0xFFF3C46F),
    success = Color(0xFF47EB89),
    onStrong = Ink,
    onInk = OnInk,
    mintOnInk = MintOnInk,
)

/**
 * The fixed event palette, available under every scheme. Surfaces that carry
 * the event identity — the Now masthead, the welcome hero, the devroom
 * gallery, the recap header — read these, so Material You never recolours
 * them; everything else reads `MaterialTheme.colorScheme`.
 */
val LocalBrand = staticCompositionLocalOf { BrandLight }

val MaterialTheme.brand: BrandColors
    @Composable get() = LocalBrand.current

/** The brand tokens placed in their Material 3 roles: one role per token. */
private fun BrandColors.toScheme(): ColorScheme = if (isDark) darkColorScheme(
    primary = mintInk,
    onPrimary = onStrong,
    primaryContainer = mintSoft,
    onPrimaryContainer = mintDark,
    inversePrimary = BrandLight.mintInk,
    secondary = textMuted,
    onSecondary = paper,
    secondaryContainer = line,
    onSecondaryContainer = text,
    tertiary = warning,
    onTertiary = ink,
    tertiaryContainer = amberSoft,
    onTertiaryContainer = Color(0xFFFFE9BF),
    background = paper,
    onBackground = text,
    surface = paper,
    onSurface = text,
    surfaceVariant = line,
    onSurfaceVariant = textMuted,
    surfaceTint = mintInk,
    inverseSurface = text,
    inverseOnSurface = ink,
    error = danger,
    onError = ink,
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6),
    outline = textFaint,
    outlineVariant = line,
    scrim = Color.Black,
    surfaceBright = surfaceRaised,
    surfaceDim = paper,
    surfaceContainerLowest = Color(0xFF0F0F0F),
    surfaceContainerLow = surface,
    surfaceContainer = surface,
    surfaceContainerHigh = surfaceRaised,
    surfaceContainerHighest = Color(0xFF333333),
) else lightColorScheme(
    primary = mintInk,
    onPrimary = onStrong,
    primaryContainer = mintSoft,
    onPrimaryContainer = mintInk,
    inversePrimary = BrandDark.mintInk,
    secondary = textMuted,
    onSecondary = surfaceRaised,
    secondaryContainer = line,
    onSecondaryContainer = ink,
    tertiary = warning,
    onTertiary = onStrong,
    tertiaryContainer = amberSoft,
    onTertiaryContainer = amberInk,
    background = paper,
    onBackground = text,
    surface = paper,
    onSurface = text,
    surfaceVariant = line,
    onSurfaceVariant = textMuted,
    surfaceTint = mintInk,
    inverseSurface = ink,
    inverseOnSurface = onInk,
    error = danger,
    onError = onStrong,
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF93000A),
    outline = textFaint,
    outlineVariant = line,
    scrim = Color.Black,
    surfaceBright = surfaceRaised,
    surfaceDim = Color(0xFFDADADA),
    surfaceContainerLowest = surfaceRaised,
    surfaceContainerLow = surface,
    surfaceContainer = surface,
    surfaceContainerHigh = surfaceRaised,
    surfaceContainerHighest = line,
)

val LightScheme: ColorScheme = BrandLight.toScheme()
val DarkScheme: ColorScheme = BrandDark.toScheme()

/** The green the launcher plate and the fallback scheme are built from. */
val SeedColor: Color = BrandLight.mint

/**
 * Material 3 colour. Android 12+ takes the user's wallpaper palette (Material
 * You) for the everyday screens when the attendee has not switched it off in
 * Settings; older devices, and that switch, use the event scheme. Either way
 * the event surfaces read [LocalBrand] and keep their identity (#33).
 */
@Composable
fun CompanionTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val brand = if (darkTheme) BrandDark else BrandLight
    val scheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkScheme
        else -> LightScheme
    }
    CompositionLocalProvider(LocalBrand provides brand) {
        MaterialTheme(colorScheme = scheme, typography = CompanionTypography, content = content)
    }
}

/**
 * An event-identity surface: the brand scheme for everything inside, whatever
 * the device palette. Wraps the launch (welcome) flow; the smaller event
 * elements on the tabs read [LocalBrand] directly instead.
 */
@Composable
fun EventIdentity(content: @Composable () -> Unit) {
    val brand = LocalBrand.current
    MaterialTheme(colorScheme = if (brand.isDark) DarkScheme else LightScheme, typography = CompanionTypography, content = content)
}
