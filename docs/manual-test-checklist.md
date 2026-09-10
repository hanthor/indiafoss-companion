# Manual test checklist

Everything a human needs to click through before a release, across all three
apps ([ADR 0004](adr/0004-retire-the-capacitor-shell.md)): the web PWA (Web
and iOS via Safari "Add to Home Screen", no native wrapper), the standalone
native Compose event client for Android (`apps/android/native`,
`org.indiafoss.companion.nativeapp`), and the dedicated P2P chat app
(`hanthor/indiafoss-chat-android`). Grouped by feature area, not by app —
most areas apply to more than one app; the app column notes which. There is
no Capacitor build any more — neither the PWA nor the native app embeds a
chat UI; both deep-link out to the dedicated chat app or any Matrix client
via `matrix.to` links (see `apps/web/src/lib/element-links.ts`,
`packages/model/src/contact.ts`'s `contactDeepLinks`).

Legend: **W** = web/PWA, **N** = native Compose app, **X** = dedicated chat
app (Element X / Neutrino fork).

## 1. Onboarding & first run

- [ ] (W/N) Welcome wizard: skip vs complete all four steps (reminders,
      ticket/QR, your card, rank).
- [ ] `?setup=done` deep link / "Skip setup" both bypass the wizard.
- [ ] Re-running setup from Settings works after it was already completed.
- [ ] (N) Onboarding uses the phone's own Material You dynamic colour scheme
      (confirm on two phones with different wallpapers — colours must differ).
- [ ] First-run works with airplane mode on (everything is bundled/offline).

## 2. Now (live status)

- [ ] Correct "happening now" / "starting soon" session shown at the actual
      current time.
- [ ] "Nothing scheduled" empty state outside conference hours.
- [ ] "That's a wrap" state after the event ends.
- [ ] Leave-by banner appears/updates as the walk-time countdown ticks.
- [ ] Behaviour under the day simulator (see §8) at each simulated hour,
      not just real wall-clock time.

## 3. Schedule

- [ ] Full schedule renders for every day of the event.
- [ ] Filtering/searching (if present) narrows correctly.
- [ ] Tapping a session opens its Activity detail.
- [ ] Track/devroom names show the topic as the heading with the room
      number as a subtitle (e.g. "FOSS in Science" / "Devroom 1"), not the
      raw CFP string.

## 4. Plan & ranking

- [ ] Quick pass mode: swipe/rate every talk in a devroom.
- [ ] Head-to-head (pairs) mode: forced-choice comparisons converge to a
      ranking.
- [ ] Devroom swipe cards: tags render correctly (or are absent — the
      meaningless CFP category pills were deliberately removed).
- [ ] Ranking persists across app restarts and after clearing the day
      simulator.
- [ ] "What's on ▾" control is fully styled (regression check — this was
      previously unstyled raw HTML).
- [ ] Itinerary/plan view reflects the current ranking correctly.
- [ ] Undo / re-rank a single talk.

## 5. Explore & booths

- [ ] Explore list renders all booths/sponsors.
- [ ] Booth detail page: description, location, and (if applicable) the
      "Open … on Matrix ↗" chat handoff link all work.
- [ ] Speaker detail page: bio, photo, linked sessions.
- [ ] Activity detail page: description, speakers, room, time, "💬 Session
      chat ↗" handoff link, bookmark/rank action.
- [ ] (W) Activity detail Resources section: `livestreamUrl` renders a
      "▶ Watch live" link when the bundle sets it (alongside recording/slides
      when present); absent when it isn't.
- [ ] (W) Now screen: a currently-live session with `livestreamUrl` shows a
      "▶ watch live ↗" link next to its chat link.

## 6. Map & venue navigation

- [ ] Floor plan renders for every floor the venue has.
- [ ] Room/location pins are tappable and open the right detail.
- [ ] "Map to" a location (`/map/to/[location]`) draws a route.
- [ ] Route uses the correct floor and crosses stairs/lifts where it should
      (per `docs/venue-route-review-checklist.md` if the venue map changed).
- [ ] Scanning a location QR code sets "last scanned" position and updates
      leave-by walk-time estimates.

## 7. Connect & contact sharing

- [ ] "Your card" shows the FOSS United profile / locally-entered fields.
- [ ] Field-level visibility choices (what's shared) are respected.
- [ ] Sharing via QR: another device's scanner reads it correctly.
- [ ] `/connect/compare` and `/connect/recap` ("who I met") work after at
      least one contact exchange.
- [ ] Contact export (vCard) opens correctly in an external contacts app.
- [ ] Calendar export (`calendar.ts`) produces a valid `.ics` a calendar app
      accepts.

## 8. Scan (QR / deep links)

Payload kinds: `friend` (handshake/contact), `contact` (vCard), `location`
(venue position). Test each one, and each `indiafoss://` deep link:

- [ ] `indiafoss://event/<id>`, `indiafoss://activity/<id>`,
      `indiafoss://booth/<id>` open the right screen.
- [ ] `indiafoss://location/<id>` → scan preview → sets location.
- [ ] `indiafoss://friend?...` → scan preview → add contact.
- [ ] A scanned/pasted Matrix id or `matrix.to` link opens the "Open in
      Element" handoff button (never auto-joins) — this replaces the old
      `indiafoss://chat` in-app join flow, which no longer exists.
- [ ] Camera permission prompt and denial-recovery path.
- [ ] Scanning a code from a _different_ event/session than the one loaded
      degrades sensibly (not a crash).

## 9. Chat handoff (web PWA & native companion apps)

Neither companion app embeds a chat UI any more (ADR 0004). Every "chat" or
"message on mesh" affordance builds a `matrix.to` link and hands off to
whatever Matrix client is installed. Test the link-building, not a live
conversation (that's §10):

- [ ] Activity detail "💬 Session chat ↗" opens the session's room (listed →
      location-derived → deterministic per-session alias, in that order —
      see `sessionRoomLink` in `element-links.ts`) in an external app/tab.
- [ ] Booth detail "Open … on Matrix ↗" resolves the same way
      (`boothRoomLink`: listed → location-derived → deterministic per-booth
      alias).
- [ ] Now screen's "💬 chat ↗" next to each in-progress session resolves to
      the same room as that session's own Activity detail page.
- [ ] A bundle with no `messaging` block shows **no** chat link anywhere
      (never a dead link to a nobody-administers `matrix.org` room).
- [ ] Connect → a saved contact with a `neutrinoServerName` shows a "Mesh"
      link (via `contactDeepLinks`) that opens `matrix.to/#/@n:<server>`.
- [ ] Connect → a saved contact with a `matrixId` shows a "Matrix" link that
      opens `matrix.to/#/@user:server`.
- [ ] Scan → after scanning a friend card or vCard with a Matrix id or mesh
      identity, the same links appear in the confirmation screen before
      saving.
- [ ] Every one of the above actually opens the OS "choose an app" prompt
      (or the dedicated chat app directly, if it's set as the `matrix.to`
      handler) rather than a blank/broken navigation.

## 10. Chat — dedicated app (`indiafoss-chat-android`)

- [ ] App launches past onboarding (display name → Continue) without
      crashing.
- [ ] Registers as a handler for `matrix.to` links (or is offered as one) so
      the handoff links in §9 land here when it's installed.
- [ ] A `matrix.to/#/@n:<server>` link (mesh identity) opens a working DM
      with that peer.
- [ ] A `matrix.to/#/#alias:homeserver` link (session/booth/announcements
      room) opens or joins that room.
- [ ] Nearby peer discovery lists a real nearby device within ~1–2 minutes
      (see §13 for the full P2P protocol pass).
- [ ] Native Element X features: verification, device management, etc. —
      whatever's still wired up from upstream vs what this fork changed.
- [ ] APK installs cleanly on a fresh device (no signature/version
      conflicts) — both `gplay` and `fdroid` flavours.

## 11. Notifications & reminders

Trigger each of these (fastest via the day simulator, §8, at real speed at
least once to catch OS-level throttling issues):

- [ ] "In X min: <session>" — generic pre-session reminder.
- [ ] "In X min: <session>" — must-attend heads-up (bookmarked/highly
      ranked sessions get earlier warning).
- [ ] "Starting now: <session>".
- [ ] "Leave now: <session>" — timed off the walk distance from wherever
      you last scanned a location QR.
- [ ] Notification tap opens the right Activity detail screen.
- [ ] Notifications respect the OS "Do not disturb" / notification
      permission being denied (no crash, and a way to grant later).
- [ ] Reminders can be turned off entirely from Settings and stay off.
- [ ] Reminders survive an app restart / device reboot.

## 12. Settings

- [ ] Contact sharing → opens the contact card editor.
- [ ] Reminders toggle and any fine-grained controls.
- [ ] Day simulator: pick a day, a start time, a speed multiplier; "Begin"
      jumps the whole app's clock; log shows fired events; stopping the
      simulation returns to real time cleanly.
- [ ] "Setup" → re-run onboarding from here works.
- [ ] Privacy section: the stated rules actually hold (no account required,
      data stays on-device, email/phone excluded from sharing by default,
      unverified-until-checked labelling on scanned identities).
- [ ] Settings is easy to find from the main nav (this was flagged mid-session
      as too buried — verify whatever fix landed, if any).

## 13. Real-hardware P2P mesh protocol (dedicated chat app, two or more physical Android phones)

The mesh node now lives only in `hanthor/indiafoss-chat-android` — neither
companion app runs one.

- [ ] `adb`-driven BLE peer discovery: both devices' real Bluetooth MAC/node
      IDs appear in the other's logs/UI.
- [ ] Runtime Bluetooth permissions (`BLUETOOTH_SCAN`/`CONNECT`/`ADVERTISE`)
      are actually requested and granted through the normal UI flow, not
      just via `adb shell pm grant` (that was a workaround for this session's
      testing, not the real user path — verify the in-app permission prompt
      works).
- [ ] Node survives an app restart and rediscovers previously-known peers.
- [ ] Three or more phones in range: group behaviour (room with 3+ members)
      works, not just 1:1.
- [ ] Battery/background behaviour: does the mesh node survive the screen
      turning off / the app backgrounding? (Not yet characterized this
      session — worth a dedicated pass.)

### 13a. Conference rooms over the mesh

Automated on six nodes over the real iroh medium (`--mode alias` in
`tools/neutrino-probe/src/mesh-swarm.ts`) and asserted in CI against two live
nodes (`aliases.e2e.test.ts`). What remains is the part no rig reproduces:
real radios, real walls, and a venue whose uplink comes and goes.

- [ ] Two phones on the same Wi-Fi find each other over Wi-Fi rather than
      falling back to BLE. Check the log line names an IP path, not a BLE one —
      the mesh works either way, so this fails silently and only shows up as
      latency.
- [ ] The venue AP does **not** isolate clients. Verified by phone-to-phone
      reachability, not by both phones reaching the internet: an AP that
      isolates still passes multicast, so mDNS discovery looks perfectly
      healthy while nothing can connect (#163). Test on the actual venue SSID —
      the guest network usually isolates and the staff network usually does
      not.
- [ ] Opening a session chat on a phone whose server does **not** own the alias
      shows a real message when the room does not exist yet. It must not create
      a room: the client now declines, because `room_alias_name` is a localpart
      and it would otherwise make `#keynote:<its own name>` and sit in it alone.
- [ ] Whoever holds the alias namespace is reachable from every attendee's
      medium — Wi-Fi, cellular, and BLE-only. This is the open one: today's
      `aliasServer` is an internet host, so with no uplink there is no
      conference chat at all (#166, gateway in #165). Decide the venue's
      anchor before the day.
- [ ] Ten-plus phones opening the same session at once still land in one room.
      Six nodes converge in 43 ms on a rig; a hall adds radios and a join
      storm, and §5.3's backoff is what stands between the two.
- [ ] A phone that arrives late — after the room already has traffic — joins by
      alias and can read back the history it missed.

## 14. Native feel / platform polish

- [ ] (N) Material You dynamic colour matches the phone's wallpaper on
      Android 12+, and falls back sensibly below it.
- [ ] (N) Back button/gesture behaves like a native app at every screen
      (no dead ends, no double-back-to-exit surprises).
- [ ] (W) Installed as a PWA (Android Chrome "Install app" / iOS Safari "Add
      to Home Screen"), the app launches standalone (no browser chrome) and
      the icon/splash screen look right.
- [ ] Dark mode and light mode both look correct, on both the web PWA
      styling and the native Compose theming.

## 15. Platform/device compatibility

- [ ] 16 KB page size: confirm on a real 16 KB-page device (or via `readelf`
      on the built `.so`s, see this session's method) that native libraries
      are aligned both internally (ELF `PT_LOAD` `p_align`) and in APK zip
      packing — for any native-app native code and for the dedicated chat
      app's Neutrino bindings.
- [ ] Fresh install and update-over-existing-install both work (watch for
      signature mismatches between differently-signed builds, e.g. CI vs
      nightly vs local debug keys — these will refuse to upgrade in place).
- [ ] App installs and runs on both a Samsung/MediaTek device and a Pixel —
      don't assume Pixel-only testing generalizes.
- [ ] F-Droid-flavour builds (where they exist) install and run without any
      Google Play Services dependency surfacing.

## 16. Offline / PWA behaviour

- [ ] First load with no network still boots to a usable app (service worker
      precache).
- [ ] Airplane mode: schedule, ranking, map, connect all keep working.
- [ ] App update: a new deployed version is picked up (service worker
      update flow) without the user losing local data.
- [ ] Local storage (ranking, notes, itinerary, contacts) survives a
      browser/WebView data-clear prompt scenario sensibly (or is clearly
      explained if it doesn't).

## 17. Accessibility

- [ ] Automated a11y suite (`apps/web/tests/a11y.spec.ts`) passes on the
      core screens — re-run after any UI change, especially the recent
      Material-look removal (the suite's Material-look test cases were
      deleted along with the feature; confirm nothing else regressed).
- [ ] Keyboard-only completion of the ranking flow.
- [ ] Screen reader pass on at least Now, Schedule, Connect, and Settings.
- [ ] Text scales correctly at larger OS font sizes without clipping.

## 18. 2025 → 2026 switchover readiness

Tracked separately in `docs/roadmap.md`, but re-verify before flipping the
default event:

- [ ] `events/indiafoss-2026/` has a real, normalized, published `EventBundle`
      (talks, schedule, speakers) — not just venue assets and floor plans.
- [ ] `DEFAULT_EVENT_ID` is in sync between `event.svelte.ts` and
      `EventRepository.kt` (native).
- [ ] No stale "2025" strings left in comments, fallback data, or UI copy
      once the default flips.
