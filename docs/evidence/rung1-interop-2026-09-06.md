# Rung 1 — one node, one Spindle: 15 of 15

Run 2026-09-06 on `himachal` (the machine that will run a venue gateway).

## Revisions

| Part | Revision |
| --- | --- |
| Spindle | `tuna-os/spindle` branch `venue-gateway`, `6e2d8ae` |
| Neutrino fork | `hanthor/neutrino` `3fb6945` + `contrib/neutrino/0001-gateway-federation.patch` (applied as `551240b`) |
| neutrino-lan | `hanthor/neutrino-iroh` head, built against the patched fork via the `[patch]` block |

## Command

```sh
NEUTRINO_LAN=…/neutrino-iroh/target/release/neutrino-lan \
SPINDLE_BIN=…/spindle/target/release/spindle \
bash scripts/neutrino-interop.sh
```

## Result — every probe in its pass state

| probe | outcome |
| --- | --- |
| mesh node key document at its loopback URL | served |
| Spindle invites `@n:<node>` into a state-DAG room | accepted |
| mesh node invites `@alice:<spindle>` | accepted |
| mesh user joins Spindle's state-DAG room via make_join/send_join | joined |
| messages cross Spindle → mesh and mesh → Spindle | both |
| mesh node finds alice's device keys via Spindle's user/keys/query | found |
| mesh node claims one of alice's one-time keys | claimed |
| Spindle finds the mesh user's device keys via the node's user/keys/query | found |
| the mesh user's new device reaches alice as device_lists.changed | announced |
| a to-device message from alice reaches the mesh user's device | delivered |
| a to-device message from the mesh user reaches alice's device | delivered |
| Spindle joins the mesh node's room and a message reaches the node | joined |
| Spindle resolves `#mesh-session-1:<node>` over federation | resolved |
| mesh node answers federation query with no X-Matrix header | 200 — **inbound federation is not verified**, the known gap in §7 |
| Spindle key document over plain http | 200 |

## Build trap worth knowing

The first build silently produced an **unpatched** gateway: `neutrino-iroh`'s
Cargo.toml already contains a `[patch.crates-io]` section, so any "append the
`[patch]` block only if absent" guard that greps for `patch.` matches the
existing section and skips the append — and cargo then compiles `neutrino-ffi`
from the git URL at whatever rev the lockfile pins. The tell is in the build
output: `Compiling neutrino-ffi v0.1.0 (https://github.com/hanthor/neutrino…)`
means the patch is NOT in the binary; a correct build says
`(…/interop/neutrino/crates/neutrino-ffi)`. Check the compile line, not the
Cargo.toml.
