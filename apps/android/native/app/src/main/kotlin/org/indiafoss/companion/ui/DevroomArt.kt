package org.indiafoss.companion.ui

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import org.indiafoss.companion.R
import org.indiafoss.companion.core.Activity
import org.indiafoss.companion.core.EventBundle
import org.indiafoss.companion.ui.theme.brand

/**
 * The eight official IndiaFOSS 2026 devroom patterns, keyed by programme
 * track id exactly as `apps/web/src/lib/devroom-art.ts`. The images are the
 * PWA's SVGs rasterised (apps/android/native/branding/README.md records the
 * source, licence and the render command). Decorative: the adjacent text
 * names the devroom, so the image carries no content description. Only the
 * 2026 bundle gets them; archives and unknown tracks inherit nothing.
 */
object DevroomArt {
    const val EVENT_ID = "indiafoss-2026"

    private val byTrack: Map<String, Int> = mapOf(
        "devroom-android-open-source-project-aosp" to R.drawable.devroom_aosp,
        "devroom-cloud-devops" to R.drawable.devroom_devops,
        "devroom-compilers-programming-languages-and-systems" to R.drawable.devroom_compilers,
        "devroom-documentation-technical-writing" to R.drawable.devroom_docs,
        "devroom-open-design" to R.drawable.devroom_design,
        "devroom-open-hardware" to R.drawable.devroom_hardware,
        "devroom-real-time-operating-systems-rtos" to R.drawable.devroom_rtos,
        "devroom-security" to R.drawable.devroom_security,
    )

    @DrawableRes
    fun forTrack(bundle: EventBundle?, trackId: String?): Int? =
        if (bundle?.id == EVENT_ID && trackId != null) byTrack[trackId] else null

    val trackIds: Set<String> get() = byTrack.keys
}

/**
 * The eight devroom colours: the PWA's `--devroom-*` tokens in
 * apps/web/src/app.css (#469), keyed by the same track ids as [DevroomArt].
 * The same in both themes; only the 2026 bundle gets them.
 */
object DevroomColors {
    private val byTrack: Map<String, Color> = mapOf(
        "devroom-android-open-source-project-aosp" to Color(0xFF00C603),
        "devroom-cloud-devops" to Color(0xFF5F84FF),
        "devroom-compilers-programming-languages-and-systems" to Color(0xFFDF5447),
        "devroom-documentation-technical-writing" to Color(0xFFA14CEC),
        "devroom-open-design" to Color(0xFFCF2797),
        "devroom-open-hardware" to Color(0xFFE37601),
        "devroom-real-time-operating-systems-rtos" to Color(0xFFA6AF00),
        "devroom-security" to Color(0xFF04C7BD),
    )

    /** A session's devroom colour: its devroom first, else its track, as the PWA does. */
    fun forActivity(bundle: EventBundle?, activity: Activity): Color? =
        if (bundle?.id == DevroomArt.EVENT_ID) byTrack[activity.devroomId ?: activity.trackId] else null
}

/**
 * CSS `color-mix(in srgb, a, b amountOfB)`. Compose's own `lerp` mixes in
 * Oklab, which gives different colours; mixing as the web does keeps the
 * contrast measured there (5.9:1 or better on the devroom pill) true here.
 */
fun mixSrgb(a: Color, b: Color, amountOfB: Float): Color = Color(
    red = a.red + (b.red - a.red) * amountOfB,
    green = a.green + (b.green - a.green) * amountOfB,
    blue = a.blue + (b.blue - a.blue) * amountOfB,
    alpha = a.alpha + (b.alpha - a.alpha) * amountOfB,
)

/**
 * One devroom pattern, cropped from the top as the PWA's `DevroomBanner`
 * does (4:1 by default), on the raised surface so the transparent artwork
 * reads the same in both themes. Draws nothing when the track has no art.
 */
@Composable
fun DevroomBanner(
    bundle: EventBundle?,
    trackId: String?,
    modifier: Modifier = Modifier,
    ratio: Float = 4f,
    shape: Shape = MaterialTheme.shapes.small,
) {
    val res = DevroomArt.forTrack(bundle, trackId) ?: return
    Image(
        painter = painterResource(res),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        alignment = Alignment.TopCenter,
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(ratio)
            .clip(shape)
            .background(MaterialTheme.brand.surfaceRaised),
    )
}
