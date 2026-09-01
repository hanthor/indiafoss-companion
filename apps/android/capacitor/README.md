# Android (Capacitor) wrapper

The Android app is the same SvelteKit PWA wrapped by Capacitor — no separate UI (§3.2).

## Deep links (§57)

Reserved schemes (handled by the web app's routes):

```text
indiafoss://event/<event-id>      -> /
indiafoss://activity/<id>         -> /activity/<id>
indiafoss://location/<id>         -> /now?at=<id>   (sets current location)
indiafoss://booth/<id>            -> /booth/<id>
```

Equivalent HTTPS routes exist in the app, so the web PWA and Android share the
same URL handling. `locationIdFromDeepLink()` parses the payloads.

Wiring the `indiafoss://` intent filter requires regenerating the Android
project (`pnpm --filter @indiafoss/android exec cap add android`) and editing
`android/app/src/main/AndroidManifest.xml` (intent-filter for `indiafoss`
scheme) — this is a Phase 9 task that needs the Android SDK to verify.

## Notifications (§37)

- `WebLocalNotificationTransport` — Notification API + timers (active now).
- `AndroidLocalNotificationTransport` — stub ready for the Capacitor Local
  Notifications plugin (`@capacitor/local-notifications`); install the plugin
  and implement `schedule`/`cancel` in `apps/web/src/lib/notifications.ts`.

## Build

```bash
pnpm --filter @indiafoss/android exec cap add android   # once (needs SDK for gradle)
pnpm --filter @indiafoss/android build                  # cap sync
cd android && ./gradlew assembleDebug                   # needs JDK 21 + SDK
```

F-Droid flavour must not require FCM (`@capacitor/push-notifications` is
deliberately not used — local notifications only).
