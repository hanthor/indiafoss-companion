package org.indiafoss.companion;

import android.content.Context;
import android.view.ContextThemeWrapper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.material.color.DynamicColors;
import com.google.android.material.color.MaterialColors;

/**
 * Hands the phone's Material You colour scheme to the web layer, so the app's
 * Material look (apps/web/src/lib/material.css) follows the wallpaper like a
 * native app would. Below Android 12 there is no dynamic colour and the web
 * layer keeps its mint-seeded fallback palette. Read-only; nothing leaves the
 * device.
 */
@CapacitorPlugin(name = "MaterialYou")
public class MaterialYouPlugin extends Plugin {

    private static final String[][] ATTRS = {
        { "primary", "colorPrimary" },
        { "onPrimary", "colorOnPrimary" },
        { "primaryContainer", "colorPrimaryContainer" },
        { "onPrimaryContainer", "colorOnPrimaryContainer" },
        { "secondary", "colorSecondary" },
        { "onSecondary", "colorOnSecondary" },
        { "secondaryContainer", "colorSecondaryContainer" },
        { "onSecondaryContainer", "colorOnSecondaryContainer" },
        { "tertiary", "colorTertiary" },
        { "onTertiary", "colorOnTertiary" },
        { "tertiaryContainer", "colorTertiaryContainer" },
        { "onTertiaryContainer", "colorOnTertiaryContainer" },
        { "error", "colorError" },
        { "onError", "colorOnError" },
        { "errorContainer", "colorErrorContainer" },
        { "onErrorContainer", "colorOnErrorContainer" },
        { "surface", "colorSurface" },
        { "onSurface", "colorOnSurface" },
        { "surfaceVariant", "colorSurfaceVariant" },
        { "onSurfaceVariant", "colorOnSurfaceVariant" },
        { "surfaceContainerLowest", "colorSurfaceContainerLowest" },
        { "surfaceContainerLow", "colorSurfaceContainerLow" },
        { "surfaceContainer", "colorSurfaceContainer" },
        { "surfaceContainerHigh", "colorSurfaceContainerHigh" },
        { "surfaceContainerHighest", "colorSurfaceContainerHighest" },
        { "outline", "colorOutline" },
        { "outlineVariant", "colorOutlineVariant" },
        { "inverseSurface", "colorSurfaceInverse" },
        { "inverseOnSurface", "colorOnSurfaceInverse" },
        { "inversePrimary", "colorPrimaryInverse" },
    };

    @PluginMethod
    public void scheme(PluginCall call) {
        JSObject ret = new JSObject();
        boolean available = DynamicColors.isDynamicColorAvailable();
        ret.put("available", available);
        if (available) {
            ret.put("light", resolve(com.google.android.material.R.style.ThemeOverlay_Material3_DynamicColors_Light));
            ret.put("dark", resolve(com.google.android.material.R.style.ThemeOverlay_Material3_DynamicColors_Dark));
        }
        call.resolve(ret);
    }

    private JSObject resolve(int overlay) {
        Context themed = new ContextThemeWrapper(
            getContext(),
            com.google.android.material.R.style.Theme_Material3_DayNight_NoActionBar
        );
        Context dynamic = DynamicColors.wrapContextIfAvailable(themed, overlay);
        JSObject out = new JSObject();
        for (String[] attr : ATTRS) {
            int id = getContext().getResources().getIdentifier(attr[1], "attr", getContext().getPackageName());
            if (id == 0) {
                id = getContext().getResources().getIdentifier(attr[1], "attr", "com.google.android.material");
            }
            if (id == 0) continue;
            int color = MaterialColors.getColor(dynamic, id, 0);
            if (color == 0) continue;
            out.put(attr[0], String.format("#%06x", color & 0xffffff));
        }
        return out;
    }
}
