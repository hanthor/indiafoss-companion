# C-14 — Rehearse the venue gateway on the real network, before the day

- Status: Needs hardware (the venue network, or a faithful reproduction of it,
  plus at least two phones and the gateway host)
- Repository: indiafoss-companion
- Tracks: [#163](https://github.com/hanthor/indiafoss-companion/issues/163),
  [#165](https://github.com/hanthor/indiafoss-companion/issues/165),
  [#115](https://github.com/hanthor/indiafoss-companion/issues/115) (and
  [#129](https://github.com/hanthor/indiafoss-companion/issues/129), whose
  room-version and signing checklist this rehearsal supersedes in part)
- Size: L

## Why this matters

On 26 September a few hundred people walk into a venue and open the app. If the
gateway is not already holding the canonical conference rooms, if its identity
was regenerated on the last restart, if the venue AP isolates clients, or if
nobody has ever restarted it and watched it come back — then the first anyone
learns of it is a room full of attendees whose messages go nowhere.

Every failure this task looks for is invisible until it is expensive. Discovery
succeeding while nothing can actually connect is the specific shape that hurts
most: the app looks fine, peers appear in the list, and messages fail much later
for reasons nobody can diagnose in a corridor.

## Context you need

### What the architecture asks for

`docs/architecture/system.md`, "Rooms, federation and the encrypted seam" — the
requirement:

> Use one preseeded conference room namespace and persist gateway
> identity/signing keys. Attendees resolve the same canonical room; offline
> failure queues a join or explains the unavailable route. No local recreation
> under a lookalike alias. Test membership, history visibility, room versions
> and signing on the exact deployed versions before relying on convergence.

And the honest caveats, which are the reason this task cannot be done at a desk.
Quoted in full because each sentence rules out a shortcut somebody will
otherwise take:

> Prefer powered, monitored gateways for continuity. Android relay devices are
> also subject to battery, process and radio limits. On isolated Wi-Fi,
> discovery is not proof of a working route; rehearse actual AP/VLAN/VPN
> configurations. Seeded peers avoid discovery dependency, not firewalls or AP
> isolation.

Unpacked:

- **Powered and monitored beats a phone.** An Android relay is subject to
  battery, Doze, process death and radio management. It may be the only option
  in some corner of the venue; it is not the plan.
- **Discovery is not reachability.** mDNS crossing the network proves multicast
  works. It proves nothing about whether two nodes can exchange a single unicast
  packet. This is the trap the whole task is built around.
- **Seeding fixes the wrong half.** Giving a node its peers directly removes the
  dependency on discovery. It does not open a firewall and it does not defeat AP
  client isolation.

The component table adds the boundary the gateway must not cross: "Infrastructure
relay, not an attendee impersonator or plaintext decryptor."

And the delivery table names this workstream's first reviewable outcome:

> | Venue service | Canonical room seed, topology and restore rehearsal |
> Companion #163/#165/#166/#129/#115 |

### The corrected diagnosis on #163 — read the comments, not just the body

`docs/architecture/review-2026-09-07.md` flags this explicitly in its triage:
"Bring the corrected Tailscale diagnosis from #163's comment into its body."

The correction, which lives in
[#163's comments](https://github.com/hanthor/indiafoss-companion/issues/163)
and not in its body: a network previously recorded as client-isolating **was
not**. A Tailscale exit node with `ExitNodeAllowLANAccess: False` was routing one
host's traffic — including its own local subnet — away from the LAN. Two hosts on
`192.168.68.0/22` could not reach each other in either direction, ICMP included,
while mDNS multicast crossed perfectly. The failure looked symmetric because only
one host's replies were being routed away.

```sh
tailscale debug prefs | grep -E 'ExitNode|RouteAll'
tailscale set --exit-node-allow-lan-access=true
# then: ping 0% loss, client API 200 in 7 ms over the LAN
```

The generalisation is the part that matters for the venue checklist, and it is
why this task's diagnostics are prescribed in a specific order:

- **A host-side routing policy, client isolation, and a firewall are
  indistinguishable from the outside.** All three present as "multicast works,
  unicast does not".
- **Test from both ends.** One misconfigured host makes the symptom look mutual.
- **Rule out the local host first** — exit node, `RouteAll`, firewall zone —
  before concluding anything about the AP. It is the cheap check.
- **A positive test for isolation requires two known-clean devices.** Anything
  less is inference.

What still stands from the original observation: multicast succeeding while
unicast fails is a real and dangerous shape, precisely because discovery keeps
working and the failure surfaces later. And a real mitigation was observed — the
mDNS advertisement carries every address a node has, so iroh selected a working
path and the mesh converged despite one address being dead. That is behaviour a
venue can rely on, and this rehearsal should confirm it still holds.

### The gateway that exists today

`docs/test-gateway.md` describes a long-running mesh node, and it is the thing
this task rehearses rather than invents:

- host `himachal`, managed as a user service;
- server name
  `03ef782ff53f1be505535dcdce1388b76de4dc72adbb34946ad87cb5df7a662d`, an
  ed25519 public key derived from `~/indiafoss-mesh/gateway/data` — **this is
  the identity that must survive restarts**, and it is derived from that data
  directory, which is exactly why the directory is the thing to protect;
- client API on `http://100.73.3.51:8008` and `http://192.168.68.57:8008`,
  federation on `:8448` via an in-process CoAP sidecar;
- load-bearing unit flags: `--fed-port` and `--bind 0.0.0.0:8008`.

```sh
systemctl --user status indiafoss-gateway
systemctl --user restart indiafoss-gateway
journalctl --user -u indiafoss-gateway -f
```

The document also carries a warning this task must respect: point a **test**
bundle's `messaging.aliasServer` at that server name; do **not** move the
published bundle, whose alias anchor is `reilly.asia`.

### The tooling that exists

Real, in this repository, verified:

- **`tools/neutrino-probe/`** — `package.json` scripts `start`
  (`tsx src/index.ts`, a client/server endpoint probe), `swarm`
  (`tsx src/swarm.ts`), `mesh-swarm` (`tsx src/mesh-swarm.ts`). Source:
  `src/nodes.ts` (`NeutrinoNode`, `Swarm`), `src/link.ts` (`ShapedLink`,
  `LINK_PROFILES` = `lan`, `wifi`, `wan`, `ble`, `bleMultiHop`),
  `src/udp-flaky.ts`. End-to-end suites `two-nodes.e2e.test.ts`,
  `two-nodes-restart.e2e.test.ts`, `two-nodes-reinstall.e2e.test.ts`,
  `two-nodes-media.e2e.test.ts`, `aliases.e2e.test.ts`,
  `shaped-federation.e2e.test.ts`, `flaky-link.e2e.test.ts`,
  `mesh-e2ee.e2e.test.ts`. They **self-skip unless `NEUTRINO_BIN` is set**, so a
  green run that never set it proves nothing — check the skip count.

- **`docs/mesh-harness.md`** — the swarm harness:

  ```sh
  git clone -b e2ee-key-transport https://github.com/hanthor/neutrino
  cd neutrino && cargo build --release -p neutrino
  export NEUTRINO_BIN=$PWD/target/release/neutrino
  pnpm --filter @indiafoss/neutrino-probe swarm -- --size 24 --profile ble
  pnpm --filter @indiafoss/neutrino-probe swarm -- \
    --size 24 --profile ble --gateways 3 --gateway-profile wifi --stagger 250
  ```

  Flags: `--size`, `--profile`, `--gateways`, `--gateway-profile`, `--stagger`,
  `--timeout`, `--bin`, `--settle`; env `SWARM_KEEP=1`, `NEUTRINO_BIN`. The
  document states plainly that these scenarios are **not run in CI**.

- **`docs/neutrino-scale.md`** — the standalone loopback harness:

  ```bash
  cargo build --release --bin neutrino
  node tools/neutrino-probe/scripts/swarm.mjs 50 ../neutrino/target/release/neutrino 500
  ```

  Nodes bind `127.0.0.1:9100+i`; state under `/tmp/swarm` (`SWARM_ROOT`
  overrides). Its findings shape this rehearsal's expectations: **join storms are
  the failure mode** (`JOIN_INGEST_TIMEOUT`, 20 s, tunable with
  `NEUTRINO_JOIN_INGEST_TIMEOUT_MS`); **~100 members is the mesh room ceiling**,
  so big rooms belong to the conference Spindle; and **3–5 venue gateways** is
  the working figure.

  These are shaped-software results on loopback. The review is explicit about
  the distinction this task must maintain: "Distinguish shaped-software scale
  results from physical BLE/Wi-Fi capacity." A swarm number is not a venue
  number.

- The pinned revision under rehearsal: `patches/neutrino/version.json`
  (`.neutrino.rev`, currently `2d85348ee5a0086c3f30725a31b68439f4fe89b4`).

- **`docs/evidence/README.md`** sets the recording convention:

  > One file per rung per run day, named `rung<k>-<what>-<yyyy-mm-dd>.md`. A
  > file records **the exact revisions, the exact command, the raw output, and
  > what the runner concluded** — including a run that failed, which is evidence
  > too. Numbers in a table with no command above them are what this directory
  > exists to prevent: a claim nobody can re-run.

## What to do

Do these in order. Steps 1–3 are cheap and rule out the expensive mistakes.

1. **Rule out the local hosts first.** On the gateway host and on _every_
   machine used for testing, before touching the venue network:

   ```sh
   tailscale debug prefs | grep -E 'ExitNode|RouteAll'
   ```

   Record the output for each host in the evidence file even when it is clean —
   the whole point of #163's correction is that "I checked and it was fine" is
   only evidence if it was written down. Also record the firewall zone and any
   VPN in use. **Do not proceed to network conclusions until both ends are
   known-clean.**

2. **Persist the gateway identity, and prove it persists.** The server name is
   derived from `~/indiafoss-mesh/gateway/data`. Establish and document:
   - what exactly is on disk that the identity derives from;
   - that it is backed up, where, and how a restore is performed;
   - that the systemd unit cannot regenerate it (a fresh data directory on a
     failed start would silently mint a _new_ gateway identity, and every
     attendee's saved alias would then point at a stranger);
   - the same for federation signing keys.

   Then prove it: `systemctl --user restart indiafoss-gateway`, and confirm the
   server name is byte-identical afterwards. Then prove the harder case: move the
   data directory aside, restore it from backup, restart, and confirm the same
   server name again.

3. **Preseed the canonical room namespace.** Create the conference rooms on the
   gateway, under the canonical aliases, before the event — not on the day, and
   not by an attendee's client. Record for each room: alias, room id, room
   version, join rule, history visibility, and which server is the alias
   authority. `docs/architecture/system.md` requires "No local recreation under a
   lookalike alias" — verify that an attendee client resolving the alias joins
   _that_ room and never creates a substitute.

   Point a **test** bundle's `messaging.aliasServer` at the gateway server name
   for the rehearsal. Do not move the published bundle's anchor (`reilly.asia`).
   The canonical directory's content and validation is **C-06**'s, not this
   task's.

4. **Verify actual peer reachability on the real venue SSID.** This is #163 and
   the reason for the hardware status. On the venue network, from two known-clean
   devices, in this order:
   - confirm discovery works (mDNS advertisements seen) — and then explicitly
     record that this proves nothing;
   - test unicast in **both** directions: ICMP, then a TCP connection to the
     client API port, then an actual client API request. From A to B _and_ from
     B to A. A one-directional test is what produced the wrong diagnosis on #163.
   - if unicast fails, work the ladder in order: local host routing (step 1)
     → host firewall → AP client isolation → VLAN/uplink policy. Record which
     rung the failure was on.
   - `pnpm --filter @indiafoss/neutrino-probe start` against the gateway's client
     API is the probe to use for the endpoint check.

   Record the AP model, SSID, band, whether client isolation is configured, VLAN
   layout, and whether any VPN was active on any participant. "Rehearse actual
   AP/VLAN/VPN configurations" means the configuration the venue will run on the
   day, not an approximation.

5. **Seed peers, and be clear about what that fixed.** Configure the phones with
   the gateway as a seeded peer so the mesh does not depend on discovery. Re-run
   step 4's reachability tests. Then state explicitly in the evidence file which
   failures seeding removed and which it did not — per the architecture, "Seeded
   peers avoid discovery dependency, not firewalls or AP isolation." If seeding
   appeared to fix a firewall problem, something else changed and the run is not
   trustworthy.

6. **Rehearse gateway restart and restore.** Three separate exercises, each with
   its own recorded outcome:
   - **restart**: `systemctl --user restart indiafoss-gateway` with phones joined
     and mid-conversation. What do attendees see, how long until it converges,
     is anything lost, does the room state survive?
   - **restore**: the data directory is lost and restored from backup. Same
     identity, same rooms, same federation state?
   - **cold host reboot**: the unit comes back on its own, with `--fed-port` and
     `--bind 0.0.0.0:8008` intact.

   `systemctl --user` units do not necessarily start before a user logs in.
   Check that specifically; it is the failure that turns a reboot into an outage.
   Keep `journalctl --user -u indiafoss-gateway -f` running throughout and paste
   the relevant output.

7. **Rehearse a join burst.** Attendees arrive together and join together, and
   `docs/neutrino-scale.md` identifies join storms as _the_ failure mode
   (`JOIN_INGEST_TIMEOUT`, 20 s). Run the loopback swarm to characterise the
   software behaviour at the expected size:

   ```sh
   export NEUTRINO_BIN=/path/to/neutrino
   pnpm --filter @indiafoss/neutrino-probe swarm -- --size 24 --profile wifi --gateways 3 --stagger 250
   ```

   and then, separately and clearly labelled, do the physical version with the
   phones you actually have. **Do not merge the two numbers into one table.**
   State the ceiling honestly: ~100 members per mesh room, big rooms belong on
   the conference Spindle, 3–5 gateways.

8. **Decide and document the gateway topology for the day.** How many gateways,
   where they sit physically, how they are powered, how they are monitored, and
   who restarts one at 11am. If any Android device is used as a relay, state the
   battery, Doze and radio limits explicitly and say what happens when it dies.
   The architecture's preference — powered, monitored — is the recommendation;
   any departure from it is recorded as a limitation, not as a plan.

9. **Write the evidence files**, per `docs/evidence/README.md`: exact revisions,
   exact commands, raw output, and what the runner concluded — including runs
   that failed. Then produce the capability claims for the record that **C-11**
   defines, so this rehearsal's outcome is machine-readable rather than folklore.
   Claims from this task are `topology-tested` only where the real network and
   real phones were used, and `topology` is mandatory on those.

10. **Fold the corrected #163 diagnosis into the checklist**, so the next person
    does not repeat it: the venue checklist item must say "rule out both hosts
    first", not "check whether the AP isolates clients".

## Acceptance

### Commands

```bash
# local-host sanity, on every host involved
tailscale debug prefs | grep -E 'ExitNode|RouteAll'

# gateway service
systemctl --user status indiafoss-gateway
systemctl --user restart indiafoss-gateway
journalctl --user -u indiafoss-gateway -n 200

# endpoint probe against the gateway's client API
pnpm --filter @indiafoss/neutrino-probe start

# harness, with the binary actually set (check the skip count if it is not)
export NEUTRINO_BIN=/path/to/neutrino
pnpm --filter @indiafoss/neutrino-probe test
pnpm --filter @indiafoss/neutrino-probe exec vitest run src/two-nodes-restart.e2e.test.ts
pnpm --filter @indiafoss/neutrino-probe exec vitest run src/aliases.e2e.test.ts
pnpm --filter @indiafoss/neutrino-probe swarm -- --size 24 --profile wifi --gateways 3 --stagger 250

# repository gates, since this task touches docs and possibly the Justfile
just test
just typecheck
just lint
```

### Observable outcomes

- The gateway's server name is **identical** before and after a restart, after a
  data-directory restore, and after a cold host reboot. Paste all three.
- An attendee client resolving a canonical alias joins the preseeded room. A
  second client resolving the same alias joins the **same room id** — no
  lookalike, no silent recreation.
- Unicast succeeds in **both** directions between two known-clean devices on the
  venue SSID, tested at ICMP, TCP and client-API levels. If it does not, the
  failure is attributed to a named rung of the ladder in step 4, with the
  evidence for that attribution.
- Two phones exchange messages through the gateway on the venue network, and
  keep working across a gateway restart.
- The join burst completes without `JOIN_INGEST_TIMEOUT`, or the timeout is
  recorded with the size at which it appeared.

### Negative cases — what must still fail or still be refused

- **Discovery succeeding is never recorded as reachability.** An evidence file
  that reports "peers discovered" without a unicast result in both directions
  does not pass review.
- **Seeding must not be reported as having fixed a firewall or isolation
  problem.** If it appears to, the run is invalid and something else changed.
- **A loopback swarm number must not appear in a table of venue capacity.**
  Shaped-software results and physical radio capacity are separate tables with
  separate headings.
- **Cross-seam encrypted delivery is not claimed.** Whatever this rehearsal
  shows about federation and rooms, `seam.encrypted.async` stays
  `supported: false` — that is **C-13** / #176.

### Evidence checklist

Every one of these goes into the evidence file. A rehearsal missing any of them
is not finished, and an omitted item is recorded as omitted rather than left
blank:

- [ ] **Devices**: every phone by model and Android version; the gateway host by
      OS and version; any laptop used for probing.
- [ ] **Builds**: the exact `neutrino` revision from
      `patches/neutrino/version.json`, the Chat APK version and its sha256, and
      the AAR checksum. A branch name is not a revision.
- [ ] **Topology**: AP model, SSID, band, client-isolation setting, VLAN layout,
      uplink, and every VPN or exit node active on any participant — including
      the ones that were clean.
- [ ] **Timestamps**: when each exercise ran, and how long convergence took after
      each restart.
- [ ] **Raw output**: pasted, not summarised, for every command in the list
      above. Numbers with no command above them are what `docs/evidence/` exists
      to prevent.
- [ ] **Limitations**: what was not tested, what the rehearsal environment did
      not reproduce about the real venue, and how many devices short of the
      expected crowd this was. This field is the most useful one in the file.
- [ ] **Conclusion**: what the runner concluded, including from runs that failed.

Structure these so they map onto `CapabilityClaim`'s `topology`, `evidence` and
`limitations` fields (**C-11**) without rewriting.

## Out of scope

- **Publishing or validating the canonical room directory.** **C-06** (#166)
  owns the `ConferenceDirectory` contract and its alias-anchor decision. This
  task seeds and rehearses rooms; it does not decide the namespace.
- **Publishing the 2026 event bundle.** **C-04** (#191). Use a test bundle for
  the rehearsal and leave the published anchor (`reilly.asia`) alone.
- **The encrypted seam.** **C-13** (#176). A gateway that forwards federation
  traffic has not demonstrated cross-seam encrypted asynchronous delivery, and
  no result from this task may be reported as if it had.
- **The capability record's format and the release recipe.** **C-11** (#34).
  This task produces claims; C-11 defines where they live.
- **Building and proving the Chat APK.** **X-01** (Chat #44/#45/#49, #182).
- **Spindle deployment, operations and temporary-account policy.** Gated on the
  maintainer decisions in
  [#181](https://github.com/hanthor/indiafoss-companion/issues/181); the
  architecture notes Spindle's release is "still explicitly unstable" and that
  "pinning a tag does not solve migration risk". Prefer scope reduction to a
  last-minute upgrade during this rehearsal.
- **Editing #163's issue body.** The review recommends folding the corrected
  Tailscale diagnosis into it; that is issue hygiene for the maintainer, and
  `docs/tasks/README.md` says specs do not open or rewrite issues. The
  correction is inlined above so this spec does not depend on it.
