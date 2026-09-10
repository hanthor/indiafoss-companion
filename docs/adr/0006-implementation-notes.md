# ADR 0006 — implementation notes

Code-level companion to [ADR 0006](0006-one-person-two-transports.md), from a
full audit of `hanthor/indiafoss-chat-android` (verified on `main` @ 26.05.2;
the architecture is identical on the `ex-2609` port branch, with
`appnav/di/` → `appnav/session/` path shifts). File:line anchors are `main`'s.

## The headline: upstream has already arrived

Multi-account is not something to build — it is something to **enable and
finish**. Element X ships it behind a disabled flag on our current base:

```kotlin
// libraries/featureflag/api/.../FeatureFlags.kt:81-87
MultiAccount(
    key = "feature.multi_account",
    defaultValue = { false }, isFinished = false,
    description = "… EXPERIMENTAL and UNSTABLE."
)
```

Already built and working, today, on `main`:

| Capability                                                                                                               | Where                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Multi-row session table, `userId` PK, `position` + `lastUsageIndex` ordering, cached display name/avatar for switcher UI | `SessionData.sq:12,30-39`                                      |
| Full plural `SessionStore` API (`sessionsFlow`, `getAllSessions`, `setLatestSession`, `removeSession`)                   | `SessionStore.kt:25-72`                                        |
| N live `MatrixClient`s: `ConcurrentHashMap<SessionId, (client, SyncOrchestrator)>`, restores _all_ saved sessions        | `MatrixSessionCache.kt:43,79-92`                               |
| Per-session DI: `SessionGraph` is a `@GraphExtension(SessionScope)` seeded by the `MatrixClient`, instantiable N times   | `SessionGraph.kt:17-25`                                        |
| Account picker module                                                                                                    | `libraries/accountselect/`                                     |
| Swipeable account avatars in the home top bar                                                                            | `HomeTopBar.kt:277-306`                                        |
| "Add account" settings section + nav wiring                                                                              | `PreferencesRootView.kt:84,133-158`, `RootFlowNode.kt:367-369` |
| Session-keyed notifications, `showSessionId = numberOfSessions() > 1`                                                    | `NotificationRenderer.kt:52-56`                                |
| Per-session sync: every cached client gets a started `SyncOrchestrator`                                                  | `MatrixSessionCache.kt:116-126`                                |
| Logout listeners designed plural (`wasLastSession`)                                                                      | `DefaultSessionObserver.kt:55-79`                              |
| Duplicate-account guard                                                                                                  | `RustMatrixAuthenticationService.kt:348-356`                   |

"Current session" is simply the row with max `lastUsageIndex`; switching is a
DB write (`HomePresenter.kt:85-86`). The single-session _feel_ comes from
three narrow places: `loggedInStateFlow()` collapsing `selectAll` to
`selectLatest` (`DatabaseSessionStore.kt:36-51`); the home subtree living
inside one `SessionScope` graph; and our fork's auto-login short-circuit.

Crucial framing: the mesh account **is a real Matrix session** on
`http://localhost:8008`. To every layer above the transport it is just
another account. That is why this whole feature is tractable.

## Known upstream bugs to fix when the flag flips

1. **Stale-client leak** — `MatrixSessionCache` never listens to
   `SessionObserver`; with N>1 accounts, logging one out leaves its
   `destroy()`ed client in the map forever (`getOrRestore` hands it out).
   Fix: implement `SessionListener`, `remove(SessionId)` on
   `onSessionDeleted`.
2. **Token-invalid routing** — `RootFlowNode.kt:196` sends the _whole app_ to
   `SignedOutFlow` when the latest session's token dies, blocking a healthy
   second account.
3. **Global image loader** — `LoggedInAppScopeFlowNode.kt:80` sets a
   process-global Coil loader per resumed session; two visible sessions ⇒
   the other account's avatars break. (The holder itself is session-keyed.)
4. **One login in flight** — `RustMatrixAuthenticationService` is app-scoped
   with mutable single-login state; "add account" must stay sequential.
5. **Navigation state service** — `DefaultAppNavigationStateService` holds a
   single stack (its own TODO admits it); matters for notification
   suppression with two visible sessions.

## The fork's single-account assumptions (all 17, to unwind by stage)

Stage 0 (coexistence) unwinds these:

| #   | Where                             | Assumption                                                                                                                                                                   |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `RootFlowNode.kt:93-95`           | Homeserver `http://localhost:8008`, localpart `"n"`, placeholder password hardcoded for headless auto-login                                                                  |
| 2   | `RootFlowNode.kt:199-201,258-268` | _Any_ `NotLoggedIn` state auto-logs into the mesh — so the mesh is unconditionally the first account, login UI unreachable, and "log out of everything" inexpressible        |
| 3   | `RootFlowNode.kt:140-167`         | App start serialized behind the node: prereqs → `start()` → `awaitReady()` → only then nav. A restored classic session waits for the mesh                                    |
| 4   | `RootFlowNode.kt:156-160`         | Mesh startup error is terminal for the whole app (splash forever), even with a healthy classic session on disk                                                               |
| 5   | `LoadingNode.kt:144-156`          | BLE permission/Bluetooth gates block everything; "continue without the mesh" branch goes here                                                                                |
| 6   | `DefaultEnterpriseService.kt:31`  | `defaultHomeserverList()` = singleton loopback URL ⇒ app-wide forced provider: onboarding auto-skips, QR login disabled, default provider is loopback                        |
| 7   | `LoginFlowNode.kt:214-227`        | Every onboarding→password transition rewritten to the forced `"n"`/no-back/auto-submit target — **including "Add account"**, which today tries to mint a second mesh session |
| 8   | `LoginPasswordPresenter.kt:84-91` | Auto-submit uses the mesh placeholder password regardless of provider                                                                                                        |
| 9   | `LoginPasswordView.kt:73-132`     | Terminal, back-less login screen, title hardcoded "Sign into Neutrino"                                                                                                       |
| 10  | `NeutrinoService.kt`              | No `stop()` — the node is start-once-per-process; a classic-only run still can't turn it off                                                                                 |

Stage 1+ unwinds these (each is a mesh-only decision applied to all
sessions):

| #   | Where                                                     | Assumption                                                                                                                                                                                                        |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | `SyncOrchestrator` (fork patch)                           | `isNetworkAvailable` dropped from sync-restart ("homeserver is on loopback") — a classic session would sync-thrash offline. Gate per session class                                                                |
| 12  | `DefaultIndicatorService`, `RoomListPresenter.kt:211-222` | Chat-backup/recovery banners hardwired off ("Neutrino runs on-device") — wrong for a classic account                                                                                                              |
| 13  | `LoggedInView.kt:~95`, `PushConfig`                       | Pusher-failure warnings silenced, Firebase gutted — a classic account gets no push _and no warning_. The mesh session needs no push (it syncs in-process); classic ones need the upstream path back               |
| 14  | `DefaultFtueService`, `SetDisplayNamePresenter.kt:28-30`  | Mandatory display-name step caps at 20 UTF-8 bytes _because it is a BLE advert_ — would truncate a classic account's name for a mesh reason. Make the step and cap mesh-session-only                              |
| 15  | `StartDM.kt` (`dmWouldBeKeyDead`)                         | The cross-seam refusal; Stage 1 replaces it with the router (its pure-function shape was chosen for this)                                                                                                         |
| 16  | `IndiafossLinks.kt:31,50-57`                              | `neutrino_server_name` deep links resolve to `@n:<hex>` with no session choice; permalink routing must become account-aware (upstream's `AccountSelect`-on-permalink at `RootFlowNode.kt:497-545` is the pattern) |
| 17  | `MatrixSessionCache.kt:104-106`                           | Analytics homeserver tag is global ("may not play well with multiple sessions" — their comment)                                                                                                                   |

## Stage 2's one genuinely large piece

The room list is single-session **by scope, not by shape**:
`HomeFlowNode` (`@ContributesNode(SessionScope)`) → `RoomListPresenter`
(injects one `MatrixClient`) → `RoomListDataSource`
(`@SingleIn(SessionScope)`) → `matrixClient.roomListService`.

The unified inbox needs, in order:

1. **`sessionId` on `RoomListRoomSummary`** (`model/RoomListRoomSummary.kt:22-44`
   has no owning account; every consumer keys off `roomId` alone). Most
   invasive single change; do it first, while the merge is still one session,
   so the type churn lands separately from the behaviour change.
2. **An `AppScope` aggregator** fanning out over `MatrixClientProvider`: one
   `RoomListDataSource`-equivalent per cached client, merge-sorted by latest
   activity, then the ADR's person-merge and `room_id`-dedupe layered on top.
3. **Lift the home node to `AppScope`**, opening a room by
   `(sessionId, roomId)` and only then entering that session's graph — room
   screens stay session-scoped, exactly as upstream structured them.
4. Per-source visible-range mapping for sliding-sync pagination
   (`RoomListDataSource.kt:99-125`).

Two mitigating facts: mesh and classic accounts live on different
homeservers, so `room_id` collisions are theoretical until the Spindle RFC
federates rooms; and the merge can ship _behind the person-row feature_ while
plain per-account switching (already working) remains the fallback.

## Ordered work plan

1. **Enable + stabilise** (Stage 0a): flip `feature.multi_account` for our
   build; fix upstream bugs 1–3 above; PR the cache-leak fix upstream — it is
   theirs.
2. **Coexistence** (Stage 0b): unwind fork assumptions 1–10. The auto-login
   branch becomes "mesh enabled && no mesh session yet"; the forced-provider
   rewrite applies only when the resolved provider _is_ loopback; the splash
   gates only the mesh session; `stop()` gets added to `NeutrinoService`.
3. **Per-session-class behaviour** (Stage 1 prep): assumptions 11–14 keyed on
   "is this session the mesh?" (the 64-hex server-name test already used by
   `StartDM.kt` and `IndiafossLinks.kt`).
4. **Router** (Stage 1): replace `dmWouldBeKeyDead` with the ADR's
   resolution order; account-aware deep links (16).
5. **Inbox** (Stage 2): the four-step plan above.
6. Stages 3–4 per the ADR.

Steps 1–4 are individually small and testable on the current base — none of
them waits for the 26.09.1 port, though landing them _on_ `ex-2609` avoids
porting them twice.

## Changes since the audit (10 September 2026)

Merged work that touches the anchors above. Each is a merged PR with green CI;
none is a two-phone or device result.

- **Assumption 16 (`IndiafossLinks.kt`) — partly addressed, still
  account-blind.** Chat #59 adds `ConferenceLinks.classify` and
  `ConferenceLinkDispatcher` in `app/…/conference/`: every link the
  conference surface sees is classified (`InternalConference`, `MatrixLink`,
  `IndiafossHandoff`, `CompanionRoute`, `ExternalWeb`, `Communication`,
  `Rejected`) and dispatched with `ActivityNotFoundException` handled;
  Companion routes go to the installed native Companion
  (`org.indiafoss.companion.nativeapp`) with a PWA fallback. `IndiafossLinks`
  remains the parser for `indiafoss://chat|friend`, and `neutrino_server_name`
  links still resolve to `@n:<hex>` with no session choice — the
  account-aware routing this note asks for is Chat #46, explicitly out of
  scope in #59. Chat #61 puts an "Open Companion" action on the same
  dispatcher.
- **Assumption 10 (`NeutrinoService`) — grew a discoverability seam, still no
  `stop()`.** Chat #60/#62 add `setDiscoverable(Boolean): DiscoverableResult`
  (`Applied` / `Unavailable` / `Failed`), `isDiscoverabilityControlAvailable()`
  and `start(discoverable)`, which sends `set_discoverable(false)` before
  `startBle` so a hidden choice survives a restart. The node is still
  start-once-per-process. The FFI exists because the bindings are now built
  from `hanthor/neutrino-iroh@15117e9` (Companion #305) and pinned as
  `0.8.2-e2ee.2d85348-ble.15117e9` in Chat #62.
- **Fact 3 in the ADR (public profile link, no binding) — corrected in code.**
  Companion #300 renames `MeshLinkState.verified` to `profile-matched`,
  migrates stored records on read, and shows card signature, in-person badge
  comparison, profile match and Chat device verification as four separate
  states. Companion #324 (below) adds the binding verifier that produces `binding-valid`; nothing produces `verified`. Companion #315 puts
  every persisted identity behind `identity.version: 1` and retains unread
  shapes without routing them. `StartDM.kt`'s `dmWouldBeKeyDead` (assumption 15) is untouched; the Stage 1 router still waits on #188.
- **Companion side of the seam shrank.** `@indiafoss/matrix` now exports only
  the profile-field, mesh-link and handoff helpers plus what
  `tools/neutrino-probe` drives (#314). Nothing in this note's Chat-side plan
  depends on the removed exports.

## The identity binding (#188), as of 10 September 2026

The trust root of Stage 1 is specified in
[`docs/identity-binding.md`](../identity-binding.md) and implemented as a
verifier on both platforms. What Chat would need to do to mint one, and what
it must not assume:

- **Signing.** `OlmMachine::sign(message)` signs a string with the device
  key and, when cross-signing is set up, the master key — the preferred
  `matrixKeyKind`. The message is the exact bytes of
  `docs/identity-binding.md` §3 (`domain ‖ "\n" ‖ canonical JSON`); the
  Companion signs the same bytes with the card key. The `Signatures` value
  the SDK returns is keyed `ed25519:<id>`; the binding takes the raw
  signature under the master key's id, base64url.
- **Minting** needs both identities on one device: Stage 0's multi-account
  is a prerequisite, not a nicety. `matrixKeyId` for the master key is
  `ed25519:<unpadded base64 of the key>`; for a device key it is
  `ed25519:<DEVICE_ID>`.
- **Verifying on the Chat side** needs `/keys/query` for the peer's account,
  which the SDK already does as part of E2EE; the verifier then records the
  provenance (`server` at best, `user-verified` after emoji/QR on the master
  key). Chat's existing user verification flow is what lifts a binding from
  `binding-valid` to `verified`; nothing else may.
- **Not in the fork yet:** no signing call, no profile field, no `/keys/query`
  consumer for bindings, no route selection on a binding. The cross-seam DM
  guard (chat-android#40) stays a refusal.
