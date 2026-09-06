# Playbook errata, found by running it

The venue playbook was audited by executing its commands against the revisions
its parts table names. Three of them do not run as written. Each entry names
the proof, so the correction is checkable rather than a competing claim.

## 1. Rung 2's binary is the wrong one

The rung says `export NEUTRINO_BIN=.../neutrino-lan`. The shaped harness
(`tools/neutrino-probe/src/nodes.ts`) spawns its binary with **no arguments**
and configures it entirely by environment — `NEUTRINO_SERVER_NAME`,
`NEUTRINO_BIND_ADDR`, `NEUTRINO_STORAGE_DIR`. That is the plain `neutrino`
binary's contract. `neutrino-lan` is flag-configured and exits immediately
under it:

```
$ NEUTRINO_BIND_ADDR=127.0.0.1:9101 … neutrino-lan
missing --bind <addr:port>
```

This is not an arbitrary harness choice. The shaped links are TCP proxies, so
the node's federation has to go over plain HTTP *through* them — which is what
the plain binary does and precisely what `neutrino-lan` exists not to do (its
federation rides the iroh medium, which would bypass the shaping entirely).
Rung 2 measures the homeserver under venue-shaped links; the medium itself is
rung 5's subject, on real radios.

**Correction:** `NEUTRINO_BIN` points at `neutrino/target/release/neutrino`
built from the fork. The `neutrino-lan` build in §2.1 is for gateways and
rung 3, not rung 2.

## 2. The Spindle peers at the wrong port, on an address it cannot reach

§2.2 peers the Spindle at `http://10.20.0.11:8448` — the gateway's
`--fed-port`. That port is the CoAP sidecar riding the iroh link: the mesh's
own medium, which a Spindle does not speak. The Matrix-over-HTTP surface a
Spindle can talk to — `/_matrix/key/v2/server`, `/_matrix/federation/v1/…` —
is the `--bind` listener. The gateway-federation patch confirms it: outbound
key resolution fetches `http://<server_name>/_matrix/key/v2/server`, i.e. the
HTTP listener, and touches the sidecar nowhere.

§2.3 then binds that listener to `127.0.0.1:8008`, which no Spindle on another
host can reach at all.

**Correction:** as `tuna-os/spindle`'s own `docs/venue-gateway.md` has it —
gateway `--bind <lan-ip>:8008`, Spindle `peers` URL `http://<lan-ip>:8008`.
`--fed-port` stays what it is: the mesh-side medium, load-bearing for
phone↔gateway, irrelevant to Spindle↔gateway.

## 3. `docs/evidence` did not exist

The go/no-go requires rung numbers "recorded in the repository under
`docs/evidence`". No such directory existed in any of the five repositories the
parts table names. It does now, here, with this file and the first rung-2
record beside it.
