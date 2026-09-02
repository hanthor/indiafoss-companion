# Neutrino plugin (optional P2P chat)

`NeutrinoPlugin.kt` embeds the Neutrino homeserver from
`io.element.neutrino:bindings` and exposes it to the web layer as the Capacitor
plugin `Neutrino` (`apps/web/src/lib/neutrino.ts`). It is compiled into the
APK only when the GitHub Packages token is available at build time:

```sh
NEUTRINO_PACKAGES_TOKEN=<token with read:packages> pnpm --filter @indiafoss/android build
```

Without the token `scripts/material3.mjs` leaves the plugin out and the app is
the plain companion; the web layer reports the mesh as unavailable.

The plugin mirrors `services/neutrino/impl` in the parked Element X fork
(`hanthor/indiafoss-chat-android`): same config, same BLE bootstrap, loopback
client-server API on port 8008, single forced user `@n:<node id>`.
