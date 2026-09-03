# Neutrino plugin (optional P2P chat)

`NeutrinoPlugin.kt` embeds the Neutrino homeserver from
`io.element.neutrino:bindings` and exposes it to the web layer as the Capacitor
plugin `Neutrino` (`apps/web/src/lib/neutrino.ts`). It is compiled into the
APK when the bindings `.aar` is present in `libs/`:

```sh
pnpm --filter @indiafoss/android neutrino   # fetches the .aar from our release
pnpm --filter @indiafoss/android build
```

Without the `.aar`, `scripts/material3.mjs` leaves the plugin out and the app
is the plain companion; the web layer reports the mesh as unavailable.

The `.aar` is built by `.github/workflows/neutrino-bindings.yml` from
`element-hq/neutrino-iroh` at the tag in `version.json`, **with the homeserver
crates taken from our fork** (`version.json` → `neutrino.repo` at
`neutrino.rev`). That fork is upstream's `v0.7.1` plus the E2EE patches in
`patches/neutrino/`, which is how mesh rooms get key transport on a phone. It
is not offered upstream. Bump `neutrino.rev` (and the `version` suffix) when
the fork branch moves; the workflow rebuilds on any change to `version.json`.

The plugin mirrors `services/neutrino/impl` in the parked Element X fork
(`hanthor/indiafoss-chat-android`): same config, same BLE bootstrap, loopback
client-server API on port 8008, single forced user `@n:<node id>`.
