# The test gateway

A long-running mesh node that owns an alias namespace, so the conference-chat
path can be exercised against something real instead of a swarm that is torn
down at the end of a test. It is the prototype of the venue gateway in
[#165](https://github.com/hanthor/indiafoss-companion/issues/165), and the
answer to [#166](https://github.com/hanthor/indiafoss-companion/issues/166) is
what it is for: the deterministic aliases have to belong to **one designated
server**, and it has to be reachable over whatever medium an attendee has.

```
host         himachal
server name  03ef782ff53f1be505535dcdce1388b76de4dc72adbb34946ad87cb5df7a662d
client API   http://100.73.3.51:8008        (tailscale)
             http://192.168.68.57:8008      (LAN — see the warning below)
federation   :8448 via the in-process CoAP sidecar, onto the iroh link
unit         systemctl --user status indiafoss-gateway
storage      ~/indiafoss-mesh/gateway/data
```

The server name is the node's ed25519 public key. It is derived from the
identity in `storage`, so **deleting that directory changes the server name**
and every alias under it — which is the whole namespace. Back it up before
touching it, or expect to re-seed every room.

## Using it as the alias anchor

Point a test bundle's `messaging.aliasServer` at the server name above. It is a
valid server name and needs no code change; `collectMessagingIssues` accepts a
64-hex node id exactly as it accepts a hostname.

Do **not** point the published IndiaFOSS bundle at it. That bundle is live and
its anchor is `reilly.asia`; moving the anchor moves the whole namespace, and
anyone already in the old rooms is left in them.

## Operating it

```sh
systemctl --user status indiafoss-gateway
systemctl --user restart indiafoss-gateway
journalctl --user -u indiafoss-gateway -f
```

Lingering is enabled, so it survives logout and reboot. Restarts are safe: the
store is crash-safe by design and the outbox is what a restart redelivers from.

Two flags in the unit are load-bearing and easy to get wrong:

- **`--fed-port`.** Without it the homeserver federates over plain HTTP to
  `http://<64-hex server name>`, which has no DNS behind it, so every outbound
  request dies as a 502 while discovery looks perfectly healthy.
- **`--bind 0.0.0.0:8008`.** The client API has to be reachable from a handset,
  not just from the host. It is bound on every interface deliberately; this is a
  test server on a private network, and it accepts open registration.

## What it has been shown to do

Across two physical machines, with the node on the other machine discovering it
by mDNS and nothing hand-seeded:

```
gateway creates #indiafoss-2026-session-keynote:03ef782f…  ->  !3Zj50fDo…
other machine resolves it over federation               200  ->  !3Zj50fDo…
other machine joins by alias                            200  ->  !3Zj50fDo…
message sent there arrives on the gateway                        after 1 s
```

That is the whole conference-chat contract: one server owns the alias, everyone
else resolves it over federation and joins, and nobody has to be invited.

## What this network can and cannot tell you

The LAN path works. Both machines reach each other on `192.168.68.0/22`
directly:

```
ping 192.168.68.57      0% packet loss, ~11 ms
cs-api over the LAN     200 in 7 ms
```

That took a correction worth recording. It first looked like the access point
was isolating its clients — nothing passed between `192.168.68.56` and
`192.168.68.57` in either direction, ICMP included, while mDNS multicast crossed
perfectly well, which is exactly the signature of an isolating AP
([#163](https://github.com/hanthor/indiafoss-companion/issues/163)). It was not
the AP. One machine was using a **tailscale exit node with
`ExitNodeAllowLANAccess: False`**, which routes _all_ traffic through the exit
node, the local subnet included. That machine could not reach the LAN, and the
other machine's packets arrived but its replies were routed away — so the
failure looked symmetric and looked like the network.

```sh
tailscale debug prefs | grep -E 'ExitNode|RouteAll'
tailscale set --exit-node-allow-lan-access=true
```

The lesson generalises: **a host-side routing policy is indistinguishable from
client isolation** from the outside, and both are indistinguishable from a
firewall. Check the exit node before blaming the venue's Wi-Fi — and check it
from both ends, since only one of the two hosts has to be misconfigured for the
symptom to look mutual.

The mesh converged even while that was true, because the mDNS advert carries
every address a node has and iroh chose one that worked:

```
addrs: {Ip(10.88.0.1:48298), Ip(100.73.3.51:48298),
        Ip(192.168.0.51:51154), Ip(192.168.68.57:48298)}
```

It used the tailscale address. That is the multi-path design doing its job, and
it is a real result — a blocked path cost nothing. But it also means a green run
here still does not prove the venue case, because tailscale was carrying it. To
test the venue honestly, bring tailscale down on both machines so the LAN
address is the only one on offer, and confirm from the log which path was used
rather than inferring it from chat working.
