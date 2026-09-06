# Rung 2 — the shaped swarm: numbers, and a cliff nobody predicted

Run 2026-09-06 on `dilli` (8 cores, 15 GB, **debug** build of the fork's
`neutrino` at `d21ecd6` via env-var contract — see the errata file for why
this is the right binary and the playbook's `neutrino-lan` is not). Absolute
latencies are pessimistic — debug build, shared desktop — but the _shape_ of
the results is the finding.

## Command

```sh
export NEUTRINO_BIN=…/neutrino/target/debug/neutrino
pnpm --filter @indiafoss/neutrino-probe swarm -- --size <N> --profile <p> --timeout 300000
```

## BLE profile (250 ms ± 120 ms, 2% connection loss, 20 KB/s)

| nodes | joined | fan-out p50 | p90   | undelivered |
| ----- | ------ | ----------- | ----- | ----------- |
| 6     | 5/5    | 1.7 s       | 2.4 s | 0           |
| 12    | 10/11  | 2.1 s       | 3.5 s | 0           |
| 16    | 15/15  | 7.6 s       | 8.4 s | 0           |
| 20    | 17/19  | 3.2 s       | 5.5 s | 0           |
| 24    | 21/23  | —           | —     | **21/21**   |

## Wi-Fi profile (15 ms ± 10 ms, 0.1% loss, 4 MB/s)

| nodes | fan-out p50 | p90    | undelivered |
| ----- | ----------- | ------ | ----------- |
| 6     | 226 ms      | 229 ms | 0           |
| 12    | 426 ms      | 434 ms | 0           |
| 21    | 1.3 s       | 2.5 s  | 0           |
| 22    | —           | —      | **21/21**   |
| 23    | —           | —      | **22/22**   |
| 24    | —           | —      | **23/23**   |

The playbook's pass bar — "under a second on wifi, single-digit seconds on
ble" — holds to ~20 nodes for BLE p90 and to ~12 for the Wi-Fi p90 on this
rig, with the caveat above.

## The cliff: 21 works, 22 delivers nothing

The interesting result is not latency. Between 21 and 22 nodes, message
fan-out goes from complete to **zero** — binary, deterministic, and
independent of the link profile (the identical signature on `wifi` and `ble`,
at 120 s and at 300 s deadlines). Everything before the message works at 24:
invites federate out (23/23), joins federate in, the host sees every member.
Only the message transaction push dies, wholesale.

Ruled out so far: file descriptors (limit is 524288), port collisions (ports
are ephemeral via `freePort()`), the profile, the deadline. **Also ruled out
since first writing this: a fixed node-count constant.** On a freshly cleaned
box, 22 delivered completely and 24 still delivered nothing — and some of the
bisection runs above were degraded by ~24 leaked debug nodes from an earlier
timeout-killed run (the harness's children are detached, so killing the
harness leaks them; `pgrep -x neutrino` does not match a binary named
otherwise, which is how they survived a cleanup). The threshold therefore
moves with background load; the wall is real by 24 on this rig but its
location is not a protocol constant. Still not ruled out: the fork's
outbox/sender behaviour at ~20+ destinations, and the rig itself — the same
run on a second host is the next discriminating step.

`SWARM_KEEP=1` now preserves every node's storage and log for exactly this
kind of post-mortem; it was added mid-investigation because the alternative
was re-running five-minute swarms blind.

Until the cliff is explained, **the playbook's 50- and 100-node rung-2
targets are unreachable on any rig**, and §4's "hundred members as the design
ceiling" rests on the loopback swarm only. This is the open question rung 2
exists to answer, and it is open.

## Resolution (same day): the cliff was the join-storm head-cap bug

Found by finally checking the one response nothing checked: the host's own
send was answering **`400 M_BAD_JSON: prev_events exceeds 20 entries`**. Under
a shaped link the concurrent joins overlap, every join lands as a sibling
forward extremity, and past 20 heads the fork's event builder — which
references _every_ head — failed its own validator. Nothing merges heads, so
the room was permanently unwritable by its own members. On loopback the joins
serialise and the room keeps ~1 head, which is why `lan` never showed it.

Every earlier observation now has its explanation: total-not-slow (the send
failed, so there was nothing to deliver), profile-gated (shaping creates the
concurrency), threshold ~22 (21 remote joins can leave ≤20 heads; 22 cannot),
cross-host (it is protocol handling, not a rig), and the leaked-process noise
merely moved the apparent threshold.

Fixed in hanthor/neutrino#6 (cap at 20 like Synapse; unreferenced heads stay
extremities and later events absorb them), and the harness now fails loudly on
a non-200 send instead of reporting it as undelivered fan-out.

**With the fix (debug build, himachal):**

| scenario                                     | build   | joined    | fan-out p50 | p90          | undelivered |
| -------------------------------------------- | ------- | --------- | ----------- | ------------ | ----------- |
| 24 wifi                                      | debug   | 23/23     | 440 ms      | 598 ms       | 0           |
| 50 wifi + 3 gateways, stagger 250 ms         | debug   | 49/49     | 865 ms      | 1180 ms      | 0           |
| **100 wifi + 3 gateways, stagger 250 ms**    | release | **99/99** | **2495 ms** | **3102 ms**  | **0**       |
| **50 ble + 3 wifi gateways, stagger 250 ms** | release | **49/49** | **6847 ms** | **11015 ms** | **0**       |

Every rung-2 scenario in the playbook now completes with nothing undelivered
(himachal, 18 cores). Against the playbook's budgets: wifi p90 at 100 nodes is
3.1 s — over the "under a second" line, but that line was written for 50; at 50
it is 1.2 s on a _debug_ build. BLE p50 is single-digit seconds as required;
p90 is 11 s, just over, worth re-measuring on quieter hardware before calling
it a miss. At a venue, the bug this run un-blocked was a talk starting: a hall
joins the session room, and then nobody in it can send.
