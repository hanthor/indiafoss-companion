# Manual test checklist

Everything a human needs to click through before a release, across all three
apps: the web PWA / Capacitor companion (`org.indiafoss.companion`), the
standalone native Compose event client (`apps/android/native`), and the
dedicated P2P chat app (`hanthor/indiafoss-chat-android`). Grouped by feature
area, not by app — most areas apply to more than one app; the app column
notes which.

Legend: **W** = web/PWA, **C** = Capacitor companion (Android/iOS), **N** =
native Compose app, **X** = dedicated chat app (Element X / Neutrino fork).

## 1. Onboarding & first run

- [ ] (W/C/N) Welcome wizard: skip vs complete all four steps (reminders,
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
- [ ] Booth detail page: description, location, and (if applicable) chat
      button all work.
- [ ] Speaker detail page: bio, photo, linked sessions.
- [ ] Activity detail page: description, speakers, room, time, chat button,
      bookmark/rank action.

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
- [ ] `indiafoss://chat?dm=@user:server` / `?join=#alias:server` → confirmation
      screen before DM/join (never auto-joins).
- [ ] Camera permission prompt and denial-recovery path.
- [ ] Scanning a code from a _different_ event/session than the one loaded
      degrades sensibly (not a crash).

## 9. Chat — companion app (embedded P2P mesh + optional Matrix account)

Core mesh (real hardware, two+ phones, see §13 for the full P2P protocol):

- [ ] Settings → "Enable P2P chat" actually starts the mesh node (check via
      the "Connected" indicator on `/chat`, not just the toggle).
- [ ] Nearby peer discovery lists a real nearby device within ~1–2 minutes.
- [ ] Start a DM with a nearby peer; invite propagates and can be accepted.
- [ ] Messages sent **after** both sides have joined decrypt correctly
      (Megolm/E2EE) — a message sent before the invite is accepted may show
      "waiting for the key" and that's a separate, known rough edge, not a
      regression.
- [ ] Bidirectional messaging (both directions) confirmed on the timeline
      with correct timestamps.
- [ ] Turn off Wi-Fi on both phones — mesh messaging keeps working over BLE
      alone (proves it's not silently using internet).

Room types and features (`docs/messaging.md`):

- [ ] Session/booth/venue room chat buttons on Activity, Booth and Now
      pages join or create the deterministic-alias room.
- [ ] Announcements room is pinned first in `/chat`, read-only for
      non-moderators, and moderators can post.
- [ ] Session Q&A: the ❓ composer toggle sends a question; 👍 upvotes;
      ✅ (as a moderator) marks it answered; the Questions panel sorts
      most-wanted-first, answered-last.
- [ ] Replies quote correctly and strip the `> …` fallback body.
- [ ] Reactions (🎉 👍 ❤️ 😀 etc.) attach to the right message and toggle
      off when you tap your own again.
- [ ] Read receipts update when a room is opened and stays updated while
      it's open.
- [ ] Room member list (display name + mesh id) opens from the room header.
- [ ] Invites can be accepted or declined from `/chat`.

Sign-in from anywhere / offline behaviour:

- [ ] "Join from anywhere with your own Matrix account" sign-in works
      against the conference Spindle (or any Matrix homeserver).
- [ ] Reload while offline still shows cached rooms and message history.
- [ ] A message sent while offline shows a local "Sending…" echo, then
      delivers once reachable — no duplicates once the real event arrives.
- [ ] Force a `M_FORBIDDEN` (e.g. send after being removed from a room) —
      the message drops from the outbox with a clear explanation, not a
      silent retry loop.
- [ ] Airplane mode toggled on/off mid-session triggers reconnect without
      a manual refresh.

## 10. Chat — dedicated app (`indiafoss-chat-android`)

- [ ] App launches past onboarding (display name → Continue) without
      crashing.
- [ ] Same mesh identity space as the companion app's embedded chat is
      visible (shared Neutrino network) — confirm the "Neutrino" node/peer
      shows up.
- [ ] Opening a room the companion app already created against this
      identity actually loads a working timeline (known rough edge as of
      this session: it showed an empty-state placeholder instead — retest
      after further chat-app work).
- [ ] Native Element X features: verification, device management, etc. —
      whatever's still wired up from upstream vs what this fork changed.
- [ ] `indiafoss://chat` / `indiafoss://friend` handoff links from the
      companion app open correctly in this app.
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
- [ ] (Chat) A new message notification (if implemented) doesn't fire when
      P2P chat is disabled.

## 12. Settings

- [ ] Contact sharing → opens the contact card editor.
- [ ] Peer-to-peer chat toggle — on/off, and confirm it actually starts/stops
      the mesh node (not just a stored preference).
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

## 13. Real-hardware P2P mesh protocol (two or more physical Android phones)

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

## 14. Native feel / platform polish

- [ ] (C) Long-press does **not** select page text or pop the OS callout
      menu anywhere in normal navigation.
- [ ] (C) Taps don't flash a grey/blue highlight.
- [ ] (C) Scroll edges don't rubber-band/bounce.
- [ ] (C) Form fields (message composer, search boxes, name/profile fields)
      still allow normal text selection and editing.
- [ ] (N) Material You dynamic colour matches the phone's wallpaper on
      Android 12+, and falls back sensibly below it.
- [ ] (N) Back button/gesture behaves like a native app at every screen
      (no dead ends, no double-back-to-exit surprises).
- [ ] Dark mode and light mode both look correct, on both the web/Capacitor
      styling and the native Compose theming.

## 15. Platform/device compatibility

- [ ] 16 KB page size: confirm on a real 16 KB-page device (or via `readelf`
      on the built `.so`s, see this session's method) that native libraries
      are aligned both internally (ELF `PT_LOAD` `p_align`) and in APK zip
      packing — required for both the Capacitor P2P build and any future
      native-app native code.
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
- [ ] Local storage (ranking, notes, itinerary, contacts, chat history)
      survives a browser/WebView data-clear prompt scenario sensibly (or is
      clearly explained if it doesn't).

## 17. Accessibility

- [ ] Automated a11y suite (`apps/web/tests/a11y.spec.ts`) passes on the
      core screens — re-run after any UI change, especially the recent
      Material-look removal (the suite's Material-look test cases were
      deleted along with the feature; confirm nothing else regressed).
- [ ] Keyboard-only completion of the ranking flow.
- [ ] Screen reader pass on at least Now, Schedule, Chat, and Settings.
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
