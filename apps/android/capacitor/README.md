# Android (Capacitor) wrapper

The Android app is the same SvelteKit PWA wrapped by Capacitor in a
**Material 3 shell** (§3.2). There is no separate native UI yet; see
[ADR 0001](../../../docs/adr/0001-native-android-client-standalone-vs-neutrino-fork.md)
for why the native client is a thin shell over the shared `EventBundle`.

## Material 3 shell

`cap add android` generates an AppCompat project in `android/` (never
committed). `scripts/material3.mjs` is applied by `pnpm --filter @indiafoss/android build`
(and in CI) and is idempotent. It:

- adds `com.google.android.material` and switches the app and activity themes to
  `Theme.Material3.DayNight` / `.NoActionBar` with the IndiaFOSS palette
  (`res/values/colors.xml`, night variant in `res/values-night/`) — no dynamic
  (wallpaper-based) colour, so the native chrome matches the web app's own
  IndiaFOSS brand rather than the phone's;
- installs an Android 12+ splash (`Theme.SplashScreen`, brand ink background,
  wordmark icon) and an adaptive launcher foreground built from the IndiaFOSS
  wordmark vector;
- sets the app name, package strings and the `indiafoss` custom URL scheme;
- adds the `indiafoss://` `VIEW` intent filter to `MainActivity`.

Edit the overlay under `res/` — it is copied over the generated project on
every build.

The WebView content itself is the same IndiaFOSS 2026 design on every
platform — no separate in-app Material look. Only the native chrome above
(status bar, nav bar, splash, launcher icon) uses the Material3 theme
classes, and it stays on the static IndiaFOSS palette described above.

## Deep links (§57)

```text
indiafoss://event/<event-id>      -> /
indiafoss://activity/<id>         -> /activity/<id>
indiafoss://booth/<id>            -> /booth/<id>
indiafoss://location/<id>         -> /scan?payload=…  (preview, then sets location)
indiafoss://chat?dm=@u:s | join=#r:s -> /chat (confirmation before DM/join)
indiafoss://friend?v=1&…          -> /scan?payload=…  (friend-card preview)
```

`apps/web/src/lib/native.ts` maps links to routes; on Android `@capacitor/app`
delivers `appUrlOpen` and the launch URL to the same mapper. The scanner and
chat screens always preview before acting.

## Notifications (§37)

- `WebLocalNotificationTransport` — Notification API + timers (active now).
- `AndroidLocalNotificationTransport` — stub ready for the Capacitor Local
  Notifications plugin (`@capacitor/local-notifications`).

## Build

```bash
pnpm --filter @indiafoss/android exec cap add android   # once (needs SDK for gradle)
pnpm --filter @indiafoss/android build                  # material3 patch + cap sync
cd android && ./gradlew assembleDebug                   # needs JDK 21 + SDK
```

F-Droid flavour must not require FCM (`@capacitor/push-notifications` is
deliberately not used — local notifications only).
